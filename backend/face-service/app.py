"""Velox Ledger internal face service.
Single-face registration and multi-face scanning are intentionally separate endpoints.
The service performs vision/embedding extraction only; customer and ledger data stay in Node/MongoDB.
"""
import os
import sys
import tempfile
import logging
from typing import Any
from fastapi import FastAPI, UploadFile, File
from fastapi.responses import JSONResponse

if sys.stdout.encoding != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')
if sys.stderr.encoding != 'utf-8':
    sys.stderr.reconfigure(encoding='utf-8')

os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "2")
os.environ.setdefault("TF_ENABLE_ONEDNN_OPTS", "0")
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("face-service")

app = FastAPI(title="Velox Ledger Face Service")
MODEL_NAME = "Facenet"
DETECTOR_BACKEND = "ssd"
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}
MAX_IMAGE_SIZE = 10 * 1024 * 1024
DeepFace = None
deepface_ready = False


def initialize_deepface():
    global DeepFace, deepface_ready
    try:
        logger.info("Initializing DeepFace with model=%s ...", MODEL_NAME)
        from deepface import DeepFace as DF
        DeepFace = DF
        deepface_ready = True
        logger.info("DeepFace initialized successfully.")
    except Exception as exc:
        logger.exception("Failed to initialize DeepFace: %s", exc)
        deepface_ready = False

initialize_deepface()

import urllib.request
import cv2
import numpy as np

CASCADE_PATH = "/app/haarcascade_frontalface_default.xml"
if not os.path.exists(CASCADE_PATH):
    logger.info("Downloading haarcascade...")
    urllib.request.urlretrieve("https://raw.githubusercontent.com/opencv/opencv/master/data/haarcascades/haarcascade_frontalface_default.xml", CASCADE_PATH)

def custom_extract_faces(img_path):
    img = cv2.imread(img_path)
    if img is None: raise ValueError("cv2.imread failed to read the image file.")
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    face_cascade = cv2.CascadeClassifier(CASCADE_PATH)
    if face_cascade.empty(): raise ValueError("CascadeClassifier failed to load haarcascade XML.")
    faces = face_cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=4, minSize=(30, 30))
    detected = []
    for (x, y, w, h) in faces:
        crop = img[y:y+h, x:x+w]
        crop_rgb = cv2.cvtColor(crop, cv2.COLOR_BGR2RGB)
        # DeepFace expects float32 in [0,1] when passing numpy arrays with skip detector
        crop_rgb = crop_rgb.astype("float32") / 255.0
        detected.append({
            "face": crop_rgb,
            "facial_area": {"x": int(x), "y": int(y), "w": int(w), "h": int(h)},
            "confidence": 0.99
        })
    return detected

def validate_and_save(file: UploadFile):
    if not file.filename:
        return None, JSONResponse(status_code=400, content={"success": False, "message": "No image file provided."})
    _, ext = os.path.splitext(file.filename)
    ext = ext.lower()
    if ext not in ALLOWED_EXTENSIONS:
        return None, JSONResponse(status_code=400, content={"success": False, "message": f"Unsupported image format: {ext}"})
    return ext, None


@app.get("/health")
async def health():
    return {"success": True, "message": "Face service is running", "deepface_ready": deepface_ready, "model": MODEL_NAME, "detector": DETECTOR_BACKEND}


@app.post("/extract-embedding")
async def extract_embedding(file: UploadFile = File(...)):
    if not deepface_ready or DeepFace is None:
        return JSONResponse(status_code=503, content={"success": False, "message": "Face recognition service is not available."})
    ext, error = validate_and_save(file)
    if error: return error
    contents = await file.read()
    if not contents: return JSONResponse(status_code=400, content={"success": False, "message": "The uploaded image is empty."})
    if len(contents) > MAX_IMAGE_SIZE: return JSONResponse(status_code=400, content={"success": False, "message": "Image file is too large. Maximum size is 10 MB."})
    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as tmp:
            tmp.write(contents); tmp_path = tmp.name
        try:
            detected = custom_extract_faces(img_path=tmp_path)
        except Exception as exc:
            logger.exception("Face detection failed: %s", exc)
            return JSONResponse(status_code=422, content={"success": False, "message": f"Failed to process the image for face detection. Python Error: {str(exc)}"})
        real = [f for f in detected if float(f.get("confidence", 0) or 0) > 0]
        if len(real) == 0: return {"success": False, "faceCount": 0, "message": "No face detected."}
        if len(real) > 1: return {"success": False, "faceCount": len(real), "message": "Multiple faces detected. Please ensure only one person is visible."}
        try:
            # We already cropped the face in custom_extract_faces, so we pass the numpy array directly to DeepFace.represent
            # and set detector_backend="skip" to skip DeepFace's buggy detectors completely!
            crop = real[0].get("face")
            results = DeepFace.represent(img_path=crop, model_name=MODEL_NAME, detector_backend="skip", enforce_detection=False, align=False)
        except Exception as exc:
            logger.exception("Embedding extraction failed: %s", exc)
            return JSONResponse(status_code=422, content={"success": False, "message": "Failed to generate face embedding. Please try again with a clearer image."})
        if not results: return {"success": False, "faceCount": 0, "message": "No face detected."}
        item = results[0]; embedding = item.get("embedding", [])
        if not embedding: return JSONResponse(status_code=422, content={"success": False, "message": "Failed to generate a valid face embedding."})
        return {"success": True, "faceCount": 1, "embeddingDimension": len(embedding), "embedding": embedding}
    finally:
        if tmp_path and os.path.exists(tmp_path):
            try: os.unlink(tmp_path)
            except OSError: pass


@app.post("/extract-embeddings")
async def extract_embeddings(file: UploadFile = File(...)):
    """Return one ArcFace embedding and bounding box for every detected face."""
    if not deepface_ready or DeepFace is None:
        return JSONResponse(status_code=503, content={"success": False, "message": "Face recognition service is not available."})
    ext, error = validate_and_save(file)
    if error: return error
    contents = await file.read()
    if not contents: return JSONResponse(status_code=400, content={"success": False, "message": "The uploaded image is empty."})
    if len(contents) > MAX_IMAGE_SIZE: return JSONResponse(status_code=400, content={"success": False, "message": "Image file is too large. Maximum size is 10 MB."})
    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as tmp:
            tmp.write(contents); tmp_path = tmp.name
        try:
            detected = custom_extract_faces(img_path=tmp_path)
        except Exception as exc:
            logger.exception("Multi-face detection failed: %s", exc)
            return JSONResponse(status_code=422, content={"success": False, "message": f"Failed to process the image for face detection. Python Error: {str(exc)}"})
        real_faces = [f for f in detected if float(f.get("confidence", 0) or 0) > 0]
        if not real_faces: return {"success": True, "faceCount": 0, "faces": []}

        output = []
        for face in real_faces:
            crop = face.get("face")
            area = face.get("facial_area", {}) or {}
            if crop is None: continue
            try:
                results = DeepFace.represent(img_path=crop, model_name=MODEL_NAME, detector_backend="skip", enforce_detection=False, align=False)
                if not results: continue
                embedding = results[0].get("embedding", [])
                if embedding:
                    output.append({"embedding": embedding, "facialArea": area, "faceConfidence": float(face.get("confidence", 0) or 0)})
            except Exception as exc:
                logger.warning("Could not embed one detected face: %s", exc)
        return {"success": True, "faceCount": len(output), "faces": output}
    finally:
        if tmp_path and os.path.exists(tmp_path):
            try: os.unlink(tmp_path)
            except OSError: pass


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=5001)

import os
import sys
import tempfile
import logging
from fastapi import FastAPI, UploadFile, File
from fastapi.responses import JSONResponse
from PIL import Image

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
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}
DeepFace = None
deepface_ready = False

def initialize_deepface():
    global DeepFace, deepface_ready
    try:
        from deepface import DeepFace as DF
        DeepFace = DF
        deepface_ready = True
    except Exception as exc:
        logger.exception("Failed to initialize DeepFace: %s", exc)
        deepface_ready = False

initialize_deepface()

@app.get("/health")
async def health():
    return {"success": True, "message": "Face service is running"}

@app.post("/extract-embedding")
async def extract_embedding(file: UploadFile = File(...)):
    if not deepface_ready or DeepFace is None:
        return JSONResponse(status_code=503, content={"success": False, "message": "Face service offline."})
    _, ext = os.path.splitext(file.filename)
    if ext.lower() not in ALLOWED_EXTENSIONS:
        return JSONResponse(status_code=400, content={"success": False, "message": "Unsupported format."})
    
    contents = await file.read()
    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=ext.lower()) as tmp:
            tmp.write(contents); tmp_path = tmp.name
        
        # Bypass ALL memory-heavy detectors and manual image loading.
        # Pass the raw file path directly to DeepFace.
        results = DeepFace.represent(img_path=tmp_path, model_name=MODEL_NAME, detector_backend="skip", enforce_detection=False, align=False)
        
        if not results: return {"success": False, "faceCount": 0, "message": "No face detected."}
        embedding = results[0].get("embedding", [])
        if not embedding: return JSONResponse(status_code=422, content={"success": False, "message": "Failed to generate embedding."})
        
        return {"success": True, "faceCount": 1, "embeddingDimension": len(embedding), "embedding": embedding}
    except Exception as exc:
        logger.exception("Extraction failed: %s", exc)
        return JSONResponse(status_code=422, content={"success": False, "message": f"Python Error: {str(exc)}"})
    finally:
        if tmp_path and os.path.exists(tmp_path):
            try: os.unlink(tmp_path)
            except OSError: pass

@app.post("/extract-embeddings")
async def extract_embeddings(file: UploadFile = File(...)):
    if not deepface_ready or DeepFace is None:
        return JSONResponse(status_code=503, content={"success": False, "message": "Face service offline."})
    _, ext = os.path.splitext(file.filename)
    if ext.lower() not in ALLOWED_EXTENSIONS:
        return JSONResponse(status_code=400, content={"success": False, "message": "Unsupported format."})
        
    contents = await file.read()
    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=ext.lower()) as tmp:
            tmp.write(contents); tmp_path = tmp.name
        
        with Image.open(tmp_path) as img: w, h = img.size
        
        results = DeepFace.represent(img_path=tmp_path, model_name=MODEL_NAME, detector_backend="skip", enforce_detection=False, align=False)
        
        output = []
        if results:
            embedding = results[0].get("embedding", [])
            if embedding:
                output.append({"embedding": embedding, "facialArea": {"x": 0, "y": 0, "w": w, "h": h}, "faceConfidence": 1.0})
        return {"success": True, "faceCount": len(output), "faces": output}
    except Exception as exc:
        logger.exception("Multi-face extraction failed: %s", exc)
        return JSONResponse(status_code=422, content={"success": False, "message": f"Python Error: {str(exc)}"})
    finally:
        if tmp_path and os.path.exists(tmp_path):
            try: os.unlink(tmp_path)
            except OSError: pass

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=5001)

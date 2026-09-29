import os
import sys
import logging
from fastapi import FastAPI, UploadFile, File
from fastapi.responses import JSONResponse
import face_recognition

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("face-service")

app = FastAPI(title="Velox Ledger Face Service")
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}

@app.get("/health")
async def health():
    return {"success": True, "message": "Lightweight face service is running"}

@app.post("/extract-embedding")
async def extract_embedding(file: UploadFile = File(...)):
    try:
        contents = await file.read()
        # face_recognition requires a numpy array, but we can load from bytes easily using face_recognition.load_image_file
        # load_image_file accepts a file-like object, so we wrap bytes in io.BytesIO
        import io
        image_stream = io.BytesIO(contents)
        image = face_recognition.load_image_file(image_stream)
        
        # Get face encodings (128-dimensional)
        encodings = face_recognition.face_encodings(image)
        
        if len(encodings) == 0:
            return {"success": False, "faceCount": 0, "message": "No face detected."}
        if len(encodings) > 1:
            return {"success": False, "faceCount": len(encodings), "message": "Multiple faces detected. Please ensure only one person is visible."}
            
        embedding = encodings[0].tolist()
        return {"success": True, "faceCount": 1, "embeddingDimension": len(embedding), "embedding": embedding}
    except Exception as exc:
        logger.exception("Extraction failed: %s", exc)
        return JSONResponse(status_code=422, content={"success": False, "message": f"Python Error: {str(exc)}"})

@app.post("/extract-embeddings")
async def extract_embeddings(file: UploadFile = File(...)):
    try:
        contents = await file.read()
        import io
        image_stream = io.BytesIO(contents)
        image = face_recognition.load_image_file(image_stream)
        
        # Find all face locations and encodings
        face_locations = face_recognition.face_locations(image)
        encodings = face_recognition.face_encodings(image, known_face_locations=face_locations)
        
        output = []
        for i in range(len(encodings)):
            top, right, bottom, left = face_locations[i]
            embedding = encodings[i].tolist()
            output.append({
                "embedding": embedding,
                "facialArea": {"x": left, "y": top, "w": right - left, "h": bottom - top},
                "faceConfidence": 1.0
            })
            
        return {"success": True, "faceCount": len(output), "faces": output}
    except Exception as exc:
        logger.exception("Multi-face extraction failed: %s", exc)
        return JSONResponse(status_code=422, content={"success": False, "message": f"Python Error: {str(exc)}"})

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=5001)

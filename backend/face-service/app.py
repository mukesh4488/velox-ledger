import os
import logging
import io
from fastapi import FastAPI, UploadFile, File
from fastapi.responses import JSONResponse
from PIL import Image
import torch
from facenet_pytorch import MTCNN, InceptionResnetV1

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("face-service")

app = FastAPI(title="Velox Ledger Face Service")

# Initialize models globally on CPU
mtcnn = None
resnet = None
models_ready = False

def init_models():
    global mtcnn, resnet, models_ready
    try:
        # keep_all=True for multi-face, but we handle single-face logic below
        # min_face_size=60 drastically reduces computation time by skipping tiny face pyramids
        mtcnn = MTCNN(keep_all=True, min_face_size=60, device='cpu')
        resnet = InceptionResnetV1(pretrained='vggface2').eval().to('cpu')
        models_ready = True
        logger.info("PyTorch FaceNet models loaded successfully.")
    except Exception as exc:
        logger.exception("Failed to load PyTorch models: %s", exc)

init_models()

@app.get("/health")
async def health():
    return {"success": True, "message": "PyTorch face service is running"}

@app.post("/extract-embedding")
async def extract_embedding(file: UploadFile = File(...)):
    if not models_ready: return JSONResponse(status_code=503, content={"success": False, "message": "Models loading..."})
    try:
        contents = await file.read()
        image = Image.open(io.BytesIO(contents)).convert('RGB')
        
        # MTCNN returns a tensor of cropped faces [N, C, H, W]
        faces = mtcnn(image)
        if faces is None or len(faces) == 0:
            return {"success": False, "faceCount": 0, "message": "No face detected."}
        if len(faces) > 1:
            return {"success": False, "faceCount": len(faces), "message": "Multiple faces detected. Please ensure only one person is visible."}
        
        with torch.no_grad():
            # Pass the single cropped face through ResNet
            # faces[0] shape is [3, 160, 160]. We unsqueeze to [1, 3, 160, 160]
            emb = resnet(faces[0].unsqueeze(0))
            embedding = emb.squeeze(0).tolist()
            
        return {"success": True, "faceCount": 1, "embeddingDimension": len(embedding), "embedding": embedding}
    except Exception as exc:
        logger.exception("Extraction failed: %s", exc)
        return JSONResponse(status_code=422, content={"success": False, "message": f"Python Error: {str(exc)}"})

@app.post("/extract-embeddings")
async def extract_embeddings(file: UploadFile = File(...)):
    if not models_ready: return JSONResponse(status_code=503, content={"success": False, "message": "Models loading..."})
    try:
        contents = await file.read()
        image = Image.open(io.BytesIO(contents)).convert('RGB')
        
        # detect() returns bounding boxes (Runs CNN)
        boxes, probs = mtcnn.detect(image)
        
        if boxes is None or len(boxes) == 0:
            return {"success": True, "faceCount": 0, "faces": []}
            
        # extract() crops the image using the boxes (NO CNN, instant)
        faces = mtcnn.extract(image, boxes, save_path=None)
        
        if faces is None or len(faces) == 0:
            return {"success": True, "faceCount": 0, "faces": []}
            
        with torch.no_grad():
            embeddings = resnet(faces)
            
        output = []
        for i in range(len(embeddings)):
            box = boxes[i].tolist()
            output.append({
                "embedding": embeddings[i].tolist(),
                "facialArea": {"x": int(box[0]), "y": int(box[1]), "w": int(box[2] - box[0]), "h": int(box[3] - box[1])},
                "faceConfidence": 1.0
            })
            
        return {"success": True, "faceCount": len(output), "faces": output}
    except Exception as exc:
        logger.exception("Multi-face extraction failed: %s", exc)
        return JSONResponse(status_code=422, content={"success": False, "message": f"Python Error: {str(exc)}"})

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=5001)

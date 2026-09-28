FROM python:3.11-slim
WORKDIR /app
RUN apt-get update && apt-get install -y libgl1 libglib2.0-0 && rm -rf /var/lib/apt/lists/*
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
RUN pip uninstall -y opencv-python opencv-python-headless
RUN pip install --no-cache-dir opencv-contrib-python-headless
RUN mkdir -p /root/.deepface/weights && \
    wget -qO /root/.deepface/weights/deploy.prototxt https://github.com/opencv/opencv/raw/3.4.0/samples/dnn/face_detector/deploy.prototxt && \
    wget -qO /root/.deepface/weights/res10_300x300_ssd_iter_140000.caffemodel https://github.com/opencv/opencv_3rdparty/raw/dnn_samples_face_detector_20170830/res10_300x300_ssd_iter_140000.caffemodel && \
    wget -qO /root/.deepface/weights/facenet_weights.h5 https://github.com/serengil/deepface_models/releases/download/v1.0/facenet_weights.h5
COPY . .
EXPOSE 5001
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "5001"]

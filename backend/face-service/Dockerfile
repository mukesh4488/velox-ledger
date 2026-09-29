FROM python:3.11-slim
WORKDIR /app
# Install cmake and build-essential required to compile dlib for face_recognition
RUN apt-get update && apt-get install -y cmake build-essential libgl1 libglib2.0-0 && rm -rf /var/lib/apt/lists/*
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE 5001
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "5001"]

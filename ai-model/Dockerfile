# Use Python 3.10
FROM python:3.10-slim

# Install system dependencies for OpenCV and YOLO
RUN apt-get update && apt-get install -y \
    libgl1 \
    libglib2.0-0 \
    gcc \
    python3-dev \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy requirements first for better caching
COPY requirements.txt .

# Install dependencies (CPU versions to save space and avoid CUDA issues)
RUN pip install --no-cache-dir --extra-index-url https://download.pytorch.org/whl/cpu \
    torch \
    torchvision \
    && pip install --no-cache-dir -r requirements.txt

# Copy all files
COPY . .

# Set environment variables
ENV FLASK_APP=app.py
ENV PORT=7860

# Hugging Face Spaces uses port 7860 by default
EXPOSE 7860

# Start the application using Gunicorn
CMD ["gunicorn", "-b", "0.0.0.0:7860", "--timeout", "120", "app:app"]

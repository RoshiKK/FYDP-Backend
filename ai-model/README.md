# KHIVISION Accident Detection Model - Deployment Package

## 📦 Package Contents

| File | Description |
|------|-------------|
| `accident_detector.pt` | Trained YOLOv8 model (6 accident classes) |
| `data.yaml` | Class configuration from Roboflow |
| `deployment_info.json` | Model metadata (version, thresholds) |
| `model_utils.py` | Python wrapper for the model |
| `inference_api.py` | Flask API server for app integration |
| `test_api.py` | Test script to verify API |
| `requirements.txt` | Python dependencies |

## 🚀 Quick Start (3 Steps)

### Step 1: Install Python & Dependencies

```bash
# Install Python 3.8+ from python.org
# Then install dependencies:
pip install -r requirements.txt









# Step 2: Start the API Server
# bash
# python inference_api.py
# Expected output:

# text
# 🚀 KHIVISION API Server Starting...
#    Classes: ['car_collidedwith_obstacle', ...]
#    Thresholds: {'critical': 85, 'high_alert': 70, ...}
#    Server running at: http://localhost:5000
# Step 3: Test the API
# bash
# # Open new terminal, test with an image
# python test_api.py your_image.jpg

# # Or use curl
# curl http://localhost:5000/health
# 📱 API Endpoints
# Method	Endpoint	Description
# GET	/health	Check server status
# GET	/config	Get model configuration
# POST	/detect	Detect accident (base64 or file)
# POST	/detect/annotated	Get annotated image with boxes
# 📤 Mobile App Integration
# Flutter Example
# dart
# import 'package:http/http.dart' as http;
# import 'dart:convert';
# import 'dart:typed_data';
# import 'package:image_picker/image_picker.dart';

# Future<Map<String, dynamic>> detectAccident(XFile imageFile) async {
#   // Read image as bytes
#   Uint8List imageBytes = await imageFile.readAsBytes();
#   String base64Image = base64Encode(imageBytes);
  
#   // Call API
#   var response = await http.post(
#     Uri.parse('http://your-server:5000/detect'),
#     headers: {'Content-Type': 'application/json'},
#     body: jsonEncode({'image': base64Image}),
#   );
  
#   return jsonDecode(response.body);
# }
# Response Format
# json
# {
#   "success": true,
#   "has_accident": true,
#   "score": 78.5,
#   "status": "HIGH_ALERT",
#   "detections": [
#     {
#       "class": "car_with_car",
#       "class_id": 2,
#       "confidence": 0.85,
#       "bbox": [100, 150, 300, 350]
#     }
#   ],
#   "num_detections": 2
# }
# Status Meanings
# Status	Score Range	Action
# CRITICAL_EMERGENCY	≥ 85	Immediate dispatch
# HIGH_ALERT	70-84	Priority dispatch
# ACCIDENT_CONFIRMED	40-69	Standard response
# POSSIBLE_ACCIDENT	20-39	Manual review
# LOW_CONFIDENCE	1-19	Low priority
# NO_ACCIDENT	0	No action
# 🐳 Docker Deployment (Optional)
# dockerfile
# FROM python:3.9-slim
# WORKDIR /app
# COPY requirements.txt .
# RUN pip install -r requirements.txt
# COPY . .
# EXPOSE 5000
# CMD ["python", "inference_api.py"]
# bash
# docker build -t khivision-api .
# docker run -p 5000:5000 khivision-api
# 🔧 Troubleshooting
# Issue	Solution
# ModuleNotFoundError	Run pip install -r requirements.txt
# Port 5000 already in use	Change port: python inference_api.py --port=5001
# Model not loading	Check accident_detector.pt exists in same folder
# No detections	Try images with clear accidents or lower confidence
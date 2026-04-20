# ============================================
# KHIVISION - Flask API for App Integration
# ============================================

from flask import Flask, request, jsonify
from flask_cors import CORS
import base64
import cv2
import numpy as np
import os
from model_utils import AccidentDetector

# Initialize Flask app
app = Flask(__name__)
CORS(app)  # Allow mobile app to call this API

# Initialize detector
detector = AccidentDetector('accident_detector.pt', 'data.yaml')

print("="*60)
print("🚀 KHIVISION API Server Starting...")
print("="*60)
print(f"   Classes: {detector.class_names}")
print(f"   Thresholds: {detector.thresholds}")
print(f"   Severity Weights: {detector.severity_weights}")
print("="*60)

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'model_loaded': True,
        'classes': detector.class_names,
        'thresholds': detector.thresholds
    })

@app.route('/detect', methods=['POST'])
def detect_accident():
    """
    Main detection endpoint for mobile app
    Expects: JSON with base64 image or multipart form with image file
    """
    try:
        # Case 1: Base64 image in JSON
        if request.is_json:
            data = request.get_json()
            image_data = data.get('image')
            
            if not image_data:
                return jsonify({'error': 'No image data provided'}), 400
            
            result = detector.detect_from_base64(image_data)
            return jsonify(result)
        
        # Case 2: File upload
        elif 'image' in request.files:
            file = request.files['image']
            img_bytes = file.read()
            nparr = np.frombuffer(img_bytes, np.uint8)
            img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            
            if img is None:
                return jsonify({'error': 'Invalid image file'}), 400
            
            result = detector.detect_accident(img)
            return jsonify(result)
        
        else:
            return jsonify({'error': 'No image provided. Send as JSON with "image" field or multipart form with "image" file'}), 400
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/detect/annotated', methods=['POST'])
def detect_with_annotation():
    """
    Returns annotated image with bounding boxes
    """
    try:
        if 'image' not in request.files:
            return jsonify({'error': 'No image provided'}), 400
        
        file = request.files['image']
        img_bytes = file.read()
        nparr = np.frombuffer(img_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        if img is None:
            return jsonify({'error': 'Invalid image'}), 400
        
        # Get annotated image
        annotated = detector.get_annotated_image(img)
        
        # Convert to base64
        _, buffer = cv2.imencode('.jpg', annotated)
        img_base64 = base64.b64encode(buffer).decode('utf-8')
        
        # Also get detection results
        detection_result = detector.detect_accident(img)
        
        return jsonify({
            'annotated_image': img_base64,
            'detection': detection_result
        })
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/config', methods=['GET'])
def get_config():
    """Get model configuration"""
    return jsonify(detector.get_config())

@app.route('/test', methods=['GET'])
def test_endpoint():
    """Simple test endpoint"""
    return jsonify({
        'message': 'KHIVISION API is running!',
        'endpoints': {
            'GET /health': 'Check server health',
            'POST /detect': 'Detect accident (base64 image)',
            'POST /detect/annotated': 'Get annotated image',
            'GET /config': 'Get model configuration'
        }
    })

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5005))
    print(f"\n📡 Server running at: http://localhost:{port}")
    print(f"📱 Test with: curl http://localhost:{port}/test")
    print(f"🔍 Health check: curl http://localhost:{port}/health")
    print("\n" + "="*60)
    app.run(host='0.0.0.0', port=port, debug=False)
# ============================================
# KHIVISION - Model Utilities for App Integration
# ============================================

import cv2
import numpy as np
import base64
from ultralytics import YOLO
import yaml
import json
import os

class AccidentDetector:
    """Accident detection model wrapper for mobile app integration"""
    
    def __init__(self, model_path='accident_detector.pt', config_path='data.yaml'):
        """Initialize model with configuration"""
        # Load model
        self.model = YOLO(model_path)
        
        # Load YAML config
        with open(config_path, 'r') as f:
            self.config = yaml.safe_load(f)
        
        self.class_names = self.config['names']
        self.num_classes = self.config['nc']
        
        # Try to load severity weights from deployment_info.json if exists
        self.severity_weights = {
            'car_collidedwith_obstacle': 65,
            'car_rollover': 90,
            'car_with_car': 70,
            'car_with_motorcycle': 85,
            'motorcycle_crash': 95,
            'non_accident': 0
        }
        
        # Try to load thresholds from deployment_info.json
        self.thresholds = {
            'critical': 85,
            'high_alert': 70,
            'accident_confirmed': 40,
            'low_confidence': 20
        }
        
        # Load from deployment_info.json if exists
        if os.path.exists('deployment_info.json'):
            with open('deployment_info.json', 'r') as f:
                info = json.load(f)
                if 'thresholds' in info:
                    self.thresholds.update(info['thresholds'])
        
        print(f"✅ Model loaded successfully")
        print(f"   Classes: {self.class_names}")
        print(f"   Thresholds: {self.thresholds}")
    
    def detect_accident(self, image_array):
        """
        Detect accident in image
        Args:
            image_array: numpy array (H,W,3) BGR format
        Returns:
            dict with detection results
        """
        # Run inference
        results = self.model(image_array, conf=0.25)
        result = results[0]
        
        if result.boxes is None or len(result.boxes) == 0:
            return {
                'success': True,
                'has_accident': False,
                'score': 0,
                'status': 'NO_ACCIDENT',
                'detections': [],
                'num_detections': 0
            }
        
        # Calculate accident score
        score, status, detections = self._calculate_score(result)
        
        # Get bounding boxes with class names
        boxes = []
        for box in result.boxes:
            class_id = int(box.cls.item())
            x1, y1, x2, y2 = box.xyxy[0].cpu().numpy()
            boxes.append({
                'class': self.class_names[class_id],
                'class_id': class_id,
                'confidence': float(box.conf.item()),
                'bbox': [float(x1), float(y1), float(x2), float(y2)]
            })
        
        return {
            'success': True,
            'has_accident': score >= self.thresholds['accident_confirmed'],
            'score': float(score),
            'status': status,
            'detections': boxes,
            'num_detections': len(result.boxes)
        }
    
    def _calculate_score(self, result):
        """Calculate accident score from detections"""
        if result.boxes is None or len(result.boxes) == 0:
            return 0, "NO_ACCIDENT", []
        
        scores = []
        detections = []
        
        for box in result.boxes:
            conf = box.conf.item()
            class_id = int(box.cls.item())
            class_name = self.class_names[class_id]
            
            confidence_score = conf * 100
            severity = self.severity_weights.get(class_name, 50)
            weighted_score = (confidence_score * 0.4) + (severity * 0.6)
            scores.append(weighted_score)
            
            detections.append({
                'class': class_name,
                'class_id': class_id,
                'confidence': conf,
                'severity': severity,
                'score': weighted_score
            })
        
        if scores:
            base_score = sum(scores) / len(scores)
            num_vehicles = len(result.boxes)
            vehicle_factor = min(1.2, 1.0 + (num_vehicles - 1) * 0.1)
            final_score = min(100, base_score * vehicle_factor)
            
            # Determine status
            if final_score >= self.thresholds['critical']:
                status = "CRITICAL_EMERGENCY"
            elif final_score >= self.thresholds['high_alert']:
                status = "HIGH_ALERT"
            elif final_score >= self.thresholds['accident_confirmed']:
                status = "ACCIDENT_CONFIRMED"
            elif final_score >= self.thresholds['low_confidence']:
                status = "POSSIBLE_ACCIDENT"
            else:
                status = "LOW_CONFIDENCE"
            
            return final_score, status, detections
        
        return 0, "NO_ACCIDENT", []
    
    def get_annotated_image(self, image_array):
        """Get image with bounding boxes drawn"""
        results = self.model(image_array)
        annotated = results[0].plot()
        return annotated
    
    def detect_from_base64(self, base64_string):
        """Detect accident from base64 encoded image"""
        # Remove data URL prefix if present
        if ',' in base64_string:
            base64_string = base64_string.split(',')[1]
        
        # Decode base64 to image
        img_bytes = base64.b64decode(base64_string)
        nparr = np.frombuffer(img_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        if img is None:
            return {'success': False, 'error': 'Invalid image data'}
        
        return self.detect_accident(img)
    
    def get_config(self):
        """Get model configuration"""
        return {
            'classes': self.class_names,
            'num_classes': self.num_classes,
            'thresholds': self.thresholds,
            'severity_weights': self.severity_weights
        }

# Quick test
if __name__ == "__main__":
    print("Testing AccidentDetector...")
    detector = AccidentDetector()
    print("✅ AccidentDetector ready!")
    print(f"   Config: {detector.get_config()}")
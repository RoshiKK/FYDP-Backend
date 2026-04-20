# ============================================
# KHIVISION - Test API Script
# Run this to test if your API is working
# ============================================

import requests
import base64
import sys

# API URL (change if running on different server)
API_URL = "http://localhost:5000"

def test_health():
    """Test health endpoint"""
    print("\n🔍 Testing Health Endpoint...")
    try:
        response = requests.get(f"{API_URL}/health")
        print(f"   Status: {response.status_code}")
        print(f"   Response: {response.json()}")
        return response.status_code == 200
    except Exception as e:
        print(f"   ❌ Error: {e}")
        return False

def test_config():
    """Test config endpoint"""
    print("\n⚙️ Testing Config Endpoint...")
    try:
        response = requests.get(f"{API_URL}/config")
        print(f"   Status: {response.status_code}")
        data = response.json()
        print(f"   Classes: {data.get('classes')}")
        print(f"   Thresholds: {data.get('thresholds')}")
        return True
    except Exception as e:
        print(f"   ❌ Error: {e}")
        return False

def test_detect_with_file(image_path):
    """Test detection with file upload"""
    print(f"\n📸 Testing Detection with file: {image_path}")
    try:
        with open(image_path, 'rb') as f:
            files = {'image': f}
            response = requests.post(f"{API_URL}/detect", files=files)
        
        print(f"   Status: {response.status_code}")
        data = response.json()
        
        if data.get('success'):
            print(f"   Has Accident: {data.get('has_accident')}")
            print(f"   Score: {data.get('score')}")
            print(f"   Status: {data.get('status')}")
            print(f"   Detections: {data.get('num_detections')}")
        else:
            print(f"   Error: {data.get('error')}")
        
        return data
    except Exception as e:
        print(f"   ❌ Error: {e}")
        return None

def test_detect_with_base64(image_path):
    """Test detection with base64 image"""
    print(f"\n📸 Testing Detection with base64: {image_path}")
    try:
        with open(image_path, 'rb') as f:
            img_bytes = f.read()
            base64_img = base64.b64encode(img_bytes).decode('utf-8')
        
        payload = {'image': base64_img}
        response = requests.post(f"{API_URL}/detect", json=payload)
        
        print(f"   Status: {response.status_code}")
        data = response.json()
        
        if data.get('success'):
            print(f"   Has Accident: {data.get('has_accident')}")
            print(f"   Score: {data.get('score')}")
            print(f"   Status: {data.get('status')}")
            print(f"   Detections: {data.get('num_detections')}")
        else:
            print(f"   Error: {data.get('error')}")
        
        return data
    except Exception as e:
        print(f"   ❌ Error: {e}")
        return None

if __name__ == "__main__":
    print("="*60)
    print("🚀 KHIVISION API Test Script")
    print("="*60)
    print(f"API URL: {API_URL}")
    print("Make sure the API server is running!")
    print("Run: python inference_api.py")
    print("="*60)
    
    # Test endpoints
    test_health()
    test_config()
    
    # If an image path is provided, test detection
    if len(sys.argv) > 1:
        image_path = sys.argv[1]
        test_detect_with_file(image_path)
        test_detect_with_base64(image_path)
    else:
        print("\n💡 Tip: Run with an image to test detection:")
        print("   python test_api.py /path/to/your/image.jpg")
    
    print("\n" + "="*60)
    print("✅ Test complete!")
"""
ASL Sign Language Learning Platform - Backend
Upgrades: 
 - ML-based Classification (Scikit-Learn KNN)
 - Motion Tracking Buffer for dynamic letters (J & Z)
 - Anatomical Wrist Normalization
 - Full Web Routes Restored
 - Thread-Safe MediaPipe Processing (Concurrency Fix)
"""

import cv2
import numpy as np
import base64
import math
import sys
import os
import csv
import threading
from collections import deque
from statistics import mode, StatisticsError
from flask import Flask, request, jsonify, send_from_directory
from sklearn.neighbors import KNeighborsClassifier

try:
    from flask_cors import CORS
    HAS_CORS = True
except ImportError:
    HAS_CORS = False

# ─── Flask App Setup ──────────────────────────────────────────────────────────
app = Flask(__name__, static_folder='../frontend/static', template_folder='../frontend/templates')

if HAS_CORS:
    CORS(app)
else:
    @app.after_request
    def add_cors(response):
        response.headers["Access-Control-Allow-Origin"] = "*"
        response.headers["Access-Control-Allow-Headers"] = "Content-Type"
        response.headers["Access-Control-Allow-Methods"] = "GET,POST,OPTIONS"
        return response

    @app.route("/api/<path:path>", methods=["OPTIONS"])
    def options_handler(path):
        from flask import Response
        return Response(status=200)

# ─── MediaPipe Setup ──────────────────────────────────────────────────────────
import mediapipe as mp

try:
    _mp_hands = mp.solutions.hands
    _detector = _mp_hands.Hands(
        static_image_mode=True,
        max_num_hands=1,
        min_detection_confidence=0.5,
        min_tracking_confidence=0.5,
    )
    
    # NEW: Lock to prevent MediaPipe from crashing under rapid API requests
    mp_lock = threading.Lock()
    
    print("✅ MediaPipe initialised.")
except Exception as e:
    print(f"❌ MediaPipe API failed: {e}")
    sys.exit(1)

# ─── ML Model Setup ───────────────────────────────────────────────────────────
knn_model = KNeighborsClassifier(n_neighbors=5, weights='distance')
is_model_trained = False

DATASET_PATH = os.path.join(os.path.dirname(__file__), 'asl_dataset.csv')

def load_and_train_model():
    global is_model_trained
    if not os.path.exists(DATASET_PATH):
        print(f"⚠️ Warning: Dataset not found at {DATASET_PATH}.")
        print("⚠️ The ML model won't predict letters until you run collect_data.py to create the dataset.")
        return

    X = []
    y = []
    with open(DATASET_PATH, 'r') as f:
        reader = csv.reader(f)
        for row in reader:
            if not row: continue
            y.append(row[0])  # Label is the first column
            X.append([float(val) for val in row[1:]]) # 63 coordinates

    if X:
        knn_model.fit(X, y)
        is_model_trained = True
        print(f"✅ ML Model successfully trained on {len(X)} samples.")

load_and_train_model()

# ─── Motion Tracker (For J and Z) ─────────────────────────────────────────────
class MotionTracker:
    def __init__(self, max_len=20):  # Increased buffer to smooth out quick jitters
        self.index_history = deque(maxlen=max_len)
        self.pinky_history = deque(maxlen=max_len)

    def update(self, normalized_landmarks):
        # 8 is Index Tip, 20 is Pinky Tip
        self.index_history.append(normalized_landmarks[8])
        self.pinky_history.append(normalized_landmarks[20])

    def detect_z_motion(self):
        # Wait until we have enough frames to make a confident decision
        if len(self.index_history) < 15: return False
        xs = [p[0] for p in self.index_history]
        
        # INCREASED THRESHOLD: Requires a much wider, deliberate zigzag (was 0.40)
        return (max(xs) - min(xs)) > 0.70

    def detect_j_motion(self):
        if len(self.pinky_history) < 15: return False
        xs = [p[0] for p in self.pinky_history]
        ys = [p[1] for p in self.pinky_history]
        
        # INCREASED THRESHOLDS: Requires a deeper and wider swoop (was 0.25 and 0.20)
        return (max(ys) - min(ys)) > 0.45 and (max(xs) - min(xs)) > 0.35

motion_tracker = MotionTracker()

class GestureSmoother:
    def __init__(self, buffer_size=5):
        self.buffer = deque(maxlen=buffer_size)

    def update(self, new_label):
        if new_label: self.buffer.append(new_label)
        if not self.buffer: return None
        try: return mode(self.buffer)
        except StatisticsError: return self.buffer[-1]

gesture_smoother = GestureSmoother(buffer_size=5)

# ─── 3D Math & Feature Extraction ─────────────────────────────────────────────
def normalize_landmarks_3d(landmarks):
    base_x, base_y, base_z = landmarks[0]
    shifted = [[p[0]-base_x, p[1]-base_y, p[2]-base_z] for p in landmarks]
    scale = math.hypot(math.hypot(shifted[9][0], shifted[9][1]), shifted[9][2])
    if scale == 0: scale = 1.0 
    return [[p[0]/scale, p[1]/scale, p[2]/scale] for p in shifted]

def flatten_landmarks(landmarks):
    return [coord for pt in landmarks for coord in pt]

def decode_frame(b64_data):
    if "," in b64_data: b64_data = b64_data.split(",")[1]
    img_bytes = base64.b64decode(b64_data)
    nparr = np.frombuffer(img_bytes, np.uint8)
    return cv2.imdecode(nparr, cv2.IMREAD_COLOR)

# ─── Web & API Routes ─────────────────────────────────────────────────────────

@app.route("/")
def index():
    return send_from_directory('../frontend/templates', 'index.html')

@app.route("/static/<path:path>")
def serve_static(path):
    return send_from_directory('../frontend/static', path)

@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({
        "status": "ok", 
        "message": "ASL ML Backend running", 
        "model_trained": is_model_trained
    })

@app.route("/api/detect", methods=["POST"])
def detect():
    data = request.get_json()
    if not data or "frame" not in data:
        return jsonify({"error": "No frame provided"}), 400

    frame = decode_frame(data["frame"])
    if frame is None:
        return jsonify({"error": "Could not decode frame"}), 400

    rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    
    # NEW: Thread-safe MediaPipe execution
    with mp_lock:
        results = _detector.process(rgb)

    if not results.multi_hand_landmarks:
        gesture_smoother.update(None)
        return jsonify({"label": None, "confidence": 0.0, "landmarks": [], "hand_detected": False})

    lm = results.multi_hand_landmarks[0]
    raw_3d = [[p.x, p.y, p.z] for p in lm.landmark]
    h, w = rgb.shape[:2]
    pixel_2d = [[int(p.x * w), int(p.y * h)] for p in lm.landmark]

    normalized_3d = normalize_landmarks_3d(raw_3d)
    
    motion_tracker.update(normalized_3d)

    raw_label = None
    if is_model_trained:
        flat_features = np.array(flatten_landmarks(normalized_3d)).reshape(1, -1)
        raw_label = knn_model.predict(flat_features)[0]

        if raw_label in ['D', '1', 'X'] and motion_tracker.detect_z_motion():
            raw_label = 'Z'
        elif raw_label in ['I', 'Y'] and motion_tracker.detect_j_motion():
            raw_label = 'J'

    stable_label = gesture_smoother.update(raw_label)

    return jsonify({
        "label": stable_label,
        "raw_label": raw_label,
        "confidence": 0.9 if stable_label else 0.0,
        "landmarks": pixel_2d,  
        "hand_detected": True
    })

if __name__ == "__main__":
    print("=" * 60)
    print("  ASL Sign Language Learning Platform (ML Version)")
    print("  Backend: http://localhost:5000")
    print("=" * 60)
    app.run(host="0.0.0.0", port=5000, debug=False)
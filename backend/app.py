"""
ASL Sign Language Learning Platform - Backend
Gesture detection inspired by:
  https://github.com/Devansh-47/Sign-Language-To-Text-and-Speech-Conversion

Upgrades: 
 - Full 3D Coordinate tracking
 - Anatomical Wrist Normalization
 - Temporal Debouncing (Smoothing)
"""

import cv2
import numpy as np
import base64
import math
import sys
import os
from collections import deque
from statistics import mode, StatisticsError
from flask import Flask, request, jsonify, send_from_directory

try:
    from flask_cors import CORS
    HAS_CORS = True
except ImportError:
    HAS_CORS = False

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

USE_TASKS_API = False

try:
    from mediapipe.tasks import python as mp_python
    from mediapipe.tasks.python import vision as mp_vision
    import urllib.request, pathlib

    MODEL_NAME = "hand_landmarker.task"
    MODEL_PATH = pathlib.Path(__file__).parent / MODEL_NAME

    if not MODEL_PATH.exists():
        print(f"Downloading hand landmarker model -> {MODEL_PATH} ...")
        url = "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task"
        try:
            urllib.request.urlretrieve(url, MODEL_PATH)
            print("Model downloaded.")
        except Exception as dl_err:
            print(f"Could not download model: {dl_err}")
            raise

    base_opts = mp_python.BaseOptions(model_asset_path=str(MODEL_PATH))
    hand_opts = mp_vision.HandLandmarkerOptions(
        base_options=base_opts,
        num_hands=1,
        min_hand_detection_confidence=0.5,
        min_hand_presence_confidence=0.5,
        min_tracking_confidence=0.5,
        running_mode=mp_vision.RunningMode.IMAGE
    )
    _tasks_detector = mp_vision.HandLandmarker.create_from_options(hand_opts)
    USE_TASKS_API = True
    print("MediaPipe Tasks API initialised (new-style).")

except Exception as e:
    print(f"Tasks API not available ({e}), trying legacy mp.solutions ...")
    try:
        _mp_hands = mp.solutions.hands
        _legacy_detector = _mp_hands.Hands(
            static_image_mode=True,
            max_num_hands=1,
            min_detection_confidence=0.5,
            min_tracking_confidence=0.5,
        )
        print("MediaPipe legacy solutions API initialised.")
    except Exception as e2:
        print(f"Both MediaPipe APIs failed: {e2}")
        sys.exit(1)


# ─── MediaPipe Hand Connections ───────────────────────────────────────────────
HAND_CONNECTIONS = [
    (0, 1), (1, 2), (2, 3), (3, 4),        # Thumb
    (0, 5), (5, 6), (6, 7), (7, 8),        # Index
    (0, 9), (9, 10), (10, 11), (11, 12),   # Middle
    (0, 13), (13, 14), (14, 15), (15, 16), # Ring
    (0, 17), (17, 18), (18, 19), (19, 20), # Pinky
    (5, 9), (9, 13), (13, 17),             # Palm
]

# ─── Gesture Smoother ─────────────────────────────────────────────────────────
class GestureSmoother:
    def __init__(self, buffer_size=7):
        self.buffer = deque(maxlen=buffer_size)

    def update(self, new_label):
        if new_label:
            self.buffer.append(new_label)
        if not self.buffer:
            return None
        try:
            return mode(self.buffer)
        except StatisticsError:
            return self.buffer[-1]

gesture_smoother = GestureSmoother(buffer_size=5)

# ─── Data Extraction & Rendering ──────────────────────────────────────────────
def run_mediapipe(rgb_image):
    """Returns 3D raw points for math, 2D pixel points for rendering, and hand label."""
    h, w = rgb_image.shape[:2]

    if USE_TASKS_API:
        mp_img = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb_image)
        result = _tasks_detector.detect(mp_img)
        if not result.hand_landmarks:
            return [], [], "Right"
        lm = result.hand_landmarks[0]
        raw_3d = [[p.x, p.y, p.z] for p in lm]
        pixel_2d = [[int(p.x * w), int(p.y * h)] for p in lm]
        hand_label = result.handedness[0][0].category_name if result.handedness else "Right"
        return raw_3d, pixel_2d, hand_label
    else:
        results = _legacy_detector.process(rgb_image)
        if not results.multi_hand_landmarks:
            return [], [], "Right"
        lm = results.multi_hand_landmarks[0]
        raw_3d = [[p.x, p.y, p.z] for p in lm.landmark]
        pixel_2d = [[int(p.x * w), int(p.y * h)] for p in lm.landmark]
        hand_label = results.multi_handedness[0].classification[0].label if results.multi_handedness else "Right"
        return raw_3d, pixel_2d, hand_label

def render_skeleton_on_white(pixel_pts, canvas_size=300):
    img = np.ones((canvas_size, canvas_size, 3), dtype=np.uint8) * 255
    xs = [p[0] for p in pixel_pts]
    ys = [p[1] for p in pixel_pts]
    x_min, x_max = min(xs), max(xs)
    y_min, y_max = min(ys), max(ys)
    span = max(x_max - x_min, y_max - y_min, 1)

    margin = 30
    scale = (canvas_size - 2 * margin) / span

    def to_canvas(p):
        cx = int((p[0] - x_min) * scale) + margin
        cy = int((p[1] - y_min) * scale) + margin
        return (cx, cy)

    canvas_pts = [to_canvas(p) for p in pixel_pts]

    for (a, b) in HAND_CONNECTIONS:
        cv2.line(img, canvas_pts[a], canvas_pts[b], (0, 0, 0), 2)

    for i, cp in enumerate(canvas_pts):
        color = (0, 128, 255) if i in [4, 8, 12, 16, 20] else (0, 0, 180)
        cv2.circle(img, cp, 5, color, -1)
        cv2.circle(img, cp, 5, (0, 0, 0), 1)

    return img

# ─── 3D Math & Feature Extraction ─────────────────────────────────────────────
def normalize_landmarks_3d(landmarks):
    """Translates wrist to (0,0,0) and scales so hand size = 1.0"""
    base_x, base_y, base_z = landmarks[0]
    shifted = [[p[0]-base_x, p[1]-base_y, p[2]-base_z] for p in landmarks]
    
    # Scale based on distance from wrist(0) to middle finger MCP(9)
    scale = math.hypot(math.hypot(shifted[9][0], shifted[9][1]), shifted[9][2])
    if scale == 0: scale = 1.0 
    
    return [[p[0]/scale, p[1]/scale, p[2]/scale] for p in shifted]

def dist3d(a, b):
    return math.hypot(math.hypot(a[0] - b[0], a[1] - b[1]), a[2] - b[2])

def angle_at3d(a, b, c):
    ba = np.array(a, dtype=float) - np.array(b, dtype=float)
    bc = np.array(c, dtype=float) - np.array(b, dtype=float)
    cos_ang = np.dot(ba, bc) / (np.linalg.norm(ba) * np.linalg.norm(bc) + 1e-6)
    return math.degrees(math.acos(np.clip(cos_ang, -1.0, 1.0)))

def finger_curl_ratio(pts, tip, pip, mcp):
    ang = angle_at3d(pts[mcp], pts[pip], pts[tip])
    return max(0.0, min(1.0, (170 - ang) / 110))

def finger_extended(pts, tip, pip):
    return pts[tip][1] < pts[pip][1]

def thumb_extended(pts, handedness="Right"):
    if handedness == "Right":
        return pts[4][0] < pts[3][0]
    else:
        return pts[4][0] > pts[3][0]

def fingers_state(pts, handedness="Right"):
    return [
        thumb_extended(pts, handedness),
        finger_extended(pts, 8, 6),
        finger_extended(pts, 12, 10),
        finger_extended(pts, 16, 14),
        finger_extended(pts, 20, 18),
    ]

def thumb_angle_deg(pts, handedness="Right"):
    dx = pts[4][0] - pts[2][0]
    dy = pts[4][1] - pts[2][1]
    return math.degrees(math.atan2(-dy, dx if handedness == "Right" else -dx))

# ─── Classification Logic ─────────────────────────────────────────────────────
def recognize_asl_letters(pts, handedness="Right"):
    f = fingers_state(pts, handedness)
    thumb, idx, mid, ring, pinky = f

    # hand_size is roughly 1.0 now due to 3D normalization
    hand_size = dist3d(pts[0], pts[9]) + 1e-6

    def nd(a, b):
        return dist3d(pts[a], pts[b]) / hand_size

    tip_thumb_idx   = nd(4, 8)
    tip_thumb_mid   = nd(4, 12)
    tip_idx_mid     = nd(8, 12)

    idx_curl   = finger_curl_ratio(pts, 8, 6, 5)
    mid_curl   = finger_curl_ratio(pts, 12, 10, 9)
    ring_curl  = finger_curl_ratio(pts, 16, 14, 13)

    if thumb and not idx and not mid and not ring and pinky:
        return "Y"

    if not idx and not mid and not ring and not pinky:
        if tip_thumb_idx < 0.35:
            return "O"
        if 0.35 <= tip_thumb_idx < 0.65 and pts[8][1] < pts[5][1]:
            return "C"

    if idx and not mid and not ring and not pinky and thumb:
        idx_horiz = abs(pts[8][1] - pts[5][1]) < hand_size * 0.30
        if idx_horiz:
            return "G"

    if idx and mid and not ring and not pinky and not thumb:
        h_horiz = abs(pts[8][1] - pts[5][1]) < hand_size * 0.40
        close   = tip_idx_mid < 0.25
        if h_horiz and close:
            return "H"

    if idx and mid and ring and pinky and not thumb:
        return "B"

    if idx and mid and ring and not pinky and not thumb:
        return "W"

    if not idx and not mid and not ring and pinky and not thumb:
        return "I"

    if idx and mid and not ring and not pinky and not thumb:
        if tip_idx_mid < 0.22:
            return "U"
        else:
            return "V"

    if idx and mid and not ring and not pinky and thumb:
        if tip_thumb_mid < 0.45:
            return "K"

    if idx and mid and not ring and not pinky and not thumb:
        if tip_idx_mid < 0.20:
            return "R"

    if idx and not mid and not ring and not pinky:
        if tip_thumb_mid < 0.40:
            return "D"

    if not idx and mid and ring and pinky and thumb:
        if tip_thumb_idx < 0.35:
            return "F"

    if idx and not mid and not ring and not pinky and thumb:
        if pts[8][1] > pts[5][1]:  
            ang = thumb_angle_deg(pts, handedness)
            if ang > 0:
                return "P"
            else:
                return "Q"

    if not idx and not mid and not ring and not pinky:
        if thumb and tip_thumb_idx > 0.40:
            return "A"
        if thumb and pts[4][1] <= pts[5][1] and tip_thumb_idx < 0.45:
            return "S"
        if thumb and pts[4][1] > pts[5][1] and tip_thumb_idx < 0.45:
            return "T"
        if thumb and idx_curl > 0.5 and mid_curl > 0.5 and ring_curl > 0.5:
            return "M"
        if thumb and idx_curl > 0.5 and mid_curl > 0.5 and ring_curl < 0.4:
            return "N"
        if not thumb:
            return "E"
        return "X"

    if idx and not mid and not ring and not pinky and thumb:
        return "L"

    return None

def decode_frame(b64_data):
    if "," in b64_data:
        b64_data = b64_data.split(",")[1]
    img_bytes = base64.b64decode(b64_data)
    nparr = np.frombuffer(img_bytes, np.uint8)
    frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    return frame

# ─── Routes ──────────────────────────────────────────────────────────────────
@app.route("/")
def index():
    return send_from_directory('../frontend/templates', 'index.html')

@app.route("/static/<path:path>")
def serve_static(path):
    return send_from_directory('../frontend/static', path)

@app.route("/api/detect", methods=["POST"])
def detect():
    data = request.get_json()
    if not data or "frame" not in data:
        return jsonify({"error": "No frame provided"}), 400

    frame = decode_frame(data["frame"])
    if frame is None:
        return jsonify({"error": "Could not decode frame"}), 400

    rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    raw_3d, pixel_2d, handedness = run_mediapipe(rgb)

    if not raw_3d:
        gesture_smoother.update(None)
        return jsonify({"label": None, "confidence": 0.0, "landmarks": [], "hand_detected": False})

    # Optional: Still generate the white skeleton image if your frontend uses it
    # skeleton_img = render_skeleton_on_white(pixel_2d)

    # Convert raw 3D points into wrist-normalized 3D points
    normalized_3d = normalize_landmarks_3d(raw_3d)

    # Classify based on 3D normalized geometry
    raw_label = recognize_asl_letters(normalized_3d, handedness)
    
    # Smooth out the prediction to stop flickering
    stable_label = gesture_smoother.update(raw_label)

    return jsonify({
        "label": stable_label,
        "raw_label": raw_label, # Useful for debugging
        "confidence": 0.9 if stable_label else 0.0,
        "landmarks": pixel_2d,  # Send pixel 2D back for frontend drawing if needed
        "hand_detected": True,
        "handedness": handedness
    })

@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "message": "ASL Platform backend running (3D Enhanced)"})

if __name__ == "__main__":
    print("=" * 60)
    print("  ASL Sign Language Learning Platform (3D Enhanced)")
    print("  Detection: Letters A-Z")
    print("  Backend: http://localhost:5000")
    print("=" * 60)
    app.run(host="0.0.0.0", port=5000, debug=False)
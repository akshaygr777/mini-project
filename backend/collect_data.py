import cv2
import mediapipe as mp
import csv
import math
import os

mp_hands = mp.solutions.hands
detector = mp_hands.Hands(min_detection_confidence=0.7, min_tracking_confidence=0.7)
mp_draw = mp.solutions.drawing_utils

DATASET_FILE = 'asl_dataset.csv'

def normalize_landmarks_3d(landmarks):
    base_x, base_y, base_z = landmarks[0]
    shifted = [[p[0]-base_x, p[1]-base_y, p[2]-base_z] for p in landmarks]
    scale = math.hypot(math.hypot(shifted[9][0], shifted[9][1]), shifted[9][2])
    if scale == 0: scale = 1.0 
    return [[p[0]/scale, p[1]/scale, p[2]/scale] for p in shifted]

cap = cv2.VideoCapture(0)

print("🎥 Data Collector Started.")
print("Press any letter key (A-Y) to save a frame for that letter.")
print("Take about 10-15 snapshots per letter, moving your hand slightly each time.")
print("Press 'ESC' to quit.")

with open(DATASET_FILE, 'a', newline='') as f:
    writer = csv.writer(f)
    
    while True:
        success, frame = cap.read()
        if not success: break

        frame = cv2.flip(frame, 1)
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        results = detector.process(rgb)

        if results.multi_hand_landmarks:
            for hand_landmarks in results.multi_hand_landmarks:
                mp_draw.draw_landmarks(frame, hand_landmarks, mp_hands.HAND_CONNECTIONS)
                
                raw_3d = [[p.x, p.y, p.z] for p in hand_landmarks.landmark]
                normalized_3d = normalize_landmarks_3d(raw_3d)
                flat_data = [coord for pt in normalized_3d for coord in pt]

        cv2.putText(frame, "Press A-Y to record. ESC to quit.", (10, 30), 
                    cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
        cv2.imshow("Dataset Collector", frame)

        key = cv2.waitKey(1) & 0xFF
        if key == 27: # ESC
            break
        elif 48 <= key <= 122: # Lowercase a-z
            if 'results' in locals() and results.multi_hand_landmarks:
                char = chr(key).upper()
                row = [char] + flat_data
                writer.writerow(row)
                print(f"✅ Saved 1 sample for '{char}'")
            else:
                print("⚠️ Hand not detected in frame. Try again.")

cap.release()
cv2.destroyAllWindows()
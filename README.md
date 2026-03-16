# 🤟 SignPath — ASL Learning Platform

A full-stack ASL (American Sign Language) learning platform with real-time hand gesture detection powered by MediaPipe.

## Features

- **Greeting Page** — Animated welcome screen
- **Practice Mode** — See the sign image + letter, show it via webcam, advance automatically when correct
- **Test Mode** — Only the letter is shown, detect the sign yourself; hints revealed after 3 wrong tries
- **All 26 letters** — A–Z (letters only)
- **Live landmark drawing** — See 21 hand landmarks drawn in real-time
- **Score tracking** — Points for correct signs

---

## Quick Start

### Prerequisites

- Python 3.8 or higher
- A webcam

### 1. Install & Run

**Linux / macOS:**
```bash
chmod +x start.sh
./start.sh
```

**Windows:**
```
start.bat
```

**Manual:**
```bash
pip install -r requirements.txt
python backend/app.py
```

### 2. Open Browser

```
http://localhost:5000
```

---

## How It Works

### Backend (Python / Flask)
- `backend/app.py` — Flask server with `/api/detect` endpoint
- Uses **MediaPipe Hands** to detect 21 hand landmarks
- **Skeleton rendering on white canvas** — landmarks are drawn onto a plain white background (eliminating background/lighting noise), inspired by [Devansh-47/Sign-Language-To-Text-and-Speech-Conversion](https://github.com/Devansh-47/Sign-Language-To-Text-and-Speech-Conversion)
- Geometric feature extraction on the normalised skeleton for robust A–Z classification
- Uses the same letter-grouping strategy as the GitHub project's CNN:
  - Group [Y, J], [C, O], [G, H], [B, D, F, I, U, V, K, R, W], [P, Q, Z], [A, E, M, N, S, T]

### Frontend (HTML/CSS/JS)
- `frontend/templates/index.html` — Single-page app
- `frontend/static/js/app.js` — Practice & Test logic
- `frontend/static/js/camera.js` — Webcam capture & API communication
- `frontend/static/js/asl-signs.js` — SVG hand illustrations for all 26 letters
- `frontend/static/css/main.css` — Dark bioluminescent design

### Detection Flow
```
Webcam → Capture Frame (400ms) → Send to /api/detect →
MediaPipe Landmarks → Draw on White Canvas (background-invariant) →
Geometric Feature Extraction → A-Z Letter Classification →
Match against target → Advance if 3 consecutive correct
```

---

## Practice Mode

1. An ASL sign image + letter is shown on the left
2. Point your webcam at your hand
3. Make the matching sign
4. Get **3 consecutive detections** to advance to the next letter
5. Use Prev/Skip to navigate manually

## Test Mode

1. Only the letter is shown (no sign image)
2. Make the correct ASL sign from memory
3. After **3 failed attempts**, the correct sign image is revealed
4. Score: 15 pts if correct first try, 5 pts with hint

---

## Project Structure

```
asl-platform/
├── backend/
│   └── app.py              # Flask + MediaPipe backend
├── frontend/
│   ├── templates/
│   │   └── index.html      # Main UI
│   └── static/
│       ├── css/main.css
│       └── js/
│           ├── app.js      # App logic
│           ├── camera.js   # Webcam module
│           └── asl-signs.js # SVG illustrations (A-Z only)
├── requirements.txt
├── start.sh
├── start.bat
└── README.md
```

---

## Gesture Recognition Details

Inspired by the approach in [Devansh-47/Sign-Language-To-Text-and-Speech-Conversion](https://github.com/Devansh-47/Sign-Language-To-Text-and-Speech-Conversion):

1. **MediaPipe** extracts 21 hand landmark (x, y) positions from the webcam frame
2. Landmarks are **drawn onto a plain white canvas** — removing all background/lighting dependency
3. The normalised canvas coordinates are used for geometric feature extraction:
   - Finger extension (tip Y vs PIP Y)
   - Thumb extension (tip X vs joint X, mirrored for left hand)
   - PIP joint angle → curl ratio (0 = extended, 1 = fully curled)
   - Normalised inter-tip distances
4. Letters are classified using the same **8-group disambiguation strategy** as the CNN in the referenced project

Covers all 26 ASL letters (A–Z). Numbers (0–9) removed.

---

## Troubleshooting

**Camera not working?**
- Allow camera permissions in browser
- Make sure no other app is using the webcam

**"Backend not reachable"?**
- Ensure `python backend/app.py` is running
- Check port 5000 is not in use

**Signs not detecting well?**
- Use good lighting (face a light source)
- Keep your hand within the green frame corners
- Hold the sign steady for ~1 second

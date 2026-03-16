#!/usr/bin/env bash
# ════════════════════════════════════════════════════════
#  SignPath ASL Learning Platform — Startup Script
# ════════════════════════════════════════════════════════
set -e

echo ""
echo "  ╔══════════════════════════════════════════╗"
echo "  ║   SignPath — ASL Learning Platform       ║"
echo "  ╚══════════════════════════════════════════╝"
echo ""

if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 not found. Please install Python 3.8+"
    exit 1
fi

PYTHON_VER=$(python3 --version 2>&1 | awk '{print $2}')
echo "✔ Python $PYTHON_VER found"

echo ""
echo "📦 Installing dependencies (this may take a minute on first run)..."

# Try pip install — support both venv and system python
pip3 install flask flask-cors mediapipe opencv-python numpy 2>/dev/null \
  || pip3 install flask flask-cors mediapipe opencv-python numpy --break-system-packages 2>/dev/null \
  || pip  install flask flask-cors mediapipe opencv-python numpy --break-system-packages

echo ""
echo "✔ Dependencies ready."
echo ""
echo "🚀 Starting server at http://localhost:5000"
echo "   (On first run the hand-landmarker model may be downloaded automatically)"
echo ""
echo "   Open your browser: http://localhost:5000"
echo "   Press Ctrl+C to stop"
echo ""

cd "$(dirname "$0")"
python3 backend/app.py

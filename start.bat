@echo off
echo.
echo   ''''''''''''''''''''''''''''''''''''''''''''
echo   '   SignPath - ASL Learning Platform       '
echo   ''''''''''''''''''''''''''''''''''''''''''''
echo.

echo [1/2] Installing dependencies...
pip install -r requirements.txt -q

echo [2/2] Starting server at http://localhost:5000
echo.
echo   Open your browser: http://localhost:5000
echo   Press Ctrl+C to stop
echo.

python backend\app.py
pause

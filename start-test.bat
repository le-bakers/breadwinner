@echo off
rem Double-click this file to test BreadWinner on your own computer.
rem It opens two black windows (the backend and the website). Close both when you are done.

cd /d "%~dp0"

echo Installing anything that is missing (the first run can take a few minutes)...
py -m pip install -q -r backend\requirements.txt

start "BreadWinner backend - leave open" py -m uvicorn server:app --app-dir backend --port 8000
start "BreadWinner website - leave open" py -m http.server 5500 --directory frontend

rem Give the two servers a moment to start, then open the dashboard
timeout /t 4 /nobreak >nul
start "" http://localhost:5500/home/home.html

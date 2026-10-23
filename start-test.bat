@echo off
rem Double-click this file to test BreadWinner on your own computer.
rem Configure backend\.env and apply database.sql first. See README.md.

cd /d "%~dp0"

echo Installing anything that is missing (the first run can take a few minutes)...
if not exist .venv\Scripts\python.exe py -m venv .venv
.venv\Scripts\python.exe -m pip install -q -r backend\requirements-dev.txt
if errorlevel 1 exit /b 1
pushd frontend
call npm.cmd ci --ignore-scripts
if errorlevel 1 exit /b 1
set BW_LOCAL_DEV=1
call npm.cmd run build
set BW_LOCAL_DEV=
if errorlevel 1 exit /b 1
popd

powershell -NoProfile -Command "Start-Process -WindowStyle Hidden -FilePath '.venv\Scripts\python.exe' -ArgumentList '-m','uvicorn','server:app','--app-dir','backend','--port','8000','--no-access-log'"
powershell -NoProfile -Command "Start-Process -WindowStyle Hidden -FilePath '.venv\Scripts\python.exe' -ArgumentList '-m','http.server','5500','--directory','frontend/_site'"

rem Give the two servers a moment to start, then open the dashboard
timeout /t 4 /nobreak >nul
start "" http://localhost:5500/home/home.html

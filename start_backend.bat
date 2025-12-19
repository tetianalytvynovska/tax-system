@echo off
chcp 65001 >nul

echo === STARTING TAXAGENT BACKEND ===
cd /d "%~dp0backend"

echo Running: npm install
echo ------------------------------------
call npm install
echo ------------------------------------

echo If you see an error above, Node.js or npm is not installed or not in PATH.
echo.

echo Running backend server...
call node server.js

echo.
echo === BACKEND FINISHED ===
pause

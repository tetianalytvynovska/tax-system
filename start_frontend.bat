@echo off
chcp 65001 >nul

echo === STARTING TAXAGENT FRONTEND (VITE) ===
cd /d "%~dp0frontend"

echo Running: npm install
echo ------------------------------------
call npm install
echo ------------------------------------

echo Starting Vite development server...
call npm run dev

echo.
echo === FRONTEND FINISHED ===
pause

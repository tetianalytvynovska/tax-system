@echo off
chcp 65001 >nul

echo ========================================
echo   ЗАПУСК TAXAGENT
echo ========================================

echo.
echo [1/2] Запуск BACKEND...
cd /d "%~dp0backend"

start cmd /k "npm install && node server.js"

timeout /t 5 >nul

echo.
echo [2/2] Запуск FRONTEND...
cd /d "%~dp0frontend"

start cmd /k "npm install && npm run dev"

echo.
echo ✅ СИСТЕМА ЗАПУЩЕНА
echo 👉 Backend: http://localhost:5000
echo 👉 Frontend: http://localhost:5173
echo.

pause

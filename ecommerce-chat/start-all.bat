@echo off
echo Starting EonlineBazar Chat System...
echo.

echo [1/2] Starting Chat Server on port 5001...
start "Chat Server" cmd /k "cd /d %~dp0 && npm run dev"

timeout /t 3 /nobreak > nul

echo [2/2] Starting Admin Dashboard on port 5173...
start "Admin Dashboard" cmd /k "cd /d %~dp0..\admin-dashboard && npm run dev"

echo.
echo Chat Server: http://localhost:5001
echo Admin Dashboard: http://localhost:5173
echo Widget Test: http://localhost:5001/chat-widget.html
echo.
pause

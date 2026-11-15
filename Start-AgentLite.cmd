@echo off
setlocal
cd /d "%~dp0"

if not exist "resources\runtime\node.exe" (
  echo [Agent Lite] Missing: resources\runtime\node.exe
  echo [Agent Lite] Please extract the full distribution first.
  pause
  exit /b 1
)

if not exist "resources\web\server.mjs" (
  echo [Agent Lite] Missing: resources\web\server.mjs
  echo [Agent Lite] Please extract the full distribution first.
  pause
  exit /b 1
)

if not exist "data" (
  mkdir "data"
)

rem ── Start engine (Colibri + Proxy) if not running ─────────────────────────
netstat -an | findstr ":8000" | findstr "LISTENING" >nul 2>&1
if errorlevel 1 (
    echo [Agent Lite] Starting Colibri engine on :8000 ...
    start "" /b python "scripts\Start_Qwen_Server.bat"
    echo [Agent Lite] Waiting for engine...
    timeout /t 120 /nobreak >nul
)
netstat -an | findstr ":8001" | findstr "LISTENING" >nul 2>&1
if errorlevel 1 (
    echo [Agent Lite] Starting proxy on :8001 ...
    start "" /b python "tools\colibri_proxy.py" --listen 8001 --upstream 127.0.0.1:8000 --log "logs\proxy.jsonl"
    timeout /t 5 /nobreak >nul
)

rem ── Start web UI ──────────────────────────────────────────────────────────
echo.
echo [Agent Lite] Starting web UI on http://127.0.0.1:3081
echo.

rem Open browser after server starts
start "" cmd /c "timeout /t 2 >nul && start http://127.0.0.1:3081"

"resources\runtime\node.exe" "resources\web\server.mjs"

if errorlevel 1 (
    echo.
    echo [Agent Lite] Server stopped with error.
    pause
)

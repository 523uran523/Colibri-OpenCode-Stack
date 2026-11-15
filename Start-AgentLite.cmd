@echo off
setlocal
cd /d "%~dp0"
if not exist "resources\runtime\node.exe" (
  echo Missing resources\runtime\node.exe
  pause
  exit /b 1
)
if not exist "resources\web\server.mjs" (
  echo Missing resources\web\server.mjs
  pause
  exit /b 1
)
if "%AGENT_LITE_PORT%"=="" set "AGENT_LITE_PORT=3081"
echo Agent Lite: http://127.0.0.1:%AGENT_LITE_PORT%/
echo Press Ctrl+C to stop.
"resources\runtime\node.exe" "resources\web\server.mjs"
if errorlevel 1 pause

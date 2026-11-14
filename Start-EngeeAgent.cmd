@echo off
setlocal
cd /d "%~dp0"
if not exist "resources\runtime\node.exe" (
  echo Missing resources\runtime\node.exe. Extract the entire ZIP first.
  pause
  exit /b 1
)
if not exist "resources\web\server.mjs" (
  echo Missing resources\web\server.mjs. Extract the entire ZIP first.
  pause
  exit /b 1
)
if "%ENGEE_AGENT_PORT%"=="" set "ENGEE_AGENT_PORT=3081"
echo Engee Agent: http://127.0.0.1:%ENGEE_AGENT_PORT%/
echo Keep this window open while using the app. Press Ctrl+C to stop.
echo If that port is occupied, use: set ENGEE_AGENT_PORT=3091
echo Then run this file again from the same command window.
"resources\runtime\node.exe" "resources\web\server.mjs"
if errorlevel 1 pause

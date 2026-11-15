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

if not exist "data\logs" (
  mkdir "data\logs"
)

rem ── Auto-start Colibri engine + proxy ─────────────────────────────────────
rem The node server owns the Colibri lifecycle: POST /api/engine/start spawns
rem the engine (port 8000), waits for /health and then spawns colibri_proxy
rem (port 8001) — with live UI status, log buffer and a Stop button. A hidden
rem PowerShell watcher waits for the web server to come up, then triggers it.
rem No extra console windows, no double instances.
start "" /b powershell.exe -NoProfile -WindowStyle Hidden -Command "$ok=$false; for ($i=0; $i -lt 90; $i++) { Start-Sleep -Seconds 2; try { $r = Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:3081/api/health' -TimeoutSec 3; if ($r.StatusCode -eq 200) { $ok=$true; break } } catch {} }; if ($ok) { try { Invoke-WebRequest -UseBasicParsing -Method POST -Uri 'http://127.0.0.1:3081/api/engine/start' -ContentType 'application/json' -Body '{}' -TimeoutSec 15 | Out-Null } catch {} }"

rem ── Start web UI ───────────────────────────────────────────────────────────
echo.
echo [Agent Lite] Starting web UI on http://127.0.0.1:3081
echo [Agent Lite] Colibri starts automatically in the background (~1-3 minutes).
echo.

rem Open browser after server starts
start "" cmd /c "timeout /t 2 >nul && start http://127.0.0.1:3081"

"resources\runtime\node.exe" "resources\web\server.mjs"

if errorlevel 1 (
  echo.
  echo [Agent Lite] Server stopped with error.
  pause
)

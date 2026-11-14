@echo off
setlocal
title Local AI Coder - Colibri + Proxy
rem One-click start: Colibri server (Qwen3-Coder) + OpenCode proxy.
rem ASCII-only on purpose: cmd reads .bat in the OEM codepage.

for /f "delims=" %%I in ('powershell -NoProfile -Command "[Environment]::GetFolderPath('MyDocuments')"') do set "DOCS=%%I"
if not exist "%DOCS%\calibri" (
  echo Folder not found: %DOCS%\calibri
  pause
  exit /b 1
)
cd /d "%DOCS%\calibri"

echo Starting Colibri Server (Qwen3-Coder-30B-A3B) ...
start "Colibri Server" cmd /k "Start_Qwen_Server.bat"

echo Waiting 60 seconds for the model to load ...
timeout /t 60 /nobreak >nul

echo Starting Colibri Proxy on 8001 ...
start "Colibri Proxy" cmd /k "py -3 tools\colibri_proxy.py --log logs\proxy-requests.jsonl"

echo Done! You can now open OpenCode.
pause

@echo off
setlocal
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "%~dp0resources\runtime\launcher\Create-DesktopShortcut.ps1"
if errorlevel 1 (
  pause
  exit /b 1
)
timeout /t 3 /nobreak >nul
exit /b 0

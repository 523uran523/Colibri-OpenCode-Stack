@echo off
cd /d "%~dp0"
"resources\runtime\node.exe" "resources\web\package.mjs"
pause

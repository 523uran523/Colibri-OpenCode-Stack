@echo off
setlocal
title colibri OLMoE
cd /d "%~dp0"

rem Find the newest colibri runtime (installed by START-HERE.bat / coli setup).
set "COLI_LAUNCHER="
for /f "delims=" %%D in ('dir /b /ad /o-n "%LOCALAPPDATA%\colibri\runtime\colibri-*" 2^>nul') do (
    if not defined COLI_LAUNCHER if exist "%LOCALAPPDATA%\colibri\runtime\%%D\coli" set "COLI_LAUNCHER=%LOCALAPPDATA%\colibri\runtime\%%D\coli"
)
if not defined COLI_LAUNCHER if exist "%~dp0c\coli" set "COLI_LAUNCHER=%~dp0c\coli"
if not defined COLI_LAUNCHER (
    echo colibri runtime not found. Run START-HERE.bat once first.
    pause
    exit /b 1
)

if not exist "%~dp0models\olmoe-colibri\config.json" (
    echo Model not found: %~dp0models\olmoe-colibri
    echo Run START-HERE.bat or coli import first.
    pause
    exit /b 1
)

set "COLI_TOOL_FALLBACK=1"
set "COLI_PY_EXE="
set "COLI_PY_ARG="
py -3 -c "import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)" >nul 2>&1 && (set "COLI_PY_EXE=py" & set "COLI_PY_ARG=-3")
if not defined COLI_PY_EXE python -c "import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)" >nul 2>&1 && set "COLI_PY_EXE=python"
if not defined COLI_PY_EXE (
    echo Python 3.10+ not found. Install it from https://www.python.org/downloads/
    pause
    exit /b 1
)

echo Stopping any running colibri server on port 8000 ...
"%COLI_PY_EXE%" %COLI_PY_ARG% "%COLI_LAUNCHER%" stop >nul 2>&1

echo Starting OLMoE on http://127.0.0.1:8000/v1 ...
"%COLI_PY_EXE%" %COLI_PY_ARG% "%COLI_LAUNCHER%" serve --model "%~dp0models\olmoe-colibri" --ram 8 --host 127.0.0.1 --port 8000
set "RC=%ERRORLEVEL%"
echo.
echo colibri stopped (code %RC%).
pause
exit /b %RC%

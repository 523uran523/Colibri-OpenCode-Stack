@echo off
setlocal
title colibri stop
cd /d "%~dp0"

set "COLI_LAUNCHER="
for /f "delims=" %%D in ('dir /b /ad /o-n "%LOCALAPPDATA%\colibri\runtime\colibri-*" 2^>nul') do (
    if not defined COLI_LAUNCHER if exist "%LOCALAPPDATA%\colibri\runtime\%%D\coli" set "COLI_LAUNCHER=%LOCALAPPDATA%\colibri\runtime\%%D\coli"
)
if not defined COLI_LAUNCHER if exist "%~dp0c\coli" set "COLI_LAUNCHER=%~dp0c\coli"
if not defined COLI_LAUNCHER (
    echo colibri runtime not found.
    pause
    exit /b 1
)

py -3 "%COLI_LAUNCHER%" stop
pause

@echo off
setlocal
title colibri Parable-Qwen3-4B (CUDA)
cd /d "%~dp0"

rem Find the newest colibri runtime (the CUDA release is unpacked over it).
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

if not exist "G:\models\parable-qwen3-4b\config.json" (
    echo Model not found: G:\models\parable-qwen3-4b
    echo Import it first:
    echo   coli import "G:\models\Parable-Qwen3-4B-Claude-Fable-5.Q4_K_M.gguf" --out G:\models\parable-qwen3-4b
    pause
    exit /b 1
)

if not exist "G:\colibri_cache" mkdir "G:\colibri_cache"

rem CUDA backend for the RTX card. The model is dense: no expert cache budget.
set "COLI_CUDA=1"
set "CUDA_DENSE=1"
set "HEAT_FILE=G:\colibri_cache\parable.heat"
set "COLI_CACHE_DIR=G:\colibri_cache"
set "COLI_TOOL_FALLBACK=1"

rem ctx 4096 (not 12288): with 12288 the float16 KV cache (1.2-1.7 GiB) does NOT fit
rem next to the CUDA trunk on the 4 GB card, so the KV cache stays on the CPU and the
rem GPU idles at 0% util during prefill (6402-token prompt ~= 9 min). At ctx 4096 the
rem KV cache (~0.56 GiB) sits on the GPU, prefill uses ~76% util and the same request
rem finishes in ~76 s. Without the proxy removing `tools`, the OpenCode main prompt is
rem 6432 tokens and does not fit in 4096 anyway. Keep --ctx in sync with opencode.json
rem (limit.context=4096) and with the proxy (it strips tools -> ~2557 prompt tokens).

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

echo Starting Parable-Qwen3-4B on http://127.0.0.1:8000/v1 (CUDA, ctx 4096) ...
"%COLI_PY_EXE%" %COLI_PY_ARG% "%COLI_LAUNCHER%" serve --model "G:\models\parable-qwen3-4b" --model-id parable-qwen3-4b --ctx 4096 --host 127.0.0.1 --port 8000
set "RC=%ERRORLEVEL%"
echo.
echo colibri server stopped (code %RC%).
pause
exit /b %RC%

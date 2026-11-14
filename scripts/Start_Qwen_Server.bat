@echo off
setlocal
title colibri Qwen3-Coder-30B-A3B (server for OpenCode, CUDA)
cd /d "%~dp0"

rem Drive letter for models+cache. Defaults to G: (this machine). Overridable:
rem   set COLI_MODEL_DRIVE=H: && Start_Qwen_Server.bat
rem The whole bat runs cd /d on that drive up front so the "G:\..." checks below
rem never depend on the *current* drive state of whatever shell launched us
rem (a PowerShell-spawned `cmd /c` does NOT inherit G: as current, which makes a
rem bare "G:\models\..." exist-check report NOT-FOUND even when the file is there).
if not defined COLI_MODEL_DRIVE set "COLI_MODEL_DRIVE=G:"
pushd "%COLI_MODEL_DRIVE%\" >nul 2>&1 || (
    echo Drive %COLI_MODEL_DRIVE% not available (ejected/drive missing).
    pause
    exit /b 1
)

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

if not exist "%COLI_MODEL_DRIVE%models\qwen3-coder-30b\config.json" (
    echo Model not found: %COLI_MODEL_DRIVE%models\qwen3-coder-30b
    echo Download it first (coli setup puts it in .\models\qwen3-coder-30b),
    echo verify sizes against .colibri-download.json, then move the folder to %COLI_MODEL_DRIVE%models\qwen3-coder-30b.
    pause
    exit /b 1
)

if not exist "%COLI_MODEL_DRIVE%colibri_cache" mkdir "%COLI_MODEL_DRIVE%colibri_cache"

rem CUDA backend for the RTX card. MoE: dense trunk + a 3 GB expert budget on VRAM,
rem the rest of the experts stream from G:. Keep the proxy (tools/8001) running too.
set "COLI_CUDA=1"
set "CUDA_DENSE=1"
set "CUDA_EXPERT_GB=3"
set "HEAT_FILE=%COLI_MODEL_DRIVE%colibri_cache\qwen.heat"
set "COLI_CACHE_DIR=%COLI_MODEL_DRIVE%colibri_cache"
set "COLI_TOOL_FALLBACK=1"

rem ---- ctx ladder ----------------------------------------------------------
rem KV cache is fp16, 96 KiB/token (48 layers x 4 kv heads x 128 dim x 2 B):
rem   ctx 4096  -> 0.38 GiB   ctx 8192 -> 0.75 GiB   ctx 16384 -> 1.5 GiB
rem The card has 4.3 GiB total and CUDA_EXPERT_GB=3 already reserves 3 GiB for
rem experts, so a large ctx can push KV to CPU (0%% GPU util, minutes of prefill)
rem or OOM-crash the engine silently. 16384 is the requested default; if the
rem engine dies silently or the first request shows gpu 0% / slow reading,
rem restart with:  set COLI_CTX=8192   (then 4096) and watch logs\qwen-server.*.log
rem --------------------------------------------------------------------------
if not defined COLI_CTX set "COLI_CTX=16384"

set "COLI_PY_EXE="
set "COLI_PY_ARG="
py -3 -c "import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)" >nul 2>&1 && (set "COLI_PY_EXE=py" & set "COLI_PY_ARG=-3")
if not defined COLI_PY_EXE python -c "import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)" >nul 2>&1 && set "COLI_PY_EXE=python"
if not defined COLI_PY_EXE (
    echo Python 3.10+ not found. Install it from https://www.python.org/downloads/.
    pause
    exit /b 1
)

echo Stopping any running colibri server on port 8000 ...
"%COLI_PY_EXE%" %COLI_PY_ARG% "%COLI_LAUNCHER%" stop >nul 2>&1

echo Starting Qwen3-Coder-30B-A3B on http://127.0.0.1:8000/v1 (CUDA, cap 32, ctx %COLI_CTX%) ...
echo Use this window for OpenCode; press Ctrl+C to stop.
"%COLI_PY_EXE%" %COLI_PY_ARG% "%COLI_LAUNCHER%" serve --model "%COLI_MODEL_DRIVE%models\qwen3-coder-30b" --model-id qwen3-coder-30b-a3b-colibri --cap 32 --ctx %COLI_CTX% --host 127.0.0.1 --port 8000
set "RC=%ERRORLEVEL%"
echo.
echo colibri server stopped (code %RC%).
pause
exit /b %RC%

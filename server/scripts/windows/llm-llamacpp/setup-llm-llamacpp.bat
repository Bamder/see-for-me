@echo off
REM Windows 版：启动 llama.cpp OpenAI 兼容服务（GGUF）
REM 依赖：已在 server\llm-llamacpp-env 中安装 llama-cpp-python，模型已下载到 models/

cd /d "%~dp0\..\..\.."

set LLM_LLAMA_ENV_DIR=llm-llamacpp-env

if not exist "%LLM_LLAMA_ENV_DIR%\Scripts\python.exe" (
  echo 未找到 llm-llamacpp-env 虚拟环境。
  echo 请先运行：
  echo   server\scripts\windows\llm-llamacpp\setup-llm-llamacpp-env.bat
  echo.
  pause
  exit /b 1
)

REM 设置虚拟环境中的 Python 路径（确保使用 llm-llamacpp-env 环境）
set PYTHON_EXE=%LLM_LLAMA_ENV_DIR%\Scripts\python.exe

REM 验证 Python 可执行文件存在
if not exist "%PYTHON_EXE%" (
  echo ❌ 虚拟环境中的 Python 可执行文件不存在
  pause
  exit /b 1
)

REM 显示使用的环境（确认使用 llm-llamacpp-env）
echo 使用虚拟环境: %LLM_LLAMA_ENV_DIR%
"%PYTHON_EXE%" --version
echo.

REM === 可配置区（可用环境变量覆盖） ===
set GGUF_PATH=%GGUF_PATH%
REM 默认使用 q8_0 量化版本的分片文件（只需指定第一个分片，llama.cpp 会自动加载其他分片）
REM 注意：当前工作目录已是 server 目录，因此模型路径应为 models\...
if "%GGUF_PATH%"=="" set GGUF_PATH=models\qwen2.5-7b-instruct-q8_0-00001-of-00003.gguf

REM 验证模型文件是否存在
if not exist "%GGUF_PATH%" (
  echo [错误] 模型文件不存在: %GGUF_PATH%
  echo 当前工作目录: %CD%
  echo 请检查模型路径是否正确，或通过 GGUF_PATH 环境变量指定正确的路径
  echo.
  pause
  exit /b 1
)

set HOST=%HOST%
if "%HOST%"=="" set HOST=0.0.0.0
set PORT=%PORT%
if "%PORT%"=="" set PORT=8001
set N_GPU_LAYERS=%N_GPU_LAYERS%

REM 启动前检查端口是否已被占用（避免与已有服务冲突）
powershell -Command ^
  "if (Get-NetTCPConnection -LocalPort %PORT% -ErrorAction SilentlyContinue) { exit 1 } else { exit 0 }"

if %errorlevel% neq 0 (
  echo [错误] 端口 %PORT% 已被占用，可能已有服务在运行或其他应用占用了该端口。
  echo 请更换 GGUF_PATH 或 PORT，或关闭占用该端口的程序。
  echo.
  pause
  exit /b 1
)
REM 自动探测 GPU：若未显式指定 N_GPU_LAYERS，且检测到 nvidia-smi，则默认 20；否则 0（CPU 模式）
if "%N_GPU_LAYERS%"=="" (
  nvidia-smi >nul 2>&1
  if %errorlevel%==0 (
    set N_GPU_LAYERS=20
  ) else (
    set N_GPU_LAYERS=0
  )
)
REM 有小显存 GPU 可手动设 N_GPU_LAYERS=20/30，-1 表示全层上 GPU（需足够显存）
REM =====================================

echo ========================================
echo 启动 llama.cpp OpenAI 兼容服务 (GGUF)
echo 模型: %GGUF_PATH%
echo 监听: http://%HOST%:%PORT%
echo N_GPU_LAYERS: %N_GPU_LAYERS%
echo 虚拟环境: %LLM_LLAMA_ENV_DIR%
echo ========================================

REM 使用虚拟环境中的 Python 启动服务
"%PYTHON_EXE%" -m llama_cpp.server ^
  --model "%GGUF_PATH%" ^
  --host %HOST% ^
  --port %PORT% ^
  --n_gpu_layers %N_GPU_LAYERS% ^
  --chat_format qwen



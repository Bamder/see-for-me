@echo off
chcp 65001 >nul
setlocal

REM ============================================================
REM Windows 版：llama.cpp 推理专用虚拟环境（llm-llamacpp-env）
REM 位置：server\llm-llamacpp-env
REM 依赖：llama-cpp-python（请根据 GPU/CPU 需求选择合适的编译版本）
REM ============================================================

cd /d "%~dp0\..\..\.."

set LLM_LLAMA_ENV_DIR=llm-llamacpp-env

if exist "%LLM_LLAMA_ENV_DIR%\Scripts\activate.bat" (
  echo 已检测到现有虚拟环境：%LLM_LLAMA_ENV_DIR%
  goto :install_deps
) else (
  echo 正在创建虚拟环境：%LLM_LLAMA_ENV_DIR%
  python -m venv "%LLM_LLAMA_ENV_DIR%"
)

:install_deps
call "%LLM_LLAMA_ENV_DIR%\Scripts\activate.bat"

echo 正在安装 / 更新 llama-cpp-python 及其依赖...
echo 注意: llama_cpp.server 需要额外的 Web 框架依赖
pip install -U "llama-cpp-python" "uvicorn[standard]" "fastapi" "starlette" "starlette-context" "pydantic" "pydantic-settings" "python-multipart" "sse-starlette"

echo.
echo llm-llamacpp-env 环境已就绪：
echo   位置: %CD%\%LLM_LLAMA_ENV_DIR%
echo   用途: 仅用于 llama.cpp 推理服务，不影响 server-env / llm-tools-env
echo.
echo 可使用命令：
echo   call llm-llamacpp-env\Scripts\activate.bat
echo   python -m llama_cpp.server --help
echo.
pause



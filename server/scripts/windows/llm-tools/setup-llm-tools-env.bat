@echo off
chcp 65001 >nul
setlocal

REM ============================================================
REM 专用 llm-tools 虚拟环境：仅用于 LLM/模型下载等工具，不影响 server-env
REM 位置：server\llm-tools-env
REM 依赖：安装最新 huggingface_hub 提供的 hf CLI
REM ============================================================

cd /d "%~dp0\..\..\.."

set TOOLS_ENV_DIR=llm-tools-env

if exist "%TOOLS_ENV_DIR%\Scripts\activate.bat" (
  echo 已检测到现有虚拟环境：%TOOLS_ENV_DIR%
  goto :install_deps
) else (
  echo 正在创建虚拟环境：%TOOLS_ENV_DIR%
  python -m venv "%TOOLS_ENV_DIR%"
)

:install_deps
call "%TOOLS_ENV_DIR%\Scripts\activate.bat"

echo 正在安装 / 更新 huggingface_hub 及 hf CLI...
pip install -U "huggingface_hub>=1.2.0"

echo.
echo llm-tools 环境已就绪：
echo   位置: %CD%\%TOOLS_ENV_DIR%
echo   用途: 仅用于 LLM/模型下载等工具，不影响 server-env 运行依赖
echo.
echo 可使用命令：
echo   call llm-tools-env\Scripts\activate.bat
echo   hf --help
echo.
pause



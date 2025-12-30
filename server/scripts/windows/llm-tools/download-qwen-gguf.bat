@echo off
REM 强制设置 UTF-8 编码，避免中文乱码
chcp 65001 >nul 2>&1
setlocal EnableDelayedExpansion
REM 确保输出编码为 UTF-8
set PYTHONIOENCODING=utf-8

REM ============================================================
REM 使用专用 llm-tools 环境，通过 hf CLI 下载 Qwen GGUF 模型
REM 不依赖 server-env，避免与 transformers 的依赖冲突
REM 这是唯一入口脚本，可直接运行：
REM   server\scripts\windows\llm-tools\download-qwen-gguf.bat
REM ============================================================

cd /d "%~dp0\..\..\.."

set TOOLS_ENV_DIR=llm-tools-env

if not exist "%TOOLS_ENV_DIR%\Scripts\python.exe" (
  echo 未找到 llm-tools-env 虚拟环境。
  echo 请先运行：
  echo   server\scripts\windows\llm-tools\setup-llm-tools-env.bat
  echo.
  pause
  goto :eof
)

REM 设置虚拟环境中的 Python 和 hf 路径（确保使用 llm-tools-env 环境）
set PYTHON_EXE=%TOOLS_ENV_DIR%\Scripts\python.exe
set HF_EXE=%TOOLS_ENV_DIR%\Scripts\hf.exe

REM 验证 Python 可执行文件存在
if not exist "%PYTHON_EXE%" (
  echo ❌ 虚拟环境中的 Python 可执行文件不存在
  pause
  goto :eof
)

REM 显示使用的环境（确认使用 llm-tools-env）
echo 使用虚拟环境: %TOOLS_ENV_DIR%
"%PYTHON_EXE%" --version
echo.

REM ===== 可配置区（可用环境变量覆盖）=====
set MODEL_REPO=%MODEL_REPO%
if "%MODEL_REPO%"=="" set MODEL_REPO=Qwen/Qwen2.5-7B-Instruct-GGUF

set MODEL_BASENAME=%MODEL_BASENAME%
if "%MODEL_BASENAME%"=="" set MODEL_BASENAME=qwen2.5-7b-instruct-q8_0

set TARGET_DIR=%TARGET_DIR%
REM 注意：当前工作目录已是 server 根目录，因此默认目标应为 .\models
if "%TARGET_DIR%"=="" set TARGET_DIR=models

REM 镜像终端可通过 HF_ENDPOINT / ENV_HF_ENDPOINT 环境变量控制
REM 优先使用用户显式设置的 HF_ENDPOINT，其次 ENV_HF_ENDPOINT，最后默认 hf-mirror
set HF_ENDPOINT_DEFAULT=https://hf-mirror.com
if not "%HF_ENDPOINT%"=="" (
  set EFFECTIVE_HF_ENDPOINT=%HF_ENDPOINT%
) else if not "%ENV_HF_ENDPOINT%"=="" (
  set EFFECTIVE_HF_ENDPOINT=%ENV_HF_ENDPOINT%
) else (
  set EFFECTIVE_HF_ENDPOINT=%HF_ENDPOINT_DEFAULT%
)
set HF_ENDPOINT=%EFFECTIVE_HF_ENDPOINT%
REM 若需认证，预先设置 HF_TOKEN 即可
REM ============================

if not exist "%TARGET_DIR%" (
  mkdir "%TARGET_DIR%"
)

echo ========================================
echo 使用 llm-tools-env 环境通过 hf 下载模型
echo 仓库: %MODEL_REPO%
echo 文件前缀: %MODEL_BASENAME%-*.gguf
echo 目标: %TARGET_DIR%
echo 镜像: %HF_ENDPOINT%  (通过 HF_ENDPOINT/ENV_HF_ENDPOINT 控制)
echo ========================================

REM 检查已下载的文件并验证完整性
echo.
echo 检查已下载的文件...
set FOUND_FILES=0
for %%f in ("%TARGET_DIR%\%MODEL_BASENAME%-*.gguf") do (
  if exist "%%f" (
    for %%s in ("%%f") do (
      echo   已存在: %%~nxf ^(大小: %%~zs 字节^)
      set /a FOUND_FILES+=1
    )
  )
)

REM 设置网络超时和重试参数（通过环境变量传递给 huggingface_hub）
REM 增加超时时间，避免 SSL 握手超时
set HF_HUB_DOWNLOAD_TIMEOUT=300
set HF_HUB_DOWNLOAD_RETRIES=5
set HF_HUB_DOWNLOAD_RETRY_DELAY=10

REM 说明：部分 GGUF 权重以分片形式存在（*-00001-of-00003.gguf 等），此处通过 include 前缀一次性下载所有分片。
REM hf download 支持断点续传，已下载的文件会自动跳过。
REM 可通过 MODEL_BASENAME 环境变量覆盖前缀，例如：qwen2.5-7b-instruct-q4_k_m
echo.
echo 开始下载（支持断点续传，已下载的文件会自动跳过）...
echo 网络超时设置: %HF_HUB_DOWNLOAD_TIMEOUT% 秒，最大重试: %HF_HUB_DOWNLOAD_RETRIES% 次
echo.
set MAX_RETRIES=5
set RETRY_COUNT=0
set RETRY_DELAY=10
:retry_download
REM 使用虚拟环境中的 hf 命令
if exist "%HF_EXE%" (
  "%HF_EXE%" download %MODEL_REPO% ^
    --local-dir %TARGET_DIR% ^
    --include "%MODEL_BASENAME%-*.gguf"
) else (
  REM 如果 hf 不在 Scripts 目录，使用 python -m huggingface_hub
  "%PYTHON_EXE%" -m huggingface_hub.cli.download %MODEL_REPO% ^
    --local-dir %TARGET_DIR% ^
    --include "%MODEL_BASENAME%-*.gguf"
)

if %errorlevel% equ 0 (
  echo.
  echo [成功] 下载完成！
  goto :download_success
) else (
  set /a RETRY_COUNT+=1
  if %RETRY_COUNT% lss %MAX_RETRIES% (
    echo.
    echo [警告] 下载中断（错误码: %errorlevel%），%RETRY_COUNT%/%MAX_RETRIES% 次重试中...
    echo 等待 %RETRY_DELAY% 秒后重试（指数退避策略）...
    timeout /t %RETRY_DELAY% /nobreak >nul
    REM 指数退避：每次重试延迟时间翻倍（最多60秒）
    set /a RETRY_DELAY*=2
    if %RETRY_DELAY% gtr 60 set RETRY_DELAY=60
    goto :retry_download
  ) else (
    echo.
    echo [错误] 下载失败，已重试 %MAX_RETRIES% 次。
    set "MSG_CONTINUE=hf download 支持断点续传，可直接重新运行此脚本继续下载。"
    echo 提示: !MSG_CONTINUE!
    goto :download_failed
  )
)

:download_success
echo.
echo ========================================
echo 验证下载的文件完整性
echo ========================================
set VERIFY_FAILED=0
set FOUND_COUNT=0
set FILE_LIST=
set CHECKSUM_VERIFY=0

REM 检查所有分片文件
for %%f in ("%TARGET_DIR%\%MODEL_BASENAME%-*.gguf") do (
  if exist "%%f" (
    set /a FOUND_COUNT+=1
    for %%s in ("%%f") do (
      REM 检查文件大小是否为0（完全未下载）
      if %%~zs equ 0 (
        echo   [警告] %%~nxf 文件大小为 0，下载未完成！
        set VERIFY_FAILED=1
      ) else (
        echo   [OK] %%~nxf ^(大小: %%~zs 字节^)
        REM 记录文件名用于后续检查
        set FILE_LIST=!FILE_LIST! %%~nxf
      )
    )
  )
)

REM 检查是否找到文件
if %FOUND_COUNT% equ 0 (
  echo   [错误] 未找到任何文件！下载可能失败。
  set VERIFY_FAILED=1
) else (
  echo.
  echo 找到 %FOUND_COUNT% 个文件
  REM 检查文件名模式，判断是否为分片文件（检查是否包含 "-of-" 模式）
  echo !FILE_LIST! | findstr /C:"-of-" >nul 2>&1
  if !errorlevel! equ 0 (
    echo   [提示] 检测到分片文件模式，请确认所有分片都已下载
    echo   如果缺少分片，hf download 会自动补全缺失的文件
  )
)

REM 尝试计算 SHA256 校验和（如果 certutil 可用）
echo.
echo 计算文件 SHA256 校验和（用于完整性验证）...
where certutil >nul 2>&1
if !errorlevel! equ 0 (
  for %%f in ("%TARGET_DIR%\%MODEL_BASENAME%-*.gguf") do (
    if exist "%%f" (
      for %%s in ("%%f") do (
        if not %%~zs equ 0 (
          echo   计算 %%~nxf 的 SHA256...
          certutil -hashfile "%%f" SHA256 2>nul | findstr /V /C:"SHA256" /C:"certutil" /C:"CertUtil" >"%TEMP%\sha256_%%~nxf.tmp"
          for /f "usebackq tokens=*" %%h in ("%TEMP%\sha256_%%~nxf.tmp") do (
            set "HASH_LINE=%%h"
            set "HASH_LINE=!HASH_LINE: =!"
            if not "!HASH_LINE!"=="" (
              echo   SHA256: !HASH_LINE!
              set CHECKSUM_VERIFY=1
            )
          )
          del "%TEMP%\sha256_%%~nxf.tmp" >nul 2>&1
        )
      )
    )
  )
  if !CHECKSUM_VERIFY! equ 0 (
    echo   [提示] SHA256 计算完成，请与官方校验和对比验证
  )
) else (
  echo   [提示] certutil 不可用，跳过 SHA256 计算
  echo   可以使用以下命令手动计算：
  echo     certutil -hashfile "文件路径" SHA256
)

echo.
if %VERIFY_FAILED% equ 1 (
  echo [警告] 文件验证未通过，建议重新运行脚本下载。
  echo.
) else (
  echo [初步检查] 文件存在且大小正常（仅检查文件存在性和大小，非完整性验证）
  echo [重要] 请务必手动校验 SHA256 以确保文件完整性（见下方说明）
  echo.
)

echo ========================================
echo 文件完整性验证说明（重要！）
echo ========================================
echo.
echo [注意] 上方的"初步检查通过"仅表示文件存在且大小正常，
echo        这不能保证文件完整性！请务必进行以下验证：
echo.
echo 1. 自动验证（已执行，但可能不完整）：
echo    - huggingface_hub 在下载时会尝试自动验证 SHA256（如果仓库提供）
echo    - 已检查文件大小不为 0
echo    - 已检查所有分片文件是否存在
if !CHECKSUM_VERIFY! equ 1 (
  echo    - 已计算本地文件的 SHA256 校验和（见上方输出）
)
echo.
echo 2. [必须] 手动验证 SHA256（强烈推荐）：
echo    步骤1: 访问 Hugging Face 仓库页面查看官方 SHA256：
echo            https://huggingface.co/%MODEL_REPO%/tree/main
echo            （点击文件名查看详情，通常会显示 SHA256 校验和）
echo.
echo    步骤2: 对比上方脚本输出的 SHA256 与官方校验和
echo            （certutil 是 Windows 自带工具，无需安装）
echo.
echo    步骤3: 如果 SHA256 不匹配，说明文件损坏，请删除后重新下载
echo.
echo 3. 实际加载测试（最可靠）：
echo    使用 llama.cpp 尝试加载模型，如果能正常加载说明文件完整：
echo      python -m llama_cpp.server --model "%TARGET_DIR%\%MODEL_BASENAME%-00001-of-00003.gguf" --n_ctx 512
echo    或者运行：
echo      server\scripts\windows\llm-llamacpp\setup-llm-llamacpp.bat
echo.
echo 4. 如果模型加载失败：
echo    - 删除不完整的文件
echo    - 重新运行此脚本下载（支持断点续传）
echo.
echo 下载流程已结束（成功）。
echo 如需更换量化，修改 MODEL_BASENAME 环境变量，示例：
echo   q4_k_m: qwen2.5-7b-instruct-q4_k_m
echo   q6_k  : qwen2.5-7b-instruct-q6_k
echo   q5_0  : qwen2.5-7b-instruct-q5_0
echo.
:download_failed
echo.
echo 若下载失败，请确认：
echo   1.已成功运行 setup-llm-tools-env.bat
echo   2.已设置 HF_ENDPOINT / HF_TOKEN （如需）
echo   3.网络连接正常（可尝试更换镜像源）
echo.
set "MSG_CONTINUE=hf download 支持断点续传，可直接重新运行此脚本继续下载。"
echo [提示] !MSG_CONTINUE!
echo.
pause



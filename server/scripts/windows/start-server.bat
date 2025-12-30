@echo off
setlocal enabledelayedexpansion
REM Windows 版：启动 FastAPI 开发服务器
REM 使用 server-env 虚拟环境

REM 切换到 server 目录（脚本在 server\scripts\windows\ 下）
cd /d "%~dp0\..\.."

echo ========================================
echo 启动 SeeForMe 服务器 (Windows)
echo ========================================
echo.

REM 检查虚拟环境
if not exist "server-env\Scripts\python.exe" (
    echo ❌ 虚拟环境不存在
    echo 请先创建并安装依赖：
    echo   python -m venv server-env
    echo   server-env\Scripts\activate
    echo   pip install -r requirements.txt
    pause
    exit /b 1
)

REM 设置虚拟环境中的 Python 和 pip 路径（确保使用 server-env 环境）
set PYTHON_EXE=server-env\Scripts\python.exe
set PIP_EXE=server-env\Scripts\pip.exe
set UVICORN_EXE=server-env\Scripts\uvicorn.exe

REM 验证 Python 可执行文件存在
if not exist "%PYTHON_EXE%" (
    echo ❌ 虚拟环境中的 Python 可执行文件不存在
    pause
    exit /b 1
)

REM 简单依赖检查（使用虚拟环境中的 Python）
"%PYTHON_EXE%" -c "import fastapi, uvicorn" >nul 2>&1
if %errorlevel% neq 0 (
    echo ⚠️  依赖未安装，正在安装...
    "%PIP_EXE%" install -r requirements.txt
    if %errorlevel% neq 0 (
        echo ❌ 依赖安装失败
        pause
        exit /b 1
    )
)

REM 读取语言配置中的模式和本地 LLM base_url，用于在 qwen_local 模式下进行手动确认
set LANGUAGE_MODE=
set QWEN_LOCAL_BASE_URL=

REM 使用 Python 读取 app.core.config.settings 中的语言模式与 base_url
"%PYTHON_EXE%" -c "from app.core.config import settings; print(getattr(settings.language, 'MODE', '').lower()); print(getattr(settings.language, 'QWEN_BASE_URL', ''))" > tmp_lang_cfg.txt 2>nul

if exist tmp_lang_cfg.txt (
  for /f "usebackq tokens=1* delims=" %%a in (`type tmp_lang_cfg.txt`) do (
    if not defined LANGUAGE_MODE (
      set LANGUAGE_MODE=%%a
    ) else if not defined QWEN_LOCAL_BASE_URL (
      set QWEN_LOCAL_BASE_URL=%%a
    )
  )
  del tmp_lang_cfg.txt
)

REM 仅在 qwen_local 模式下提示用户确认本地 LLM 服务是否已启动；template / qwen_cloud 模式跳过
if /I "%LANGUAGE_MODE%"=="qwen_local" (
  echo.
  echo ========================================
  echo 检测到 language.mode = qwen_local
  echo 本地 LLM 服务地址: %QWEN_LOCAL_BASE_URL%
  echo 请先通过 scripts\windows\llm-llamacpp\setup-llm-llamacpp.bat 启动本地 LLM 服务。
  echo ========================================
  echo.
  set /P LLM_READY="是否已启动本地 LLM 服务？(Y/N，直接回车视为 Y): "
  REM 只在明确输入 N/n 时视为否，其余情况一律继续
  if /I "%LLM_READY:~0,1%"=="N" (
    echo.
    echo 已选择 N，取消启动 SeeForMe 服务器。
    pause
    goto :EOF
  )
)

REM 显示使用的 Python 路径（确认使用 server-env）
echo 使用虚拟环境: server-env
"%PYTHON_EXE%" --version
echo.

REM 获取本机 IP 地址（用于显示连接信息）
echo ========================================
echo 📡 网络连接信息
echo ========================================
echo.

REM 获取并分类所有 IPv4 地址
set IP_RECOMMENDED=
set IP_LAN_192=
set IP_LAN_10=
set IP_LAN_172=
set IP_PUBLIC=
set IP_OTHER=
set IP_COUNT=0

REM 收集所有非回环 IP 地址并分类
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /i "IPv4"') do (
    set "TEMP_IP=%%a"
    set "TEMP_IP=!TEMP_IP: =!"
    if not "!TEMP_IP!"=="" (
        REM 跳过所有 127.x.x.x 回环地址
        echo !TEMP_IP! | findstr /r "^127\." >nul
        if errorlevel 1 (
            set /a IP_COUNT+=1
            REM 检查是否是 192.168.x.x（最常见局域网IP）
            echo !TEMP_IP! | findstr /r "^192\.168\." >nul
            if not errorlevel 1 (
                if "!IP_LAN_192!"=="" set "IP_LAN_192=!TEMP_IP!"
            ) else (
                REM 检查是否是 10.x.x.x（企业局域网IP）
                echo !TEMP_IP! | findstr /r "^10\." >nul
                if not errorlevel 1 (
                    if "!IP_LAN_10!"=="" set "IP_LAN_10=!TEMP_IP!"
                ) else (
                    REM 检查是否是 172.16-31.x.x（私有IP范围）
                    echo !TEMP_IP! | findstr /r "^172\.1[6-9]\." >nul
                    if not errorlevel 1 (
                        if "!IP_LAN_172!"=="" set "IP_LAN_172=!TEMP_IP!"
                    ) else (
                        echo !TEMP_IP! | findstr /r "^172\.2[0-9]\." >nul
                        if not errorlevel 1 (
                            if "!IP_LAN_172!"=="" set "IP_LAN_172=!TEMP_IP!"
                        ) else (
                            echo !TEMP_IP! | findstr /r "^172\.3[01]\." >nul
                            if not errorlevel 1 (
                                if "!IP_LAN_172!"=="" set "IP_LAN_172=!TEMP_IP!"
                            ) else (
                                REM 检查是否是公网IP（不是私有IP范围）
                                REM 排除169.254.x.x（自动配置IP）和224.x.x.x-239.x.x.x（组播）
                                echo !TEMP_IP! | findstr /r "^169\.254\." >nul
                                if errorlevel 1 (
                                    if "!IP_PUBLIC!"=="" set "IP_PUBLIC=!TEMP_IP!"
                                ) else (
                                    if "!IP_OTHER!"=="" set "IP_OTHER=!TEMP_IP!"
                                )
                            )
                        )
                    )
                )
            )
        )
    )
)

REM 确定推荐的IP（优先级：192.168 > 10 > 172.16-31 > 公网 > 其他）
if not "!IP_LAN_192!"=="" (
    set "IP_RECOMMENDED=!IP_LAN_192!"
    set "IP_TYPE=局域网 (192.168.x.x，推荐)"
) else if not "!IP_LAN_10!"=="" (
    set "IP_RECOMMENDED=!IP_LAN_10!"
    set "IP_TYPE=局域网 (10.x.x.x)"
) else if not "!IP_LAN_172!"=="" (
    set "IP_RECOMMENDED=!IP_LAN_172!"
    set "IP_TYPE=局域网 (172.16-31.x.x)"
) else if not "!IP_PUBLIC!"=="" (
    set "IP_RECOMMENDED=!IP_PUBLIC!"
    set "IP_TYPE=公网/IPv4"
) else if not "!IP_OTHER!"=="" (
    set "IP_RECOMMENDED=!IP_OTHER!"
    set "IP_TYPE=其他"
)

REM 显示所有可用IP地址和推荐地址
if not "!IP_RECOMMENDED!"=="" (
    echo ✅ 推荐连接地址（!IP_TYPE!）:
    echo    IP: !IP_RECOMMENDED!
    echo    HTTP:  http://!IP_RECOMMENDED!:8000
    echo    WebSocket: ws://!IP_RECOMMENDED!:8000/ws
    echo.
    
    REM 如果有多个IP，显示所有可用IP
    if !IP_COUNT! gtr 1 (
        echo 📋 所有可用 IP 地址:
        if not "!IP_LAN_192!"=="" (
            echo    [局域网] 192.168.x.x: !IP_LAN_192! ^(推荐用于同一WiFi/热点^)
        )
        if not "!IP_LAN_10!"=="" (
            echo    [局域网] 10.x.x.x: !IP_LAN_10!
        )
        if not "!IP_LAN_172!"=="" (
            echo    [局域网] 172.16-31.x.x: !IP_LAN_172!
        )
        if not "!IP_PUBLIC!"=="" (
            echo    [公网/IP] !IP_PUBLIC! ^(可用于其他网络，需要配置路由/防火墙^)
        )
        if not "!IP_OTHER!"=="" (
            echo    [其他] !IP_OTHER!
        )
        echo.
        echo 💡 使用说明:
        echo    - 同一网络设备: 使用局域网 IP ^(192.168.x.x、10.x.x.x、172.16-31.x.x^)
        echo    - 其他网络设备: 
        echo      * 如果有公网IP，需要配置路由器端口转发(8000端口)
        echo      * 或使用内网穿透工具(如ngrok、frp等)
        echo      * 或使用VPN连接到同一网络
        echo.
    )
    
    echo ⚠️  连接提示:
    echo   1. 同一网络: 使用推荐的局域网 IP
    echo   2. 其他网络: 需要配置端口转发或使用内网穿透
    echo   3. 防火墙: 确保 Windows 防火墙允许端口 8000
    echo      运行脚本: scripts\windows\configure-firewall.bat
    echo.
    
    REM 检测是否为校园网环境（10.x.x.x 通常是校园网/企业网）
    if not "!IP_LAN_10!"=="" (
        echo ⚠️⚠️⚠️  校园网/企业网环境检测 ⚠️⚠️⚠️
        echo.
        echo 检测到您在使用校园网/企业网（10.x.x.x），如果无法连接，常见原因：
        echo.
        echo 1. 客户端隔离（Client Isolation）
        echo    校园网通常启用了客户端隔离功能，阻止设备之间直接通信
        echo    解决方案：
        echo    ✅ 使用内网穿透工具（推荐）：
        echo       - ngrok: https://ngrok.com （最简单，有免费版）
        echo       - frp: https://github.com/fatedier/frp （需要自建服务器）
        echo       - 其他内网穿透服务
        echo.
        echo    ✅ 使用手机热点（临时方案）：
        echo       - 服务器和客户端都连接到手机热点
        echo       - 这样可以绕过校园网的客户端隔离
        echo.
        echo    ❓ 联系网络管理员（通常无效）：
        echo       - 请求关闭客户端隔离（通常不会被批准）
        echo       - 或申请端口开放（需要审批，过程较长）
        echo.
        echo 2. 防火墙阻止
        echo    确保 Windows 防火墙允许端口 8000
        echo    运行: scripts\windows\configure-firewall.bat
        echo.
        echo 3. 验证服务器是否正常启动
        echo    在服务器本机浏览器访问: http://127.0.0.1:8000/api/v1/health
        echo    如果本机能访问但其他设备不能，很可能是客户端隔离问题
        echo.
        echo 💡 推荐解决方案：使用 ngrok 内网穿透
        echo   快速启动：运行脚本 scripts\windows\setup-ngrok-tunnel.bat
        echo   或手动配置：
        echo   1. 下载 ngrok: https://ngrok.com/download
        echo   2. 注册账号获取 authtoken: https://dashboard.ngrok.com/get-started/your-authtoken
        echo   3. 配置: ngrok config add-authtoken ^<your-token^>
        echo   4. 启动: ngrok http 8000
        echo   5. 使用 ngrok 提供的公网地址连接客户端
        echo.
    )
) else (
    echo ⚠️  未检测到有效的网络 IP 地址
    echo   使用本地回环地址: http://127.0.0.1:8000
    echo   注意: 其他设备无法通过此地址连接
    echo   请检查网络连接或使用 ipconfig 查看本机 IP
    echo.
)

REM 设置推荐IP为默认连接地址（用于后续显示）
if not "!IP_RECOMMENDED!"=="" (
    set "IP_ADDR=!IP_RECOMMENDED!"
)
echo ========================================
echo.

echo ========================================
echo 提示：如果在启动日志中看到「模型导出 / ONNX 兼容性相关错误」，例如：
echo   - 与「ONNX 转换、图分解、节点类型」相关的异常；
echo   - 与「模型算子不支持或版本不匹配」相关的异常；
echo 通常是 PyTorch / ONNX / Ultralytics 等依赖版本不兼容导致，而不是本项目的业务代码错误。
echo 简要处理思路：
echo   1.优先直接使用已准备好的 models\yolov8n.onnx（按说明下载或本地已有的经过验证版本）；
echo   2.不要在启动脚本中自动重新导出 ONNX 模型；
echo   3.如需在新环境重导出，可单独写测试脚本，并视情况：
echo      - 固定或回退 PyTorch / Ultralytics 版本；
echo      - 或在配置中将 vision.yolo.use_onnx 设为 false，暂时使用 PyTorch 模式。
echo ========================================
echo.

set LOG_LEVEL=debug

REM 使用虚拟环境中的 uvicorn 启动服务器
if exist "%UVICORN_EXE%" (
    "%UVICORN_EXE%" app.main:app --host 0.0.0.0 --port 8000 --reload --log-level %LOG_LEVEL%
) else (
    REM 如果 uvicorn 不在 Scripts 目录，使用 python -m uvicorn
    "%PYTHON_EXE%" -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload --log-level %LOG_LEVEL%
)


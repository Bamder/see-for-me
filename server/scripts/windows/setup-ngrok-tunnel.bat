@echo off
setlocal enabledelayedexpansion
REM ngrok 内网穿透配置脚本
REM 用于在校园网等有客户端隔离的环境中建立连接隧道

echo ========================================
echo ngrok 内网穿透配置工具
echo ========================================
echo.
echo 此工具用于在校园网/企业网等环境中建立内网穿透隧道
echo 解决客户端隔离导致的连接问题
echo.

REM 检查 ngrok 是否已安装
where ngrok >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ 未检测到 ngrok
    echo.
    echo 请先安装 ngrok:
    echo 1. 下载: https://ngrok.com/download
    echo 2. 解压到任意目录（建议添加到系统 PATH 环境变量）
    echo 3. 注册账号: https://dashboard.ngrok.com/signup
    echo 4. 获取 authtoken: https://dashboard.ngrok.com/get-started/your-authtoken
    echo 5. 运行: ngrok config add-authtoken ^<your-token^>
    echo.
    echo 或者将 ngrok.exe 放到此脚本同目录下
    echo.
    
    REM 检查当前目录是否有 ngrok.exe
    if exist "%~dp0ngrok.exe" (
        set "NGROK_EXE=%~dp0ngrok.exe"
        echo ✅ 在当前目录找到 ngrok.exe
        echo.
    ) else (
        pause
        exit /b 1
    )
) else (
    set "NGROK_EXE=ngrok"
    echo ✅ 已检测到 ngrok
    echo.
)

REM 检查是否已配置 authtoken
"%NGROK_EXE%" config check >nul 2>&1
if %errorlevel% neq 0 (
    echo ⚠️  ngrok 未配置 authtoken
    echo.
    echo 请先配置 authtoken:
    echo 1. 访问: https://dashboard.ngrok.com/get-started/your-authtoken
    echo 2. 复制您的 authtoken
    echo 3. 运行: ngrok config add-authtoken ^<your-token^>
    echo.
    set /P CONFIGURE_NOW="是否现在配置 authtoken? (Y/N): "
    if /I "!CONFIGURE_NOW:~0,1!"=="Y" (
        echo.
        set /P AUTHTOKEN="请输入您的 ngrok authtoken: "
        if not "!AUTHTOKEN!"=="" (
            echo.
            echo 正在配置 authtoken...
            "%NGROK_EXE%" config add-authtoken !AUTHTOKEN!
            REM 等待一下让配置生效，然后验证配置是否成功
            timeout /t 1 /nobreak >nul
            "%NGROK_EXE%" config check >nul 2>&1
            if !errorlevel! equ 0 (
                echo ✅ authtoken 配置成功
                echo.
                echo 💡 提示: ngrok 免费版还需要请求一个 dev domain
                echo   访问: https://dashboard.ngrok.com/domains
                echo   点击 "Request Domain" 获取免费的 dev domain
                echo.
            ) else (
                echo ⚠️  验证配置时出现问题，但 authtoken 可能已成功保存
                echo 请手动运行以下命令验证配置:
                echo   %NGROK_EXE% config check
                echo.
                echo 如果看到配置正确，您可以继续使用
                echo 如果配置有问题，请检查 authtoken 是否正确
                echo.
                REM 即使验证失败，也允许继续执行（因为配置可能已经成功）
                echo 继续执行中...
                echo.
            )
        ) else (
            echo ❌ authtoken 不能为空
            pause
            exit /b 1
        )
    ) else (
        pause
        exit /b 1
    )
    echo.
)

REM 设置本地端口（默认 8000，可通过环境变量覆盖）
set LOCAL_PORT=%1
if "%LOCAL_PORT%"=="" set LOCAL_PORT=8000

echo ========================================
echo 启动 ngrok 隧道
echo ========================================
echo.
echo 本地端口: %LOCAL_PORT%
echo 目标服务: http://localhost:%LOCAL_PORT%
echo.
echo ⚠️  如果遇到 ERR_NGROK_15013 错误:
echo    ngrok 免费版需要先在 dashboard 请求一个 dev domain
echo    解决步骤:
echo    1. 访问: https://dashboard.ngrok.com/domains
echo    2. 点击 "Request Domain" 按钮
echo    3. 选择一个免费的 dev domain（例如: xxx.ngrok-free.app）
echo    4. 请求成功后，重新运行此脚本
echo.
echo 📋 如何查看公网 URL:
echo.
echo 方法 1: 查看终端输出（推荐）
echo   - 启动后，ngrok 会在终端显示 "Forwarding" 行
echo   - 例如: Forwarding  https://xxxx-xx-xx-xx-xx.ngrok.io -^> http://localhost:%LOCAL_PORT%
echo   - 这就是您的公网 URL，复制这个地址给客户端使用
echo.
echo 方法 2: 访问本地 Web 界面
echo   - 在浏览器中打开: http://127.0.0.1:4040
echo   - 这是 ngrok 的本地管理界面
echo   - 可以查看公网 URL、请求日志等信息
echo.
echo ⚠️  重要提示:
echo   - 免费版 ngrok URL 每次启动都会变化
echo   - 如果需要固定域名，请升级到付费版
echo   - 按 Ctrl+C 停止隧道
echo.
echo 客户端配置:
echo   - HTTP:  将公网 URL 中的 https://xxxx.ngrok.io 配置到客户端
echo   - WebSocket: 将 https:// 改为 wss:// 使用 WebSocket 连接
echo    例如: wss://xxxx.ngrok.io/ws
echo.
echo 按任意键启动 ngrok 隧道...
pause >nul

echo.
echo ========================================
echo 正在启动 ngrok 隧道...
echo ========================================
echo.
echo 📌 启动后，您可以通过以下方式查看公网 URL:
echo.
echo 1️⃣  查看终端输出
echo    - 查找 "Forwarding" 行，例如:
echo      Forwarding  https://xxxx.ngrok.io -^> http://localhost:%LOCAL_PORT%
echo    - 这就是您的公网 URL
echo.
echo 2️⃣  访问 Web 管理界面（推荐）
echo    - 在浏览器打开: http://127.0.0.1:4040
echo    - 可以看到公网 URL 和请求日志
echo    - 启动后会自动打开此页面
echo.
echo 3️⃣  使用 PowerShell 命令（可选）
echo    - 在另一个终端运行:
echo      powershell -Command "(Invoke-RestMethod http://127.0.0.1:4040/api/tunnels).tunnels[0].public_url"
echo.
echo ========================================
echo.
echo ⚠️  提示: ngrok 启动后，会在 3 秒后自动打开 Web 管理界面
echo   您也可以在终端中直接查看 "Forwarding" 行获取 URL
echo.
timeout /t 2 /nobreak >nul

REM 在新窗口启动 ngrok，这样用户可以看到实时输出
echo 正在启动 ngrok 隧道...
start "ngrok-tunnel" cmd /k "echo 如果看到错误 ERR_NGROK_15013，请参考下面的解决方案 && "%NGROK_EXE%" http %LOCAL_PORT%"

REM 等待 ngrok 启动
timeout /t 3 /nobreak >nul

REM 尝试从 ngrok API 获取公网 URL 并显示
echo.
echo ========================================
echo 正在获取公网 URL...
echo ========================================
echo.
powershell -Command "try { $response = Invoke-RestMethod -Uri 'http://127.0.0.1:4040/api/tunnels' -Method Get -TimeoutSec 3 -ErrorAction Stop; $httpsTunnel = $response.tunnels | Where-Object { $_.proto -eq 'https' } | Select-Object -First 1; $httpTunnel = $response.tunnels | Where-Object { $_.proto -eq 'http' } | Select-Object -First 1; if ($httpsTunnel) { $publicUrl = $httpsTunnel.public_url; $wsUrl = $publicUrl -replace 'https://', 'wss://'; Write-Host '✅ 公网 URL 已获取:'; Write-Host ''; Write-Host '📱 客户端配置（复制到移动应用设置界面）:'; Write-Host ''; Write-Host '   HTTP 服务器地址:'; Write-Host '   ' $publicUrl; Write-Host ''; Write-Host '   WebSocket 地址:'; Write-Host '   ' $wsUrl '/ws'; Write-Host ''; Write-Host '💡 配置步骤:'; Write-Host '   1. 打开移动应用的"设置"界面'; Write-Host '   2. 在"HTTP 服务器地址"中输入: ' $publicUrl; Write-Host '   3. 在"WebSocket 地址"中输入: ' $wsUrl '/ws'; Write-Host '   4. 点击输入框外部，配置会自动保存并生效'; Write-Host '' } elseif ($httpTunnel) { $publicUrl = $httpTunnel.public_url; $wsUrl = $publicUrl -replace 'http://', 'ws://'; Write-Host '✅ 公网 URL 已获取 (HTTP):'; Write-Host ''; Write-Host '📱 客户端配置（复制到移动应用设置界面）:'; Write-Host ''; Write-Host '   HTTP 服务器地址:'; Write-Host '   ' $publicUrl; Write-Host ''; Write-Host '   WebSocket 地址:'; Write-Host '   ' $wsUrl '/ws'; Write-Host ''; Write-Host '💡 配置步骤:'; Write-Host '   1. 打开移动应用的"设置"界面'; Write-Host '   2. 在"HTTP 服务器地址"中输入: ' $publicUrl; Write-Host '   3. 在"WebSocket 地址"中输入: ' $wsUrl '/ws'; Write-Host '   4. 点击输入框外部，配置会自动保存并生效'; Write-Host '' } else { Write-Host '⚠️  未找到可用的隧道，请查看 ngrok 窗口的输出' } } catch { Write-Host '⚠️  无法自动获取 URL' Write-Host '   请查看 ngrok 窗口中的 "Forwarding" 行' Write-Host '   或访问: http://127.0.0.1:4040' Write-Host ''; Write-Host '📝 手动配置说明:'; Write-Host '   如果 ngrok 显示: Forwarding https://xxxx.ngrok.io -> http://localhost:8000'; Write-Host '   则客户端配置为:'; Write-Host '   HTTP: https://xxxx.ngrok.io'; Write-Host '   WebSocket: wss://xxxx.ngrok.io/ws' }"

echo.
echo ========================================
echo 正在打开 Web 管理界面...
echo ========================================
echo.
start http://127.0.0.1:4040

echo.
echo ✅ ngrok 隧道已启动
echo.
echo ========================================
echo 📱 客户端配置指南
echo ========================================
echo.
echo 公网 URL 已显示在上面的 PowerShell 输出中
echo 如果看不到，也可以通过以下方式获取:
echo   - 在浏览器中查看: http://127.0.0.1:4040
echo   - 在 ngrok 窗口查看 "Forwarding" 行
echo.
echo 🔧 在移动应用中配置:
echo   1. 打开应用的"设置"界面
echo   2. 找到"服务器配置"部分
echo   3. 在"HTTP 服务器地址"中填入上面的 HTTP URL
echo      （例如: https://xxxx.ngrok.io）
echo   4. 在"WebSocket 地址"中填入上面的 WebSocket URL
echo      （例如: wss://xxxx.ngrok.io/ws）
echo      ⚠️  注意: 使用 wss:// 而不是 ws://
echo   5. 点击输入框外部，配置会自动保存并生效
echo.
echo 💡 示例:
echo   如果 ngrok URL 是: https://abcd1234.ngrok-free.app
echo   则配置为:
echo   HTTP:        https://abcd1234.ngrok-free.app
echo   WebSocket:   wss://abcd1234.ngrok-free.app/ws
echo.
echo 🛑 要停止隧道:
echo   - 关闭 "ngrok-tunnel" 窗口
echo   - 或在 ngrok 窗口中按 Ctrl+C
echo.
pause

pause


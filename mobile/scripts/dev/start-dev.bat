@echo off
setlocal enabledelayedexpansion
REM 真机调试启动脚本（Windows）
REM 要求手动配置 IP 地址

echo ========================================
echo 真机调试启动脚本
echo ========================================
echo.

REM 切换到项目根目录（mobile）
cd /d "%~dp0\..\.."

REM 检测所有有网关的 IP 地址
echo [步骤 1] 正在检测可用的网络接口（有默认网关的接口）...
echo.

REM 使用 route print 获取有默认网关的接口 IP（更可靠）
set INTERFACE_COUNT=0

REM 获取所有 IPv4 地址
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do (
    set IP_ADDR=%%a
    set IP_ADDR=!IP_ADDR: =!
    
    REM 跳过无效 IP
    if not "!IP_ADDR!"=="" (
        if not "!IP_ADDR!"=="127.0.0.1" (
            REM 检查是否有默认网关（通过 route print）
            route print 0.0.0.0 | findstr "!IP_ADDR!" >nul
            if !errorlevel! equ 0 (
                REM 检查是否已存在
                set IP_EXISTS=0
                for /l %%i in (1,1,!INTERFACE_COUNT!) do (
                    call set EXISTING_IP=%%IP_%%i%%
                    if "!EXISTING_IP!"=="!IP_ADDR!" (
                        set IP_EXISTS=1
                    )
                )
                if !IP_EXISTS! equ 0 (
                    set /a INTERFACE_COUNT+=1
                    set IP_!INTERFACE_COUNT!=!IP_ADDR!
                )
            )
        )
    )
)

REM 如果没找到，使用所有非回环的 IP 作为备用
if !INTERFACE_COUNT! equ 0 (
    echo 使用备用方法检测 IP 地址...
    for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do (
        set IP_ADDR=%%a
        set IP_ADDR=!IP_ADDR: =!
        if not "!IP_ADDR!"=="" (
            if not "!IP_ADDR!"=="127.0.0.1" (
                REM 跳过常见的虚拟机 IP 段
                echo !IP_ADDR! | findstr /c:"192.168.56" >nul
                if !errorlevel! neq 0 (
                    echo !IP_ADDR! | findstr /c:"192.168.159" >nul
                    if !errorlevel! neq 0 (
                        echo !IP_ADDR! | findstr /c:"192.168.171" >nul
                        if !errorlevel! neq 0 (
                            set /a INTERFACE_COUNT+=1
                            set IP_!INTERFACE_COUNT!=!IP_ADDR!
                        )
                    )
                )
            )
        )
    )
)

REM 显示可用的 IP 地址
if !INTERFACE_COUNT! equ 0 (
    echo ⚠️  未检测到可用的网络接口
    echo.
    echo 请手动输入 IP 地址：
    set /p MANUAL_IP="请输入 IP 地址: "
    set SELECTED_IP=!MANUAL_IP!
) else (
    echo 检测到 !INTERFACE_COUNT! 个可用的网络接口：
    echo.
    for /l %%i in (1,1,!INTERFACE_COUNT!) do (
        call echo   [%%i] %%IP_%%i%%
    )
    echo.
    echo 请选择要使用的 IP 地址：
    echo   输入数字 1-!INTERFACE_COUNT! 选择对应的 IP
    echo   或直接输入自定义 IP 地址
    echo.
    set /p USER_CHOICE="请输入选择 (1-!INTERFACE_COUNT!) 或自定义 IP: "
    
    REM 验证输入
    set SELECTED_IP=
    for /l %%i in (1,1,!INTERFACE_COUNT!) do (
        if "!USER_CHOICE!"=="%%i" (
            call set SELECTED_IP=%%IP_%%i%%
        )
    )
    
    REM 如果用户输入的是自定义 IP
    if "!SELECTED_IP!"=="" (
        set SELECTED_IP=!USER_CHOICE!
    )
)

REM 简单验证 IP 格式（检查是否包含点号）
echo !SELECTED_IP! | findstr /c:"." >nul
if errorlevel 1 (
    echo.
    echo ❌ 无效的 IP 地址格式: !SELECTED_IP!
    echo 请重新运行脚本并输入正确的 IP 地址（格式：xxx.xxx.xxx.xxx）
    pause
    exit /b 1
)

REM 检查是否为空
if "!SELECTED_IP!"=="" (
    echo.
    echo ❌ IP 地址不能为空
    pause
    exit /b 1
)

echo.
echo ========================================
echo 已选择 IP 地址: !SELECTED_IP!
echo ========================================
echo.

REM 设置环境变量
set EXPO_PUBLIC_SERVER_URL=http://!SELECTED_IP!:8000
set EXPO_PUBLIC_WS_URL=ws://!SELECTED_IP!:8000/ws

echo 服务器配置：
echo   服务器地址: !EXPO_PUBLIC_SERVER_URL!
echo   WebSocket地址: !EXPO_PUBLIC_WS_URL!
echo.
echo ⚠️  连接提示：
echo    1. 确保手机和电脑在同一网络（WiFi 或手机热点）
echo    2. 如果使用手机热点，确保电脑已连接到热点
echo    3. 如果使用 WiFi，确保手机和电脑在同一 WiFi
echo    4. 确保后端服务器正在运行（端口 8000）
echo    5. 确保防火墙允许端口 8000 和 8081
echo.
echo 📱 手动输入URL格式说明：
echo    开发服务器启动后，终端会显示连接URL
echo    如果需要在手机上手动输入，请使用以下格式：
echo    ✅ 正确：exp://!SELECTED_IP!:8081
echo    ❌ 错误：http://!SELECTED_IP!:8081
echo    ❌ 错误：!SELECTED_IP!:8081
echo    ❌ 错误：localhost:8081
echo.
echo    注意：端口号是 8081（不是 8000）
echo    如果连接失败，请查看：mobile\手动输入URL错误解决.md
echo.
echo 按任意键启动开发服务器...
pause >nul

REM 启动开发服务器（开发构建模式）
REM 使用 --lan 确保监听所有网络接口，让手机可以发现开发服务器
REM 增加 Node.js 内存限制以避免大型文件打包时的内存溢出错误
set NODE_OPTIONS=--max-old-space-size=4096
npx expo start --dev-client --lan --clear

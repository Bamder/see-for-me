@echo off
REM 真机调试启动脚本（Tunnel 模式 - 推荐用于解决连接问题）
REM Tunnel 模式通过 Expo 服务器中转，无需配置 IP，自动穿透防火墙

echo ========================================
echo 真机调试启动脚本（Tunnel 模式）
echo ========================================
echo.
echo Tunnel 模式说明：
echo - 通过 Expo 服务器中转连接
echo - 无需配置 IP 地址
echo - 自动穿透防火墙
echo - 适合移动网络或网络受限环境
echo.
echo 注意：需要稳定的互联网连接
echo.

REM 切换到项目根目录（mobile）
cd /d "%~dp0\..\.."

REM 设置环境变量（如果需要后端服务器）
REM 注意：Tunnel 模式主要用于 Expo 开发服务器连接
REM 后端服务器地址仍需要配置（如果使用）
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do (
    set IP=%%a
    goto :found
)
:found
set IP=%IP:~1%
if not "%IP%"=="" (
    set EXPO_PUBLIC_SERVER_URL=http://%IP%:8000
    set EXPO_PUBLIC_WS_URL=ws://%IP%:8000/ws
    echo 后端服务器地址: %EXPO_PUBLIC_SERVER_URL%
    echo WebSocket地址: %EXPO_PUBLIC_WS_URL%
    echo.
)

echo 按任意键启动开发服务器（Tunnel 模式）...
pause >nul

REM 启动开发服务器（Tunnel 模式）
npx expo start --dev-client --tunnel

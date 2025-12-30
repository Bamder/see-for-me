@echo off
REM 跳转到 Windows 版启动脚本
cd /d "%~dp0"
if exist "scripts\\windows\\start-server.bat" (
  call scripts\\windows\\start-server.bat
) else (
  echo 未找到 scripts\\windows\\start-server.bat
  pause
)

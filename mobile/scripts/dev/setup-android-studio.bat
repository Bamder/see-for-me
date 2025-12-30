@echo off
REM 检查和配置 Android Studio 环境

echo ========================================
echo Android Studio 环境检查
echo ========================================
echo.

REM 切换到项目根目录（mobile）
cd /d "%~dp0\..\.."

echo [检查 1] Android SDK 路径...
if defined ANDROID_HOME (
    echo ✅ ANDROID_HOME: %ANDROID_HOME%
) else (
    echo ❌ ANDROID_HOME 未设置
    echo.
    echo 常见路径：
    echo   C:\Users\%USERNAME%\AppData\Local\Android\Sdk
    echo   C:\Android\Sdk
    echo.
    echo 请手动设置环境变量，或运行以下命令（临时）：
    echo   set ANDROID_HOME=C:\Users\%USERNAME%\AppData\Local\Android\Sdk
    echo.
)

echo.
echo [检查 2] ADB 工具...
if exist "%ANDROID_HOME%\platform-tools\adb.exe" (
    echo ✅ ADB 已找到
    "%ANDROID_HOME%\platform-tools\adb.exe" version
) else (
    echo ❌ ADB 未找到
    echo    请检查 Android SDK 是否正确安装
)

echo.
echo [检查 3] Java 版本...
java -version >nul 2>&1
if %errorlevel% == 0 (
    echo ✅ Java 已安装
    java -version
) else (
    echo ❌ Java 未找到
    echo    需要 Java JDK 17 或更高版本
)

echo.
echo [检查 4] 连接设备...
"%ANDROID_HOME%\platform-tools\adb.exe" devices 2>nul
if %errorlevel% == 0 (
    echo.
    echo ✅ ADB 可以访问设备
) else (
    echo.
    echo ⚠️  无法访问设备
    echo    请确保：
    echo    1. 手机已连接 USB
    echo    2. 已启用 USB 调试
    echo    3. 已授权电脑调试
)

echo.
echo ========================================
echo 配置建议
echo ========================================
echo.
echo 如果环境变量未设置，可以：
echo.
echo 1. 临时设置（当前会话有效）：
echo    set ANDROID_HOME=C:\Users\%USERNAME%\AppData\Local\Android\Sdk
echo    set PATH=%PATH%;%ANDROID_HOME%\platform-tools
echo.
echo 2. 永久设置：
echo    - 右键"此电脑" → 属性 → 高级系统设置 → 环境变量
echo    - 新建系统变量 ANDROID_HOME
echo    - 编辑 Path，添加 %%ANDROID_HOME%%\platform-tools
echo.
pause


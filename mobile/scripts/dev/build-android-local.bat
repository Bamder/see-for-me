@echo off
setlocal enabledelayedexpansion
REM 使用 Android Studio 本地构建并安装到设备
REM 自动处理 TTS 音频播放依赖（react-native-sound）

echo ========================================
echo Android 本地构建脚本
echo ========================================
echo.

REM 切换到项目根目录（mobile）
cd /d "%~dp0\..\.."

echo [步骤 1] 检查环境...
if not defined ANDROID_HOME (
    echo ❌ ANDROID_HOME 未设置
    echo.
    echo 请先运行: scripts\dev\setup-android-studio.bat
    echo 或手动设置环境变量
    pause
    exit /b 1
)

echo ✅ 环境检查通过
echo.

echo [步骤 2] 检查设备连接...
"%ANDROID_HOME%\platform-tools\adb.exe" devices >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ 无法访问 ADB
    echo    请检查 Android SDK 是否正确安装
    pause
    exit /b 1
)

echo ✅ ADB 可用
echo.

echo [步骤 3] 检查 TTS 音频播放依赖...
call npm list react-native-sound >nul 2>&1
if !errorlevel! neq 0 (
    echo ⚠️  react-native-sound 未安装，正在安装...
    call npm install react-native-sound
    REM 验证安装是否成功（通过检查 package.json 或再次运行 npm list）
    call npm list react-native-sound >nul 2>&1
    if !errorlevel! neq 0 (
        echo ❌ 安装 react-native-sound 失败，请检查错误信息
        pause
        exit /b 1
    )
    echo ✅ react-native-sound 安装完成
) else (
    echo ✅ react-native-sound 已安装
)
echo.

echo [步骤 4] 检查是否已生成原生项目...
if not exist "android" (
    echo ⚠️  原生项目不存在，正在生成...
    echo.
    echo 这将创建 android/ 目录并链接所有原生模块（包括 onnxruntime-react-native 和 react-native-sound）
    echo.
    pause
    
    npx expo prebuild --platform android --clean
    if %errorlevel% neq 0 (
        echo ❌ 生成原生项目失败
        pause
        exit /b 1
    )
    echo ✅ 原生项目已生成
) else (
    echo ✅ 原生项目已存在
    echo.
    echo ⚠️  注意：如果刚刚安装了 react-native-sound，建议重新生成原生项目以链接新模块
    set /p REGEN="是否重新生成原生项目以链接 react-native-sound? (Y/N): "
    if /i "!REGEN!"=="Y" (
        echo.
        echo 正在重新生成原生项目...
        npx expo prebuild --platform android --clean
        if %errorlevel% neq 0 (
            echo ❌ 重新生成失败
            pause
            exit /b 1
        )
        echo ✅ 原生项目已重新生成
    )
)

echo.
echo ========================================
echo [步骤 5] 构建并安装到设备
echo ========================================
echo.

REM 再次检查设备连接
echo 正在检查设备连接状态...
"%ANDROID_HOME%\platform-tools\adb.exe" devices | findstr /C:"device" >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ 未检测到已连接的设备
    echo.
    echo 请确保：
    echo    - 手机已通过 USB 连接
    echo    - 已启用 USB 调试
    echo    - 已授权电脑调试（手机上会弹出授权提示）
    echo.
    echo 检查设备连接：
    "%ANDROID_HOME%\platform-tools\adb.exe" devices
    echo.
    pause
    exit /b 1
)

echo ✅ 设备已连接
echo.

REM 检查是否已安装旧版本应用
echo 正在检查是否已安装旧版本应用...
"%ANDROID_HOME%\platform-tools\adb.exe" shell pm list packages | findstr /C:"com.bamderl.mobile" >nul 2>&1
if %errorlevel% == 0 (
    echo ⚠️  检测到设备上已安装旧版本应用
    echo.
    echo 正在卸载旧版本以安装新版本...
    "%ANDROID_HOME%\platform-tools\adb.exe" uninstall com.bamderl.mobile
    if %errorlevel% == 0 (
        echo ✅ 旧版本已卸载
    ) else (
        echo ⚠️  卸载失败（可能应用已被手动卸载或签名不同）
        echo    继续尝试安装新版本...
    )
    echo.
)

echo ⚠️  准备开始构建和安装...
echo    这可能需要几分钟时间，请耐心等待
echo.
pause

echo.
echo 正在构建并安装到设备...
echo.
echo ⚠️  提示：构建过程可能需要 5-10 分钟，请耐心等待
echo    如果长时间没有输出，请检查：
echo    1. Gradle 是否正在下载依赖（首次构建较慢）
echo    2. 网络连接是否正常
echo    3. 查看下方是否有错误信息
echo.

REM 执行构建命令（不使用 --no-build-cache，避免首次构建过慢）
echo 执行命令: npx expo run:android --device
echo.
echo ⚠️  重要提示：
echo    - 首次构建需要下载 Gradle 依赖，可能需要 5-10 分钟
echo    - 如果看到 "Downloading..." 或 "Building..." 说明正在工作，请耐心等待
echo    - 如果超过 15 分钟仍无反应，请按 Ctrl+C 中断，然后查看错误信息
echo.
echo 开始构建...
echo.
echo 提示：如果构建过程卡住或没有输出，可以：
echo   1. 按 Ctrl+C 中断
echo   2. 尝试使用 Gradle 直接构建（见下方说明）
echo   3. 或使用 Android Studio 打开 android 目录
echo.

REM 执行构建命令
REM 增加 Node.js 内存限制以避免大型文件打包时的内存溢出错误
set NODE_OPTIONS=--max-old-space-size=4096
REM 设置 NODE_ENV 以避免构建时的警告（expo-constants 需要）
set NODE_ENV=development
echo 执行: npx expo run:android --device
npx expo run:android --device
set BUILD_RESULT=!errorlevel!

REM 检查构建结果和 APK 文件
echo.
echo 检查构建结果...
if exist "android\app\build\outputs\apk\debug\app-debug.apk" (
    echo ✅ APK 文件已生成
    echo.
    echo 检查应用是否已安装到设备...
    "%ANDROID_HOME%\platform-tools\adb.exe" shell pm list packages | findstr /C:"com.bamderl.mobile" >nul 2>&1
    if !errorlevel! neq 0 (
        echo ⚠️  应用未自动安装，尝试手动安装...
        "%ANDROID_HOME%\platform-tools\adb.exe" install -r "android\app\build\outputs\apk\debug\app-debug.apk"
        if !errorlevel! == 0 (
            echo ✅ 应用已手动安装到设备
            set BUILD_RESULT=0
        ) else (
            echo ❌ 手动安装失败
            echo    APK 位置: android\app\build\outputs\apk\debug\app-debug.apk
            echo    你可以手动安装: adb install -r android\app\build\outputs\apk\debug\app-debug.apk
        )
    ) else (
        echo ✅ 应用已安装到设备
    )
) else (
    echo ❌ APK 文件未生成
    echo.
    echo 可能的原因：
    echo 1. 构建过程被中断
    echo 2. Gradle 构建失败（查看上方错误信息）
    echo 3. 构建命令未正确执行
    echo.
    echo 建议：
    echo 1. 检查上方是否有错误信息
    echo 2. 尝试手动构建: cd android ^&^& gradlew assembleDebug
    echo 3. 或使用 Android Studio 打开 android 目录进行构建
)

if !BUILD_RESULT! == 0 (
    echo.
    echo ========================================
    echo ✅ 构建并安装成功！
    echo ========================================
    echo.
    echo 下一步：
    echo 1. 应用已自动安装到手机
    echo 2. 启动开发服务器：scripts\dev\start-dev.bat
    echo 3. 应用会自动连接到开发服务器
    echo.
) else (
    echo.
    echo ========================================
    echo ❌ 构建失败
    echo ========================================
    echo.
    echo 常见问题：
    echo 1. 设备未连接或未授权
    echo 2. Gradle 构建错误（查看上方错误信息）
    echo 3. 依赖版本冲突
    echo.
    echo 排查步骤：
    echo 1. 运行: scripts\dev\setup-android-studio.bat
    echo 2. 检查设备: adb devices
    echo 3. 查看详细错误信息
    echo.
)

pause


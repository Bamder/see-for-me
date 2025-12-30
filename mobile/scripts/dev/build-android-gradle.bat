@echo off
setlocal enabledelayedexpansion
REM 使用 Gradle 直接构建 Android APK（推荐方案）
REM 比 npx expo run:android --device 更可靠，总是会重新构建

echo ========================================
echo Android Gradle 直接构建脚本（推荐）
echo ========================================
echo.

REM 切换到项目根目录（mobile）
cd /d "%~dp0\..\.."

echo [步骤 1] 检查环境...
if not defined ANDROID_HOME (
    echo ❌ ANDROID_HOME 未设置
    pause
    exit /b 1
)

if not exist "android" (
    echo ❌ android 目录不存在
    echo    请先运行: npx expo prebuild --platform android
    pause
    exit /b 1
)

echo ✅ 环境检查通过
echo.

echo [步骤 2] 确保 assets 已复制到 Android 项目...
REM 创建 assets 目录
if not exist "android\app\src\main\assets" (
    echo 正在创建 assets 目录...
    mkdir "android\app\src\main\assets"
)

REM 检查模型文件是否存在
if not exist "assets\tts-models\paddlespeech-lite" (
    echo ❌ 源 assets 目录不存在: assets\tts-models\paddlespeech-lite
    echo    请确保模型文件存在于 mobile\assets\tts-models\paddlespeech-lite\
    pause
    exit /b 1
)

REM 复制 assets 文件到 Android 项目
echo 正在复制 assets 文件...
if not exist "android\app\src\main\assets\tts-models" (
    echo   复制 tts-models 目录...
    xcopy /E /I /Y "assets\tts-models" "android\app\src\main\assets\tts-models" >nul 2>&1
    if !errorlevel! == 0 (
        echo   ✅ tts-models 已复制
    ) else (
        echo   ⚠️  xcopy 失败，尝试使用 robocopy...
        robocopy /E /NFL /NDL /NJH /NJS "assets\tts-models" "android\app\src\main\assets\tts-models" >nul 2>&1
        if !errorlevel! LSS 8 (
            echo   ✅ tts-models 已复制（robocopy）
        ) else (
            echo   ❌ 复制失败，错误代码: !errorlevel!
            pause
            exit /b 1
        )
    )
) else (
    echo   ✅ tts-models 目录已存在，跳过复制
)

REM 验证关键文件是否存在
if exist "android\app\src\main\assets\tts-models\paddlespeech-lite\frontend\model.onnx" (
    echo   ✅ 前端模型文件已就绪
) else (
    echo   ⚠️  警告：前端模型文件未找到
)

if exist "android\app\src\main\assets\tts-models\paddlespeech-lite\acoustic\model.onnx" (
    echo   ✅ 声学模型文件已就绪
) else (
    echo   ⚠️  警告：声学模型文件未找到
)

if exist "android\app\src\main\assets\tts-models\paddlespeech-lite\vocoder\model.onnx" (
    echo   ✅ 声码器模型文件已就绪
) else (
    echo   ⚠️  警告：声码器模型文件未找到
)

echo ✅ assets 准备完成
echo.

echo [步骤 3] 检查设备连接...
"%ANDROID_HOME%\platform-tools\adb.exe" devices | findstr /C:"device" >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ 未检测到已连接的设备
    "%ANDROID_HOME%\platform-tools\adb.exe" devices
    pause
    exit /b 1
)

echo ✅ 设备已连接
echo.

echo [步骤 4] 卸载旧版本应用（如果存在）...
"%ANDROID_HOME%\platform-tools\adb.exe" shell pm list packages | findstr /C:"com.bamderl.mobile" >nul 2>&1
if %errorlevel% == 0 (
    echo 正在卸载旧版本...
    "%ANDROID_HOME%\platform-tools\adb.exe" uninstall com.bamderl.mobile
    echo ✅ 旧版本已卸载
) else (
    echo ✅ 未检测到旧版本应用
)
echo.

echo [步骤 5] 使用 Gradle 构建 APK...
echo.
echo ⚠️  提示：首次构建需要下载依赖，可能需要 5-10 分钟
echo    如果已经构建过，重新构建通常只需要 1-2 分钟
echo.

REM 设置 NODE_ENV 以避免构建时的警告（expo-constants 需要）
set NODE_ENV=development
REM 设置 Node.js 内存限制以避免大型文件打包时的内存溢出错误
set NODE_OPTIONS=--max-old-space-size=4096

cd android
echo 执行: gradlew.bat assembleDebug
echo.
call .\gradlew.bat assembleDebug
set BUILD_RESULT=!errorlevel!
cd ..

if !BUILD_RESULT! neq 0 (
    echo.
    echo ❌ Gradle 构建失败，错误代码: !BUILD_RESULT!
    echo    请查看上方错误信息
    echo.
    echo 提示：可以尝试手动运行:
    echo   cd android
    echo   .\gradlew.bat assembleDebug
    pause
    exit /b 1
)

echo.
echo ✅ APK 构建成功
echo.

echo [步骤 6] 安装 APK 到设备...
if exist "android\app\build\outputs\apk\debug\app-debug.apk" (
    echo 正在安装 APK...
    "%ANDROID_HOME%\platform-tools\adb.exe" install -r "android\app\build\outputs\apk\debug\app-debug.apk"
    if !errorlevel! == 0 (
        echo.
        echo ========================================
        echo ✅ 构建并安装成功！
        echo ========================================
        echo.
        echo APK 位置: android\app\build\outputs\apk\debug\app-debug.apk
        echo.
        echo 下一步：
        echo 1. 应用已安装到手机
        echo 2. 启动开发服务器：scripts\dev\start-dev.bat
        echo 3. 在手机上打开应用
        echo.
    ) else (
        echo.
        echo ❌ 安装失败
        echo    APK 位置: android\app\build\outputs\apk\debug\app-debug.apk
        echo    你可以手动安装: adb install -r android\app\build\outputs\apk\debug\app-debug.apk
        echo.
    )
) else (
    echo.
    echo ❌ APK 文件未找到
    echo    预期位置: android\app\build\outputs\apk\debug\app-debug.apk
    echo.
)

pause


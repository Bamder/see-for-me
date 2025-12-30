@echo off
setlocal enabledelayedexpansion
REM 构建 Android 发布版 APK（独立运行，无需开发服务器）

echo ========================================
echo Android 发布版 APK 构建脚本
echo ========================================
echo.

REM 切换到项目根目录（mobile）
cd /d "%~dp0\..\.."

echo [步骤 1] 检查环境...
if not defined ANDROID_HOME (
    echo ❌ ANDROID_HOME 未设置
    echo    请先设置 ANDROID_HOME 环境变量
    pause
    exit /b 1
)

if not exist "android" (
    echo ❌ android 目录不存在
    echo    正在生成原生项目...
    npx expo prebuild --platform android --clean
    if !errorlevel! neq 0 (
        echo ❌ 生成原生项目失败
        pause
        exit /b 1
    )
    echo ✅ 原生项目已生成
)

echo ✅ 环境检查通过
echo.

echo [步骤 2] 复制 assets 文件到 Android 项目...
REM 创建 assets 目录
if not exist "android\app\src\main\assets" (
    echo 正在创建 assets 目录...
    mkdir "android\app\src\main\assets"
)

REM 检查模型文件是否存在
if not exist "assets\tts-models\paddlespeech-lite" (
    echo ⚠️  源 assets 目录不存在: assets\tts-models\paddlespeech-lite
    echo    跳过模型文件复制（离线模型已禁用，不影响发布版）
) else (
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
                echo   ⚠️  复制失败（非关键，离线模型已禁用）
            )
        )
    ) else (
        echo   ✅ tts-models 目录已存在，跳过复制
    )
)

echo ✅ Assets 准备完成
echo.

echo [步骤 3] 清理旧的构建产物...
cd android
call .\gradlew.bat clean >nul 2>&1
cd ..
echo ✅ 清理完成
echo.

echo [步骤 4] 构建发布版 APK...
echo.
echo ⚠️  提示：首次构建需要下载依赖，可能需要 5-10 分钟
echo    如果已经构建过，重新构建通常只需要 1-2 分钟
echo.
echo ⚠️  注意：发布版 APK 使用 release 签名，需要配置签名密钥
echo    如果没有配置，将使用调试密钥（仅供测试）
echo.

REM 设置构建环境变量
set NODE_ENV=production
set NODE_OPTIONS=--max-old-space-size=4096

cd android
echo 执行: gradlew.bat assembleRelease
echo.
call .\gradlew.bat assembleRelease
set BUILD_RESULT=!errorlevel!
cd ..

if !BUILD_RESULT! neq 0 (
    echo.
    echo ❌ Gradle 构建失败，错误代码: !BUILD_RESULT!
    echo    请查看上方错误信息
    echo.
    echo 提示：可以尝试手动运行:
    echo   cd android
    echo   .\gradlew.bat assembleRelease
    pause
    exit /b 1
)

echo.
echo ✅ APK 构建成功
echo.

echo [步骤 5] 查找生成的 APK...
if exist "android\app\build\outputs\apk\release\app-release.apk" (
    echo.
    echo ========================================
    echo ✅ 发布版 APK 构建成功！
    echo ========================================
    echo.
    echo APK 位置: android\app\build\outputs\apk\release\app-release.apk
    echo.
    echo APK 信息:
    for %%F in ("android\app\build\outputs\apk\release\app-release.apk") do (
        echo   文件大小: %%~zF 字节 (约 %%~zF / 1048576 MB)
        echo   修改时间: %%~tF
    )
    echo.
    echo 下一步：
    echo 1. APK 可以独立安装到设备上（无需开发服务器）
    echo 2. 可以通过 USB 安装：adb install -r android\app\build\outputs\apk\release\app-release.apk
    echo 3. 或者将 APK 文件传输到手机手动安装
    echo.
    echo ⚠️  注意：
    echo   - 发布版 APK 使用 release 签名
    echo   - 如果使用调试密钥，仅供测试使用
    echo   - 正式发布前请配置正式的签名密钥
    echo.
) else (
    echo.
    echo ❌ APK 文件未找到
    echo    预期位置: android\app\build\outputs\apk\release\app-release.apk
    echo    请检查构建日志是否有错误
    echo.
)

pause


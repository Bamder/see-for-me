@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul
echo ========================================
echo    Expo 项目依赖一键安装脚本 (安全版)
echo ========================================
echo.

:: 初始化一个错误标志
set EXIT_CODE=0

:: 函数：执行命令并检查错误
call :execute_command "安装 Expo 核心模块" npx expo install expo-camera expo-av expo-image-picker expo-sharing
call :execute_command "安装 Expo Speech" npx expo install expo-speech
call :execute_command "安装 Expo Haptics" npx expo install expo-haptics
call :execute_command "安装 Expo File System" npx expo install expo-file-system
call :execute_command "安装 Expo Media Library" npx expo install expo-media-library
call :execute_command "安装 Expo Network" npx expo install expo-network
call :execute_command "安装 Expo Constants" npx expo install expo-constants

echo.
echo --- 安装 React Navigation 及相关依赖 ---
echo.
call :execute_command "安装 React Navigation 核心" npx expo install @react-navigation/native
call :execute_command "安装 React Navigation Stack" npx expo install @react-navigation/stack
call :execute_command "安装 Screens 和 Safe Area Context" npx expo install react-native-screens react-native-safe-area-context
call :execute_command "安装 Gesture Handler" npx expo install react-native-gesture-handler

echo.
echo --- 安装其他第三方依赖 ---
echo.
call :execute_command "安装 Axios" npx expo install axios
call :execute_command "安装 React Native Vector Icons" npx expo install react-native-vector-icons
call :execute_command "安装 NetInfo" npx expo install @react-native-community/netinfo
call :execute_command "安装 React Native Elements" npx expo install react-native-elements
call :execute_command "安装 React Native Paper" npx expo install react-native-paper

echo.
echo ========================================
if !EXIT_CODE! EQU 0 (
    echo 所有依赖安装完成！
) else (
    echo 安装过程遇到错误，请检查以上红色错误信息。
)
echo 按任意键退出...
pause >nul
exit /b !EXIT_CODE!

:: --- 子程序定义 ---
:execute_command
echo [步骤] %~1
echo [命令] %~2 %~3 %~4 %~5
%~2 %~3 %~4 %~5
if !ERRORLEVEL! NEQ 0 (
    echo [错误] 上一步命令执行失败，错误码: !ERRORLEVEL!
    set EXIT_CODE=1
)
echo.
pause
echo.
goto :eof
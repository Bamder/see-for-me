@echo off
echo ========================================
echo 修复依赖版本
echo ========================================
echo.

REM 切换到项目根目录（mobile）
cd /d "%~dp0\..\.."

echo 正在检查并修复依赖版本...
call npx expo install --check

echo.
echo ========================================
echo 修复完成！
echo ========================================
echo.
echo 下一步：
echo 1. 运行: npm install
echo 2. 重新构建: eas build --profile development --platform android --clear-cache
echo.
pause


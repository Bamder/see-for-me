@echo off
REM 使用独立虚拟环境导出 YOLOv8n 为 ONNX（Windows）
REM 环境：yolo-export-env（仅用于导出，不影响正常 server-env）

REM 切换到 server 根目录（脚本位于 server\scripts\windows\ 下）
cd /d "%~dp0\..\.."

set VENV_DIR=yolo-export-env
set PYTHON_EXE=%VENV_DIR%\Scripts\python.exe

echo ========================================
echo YOLOv8n ONNX 导出工具（Windows）
echo 目标输出：models\yolov8n.onnx
echo 使用虚拟环境：%VENV_DIR%
echo ========================================

REM 如果导出环境不存在，则创建并安装固定版本依赖
if not exist "%PYTHON_EXE%" (
    echo 未检测到 %VENV_DIR%，正在创建虚拟环境...
    python -m venv "%VENV_DIR%"
    if %errorlevel% neq 0 (
        echo ❌ 创建虚拟环境失败，请检查 Python 安装。
        pause
        exit /b 1
    )

    call "%VENV_DIR%\Scripts\activate.bat"
    echo 升级 pip...
    pip install --upgrade pip
    echo 安装用于導出 ONNX 的固定依賴版本...
    pip install "torch==2.0.1" "ultralytics==8.0.196" "onnx==1.14.1" "onnxruntime==1.16.3"
    if %errorlevel% neq 0 (
        echo ❌ 依赖安装失败，请检查网络或重试。
        pause
        exit /b 1
    )
) else (
    call "%VENV_DIR%\Scripts\activate.bat"
)

echo.
echo 当前 Python：
python --version
echo.

REM 确保权重路径存在（优先使用本地 models\yolov8n.pt）
if exist "models\yolov8n.pt" (
    set WEIGHTS_PATH=models\yolov8n.pt
) else (
    echo [注意] 未在 models\ 目录下找到 yolov8n.pt，将让 ultralytics 自行下载官方权重。
    set WEIGHTS_PATH=yolov8n.pt
)

echo 使用权重：%WEIGHTS_PATH%
echo 正在导出 ONNX（这可能需要数十秒，视机器性能而定）...

python -c "from ultralytics import YOLO; m = YOLO(r'%WEIGHTS_PATH%'); m.export(format='onnx', opset=12)"

if %errorlevel% neq 0 (
    echo ❌ 导出失败，请查看上方 Python 日志，通常与 PyTorch/ONNX/ultralytics 版本组合有关。
    pause
    exit /b 1
)

echo.
echo ✅ 导出完成。请在 models\ 目录下检查生成的 yolov8n.onnx 文件。
echo 如需在其他机器复现导出，请复用本脚本及 yolo-export-env 版本。
echo.
pause



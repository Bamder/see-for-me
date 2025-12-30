#!/usr/bin/env bash
# 使用独立虚拟环境导出 YOLOv8n 为 ONNX（WSL / Linux）
# 环境：yolo-export-env（仅用于导出，不影响正常 server-env）

set -euo pipefail

# 切换到 server 根目录（脚本位于 server/scripts/wsl/ 下）
cd "$(dirname "$0")/../.."

VENV_DIR="yolo-export-env"
PYTHON_EXE="${VENV_DIR}/bin/python"

echo "========================================"
echo "YOLOv8n ONNX 导出工具（WSL/Linux）"
echo "目标输出：models/yolov8n.onnx"
echo "使用虚拟环境：${VENV_DIR}"
echo "========================================"

# 如果导出环境不存在，则创建并安装固定版本依赖
if [ ! -f "${PYTHON_EXE}" ]; then
  echo "未检测到 ${VENV_DIR}，正在创建虚拟环境..."
  python -m venv "${VENV_DIR}"

  echo "升级 pip..."
  "${PYTHON_EXE}" -m pip install --upgrade pip

  echo "安装用于导出 ONNX 的固定依赖版本..."
  "${PYTHON_EXE}" -m pip install \
    "torch==2.0.1" \
    "ultralytics==8.0.196" \
    "onnx==1.14.1" \
    "onnxruntime==1.16.3"
fi

echo
echo "当前 Python："
"${PYTHON_EXE}" --version
echo

WEIGHTS_PATH="models/yolov8n.pt"
if [ -f "${WEIGHTS_PATH}" ]; then
  echo "使用本地权重：${WEIGHTS_PATH}"
else
  echo "⚠ 未在 models/ 目录下找到 yolov8n.pt，将让 ultralytics 自行下载官方权重。"
  WEIGHTS_PATH="yolov8n.pt"
fi

echo "正在导出 ONNX（这可能需要数十秒，视机器性能而定）..."

"${PYTHON_EXE}" - << 'EOF'
from ultralytics import YOLO
from pathlib import Path
import os

root = Path(".").resolve()
weights = os.environ.get("WEIGHTS_PATH", "models/yolov8n.pt")
weights_path = root / weights

if weights_path.exists():
    model = YOLO(str(weights_path))
else:
    # 允许 ultralytics 通过模型名自动下载官方权重
    model = YOLO(weights)

model.export(format="onnx", opset=12)
EOF

echo
echo "✅ 导出完成。请在 models/ 目录下检查生成的 yolov8n.onnx 文件。"
echo "如需在其他机器复现导出，请复用本脚本及 yolo-export-env 版本。"
echo



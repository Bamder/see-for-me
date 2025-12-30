#!/usr/bin/env bash
# WSL/Linux 版：启动 FastAPI 开发服务器
set -euo pipefail

# 切换到 server 目录（脚本在 server/scripts/wsl/ 下）
cd "$(dirname "$0")/../.."

LOG_LEVEL="${LOG_LEVEL:-debug}"
PORT="${PORT:-8000}"
HOST="${HOST:-0.0.0.0}"

if [ ! -d "server-env/bin" ]; then
  echo "虚拟环境不存在，请先创建并安装依赖："
  echo "  python -m venv server-env"
  echo "  source server-env/bin/activate"
  echo "  pip install -r requirements.txt"
  exit 1
fi

# 设置虚拟环境中的 Python 和 pip 路径（确保使用 server-env 环境）
PYTHON_EXE="server-env/bin/python"
PIP_EXE="server-env/bin/pip"
UVICORN_EXE="server-env/bin/uvicorn"

# 验证 Python 可执行文件存在
if [ ! -f "${PYTHON_EXE}" ]; then
  echo "❌ 虚拟环境中的 Python 可执行文件不存在"
  exit 1
fi

# 显示使用的环境（确认使用 server-env）
echo "使用虚拟环境: server-env"
"${PYTHON_EXE}" --version
echo

# YOLOv8 ONNX 导出兼容性提示
echo "========================================"
echo "提示：如果在启动日志中看到「模型导出 / ONNX 兼容性相关错误」，例如："
echo "  - 与「ONNX 转换、图分解、节点类型」相关的异常；"
echo "  - 与「模型算子不支持或版本不匹配」相关的异常；"
echo "通常是 PyTorch / ONNX / Ultralytics 等依赖版本不兼容导致，而不是本项目的业务代码错误。"
echo "简要处理思路："
echo "  1.优先直接使用已准备好的 models/yolov8n.onnx（按说明下载或本地已有的经过验证版本）；"
echo "  2.不要在启动脚本中自动重新导出 ONNX 模型；"
echo "  3.如需在新环境重导出，可单独写测试脚本，并视情况："
echo "     - 固定或回退 PyTorch / Ultralytics 版本；"
echo "     - 或在配置中将 vision.yolo.use_onnx 设为 false，暂时使用 PyTorch 模式。"
echo "========================================"
echo

# 简单依赖检查（使用虚拟环境中的 Python）
"${PYTHON_EXE}" -c "import fastapi, uvicorn" >/dev/null 2>&1 || "${PIP_EXE}" install -r requirements.txt

echo "========================================"
echo "启动 SeeForMe 服务器 (WSL/Linux)"
echo "地址: http://${HOST}:${PORT}"
echo "WebSocket: ws://${HOST}:${PORT}/ws"
echo "========================================"

# 使用虚拟环境中的 uvicorn 启动服务器
if [ -f "${UVICORN_EXE}" ]; then
  "${UVICORN_EXE}" app.main:app --host "${HOST}" --port "${PORT}" --reload --log-level "${LOG_LEVEL}"
else
  # 如果 uvicorn 不在 bin 目录，使用 python -m uvicorn
  "${PYTHON_EXE}" -m uvicorn app.main:app --host "${HOST}" --port "${PORT}" --reload --log-level "${LOG_LEVEL}"
fi


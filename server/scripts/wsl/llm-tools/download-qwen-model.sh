#!/usr/bin/env bash
# WSL/Linux 版：使用专用 llm-tools-env 环境，下载 Qwen 权重到 server/models/
set -euo pipefail

cd "$(dirname "$0")/../.."

# ===== llm-tools-env 虚拟环境（仅用于 LLM/模型下载工具）=====
TOOLS_ENV_DIR="${TOOLS_ENV_DIR:-llm-tools-env}"

if [ ! -d "${TOOLS_ENV_DIR}/bin" ]; then
  echo "未找到 llm-tools-env 虚拟环境。"
  echo "请先运行："
  echo "  server/scripts/wsl/llm-tools/setup-llm-tools-env.sh"
  echo
  exit 1
fi

# 设置虚拟环境中的 Python 路径（确保使用 llm-tools-env 环境）
PYTHON_EXE="${TOOLS_ENV_DIR}/bin/python"

# 验证 Python 可执行文件存在
if [ ! -f "${PYTHON_EXE}" ]; then
  echo "❌ 虚拟环境中的 Python 可执行文件不存在"
  exit 1
fi

# 显示使用的环境（确认使用 llm-tools-env）
echo "使用虚拟环境: ${TOOLS_ENV_DIR}"
"${PYTHON_EXE}" --version
echo

# ===== 可配置区（可用环境变量覆盖）=====
MODEL_REPO="${MODEL_REPO:-https://huggingface.co/Qwen/Qwen2.5-7B-Instruct}"
# 当前工作目录已是 server 根目录，因此默认目标应为 ./models/...
MODEL_DIR="${MODEL_DIR:-models/Qwen2.5-7B-Instruct}"
# ============================

echo "========================================"
echo "下载 Qwen 模型（llm-tools-env 环境）"
echo "源仓库: ${MODEL_REPO}"
echo "目标路径: ${MODEL_DIR}"
echo "========================================"

mkdir -p "$(dirname "${MODEL_DIR}")"

git lfs install

if [ -d "${MODEL_DIR}" ]; then
  echo "目标目录已存在，跳过克隆。如需重新下载请先删除该目录。"
else
  git clone "${MODEL_REPO}" "${MODEL_DIR}"
fi

echo "完成。如需更换模型，请修改脚本顶部变量或传入环境变量。"



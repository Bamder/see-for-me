#!/usr/bin/env bash
# WSL/Linux 版：专用 llm-tools-env 虚拟环境，仅用于 LLM/模型下载等工具
set -euo pipefail

cd "$(dirname "$0")/../.."

# ============================================================
# 专用 llm-tools-env 虚拟环境：仅用于 LLM/模型下载等工具，不影响 server-env
# 位置：server/llm-tools-env
# 依赖：安装最新 huggingface_hub 提供的 hf CLI
# ============================================================

TOOLS_ENV_DIR="${TOOLS_ENV_DIR:-llm-tools-env}"

if [ -d "${TOOLS_ENV_DIR}/bin" ]; then
  echo "已检测到现有虚拟环境: ${TOOLS_ENV_DIR}"
else
  echo "正在创建虚拟环境: ${TOOLS_ENV_DIR}"
  python -m venv "${TOOLS_ENV_DIR}"
fi

source "${TOOLS_ENV_DIR}/bin/activate"

echo "正在安装 / 更新 huggingface_hub 及 hf CLI..."
pip install -U "huggingface_hub>=1.2.0"

echo
echo "llm-tools-env 环境已就绪："
echo "  位置: $(pwd)/${TOOLS_ENV_DIR}"
echo "  用途: 仅用于 LLM/模型下载等工具，不影响 server-env 运行依赖"
echo
echo "可使用命令："
echo "  source llm-tools-env/bin/activate"
echo "  hf --help"
echo



#!/usr/bin/env bash
# WSL/Linux 版：vLLM 推理专用虚拟环境（llm-vllm-env）
set -euo pipefail

cd "$(dirname "$0")/../../.."

# ============================================================
# 专用 llm-vllm-env 虚拟环境：仅用于 vLLM 推理服务
# 位置：server/llm-vllm-env
# 依赖：vllm（需满足 CUDA / GPU 驱动等要求）
# ============================================================

LLM_VLLM_ENV_DIR="${LLM_VLLM_ENV_DIR:-llm-vllm-env}"

if [ -d "${LLM_VLLM_ENV_DIR}/bin" ]; then
  echo "已检测到现有虚拟环境: ${LLM_VLLM_ENV_DIR}"
else
  echo "正在创建虚拟环境: ${LLM_VLLM_ENV_DIR}"
  python -m venv "${LLM_VLLM_ENV_DIR}"
fi

source "${LLM_VLLM_ENV_DIR}/bin/activate"

echo "正在安装 / 更新 vLLM..."
pip install -U "vllm"

echo
echo "llm-vllm-env 环境已就绪："
echo "  位置: $(pwd)/${LLM_VLLM_ENV_DIR}"
echo "  用途: 仅用于 vLLM 推理服务，不影响 server-env / llm-tools-env"
echo
echo "可使用命令："
echo "  source llm-vllm-env/bin/activate"
echo "  python -m vllm.entrypoints.openai.api_server --help"
echo



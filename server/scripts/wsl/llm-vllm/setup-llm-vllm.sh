#!/usr/bin/env bash
# WSL/Linux 版：启动 vLLM（OpenAI 兼容接口）
set -euo pipefail

cd "$(dirname "$0")/../../.."

# ===== llm-vllm-env 虚拟环境（仅用于 vLLM 推理）=====
LLM_VLLM_ENV_DIR="${LLM_VLLM_ENV_DIR:-llm-vllm-env}"

if [ ! -d "${LLM_VLLM_ENV_DIR}/bin" ]; then
  echo "未找到 llm-vllm-env 虚拟环境。"
  echo "请先运行："
  echo "  server/scripts/wsl/llm-vllm/setup-llm-vllm-env.sh"
  echo
  exit 1
fi

# 设置虚拟环境中的 Python 路径（确保使用 llm-vllm-env 环境）
PYTHON_EXE="${LLM_VLLM_ENV_DIR}/bin/python"

# 验证 Python 可执行文件存在
if [ ! -f "${PYTHON_EXE}" ]; then
  echo "❌ 虚拟环境中的 Python 可执行文件不存在"
  exit 1
fi

# 显示使用的环境（确认使用 llm-vllm-env）
echo "使用虚拟环境: ${LLM_VLLM_ENV_DIR}"
"${PYTHON_EXE}" --version
echo

# === 可配置区 ===
MODEL_PATH="${MODEL_PATH:-models/Qwen2.5-7B-Instruct}"
HOST="${HOST:-0.0.0.0}"
PORT="${PORT:-8000}"
QUANT="${QUANT:-none}" # 可选：awq/gptq/none
# ================

echo "========================================"
echo "启动 vLLM OpenAI 兼容服务"
echo "模型: ${MODEL_PATH}"
echo "监听: http://${HOST}:${PORT}"
echo "虚拟环境: ${LLM_VLLM_ENV_DIR}"
echo "========================================"

# 使用虚拟环境中的 Python 启动服务
"${PYTHON_EXE}" -m vllm.entrypoints.openai.api_server \
  --model "${MODEL_PATH}" \
  --host "${HOST}" \
  --port "${PORT}" \
  --trust-remote-code \
  --quantization "${QUANT}"



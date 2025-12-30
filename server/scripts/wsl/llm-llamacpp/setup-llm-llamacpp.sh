#!/usr/bin/env bash
# WSL/Linux 版：启动 llama.cpp OpenAI 兼容服务（GGUF）
set -euo pipefail

cd "$(dirname "$0")/../../.."

# ===== llm-llamacpp-env 虚拟环境（仅用于 llama.cpp 推理）=====
LLM_LLAMA_ENV_DIR="${LLM_LLAMA_ENV_DIR:-llm-llamacpp-env}"

if [ ! -d "${LLM_LLAMA_ENV_DIR}/bin" ]; then
  echo "未找到 llm-llamacpp-env 虚拟环境。"
  echo "请先运行："
  echo "  server/scripts/wsl/llm-llamacpp/setup-llm-llamacpp-env.sh"
  echo
  exit 1
fi

# 设置虚拟环境中的 Python 路径（确保使用 llm-llamacpp-env 环境）
PYTHON_EXE="${LLM_LLAMA_ENV_DIR}/bin/python"

# 验证 Python 可执行文件存在
if [ ! -f "${PYTHON_EXE}" ]; then
  echo "❌ 虚拟环境中的 Python 可执行文件不存在"
  exit 1
fi

# 显示使用的环境（确认使用 llm-llamacpp-env）
echo "使用虚拟环境: ${LLM_LLAMA_ENV_DIR}"
"${PYTHON_EXE}" --version
echo

# === 可配置区（可用环境变量覆盖） ===
# 默认使用 q8_0 量化版本的分片文件（只需指定第一个分片，llama.cpp 会自动加载其他分片）
# 注意：当前工作目录已是 server 目录，因此模型路径应为 models/...
GGUF_PATH="${GGUF_PATH:-models/qwen2.5-7b-instruct-q8_0-00001-of-00003.gguf}"

# 验证模型文件是否存在
if [ ! -f "${GGUF_PATH}" ]; then
  echo "[错误] 模型文件不存在: ${GGUF_PATH}"
  echo "当前工作目录: $(pwd)"
  echo "请检查模型路径是否正确，或通过 GGUF_PATH 环境变量指定正确的路径"
  echo
  exit 1
fi

HOST="${HOST:-0.0.0.0}"
PORT="${PORT:-8001}"
if [ -z "${N_GPU_LAYERS:-}" ]; then
  if command -v nvidia-smi >/dev/null 2>&1; then
    N_GPU_LAYERS=20
  else
    N_GPU_LAYERS=0
  fi
fi
# 有 GPU 可手动设 20/30，-1 表示全层上 GPU（需足够显存）
# =====================================

echo "========================================"
echo "启动 llama.cpp OpenAI 兼容服务 (GGUF)"
echo "模型: ${GGUF_PATH}"
echo "监听: http://${HOST}:${PORT}"
echo "虚拟环境: ${LLM_LLAMA_ENV_DIR}"
echo "========================================"

# 使用虚拟环境中的 Python 启动服务
"${PYTHON_EXE}" -m llama_cpp.server \
  --model "${GGUF_PATH}" \
  --host "${HOST}" \
  --port "${PORT}" \
  --n_gpu_layers "${N_GPU_LAYERS}" \
  --chat_format openai



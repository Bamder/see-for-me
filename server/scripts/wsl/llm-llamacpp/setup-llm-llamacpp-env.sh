#!/usr/bin/env bash
# WSL/Linux 版：llama.cpp 推理专用虚拟环境（llm-llamacpp-env）
set -euo pipefail

cd "$(dirname "$0")/../../.."

# ============================================================
# 专用 llm-llamacpp-env 虚拟环境：仅用于 llama.cpp 推理服务
# 位置：server/llm-llamacpp-env
# 依赖：llama-cpp-python（请根据 GPU/CPU 需求选择合适的编译版本）
# ============================================================

LLM_LLAMA_ENV_DIR="${LLM_LLAMA_ENV_DIR:-llm-llamacpp-env}"

if [ -d "${LLM_LLAMA_ENV_DIR}/bin" ]; then
  echo "已检测到现有虚拟环境: ${LLM_LLAMA_ENV_DIR}"
else
  echo "正在创建虚拟环境: ${LLM_LLAMA_ENV_DIR}"
  python -m venv "${LLM_LLAMA_ENV_DIR}"
fi

source "${LLM_LLAMA_ENV_DIR}/bin/activate"

echo "正在安装 / 更新 llama-cpp-python 及其依赖..."
echo "注意: llama_cpp.server 需要额外的 Web 框架依赖"
pip install -U "llama-cpp-python" "uvicorn[standard]" "fastapi" "starlette" "starlette-context" "pydantic" "pydantic-settings" "python-multipart" "sse-starlette"

echo
echo "llm-llamacpp-env 环境已就绪："
echo "  位置: $(pwd)/${LLM_LLAMA_ENV_DIR}"
echo "  用途: 仅用于 llama.cpp 推理服务，不影响 server-env / llm-tools-env"
echo
echo "可使用命令："
echo "  source llm-llamacpp-env/bin/activate"
echo "  python -m llama_cpp.server --help"
echo



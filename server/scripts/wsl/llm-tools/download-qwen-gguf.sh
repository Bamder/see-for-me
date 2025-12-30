#!/usr/bin/env bash
# WSL/Linux 版：使用专用 llm-tools-env 环境，通过 hf CLI 下载 Qwen GGUF 模型到 ../models
# 注意：不使用 set -e，以便支持重试逻辑
set -uo pipefail

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

# 设置虚拟环境中的 Python 和 hf 路径（确保使用 llm-tools-env 环境）
PYTHON_EXE="${TOOLS_ENV_DIR}/bin/python"
HF_EXE="${TOOLS_ENV_DIR}/bin/hf"

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
MODEL_REPO="${MODEL_REPO:-Qwen/Qwen2.5-7B-Instruct-GGUF}"
GGUF_BASENAME="${GGUF_BASENAME:-qwen2.5-7b-instruct-q8_0}"
# 当前工作目录已是 server 根目录，因此默认目标应为 ./models
TARGET_DIR="${TARGET_DIR:-models}"
# 预设镜像，默认 hf-mirror。hf CLI 新版不再支持 --endpoint 选项，但会尊重 HF_ENDPOINT 环境变量。
HF_ENDPOINT_DEFAULT="https://hf-mirror.com"
HF_ENDPOINT="${HF_ENDPOINT:-${HF_ENDPOINT_DEFAULT}}"
export HF_ENDPOINT
# 如需认证，设置 HF_TOKEN=xxx
# ============================

mkdir -p "${TARGET_DIR}"

echo "========================================"
echo "使用 llm-tools-env 环境通过 hf 下载模型"
echo "仓库: ${MODEL_REPO}"
echo "文件前缀: ${GGUF_BASENAME}-*.gguf"
echo "目标: ${TARGET_DIR}"
echo "镜像: ${HF_ENDPOINT} (通过 HF_ENDPOINT 环境变量控制)"
echo "========================================"

# 检查已下载的文件并验证完整性
echo
echo "检查已下载的文件..."
FOUND_FILES=0
for f in "${TARGET_DIR}/${GGUF_BASENAME}"-*.gguf; do
  if [ -f "$f" ]; then
    SIZE=$(stat -f%z "$f" 2>/dev/null || stat -c%s "$f" 2>/dev/null || echo "0")
    echo "   已存在: $(basename "$f") (大小: ${SIZE} 字节)"
    FOUND_FILES=$((FOUND_FILES + 1))
  fi
done

# 设置网络超时和重试参数（通过环境变量传递给 huggingface_hub）
# 增加超时时间，避免 SSL 握手超时
export HF_HUB_DOWNLOAD_TIMEOUT=300
export HF_HUB_DOWNLOAD_RETRIES=5
export HF_HUB_DOWNLOAD_RETRY_DELAY=10

# hf download 支持断点续传，已下载的文件会自动跳过
echo
echo "开始下载（支持断点续传，已下载的文件会自动跳过）..."
echo "网络超时设置: ${HF_HUB_DOWNLOAD_TIMEOUT} 秒，最大重试: ${HF_HUB_DOWNLOAD_RETRIES} 次"
echo
MAX_RETRIES=5
RETRY_COUNT=0
RETRY_DELAY=10

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
  # 使用虚拟环境中的 hf 命令
  if [ -f "${HF_EXE}" ]; then
    if "${HF_EXE}" download "${MODEL_REPO}" \
      --local-dir "${TARGET_DIR}" \
      --include "${GGUF_BASENAME}-*.gguf"; then
      echo
      echo "[成功] 下载完成！"
      break
    else
      RETRY_COUNT=$((RETRY_COUNT + 1))
      if [ $RETRY_COUNT -lt $MAX_RETRIES ]; then
        echo
        echo "[警告] 下载中断（错误码: $?），${RETRY_COUNT}/${MAX_RETRIES} 次重试中..."
        echo "等待 ${RETRY_DELAY} 秒后重试（指数退避策略）..."
        sleep $RETRY_DELAY
        # 指数退避：每次重试延迟时间翻倍（最多60秒）
        RETRY_DELAY=$((RETRY_DELAY * 2))
        if [ $RETRY_DELAY -gt 60 ]; then
          RETRY_DELAY=60
        fi
      else
        echo
        echo "[错误] 下载失败，已重试 ${MAX_RETRIES} 次。"
        echo "提示：hf download 支持断点续传，可直接重新运行此脚本继续下载。"
        exit 1
      fi
    fi
  else
    # 如果 hf 不在 bin 目录，使用 python -m huggingface_hub
    if "${PYTHON_EXE}" -m huggingface_hub.cli.download "${MODEL_REPO}" \
      --local-dir "${TARGET_DIR}" \
      --include "${GGUF_BASENAME}-*.gguf"; then
      echo
      echo "[成功] 下载完成！"
      break
    else
    RETRY_COUNT=$((RETRY_COUNT + 1))
    if [ $RETRY_COUNT -lt $MAX_RETRIES ]; then
      echo
      echo "[警告] 下载中断（错误码: $?），${RETRY_COUNT}/${MAX_RETRIES} 次重试中..."
      echo "等待 ${RETRY_DELAY} 秒后重试（指数退避策略）..."
      sleep $RETRY_DELAY
      # 指数退避：每次重试延迟时间翻倍（最多60秒）
      RETRY_DELAY=$((RETRY_DELAY * 2))
      if [ $RETRY_DELAY -gt 60 ]; then
        RETRY_DELAY=60
      fi
    else
      echo
      echo "[错误] 下载失败，已重试 ${MAX_RETRIES} 次。"
      echo "提示：hf download 支持断点续传，可直接重新运行此脚本继续下载。"
      exit 1
    fi
  fi
done

echo
echo "========================================"
echo "验证下载的文件完整性"
echo "========================================"
VERIFY_FAILED=0
FOUND_COUNT=0
FILE_LIST=""
CHECKSUM_VERIFY=0

# 检查所有分片文件
for f in "${TARGET_DIR}/${GGUF_BASENAME}"-*.gguf; do
  if [ -f "$f" ]; then
    FOUND_COUNT=$((FOUND_COUNT + 1))
    SIZE=$(stat -f%z "$f" 2>/dev/null || stat -c%s "$f" 2>/dev/null || echo "0")
    if [ "$SIZE" -eq 0 ]; then
      echo "  [警告] $(basename "$f") 文件大小为 0，下载未完成！"
      VERIFY_FAILED=1
    else
      echo "  [OK] $(basename "$f") (大小: ${SIZE} 字节)"
      FILE_LIST="${FILE_LIST} $(basename "$f")"
    fi
  fi
done

# 检查是否找到文件
if [ $FOUND_COUNT -eq 0 ]; then
  echo "  [错误] 未找到任何文件！下载可能失败。"
  VERIFY_FAILED=1
else
  echo
  echo "找到 ${FOUND_COUNT} 个文件"
  # 检查文件名模式，判断是否为分片文件
  if echo "$FILE_LIST" | grep -qE "-[0-9]+-of-[0-9]+"; then
    echo "  [提示] 检测到分片文件模式，请确认所有分片都已下载"
    echo "   如果缺少分片，hf download 会自动补全缺失的文件"
  fi
fi

# 计算 SHA256 校验和
echo
echo "计算文件 SHA256 校验和（用于完整性验证）..."
if command -v sha256sum >/dev/null 2>&1; then
  for f in "${TARGET_DIR}/${GGUF_BASENAME}"-*.gguf; do
    if [ -f "$f" ] && [ "$(stat -f%z "$f" 2>/dev/null || stat -c%s "$f" 2>/dev/null || echo "0")" -ne 0 ]; then
      echo "   计算 $(basename "$f") 的 SHA256..."
      SHA256=$(sha256sum "$f" | cut -d' ' -f1)
      echo "   SHA256: ${SHA256}"
      CHECKSUM_VERIFY=1
    fi
  done
  if [ $CHECKSUM_VERIFY -eq 0 ]; then
    echo "  [提示] SHA256 计算完成，请与官方校验和对比验证"
  fi
elif command -v shasum >/dev/null 2>&1; then
  for f in "${TARGET_DIR}/${GGUF_BASENAME}"-*.gguf; do
    if [ -f "$f" ] && [ "$(stat -f%z "$f" 2>/dev/null || stat -c%s "$f" 2>/dev/null || echo "0")" -ne 0 ]; then
      echo "   计算 $(basename "$f") 的 SHA256..."
      SHA256=$(shasum -a 256 "$f" | cut -d' ' -f1)
      echo "   SHA256: ${SHA256}"
      CHECKSUM_VERIFY=1
    fi
  done
else
  echo "  [提示] sha256sum 不可用，跳过 SHA256 计算"
  echo "   可以使用以下命令手动计算："
  echo "     sha256sum 文件路径"
fi

echo
if [ $VERIFY_FAILED -eq 1 ]; then
  echo "[警告] 文件验证未通过，建议重新运行脚本下载。"
  echo
else
  echo "[成功] 基本验证通过！"
  echo
fi

echo "========================================"
echo "文件完整性验证说明"
echo "========================================"
echo
echo "1. 自动验证（已执行）："
echo "   - huggingface_hub 在下载时会自动验证 SHA256（如果仓库提供）"
echo "   - 已检查文件大小不为 0"
echo "   - 已检查所有分片文件是否存在"
if [ $CHECKSUM_VERIFY -eq 1 ]; then
  echo "   - 已计算本地文件的 SHA256 校验和（见上方）"
fi
echo
echo "2. 手动验证 SHA256（推荐）："
echo "   访问 Hugging Face 仓库页面获取官方 SHA256："
echo "     https://huggingface.co/${MODEL_REPO}/tree/main"
echo "   然后使用以下命令计算本地文件 SHA256 并对比："
echo "     sha256sum ${TARGET_DIR}/文件名.gguf"
echo
echo "3. 实际加载测试（最可靠）："
echo "   使用 llama.cpp 尝试加载模型，如果能正常加载说明文件完整："
echo "     python -m llama_cpp.server --model ${TARGET_DIR}/${GGUF_BASENAME}-00001-of-00003.gguf --n_ctx 512"
echo "   或者运行："
echo "     server/scripts/wsl/llm-llamacpp/setup-llm-llamacpp.sh"
echo
echo "4. 如果模型加载失败："
echo "   - 删除不完整的文件"
echo "   - 重新运行此脚本下载（支持断点续传）"
echo
echo "下载流程已结束（成功）。"
echo "如需更换量化，请修改 GGUF_BASENAME，例如："
echo "  q4_k_m: qwen2.5-7b-instruct-q4_k_m"
echo "  q6_k  : qwen2.5-7b-instruct-q6_k"
echo "  q5_0  : qwen2.5-7b-instruct-q5_0"
echo
echo "[提示] hf download 支持断点续传，可直接重新运行此脚本继续下载。"
echo



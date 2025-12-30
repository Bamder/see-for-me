脚本按「运行环境」+「用途」分目录存放，便于区分和维护：

- `windows/`：Windows/PowerShell/CMDtools 下使用的 `.bat` 包装脚本。
- `wsl/`：WSL2/纯 Linux 环境使用的 `.sh` 脚本，需 `bash`、`python` 可用。

### 运行环境约定

- **应用后端（FastAPI + YOLO 等）**：使用 `server-env`
- **YOLOv8 ONNX 导出（可选工具环境）**：使用 `yolo-export-env`
- **LLM 工具（模型下载、hf CLI 等）**：使用 `llm-tools-env`
- **llama.cpp 推理后端（GGUF）**：使用 `llm-llamacpp-env`
- **vLLM 推理后端**：使用 `llm-vllm-env`（仅 WSL 提供）

所有 LLM 相关脚本在运行时都会自动激活各自的虚拟环境，如环境不存在会提示先运行对应的 `setup-*-env` 脚本。

---

### Windows 脚本

- **启用后端服务器服务**
  - `windows/start-server.bat`  
    使用 `server-env`，启动 FastAPI 开发服务器。

- **语言模型部署：LLM 工具（下载模型，用于 hf / git lfs）**
  - 目录：`windows/llm-tools/`  
  - 环境：`llm-tools-env`
  - 脚本：
    - `windows/llm-tools/setup-llm-tools-env.bat`  
      创建/更新 `llm-tools-env`，安装 `huggingface_hub` / `hf` CLI。

    - `windows/llm-tools/download-qwen-gguf.bat`  
      激活 `llm-tools-env`，通过 `hf download` 下载 Qwen GGUF 到 `server\models`。

- **启用语言模型服务：llama.cpp 路线（GGUF 推理服务）**
  - 目录：`windows/llm-llamacpp/`  
  - 环境：`llm-llamacpp-env`
  - 脚本：
    - `windows/llm-llamacpp/setup-llm-llamacpp-env.bat`  
      创建/更新 `llm-llamacpp-env`，安装 `llama-cpp-python`。

    - `windows/llm-llamacpp/setup-llm-llamacpp.bat`  
      激活 `llm-llamacpp-env`，通过 `python -m llama_cpp.server` 启动 OpenAI 兼容服务。

> 说明：Windows 端不再提供 vLLM 路线，仅提供 llama.cpp + GGUF。

---

### WSL / Linux 脚本

- **启用后端服务器服务**
  - `wsl/start-server.sh`  
    使用 `server-env`，启动 FastAPI 开发服务器。

- **语言模型部署：LLM 工具（下载模型）**
  - 目录：`wsl/llm-tools/`  
  - 环境：`llm-tools-env`
  - 脚本：
    - `wsl/llm-tools/setup-llm-tools-env.sh`  
      创建/更新 `llm-tools-env`，安装 `huggingface_hub` / `hf` CLI。
      
    - **对应路线A：llama.cpp + GGUF**
      `wsl/llm-tools/download-qwen-gguf.sh`  
      激活 `llm-tools-env`，通过 `hf download` 下载 Qwen GGUF 到 `server/models/`。  
      
    - **对应路线B：vLLM**
      `wsl/llm-tools/download-qwen-model.sh`  
      激活 `llm-tools-env`，通过 `git lfs + git clone` 下载完整 Qwen2.5-7B-Instruct 到 `server/models/Qwen2.5-7B-Instruct`。 

- **启用语言模型服务-路线A： llama.cpp + GGUF（GGUF 推理服务）**
  - 目录：`wsl/llm-llamacpp/`  
  - 环境：`llm-llamacpp-env`
  - 脚本：
    - `wsl/llm-llamacpp/setup-llm-llamacpp-env.sh`  
      创建/更新 `llm-llamacpp-env`，安装 `llama-cpp-python`。

    - `wsl/llm-llamacpp/setup-llm-llamacpp.sh`  
      激活 `llm-llamacpp-env`，通过 `python -m llama_cpp.server` 启动 OpenAI 兼容服务。  
      默认模型路径：`server/models/qwen2.5-7b-instruct-q4_k_m.gguf`（可通过环境变量覆盖）。

- **启用语言模型服务-路线B: vLLM（需 CUDA / GPU 支持）**
  - 目录：`wsl/llm-vllm/`  
  - 环境：`llm-vllm-env`
  - 脚本：
    - `wsl/llm-vllm/setup-llm-vllm-env.sh`  
      创建/更新 `llm-vllm-env`，安装 `vllm` 及其依赖。

    - `wsl/llm-vllm/setup-llm-vllm.sh`  
      激活 `llm-vllm-env`，通过 `python -m vllm.entrypoints.openai.api_server` 启动 OpenAI 兼容服务。  
      默认模型路径：`server/models/Qwen2.5-7B-Instruct`（可通过环境变量覆盖）。

- **注意：** 
  -CPU或小显存GPU请使用路线A，有CUDA/GPU支持可以选择路线B(模型性能更好)

---

### 模型目录与自定义参数

- 默认模型目录：
  - GGUF：`server/models/*.gguf`
  - vLLM 权重：`server/models/Qwen2.5-7B-Instruct`
- 如需修改端口 / 模型路径 / 量化方式等，可通过脚本顶部变量或以下环境变量覆盖：
  - `GGUF_PATH` / `GGUF_FILE`
  - `MODEL_REPO` / `MODEL_DIR` / `MODEL_PATH`
  - `HOST` / `PORT` / `N_GPU_LAYERS` / `QUANT`

---

### YOLOv8 ONNX 导出兼容性提示

- 视觉模型默认直接使用仓库内提供的 `server/models/yolov8n.onnx`，**不会在启动脚本中自动重新导出 ONNX**。
- 如果你在代码中手动调用 `model.export(format="onnx")` 重新导出 YOLOv8，需注意：
  - 导出链路依赖 **PyTorch 版本 + ultralytics 版本 + ONNX/opset 版本** 的组合，
  - 某些组合下可能出现类似 `Failed to decompose the FX graph for ONNX compatibility`、`'float' object has no attribute 'node'` 等错误，这属于上游导出兼容性问题。
- **建议做法：**
  - 日常部署时优先复用仓库内已导出的 `yolov8n.onnx`，不要在服务启动路径里强制导出。
  - 如需在新环境重新导出，建议：
    - 在单独的脚本/Notebook 中手动导出并验证，成功后将生成的 `.onnx` 固化到 `server/models`；
    - 遇到导出错误时，优先尝试：固定/回退 PyTorch 与 ultralytics 版本，或提升 opset（例如 ≥18）；
    - 实在无法导出时，可在配置中将 `vision.yolo.use_onnx` 设为 `false`，临时使用 PyTorch 推理模式。


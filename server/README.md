# SeeForMe 服务端（Server）

基于 FastAPI 的后端服务，负责与移动端进行 HTTP / WebSocket 通信，并调用 AI 模型完成视觉理解与自然语言生成等能力。

## 快速开始

### 环境要求

- Python 3.8+
- 内存：最小 2GB，推荐 4GB+（使用 GPU 时）
- 磁盘空间：至少 500MB（用于模型文件）

### 安装依赖

```bash
cd server
pip install -r requirements.txt
```

### 启动服务

```bash
# 开发模式
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# 生产模式
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```

首次运行会自动下载模型文件（可能需要几分钟时间）。

### 部署脚本位置
- Windows：`server/scripts/windows/` 下的 `.bat`（仅方案 B：llama.cpp/GGUF）。
- WSL/Linux：`server/scripts/wsl/` 下的 `.sh`（方案 A：vLLM，方案 B：llama.cpp/GGUF）。
- 方案 A（vLLM）与方案 B（llama.cpp/GGUF）分别有对应脚本，修改模型路径/端口请调整脚本顶部变量或传入环境变量。

## 网络连接配置

服务器默认监听在 `0.0.0.0:8000`，这意味着它接受来自所有网络接口的连接。要让其他设备（如手机）连接到服务器，需要：

### 1. 获取服务器 IP 地址

启动服务器时，脚本会自动显示本机的 IP 地址和连接信息：

```
📡 网络连接信息
本机 IP 地址: 192.168.1.100

📱 移动端连接地址:
  HTTP:  http://192.168.1.100:8000
  WebSocket: ws://192.168.1.100:8000/ws
```

如果没有自动显示，可以通过以下命令手动查看：

**Windows:**
```cmd
ipconfig
```

**Linux/macOS:**
```bash
ifconfig
# 或
ip addr
```

### 2. 配置防火墙（Windows）

如果使用 Windows，Windows 防火墙可能会阻止端口 8000 的入站连接。需要配置防火墙以允许连接。

#### 方法 A：使用配置脚本（推荐）

以**管理员身份**运行防火墙配置脚本：

```cmd
scripts\windows\configure-firewall.bat
```

此脚本会自动添加防火墙规则，允许端口 8000 的 TCP 入站连接。

#### 方法 B：手动配置

1. 打开 **Windows 安全中心** > **防火墙和网络保护**
2. 点击 **高级设置** > **入站规则** > **新建规则**
3. 选择 **端口** > 下一步
4. 选择 **TCP** > 输入端口 **8000** > 下一步
5. 选择 **允许连接** > 下一步
6. 全部勾选（域、专用、公用）> 下一步
7. 输入名称（如 "SeeForMe Server"）> 完成

#### 方法 C：使用命令行（需要管理员权限）

```cmd
netsh advfirewall firewall add rule name="SeeForMe Server" dir=in action=allow protocol=TCP localport=8000
```

### 3. 确保设备在同一网络

- **同一 WiFi**：确保服务器和客户端连接到同一个 WiFi 网络
- **手机热点**：如果使用手机热点，确保服务器连接到手机开启的热点

### 4. 客户端配置

在移动端应用中配置服务器地址：

- **HTTP 地址**: `http://[服务器IP]:8000`
- **WebSocket 地址**: `ws://[服务器IP]:8000/ws`

例如，如果服务器 IP 是 `192.168.1.100`，则：
- HTTP: `http://192.168.1.100:8000`
- WebSocket: `ws://192.168.1.100:8000/ws`

### 5. 验证连接

启动服务器后，可以通过以下方式验证服务器是否正常运行：

1. **健康检查端点**：
   ```bash
   curl http://[服务器IP]:8000/api/v1/health
   ```
   或使用浏览器访问：`http://[服务器IP]:8000/api/v1/health`

2. **检查日志**：服务器启动时会显示详细的连接信息和端点地址

### 6. 常见问题

**Q: 无法连接到服务器**
- 检查防火墙是否允许端口 8000
- 确认服务器和客户端在同一网络
- 确认服务器 IP 地址是否正确
- 检查服务器是否正在运行（查看终端输出）

**Q: 只能本地连接，其他设备无法连接**
- 确保服务器监听在 `0.0.0.0` 而不是 `127.0.0.1`
- 检查防火墙配置
- 检查路由器是否阻止了局域网通信

**Q: 在校园网/企业网中无法连接（客户端隔离问题）**

校园网和企业网通常启用了**客户端隔离（Client Isolation）**功能，这会阻止同一网络内设备之间的直接通信。即使服务器和客户端都在同一 WiFi 下，也无法直接连接。

**解决方案（按推荐程度排序）：**

1. **使用内网穿透工具（推荐）**
   - **ngrok**（最简单）：
     ```bash
     # 安装 ngrok: https://ngrok.com/download
     # 配置 authtoken: ngrok config add-authtoken <your-token>
     # 启动隧道
     ngrok http 8000
     # 使用 ngrok 提供的公网 URL 连接
     ```
     或使用提供的脚本：
     ```cmd
     scripts\windows\setup-ngrok-tunnel.bat
     ```
   
   - **frp**（需要自建服务器）：
     - 需要一台有公网 IP 的服务器
     - 配置 frp 服务器端和客户端
     - 适合长期使用

2. **使用手机热点（临时方案）**
   - 将服务器和客户端都连接到手机开启的热点
   - 手机热点通常没有客户端隔离限制
   - 适合临时测试使用

3. **联系网络管理员（通常无效）**
   - 请求关闭客户端隔离（通常不会被批准）
   - 申请端口开放（需要审批流程）

**Q: 如何修改服务器端口**
- 修改 `server/config/app.yaml` 中的 `server.port` 值
- 或设置环境变量 `PORT=新端口号`
- 同时需要更新防火墙规则中的端口号

## 目录结构

```
server/
├── app/                    # FastAPI 应用主代码目录
│   ├── main.py            # 应用入口
│   │
│   ├── api/               # 对外暴露的 API 接口层
│   │   ├── dependencies.py # 依赖注入
│   │   └── v1/            # API v1 版本命名空间
│   │       ├── endpoints/ # HTTP 路由
│   │       └── websockets/ # WebSocket 路由
│   │
│   ├── core/              # 核心配置与基础设施
│   │   ├── config.py      # 应用配置
│   │   ├── middleware.py  # 自定义中间件
│   │   └── security.py    # 安全相关逻辑
│   │
│   ├── models/            # 数据模型层
│   │   ├── database/      # 数据库相关初始化
│   │   └── schemas/       # Pydantic 模型（请求/响应体）
│   │
│   ├── services/          # 业务服务层
│   │   ├── audio_service.py      # 音频处理服务
│   │   ├── vision_service.py     # 视觉处理服务（整合视觉检测和语言生成）
│   │   ├── websocket_manager.py  # WebSocket 连接管理
│   │   └── ai_models/     # AI 模型适配层
│   │       ├── __init__.py       # 模块导出
│   │       ├── base.py            # AI 模型基类
│   │       ├── vision/            # 视觉模型适配器
│   │       │   ├── __init__.py
│   │       │   ├── base_vision.py      # 视觉模型基类
│   │       │   ├── yolov8_adapter.py   # YOLOv8n 适配器（目标检测）
│   │       │   ├── blip2_adapter.py    # BLIP-2 适配器（图像描述）
│   │       │   └── clip_adapter.py     # CLIP 适配器（图像理解）
│   │       ├── language/          # 语言模型适配器
│   │       │   ├── __init__.py
│   │       │   ├── base.py             # 语言模型基类
│   │       │   └── flan_t5_adapter.py  # Flan-T5-small 适配器（文本生成）
│   │       ├── pipelines/          # AI 模型流水线
│   │       │   ├── __init__.py
│   │       │   └── vision_to_text.py   # 视觉到文本的完整流程
│   │       └── tts/                 # Text-to-Speech 相关
│   │           ├── __init__.py
│   │           ├── base_tts.py         # TTS 模型基类
│   │           ├── edge_tts_adapter.py  # Edge TTS 适配器
│   │           └── vits_adapter.py     # VITS 适配器
│   │
│   ├── utils/             # 通用工具函数
│   │   ├── audio_utils.py # 音频处理工具
│   │   ├── image_utils.py # 图像处理工具
│   │   └── logger.py      # 日志封装
│   │
│   └── tests/             # 测试代码目录
│       ├── conftest.py    # pytest 共享配置
│       └── test_services/ # 服务层测试
│
├── server-env/            # Python 虚拟环境目录
├── prompts/               # 提示词配置文件目录
│   ├── vision_description.yaml  # 视觉描述场景提示词
│   ├── object_detection.yaml     # 目标检测场景提示词
│   └── README.md                # 提示词配置说明
├── Dockerfile             # Docker 镜像构建配置
├── docker-compose.yml     # Docker Compose 编排配置
├── requirements.txt       # Python 依赖清单
├── AI_MODELS_README.md    # AI 模型详细使用说明文档
└── INTEGRATION_STATUS.md  # 移动端与服务器端集成状态
```

## 目录用途说明

### `app/main.py`
- **用途**：应用入口
- **存放内容**：
  - 创建 FastAPI 实例
  - 挂载 HTTP 和 WebSocket 路由
  - 配置中间件
  - 启动时模型预热（可选，减少首次请求延迟）

### `app/api/`
- **用途**：对外暴露的 API 接口层
- **存放内容**：
  - `dependencies.py`：接口中用到的依赖注入（配置、数据库会话等）
  - `v1/endpoints/`：HTTP 路由定义（如健康检查、业务接口等）
  - `v1/websockets/`：WebSocket 路由定义
    - `main.py`：主 WebSocket 端点（`/ws`），处理移动端连接和图像数据
    - `vision.py`：视觉专用 WebSocket 端点（`/ws/vision/{session_id}`），支持二进制图像流

### `app/core/`
- **用途**：核心配置与基础设施
- **存放内容**：
  - `config.py`：应用配置（环境变量、模型路径、服务端口等）
    - `VisionConfig`：视觉模型配置类（YOLOv8 参数、ONNX 设置、置信度阈值等）
    - `LanguageConfig`：语言模型配置类（Flan-T5 参数、超时设置、GPU 配置等）
    - `Settings`：应用主配置类，支持环境变量覆盖
  - `middleware.py`：自定义中间件（日志、CORS、异常处理等）
  - `security.py`：安全相关逻辑（鉴权、Token 校验等）

### `app/models/`
- **用途**：数据模型层
- **存放内容**：
  - `database/`：数据库相关初始化（ORM 配置、连接池等）
  - `schemas/`：Pydantic 模型，定义请求/响应数据结构（音频、视觉相关等）

### `app/services/`
- **用途**：业务服务层（真正的业务逻辑）
- **存放内容**：
  - `audio_service.py`：音频处理相关服务（转码、队列处理等）
  - `vision_service.py`：视觉处理服务，整合视觉检测和语言生成流程，支持流式处理
  - `websocket_manager.py`：管理 WebSocket 连接（连接注册、广播、关闭等）
  - `ai_models/`：AI 模型适配层
    - `base.py`：AI 模型基类，统一接口规范
    - `vision/`：视觉模型适配器
      - `base_vision.py`：视觉模型基类接口
      - `yolov8_adapter.py`：YOLOv8n 目标检测适配器（支持 ONNX 优化）
      - `blip2_adapter.py`：BLIP-2 图像描述适配器
      - `clip_adapter.py`：CLIP 图像理解适配器
    - `language/`：语言模型适配器
      - `base.py`：语言模型基类接口
      - `flan_t5_adapter.py`：Flan-T5-small 文本生成适配器（轻量级，支持超时回退）
    - `pipelines/`：AI 模型流水线
      - `vision_to_text.py`：视觉到文本的完整处理流程，整合视觉检测和语言生成
    - `tts/`：Text-to-Speech 相关适配器
      - `base_tts.py`：TTS 模型基类接口
      - `edge_tts_adapter.py`：Edge TTS 适配器
      - `vits_adapter.py`：VITS 适配器

### `app/utils/`
- **用途**：通用工具函数
- **存放内容**：
  - `audio_utils.py`：音频处理辅助函数
  - `image_utils.py`：图像处理辅助函数
  - `logger.py`：统一日志封装

### `app/tests/`
- **用途**：测试代码目录
- **存放内容**：
  - `conftest.py`：pytest 的共享配置和 fixture
  - `test_services/`：服务层测试用例

### `prompts/`
- **用途**：提示词配置文件目录（位于 server 根目录）
- **存放内容**：
  - `vision_description.yaml`：视觉描述场景的提示词模板
  - `object_detection.yaml`：目标检测场景的提示词模板
  - `README.md`：提示词配置说明文档
- **说明**：所有提示词配置文件统一存放在此目录，便于管理和修改。支持多场景、多模板配置。

## 各层职责总结

- **`api/`**：只负责「对外协议」——路由定义、参数校验、调用对应 service，不写复杂业务逻辑
- **`services/`**：真正的业务核心，组织调用 AI 模型、工具函数、数据库等
- **`models/schemas/`**：定义清晰的输入/输出数据结构，保证接口稳定
- **`ai_models/`**：把不同底层模型封装成统一接口，方便替换和组合
- **`utils/`**：纯工具函数，不依赖具体业务场景，可以在多个模块中复用

---

## AI 模型服务

### 视觉模型：YOLOv8n

#### 模型信息

- **模型名称**：YOLOv8n (YOLOv8 Nano)
- **模型类型**：目标检测（Object Detection）
- **支持格式**：PyTorch (.pt) / ONNX (.onnx)
- **检测类别**：COCO 数据集 80 类（人、车、动物、家具等）
- **模型大小**：~6MB

#### 性能指标

- **推理时间**：≤200ms（ONNX 模式，CPU）
- **输入尺寸**：640×640 像素（自动缩放和填充）
- **置信度阈值**：默认 0.25（可配置）
- **IOU 阈值**：默认 0.45（可配置）

#### 依赖要求

```python
ultralytics==8.0.0          # YOLOv8 模型库
onnxruntime>=1.15.0         # ONNX 推理引擎（CPU版）
# 或 onnxruntime-gpu>=1.15.0  # GPU 版本（需要 CUDA）
opencv-python>=4.7.0        # 图像处理
numpy>=1.24.0               # 数值计算
pillow>=9.5.0               # 图像处理
```

#### 配置说明

在 `app/core/config.py` 中配置：

```python
class VisionConfig:
    YOLO_MODEL_PATH: str = "yolov8n.pt"           # 模型文件路径
    YOLO_USE_ONNX: bool = True                     # 是否使用 ONNX 优化
    YOLO_CONFIDENCE_THRESHOLD: float = 0.25        # 置信度阈值
    YOLO_IOU_THRESHOLD: float = 0.45               # IOU 阈值
    MAX_CONCURRENT_REQUESTS: int = 10              # 最大并发请求数
    MODEL_WARMUP: bool = True                      # 启动时预热模型
```

#### 使用方式

**1. 直接使用适配器**

```python
from app.services.ai_models.vision import YOLOv8nAdapter

# 创建适配器实例
vision_model = YOLOv8nAdapter(
    model_path="yolov8n.pt",
    use_onnx=True,
    confidence_threshold=0.25,
    iou_threshold=0.45
)

# 执行检测
result = await vision_model.describe(image_bytes)
```

**2. 通过视觉服务**

```python
from app.services.vision_service import VisionService

vision_service = VisionService()

# 同步接口
description = await vision_service.describe_image(image_bytes)

# 流式接口
async for result in vision_service.process_image_stream(image_bytes, session_id):
    print(result)
```

#### 返回结果类型

**视觉检测结果** (`vision_result`)

```python
{
    "type": "vision_result",
    "session_id": "session_123",
    "data": {
        "detections": [
            {
                "class": "person",              # 类别名称（英文）
                "class_id": 0,                  # 类别 ID（COCO 类别索引）
                "confidence": 0.95,              # 置信度（0-1）
                "bbox": [100.5, 200.3, 300.7, 500.9]  # 边界框 [x1, y1, x2, y2]（像素坐标）
            },
            # ... 更多检测结果
        ],
        "inference_time": 0.15,                 # 推理耗时（秒）
        "detection_count": 2                   # 检测到的物体数量
    },
    "timestamp": 1234567890.123
}
```

**检测结果字段说明**：

- `class` (str): 物体类别名称，如 "person", "car", "dog" 等
- `class_id` (int): COCO 数据集类别 ID（0-79）
- `confidence` (float): 检测置信度，范围 0-1
- `bbox` (List[float]): 边界框坐标 `[x1, y1, x2, y2]`，单位为像素
- `inference_time` (float): 模型推理耗时（秒）
- `detection_count` (int): 检测到的物体总数

#### 支持的检测类别

YOLOv8n 支持 COCO 数据集的 80 个类别，包括：

- **人物**：person
- **车辆**：bicycle, car, motorcycle, airplane, bus, train, truck, boat
- **动物**：bird, cat, dog, horse, sheep, cow, elephant, bear, zebra, giraffe
- **家具**：chair, couch, bed, dining table, toilet
- **电子设备**：tv, laptop, mouse, remote, keyboard, cell phone
- **食物**：banana, apple, sandwich, orange, broccoli, carrot, hot dog, pizza, donut, cake
- **其他**：bottle, cup, fork, knife, spoon, bowl, book, clock, vase, scissors 等

完整列表请参考 [COCO 数据集类别](https://cocodataset.org/#explore)。

#### 性能优化

1. **ONNX 优化**：首次运行会自动导出 ONNX 模型，后续使用 ONNX 推理速度更快
2. **GPU 加速**：安装 `onnxruntime-gpu` 可启用 GPU 加速
3. **模型预热**：启动时自动预热模型，减少首次请求延迟
4. **批量处理**：支持并发处理多个请求（默认最大 10 个）

---

### 语言模型：Flan-T5-small

#### 模型信息

- **模型名称**：google/flan-t5-small
- **模型类型**：文本生成（Text Generation）
- **模型架构**：T5 (Text-To-Text Transfer Transformer)
- **参数量**：~60M
- **模型大小**：~240MB

#### 性能指标

- **响应时间**：≤100ms（GPU）或 ≤200ms（CPU）
- **最大输出长度**：默认 100 tokens（可配置）
- **超时回退**：超过 100ms 自动使用模板回退
- **支持语言**：中文、英文等多语言

#### 依赖要求

```python
transformers>=4.30.0        # Hugging Face 模型库
torch>=2.0.0                # PyTorch 深度学习框架
accelerate>=0.20.0          # 推理加速库
sentencepiece>=0.1.99       # T5 tokenizer 依赖
```

#### 配置说明

在 `app/core/config.py` 中配置：

```python
class LanguageConfig:
    MODEL_NAME: str = "google/flan-t5-small"     # 模型名称或路径
    MAX_RESPONSE_LENGTH: int = 100               # 最大响应长度（tokens）
    RESPONSE_TIMEOUT: float = 0.1                # 响应超时时间（秒）
    USE_GPU: bool = True                         # 是否使用 GPU
    BATCH_SIZE: int = 1                         # 批处理大小（实时处理为 1）
```

#### 使用方式

**1. 直接使用适配器**

```python
from app.services.ai_models.language import FlanT5SmallAdapter

# 创建适配器实例
language_model = FlanT5SmallAdapter(
    model_name="google/flan-t5-small",
    max_response_length=100,
    response_timeout=0.1,
    use_gpu=True
)

# 生成描述
detections = [
    {"class": "person", "confidence": 0.95, "bbox": [100, 200, 300, 500]},
    {"class": "car", "confidence": 0.88, "bbox": [400, 300, 600, 500]}
]
description = await language_model.generate_description(detections)
```

**2. 通过视觉服务（自动调用）**

视觉服务会自动调用语言模型生成描述，无需手动调用。

#### 返回结果类型

**流式文本结果** (`text_stream`)

```python
{
    "type": "text_stream",
    "session_id": "session_123",
    "content": "图像中有一个人和一辆汽车。",  # 单个句子
    "is_final": False,                          # 是否为最后一句
    "timestamp": 1234567890.123
}
```

**最终结果** (`final_result`)

```python
{
    "type": "final_result",
    "session_id": "session_123",
    "content": "图像中有一个人和一辆汽车。",   # 完整描述文本
    "vision_time": 0.15,                        # 视觉检测耗时（秒）
    "language_time": 0.08,                      # 语言生成耗时（秒）
    "total_time": 0.23,                         # 总耗时（秒）
    "detection_count": 2,                       # 检测到的物体数量
    "timestamp": 1234567890.123
}
```

**错误结果** (`error`)

```python
{
    "type": "error",
    "session_id": "session_123",
    "content": "处理失败: 具体错误信息",
    "timestamp": 1234567890.123
}
```

#### 输出格式说明

- **自然语言描述**：简洁流畅的中文描述，适合语音播报
- **长度限制**：默认不超过 100 tokens（约 50-70 个中文字）
- **格式规范**：以句号结尾，多个句子用句号分隔
- **超时处理**：如果生成时间超过 100ms，自动使用模板化描述

#### 示例输出

**输入检测结果**：
```python
[
    {"class": "person", "confidence": 0.95},
    {"class": "car", "confidence": 0.88},
    {"class": "dog", "confidence": 0.75}
]
```

**输出描述**：
```
"图像中有一个人、一辆汽车和一只狗。"
```

**超时回退示例**：
```
"图像中有3个物体，包括人、汽车和狗。"
```

#### 性能优化

1. **GPU 加速**：自动检测并使用 GPU（如果可用）
2. **量化推理**：使用 float16 精度减少内存占用
3. **超时回退**：超过时间限制自动使用模板，保证响应速度
4. **模型预热**：启动时预热模型，减少首次请求延迟

---

## 完整处理流程

### 视觉到文本流水线

`VisionToTextPipeline` 整合了视觉检测和语言生成，提供端到端的处理流程：

```python
from app.services.ai_models.pipelines import VisionToTextPipeline

pipeline = VisionToTextPipeline()

# 流式处理
async for result in pipeline.process_image_stream(image_bytes, session_id):
    if result["type"] == "vision_result":
        # 视觉检测结果
        print(f"检测到 {result['data']['detection_count']} 个物体")
    elif result["type"] == "text_stream":
        # 流式文本
        print(result["content"])
    elif result["type"] == "final_result":
        # 最终结果
        print(f"完整描述: {result['content']}")
```

### 处理流程说明

1. **图像预处理**：解码图像、格式转换、尺寸调整
2. **视觉检测**：YOLOv8n 模型推理，检测物体
3. **结果过滤**：根据置信度和 IOU 阈值过滤检测结果
4. **语言生成**：根据检测结果生成自然语言描述
5. **流式返回**：按句子拆分，流式返回结果

### 性能指标

- **视觉检测**：≤200ms
- **语言生成**：≤100ms
- **总处理时间**：≤300ms（理想情况）
- **并发能力**：≥10 QPS

---

## WebSocket API

### 主 WebSocket 端点 (`/ws`)

**连接方式**：
```javascript
const ws = new WebSocket('ws://localhost:8000/ws');
```

**发送图像数据**：
```json
{
  "eventType": "image_data",
  "sessionId": "session_123",
  "data": {
    "image": "base64_encoded_image_data"
  }
}
```

**接收响应**：
- `processing` - 处理中
- `text_stream` - 流式文本结果
- `final_result` - 最终结果
- `error` - 错误信息

### 视觉专用 WebSocket (`/ws/vision/{session_id}`)

**连接方式**：
```javascript
const ws = new WebSocket('ws://localhost:8000/ws/vision/session_123');
```

**发送数据**：
- **方式1**：直接发送二进制图像数据
- **方式2**：发送 JSON `{"image": "base64_encoded_image_data"}`

**接收响应**：
- `vision_result` - 视觉检测结果（可选）
- `text_stream` - 流式文本结果
- `final_result` - 最终结果
- `error` - 错误信息

---

## 配置与环境变量

本项目的服务端配置由 **`server/config/app.yaml` + 环境变量 + `.env` 文件** 共同组成，整体遵循以下优先级：

> **环境变量 > `.env` > `server/config/app.yaml` > 代码默认值**

换句话说：

- **只改 `app.yaml` 就能覆盖的大部分行为不算“依赖环境变量”**；
- 只有在必须区分不同部署环境、或涉及敏感信息（如 API Key）时，才通过环境变量进行覆盖。

### 1. `server/config/app.yaml`（主配置）

`app.yaml` 是推荐的主配置文件，包含：

- **服务器配置（server）**
  - `server.host`：默认 `"0.0.0.0"`
  - `server.port`：默认 `8000`
  - `server.reload`：默认 `false`
  - 这些值会在启动时写入环境变量 `HOST` / `PORT` / `RELOAD`（仅当环境变量未显式设置时），
    然后由 `Settings` 读取。因此：
    - **通常情况下，只改 `app.yaml.server.*` 就能统一控制 HOST/PORT/RELOAD；**
    - 在生产环境中，如需特殊端口/Host，可显式设置环境变量 `HOST` / `PORT` 覆盖。

- **视觉模型配置（vision）**
  - `vision.yolo.model_path`
  - `vision.yolo.use_onnx`
  - `vision.yolo.confidence_threshold`
  - `vision.yolo.iou_threshold`
  - `vision.max_concurrent_requests`
  - `vision.model_warmup`
  - 启动时，这些值会被写入以下环境变量（仅在未显式设置时）：
    - `VISION_YOLO_MODEL_PATH`
    - `VISION_YOLO_USE_ONNX`
    - `VISION_YOLO_CONFIDENCE_THRESHOLD`
    - `VISION_YOLO_IOU_THRESHOLD`
    - `VISION_MAX_CONCURRENT_REQUESTS`
    - `VISION_MODEL_WARMUP`
  - 然后由 `VisionConfig`（前缀 `VISION_`）读取。
  - **因此：只改 `app.yaml` 即可改所有视觉参数，除非你主动在部署环境里设置了对应的 `VISION_...` 环境变量来覆盖。**

- **语言模型配置（language）**
  - `language.mode`：`template | qwen_local | qwen_cloud`
  - `language.qwen_local.*`：本地/兼容接口配置（base_url、model_name、max_tokens、temperature、api_key 等）
  - `language.qwen_cloud.*`：云端 Qwen 配置（base_url、model_name、max_tokens、temperature、api_key 等）
  - `language.prompts.*`：提示词目录/场景/模板等
  - 这些配置会在启动时直接被解析为 `Settings.language`，**默认不依赖环境变量**；
  - 注意：只有在 `mode == qwen_cloud` 时，才会使用环境变量 `QWEN_API_KEY` 覆盖 `language.qwen_cloud.api_key`。

> 总结：**不涉及敏感信息的行为参数（模型路径、阈值、并发、提示词等），全部以 `app.yaml` 为唯一来源；
> 只有少量“部署相关/安全相关”选项才允许由环境变量覆盖。**

### 2. 环境变量与 `.env`（覆盖层）

可以通过系统环境变量，或在 `server/` 目录下创建 `.env` 文件，为以下字段提供覆盖：

#### 2.1 服务器配置（可覆盖 `app.yaml.server`）

```env
# 服务器配置（若设置，则覆盖 app.yaml.server.*）
HOST=0.0.0.0
PORT=8000
RELOAD=false
```

- **依赖逻辑**：
  - 若设置了环境变量，则直接使用环境变量；
  - 否则使用 `app.yaml.server.*` 中的值；
  - 若 `app.yaml` 也不存在，则退回代码默认值。

#### 2.2 视觉模型配置（仅依赖 `app.yaml.vision`）

- YOLO 模型路径、是否使用 ONNX、置信度/IOU 阈值、最大并发、是否预热等**全部来自 `server/config/app.yaml` 中的 `vision` 段**；
- 不再提供对应的环境变量覆盖项，如需调整，请直接修改 `app.yaml` 并重启服务。

#### 2.3 语言模型配置（仅 API Key 依赖环境变量）

```env
# 仅在 language.mode == qwen_cloud 时生效，用于覆盖 app.yaml.language.qwen_cloud.api_key
QWEN_API_KEY=your-real-cloud-api-key
```

- 逻辑说明：
  - `language.mode`、base_url、model_name、max_tokens、temperature 等 **全部由 `app.yaml` 控制**；
  - 当且仅当 `mode == "qwen_cloud"` 时，才会按如下优先级解析 `QWEN_API_KEY`：
    1. 环境变量 `QWEN_API_KEY`
    2. `app.yaml.language.qwen_cloud.api_key`
    3. `app.yaml.language.qwen_local.api_key`（可选占位，方便本地调试）
    4. 默认 `""`（空字符串）
  - 在 `qwen_local` / `template` 等其它模式下，**不会读取环境变量 QWEN_API_KEY**，只使用 `app.yaml` 中的配置，避免互相干扰。

### 3. 模型文件位置

- **YOLOv8n**：`~/.cache/ultralytics/` 或当前目录
- **Flan-T5-small**：`~/.cache/huggingface/transformers/`

---

## 故障排查

### 模型加载失败

**问题**：首次运行时模型下载失败

**解决方案**：
1. 检查网络连接
2. 检查磁盘空间（至少 500MB）
3. 手动下载模型到缓存目录

### 推理速度慢

**问题**：处理时间超过预期

**解决方案**：
1. 确认使用 ONNX 模式（`YOLO_USE_ONNX=true`）
2. 检查是否启用 GPU（如果可用）
3. 降低图像分辨率（如果可能）
4. 减少并发请求数

### 内存不足

**问题**：运行时内存溢出

**解决方案**：
1. 减少 `MAX_CONCURRENT_REQUESTS`
2. 使用 CPU 模式（`USE_GPU=false`）
3. 使用更小的模型（如果可用）

### 语言模型超时

**问题**：语言生成总是超时，使用模板回退

**解决方案**：
1. 增加 `RESPONSE_TIMEOUT` 值（但会影响响应速度）
2. 启用 GPU 加速
3. 使用更小的模型或量化版本

---

## 开发说明

### 添加新的视觉模型

1. 在 `app/services/ai_models/vision/` 创建新适配器
2. 继承 `BaseVisionModel` 基类
3. 实现 `describe(image_bytes: bytes)` 方法
4. 在 `vision/__init__.py` 中导出

### 添加新的语言模型

1. 在 `app/services/ai_models/language/` 创建新适配器
2. 继承 `BaseLanguageModel` 基类
3. 实现 `generate_description(detections: List[Dict])` 方法
4. 在 `language/__init__.py` 中导出

### 测试

```bash
# 运行测试
pytest app/tests/

# 运行特定测试
pytest app/tests/test_services/test_vision_service.py
```

---

## 更多信息

- 详细的模型使用说明请参考：[AI_MODELS_README.md](./AI_MODELS_README.md)
- API 文档：启动服务后访问 `http://localhost:8000/docs`
- 项目结构说明：见上方目录结构章节

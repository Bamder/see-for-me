# SeeForMe

一个基于 AI 的视觉辅助应用，帮助用户通过相机实时识别周围环境并生成自然语言描述。

## ✨ 功能特性

- 📸 **实时图像识别**：通过移动端相机拍摄，实时识别场景中的物体
- 🤖 **AI 视觉理解**：使用 YOLOv8n 进行目标检测，Qwen2.5-7B 生成自然语言描述
- 🔊 **语音播报**：支持离线 TTS（PaddleSpeech Lite）和系统 TTS
- 🔄 **实时通信**：基于 WebSocket 的实时双向通信
- 🎯 **手势控制**：支持长按、双击等手势触发拍照
- ⚙️ **灵活配置**：支持在线切换服务器地址和 Mock 模式

## 🏗️ 项目结构

```
see-for-me/
├── mobile/              # 移动端应用（React Native + Expo）
│   ├── src/            # 业务代码
│   │   ├── modules/    # 核心业务模块
│   │   ├── screens/    # 页面组件
│   │   ├── components/ # UI 组件
│   │   └── ...
│   └── assets/         # 静态资源（包括 TTS 模型）
├── server/             # 服务器端（FastAPI）
│   ├── app/            # 应用代码
│   │   ├── api/        # API 接口
│   │   ├── services/   # 业务服务（AI 模型）
│   │   └── ...
│   ├── config/         # 配置文件
│   └── models/         # AI 模型文件
└── README.md           # 项目说明（本文件）
```

## 🚀 快速开始

### 环境要求

**移动端**
- Node.js 18+
- npm 或 yarn
- Android Studio（Android 开发）
- Expo CLI

**服务器端**
- Python 3.8+
- 内存：最小 2GB，推荐 4GB+（使用 GPU 时）
- 磁盘空间：至少 500MB（用于模型文件）

### 安装步骤

#### 1. 克隆项目

```bash
git clone <repository-url>
cd see-for-me
```

#### 2. 安装移动端依赖

```bash
cd mobile
npm install
```

#### 3. 安装服务器端依赖

```bash
cd server
pip install -r requirements.txt
```

#### 4. 配置模型文件

**服务器端模型**（可选，首次运行会自动下载）
- YOLOv8n 模型会自动下载到 `server/models/` 目录

**移动端 TTS 模型**（可选，用于离线语音合成）
- 参考 `mobile/assets/tts-models/README.md` 配置 PaddleSpeech Lite 模型

### 启动服务

#### 启动服务器

**Windows:**
```bash
cd server
scripts\windows\start-server.bat
```

**Linux/WSL:**
```bash
cd server
scripts/wsl/start-server.sh
```

**手动启动:**
```bash
cd server
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```

服务器启动后会显示本机 IP 地址，例如：
```
📡 网络连接信息
本机 IP 地址: 192.168.1.100

📱 移动端连接地址:
  HTTP:  http://192.168.1.100:8000
  WebSocket: ws://192.168.1.100:8000/ws
```

#### 启动移动端

**开发模式:**
```bash
cd mobile
npm start
# 或
npx expo start
```

**Android 构建:**
```bash
cd mobile
npm run android
```

**使用启动脚本（推荐）:**
```bash
cd mobile
scripts\dev\start-dev.bat  # Windows
```

启动脚本会自动：
- 检测本机 IP 地址
- 配置环境变量
- 启动开发服务器

## ⚙️ 配置说明

### 服务器配置

编辑 `server/config/app.yaml`：

```yaml
server:
  host: "0.0.0.0"
  port: 8000

vision:
  yolo:
    model_path: "models/yolov8n.onnx"
    use_onnx: true

language:
  mode: "qwen_local"  # template | qwen_local | qwen_cloud
  qwen_local:
    base_url: "http://localhost:8001"
```

### 移动端配置

**方式一：启动脚本自动配置**
- 运行 `mobile/scripts/dev/start-dev.bat`，脚本会自动设置服务器地址

**方式二：应用内设置**
- 打开应用设置页面
- 输入服务器 HTTP 和 WebSocket 地址
- 支持在线切换，无需重启

**方式三：环境变量**
```bash
export EXPO_PUBLIC_SERVER_URL=http://192.168.1.100:8000
export EXPO_PUBLIC_WS_URL=ws://192.168.1.100:8000/ws
```

## 🌐 网络连接

### 确保设备在同一网络

- **同一 WiFi**：服务器和手机连接到同一个 WiFi
- **手机热点**：服务器连接到手机开启的热点

### 防火墙配置（Windows）

以管理员身份运行：
```cmd
server\scripts\windows\configure-firewall.bat
```

或手动添加防火墙规则，允许端口 8000 的 TCP 入站连接。

### 验证连接

1. **健康检查**：
   ```bash
   curl http://[服务器IP]:8000/api/v1/health
   ```

2. **查看服务器日志**：启动时会显示连接信息

3. **移动端日志**：应用启动时会输出服务器配置信息

## 📱 使用说明

### 基本流程

1. **启动服务器**：确保服务器运行在端口 8000
2. **启动移动端**：运行应用，确保连接到服务器
3. **拍照识别**：
   - 长按屏幕任意位置
   - 或点击底部拍照按钮
4. **查看结果**：识别结果会显示在底部字幕区域
5. **语音播报**：如果启用 TTS，会自动播放识别结果

### 手势控制

- **长按屏幕**：触发拍照和识别
- **双击屏幕**：切换功能（可配置）

## 🔧 开发指南

### 移动端开发

```bash
cd mobile
npm start          # 启动开发服务器
npm run android    # 构建并运行 Android 应用
npm run lint       # 代码检查
```

详细文档：`mobile/README.md`

### 服务器端开发

```bash
cd server
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

详细文档：`server/README.md`

## 📦 技术栈

### 📱 移动端

**核心框架**
- React Native `0.81.5` + Expo `~54.0.30` + TypeScript `~5.9.2`
- React Navigation + Reanimated（导航和动画）

**主要功能模块**
- Expo Camera（相机）
- ONNX Runtime（PaddleSpeech TTS 模型推理）
- WebSocket + Fetch API（网络通信）
- Zustand（状态管理）

**开发工具**
- ESLint + TypeScript
- Gradle（Android 构建）
- EAS Build（云端构建）

### 🖥️ 服务器端

**Web 框架**
- FastAPI + Uvicorn（ASGI 服务器）
- WebSockets（实时通信）
- Pydantic（数据验证）

**AI 模型**
- **视觉**：YOLOv8n（ONNX Runtime）+ OpenCV + NumPy
- **语言**：Qwen2.5-7B-Instruct（PyTorch + Transformers）
- **可选**：llama.cpp / vLLM（本地 LLM 推理）

**工具库**
- PyYAML（配置管理）
- python-dotenv（环境变量）

### 🛠️ 开发工具

- **Node.js** + npm（移动端）
- **Python 3.8+** + pip（服务器端）
- **Docker**（容器化部署）
- **ngrok**（内网穿透，开发调试）

## 📊 主要依赖版本

| 类别 | 技术 | 版本 |
|------|------|------|
| 移动端 | React Native | 0.81.5 |
| | React | 19.1.0 |
| | Expo | ~54.0.30 |
| | TypeScript | ~5.9.2 |
| 服务器端 | Python | 3.8+ |
| | FastAPI | 最新版 |
| | PyTorch | >=2.0.0 |
| | ONNX Runtime | >=1.15.0 |
| | Ultralytics | ==8.0.0 |

## 🌐 网络配置

- **端口 8000**：服务器 HTTP/WebSocket
- **端口 8001**：本地 LLM 服务（可选）
- **端口 8081**：Expo 开发服务器

## ❓ 常见问题

### Q: 移动端无法连接到服务器

**检查清单：**
1. ✅ 服务器是否正在运行（端口 8000）
2. ✅ IP 地址是否正确（使用 `ipconfig`/`ifconfig` 查看）
3. ✅ 防火墙是否允许端口 8000
4. ✅ 手机和电脑是否在同一网络
5. ✅ 服务器是否监听在 `0.0.0.0`（不是 `127.0.0.1`）

**解决方案：**
- 查看移动端启动日志中的服务器配置信息
- 在设置页面手动输入正确的服务器地址
- 使用 `mobile/scripts/dev/start-dev.bat` 自动配置

### Q: 模型下载失败

**YOLOv8n 模型：**
- 模型会自动下载到 `server/models/` 目录
- 如果下载失败，检查网络连接或手动下载

**TTS 模型：**
- 参考 `mobile/assets/tts-models/README.md`
- 模型文件需要手动放置到指定目录

### Q: 识别结果不准确

- 调整 `server/config/app.yaml` 中的置信度阈值
- 确保图像清晰，光线充足
- 检查模型是否正确加载

### Q: 开发环境问题

**Expo Go 无法使用原生模块：**
- 使用开发构建（Development Build）
- 运行 `mobile/scripts/dev/build-android-gradle.bat`

**服务器启动失败：**
- 检查 Python 版本（需要 3.8+）
- 确认所有依赖已安装
- 查看错误日志

## 📚 相关文档

- [移动端开发文档](mobile/README.md)
- [服务器端开发文档](server/README.md)
- [TTS 模型配置](mobile/assets/tts-models/README.md)
- [提示词配置](server/prompts/PROMPTS_USAGE.md)

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 许可证

[添加许可证信息]

---

*最后更新：2024年*

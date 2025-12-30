# PaddleSpeech Lite TTS 模型文件要求

本文档说明 PaddleSpeech Lite 中文语音合成模型所需的文件结构和要求。

## 📁 目录结构

模型文件必须按照以下目录结构放置：

```
mobile/assets/tts-models/paddlespeech-lite/
├── acoustic/          # 声学模型（必需）
│   ├── config.json
│   ├── model.onnx
│   └── phone_id_map.txt
├── frontend/          # 文本前端模型（可选）
│   ├── config.json
│   └── model.onnx
└── vocoder/           # 声码器模型（必需）
    ├── config.json
    └── model.onnx
```

## 📋 文件要求

### 必需文件

#### 1. 声学模型（Acoustic Model）- `acoustic/`
- **`config.json`** - 声学模型配置文件（JSON 格式）
- **`model.onnx`** - 声学模型文件（ONNX 格式，必需）
- **`phone_id_map.txt`** - 音素到 ID 的映射文件（推荐，用于文本预处理）

#### 2. 声码器（Vocoder）- `vocoder/`
- **`config.json`** - 声码器配置文件（JSON 格式）
- **`model.onnx`** - 声码器模型文件（ONNX 格式，必需）

### 可选文件

#### 3. 文本前端（Frontend）- `frontend/`
- **`config.json`** - 前端配置文件（JSON 格式）
- **`model.onnx`** - 前端模型文件（ONNX 格式）

> **注意**：如果前端模型不存在，系统会使用代码实现的前端处理逻辑，功能不受影响。

## 🔍 文件验证

应用启动时会自动检查以下文件：

- ✅ `acoustic/config.json` - 必需
- ✅ `acoustic/model.onnx` - 必需
- ✅ `vocoder/config.json` - 必需
- ✅ `vocoder/model.onnx` - 必需
- ⚠️ `frontend/config.json` - 可选
- ⚠️ `frontend/model.onnx` - 可选
- ℹ️ `acoustic/phone_id_map.txt` - 推荐（用于音素映射）

## ⚠️ 重要提示

1. **文件大小**：模型文件较大（总计约几百 MB），不能直接使用 `require()` 加载
2. **原生模块**：需要 `onnxruntime-react-native` 原生模块支持
3. **平台支持**：目前主要在 Android 平台测试，iOS 平台可能需要额外配置
4. **文件格式**：所有模型文件必须是 **ONNX 格式**（`.onnx`），不是 PaddlePaddle 原始格式（`.pdmodel`）

## 🚀 获取模型文件

### 方式一：使用预转换的 ONNX 模型

项目根目录下提供了预转换的模型压缩包：
- `fastspeech2_cnndecoder_csmsc_onnx_1.0.0.zip` - FastSpeech2 前端模型
- `hifigan_csmsc_onnx_0.2.0.zip` - HiFiGAN 声码器模型

解压后按照目录结构放置到 `mobile/assets/tts-models/paddlespeech-lite/` 目录。

### 方式二：从 PaddleSpeech 官方转换

1. 安装 PaddleSpeech
2. 下载 PaddleSpeech Lite 模型
3. 使用 PaddleSpeech 工具转换为 ONNX 格式
4. 按照目录结构放置文件

## 📦 构建和部署

### 开发环境

在开发环境中，模型文件会从 `assets/` 目录动态加载。

### 生产构建

构建 APK 时，模型文件会被打包到应用的 `assets/` 目录中：

```bash
# 构建 Android APK
npm run android
# 或
cd mobile
npx expo run:android
```

### 文件复制

在 Android 平台上，应用首次启动时会自动将模型文件从 `bundle` 目录复制到 `documentDirectory`，以便 ONNX Runtime 访问。

## 🔧 故障排查

如果模型加载失败，请检查：

1. ✅ 文件路径是否正确
2. ✅ 文件格式是否为 ONNX（不是 `.pdmodel` 或 `.pdiparams`）
3. ✅ 文件是否完整（未损坏）
4. ✅ `onnxruntime-react-native` 是否已正确安装
5. ✅ 是否在原生构建环境中运行（不是 Expo Go）

## 📚 相关文档

- [PaddleSpeech 官方文档](https://github.com/PaddlePaddle/PaddleSpeech)
- [ONNX Runtime React Native](https://github.com/microsoft/onnxruntime-react-native)
- 项目代码：`mobile/src/modules/TTSModule/models/PaddleSpeechAdapter.ts`


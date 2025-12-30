# 移动端（mobile）项目结构说明

本目录是基于 Expo + React Native 的移动端应用，已清理所有脚手架示例代码，只保留实际业务结构。

## 当前功能进度概览（截至 2025-12-22）

- **运行闭环现状**
  - 首页 `HomeScreen` 已串联：**相机预览 → 长按整屏 / 底部“大号拍照按钮”触发拍照 → 通过通信模块发送到后端/Mock → 返回字幕文本展示**。
  - 相机权限使用 `expo-camera v17` 的新 API（`CameraView` + `useCameraPermissions`）完成接入，权限异常会在首页给出文案提示。
  - 结果区底部已做成深色背景字幕条，标题“识别结果”有单独背景，可在 `HomeScreen.tsx` 的样式中微调。

- **Mock 测试能力**
  - 通信模块 `CommunicationModule` 已支持 **MockServer 模式** 和真实后端切换，Mock 下不会真正建立 WebSocket，只走本地模拟返回。
  - 首页通过事件总线订阅 `communication:message_received`，统一展示真实服务和 Mock 返回的 `text_stream` / `final_result`。
  - 服务器地址和是否启用 Mock 通过设置页 + `useServerConfigStore` 管理，启动时会优先读取持久化配置。

- **核心模块状态（代码为准的简版）**
  - **CameraModule**：相机预览、拍照、图像压缩、事件发布流程已经打通；通过 `setSkipPermissionCheck(true)` 与组件层权限解耦。
  - **GestureHandlerModule**：内部已支持双击/长按触发与物理按键组合识别框架，`GestureHandlerComponent` 已在路由入口 `_layout.tsx` 中包裹整个应用，**长按整屏即可通过事件总线触发拍照闭环**（按钮仍保留为备用入口）。
  - **CommunicationModule**：已实现配置化初始化、连接状态管理、Mock/真实服务切换、图像发送与结果回传事件。
  - **StateManagerModule**：作为全局状态枢纽，已在首页中用于管理触发开关、连接状态、处理状态等；当前仍使用内存持久化。
  - **TTSModule / 音频相关**：TTS 模块代码与模型管理骨架已实现，但仍为**实验/占位实现**，尚未在首页/路由流程中启用，当前识别结果只做文本展示。

- **界面层完成度**
  - **首页 `HomeScreen`**：已具备基础可用 UI（相机预览、状态条、结果字幕区域、大号“拍照”按钮、右上角设置入口）。
  - **设置页 `SettingsScreen`**：已有基础结构和服务器配置/Mock 开关逻辑，细节文案和更多设置项尚待补全。
  - **历史记录页 / 其他二级页面**：脚手架已在代码中预留，展示和交互逻辑仍按下方“待完善功能清单”为主。

## 开发进度一览

- **已完成（可用）**
  - **首页基础闭环**：
    - 相机权限接入 `expo-camera v17`，权限异常有明确文案提示。
    - 相机预览组件 `CameraPreview` 正常工作。
    - 通过 **长按整屏 / 底部“大号拍照按钮” + 事件总线** 完成：拍照 → 图像压缩 → 发送到真实后端或 MockServer → 文本结果流式/最终展示。
  - **通信与 Mock 能力**：
    - `CommunicationModule` 支持 WebSocket 连接管理、心跳与自动重连、消息队列、HTTP 备用通道。
    - 支持通过设置页在线切换真实后端 / MockServer，Mock 模式下走本地 `MockServer` 并通过事件总线推送结果。
  - **全局状态管理**：
    - `StateManagerModule` 单例 + `StateProvider` 已接入根路由 `_layout.tsx`，首页通过 `useStateContext` 读取触发开关、连接状态等。
    - 内存持久化方案已实现，可平滑扩展为 `SecureStore` / `AsyncStorage`。
  - **事件总线与调试**：
    - 事件总线 `eventBus` 承接相机、手势、通信、TTS、状态管理等模块之间的通信。
    - `useEventDebugger` Hook 可在开发时打开，观察关键事件流。
  - **设置页**：
    - 支持编辑 HTTP / WebSocket 地址、切换 Mock 模式，并通过事件总线通知通信模块即时生效。

- **进行中 / 待完成**
  - **手势触发链路**：
    - `GestureHandlerModule` 与 `GestureHandlerComponent` 已实现双击/长按/物理按键组合识别框架，并已在路由入口接入长按触发闭环。
    - 后续仍需根据真实设备体验，完善物理按键组合触发（音量键/电源键需要原生支持）、调优长按/双击灵敏度参数，并在 UI 中对“长按触发”行为做更明显的引导说明。
  - **TTS 与音频播放**：
    - `TTSModule` / 模型管理 / Coqui 轻量模型资产索引已实现，当前为**模拟/占位合成与播放**，主要用于接口验证。
    - 尚未在首页或其他页面中启用 TTS，识别结果仍仅以文本形式展示；真实 TTS 引擎集成与模型下载管理有待后续落地。
  - **历史记录与会话管理**：
    - 状态层已具备 `history.sessions` 结构与相关操作 API。
    - `HistoryScreen` 目前为占位实现，未从 `StateManagerModule` 读取真实历史记录，也未在拍照闭环中写入会话数据。
  - **配置与偏好设置**：
    - 状态中已预留语言、语速、音量、手势灵敏度、压缩质量等偏好字段。
    - 设置页暂未暴露这些偏好项的 UI 控制，也未与 TTS / 手势 / 压缩流程联动。
  - **服务封装与 Hook 完善**：
    - `useAudio`、`useCamera`、`useWebSocket`、`services/audio`、`services/camera` 等目前仍为占位或基础封装，实际业务主要通过模块层（如 `CameraModule`、`CommunicationModule`）完成。
    - 后续可根据真实端能力，将这些 Hook/服务与模块层对齐，或收敛为统一对外接口。

## 目录结构

```
mobile/
├── app/                    # 应用入口层（路由壳）
│   └── _layout.tsx        # 应用唯一入口组件
│
├── src/                    # 业务代码主目录
│   ├── modules/           # 核心业务模块分区
│   │   ├── CameraModule/          # 摄像头相关业务模块
│   │   ├── GestureHandlerModule/  # 手势处理相关业务模块
│   │   ├── CommunicationModule/   # 与服务端通信相关业务模块
│   │   ├── TTSModule/             # 语音合成相关业务模块
│   │   └── StateManagerModule/    # 状态管理相关业务模块
│   ├── screens/           # 页面级组件（屏幕）
│   ├── components/        # 可复用的 UI 组件
│   │   ├── audio/         # 音频相关组件
│   │   ├── camera/        # 相机相关组件
│   │   └── common/        # 通用基础组件
│   ├── hooks/             # 业务相关的自定义 Hook
│   ├── services/          # 与端能力及后端交互的服务层
│   │   ├── api/           # HTTP 和 WebSocket 封装
│   │   ├── audio/         # 音频服务封装
│   │   └── camera/        # 相机服务封装
│   ├── stores/            # 全局状态管理
│   ├── types/             # TypeScript 类型定义
│   └── utils/             # 纯函数工具库
│
├── assets/                 # 静态资源
│   ├── images/            # 应用图标、启动图等图片资源
│   ├── sounds/            # 音频资源目录
│   └── tts-models/        # TTS模型文件目录
│       ├── coqui-tts-lite/  # Coqui TTS轻量模型
│       │   ├── config.json  # 模型配置文件
│       │   ├── model.pth    # TTS模型权重文件（需下载）
│       │   └── vocoder.pth  # 声码器模型权重文件（需下载）
│       └── index.js        # 模型资源索引文件
│
└── [配置文件]              # package.json, tsconfig.json, eslint.config.js 等
```

## 目录用途说明

### `app/`
- **用途**：应用入口层，仅作为路由壳
- **存放内容**：路由配置文件（如 `_layout.tsx`），不存放业务逻辑

### `src/screens/`
- **用途**：页面级组件
- **存放内容**：完整的屏幕组件（如首页、历史记录页、设置页等）

### `src/modules/`
- **用途**：按「业务域」划分的核心模块层，采用模块化架构实现业务逻辑的封装与解耦
- **存放内容**：
  - `CameraModule/`：摄像头采集与相关业务逻辑（✅ **已完善** - 包含图像捕获、压缩、权限管理、事件发布等完整功能）
  - `GestureHandlerModule/`：手势识别与交互逻辑（✅ **基础实现** - 双击手势识别已实现，物理按键组合识别框架已就绪，音量键监听需原生模块支持）
  - `CommunicationModule/`：与服务端的 HTTP / WebSocket 通信逻辑（✅ **基础实现** - WebSocket 连接管理、自动重连、心跳检测、消息队列、HTTP 请求封装、图像数据传输等核心功能已实现）
  - `TTSModule/`：文本转语音（TTS）相关业务逻辑（⚠️ **框架阶段** - 已有模型管理与模拟合成/播放代码，但依赖本地模型资源与后续真实 TTS 引擎集成，当前未在界面实际启用）
  - `StateManagerModule/`：全局状态管理相关逻辑的统一封装（✅ **基础实现** - 基于 Reducer 模式的状态管理、React Context 集成、状态持久化、事件订阅、历史记录管理等核心功能已实现，当前使用内存存储，可扩展为 SecureStore 或 AsyncStorage）

### `src/components/`
- **用途**：可复用的 UI 组件
- **存放内容**：
  - `audio/`：音频播放、控制等组件
  - `camera/`：相机预览、拍摄等组件
  - `common/`：通用基础组件（按钮、输入框等）

### `src/hooks/`
- **用途**：业务相关的自定义 Hook
- **存放内容**：封装业务逻辑的 React Hook（如音频控制、相机操作、WebSocket 连接、状态管理等，✅ **基础实现** - `useWebSocket`、`useStateManager`、`useAppState`、`useEventDebugger` 等 Hook 已实现，部分实现仍为占位封装，后续可根据实际端能力补强）

### `src/services/`
- **用途**：与端能力及后端交互的服务层
- **存放内容**：
  - `api/`：HTTP 请求和 WebSocket 连接封装（✅ **基础实现** - HTTP 和 WebSocket 客户端已实现）
  - `audio/`：移动端音频相关操作封装
  - `camera/`：移动端相机相关操作封装

### `src/stores/`
- **用途**：全局状态管理
- **存放内容**：使用状态管理库（如 Zustand）定义的应用级状态（配置、历史记录等）

### `src/types/`
- **用途**：TypeScript 类型定义
- **存放内容**：API 请求/响应类型、组件 Props 类型、通用类型等

### `src/utils/`
- **用途**：纯函数工具库
- **存放内容**：音频处理、图像处理、常量配置等工具函数

### `assets/`
- **用途**：静态资源
- **存放内容**：
  - `images/`：应用图标、启动图、占位图等
  - `sounds/`：音频资源文件
  - `tts-models/`：TTS模型文件目录
    - `coqui-tts-lite/`：Coqui TTS轻量模型文件
      - `config.json`：模型配置文件，包含模型元数据、采样率、语言等配置
      - `model.pth`：TTS模型权重文件（PyTorch格式），负责将文本转换为梅尔频谱图
      - `vocoder.pth`：声码器模型权重文件（PyTorch格式），负责将梅尔频谱图转换为音频波形
    - `index.js`：模型资源索引文件，统一导出和管理TTS模型资源

## 开发与运行

### 安装依赖
```bash
cd mobile
npm install
```

### 启动开发服务
```bash
npm start
# 或
npx expo start
```

## 模块使用指南

### 模块导入方式

所有模块都从 `src/modules/` 目录导入：

```typescript
// 导入各个模块
import { CameraModule } from '../modules/CameraModule';
import { GestureHandlerModule } from '../modules/GestureHandlerModule';
import { CommunicationModule } from '../modules/CommunicationModule';
import { TTSModule } from '../modules/TTSModule';
import { StateManagerModule, StateProvider, useStateContext } from '../modules/StateManagerModule';

// 导入事件总线
import { eventBus } from '../core/eventBus/EventBus';
```

### 1. StateManagerModule（状态管理模块）

#### 单例模式使用

```typescript
// 获取单例实例
const stateManager = StateManagerModule.getInstance();

// 初始化
await stateManager.initialize();

// 设置触发开关
stateManager.setTriggerEnabled(true);

// 获取状态
const isEnabled = stateManager.isTriggerEnabled();
const connectionStatus = stateManager.getConnectionStatus();

// 更新模块状态
stateManager.setModuleStatus('camera', true);

// 更新用户偏好
stateManager.updatePreferences({
  volume: 0.8,
  speechRate: 1.2
});

// 添加历史记录
stateManager.addHistorySession({
  id: 'session-123',
  timestamp: Date.now(),
  imageCount: 1,
  resultText: '识别结果文本'
});
```

#### React Context 使用（推荐）

```typescript
// 1. 在应用根组件包裹 StateProvider
import { StateProvider } from './modules/StateManagerModule';

function App() {
  return (
    <StateProvider>
      {/* 你的应用组件 */}
    </StateProvider>
  );
}

// 2. 在组件中使用状态
import { useStateContext } from './modules/StateManagerModule';

function MyComponent() {
  const { state, dispatch } = useStateContext();
  
  // 读取状态
  const isEnabled = state.triggerEnabled;
  const connectionStatus = state.connectionStatus;
  
  // 更新状态
  dispatch({
    type: 'SET_TRIGGER_ENABLED',
    payload: true
  });
}
```

### 2. CameraModule（相机模块）

```typescript
// 创建实例
const cameraModule = new CameraModule();

// 设置状态管理器（可选）
cameraModule.setStateManager(stateManager);

// 设置相机引用（需要 expo-camera 的 Camera 组件）
cameraModule.setCameraRef(cameraRef);

// 启动预览
await cameraModule.startPreview();

// 捕获图像
const imageData = await cameraModule.captureFrame();

// 压缩图像
const compressedImage = await cameraModule.compressImagePublic(imageData, 0.7);

// 切换相机（前置/后置）
await cameraModule.toggleCamera();

// 设置缩放
cameraModule.setZoom(1.5);

// 设置闪光灯
cameraModule.setFlashMode('auto');

// 获取相机状态
const status = cameraModule.getCameraStatus();

// 停止预览
await cameraModule.stopPreview();
```

### 3. CommunicationModule（通信模块）

```typescript
// 创建实例
const commModule = new CommunicationModule();

// 设置状态管理器（可选）
commModule.setStateManager(stateManager);

// 启动模块
await commModule.start();

// 连接 WebSocket
await commModule.connect();

// 发送图像数据
await commModule.sendImageData(
  imageData, 
  '请描述这张图片',
  'session-123'
);

// HTTP 请求
const response = await commModule.httpRequest({
  method: 'GET',
  url: '/api/health',
  headers: { 'Content-Type': 'application/json' }
});

// 监听消息（回调方式）
commModule.onMessage((response) => {
  console.log('收到消息:', response.content);
});

// 获取连接状态
const status = commModule.getConnectionStatus();

// 获取统计信息
const stats = commModule.getStats();

// 测试连接
const isConnected = await commModule.testConnection();

// 停止并断开连接
await commModule.stop();
```

### 4. TTSModule（语音合成模块）

```typescript
// 获取单例实例
const ttsModule = TTSModule.getInstance();

// 设置状态管理器（可选）
ttsModule.setStateManager(stateManager);

// 启动模块
await ttsModule.start();

// 语音合成并播放
const result = await ttsModule.synthesizeSpeech('你好，世界');
await ttsModule.playAudio(result);

// 控制播放
await ttsModule.pausePlayback();
await ttsModule.resumePlayback();
await ttsModule.stopPlayback();

// 设置音量（0-1）
await ttsModule.setVolume(0.8);

// 设置播放速率（0.5-2）
await ttsModule.setRate(1.2);

// 切换模型
await ttsModule.switchModel('coqui-tts', {
  language: 'zh-CN',
  sampleRate: 22050
});

// 获取状态
const status = ttsModule.getStatus();
const isReady = ttsModule.isReady();

// 获取可用模型
const models = ttsModule.getAvailableModels();

// 停止模块
await ttsModule.stop();
```

### 5. GestureHandlerModule（手势处理模块）

```typescript
// 创建实例
const gestureModule = new GestureHandlerModule();

// 设置状态管理器（可选）
gestureModule.setStateManager(stateManager);

// 启动手势识别
await gestureModule.startRecognition();

// 设置自定义手势
gestureModule.addCustomGesture({
  type: 'double-tap',
  sensitivity: 0.8,
  callback: () => {
    console.log('双击手势触发');
  }
});

// 设置灵敏度
gestureModule.setSensitivity('high');

// 获取手势状态
const status = gestureModule.getGestureStatus();

// 更新配置
gestureModule.updateConfig({
  doubleTap: {
    enabled: true,
    maxInterval: 300,
    maxDistance: 50
  }
});

// 停止手势识别
await gestureModule.stopRecognition();
```

### 6. EventBus（事件总线）

所有模块通过事件总线进行松耦合通信：

```typescript
import { eventBus } from '../core/eventBus/EventBus';

// 订阅事件
const subscriptionId = eventBus.subscribe('camera:capture_complete', (data) => {
  console.log('相机捕获完成:', data.imageData);
});

// 一次性订阅
eventBus.once('tts:speech_complete', (data) => {
  console.log('语音播放完成:', data.sessionId);
});

// 发布事件
eventBus.emit('camera:capture_start', {
  sessionId: 'session-123',
  timestamp: Date.now()
});

// 取消订阅
eventBus.unsubscribe('camera:capture_complete', subscriptionId);

// 获取订阅统计
const stats = eventBus.getStats();
```

### 完整使用示例

```typescript
import React, { useEffect, useRef } from 'react';
import { CameraModule } from '../modules/CameraModule';
import { GestureHandlerModule } from '../modules/GestureHandlerModule';
import { CommunicationModule } from '../modules/CommunicationModule';
import { TTSModule } from '../modules/TTSModule';
import { StateManagerModule } from '../modules/StateManagerModule';
import { eventBus } from '../core/eventBus/EventBus';

export default function AppScreen() {
  const cameraModule = useRef<CameraModule>();
  const gestureModule = useRef<GestureHandlerModule>();
  const commModule = useRef<CommunicationModule>();
  const ttsModule = useRef<TTSModule>();
  const stateManager = useRef<StateManagerModule>();

  useEffect(() => {
    initializeModules();
    return () => cleanupModules();
  }, []);

  const initializeModules = async () => {
    // 1. 初始化状态管理器
    stateManager.current = StateManagerModule.getInstance();
    await stateManager.current.initialize();

    // 2. 初始化各模块
    cameraModule.current = new CameraModule();
    gestureModule.current = new GestureHandlerModule();
    commModule.current = new CommunicationModule();
    ttsModule.current = TTSModule.getInstance();

    // 3. 设置模块间依赖
    cameraModule.current.setStateManager(stateManager.current);
    gestureModule.current.setStateManager(stateManager.current);
    commModule.current.setStateManager(stateManager.current);
    ttsModule.current.setStateManager(stateManager.current);

    // 4. 订阅事件
    eventBus.subscribe('communication:message_received', (data) => {
      if (data.type === 'final_result' && ttsModule.current) {
        ttsModule.current.synthesizeSpeech(data.content);
      }
    });

    // 5. 启动服务
    await cameraModule.current.startPreview();
    await gestureModule.current.startRecognition();
    await commModule.current.start();
    await ttsModule.current.start();
  };

  const cleanupModules = async () => {
    await cameraModule.current?.stopPreview();
    await gestureModule.current?.stopRecognition();
    await commModule.current?.stop();
    await ttsModule.current?.stop();
  };

  const handleCapture = async () => {
    if (!cameraModule.current || !commModule.current) return;

    // 捕获图像
    const imageData = await cameraModule.current.captureFrame();
    const compressed = await cameraModule.current.compressImagePublic(imageData, 0.7);

    // 发送到服务器
    await commModule.current.sendImageData(compressed, '请描述这张图片');
  };

  return (
    // 你的UI组件
  );
}
```

## 开发规范

- **业务逻辑统一放在 `src/` 目录**：所有实际功能代码都应位于 `src/` 下
- **`app/` 仅作为入口壳**：只保留最基础的路由配置，不存放业务代码
- **按功能模块组织代码**：在 `src/` 下按 `screens`、`components`、`hooks`、`services`、`modules` 等分类存放
- **模块化开发**：核心业务逻辑应封装在 `src/modules/` 下的对应模块中，通过事件总线（`src/core/eventBus/`）实现模块间通信
- **单例模式**：`StateManagerModule` 和 `TTSModule` 使用单例模式，其他模块可以创建多个实例
- **事件驱动**：优先使用事件总线进行模块间通信，保持松耦合
- **生命周期管理**：记得在组件卸载时清理模块资源（调用 `destroy()` 或 `stop()` 方法）

## 模块开发状态

### ✅ 已完善模块
- **CameraModule**：相机功能完整，包含权限管理、图像捕获、压缩、事件发布等

### 📝 基础实现模块
- **CommunicationModule**：WebSocket 连接管理已实现（自动重连、心跳检测、消息队列），HTTP 请求封装已实现（带重试机制），图像数据传输、消息处理、统计信息收集等核心功能已完成，支持配置管理和事件发布
- **GestureHandlerModule**：双击手势识别已实现（基于 `react-native-gesture-handler`），包含置信度计算、配置管理、事件发布等功能；物理按键组合识别框架已就绪，但音量键监听需要原生模块支持（当前使用备用方案）
- **StateManagerModule**：基于 Reducer 模式的完整状态管理已实现，包含 React Context API 集成（StateProvider 组件）、状态持久化（当前使用内存存储，支持切换到 SecureStore/AsyncStorage）、事件总线集成、状态变更监听、历史记录管理、系统健康状态检查等功能，提供了 `useStateContext`、`useStateManager`、`useAppState` 等自定义 Hook

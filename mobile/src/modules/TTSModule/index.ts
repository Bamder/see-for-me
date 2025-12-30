/**
 * TTS模块统一导出
 * 位置：mobile/src/modules/TTSModule/index.ts
 */

// 主模块
export { TTSModule, ttsModule, TTSStatus, TTSConfig } from './TTSModule';

// 模型相关
export { BaseTTSModel, TTSModel, TTSModelConfig, TTSResult } from './models/BaseTTSModel';
export { PaddleSpeechAdapter } from './models/PaddleSpeechAdapter';
export { ModelManager, ModelType, ModelInfo } from './models/ModelManager';

// 工具类
export { AudioProcessor, AudioProcessorConfig, AudioFormat, AudioEncoding, AudioMetadata } from './utils/AudioProcessor';

// 服务
export { OfflineTTSService } from './services/OfflineTTSService';


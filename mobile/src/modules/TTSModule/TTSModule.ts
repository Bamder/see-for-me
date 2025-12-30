/**
 * SeeForMe TTS模块 - 增强版（Android优化）
 * 支持离线PaddleSpeech模型 + 音频处理 + 系统回退
 * 
 * Android特性：
 * - 优先使用 expo-av 进行音频播放（Expo官方推荐，更可靠）
 * - 回退到 react-native-sound（如果需要）
 * - 优化的文件路径处理
 * - 完善的错误处理和日志记录
 * - 支持文件系统缓存目录访问（expo-file-system + react-native-fs 双重回退）
 * 
 * 位置：mobile/src/modules/TTSModule/TTSModule.ts
 */

import * as FileSystem from 'expo-file-system';
import { Platform, PermissionsAndroid } from 'react-native';
// react-native-sound 需要先安装，使用动态导入以避免类型错误
// FileSystem API 兼容性处理
const FileSystemCompat = FileSystem as any;

// react-native-fs 作为 expo-file-system 的回退方案
let RNFS: any = null;
try {
  RNFS = require('react-native-fs');
} catch (e) {
  // react-native-fs 未安装或不可用
}

// expo-av 作为主要的音频播放器（更可靠）
let Audio: any = null;
try {
  const AV = require('expo-av');
  Audio = AV.Audio;
  if (__DEV__ && Audio) {
    console.log('✅ expo-av 加载成功');
  }
} catch (e) {
  if (__DEV__) {
    console.warn('⚠️ expo-av 加载失败:', e);
  }
  Audio = null;
}

// react-native-sound 作为回退方案
let Sound: any = null;
try {
  const SoundModule = require('react-native-sound');
  
  // react-native-sound 可能有不同的导出方式，尝试多种方式
  if (typeof SoundModule === 'function') {
    // 情况1: 直接导出构造函数
    Sound = SoundModule;
  } else if (SoundModule && typeof SoundModule === 'object') {
    // 情况2: 对象导出，可能有 default 或 Sound 属性
    Sound = SoundModule.default || SoundModule.Sound || SoundModule;
    
    // 如果仍然不是函数，可能是导出结构不同
    if (Sound && typeof Sound !== 'function') {
      // 尝试查找对象中是否有构造函数
      const keys = Object.keys(SoundModule);
      for (const key of keys) {
        if (typeof SoundModule[key] === 'function') {
          Sound = SoundModule[key];
          break;
        }
      }
      // 如果还是找不到，设为 null
      if (typeof Sound !== 'function') {
        Sound = null;
      }
    }
  }
  
  if (__DEV__ && Sound && typeof Sound === 'function') {
    console.log('✅ react-native-sound 加载成功（作为回退方案）');
  }
} catch (e) {
  // 如果未安装或加载失败，Sound 为 null，会在运行时处理
  Sound = null;
}
import { eventBus } from '../../core/eventBus/EventBus';
import { StateManagerModule } from '../StateManagerModule/StateManagerModule';
import { audioProcessor, AudioProcessorConfig } from './utils/AudioProcessor';
// 动态导入 PaddleSpeechAdapter 以避免在不需要时加载 onnxruntime-react-native
// import { PaddleSpeechAdapter } from './models/PaddleSpeechAdapter';
import { TTSModelConfig, TTSResult } from './models/BaseTTSModel';
import { BaseTTSModel } from './models/BaseTTSModel';

// TTS状态类型
export type TTSStatus = 
  | 'idle' 
  | 'initializing' 
  | 'synthesizing' 
  | 'playing' 
  | 'paused' 
  | 'completed' 
  | 'error';

// TTS配置
export interface TTSConfig {
  enabled: boolean;
  autoPlay: boolean;
  useOfflineModel: boolean; // 是否使用离线模型
  modelConfig: TTSModelConfig;
  audioConfig: AudioProcessorConfig;
  playback: {
    volume: number;
    rate: number;
    preload: boolean;
  };
  streaming: {
    enabled: boolean;
    sentenceBuffer: number; // 句子缓冲数量
    maxQueueSize: number; // 最大队列大小
  };
}

// 音频队列项
interface AudioQueueItem {
  sessionId: string;
  audioData: string;
  text?: string; // 原始文本（用于系统 TTS 回退）
  metadata: {
    duration: number;
    sampleRate: number;
    format: string;
  };
  priority: number; // 优先级
  timestamp: number;
}

/**
 * 增强的TTS模块
 */
export class TTSModule {
  private static instance: TTSModule;
  private stateManager: StateManagerModule | null = null;
  private ttsModel: BaseTTSModel | null = null;
  private audioPlayer: any = null; // 原生音频播放器实例（不依赖 Google ExoPlayer）
  private config: TTSConfig;
  private status: TTSStatus = 'idle';
  private isActive: boolean = false;
  private currentSessionId: string = '';
  private audioQueue: AudioQueueItem[] = [];
  private isPlaying: boolean = false;
  private isInitializing: boolean = false;
  private synthesisPromises: Map<string, Promise<TTSResult>> = new Map();
  private performanceStats = {
    totalSynthesis: 0,
    totalPlayback: 0,
    totalErrors: 0,
    avgSynthesisTime: 0,
    avgPlaybackTime: 0,
    lastSessionTime: 0
  };

  // 默认配置
  private defaultConfig: TTSConfig = {
    enabled: true,
    autoPlay: true,
    useOfflineModel: false, // 禁用离线模型，使用系统TTS
      modelConfig: {
        modelPath: '', // 将在PaddleSpeechAdapter中处理
        language: 'zh-CN',
        sampleRate: 24000,
        speed: 1.0,
        pitch: 1.0,
        volume: 1.0
      },
    audioConfig: {
      targetSampleRate: 24000,
      targetChannels: 1,
      targetFormat: 'wav',
      enableNormalization: true,
      enableNoiseReduction: true,
      volume: 1.0,
      speed: 1.0,
      cacheEnabled: true,
      maxCacheSize: 50
    },
    playback: {
      volume: 1.0,
      rate: 1.0,
      preload: true
    },
    streaming: {
      enabled: true,
      sentenceBuffer: 3,
      maxQueueSize: 10
    }
  };

  private constructor(config?: Partial<TTSConfig>) {
    this.config = { ...this.defaultConfig, ...config };
    this.initializeEventSubscriptions();
  }

  public static getInstance(config?: Partial<TTSConfig>): TTSModule {
    if (!TTSModule.instance) {
      TTSModule.instance = new TTSModule(config);
    }
    return TTSModule.instance;
  }

  public setStateManager(manager: StateManagerModule): void {
    this.stateManager = manager;
  }

  /**
   * 初始化事件订阅
   */
  private initializeEventSubscriptions(): void {
    // 订阅文本接收事件
    eventBus.subscribe('communication:message_received', (data) => {
      this.handleTextReceived(data);
    });

    // 订阅状态变化事件
    eventBus.subscribe('state:trigger_state_change', (data) => {
      this.handleTriggerStateChange(data);
    });

    // 订阅配置更新事件
    eventBus.subscribe('config:tts_updated', (data) => {
      // 转换配置格式
      const configUpdate: Partial<TTSConfig> = {
        enabled: data.enabled,
        autoPlay: data.autoPlay,
        modelConfig: data.modelConfig,
        playback: data.playback ? {
          volume: data.playback.volume,
          rate: data.playback.rate,
          preload: true
        } : undefined
      };
      this.updateConfig(configUpdate);
    });

    // 订阅TTS控制事件
    eventBus.subscribe('tts:control', (data) => {
      this.handleControlCommand(data);
    });

    // 订阅系统事件
    eventBus.subscribe('app:background', () => {
      this.handleAppBackground();
    });

    eventBus.subscribe('app:foreground', () => {
      this.handleAppForeground();
    });

    console.log('🔊 TTS模块事件订阅初始化完成');
  }

  /**
   * 启动TTS模块
   */
  public async start(): Promise<boolean> {
    try {
      if (this.isActive) {
        console.log('🔊 TTS模块已启动');
        return true;
      }

      this.updateStatus('initializing');
      
      // 初始化音频处理器
      audioProcessor.updateConfig(this.config.audioConfig);
      
      // 初始化音频会话
      await this.initializeAudioSession();
      
      // Android: 请求存储权限（如果需要）
      if (Platform.OS === 'android') {
        await this.requestStoragePermission();
      }
      
      // 初始化TTS模型
      if (this.config.useOfflineModel) {
        await this.initializeOfflineModel();
      }
      
      this.isActive = true;
      this.updateStatus('idle');
      
      eventBus.emit('tts:module_started', {
        timestamp: Date.now(),
        config: this.config,
        model: this.config.useOfflineModel ? 'PaddleSpeech-Lite' : 'System'
      });

      console.log('🔊 TTS模块启动完成');
      return true;
      
    } catch (error) {
      console.error('启动TTS模块失败:', error);
      await this.handleInitializationError(error);
      return false;
    }
  }

  /**
   * 初始化音频会话
   */
  private async initializeAudioSession(): Promise<void> {
    try {
      // 不再使用 expo-av（依赖 Google ExoPlayer）
      // 移动端需要原生模块支持
      if (Platform.OS === 'web') {
        console.log('ℹ️ Web 平台音频会话已就绪');
      } else {
        console.log('ℹ️ 移动端音频会话需要原生模块支持');
      }
    } catch (error) {
      console.error('音频会话初始化失败:', error);
      throw error;
    }
  }

  /**
   * 初始化离线模型
   */
  private async initializeOfflineModel(): Promise<void> {
    try {
      console.log('🔊 初始化离线TTS模型...');
      
      // 在开发模式下，运行诊断
      if (__DEV__) {
        try {
          const { diagnoseModelLoading, printDiagnostics } = await import('./models/ModelDiagnostics');
          const diagnostics = await diagnoseModelLoading();
          printDiagnostics(diagnostics);
        } catch (diagError) {
          // 诊断失败不影响模型加载
          console.warn('⚠️ 诊断工具不可用:', diagError);
        }
      }
      
      if (!this.ttsModel) {
        // 动态导入 PaddleSpeechAdapter 以避免在 Expo Go 中触发 onnxruntime-react-native 加载
        try {
          // 使用动态导入，捕获所有可能的错误（包括模块加载时的错误）
          const adapterModule = await import('./models/PaddleSpeechAdapter').catch((e) => {
            // 捕获导入错误，包括 onnxruntime-react-native 的原生模块错误
            const errorMessage = e?.message || String(e);
            const errorStack = e?.stack || '';
            
            // 检查是否是原生模块相关的错误
            if (errorMessage.includes('Cannot read property') ||
                errorMessage.includes('install') ||
                errorMessage.includes('null') ||
                errorStack.includes('onnxruntime-react-native') ||
                errorStack.includes('binding.ts')) {
              console.warn('⚠️ PaddleSpeechAdapter 导入失败（原生模块错误）');
              console.warn('   错误:', errorMessage);
              console.warn('   提示：需要运行 npx expo prebuild 或使用 Expo Dev Client');
              throw e; // 重新抛出以触发外层 catch
            }
            throw e; // 其他错误也重新抛出
          });
          
          const { PaddleSpeechAdapter } = adapterModule;
          this.ttsModel = new PaddleSpeechAdapter();
        } catch (importError: any) {
          // 如果导入失败（可能因为 onnxruntime-react-native 依赖），使用模拟模式
          const errorMessage = importError?.message || String(importError);
          console.warn('⚠️ PaddleSpeechAdapter 导入失败，将使用模拟模式');
          console.warn('   错误:', errorMessage);
          console.warn('   提示：离线模型需要原生模块支持，当前将使用系统TTS回退');
          // 设置 useOfflineModel 为 false，使用系统TTS
          this.config.useOfflineModel = false;
          return;
        }
      }
      
      await this.ttsModel.loadModel(this.config.modelConfig);
      
      console.log('🔊 离线TTS模型初始化完成');
    } catch (error: any) {
      console.error('离线TTS模型初始化失败:', error);
      // 不抛出错误，而是回退到系统TTS模式
      console.warn('⚠️ 离线模型初始化失败，回退到系统TTS模式');
      this.config.useOfflineModel = false;
    }
  }

  /**
   * 处理初始化错误
   */
  private async handleInitializationError(error: any): Promise<void> {
    this.updateStatus('error', '初始化失败');
    
    // 发布错误事件
    eventBus.emit('tts:init_error', {
      error: error instanceof Error ? error.message : '未知错误',
      timestamp: Date.now()
    });
    
    // 尝试回退到无模型模式
    this.config.useOfflineModel = false;
    console.log('🔊 回退到无模型模式，等待系统TTS');
  }

  /**
   * 处理文本接收
   */
  private async handleTextReceived(data: {
    type: 'text_stream' | 'final_result' | 'error';
    content: string;
    sessionId: string;
    is_final?: boolean;
  }): Promise<void> {
    if (!this.isActive || !this.config.enabled || data.type === 'error') {
      return;
    }

    this.currentSessionId = data.sessionId;
    
    try {
      if (data.type === 'text_stream') {
        await this.handleTextStream(data.content, data.sessionId, data.is_final || false);
      } else if (data.type === 'final_result') {
        await this.handleFinalResult(data.content, data.sessionId);
      }
    } catch (error) {
      console.error('处理文本失败:', error);
      this.updateStatus('error', '文本处理失败');
    }
  }

  /**
   * 处理文本流
   */
  private async handleTextStream(
    text: string,
    sessionId: string,
    isFinal: boolean
  ): Promise<void> {
    if (!text.trim()) return;
    
    console.log(`🔊 接收文本流: "${text.substring(0, 30)}..."`);
    
    // 更新状态
    this.updateStatus('synthesizing');
    
    // 发布文本接收事件
    eventBus.emit('tts:text_received', {
      sessionId,
      text,
      isFinal,
      timestamp: Date.now()
    });
    
    // 开始合成
    if (this.config.streaming.enabled) {
      await this.streamingSynthesis(text, sessionId, isFinal);
    } else {
      await this.batchSynthesis(text, sessionId, isFinal);
    }
  }

  /**
   * 流式合成
   */
  private async streamingSynthesis(
    text: string,
    sessionId: string,
    isFinal: boolean
  ): Promise<void> {
    try {
      const synthesisStartTime = Date.now();
      
      // 执行合成
      const result = await this.synthesizeSpeech(text, sessionId);
      
      // 更新性能统计
      this.updatePerformanceStats('synthesis', Date.now() - synthesisStartTime);
      
      // 添加到播放队列
      await this.addToPlayQueue({
        sessionId,
        audioData: result.audioData,
        text: text, // 保存原始文本用于系统 TTS 回退
        metadata: {
          duration: result.duration,
          sampleRate: result.sampleRate,
          format: result.format
        },
        priority: isFinal ? 0 : 1, // 最终结果优先级更高
        timestamp: Date.now()
      });
      
      // 如果队列已满，开始播放
      if (this.audioQueue.length >= this.config.streaming.sentenceBuffer || isFinal) {
        await this.playQueue();
      }
      
    } catch (error) {
      console.error('流式合成失败:', error);
      await this.handleSynthesisError(text, sessionId, error);
    }
  }

  /**
   * 批量合成
   */
  private async batchSynthesis(
    text: string,
    sessionId: string,
    isFinal: boolean
  ): Promise<void> {
    // 只合成最终结果
    if (!isFinal) {
      return;
    }
    
    try {
      const synthesisStartTime = Date.now();
      
      // 执行合成
      const result = await this.synthesizeSpeech(text, sessionId);
      
      // 更新性能统计
      this.updatePerformanceStats('synthesis', Date.now() - synthesisStartTime);
      
      // 清空队列，添加新结果
      this.audioQueue = [{
        sessionId,
        audioData: result.audioData,
        text: text, // 保存原始文本用于系统 TTS 回退
        metadata: {
          duration: result.duration,
          sampleRate: result.sampleRate,
          format: result.format
        },
        priority: 0,
        timestamp: Date.now()
      }];
      
      // 开始播放
      await this.playQueue();
      
    } catch (error) {
      console.error('批量合成失败:', error);
      await this.handleSynthesisError(text, sessionId, error);
    }
  }

  /**
   * 处理最终结果
   */
  private async handleFinalResult(text: string, sessionId: string): Promise<void> {
    console.log(`🔊 接收最终结果: "${text.substring(0, 50)}..."`);
    
    // 清空当前队列
    this.audioQueue = [];
    
    // 合成最终结果
    await this.streamingSynthesis(text, sessionId, true);
  }

  /**
   * 执行语音合成
   */
  private async synthesizeSpeech(text: string, sessionId: string): Promise<TTSResult> {
    const cacheKey = this.generateCacheKey(text, sessionId);
    
    // 检查是否有正在进行的合成
    if (this.synthesisPromises.has(cacheKey)) {
      return this.synthesisPromises.get(cacheKey)!;
    }
    
    const synthesisPromise = (async (): Promise<TTSResult> => {
      try {
        let result: TTSResult;
        
        if (this.config.useOfflineModel && this.ttsModel) {
          // 使用离线模型合成
          result = await this.ttsModel.synthesize(text, {
            speed: this.config.playback.rate,
            pitch: 1.0
          });
          
          // 如果离线模型返回了有效的音频数据，进行处理
          // 检查是否是空数据或模拟模式数据（空字符串表示应该使用系统 TTS）
          if (!result.audioData || result.audioData.length === 0 || 
              (!result.audioData.startsWith('data:') && result.audioData.length < 100)) {
            if (__DEV__) {
              console.log('⚠️ 检测到空音频数据或模拟模式，直接使用系统TTS');
            }
            // 直接使用系统TTS，不尝试播放无效音频
            return await this.fallbackToSystemTTS(text);
          }
          
          // 检查是否是模拟模式的无效数据（Data URL 数据太短）
          if (result.audioData.startsWith('data:') && result.audioData.length < 1000) {
            if (__DEV__) {
              console.log('⚠️ 检测到模拟模式音频数据（数据长度异常小），直接使用系统TTS');
            }
            // 直接使用系统TTS，不尝试播放无效音频
            return await this.fallbackToSystemTTS(text);
          }
          
          // 注意：即使数据长度足够，也可能是无效格式（expo-av 无法识别）
          // 但这里先尝试处理，如果播放失败会在播放阶段回退到系统 TTS
          
          // 音频处理
          const processedAudio = await audioProcessor.processAudio(
            result.audioData,
            result.format as any,
            'data-url'
          );
          
          return {
            ...result,
            audioData: processedAudio.data,
            duration: processedAudio.metadata.duration
          };
        } else {
          // 离线模型未启用或未加载，回退到系统TTS
          return await this.fallbackToSystemTTS(text);
        }
      } catch (error) {
        // 合成失败，回退到系统TTS
        console.error('语音合成失败，回退到系统TTS:', error);
        return await this.fallbackToSystemTTS(text);
      } finally {
        // 清理Promise缓存
        this.synthesisPromises.delete(cacheKey);
      }
    })();
    
    // 缓存Promise
    this.synthesisPromises.set(cacheKey, synthesisPromise);
    
    return synthesisPromise;
  }

  /**
   * 回退到系统TTS
   */
  private async fallbackToSystemTTS(text: string): Promise<TTSResult> {
    if (__DEV__) {
      console.log('🔊 回退到系统TTS，文本:', text.substring(0, 50) + (text.length > 50 ? '...' : ''));
    }
    
    // 尝试使用 Expo Speech API（如果可用）
    if (Platform.OS !== 'web') {
      try {
        // 尝试多种方式加载 expo-speech（与 fallbackToSystemTTSPlayback 使用相同的逻辑）
        let Speech: any = null;
        
        // 方法1: 使用 require（更可靠）
        try {
          const SpeechModule = require('expo-speech');
          Speech = SpeechModule.default || SpeechModule;
        } catch (requireError) {
          // 方法2: 使用动态导入
          try {
            const SpeechModule = await import('expo-speech' as any);
            Speech = SpeechModule.default || SpeechModule;
          } catch (importError) {
            // 静默失败，会在下面检查 speak 函数时处理
          }
        }
        
        // 检查 speak 函数是否可用（支持多种导出格式）
        const speakFn = Speech?.speak || Speech?.default?.speak;
        if (speakFn && typeof speakFn === 'function') {
          if (__DEV__) {
            console.log('✅ 使用系统TTS播放');
          }
          
          return new Promise((resolve) => {
            // 直接播放，不返回音频数据
            speakFn(text, {
              language: 'zh-CN',
              pitch: 1.0,
              rate: this.config.playback.rate,
              volume: this.config.playback.volume,
              onDone: () => {
                if (__DEV__) {
                  console.log('✅ 系统TTS播放完成');
                }
                eventBus.emit('tts:playback_complete', {
                  sessionId: this.currentSessionId || 'system',
                  timestamp: Date.now()
                });
                resolve({
                  audioData: '',
                  duration: Math.max(1000, text.length * 50),
                  sampleRate: 24000,
                  format: 'wav',
                  timestamp: Date.now(),
                  synthesisTime: 50
                });
              },
              onStopped: () => {
                if (__DEV__) {
                  console.log('ℹ️ 系统TTS播放已停止');
                }
              },
              onError: (error: any) => {
                if (__DEV__) {
                  console.error('❌ 系统TTS播放错误:', error);
                }
                resolve({
                  audioData: '',
                  duration: Math.max(1000, text.length * 50),
                  sampleRate: 24000,
                  format: 'wav',
                  timestamp: Date.now(),
                  synthesisTime: 50
                });
              }
            });
          });
        } else {
          // speak 函数不可用
          if (__DEV__) {
            console.warn('⚠️ expo-speech speak 函数不可用');
            console.warn('   Speech 对象:', Speech);
          }
        }
      } catch (error: any) {
        if (__DEV__) {
          console.warn('⚠️ 加载 expo-speech 失败:', error?.message || error);
        }
      }
    }
    
    // 如果 Expo Speech 不可用，提示安装（只在开发模式下）
    if (__DEV__) {
      console.error('❌ 系统TTS不可用！');
      console.error('   原因：expo-speech 未安装或不可用');
      console.error('   解决方案：');
      console.error('   1. 运行: npx expo install expo-speech');
      console.error('   2. 重新构建应用: scripts\\dev\\build-android-gradle.bat');
      console.error('   3. 或者检查 expo-speech 是否正确安装');
    }
    
    // 发布错误事件
    eventBus.emit('tts:init_error', {
      error: '系统TTS不可用，请安装 expo-speech',
      timestamp: Date.now()
    });
    
    // 返回空结果，但标记为错误
    return {
      audioData: '',
      duration: Math.max(1000, text.length * 50),
      sampleRate: 24000,
      format: 'wav',
      timestamp: Date.now(),
      synthesisTime: 100
    };
  }

  /**
   * 添加到播放队列
   */
  private async addToPlayQueue(item: AudioQueueItem): Promise<void> {
    // 检查队列大小
    if (this.audioQueue.length >= this.config.streaming.maxQueueSize) {
      // 移除优先级最低的项目
      this.audioQueue.sort((a, b) => a.priority - b.priority);
      this.audioQueue.pop();
    }
    
    // 按优先级和插入时间排序
    this.audioQueue.push(item);
    this.audioQueue.sort((a, b) => {
      if (a.priority !== b.priority) {
        return a.priority - b.priority;
      }
      return a.timestamp - b.timestamp;
    });
    
    console.log(`🔊 添加到播放队列，当前大小: ${this.audioQueue.length}`);
  }

  /**
   * 播放队列
   */
  private async playQueue(): Promise<void> {
    if (this.isPlaying || this.audioQueue.length === 0) {
      return;
    }
    
    this.isPlaying = true;
    
    while (this.audioQueue.length > 0 && this.isActive) {
      const item = this.audioQueue.shift()!;
      
      try {
        await this.playAudioItem(item);
      } catch (error) {
        console.error('播放失败:', error);
        // 继续播放下一个
      }
      
      // 避免过度占用主线程
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    
    this.isPlaying = false;
    
    // 检查是否全部播放完成
    if (this.audioQueue.length === 0) {
      this.updateStatus('completed');
      
      eventBus.emit('tts:playback_complete', {
        sessionId: this.currentSessionId,
        timestamp: Date.now()
      });
    }
  }

  /**
   * 播放单个音频项
   */
  private async playAudioItem(item: AudioQueueItem): Promise<void> {
    this.updateStatus('playing');
    
    return new Promise(async (resolve, reject) => {
      try {
        const playbackStartTime = Date.now();
        
        // 停止当前播放
        if (this.audioPlayer) {
          await this.stopCurrentPlayback();
        }
        
        // 处理音频 URI：优先尝试直接使用 Data URL（expo-av 支持），否则转换为文件
        let audioUri = item.audioData;
        
        // 如果音频数据为空（系统TTS直接播放，不需要文件），直接返回
        if (!audioUri || audioUri.length === 0) {
          console.log('ℹ️ 音频数据为空（系统TTS已直接播放），跳过文件播放');
          this.updatePerformanceStats('playback', Date.now() - playbackStartTime);
          eventBus.emit('tts:audio_complete', {
            sessionId: item.sessionId,
            duration: item.metadata.duration,
            timestamp: Date.now()
          });
          resolve();
          return;
        }
        
        // 如果 expo-av 可用且是 Data URL，直接使用 Data URL（避免文件格式问题）
        if (audioUri.startsWith('data:') && Audio && Audio.Sound) {
          // expo-av 支持 Data URL，直接传递（标记为 Data URL，失败时需要转换）
          await this.playAudioWithNativeAPI(audioUri, item, playbackStartTime, resolve, reject, true);
          return;
        }
        
        // 否则，需要转换为文件 URI（用于 react-native-sound 或文件系统不可用时）
        if (audioUri.startsWith('data:')) {
          try {
            audioUri = await this.convertDataURLToFile(audioUri);
          } catch (convertError) {
            const errorMsg = convertError instanceof Error ? convertError.message : '未知错误';
            if (errorMsg.includes('无法获取临时目录') || errorMsg.includes('文件系统 API 不可用')) {
              console.warn('⚠️ 文件系统不可用，系统TTS应已直接播放，跳过文件转换');
              resolve();
              return;
            }
            console.error('转换 Data URL 失败:', convertError);
            reject(new Error(`无法转换音频格式: ${errorMsg}`));
            return;
          }
        }
        
        // 使用原生音频播放（已转换为文件路径）
        await this.playAudioWithNativeAPI(audioUri, item, playbackStartTime, resolve, reject, false);
        
        // 发布开始播放事件
        eventBus.emit('tts:audio_start', {
          sessionId: item.sessionId,
          duration: item.metadata.duration,
          timestamp: Date.now()
        });
        
        // 超时保护
        setTimeout(() => {
          resolve(); // 即使播放未完成也继续
        }, item.metadata.duration + 2000); // 增加2秒容差
        
      } catch (error) {
        console.error('播放失败:', error);
        reject(error);
      }
    });
  }

  /**
   * 使用原生音频 API 播放（不依赖 Google ExoPlayer）
   * Android/iOS: react-native-sound (使用系统原生 MediaPlayer/AVFoundation)
   * Web: HTML5 Audio API
   */
  private async playAudioWithNativeAPI(
    audioUri: string,
    item: AudioQueueItem,
    playbackStartTime: number,
    resolve: () => void,
    reject: (error: Error) => void,
    isDataUrl?: boolean // 标记是否为 Data URL（需要转换为文件才能使用 react-native-sound）
  ): Promise<void> {
    try {
      if (Platform.OS === 'web') {
        // Web 平台：使用 HTML5 Audio API
        const audio = new Audio(audioUri);
        audio.volume = this.config.playback.volume;
        audio.playbackRate = this.config.playback.rate;
        
        audio.onended = () => {
          this.updatePerformanceStats('playback', Date.now() - playbackStartTime);
          eventBus.emit('tts:audio_complete', {
            sessionId: item.sessionId,
            duration: item.metadata.duration,
            timestamp: Date.now()
          });
          resolve();
        };
        
        audio.onerror = (e: unknown) => {
          reject(new Error(`播放错误: ${e}`));
        };
        
        await audio.play();
        this.audioPlayer = audio as any;
      } else {
        // 移动端：优先使用 expo-av（更可靠），回退到 react-native-sound
        
        // 确保路径格式正确（添加 file:// 前缀如果不存在）
        let finalUri = audioUri;
        if (!audioUri.startsWith('file://') && !audioUri.startsWith('http://') && !audioUri.startsWith('https://')) {
          finalUri = `file://${audioUri}`;
        }
        
        // 优先使用 expo-av
        if (Audio && Audio.Sound) {
          try {
            // expo-av 支持 Data URL，直接使用原始 Data URL 避免文件格式问题
            let audioSource: any;
            if (item.audioData && item.audioData.startsWith('data:')) {
              // 验证 Data URL 格式
              const dataUrlMatch = item.audioData.match(/^data:([^;]+);base64,(.+)$/);
              if (!dataUrlMatch || dataUrlMatch[2].length < 100) {
                // Data URL 格式无效或数据太短（可能是模拟数据）
                console.warn('⚠️ Data URL 格式无效或数据太短，可能是模拟数据，跳过播放');
                throw new Error('音频数据无效（可能是模拟模式）');
              }
              
              // 使用 Data URL 直接播放（推荐，避免文件格式问题）
              console.log(`📱 使用 expo-av 播放音频（Data URL），MIME: ${dataUrlMatch[1]}, 数据长度: ${dataUrlMatch[2].length}`);
              audioSource = { uri: item.audioData };
            } else {
              // 回退到文件 URI
              console.log(`📱 使用 expo-av 播放音频（文件 URI）: ${finalUri}`);
              audioSource = { uri: finalUri };
            }
            
            // 设置音频模式
            await Audio.setAudioModeAsync({
              playsInSilentModeIOS: true,
              staysActiveInBackground: false,
              shouldDuckAndroid: true,
            });
            
            // 创建并加载音频
            const { sound } = await Audio.Sound.createAsync(
              audioSource,
              {
                shouldPlay: true,
                volume: this.config.playback.volume,
                rate: this.config.playback.rate,
                isLooping: false,
              }
            );
            
            this.audioPlayer = sound;
            
            // 监听播放完成
            sound.setOnPlaybackStatusUpdate((status: any) => {
              if (status.isLoaded) {
                if (status.didJustFinish) {
                  // 播放完成
                  this.updatePerformanceStats('playback', Date.now() - playbackStartTime);
                  eventBus.emit('tts:audio_complete', {
                    sessionId: item.sessionId,
                    duration: item.metadata.duration,
                    timestamp: Date.now()
                  });
                  
                  sound.unloadAsync().catch((e: unknown) => {
                    console.warn('⚠️ 释放音频资源失败:', e);
                  });
                  this.audioPlayer = null;
                  resolve();
                }
              } else if (status.error) {
                // 播放错误
                console.error('❌ expo-av 播放错误:', status.error);
                sound.unloadAsync().catch(() => {});
                this.audioPlayer = null;
                reject(new Error(`音频播放失败: ${status.error}`));
              }
            });
            
            // 发布开始播放事件
            eventBus.emit('tts:audio_start', {
              sessionId: item.sessionId,
              duration: item.metadata.duration,
              timestamp: Date.now()
            });
            
            // 超时保护
            setTimeout(() => {
              if (this.audioPlayer === sound) {
                sound.unloadAsync().catch(() => {});
                this.audioPlayer = null;
                resolve();
              }
            }, item.metadata.duration + 2000);
            
            return; // 成功使用 expo-av，直接返回
          } catch (avError: any) {
            const errorMsg = avError?.message || String(avError);
            if (__DEV__) {
              console.log('ℹ️ expo-av 播放失败，尝试 react-native-sound');
            }
            
            // 如果错误是格式无法识别，可能是模拟模式的无效数据，直接回退到系统 TTS
            if (errorMsg.includes('UnrecognizedInputFormat') || errorMsg.includes('could not read the stream')) {
              if (__DEV__) {
                console.log('ℹ️ 音频格式无法识别，回退到系统 TTS');
              }
              try {
                const SpeechModule = await import('expo-speech' as any).catch(() => null);
                if (SpeechModule?.default?.speak) {
                  // 使用保存的原始文本，如果没有则使用默认提示
                  const textToSpeak = item.text || '音频播放';
                  await new Promise<void>((speechResolve) => {
                    SpeechModule.default.speak(textToSpeak, {
                      language: 'zh-CN',
                      pitch: 1.0,
                      rate: this.config.playback.rate,
                      onDone: () => {
                        this.updatePerformanceStats('playback', Date.now() - playbackStartTime);
                        eventBus.emit('tts:audio_complete', {
                          sessionId: item.sessionId,
                          duration: item.metadata.duration,
                          timestamp: Date.now()
                        });
                        speechResolve();
                      },
                      onError: () => speechResolve()
                    });
                  });
                  resolve();
                  return;
                }
              } catch (speechError) {
                console.warn('⚠️ 系统 TTS 也失败:', speechError);
              }
            }
            
            // 如果是 Data URL，需要先转换为文件路径才能使用 react-native-sound
            if (isDataUrl && audioUri.startsWith('data:')) {
              try {
                const filePath = await this.convertDataURLToFile(audioUri);
                audioUri = filePath;
                finalUri = filePath;
                if (!finalUri.startsWith('file://') && !finalUri.startsWith('http://') && !finalUri.startsWith('https://')) {
                  finalUri = `file://${finalUri}`;
                }
                if (__DEV__) {
                  console.log('✅ Data URL 已转换为文件路径，准备使用 react-native-sound');
                }
              } catch (convertError) {
                if (__DEV__) {
                  console.log('ℹ️ 转换 Data URL 失败，使用系统 TTS');
                }
                try {
                  const SpeechModule = await import('expo-speech' as any).catch(() => null);
                  if (SpeechModule?.default?.speak) {
                    await new Promise<void>((speechResolve) => {
                      SpeechModule.default.speak('音频播放', {
                        language: 'zh-CN',
                        rate: this.config.playback.rate,
                        onDone: () => speechResolve(),
                        onError: () => speechResolve()
                      });
                    });
                    resolve();
                    return;
                  }
                } catch (speechError) {
                  // 系统 TTS 也失败，静默处理
                }
                // 如果所有方式都失败，调用统一的回退函数
                this.fallbackToSystemTTSPlayback(item, playbackStartTime, resolve, reject);
                return;
              }
            }
          }
        }
        
        // 回退到 react-native-sound（需要文件路径，不支持 Data URL）
        if (Sound && typeof Sound === 'function' && !audioUri.startsWith('data:')) {
          try {
            console.log(`📱 使用 react-native-sound 播放音频（回退方案）: ${finalUri}`);
            
            // react-native-sound 在 Android 上需要绝对路径（移除 file://）
            let soundPath = finalUri;
            if (Platform.OS === 'android' && soundPath.startsWith('file://')) {
              soundPath = soundPath.replace('file://', '');
            }
            
            const sound = new Sound(soundPath, '', (error: any) => {
              if (error) {
                if (__DEV__) {
                  console.log('ℹ️ react-native-sound 加载失败，回退到系统 TTS');
                }
                this.fallbackToSystemTTSPlayback(item, playbackStartTime, resolve, reject);
                return;
              }
              
              try {
                sound.setVolume(this.config.playback.volume);
                
                if (this.config.playback.rate !== 1.0) {
                  try {
                    sound.setSpeed(this.config.playback.rate);
                  } catch (e) {
                    // setSpeed 可能不支持
                  }
                }
                
                sound.play((success: boolean) => {
                  if (success) {
                    this.updatePerformanceStats('playback', Date.now() - playbackStartTime);
                    eventBus.emit('tts:audio_complete', {
                      sessionId: item.sessionId,
                      duration: item.metadata.duration,
                      timestamp: Date.now()
                    });
                    try {
                      sound.release();
                    } catch (e) {}
                    this.audioPlayer = null;
                    resolve();
                  } else {
                    if (__DEV__) {
                      console.log('ℹ️ react-native-sound 播放失败，使用系统 TTS');
                    }
                    try {
                      sound.release();
                    } catch (e) {}
                    this.audioPlayer = null;
                    // 回退到系统 TTS
                    this.fallbackToSystemTTSPlayback(item, playbackStartTime, resolve, reject);
                  }
                });
                
                eventBus.emit('tts:audio_start', {
                  sessionId: item.sessionId,
                  duration: item.metadata.duration,
                  timestamp: Date.now()
                });
              } catch (e) {
                if (__DEV__) {
                  console.warn('⚠️ 配置音频播放失败，使用系统 TTS:', e);
                }
                try {
                  sound.release();
                } catch (releaseError) {}
                this.audioPlayer = null;
                // 回退到系统 TTS 而不是直接 reject
                this.fallbackToSystemTTSPlayback(item, playbackStartTime, resolve, reject);
              }
            });
            
            this.audioPlayer = sound;
            return; // 成功使用 react-native-sound
          } catch (soundError: any) {
            if (__DEV__) {
              console.log('ℹ️ react-native-sound 不可用，继续回退流程');
            }
          }
        }
        
        // 如果两个播放器都不可用，最后尝试系统 TTS
        if (__DEV__) {
          console.log('ℹ️ 所有音频播放器都不可用，使用系统 TTS');
        }
        await this.fallbackToSystemTTSPlayback(item, playbackStartTime, resolve, reject);
      }
      } catch (error) {
        if (__DEV__) {
          console.warn('⚠️ 音频播放异常，尝试系统 TTS:', error);
        }
        // 发生异常时也尝试系统 TTS
        try {
          await this.fallbackToSystemTTSPlayback(item, playbackStartTime, resolve, reject);
        } catch (fallbackError) {
          reject(new Error('音频播放失败'));
        }
      }
  }

  /**
   * 回退到系统 TTS 播放（当所有音频播放器都失败时）
   */
  private async fallbackToSystemTTSPlayback(
    item: AudioQueueItem,
    playbackStartTime: number,
    resolve: () => void,
    reject: (error: Error) => void
  ): Promise<void> {
    try {
      // 尝试多种方式加载 expo-speech
      let Speech: any = null;
      
      // 方法1: 使用 require（更可靠）
      try {
        const SpeechModule = require('expo-speech');
        Speech = SpeechModule.default || SpeechModule;
        if (__DEV__) {
          console.log('✅ expo-speech 加载成功');
        }
      } catch (requireError) {
        // 方法2: 使用动态导入
        try {
          const SpeechModule = await import('expo-speech' as any);
          Speech = SpeechModule.default || SpeechModule;
          if (__DEV__) {
            console.log('✅ expo-speech 通过动态导入加载成功');
          }
        } catch (importError) {
          // 静默失败，会在下面检查 speak 函数时处理
        }
      }
      
      // 检查 speak 函数是否可用
      const speakFn = Speech?.speak || Speech?.default?.speak;
      if (speakFn && typeof speakFn === 'function') {
        if (__DEV__) {
          console.log('🔊 使用系统 TTS 播放');
        }
        // 使用保存的原始文本，如果没有则使用默认提示
        const textToSpeak = item.text || '音频播放';
        
        await new Promise<void>((speechResolve) => {
          speakFn(textToSpeak, {
            language: 'zh-CN',
            pitch: 1.0,
            rate: this.config.playback.rate,
            volume: this.config.playback.volume,
            onDone: () => {
              if (__DEV__) {
                console.log('✅ 系统 TTS 播放完成');
              }
              this.updatePerformanceStats('playback', Date.now() - playbackStartTime);
              eventBus.emit('tts:audio_complete', {
                sessionId: item.sessionId,
                duration: item.metadata.duration,
                timestamp: Date.now()
              });
              speechResolve();
            },
            onError: (error: any) => {
              if (__DEV__) {
                console.warn('⚠️ 系统 TTS 播放错误:', error);
              }
              speechResolve();
            }
          });
        });
        resolve();
      } else {
        if (__DEV__) {
          console.error('❌ expo-speech speak 函数不可用');
          console.error('   Speech 对象:', Speech);
        }
        reject(new Error('所有音频播放方式都不可用'));
      }
    } catch (error) {
      if (__DEV__) {
        console.error('❌ 系统 TTS 回退失败:', error);
      }
      reject(new Error('所有音频播放方式都失败'));
    }
  }

  /**
   * 停止当前播放
   */
  private async stopCurrentPlayback(): Promise<void> {
    try {
      if (Platform.OS === 'web' && this.audioPlayer) {
        (this.audioPlayer as HTMLAudioElement).pause();
        (this.audioPlayer as HTMLAudioElement).currentTime = 0;
      } else if (this.audioPlayer) {
        // expo-av
        if (Audio && Audio.Sound && this.audioPlayer && typeof this.audioPlayer.unloadAsync === 'function') {
          await this.audioPlayer.unloadAsync();
        } 
        // react-native-sound
        else if (Sound && this.audioPlayer && typeof this.audioPlayer.stop === 'function') {
          this.audioPlayer.stop(() => {
            try {
              if (this.audioPlayer && typeof this.audioPlayer.release === 'function') {
                this.audioPlayer.release();
              }
            } catch (e) {
              console.warn('⚠️ 释放音频资源失败:', e);
            }
          });
        }
      }
      this.audioPlayer = null;
    } catch (error) {
      console.error('停止播放失败:', error);
      this.audioPlayer = null;
    }
  }

  /**
   * 暂停当前播放
   */
  private async pauseCurrentPlayback(): Promise<void> {
    try {
      if (Platform.OS === 'web' && this.audioPlayer) {
        (this.audioPlayer as HTMLAudioElement).pause();
      } else if (this.audioPlayer) {
        // expo-av
        if (Audio && Audio.Sound && this.audioPlayer && typeof this.audioPlayer.pauseAsync === 'function') {
          await this.audioPlayer.pauseAsync();
        }
        // react-native-sound
        else if (Sound && this.audioPlayer && typeof this.audioPlayer.pause === 'function') {
          this.audioPlayer.pause();
        }
      }
    } catch (error) {
      console.error('暂停播放失败:', error);
    }
  }

  /**
   * 将 Data URL 转换为临时文件 URI
   */
  private async convertDataURLToFile(dataUrl: string): Promise<string> {
    try {
      // Web 环境：直接返回 Data URL，HTML5 Audio 可以直接使用
      if (Platform.OS === 'web') {
        console.log('ℹ️ Web 环境，直接使用 Data URL');
        return dataUrl;
      }
      
      // 解析 Data URL
      const matches = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (!matches) {
        throw new Error('无效的 Data URL 格式');
      }
      
      const mimeType = matches[1];
      const base64Data = matches[2];
      
      // 确定文件扩展名
      let extension = 'wav';
      if (mimeType.includes('wav')) {
        extension = 'wav';
      } else if (mimeType.includes('mp3')) {
        extension = 'mp3';
      } else if (mimeType.includes('ogg')) {
        extension = 'ogg';
      }
      
      // 获取临时目录
      // expo-file-system 的正确 API 使用方式
      // 注意：需要使用类型断言访问 cacheDirectory 和 documentDirectory
      let tempDir: string | null = null;
      
      // 使用类型断言访问 FileSystem 属性（因为 TypeScript 类型定义可能不完整）
      const FS = FileSystem as any;
      
      // 方法1: 尝试使用 cacheDirectory（如果存在）- Android上优先使用
      // 注意：expo-file-system 的 cacheDirectory 和 documentDirectory 是字符串属性，不是函数
      if (FS && typeof FS === 'object') {
        if ('cacheDirectory' in FS && FS.cacheDirectory && typeof FS.cacheDirectory === 'string' && FS.cacheDirectory.length > 0) {
          tempDir = FS.cacheDirectory;
          if (Platform.OS === 'android') {
            console.log(`📱 Android cacheDirectory: ${tempDir}`);
          }
        }
        
        // 方法2: 如果 cacheDirectory 不可用，尝试使用 documentDirectory
        if (!tempDir && 'documentDirectory' in FS && FS.documentDirectory && typeof FS.documentDirectory === 'string' && FS.documentDirectory.length > 0) {
          tempDir = FS.documentDirectory;
          if (Platform.OS === 'android') {
            console.log(`📱 Android documentDirectory: ${tempDir}`);
          }
        }
      }
      
      // 如果仍然没有有效的临时目录，检查是否是原生模块未加载的问题
      if (!tempDir) {
        // 尝试直接访问（可能在某些版本中属性名不同）
        try {
          // 某些版本可能需要通过 default 访问
          const FileSystemDefault = (FileSystem as any).default || FileSystem;
          if (FileSystemDefault && typeof FileSystemDefault === 'object') {
            if ('cacheDirectory' in FileSystemDefault && FileSystemDefault.cacheDirectory) {
              tempDir = FileSystemDefault.cacheDirectory;
            } else if ('documentDirectory' in FileSystemDefault && FileSystemDefault.documentDirectory) {
              tempDir = FileSystemDefault.documentDirectory;
            }
          }
        } catch (e) {
          // 忽略错误
        }
      }
      
      // 如果 expo-file-system 不可用，尝试使用 react-native-fs 作为回退
      if (!tempDir && RNFS) {
        try {
          // react-native-fs 的缓存目录路径
          if (Platform.OS === 'android') {
            // Android: 使用 CachesDirectoryPath（应用缓存目录）
            tempDir = RNFS.CachesDirectoryPath;
            if (tempDir && typeof tempDir === 'string' && tempDir.length > 0) {
              console.log(`📱 使用 react-native-fs CachesDirectoryPath: ${tempDir}`);
            } else {
              // 如果缓存目录不可用，尝试使用 DocumentDirectoryPath
              tempDir = RNFS.DocumentDirectoryPath;
              if (tempDir && typeof tempDir === 'string' && tempDir.length > 0) {
                console.log(`📱 使用 react-native-fs DocumentDirectoryPath: ${tempDir}`);
              }
            }
          } else if (Platform.OS === 'ios') {
            // iOS: 使用 CachesDirectoryPath
            tempDir = RNFS.CachesDirectoryPath;
            if (tempDir && typeof tempDir === 'string' && tempDir.length > 0) {
              console.log(`📱 使用 react-native-fs CachesDirectoryPath: ${tempDir}`);
            }
          }
        } catch (rnfsError) {
          console.warn('⚠️ react-native-fs 目录访问失败:', rnfsError);
        }
      }
      
      // 如果仍然没有有效的临时目录，提供详细的调试信息
      if (!tempDir) {
        console.error('⚠️ 无法获取文件系统临时目录');
        console.error(`   cacheDirectory: ${FS.cacheDirectory || 'null/undefined'}`);
        console.error(`   documentDirectory: ${FS.documentDirectory || 'null/undefined'}`);
        console.error(`   Platform: ${Platform.OS}`);
        console.error(`   FileSystem type: ${typeof FileSystem}`);
        
        if (Platform.OS === 'android') {
          console.error('   Android 提示:');
          console.error('     1. 请确保使用 Expo Dev Client 而不是 Expo Go');
          console.error('     2. 或者运行: npx expo prebuild 和 npx expo run:android');
          console.error('     3. 确保 expo-file-system 或 react-native-fs 已正确安装');
          console.error('     4. 如果使用 Expo Go，文件系统 API 可能不可用，请使用开发客户端');
          console.error('     5. 请检查应用是否有存储权限');
          if (RNFS) {
            console.error('     6. react-native-fs 已加载，但目录路径不可用');
          } else {
            console.error('     6. react-native-fs 未加载，尝试检查是否已正确链接');
          }
        }
        
        // 发布权限错误事件
        eventBus.emit('tts:init_error', {
          error: `无法获取临时目录，文件系统 API 不可用 (Platform: ${Platform.OS})`,
          timestamp: Date.now()
        });
        
        throw new Error('无法获取临时目录，文件系统 API 不可用。请使用 Expo Dev Client 或原生构建。');
      }
      
      // 确保目录路径以 / 结尾
      if (!tempDir.endsWith('/')) {
        tempDir += '/';
      }
      
      const fileName = `tts_${Date.now()}_${Math.random().toString(36).substring(7)}.${extension}`;
      const fileUri = `${tempDir}${fileName}`;
      
      console.log('📁 创建临时音频文件:', fileUri);
      if (Platform.OS === 'android') {
        console.log(`📱 Android 文件路径: ${fileUri}`);
      }
      
      // 将 Base64 数据写入文件
      // 优先使用 expo-file-system，如果不可用则使用 react-native-fs
      console.log(`📝 准备写入文件: ${fileUri}`);
      console.log(`📊 Base64 数据长度: ${base64Data.length} 字符`);
      
      try {
        // 尝试使用 expo-file-system（如果可用且目录来自 expo-file-system）
        if (tempDir && (FS.cacheDirectory || FS.documentDirectory) && FileSystem && typeof FileSystem.writeAsStringAsync === 'function') {
          console.log('📝 使用 expo-file-system 写入文件...');
          // expo-file-system 的 writeAsStringAsync 支持 base64 编码
          // 注意：encoding 应该是 FileSystem.EncodingType.Base64 或字符串 'base64'
          const encoding = (FileSystem as any).EncodingType?.Base64 || 'base64';
          await FileSystem.writeAsStringAsync(fileUri, base64Data, {
            encoding: encoding as any,
          });
          console.log('✅ expo-file-system 写入完成');
        } else if (RNFS && typeof RNFS.writeFile === 'function') {
          // react-native-fs 的回退方案
          console.log('📝 使用 react-native-fs 写入文件...');
          // react-native-fs 的 writeFile: (filepath, contents, encoding)
          // encoding: 'utf8' | 'base64' | 'ascii'
          await RNFS.writeFile(fileUri, base64Data, 'base64');
          console.log('✅ react-native-fs 写入完成');
        } else {
          throw new Error('没有可用的文件系统 API（expo-file-system 和 react-native-fs 都不可用）');
        }
      } catch (writeError) {
        // 如果 expo-file-system 写入失败，尝试使用 react-native-fs 作为回退
        if (FileSystem && typeof FileSystem.writeAsStringAsync === 'function' && RNFS && typeof RNFS.writeFile === 'function') {
          console.warn('⚠️ expo-file-system 写入失败，尝试使用 react-native-fs:', writeError);
          try {
            await RNFS.writeFile(fileUri, base64Data, 'base64');
            console.log('✅ 使用 react-native-fs 写入成功');
          } catch (rnfsWriteError) {
            console.error('❌ react-native-fs 写入也失败:', rnfsWriteError);
            throw new Error(`文件写入失败: ${rnfsWriteError instanceof Error ? rnfsWriteError.message : '未知错误'}`);
          }
        } else {
          throw writeError;
        }
      }
      
      // 验证文件是否真的写入成功
      // 优先使用 react-native-fs 的 stat（因为文件可能是用 react-native-fs 写入的）
      try {
        let fileInfo: any = null;
        let usedRNFS = false;
        
        // 优先使用 react-native-fs 的 stat（如果可用）
        if (RNFS && typeof RNFS.stat === 'function') {
          try {
            fileInfo = await RNFS.stat(fileUri);
            usedRNFS = true;
            console.log(`🔍 react-native-fs 文件信息:`, fileInfo);
          } catch (statError: any) {
            // react-native-fs 的 stat 如果文件不存在会抛出错误
            console.warn('⚠️ react-native-fs stat 失败（文件可能不存在）:', statError?.message || statError);
          }
        }
        
        // 如果 react-native-fs 不可用或失败，尝试使用 expo-file-system legacy API
        if (!fileInfo && FileSystem) {
          try {
            // 使用 legacy API 以避免弃用警告
            const LegacyFileSystem = require('expo-file-system/legacy');
            if (LegacyFileSystem && typeof LegacyFileSystem.getInfoAsync === 'function') {
              fileInfo = await LegacyFileSystem.getInfoAsync(fileUri);
              console.log(`🔍 expo-file-system (legacy) 文件信息:`, fileInfo);
            }
          } catch (legacyError: any) {
            console.warn('⚠️ expo-file-system legacy API 不可用:', legacyError?.message || legacyError);
          }
        }
        
        if (fileInfo) {
          // react-native-fs 的 stat 返回对象有 size 属性（文件不存在会抛出错误）
          // expo-file-system 的 getInfoAsync 返回对象有 exists 和 size 属性
          const exists = usedRNFS ? true : (fileInfo.exists !== false);
          const fileSize = fileInfo.size || 0;
          
          if (exists && fileSize > 0) {
            console.log(`✅ 临时音频文件创建并验证成功: ${fileUri}`);
            console.log(`📊 文件大小: ${fileSize} 字节 (${(fileSize / 1024).toFixed(2)} KB)`);
            
            // 检查文件大小是否合理（WAV文件应该至少有几百字节）
            // base64 编码后的大小约为原始数据的 4/3，所以 560060 字符的 base64 约等于 420045 字节
            const expectedMinSize = Math.floor(base64Data.length * 3 / 4);
            if (fileSize < expectedMinSize * 0.9) {
              console.warn(`⚠️ 警告：文件大小异常小（${fileSize} 字节），预期至少 ${expectedMinSize} 字节`);
            }
          } else {
            console.error(`❌ 文件写入后验证失败：文件不存在或大小为 0 (exists: ${exists}, size: ${fileSize})`);
            throw new Error(`文件写入后验证失败：文件不存在或大小为 0`);
          }
        } else {
          // 如果无法验证，但文件已经写入（没有抛出错误），假设文件写入成功
          console.warn('⚠️ 无法获取文件信息进行验证，但文件写入操作已完成，假设文件写入成功');
        }
      } catch (verifyError) {
        console.error('❌ 文件验证失败:', verifyError);
        // 如果验证失败，仍然抛出错误，不让后续代码使用不存在的文件
        throw verifyError;
      }
      
      // 返回文件路径（绝对路径）
      // 在 playAudioWithNativeAPI 中会为 Android 添加 file:// 前缀以适配 react-native-sound
      return fileUri;
    } catch (error) {
      console.error('转换 Data URL 到文件失败:', error);
      // 如果是在 Web 环境或开发环境，尝试返回原始 Data URL 作为回退
      if (Platform.OS === 'web') {
        console.log('⚠️ 文件转换失败，在 Web 环境中使用原始 Data URL');
        return dataUrl;
      }
      // 对于移动端，如果转换失败，这是一个严重错误，应该抛出
      throw error;
    }
  }

  /**
   * 处理合成错误
   */
  private async handleSynthesisError(
    text: string,
    sessionId: string,
    error: any
  ): Promise<void> {
    this.performanceStats.totalErrors++;
    
    // 发布错误事件
    eventBus.emit('tts:synthesis_error', {
      sessionId,
      error: error instanceof Error ? error.message : '未知错误',
      text: text.substring(0, 50),
      timestamp: Date.now()
    });
    
    // 如果使用离线模型失败，尝试回退
    if (this.config.useOfflineModel) {
      console.log('🔊 离线合成失败，尝试回退到系统TTS');
      this.config.useOfflineModel = false;
      
      // 重试合成
      try {
        const result = await this.fallbackToSystemTTS(text);
        await this.addToPlayQueue({
          sessionId,
          audioData: result.audioData,
          text: text, // 保存原始文本用于系统 TTS 回退
          metadata: {
            duration: result.duration,
            sampleRate: result.sampleRate,
            format: result.format
          },
          priority: 0,
          timestamp: Date.now()
        });
      } catch (fallbackError) {
        console.error('回退到系统TTS也失败:', fallbackError);
      }
    }
  }

  /**
   * 处理触发状态变化
   */
  private handleTriggerStateChange(data: { enabled: boolean }): void {
    if (data.enabled) {
      this.resume();
    } else {
      this.pause();
    }
  }

  /**
   * 处理控制命令
   */
  private handleControlCommand(data: {
    action: 'play' | 'pause' | 'stop' | 'skip' | 'volume' | 'rate';
    value?: any;
  }): void {
    switch (data.action) {
      case 'play':
        this.resume();
        break;
      case 'pause':
        this.pause();
        break;
      case 'stop':
        this.stop();
        break;
      case 'skip':
        this.skipCurrent();
        break;
      case 'volume':
        this.setVolume(data.value);
        break;
      case 'rate':
        this.setRate(data.value);
        break;
    }
  }

  /**
   * 处理应用进入后台
   */
  private handleAppBackground(): void {
    console.log('🔊 应用进入后台，暂停TTS');
    this.pause();
  }

  /**
   * 处理应用回到前台
   */
  private handleAppForeground(): void {
    console.log('🔊 应用回到前台');
    // 可以在这里恢复播放，但通常由用户手动恢复
  }

  /**
   * 暂停播放
   */
  public async pause(): Promise<void> {
    if (this.audioPlayer && this.status === 'playing') {
      await this.pauseCurrentPlayback();
      this.updateStatus('paused');
    }
  }

  /**
   * 恢复播放
   */
  public async resume(): Promise<void> {
    if (this.audioPlayer && this.status === 'paused') {
      if (Platform.OS === 'web' && this.audioPlayer) {
        await (this.audioPlayer as HTMLAudioElement).play();
      } else if (this.audioPlayer) {
        // expo-av
        if (Audio && Audio.Sound && typeof this.audioPlayer.playAsync === 'function') {
          await this.audioPlayer.playAsync();
        }
        // react-native-sound
        else if (Sound && typeof this.audioPlayer.play === 'function') {
          this.audioPlayer.play((success: boolean) => {
            if (!success) {
              console.error('❌ 恢复播放失败');
            }
          });
        }
      }
      this.updateStatus('playing');
    } else if (this.audioQueue.length > 0) {
      await this.playQueue();
    }
  }

  /**
   * 检查 Android 音频播放能力
   */
  public isAndroidAudioAvailable(): boolean {
    if (Platform.OS !== 'android') {
      return true; // 非Android平台
    }
    
    // 检查 react-native-sound 是否可用
    if (Sound) {
      return true;
    }
    
    console.warn('⚠️ Android 音频播放不可用: react-native-sound 未安装');
    return false;
  }

  /**
   * 请求 Android 存储权限
   * 注意：Android 10+ 访问应用私有目录通常不需要权限
   * 但为了确保兼容性，我们仍然请求权限
   */
  private async requestStoragePermission(): Promise<boolean> {
    if (Platform.OS !== 'android') {
      return true; // 非Android平台，不需要权限
    }

    try {
      // Android 10 (API 29) 及以上版本使用分区存储
      // 访问应用私有目录（cacheDirectory/documentDirectory）不需要权限
      // 但为了兼容旧版本和确保功能正常，我们仍然检查权限
      
      // 检查是否已有权限
      const checkResult = await PermissionsAndroid.check(
        PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE
      );
      
      if (checkResult) {
        console.log('✅ Android 存储权限已授予');
        return true;
      }

      // 请求权限
      console.log('📱 请求 Android 存储权限...');
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE,
        {
          title: '需要存储权限',
          message: '应用需要访问存储空间以保存临时音频文件',
          buttonNeutral: '稍后询问',
          buttonNegative: '拒绝',
          buttonPositive: '允许',
        }
      );

      console.log('📱 Android 存储权限请求结果:', granted);

      if (granted === PermissionsAndroid.RESULTS.GRANTED) {
        console.log('✅ Android 存储权限已授予');
        return true;
      } else {
        const canAskAgain = granted !== PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN;
        console.warn('⚠️ Android 存储权限被拒绝:', granted);
        
        // 发布权限被拒绝事件
        eventBus.emit('tts:init_error', {
          error: canAskAgain
            ? '存储权限被拒绝，请允许应用访问存储空间'
            : '存储权限被永久拒绝，请前往设置手动授予权限',
          timestamp: Date.now()
        });

        // 即使权限被拒绝，我们仍然尝试使用应用私有目录
        // 因为应用私有目录通常不需要权限
        console.log('⚠️ 权限被拒绝，但将尝试使用应用私有目录（通常不需要权限）');
        return false;
      }
    } catch (error) {
      console.error('❌ 请求 Android 存储权限失败:', error);
      // 即使请求失败，也尝试继续（应用私有目录可能不需要权限）
      return false;
    }
  }

  /**
   * 停止播放
   */
  public async stop(): Promise<void> {
    if (this.audioPlayer) {
      await this.stopCurrentPlayback();
      this.audioPlayer = null;
    }
    
    this.audioQueue = [];
    this.isPlaying = false;
    this.updateStatus('idle');
  }

  /**
   * 跳过当前播放
   */
  public async skipCurrent(): Promise<void> {
    if (this.audioPlayer) {
      await this.stopCurrentPlayback();
      this.audioPlayer = null;
    }
    
    // 如果队列中有更多项目，播放下一个
    if (this.audioQueue.length > 0) {
      await this.playQueue();
    } else {
      this.isPlaying = false;
      this.updateStatus('idle');
    }
  }

  /**
   * 设置音量
   */
  public async setVolume(volume: number): Promise<void> {
    this.config.playback.volume = Math.max(0, Math.min(1, volume));
    
    if (this.audioPlayer) {
      // expo-av
      if (Audio && Audio.Sound && typeof this.audioPlayer.setVolumeAsync === 'function') {
        await this.audioPlayer.setVolumeAsync(this.config.playback.volume);
      }
      // react-native-sound
      else if (typeof this.audioPlayer.setVolume === 'function') {
        this.audioPlayer.setVolume(this.config.playback.volume);
      }
    }
    
    console.log(`🔊 音量设置为: ${this.config.playback.volume}`);
  }

  /**
   * 设置播放速率
   */
  public async setRate(rate: number): Promise<void> {
    this.config.playback.rate = Math.max(0.5, Math.min(2, rate));
    
    if (this.audioPlayer) {
      // expo-av
      if (Audio && Audio.Sound && typeof this.audioPlayer.setRateAsync === 'function') {
        await this.audioPlayer.setRateAsync(this.config.playback.rate, true);
      }
      // react-native-sound
      else if (typeof this.audioPlayer.setSpeed === 'function') {
        try {
          this.audioPlayer.setSpeed(this.config.playback.rate);
        } catch (e) {
          console.warn('⚠️ 设置播放速度失败（可能不支持）:', e);
        }
      }
    }
    
    console.log(`🔊 播放速率设置为: ${this.config.playback.rate}`);
  }

  /**
   * 更新状态
   */
  private updateStatus(
    status: TTSStatus,
    error?: string
  ): void {
    this.status = status;
    
    // 同步到状态管理器（如果需要）
    // 注意：状态管理器可能没有ttsStatus字段，这里仅发布事件
    
    // 发布状态变化事件
    eventBus.emit('tts:status_changed', {
      status,
      sessionId: this.currentSessionId,
      error,
      timestamp: Date.now()
    });
    
    console.log(`🔊 TTS状态更新: ${status}${error ? ` (错误: ${error})` : ''}`);
  }

  /**
   * 更新性能统计
   */
  private updatePerformanceStats(type: 'synthesis' | 'playback', time: number): void {
    if (type === 'synthesis') {
      this.performanceStats.totalSynthesis++;
      this.performanceStats.avgSynthesisTime = 
        (this.performanceStats.avgSynthesisTime * (this.performanceStats.totalSynthesis - 1) + time) / 
        this.performanceStats.totalSynthesis;
    } else {
      this.performanceStats.totalPlayback++;
      this.performanceStats.avgPlaybackTime = 
        (this.performanceStats.avgPlaybackTime * (this.performanceStats.totalPlayback - 1) + time) / 
        this.performanceStats.totalPlayback;
    }
    
    this.performanceStats.lastSessionTime = Date.now();
  }

  /**
   * 生成缓存键
   */
  private generateCacheKey(text: string, sessionId: string): string {
    // 简单的哈希函数
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      const char = text.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // 转换为32位整数
    }
    return `${sessionId}_${Math.abs(hash)}`;
  }

  /**
   * 更新配置
   */
  public updateConfig(newConfig: Partial<TTSConfig>): void {
    this.config = { ...this.config, ...newConfig };
    
    // 更新音频处理器配置
    if (newConfig.audioConfig) {
      audioProcessor.updateConfig(newConfig.audioConfig);
    }
    
    eventBus.emit('tts:config_updated', {
      config: this.config,
      timestamp: Date.now()
    });
    
    console.log('🔊 TTS配置已更新');
  }

  /**
   * 获取当前状态
   */
  public getStatus(): TTSStatus {
    return this.status;
  }

  /**
   * 获取性能统计
   */
  public getPerformanceStats() {
    return { ...this.performanceStats };
  }

  /**
   * 获取配置
   */
  public getConfig(): TTSConfig {
    return { ...this.config };
  }

  /**
   * 检查模块是否就绪
   */
  public isReady(): boolean {
    return this.isActive && this.status !== 'error';
  }

  /**
   * 清理资源
   */
  public async destroy(): Promise<void> {
    await this.stop();
    
    if (this.ttsModel && this.ttsModel.isLoaded) {
      await this.ttsModel.unloadModel();
      this.ttsModel = null;
    }
    
    this.isActive = false;
    this.audioQueue = [];
    this.synthesisPromises.clear();
    
    // 清理音频处理器缓存
    audioProcessor.clearCache();
    
    this.updateStatus('idle');
    
    eventBus.emit('tts:module_stopped', {
      timestamp: Date.now()
    });
    
    console.log('🔊 TTS模块资源已清理');
  }
}

// 导出TTS模块单例
export const ttsModule = TTSModule.getInstance();
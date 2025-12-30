// mobile/src/modules/TTSModule/services/OfflineTTSService.ts
import { eventBus } from '../../../core/eventBus/EventBus';
import { PaddleSpeechAdapter } from '../models/PaddleSpeechAdapter';

export class OfflineTTSService {
  private static instance: OfflineTTSService;
  private ttsModel: PaddleSpeechAdapter;
  private isInitialized: boolean = false;
  private synthesisQueue: Array<{
    text: string;
    sessionId: string;
    resolve: (result: any) => void;
    reject: (error: any) => void;
  }> = [];
  private isProcessing: boolean = false;
  private audioCache: Map<string, string> = new Map(); // 简单音频缓存

  private constructor() {
    this.ttsModel = new PaddleSpeechAdapter();
  }

  static getInstance(): OfflineTTSService {
    if (!OfflineTTSService.instance) {
      OfflineTTSService.instance = new OfflineTTSService();
    }
    return OfflineTTSService.instance;
  }

  async initialize(): Promise<boolean> {
    try {
      if (this.isInitialized) return true;
      
      console.log('🔊 初始化离线TTS服务...');
      
      // 加载TTS模型
      await this.ttsModel.loadModel({
        modelPath: '',
        language: 'zh-CN',
        sampleRate: 24000
      });
      
      this.isInitialized = true;
      
      // 启动队列处理
      this.processQueue();
      
      eventBus.emit('tts:offline_ready', {
        timestamp: Date.now(),
        model: this.ttsModel.name
      });
      
      console.log('🔊 离线TTS服务初始化完成');
      return true;
      
    } catch (error) {
      console.error('初始化离线TTS服务失败:', error);
      eventBus.emit('tts:offline_error', {
        error: '离线TTS初始化失败',
        details: error instanceof Error ? error.message : '未知错误'
      });
      return false;
    }
  }

  async synthesize(text: string, sessionId: string): Promise<{
    audioData: string;
    duration: number;
    cached: boolean;
  }> {
    return new Promise((resolve, reject) => {
      // 检查缓存
      const cacheKey = this.generateCacheKey(text, sessionId);
      if (this.audioCache.has(cacheKey)) {
        console.log('🔊 使用缓存的音频');
        resolve({
          audioData: this.audioCache.get(cacheKey)!,
          duration: this.estimateDuration(text),
          cached: true
        });
        return;
      }

      // 加入合成队列
      this.synthesisQueue.push({
        text,
        sessionId,
        resolve: (result) => {
          // 缓存结果
          this.audioCache.set(cacheKey, result.audioData);
          resolve({ ...result, cached: false });
        },
        reject
      });

      // 触发队列处理
      this.processQueue();
    });
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessing || this.synthesisQueue.length === 0) {
      return;
    }

    this.isProcessing = true;
    
    while (this.synthesisQueue.length > 0) {
      const task = this.synthesisQueue.shift()!;
      
      try {
        // 更新状态
        eventBus.emit('tts:synthesis_start', {
          sessionId: task.sessionId,
          textLength: task.text.length,
          timestamp: Date.now()
        });

        // 执行合成
        const result = await this.ttsModel.synthesize(task.text, {
          speed: 1.0,
          pitch: 1.0
        });

        // 任务完成
        task.resolve({
          audioData: result.audioData,
          duration: result.duration,
          synthesisTime: result.synthesisTime || 0
        });

        // 发布合成完成事件
        eventBus.emit('tts:synthesis_complete', {
          sessionId: task.sessionId,
          duration: result.duration,
          synthesisTime: result.synthesisTime || 0,
          timestamp: Date.now()
        });
        
      } catch (error) {
        console.error('合成任务失败:', error);
        task.reject(error);
        
        // 发布错误事件
        eventBus.emit('tts:synthesis_error', {
          sessionId: task.sessionId,
          error: error instanceof Error ? error.message : '未知错误',
          text: task.text.substring(0, 50),
          timestamp: Date.now()
        });
      }
      
      // 避免过度占用主线程
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    
    this.isProcessing = false;
  }

  private generateCacheKey(text: string, sessionId: string): string {
    // 简单的缓存键生成
    return `${sessionId}_${text.substring(0, 50)}_${text.length}`;
  }

  private estimateDuration(text: string): number {
    // 估算音频时长（中文约4字/秒）
    return (text.length / 4) * 1000;
  }

  clearCache(): void {
    this.audioCache.clear();
    console.log('🔊 音频缓存已清空');
  }

  async destroy(): Promise<void> {
    this.synthesisQueue = [];
    await this.ttsModel.unloadModel();
    this.isInitialized = false;
    this.audioCache.clear();
    
    console.log('🔊 离线TTS服务已销毁');
  }
}
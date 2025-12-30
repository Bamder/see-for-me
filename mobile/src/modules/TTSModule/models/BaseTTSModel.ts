/**
 * TTS模型基础接口定义
 * 支持模型热拔插能力
 */

export interface TTSModelConfig {
    modelPath: string;
    language?: string;
    voice?: string;
    sampleRate?: number;
    volume?: number;
    speed?: number;
    pitch?: number;
  }
  
  export interface TTSResult {
    audioData: string; // Base64编码的音频数据或Data URL
    duration: number; // 音频时长（毫秒）
    sampleRate: number;
    format: 'wav' | 'mp3' | 'ogg';
    timestamp: number;
    synthesisTime?: number; // 合成耗时（毫秒）
  }
  
  export interface TTSModel {
    // 模型标识
    readonly name: string;
    readonly version: string;
    readonly supportedLanguages: string[];
    
    // 模型生命周期管理
    isLoaded: boolean;
    loadModel(config: TTSModelConfig): Promise<void>;
    unloadModel(): Promise<void>;
    
    // 核心功能
    synthesize(text: string, config?: Partial<TTSModelConfig>): Promise<TTSResult>;
    
    // 状态查询
    getStatus(): 'unloaded' | 'loading' | 'loaded' | 'error';
    
    // 配置管理
    updateConfig(config: Partial<TTSModelConfig>): void;
    getConfig(): TTSModelConfig;
  }
  
  /**
   * 抽象基类，提供通用实现
   */
  export abstract class BaseTTSModel implements TTSModel {
    public abstract readonly name: string;
    public abstract readonly version: string;
    public abstract readonly supportedLanguages: string[];
    
    public isLoaded: boolean = false;
    protected config: TTSModelConfig;
    protected status: 'unloaded' | 'loading' | 'loaded' | 'error' = 'unloaded';
  
    constructor(defaultConfig: Partial<TTSModelConfig> = {}) {
      this.config = {
        modelPath: '',
        language: 'zh-CN',
        voice: 'default',
        sampleRate: 22050,
        volume: 1.0,
        speed: 1.0,
        pitch: 1.0,
        ...defaultConfig
      };
    }
  
    abstract loadModel(config: TTSModelConfig): Promise<void>;
    abstract unloadModel(): Promise<void>;
    abstract synthesize(text: string, config?: Partial<TTSModelConfig>): Promise<TTSResult>;
  
    getStatus(): 'unloaded' | 'loading' | 'loaded' | 'error' {
      return this.status;
    }
  
    updateConfig(config: Partial<TTSModelConfig>): void {
      this.config = { ...this.config, ...config };
    }
  
    getConfig(): TTSModelConfig {
      return { ...this.config };
    }
  
    protected validateText(text: string): void {
      if (!text || text.trim().length === 0) {
        throw new Error('合成文本不能为空');
      }
      
      if (text.length > 500) {
        throw new Error('合成文本长度不能超过500字符');
      }
    }
  
    protected setStatus(status: 'unloaded' | 'loading' | 'loaded' | 'error'): void {
      this.status = status;
      this.isLoaded = status === 'loaded';
    }
  }
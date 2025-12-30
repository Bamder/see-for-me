import { TTSModel, TTSModelConfig, BaseTTSModel } from './BaseTTSModel';
import { PaddleSpeechAdapter } from './PaddleSpeechAdapter';

export type ModelType = 'paddlespeech' | 'coqui-tts' | 'edge-tts' | 'system-tts';

export interface ModelInfo {
  type: ModelType;
  name: string;
  version: string;
  description: string;
  supportedLanguages: string[];
  modelSize: number; // MB
  isDefault: boolean;
}

/**
 * TTS模型管理器
 * 负责模型的热拔插和生命周期管理
 */
export class ModelManager {
  private static instance: ModelManager;
  private models: Map<ModelType, TTSModel> = new Map();
  private currentModel: TTSModel | null = null;
  private defaultModelType: ModelType = 'paddlespeech';

  private constructor() {
    this.initializeBuiltinModels();
  }

  public static getInstance(): ModelManager {
    if (!ModelManager.instance) {
      ModelManager.instance = new ModelManager();
    }
    return ModelManager.instance;
  }

  /**
   * 初始化内置模型
   */
  private initializeBuiltinModels(): void {
    // 注册PaddleSpeech模型（默认）
    this.registerModel('paddlespeech', new PaddleSpeechAdapter());
    
    // 可以在这里注册其他模型
    // this.registerModel('coqui-tts', new CoquiTTSModel());
    // this.registerModel('edge-tts', new EdgeTTSModel());
    // this.registerModel('system-tts', new SystemTTSModel());
  }

  /**
   * 注册模型
   */
  public registerModel(type: ModelType, model: TTSModel): void {
    this.models.set(type, model);
    console.log(`🔊 注册TTS模型: ${type}`);
  }

  /**
   * 注销模型
   */
  public unregisterModel(type: ModelType): boolean {
    const model = this.models.get(type);
    if (model && model.isLoaded) {
      model.unloadModel().catch(console.error);
    }
    return this.models.delete(type);
  }

  /**
   * 加载模型
   */
  public async loadModel(type: ModelType, config: TTSModelConfig): Promise<void> {
    const model = this.models.get(type);
    if (!model) {
      throw new Error(`模型未注册: ${type}`);
    }

    try {
      await model.loadModel(config);
      this.currentModel = model;
      console.log(`🔊 TTS模型加载成功: ${type}`);
    } catch (error) {
      console.error(`模型加载失败: ${type}`, error);
      
      // 尝试回退到默认模型
      if (type !== this.defaultModelType) {
        console.log('🔊 尝试回退到默认模型');
        await this.loadDefaultModel(config);
      } else {
        throw error;
      }
    }
  }

  /**
   * 加载默认模型
   */
  public async loadDefaultModel(config: TTSModelConfig): Promise<void> {
    return this.loadModel(this.defaultModelType, config);
  }

  /**
   * 卸载当前模型
   */
  public async unloadCurrentModel(): Promise<void> {
    if (this.currentModel && this.currentModel.isLoaded) {
      await this.currentModel.unloadModel();
      this.currentModel = null;
    }
  }

  /**
   * 切换模型
   */
  public async switchModel(type: ModelType, config: TTSModelConfig): Promise<void> {
    if (this.currentModel && this.currentModel.isLoaded) {
      await this.unloadCurrentModel();
    }
    await this.loadModel(type, config);
  }

  /**
   * 获取当前模型
   */
  public getCurrentModel(): TTSModel | null {
    return this.currentModel;
  }

  /**
   * 获取模型信息
   */
  public getModelInfo(type: ModelType): ModelInfo | null {
    const model = this.models.get(type);
    if (!model) return null;

    return {
      type,
      name: model.name,
      version: model.version,
      description: `${model.name} TTS引擎`,
      supportedLanguages: model.supportedLanguages,
      modelSize: type === 'paddlespeech' ? 100 : type === 'coqui-tts' ? 150 : 50, // 估算大小
      isDefault: type === this.defaultModelType
    };
  }

  /**
   * 获取所有可用模型信息
   */
  public getAvailableModels(): ModelInfo[] {
    const models: ModelInfo[] = [];
    
    this.models.forEach((model, type) => {
      const info = this.getModelInfo(type);
      if (info) {
        models.push(info);
      }
    });
    
    return models;
  }

  /**
   * 检查模型是否可用
   */
  public isModelAvailable(type: ModelType): boolean {
    return this.models.has(type);
  }

  /**
   * 设置默认模型类型
   */
  public setDefaultModelType(type: ModelType): void {
    if (this.models.has(type)) {
      this.defaultModelType = type;
    } else {
      console.warn(`模型不存在，无法设置为默认: ${type}`);
    }
  }
}
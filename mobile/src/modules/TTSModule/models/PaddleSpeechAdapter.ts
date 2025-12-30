// mobile/src/modules/TTSModule/models/PaddleSpeechAdapter.ts
import { BaseTTSModel, TTSModelConfig, TTSResult } from './BaseTTSModel';
// 使用 legacy API 以避免弃用警告
import * as FileSystem from 'expo-file-system/legacy';
import { NativeModules, Platform } from 'react-native';

// 原生模块接口定义
interface ModelFileCopierModule {
  copyModels(): Promise<boolean>;
}

const { ModelFileCopier } = NativeModules;

// Base64编码/解码工具函数（不依赖外部库）
function base64Encode(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  // 使用btoa（浏览器环境）或Buffer（Node环境）
  if (typeof btoa !== 'undefined') {
    return btoa(binary);
  } else if (typeof Buffer !== 'undefined') {
    return Buffer.from(binary, 'binary').toString('base64');
  } else {
    // 手动实现Base64编码
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    let result = '';
    let i = 0;
    while (i < binary.length) {
      const a = binary.charCodeAt(i++);
      const b = i < binary.length ? binary.charCodeAt(i++) : 0;
      const c = i < binary.length ? binary.charCodeAt(i++) : 0;
      const bitmap = (a << 16) | (b << 8) | c;
      result += chars.charAt((bitmap >> 18) & 63);
      result += chars.charAt((bitmap >> 12) & 63);
      result += i - 2 < binary.length ? chars.charAt((bitmap >> 6) & 63) : '=';
      result += i - 1 < binary.length ? chars.charAt(bitmap & 63) : '=';
    }
    return result;
  }
}

/**
 * PaddleSpeech Lite适配器
 * 使用ONNX Runtime在移动端运行PaddleSpeech模型
 */
export class PaddleSpeechAdapter extends BaseTTSModel {
  public readonly name = 'PaddleSpeech-Lite-Chinese';
  public readonly version = '2.5.0';
  public readonly supportedLanguages = ['zh-CN'];
  
  // 模型文件基础路径（统一管理，避免拼写错误）
  private static readonly BASE_ASSETS_PATH = '../../../assets/tts-models/paddlespeech-lite';
  
  private ort: any = null;
  private frontendSession: any = null;
  private acousticSession: any = null;
  private vocoderSession: any = null;
  private isInitialized: boolean = false;
  private sampleRate: number = 24000;

  constructor() {
    super({
      language: 'zh-CN',
      sampleRate: 24000,
      speed: 1.0,
      pitch: 1.0
    });
  }

  async loadModel(config: TTSModelConfig): Promise<void> {
    try {
      this.setStatus('loading');
      this.updateConfig(config);
      
      // 只在成功时输出日志（避免噪音）
      if (__DEV__) {
        console.log('🔊 尝试加载PaddleSpeech Lite模型...');
      }
      
      // 动态导入ONNX Runtime（可选，如果未安装会使用模拟模式）
      this.ort = await this.loadONNXRuntime();
      
      // 加载所有模型组件（即使 ONNX Runtime 不可用，也先复制模型文件）
      // 这样当 ONNX Runtime 可用时就能直接使用
      await this.loadModelComponents();
      
      // 如果没有 ONNX Runtime，进入模拟模式
      if (!this.ort) {
        // 静默处理，不输出日志（系统会自动回退到系统TTS）
        this.isInitialized = true;
        this.setStatus('loaded');
        return;
      }
      
      this.isInitialized = true;
      this.setStatus('loaded');
      
      // 只在成功时输出日志
      if (__DEV__) {
        console.log('✅ PaddleSpeech Lite模型加载完成');
      }
      
    } catch (error) {
      this.setStatus('error');
      console.error('加载PaddleSpeech模型失败:', error);
      throw new Error(`PaddleSpeech模型加载失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  }

  private async loadONNXRuntime(): Promise<any> {
    // 关键：在 require 之前先检测环境，避免模块加载时访问原生模块导致错误
    
    // 方法1: 检测 Expo Go 环境
    try {
      const Constants = await import('expo-constants').catch(() => null);
      if (Constants?.default?.executionEnvironment === 'storeClient') {
        // 静默处理，不输出日志
        return null;
      }
    } catch {
      // 继续检测
    }
    
    // 方法2: 检查是否在原生构建环境中
    // 如果是在开发环境中且没有原生构建，直接返回 null
    try {
      // 尝试检查原生模块是否可用（简单检测）
      const { NativeModules } = require('react-native');
      // 如果原生模块数量非常少，可能是 Expo Go 环境
      const nativeModuleCount = Object.keys(NativeModules || {}).length;
      if (nativeModuleCount < 10) {
        // 静默处理，不输出日志（避免控制台噪音）
        return null;
      }
    } catch {
      // 如果无法检查，直接返回 null（安全起见，避免尝试加载）
      return null;
    }
    
    // 尝试加载模块
    // 注意：即使有 try-catch，模块加载时的同步错误可能仍然会显示在控制台
    // 但我们可以捕获它并返回 null，让系统使用回退方案
    try {
      if (typeof require === 'undefined') {
        return null;
      }
      
      // 尝试加载模块
      // 警告：即使有 try-catch，原生模块的错误可能在控制台显示
      // 这是正常的，因为我们会在 catch 中处理并返回 null，使用系统TTS回退
      const ortModule = require('onnxruntime-react-native');
      
      // 检查模块结构
      if (!ortModule || typeof ortModule !== 'object') {
        return null;
      }
      
      // 检查关键 API
      const ort = ortModule.default || ortModule;
      if (!ort || typeof ort !== 'object' || !ort.InferenceSession || typeof ort.InferenceSession.create !== 'function') {
        return null;
      }
      
      // 只在成功时输出日志
      if (__DEV__) {
        console.log('✅ ONNX Runtime RN 加载成功');
      }
      return ort;
      
    } catch (error: any) {
      // 捕获 require 和模块初始化时的所有错误
      // 注意：即使捕获了错误，原生模块的错误仍然可能显示在控制台
      // 但不会影响程序运行，因为我们返回 null 让系统使用回退方案
      
      const errorMessage = error?.message || String(error);
      const errorStack = error?.stack || '';
      
      // 判断是否是原生模块相关错误
      const isNativeModuleError = 
        errorMessage.includes('Cannot read property') ||
        errorMessage.includes('install') ||
        errorMessage.includes('null') ||
        errorMessage.includes('undefined') ||
        errorMessage.includes('Native module') ||
        errorMessage.includes('MODULE_NOT_FOUND') ||
        errorStack.includes('binding.ts') ||
        errorStack.includes('onnxruntime-react-native') ||
        errorStack.includes('backend.ts');
      
      if (isNativeModuleError) {
        // 静默处理，不输出警告（因为这是预期的）
        // 只在调试时输出
        if (__DEV__) {
          console.log('ℹ️ ONNX Runtime RN 不可用（需要原生构建），将使用系统TTS');
        }
      }
      
      // 静默返回 null，让系统使用回退方案（系统TTS）
      return null;
    }
  }

  private async fallbackONNXRuntime(): Promise<any> {
    // 通过WebView运行ONNX Runtime Web
    // 这是一个备选方案，性能较差但兼容性好
    console.log('使用WebView ONNX Runtime后备方案');
    return {
      InferenceSession: {
        create: async () => ({ 
          run: () => Promise.resolve({}) 
        })
      }
    };
  }

  private async loadModelComponents(): Promise<void> {
    // 即使 ONNX Runtime 不可用，也先尝试复制模型文件
    // 这样当 ONNX Runtime 可用时就能直接使用
    const modelAssets = await this.loadModelAssets();
    
    // 如果没有 ONNX Runtime，无法加载模型，直接返回模拟模式
    if (!this.ort) {
      console.log('ℹ️ ONNX Runtime不可用，跳过模型加载，使用模拟模式');
      this.isInitialized = true;
      this.setStatus('loaded');
      return;
    }
    
    // 检查必需的模型文件（声学模型和声码器是必需的，前端模型可选）
    if (!modelAssets.acoustic.model || !modelAssets.vocoder.model) {
      console.warn('⚠️ PaddleSpeech必需模型文件未找到，将使用模拟模式');
      // 设置模拟模式标志
      this.isInitialized = true;
      this.setStatus('loaded');
      return;
    }
    
    try {
      // 1. 加载文本前端模型（可选，如果不存在则使用代码实现的前端处理）
      if (modelAssets.frontend.model) {
        this.frontendSession = await this.ort.InferenceSession.create(
          modelAssets.frontend.model
        );
        console.log('✅ 前端模型已加载');
      } else {
        console.log('ℹ️ 前端模型未找到，将使用代码实现的前端处理');
        this.frontendSession = null;
      }
      
      // 2. 加载声学模型（必需）
      this.acousticSession = await this.ort.InferenceSession.create(
        modelAssets.acoustic.model
      );
      console.log('✅ 声学模型已加载');
      
      // 3. 加载声码器（必需）
      this.vocoderSession = await this.ort.InferenceSession.create(
        modelAssets.vocoder.model
      );
      console.log('✅ 声码器模型已加载');
    } catch (error) {
      console.error('加载ONNX模型失败:', error);
      // 模型加载失败时，不抛出错误，而是进入模拟模式
      console.warn('⚠️ 模型加载失败，将使用模拟模式');
      this.isInitialized = true;
      this.setStatus('loaded');
      return;
    }
  }

  private async loadModelAssets() {
    // 从assets加载模型文件
      // 注意：模型文件需要放在 assets/tts-models/paddlespeech-lite/ 目录下
      // 在 Expo 中，需要使用 Asset API 来正确加载 assets 目录的文件
      try {
        console.log('🔍 开始加载模型资源...');
        
      // 注意：require() 必须使用静态字符串路径，不能使用变量
      // Metro bundler 需要在编译时解析依赖
      // 路径层级：从 src/modules/TTSModule/models/ 向上4级(../../../../)到 mobile/，然后进入 assets/
      const FRONTEND_CONFIG_PATH = '../../../../assets/tts-models/paddlespeech-lite/frontend/config.json';
      const ACOUSTIC_CONFIG_PATH = '../../../../assets/tts-models/paddlespeech-lite/acoustic/config.json';
      const VOCODER_CONFIG_PATH = '../../../../assets/tts-models/paddlespeech-lite/vocoder/config.json';
      const FRONTEND_MODEL_PATH = '../../../../assets/tts-models/paddlespeech-lite/frontend/model.onnx';
      const ACOUSTIC_MODEL_PATH = '../../../../assets/tts-models/paddlespeech-lite/acoustic/model.onnx';
      const VOCODER_MODEL_PATH = '../../../../assets/tts-models/paddlespeech-lite/vocoder/model.onnx';
      
      // 1. 加载配置文件（JSON 文件）
      let frontendConfig: any = null;
      let acousticConfig: any = null;
      let vocoderConfig: any = null;
      
      // 尝试使用 require 加载（开发环境通常可以工作）
      // 注意：必须使用字符串字面量，不能使用变量
      // 路径层级：从 src/modules/TTSModule/models/ 向上4级到 mobile/，然后进入 assets/
      try {
        console.log('📂 尝试加载前端配置:', FRONTEND_CONFIG_PATH);
        frontendConfig = require('../../../../assets/tts-models/paddlespeech-lite/frontend/config.json');
        console.log('✅ 前端配置加载成功');
      } catch (error: any) {
        console.warn('⚠️ 前端配置加载失败:', error?.message || error);
        console.warn('   尝试的路径:', FRONTEND_CONFIG_PATH);
      }
      
      try {
        console.log('📂 尝试加载声学配置:', ACOUSTIC_CONFIG_PATH);
        acousticConfig = require('../../../../assets/tts-models/paddlespeech-lite/acoustic/config.json');
        console.log('✅ 声学配置加载成功');
      } catch (error: any) {
        console.warn('⚠️ 声学配置加载失败:', error?.message || error);
        console.warn('   尝试的路径:', ACOUSTIC_CONFIG_PATH);
      }
      
      try {
        console.log('📂 尝试加载声码器配置:', VOCODER_CONFIG_PATH);
        vocoderConfig = require('../../../../assets/tts-models/paddlespeech-lite/vocoder/config.json');
        console.log('✅ 声码器配置加载成功');
      } catch (error: any) {
        console.warn('⚠️ 声码器配置加载失败:', error?.message || error);
        console.warn('   尝试的路径:', VOCODER_CONFIG_PATH);
      }
      
      // 2. 加载 ONNX 模型文件
      // 使用原生模块从 assets 复制文件到 documentDirectory
      
      let frontendModelPath: string | null = null;
      let acousticModelPath: string | null = null;
      let vocoderModelPath: string | null = null;
      
      // 辅助函数：调用原生模块复制模型文件
      const copyModelsFromAssets = async (): Promise<boolean> => {
        try {
          if (!ModelFileCopier || Platform.OS !== 'android') {
            if (__DEV__) {
              console.warn('⚠️ ModelFileCopier 原生模块不可用（非 Android 平台或模块未加载）');
            }
            return false;
          }
          
          if (__DEV__) {
            console.log('📂 调用原生模块复制模型文件...');
          }
          
          const copier = ModelFileCopier as ModelFileCopierModule;
          const success = await copier.copyModels();
          
          if (success) {
            if (__DEV__) {
              console.log('✅ 模型文件复制成功');
            }
            return true;
          } else {
            if (__DEV__) {
              console.warn('⚠️ 模型文件复制返回 false');
            }
            return false;
          }
        } catch (error: any) {
          // 输出详细错误信息，帮助调试
          const errorMessage = error?.message || String(error);
          const errorCode = error?.code || '';
          console.error('❌ 复制模型文件失败:', errorMessage);
          if (errorCode) {
            console.error('   错误代码:', errorCode);
          }
          if (error?.userInfo || error?.nativeStackAndroid) {
            console.error('   详细信息:', JSON.stringify(error?.userInfo || error?.nativeStackAndroid));
          }
          return false;
        }
      };
      
      // 尝试复制模型文件（如果需要）
      if (Platform.OS === 'android' && FileSystem.documentDirectory) {
        const targetBasePath = FileSystem.documentDirectory + 'assets/tts-models/paddlespeech-lite/';
        
        // 检查文件是否已存在
        const frontendTargetPath = targetBasePath + 'frontend/model.onnx';
        const acousticTargetPath = targetBasePath + 'acoustic/model.onnx';
        const vocoderTargetPath = targetBasePath + 'vocoder/model.onnx';
        
        try {
          const frontendExists = (await FileSystem.getInfoAsync(frontendTargetPath)).exists;
          const acousticExists = (await FileSystem.getInfoAsync(acousticTargetPath)).exists;
          const vocoderExists = (await FileSystem.getInfoAsync(vocoderTargetPath)).exists;
          
          // 如果文件不存在，调用原生模块复制
          if (!frontendExists || !acousticExists || !vocoderExists) {
            if (__DEV__) {
              console.log('📦 检测到模型文件缺失，开始复制...');
            }
            
            // 首先尝试使用原生模块复制（从 APK assets）
            const nativeCopySuccess = await copyModelsFromAssets();
            
            // 如果原生模块复制失败，尝试从 bundleDirectory 复制（Metro 打包的文件）
            if (!nativeCopySuccess && FileSystem.bundleDirectory) {
              if (__DEV__) {
                console.log('📦 原生模块复制失败，尝试从 bundle 目录复制...');
              }
              
              try {
                const bundleBasePath = FileSystem.bundleDirectory.replace(/^asset:\//, '') + 'tts-models/paddlespeech-lite/';
                const modelsToCopy = [
                  { source: bundleBasePath + 'frontend/model.onnx', target: frontendTargetPath },
                  { source: bundleBasePath + 'acoustic/model.onnx', target: acousticTargetPath },
                  { source: bundleBasePath + 'vocoder/model.onnx', target: vocoderTargetPath },
                ];
                
                let bundleCopyCount = 0;
                for (const { source, target } of modelsToCopy) {
                  try {
                    // 检查源文件是否存在
                    const sourceInfo = await FileSystem.getInfoAsync(source);
                    if (!sourceInfo.exists) {
                      if (__DEV__) {
                        console.warn(`⚠️ Bundle 源文件不存在: ${source}`);
                      }
                      continue;
                    }
                    
                    // 确保目标目录存在
                    const targetDir = target.substring(0, target.lastIndexOf('/'));
                    const dirInfo = await FileSystem.getInfoAsync(targetDir);
                    if (!dirInfo.exists) {
                      await FileSystem.makeDirectoryAsync(targetDir, { intermediates: true });
                    }
                    
                    // 读取源文件（base64）
                    const sourceData = await FileSystem.readAsStringAsync(source, {
                      encoding: 'base64' as any,
                    });
                    
                    // 写入目标文件
                    await FileSystem.writeAsStringAsync(target, sourceData, {
                      encoding: 'base64' as any,
                    });
                    
                    bundleCopyCount++;
                    if (__DEV__) {
                      console.log(`✅ 从 bundle 复制成功: ${target.substring(target.lastIndexOf('/') + 1)}`);
                    }
                  } catch (error: any) {
                    if (__DEV__) {
                      console.warn(`⚠️ 从 bundle 复制失败 ${source}:`, error?.message || error);
                    }
                  }
                }
                
                if (bundleCopyCount > 0 && __DEV__) {
                  console.log(`✅ 从 bundle 目录成功复制 ${bundleCopyCount} 个模型文件`);
                }
              } catch (error: any) {
                if (__DEV__) {
                  console.warn('⚠️ 从 bundle 目录复制时出错:', error?.message || error);
                }
              }
            }
          }
          
          // 现在尝试读取文件路径
          if ((await FileSystem.getInfoAsync(frontendTargetPath)).exists) {
            frontendModelPath = frontendTargetPath;
            if (__DEV__) {
              console.log('✅ 前端模型路径:', frontendModelPath);
            }
          }
          
          if ((await FileSystem.getInfoAsync(acousticTargetPath)).exists) {
            acousticModelPath = acousticTargetPath;
            if (__DEV__) {
              console.log('✅ 声学模型路径:', acousticModelPath);
            }
          }
          
          if ((await FileSystem.getInfoAsync(vocoderTargetPath)).exists) {
            vocoderModelPath = vocoderTargetPath;
            if (__DEV__) {
              console.log('✅ 声码器模型路径:', vocoderModelPath);
            }
          }
        } catch (error: any) {
          if (__DEV__) {
            console.warn('⚠️ 检查或复制模型文件时出错:', error?.message || error);
          }
        }
      } else {
        if (__DEV__) {
          console.warn('⚠️ 非 Android 平台或 documentDirectory 不可用，无法复制模型文件');
        }
      }
      
      // 检查是否至少有一些文件加载成功
      const hasAnyConfig = frontendConfig || acousticConfig || vocoderConfig;
      const hasAnyModel = frontendModelPath || acousticModelPath || vocoderModelPath;
      
      if (!hasAnyConfig && !hasAnyModel) {
        console.warn('⚠️ PaddleSpeech模型文件未找到，将使用模拟模式');
        console.warn('提示：确保模型文件存在于 assets/tts-models/paddlespeech-lite/ 目录');
        return {
          frontend: { model: null, config: null },
          acoustic: { model: null, config: null },
          vocoder: { model: null, config: null }
        };
      }
      
      console.log('📦 模型资源加载完成:', {
        frontend: { config: !!frontendConfig, model: !!frontendModelPath },
        acoustic: { config: !!acousticConfig, model: !!acousticModelPath },
        vocoder: { config: !!vocoderConfig, model: !!vocoderModelPath }
      });
      
      return {
        frontend: {
          model: frontendModelPath,
          config: frontendConfig
        },
        acoustic: {
          model: acousticModelPath,
          config: acousticConfig
        },
        vocoder: {
          model: vocoderModelPath,
          config: vocoderConfig
        }
      };
    } catch (error: any) {
      console.error('❌ 加载模型资源时发生错误:', error);
      console.warn('⚠️ 将使用模拟模式');
      return {
        frontend: { model: null, config: null },
        acoustic: { model: null, config: null },
        vocoder: { model: null, config: null }
      };
    }
  }

  async synthesize(text: string, config?: Partial<TTSModelConfig>): Promise<TTSResult> {
    try {
      this.validateText(text);
      
      if (!this.isInitialized) {
        throw new Error('模型未初始化');
      }

      const startTime = Date.now();
      
      // 更新配置
      if (config) {
        this.updateConfig(config);
      }

      console.log('🔊 开始PaddleSpeech语音合成:', text.substring(0, 30) + '...');
      
      // 检查必需的模型是否真实加载（前端模型可选）
      if (!this.acousticSession || !this.vocoderSession) {
        // 模拟模式：返回模拟的音频数据
        console.warn('⚠️ 使用模拟模式生成音频（必需模型文件未加载）');
        return this.generateMockAudio(text, startTime);
      }
      
      // 1. 文本处理
      const textFeatures = await this.processText(text);
      
      // 2. 声学模型生成梅尔频谱
      const melSpectrogram = await this.runAcousticModel(textFeatures);
      
      // 3. 声码器生成波形
      const audioData = await this.runVocoder(melSpectrogram);
      
      const synthesisTime = Date.now() - startTime;
      
      const result: TTSResult = {
        audioData: this.audioArrayToDataURL(audioData),
        duration: this.calculateDuration(text),
        sampleRate: this.sampleRate,
        format: 'wav',
        timestamp: Date.now(),
        synthesisTime
      };

      console.log(`🔊 PaddleSpeech合成完成: ${synthesisTime}ms`);
      
      // 性能检查
      if (synthesisTime > 150) { // 稍微放宽到150ms
        console.warn(`合成时间 ${synthesisTime}ms 超过推荐值`);
      }
      
      return result;
      
    } catch (error) {
      console.error('PaddleSpeech合成失败:', error);
      throw new Error(`合成失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  }

  /**
   * 生成模拟音频（用于测试，当模型文件未加载时）
   * 注意：返回空字符串作为 audioData，触发系统 TTS 回退
   */
  private generateMockAudio(text: string, startTime: number): TTSResult {
    // 不再生成无效的音频数据，而是返回空数据
    // 这样 TTSModule 会检测到并回退到系统 TTS
    const duration = this.calculateDuration(text);
    const synthesisTime = Date.now() - startTime;
    
    if (__DEV__) {
      console.log('⚠️ 模拟模式：返回空音频数据，将触发系统 TTS 回退');
    }
    
    return {
      audioData: '', // 返回空字符串，触发回退到系统 TTS
      duration,
      sampleRate: this.sampleRate,
      format: 'wav',
      timestamp: Date.now(),
      synthesisTime
    };
  }

  private async processText(text: string): Promise<any> {
    // 文本处理：如果有前端模型则使用，否则使用代码实现
    let textIds: number[];
    
    if (this.frontendSession) {
      // 使用前端模型处理文本
      const textTensor = new this.ort.Tensor('string', [text], [1]);
      const results = await this.frontendSession.run({ text: textTensor });
      textIds = Array.from(results.phone_ids.data);
    } else {
      // 使用代码实现的前端处理（基于phone_id_map.txt）
      textIds = this.textToIds(text);
    }
    
    const textTensor = new this.ort.Tensor(
      'int64',
      textIds,
      [1, textIds.length]
    );
    
    return { input_ids: textTensor };
  }

  private textToIds(text: string): number[] {
    // 将文本转换为音素ID序列
    // 使用phone_id_map.txt进行映射（如果可用）
    // 简化实现：使用字符编码映射
    // 注意：实际应该使用完整的G2P（字素到音素）转换
    try {
      // 尝试加载phone_id_map（如果存在）
      // 注意：require() 必须使用静态字符串路径，不能使用变量
      // 路径层级：从 src/modules/TTSModule/models/ 向上4级到 mobile/，然后进入 assets/
      const phoneIdMap = require('../../../../assets/tts-models/paddlespeech-lite/acoustic/phone_id_map.txt');
      // 这里需要解析phone_id_map.txt并映射
      // 简化实现：直接使用字符编码
    } catch (e) {
      // phone_id_map不可用，使用简化映射
    }
    
    // 简化处理：将中文字符转换为ID（实际应该使用G2P）
    return text.split('').map(char => {
      const code = char.charCodeAt(0);
      // 中文字符范围：0x4E00-0x9FFF
      if (code >= 0x4E00 && code <= 0x9FFF) {
        return (code - 0x4E00) % 200 + 1; // 映射到1-200范围
      }
      return code % 1000;
    });
  }

  /**
   * 计算音频时长（估算）
   */
  protected calculateDuration(text: string): number {
    // 中文平均语速约4字/秒
    const charsPerSecond = 4;
    const duration = (text.length / charsPerSecond) * 1000;
    return Math.max(500, Math.min(duration, 30000)); // 限制在0.5-30秒之间
  }

  private async runAcousticModel(features: any): Promise<any> {
    // 运行声学模型
    const feeds = { 
      text: features.input_ids 
    };
    
    const results = await this.acousticSession.run(feeds);
    return results.output;
  }

  private async runVocoder(melSpectrogram: any): Promise<Float32Array> {
    // 运行声码器生成音频波形
    const feeds = { 
      logmel: melSpectrogram 
    };
    
    const results = await this.vocoderSession.run(feeds);
    return results.waveform.data;
  }

  private audioArrayToDataURL(audioData: Float32Array): string {
    // 将Float32Array音频数据转换为WAV格式的Data URL
    const wavData = this.createWavBuffer(audioData, this.sampleRate);
    const base64 = this.arrayBufferToBase64(wavData);
    return `data:audio/wav;base64,${base64}`;
  }

  private createWavBuffer(audioData: Float32Array, sampleRate: number): ArrayBuffer {
    // 创建WAV格式的音频缓冲区
    // WAV 文件结构：
    // - RIFF header (12 bytes): 'RIFF' + chunkSize + 'WAVE'
    // - fmt chunk (24 bytes): 'fmt ' + fmtSize (16) + format data
    // - data chunk (8 + dataSize): 'data' + dataSize + PCM data
    const dataSize = audioData.length * 2; // 16-bit PCM = 2 bytes per sample
    const fmtChunkSize = 16; // PCM format chunk size
    // RIFF chunk size = 文件大小 - 8 (减去 'RIFF' 4字节 + chunkSize 4字节)
    // 文件结构: RIFF header (12) + fmt chunk (24) + data chunk (8 + dataSize) = 44 + dataSize
    // 所以 RIFF chunk size = (44 + dataSize) - 8 = 36 + dataSize
    const riffChunkSize = 36 + dataSize;
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);
    
    // RIFF header (0-11)
    this.writeString(view, 0, 'RIFF');           // 0-3: 'RIFF'
    view.setUint32(4, riffChunkSize, true);      // 4-7: chunk size (文件大小 - 8)
    this.writeString(view, 8, 'WAVE');           // 8-11: 'WAVE'
    
    // fmt chunk (12-35)
    this.writeString(view, 12, 'fmt ');          // 12-15: 'fmt ' (注意末尾有空格)
    view.setUint32(16, fmtChunkSize, true);      // 16-19: fmt chunk size (16 for PCM)
    view.setUint16(20, 1, true);                 // 20-21: audio format (1 = PCM)
    view.setUint16(22, 1, true);                 // 22-23: num channels (1 = mono)
    view.setUint32(24, sampleRate, true);        // 24-27: sample rate
    view.setUint32(28, sampleRate * 2, true);    // 28-31: byte rate (sampleRate * numChannels * bitsPerSample/8)
    view.setUint16(32, 2, true);                 // 32-33: block align (numChannels * bitsPerSample/8)
    view.setUint16(34, 16, true);                // 34-35: bits per sample (16-bit)
    
    // data chunk (36-43)
    this.writeString(view, 36, 'data');          // 36-39: 'data'
    view.setUint32(40, dataSize, true);          // 40-43: data chunk size
    
    // PCM数据 (44+)
    // 将 Float32 (-1.0 到 1.0) 转换为 Int16 (-32768 到 32767)
    let offset = 44;
    for (let i = 0; i < audioData.length; i++) {
      // 限制范围并转换
      let sample = Math.max(-1.0, Math.min(1.0, audioData[i]));
      
      // 转换为 16-bit signed integer (-32768 to 32767)
      // 标准做法：将 [-1.0, 1.0] 映射到 [-32768, 32767]
      // 对于负数使用 32768，对于正数使用 32767，以确保对称映射
      let int16Sample: number;
      if (sample < 0) {
        int16Sample = Math.round(sample * 32768);
        // 确保不超过 -32768
        int16Sample = Math.max(-32768, int16Sample);
      } else {
        int16Sample = Math.round(sample * 32767);
        // 确保不超过 32767
        int16Sample = Math.min(32767, int16Sample);
      }
      
      view.setInt16(offset, int16Sample, true);  // little-endian
      offset += 2;
    }
    
    return buffer;
  }

  private writeString(view: DataView, offset: number, string: string): void {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  }

  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    return base64Encode(buffer);
  }

  async unloadModel(): Promise<void> {
    if (this.frontendSession) {
      this.frontendSession.release();
      this.frontendSession = null;
    }
    if (this.acousticSession) {
      this.acousticSession.release();
      this.acousticSession = null;
    }
    if (this.vocoderSession) {
      this.vocoderSession.release();
      this.vocoderSession = null;
    }
    
    this.isInitialized = false;
    this.setStatus('unloaded');
    
    console.log('🔊 PaddleSpeech模型已卸载');
  }
}
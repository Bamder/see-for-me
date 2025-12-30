/**
 * 音频处理器
 * 负责音频数据的格式转换、处理、缓存和管理
 * 位置：mobile/src/modules/TTSModule/utils/AudioProcessor.ts
 */

import * as FileSystem from 'expo-file-system';

// Base64编码/解码工具函数
function base64Encode(binary: string): string {
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

function base64Decode(base64: string): string {
  if (typeof atob !== 'undefined') {
    return atob(base64);
  } else if (typeof Buffer !== 'undefined') {
    return Buffer.from(base64, 'base64').toString('binary');
  } else {
    // 手动实现Base64解码
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    let binary = '';
    base64 = base64.replace(/[^A-Za-z0-9\+\/]/g, '');
    for (let i = 0; i < base64.length; i += 4) {
      const enc1 = chars.indexOf(base64.charAt(i));
      const enc2 = chars.indexOf(base64.charAt(i + 1));
      const enc3 = chars.indexOf(base64.charAt(i + 2));
      const enc4 = chars.indexOf(base64.charAt(i + 3));
      const bitmap = (enc1 << 18) | (enc2 << 12) | (enc3 << 6) | enc4;
      if (enc3 !== 64) binary += String.fromCharCode((bitmap >> 16) & 255);
      if (enc4 !== 64) binary += String.fromCharCode((bitmap >> 8) & 255);
    }
    return binary;
  }
}

// 音频格式类型
export type AudioFormat = 'wav' | 'mp3' | 'ogg' | 'pcm';
export type AudioEncoding = 'base64' | 'data-url' | 'file-uri' | 'array-buffer';

// 音频元数据
export interface AudioMetadata {
  sampleRate: number;
  channels: number;
  bitDepth: number;
  duration: number; // ms
  format: AudioFormat;
  size: number; // bytes
}

// 音频处理配置
export interface AudioProcessorConfig {
  targetSampleRate?: number;
  targetChannels?: number;
  targetFormat?: AudioFormat;
  enableNormalization?: boolean;
  enableNoiseReduction?: boolean;
  volume?: number;
  speed?: number;
  cacheEnabled?: boolean;
  maxCacheSize?: number; // MB
}

/**
 * 音频处理器类
 * 提供音频数据的格式转换、处理、缓存和管理功能
 */
export class AudioProcessor {
  private static instance: AudioProcessor;
  private config: AudioProcessorConfig;
  private audioCache: Map<string, AudioMetadata & { data: any }> = new Map();
  private cacheSize: number = 0;

  // 默认配置
  private defaultConfig: AudioProcessorConfig = {
    targetSampleRate: 24000, // 24kHz，适合语音
    targetChannels: 1, // 单声道
    targetFormat: 'wav',
    enableNormalization: true,
    enableNoiseReduction: true,
    volume: 1.0,
    speed: 1.0,
    cacheEnabled: true,
    maxCacheSize: 50, // 50MB
  };

  private constructor(config?: Partial<AudioProcessorConfig>) {
    this.config = { ...this.defaultConfig, ...config };
  }

  public static getInstance(config?: Partial<AudioProcessorConfig>): AudioProcessor {
    if (!AudioProcessor.instance) {
      AudioProcessor.instance = new AudioProcessor(config);
    }
    return AudioProcessor.instance;
  }

  /**
   * 更新配置
   */
  public updateConfig(newConfig: Partial<AudioProcessorConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * 获取配置
   */
  public getConfig(): AudioProcessorConfig {
    return { ...this.config };
  }

  /**
   * 处理音频数据
   */
  public async processAudio(
    audioData: string | ArrayBuffer | Uint8Array,
    format: AudioFormat = 'wav',
    encoding: AudioEncoding = 'base64'
  ): Promise<{
    data: string; // 返回Data URL格式
    metadata: AudioMetadata;
  }> {
    try {
      console.log(`🎵 开始处理音频，格式: ${format}, 编码: ${encoding}`);

      // 1. 解码音频数据
      const decodedData = await this.decodeAudioData(audioData, encoding);
      
      // 2. 解析元数据
      const metadata = await this.extractMetadata(decodedData, format);
      
      // 3. 转换格式（如果需要）
      const processedData = await this.convertFormat(
        decodedData, 
        format, 
        this.config.targetFormat!
      );
      
      // 4. 应用处理效果
      const enhancedData = await this.applyEffects(processedData, metadata);
      
      // 5. 重新编码为Data URL
      const dataUrl = await this.encodeToDataURL(enhancedData, this.config.targetFormat!);
      
      // 6. 缓存处理结果
      if (this.config.cacheEnabled) {
        await this.cacheAudio(dataUrl, {
          ...metadata,
          format: this.config.targetFormat!,
          sampleRate: this.config.targetSampleRate!
        });
      }

      console.log(`🎵 音频处理完成: ${metadata.duration}ms, ${metadata.size} bytes`);
      return {
        data: dataUrl,
        metadata: {
          ...metadata,
          format: this.config.targetFormat!,
          sampleRate: this.config.targetSampleRate!
        }
      };

    } catch (error) {
      console.error('音频处理失败:', error);
      throw new Error(`音频处理失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  }

  /**
   * 解码音频数据
   */
  private async decodeAudioData(
    audioData: string | ArrayBuffer | Uint8Array,
    encoding: AudioEncoding
  ): Promise<ArrayBuffer> {
    try {
      if (encoding === 'base64') {
        // Base64解码
        const base64String = audioData as string;
        const binaryString = base64Decode(base64String);
        const bytes = new Uint8Array(binaryString.length);
        
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        
        return bytes.buffer;
      } 
      else if (encoding === 'data-url') {
        // Data URL解码
        const dataUrl = audioData as string;
        const base64Data = dataUrl.split(',')[1];
        return this.decodeAudioData(base64Data, 'base64');
      }
      else if (encoding === 'file-uri') {
        // 从文件读取
        const fileUri = audioData as string;
        const fileInfo = await FileSystem.readAsStringAsync(fileUri, {
          encoding: 'base64' as any
        });
        return this.decodeAudioData(fileInfo, 'base64');
      }
      else {
        // ArrayBuffer或Uint8Array
        if (audioData instanceof ArrayBuffer) {
          return audioData;
        } else if (audioData instanceof Uint8Array) {
          // 创建一个新的ArrayBuffer副本
          const newBuffer = new ArrayBuffer(audioData.byteLength);
          new Uint8Array(newBuffer).set(audioData);
          return newBuffer;
        } else {
          throw new Error(`不支持的编码格式: ${encoding}`);
        }
      }
    } catch (error) {
      throw new Error(`音频解码失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  }

  /**
   * 提取音频元数据
   */
  private async extractMetadata(
    audioData: ArrayBuffer,
    format: AudioFormat
  ): Promise<AudioMetadata> {
    try {
      if (format === 'wav') {
        return this.extractWavMetadata(audioData);
      } else if (format === 'mp3') {
        return this.extractMp3Metadata(audioData);
      } else if (format === 'pcm') {
        return this.extractPcmMetadata(audioData);
      } else {
        // 默认元数据
        return {
          sampleRate: 24000,
          channels: 1,
          bitDepth: 16,
          duration: 1000, // 默认1秒
          format,
          size: audioData.byteLength
        };
      }
    } catch (error) {
      console.warn('无法提取音频元数据，使用默认值:', error);
      return {
        sampleRate: 24000,
        channels: 1,
        bitDepth: 16,
        duration: 1000,
        format,
        size: audioData.byteLength
      };
    }
  }

  /**
   * 提取WAV文件元数据
   */
  private extractWavMetadata(data: ArrayBuffer): AudioMetadata {
    const view = new DataView(data);
    
    // 检查RIFF头
    if (String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3)) !== 'RIFF') {
      throw new Error('无效的WAV文件');
    }
    
    // 检查WAVE格式
    if (String.fromCharCode(view.getUint8(8), view.getUint8(9), view.getUint8(10), view.getUint8(11)) !== 'WAVE') {
      throw new Error('无效的WAV文件');
    }
    
    let sampleRate = 44100;
    let channels = 2;
    let bitDepth = 16;
    let dataSize = 0;
    
    // 查找fmt和data块
    let offset = 12;
    while (offset < view.byteLength) {
      const chunkId = String.fromCharCode(
        view.getUint8(offset), 
        view.getUint8(offset + 1), 
        view.getUint8(offset + 2), 
        view.getUint8(offset + 3)
      );
      
      const chunkSize = view.getUint32(offset + 4, true);
      
      if (chunkId === 'fmt ') {
        // 读取格式信息
        const audioFormat = view.getUint16(offset + 8, true);
        channels = view.getUint16(offset + 10, true);
        sampleRate = view.getUint32(offset + 12, true);
        bitDepth = view.getUint16(offset + 22, true);
      } else if (chunkId === 'data') {
        dataSize = chunkSize;
      }
      
      offset += 8 + chunkSize;
    }
    
    // 计算时长
    const duration = (dataSize * 1000) / (sampleRate * channels * (bitDepth / 8));
    
    return {
      sampleRate,
      channels,
      bitDepth,
      duration,
      format: 'wav',
      size: data.byteLength
    };
  }

  /**
   * 提取MP3元数据（简化实现）
   */
  private extractMp3Metadata(data: ArrayBuffer): AudioMetadata {
    // 简化的MP3元数据提取
    // 实际实现需要完整的MP3解析
    return {
      sampleRate: 44100,
      channels: 2,
      bitDepth: 16,
      duration: 2000, // 估计值
      format: 'mp3',
      size: data.byteLength
    };
  }

  /**
   * 提取PCM元数据
   */
  private extractPcmMetadata(data: ArrayBuffer): AudioMetadata {
    // 假设PCM为16位，单声道，24kHz
    const sampleRate = 24000;
    const channels = 1;
    const bitDepth = 16;
    const bytesPerSample = bitDepth / 8;
    const sampleCount = data.byteLength / (channels * bytesPerSample);
    const duration = (sampleCount / sampleRate) * 1000;
    
    return {
      sampleRate,
      channels,
      bitDepth,
      duration,
      format: 'pcm',
      size: data.byteLength
    };
  }

  /**
   * 转换音频格式
   */
  private async convertFormat(
    audioData: ArrayBuffer,
    fromFormat: AudioFormat,
    toFormat: AudioFormat
  ): Promise<ArrayBuffer> {
    if (fromFormat === toFormat) {
      return audioData;
    }
    
    try {
      if (fromFormat === 'pcm' && toFormat === 'wav') {
        return this.convertPcmToWav(audioData);
      } else if (fromFormat === 'wav' && toFormat === 'pcm') {
        return this.convertWavToPcm(audioData);
      } else {
        console.warn(`不支持从 ${fromFormat} 转换到 ${toFormat}，返回原数据`);
        return audioData;
      }
    } catch (error) {
      console.error('音频格式转换失败:', error);
      throw error;
    }
  }

  /**
   * 将PCM转换为WAV格式
   */
  private convertPcmToWav(pcmData: ArrayBuffer): ArrayBuffer {
    const sampleRate = this.config.targetSampleRate!;
    const channels = this.config.targetChannels!;
    const bitDepth = 16;
    
    const wavHeader = this.createWavHeader(
      pcmData.byteLength,
      sampleRate,
      channels,
      bitDepth
    );
    
    const totalLength = wavHeader.byteLength + pcmData.byteLength;
    const wavData = new Uint8Array(totalLength);
    
    wavData.set(new Uint8Array(wavHeader), 0);
    wavData.set(new Uint8Array(pcmData), wavHeader.byteLength);
    
    return wavData.buffer;
  }

  /**
   * 从WAV提取PCM数据
   */
  private convertWavToPcm(wavData: ArrayBuffer): ArrayBuffer {
    const view = new DataView(wavData);
    
    // 查找data块
    let offset = 12;
    while (offset < view.byteLength) {
      const chunkId = String.fromCharCode(
        view.getUint8(offset), 
        view.getUint8(offset + 1), 
        view.getUint8(offset + 2), 
        view.getUint8(offset + 3)
      );
      
      const chunkSize = view.getUint32(offset + 4, true);
      
      if (chunkId === 'data') {
        const pcmData = new Uint8Array(chunkSize);
        const dataOffset = offset + 8;
        
        for (let i = 0; i < chunkSize; i++) {
          pcmData[i] = view.getUint8(dataOffset + i);
        }
        
        return pcmData.buffer;
      }
      
      offset += 8 + chunkSize;
    }
    
    throw new Error('未找到WAV文件中的data块');
  }

  /**
   * 创建WAV文件头
   */
  private createWavHeader(
    dataLength: number,
    sampleRate: number,
    channels: number,
    bitDepth: number
  ): ArrayBuffer {
    const buffer = new ArrayBuffer(44);
    const view = new DataView(buffer);
    
    // RIFF标识
    this.writeString(view, 0, 'RIFF');
    
    // RIFF chunk size = 文件大小 - 8 (减去 'RIFF' 4字节 + chunkSize 4字节)
    // 文件结构: RIFF header (12) + fmt chunk (24) + data chunk (8 + dataLength) = 44 + dataLength
    // 所以 RIFF chunk size = (44 + dataLength) - 8 = 36 + dataLength
    view.setUint32(4, 36 + dataLength, true);
    
    // WAVE标识
    this.writeString(view, 8, 'WAVE');
    
    // fmt子块
    this.writeString(view, 12, 'fmt ');
    
    // fmt块大小
    view.setUint32(16, 16, true);
    
    // 音频格式 (1 = PCM)
    view.setUint16(20, 1, true);
    
    // 声道数
    view.setUint16(22, channels, true);
    
    // 采样率
    view.setUint32(24, sampleRate, true);
    
    // 字节率
    view.setUint32(28, sampleRate * channels * (bitDepth / 8), true);
    
    // 块对齐
    view.setUint16(32, channels * (bitDepth / 8), true);
    
    // 位深度
    view.setUint16(34, bitDepth, true);
    
    // data子块
    this.writeString(view, 36, 'data');
    
    // 数据大小
    view.setUint32(40, dataLength, true);
    
    return buffer;
  }

  /**
   * 向DataView写入字符串
   */
  private writeString(view: DataView, offset: number, string: string): void {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  }

  /**
   * 应用音频效果
   * 注意：如果输入是 WAV 格式，需要先提取 PCM 数据，处理后再重新生成 WAV
   */
  private async applyEffects(
    audioData: ArrayBuffer,
    metadata: AudioMetadata
  ): Promise<ArrayBuffer> {
    // 如果输入格式是 WAV，需要先提取 PCM 数据
    let pcmData: ArrayBuffer;
    let isWavFormat = false;
    
    if (metadata.format === 'wav') {
      // 提取 PCM 数据（跳过 WAV header）
      pcmData = this.convertWavToPcm(audioData);
      isWavFormat = true;
    } else {
      // 已经是 PCM 数据，直接使用
      pcmData = audioData;
    }
    
    let processedData = pcmData;
    
    // 1. 音量调整
    if (this.config.volume !== undefined && this.config.volume !== 1.0) {
      processedData = await this.adjustVolume(processedData, metadata, this.config.volume);
    }
    
    // 2. 语速调整
    if (this.config.speed !== undefined && this.config.speed !== 1.0) {
      processedData = await this.adjustSpeed(processedData, metadata, this.config.speed);
    }
    
    // 3. 标准化
    if (this.config.enableNormalization) {
      processedData = await this.normalizeAudio(processedData, metadata);
    }
    
    // 4. 降噪
    if (this.config.enableNoiseReduction) {
      processedData = await this.reduceNoise(processedData, metadata);
    }
    
    // 如果输入是 WAV 格式，需要重新生成 WAV（使用处理后的 PCM 数据）
    if (isWavFormat) {
      return this.convertPcmToWav(processedData);
    }
    
    return processedData;
  }

  /**
   * 调整音量
   */
  private async adjustVolume(
    audioData: ArrayBuffer,
    metadata: AudioMetadata,
    volume: number
  ): Promise<ArrayBuffer> {
    if (volume === 1.0) {
      return audioData;
    }
    
    try {
      const view = new DataView(audioData);
      const bytesPerSample = metadata.bitDepth / 8;
      const numSamples = audioData.byteLength / bytesPerSample;
      
      const processed = new ArrayBuffer(audioData.byteLength);
      const processedView = new DataView(processed);
      
      for (let i = 0; i < numSamples; i++) {
        const offset = i * bytesPerSample;
        let sample: number;
        
        if (metadata.bitDepth === 8) {
          sample = view.getUint8(offset) - 128; // 8位有符号
          sample = Math.max(-128, Math.min(127, sample * volume));
          processedView.setUint8(offset, sample + 128);
        } else if (metadata.bitDepth === 16) {
          sample = view.getInt16(offset, true);
          sample = Math.max(-32768, Math.min(32767, sample * volume));
          processedView.setInt16(offset, sample, true);
        } else if (metadata.bitDepth === 32) {
          sample = view.getInt32(offset, true);
          sample = sample * volume;
          processedView.setInt32(offset, sample, true);
        }
      }
      
      console.log(`🎵 音量调整完成: ${volume}x`);
      return processed;
    } catch (error) {
      console.error('音量调整失败:', error);
      return audioData;
    }
  }

  /**
   * 调整语速
   */
  private async adjustSpeed(
    audioData: ArrayBuffer,
    metadata: AudioMetadata,
    speed: number
  ): Promise<ArrayBuffer> {
    if (speed === 1.0) {
      return audioData;
    }
    
    // 简化的语速调整实现
    // 实际实现需要重采样算法
    console.warn('语速调整功能暂未实现');
    return audioData;
  }

  /**
   * 音频标准化
   */
  private async normalizeAudio(
    audioData: ArrayBuffer,
    metadata: AudioMetadata
  ): Promise<ArrayBuffer> {
    // 简化的标准化实现
    // 寻找最大振幅并进行缩放
    try {
      const view = new DataView(audioData);
      const bytesPerSample = metadata.bitDepth / 8;
      const numSamples = audioData.byteLength / bytesPerSample;
      
      let maxAmplitude = 0;
      
      // 寻找最大振幅
      for (let i = 0; i < numSamples; i++) {
        const offset = i * bytesPerSample;
        let sample: number;
        
        if (metadata.bitDepth === 8) {
          sample = Math.abs(view.getUint8(offset) - 128);
        } else if (metadata.bitDepth === 16) {
          sample = Math.abs(view.getInt16(offset, true));
        } else if (metadata.bitDepth === 32) {
          sample = Math.abs(view.getInt32(offset, true));
        } else {
          sample = 0;
        }
        
        if (sample > maxAmplitude) {
          maxAmplitude = sample;
        }
      }
      
      // 如果振幅已经很大，不需要调整
      if (maxAmplitude > 0.9 * Math.pow(2, metadata.bitDepth - 1)) {
        return audioData;
      }
      
      // 计算缩放因子
      const scaleFactor = (0.9 * Math.pow(2, metadata.bitDepth - 1)) / maxAmplitude;
      
      // 应用标准化
      return this.adjustVolume(audioData, metadata, scaleFactor);
    } catch (error) {
      console.error('音频标准化失败:', error);
      return audioData;
    }
  }

  /**
   * 降噪处理
   */
  private async reduceNoise(
    audioData: ArrayBuffer,
    metadata: AudioMetadata
  ): Promise<ArrayBuffer> {
    // 简化的降噪实现
    // 实际实现需要复杂的信号处理算法
    console.warn('降噪功能暂未实现');
    return audioData;
  }

  /**
   * 编码为Data URL
   */
  private async encodeToDataURL(
    audioData: ArrayBuffer,
    format: AudioFormat
  ): Promise<string> {
    const bytes = new Uint8Array(audioData);
    let binary = '';
    
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    
    const base64 = base64Encode(binary);
    const mimeType = this.getMimeType(format);
    
    return `data:${mimeType};base64,${base64}`;
  }

  /**
   * 获取MIME类型
   */
  private getMimeType(format: AudioFormat): string {
    const mimeTypes: Record<AudioFormat, string> = {
      'wav': 'audio/wav',
      'mp3': 'audio/mpeg',
      'ogg': 'audio/ogg',
      'pcm': 'audio/pcm'
    };
    
    return mimeTypes[format] || 'audio/wav';
  }

  /**
   * 缓存音频
   */
  private async cacheAudio(
    audioData: string,
    metadata: AudioMetadata
  ): Promise<void> {
    if (!this.config.cacheEnabled) {
      return;
    }
    
    const cacheKey = this.generateCacheKey(metadata);
    const cacheSize = audioData.length * 0.75; // 估算Base64大小
    
    // 检查缓存大小限制
    if (this.cacheSize + cacheSize > this.config.maxCacheSize! * 1024 * 1024) {
      this.clearOldestCache();
    }
    
    this.audioCache.set(cacheKey, {
      ...metadata,
      data: audioData
    });
    
    this.cacheSize += cacheSize;
    
    console.log(`🎵 音频已缓存，键: ${cacheKey}, 当前缓存大小: ${Math.round(this.cacheSize / 1024)}KB`);
  }

  /**
   * 生成缓存键
   */
  private generateCacheKey(metadata: AudioMetadata): string {
    return `${metadata.sampleRate}_${metadata.channels}_${metadata.bitDepth}_${metadata.duration}_${Date.now()}`;
  }

  /**
   * 清除最旧的缓存
   */
  private clearOldestCache(): void {
    if (this.audioCache.size === 0) {
      return;
    }
    
    const oldestKey = this.audioCache.keys().next().value;
    if (oldestKey) {
      const cachedItem = this.audioCache.get(oldestKey);
      
      if (cachedItem) {
        this.audioCache.delete(oldestKey);
        this.cacheSize -= cachedItem.data.length * 0.75;
        
        console.log(`🎵 清除最旧缓存: ${oldestKey}`);
      }
    }
  }

  /**
   * 从缓存获取音频
   */
  public getCachedAudio(cacheKey: string): string | null {
    const cached = this.audioCache.get(cacheKey);
    return cached ? cached.data : null;
  }

  /**
   * 获取缓存统计
   */
  public getCacheStats(): {
    count: number;
    size: number;
    maxSize: number;
  } {
    return {
      count: this.audioCache.size,
      size: this.cacheSize,
      maxSize: this.config.maxCacheSize! * 1024 * 1024
    };
  }

  /**
   * 清除缓存
   */
  public clearCache(): void {
    this.audioCache.clear();
    this.cacheSize = 0;
    console.log('🎵 音频缓存已清空');
  }

  /**
   * 音频拼接
   */
  public async concatenateAudio(
    audioChunks: Array<{ data: string; metadata?: AudioMetadata }>,
    format: AudioFormat = 'wav'
  ): Promise<{ data: string; metadata: AudioMetadata }> {
    try {
      console.log(`🎵 开始拼接${audioChunks.length}个音频片段`);
      
      if (audioChunks.length === 0) {
        throw new Error('没有音频数据可拼接');
      }
      
      if (audioChunks.length === 1) {
        return {
          data: audioChunks[0].data,
          metadata: audioChunks[0].metadata || {
            sampleRate: 24000,
            channels: 1,
            bitDepth: 16,
            duration: 1000,
            format,
            size: audioChunks[0].data.length
          }
        };
      }
      
      // 解码所有音频片段
      const decodedChunks: ArrayBuffer[] = [];
      let totalSize = 0;
      
      for (const chunk of audioChunks) {
        const decoded = await this.decodeAudioData(chunk.data, 'data-url');
        decodedChunks.push(decoded);
        totalSize += decoded.byteLength;
      }
      
      // 合并所有数据
      const combinedData = new Uint8Array(totalSize);
      let offset = 0;
      
      for (const chunk of decodedChunks) {
        combinedData.set(new Uint8Array(chunk), offset);
        offset += chunk.byteLength;
      }
      
      // 转换为WAV格式
      const wavData = await this.convertPcmToWav(combinedData.buffer);
      const dataUrl = await this.encodeToDataURL(wavData, 'wav');
      
      // 估算元数据
      const metadata = await this.extractWavMetadata(wavData);
      
      console.log(`🎵 音频拼接完成，总时长: ${metadata.duration}ms`);
      
      return {
        data: dataUrl,
        metadata
      };
      
    } catch (error) {
      console.error('音频拼接失败:', error);
      throw new Error(`音频拼接失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  }

  /**
   * 音频剪切
   */
  public async trimAudio(
    audioData: string,
    startTime: number, // ms
    endTime: number, // ms
    format: AudioFormat = 'wav'
  ): Promise<{ data: string; metadata: AudioMetadata }> {
    try {
      console.log(`🎵 剪切音频: ${startTime}ms - ${endTime}ms`);
      
      if (startTime < 0 || endTime <= startTime) {
        throw new Error('无效的时间范围');
      }
      
      // 解码音频
      const decodedData = await this.decodeAudioData(audioData, 'data-url');
      const metadata = await this.extractMetadata(decodedData, format);
      
      // 计算样本位置
      const startSample = Math.floor((startTime / 1000) * metadata.sampleRate);
      const endSample = Math.floor((endTime / 1000) * metadata.sampleRate);
      const bytesPerSample = metadata.bitDepth / 8;
      
      if (endSample * bytesPerSample > decodedData.byteLength) {
        throw new Error('剪切范围超出音频长度');
      }
      
      // 提取片段
      const startByte = startSample * bytesPerSample;
      const endByte = endSample * bytesPerSample;
      const trimmedData = new Uint8Array(decodedData, startByte, endByte - startByte);
      
      // 转换为WAV格式
      const wavData = await this.convertPcmToWav(trimmedData.buffer);
      const dataUrl = await this.encodeToDataURL(wavData, 'wav');
      
      const trimmedMetadata = await this.extractWavMetadata(wavData);
      
      console.log(`🎵 音频剪切完成，新时长: ${trimmedMetadata.duration}ms`);
      
      return {
        data: dataUrl,
        metadata: trimmedMetadata
      };
      
    } catch (error) {
      console.error('音频剪切失败:', error);
      throw new Error(`音频剪切失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  }

  /**
   * 音频淡入淡出
   */
  public async fadeAudio(
    audioData: string,
    fadeInDuration: number, // ms
    fadeOutDuration: number, // ms
    format: AudioFormat = 'wav'
  ): Promise<{ data: string; metadata: AudioMetadata }> {
    // 简化的淡入淡出实现
    console.warn('音频淡入淡出功能暂未实现');
    return {
      data: audioData,
      metadata: await this.extractMetadata(
        await this.decodeAudioData(audioData, 'data-url'),
        format
      )
    };
  }
}

// 导出单例
export const audioProcessor = AudioProcessor.getInstance();
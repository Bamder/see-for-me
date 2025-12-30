/**
 * SeeForMe 相机模块
 * 基于Expo Camera API实现图像采集、压缩和状态管理
 * 位置：mobile/src/modules/CameraModule/CameraModule.ts
 */

import React from 'react';
import { Camera, CameraType, CameraCapturedPicture } from 'expo-camera';
import * as ImageManipulator from 'expo-image-manipulator';
import { Platform, PermissionsAndroid } from 'react-native';
import { eventBus } from '../../core/eventBus/EventBus';
import { StateManagerModule } from '../StateManagerModule';

// 相机配置接口
export interface CameraConfig {
  type: CameraType;
  quality: 'low' | 'medium' | 'high' | number;
  autoFocus: 'on' | 'off' | 'auto';
  flashMode: 'off' | 'on' | 'auto' | 'torch';
  zoom: number; // 0 to 1
  whiteBalance: 'auto' | 'sunny' | 'cloudy' | 'shadow' | 'fluorescent' | 'incandescent';
}

// 图像数据接口
export interface ImageData {
  uri: string;
  base64?: string;
  width: number;
  height: number;
  size: number;
  compressionRatio: number;
  timestamp: number;
}

// 压缩选项接口
export interface CompressionOptions {
  quality: number; // 0 to 1
  maxWidth?: number;
  maxHeight?: number;
  base64: boolean;
  format: 'jpeg' | 'png';
}

/**
 * 相机模块类 - 负责图像采集和预处理
 */
export class CameraModule {
  private cameraRef: React.RefObject<any> | null = null;
  private stateManager: StateManagerModule | null = null;
  private config: CameraConfig;
  private isActive: boolean = false;
  private currentSessionId: string = '';
  private skipPermissionCheck: boolean = false; // 如果权限已在组件层面处理，跳过检查
  
  // 默认配置
  private defaultConfig: CameraConfig = {
    type: 'back',
    quality: 'high',
    autoFocus: 'auto',
    flashMode: 'off',
    zoom: 0,
    whiteBalance: 'auto'
  };

  constructor(config?: Partial<CameraConfig>) {
    this.config = { ...this.defaultConfig, ...config };
    this.initializeEventSubscriptions();
  }

  /**
   * 设置状态管理器
   */
  public setStateManager(manager: StateManagerModule): void {
    this.stateManager = manager;
  }

  /**
   * 设置是否跳过权限检查（如果权限已在组件层面处理）
   */
  public setSkipPermissionCheck(skip: boolean): void {
    this.skipPermissionCheck = skip;
  }

  /**
   * 设置相机引用
   */
  public setCameraRef(ref: React.RefObject<any>): void {
    this.cameraRef = ref;
  }

  /**
   * 初始化事件订阅
   */
  private initializeEventSubscriptions(): void {
    // 订阅手势触发事件
    eventBus.subscribe('gesture:double_tap', (data) => {
      this.handleGestureTrigger(data);
    });

    eventBus.subscribe('gesture:volume_power_combo', () => {
      this.handleGestureTrigger({ x: 0, y: 0 });
    });

    // 订阅状态变化事件
    eventBus.subscribe('state:trigger_state_change', (data) => {
      this.handleTriggerStateChange(data);
    });

    // 订阅处理完成事件，重新激活相机
    eventBus.subscribe('state:processing_complete', (data) => {
      if (data.sessionId === this.currentSessionId) {
        this.resumeCamera();
      }
    });

    console.log('📷 相机模块事件订阅初始化完成');
  }

  /**
   * 启动相机预览
   */
  public async startPreview(): Promise<boolean> {
    try {
      // 如果权限已在组件层面处理，跳过检查
      if (!this.skipPermissionCheck) {
        const hasPermission = await this.checkPermissions();
        if (!hasPermission) {
          console.error('❌ 相机权限未授予，无法启动预览');
          eventBus.emit('camera:preview_start_failed', {
            reason: 'PERMISSION_DENIED',
            message: '相机权限未授予，请在手机设置中授予相机权限'
          });
          return false;
        }
      } else {
        console.log('📷 跳过权限检查（权限已在组件层面处理）');
      }

      this.isActive = true;
      
      // 发布相机启动事件
      this.currentSessionId = `sess_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      eventBus.emit('camera:preview_started', {
        sessionId: this.currentSessionId
      });

      console.log('📷 相机预览已启动');
      return true;
    } catch (error) {
      console.error('启动相机预览失败:', error);
      const sessionId = this.currentSessionId || `sess_${Date.now()}`;
      eventBus.emit('camera:error', {
        error: '启动相机预览失败',
        sessionId,
        errorCode: 'PREVIEW_START_FAILED'
      });
      return false;
    }
  }

  /**
   * 停止相机预览
   */
  public async stopPreview(): Promise<void> {
    this.isActive = false;
    
    eventBus.emit('camera:preview_stopped', {
      sessionId: this.currentSessionId || `sess_${Date.now()}`
    });

    console.log('📷 相机预览已停止');
  }

  /**
   * 处理手势触发
   */
  private async handleGestureTrigger(data: { x: number; y: number }): Promise<void> {
    if (!this.isActive || !this.stateManager?.isTriggerEnabled()) {
      console.log('📷 相机未激活或触发被禁用，忽略手势');
      return;
    }

    try {
      // 生成会话ID
      this.currentSessionId = `sess_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // 发布捕获开始事件
      eventBus.emit('camera:capture_start', {
        sessionId: this.currentSessionId,
        timestamp: Date.now(),
        gestureCoordinates: data
      });

      // 设置处理状态
      this.stateManager.setProcessingState(true);
      
      // 捕获图像
      const imageData = await this.captureImage();
      
      // 压缩图像
      const compressedImage = await this.compressImage(imageData, {
        quality: 0.7,
        maxWidth: 1920,
        maxHeight: 1080,
        base64: true,
        format: 'jpeg'
      });

      // 发布捕获完成事件
      eventBus.emit('camera:capture_complete', {
        imageData: compressedImage.base64 || compressedImage.uri,
        sessionId: this.currentSessionId
      });

      console.log('📷 图像捕获完成，已发布事件');

    } catch (error) {
      console.error('图像捕获失败:', error);
      
      eventBus.emit('camera:capture_error', {
        error: error instanceof Error ? error.message : '未知错误',
        sessionId: this.currentSessionId
      });

      // 恢复触发状态
      this.stateManager?.setTriggerEnabled(true);
      this.stateManager?.setProcessingState(false);
    }
  }

  /**
   * 捕获图像
   * 注意：expo-camera v17 使用 CameraView，API 可能不同
   */
  private async captureImage(): Promise<CameraCapturedPicture> {
    if (!this.cameraRef?.current) {
      throw new Error('相机引用未设置');
    }

    // 注意：当前 this.cameraRef 可能是多层嵌套的 ref 包装，逐层解包直到拿到真正实例
    let camera: any = this.cameraRef.current;
    let unwrapDepth = 0;
    while (
      camera &&
      typeof camera === 'object' &&
      'current' in camera &&
      unwrapDepth < 5
    ) {
      camera = camera.current;
      unwrapDepth += 1;
    }

    try {
      // 兼容不同版本 expo-camera / CameraView 的拍照方法
      const captureFn =
        camera && typeof camera.takePictureAsync === 'function'
          ? camera.takePictureAsync.bind(camera)
          : camera && typeof camera.takePhoto === 'function'
          ? camera.takePhoto.bind(camera)
          : camera && typeof camera.takePicture === 'function'
          ? camera.takePicture.bind(camera)
          : null;

      if (!captureFn) {
        throw new Error('相机组件未暴露可用的拍照方法 (takePictureAsync / takePhoto / takePicture)');
      }

      const photo = await captureFn({
        quality: 1, // 最高质量，后续再压缩
        base64: false, // 先不生成base64，减少内存占用
        skipProcessing: false, // 允许图像处理（旋转、缩放等）
        exif: true // 包含EXIF数据
      });

      console.log('📷 图像捕获成功:', photo?.uri);
      return photo;
    } catch (error) {
      throw new Error(`图像捕获失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  }

  /**
   * 捕获当前帧（公共方法）
   */
  public async captureFrame(): Promise<ImageData> {
    const captured = await this.captureImage();
    return await this.compressImage(captured, {
      quality: 0.7,
      maxWidth: 1920,
      maxHeight: 1080,
      base64: true,
      format: 'jpeg'
    });
  }

  /**
   * 压缩图像（公共方法）
   */
  public async compressImagePublic(
    imageData: ImageData,
    quality: number
  ): Promise<{ data: string; format: 'jpeg' | 'png'; width: number; height: number; size: number }> {
    return {
      data: imageData.base64 || imageData.uri,
      format: 'jpeg',
      width: imageData.width,
      height: imageData.height,
      size: imageData.size
    };
  }

  /**
   * 压缩图像（内部方法）
   */
  private async compressImage(
    image: CameraCapturedPicture, 
    options: CompressionOptions
  ): Promise<ImageData> {
    try {
      const manipResult = await ImageManipulator.manipulateAsync(
        image.uri,
        [
          ...(options.maxWidth || options.maxHeight ? [{
            resize: {
              width: options.maxWidth,
              height: options.maxHeight
            }
          }] : [])
        ],
        {
          compress: options.quality,
          format: ImageManipulator.SaveFormat[options.format.toUpperCase() as keyof typeof ImageManipulator.SaveFormat],
          base64: options.base64
        }
      );

      const compressedImage: ImageData = {
        uri: manipResult.uri,
        base64: manipResult.base64 || undefined,
        width: manipResult.width,
        height: manipResult.height,
        size: await this.getImageSize(manipResult.uri),
        compressionRatio: options.quality,
        timestamp: Date.now()
      };

      console.log(`📷 图像压缩完成: ${compressedImage.size} bytes, 压缩比: ${options.quality}`);
      return compressedImage;
    } catch (error) {
      throw new Error(`图像压缩失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  }

  /**
   * 获取图像大小
   */
  private async getImageSize(uri: string): Promise<number> {
    try {
      const response = await fetch(uri);
      const blob = await response.blob();
      return blob.size;
    } catch (error) {
      console.warn('无法获取图像大小，使用默认值:', error);
      return 0;
    }
  }

  /**
   * 检查相机权限
   * 注意：expo-camera v17 移除了权限 API，需要使用 React Native 原生权限 API
   */
  private async checkPermissions(): Promise<boolean> {
    try {
      if (Platform.OS === 'android') {
        // Android 使用 PermissionsAndroid
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.CAMERA,
          {
            title: '需要相机权限',
            message: '应用需要访问相机才能拍摄照片',
            buttonNeutral: '稍后询问',
            buttonNegative: '拒绝',
            buttonPositive: '允许',
          }
        );
        
        console.log('📷 Android 相机权限状态:', granted);
        
        if (granted === PermissionsAndroid.RESULTS.GRANTED) {
          console.log('✅ 相机权限已授予');
          return true;
        } else {
          const canAskAgain = granted !== PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN;
          console.warn('⚠️ 相机权限被拒绝:', granted);
          eventBus.emit('camera:permission_denied', {
            status: granted,
            canAskAgain,
            message: canAskAgain
              ? '相机权限被拒绝，请允许应用访问相机'
              : '相机权限被永久拒绝，请前往设置手动授予权限'
          });
          return false;
        }
      } else {
        // iOS - expo-camera 会自动处理权限请求
        // 这里我们假设权限会在 Camera 组件挂载时自动请求
        // 如果需要在类方法中检查，可能需要使用其他方式
        console.log('📷 iOS 权限检查 - 权限会在 Camera 组件挂载时自动请求');
        // iOS 上，Camera 组件会自动请求权限，这里先返回 true
        // 实际的权限检查应该在组件层面使用 useCameraPermissions hook
        return true;
      }
    } catch (error) {
      console.error('❌ 检查相机权限失败:', error);
      const sessionId = this.currentSessionId || `sess_${Date.now()}`;
      eventBus.emit('camera:error', {
        error: '检查相机权限失败',
        sessionId,
        errorCode: 'PERMISSION_CHECK_FAILED',
        details: error instanceof Error ? error.message : '未知错误'
      });
      return false;
    }
  }

  /**
   * 处理触发状态变化
   */
  private handleTriggerStateChange(data: { enabled: boolean }): void {
    if (data.enabled) {
      this.resumeCamera();
    } else {
      this.pauseCamera();
    }
  }

  /**
   * 暂停相机（保持预览但禁用功能）
   */
  private pauseCamera(): void {
    this.isActive = false;
    console.log('📷 相机功能已暂停');
  }

  /**
   * 恢复相机功能
   */
  private resumeCamera(): void {
    this.isActive = true;
    console.log('📷 相机功能已恢复');
  }

  /**
   * 切换摄像头（前后置）
   */
  public async toggleCamera(): Promise<void> {
    this.config.type = this.config.type === 'back' ? 'front' : 'back';
    
    eventBus.emit('camera:switched', {
      type: this.config.type,
      sessionId: this.currentSessionId || `sess_${Date.now()}`
    });

    console.log(`📷 摄像头已切换到: ${this.config.type}`);
  }

  /**
   * 调整相机缩放
   */
  public setZoom(zoom: number): void {
    this.config.zoom = Math.max(0, Math.min(1, zoom));
    console.log(`📷 缩放设置为: ${this.config.zoom}`);
  }

  /**
   * 切换闪光灯模式
   */
  public setFlashMode(mode: 'off' | 'on' | 'auto' | 'torch'): void {
    this.config.flashMode = mode;
    console.log(`📷 闪光灯模式设置为: ${mode}`);
  }

  /**
   * 调整对焦模式
   */
  public setAutoFocus(mode: 'on' | 'off' | 'auto'): void {
    this.config.autoFocus = mode;
    console.log(`📷 对焦模式设置为: ${mode}`);
  }

  /**
   * 获取当前相机状态
   */
  public getCameraStatus(): {
    isActive: boolean;
    cameraType: CameraType;
    flashMode: string;
    zoom: number;
    currentSessionId?: string;
  } {
    return {
      isActive: this.isActive,
      cameraType: this.config.type,
      flashMode: this.config.flashMode,
      zoom: this.config.zoom,
      currentSessionId: this.currentSessionId
    };
  }

  /**
   * 获取相机配置
   */
  public getConfig(): CameraConfig {
    return { ...this.config };
  }

  /**
   * 更新相机配置
   */
  public updateConfig(newConfig: Partial<CameraConfig>): void {
    this.config = { ...this.config, ...newConfig };
    console.log('📷 相机配置已更新');
  }

  /**
   * 清理资源
   */
  public destroy(): void {
    this.isActive = false;
    this.cameraRef = null;
    this.stateManager = null;
    this.currentSessionId = '';
    
    console.log('📷 相机模块资源已清理');
  }
}
/**
 * 相机模块类型定义
 * 位置：mobile/src/modules/CameraModule/types.ts
 */

import { CameraType, CameraCapturedPicture } from 'expo-camera';
import { BaseEvent } from '../../core/eventBus/types';

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

// 相机事件数据接口
export interface CameraEvent extends BaseEvent {
  cameraType: CameraType;
}

export interface CameraCaptureEvent extends CameraEvent {
  imageData: ImageData;
  gestureCoordinates?: { x: number; y: number };
}

export interface CameraErrorEvent extends CameraEvent {
  error: string;
  errorCode: string;
}

// 相机操作结果接口
export interface CameraOperationResult {
  success: boolean;
  error?: string;
  data?: any;
}
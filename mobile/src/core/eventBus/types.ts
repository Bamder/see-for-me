/**
 * 事件总线类型定义
 * 位置：mobile/src/core/eventBus/types.ts
 */

// 基础事件接口
export interface BaseEvent {
    timestamp: number;
    sessionId?: string;
  }
  
  // 相机事件数据接口
  export interface CameraCaptureEvent extends BaseEvent {
    imageData: string;
    quality: number;
    dimensions: { width: number; height: number };
  }
  
  export interface CameraErrorEvent extends BaseEvent {
    error: string;
    errorCode: string;
  }
  
  // 手势事件数据接口
  export interface GestureEvent extends BaseEvent {
    gestureType: 'double_tap' | 'volume_power_combo' | 'custom';
    coordinates?: { x: number; y: number };
  }
  
  // 通信事件数据接口
  export interface WebSocketEvent extends BaseEvent {
    status: 'connected' | 'disconnected' | 'error';
    message?: string;
  }
  
  export interface MessageEvent extends BaseEvent {
    type: 'text_stream' | 'final_result' | 'error';
    content: string;
    isComplete: boolean;
  }
  
  // TTS事件数据接口
  export interface TTSEvent extends BaseEvent {
    text: string;
    status: 'start' | 'complete' | 'error';
    error?: string;
  }
  
  // 状态事件数据接口
  export interface StateEvent extends BaseEvent {
    module: 'camera' | 'gesture' | 'communication' | 'tts';
    state: 'processing' | 'idle' | 'error';
    previousState: string;
  }
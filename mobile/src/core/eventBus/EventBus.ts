/**
 * SeeForMe 事件总线系统
 * 负责模块间松耦合通信，基于发布-订阅模式
 * 位置：mobile/src/core/eventBus/EventBus.ts
 */

// 事件回调函数类型定义
type EventCallback<T = any> = (data: T, eventName: string) => void;

// 事件项接口
interface EventItem {
  id: string;
  callback: EventCallback;
  eventName: string;
  isOnce: boolean;
  priority: number;
}

// 事件映射类型
interface EventMapping {
  // 相机模块事件
  'camera:capture_start': { sessionId: string; timestamp?: number; gestureCoordinates?: { x: number; y: number } };
  'camera:capture_complete': { imageData: string; sessionId: string };
  'camera:capture_error': { error: string; sessionId: string };
  'camera:preview_started': { sessionId: string };
  'camera:preview_stopped': { sessionId: string };
  'camera:preview_start_failed': { reason: string; message: string };
  'camera:error': { error: string; sessionId: string; errorCode?: string; details?: string };
  'camera:switched': { type: 'front' | 'back'; sessionId: string };
  'camera:permission_denied': { status: string; canAskAgain: boolean; message: string };
  
  // 手势模块事件
  'gesture:double_tap': { x: number; y: number };
  'gesture:volume_power_combo': void;
  'gesture:trigger_disabled': void;
  'gesture:trigger_enabled': void;
  'gesture:recognition_started': { timestamp: number; enabledGestures: string[] };
  'gesture:recognition_stopped': { timestamp: number };
  'gesture:error': { error: string; errorCode: string };
  'gesture:recognized': { 
    type: 'double_tap' | 'volume_power_combo' | 'custom';
    confidence: number;
    timestamp: number;
    coordinates?: { x: number; y: number };
    metadata?: Record<string, any>;
  };
  'gesture:config_updated': { config: any; timestamp: number };
  
  // 配置更新事件
  'config:gesture_updated': Partial<{
    doubleTap: { enabled: boolean; maxInterval: number; maxDistance: number };
    volumePowerCombo: { enabled: boolean; maxInterval: number };
    sensitivity: { tapThreshold: number; motionThreshold: number };
  }>;
  
  // 通信模块事件
  'communication:websocket_connected': { clientId?: string; timestamp: number };
  'communication:websocket_disconnected': { reason: string; code?: number };
  'communication:websocket_error': { error: string; errorCode: string };
  'communication:message_received': { 
    type: 'text_stream' | 'final_result' | 'error';
    content: string;
    sessionId: string;
  };
  'communication:message_error': { error: string; rawData?: string; messageType?: string };
  'communication:module_started': { timestamp: number; config: any };
  'communication:module_stopped': { timestamp: number };
  'communication:error': { error: string; errorCode: string };
  'communication:image_sent': { sessionId: string; timestamp: number };
  'communication:image_send_error': { error: string; sessionId: string };
  'communication:server_error': { error: string; errorCode: string; sessionId: string };
  'communication:status_changed': { status: string; timestamp: number };
  'communication:config_updated': { config: any; timestamp: number };
  'communication:processing': { message: string; sessionId: string };
  
  // 配置更新事件（支持在线切换服务器地址和 Mock 模式）
  'config:communication_updated': Partial<{
    server: { websocketUrl: string; httpUrl: string; basePath: string };
    websocket: { reconnect: boolean; maxReconnectAttempts: number; reconnectInterval: number; timeout: number; heartbeatInterval: number };
    http: { timeout: number; maxRetries: number; retryDelay: number };
    security: { enableEncryption: boolean; encryptionKey?: string };
    compression: { enable: boolean; algorithm: 'gzip' | 'deflate' | 'none'; threshold: number };
    runtime: { useMockServer?: boolean };
  }>;
  
  // TTS模块事件
  'tts:speech_start': { text: string; sessionId: string };
  'tts:speech_complete': { sessionId: string };
  'tts:speech_error': { error: string; sessionId: string; errorCode?: string; details?: string };
  'tts:module_started': { timestamp: number; config: any; model?: string };
  'tts:module_stopped': { timestamp: number };
  'tts:status_changed': { status: string; timestamp: number; sessionId: string; error?: string };
  'tts:fallback_triggered': { timestamp: number; reason: string };
  'tts:config_updated': { config: any; timestamp: number };
  'tts:model_switched': { modelType: string; timestamp: number };
  'tts:init_error': { error: string; timestamp: number };
  'tts:text_received': { sessionId: string; text: string; isFinal: boolean; timestamp: number };
  'tts:playback_complete': { sessionId: string; timestamp: number };
  'tts:audio_complete': { sessionId: string; duration: number; timestamp: number };
  'tts:audio_start': { sessionId: string; duration: number; timestamp: number };
  'tts:synthesis_error': { sessionId: string; error: string; text: string; timestamp: number };
  'tts:offline_ready': { timestamp: number; model: string };
  'tts:offline_error': { error: string; details: string };
  'tts:synthesis_start': { sessionId: string; textLength: number; timestamp: number };
  'tts:synthesis_complete': { sessionId: string; duration: number; synthesisTime: number; timestamp: number };
  'tts:control': { action: 'play' | 'pause' | 'stop' | 'skip' | 'volume' | 'rate'; value?: any };
  'app:background': void;
  'app:foreground': void;
  
  // TTS配置更新事件
  'config:tts_updated': Partial<{
    enabled: boolean;
    autoPlay: boolean;
    defaultModel: string;
    modelConfig: any;
    playback: {
      volume: number;
      rate: number;
      shouldDuckAudio: boolean;
      staysActiveInBackground: boolean;
    };
  }>;
  
  // 状态管理事件
  'state:processing_start': { sessionId: string };
  'state:processing_complete': { sessionId: string };
  'state:trigger_state_change': { enabled: boolean };
  'state:trigger_changed': { enabled: boolean };
  'state:connection_changed': { status: 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'error' | 'offline' };
  'state:changed': { action: string; timestamp: number; stateSnapshot: any };
  'state:error': { error: string; action?: any; errorCode: string };
}

// 事件名称类型
type EventName = keyof EventMapping;

/**
 * 事件总线类 - 核心通信枢纽
 */
export class EventBus {
  private static instance: EventBus;
  private events: Map<string, EventItem[]> = new Map();
  private enabled: boolean = true;
  
  // 私有构造函数，实现单例模式
  private constructor() {}
  
  /**
   * 获取事件总线单例实例
   */
  public static getInstance(): EventBus {
    if (!EventBus.instance) {
      EventBus.instance = new EventBus();
    }
    return EventBus.instance;
  }
  
  /**
   * 订阅事件
   * @param eventName 事件名称
   * @param callback 回调函数
   * @param priority 优先级（数字越大优先级越高，默认0）
   * @returns 订阅ID，用于取消订阅
   */
  public subscribe<T extends EventName>(
    eventName: T, 
    callback: EventCallback<EventMapping[T]>,
    priority: number = 0
  ): string {
    if (!this.enabled) {
      console.warn(`EventBus is disabled, cannot subscribe to: ${eventName}`);
      return '';
    }
    
    const subscriptionId = this.generateId();
    const eventItem: EventItem = {
      id: subscriptionId,
      callback: callback as EventCallback,
      eventName,
      isOnce: false,
      priority
    };
    
    if (!this.events.has(eventName)) {
      this.events.set(eventName, []);
    }
    
    this.events.get(eventName)!.push(eventItem);
    // 按优先级排序
    this.events.get(eventName)!.sort((a, b) => b.priority - a.priority);
    
    console.log(`📫 订阅事件: ${eventName}, ID: ${subscriptionId}`);
    return subscriptionId;
  }
  
  /**
   * 一次性订阅（触发后自动取消）
   */
  public once<T extends EventName>(
    eventName: T, 
    callback: EventCallback<EventMapping[T]>,
    priority: number = 0
  ): string {
    const subscriptionId = this.generateId();
    const eventItem: EventItem = {
      id: subscriptionId,
      callback: (data: EventMapping[T], eventName: string) => {
        callback(data, eventName as T);
        this.unsubscribe(eventName as T, subscriptionId);
      },
      eventName,
      isOnce: true,
      priority
    };
    
    if (!this.events.has(eventName)) {
      this.events.set(eventName, []);
    }
    
    this.events.get(eventName)!.push(eventItem);
    this.events.get(eventName)!.sort((a, b) => b.priority - a.priority);
    
    console.log(`🎯 一次性订阅: ${eventName}, ID: ${subscriptionId}`);
    return subscriptionId;
  }
  
  /**
   * 发布事件
   */
  public emit<T extends EventName>(
    eventName: T, 
    data: EventMapping[T]
  ): void {
    if (!this.enabled) {
      console.warn(`EventBus is disabled, cannot emit: ${eventName}`);
      return;
    }
    
    const eventItems = this.events.get(eventName);
    if (!eventItems || eventItems.length === 0) {
      // 调试阶段可以开启，无订阅者日志现在先静默掉，避免刷屏
      // console.log(`📭 无订阅者的事件: ${eventName}`);
      return;
    }
    
    if (eventName === 'config:communication_updated') {
      console.log('——— 📤 发布通信配置更新 ———\n', data);
    } else if (eventName === 'camera:capture_complete') {
      // 避免在日志中输出整段 base64 图像数据，只打印关键信息
      const payload: any = data as any;
      console.log(`📤 发布事件: ${eventName}`, {
        sessionId: payload.sessionId,
        imageDataLength: payload.imageData ? String(payload.imageData).length : 0
      });
    } else {
      console.log(`📤 发布事件: ${eventName}`, data);
    }
    
    // 复制数组避免在遍历时修改原数组
    const itemsToProcess = [...eventItems];
    
    for (const item of itemsToProcess) {
      try {
        item.callback(data, eventName);
        
        // 一次性事件执行后移除
        if (item.isOnce) {
          this.unsubscribe(eventName, item.id);
        }
      } catch (error) {
        console.error(`事件处理错误: ${eventName}, 订阅ID: ${item.id}`, error);
      }
    }
  }
  
  /**
   * 取消订阅
   */
  public unsubscribe(eventName: EventName, subscriptionId: string): boolean {
    const eventItems = this.events.get(eventName);
    if (!eventItems) return false;
    
    const initialLength = eventItems.length;
    this.events.set(
      eventName, 
      eventItems.filter(item => item.id !== subscriptionId)
    );
    
    const success = initialLength > this.events.get(eventName)!.length;
    if (success) {
      console.log(`🗑️ 取消订阅: ${eventName}, ID: ${subscriptionId}`);
    }
    
    return success;
  }
  
  /**
   * 取消特定事件的所有订阅
   */
  public unsubscribeAll(eventName: EventName): void {
    this.events.delete(eventName);
    console.log(`🧹 取消所有订阅: ${eventName}`);
  }
  
  /**
   * 启用/禁用事件总线
   */
  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    console.log(`🔧 事件总线${enabled ? '启用' : '禁用'}`);
  }
  
  /**
   * 获取事件订阅统计
   */
  public getStats(): { [eventName: string]: number } {
    const stats: { [key: string]: number } = {};
    this.events.forEach((items, eventName) => {
      stats[eventName] = items.length;
    });
    return stats;
  }
  
  /**
   * 清空所有事件订阅
   */
  public clear(): void {
    this.events.clear();
    console.log('💥 清空所有事件订阅');
  }
  
  /**
   * 生成唯一ID
   */
  private generateId(): string {
    return `sub_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// 导出单例实例
export const eventBus = EventBus.getInstance();
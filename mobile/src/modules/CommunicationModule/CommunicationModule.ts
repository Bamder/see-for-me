/**
 * SeeForMe 通信模块
 * 基于 Expo WebSocket API 与 Fetch API 实现 HTTP/WebSocket 统一通信
 * 位置：mobile/src/modules/CommunicationModule/CommunicationModule.ts
 */

import { eventBus } from '../../core/eventBus/EventBus';
import { StateManagerModule } from '../StateManagerModule';
import {
  API_BASE_PATH,
  SERVER_HTTP_URL,
  SERVER_WS_URL
} from '../../utils/constants';
import { MockServer } from '../../services/api/MockServer';
import { getServerConfigState } from '../../stores/useServerConfigStore';

// WebSocket 消息格式接口
export interface WebSocketMessage {
  eventType: string;
  data: any;
  timestamp: number;
  sessionId?: string;
  messageId?: string;
}

// HTTP 请求配置接口
export interface HttpRequestConfig {
  url: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  headers?: Record<string, string>;
  body?: any;
  timeout?: number;
  retryCount?: number;
}

// 通信配置接口
export interface CommunicationConfig {
  server: {
    websocketUrl: string;
    httpUrl: string;
    basePath: string;
  };
  websocket: {
    reconnect: boolean;
    maxReconnectAttempts: number;
    reconnectInterval: number;
    timeout: number;
    heartbeatInterval: number;
  };
  http: {
    timeout: number;
    maxRetries: number;
    retryDelay: number;
  };
  security: {
    enableEncryption: boolean;
    encryptionKey?: string;
  };
  compression: {
    enable: boolean;
    algorithm: 'gzip' | 'deflate' | 'none';
    threshold: number; // 启用压缩的阈值（字节）
  };
}

// 通信状态类型
export type ConnectionStatus = 
  | 'disconnected' 
  | 'connecting' 
  | 'connected' 
  | 'reconnecting' 
  | 'error' 
  | 'offline';

// 通信统计信息
export interface CommunicationStats {
  totalMessagesSent: number;
  totalMessagesReceived: number;
  totalBytesSent: number;
  totalBytesReceived: number;
  connectionUptime: number;
  lastMessageTime: number;
  averageLatency: number;
}

/**
 * 通信模块类 - 负责与服务器端的 HTTP/WebSocket 通信
 */
export class CommunicationModule {
  private static instance: CommunicationModule | null = null;
  private stateManager: StateManagerModule | null = null;
  private config: CommunicationConfig;
  private websocket: WebSocket | null = null;
  private connectionStatus: ConnectionStatus = 'disconnected';
  private reconnectAttempts: number = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private messageQueue: WebSocketMessage[] = [];
  private stats: CommunicationStats;
  private isActive: boolean = false;
  private pendingRequests: Map<string, { resolve: Function; reject: Function; timeout: ReturnType<typeof setTimeout> }> = new Map();
  private useMockServer: boolean = getServerConfigState().useMockServer;
  private isHandlingRuntimeUpdate: boolean = false;
  private lastRuntimeConfigSignature: string | null = null;
  private lastHeartbeatAck: number = Date.now();
  private heartbeatWarned: boolean = false;

  // 默认配置（从全局配置文件读取服务器地址）
  private defaultConfig: CommunicationConfig = {
    server: {
      websocketUrl: SERVER_WS_URL,
      httpUrl: SERVER_HTTP_URL,
      basePath: API_BASE_PATH
    },
    websocket: {
      reconnect: true,
      maxReconnectAttempts: 5,
      reconnectInterval: 3000,
      timeout: 10000,
      heartbeatInterval: 30000
    },
    http: {
      timeout: 15000,
      maxRetries: 3,
      retryDelay: 1000
    },
    security: {
      enableEncryption: false,
      encryptionKey: undefined
    },
    compression: {
      enable: true,
      algorithm: 'gzip',
      threshold: 1024 // 1KB
    }
  };

  private constructor(config?: Partial<CommunicationConfig>) {
    this.config = { ...this.defaultConfig, ...config };
    this.stats = this.initializeStats();
    this.logInitialConfig(config);
    this.initializeEventSubscriptions();
  }

  /**
   * 获取通信模块单例，避免多实例重复订阅/初始化
   */
  public static getInstance(
    config?: Partial<CommunicationConfig>
  ): CommunicationModule {
    if (!CommunicationModule.instance) {
      CommunicationModule.instance = new CommunicationModule(config);
    } else if (config) {
      CommunicationModule.instance.updateConfig(config);
    }
    return CommunicationModule.instance;
  }

  /**
   * 设置状态管理器
   */
  public setStateManager(manager: StateManagerModule): void {
    this.stateManager = manager;
  }

  /**
   * 在初始化阶段输出当前配置，便于排查连接参数问题
   */
  private logInitialConfig(inputConfig?: Partial<CommunicationConfig>): void {
    const maskKey = (key?: string) => (key ? '***' : undefined);

    console.log('===============================');
    console.log('🚀 通信模块初始化（重新启动/冷启动）');
    console.log('📡 最终配置:', {
      server: this.config.server,
      websocket: this.config.websocket,
      http: this.config.http,
      security: {
        ...this.config.security,
        encryptionKey: maskKey(this.config.security.encryptionKey)
      },
      compression: this.config.compression,
      useMockServer: this.useMockServer
    });

    if (inputConfig) {
      console.log('🛠 传入的自定义配置:', {
        ...inputConfig,
        security: inputConfig.security
          ? {
              ...inputConfig.security,
              encryptionKey: maskKey(inputConfig.security.encryptionKey)
            }
          : undefined
      });
    }
    console.log('===============================');
  }

  /**
   * 初始化统计信息
   */
  private initializeStats(): CommunicationStats {
    return {
      totalMessagesSent: 0,
      totalMessagesReceived: 0,
      totalBytesSent: 0,
      totalBytesReceived: 0,
      connectionUptime: 0,
      lastMessageTime: 0,
      averageLatency: 0
    };
  }

  /**
   * 初始化事件订阅
   */
  private initializeEventSubscriptions(): void {
    // 订阅相机模块的图像捕获完成事件
    eventBus.subscribe('camera:capture_complete', (data) => {
      this.handleImageCaptureComplete(data);
    });

    // 订阅状态变化事件
    eventBus.subscribe('state:trigger_state_change', (data) => {
      this.handleTriggerStateChange(data);
    });

    // 订阅配置更新事件（支持在线切换服务器配置和 Mock 模式）
    eventBus.subscribe('config:communication_updated', (data) => {
      this.handleRuntimeConfigUpdate(data as any);
    });

    console.log('📡📡 通信模块事件订阅初始化完成');
  }

  /**
   * 启动通信模块
   */
  public async start(): Promise<boolean> {
    try {
      if (this.isActive) {
        console.log('📡📡 通信模块已启动');
        return true;
      }

      this.isActive = true;

      // 使用当前运行时 Mock 配置
      this.useMockServer = getServerConfigState().useMockServer;

      // 如果启用 MockServer，则不再尝试真实 WebSocket 连接
      if (this.useMockServer) {
        this.setConnectionStatus('connected');
        console.log('📡📡 通信模块以 MockServer 模式启动（跳过真实 WebSocket 连接）');
      } else {
        // 尝试建立 WebSocket 连接
        await this.connectWebSocket();
      }
      
      eventBus.emit('communication:module_started', {
        timestamp: Date.now(),
        config: this.config
      });

      console.log('📡📡 通信模块已启动');
      return true;
    } catch (error) {
      console.error('启动通信模块失败:', error);
      eventBus.emit('communication:error', {
        error: '启动通信模块失败',
        errorCode: 'MODULE_START_FAILED'
      });
      return false;
    }
  }

  /**
   * 停止通信模块
   */
  public async stop(): Promise<void> {
    this.isActive = false;
    
    // 关闭 WebSocket 连接
    this.disconnectWebSocket();
    
    // 清理定时器
    this.clearTimers();
    
    // 清空消息队列
    this.messageQueue = [];
    
    // 拒绝所有待处理请求
    this.rejectPendingRequests('通信模块已停止');
    
    eventBus.emit('communication:module_stopped', {
      timestamp: Date.now()
    });

    console.log('📡📡 通信模块已停止');
  }

  /**
   * 建立 WebSocket 连接
   */
  private async connectWebSocket(): Promise<void> {
    if (this.useMockServer) {
      // Mock 模式不建立真实连接，直接认为已连接
      this.setConnectionStatus('connected');
      return;
    }

    return new Promise((resolve, reject) => {
      if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
        resolve();
        return;
      }

      this.setConnectionStatus('connecting');
      
      let timeoutTimer: ReturnType<typeof setTimeout> | null = null;
      let isResolved = false;
      
      try {
        const wsUrl = this.buildWebSocketUrl();
        console.log(`🔗 正在连接到: ${wsUrl}`);
        this.websocket = new WebSocket(wsUrl);
        
        this.websocket.onopen = () => {
          console.log('🔗🔗 WebSocket 连接已建立');
          if (timeoutTimer) {
            clearTimeout(timeoutTimer);
            timeoutTimer = null;
          }
          this.handleWebSocketOpen();
          // 注意：连接状态会在收到服务器的 'connected' 消息时更新
          // 这里先设置为 connecting，等待服务器确认
          if (!isResolved) {
            isResolved = true;
            resolve();
          }
        };
        
        this.websocket.onmessage = (event) => {
          this.handleWebSocketMessage(event);
        };
        
        this.websocket.onerror = (error) => {
          const errorMessage = `WebSocket 连接错误 (URL: ${wsUrl})`;
          console.error(`❌ ${errorMessage}:`, error);
          this.handleWebSocketError(error);
          // 错误时关闭连接，触发 onclose，从而触发自动重连
          if (this.websocket && !isResolved) {
            this.websocket.close();
          }
          if (!isResolved) {
            isResolved = true;
            reject(new Error(errorMessage));
          }
        };
        
        this.websocket.onclose = (event) => {
          if (timeoutTimer) {
            clearTimeout(timeoutTimer);
            timeoutTimer = null;
          }
          this.handleWebSocketClose(event);
        };
        
        // 设置连接超时
        timeoutTimer = setTimeout(() => {
          if (this.connectionStatus === 'connecting' && !isResolved) {
            const timeoutMessage = `WebSocket 连接超时 (${this.config.websocket.timeout}ms) - URL: ${wsUrl}`;
            console.warn(`⚠️ ${timeoutMessage}`);
            console.warn('   可能的原因：');
            console.warn('   1. 服务器未运行或地址不正确');
            console.warn('   2. 防火墙阻止了连接');
            console.warn('   3. 手机和电脑不在同一网络');
            if (this.websocket) {
              this.websocket.close();
            }
            isResolved = true;
            reject(new Error(timeoutMessage));
          }
        }, this.config.websocket.timeout);
        
      } catch (error) {
        if (timeoutTimer) {
          clearTimeout(timeoutTimer);
        }
        if (!isResolved) {
          isResolved = true;
          reject(error);
        }
      }
    });
  }

  /**
   * 构建 WebSocket URL
   */
  private buildWebSocketUrl(): string {
    let url = this.config.server.websocketUrl;
    
    // 验证URL格式
    try {
      const urlObj = new URL(url);
      // 确保协议是 ws 或 wss
      if (!['ws:', 'wss:'].includes(urlObj.protocol)) {
        console.warn(`⚠️ WebSocket URL 协议不正确: ${urlObj.protocol}，应使用 ws:// 或 wss://`);
        // 自动修复协议
        url = url.replace(/^https?:\/\//, 'ws://');
      }
    } catch (error) {
      console.error(`❌ WebSocket URL 格式无效: ${url}`, error);
      throw new Error(`无效的 WebSocket URL: ${url}`);
    }
    
    // 添加认证参数（如果需要）
    const params = new URLSearchParams();
    params.append('clientType', 'mobile');
    params.append('timestamp', Date.now().toString());
    
    const finalUrl = `${url}?${params.toString()}`;
    console.log(`🔗 构建 WebSocket URL: ${finalUrl}`);
    return finalUrl;
  }

  /**
   * 处理 WebSocket 连接建立
   */
  private handleWebSocketOpen(): void {
    this.reconnectAttempts = 0;
    this.stats.connectionUptime = Date.now();
    
    // 启动心跳检测
    this.startHeartbeat();
    
    // 发送积压的消息
    this.flushMessageQueue();
    
      eventBus.emit('communication:websocket_connected', {
        timestamp: Date.now()
      });
    console.log('🔗🔗 WebSocket 连接已建立，开始心跳检测');
  }

  /**
   * 处理 WebSocket 消息
   */
  private handleWebSocketMessage(event: MessageEvent): void {
    try {
      const message: WebSocketMessage = JSON.parse(event.data);
      this.stats.totalMessagesReceived++;
      this.stats.totalBytesReceived += event.data.length;
      this.stats.lastMessageTime = Date.now();
      
      // 更新平均延迟
      this.updateAverageLatency(message.timestamp);
      
      // 降噪：心跳/确认类消息不打印；收到心跳确认时清除告警
      if (['pong', 'heartbeat_ack'].includes(message.eventType)) {
        this.lastHeartbeatAck = Date.now();
        this.heartbeatWarned = false;
      } else {
        console.log(`📨📨 收到 WebSocket 消息: ${message.eventType}`);
      }
      
      // 处理不同类型的消息
      this.processWebSocketMessage(message);
      
    } catch (error) {
      console.error('解析 WebSocket 消息失败:', error);
      eventBus.emit('communication:message_error', {
        error: '消息解析失败',
        rawData: event.data
      });
    }
  }

  /**
   * 处理 WebSocket 错误
   */
  private handleWebSocketError(error: Event): void {
    this.setConnectionStatus('error');
    eventBus.emit('communication:websocket_error', {
      error: 'WebSocket 连接错误',
      errorCode: 'WEBSOCKET_ERROR'
    });
  }

  /**
   * 处理 WebSocket 连接关闭
   */
  private handleWebSocketClose(event: CloseEvent): void {
    console.log(`🔌🔌 WebSocket 连接关闭: ${event.code} - ${event.reason}`);
    
    this.clearTimers();
    this.setConnectionStatus('disconnected');
    
    eventBus.emit('communication:websocket_disconnected', {
      reason: event.reason || '连接关闭',
      code: event.code
    });
    
    // Mock 模式下不进行任何重连
    if (this.useMockServer) {
      return;
    }
    
    // 自动重连逻辑
    if (this.isActive && this.config.websocket.reconnect && this.reconnectAttempts < this.config.websocket.maxReconnectAttempts) {
      this.attemptReconnect();
    }
  }

  /**
   * 尝试重新连接
   */
  private attemptReconnect(): void {
    if (this.useMockServer) {
      return;
    }

    // 检查是否应该继续重连
    if (!this.isActive) {
      console.log('📡 通信模块未激活，停止重连');
      return;
    }

    if (!this.config.websocket.reconnect) {
      console.log('📡 自动重连已禁用');
      return;
    }

    if (this.reconnectAttempts >= this.config.websocket.maxReconnectAttempts) {
      console.warn(`⚠️ 已达到最大重连次数 (${this.config.websocket.maxReconnectAttempts})，停止自动重连`);
      this.setConnectionStatus('error');
      eventBus.emit('communication:error', {
        error: `达到最大重连次数 (${this.reconnectAttempts}/${this.config.websocket.maxReconnectAttempts})`,
        errorCode: 'MAX_RECONNECT_ATTEMPTS'
      });
      return;
    }

    this.reconnectAttempts++;
    const delay = this.calculateReconnectDelay();
    
    console.log(`🔄🔄 尝试重新连接 (${this.reconnectAttempts}/${this.config.websocket.maxReconnectAttempts})，延迟: ${delay}ms`);
    
    this.setConnectionStatus('reconnecting');
    
    this.reconnectTimer = setTimeout(async () => {
      try {
        await this.connectWebSocket();
        // 连接成功，reconnectAttempts 会在 handleWebSocketOpen 中重置
      } catch (error) {
        console.error('重新连接失败:', error);
        // 连接失败后，如果 websocket 已关闭，handleWebSocketClose 会被调用
        // 如果 websocket 未关闭，需要手动触发重连逻辑
        if (this.isActive && this.config.websocket.reconnect) {
          // 检查连接是否真的关闭了
          if (!this.websocket || this.websocket.readyState === WebSocket.CLOSED) {
            // 连接已关闭，等待 handleWebSocketClose 触发重连
            // 但如果 handleWebSocketClose 没有被调用，我们需要手动触发
            setTimeout(() => {
              if (this.connectionStatus === 'reconnecting' || this.connectionStatus === 'error') {
                this.attemptReconnect();
              }
            }, 1000);
          }
        }
      }
    }, delay);
  }

  /**
   * 手动重连（公开方法）
   */
  public async manualReconnect(): Promise<void> {
    if (this.useMockServer) {
      console.log('Mock 模式下无需重连');
      return;
    }

    console.log('🔄 手动触发重连...');
    
    // 重置重连计数，允许重新尝试
    this.reconnectAttempts = 0;
    
    // 清理现有连接
    if (this.websocket) {
      this.websocket.close();
      this.websocket = null;
    }
    
    // 清理定时器
    this.clearTimers();
    
    // 设置状态为连接中
    this.setConnectionStatus('connecting');
    
    // 立即尝试连接
    try {
      await this.connectWebSocket();
    } catch (error) {
      console.error('手动重连失败:', error);
      this.setConnectionStatus('error');
      throw error;
    }
  }

  /**
   * 计算重连延迟（指数退避算法）
   */
  private calculateReconnectDelay(): number {
    const baseDelay = this.config.websocket.reconnectInterval;
    const maxDelay = 30000; // 最大延迟 30 秒
    const delay = Math.min(baseDelay * Math.pow(2, this.reconnectAttempts - 1), maxDelay);
    
    // 添加随机抖动
    const jitter = delay * 0.1 * Math.random();
    return delay + jitter;
  }

  /**
   * 启动心跳检测
   */
  private startHeartbeat(): void {
    // 避免重复启动多个心跳定时器
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    this.heartbeatTimer = setInterval(() => {
      if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
        this.sendWebSocketMessage({
          eventType: 'heartbeat',
          data: { timestamp: Date.now() },
          timestamp: Date.now()
        });

        const now = Date.now();
        const diff = now - this.lastHeartbeatAck;
        // 若超过两个心跳周期未收到 ack，则输出一次警告
        if (diff > this.config.websocket.heartbeatInterval * 2 && !this.heartbeatWarned) {
          console.warn('⚠️ WebSocket 心跳超时，可能已断开或网络异常');
          this.heartbeatWarned = true;
        }
      }
    }, this.config.websocket.heartbeatInterval);
  }

  /**
   * 发送 WebSocket 消息
   */
  private sendWebSocketMessage(message: WebSocketMessage): void {
    if (!this.websocket || this.websocket.readyState !== WebSocket.OPEN) {
      // 连接未就绪，将消息加入队列
      this.messageQueue.push(message);
      console.log('📬📬 WebSocket 未连接，消息已加入队列');
      return;
    }
    
    try {
      const messageStr = JSON.stringify(message);
      this.websocket.send(messageStr);
      
      this.stats.totalMessagesSent++;
      this.stats.totalBytesSent += messageStr.length;
      
      // 降噪：心跳消息不再输出日志
      if (message.eventType !== 'heartbeat') {
        console.log(`📤📤 发送 WebSocket 消息: ${message.eventType}`);
      }
    } catch (error) {
      console.error('发送 WebSocket 消息失败:', error);
      eventBus.emit('communication:message_error', {
        error: '消息发送失败',
        messageType: message.eventType
      });
    }
  }

  /**
   * 处理图像捕获完成事件
   */
  private async handleImageCaptureComplete(data: { imageData: string; sessionId: string }): Promise<void> {
    try {
      // Mock 模式：使用 MockServer 模拟分析结果
      if (this.useMockServer) {
        console.log('🧪🧪 使用 MockServer 进行图像分析');
        const mockServer = MockServer.getInstance();
        await mockServer.analyzeImage(data.imageData, '', data.sessionId);

        eventBus.emit('communication:image_sent', {
          sessionId: data.sessionId,
          timestamp: Date.now()
        });

        return;
      }

      if (!this.isActive || this.connectionStatus !== 'connected') {
        console.warn('通信模块未就绪，无法发送图像数据');
        return;
      }

      // 准备图像数据（真实服务器模式）
      const imageMessage: WebSocketMessage = {
        eventType: 'image_analysis',
        data: {
          imageData: data.imageData,
          sessionId: data.sessionId,
          timestamp: Date.now(),
          format: 'base64',
          compression: this.config.compression.enable
        },
        timestamp: Date.now(),
        sessionId: data.sessionId
      };

      // 发送图像分析请求
      this.sendWebSocketMessage(imageMessage);

      eventBus.emit('communication:image_sent', {
        sessionId: data.sessionId,
        timestamp: Date.now()
      });

      console.log('🖼🖼 图像数据已发送至服务器');

    } catch (error) {
      console.error('处理图像数据失败:', error);
      eventBus.emit('communication:image_send_error', {
        error: '图像发送失败',
        sessionId: data.sessionId
      });
    }
  }

  /**
   * 处理 WebSocket 消息
   */
  private processWebSocketMessage(message: WebSocketMessage): void {
    switch (message.eventType) {
      case 'connected':
        // 服务器连接确认
        this.handleConnected(message);
        break;
      case 'pong':
        // 心跳响应（服务器响应心跳）
        // 无需特殊处理，只是确认连接正常
        break;
      case 'text_result':
        this.handleTextResult(message);
        break;
      case 'text_stream':
        // 流式文本结果（服务器端使用的消息类型）
        this.handleTextStream(message);
        break;
      case 'analysis_complete':
        this.handleAnalysisComplete(message);
        break;
      case 'processing':
        // 服务器正在处理图像
        this.handleProcessing(message);
        break;
      case 'final_result':
        // 最终结果（服务器端使用的消息类型）
        this.handleFinalResult(message);
        break;
      case 'error':
        this.handleServerError(message);
        break;
      case 'heartbeat_ack':
        // 心跳确认，无需处理
        break;
      default:
        console.warn(`未知的消息类型: ${message.eventType}`);
    }
  }

  /**
   * 处理连接确认消息
   */
  private handleConnected(message: WebSocketMessage): void {
    const { data } = message;
    const clientId = data?.clientId;
    const serverMessage = data?.message || 'WebSocket 连接成功';
    
    // 更新连接状态
    this.setConnectionStatus('connected');
    
    console.log(`✅✅ ${serverMessage}${clientId ? ` (客户端ID: ${clientId})` : ''}`);
    
    // 发布连接成功事件
    eventBus.emit('communication:websocket_connected', {
      clientId,
      timestamp: Date.now()
    });
  }

  /**
   * 处理处理中消息
   */
  private handleProcessing(message: WebSocketMessage): void {
    const { data, sessionId } = message;
    const processingMessage = data?.message || '正在处理...';
    
    console.log(`⏳⏳ ${processingMessage}${sessionId ? ` (会话: ${sessionId})` : ''}`);
    
    // 发布处理中事件
    eventBus.emit('communication:processing', {
      message: processingMessage,
      sessionId: sessionId || ''
    });
  }

  /**
   * 处理最终结果消息（服务器端使用的消息类型）
   */
  private handleFinalResult(message: WebSocketMessage): void {
    const { data, sessionId } = message;
    const resultText = data?.text || data?.content || '';
    
    // 发布最终结果事件
    eventBus.emit('communication:message_received', {
      type: 'final_result',
      content: resultText,
      sessionId: sessionId || ''
    });
    
    // 通知状态管理器处理完成
    eventBus.emit('state:processing_complete', { sessionId: sessionId || '' });
    
    console.log('✅✅ 收到最终结果:', resultText.substring(0, 50) + (resultText.length > 50 ? '...' : ''));
  }

  /**
   * 处理文本结果消息
   */
  private handleTextResult(message: WebSocketMessage): void {
    const { data, sessionId } = message;
    
    // 发布文本结果接收事件
    eventBus.emit('communication:message_received', {
      type: 'text_stream',
      content: data.text,
      sessionId: sessionId || ''
    });
    
    console.log('📝📝 收到文本结果:', data.text.substring(0, 50) + '...');
  }

  /**
   * 处理流式文本结果消息
   */
  private handleTextStream(message: WebSocketMessage): void {
    const { data, sessionId } = message;
    const content = data?.content || data?.text || '';
    const isFinal = data?.is_final || false;
    
    // 发布流式文本结果接收事件
    eventBus.emit('communication:message_received', {
      type: 'text_stream',
      content: content,
      sessionId: sessionId || ''
    });
    
    console.log(`📝📝 收到流式文本结果${isFinal ? ' (最终)' : ''}:`, content.substring(0, 50) + (content.length > 50 ? '...' : ''));
  }

  /**
   * 处理分析完成消息
   */
  private handleAnalysisComplete(message: WebSocketMessage): void {
    const { data, sessionId } = message;
    
    // 发布最终结果事件
    eventBus.emit('communication:message_received', {
      type: 'final_result',
      content: data.finalText,
      sessionId: sessionId || ''
    });
    
    // 通知状态管理器处理完成
    eventBus.emit('state:processing_complete', { sessionId: sessionId || '' });
    
    console.log('✅✅ 图像分析完成');
  }

  /**
   * 处理服务器错误消息
   */
  private handleServerError(message: WebSocketMessage): void {
    const { data, sessionId } = message;
    
    // 安全地提取错误信息
    const errorMessage = data?.error || data?.message || '未知错误';
    const errorCode = data?.errorCode || 'UNKNOWN_ERROR';
    
    eventBus.emit('communication:server_error', {
      error: errorMessage,
      errorCode: errorCode,
      sessionId: sessionId || ''
    });
    
    console.error('服务器错误:', errorMessage);
  }

  /**
   * HTTP 请求方法（备用方案）
   */
  public async httpRequest(config: HttpRequestConfig): Promise<any> {
    const { url, method, headers, body, timeout, retryCount = this.config.http.maxRetries } = config;
    
    for (let attempt = 0; attempt <= retryCount; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout || this.config.http.timeout);
        
        const response = await fetch(url, {
          method,
          headers: {
            'Content-Type': 'application/json',
            ...headers
          },
          body: body ? JSON.stringify(body) : undefined,
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        return data;
        
      } catch (error) {
        if (attempt === retryCount) {
          throw error;
        }
        
        console.warn(`HTTP 请求失败 (尝试 ${attempt + 1}/${retryCount + 1}):`, error);
        
        if (attempt < retryCount) {
          await this.delay(this.config.http.retryDelay);
        }
      }
    }
  }

  /**
   * 发送图像数据（HTTP 备用方案）
   */
  public async sendImageViaHttp(imageData: string, sessionId: string): Promise<void> {
    try {
      const url = `${this.config.server.httpUrl}${this.config.server.basePath}/analyze`;
      
      const result = await this.httpRequest({
        url,
        method: 'POST',
        body: {
          imageData,
          sessionId,
          timestamp: Date.now()
        },
        timeout: 30000
      });
      
      // 处理 HTTP 响应
      this.handleTextResult({
        eventType: 'text_result',
        data: { text: result.text },
        timestamp: Date.now(),
        sessionId
      });
      
    } catch (error) {
      console.error('HTTP 图像发送失败:', error);
      throw error;
    }
  }

  /**
   * 设置连接状态
   */
  private setConnectionStatus(status: ConnectionStatus): void {
    // 状态未变化则不输出重复日志
    if (this.connectionStatus === status) {
      return;
    }

    this.connectionStatus = status;
    
    // 注意：StateManagerModule 当前没有 setCommunicationStatus 方法
    // 可以通过更新 state 对象来实现，或扩展 StateManagerModule
    
    // 发布状态变化事件
    eventBus.emit('communication:status_changed', {
      status,
      timestamp: Date.now()
    });
    
    console.log(`📡📡 通信状态更新: ${status}`);
  }

  /**
   * 清空消息队列
   */
  private flushMessageQueue(): void {
    while (this.messageQueue.length > 0) {
      const message = this.messageQueue.shift();
      if (message) {
        this.sendWebSocketMessage(message);
      }
    }
  }

  /**
   * 清理定时器
   */
  private clearTimers(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  /**
   * 拒绝所有待处理请求
   */
  private rejectPendingRequests(reason: string): void {
    this.pendingRequests.forEach((request, id) => {
      request.reject(new Error(reason));
      clearTimeout(request.timeout);
    });
    this.pendingRequests.clear();
  }

  /**
   * 更新平均延迟
   */
  private updateAverageLatency(sentTimestamp: number): void {
    const currentLatency = Date.now() - sentTimestamp;
    this.stats.averageLatency = (this.stats.averageLatency * this.stats.totalMessagesReceived + currentLatency) / 
                                (this.stats.totalMessagesReceived + 1);
  }

  /**
   * 延迟函数
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 处理触发状态变化
   */
  private handleTriggerStateChange(data: { enabled: boolean }): void {
    if (data.enabled) {
      this.resumeCommunication();
    } else {
      this.pauseCommunication();
    }
  }

  /**
   * 暂停通信
   */
  private pauseCommunication(): void {
    this.isActive = false;
    this.disconnectWebSocket();
    console.log('📡📡 通信功能已暂停');
  }

  /**
   * 恢复通信
   */
  private resumeCommunication(): void {
    this.isActive = true;
    this.connectWebSocket().catch(error => {
      console.error('恢复通信失败:', error);
    });
    console.log('📡📡 通信功能已恢复');
  }

  /**
   * 断开 WebSocket 连接
   */
  private disconnectWebSocket(): void {
    if (this.websocket) {
      this.websocket.close(1000, '正常关闭');
      this.websocket = null;
    }
    this.setConnectionStatus('disconnected');
  }

  /**
   * 更新配置
   */
  public updateConfig(newConfig: Partial<CommunicationConfig>): void {
    const merged = { ...this.config, ...newConfig };
    if (this.isConfigEqual(this.config, merged)) {
      return;
    }

    this.config = merged;

    eventBus.emit('communication:config_updated', {
      config: this.config,
      timestamp: Date.now()
    });

    console.log('——— 📡 通信配置已更新 ———\n', this.config);
  }

  /**
   * 处理来自事件总线的运行时配置更新（在线切换服务器 / Mock 模式）
   */
  private handleRuntimeConfigUpdate(payload: any): void {
    if (!payload) return;
    if (this.isHandlingRuntimeUpdate) return;

    // 针对相同 payload 做幂等过滤
    const signature = this.buildRuntimeConfigSignature(payload);
    if (signature && signature === this.lastRuntimeConfigSignature) {
      return;
    }

    this.isHandlingRuntimeUpdate = true;
    this.lastRuntimeConfigSignature = signature;
    console.log('——— ⚙️ 收到通信配置更新事件 ———\n', payload);

    const prevServer = { ...this.config.server };
    const prevMock = this.useMockServer;

    try {
      // 1. 更新服务器地址等基础配置
      if (payload.server) {
        const nextServer = {
          ...this.config.server,
          ...payload.server
        };

        if (!this.isServerConfigEqual(prevServer, nextServer)) {
          console.log('🌐🌐 更新服务器地址', {
            before: prevServer,
            after: nextServer
          });

          this.updateConfig({
            server: nextServer
          });
        }
      }

      // 2. 处理 Mock 模式切换
      const nextUseMock = payload.runtime?.useMockServer;
      if (typeof nextUseMock === 'boolean' && nextUseMock !== this.useMockServer) {
        this.useMockServer = nextUseMock;

        if (this.useMockServer) {
          // 切换到 Mock：断开现有连接，让后续请求走 MockServer
          this.isActive = false;
          this.reconnectAttempts = 0;
          console.log('🧪🧪 在线切换到 MockServer 模式', {
            before: prevMock,
            after: this.useMockServer
          });
          this.disconnectWebSocket();
          this.clearTimers();
          this.messageQueue = [];
          this.rejectPendingRequests('已切换到 Mock 模式，连接中断');
          this.setConnectionStatus('connected');
        } else {
          // 切换回真实服务器：尝试重连 WebSocket
          this.isActive = true;
          this.reconnectAttempts = 0;
          console.log('🌐🌐 在线切换到真实服务器模式，尝试重连 WebSocket', {
            before: prevMock,
            after: this.useMockServer
          });
          this.disconnectWebSocket();
          this.clearTimers();
          this.messageQueue = [];
          this.rejectPendingRequests('已切换到真实服务器模式，连接重建中');
          this.connectWebSocket().catch((error) => {
            console.error('在线切换到真实服务器模式时连接失败:', error);
          });
        }
      }
    } finally {
      this.isHandlingRuntimeUpdate = false;
    }
  }

  /**
   * 构造运行时配置签名（用于幂等过滤）
   */
  private buildRuntimeConfigSignature(payload: any): string | null {
    try {
      return JSON.stringify({
        server: payload?.server ?? null,
        runtime: payload?.runtime ?? null
      });
    } catch {
      return null;
    }
  }

  /**
   * 判断服务器配置是否一致（浅比较）
   */
  private isServerConfigEqual(
    a: CommunicationConfig['server'],
    b: CommunicationConfig['server']
  ): boolean {
    return (
      a.websocketUrl === b.websocketUrl &&
      a.httpUrl === b.httpUrl &&
      a.basePath === b.basePath
    );
  }

  /**
   * 判断整体配置是否一致（仅比对 server/http/websocket/security/compression）
   */
  private isConfigEqual(
    a: CommunicationConfig,
    b: CommunicationConfig
  ): boolean {
    return (
      this.isServerConfigEqual(a.server, b.server) &&
      a.websocket.reconnect === b.websocket.reconnect &&
      a.websocket.maxReconnectAttempts === b.websocket.maxReconnectAttempts &&
      a.websocket.reconnectInterval === b.websocket.reconnectInterval &&
      a.websocket.timeout === b.websocket.timeout &&
      a.websocket.heartbeatInterval === b.websocket.heartbeatInterval &&
      a.http.timeout === b.http.timeout &&
      a.http.maxRetries === b.http.maxRetries &&
      a.http.retryDelay === b.http.retryDelay &&
      a.security.enableEncryption === b.security.enableEncryption &&
      a.security.encryptionKey === b.security.encryptionKey &&
      a.compression.enable === b.compression.enable &&
      a.compression.algorithm === b.compression.algorithm &&
      a.compression.threshold === b.compression.threshold
    );
  }

  /**
   * 获取当前连接状态
   */
  public getConnectionStatus(): ConnectionStatus {
    return this.connectionStatus;
  }

  /**
   * 获取通信统计信息
   */
  public getStats(): CommunicationStats {
    return { ...this.stats };
  }

  /**
   * 获取配置信息
   */
  public getConfig(): CommunicationConfig {
    return { ...this.config };
  }

  /**
   * 测试服务器连接
   */
  public async testConnection(): Promise<boolean> {
    try {
      const response = await this.httpRequest({
        url: `${this.config.server.httpUrl}${this.config.server.basePath}/health`,
        method: 'GET',
        timeout: 5000
      });
      
      // 兼容新旧两种响应格式
      return response.status === 'healthy' || response.status === 'ok';
    } catch (error) {
      console.error('连接测试失败:', error);
      return false;
    }
  }

  /**
   * 清理资源
   */
  public destroy(): void {
    this.stop();
    this.clearTimers();
    this.messageQueue = [];
    this.pendingRequests.clear();
    
    console.log('📡📡 通信模块资源已清理');
  }
}

// 导出通信模块单例
export const communicationModule = CommunicationModule.getInstance();
/**
 * CommunicationModule 类型定义
 * 位置：mobile/src/modules/CommunicationModule/types.ts
 */

// 扩展事件总线类型定义
declare module '../../core/eventBus/EventBus' {
    interface EventMapping {
      // 通信模块事件
      'communication:module_started': { timestamp: number; config: any };
      'communication:module_stopped': { timestamp: number };
      'communication:websocket_connected': void;
      'communication:websocket_disconnected': { reason: string; code: number };
      'communication:websocket_error': { error: string; errorCode: string };
      'communication:status_changed': { status: string; timestamp: number };
      'communication:message_received': { 
        type: 'text_stream' | 'final_result' | 'error';
        content: string;
        sessionId: string;
      };
      'communication:image_sent': { sessionId: string; timestamp: number };
      'communication:image_send_error': { error: string; sessionId: string };
      'communication:server_error': { error: string; errorCode: string; sessionId: string };
      'communication:message_error': { error: string; messageType?: string; rawData?: any };
      'communication:config_updated': { config: any; timestamp: number };
      'communication:error': { error: string; errorCode: string };
      
      // 配置更新事件（支持在线切换服务器地址和 Mock 模式）
      'config:communication_updated': Partial<{
        server: { websocketUrl: string; httpUrl: string; basePath: string };
        websocket: { reconnect: boolean; maxReconnectAttempts: number };
        http: { timeout: number; maxRetries: number };
        security: { enableEncryption: boolean };
        compression: { enable: boolean; algorithm: string };
        runtime: { useMockServer?: boolean };
      }>;
    }
  }
  
  export * from './CommunicationModule';
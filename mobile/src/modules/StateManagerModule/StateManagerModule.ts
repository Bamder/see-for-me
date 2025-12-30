/**
 * SeeForMe 状态管理模块
 * 基于React Context API与Expo SecureStore实现全局状态管理与持久化存储
 * 位置：mobile/src/modules/StateManagerModule/StateManagerModule.ts
 */

import React, { createContext, useContext, useReducer, useEffect } from 'react';
import { eventBus } from '../../core/eventBus/EventBus';

// 注意：expo-secure-store 需要安装，当前使用内存存储作为备用方案
// 如需使用安全存储，请安装: npm install expo-secure-store
// 如需使用 AsyncStorage，请安装: npm install @react-native-async-storage/async-storage
// import * as SecureStore from 'expo-secure-store';
// import AsyncStorage from '@react-native-async-storage/async-storage';

// 简单的内存存储实现（备用方案）
const memoryStorage: Map<string, string> = new Map();

// 状态接口定义
export interface AppState {
  // 触发开关状态
  triggerEnabled: boolean;
  
  // 通信状态
  connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'error' | 'offline';
  
  // 模块启用状态
  moduleStatus: {
    camera: boolean;
    gesture: boolean;
    communication: boolean;
    tts: boolean;
  };
  
  // 处理状态
  processingState: boolean;
  currentSessionId: string | null;
  
  // 用户偏好设置
  preferences: {
    language: string;
    voice: string;
    volume: number;
    speechRate: number;
    gestureSensitivity: 'low' | 'medium' | 'high';
    compressionQuality: number;
  };
  
  // 系统状态
  system: {
    batteryLevel: number;
    isCharging: boolean;
    storageUsage: number;
    lastError: string | null;
  };
  
  // 历史记录
  history: {
    sessions: Array<{
      id: string;
      timestamp: number;
      imageCount: number;
      resultText: string;
    }>;
    maxHistorySize: number;
  };
}

// 状态操作类型
export type StateAction = 
  | { type: 'SET_TRIGGER_ENABLED'; payload: boolean }
  | { type: 'SET_CONNECTION_STATUS'; payload: AppState['connectionStatus'] }
  | { type: 'SET_MODULE_STATUS'; payload: Partial<AppState['moduleStatus']> }
  | { type: 'SET_PROCESSING_STATE'; payload: { processing: boolean; sessionId?: string } }
  | { type: 'UPDATE_PREFERENCES'; payload: Partial<AppState['preferences']> }
  | { type: 'UPDATE_SYSTEM_STATE'; payload: Partial<AppState['system']> }
  | { type: 'ADD_HISTORY_SESSION'; payload: AppState['history']['sessions'][0] }
  | { type: 'CLEAR_HISTORY' }
  | { type: 'RESET_STATE' }
  | { type: 'RESTORE_STATE'; payload: Partial<AppState> };

// 持久化配置
interface PersistenceConfig {
  enabled: boolean;
  keys: (keyof AppState)[];
  encryption: boolean;
}

// 状态上下文接口
export interface StateContextValue {
  state: AppState;
  dispatch: React.Dispatch<StateAction>;
  persistState: (keys?: (keyof AppState)[]) => Promise<void>;
  restoreState: () => Promise<void>;
  resetToDefaults: () => Promise<void>;
  getStateSnapshot: () => Partial<AppState>;
  subscribeToChanges: (callback: (state: AppState, action: StateAction) => void) => () => void;
}

// 默认状态
export const defaultState: AppState = {
  triggerEnabled: true,
  connectionStatus: 'disconnected',
  moduleStatus: {
    camera: true,
    gesture: true,
    communication: true,
    tts: true
  },
  processingState: false,
  currentSessionId: null,
  preferences: {
    language: 'zh-CN',
    voice: 'default',
    volume: 0.8,
    speechRate: 1.0,
    gestureSensitivity: 'medium',
    compressionQuality: 0.7
  },
  system: {
    batteryLevel: 100,
    isCharging: false,
    storageUsage: 0,
    lastError: null
  },
  history: {
    sessions: [],
    maxHistorySize: 100
  }
};

// 持久化配置
const persistenceConfig: PersistenceConfig = {
  enabled: true,
  keys: ['triggerEnabled', 'moduleStatus', 'preferences', 'history'],
  encryption: true
};

// 创建状态上下文（导出供其他文件使用）
export const StateContext = createContext<StateContextValue | undefined>(undefined);

/**
 * 状态管理模块类 - 负责全局状态管理与持久化
 */
export class StateManagerModule {
  private static instance: StateManagerModule;
  private state: AppState = defaultState;
  private persistenceConfig: PersistenceConfig = persistenceConfig;
  private changeListeners: Array<(state: AppState, action: StateAction) => void> = [];
  private isInitialized: boolean = false;

  // 私有构造函数，实现单例模式
  private constructor() {}

  /**
   * 获取状态管理模块单例实例
   */
  public static getInstance(): StateManagerModule {
    if (!StateManagerModule.instance) {
      StateManagerModule.instance = new StateManagerModule();
    }
    return StateManagerModule.instance;
  }

  /**
   * 初始化状态管理模块
   */
  public async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      // 从持久化存储恢复状态
      await this.restoreState();
      
      // 初始化事件订阅
      this.initializeEventSubscriptions();
      
      this.isInitialized = true;
      
      console.log('🔧🔧🔧🔧 状态管理模块初始化完成');
    } catch (error) {
      console.error('状态管理模块初始化失败:', error);
      throw new Error(`状态管理模块初始化失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  }

  /**
   * 初始化事件订阅
   */
  private initializeEventSubscriptions(): void {
    // 订阅手势模块事件
    eventBus.subscribe('gesture:recognized', (data) => {
      this.handleGestureRecognized(data);
    });

    // 订阅通信模块事件
    eventBus.subscribe('communication:status_changed', (data) => {
      this.handleCommunicationStatusChange({
        status: data.status as AppState['connectionStatus']
      });
    });

    // 订阅相机模块事件
    eventBus.subscribe('camera:capture_start', (data) => {
      this.handleCaptureStart(data);
    });

    // 订阅配置更新事件
    eventBus.subscribe('config:gesture_updated', (data) => {
      this.handleConfigUpdate('gesture', data);
    });

    eventBus.subscribe('config:communication_updated', (data) => {
      this.handleConfigUpdate('communication', data);
    });

    // 订阅触发状态变更事件
    eventBus.subscribe('state:trigger_state_change', (data) => {
      this.setTriggerEnabled(data.enabled);
    });

    console.log('🔧🔧🔧🔧 状态管理模块事件订阅初始化完成');
  }

  /**
   * 状态Reducer函数（公开方法，供 React Context 使用）
   */
  public stateReducer(state: AppState, action: StateAction): AppState {
    try {
      let newState: AppState;

      switch (action.type) {
        case 'SET_TRIGGER_ENABLED':
          newState = {
            ...state,
            triggerEnabled: action.payload
          };
          break;

        case 'SET_CONNECTION_STATUS':
          newState = {
            ...state,
            connectionStatus: action.payload
          };
          break;

        case 'SET_MODULE_STATUS':
          newState = {
            ...state,
            moduleStatus: {
              ...state.moduleStatus,
              ...action.payload
            }
          };
          break;

        case 'SET_PROCESSING_STATE':
          newState = {
            ...state,
            processingState: action.payload.processing,
            currentSessionId: action.payload.sessionId || null
          };
          break;

        case 'UPDATE_PREFERENCES':
          newState = {
            ...state,
            preferences: {
              ...state.preferences,
              ...action.payload
            }
          };
          break;

        case 'UPDATE_SYSTEM_STATE':
          newState = {
            ...state,
            system: {
              ...state.system,
              ...action.payload
            }
          };
          break;

        case 'ADD_HISTORY_SESSION':
          const newSessions = [action.payload, ...state.history.sessions]
            .slice(0, state.history.maxHistorySize);
          newState = {
            ...state,
            history: {
              ...state.history,
              sessions: newSessions
            }
          };
          break;

        case 'CLEAR_HISTORY':
          newState = {
            ...state,
            history: {
              ...state.history,
              sessions: []
            }
          };
          break;

        case 'RESET_STATE':
          newState = defaultState;
          break;

        case 'RESTORE_STATE':
          newState = {
            ...defaultState,
            ...action.payload
          };
          break;

        default:
          newState = state;
      }

      // 通知状态变更监听器
      this.notifyStateChangeListeners(newState, action);

      // 自动持久化相关状态
      if (this.shouldPersistAction(action)) {
        this.persistState().catch(error => {
          console.error('状态持久化失败:', error);
        });
      }

      return newState;

    } catch (error) {
      console.error('状态更新错误:', error);
      
      // 发布状态错误事件
      eventBus.emit('state:error', {
        error: '状态更新失败',
        action: action,
        errorCode: 'STATE_UPDATE_FAILED'
      });

      // 状态回滚：返回原状态
      return state;
    }
  }

  /**
   * 判断操作是否需要持久化
   */
  private shouldPersistAction(action: StateAction): boolean {
    if (!this.persistenceConfig.enabled) return false;

    const persistableActions: StateAction['type'][] = [
      'SET_TRIGGER_ENABLED',
      'SET_MODULE_STATUS',
      'UPDATE_PREFERENCES',
      'ADD_HISTORY_SESSION',
      'CLEAR_HISTORY',
      'RESTORE_STATE'
    ];

    return persistableActions.includes(action.type);
  }

  /**
   * 分发状态操作
   */
  public dispatch(action: StateAction): void {
    if (!this.isInitialized) {
      console.warn('状态管理模块未初始化，忽略操作:', action);
      return;
    }

    try {
      this.state = this.stateReducer(this.state, action);
      
      // 发布状态变更事件
      this.publishStateChangeEvent(action);
      
    } catch (error) {
      console.error('状态操作分发失败:', error);
      this.handleStateError(error, action);
    }
  }

  /**
   * 发布状态变更事件
   */
  private publishStateChangeEvent(action: StateAction): void {
    switch (action.type) {
      case 'SET_TRIGGER_ENABLED':
        eventBus.emit('state:trigger_changed', {
          enabled: action.payload
        });
        break;

      case 'SET_CONNECTION_STATUS':
        eventBus.emit('state:connection_changed', {
          status: action.payload
        });
        break;

      case 'SET_PROCESSING_STATE':
        if (action.payload.processing) {
          eventBus.emit('state:processing_start', {
            sessionId: action.payload.sessionId || ''
          });
        } else {
          eventBus.emit('state:processing_complete', {
            sessionId: action.payload.sessionId || ''
          });
        }
        break;
    }

    // 发布通用状态变更事件
    eventBus.emit('state:changed', {
      action: action.type,
      timestamp: Date.now(),
      stateSnapshot: this.getStateSnapshot()
    });
  }

  /**
   * 处理状态错误
   */
  private handleStateError(error: unknown, action: StateAction): void {
    const errorMessage = error instanceof Error ? error.message : '未知状态错误';
    
    eventBus.emit('state:error', {
      error: errorMessage,
      action: action,
      errorCode: 'STATE_MANAGEMENT_ERROR'
    });

    // 更新系统错误状态
    this.dispatch({
      type: 'UPDATE_SYSTEM_STATE',
      payload: {
        lastError: errorMessage
      }
    });
  }

  /**
   * 设置触发开关状态
   */
  public setTriggerEnabled(enabled: boolean): void {
    this.dispatch({
      type: 'SET_TRIGGER_ENABLED',
      payload: enabled
    });
  }

  /**
   * 获取触发开关状态
   */
  public isTriggerEnabled(): boolean {
    return this.state.triggerEnabled;
  }

  /**
   * 设置处理状态
   */
  public setProcessingState(processing: boolean, sessionId?: string): void {
    this.dispatch({
      type: 'SET_PROCESSING_STATE',
      payload: {
        processing,
        sessionId
      }
    });
  }

  /**
   * 获取处理状态
   */
  public isProcessing(): boolean {
    return this.state.processingState;
  }

  /**
   * 设置连接状态
   */
  public setConnectionStatus(status: AppState['connectionStatus']): void {
    this.dispatch({
      type: 'SET_CONNECTION_STATUS',
      payload: status
    });
  }

  /**
   * 获取连接状态
   */
  public getConnectionStatus(): AppState['connectionStatus'] {
    return this.state.connectionStatus;
  }

  /**
   * 更新模块状态
   */
  public setModuleStatus(module: keyof AppState['moduleStatus'], enabled: boolean): void {
    this.dispatch({
      type: 'SET_MODULE_STATUS',
      payload: {
        [module]: enabled
      }
    });
  }

  /**
   * 获取模块状态
   */
  public getModuleStatus(module: keyof AppState['moduleStatus']): boolean {
    return this.state.moduleStatus[module];
  }

  /**
   * 更新用户偏好设置
   */
  public updatePreferences(preferences: Partial<AppState['preferences']>): void {
    this.dispatch({
      type: 'UPDATE_PREFERENCES',
      payload: preferences
    });
  }

  /**
   * 获取用户偏好设置
   */
  public getPreferences(): AppState['preferences'] {
    return this.state.preferences;
  }

  /**
   * 添加历史会话记录
   */
  public addHistorySession(session: AppState['history']['sessions'][0]): void {
    this.dispatch({
      type: 'ADD_HISTORY_SESSION',
      payload: session
    });
  }

  /**
   * 清除历史记录
   */
  public clearHistory(): void {
    this.dispatch({
      type: 'CLEAR_HISTORY'
    });
  }

  /**
   * 获取状态快照
   */
  public getStateSnapshot(): Partial<AppState> {
    return {
      triggerEnabled: this.state.triggerEnabled,
      connectionStatus: this.state.connectionStatus,
      moduleStatus: { ...this.state.moduleStatus },
      processingState: this.state.processingState,
      currentSessionId: this.state.currentSessionId,
      preferences: { ...this.state.preferences },
      system: { ...this.state.system },
      history: {
        sessions: [...this.state.history.sessions],
        maxHistorySize: this.state.history.maxHistorySize
      }
    };
  }

  /**
   * 获取完整状态
   */
  public getState(): AppState {
    return this.state;
  }

  /**
   * 持久化状态到安全存储
   */
  public async persistState(keys?: (keyof AppState)[]): Promise<void> {
    if (!this.persistenceConfig.enabled) return;

    try {
      const keysToPersist = keys || this.persistenceConfig.keys;
      const stateToPersist: Partial<AppState> = {};

      keysToPersist.forEach(key => {
        const value = this.state[key];
        if (value !== undefined && value !== null) {
          (stateToPersist as any)[key] = value;
        }
      });

      const dataString = JSON.stringify(stateToPersist);
      
      // 使用内存存储作为备用方案（expo-secure-store 需要安装）
      memoryStorage.set('app_state', dataString);

      console.log('💾💾 状态持久化完成');
    } catch (error) {
      console.error('状态持久化失败:', error);
      throw new Error(`状态持久化失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  }

  /**
   * 从安全存储恢复状态
   */
  public async restoreState(): Promise<void> {
    if (!this.persistenceConfig.enabled) return;

    try {
      // 使用内存存储作为备用方案（expo-secure-store 需要安装）
      const storedState = memoryStorage.get('app_state') || null;

      if (storedState) {
        const parsedState = JSON.parse(storedState) as Partial<AppState>;
        
        this.dispatch({
          type: 'RESTORE_STATE',
          payload: parsedState
        });

        console.log('🔄🔄 状态恢复完成');
      }
    } catch (error) {
      console.error('状态恢复失败:', error);
      // 不抛出错误，使用默认状态继续运行
    }
  }

  /**
   * 重置为默认状态
   */
  public async resetToDefaults(): Promise<void> {
    this.dispatch({
      type: 'RESET_STATE'
    });

    // 清除持久化存储（使用内存存储作为备用方案）
    memoryStorage.delete('app_state');

    console.log('🔄🔄 状态已重置为默认值');
  }

  /**
   * 订阅状态变更
   */
  public subscribeToChanges(callback: (state: AppState, action: StateAction) => void): () => void {
    this.changeListeners.push(callback);

    // 返回取消订阅函数
    return () => {
      const index = this.changeListeners.indexOf(callback);
      if (index > -1) {
        this.changeListeners.splice(index, 1);
      }
    };
  }

  /**
   * 通知状态变更监听器
   */
  private notifyStateChangeListeners(newState: AppState, action: StateAction): void {
    this.changeListeners.forEach(listener => {
      try {
        listener(newState, action);
      } catch (error) {
        console.error('状态变更监听器执行错误:', error);
      }
    });
  }

  /**
   * 事件处理函数
   */

  private handleGestureRecognized(data: any): void {
    // 手势识别时，如果触发被禁用，则忽略
    if (!this.state.triggerEnabled) {
      console.log('🔧🔧 触发被禁用，忽略手势');
      return;
    }

    // 设置处理状态
    this.setProcessingState(true);
  }

  private handleCommunicationStatusChange(data: { status: AppState['connectionStatus'] }): void {
    this.setConnectionStatus(data.status);
  }

  private handleCaptureStart(data: { sessionId: string }): void {
    this.setProcessingState(true, data.sessionId);
  }

  private handleProcessingComplete(data: { sessionId: string }): void {
    this.setProcessingState(false);
    
    // 恢复触发状态
    this.setTriggerEnabled(true);
  }

  private handleConfigUpdate(module: string, data: any): void {
    // 根据配置更新相应模块状态
    console.log(`🔧🔧 模块[${module}] 配置更新:\n`, data);
  }

  /**
   * 设置持久化配置
   */
  public setPersistenceConfig(config: Partial<PersistenceConfig>): void {
    this.persistenceConfig = {
      ...this.persistenceConfig,
      ...config
    };
  }

  /**
   * 获取持久化配置
   */
  public getPersistenceConfig(): PersistenceConfig {
    return { ...this.persistenceConfig };
  }

  /**
   * 检查模块是否就绪
   */
  public isModuleReady(module: keyof AppState['moduleStatus']): boolean {
    return this.state.moduleStatus[module] && 
           (module !== 'communication' || this.state.connectionStatus === 'connected');
  }

  /**
   * 获取系统健康状态
   */
  public getSystemHealth(): {
    status: 'healthy' | 'degraded' | 'unhealthy';
    issues: string[];
  } {
    const issues: string[] = [];

    if (!this.state.moduleStatus.camera) {
      issues.push('相机模块未启用');
    }

    if (this.state.connectionStatus !== 'connected' && this.state.moduleStatus.communication) {
      issues.push('通信连接异常');
    }

    if (this.state.system.lastError) {
      issues.push(`系统错误: ${this.state.system.lastError}`);
    }

    if (this.state.system.batteryLevel < 20 && !this.state.system.isCharging) {
      issues.push('电量过低');
    }

    return {
      status: issues.length === 0 ? 'healthy' : issues.length < 3 ? 'degraded' : 'unhealthy',
      issues
    };
  }

  /**
   * 清理资源
   */
  public destroy(): void {
    this.changeListeners = [];
    this.isInitialized = false;
    
    console.log('🔧🔧🔧🔧 状态管理模块资源已清理');
  }
}

// 注意：StateProvider 和 useStateContext 已移至 StateProvider.tsx 文件中
// 因为 JSX 代码需要在 .tsx 文件中

// 导出状态管理模块单例
export const stateManagerModule = StateManagerModule.getInstance();
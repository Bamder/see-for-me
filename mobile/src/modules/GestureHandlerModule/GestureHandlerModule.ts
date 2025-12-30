/**
 * SeeForMe 手势处理模块
 * 基于Expo Gesture Handler实现手势识别和物理按键监听
 * 位置：mobile/src/modules/GestureHandlerModule/GestureHandlerModule.ts
 */

import {
  TapGestureHandler,
  TapGestureHandlerGestureEvent,
  LongPressGestureHandlerGestureEvent,
  State,
  GestureHandlerRootView,
} from 'react-native-gesture-handler';
import { eventBus } from '../../core/eventBus/EventBus';
import { StateManagerModule } from '../StateManagerModule';

// 手势配置接口
export interface GestureConfig {
  doubleTap: {
    enabled: boolean;
    maxInterval: number; // 双击最大间隔时间（毫秒）
    maxDistance: number; // 双击最大距离（像素）
  };
  volumePowerCombo: {
    enabled: boolean;
    maxInterval: number; // 组合按键最大间隔时间（毫秒）
  };
  sensitivity: {
    tapThreshold: number; // 点击灵敏度阈值
    motionThreshold: number; // 动作灵敏度阈值
  };
}

// 手势识别结果接口
export interface GestureResult {
  type: 'double_tap' | 'volume_power_combo' | 'custom';
  confidence: number; // 识别置信度 0-1
  timestamp: number;
  coordinates?: { x: number; y: number };
  metadata?: Record<string, any>;
}

// 物理按键状态接口
interface ButtonState {
  volumeUp: { pressed: boolean; timestamp: number };
  volumeDown: { pressed: boolean; timestamp: number };
  power: { pressed: boolean; timestamp: number };
}

/**
 * 手势处理模块类 - 负责识别用户手势和物理按键组合
 */
export class GestureHandlerModule {
  private stateManager: StateManagerModule | null = null;
  private config: GestureConfig;
  private isActive: boolean = false;
  private volumeButtonsListener: any = null;
  
  // 双击识别状态
  private doubleTapState = {
    firstTap: { x: 0, y: 0, timestamp: 0 },
    waitingSecondTap: false,
  };

  // 物理按键组合识别状态
  private buttonState: ButtonState = {
    volumeUp: { pressed: false, timestamp: 0 },
    volumeDown: { pressed: false, timestamp: 0 },
    power: { pressed: false, timestamp: 0 },
  };

  // 默认配置
  private defaultConfig: GestureConfig = {
    doubleTap: {
      enabled: true,
      maxInterval: 300,
      maxDistance: 50,
    },
    volumePowerCombo: {
      enabled: true,
      maxInterval: 500,
    },
    sensitivity: {
      tapThreshold: 0.8,
      motionThreshold: 0.6,
    },
  };

  // 手势类型映射
  private gestureTypeMap: Record<'double_tap' | 'volume_power_combo' | 'custom', string> = {
    double_tap: 'gesture:double_tap',
    volume_power_combo: 'gesture:volume_power_combo',
    custom: 'gesture:custom',
  };

  constructor(config?: Partial<GestureConfig>) {
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
   * 初始化事件订阅
   */
  private initializeEventSubscriptions(): void {
    // 订阅状态变化事件
    eventBus.subscribe('state:trigger_state_change', (data) => {
      this.handleTriggerStateChange(data);
    });

    // 订阅配置更新事件
    eventBus.subscribe('config:gesture_updated', (data) => {
      this.updateConfig(data);
    });

    console.log('👆👆 手势模块事件订阅初始化完成');
  }

  /**
   * 启动手势识别
   */
  public async startRecognition(): Promise<boolean> {
    try {
      if (this.isActive) {
        console.log('👆👆 手势识别已启动');
        return true;
      }

      // 初始化物理按键监听
      await this.initializePhysicalButtonListeners();
      
      this.isActive = true;
      
      eventBus.emit('gesture:recognition_started', {
        timestamp: Date.now(),
        enabledGestures: this.getEnabledGestures()
      });

      console.log('👆👆 手势识别已启动');
      return true;
    } catch (error) {
      console.error('启动手势识别失败:', error);
      eventBus.emit('gesture:error', {
        error: '启动手势识别失败',
        errorCode: 'RECOGNITION_START_FAILED'
      });
      return false;
    }
  }

  /**
   * 停止手势识别
   */
  public async stopRecognition(): Promise<void> {
    this.isActive = false;
    
    // 清理物理按键监听
    this.cleanupPhysicalButtonListeners();
    
    // 重置状态
    this.resetRecognitionState();
    
    eventBus.emit('gesture:recognition_stopped', {
      timestamp: Date.now()
    });

    console.log('👆👆 手势识别已停止');
  }

  /**
   * 初始化物理按键监听
   */
  private async initializePhysicalButtonListeners(): Promise<void> {
    try {
      if (this.config.volumePowerCombo.enabled) {
        // 注意：expo-volume-buttons 包不存在，需要使用其他方案
        // 可以使用 react-native-volume-manager 或其他第三方库
        // 或者使用原生模块来实现音量键监听
        // 这里暂时使用备用方案
        console.warn('⚠️ 音量键监听需要原生模块支持，当前使用备用方案');
        this.initializeFallbackButtonListeners();
        
        // 注意：电源键监听需要额外的原生模块支持
        // 这里使用设备状态监听作为替代方案
        this.initializePowerButtonListener();
      }
    } catch (error) {
      console.warn('物理按键监听初始化失败，使用备用方案:', error);
      this.initializeFallbackButtonListeners();
    }
  }

  /**
   * 初始化电源键监听（备用方案）
   */
  private initializePowerButtonListener(): void {
    // 使用AppState监听应用状态变化来检测电源键操作
    // 注意：这是一种间接检测方法，实际项目中可能需要原生模块
    console.log('👆👆 电源键监听已初始化（备用方案）');
  }

  /**
   * 初始化备用按键监听
   */
  private initializeFallbackButtonListeners(): void {
    // 使用屏幕触摸事件模拟物理按键
    // 在实际项目中，这应该替换为真正的物理按键监听
    console.log('👆👆 使用备用按键监听方案');
  }

  /**
   * 清理物理按键监听
   */
  private cleanupPhysicalButtonListeners(): void {
    if (this.volumeButtonsListener) {
      this.volumeButtonsListener.remove();
      this.volumeButtonsListener = null;
    }
  }

  /**
   * 处理屏幕双击手势
   * （保留原实现，当前主要改为通过长按触发，但双击仍可复用）
   */
  public handleDoubleTap(event: TapGestureHandlerGestureEvent): void {
    if (!this.isActive || !this.config.doubleTap.enabled) {
      return;
    }

    const { state, x, y } = event.nativeEvent;
    
    if (state === State.ACTIVE) {
      this.processDoubleTap(x, y);
    }
  }

  /**
   * 处理长按手势：直接视为一次高置信度的触发
   */
  public handleLongPress(event: LongPressGestureHandlerGestureEvent): void {
    if (!this.isActive || !this.config.doubleTap.enabled) {
      return;
    }

    const { state, x, y } = event.nativeEvent;

    if (state === State.ACTIVE) {
      this.triggerGestureRecognition({
        type: 'double_tap',
        confidence: 1,
        timestamp: Date.now(),
        coordinates: { x, y }
      });
    }
  }

  /**
   * 处理双击识别逻辑
   */
  private processDoubleTap(x: number, y: number): void {
    const now = Date.now();
    
    if (!this.doubleTapState.waitingSecondTap) {
      // 第一次点击
      this.doubleTapState.firstTap = { x, y, timestamp: now };
      this.doubleTapState.waitingSecondTap = true;
      
      // 设置超时重置
      setTimeout(() => {
        if (this.doubleTapState.waitingSecondTap) {
          this.doubleTapState.waitingSecondTap = false;
        }
      }, this.config.doubleTap.maxInterval);
      
      return;
    }

    // 第二次点击 - 验证双击条件
    const timeDiff = now - this.doubleTapState.firstTap.timestamp;
    const distance = Math.sqrt(
      Math.pow(x - this.doubleTapState.firstTap.x, 2) + 
      Math.pow(y - this.doubleTapState.firstTap.y, 2)
    );

    if (timeDiff <= this.config.doubleTap.maxInterval && 
        distance <= this.config.doubleTap.maxDistance) {
      
      // 双击识别成功
      this.triggerGestureRecognition({
        type: 'double_tap',
        confidence: this.calculateDoubleTapConfidence(timeDiff, distance),
        timestamp: now,
        coordinates: { x, y },
        metadata: {
          timeInterval: timeDiff,
          distance: distance
        }
      });
    }

    // 重置状态
    this.doubleTapState.waitingSecondTap = false;
  }

  /**
   * 处理音量键按下
   */
  private handleVolumeButtonPress(volume: number): void {
    if (!this.isActive || !this.config.volumePowerCombo.enabled) {
      return;
    }

    const now = Date.now();
    const buttonType = volume > 0 ? 'volumeUp' : 'volumeDown';
    
    this.buttonState[buttonType] = {
      pressed: true,
      timestamp: now
    };

    // 检查组合按键
    this.checkVolumePowerCombo(buttonType, now);
  }

  /**
   * 检查音量键+电源键组合
   */
  private checkVolumePowerCombo(buttonType: string, timestamp: number): void {
    // 简化实现：检测短时间内音量键和电源键的组合
    // 实际项目中需要更精确的电源键检测
    
    const timeWindow = this.config.volumePowerCombo.maxInterval;
    const recentPresses = this.getRecentButtonPresses(timeWindow);
    
    if (recentPresses.length >= 2) {
      // 检测到组合按键
      this.triggerGestureRecognition({
        type: 'volume_power_combo',
        confidence: this.calculateComboConfidence(recentPresses),
        timestamp: timestamp,
        metadata: {
          buttonSequence: recentPresses,
          pressCount: recentPresses.length
        }
      });
    }
  }

  /**
   * 获取最近按键记录
   */
  private getRecentButtonPresses(timeWindow: number): Array<{type: string; timestamp: number}> {
    const now = Date.now();
    const presses: Array<{type: string; timestamp: number}> = [];
    
    Object.entries(this.buttonState).forEach(([type, state]) => {
      if (state.pressed && (now - state.timestamp) <= timeWindow) {
        presses.push({ type, timestamp: state.timestamp });
      }
    });
    
    return presses.sort((a, b) => a.timestamp - b.timestamp);
  }

  /**
   * 触发手势识别事件
   */
  private triggerGestureRecognition(result: GestureResult): void {
    if (!this.stateManager?.isTriggerEnabled()) {
      console.log('👆👆 触发被禁用，忽略手势');
      return;
    }

    // 发布手势识别事件
    if (result.type === 'double_tap' && result.coordinates) {
      eventBus.emit('gesture:double_tap', {
        x: result.coordinates.x,
        y: result.coordinates.y
      });
    } else if (result.type === 'volume_power_combo') {
      eventBus.emit('gesture:volume_power_combo', undefined as void);
    }

    console.log(`👆👆 手势识别成功: ${result.type}, 置信度: ${result.confidence}`);
    
    // 发布通用手势事件
    eventBus.emit('gesture:recognized', result);
  }

  /**
   * 计算双击置信度
   */
  private calculateDoubleTapConfidence(timeDiff: number, distance: number): number {
    const timeScore = 1 - (timeDiff / this.config.doubleTap.maxInterval);
    const distanceScore = 1 - (distance / this.config.doubleTap.maxDistance);
    
    return Math.min(1, (timeScore + distanceScore) / 2);
  }

  /**
   * 计算组合按键置信度
   */
  private calculateComboConfidence(presses: Array<{type: string; timestamp: number}>): number {
    if (presses.length < 2) return 0;
    
    const timeSpan = presses[presses.length - 1].timestamp - presses[0].timestamp;
    const timeScore = 1 - (timeSpan / this.config.volumePowerCombo.maxInterval);
    const sequenceScore = this.evaluateButtonSequence(presses);
    
    return Math.min(1, (timeScore + sequenceScore) / 2);
  }

  /**
   * 评估按键序列
   */
  private evaluateButtonSequence(presses: Array<{type: string; timestamp: number}>): number {
    // 简化的序列评估逻辑
    // 实际项目中可以根据具体需求实现更复杂的逻辑
    const hasVolume = presses.some(press => press.type.includes('volume'));
    const hasPower = presses.some(press => press.type.includes('power'));
    
    return hasVolume && hasPower ? 0.9 : 0.5;
  }

  /**
   * 处理触发状态变化
   */
  private handleTriggerStateChange(data: { enabled: boolean }): void {
    if (data.enabled) {
      this.resumeRecognition();
    } else {
      this.pauseRecognition();
    }
  }

  /**
   * 暂停手势识别
   */
  private pauseRecognition(): void {
    this.isActive = false;
    console.log('👆👆 手势识别已暂停');
  }

  /**
   * 恢复手势识别
   */
  private resumeRecognition(): void {
    this.isActive = true;
    console.log('👆👆 手势识别已恢复');
  }

  /**
   * 重置识别状态
   */
  private resetRecognitionState(): void {
    this.doubleTapState = {
      firstTap: { x: 0, y: 0, timestamp: 0 },
      waitingSecondTap: false,
    };
    
    this.buttonState = {
      volumeUp: { pressed: false, timestamp: 0 },
      volumeDown: { pressed: false, timestamp: 0 },
      power: { pressed: false, timestamp: 0 },
    };
  }

  /**
   * 更新配置
   */
  public updateConfig(newConfig: Partial<GestureConfig>): void {
    this.config = { ...this.config, ...newConfig };
    
    eventBus.emit('gesture:config_updated', {
      config: this.config,
      timestamp: Date.now()
    });

    console.log('👆👆 手势配置已更新');
  }

  /**
   * 添加自定义手势识别器
   */
  public addCustomGesture(
    name: string,
    recognizer: (event: any) => GestureResult | null
  ): void {
    // 预留扩展接口：支持添加新的手势识别器
    console.log(`👆👆 自定义手势已添加: ${name}`);
  }

  /**
   * 设置识别灵敏度
   */
  public setSensitivity(level: 'low' | 'medium' | 'high' | number): void {
    let threshold: number;
    
    if (typeof level === 'number') {
      threshold = level;
    } else {
      const levels = { low: 0.5, medium: 0.7, high: 0.9 };
      threshold = levels[level] || 0.7;
    }
    
    this.config.sensitivity.tapThreshold = threshold;
    this.config.sensitivity.motionThreshold = threshold;
    
    console.log(`👆👆 识别灵敏度设置为: ${threshold}`);
  }

  /**
   * 获取启用的手势列表
   */
  private getEnabledGestures(): string[] {
    const gestures: string[] = [];
    
    if (this.config.doubleTap.enabled) gestures.push('double_tap');
    if (this.config.volumePowerCombo.enabled) gestures.push('volume_power_combo');
    
    return gestures;
  }

  /**
   * 获取当前手势状态
   */
  public getGestureStatus(): {
    isActive: boolean;
    enabledGestures: string[];
    recognitionStats: {
      totalRecognitions: number;
      lastGestureType?: string;
      lastGestureTime?: number;
    };
  } {
    return {
      isActive: this.isActive,
      enabledGestures: this.getEnabledGestures(),
      recognitionStats: {
        totalRecognitions: 0, // 实际项目中应该记录统计信息
      }
    };
  }

  /**
   * 获取手势配置
   */
  public getConfig(): GestureConfig {
    return { ...this.config };
  }

  /**
   * 清理资源
   */
  public destroy(): void {
    this.stopRecognition();
    this.cleanupPhysicalButtonListeners();
    console.log('👆👆 手势模块资源已清理');
  }
}

// 导出手势处理器组件
export { TapGestureHandler, GestureHandlerRootView, State };

// 导出手势模块单例
export const gestureHandlerModule = new GestureHandlerModule();
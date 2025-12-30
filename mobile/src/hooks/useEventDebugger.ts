import { useEffect } from 'react';
import { eventBus } from '../core/eventBus/EventBus';

export const useEventDebugger = (enabled: boolean = true) => {
  useEffect(() => {
    if (!enabled) return;

    const subscriptions: Array<{ eventName: string; subscriptionId: string }> = [
      // 手势事件
      {
        eventName: 'gesture:double_tap',
        subscriptionId: eventBus.subscribe('gesture:double_tap', (data) => {
          console.log('🎯 手势触发:', data);
        })
      },
      
      // 相机事件
      {
        eventName: 'camera:capture_start',
        subscriptionId: eventBus.subscribe('camera:capture_start', (data) => {
          console.log('📷 开始捕获图像:', data.sessionId);
        })
      },
      
      {
        eventName: 'camera:capture_complete',
        subscriptionId: eventBus.subscribe('camera:capture_complete', (data) => {
          console.log('📷 图像捕获完成:', data.sessionId);
        })
      },

      // 通信事件
      {
        eventName: 'communication:image_sent',
        subscriptionId: eventBus.subscribe('communication:image_sent', (data) => {
          console.log('📡 图像已发送:', data.sessionId);
        })
      },

      {
        eventName: 'communication:message_received',
        subscriptionId: eventBus.subscribe('communication:message_received', (data) => {
          console.log('📡 收到消息:', data.type, data.content?.substring(0, 50));
        })
      },

      // 状态事件
      {
        eventName: 'state:trigger_changed',
        subscriptionId: eventBus.subscribe('state:trigger_changed', (data) => {
          console.log('🔧 触发状态变更:', data.enabled);
        })
      },

      {
        eventName: 'state:processing_start',
        subscriptionId: eventBus.subscribe('state:processing_start', (data) => {
          console.log('🔧 开始处理:', data.sessionId);
        })
      },

      {
        eventName: 'state:processing_complete',
        subscriptionId: eventBus.subscribe('state:processing_complete', (data) => {
          console.log('🔧 处理完成:', data.sessionId);
        })
      }
    ];

    return () => {
      subscriptions.forEach(({ eventName, subscriptionId }) => {
        eventBus.unsubscribe(eventName as any, subscriptionId);
      });
    };
  }, [enabled]);
};
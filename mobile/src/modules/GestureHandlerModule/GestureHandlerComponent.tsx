/**
 * GestureHandlerModule React组件包装器
 * 位置：mobile/src/modules/GestureHandlerModule/GestureHandlerComponent.tsx
 */

import React from 'react';
import { View } from 'react-native';
import { LongPressGestureHandler } from 'react-native-gesture-handler';
import { gestureHandlerModule } from './GestureHandlerModule';

interface GestureHandlerComponentProps {
  children: React.ReactNode;
  enabled?: boolean;
}

/**
 * 手势处理组件（长按触发）
 * 注意：根节点的 GestureHandlerRootView 已放在 app/_layout.tsx 中
 */
export const GestureHandlerComponent: React.FC<GestureHandlerComponentProps> = ({
  children,
  enabled = true,
}) => {
  const handleLongPress = (event: any) => {
    if (enabled) {
      gestureHandlerModule.handleLongPress(event);
    }
  };

  return (
    <LongPressGestureHandler
      onHandlerStateChange={handleLongPress}
      minDurationMs={600}
      enabled={enabled}
    >
      <View style={{ flex: 1 }}>{children}</View>
    </LongPressGestureHandler>
  );
};
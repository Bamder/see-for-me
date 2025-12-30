import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

// 状态指示器组件，用于显示连接状态、处理状态等
export const StatusIndicator: React.FC = () => {
  return (
    <View style={styles.container}>
      <View style={styles.dot} />
      <Text style={styles.text}>就绪</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 50,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10B981',
    marginRight: 6,
  },
  text: {
    color: '#E5E7EB',
    fontSize: 12,
  },
});


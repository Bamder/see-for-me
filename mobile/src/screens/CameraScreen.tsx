import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

/**
 * 旧版相机页面（已废弃）
 * 
 * 为避免与当前架构产生多实例和重复启动，这个页面不再初始化任何模块。
 * 如需调试相机与通信，请使用 HomeScreen 作为入口。
 */
export default function CameraScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>
        该相机页面已废弃，请通过首页进行相机与通信调试。
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#020617',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24
  },
  text: {
    color: '#E5E7EB',
    fontSize: 16,
    textAlign: 'center'
  }
});
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

// 音频播放占位组件，后续可接入 expo-av 等库
export const AudioPlayer: React.FC = () => {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>Audio Player Placeholder</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#0F172A',
  },
  text: {
    color: '#E5E7EB',
  },
});



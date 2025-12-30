import React, { useRef, useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { CameraView, CameraType, useCameraPermissions } from 'expo-camera';

interface CameraPreviewProps {
  cameraRef?: React.RefObject<any>;
  onCameraReady?: (ref: React.RefObject<any>) => void;
}

// 相机预览组件 - 使用 expo-camera v17
export const CameraPreview: React.FC<CameraPreviewProps> = ({ cameraRef, onCameraReady }) => {
  const [permission, requestPermission] = useCameraPermissions();
  const internalCameraRef = useRef<any>(null);
  const actualCameraRef = cameraRef || internalCameraRef;

  useEffect(() => {
    // 如果提供了外部 ref，通知父组件相机已准备好
    if (onCameraReady && actualCameraRef.current) {
      onCameraReady(actualCameraRef);
    }
  }, [actualCameraRef, onCameraReady]);

  if (!permission) {
    // 权限状态未加载
    return (
      <View style={styles.container}>
        <Text style={styles.text}>正在检查权限...</Text>
      </View>
    );
  }

  if (!permission.granted) {
    // 权限未授予
    return (
      <View style={styles.container}>
        <Text style={styles.text}>需要相机权限</Text>
        <Text style={styles.hintText}>请允许应用访问相机</Text>
      </View>
    );
  }

  // 权限已授予，显示相机预览
  // expo-camera v17 使用 CameraView 组件
  return (
    <CameraView
      ref={actualCameraRef}
      style={styles.camera}
      facing="back"
    />
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#000',
  },
  camera: {
    flex: 1,
    width: '100%',
  },
  text: {
    color: '#fff',
    fontSize: 18,
    marginBottom: 10,
  },
  hintText: {
    color: '#999',
    fontSize: 14,
  },
});



// 相机服务封装
// 后续可在此封装 expo-camera 或 react-native-vision-camera 的操作

export interface CaptureResult {
  uri: string;
  width: number;
  height: number;
}

export interface CameraService {
  requestPermission: () => Promise<boolean>;
  capturePhoto: () => Promise<CaptureResult | null>;
}

// 占位实现，方便后续替换为真实设备实现
export const createCameraService = (): CameraService => {
  return {
    async requestPermission() {
      // TODO: 集成真实权限请求逻辑
      return true;
    },
    async capturePhoto() {
      // TODO: 集成真实拍照逻辑
      return null;
    },
  };
};



import { createCameraService } from '../services/camera';

// 相机操作 Hook，占位实现
export const useCamera = () => {
  const service = createCameraService();

  return {
    requestPermission: service.requestPermission,
    capturePhoto: service.capturePhoto,
  };
};



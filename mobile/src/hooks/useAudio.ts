import { createAudioService } from '../services/audio';

// 音频播放 Hook，占位实现
export const useAudio = () => {
  const service = createAudioService();

  return {
    playFromUrl: service.playFromUrl,
    stop: service.stop,
  };
};



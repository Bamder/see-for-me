// 音频播放服务封装
// 后续可在此封装 expo-av 或其他 TTS 播放方案

export interface AudioService {
  playFromUrl: (url: string) => Promise<void>;
  stop: () => Promise<void>;
}

// 占位实现，方便后续替换为真实播放逻辑
export const createAudioService = (): AudioService => {
  return {
    async playFromUrl(_url: string) {
      // TODO: 集成真实音频播放逻辑
    },
    async stop() {
      // TODO: 集成真实停止逻辑
    },
  };
};



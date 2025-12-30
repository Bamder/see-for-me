// 应用全局状态（例如当前连接状态、用户偏好等）
// 后续可以替换为 Zustand / Redux 等实现，这里先使用最简单的 React Context 或占位导出

export interface AppState {
  connected: boolean;
}

// 占位：实际项目中建议使用 Zustand/Redux 等进行实现
export const useAppStore = (): AppState => {
  return {
    connected: false,
  };
};



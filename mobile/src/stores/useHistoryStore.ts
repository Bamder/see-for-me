// 历史记录状态管理
// 后续可以改为 Zustand / Redux，此处提供最小占位接口

export interface HistoryItem {
  id: string;
  createdAt: string;
  summary: string;
}

export interface HistoryState {
  items: HistoryItem[];
}

export const useHistoryStore = (): HistoryState => {
  return {
    items: [],
  };
};



// 服务器配置状态（仅保存在内存中，适合“临时输入 IP”场景）
// 位置：mobile/src/stores/useServerConfigStore.ts

import { SERVER_HTTP_URL, SERVER_WS_URL, USE_MOCK_SERVER } from '../utils/constants';
import {
  clearServerConfig,
  loadServerConfig,
  saveServerConfig,
  StoredServerConfig
} from '../utils/serverConfigStorage';

export interface ServerConfigState {
  serverHttpUrl: string;
  serverWsUrl: string;
  useMockServer: boolean;
  setServerHttpUrl: (url: string) => void;
  setServerWsUrl: (url: string) => void;
  setUseMockServer: (value: boolean) => void;
  resetToDefaults: () => void;
}

let isHydrated = false;
let hydratePromise: Promise<void> | null = null;

/**
 * 简单的全局服务器配置（非持久化）
 * - 不依赖 Zustand，避免引入新的全局状态库
 * - 通过普通对象 + 订阅回调实现最小可用方案
 */

type Listener = (state: ServerConfigState) => void;

let state: ServerConfigState;
const listeners = new Set<Listener>();

function notify() {
  for (const listener of listeners) {
    listener(state);
  }
}

function updateState(partial: Partial<Omit<ServerConfigState, 'setServerHttpUrl' | 'setServerWsUrl' | 'setUseMockServer' | 'resetToDefaults'>>) {
  state = { ...state, ...partial };
  notify();
}

async function persistState(next: ServerConfigState): Promise<void> {
  const payload: StoredServerConfig = {
    serverHttpUrl: next.serverHttpUrl,
    serverWsUrl: next.serverWsUrl,
    useMockServer: next.useMockServer
  };
  await saveServerConfig(payload);
}

// 初始化状态
state = {
  serverHttpUrl: SERVER_HTTP_URL,
  serverWsUrl: SERVER_WS_URL,
  useMockServer: USE_MOCK_SERVER,
  setServerHttpUrl: (url: string) => {
    const next = { ...state, serverHttpUrl: url || SERVER_HTTP_URL };
    updateState({ serverHttpUrl: next.serverHttpUrl });
    persistState(next);
  },
  setServerWsUrl: (url: string) => {
    const next = { ...state, serverWsUrl: url || SERVER_WS_URL };
    updateState({ serverWsUrl: next.serverWsUrl });
    persistState(next);
  },
  setUseMockServer: (value: boolean) => {
    const next = { ...state, useMockServer: value };
    updateState({ useMockServer: next.useMockServer });
    persistState(next);
  },
  resetToDefaults: () => {
    const next = {
      serverHttpUrl: SERVER_HTTP_URL,
      serverWsUrl: SERVER_WS_URL,
      useMockServer: USE_MOCK_SERVER
    };
    updateState(next);
    clearServerConfig();
  }
};

async function hydrateFromStorage(): Promise<void> {
  if (isHydrated) return;
  const stored = await loadServerConfig();
  if (stored) {
    state.serverHttpUrl = stored.serverHttpUrl || SERVER_HTTP_URL;
    state.serverWsUrl = stored.serverWsUrl || SERVER_WS_URL;
    state.useMockServer = typeof stored.useMockServer === 'boolean' ? stored.useMockServer : USE_MOCK_SERVER;
    notify();
  }
  isHydrated = true;
}

/**
 * 对外暴露的异步初始化，确保使用前先尝试恢复持久化配置
 */
export function hydrateServerConfigStore(): Promise<void> {
  if (!hydratePromise) {
    hydratePromise = hydrateFromStorage().catch((error) => {
      console.warn('恢复服务器配置失败，使用默认值:', error);
    });
  }
  return hydratePromise;
}

/**
 * React hook：在组件中使用服务器配置，并在变更时自动刷新 UI
 */
export function useServerConfigStore(): ServerConfigState {
  const React = require('react');
  const { useSyncExternalStore } = React;

  const subscribe = (listener: Listener) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };

  const getSnapshot = () => state;

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/**
 * 非 React 环境下获取当前配置（例如在模块类中使用）
 */
export function getServerConfigState(): ServerConfigState {
  return state;
}



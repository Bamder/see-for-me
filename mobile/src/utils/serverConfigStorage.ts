import { SERVER_HTTP_URL, SERVER_WS_URL, USE_MOCK_SERVER } from './constants';

type StorageLike = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

// 兼容性加载：若未安装 AsyncStorage，退回内存方案，避免崩溃
let AsyncStorage: StorageLike | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  AsyncStorage = require('@react-native-async-storage/async-storage').default as StorageLike;
} catch {
  console.warn('AsyncStorage 未安装，使用内存存储作为回退，仅当前进程有效');
}

const memoryStore = new Map<string, string>();

async function getItem(key: string): Promise<string | null> {
  if (AsyncStorage) return AsyncStorage.getItem(key);
  return memoryStore.get(key) ?? null;
}

async function setItem(key: string, value: string): Promise<void> {
  if (AsyncStorage) return AsyncStorage.setItem(key, value);
  memoryStore.set(key, value);
}

async function removeItem(key: string): Promise<void> {
  if (AsyncStorage) return AsyncStorage.removeItem(key);
  memoryStore.delete(key);
}

const STORAGE_KEY = 'seeforme.serverConfig';

export interface StoredServerConfig {
  serverHttpUrl: string;
  serverWsUrl: string;
  useMockServer: boolean;
}

export async function loadServerConfig(): Promise<StoredServerConfig | null> {
  try {
    const raw = await getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return {
      serverHttpUrl: parsed.serverHttpUrl || SERVER_HTTP_URL,
      serverWsUrl: parsed.serverWsUrl || SERVER_WS_URL,
      useMockServer:
        typeof parsed.useMockServer === 'boolean'
          ? parsed.useMockServer
          : USE_MOCK_SERVER
    };
  } catch (error) {
    console.warn('读取服务器配置失败，使用默认值:', error);
    return null;
  }
}

export async function saveServerConfig(config: StoredServerConfig): Promise<void> {
  try {
    await setItem(STORAGE_KEY, JSON.stringify(config));
  } catch (error) {
    console.warn('保存服务器配置失败:', error);
  }
}

export async function clearServerConfig(): Promise<void> {
  try {
    await removeItem(STORAGE_KEY);
  } catch (error) {
    console.warn('清除服务器配置失败:', error);
  }
}


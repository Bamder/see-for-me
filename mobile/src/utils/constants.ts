// 应用内通用常量定义（集中管理服务器地址、端口、Mock 开关等）

const DEFAULT_HTTP_URL = 'http://localhost:8000';
const DEFAULT_WS_URL = 'ws://localhost:8000/ws';
const DEFAULT_API_BASE_PATH = '/api/v1';

/**
 * 验证URL格式是否正确
 */
function validateUrl(url: string, protocol: string): boolean {
  try {
    const urlObj = new URL(url);
    return urlObj.protocol === `${protocol}:`;
  } catch {
    return false;
  }
}

/**
 * 从 Expo 环境变量中读取服务器地址（真机调试时通过 .env 或启动脚本配置）
 * 注意：真机调试时不能使用 localhost，必须使用电脑的实际IP地址
 */
export const SERVER_HTTP_URL = (() => {
  const url = process.env.EXPO_PUBLIC_SERVER_URL || DEFAULT_HTTP_URL;
  
  // 在真机环境下，如果使用 localhost，给出警告
  // @ts-ignore - __DEV__ 是 React Native 的全局变量
  if (typeof __DEV__ !== 'undefined' && __DEV__ && url.includes('localhost')) {
    console.warn('⚠️ 警告：检测到使用 localhost 地址');
    console.warn('   在真机调试时，localhost 无法连接到电脑上的服务器');
    console.warn('   请使用电脑的实际IP地址，例如：http://192.168.1.100:8000');
    console.warn('   可以通过设置页面的 EXPO_PUBLIC_SERVER_URL 环境变量或启动脚本配置');
  }
  
  // 验证URL格式
  if (!validateUrl(url, 'http') && !validateUrl(url, 'https')) {
    console.error(`❌ 无效的 HTTP URL: ${url}，使用默认值: ${DEFAULT_HTTP_URL}`);
    return DEFAULT_HTTP_URL;
  }
  
  return url;
})();

export const SERVER_WS_URL = (() => {
  const url = process.env.EXPO_PUBLIC_WS_URL || DEFAULT_WS_URL;
  
  // 在真机环境下，如果使用 localhost，给出警告
  // @ts-ignore - __DEV__ 是 React Native 的全局变量
  if (typeof __DEV__ !== 'undefined' && __DEV__ && url.includes('localhost')) {
    console.warn('⚠️ 警告：检测到使用 localhost 地址');
    console.warn('   在真机调试时，localhost 无法连接到电脑上的服务器');
    console.warn('   请使用电脑的实际IP地址，例如：ws://192.168.1.100:8000/ws');
    console.warn('   可以通过设置页面的 EXPO_PUBLIC_WS_URL 环境变量或启动脚本配置');
  }
  
  // 验证URL格式
  if (!validateUrl(url, 'ws') && !validateUrl(url, 'wss')) {
    console.error(`❌ 无效的 WebSocket URL: ${url}，使用默认值: ${DEFAULT_WS_URL}`);
    return DEFAULT_WS_URL;
  }
  
  return url;
})();

export const API_BASE_PATH = DEFAULT_API_BASE_PATH;

// 解析出 IP 和端口（仅用于调试显示，不作为业务强依赖）
let host = 'localhost';
let port = '8000';

try {
  const url = new URL(SERVER_HTTP_URL);
  host = url.hostname || host;
  port = url.port || (url.protocol === 'https:' ? '443' : '80');
} catch {
  // 在某些运行环境中 URL 可能不可用，保持默认值即可
}

export const SERVER_HOST = host;
export const SERVER_PORT = port;

// 是否使用 MockServer 进行本地模拟（通过环境变量控制）
// EXPO_PUBLIC_USE_MOCK=1 时启用 Mock 模式
export const USE_MOCK_SERVER =
  process.env.EXPO_PUBLIC_USE_MOCK === '1' ||
  process.env.EXPO_PUBLIC_USE_MOCK === 'true';


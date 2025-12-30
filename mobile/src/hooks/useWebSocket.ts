import { useEffect, useRef, useState } from 'react';
import { WebSocketClient, WebSocketOptions } from '../services/api/websocket';
import { WS_BASE_URL } from '../utils/constants';

// WebSocket 通信 Hook，占位实现
export const useWebSocket = (path: string, options: WebSocketOptions = {}) => {
  const [connected, setConnected] = useState(false);
  const clientRef = useRef<WebSocketClient | null>(null);

  useEffect(() => {
    const url = `${WS_BASE_URL}${path}`;
    const client = new WebSocketClient(url, {
      ...options,
      onOpen: (event) => {
        setConnected(true);
        options.onOpen?.(event);
      },
      onClose: (event) => {
        setConnected(false);
        options.onClose?.(event);
      },
    });

    client.connect();
    clientRef.current = client;

    return () => {
      client.close();
      clientRef.current = null;
    };
  }, [path]);

  return {
    connected,
    send: (data: string) => clientRef.current?.send(data),
  };
};



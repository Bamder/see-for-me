// WebSocket 连接管理，用于与服务端进行实时通信

export interface WebSocketOptions {
  onOpen?: (event: WebSocketEventMap['open']) => void;
  onMessage?: (event: WebSocketEventMap['message']) => void;
  onError?: (event: WebSocketEventMap['error']) => void;
  onClose?: (event: WebSocketEventMap['close']) => void;
}

export class WebSocketClient {
  private socket: WebSocket | null = null;

  constructor(private url: string, private options: WebSocketOptions = {}) {}

  connect() {
    if (this.socket) return;

    const ws = new WebSocket(this.url);
    this.socket = ws;

    ws.onopen = (event) => {
      this.options.onOpen?.(event);
    };

    ws.onmessage = (event) => {
      this.options.onMessage?.(event);
    };

    ws.onerror = (event) => {
      this.options.onError?.(event);
    };

    ws.onclose = (event) => {
      this.socket = null;
      this.options.onClose?.(event);
    };
  }

  send(data: string | ArrayBufferLike | Blob | ArrayBufferView) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket is not connected');
    }
    this.socket.send(data);
  }

  close() {
    this.socket?.close();
    this.socket = null;
  }
}



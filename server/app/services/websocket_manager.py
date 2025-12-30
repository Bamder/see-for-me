"""WebSocket 连接管理占位模块。"""

from typing import Dict
from fastapi import WebSocket


class WebSocketManager:
    def __init__(self) -> None:
        self.active_connections: Dict[str, WebSocket] = {}

    async def connect(self, client_id: str, websocket: WebSocket) -> None:
        self.active_connections[client_id] = websocket

    async def disconnect(self, client_id: str) -> None:
        self.active_connections.pop(client_id, None)



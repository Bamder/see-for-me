"""主 WebSocket 端点 - 处理移动端连接。"""

import json
import logging
from typing import Optional
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from datetime import datetime

from ....services.websocket_manager import WebSocketManager

logger = logging.getLogger(__name__)
router = APIRouter()

# 全局 WebSocket 管理器实例
ws_manager = WebSocketManager()


@router.websocket("/ws")
async def main_ws_endpoint(websocket: WebSocket) -> None:
    """
    主 WebSocket 端点，处理移动端连接。
    
    支持的消息格式：
    - 客户端发送：{"eventType": "image_data", "data": {...}, "sessionId": "xxx"}
    - 服务器响应：{"eventType": "result", "data": {...}, "sessionId": "xxx"}
    """
    # 获取客户端信息
    client_host = websocket.client.host if websocket.client else "unknown"
    client_port = websocket.client.port if websocket.client else "unknown"
    
    # 接受 WebSocket 连接
    await websocket.accept()
    
    # 生成客户端 ID
    client_id = f"client_{datetime.now().timestamp()}"
    
    # 输出连接信息
    print("=" * 60)
    print(f"🔌 WebSocket 客户端连接建立")
    print(f"   客户端 ID: {client_id}")
    print(f"   来源地址: {client_host}:{client_port}")
    print(f"   连接时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"   端点路径: /ws")
    print("=" * 60)
    logger.info(f"WebSocket 客户端连接: {client_id} (来自 {client_host}:{client_port})")
    
    try:
        # 注册连接
        await ws_manager.connect(client_id, websocket)
        
        # 获取当前连接数
        active_connections = len(ws_manager.active_connections)
        
        print(f"✅ 连接已注册 | 当前活跃连接数: {active_connections}")
        logger.info(f"WebSocket 连接已注册: {client_id} | 当前活跃连接: {active_connections}")
        
        # 发送连接成功消息
        await websocket.send_json({
            "eventType": "connected",
            "data": {
                "clientId": client_id,
                "message": "WebSocket 连接成功",
                "activeConnections": active_connections
            },
            "timestamp": datetime.now().isoformat()
        })
        
        # 消息循环
        while True:
            # 接收消息
            data = await websocket.receive_text()
            
            try:
                message = json.loads(data)
                event_type = message.get("eventType", "unknown")
                print(f"📨 收到消息 [{client_id[:20]}...] | 类型: {event_type}")
                logger.info(f"收到消息 [{client_id}]: {event_type}")
                
                # 处理不同类型的消息
                if event_type == "ping" or event_type == "heartbeat":
                    # 心跳检测（支持 ping 和 heartbeat）
                    await websocket.send_json({
                        "eventType": "pong",
                        "data": {},
                        "timestamp": datetime.now().isoformat()
                    })
                
                elif event_type == "image_data" or event_type == "image_analysis":
                    # 图像数据处理（支持两种消息格式：image_data 和 image_analysis）
                    session_id = message.get("sessionId", message.get("data", {}).get("sessionId", "unknown"))
                    data_obj = message.get("data", {})
                    # 支持两种数据字段格式：data.image 和 data.imageData
                    image_data_base64 = data_obj.get("image") or data_obj.get("imageData", "")
                    
                    print(f"🖼️  收到图像数据 [{client_id[:20]}...] | 会话: {session_id}")
                    logger.info(f"收到图像数据 [{client_id}]: session={session_id}, eventType={event_type}")
                    
                    try:
                        # 导入视觉服务
                        from ....services.vision_service import VisionService
                        import base64
                        
                        # 创建视觉服务实例（可以优化为单例）
                        vision_service = VisionService()
                        
                        # 解码 base64 图像数据
                        if image_data_base64:
                            # 移除 data:image/...;base64, 前缀（如果有）
                            if ',' in image_data_base64:
                                image_data_base64 = image_data_base64.split(',')[1]
                            
                            image_bytes = base64.b64decode(image_data_base64)
                            
                            # 发送处理中消息
                            await websocket.send_json({
                                "eventType": "processing",
                                "data": {
                                    "message": "正在处理图像...",
                                    "sessionId": session_id
                                },
                                "timestamp": datetime.now().isoformat()
                            })
                            
                            # 流式处理图像
                            async for result in vision_service.process_image_stream(image_bytes, session_id):
                                result_type = result.get("type")
                                
                                if result_type == "text_stream":
                                    # 流式文本结果
                                    await websocket.send_json({
                                        "eventType": "text_stream",
                                        "data": {
                                            "content": result.get("content", ""),
                                            "is_final": result.get("is_final", False),
                                            "sessionId": session_id
                                        },
                                        "timestamp": datetime.now().isoformat()
                                    })
                                
                                elif result_type == "final_result":
                                    # 最终结果
                                    await websocket.send_json({
                                        "eventType": "final_result",
                                        "data": {
                                            "text": result.get("content", ""),
                                            "sessionId": session_id,
                                            "vision_time": result.get("vision_time", 0),
                                            "total_time": result.get("total_time", 0),
                                            "detection_count": result.get("detection_count", 0)
                                        },
                                        "timestamp": datetime.now().isoformat()
                                    })
                                
                                elif result_type == "error":
                                    # 错误结果
                                    await websocket.send_json({
                                        "eventType": "error",
                                        "data": {
                                            "message": result.get("content", "处理失败"),
                                            "sessionId": session_id
                                        },
                                        "timestamp": datetime.now().isoformat()
                                    })
                        else:
                            # 没有图像数据
                            await websocket.send_json({
                                "eventType": "error",
                                "data": {
                                    "message": "未提供图像数据",
                                    "sessionId": session_id
                                },
                                "timestamp": datetime.now().isoformat()
                            })
                    
                    except Exception as e:
                        logger.error(f"图像处理错误 [{client_id}]: {e}", exc_info=True)
                        await websocket.send_json({
                            "eventType": "error",
                            "data": {
                                "message": f"处理失败: {str(e)}",
                                "sessionId": session_id
                            },
                            "timestamp": datetime.now().isoformat()
                        })
                
                else:
                    # 未知消息类型
                    logger.warning(f"未知消息类型 [{client_id}]: {event_type}")
                    await websocket.send_json({
                        "eventType": "error",
                        "data": {
                            "message": f"未知的消息类型: {event_type}"
                        },
                        "timestamp": datetime.now().isoformat()
                    })
                    
            except json.JSONDecodeError:
                logger.error(f"无效的 JSON 消息 [{client_id}]: {data}")
                await websocket.send_json({
                    "eventType": "error",
                    "data": {
                        "message": "无效的 JSON 格式"
                    },
                    "timestamp": datetime.now().isoformat()
                })
                
    except WebSocketDisconnect:
        print("=" * 60)
        print(f"🔌 WebSocket 客户端断开连接")
        print(f"   客户端 ID: {client_id}")
        print(f"   断开时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        print("=" * 60)
        logger.info(f"WebSocket 客户端断开连接: {client_id}")
    except Exception as e:
        print(f"❌ WebSocket 错误 [{client_id[:20]}...]: {str(e)}")
        logger.error(f"WebSocket 错误 [{client_id}]: {str(e)}", exc_info=True)
    finally:
        # 清理连接
        await ws_manager.disconnect(client_id)
        active_connections = len(ws_manager.active_connections)
        print(f"🧹 连接已清理 | 剩余活跃连接数: {active_connections}")
        logger.info(f"WebSocket 连接已清理: {client_id} | 剩余活跃连接: {active_connections}")


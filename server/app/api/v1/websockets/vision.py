"""
视觉处理 WebSocket 端点
支持直接接收二进制图像数据流
"""

import logging
import base64
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from datetime import datetime

from ....services.vision_service import VisionService

logger = logging.getLogger(__name__)
router = APIRouter()

# 全局视觉服务实例（可以优化为单例）
vision_service = VisionService()


@router.websocket("/ws/vision/{session_id}")
async def vision_ws_endpoint(websocket: WebSocket, session_id: str) -> None:
    """
    视觉处理 WebSocket 端点
    
    支持两种数据格式：
    1. 二进制图像数据（直接发送）
    2. JSON 格式：{"image": "base64_encoded_image"}
    """
    # 获取客户端信息
    client_host = websocket.client.host if websocket.client else "unknown"
    client_port = websocket.client.port if websocket.client else "unknown"
    
    await websocket.accept()
    
    # 输出连接信息
    print("=" * 60)
    print(f"👁️  视觉处理 WebSocket 连接建立")
    print(f"   会话 ID: {session_id}")
    print(f"   来源地址: {client_host}:{client_port}")
    print(f"   连接时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"   端点路径: /ws/vision/{session_id}")
    print("=" * 60)
    logger.info(f"视觉 WebSocket 连接: session={session_id} (来自 {client_host}:{client_port})")
    
    try:
        while True:
            # 尝试接收二进制数据
            try:
                data = await websocket.receive_bytes()
                image_bytes = data
                image_size_kb = len(image_bytes) / 1024
                print(f"📸 收到二进制图像 [{session_id}] | 大小: {image_size_kb:.2f} KB")
                logger.info(f"收到二进制图像数据 [{session_id}]: {len(image_bytes)} bytes")
            except:
                # 如果不是二进制，尝试接收 JSON
                try:
                    message = await websocket.receive_json()
                    image_data_base64 = message.get("image", "")
                    
                    if not image_data_base64:
                        await websocket.send_json({
                            "type": "error",
                            "session_id": session_id,
                            "content": "未提供图像数据",
                            "timestamp": datetime.now().isoformat()
                        })
                        continue
                    
                    # 移除 data:image/...;base64, 前缀（如果有）
                    if ',' in image_data_base64:
                        image_data_base64 = image_data_base64.split(',')[1]
                    
                    image_bytes = base64.b64decode(image_data_base64)
                    image_size_kb = len(image_bytes) / 1024
                    print(f"📸 收到 JSON 图像数据 [{session_id}] | 大小: {image_size_kb:.2f} KB")
                    logger.info(f"收到 JSON 图像数据 [{session_id}]: {len(image_bytes)} bytes")
                except Exception as e:
                    logger.error(f"接收数据失败 [{session_id}]: {e}")
                    await websocket.send_json({
                        "type": "error",
                        "session_id": session_id,
                        "content": f"数据接收失败: {str(e)}",
                        "timestamp": datetime.now().isoformat()
                    })
                    continue
            
            # 流式处理图像
            try:
                async for result in vision_service.process_image_stream(image_bytes, session_id):
                    result_type = result.get("type")
                    
                    if result_type == "vision_result":
                        # 视觉检测结果（可选，用于调试）
                        await websocket.send_json({
                            "type": "vision_result",
                            "session_id": session_id,
                            "data": result.get("data", {}),
                            "timestamp": datetime.now().isoformat()
                        })
                    
                    elif result_type == "text_stream":
                        # 流式文本结果
                        await websocket.send_json({
                            "type": "text_stream",
                            "session_id": session_id,
                            "content": result.get("content", ""),
                            "is_final": result.get("is_final", False),
                            "timestamp": datetime.now().isoformat()
                        })
                    
                    elif result_type == "final_result":
                        # 最终结果
                        await websocket.send_json({
                            "type": "final_result",
                            "session_id": session_id,
                            "content": result.get("content", ""),
                            "vision_time": result.get("vision_time", 0),
                            "total_time": result.get("total_time", 0),
                            "detection_count": result.get("detection_count", 0),
                            "timestamp": datetime.now().isoformat()
                        })
                    
                    elif result_type == "error":
                        # 错误结果
                        await websocket.send_json({
                            "type": "error",
                            "session_id": session_id,
                            "content": result.get("content", "处理失败"),
                            "timestamp": datetime.now().isoformat()
                        })
            
            except Exception as e:
                logger.error(f"图像处理失败 [{session_id}]: {e}", exc_info=True)
                await websocket.send_json({
                    "type": "error",
                    "session_id": session_id,
                    "content": f"处理失败: {str(e)}",
                    "timestamp": datetime.now().isoformat()
                })
    
    except WebSocketDisconnect:
        print("=" * 60)
        print(f"👁️  视觉处理 WebSocket 断开连接")
        print(f"   会话 ID: {session_id}")
        print(f"   断开时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        print("=" * 60)
        logger.info(f"视觉 WebSocket 断开连接: session={session_id}")
    except Exception as e:
        print(f"❌ WebSocket 错误 [{session_id}]: {e}")
        logger.error(f"WebSocket 错误 [{session_id}]: {e}", exc_info=True)



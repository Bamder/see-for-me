"""
视觉处理服务层
整合视觉检测和语言生成流程，支持流式处理
"""

import logging
import asyncio
from typing import AsyncGenerator, Dict, Any, Optional

from .ai_models.pipelines.vision_to_text import VisionToTextPipeline

logger = logging.getLogger(__name__)


class VisionService:
    """视觉处理服务"""
    
    def __init__(self, pipeline: Optional[VisionToTextPipeline] = None):
        """
        初始化视觉服务
        
        Args:
            pipeline: 视觉到文本流水线实例，如果为 None 则自动创建
        """
        self.pipeline = pipeline or VisionToTextPipeline()
        logger.info("视觉服务初始化完成")
    
    async def process_image_stream(
        self,
        image_data: bytes,
        session_id: str
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """
        处理图像并流式返回结果
        
        Args:
            image_data: 图像字节数据
            session_id: 会话 ID
            
        Yields:
            处理结果字典
        """
        try:
            async for result in self.pipeline.process_image_stream(image_data, session_id):
                yield result
        except Exception as e:
            logger.error(f"图像处理失败 [{session_id}]: {e}", exc_info=True)
            yield {
                "type": "error",
                "session_id": session_id,
                "content": f"处理失败: {str(e)}",
                "timestamp": asyncio.get_event_loop().time()
            }
    
    async def describe_image(self, image_bytes: bytes) -> str:
        """
        处理图像并返回最终文本描述（同步接口，兼容旧代码）
        
        Args:
            image_bytes: 图像字节数据
            
        Returns:
            文本描述
        """
        session_id = f"sync_{asyncio.get_event_loop().time()}"
        final_result = None
        
        async for result in self.process_image_stream(image_bytes, session_id):
            if result.get("type") == "final_result":
                final_result = result.get("content", "处理失败")
        
        return final_result or "处理失败"



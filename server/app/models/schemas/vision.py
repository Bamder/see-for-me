"""视觉处理相关请求/响应模型占位。"""

from pydantic import BaseModel


class VisionRequest(BaseModel):
    image_base64: str


class VisionResponse(BaseModel):
    description: str



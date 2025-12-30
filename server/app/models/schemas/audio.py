"""音频处理相关请求/响应模型占位。"""

from pydantic import BaseModel


class TTSRequest(BaseModel):
    text: str


class TTSResponse(BaseModel):
    audio_base64: str



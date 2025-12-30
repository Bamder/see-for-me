"""BLIP-2 视觉模型适配器占位。"""

from .base_vision import BaseVisionModel


class Blip2Adapter(BaseVisionModel):
    async def describe(self, image_bytes: bytes) -> str:  # pragma: no cover - 占位
        # TODO: 集成实际 BLIP-2 推理逻辑
        return "BLIP-2 description placeholder"



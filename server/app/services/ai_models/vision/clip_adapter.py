"""CLIP 视觉模型适配器占位。"""

from .base_vision import BaseVisionModel


class ClipAdapter(BaseVisionModel):
    async def describe(self, image_bytes: bytes) -> str:  # pragma: no cover - 占位
        # TODO: 集成实际 CLIP 推理逻辑
        return "CLIP description placeholder"



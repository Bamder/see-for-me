"""VITS 适配器占位。"""

from .base_tts import BaseTTSModel


class VitsAdapter(BaseTTSModel):
    async def synthesize(self, text: str) -> bytes:  # pragma: no cover - 占位
        # TODO: 集成 VITS 推理逻辑
        return b"vits-audio-placeholder"



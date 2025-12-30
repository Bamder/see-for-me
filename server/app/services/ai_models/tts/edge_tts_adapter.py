"""Edge-TTS 适配器占位。"""

from .base_tts import BaseTTSModel


class EdgeTTSAdapter(BaseTTSModel):
    async def synthesize(self, text: str) -> bytes:  # pragma: no cover - 占位
        # TODO: 集成 Edge-TTS 调用逻辑
        return b"edge-tts-audio-placeholder"



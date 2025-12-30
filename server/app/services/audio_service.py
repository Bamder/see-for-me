"""音频处理服务层，占位实现。"""

from .ai_models.tts.base_tts import BaseTTSModel


class AudioService:
    def __init__(self, tts_model: BaseTTSModel) -> None:
        self._tts_model = tts_model

    async def synthesize(self, text: str) -> bytes:
        return await self._tts_model.synthesize(text)



"""TTS 模型基类占位。"""

from abc import ABC, abstractmethod
from typing import Any


class BaseTTSModel(ABC):
    """TTS 模型通用接口。"""

    @abstractmethod
    async def synthesize(self, text: str) -> Any:  # pragma: no cover - 占位
        raise NotImplementedError



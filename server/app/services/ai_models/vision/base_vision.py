"""视觉模型基类占位。"""

from abc import ABC, abstractmethod
from typing import Any


class BaseVisionModel(ABC):
    """视觉模型通用接口。"""

    @abstractmethod
    async def describe(self, image_bytes: bytes) -> Any:  # pragma: no cover - 占位
        raise NotImplementedError



"""AI 模型基类与接口定义占位。"""

from abc import ABC, abstractmethod
from typing import Any


class BaseModelAdapter(ABC):
    """所有模型适配器的基类。"""

    @abstractmethod
    async def run(self, *args: Any, **kwargs: Any) -> Any:  # pragma: no cover - 占位
        raise NotImplementedError



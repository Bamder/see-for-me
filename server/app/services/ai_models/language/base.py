"""语言模型基类"""

from abc import ABC, abstractmethod
from typing import List, Dict


class BaseLanguageModel(ABC):
    """语言模型通用接口"""
    
    @abstractmethod
    async def generate_description(self, detections: List[Dict]) -> str:
        """
        根据检测结果生成自然语言描述
        
        Args:
            detections: 视觉检测结果列表
            
        Returns:
            自然语言描述文本
        """
        raise NotImplementedError


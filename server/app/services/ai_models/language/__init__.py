"""语言模型适配器模块"""

from .qwen_adapter import QwenChatAdapter
from .template_adapter import TemplateLanguageAdapter

__all__ = ["QwenChatAdapter", "TemplateLanguageAdapter"]


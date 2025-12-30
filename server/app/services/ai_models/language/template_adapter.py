"""
纯模板语言适配器
仅使用 PromptWrapper 的回退模板生成描述，不调用外部/本地大模型。
"""

import logging
from typing import List, Dict, Optional

from .base import BaseLanguageModel
from .prompts import get_prompts_manager
from .prompt_wrapper import PromptWrapper

logger = logging.getLogger(__name__)


class TemplateLanguageAdapter(BaseLanguageModel):
    """只用模板生成描述的语言适配器，作为临时占位或降级策略。"""

    def __init__(
        self,
        prompts_dir: Optional[str] = None,
        prompts_scene: str = "vision_description",
        prompts_template: str = "default",
        class_mapping_file: Optional[str] = None,
        use_chinese: bool = True,
    ):
        self.prompts_manager = get_prompts_manager(prompts_dir)
        self.prompts_scene = prompts_scene
        self.prompts_template = prompts_template
        self.prompt_wrapper = PromptWrapper(
            prompts_manager=self.prompts_manager,
            prompts_scene=self.prompts_scene,
            prompts_template=self.prompts_template,
            class_mapping_file=class_mapping_file,
            use_chinese=use_chinese,
        )
        logger.info(
            f"TemplateLanguageAdapter 启用 (scene={self.prompts_scene}, template={self.prompts_template})"
        )

    async def generate_description(self, detections: List[Dict]) -> str:
        """直接使用回退模板生成描述"""
        return self.prompt_wrapper.fallback_template(detections)


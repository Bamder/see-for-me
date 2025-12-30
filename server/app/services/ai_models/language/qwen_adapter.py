"""
Qwen Chat 语言模型适配器（OpenAI 兼容接口）
适用于 Qwen 官方 DashScope 兼容端点或自建 vLLM/OpenAI-proxy。
"""

import logging
from typing import List, Dict, Optional

import requests

from .base import BaseLanguageModel
from .prompts import get_prompts_manager
from .prompt_wrapper import PromptWrapper

logger = logging.getLogger(__name__)


class QwenChatAdapter(BaseLanguageModel):
    """
    通过 OpenAI 兼容接口调用 Qwen Chat 系列模型。
    base_url 和 api_key 由调用方显式传入（通常来自 app.yaml 配置）。
    """

    def __init__(
        self,
        model_name: str = "qwen-plus",
        max_tokens: int = 200,
        temperature: float = 0.7,
        base_url: Optional[str] = None,
        api_key: Optional[str] = None,
        prompts_dir: Optional[str] = None,
        prompts_scene: str = "vision_description",
        prompts_template: str = "default",
        class_mapping_file: Optional[str] = None,
        use_chinese: bool = True,
        timeout: float = 12.0,
    ):
        self.model_name = model_name
        self.max_tokens = max_tokens
        self.temperature = temperature
        # 默认使用 DashScope 兼容端点，具体值由调用方传入（通常来自 app.yaml）
        self.base_url = base_url or "https://dashscope.aliyuncs.com/compatible-mode"
        self.api_key = api_key
        self.timeout = timeout

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

    async def generate_description(self, detections: List[Dict]) -> str:
        import time
        
        if not self.api_key:
            logger.warning("缺少 QWEN_API_KEY，使用模板回退")
            return self.prompt_wrapper.fallback_template(detections)

        prompt = self.prompt_wrapper.build_prompt(detections)
        logger.debug(f"语言模型 Prompt: {prompt[:200]}...")
        
        call_start_time = time.time()
        logger.info(f"开始调用 Qwen API: base_url={self.base_url}, model={self.model_name}, timeout={self.timeout}s")

        try:
            response_text = await self._call_api(prompt)
            call_duration = time.time() - call_start_time
            logger.info(f"Qwen API 调用成功，耗时 {call_duration:.2f}s")
            cleaned = self.prompt_wrapper.clean_response(response_text)
            logger.debug(f"清洗后输出: {cleaned[:200]}")
            if self.prompt_wrapper.looks_valid_response(cleaned):
                return cleaned
            logger.warning("Qwen 输出为空/无中文/疑似无效，使用模板回退")
        except Exception as e:
            call_duration = time.time() - call_start_time
            logger.error(f"Qwen 调用失败（耗时 {call_duration:.2f}s）: {e}", exc_info=True)

        return self.prompt_wrapper.fallback_template(detections)

    async def _call_api(self, prompt: str) -> str:
        import asyncio

        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, self._call_api_sync, prompt)

    def _call_api_sync(self, prompt: str) -> str:
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.api_key}",
        }
        payload = {
            "model": self.model_name,
            "messages": [
                {"role": "system", "content": "你是一个友好、简洁的中文描述助手。"},
                {"role": "user", "content": prompt},
            ],
            "max_tokens": self.max_tokens,
            "temperature": self.temperature,
        }

        url = f"{self.base_url.rstrip('/')}/v1/chat/completions"
        
        # 区分连接超时和读取超时
        # 连接超时：5秒（建立连接）
        # 读取超时：使用配置的 timeout（等待响应）
        # 对于本地 LLM，读取超时应该更长（20-30秒）
        connect_timeout = 5.0
        read_timeout = self.timeout
        
        # 如果 timeout 是单个值，requests 会同时用于连接和读取
        # 使用元组来分别设置连接和读取超时
        timeout_tuple = (connect_timeout, read_timeout)
        
        resp = requests.post(url, json=payload, headers=headers, timeout=timeout_tuple)
        resp.raise_for_status()
        data = resp.json()
        choice = data.get("choices", [{}])[0]
        message = choice.get("message") or {}
        content = message.get("content", "")
        return content or ""


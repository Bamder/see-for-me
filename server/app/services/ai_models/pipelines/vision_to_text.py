"""
视觉到文本的完整流程
整合视觉检测和语言生成，支持流式返回
"""

import asyncio
import os
import time
import logging
import contextlib
import random
from typing import AsyncGenerator, Dict, Any, List
import re

from ..vision.yolov8_adapter import YOLOv8nAdapter
from ..language.qwen_adapter import QwenChatAdapter
from ..language.template_adapter import TemplateLanguageAdapter
from ..language.base import BaseLanguageModel

logger = logging.getLogger(__name__)

# 延迟导入配置，避免循环依赖
def _get_settings():
    from app.core.config import settings
    return settings


class VisionToTextPipeline:
    """视觉到文本的完整处理流程"""
    
    def __init__(
        self,
        vision_model: YOLOv8nAdapter = None,
        language_model: BaseLanguageModel = None,
        prompts_scene: str = None,
        prompts_template: str = None
    ):
        """
        初始化流水线
        
        Args:
            vision_model: 视觉模型实例，如果为 None 则自动创建
            language_model: 语言模型实例，如果为 None 则自动创建
            prompts_scene: 提示词场景名称，如果为 None 则使用默认配置
            prompts_template: 提示词模板名称，如果为 None 则使用默认配置
        """
        # 先获取 settings，避免在定义前使用
        settings = _get_settings()
        
        self.vision_model = vision_model or YOLOv8nAdapter(
            model_path=settings.vision.YOLO_MODEL_PATH,
            use_onnx=settings.vision.YOLO_USE_ONNX,
            confidence_threshold=settings.vision.YOLO_CONFIDENCE_THRESHOLD,
            iou_threshold=settings.vision.YOLO_IOU_THRESHOLD,
        )
        if language_model:
            self.language_model = language_model
            self.language_source_base = (
                "template_default" if isinstance(language_model, TemplateLanguageAdapter) else "model"
            )
        else:
            # 根据 LANGUAGE_MODE 决定语言模型来源
            mode = getattr(settings.language, "MODE", "template").lower()
            logger.info(f"初始化语言模型，LANGUAGE_MODE={mode}")
            
            if mode == "template":
                # 纯模板模式，不依赖任何外部 LLM 服务
                self.language_model = TemplateLanguageAdapter(
                    prompts_scene=prompts_scene or settings.language.PROMPTS_SCENE,
                    prompts_template=prompts_template or settings.language.PROMPTS_TEMPLATE,
                    prompts_dir=settings.language.PROMPTS_DIR,
                )
                self.language_source_base = "template_default"
            elif mode == "qwen_local":
                # 本地 Qwen / OpenAI 兼容服务，完全由 app.yaml 配置提供
                base_url = settings.language.QWEN_BASE_URL
                api_key = settings.language.QWEN_API_KEY or "dummy"
                logger.info(f"使用本地 Qwen 模式: base_url={base_url}, model={settings.language.QWEN_MODEL_NAME}")
                # 使用配置的 RESPONSE_TIMEOUT 作为 API 调用超时
                # 本地 LLM 通常需要更长的响应时间（10-20秒）
                api_timeout = settings.language.RESPONSE_TIMEOUT
                self.language_model = QwenChatAdapter(
                    model_name=settings.language.QWEN_MODEL_NAME,
                    max_tokens=settings.language.QWEN_MAX_TOKENS,
                    temperature=settings.language.QWEN_TEMPERATURE,
                    base_url=base_url,
                    api_key=api_key,
                    prompts_scene=prompts_scene or settings.language.PROMPTS_SCENE,
                    prompts_template=prompts_template or settings.language.PROMPTS_TEMPLATE,
                    prompts_dir=settings.language.PROMPTS_DIR,
                    timeout=api_timeout,  # 使用配置的超时时间
                )
                self.language_source_base = "model_local"
            elif mode == "qwen_cloud":
                # 云端 Qwen，强制要求可用的 API Key，完全由 app.yaml 配置提供
                base_url = settings.language.QWEN_BASE_URL
                api_key = settings.language.QWEN_API_KEY
                if not api_key:
                    raise RuntimeError(
                        "LANGUAGE_MODE=qwen_cloud 但未配置 QWEN_API_KEY，请在 app.yaml.language.qwen_cloud.api_key 中设置。"
                    )
                logger.info(f"使用云端 Qwen 模式: base_url={base_url}, model={settings.language.QWEN_MODEL_NAME}")
                # 云端 API 通常响应更快，但也可以使用配置的超时时间
                api_timeout = settings.language.RESPONSE_TIMEOUT
                self.language_model = QwenChatAdapter(
                    model_name=settings.language.QWEN_MODEL_NAME,
                    max_tokens=settings.language.QWEN_MAX_TOKENS,
                    temperature=settings.language.QWEN_TEMPERATURE,
                    base_url=base_url,
                    api_key=api_key,
                    prompts_scene=prompts_scene or settings.language.PROMPTS_SCENE,
                    prompts_template=prompts_template or settings.language.PROMPTS_TEMPLATE,
                    prompts_dir=settings.language.PROMPTS_DIR,
                    timeout=api_timeout,  # 使用配置的超时时间
                )
                self.language_source_base = "model_cloud"
            else:
                logger.warning(f"未知的 LANGUAGE_MODE={mode}，回退到模板模式")
                self.language_model = TemplateLanguageAdapter(
                    prompts_scene=prompts_scene or settings.language.PROMPTS_SCENE,
                    prompts_template=prompts_template or settings.language.PROMPTS_TEMPLATE,
                    prompts_dir=settings.language.PROMPTS_DIR,
                )
                self.language_source_base = "template_default"
        
        logger.info("视觉到文本流水线初始化完成")
    
    async def process_image_stream(
        self,
        image_data: bytes,
        session_id: str
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """
        处理图像并流式返回文本结果
        
        Args:
            image_data: 图像字节数据
            session_id: 会话 ID
            
        Yields:
            处理结果字典，包含不同类型的结果
        """
        pipeline_start = time.time()
        
        try:
            # 1. 视觉检测
            logger.info(f"[{session_id}] 开始视觉检测")
            vision_start = time.time()
            
            vision_results = await self.vision_model.describe(image_data)
            vision_time = time.time() - vision_start
            
            detections = vision_results.get("detections", [])
            
            logger.info(
                f"[{session_id}] 视觉检测完成: {len(detections)} 个检测, "
                f"耗时 {vision_time:.3f}s"
            )
            if detections:
                logger.info(f"[{session_id}] 检测示例: {detections[:3]}")
            else:
                logger.info(f"[{session_id}] 无检测结果")
            
            # 返回视觉检测结果（可选，用于调试）
            yield {
                "type": "vision_result",
                "session_id": session_id,
                "data": {
                    "detections": detections,
                    "inference_time": vision_results.get("inference_time", vision_time),
                    "detection_count": len(detections)
                },
                "timestamp": time.time()
            }
            
            # 2. 语言生成（流式）
            language_time = 0.0
            if detections:
                logger.info(f"[{session_id}] 开始语言生成")
                print(f"[{session_id}] 开始语言生成，检测数: {len(detections)}")
                language_start = time.time()
                settings = _get_settings()
                initial_warn_delay = settings.language.RESPONSE_INITIAL_WARN_DELAY
                warn_threshold = settings.language.RESPONSE_WARN_THRESHOLD
                hard_timeout = settings.language.RESPONSE_TIMEOUT
                logger.debug(f"[{session_id}] 语言生成超时配置: initial_warn_delay={initial_warn_delay}s, warn_threshold={warn_threshold}s, hard_timeout={hard_timeout}s")
                print(f"[{session_id}] 语言生成超时配置: initial_warn_delay={initial_warn_delay}s, warn_threshold={warn_threshold}s, hard_timeout={hard_timeout}s")
                
                warn_sent = False
                description = None
                language_source = self.language_source_base
                
                # 先创建生成任务
                gen_task = asyncio.create_task(self.language_model.generate_description(detections))
                
                # 延迟发送第一次"稍等"提示（如果在此时间内完成则不发送）
                last_warn_time = time.time()
                initial_warn_sent = False
                
                # 循环等待，定期发送提示，直至完成或超时
                elapsed = 0.0
                # interval 是每次检查的间隔（固定较小值，用于频繁检查任务状态）
                # warn_threshold 是两次提示之间的最小间隔（从配置读取，用于控制提示频率）
                interval = 0.8  # 每次检查间隔（秒），固定较小值以快速响应任务完成
                min_warn_interval = warn_threshold  # 两次"稍等"消息之间的最小间隔（秒），从配置读取
                
                # 使用循环检查任务状态，而不是 asyncio.wait_for（它会自动取消任务）
                while True:
                    # 检查任务是否已完成
                    if gen_task.done():
                        try:
                            # 任务已完成，获取结果
                            description = await gen_task
                            elapsed = time.time() - language_start
                            break
                        except Exception as e:
                            # 任务执行出错，使用模板回退
                            logger.error(f"[{session_id}] 语言生成任务执行失败: {e}", exc_info=True)
                            if hasattr(self.language_model, 'prompt_wrapper'):
                                description = self.language_model.prompt_wrapper.fallback_template(detections)
                            else:
                                from ..language.template_adapter import TemplateLanguageAdapter
                                temp_adapter = TemplateLanguageAdapter()
                                description = await temp_adapter.generate_description(detections)
                            language_source = "template_fallback"
                            elapsed = time.time() - language_start
                            break
                    
                    # 计算已等待时间
                    elapsed = time.time() - language_start
                    
                    # 检查是否超过硬超时
                    if elapsed >= hard_timeout:
                        logger.warning(f"[{session_id}] 语言生成超过硬超时 {hard_timeout}s，使用模板回退")
                        print(f"[{session_id}] 语言生成超过硬超时 {hard_timeout}s（实际等待 {elapsed:.2f}s），使用模板回退")
                        # 使用统一的回退方法（通过 prompt_wrapper）
                        if hasattr(self.language_model, 'prompt_wrapper'):
                            description = self.language_model.prompt_wrapper.fallback_template(detections)
                        else:
                            # 如果语言模型没有 prompt_wrapper，创建一个临时模板适配器
                            from ..language.template_adapter import TemplateLanguageAdapter
                            temp_adapter = TemplateLanguageAdapter()
                            description = await temp_adapter.generate_description(detections)
                        language_source = "template_fallback"
                        # 取消任务
                        gen_task.cancel()
                        with contextlib.suppress(asyncio.CancelledError):
                            await gen_task
                        break
                    
                    # 如果还没发送第一次提示，且已超过初始延迟，则发送提示
                    if not initial_warn_sent and elapsed >= initial_warn_delay:
                        initial_warn_sent = True
                        warn_sent = True
                        last_warn_time = time.time()
                        logger.debug(f"[{session_id}] 延迟 {elapsed:.2f}s 后发送第一次'稍等'提示")
                        print(f"[{session_id}] 延迟 {elapsed:.2f}s 后发送第一次'稍等'提示")
                        yield {
                            "type": "text_stream",
                            "session_id": session_id,
                            "content": random.choice(["我在观察，请稍微等我一下…", "好的，我马上观察一下…", "我观察一下，马上告诉你…"]),
                            "is_final": False,
                            "timestamp": time.time()
                        }
                    
                    # 周期性发送等待提示（仅在距离上次提示超过最小间隔时发送）
                    current_time = time.time()
                    if initial_warn_sent and current_time - last_warn_time >= min_warn_interval:
                        wait_msg = random.choice(["请再等等，我正在组织语言…", "请等待，我在思考如何描述场景…", "请让我再确认一下细节…"])
                        yield {
                            "type": "text_stream",
                            "session_id": session_id,
                            "content": wait_msg,
                            "is_final": False,
                            "timestamp": current_time
                        }
                        last_warn_time = current_time
                        warn_sent = True
                        logger.debug(f"[{session_id}] 已等待 {elapsed:.1f}s，发送后续'稍等'提示（距离上次提示 {min_warn_interval:.1f}s）")
                        print(f"[{session_id}] 已等待 {elapsed:.1f}s，继续生成中")
                    
                    # 等待一小段时间后再次检查任务状态
                    logger.debug(f"[{session_id}] 语言生成等待中，已等待 {elapsed:.2f}s / {hard_timeout}s")
                    await asyncio.sleep(interval)
                
                language_time = time.time() - language_start
                
                logger.info(
                    f"[{session_id}] 语言生成完成: {description[:80]}... "
                    f"(耗时 {language_time:.3f}s, warn_sent={warn_sent}, source={language_source})"
                )
                print(
                    f"[{session_id}] 语言生成完成，耗时 {language_time:.3f}s，内容预览: {description[:80]}..., "
                    f"source={language_source}"
                )
                
                # 按句子拆分进行流式返回
                sentences = self._split_into_sentences(description)
                
                for i, sentence in enumerate(sentences):
                    if sentence.strip():
                        is_final = i == len(sentences) - 1
                        
                        yield {
                            "type": "text_stream",
                            "session_id": session_id,
                            "content": sentence,
                            "is_final": is_final,
                            "source": language_source,
                            "timestamp": time.time()
                        }
                        
                        # 控制推送间隔，模拟流式效果
                        if not is_final:
                            await asyncio.sleep(0.05)
                
                final_content = description
            else:
                final_content = "图像识别完成，未发现显著物体。"
                logger.info(f"[{session_id}] 未检测到物体")
                print(f"[{session_id}] 未检测到物体，跳过语言生成")
                language_source = self.language_source_base
            
            # 3. 最终结果
            total_time = time.time() - pipeline_start
            
            yield {
                "type": "final_result",
                "session_id": session_id,
                "content": final_content,
                "vision_time": vision_time,
                "language_time": language_time,
                "total_time": total_time,
                "detection_count": len(detections),
                "source": language_source,
                "timestamp": time.time()
            }
            
            logger.info(
                f"[{session_id}] 流水线处理完成，总耗时 {total_time:.3f}s"
            )
            
        except Exception as e:
            logger.error(f"[{session_id}] 流水线处理失败: {e}", exc_info=True)
            
            # 返回面向前端的结构化错误，避免暴露后端细节
            yield {
                "type": "error",
                "session_id": session_id,
                "code": "LANGUAGE_PIPELINE_FAILURE",
                "content": "描述生成遇到问题，已终止本次处理，请稍后重试。",
                "timestamp": time.time()
            }
    
    def _split_into_sentences(self, text: str) -> List[str]:
        """
        将文本按句子拆分
        
        Args:
            text: 输入文本
            
        Returns:
            句子列表
        """
        # 中文句子分割：按句号、感叹号、问号分割
        sentences = re.split(r'[。！？.!?]', text)
        
        # 清理和过滤
        sentences = [s.strip() for s in sentences if s.strip()]
        
        # 如果分割后为空，返回原文本
        if not sentences:
            sentences = [text]
        
        return sentences


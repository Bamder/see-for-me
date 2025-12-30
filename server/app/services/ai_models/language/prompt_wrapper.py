import logging
import re
from pathlib import Path
from typing import Dict, List, Optional

import yaml

logger = logging.getLogger(__name__)


class PromptWrapper:
    """封装提示词构建、类别翻译、输出清洗与回退模板的通用逻辑。"""

    def __init__(
        self,
        prompts_manager,
        prompts_scene: str = "vision_description",
        prompts_template: str = "default",
        class_mapping_file: Optional[str] = None,
        use_chinese: bool = True,
    ):
        self.prompts_manager = prompts_manager
        self.prompts_scene = prompts_scene
        self.prompts_template = prompts_template
        self.class_mapping_file = class_mapping_file
        self.use_chinese = use_chinese
        self.class_mapping: Dict[str, str] = {}
        self.mapping_defaults: Dict[str, str] = {}
        self._load_class_mapping()

    # ========= 类别处理 =========
    def _load_class_mapping(self):
        """加载中英文类别映射，供回退模板翻译使用"""
        try:
            if self.class_mapping_file:
                mapping_path = Path(self.class_mapping_file)
            else:
                current_file = Path(__file__).resolve()
                mapping_path = None
                for parent in current_file.parents:
                    candidate = parent / "config" / "coco_classes_zh_en.yaml"
                    if candidate.exists():
                        mapping_path = candidate
                        break
                    if (parent / "app").exists() and (parent / "requirements.txt").exists():
                        mapping_path = candidate
                        break
                if mapping_path is None:
                    mapping_path = current_file.parent.parent.parent.parent / "config" / "coco_classes_zh_en.yaml"

            if mapping_path.exists():
                with open(mapping_path, "r", encoding="utf-8") as f:
                    config = yaml.safe_load(f)
                    self.class_mapping = config.get("mapping", {})
                    self.mapping_defaults = config.get("defaults", {})
                logger.info(f"语言模型加载中英文映射成功: {mapping_path}，共 {len(self.class_mapping)} 条")
            else:
                logger.warning(f"语言模型未找到中英文映射文件: {mapping_path}，将直接使用原始类别名称")
                self.class_mapping = {}
                self.mapping_defaults = {}
        except Exception as e:
            logger.warning(f"语言模型加载中英文映射失败: {e}，将直接使用原始类别名称")
            self.class_mapping = {}
            self.mapping_defaults = {}

    def translate_class_name(self, english_name: str) -> str:
        """将英文类别名转换为中文，找不到映射则使用回退格式"""
        if not self.use_chinese:
            return english_name
        if not english_name:
            return self.mapping_defaults.get("unknown_zh", "未知物体")

        # 如果输入已经是中文或包含中文，直接返回，避免重复加“未知物体”
        if any("\u4e00" <= ch <= "\u9fff" for ch in english_name):
            return english_name

        chinese_name = self.class_mapping.get(english_name)
        if chinese_name:
            return chinese_name

        fallback_format = self.mapping_defaults.get("fallback_format", "{en}")
        return fallback_format.format(en=english_name, zh=self.mapping_defaults.get("unknown_zh", "未知"))

    def get_display_name(self, det: Dict) -> str:
        """
        优先使用视觉模块已提供的中文名称，避免重复翻译。
        退化顺序：class(中文优先) -> class_en -> '未知物体'
        """
        name_cn = det.get("class")
        if name_cn and name_cn.strip():
            return name_cn
        name_en = det.get("class_en")
        if name_en and name_en.strip():
            return name_en
        return "未知物体"

    # ========= 提示词构建与回退 =========
    def build_prompt(self, detections: List[Dict]) -> str:
        """构建给语言模型的提示词"""
        if not detections:
            no_detection_prompt = self.prompts_manager.get_prompt(
                self.prompts_scene,
                "no_detection"
            )
            if no_detection_prompt:
                return no_detection_prompt
            return "目前没有检测到明显的物体。这可能是一个比较空旷的场景，或者物体距离较远。请稍后再试，或者告诉我你想了解的场景，我会尽力帮助你。"

        sorted_detections = sorted(
            detections,
            key=lambda x: x.get("confidence", 0),
            reverse=True
        )[:5]

        objects = []
        objects_with_confidence = []
        positions = []
        objects_with_positions = []
        for det in sorted_detections:
            obj_name = self.get_display_name(det)
            confidence = det.get("confidence", 0)
            bbox = det.get("bbox")
            objects.append(obj_name)
            objects_with_confidence.append(f"{obj_name}({confidence:.0%})")
            if bbox and isinstance(bbox, (list, tuple)) and len(bbox) == 4:
                x1, y1, x2, y2 = bbox
                bbox_str = f"[{x1:.0f}, {y1:.0f}, {x2:.0f}, {y2:.0f}]"
                positions.append(f"{obj_name}: {bbox_str}")
                objects_with_positions.append(f"{obj_name}{bbox_str}")
            else:
                objects_with_positions.append(obj_name)

        objects_str = "、".join(objects)
        objects_with_confidence_str = "、".join(objects_with_confidence)
        positions_str = "；".join(positions) if positions else "无位置信息"
        objects_with_positions_str = "；".join(objects_with_positions) if objects_with_positions else "无物体信息"

        prompt = self.prompts_manager.format_prompt(
            scene=self.prompts_scene,
            template_name=self.prompts_template,
            objects=objects_str,
            objects_with_confidence=objects_with_confidence_str,
            object_count=len(detections),
            positions=positions_str,
            objects_with_positions=objects_with_positions_str
        )

        if not prompt:
            logger.warning(
                f"未找到提示词模板 (scene={self.prompts_scene}, "
                f"template={self.prompts_template})，使用默认模板"
            )
            prompt = (
                f"请用温暖、友好、有人情味的中文描述这张图片，就像在向一位视障朋友介绍你看到的世界："
                f"图片中有{objects_str}。请用自然流畅的语言，帮助用户理解场景，描述要具体生动，适合语音播报。"
            )

        return prompt

    def fallback_template(self, detections: List[Dict]) -> str:
        """超时时或生成失败时的回退模板"""
        if not detections:
            no_detection_prompt = self.prompts_manager.get_prompt(
                self.prompts_scene,
                "no_detection"
            )
            if no_detection_prompt:
                return no_detection_prompt
            return "目前没有检测到明显的物体。这可能是一个比较空旷的场景，或者物体距离较远。请稍后再试。"

        sorted_detections = sorted(
            detections,
            key=lambda x: x.get("confidence", 0),
            reverse=True
        )[:3]

        counted_objects: Dict[str, int] = {}
        for det in sorted_detections:
            raw_name = det.get("class") or det.get("class_en") or "未知物体"
            obj_name_cn = self.translate_class_name(raw_name)
            counted_objects[obj_name_cn] = counted_objects.get(obj_name_cn, 0) + 1

        objects = []
        for name, count in counted_objects.items():
            prefix = f"{count}个" if count > 1 else "一个"
            objects.append(f"{prefix}{name}")

        if len(objects) == 0:
            return "目前没有检测到明显的物体。这可能是一个比较空旷的场景，或者物体距离较远。请稍后再试。"
        elif len(objects) == 1:
            return f"我看到图片中有一个{objects[0]}。"
        elif len(objects) == 2:
            return f"我看到图片中有{objects[0]}和{objects[1]}。"
        else:
            return f"我看到图片中有{objects[0]}、{objects[1]}和{objects[2]}等物体。"

    # ========= 输出清洗与校验 =========
    @staticmethod
    def clean_response(text: str) -> str:
        """清理响应文本"""
        text = re.sub(r"\s+", " ", text or "")
        text = text.strip()
        if text and not text.endswith(("。", "！", "？", ".", "!", "?")):
            text += "。"
        return text

    @staticmethod
    def looks_valid_response(text: str) -> bool:
        """简单质量检查：需有中文字符且长度>2"""
        if not text:
            return False
        stripped = text.strip().strip("。.!?？！，,;；:-")
        if len(stripped) < 2:
            return False
        return any("\u4e00" <= ch <= "\u9fff" for ch in stripped)


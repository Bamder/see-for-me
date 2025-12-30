"""应用配置管理"""

from pydantic_settings import BaseSettings
from pydantic import BaseModel
from typing import Optional
from pathlib import Path
import yaml
import logging

logger = logging.getLogger(__name__)


class VisionConfig(BaseModel):
    """视觉模型配置"""
    # YOLOv8配置
    YOLO_MODEL_PATH: str = "models/yolov8n.onnx"
    YOLO_USE_ONNX: bool = True
    YOLO_CONFIDENCE_THRESHOLD: float = 0.25
    YOLO_IOU_THRESHOLD: float = 0.45
    
    # 性能配置（不通过环境变量，而是统一由 app.yaml / 代码显式传入）
    MAX_CONCURRENT_REQUESTS: int = 10
    MODEL_WARMUP: bool = True  # 启动时预热模型


class LanguageConfig(BaseSettings):
    """语言模型配置"""
    # 语言模式：template | qwen_local | qwen_cloud
    MODE: str = "template"

    # Qwen / OpenAI 兼容接口（用于本地/云端统一配置）
    QWEN_BASE_URL: Optional[str] = "http://localhost:8000"
    QWEN_API_KEY: Optional[str] = ""
    QWEN_MODEL_NAME: str = "Qwen2.5-7B-Instruct"
    QWEN_MAX_TOKENS: int = 200
    QWEN_TEMPERATURE: float = 0.7

    # 超时与告警阈值（用于流水线控制语言生成等待时间）
    RESPONSE_INITIAL_WARN_DELAY: float = 1.0  # 从开始到第一次「稍等」提示的延迟（秒），如果在此时间内完成则不发送
    RESPONSE_WARN_THRESHOLD: float = 2.0      # 触发「稍等」提示的间隔下限（秒），两次提示之间的最小间隔
    RESPONSE_TIMEOUT: float = 20.0            # 语言生成的硬超时时间（秒），本地 LLM 通常需要 10-20 秒

    # 提示词配置
    PROMPTS_DIR: Optional[str] = None  # 提示词目录，None 表示使用默认目录（server/prompts/）
    PROMPTS_SCENE: str = "vision_description"  # 默认使用的提示词场景
    PROMPTS_TEMPLATE: str = "default"  # 默认使用的提示词模板

    class Config:
        # 对语言配置，不再通过环境变量注入，统一由 app.yaml / 代码显式传入
        env_prefix = "DISABLED_LANGUAGE_"
        case_sensitive = False


def _load_yaml_config() -> dict:
    """从 YAML 文件加载配置"""
    try:
        # 查找配置文件路径
        current_file = Path(__file__).resolve()
        # 从 app/core/config.py 回到 server 目录
        server_root = current_file.parent.parent.parent
        config_file = server_root / "config" / "app.yaml"
        
        if config_file.exists():
            with open(config_file, 'r', encoding='utf-8') as f:
                config = yaml.safe_load(f) or {}
            logger.info(f"成功加载配置文件: {config_file}")
            return config
        else:
            logger.debug(f"配置文件不存在: {config_file}，使用默认配置")
            return {}
    except Exception as e:
        logger.warning(f"加载 YAML 配置失败: {e}，使用默认配置")
        return {}


def _merge_yaml_to_env(yaml_config: dict, prefix: str = "") -> dict:
    """
    将 YAML 配置扁平化为环境变量格式
    
    Args:
        yaml_config: YAML 配置字典
        prefix: 前缀（用于嵌套配置）
    
    Returns:
        扁平化的配置字典
    """
    result = {}
    for key, value in yaml_config.items():
        env_key = f"{prefix}_{key}" if prefix else key
        if isinstance(value, dict):
            result.update(_merge_yaml_to_env(value, env_key))
        else:
            # 转换为环境变量格式（大写，下划线分隔）
            result[env_key.upper()] = value
    return result


def _apply_yaml_config(yaml_config: dict):
    """将 YAML 配置应用到环境变量（如果环境变量不存在）

    当前仅用于服务器基础配置（HOST / PORT / RELOAD）：
    - 视觉与语言相关配置不再通过环境变量注入，而是由 app.yaml / 代码显式解析，
      以保证配置集中、可版本管理。
    """
    import os
    
    # 处理服务器配置
    if "server" in yaml_config:
        server_config = yaml_config["server"]
        os.environ.setdefault("HOST", str(server_config.get("host", "0.0.0.0")))
        os.environ.setdefault("PORT", str(server_config.get("port", 8000)))
        os.environ.setdefault("RELOAD", str(server_config.get("reload", False)).lower())

    # 视觉与语言配置不再通过环境变量注入，由 app.yaml / 代码显式解析


class Settings(BaseSettings):
    """应用主配置"""
    app_name: str = "SeeForMe Server"
    
    # 视觉配置
    vision: VisionConfig = VisionConfig()
    
    # 语言配置
    language: LanguageConfig = LanguageConfig()
    
    # 服务器配置
    host: str = "0.0.0.0"
    port: int = 8000
    reload: bool = False
    
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
    
    def __init__(self, **kwargs):
        # 先加载 YAML 配置并应用到环境变量（作为默认值，仅用于服务器基础配置）
        yaml_config = _load_yaml_config()
        if yaml_config:
            _apply_yaml_config(yaml_config)

        # 调用父类初始化，环境变量优先级高于 YAML（仅服务器配置）
        super().__init__(**kwargs)

        # 视觉配置：不再通过环境变量注入，而是直接从 app.yaml 显式解析
        vis_cfg = (yaml_config or {}).get("vision", {})
        if vis_cfg:
            yolo_cfg = vis_cfg.get("yolo", {}) or {}

            self.vision = VisionConfig(
                YOLO_MODEL_PATH=str(yolo_cfg.get("model_path", "models/yolov8n.onnx")),
                YOLO_USE_ONNX=bool(yolo_cfg.get("use_onnx", True)),
                YOLO_CONFIDENCE_THRESHOLD=float(
                    yolo_cfg.get("confidence_threshold", 0.25)
                ),
                YOLO_IOU_THRESHOLD=float(yolo_cfg.get("iou_threshold", 0.45)),
                MAX_CONCURRENT_REQUESTS=int(
                    vis_cfg.get("max_concurrent_requests", 10)
                ),
                MODEL_WARMUP=bool(vis_cfg.get("model_warmup", True)),
            )

        # 语言配置：不再通过环境变量注入，而是直接从 app.yaml 显式解析
        # 注意：仅在 qwen_cloud 模式下，才使用环境变量 QWEN_API_KEY 覆盖云端 api_key
        lang_cfg = (yaml_config or {}).get("language", {})
        if lang_cfg:
            mode = str(lang_cfg.get("mode", "template"))

            q_local = lang_cfg.get("qwen_local", {}) or {}
            q_cloud = lang_cfg.get("qwen_cloud", {}) or {}

            prompts_cfg = lang_cfg.get("prompts", {}) or {}

            # api_key 优先级（仅在 qwen_cloud 模式下启用环境变量覆盖）：
            #   1. QWEN_API_KEY 环境变量（仅 mode == qwen_cloud 时）
            #   2. app.yaml.language.qwen_cloud.api_key
            #   3. app.yaml.language.qwen_local.api_key（本地占位，方便调试）
            #   4. 默认为空字符串
            import os

            api_key_from_env = os.getenv("QWEN_API_KEY") if mode == "qwen_cloud" else None

            self.language = LanguageConfig(
                MODE=mode,
                QWEN_BASE_URL=str(
                    q_local.get("base_url")
                    or q_cloud.get("base_url")
                    or "http://localhost:8000"
                ),
                QWEN_API_KEY=str(
                    api_key_from_env
                    or q_cloud.get("api_key")
                    or q_local.get("api_key")
                    or ""
                ),
                QWEN_MODEL_NAME=str(
                    q_local.get("model_name")
                    or q_cloud.get("model_name")
                    or "Qwen2.5-7B-Instruct"
                ),
                QWEN_MAX_TOKENS=int(
                    q_local.get("max_tokens")
                    or q_cloud.get("max_tokens")
                    or 200
                ),
                QWEN_TEMPERATURE=float(
                    q_local.get("temperature")
                    or q_cloud.get("temperature")
                    or 0.7
                ),
                RESPONSE_INITIAL_WARN_DELAY=float(
                    lang_cfg.get("response_initial_warn_delay", 1.0)
                ),
                RESPONSE_WARN_THRESHOLD=float(
                    lang_cfg.get("response_warn_threshold", 2.0)
                ),
                RESPONSE_TIMEOUT=float(
                    lang_cfg.get("response_timeout", 20.0)
                ),
                PROMPTS_DIR=str(prompts_cfg.get("dir")) if prompts_cfg.get("dir") is not None else None,
                PROMPTS_SCENE=str(prompts_cfg.get("scene", "vision_description")),
                PROMPTS_TEMPLATE=str(prompts_cfg.get("template", "default")),
            )


settings = Settings()



"""
提示词管理器
统一管理和加载不同场景的提示词配置
"""

import os
import logging
from typing import Dict, Optional
from pathlib import Path

try:
    import yaml
    YAML_AVAILABLE = True
except ImportError:
    YAML_AVAILABLE = False

logger = logging.getLogger(__name__)

if not YAML_AVAILABLE:
    logger.warning("PyYAML not available, prompts will use fallback")


class PromptsManager:
    """提示词管理器，负责加载和管理不同场景的提示词"""
    
    def __init__(self, prompts_dir: Optional[str] = None):
        """
        初始化提示词管理器
        
        Args:
            prompts_dir: 提示词配置文件目录，如果为 None 则使用默认目录（server/prompts/）
        """
        # 确定提示词目录
        if prompts_dir:
            self.prompts_dir = Path(prompts_dir)
        else:
            # 默认目录：server 项目根目录下的 prompts 目录
            # 从当前文件位置向上查找 server 根目录
            current_file = Path(__file__).resolve()
            server_root = current_file.parent
            
            # 向上查找，直到找到包含 app/ 目录和 requirements.txt 的 server 根目录
            max_depth = 10  # 防止无限循环
            depth = 0
            while depth < max_depth:
                if (server_root / "app").exists() and (server_root / "requirements.txt").exists():
                    break
                parent = server_root.parent
                if parent == server_root:  # 已到达文件系统根目录
                    break
                server_root = parent
                depth += 1
            
            # prompts 目录在 server 根目录下
            self.prompts_dir = server_root / "prompts"
            
            # 如果 prompts 目录不存在，尝试创建
            if not self.prompts_dir.exists():
                logger.info(f"提示词目录不存在，将创建: {self.prompts_dir}")
                try:
                    self.prompts_dir.mkdir(parents=True, exist_ok=True)
                    logger.info(f"提示词目录已创建: {self.prompts_dir}")
                except Exception as e:
                    logger.error(f"创建提示词目录失败: {e}")
                    # 回退到当前文件所在目录
                    self.prompts_dir = Path(__file__).parent
                    logger.warning(f"使用回退目录: {self.prompts_dir}")
        
        self.prompts_cache: Dict[str, Dict] = {}
        self._load_all_prompts()
    
    def _load_all_prompts(self):
        """加载所有提示词配置文件"""
        if not YAML_AVAILABLE:
            logger.error("PyYAML 未安装，无法加载提示词配置文件")
            return
        
        try:
            # 查找所有 YAML 配置文件
            yaml_files = list(self.prompts_dir.glob("*.yaml")) + list(self.prompts_dir.glob("*.yml"))
            
            for yaml_file in yaml_files:
                if yaml_file.name.startswith("_"):
                    continue  # 跳过以 _ 开头的文件
                
                try:
                    with open(yaml_file, 'r', encoding='utf-8') as f:
                        prompts_data = yaml.safe_load(f)
                        if prompts_data:
                            # 使用文件名（不含扩展名）作为场景名
                            scene_name = yaml_file.stem
                            self.prompts_cache[scene_name] = prompts_data
                            logger.info(f"加载提示词配置: {scene_name} ({yaml_file.name})")
                except Exception as e:
                    logger.error(f"加载提示词文件失败 {yaml_file}: {e}")
            
            if not self.prompts_cache:
                logger.warning(f"未找到任何提示词配置文件，目录: {self.prompts_dir}")
        
        except Exception as e:
            logger.error(f"加载提示词配置失败: {e}", exc_info=True)
    
    def get_prompt(self, scene: str, template_name: str = "default") -> Optional[str]:
        """
        获取指定场景的提示词模板
        
        Args:
            scene: 场景名称（对应 YAML 文件名）
            template_name: 模板名称，默认为 "default"
            
        Returns:
            提示词模板字符串，如果不存在则返回 None
        """
        scene_prompts = self.prompts_cache.get(scene)
        if not scene_prompts:
            logger.warning(f"未找到场景 '{scene}' 的提示词配置")
            return None
        
        templates = scene_prompts.get("templates", {})
        prompt_template = templates.get(template_name)
        
        if not prompt_template:
            logger.warning(f"场景 '{scene}' 中未找到模板 '{template_name}'")
            return None
        
        return prompt_template
    
    def format_prompt(self, scene: str, template_name: str = "default", **kwargs) -> Optional[str]:
        """
        格式化提示词模板
        
        Args:
            scene: 场景名称
            template_name: 模板名称
            **kwargs: 模板变量
            
        Returns:
            格式化后的提示词字符串
        """
        template = self.get_prompt(scene, template_name)
        if not template:
            return None
        
        try:
            return template.format(**kwargs)
        except KeyError as e:
            logger.error(f"提示词模板格式化失败，缺少变量: {e}")
            return template  # 返回未格式化的模板
    
    def get_all_scenes(self) -> list:
        """获取所有可用的场景名称"""
        return list(self.prompts_cache.keys())
    
    def reload(self):
        """重新加载所有提示词配置"""
        self.prompts_cache.clear()
        self._load_all_prompts()
        logger.info("提示词配置已重新加载")


# 全局提示词管理器实例
_prompts_manager: Optional[PromptsManager] = None


def get_prompts_manager(prompts_dir: Optional[str] = None) -> PromptsManager:
    """
    获取全局提示词管理器实例（单例模式）
    
    Args:
        prompts_dir: 提示词目录，仅在首次调用时生效
        
    Returns:
        PromptsManager 实例
    """
    global _prompts_manager
    if _prompts_manager is None:
        _prompts_manager = PromptsManager(prompts_dir)
    return _prompts_manager


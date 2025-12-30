"""
YOLOv8n 模型适配器
支持 ONNX 优化推理，目标推理时间 ≤200ms
"""

import os
import cv2
import numpy as np
from typing import List, Dict, Any, Optional
import time
import logging
from pathlib import Path
import yaml

try:
    import torch
    TORCH_AVAILABLE = True
    # 修复 PyTorch 2.6+ 兼容性问题：全局替换 torch.load
    # PyTorch 2.6 默认 weights_only=True，但 ultralytics 需要加载自定义类
    if hasattr(torch, 'load'):
        import functools
        import inspect
        _original_torch_load = torch.load
        
        @functools.wraps(_original_torch_load)
        def _patched_torch_load(*args, **kwargs):
            # 对于 ultralytics 模型文件，自动设置 weights_only=False
            if 'weights_only' not in kwargs:
                # 检查调用栈中是否有 ultralytics 模块
                stack = inspect.stack()
                is_ultralytics_call = any(
                    'ultralytics' in str(frame.filename) for frame in stack[1:]
                )
                # 或者检查文件路径是否包含 .pt（PyTorch 模型文件）
                is_pt_file = (
                    args and 
                    isinstance(args[0], (str, bytes)) and 
                    str(args[0]).endswith('.pt')
                )
                if is_ultralytics_call or is_pt_file:
                    kwargs['weights_only'] = False
            return _original_torch_load(*args, **kwargs)
        
        # 全局替换 torch.load（影响所有模块，包括 ultralytics）
        torch.load = _patched_torch_load
except ImportError:
    TORCH_AVAILABLE = False

try:
    from ultralytics import YOLO
    ULTRALYTICS_AVAILABLE = True
except ImportError:
    ULTRALYTICS_AVAILABLE = False
    logging.warning("ultralytics not available, ONNX mode will be used")

try:
    import onnxruntime as ort
    ONNXRUNTIME_AVAILABLE = True
    # 在模块级别抑制 ONNX Runtime 的 CUDA 警告
    import logging
    import os
    
    # 方法1: 设置日志级别
    onnx_logger = logging.getLogger("onnxruntime")
    onnx_logger.setLevel(logging.ERROR)  # 只显示错误，不显示警告和信息
    
    # 方法2: 设置环境变量，抑制 ONNX Runtime 的日志输出
    # ORT_LOGGING_LEVEL: 0=VERBOSE, 1=INFO, 2=WARNING, 3=ERROR, 4=FATAL
    # 设置为 3 (ERROR) 可以抑制警告信息
    if "ORT_LOGGING_LEVEL" not in os.environ:
        os.environ["ORT_LOGGING_LEVEL"] = "3"
    
    # 方法3: 默认只使用 CPU，避免 CUDA 相关的警告
    # 如果需要 CUDA，可以设置环境变量 ORT_USE_CUDA=1
    if "ORT_USE_CUDA" not in os.environ:
        os.environ["ORT_USE_CUDA"] = "0"  # 默认使用 CPU
    # 注意：即使设置了环境变量，ONNX Runtime 仍可能输出 CUDA 警告
    # 这是 ONNX Runtime 库的限制，无法完全抑制 C++ 层的警告
except ImportError:
    ONNXRUNTIME_AVAILABLE = False
    logging.warning("onnxruntime not available, falling back to PyTorch")

from .base_vision import BaseVisionModel

logger = logging.getLogger(__name__)


class YOLOv8nAdapter(BaseVisionModel):
    """YOLOv8n 模型适配器，支持 ONNX 优化推理"""
    
    def __init__(
        self, 
        model_path: Optional[str] = None,
        use_onnx: bool = True,
        confidence_threshold: float = 0.25,
        iou_threshold: float = 0.45,
        class_mapping_file: Optional[str] = None,
        use_chinese: bool = True
    ):
        """
        初始化 YOLOv8n 适配器
        
        Args:
            model_path: 模型文件路径，如果为 None 则使用默认 yolov8n.pt
            use_onnx: 是否使用 ONNX 优化推理
            confidence_threshold: 置信度阈值
            iou_threshold: IOU 阈值
            class_mapping_file: 中英文对照配置文件路径，None 表示使用默认路径
            use_chinese: 是否在返回结果中使用中文名称
        """
        self.model_path = model_path or "yolov8n.pt"
        # 保留原始的 use_onnx 值，用于决定是否尝试 ONNX
        self._prefer_onnx = use_onnx
        # 实际使用的模式，会在 _load_model 中根据尝试结果设置
        self.use_onnx = False
        self.confidence_threshold = confidence_threshold
        self.iou_threshold = iou_threshold
        self.use_chinese = use_chinese
        
        self.model = None
        self.ort_session = None
        self.input_name = None
        self.output_names = None
        self.class_names = None
        self.input_shape = None
        self.model_source = None  # 模型来源（文件路径或来源说明）
        self.execution_provider = None  # 执行提供者（CPU/CUDA）
        
        # 加载中英文对照配置
        self.class_mapping = {}  # 英文 -> 中文
        self.class_mapping_file = class_mapping_file
        self._load_class_mapping()
        
        self._load_model()
        # 不在初始化时自动打印，由调用者决定是否打印
    
    def _load_model(self):
        """加载模型，支持 ONNX 优化，失败后自动回退到 PyTorch"""
        # 如果配置了使用 ONNX 且 ONNX Runtime 可用，先尝试 ONNX
        if self._prefer_onnx and ONNXRUNTIME_AVAILABLE:
            try:
                logger.info("尝试加载 ONNX 模型...")
                self._load_onnx_model()
                self.use_onnx = True
                logger.info(f"YOLOv8n 模型加载成功 (ONNX 模式)")
                return
            except Exception as e:
                logger.warning(f"ONNX 模式加载失败: {e}")
                logger.info("ONNX 模式失败，尝试回退到 PyTorch 模式")
                # 继续执行，尝试 PyTorch 模式
        elif self._prefer_onnx and not ONNXRUNTIME_AVAILABLE:
            logger.warning("配置了使用 ONNX，但 ONNX Runtime 不可用，直接使用 PyTorch 模式")
        
        # 尝试 PyTorch 模式
        if ULTRALYTICS_AVAILABLE:
            try:
                self._load_pytorch_model()
                self.use_onnx = False
                logger.info(f"YOLOv8n 模型加载成功 (PyTorch 模式)")
            except Exception as pytorch_error:
                logger.error(f"PyTorch 模式也失败: {pytorch_error}")
                raise RuntimeError(
                    f"无法加载模型。\n"
                    f"{'ONNX 模式失败，' if self._prefer_onnx and ONNXRUNTIME_AVAILABLE else ''}"
                    f"PyTorch 模式也失败: {pytorch_error}\n"
                    f"请检查 ultralytics 库的安装和版本兼容性。"
                ) from pytorch_error
        else:
            raise RuntimeError(
                "无法加载模型：ultralytics 库未安装，且 ONNX 模式不可用。\n"
                "请安装 ultralytics 库：pip install ultralytics"
            )
    
    def _load_onnx_model(self):
        """加载 ONNX 模型"""
        # 如果 model_path 已经是 .onnx 文件，直接使用
        # 否则尝试将 .pt 替换为 .onnx
        if self.model_path.endswith('.onnx'):
            onnx_path = self.model_path
        else:
            onnx_path = self.model_path.replace('.pt', '.onnx')
        
        # 确保路径是绝对路径（相对于 server 目录）
        if not os.path.isabs(onnx_path):
            # 尝试从 server 目录解析
            server_dir = Path(__file__).parent.parent.parent.parent
            onnx_path_abs = server_dir / onnx_path
            if onnx_path_abs.exists():
                onnx_path = str(onnx_path_abs)
            # 如果还是相对路径，尝试当前工作目录
            elif not os.path.exists(onnx_path):
                # 保持原路径，让后续逻辑处理
                pass
        
        # 如果 ONNX 文件不存在，尝试导出
        if not os.path.exists(onnx_path):
            if ULTRALYTICS_AVAILABLE:
                logger.info(f"ONNX 模型文件不存在，尝试从 PyTorch 模型导出: {onnx_path}")
                try:
                    self._export_to_onnx(onnx_path)
                    self.model_source = f"从 {self.model_path} 导出"
                except Exception as export_error:
                    logger.error(f"无法导出 ONNX 模型: {export_error}")
                    # 检查是否是缺少 onnxscript 的错误
                    error_msg = str(export_error).lower()
                    if 'onnxscript' in error_msg or 'no module named' in error_msg:
                        raise FileNotFoundError(
                            f"ONNX 模型文件不存在且无法从 PyTorch 模型导出。\n"
                            f"错误详情: {export_error}\n"
                            f"解决方案：\n"
                            f"1. 安装缺失的依赖: pip install onnxscript\n"
                            f"2. 或重新安装 ultralytics: pip install --upgrade ultralytics\n"
                            f"3. 手动下载或转换 ONNX 模型文件到: {onnx_path}\n"
                            f"4. 或使用 PyTorch 模式（设置 use_onnx=False）"
                        ) from export_error
                    else:
                        raise FileNotFoundError(
                            f"ONNX 模型文件不存在且无法从 PyTorch 模型导出。\n"
                            f"错误详情: {export_error}\n"
                            f"解决方案：\n"
                            f"1. 手动下载或转换 ONNX 模型文件到: {onnx_path}\n"
                            f"2. 检查 ultralytics 库的安装和版本兼容性\n"
                            f"3. 确保所有必需的依赖模块已安装（包括 onnxscript）\n"
                            f"4. 或使用 PyTorch 模式（设置 use_onnx=False）"
                        ) from export_error
            else:
                raise FileNotFoundError(
                    f"ONNX 模型文件不存在: {onnx_path}\n"
                    f"且 ultralytics 库未安装，无法自动导出。\n"
                    f"请手动提供 ONNX 模型文件。"
                )
        else:
            self.model_source = f"本地文件: {onnx_path}"
        
        # 创建 ONNX Runtime 会话
        # 直接使用 CPU，避免 CUDA 警告信息
        # 如果系统有 CUDA 支持，可以通过环境变量启用：ORT_USE_CUDA=1
        providers = ['CPUExecutionProvider']
        
        # 创建 SessionOptions 来抑制日志输出
        sess_options = ort.SessionOptions()
        sess_options.log_severity_level = 3  # 3 = ERROR, 只显示错误，不显示警告
        
        # 检查是否通过环境变量启用了 CUDA
        use_cuda = os.environ.get("ORT_USE_CUDA", "0").lower() in ("1", "true", "yes")
        
        if use_cuda:
            # 用户明确要求使用 CUDA
            try:
                available_providers = ort.get_available_providers()
                if 'CUDAExecutionProvider' in available_providers:
                    providers = ['CUDAExecutionProvider', 'CPUExecutionProvider']
                    logger.info("ONNX Runtime 将使用 CUDA 加速（通过环境变量启用）")
            except Exception as e:
                logger.debug(f"无法检测 CUDA 提供者: {e}")
        
        # 创建会话（使用 SessionOptions 抑制日志）
        self.ort_session = ort.InferenceSession(
            onnx_path,
            providers=providers,
            sess_options=sess_options
        )
        
        # 记录实际使用的执行提供者
        actual_providers = self.ort_session.get_providers()
        if 'CUDAExecutionProvider' in actual_providers:
            self.execution_provider = "CUDA"
            logger.info("ONNX Runtime 会话创建成功（使用 CUDA 加速）")
        else:
            self.execution_provider = "CPU"
            logger.info("ONNX Runtime 会话创建成功（使用 CPU）")
        
        # 获取输入输出信息
        self.input_name = self.ort_session.get_inputs()[0].name
        self.output_names = [output.name for output in self.ort_session.get_outputs()]
        self.input_shape = self.ort_session.get_inputs()[0].shape
        
        # 获取类别名称：在 ONNX 模式下，直接依赖配置文件提供的 COCO 类别映射，
        # 不再尝试加载 PyTorch 模型读取 names，避免因 ultralytics 版本差异产生额外报错。
        try:
            self.class_names = self._get_default_coco_names()
            logger.info(f"使用配置文件提供的 COCO 类别映射，共 {len(self.class_names)} 个类别")
        except Exception as e:
            # 若映射缺失或配置文件异常，直接抛出错误，提示用户补齐配置
            logger.error(f"加载 COCO 类别映射失败: {e}")
            raise
    
    def _ensure_model_in_project_dir(self) -> str:
        """
        确保 PyTorch 模型文件在项目目录（server/models）中
        如果模型不存在，会先下载到项目目录，而不是 ultralytics 的默认缓存目录
        
        Returns:
            模型文件的绝对路径
        """
        # 获取 server 目录
        server_dir = Path(__file__).parent.parent.parent.parent
        
        # 确定目标路径（server/models/yolov8n.pt）
        if os.path.isabs(self.model_path):
            target_path = Path(self.model_path)
        else:
            # 如果是相对路径，解析为 server/models/ 下的文件
            if self.model_path.startswith('models/'):
                target_path = server_dir / self.model_path
            else:
                # 如果只是文件名（如 "yolov8n.pt"），放在 models 目录
                target_path = server_dir / "models" / self.model_path
        
        # 确保 models 目录存在
        target_path.parent.mkdir(parents=True, exist_ok=True)
        
        # 如果目标文件已存在，直接返回
        if target_path.exists():
            logger.info(f"使用本地模型文件: {target_path}")
            return str(target_path)
        
        # 如果文件不存在，需要下载
        logger.info(f"模型文件不存在，将下载到: {target_path}")
        
        # 使用临时路径让 ultralytics 下载，然后移动到目标位置
        # 先尝试直接下载到目标位置
        try:
            # 临时修改工作目录到 models 目录，让 ultralytics 下载到正确位置
            original_cwd = os.getcwd()
            try:
                os.chdir(str(target_path.parent))
                # 使用相对路径让 ultralytics 下载到当前目录
                model_name = target_path.name
                temp_model = YOLO(model_name)
                # 下载完成后，检查文件是否在正确位置
                if target_path.exists():
                    logger.info(f"模型已下载到: {target_path}")
                    return str(target_path)
                else:
                    # 如果不在目标位置，尝试从 ultralytics 缓存目录复制
                    logger.warning("模型可能下载到了 ultralytics 缓存目录，尝试查找并复制...")
            finally:
                os.chdir(original_cwd)
        except Exception as e:
            logger.warning(f"直接下载到目标位置失败: {e}，尝试从缓存目录复制")
        
        # 如果直接下载失败，尝试从 ultralytics 缓存目录复制
        # ultralytics 默认缓存位置：~/.cache/ultralytics/ 或 ~/.ultralytics/
        import shutil
        
        # 尝试查找 ultralytics 缓存目录
        home_dir = Path.home()
        possible_cache_dirs = [
            home_dir / ".cache" / "ultralytics",
            home_dir / ".ultralytics",
            Path.cwd() / ".ultralytics"
        ]
        
        model_name = target_path.name
        for cache_dir in possible_cache_dirs:
            if cache_dir.exists():
                # 查找模型文件（可能在 weights 子目录中）
                possible_locations = [
                    cache_dir / model_name,
                    cache_dir / "weights" / model_name,
                    cache_dir / "hub" / model_name
                ]
                for cached_file in possible_locations:
                    if cached_file.exists():
                        logger.info(f"从缓存目录复制模型: {cached_file} -> {target_path}")
                        shutil.copy2(cached_file, target_path)
                        if target_path.exists():
                            return str(target_path)
        
        # 如果都失败了，让 ultralytics 正常下载（会下载到缓存目录）
        logger.warning(f"无法确保模型在项目目录，将使用 ultralytics 默认行为")
        logger.warning(f"模型可能会下载到: ~/.cache/ultralytics/ 或 ~/.ultralytics/")
        return self.model_path
    
    def _load_pytorch_model(self):
        """加载 PyTorch 模型"""
        if not ULTRALYTICS_AVAILABLE:
            raise ImportError("ultralytics 未安装，无法使用 PyTorch 模式")
        
        # 确保模型文件在正确的位置（server/models 目录）
        target_model_path = self._ensure_model_in_project_dir()
        
        self.model = YOLO(target_model_path)
        # 安全获取类别名称，兼容不同版本的 ultralytics
        try:
            names = self.model.names if hasattr(self.model, 'names') else getattr(self.model.model, 'names', None)
            if names is None:
                # 如果无法获取，使用默认 COCO 类别
                logger.warning("无法从模型获取类别名称，使用默认 COCO 类别")
                self.class_names = self._get_default_coco_names()
            elif isinstance(names, dict):
                self.class_names = {int(k): str(v) for k, v in names.items()}
            elif isinstance(names, (list, tuple)):
                self.class_names = {i: str(name) for i, name in enumerate(names)}
            else:
                logger.warning(f"未知的类别名称格式: {type(names)}，使用默认 COCO 类别")
                self.class_names = self._get_default_coco_names()
        except Exception as e:
            logger.warning(f"获取类别名称失败: {e}，使用默认 COCO 类别")
            self.class_names = self._get_default_coco_names()
        
        # 记录模型来源
        if os.path.exists(target_model_path):
            self.model_source = f"本地文件: {target_model_path}"
        else:
            self.model_source = f"从 ultralytics 下载: {target_model_path}"
        
        # 检查是否使用 CUDA
        if TORCH_AVAILABLE and torch.cuda.is_available():
            self.execution_provider = "CUDA"
        else:
            self.execution_provider = "CPU"
    
    def _export_to_onnx(self, onnx_path: str):
        """导出 ONNX 模型"""
        try:
            model = YOLO(self.model_path)
            model.export(
                format="onnx",
                dynamic=True,
                simplify=True,
                opset=12,
                half=False  # 禁用 FP16，避免与 dynamic 参数冲突
            )
            # ultralytics 会自动生成 onnx 文件，重命名
            exported_path = self.model_path.replace('.pt', '.onnx')
            if os.path.exists(exported_path) and exported_path != onnx_path:
                os.rename(exported_path, onnx_path)
        except ModuleNotFoundError as e:
            # 检查是否是缺少依赖模块的错误
            error_msg = str(e)
            if 'onnxscript' in error_msg.lower():
                logger.error(f"导出 ONNX 模型失败: 缺少 onnxscript 模块")
                raise RuntimeError(
                    f"无法导出 ONNX 模型：缺少必需的依赖模块 'onnxscript'。\n"
                    f"解决方案：\n"
                    f"1. 安装 onnxscript: pip install onnxscript\n"
                    f"2. 或者重新安装 ultralytics 及其依赖: pip install --upgrade ultralytics\n"
                    f"3. 或者手动提供 ONNX 模型文件: {onnx_path}\n"
                    f"4. 或者使用 PyTorch 模式（设置 use_onnx=False）"
                ) from e
            else:
                logger.error(f"导出 ONNX 模型失败: 缺少依赖模块 {e}")
                raise RuntimeError(
                    f"无法导出 ONNX 模型：缺少必需的依赖模块。\n"
                    f"错误详情: {e}\n"
                    f"解决方案：\n"
                    f"1. 安装缺失的依赖模块\n"
                    f"2. 或者重新安装 ultralytics 及其依赖: pip install --upgrade ultralytics\n"
                    f"3. 或者手动提供 ONNX 模型文件: {onnx_path}\n"
                    f"4. 或者使用 PyTorch 模式（设置 use_onnx=False）"
                ) from e
        except Exception as e:
            logger.error(f"导出 ONNX 模型失败: {e}")
            # 检查错误信息中是否包含 onnxscript
            error_msg = str(e).lower()
            if 'onnxscript' in error_msg:
                raise RuntimeError(
                    f"无法导出 ONNX 模型：缺少必需的依赖模块 'onnxscript'。\n"
                    f"解决方案：\n"
                    f"1. 安装 onnxscript: pip install onnxscript\n"
                    f"2. 或者重新安装 ultralytics 及其依赖: pip install --upgrade ultralytics\n"
                    f"3. 或者手动提供 ONNX 模型文件: {onnx_path}\n"
                    f"4. 或者使用 PyTorch 模式（设置 use_onnx=False）"
                ) from e
            else:
                raise RuntimeError(
                    f"无法导出 ONNX 模型。请确保：\n"
                    f"1. ultralytics 库已正确安装且版本兼容\n"
                    f"2. PyTorch 模型文件 {self.model_path} 存在且可访问\n"
                    f"3. 所有必需的依赖模块已安装（包括 onnxscript）\n"
                    f"4. 或者手动提供 ONNX 模型文件: {onnx_path}\n"
                    f"5. 或者使用 PyTorch 模式（设置 use_onnx=False）"
                ) from e
    
    def _load_class_mapping(self):
        """加载中英文对照配置文件"""
        try:
            # 确定配置文件路径
            if self.class_mapping_file:
                mapping_path = Path(self.class_mapping_file)
            else:
                # 默认路径：server/config/coco_classes_zh_en.yaml
                # 通过向上查找 config 目录，避免路径层级误判
                current_file = Path(__file__).resolve()
                mapping_path = None
                for parent in current_file.parents:
                    candidate = parent / "config" / "coco_classes_zh_en.yaml"
                    if candidate.exists():
                        mapping_path = candidate
                        break
                    # 遇到项目根标志（包含 app 和 requirements.txt）即停止
                    if (parent / "app").exists() and (parent / "requirements.txt").exists():
                        mapping_path = candidate
                        break
                if mapping_path is None:
                    # 最后兜底：按预期层级拼接
                    mapping_path = current_file.parent.parent.parent.parent / "config" / "coco_classes_zh_en.yaml"
            
            if mapping_path.exists():
                with open(mapping_path, 'r', encoding='utf-8') as f:
                    config = yaml.safe_load(f)
                    self.class_mapping = config.get('mapping', {})
                    self.mapping_defaults = config.get('defaults', {})
                logger.info(f"成功加载中英文对照配置: {mapping_path}，共 {len(self.class_mapping)} 个映射")
            else:
                logger.warning(f"中英文对照配置文件不存在: {mapping_path}，将只使用英文名称")
                self.class_mapping = {}
                self.mapping_defaults = {}
        except Exception as e:
            logger.warning(f"加载中英文对照配置失败: {e}，将只使用英文名称")
            self.class_mapping = {}
            self.mapping_defaults = {}
    
    def _translate_class_name(self, english_name: str) -> str:
        """
        将英文类别名称翻译为中文
        
        Args:
            english_name: 英文类别名称
            
        Returns:
            中文类别名称，如果找不到映射则返回英文名称
        """
        if not self.use_chinese:
            return english_name
        
        chinese_name = self.class_mapping.get(english_name)
        if chinese_name:
            return chinese_name
        
        # 如果找不到映射，使用默认格式
        fallback_format = self.mapping_defaults.get('fallback_format', '{en}')
        return fallback_format.format(en=english_name, zh=self.mapping_defaults.get('unknown_zh', '未知'))
    
    def _get_default_coco_names(self) -> Dict[int, str]:
        """
        获取 COCO 类别名称的唯一数据源。
        
        - 优先使用配置文件的英文名称（class_mapping 的键）
        - 若未加载到配置（或缺失），直接抛出错误，提示用户提供映射
        
        保持模块职责清晰：不再用硬编码列表兜底。
        """
        if self.class_mapping:
            english_names = list(self.class_mapping.keys())
            return {i: name for i, name in enumerate(english_names)}
        
        mapping_hint = self.class_mapping_file or "server/config/coco_classes_zh_en.yaml"
        raise RuntimeError(
            f"未找到类别映射，请提供中英文映射配置文件: {mapping_hint}"
        )
    
    def _preprocess_image(self, image_data: bytes) -> np.ndarray:
        """图像预处理"""
        nparr = np.frombuffer(image_data, np.uint8)
        image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if image is None:
            raise ValueError("无法解码图像数据。请确保输入是有效的 JPEG、PNG 或其他 OpenCV 支持的图像格式")
        image = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
        return image
    
    def _prepare_onnx_input(self, image: np.ndarray) -> np.ndarray:
        """准备 ONNX 输入"""
        # YOLOv8 输入尺寸通常是 640x640
        input_size = 640
        h, w = image.shape[:2]
        
        # 缩放并填充
        scale = min(input_size / h, input_size / w)
        new_h, new_w = int(h * scale), int(w * scale)
        
        resized = cv2.resize(image, (new_w, new_h), interpolation=cv2.INTER_LINEAR)
        
        # 创建填充图像
        padded = np.full((input_size, input_size, 3), 114, dtype=np.uint8)
        padded[:new_h, :new_w] = resized
        
        # 转换为模型输入格式 [1, 3, 640, 640]，归一化到 [0, 1]
        input_tensor = padded.transpose(2, 0, 1).astype(np.float32) / 255.0
        input_tensor = np.expand_dims(input_tensor, axis=0)
        
        return input_tensor
    
    def _postprocess_onnx(
        self, 
        outputs: List[np.ndarray], 
        image_shape: tuple
    ) -> List[Dict[str, Any]]:
        """ONNX 输出后处理"""
        # YOLOv8 ONNX 输出格式通常是: [batch, 84, num_detections]
        # 其中 84 = 4 (bbox: x_center, y_center, width, height) + 80 (classes)
        # num_detections 通常是 8400 (80*80 + 40*40 + 20*20 = 6400 + 1600 + 400)
        
        output = outputs[0]  # 获取第一个输出 [batch, 84, num_detections]
        
        # 调试：输出形状信息
        logger.debug(f"ONNX 输出原始形状: {output.shape}")
        
        # 移除 batch 维度
        if len(output.shape) == 3:
            output = output[0]  # [84, num_detections]
        
        # YOLOv8 输出格式是 [84, num_detections]，需要转置为 [num_detections, 84]
        if output.shape[0] == 84:
            output = output.T  # 转置为 [num_detections, 84]
            logger.debug(f"转置后形状: {output.shape}")
        elif output.shape[1] != 84:
            logger.warning(f"意外的输出形状: {output.shape}，期望第二个维度为 84")
            return []
        
        detections = []
        h, w = image_shape[:2]
        
        # 确保 class_names 是字典格式，且键是整数
        if not isinstance(self.class_names, dict):
            # 如果是列表或其他格式，转换为字典
            if isinstance(self.class_names, (list, tuple)):
                self.class_names = {i: str(name) for i, name in enumerate(self.class_names)}
            else:
                logger.warning(f"class_names 格式不正确: {type(self.class_names)}，使用默认 COCO 类别")
                self.class_names = self._get_default_coco_names()
        
        # 确保所有键都是整数
        self.class_names = {int(k): str(v) for k, v in self.class_names.items()}
        
        for detection in output:
            # 检查 detection 的长度
            if len(detection) < 84:
                logger.warning(f"检测结果长度不足: {len(detection)}，期望 84，跳过")
                continue
            
            # 提取边界框和类别分数
            bbox = detection[:4]  # [x_center, y_center, width, height] (归一化)
            scores = detection[4:84]  # 80个类别的分数（索引 4-83）
            
            # 找到最高分数和对应类别
            class_id = int(np.argmax(scores))
            confidence = float(scores[class_id])
            
            # 过滤低置信度检测
            if confidence < self.confidence_threshold:
                continue
            
            # 确保 class_id 在有效范围内（COCO 数据集是 0-79）
            if class_id >= 80:
                logger.warning(f"检测到无效的类别 ID: {class_id}（超出 COCO 80 类范围），跳过此检测")
                continue
            
            # 获取类别名称（英文）
            class_name_en = self.class_names.get(class_id)
            if class_name_en is None:
                # 使用默认 COCO 类别名称
                default_names = self._get_default_coco_names()
                class_name_en = default_names.get(class_id)
                if class_name_en is None:
                    logger.warning(f"未找到类别 ID {class_id} 的名称，使用默认名称")
                    class_name_en = f"物体_{class_id}"
                else:
                    logger.debug(f"从默认类别名称获取: {class_id} -> {class_name_en}")
            
            # 翻译为中文（如果需要）
            class_name = self._translate_class_name(class_name_en)
            
            # 转换边界框格式 [x1, y1, x2, y2] (像素坐标)
            x_center, y_center, width, height = bbox
            x1 = (x_center - width / 2) * w
            y1 = (y_center - height / 2) * h
            x2 = (x_center + width / 2) * w
            y2 = (y_center + height / 2) * h
            
            detections.append({
                "class": class_name,
                "class_en": class_name_en,  # 保留英文名称
                "class_id": class_id,
                "confidence": confidence,
                "bbox": [float(x1), float(y1), float(x2), float(y2)]
            })
        
        # NMS (简化版，使用置信度排序)
        detections.sort(key=lambda x: x["confidence"], reverse=True)
        filtered_detections = []
        for det in detections:
            # 简单的 IOU 过滤
            overlap = False
            for existing in filtered_detections:
                iou = self._calculate_iou(det["bbox"], existing["bbox"])
                if iou > self.iou_threshold:
                    overlap = True
                    break
            if not overlap:
                filtered_detections.append(det)
        
        return filtered_detections
    
    def _calculate_iou(self, box1: List[float], box2: List[float]) -> float:
        """计算两个边界框的 IOU"""
        x1_1, y1_1, x2_1, y2_1 = box1
        x1_2, y1_2, x2_2, y2_2 = box2
        
        # 计算交集
        x1_i = max(x1_1, x1_2)
        y1_i = max(y1_1, y1_2)
        x2_i = min(x2_1, x2_2)
        y2_i = min(y2_1, y2_2)
        
        if x2_i <= x1_i or y2_i <= y1_i:
            return 0.0
        
        intersection = (x2_i - x1_i) * (y2_i - y1_i)
        area1 = (x2_1 - x1_1) * (y2_1 - y1_1)
        area2 = (x2_2 - x1_2) * (y2_2 - y1_2)
        union = area1 + area2 - intersection
        
        return intersection / union if union > 0 else 0.0
    
    def _predict_onnx(self, image: np.ndarray) -> List[Dict[str, Any]]:
        """ONNX 推理"""
        input_tensor = self._prepare_onnx_input(image)
        
        # 推理
        outputs = self.ort_session.run(self.output_names, {self.input_name: input_tensor})
        
        # 后处理
        return self._postprocess_onnx(outputs, image.shape)
    
    def _predict_pytorch(self, image: np.ndarray) -> List[Dict[str, Any]]:
        """PyTorch 推理"""
        # ultralytics YOLO 模型可以直接接受 numpy 数组
        # 但需要确保格式正确：BGR 格式，uint8 类型
        # 注意：_preprocess_image 返回的是 RGB 格式，需要转换为 BGR
        if image.dtype != np.uint8:
            image = (image * 255).astype(np.uint8) if image.max() <= 1.0 else image.astype(np.uint8)
        
        # 将 RGB 转换为 BGR（ultralytics 期望 BGR 格式）
        if len(image.shape) == 3 and image.shape[2] == 3:
            image_bgr = cv2.cvtColor(image, cv2.COLOR_RGB2BGR)
        else:
            image_bgr = image
        
        # 直接传递 numpy 数组给模型
        # ultralytics 8.0.0+ 支持直接传递 numpy 数组
        # 使用 source 参数明确指定，避免内部路径检查
        try:
            results = self.model.predict(
                source=image_bgr,
                conf=self.confidence_threshold,
                iou=self.iou_threshold,
                verbose=False
            )
        except (ValueError, FileNotFoundError, TypeError) as e:
            # 如果直接传递失败，尝试使用临时文件（最后的手段）
            logger.warning(f"直接传递 numpy 数组失败: {e}，尝试使用临时文件")
            import tempfile
            with tempfile.NamedTemporaryFile(suffix='.jpg', delete=False) as tmp_file:
                cv2.imwrite(tmp_file.name, image_bgr)
                try:
                    results = self.model.predict(
                        source=tmp_file.name,
                        conf=self.confidence_threshold,
                        iou=self.iou_threshold,
                        verbose=False
                    )
                finally:
                    # 清理临时文件
                    try:
                        os.unlink(tmp_file.name)
                    except:
                        pass
        detections = []
        
        # 确保 results 是列表
        if not isinstance(results, list):
            results = [results]
        
        for result in results:
            # 检查 result 是否是 Results 对象（有 boxes 属性）
            if hasattr(result, 'boxes'):
                # 正常的 Results 对象处理
                boxes = result.boxes
                if boxes is not None and len(boxes) > 0:
                    for box in boxes:
                        class_id = int(box.cls)
                        class_name_en = self.class_names.get(class_id)
                        if class_name_en is None:
                            # 如果找不到，尝试从默认名称获取
                            default_names = self._get_default_coco_names()
                            class_name_en = default_names.get(class_id, f"物体_{class_id}")
                        
                        # 翻译为中文（如果需要）
                        class_name = self._translate_class_name(class_name_en)
                        
                        detections.append({
                            "class": class_name,
                            "class_en": class_name_en,  # 保留英文名称
                            "class_id": class_id,
                            "confidence": float(box.conf),
                            "bbox": box.xyxy[0].tolist()  # [x1, y1, x2, y2]
                        })
            else:
                # 处理返回 Tensor 的情况（某些 ultralytics 版本或配置下可能发生）
                if TORCH_AVAILABLE and hasattr(result, 'shape'):
                    # 检查是否是 PyTorch Tensor
                    if isinstance(result, torch.Tensor) or (hasattr(result, 'shape') and hasattr(result, 'cpu')):
                        logger.debug(f"predict 返回了 Tensor 对象，shape: {result.shape}，尝试解析")
                        # Tensor 格式通常是 [N, 6]，其中 N 是检测框数量，6 是 [x1, y1, x2, y2, conf, cls]
                        if len(result.shape) == 2 and result.shape[1] == 6:
                            # 转换为 numpy 数组进行处理
                            if hasattr(result, 'cpu'):
                                result_np = result.cpu().numpy()
                            elif hasattr(result, 'numpy'):
                                result_np = result.numpy()
                            else:
                                result_np = np.array(result)
                            
                            # 过滤置信度低于阈值的检测框
                            for det in result_np:
                                x1, y1, x2, y2, conf, cls_id = det
                                if conf >= self.confidence_threshold:
                                    class_id = int(cls_id)
                                    class_name_en = self.class_names.get(class_id)
                                    if class_name_en is None:
                                        default_names = self._get_default_coco_names()
                                        class_name_en = default_names.get(class_id, f"物体_{class_id}")
                                    
                                    class_name = self._translate_class_name(class_name_en)
                                    
                                    detections.append({
                                        "class": class_name,
                                        "class_en": class_name_en,
                                        "class_id": class_id,
                                        "confidence": float(conf),
                                        "bbox": [float(x1), float(y1), float(x2), float(y2)]
                                    })
                            
                            # 如果没有检测到物体（shape 是 [0, 6]），这是正常的，不需要记录错误
                            if result.shape[0] == 0:
                                logger.debug("Tensor 形状为 [0, 6]，表示未检测到物体（正常情况）")
                        else:
                            logger.warning(f"无法解析 Tensor 格式，shape: {result.shape}，期望 [N, 6]")
                    else:
                        logger.warning(f"predict 返回了非 Results 对象且不是 Tensor: {type(result)}")
                else:
                    logger.warning(f"predict 返回了非 Results 对象: {type(result)}，且 PyTorch 不可用，无法解析")
        
        return detections
    
    async def describe(self, image_bytes: bytes) -> Dict[str, Any]:
        """
        执行推理预测
        
        Args:
            image_bytes: 图像字节数据
            
        Returns:
            包含检测结果的字典
        """
        start_time = time.time()
        
        try:
            # 预处理图像
            image = self._preprocess_image(image_bytes)
            
            # 执行推理
            if self.use_onnx:
                detections = self._predict_onnx(image)
            else:
                detections = self._predict_pytorch(image)
            
            inference_time = time.time() - start_time
            
            logger.info(f"YOLOv8n 推理完成: {len(detections)} 个检测, 耗时 {inference_time:.3f}s")
            
            return {
                "detections": detections,
                "inference_time": inference_time,
                "model": "yolov8n",
                "timestamp": time.time(),
                "image_shape": image.shape[:2]
            }
            
        except Exception as e:
            logger.error(f"推理失败: {e}", exc_info=True)
            raise
    
    def _print_model_info(self):
        """打印模型详细信息"""
        print("\n" + "-" * 60)
        print("📦 YOLOv8n 视觉模型信息")
        print("-" * 60)
        print(f"   模型类型: {'ONNX' if self.use_onnx else 'PyTorch'}")
        print(f"   执行设备: {self.execution_provider or '未知'}")
        print(f"   模型来源: {self.model_source or '未知'}")
        print(f"   模型状态: {'✅ 可用' if (self.ort_session is not None or self.model is not None) else '❌ 不可用'}")
        
        if self.class_names:
            print(f"   类别数量: {len(self.class_names)}")
            # 显示前5个类别作为示例
            sample_classes = list(self.class_names.values())[:5]
            print(f"   示例类别: {', '.join(sample_classes)}" + ("..." if len(self.class_names) > 5 else ""))
        
        if self.input_shape:
            print(f"   输入形状: {self.input_shape}")
        
        if self.use_onnx and self.ort_session:
            print(f"   输入名称: {self.input_name}")
            print(f"   输出名称: {', '.join(self.output_names)}")
        
        print(f"   置信度阈值: {self.confidence_threshold}")
        print(f"   IOU 阈值: {self.iou_threshold}")
        print("-" * 60 + "\n")
    
    def get_model_info(self) -> Dict[str, Any]:
        """获取模型信息字典"""
        return {
            "model_type": "ONNX" if self.use_onnx else "PyTorch",
            "execution_provider": self.execution_provider or "未知",
            "model_source": self.model_source or "未知",
            "status": "可用" if (self.ort_session is not None or self.model is not None) else "不可用",
            "class_count": len(self.class_names) if self.class_names else 0,
            "input_shape": list(self.input_shape) if self.input_shape else None,
            "confidence_threshold": self.confidence_threshold,
            "iou_threshold": self.iou_threshold
        }


import logging
import os
import asyncio
from fastapi import FastAPI
from .api.v1.endpoints import health
from .api.v1.websockets import main as ws_main, vision as ws_vision
from .core.config import settings
from .core.middleware import setup_middleware

logger = logging.getLogger(__name__)


def create_app() -> FastAPI:
  """FastAPI 应用工厂。"""
  app = FastAPI(title="SeeForMe Server", version="0.1.0")

  # 配置中间件（CORS等）
  setup_middleware(app)

  # HTTP 路由注册
  app.include_router(health.router, prefix="/api/v1")
  
  # WebSocket 路由注册（不使用 prefix，直接挂载）
  app.include_router(ws_main.router)
  app.include_router(ws_vision.router)
  
  print("\n" + "=" * 60)
  print("🚀 SeeForMe Server 正在启动...")
  print("=" * 60)

  # 启动时预热模型（可选）
  @app.on_event("startup")
  async def startup_event():
    """应用启动时的初始化"""
    print("\n" + "=" * 60)
    print("📋 服务器信息")
    print("=" * 60)
    print(f"   服务名称: SeeForMe Server")
    print(f"   版本: 0.1.0")
    print(f"   主机: {settings.host}")
    print(f"   端口: {settings.port}")
    print(f"   WebSocket 端点:")
    print(f"     - ws://{settings.host}:{settings.port}/ws")
    print(f"     - ws://{settings.host}:{settings.port}/ws/vision/{{session_id}}")
    print(f"   HTTP 健康检查: http://{settings.host}:{settings.port}/api/v1/health")
    print("=" * 60)
    
    # 加载并显示模型信息
    print("\n" + "=" * 60)
    print("🤖 AI 模型状态")
    print("=" * 60)
    
    try:
      # 加载视觉模型
      print("\n📦 加载视觉模型...")
      from .services.ai_models.vision import YOLOv8nAdapter
      # 使用配置的模型路径，避免默认路径找不到文件触发导出
      vision_model = YOLOv8nAdapter(
          model_path=settings.vision.YOLO_MODEL_PATH,
          use_onnx=settings.vision.YOLO_USE_ONNX,
          confidence_threshold=settings.vision.YOLO_CONFIDENCE_THRESHOLD,
          iou_threshold=settings.vision.YOLO_IOU_THRESHOLD,
      )
      vision_model._print_model_info()  # 显式打印模型信息
      
      # 加载语言模型（根据 LANGUAGE_MODE）
      print("\n📦 加载语言模型...")
      from .services.ai_models.language import QwenChatAdapter, TemplateLanguageAdapter
      mode = getattr(settings.language, "MODE", "template").lower()
      print(f"   使用语言模式: {mode}")

      if mode == "template":
          print("   ℹ️ 已配置为模板模式（mode=template），不依赖外部语言模型服务。")
          language_model = TemplateLanguageAdapter(
              prompts_scene=settings.language.PROMPTS_SCENE,
              prompts_template=settings.language.PROMPTS_TEMPLATE,
              prompts_dir=settings.language.PROMPTS_DIR,
          )
          language_model_name = "Template"
      elif mode == "qwen_local":
          base_url = settings.language.QWEN_BASE_URL
          api_key = settings.language.QWEN_API_KEY or "dummy"
          print(f"   ℹ️ 使用本地 Qwen 模式（来自 app.yaml）: base_url={base_url}, model={settings.language.QWEN_MODEL_NAME}")
          # 使用配置的 RESPONSE_TIMEOUT 作为 API 调用超时
          api_timeout = settings.language.RESPONSE_TIMEOUT
          language_model = QwenChatAdapter(
              model_name=settings.language.QWEN_MODEL_NAME,
              max_tokens=settings.language.QWEN_MAX_TOKENS,
              temperature=settings.language.QWEN_TEMPERATURE,
              base_url=base_url,
              api_key=api_key,
              prompts_scene=settings.language.PROMPTS_SCENE,
              prompts_template=settings.language.PROMPTS_TEMPLATE,
              prompts_dir=settings.language.PROMPTS_DIR,
              timeout=api_timeout,  # 使用配置的超时时间（本地 LLM 通常需要 20 秒）
          )
          language_model_name = "Qwen (local)"
      elif mode == "qwen_cloud":
          base_url = settings.language.QWEN_BASE_URL
          api_key = settings.language.QWEN_API_KEY
          if not api_key:
              raise RuntimeError(
                  "LANGUAGE_MODE=qwen_cloud 但未配置 QWEN_API_KEY，请在 app.yaml.language.qwen_cloud.api_key 中设置。"
              )
          print(f"   ℹ️ 使用云端 Qwen 模式（来自 app.yaml）: base_url={base_url}, model={settings.language.QWEN_MODEL_NAME}")
          language_model = QwenChatAdapter(
              model_name=settings.language.QWEN_MODEL_NAME,
              max_tokens=settings.language.QWEN_MAX_TOKENS,
              temperature=settings.language.QWEN_TEMPERATURE,
              base_url=base_url,
              api_key=api_key,
              prompts_scene=settings.language.PROMPTS_SCENE,
              prompts_template=settings.language.PROMPTS_TEMPLATE,
              prompts_dir=settings.language.PROMPTS_DIR,
          )
          language_model_name = "Qwen (cloud)"
      else:
          print(f"   ⚠️ 未知 LANGUAGE_MODE={mode}，回退为模板模式。")
          language_model = TemplateLanguageAdapter(
              prompts_scene=settings.language.PROMPTS_SCENE,
              prompts_template=settings.language.PROMPTS_TEMPLATE,
              prompts_dir=settings.language.PROMPTS_DIR,
          )
          language_model_name = "Template"
      
      # 模型预热（如果启用）
      if settings.vision.MODEL_WARMUP:
        print("\n🔥 开始预热模型...")
        logger.info("开始预热模型...")
        try:
          # 预热视觉模型
          print("   [1/2] 预热视觉模型 (YOLOv8n)...")
          import numpy as np
          import cv2
          
          # 创建一个虚拟图像进行预热（使用 cv2 编码为有效的 JPEG 格式）
          dummy_image = np.zeros((640, 640, 3), dtype=np.uint8)
          # 填充一些内容，避免完全空白
          dummy_image[:] = (128, 128, 128)  # 灰色
          # 编码为 JPEG 字节流
          _, dummy_bytes = cv2.imencode('.jpg', dummy_image)
          dummy_bytes = dummy_bytes.tobytes()
          await vision_model.describe(dummy_bytes)
          print("   ✅ 视觉模型预热完成")
          logger.info("视觉模型预热完成")
          
          # 预热语言模型
          print(f"   [2/2] 预热语言模型 ({language_model_name})...")
          await language_model.generate_description([])
          print("   ✅ 语言模型预热完成")
          logger.info("语言模型预热完成")
        except Exception as e:
          print(f"   ⚠️  模型预热失败（不影响正常使用）: {e}")
          logger.warning(f"模型预热失败（不影响正常使用）: {e}")
      
      print("\n" + "=" * 60)
      print("✅ 服务器启动完成，等待客户端连接...")
      print("=" * 60 + "\n")
      
    except Exception as e:
      print(f"\n⚠️  模型加载失败: {e}")
      logger.error(f"模型加载失败: {e}", exc_info=True)
      print("\n" + "=" * 60)
      print("⚠️  服务器启动完成（部分功能可能受限）")
      print("=" * 60 + "\n")
  
  # 关闭时的清理
  @app.on_event("shutdown")
  async def shutdown_event():
    """应用关闭时的清理"""
    print("\n" + "=" * 60)
    print("🛑 服务器正在关闭...")
    print("=" * 60)
    logger.info("服务器正在关闭，清理资源...")
    
    try:
      # 清理 WebSocket 连接
      from .api.v1.websockets.main import ws_manager
      active_count = len(ws_manager.active_connections)
      if active_count > 0:
        print(f"   关闭 {active_count} 个活跃的 WebSocket 连接...")
        logger.info(f"关闭 {active_count} 个活跃的 WebSocket 连接")
        # 断开所有连接
        for client_id in list(ws_manager.active_connections.keys()):
          try:
            await ws_manager.disconnect(client_id)
          except (asyncio.CancelledError, KeyboardInterrupt):
            # 忽略取消错误，这是正常的关闭流程
            pass
          except Exception as e:
            logger.debug(f"关闭连接 {client_id} 时出错: {e}")
      
      print("   资源清理完成")
      print("=" * 60)
      logger.info("服务器关闭完成")
    except (asyncio.CancelledError, KeyboardInterrupt):
      # 忽略取消错误和键盘中断，这是正常的关闭流程
      print("   服务器关闭中断（正常）")
      logger.debug("服务器关闭被中断（正常）")
    except Exception as e:
      logger.warning(f"关闭时清理资源失败: {e}")

  return app


app = create_app()



"""中间件配置模块。"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import logging

logger = logging.getLogger(__name__)


def setup_middleware(app: FastAPI) -> None:
    """注册全局中间件。"""
    
    # 配置 CORS 中间件，允许移动端跨域请求
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],  # 允许所有来源（开发环境）
        allow_credentials=True,
        allow_methods=["*"],  # 允许所有HTTP方法
        allow_headers=["*"],  # 允许所有请求头
    )
    
    logger.info("CORS 中间件已配置，允许所有来源的跨域请求")



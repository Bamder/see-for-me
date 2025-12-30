"""健康检查端点。"""

from fastapi import APIRouter
from datetime import datetime

router = APIRouter()


@router.get("/health", summary="健康检查")
async def health_check() -> dict:
    """健康检查端点，用于测试服务器连接。"""
    return {
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "service": "SeeForMe Server",
        "version": "0.1.0"
    }



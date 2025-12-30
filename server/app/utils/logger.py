"""日志配置占位。"""

import logging


def get_logger(name: str) -> logging.Logger:
    return logging.getLogger(name)



# 提示词配置说明

> **注意**：提示词配置文件已移动到 `server/prompts/` 目录（server 项目根目录下）
> 
> 本目录仅保留提示词管理器的代码文件，配置文件请查看 `server/prompts/` 目录

## 目录结构

**代码文件**（本目录）：
```
app/services/ai_models/language/prompts/
├── __init__.py              # 模块导出
├── prompts_manager.py       # 提示词管理器
└── README.md               # 本说明文件
```

**配置文件**（server 根目录）：
```
server/prompts/
├── vision_description.yaml  # 视觉描述场景提示词
├── object_detection.yaml    # 目标检测场景提示词
├── README.md               # 配置文件说明
└── PROMPTS_USAGE.md        # 使用指南
```

## 配置文件位置

**提示词配置文件位于**：`server/prompts/`（server 项目根目录下）

默认情况下，提示词管理器会自动查找 `server/prompts/` 目录。如果需要使用自定义目录，可以在配置中指定：

```python
# app/core/config.py
class LanguageConfig:
    PROMPTS_DIR: Optional[str] = None  # None 表示使用默认目录（server/prompts/）
```

或在 `.env` 文件中：

```env
PROMPTS_DIR=./prompts
```

## 配置文件格式

每个 YAML 文件代表一个场景，包含多个提示词模板。详细格式请参考 `server/prompts/README.md`。

## 使用方法

详细的使用方法请参考：
- `server/prompts/PROMPTS_USAGE.md` - 完整的使用指南
- `server/prompts/README.md` - 配置文件说明


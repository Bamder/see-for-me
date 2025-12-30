# 提示词配置说明

## 目录结构

```
prompts/
├── vision_description.yaml  # 视觉描述场景提示词
├── object_detection.yaml    # 目标检测场景提示词
├── README.md               # 本说明文件
└── PROMPTS_USAGE.md        # 使用指南
```

## 配置文件格式

每个 YAML 文件代表一个场景，包含多个提示词模板：

```yaml
# 场景元信息
scenario: vision_description
description: "根据目标检测结果生成自然语言描述"

# 提示词模板
templates:
  default: |
    请用温暖、友好、有人情味的中文描述这张图片：检测到了{objects}。...
  
  detailed: |
    请用自然流畅的中文详细描述：...
```

## 模板变量

提示词模板支持以下变量：

- `{objects}` - 物体列表（中文名称，用顿号分隔）
- `{objects_with_confidence}` - 带置信度的物体列表
- `{object_count}` - 检测到的物体数量

## 可用的场景和模板

### `vision_description` 场景：
- `default` - 默认模板（温暖友好，60字以内）
- `detailed` - 详细模板（更详细，100字以内）
- `concise` - 简洁模板（一句话描述）
- `location_aware` - 位置感知模板（强调位置关系）
- `scene_atmosphere` - 场景化模板（描述氛围和感觉）
- `no_detection` - 无检测结果模板

### `object_detection` 场景：
- `default` - 默认模板
- `with_confidence` - 带置信度模板
- `count_focused` - 数量聚焦模板

## 使用方法

### 1. 在配置中指定

在 `app/core/config.py` 中配置：

```python
class LanguageConfig:
    PROMPTS_DIR: Optional[str] = None  # None 表示使用默认目录（server/prompts/）
    PROMPTS_SCENE: str = "vision_description"  # 场景名称
    PROMPTS_TEMPLATE: str = "default"          # 模板名称
```

或在 `.env` 文件中设置：

```env
PROMPTS_DIR=./prompts
PROMPTS_SCENE=vision_description
PROMPTS_TEMPLATE=detailed
```

### 2. 在代码中使用

```python
from app.services.ai_models.language import FlanT5SmallAdapter

# 使用默认目录（server/prompts/）
adapter = FlanT5SmallAdapter(
    prompts_scene="vision_description",
    prompts_template="detailed"
)

# 使用自定义目录
adapter = FlanT5SmallAdapter(
    prompts_dir="/path/to/custom/prompts",
    prompts_scene="vision_description",
    prompts_template="detailed"
)
```

## 添加新场景

1. 在 `prompts/` 目录下创建新的 YAML 文件，例如 `custom_scene.yaml`
2. 按照格式编写提示词模板
3. 在代码中使用新场景：

```python
adapter = FlanT5SmallAdapter(
    prompts_scene="custom_scene",
    prompts_template="default"
)
```

## 注意事项

1. YAML 文件必须以 `.yaml` 或 `.yml` 结尾
2. 以 `_` 开头的文件会被忽略（可用于示例或注释文件）
3. 模板变量使用 Python 的 `str.format()` 语法
4. 如果模板不存在，会回退到默认模板
5. 默认目录为 `server/prompts/`（相对于项目根目录）

## 修改提示词

直接编辑 YAML 文件即可，修改后需要重启服务才能生效。或者使用 `adapter.prompts_manager.reload()` 重新加载配置。

## 更多信息

- 详细的使用指南请参考：`PROMPTS_USAGE.md`
- 提示词管理器代码位于：`app/services/ai_models/language/prompts/`


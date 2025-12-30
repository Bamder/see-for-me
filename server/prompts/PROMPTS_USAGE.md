# 提示词模板使用指南

> **提示词配置文件位置**：`server/prompts/`（server 项目根目录下）

## 如何触发不同的提示词模板

### 方法1：通过配置文件（推荐）

在 `app/core/config.py` 中修改配置：

```python
class LanguageConfig:
    PROMPTS_SCENE: str = "vision_description"  # 场景名称
    PROMPTS_TEMPLATE: str = "default"            # 模板名称
```

或者在 `.env` 文件中设置：

```env
PROMPTS_SCENE=vision_description
PROMPTS_TEMPLATE=detailed
```

**可用的场景和模板：**

#### `vision_description` 场景：
- `default` - 默认模板（温暖友好，60字以内）
- `detailed` - 详细模板（更详细，100字以内）
- `concise` - 简洁模板（一句话描述）
- `location_aware` - 位置感知模板（强调位置关系）
- `scene_atmosphere` - 场景化模板（描述氛围和感觉）
- `no_detection` - 无检测结果模板

#### `object_detection` 场景：
- `default` - 默认模板
- `with_confidence` - 带置信度模板
- `count_focused` - 数量聚焦模板

---

### 方法2：代码中创建适配器时指定

```python
from app.services.ai_models.language import FlanT5SmallAdapter

# 使用详细模板
adapter = FlanT5SmallAdapter(
    prompts_scene="vision_description",
    prompts_template="detailed"
)

# 使用位置感知模板
adapter = FlanT5SmallAdapter(
    prompts_scene="vision_description",
    prompts_template="location_aware"
)

# 使用简洁模板
adapter = FlanT5SmallAdapter(
    prompts_scene="vision_description",
    prompts_template="concise"
)
```

---

### 方法3：运行时动态切换（新增功能）

在适配器实例创建后，可以动态切换模板：

```python
from app.services.ai_models.language import FlanT5SmallAdapter

# 创建适配器
adapter = FlanT5SmallAdapter()

# 运行时切换模板
adapter.set_prompt_template(
    scene="vision_description",
    template="detailed"
)

# 只切换模板，不改变场景
adapter.set_prompt_template(template="concise")

# 只切换场景，使用该场景的默认模板
adapter.set_prompt_template(scene="object_detection")
```

---

### 方法4：在流水线中使用

```python
from app.services.ai_models.pipelines import VisionToTextPipeline
from app.services.ai_models.language import FlanT5SmallAdapter

# 创建自定义语言模型实例
language_model = FlanT5SmallAdapter(
    prompts_scene="vision_description",
    prompts_template="detailed"
)

# 在流水线中使用
pipeline = VisionToTextPipeline(
    language_model=language_model
)
```

---

### 方法5：在视觉服务中使用

```python
from app.services.vision_service import VisionService
from app.services.ai_models.pipelines import VisionToTextPipeline
from app.services.ai_models.language import FlanT5SmallAdapter

# 创建自定义语言模型
language_model = FlanT5SmallAdapter(
    prompts_scene="vision_description",
    prompts_template="location_aware"
)

# 创建流水线
pipeline = VisionToTextPipeline(language_model=language_model)

# 创建视觉服务
vision_service = VisionService(pipeline=pipeline)
```

---

## 查看可用的模板

```python
from app.services.ai_models.language import FlanT5SmallAdapter

adapter = FlanT5SmallAdapter()

# 查看所有场景和模板
all_templates = adapter.get_available_templates()
print(all_templates)
# 输出：
# {
#     'vision_description': ['default', 'detailed', 'concise', 'location_aware', 'scene_atmosphere', 'no_detection'],
#     'object_detection': ['default', 'with_confidence', 'count_focused']
# }

# 查看特定场景的模板
scene_templates = adapter.get_available_templates("vision_description")
print(scene_templates)
# 输出：
# {'vision_description': ['default', 'detailed', 'concise', 'location_aware', 'scene_atmosphere', 'no_detection']}
```

---

## 实际应用示例

### 示例1：根据用户偏好切换模板

```python
# 用户设置：偏好详细描述
user_preference = "detailed"

adapter = FlanT5SmallAdapter(
    prompts_scene="vision_description",
    prompts_template=user_preference
)
```

### 示例2：根据场景类型切换

```python
# 室内场景：使用详细模板
if scene_type == "indoor":
    adapter.set_prompt_template(template="detailed")
# 户外场景：使用位置感知模板
elif scene_type == "outdoor":
    adapter.set_prompt_template(template="location_aware")
```

### 示例3：通过 API 参数切换（需要实现）

```python
# 在 WebSocket 处理中
async def handle_image_analysis(websocket, message):
    # 从消息中获取用户选择的模板
    template = message.get("template", "default")
    
    # 创建或获取适配器
    adapter = get_or_create_adapter()
    
    # 切换模板
    adapter.set_prompt_template(template=template)
    
    # 处理图像...
```

---

## 模板选择建议

- **日常使用**：`default` - 平衡了详细程度和响应速度
- **需要详细描述**：`detailed` - 提供更多细节，帮助用户更好地理解场景
- **快速了解**：`concise` - 一句话快速了解主要内容
- **需要导航**：`location_aware` - 强调位置关系，适合需要了解空间布局的场景
- **感受氛围**：`scene_atmosphere` - 描述场景的氛围和感觉

---

## 注意事项

1. **模板切换是即时的**：切换后，下一次调用 `generate_description()` 就会使用新模板
2. **配置优先级**：代码中指定的参数 > 配置文件 > 默认值
3. **模板不存在**：如果指定的模板不存在，会回退到默认模板并记录警告日志
4. **性能影响**：切换模板本身没有性能开销，只是改变了提示词内容


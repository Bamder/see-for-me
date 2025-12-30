# 配置文件说明

## 配置优先级

配置加载优先级（从高到低）：
1. **环境变量** - 运行时环境变量（最高优先级）
2. **.env 文件** - 本地环境配置文件
3. **YAML 配置文件** - `server/config/app.yaml`（默认配置）

## 应用配置 (`app.yaml`)

`app.yaml` 是应用的主配置文件，包含所有可配置项：

- **服务器配置**：host、port、reload
- **视觉模型配置**：YOLOv8 参数、性能设置
- **语言模型配置**：Flan-T5 参数、超时设置、提示词配置

### 使用示例

```yaml
# 修改语言模型超时时间
language:
  response_timeout: 5.0  # 改为 5 秒
  response_warn_threshold: 2.0  # 改为 2 秒发送"稍等"
```

### 环境变量覆盖

如果需要临时覆盖配置，可以使用环境变量：

```bash
# 覆盖语言模型超时
export LANGUAGE_RESPONSE_TIMEOUT=5.0

# 覆盖视觉模型置信度阈值
export VISION_YOLO_CONFIDENCE_THRESHOLD=0.3
```

## COCO 类别中英文对照表

`coco_classes_zh_en.yaml` 文件包含了 COCO 数据集 80 个类别的中英文对照映射，用于 YOLOv8 识别结果的中英文翻译。

### 文件位置

- **默认路径**: `server/config/coco_classes_zh_en.yaml`
- **自定义路径**: 可以通过 `YOLOv8nAdapter` 的 `class_mapping_file` 参数指定

### 文件格式

```yaml
mapping:
  person: 人
  bicycle: 自行车
  car: 汽车
  # ... 更多映射

defaults:
  fallback_format: "{en} ({zh})"  # 找不到映射时的格式
  unknown_zh: "未知物体"  # 未知物体的中文名称
```

### 使用方法

#### 1. 默认使用（自动加载）

```python
from app.services.ai_models.vision import YOLOv8nAdapter

# 自动从 server/config/coco_classes_zh_en.yaml 加载映射
model = YOLOv8nAdapter(use_chinese=True)  # 默认启用中文
```

#### 2. 自定义配置文件路径

```python
model = YOLOv8nAdapter(
    class_mapping_file="/path/to/your/mapping.yaml",
    use_chinese=True
)
```

#### 3. 禁用中文翻译

```python
model = YOLOv8nAdapter(use_chinese=False)  # 只返回英文名称
```

### 返回结果格式

启用中文翻译后，检测结果会包含以下字段：

```python
{
    "class": "人",           # 中文名称（如果启用）
    "class_en": "person",    # 英文名称（始终保留）
    "class_id": 0,          # 类别 ID
    "confidence": 0.95,     # 置信度
    "bbox": [x1, y1, x2, y2] # 边界框坐标
}
```

### 修改映射

如果需要修改或添加新的类别映射，直接编辑 `coco_classes_zh_en.yaml` 文件：

```yaml
mapping:
  person: 人
  bicycle: 自行车
  # 添加新映射
  new_class: 新类别
```

修改后重启服务器即可生效。

### 注意事项

1. 配置文件使用 UTF-8 编码
2. 如果配置文件不存在或加载失败，将只使用英文名称
3. 如果某个类别找不到映射，会使用 `defaults.fallback_format` 格式
4. 英文名称始终保留在 `class_en` 字段中，方便后续处理


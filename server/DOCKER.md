# Docker 部署指南

本文档说明如何使用 Docker 部署 SeeForMe 服务器。

## 📋 前置要求

- Docker 20.10+
- Docker Compose 2.0+（可选，用于 docker-compose）
- 至少 4GB 可用内存
- 至少 2GB 可用磁盘空间（用于镜像和模型）

## 🚀 快速开始

### 方式一：使用 Docker Compose（推荐）

```bash
cd server

# 构建并启动服务
docker-compose up -d

# 查看日志
docker-compose logs -f

# 停止服务
docker-compose down
```

### 方式二：使用 Docker 命令

```bash
cd server

# 构建镜像
docker build -t seeforme-server:latest .

# 运行容器
docker run -d \
  --name seeforme-server \
  -p 8000:8000 \
  -v $(pwd)/models:/app/models:ro \
  -v $(pwd)/config:/app/config:ro \
  -v $(pwd)/prompts:/app/prompts:ro \
  seeforme-server:latest

# 查看日志
docker logs -f seeforme-server

# 停止容器
docker stop seeforme-server
docker rm seeforme-server
```

## 📦 模型文件处理

### 选项 1：通过卷挂载（推荐）

将模型文件放在 `server/models/` 目录，然后通过卷挂载到容器：

```yaml
volumes:
  - ./models:/app/models:ro
```

**优点**：
- 模型文件不包含在镜像中，镜像体积小
- 可以随时更新模型文件，无需重建镜像
- 多个容器可以共享同一份模型文件

### 选项 2：构建时包含（不推荐）

如果需要将模型文件打包到镜像中，修改 Dockerfile：

```dockerfile
# 在 COPY prompts 之后添加
COPY models ./models
```

**注意**：这会导致镜像体积非常大（几 GB），构建和推送时间较长。

### 选项 3：运行时下载

容器启动后，模型会自动下载到 `/app/models/` 目录。

**注意**：容器重启后，如果使用临时存储，模型文件会丢失。

## ⚙️ 配置说明

### 环境变量

可以通过环境变量覆盖配置：

```bash
docker run -d \
  --name seeforme-server \
  -p 8000:8000 \
  -e HOST=0.0.0.0 \
  -e PORT=8000 \
  -e QWEN_API_KEY=your_api_key \
  seeforme-server:latest
```

或在 `docker-compose.yml` 中设置：

```yaml
environment:
  - HOST=0.0.0.0
  - PORT=8000
  - QWEN_API_KEY=${QWEN_API_KEY}
```

### 配置文件

配置文件通过卷挂载：

```yaml
volumes:
  - ./config:/app/config:ro
```

修改 `server/config/app.yaml` 后，重启容器即可生效。

## 🔍 健康检查

容器包含健康检查，可以通过以下命令查看：

```bash
# 查看容器状态
docker ps

# 查看健康检查详情
docker inspect --format='{{json .State.Health}}' seeforme-server | jq
```

健康检查端点：`http://localhost:8000/api/v1/health`

## 📊 资源限制

默认资源限制（可在 `docker-compose.yml` 中调整）：

- **CPU**: 最多 2 核，保留 0.5 核
- **内存**: 最多 4GB，保留 1GB

根据实际需求调整：

```yaml
deploy:
  resources:
    limits:
      cpus: '4.0'      # 根据服务器配置调整
      memory: 8G      # 根据可用内存调整
    reservations:
      cpus: '1.0'
      memory: 2G
```

## 🔧 故障排查

### 容器无法启动

```bash
# 查看容器日志
docker logs seeforme-server

# 查看详细错误
docker logs seeforme-server 2>&1 | tail -50
```

### 模型文件未找到

```bash
# 检查卷挂载
docker inspect seeforme-server | grep -A 10 Mounts

# 检查模型目录
docker exec seeforme-server ls -la /app/models
```

### 端口被占用

```bash
# 检查端口占用
netstat -tuln | grep 8000
# 或
lsof -i :8000

# 修改端口映射
docker run -p 8001:8000 seeforme-server:latest
```

### 内存不足

```bash
# 查看容器资源使用
docker stats seeforme-server

# 增加内存限制
# 在 docker-compose.yml 中调整 memory 限制
```

## 🐳 生产环境部署

### 1. 使用多阶段构建（可选）

创建 `Dockerfile.prod` 优化镜像大小：

```dockerfile
# 构建阶段
FROM python:3.11-slim as builder
WORKDIR /app
COPY requirements.txt .
RUN pip install --user --no-cache-dir -r requirements.txt

# 运行阶段
FROM python:3.11-slim
WORKDIR /app
COPY --from=builder /root/.local /root/.local
COPY app ./app
COPY config ./config
COPY prompts ./prompts
ENV PATH=/root/.local/bin:$PATH
# ... 其余配置
```

### 2. 使用 Docker Secrets（敏感信息）

```yaml
services:
  api:
    secrets:
      - qwen_api_key
secrets:
  qwen_api_key:
    file: ./secrets/qwen_api_key.txt
```

### 3. 使用 Docker Swarm 或 Kubernetes

对于生产环境，建议使用：
- **Docker Swarm**：简单的容器编排
- **Kubernetes**：更强大的容器编排（需要额外的配置文件）

## 📝 常用命令

```bash
# 构建镜像
docker build -t seeforme-server:latest .

# 运行容器（前台）
docker run -p 8000:8000 seeforme-server:latest

# 运行容器（后台）
docker run -d -p 8000:8000 --name seeforme-server seeforme-server:latest

# 查看日志
docker logs -f seeforme-server

# 进入容器
docker exec -it seeforme-server bash

# 停止容器
docker stop seeforme-server

# 删除容器
docker rm seeforme-server

# 删除镜像
docker rmi seeforme-server:latest

# 清理未使用的资源
docker system prune -a
```

## 🔐 安全建议

1. **使用非 root 用户**：Dockerfile 已配置使用 `appuser` 用户运行
2. **只读卷挂载**：配置文件使用 `:ro` 只读挂载
3. **最小权限**：只暴露必要的端口
4. **定期更新**：定期更新基础镜像和依赖
5. **扫描漏洞**：使用 `docker scan` 扫描镜像漏洞

```bash
# 扫描镜像
docker scan seeforme-server:latest
```

## 📚 相关文档

- [Docker 官方文档](https://docs.docker.com/)
- [Docker Compose 文档](https://docs.docker.com/compose/)
- [服务器配置文档](README.md)

---

*最后更新：2024年*


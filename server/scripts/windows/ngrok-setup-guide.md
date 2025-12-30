# ngrok 设置指南

## 错误 ERR_NGROK_15013 解决方案

如果遇到错误：`Your account is requesting a dev domain that does not exist`

这是因为 ngrok 免费版需要先在 dashboard 请求一个 dev domain。

### 解决步骤

1. **访问 ngrok Dashboard**
   - 打开浏览器访问：https://dashboard.ngrok.com/domains

2. **请求 Dev Domain**
   - 点击 "Request Domain" 或 "Get Started" 按钮
   - 选择一个免费的 dev domain（例如：`xxx.ngrok-free.app`）
   - 确认请求

3. **等待批准**
   - 免费版 dev domain 通常会自动批准（几秒钟内）
   - 如果看到 "Active" 状态，说明已成功

4. **重新运行脚本**
   - 返回运行 `setup-ngrok-tunnel.bat`
   - 现在应该可以正常启动了

### 完整设置流程

1. **注册 ngrok 账号**
   - 访问：https://dashboard.ngrok.com/signup
   - 注册免费账号

2. **获取 Authtoken**
   - 访问：https://dashboard.ngrok.com/get-started/your-authtoken
   - 复制您的 authtoken

3. **配置 Authtoken**
   - 运行：`ngrok config add-authtoken <your-token>`
   - 或使用脚本：`setup-ngrok-tunnel.bat`

4. **请求 Dev Domain**（重要！）
   - 访问：https://dashboard.ngrok.com/domains
   - 请求一个免费的 dev domain

5. **启动隧道**
   - 运行：`ngrok http 8000`
   - 或使用脚本：`setup-ngrok-tunnel.bat`

### 常见问题

**Q: 请求 dev domain 需要多长时间？**
A: 免费版通常是立即批准的，只需几秒钟。

**Q: 可以请求多个 dev domain 吗？**
A: 免费版通常只能请求一个 dev domain。

**Q: dev domain 是固定的吗？**
A: 是的，一旦批准，这个 domain 就是您的，不会变化（除非您删除它）。

**Q: 每次启动 URL 还会变化吗？**
A: 使用 dev domain 后，URL 格式会是 `https://您的dev-domain.ngrok-free.app`，但仍然可能有一些随机后缀。如果需要完全固定的 URL，需要升级到付费版。

### 替代方案

如果不想使用 ngrok，可以考虑：

1. **frp** - 需要自建服务器
2. **手机热点** - 临时方案，绕过客户端隔离
3. **其他内网穿透工具** - 如 Cloudflare Tunnel、localtunnel 等


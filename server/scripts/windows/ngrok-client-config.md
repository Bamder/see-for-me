# ngrok 客户端配置指南

## 获取 ngrok 公网 URL

启动 ngrok 后，可以通过以下方式获取公网 URL：

1. **查看脚本输出**（推荐）
   - 运行 `setup-ngrok-tunnel.bat` 后，脚本会自动显示 URL

2. **查看 ngrok 窗口**
   - 查找 "Forwarding" 行，例如：
     ```
     Forwarding  https://abcd1234.ngrok-free.app -> http://localhost:8000
     ```

3. **访问 Web 界面**
   - 浏览器打开：http://127.0.0.1:4040
   - 可以看到完整的隧道信息

## 客户端配置

### 在移动应用设置界面配置

1. **打开应用设置**
   - 在应用中打开"设置"界面
   - 找到"服务器配置"部分

2. **配置 HTTP 地址**
   - 找到"HTTP 服务器地址"输入框
   - 填入 ngrok 提供的 HTTPS URL
   - **示例**：`https://abcd1234.ngrok-free.app`

3. **配置 WebSocket 地址**
   - 找到"WebSocket 地址"输入框
   - 将 HTTP URL 中的 `https://` 改为 `wss://`
   - 在末尾添加 `/ws` 路径
   - **示例**：`wss://abcd1234.ngrok-free.app/ws`

4. **保存配置**
   - 点击输入框外部，配置会自动保存并生效
   - 无需重启应用

### 配置示例

假设 ngrok 提供的 URL 是：`https://abcd1234.ngrok-free.app`

则在移动应用中配置：

```
HTTP 服务器地址:
https://abcd1234.ngrok-free.app

WebSocket 地址:
wss://abcd1234.ngrok-free.app/ws
```

### 重要提示

- ✅ **HTTP 地址**：直接使用 ngrok 提供的 HTTPS URL
- ✅ **WebSocket 地址**：
  - 将 `https://` 改为 `wss://`（安全 WebSocket）
  - 或者如果是 HTTP 则改为 `ws://`
  - 末尾添加 `/ws` 路径
- ⚠️  **注意**：WebSocket 必须使用 `wss://`（HTTPS）或 `ws://`（HTTP），不能混用

### 快速转换公式

```
如果 ngrok URL 是: https://xxxx.ngrok.io
则:
  HTTP:       https://xxxx.ngrok.io
  WebSocket:  wss://xxxx.ngrok.io/ws

如果 ngrok URL 是: http://xxxx.ngrok.io（较少见）
则:
  HTTP:       http://xxxx.ngrok.io
  WebSocket:  ws://xxxx.ngrok.io/ws
```

## 验证配置

配置完成后：

1. 返回应用主界面
2. 尝试连接服务器（如触发拍照功能）
3. 查看连接状态
4. 如果连接失败，检查：
   - URL 是否正确（特别是 `wss://` vs `ws://`）
   - ngrok 隧道是否还在运行
   - 服务器是否正在运行（端口 8000）

## 常见问题

**Q: WebSocket 连接失败怎么办？**
A: 检查是否正确使用 `wss://`（HTTPS）或 `ws://`（HTTP），并确保末尾有 `/ws` 路径。

**Q: 为什么必须用 wss:// 而不是 ws://？**
A: 因为 ngrok 通常提供 HTTPS URL（https://），对应的 WebSocket 必须使用 WSS（wss://）才能建立安全连接。

**Q: URL 每次启动都变化吗？**
A: 免费版 ngrok 的 URL 可能会变化，但如果您请求了 dev domain，URL 会更稳定。

**Q: 如何固定 URL？**
A: 需要升级到 ngrok 付费版才能获得固定的域名。


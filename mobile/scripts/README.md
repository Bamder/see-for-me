# 移动端开发脚本说明

本文档说明 `mobile/scripts/` 目录下所有脚本的使用方法、使用时机和使用顺序。

## 目录结构

```
mobile/scripts/
├── deps/                    # 依赖管理脚本
│   └── fix-dependencies.bat # 修复依赖版本
└── dev/                     # 开发环境脚本
    ├── setup-android-studio.bat    # Android环境检查
    ├── build-android-local.bat    # Android本地构建（自动处理TTS依赖）
    ├── start-dev.bat              # 真机调试启动（LAN模式）
    └── start-dev-tunnel.bat       # 真机调试启动（Tunnel模式）
```

---

## 一、依赖管理脚本 (deps/)

### 1. fix-dependencies.bat

**功能：** 检查并修复Expo项目依赖版本兼容性问题

**使用时机：**
- 升级Expo SDK后
- 安装新依赖后出现版本冲突
- 构建失败提示依赖版本不兼容
- 定期维护时

**使用方法：**
```cmd
cd mobile
scripts\deps\fix-dependencies.bat
```

**说明：**
- 使用 `npx expo install --check` 检查依赖版本
- 自动修复不兼容的依赖版本
- 修复后需要运行 `npm install` 安装修复后的版本

**使用顺序：**
1. 运行 `fix-dependencies.bat`
2. 运行 `npm install`
3. 重新构建项目

---

## 二、开发环境脚本 (dev/)

### 1. setup-android-studio.bat

**功能：** 检查和配置Android Studio开发环境

**使用时机：**
- 首次设置Android开发环境
- Android构建失败，需要检查环境
- 更换电脑或重新安装Android Studio后

**使用方法：**
```cmd
cd mobile
scripts\dev\setup-android-studio.bat
```

**检查内容：**
- ✅ Android SDK路径（ANDROID_HOME）
- ✅ ADB工具是否可用
- ✅ Java版本（需要JDK 17+）
- ✅ 设备连接状态

**说明：**
- 如果环境变量未设置，脚本会提供设置建议
- 不会自动设置环境变量，需要手动配置

**使用顺序：**
1. 安装Android Studio
2. 运行 `setup-android-studio.bat` 检查环境
3. 根据提示设置环境变量（如果需要）
4. 运行 `build-android-local.bat` 构建应用

---

### 2. build-android-local.bat

**功能：** 在本地构建Android应用并安装到设备

**使用时机：**
- 首次构建Android应用
- 修改原生代码后需要重新构建
- 需要安装到真机进行测试

**使用方法：**
```cmd
cd mobile
scripts\dev\build-android-local.bat
```

**前置条件：**
- ✅ 已设置ANDROID_HOME环境变量
- ✅ 手机已通过USB连接
- ✅ 已启用USB调试并授权电脑

**执行步骤：**
1. 检查Android环境
2. 检查设备连接
3. 生成原生项目（如果不存在）
4. 构建并安装到设备

**使用顺序：**
1. 运行 `setup-android-studio.bat` 确保环境正确
2. 连接手机并启用USB调试
3. 运行 `build-android-local.bat` 构建并安装
4. 运行 `start-dev.bat` 或 `start-dev-tunnel.bat` 启动开发服务器

---

### 3. start-dev.bat

**功能：** 启动Expo开发服务器（LAN模式，用于真机调试）

**使用时机：**
- 应用已安装到真机
- 需要热重载开发
- 手机和电脑在同一局域网

**使用方法：**
```cmd
cd mobile
scripts\dev\start-dev.bat
```

**功能特点：**
- 自动检测可用网络接口
- 自动设置服务器地址环境变量
- 使用LAN模式，手机通过局域网连接

**前置条件：**
- ✅ 手机和电脑在同一WiFi或手机热点
- ✅ 后端服务器正在运行（端口8000）
- ✅ 防火墙允许端口8000和8081

**使用顺序：**
1. 运行 `build-android-local.bat` 安装应用到手机
2. 启动后端服务器（端口8000）
3. 运行 `start-dev.bat` 启动开发服务器
4. 在手机上打开应用，自动连接到开发服务器

---

### 4. start-dev-tunnel.bat

**功能：** 启动Expo开发服务器（Tunnel模式，通过Expo服务器中转）

**使用时机：**
- 手机和电脑不在同一网络
- LAN模式连接失败
- 网络受限环境（如公司网络）
- 使用移动网络

**使用方法：**
```cmd
cd mobile
scripts\dev\start-dev-tunnel.bat
```

**功能特点：**
- 通过Expo服务器中转连接
- 无需配置IP地址
- 自动穿透防火墙
- 需要稳定的互联网连接

**说明：**
- Tunnel模式主要用于Expo开发服务器连接
- 后端服务器地址仍需要配置（如果使用）
- 连接速度可能比LAN模式慢

**使用顺序：**
1. 运行 `build-android-local.bat` 安装应用到手机
2. 启动后端服务器（端口8000）
3. 运行 `start-dev-tunnel.bat` 启动开发服务器（Tunnel模式）
4. 在手机上打开应用，扫描二维码或输入URL连接

---

## 完整开发流程

### 首次设置（新项目）

1. **设置Android环境**
   ```cmd
   scripts\dev\setup-android-studio.bat
   ```

2. **构建并安装应用**
   ```cmd
   scripts\dev\build-android-local.bat
   ```

3. **启动开发服务器**
   ```cmd
   scripts\dev\start-dev.bat
   # 或
   scripts\dev\start-dev-tunnel.bat
   ```

### 日常开发流程

1. **启动后端服务器**（端口8000）

2. **启动开发服务器**
   ```cmd
   scripts\dev\start-dev.bat
   # 或
   scripts\dev\start-dev-tunnel.bat
   ```

3. **在手机上打开应用**，自动连接开发服务器

4. **修改代码**，应用自动热重载

### 修改原生代码后

1. **重新构建应用**
   ```cmd
   scripts\dev\build-android-local.bat
   ```

2. **启动开发服务器**
   ```cmd
   scripts\dev\start-dev.bat
   ```

### 依赖版本冲突时

1. **修复依赖版本**
   ```cmd
   scripts\deps\fix-dependencies.bat
   ```

2. **安装修复后的依赖**
   ```cmd
   npm install
   ```

3. **重新构建**
   ```cmd
   scripts\dev\build-android-local.bat
   ```

---

---

## 技术支持

如果遇到问题：
1. 查看错误信息
2. 检查网络连接
3. 查看相关文档

---

**最后更新：** 2024-12-24

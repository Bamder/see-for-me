import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, Text, StatusBar, Alert, Linking, Platform, TouchableOpacity, ScrollView } from 'react-native';
import { useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import { StateManagerModule, useStateContext } from '../modules/StateManagerModule';
import { CameraModule } from '../modules/CameraModule/CameraModule';
import { gestureHandlerModule } from '../modules/GestureHandlerModule/GestureHandlerModule';
import { CommunicationModule } from '../modules/CommunicationModule/CommunicationModule';
import { TTSModule } from '../modules/TTSModule';
import { CameraPreview } from '../components/camera/CameraPreview';
import { eventBus } from '../core/eventBus/EventBus';
import { API_BASE_PATH, SERVER_HTTP_URL, SERVER_WS_URL } from '../utils/constants';
import { getServerConfigState, hydrateServerConfigStore, useServerConfigStore } from '../stores/useServerConfigStore';

export default function HomeScreen() {
  const [appStatus, setAppStatus] = useState('initializing');
  const [cameraPermissionDenied, setCameraPermissionDenied] = useState(false);
  const [analysisText, setAnalysisText] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<string>('disconnected');
  const [isReconnecting, setIsReconnecting] = useState(false);
  const { serverHttpUrl, serverWsUrl } = useServerConfigStore();
  const { state, dispatch } = useStateContext();
  const router = useRouter();
  
  // 使用 expo-camera v17 的权限 hook
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  
  const cameraModuleRef = useRef<CameraModule | undefined>(undefined);
  const commModuleRef = useRef<CommunicationModule | undefined>(undefined);
  const ttsModuleRef = useRef<TTSModule | undefined>(undefined);
  const stateManagerRef = useRef<StateManagerModule | undefined>(undefined);
  const isInitializedRef = useRef(false);
  const isStartingRef = useRef(false);
  const cameraRef = useRef<any>(null);
  const cameraReadyLoggedRef = useRef(false);

  useEffect(() => {
    // 检查相机权限状态
    console.log('📷 相机权限状态更新:', cameraPermission);
    
    if (cameraPermission) {
      if (!cameraPermission.granted && cameraPermission.canAskAgain) {
        // 自动请求权限
        console.log('📷 自动请求相机权限...');
        requestCameraPermission();
      } else if (!cameraPermission.granted && !cameraPermission.canAskAgain) {
        // 权限被永久拒绝
        console.log('❌ 相机权限被永久拒绝');
        setCameraPermissionDenied(true);
      } else if (cameraPermission.granted) {
        console.log('✅ 相机权限已授予');
        setCameraPermissionDenied(false);
      }
    } else {
      console.log('📷 权限状态未加载');
    }
  }, [cameraPermission]);

  useEffect(() => {
    // 只有在权限已授予时才初始化应用；防止重复初始化
    if (cameraPermission?.granted && !isInitializedRef.current && !isStartingRef.current) {
      initializeApp();
    } else if (cameraPermission && !cameraPermission.granted && !cameraPermission.canAskAgain) {
      // 权限被永久拒绝，显示提示
      setCameraPermissionDenied(true);
    }
    
    // 监听相机权限被拒绝事件
    const subscriptionId = eventBus.subscribe('camera:permission_denied', (data: any) => {
      setCameraPermissionDenied(true);
      showPermissionAlert(data.message, data.canAskAgain);
    });
    
    return () => {
      cleanupApp().catch(console.error);
      // 正确取消订阅：使用 unsubscribe 方法
      if (subscriptionId) {
        eventBus.unsubscribe('camera:permission_denied', subscriptionId);
      }
    };
  }, [cameraPermission?.granted]);

  // 订阅通信模块的结果（包括 MockServer）并在首页显示
  useEffect(() => {
    const subscriptionId = eventBus.subscribe('communication:message_received', (data: any) => {
      if (data.type === 'text_stream') {
        setIsStreaming(true);
        setAnalysisText(prev => (prev ? prev + '\n' + data.content : data.content));
      } else if (data.type === 'final_result') {
        setIsStreaming(false);
        setAnalysisText(data.content);
      }
    });

    return () => {
      if (subscriptionId) {
        eventBus.unsubscribe('communication:message_received', subscriptionId);
      }
    };
  }, []);

  // 订阅连接状态变化
  useEffect(() => {
    const statusSubId = eventBus.subscribe('communication:status_changed', (data: any) => {
      setConnectionStatus(data.status || 'disconnected');
    });

    const connectedSubId = eventBus.subscribe('communication:websocket_connected', () => {
      setConnectionStatus('connected');
      setIsReconnecting(false);
    });

    const disconnectedSubId = eventBus.subscribe('communication:websocket_disconnected', () => {
      setConnectionStatus('disconnected');
      setIsReconnecting(false);
    });

    // 定期检查连接状态
    const statusCheckInterval = setInterval(() => {
      if (commModuleRef.current) {
        const status = commModuleRef.current.getConnectionStatus();
        setConnectionStatus(status);
      }
    }, 1000);

    return () => {
      if (statusSubId) eventBus.unsubscribe('communication:status_changed', statusSubId);
      if (connectedSubId) eventBus.unsubscribe('communication:websocket_connected', connectedSubId);
      if (disconnectedSubId) eventBus.unsubscribe('communication:websocket_disconnected', disconnectedSubId);
      clearInterval(statusCheckInterval);
    };
  }, []);

  const showPermissionAlert = (message: string, canAskAgain: boolean) => {
    Alert.alert(
      '需要相机权限',
      message,
      [
        {
          text: '取消',
          style: 'cancel'
        },
        {
          text: '打开设置',
          onPress: () => {
            if (Platform.OS === 'android') {
              Linking.openSettings();
            } else {
              Linking.openURL('app-settings:');
            }
          }
        }
      ]
    );
  };

  const initializeApp = async () => {
    try {
      isStartingRef.current = true;
      setAppStatus('initializing');
      
      // 优先恢复持久化的服务器配置
      await hydrateServerConfigStore();

      // 1. 初始化状态管理器
      stateManagerRef.current = StateManagerModule.getInstance();
      await stateManagerRef.current.initialize();
      
      // 2. 初始化各模块
      cameraModuleRef.current = new CameraModule();
      // 设置跳过权限检查，因为权限已在组件层面通过 hook 处理
      cameraModuleRef.current.setSkipPermissionCheck(true);
      // 设置相机引用
      cameraModuleRef.current.setCameraRef(cameraRef);
      
      // 真机调试：服务器地址优先使用持久化/设置页输入，其次使用全局默认配置
      const { serverHttpUrl: latestHttp, serverWsUrl: latestWs } = getServerConfigState();
      const serverUrl = latestHttp || SERVER_HTTP_URL;
      const wsUrl = latestWs || SERVER_WS_URL;
      
      // 输出配置信息用于调试
      console.log('🔧 服务器配置:');
      console.log('  HTTP URL:', serverUrl);
      console.log('  WebSocket URL:', wsUrl);
      
      // 检查是否使用 localhost（真机调试时会有问题）
      const isLocalhost = serverUrl.includes('localhost') || serverUrl.includes('127.0.0.1');
      if (isLocalhost) {
        console.warn('  ⚠️ 警告：检测到使用 localhost 地址');
        console.warn('     在真机调试时，localhost 无法连接到电脑上的服务器');
        console.warn('     请在设置页面配置正确的IP地址，或使用启动脚本设置环境变量');
      }
      
      console.log('  📋 连接检查清单：');
      console.log('    1. ✅ 后端服务器是否运行在端口 8000');
      console.log('    2. ✅ IP 地址是否正确（使用 ipconfig/ifconfig 查看）');
      console.log('    3. ✅ 防火墙是否允许端口 8000');
      console.log('    4. ✅ 手机和电脑是否在同一网络（WiFi 或手机热点）');
      console.log('    5. ✅ 服务器是否监听在 0.0.0.0（而不是 127.0.0.1）');
      
      commModuleRef.current = CommunicationModule.getInstance({
        server: {
          websocketUrl: wsUrl,
          httpUrl: serverUrl,
          basePath: '/api/v1'
        }
      });

      // 3. 初始化TTS模块
      // 禁用离线模型，使用系统TTS
      ttsModuleRef.current = TTSModule.getInstance({
        enabled: true,
        autoPlay: true,
        useOfflineModel: false, // 禁用离线模型，使用系统TTS
        streaming: {
          enabled: true,
          sentenceBuffer: 3,
          maxQueueSize: 10
        }
      });
      ttsModuleRef.current.setStateManager(stateManagerRef.current);

      // 4. 设置模块依赖
      cameraModuleRef.current.setStateManager(stateManagerRef.current);
      gestureHandlerModule.setStateManager(stateManagerRef.current!);
      commModuleRef.current.setStateManager(stateManagerRef.current);

      // 5. 启动各模块
      const cameraStarted = await cameraModuleRef.current.startPreview();
      if (!cameraStarted) {
        console.warn('⚠️ 相机启动失败，可能是权限问题');
        // 权限问题会在事件中处理
      }
      await gestureHandlerModule.startRecognition();
      await commModuleRef.current.start();
      
      // 启动TTS模块（异步，不阻塞主流程）
      ttsModuleRef.current.start().catch((error) => {
        console.warn('⚠️ TTS模块启动失败，将使用回退模式:', error);
      });

      setAppStatus('ready');
      isInitializedRef.current = true;
      console.log('🎯 应用初始化完成，准备就绪');

    } catch (error) {
      setAppStatus('error');
      console.error('应用初始化失败:', error);
    } finally {
      isStartingRef.current = false;
    }
  };

  const cleanupApp = async () => {
    await cameraModuleRef.current?.stopPreview();
    await gestureHandlerModule.stopRecognition();
    await commModuleRef.current?.stop();
    await ttsModuleRef.current?.destroy();
  };

  const handleCaptureButtonPress = () => {
    // 通过事件总线触发与手势相同的拍照流程
    eventBus.emit('gesture:double_tap', { x: 0, y: 0 });
  };

  const handleReconnect = async () => {
    if (!commModuleRef.current || isReconnecting) {
      return;
    }

    setIsReconnecting(true);
    try {
      await commModuleRef.current.manualReconnect();
      console.log('✅ 手动重连成功');
    } catch (error) {
      console.error('❌ 手动重连失败:', error);
      Alert.alert('重连失败', '无法连接到服务器，请检查网络和服务器配置');
    } finally {
      setIsReconnecting(false);
    }
  };

  // TTS测试函数
  const handleTTSTest = async () => {
    if (!ttsModuleRef.current) {
      Alert.alert('TTS模块未初始化', '请等待应用初始化完成');
      return;
    }

    const testText = '这是一个TTS功能测试。如果你能听到这段语音，说明TTS模块工作正常。';
    console.log('🔊 开始TTS测试:', testText);

    try {
      // 通过事件总线触发TTS（模拟识别结果）
      eventBus.emit('communication:message_received', {
        type: 'final_result',
        content: testText,
        sessionId: 'tts-test-' + Date.now()
      });
      
      Alert.alert('TTS测试', `已发送测试文本: "${testText.substring(0, 20)}..."\n\n请查看控制台日志。`);
    } catch (error) {
      console.error('❌ TTS测试失败:', error);
      Alert.alert('TTS测试失败', error instanceof Error ? error.message : '未知错误');
    }
  };

  // 提取服务器IP地址用于显示（与设置页面相同的方式）
  const getServerIp = () => {
    // 优先使用WebSocket地址，其次HTTP地址，最后使用默认值
    const url = serverWsUrl || serverHttpUrl || SERVER_WS_URL;
    if (!url || url === '') {
      return '未配置';
    }
    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname;
      // 如果是localhost，显示为"本地"
      if (hostname === 'localhost' || hostname === '127.0.0.1') {
        return '本地';
      }
      return hostname;
    } catch {
      // 如果不是完整URL，尝试提取IP
      const match = url.match(/(\d+\.\d+\.\d+\.\d+)/);
      return match ? match[1] : url.substring(0, 20); // 显示前20个字符
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar translucent backgroundColor="transparent" />
      
      {/* 服务器IP显示栏（最上端），包含重连和设置按钮 */}
      <View style={styles.serverIpBar}>
        {/* 左侧重连按钮 */}
        <TouchableOpacity
          onPress={handleReconnect}
          style={[styles.reconnectButton, isReconnecting && styles.reconnectButtonDisabled]}
          disabled={isReconnecting}
          accessibilityLabel="重新连接"
        >
          <Text style={styles.reconnectButtonText}>
            {isReconnecting ? '连接中...' : '重连'}
          </Text>
        </TouchableOpacity>

        {/* 中间IP文本 */}
        <Text style={styles.serverIpText}>服务器: {getServerIp()}</Text>

        {/* 中间：TTS测试按钮（调试用） */}
        <TouchableOpacity
          onPress={handleTTSTest}
          style={[styles.settingsButton, { marginHorizontal: 8, backgroundColor: '#4CAF50' }]}
          accessibilityLabel="测试TTS"
        >
          <Text style={styles.settingsButtonText}>TTS测试</Text>
        </TouchableOpacity>

        {/* 右侧设置按钮 */}
        <TouchableOpacity
          onPress={() => router.push('/settings')}
          style={styles.settingsButton}
          accessibilityLabel="打开设置"
        >
          <Text style={styles.settingsButtonText}>设置</Text>
        </TouchableOpacity>
      </View>

      {/* 状态显示栏 */}
      <View style={styles.statusBar}>
        <Text style={styles.statusText}>
          状态: {appStatus} | 触发: {state.triggerEnabled ? '启用' : '禁用'} | 
          连接: {connectionStatus}
        </Text>
      </View>

      {/* 相机预览区域 */}
      <View style={styles.cameraContainer}>
        {!cameraPermission ? (
          <View style={styles.permissionContainer}>
            <Text style={styles.permissionTitle}>📷 正在检查权限...</Text>
            <Text style={styles.permissionText}>请稍候</Text>
          </View>
        ) : cameraPermissionDenied || (!cameraPermission.granted && !cameraPermission.canAskAgain) ? (
          <View style={styles.permissionContainer}>
            <Text style={styles.permissionTitle}>📷 需要相机权限</Text>
            <Text style={styles.permissionText}>
              应用需要访问相机才能正常工作
            </Text>
            <Text style={styles.permissionText}>
              请前往设置授予相机权限
            </Text>
            <Text style={styles.permissionHint}>
              Android: 设置 → 应用 → mobile → 权限 → 相机
            </Text>
            <Text style={styles.permissionHint}>
              iOS: 设置 → mobile → 相机
            </Text>
          </View>
        ) : !cameraPermission.granted ? (
          <View style={styles.permissionContainer}>
            <Text style={styles.permissionTitle}>📷 等待权限授予</Text>
            <Text style={styles.permissionText}>
              请在弹出的对话框中允许访问相机
            </Text>
          </View>
        ) : (
          <CameraPreview 
            cameraRef={cameraRef}
            onCameraReady={(ref) => {
              if (!cameraReadyLoggedRef.current) {
                cameraReadyLoggedRef.current = true;
                console.log('📷 相机组件已准备好');
              }
              cameraModuleRef.current?.setCameraRef(ref);
            }}
          />
        )}
      </View>

      {/* 文本结果展示（包括 Mock 分析结果） */}
      <View style={styles.resultContainer}>
        <View style={styles.resultTitleWrapper}>
          <Text style={styles.resultTitle}>
            识别结果{isStreaming ? '（接收中…）' : ''}
          </Text>
        </View>
        <ScrollView style={styles.resultScroll}>
          <Text style={styles.resultText}>
            {analysisText || '尚未有任何识别结果......'}
          </Text>
        </ScrollView>
      </View>

      {/* 底部大号拍照按钮 */}
      <View style={styles.captureButtonContainer}>
        <TouchableOpacity
          onPress={handleCaptureButtonPress}
          style={styles.captureButton}
          accessibilityLabel="拍照"
        >
          <Text style={styles.captureButtonText}>拍照</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// 获取状态栏高度
const getStatusBarHeight = () => {
  if (Platform.OS === 'ios') {
    return 44; // iOS状态栏高度
  }
  return StatusBar.currentHeight || 0; // Android状态栏高度
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  serverIpBar: {
    position: 'absolute',
    top: getStatusBarHeight(),
    left: 0,
    right: 0,
    backgroundColor: 'rgba(15,23,42,0.9)',
    paddingVertical: 10,
    paddingHorizontal: 16,
    zIndex: 1200,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  serverIpText: {
    color: '#E5E7EB',
    fontSize: 12,
    textAlign: 'center',
    fontWeight: '600',
    letterSpacing: 0.5,
    flex: 1,
    marginHorizontal: 8
  },
  reconnectButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(59,130,246,0.9)',
    borderWidth: 1,
    borderColor: 'rgba(96,165,250,0.6)'
  },
  reconnectButtonDisabled: {
    backgroundColor: 'rgba(100,116,139,0.7)',
    borderColor: 'rgba(148,163,184,0.4)'
  },
  reconnectButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '500'
  },
  settingsButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(15,23,42,0.9)',
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.6)'
  },
  settingsButtonText: {
    color: '#E5E7EB',
    fontSize: 12
  },
  statusBar: { 
    position: 'absolute', 
    top: getStatusBarHeight() + 50, 
    left: 0, 
    right: 0, 
    backgroundColor: 'rgba(0,0,0,0.7)', 
    padding: 10,
    zIndex: 1000
  },
  statusText: { color: '#fff', textAlign: 'center', fontSize: 12 },
  cameraContainer: { 
    flex: 1, 
    justifyContent: 'center', 
    alignItems: 'center',
    backgroundColor: '#333'
  },
  placeholderText: { color: '#fff', fontSize: 18, marginBottom: 20 },
  hintText: { color: '#ccc', fontSize: 14 },
  permissionContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20
  },
  permissionTitle: { 
    color: '#fff', 
    fontSize: 20, 
    fontWeight: 'bold',
    marginBottom: 15
  },
  permissionText: { 
    color: '#fff', 
    fontSize: 16, 
    textAlign: 'center',
    marginBottom: 10
  },
  permissionHint: {
    color: '#999',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 5
  },
  resultContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 90,
    paddingHorizontal: 16,
  },
  resultTitleWrapper: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    backgroundColor: 'rgba(30,38,57,0.75)',
    marginBottom: 0,
  },
  resultTitle: {
    color: '#E5E7EB',
    fontSize: 14,
  },
  resultScroll: {
    maxHeight: 100,
    borderBottomLeftRadius: 5,
    borderBottomRightRadius: 5,
    borderTopRightRadius: 5,
    backgroundColor: 'rgba(15,23,42,0.85)',
    padding: 8,
  },
  resultText: {
    color: '#E5E7EB',
    fontSize: 13,
  },
  captureButtonContainer: {
    position: 'absolute',
    bottom: 20,
    alignSelf: 'center'
  },
  captureButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#f97316',
    alignItems: 'center',
    justifyContent: 'center'
  },
  captureButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold'
  }
});
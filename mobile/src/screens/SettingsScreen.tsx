import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  ScrollView,
  TouchableOpacity
} from 'react-native';
import { SERVER_HTTP_URL, SERVER_WS_URL, API_BASE_PATH } from '../utils/constants';
import { hydrateServerConfigStore, useServerConfigStore } from '../stores/useServerConfigStore';
import { eventBus } from '../core/eventBus/EventBus';

// 设置界面
const SettingsScreen: React.FC = () => {
  const {
    serverHttpUrl,
    serverWsUrl,
    useMockServer,
    setServerHttpUrl,
    setServerWsUrl,
    setUseMockServer,
    resetToDefaults
  } = useServerConfigStore();

  const [isApplying, setIsApplying] = React.useState(false);
  const cooldownTimerRef = React.useRef<NodeJS.Timeout | null>(null);

  // 恢复持久化配置，确保 UI 与存储同步
  React.useEffect(() => {
    hydrateServerConfigStore();
  }, []);

  const releaseApplying = React.useCallback(() => {
    if (cooldownTimerRef.current) {
      clearTimeout(cooldownTimerRef.current);
      cooldownTimerRef.current = null;
    }
    setIsApplying(false);
  }, []);

  const startCooldown = React.useCallback(() => {
    setIsApplying(true);
    if (cooldownTimerRef.current) {
      clearTimeout(cooldownTimerRef.current);
    }
    // 冷却计时，超时自动释放，避免卡住
    cooldownTimerRef.current = setTimeout(() => {
      cooldownTimerRef.current = null;
      setIsApplying(false);
    }, 3000);
  }, []);

  // 监听通信模块反馈，收到后解除冷却
  React.useEffect(() => {
    const subscriptions: Array<{ name: any; id: string }> = [];

    const addSub = <T extends Parameters<typeof eventBus.subscribe>[0]>(
      name: T,
      cb: Parameters<typeof eventBus.subscribe>[1]
    ) => {
      const id = eventBus.subscribe(name as any, cb);
      subscriptions.push({ name, id });
    };

    addSub('communication:config_updated', () => releaseApplying());
    addSub('communication:status_changed', () => releaseApplying());

    return () => {
      subscriptions.forEach((sub) => {
        eventBus.unsubscribe(sub.name as any, sub.id);
      });
      if (cooldownTimerRef.current) {
        clearTimeout(cooldownTimerRef.current);
      }
    };
  }, [releaseApplying]);

  /**
   * 通知通信模块配置已更新（当IP地址或Mock模式改变时）
   */
  const notifyConfigUpdate = React.useCallback(() => {
    if (isApplying) return;
    
    startCooldown();
    
    // 通过事件总线通知通信模块进行在线切换
    eventBus.emit('config:communication_updated', {
      server: {
        websocketUrl: serverWsUrl || SERVER_WS_URL,
        httpUrl: serverHttpUrl || SERVER_HTTP_URL,
        basePath: API_BASE_PATH
      },
      runtime: {
        useMockServer: useMockServer
      }
    });
  }, [serverHttpUrl, serverWsUrl, useMockServer, isApplying, startCooldown]);

  /**
   * 处理HTTP地址输入完成（失去焦点时）
   */
  const handleHttpUrlBlur = React.useCallback(() => {
    notifyConfigUpdate();
  }, [notifyConfigUpdate]);

  /**
   * 处理WebSocket地址输入完成（失去焦点时）
   */
  const handleWsUrlBlur = React.useCallback(() => {
    notifyConfigUpdate();
  }, [notifyConfigUpdate]);

  const handleToggleMockMode = () => {
    if (isApplying) return;

    const nextUseMock = !useMockServer;
    startCooldown();

    // 1. 更新本地配置 store（UI 立即反映）
    setServerHttpUrl(serverHttpUrl);
    setServerWsUrl(serverWsUrl);
    setUseMockServer(nextUseMock);

    // 2. 通过事件总线通知通信模块进行在线切换
    eventBus.emit('config:communication_updated', {
      server: {
        websocketUrl: serverWsUrl || SERVER_WS_URL,
        httpUrl: serverHttpUrl || SERVER_HTTP_URL,
        basePath: API_BASE_PATH
      },
      runtime: {
        useMockServer: nextUseMock
      }
    });
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>设置</Text>

      {/* 服务器配置 */}
      <Text style={styles.sectionTitle}>服务器配置（临时生效）</Text>
      <Text style={styles.helperText}>
        现在支持在线切换：修改后端地址或 Mock 开关会立即生效，无需重启开发服务器或退出应用。
      </Text>

      <View style={styles.fieldGroup}>
        <Text style={styles.label}>HTTP 服务器地址</Text>
        <TextInput
          style={styles.input}
          value={serverHttpUrl}
          onChangeText={setServerHttpUrl}
          onBlur={handleHttpUrlBlur}
          placeholder={SERVER_HTTP_URL}
          placeholderTextColor="#6B7280"
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Text style={styles.desc}>
          例如：http://192.168.1.100:8000（输入完成后点击其他地方自动应用）
        </Text>
      </View>

      <View style={styles.fieldGroup}>
        <Text style={styles.label}>WebSocket 地址</Text>
        <TextInput
          style={styles.input}
          value={serverWsUrl}
          onChangeText={setServerWsUrl}
          onBlur={handleWsUrlBlur}
          placeholder={SERVER_WS_URL}
          placeholderTextColor="#6B7280"
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Text style={styles.desc}>
          例如：ws://192.168.1.100:8000/ws（输入完成后点击其他地方自动应用）
        </Text>
      </View>

      <View style={styles.mockSection}>
        <Text style={styles.label}>本地 MockServer</Text>
        <Text style={styles.desc}>
          当前状态：
          <Text style={{ color: useMockServer ? '#22C55E' : '#F97316' }}>
            {useMockServer ? '已启用（通过环境变量或配置）' : '未启用'}
          </Text>
        </Text>
        <TouchableOpacity
          style={[
            styles.mockButton,
            useMockServer ? styles.mockButtonActive : styles.mockButtonInactive,
            isApplying && styles.mockButtonDisabled
          ]}
          onPress={handleToggleMockMode}
          disabled={isApplying}
        >
          <Text style={styles.mockButtonText}>
            {isApplying
              ? '正在切换...'
              : useMockServer
              ? '切换为真实服务器模式'
              : '切换为本地 Mock 模式'}
          </Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.helperText}>
        修改生效方式：切换后通信模块将在线断开/重连或切到 Mock，重新触发一次拍照即可验证。
      </Text>

      <Text style={styles.resetText} onPress={resetToDefaults}>
        恢复为默认配置
      </Text>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 16,
    paddingBottom: 32,
    backgroundColor: '#020617',
    flexGrow: 1
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#E5E7EB',
    marginBottom: 16
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#E5E7EB',
    marginBottom: 8
  },
  helperText: {
    fontSize: 12,
    color: '#9CA3AF',
    marginBottom: 12
  },
  fieldGroup: {
    marginBottom: 16
  },
  label: {
    color: '#E5E7EB',
    fontSize: 14,
    marginBottom: 4
  },
  input: {
    borderWidth: 1,
    borderColor: '#374151',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: '#F9FAFB',
    fontSize: 14,
    backgroundColor: '#111827'
  },
  desc: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 4
  },
  mockSection: {
    marginTop: 16
  },
  mockButton: {
    marginTop: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#4B5563'
  },
  mockButtonActive: {
    backgroundColor: '#16A34A'
  },
  mockButtonInactive: {
    backgroundColor: '#4B5563'
  },
  mockButtonText: {
    color: '#F9FAFB',
    fontSize: 13,
    textAlign: 'center'
  },
  resetText: {
    marginTop: 16,
    fontSize: 13,
    color: '#60A5FA'
  }
});

export default SettingsScreen;


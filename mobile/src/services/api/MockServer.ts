import { eventBus } from '../../core/eventBus/EventBus';

// 与 EventBus 中 'communication:message_received' 事件结构保持一致
type MockMessageType = 'text_stream' | 'final_result' | 'error';

interface MockMessagePayload {
  type: MockMessageType;
  content: string;
  sessionId: string;
}

interface AnalyzeImageResult {
  success: boolean;
  sessionId: string;
}

export class MockServer {
  private static instance: MockServer;

  // 基础网络延迟，单位 ms
  private responseDelay = 2000;

  // 单例模式，禁止外部直接 new
  private constructor() {}

  static getInstance(): MockServer {
    if (!MockServer.instance) {
      MockServer.instance = new MockServer();
    }
    return MockServer.instance;
  }

  /**
   * 可调整模拟响应延迟，方便测试不同网络环境
   */
  setResponseDelay(ms: number) {
    this.responseDelay = Math.max(0, ms);
  }

  /**
   * 模拟图像分析响应
   * - 通过 EventBus 发送与真实服务端一致的 streaming 文本事件
   */
  async analyzeImage(
    imageData: string,
    prompt: string,
    sessionId: string
  ): Promise<AnalyzeImageResult> {
    // imageData / prompt 目前仅用于保持签名一致，后续可根据内容生成不同文案
    return new Promise((resolve) => {
      setTimeout(() => {
        const responses: MockMessagePayload[] = [
          { type: 'text_stream', content: '正在分析图像...', sessionId },
          { type: 'text_stream', content: '检测到这是一个室内场景。', sessionId },
          { type: 'text_stream', content: '可以看到一张桌子和一把椅子。', sessionId },
          {
            type: 'final_result',
            content:
              '这是一个室内办公环境，中央有一张木质桌子，旁边摆放着一把黑色转椅。墙上挂着一幅抽象画，光线从窗户照射进来。',
            sessionId
          }
        ];

        // 模拟流式推送：每条消息间隔 1 秒
        responses.forEach((response, index) => {
          setTimeout(() => {
            this.emitMockMessage(response);
          }, index * 1000);
        });

        resolve({ success: true, sessionId });
      }, this.responseDelay);
    });
  }

  /**
   * 模拟健康检查接口
   */
  async healthCheck(): Promise<{ status: string }> {
    return { status: 'healthy' };
  }

  /**
   * 通过事件总线发送 mock 消息，保证与真实通信模块的事件格式一致
   */
  private emitMockMessage(payload: MockMessagePayload) {
    eventBus.emit('communication:message_received', payload);
  }
}
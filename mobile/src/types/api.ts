// API 相关 TypeScript 类型定义

export interface HealthResponse {
  status: string;
}

export interface VisionRequest {
  imageBase64: string;
}

export interface VisionResponse {
  description: string;
}



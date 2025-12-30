// 图片处理工具函数占位
// 后续可在此添加压缩、裁剪、格式转换等操作

export function getImageAspectRatio(width: number, height: number): number {
  if (!height) return 0;
  return width / height;
}



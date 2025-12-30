// Learn more https://docs.expo.dev/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// 将 .onnx 文件添加为 asset 扩展名
// 这样 Metro 会将其作为资源文件处理，而不是 JavaScript 代码
config.resolver = {
  ...config.resolver,
  // 添加 .onnx 和相关模型文件扩展名到 assetExts
  // Metro 会将它们作为资源处理，不会尝试转换为 JavaScript
  assetExts: [
    ...(config.resolver?.assetExts || []),
    'onnx',           // ONNX 模型文件
    'pdmodel',        // PaddlePaddle 模型文件
    'pdiparams',      // PaddlePaddle 参数文件
  ],
  // 确保 .onnx 文件不会被当作源代码处理
  sourceExts: (config.resolver?.sourceExts || []).filter(ext => ext !== 'onnx'),
  // 使用 blockList 阻止 Metro 处理大型模型文件
  // 这些文件会通过 assetBundlePatterns 打包到 APK 中，然后在运行时通过 FileSystem 访问
  blockList: [
    /.*\/assets\/tts-models\/.*\.onnx$/,
  ],
};

module.exports = config;


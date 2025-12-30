/**
 * TTS模型资产索引文件
 * 用于统一导出和管理TTS模型资源
 * 
 * 注意：此文件已禁用，因为模型文件太大（几百MB），
 * 直接 require() 会导致 Metro bundler 字符串长度超限错误。
 * 
 * 如果需要在运行时加载模型，请使用 PaddleSpeechAdapter 中的 Asset API 方法。
 */

// mobile/assets/tts-models/index.js

// 已禁用：直接 require() 大型模型文件会导致构建错误
// 如果需要使用，请使用动态导入或 Asset API

// export const paddleSpeechChinese = {
//   // 文本前端模型
//   frontend: {
//     config: require('./paddlespeech-lite/frontend/config.json'),
//     model: require('./paddlespeech-lite/frontend/model.pdmodel'),
//     weights: require('./paddlespeech-lite/frontend/model.pdiparams')
//   },
//   // 声学模型
//   acoustic: {
//     config: require('./paddlespeech-lite/acoustic/config.json'),
//     model: require('./paddlespeech-lite/acoustic/model.pdmodel'),
//     weights: require('./paddlespeech-lite/acoustic/model.pdiparams')
//   },
//   // 声码器
//   vocoder: {
//     config: require('./paddlespeech-lite/vocoder/config.json'),
//     model: require('./paddlespeech-lite/vocoder/model.pdmodel'),
//     weights: require('./paddlespeech-lite/vocoder/model.pdiparams')
//   }
// };

// export default {
//   'paddle-speech-lite': paddleSpeechChinese,
// };

// 导出空对象以避免导入错误
export const paddleSpeechChinese = null;
export default {};


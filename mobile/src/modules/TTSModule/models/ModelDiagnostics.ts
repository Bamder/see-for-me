/**
 * 模型加载诊断工具
 * 用于检查模型为什么不能正确加载
 */

// 使用 legacy API 以避免弃用警告
import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';

export interface ModelDiagnosticsResult {
  onnxRuntimeAvailable: boolean;
  onnxRuntimeError?: string;
  nativeModulesCount: number;
  executionEnvironment?: string;
  bundleDirectory?: string;
  documentDirectory?: string;
  cacheDirectory?: string;
  modelFiles: {
    frontend: {
      configExists: boolean;
      modelExistsInBundle?: boolean;
      modelExistsInDocument?: boolean;
      bundlePath?: string;
      documentPath?: string;
    };
    acoustic: {
      configExists: boolean;
      modelExistsInBundle?: boolean;
      modelExistsInDocument?: boolean;
      bundlePath?: string;
      documentPath?: string;
    };
    vocoder: {
      configExists: boolean;
      modelExistsInBundle?: boolean;
      modelExistsInDocument?: boolean;
      bundlePath?: string;
      documentPath?: string;
    };
  };
  recommendations: string[];
}

/**
 * 诊断模型加载问题
 */
export async function diagnoseModelLoading(): Promise<ModelDiagnosticsResult> {
  const result: ModelDiagnosticsResult = {
    onnxRuntimeAvailable: false,
    nativeModulesCount: 0,
    modelFiles: {
      frontend: { configExists: false },
      acoustic: { configExists: false },
      vocoder: { configExists: false }
    },
    recommendations: []
  };

  // 1. 检查 ONNX Runtime
  try {
    // 安全地获取 NativeModules（在 Expo 环境中，原生模块可能通过不同方式暴露）
    try {
      const { NativeModules } = require('react-native');
      const modules = NativeModules || {};
      result.nativeModulesCount = Object.keys(modules).length;
    } catch {
      result.nativeModulesCount = 0;
    }
    
    // 检查执行环境
    try {
      const Constants = require('expo-constants');
      result.executionEnvironment = Constants.default?.executionEnvironment || Constants?.executionEnvironment;
    } catch {
      // 忽略
    }

    // 检查是否是原生环境：如果文件系统目录可用，说明是原生环境
    const FileSystem = require('expo-file-system/legacy');
    const isNativeEnvironment = !!(FileSystem.bundleDirectory || FileSystem.documentDirectory);
    
    // 如果原生模块数量为 0，但文件系统可用，可能是检测问题，仍然尝试加载 ONNX Runtime
    if (result.nativeModulesCount === 0 && !isNativeEnvironment) {
      result.onnxRuntimeError = '原生模块不可用（原生模块数量为 0，文件系统也不可用）';
      result.recommendations.push('⚠️ 检测到开发服务器环境（原生模块数量为 0，文件系统不可用）');
      result.recommendations.push('ONNX Runtime 需要原生模块支持，无法在开发服务器环境中运行。');
      result.recommendations.push('解决方案：');
      result.recommendations.push('  1. 运行 scripts\\dev\\build-android-gradle.bat 构建原生 APK');
      result.recommendations.push('  2. 安装生成的 APK 到手机');
      result.recommendations.push('  3. 运行 scripts\\dev\\start-dev.bat 启动开发服务器');
      result.recommendations.push('  4. 在手机上打开应用（使用原生 APK，但连接开发服务器）');
    } else {
      // 原生环境或原生模块数量 > 0，尝试加载 ONNX Runtime
      if (result.nativeModulesCount === 0 && isNativeEnvironment) {
        result.recommendations.push('ℹ️ 注意：原生模块数量为 0，但文件系统可用，说明是原生构建环境。');
        result.recommendations.push('   原生模块数量检测可能不准确，实际的原生模块可能仍然可用。');
      }
      // 尝试加载 ONNX Runtime（使用更安全的错误处理）
      try {
      // 使用立即执行的函数表达式（IIFE）包装 require，确保同步错误被捕获
      let ortModule: any = null;
      try {
        // 使用 Function 构造器来安全地执行 require（如果可能的话）
        // 或者直接使用 try-catch，但这可能无法捕获所有同步错误
        ortModule = (function() {
          try {
            return require('onnxruntime-react-native');
          } catch (e) {
            return null;
          }
        })();
        
        // 如果 IIFE 返回 null，说明 require 失败
        if (ortModule === null) {
          throw new Error('无法 require onnxruntime-react-native 模块（模块加载失败）');
        }
      } catch (requireError: any) {
        // 如果 IIFE 本身失败，或者返回 null，抛出错误以便被外层 catch 捕获
        throw requireError;
      }

      if (!ortModule) {
        throw new Error('无法 require onnxruntime-react-native 模块');
      }

      const ort = ortModule.default || ortModule;
      if (ort && typeof ort === 'object' && ort.InferenceSession && typeof ort.InferenceSession.create === 'function') {
        result.onnxRuntimeAvailable = true;
      } else {
        result.onnxRuntimeError = 'ONNX Runtime 模块结构不正确';
        result.recommendations.push('ONNX Runtime 模块已加载，但 API 不可用。可能需要重新构建原生应用。');
      }
    } catch (error: any) {
      const errorMessage = error?.message || String(error);
      const errorStack = error?.stack || '';
      
      // 判断是否是原生模块相关错误
      const isNativeModuleError = 
        errorMessage.includes('Cannot read property') ||
        errorMessage.includes('install') ||
        errorMessage.includes('null') ||
        errorMessage.includes('undefined') ||
        errorMessage.includes('Native module') ||
        errorMessage.includes('MODULE_NOT_FOUND') ||
        errorStack.includes('binding.ts') ||
        errorStack.includes('onnxruntime-react-native') ||
        errorStack.includes('backend.ts');
      
      result.onnxRuntimeError = errorMessage;
      
      if (isNativeModuleError) {
        result.recommendations.push('ONNX Runtime 无法加载（原生模块错误）。请确保：');
        result.recommendations.push('  1. 已安装 onnxruntime-react-native: npm install onnxruntime-react-native');
        result.recommendations.push('  2. 已运行 npx expo prebuild --platform android');
        result.recommendations.push('  3. 已使用原生构建（build-android-gradle.bat），而不是开发服务器');
        result.recommendations.push('  4. ⚠️ 重要：当前使用的是开发服务器，原生模块不可用。需要使用原生构建的 APK。');
      } else {
        result.recommendations.push(`ONNX Runtime 加载失败: ${errorMessage}`);
      }
    }
    } // 结束 else 块
  } catch (error: any) {
    // 最外层错误处理，确保不会因为诊断本身导致应用崩溃
    result.onnxRuntimeError = error?.message || String(error);
    result.recommendations.push('诊断工具检查 ONNX Runtime 时发生错误，但这不影响应用运行。');
  }

  // 2. 检查文件系统目录
  result.bundleDirectory = FileSystem.bundleDirectory || undefined;
  result.documentDirectory = FileSystem.documentDirectory || undefined;
  result.cacheDirectory = FileSystem.cacheDirectory || undefined;

  if (!result.bundleDirectory && !result.documentDirectory) {
    result.recommendations.push('文件系统目录不可用。这通常发生在 Web 平台或某些开发环境中。');
  }

  // 3. 检查配置文件（使用 require，安全包装）
  try {
    try {
      require('../../../../assets/tts-models/paddlespeech-lite/frontend/config.json');
      result.modelFiles.frontend.configExists = true;
    } catch {
      result.recommendations.push('前端配置文件未找到。请确保 assets/tts-models/paddlespeech-lite/frontend/config.json 存在。');
    }

    try {
      require('../../../../assets/tts-models/paddlespeech-lite/acoustic/config.json');
      result.modelFiles.acoustic.configExists = true;
    } catch {
      result.recommendations.push('声学配置文件未找到。请确保 assets/tts-models/paddlespeech-lite/acoustic/config.json 存在。');
    }

    try {
      require('../../../../assets/tts-models/paddlespeech-lite/vocoder/config.json');
      result.modelFiles.vocoder.configExists = true;
    } catch {
      result.recommendations.push('声码器配置文件未找到。请确保 assets/tts-models/paddlespeech-lite/vocoder/config.json 存在。');
    }
  } catch (error) {
    // 配置文件检查失败，但不影响后续诊断
    result.recommendations.push('配置文件检查时发生错误，但这不影响应用运行。');
  }

  // 4. 检查模型文件（使用 FileSystem）
  const checkModelFile = async (modelName: 'frontend' | 'acoustic' | 'vocoder', fileName: string) => {
    const modelInfo = result.modelFiles[modelName];
    
    // 检查 bundle 目录（尝试两种路径格式）
    if (result.bundleDirectory) {
      // 尝试两种路径格式：
      // 1. asset:/tts-models/...（如果 bundleDirectory 已经指向 assets 目录）
      // 2. asset:/assets/tts-models/...（完整路径）
      const bundlePath1 = result.bundleDirectory + `tts-models/paddlespeech-lite/${modelName}/${fileName}`;
      const bundlePath2 = result.bundleDirectory + `assets/tts-models/paddlespeech-lite/${modelName}/${fileName}`;
      
      for (const bundlePath of [bundlePath1, bundlePath2]) {
        try {
          const fileInfo = await FileSystem.getInfoAsync(bundlePath);
          if (fileInfo.exists) {
            modelInfo.bundlePath = bundlePath;
            modelInfo.modelExistsInBundle = true;
            break;
          }
        } catch {
          // 继续尝试下一个路径
        }
      }
      
      // 如果都没有找到，记录第一个路径作为参考
      if (!modelInfo.modelExistsInBundle && !modelInfo.bundlePath) {
        modelInfo.bundlePath = bundlePath1;
      }
    }

    // 检查 document 目录
    if (result.documentDirectory) {
      const documentPath = result.documentDirectory + `assets/tts-models/paddlespeech-lite/${modelName}/${fileName}`;
      modelInfo.documentPath = documentPath;
      try {
        const fileInfo = await FileSystem.getInfoAsync(documentPath);
        modelInfo.modelExistsInDocument = fileInfo.exists;
      } catch {
        modelInfo.modelExistsInDocument = false;
      }
    }

    if (!modelInfo.modelExistsInBundle && !modelInfo.modelExistsInDocument) {
      result.recommendations.push(`${modelName} 模型文件未找到。请确保：`);
      result.recommendations.push(`  1. assets/tts-models/paddlespeech-lite/${modelName}/${fileName} 文件存在`);
      result.recommendations.push(`  2. 已运行原生构建（build-android-gradle.bat）以将文件打包到 APK 中`);
      if (modelInfo.bundlePath) {
        result.recommendations.push(`  3. bundle 路径: ${modelInfo.bundlePath}`);
      }
      if (modelInfo.documentPath) {
        result.recommendations.push(`  4. document 路径: ${modelInfo.documentPath}`);
      }
    }
  };

  await checkModelFile('frontend', 'model.onnx');
  await checkModelFile('acoustic', 'model.onnx');
  await checkModelFile('vocoder', 'model.onnx');

  // 5. 生成总结建议
  if (!result.onnxRuntimeAvailable) {
    result.recommendations.unshift('⚠️ 最关键的问题：ONNX Runtime 不可用。');
    if (result.nativeModulesCount === 0) {
      result.recommendations.push('🔴 当前环境：开发服务器（原生模块数量为 0）');
      result.recommendations.push('解决方案：');
      result.recommendations.push('  1. 运行 scripts\\dev\\build-android-gradle.bat 构建原生 APK');
      result.recommendations.push('  2. 安装生成的 APK 到手机');
      result.recommendations.push('  3. 运行 scripts\\dev\\start-dev.bat 启动开发服务器');
      result.recommendations.push('  4. 在手机上打开应用（使用原生 APK，但连接开发服务器）');
    } else {
      result.recommendations.push('解决方案：使用 build-android-gradle.bat 构建原生 APK。');
    }
  } else {
    const allModelsExist = 
      (result.modelFiles.frontend.modelExistsInBundle || result.modelFiles.frontend.modelExistsInDocument) &&
      (result.modelFiles.acoustic.modelExistsInBundle || result.modelFiles.acoustic.modelExistsInDocument) &&
      (result.modelFiles.vocoder.modelExistsInBundle || result.modelFiles.vocoder.modelExistsInDocument);
    
    if (!allModelsExist) {
      result.recommendations.unshift('⚠️ 模型文件未找到。');
      result.recommendations.push('注意：在开发模式下，模型文件可能不在 bundle 中。需要构建生产版 APK 才会包含模型文件。');
    } else {
      result.recommendations.push('✅ 所有检查通过！如果模型仍然无法加载，请检查控制台日志中的详细错误信息。');
    }
  }

  return result;
}

/**
 * 打印诊断结果到控制台
 */
export function printDiagnostics(result: ModelDiagnosticsResult): void {
  console.log('\n' + '='.repeat(60));
  console.log('🔍 模型加载诊断报告');
  console.log('='.repeat(60));
  
  console.log('\n📦 ONNX Runtime 状态:');
  console.log(`  可用: ${result.onnxRuntimeAvailable ? '✅ 是' : '❌ 否'}`);
  if (result.onnxRuntimeError) {
    console.log(`  错误: ${result.onnxRuntimeError}`);
  }
  console.log(`  原生模块数量: ${result.nativeModulesCount}`);
  if (result.executionEnvironment) {
    console.log(`  执行环境: ${result.executionEnvironment}`);
  }

  console.log('\n📁 文件系统目录:');
  console.log(`  bundleDirectory: ${result.bundleDirectory || '❌ 不可用'}`);
  console.log(`  documentDirectory: ${result.documentDirectory || '❌ 不可用'}`);
  console.log(`  cacheDirectory: ${result.cacheDirectory || '❌ 不可用'}`);

  console.log('\n📄 配置文件状态:');
  console.log(`  前端配置: ${result.modelFiles.frontend.configExists ? '✅' : '❌'}`);
  console.log(`  声学配置: ${result.modelFiles.acoustic.configExists ? '✅' : '❌'}`);
  console.log(`  声码器配置: ${result.modelFiles.vocoder.configExists ? '✅' : '❌'}`);

  console.log('\n🤖 模型文件状态:');
  
  const printModelStatus = (name: string, info: typeof result.modelFiles.frontend) => {
    console.log(`  ${name}:`);
    if (info.bundlePath) {
      console.log(`    bundle: ${info.modelExistsInBundle ? '✅' : '❌'} ${info.bundlePath}`);
    }
    if (info.documentPath) {
      console.log(`    document: ${info.modelExistsInDocument ? '✅' : '❌'} ${info.documentPath}`);
    }
  };

  printModelStatus('前端模型', result.modelFiles.frontend);
  printModelStatus('声学模型', result.modelFiles.acoustic);
  printModelStatus('声码器模型', result.modelFiles.vocoder);

  console.log('\n💡 建议:');
  result.recommendations.forEach((rec, index) => {
    console.log(`  ${index + 1}. ${rec}`);
  });

  console.log('\n' + '='.repeat(60) + '\n');
}


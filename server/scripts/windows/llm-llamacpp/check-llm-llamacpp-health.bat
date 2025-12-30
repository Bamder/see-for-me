@echo off
REM 简单检查 llama.cpp OpenAI 兼容服务是否可用
REM 默认检查 http://localhost:8001/v1/models

set HOST=%HOST%
if "%HOST%"=="" set HOST=localhost
set PORT=%PORT%
if "%PORT%"=="" set PORT=8001

echo 檢查 LLM 服務健康狀態: http://%HOST%:%PORT%/v1/models

powershell -Command ^
  "try { $r = Invoke-WebRequest -Uri 'http://%HOST%:%PORT%/v1/models' -UseBasicParsing -TimeoutSec 5; if ($r.StatusCode -eq 200) { exit 0 } else { exit 1 } } catch { exit 1 }"

if %errorlevel%==0 (
  echo ✅ LLM 服務可用
) else (
  echo ⚠️ 無法訪問 LLM 服務，請確認 llama.cpp 是否已啟動，端口與防火牆配置是否正確。
)

pause



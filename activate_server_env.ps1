Write-Host "Activating Python virtual environment..."

# 使用当前脚本所在目录作为项目根目录
Set-Location $PSScriptRoot

# 执行 server 目录下虚拟环境的 PowerShell 激活脚本
& "$PSScriptRoot\server\server-env\Scripts\Activate.ps1"

Write-Host "Python virtual environment for server activated."



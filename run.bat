@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

echo ==========================================
echo  大卡波领域大神编辑器 / Himeno Text Editor
echo  开发模式启动（Tauri 桌面版）
echo ==========================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [错误] 未找到 Node.js，请先安装：https://nodejs.org/
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo [1/2] 首次运行，正在安装依赖...
  call npm install
  if errorlevel 1 (
    echo [错误] 依赖安装失败。
    pause
    exit /b 1
  )
) else (
  echo [1/2] 依赖已就绪
)

echo [2/2] 启动 Tauri 开发模式...
call npm run tauri dev

pause

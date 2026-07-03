@echo off
chcp 65001 >nul
title AI伴奏人声分离

echo ========================================
echo    AI 伴奏人声分离 - 启动中...
echo ========================================
echo.

:: 切换到脚本所在目录
cd /d "%~dp0"

:: 启动后端服务
echo [1/2] 启动后端服务 (端口 8001)...
start /b python app.py

:: 等待服务就绪
echo [2/2] 等待服务就绪...
:WAIT_LOOP
timeout /t 1 /nobreak >nul
curl -s -o nul -w "" http://localhost:8001/ 2>nul
if errorlevel 1 goto WAIT_LOOP

:: 打开浏览器
echo.
echo 服务已启动，正在打开浏览器...
start http://localhost:8001/

echo.
echo ========================================
echo    浏览器已打开，按 Ctrl+C 关闭服务
echo ========================================
echo.

:: 保持窗口打开，等待用户手动关闭
pause

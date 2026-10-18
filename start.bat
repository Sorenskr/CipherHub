@echo off
chcp 65001 >nul
cd /d "%~dp0"
title 暗号查询中心

where node >nul 2>nul
if %errorlevel%==0 (
  node server.js
) else if exist "%USERPROFILE%\.workbuddy\binaries\node\versions\22.22.2-6\node.exe" (
  "%USERPROFILE%\.workbuddy\binaries\node\versions\22.22.2-6\node.exe" server.js
) else (
  echo.
  echo   未检测到 Node.js，请先安装： https://nodejs.org/zh-cn/download
  echo   安装后重新双击本文件即可。
  echo.
)
pause

@echo off
setlocal
cd /d "%~dp0"
title PTZ Pad helper setup
echo.
echo  Setting up the PTZ Pad helper for the Claude desktop app.
echo  The first run needs an internet connection.
echo.
if not exist "runtime\node\npm.cmd" (
  powershell -NoProfile -ExecutionPolicy Bypass -File "tools\get-node.ps1"
  if errorlevel 1 goto fail
)
set "PATH=%~dp0runtime\node;%PATH%"
if not exist "node_modules\koffi\package.json" (
  echo  Installing helper components...
  call npm install --omit=dev --no-audit --no-fund --loglevel=error
  if errorlevel 1 goto fail
)
"runtime\node\node.exe" "tools\install-claude-helper.js"
if errorlevel 1 goto fail
echo.
pause
exit /b 0
:fail
echo.
echo  Setup didn't finish. Check your internet connection and run this file again.
echo.
pause
exit /b 1

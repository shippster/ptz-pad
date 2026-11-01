@echo off
setlocal
cd /d "%~dp0"
title PTZ Pad

rem Already set up? Launch straight away.
if exist "node_modules\electron\dist\electron.exe" if exist "node_modules\.ptz-pad-1.4.0" goto run

echo.
echo  Setting up PTZ Pad. This happens once and needs an internet connection.
echo.

rem Use the copy of Node.js inside this folder, downloading it if needed.
if not exist "runtime\node\npm.cmd" (
  powershell -NoProfile -ExecutionPolicy Bypass -File "tools\get-node.ps1"
  if errorlevel 1 goto fail
)
set "PATH=%~dp0runtime\node;%PATH%"

echo  Installing PTZ Pad components...
call npm install --include=optional --no-audit --no-fund --loglevel=error
if errorlevel 1 goto fail
if not exist "node_modules\electron\dist\electron.exe" goto fail

:run
rem End any invisible PTZ Pad left running from this folder (it would block this launch).
powershell -NoProfile -ExecutionPolicy Bypass -Command "$d=(Resolve-Path 'node_modules\electron\dist').Path; Get-Process electron -ErrorAction SilentlyContinue | Where-Object { $_.Path -and $_.Path.StartsWith($d) -and $_.MainWindowHandle -eq 0 -and -not (Get-Process electron -ErrorAction SilentlyContinue | Where-Object { $_.Path -and $_.Path.StartsWith($d) -and $_.MainWindowHandle -ne 0 }) } | Stop-Process -Force -ErrorAction SilentlyContinue"
rem Fetch the auto-tracking model if an earlier download didn't finish (skipped when offline).
if not exist "models\pose_landmarker_lite.task" if exist "runtime\node\node.exe" "runtime\node\node.exe" "tools\get-models.js"
start "" "node_modules\electron\dist\electron.exe" .
exit /b 0

:fail
echo.
echo  Setup didn't finish. Check your internet connection and run this file again.
echo  If it keeps failing, delete the "runtime" and "node_modules" folders and retry.
echo.
pause
exit /b 1

@echo off
setlocal
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is required. Install Node.js, then run this launcher again.
  pause
  exit /b 1
)
echo Keep this window open while playing. Press Ctrl+C to stop the game.
node "%~dp0city-viewer\serve.js" --open
if errorlevel 1 pause

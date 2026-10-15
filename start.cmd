@echo off
setlocal
cd /d "%~dp0"

if not exist node_modules (
  echo Dependencies missing. Run setup.cmd first.
  pause
  exit /b 1
)
if not exist .env.local (
  echo .env.local missing. Run setup.cmd first.
  pause
  exit /b 1
)
if not exist serviceAccountKey.json (
  echo serviceAccountKey.json missing. Place your Firebase service account file in this folder.
  pause
  exit /b 1
)

REM Build once (or when sources changed since last build)
if not exist .next\BUILD_ID (
  echo Building app, this can take a minute...
  call npm run build
  if errorlevel 1 (
    echo Build failed.
    pause
    exit /b 1
  )
)

REM Open the browser shortly after the server starts
start "" /b cmd /c "timeout /t 4 /nobreak >nul & start http://localhost:3000"

call npm run start
pause

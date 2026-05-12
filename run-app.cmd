@echo off
setlocal

REM Move to this script's directory (repo root)
cd /d "%~dp0"

REM Check for remote updates; pull only if needed
git remote update >nul 2>&1
if errorlevel 1 (
  echo.
  echo failed to check remote updates. Press any key to exit.
  pause >nul
  exit /b 1
)

for /f %%i in ('git rev-list --count HEAD..@{u} 2^>nul') do set BEHIND_COUNT=%%i
if not defined BEHIND_COUNT set BEHIND_COUNT=0

if %BEHIND_COUNT% GTR 0 (
  echo pulling %BEHIND_COUNT% update(s) from remote...
  git pull
  if errorlevel 1 (
    echo.
    echo git pull failed. Press any key to exit.
    pause >nul
    exit /b 1
  )
) else (
  echo no remote updates. skipping git pull.
)

REM Build app for production
npm run build
if errorlevel 1 (
  echo.
  echo build failed. Press any key to exit.
  pause >nul
  exit /b 1
)

REM Start Next.js production server in a new terminal window
start "UT Assistant Prod Server" cmd /k "npm run start"

REM Wait a bit so the server can boot
timeout /t 3 /nobreak >nul

REM Open app in default browser
start "" "http://localhost:3000"

endlocal

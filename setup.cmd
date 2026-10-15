@echo off
setlocal
cd /d "%~dp0"

echo === UT Assistant - one-time setup ===

where node >nul 2>&1
if errorlevel 1 (
  echo Node.js not found. Install the LTS version from https://nodejs.org then run this again.
  pause
  exit /b 1
)
for /f %%v in ('node -p "process.versions.node.split('.')[0]"') do set NODE_MAJOR=%%v
if %NODE_MAJOR% LSS 20 (
  echo Node.js 20 or newer is required. Found major version %NODE_MAJOR%.
  pause
  exit /b 1
)

echo.
echo [1/3] Installing npm packages...
call npm install
if errorlevel 1 goto :fail

echo.
echo [2/3] Installing Playwright Chromium...
call npx playwright install chromium
if errorlevel 1 goto :fail

echo.
echo [3/3] Preparing .env.local...
if exist .env.local (
  echo .env.local already exists, leaving it untouched.
) else (
  copy /y .env.example .env.local >nul
  node -e "const fs=require('fs');const k=require('crypto').randomBytes(32).toString('base64');const a=require('crypto').randomBytes(32).toString('base64url');let t=fs.readFileSync('.env.local','utf8');t=t.replace(/^ENCRYPTION_KEY=.*$/m,'ENCRYPTION_KEY='+k).replace(/^AGENT_API_KEY=.*$/m,'AGENT_API_KEY='+a);fs.writeFileSync('.env.local',t)"
  echo Created .env.local with a fresh ENCRYPTION_KEY.
)

echo.
echo === Setup done. Remaining manual steps ===
if not exist serviceAccountKey.json (
  echo  - Put your Firebase service account file here as: serviceAccountKey.json
)
echo  - Open .env.local and set GEMINI_API_KEY (and GEMINI_ENABLED=1) if you want AI features.
echo  - Then double-click start.cmd
echo.
pause
exit /b 0

:fail
echo.
echo Setup failed. See the error above.
pause
exit /b 1

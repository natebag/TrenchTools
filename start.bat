@echo off
chcp 65001 >nul
title TrenchSniper OS - Launch Dashboard

echo 🔥 TrenchSniper OS v0.3.0
echo ============================
echo.

:: Check Node.js
node --version >nul 2>&1
if errorlevel 1 (
    echo ❌ Node.js not found! Install from https://nodejs.org/
    pause
    exit /b 1
)
echo ✅ Node.js found

:: Check pnpm
pnpm --version >nul 2>&1
if errorlevel 1 (
    echo 📦 Installing pnpm...
    npm install -g pnpm
)
echo ✅ pnpm ready

:: Install root dependencies
echo.
echo 📦 Installing dependencies...
call pnpm install
if errorlevel 1 goto error

:: Build all packages
echo.
echo 🔨 Building packages...
call pnpm build
if errorlevel 1 goto error

:: Install UI dependencies
echo.
echo 📦 Setting up Web UI...
cd packages\ui
call pnpm install
if errorlevel 1 goto error
cd ..\..

echo.
echo ✅ All systems ready!
echo.
echo ==========================================
echo 🌐 STARTING WEB UI DASHBOARD
echo ==========================================
echo.
echo The dashboard will open at: http://localhost:5173
echo.
echo Available views:
echo   💰 /treasury   - Main wallet funding
echo   👛 /wallets    - Wallet management  
echo   🎯 /snipe      - Sniper control
echo   🛡️ /shield      - Honeypot scanner
echo   📊 /pnl         - P
echo   👻 /activity    - Fake tx generator
echo   ⚙️ /settings    - Configuration
echo.
echo ==========================================
echo.

:: Start the dev server
cd packages\ui
call pnpm dev

:: If server exits, keep window open
echo.
echo ⚠️ Server stopped
echo.
pause
exit /b 0

:error
echo.
echo ❌ Something went wrong!
echo Check the errors above
echo.
pause
exit /b 1

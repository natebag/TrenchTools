@echo off
cd /d "%~dp0"
chcp 65001 >nul

echo 🔧 TrenchSniper OS - Debug Mode
echo ================================
echo.

:: Check Node.js
echo Checking Node.js...
node --version >nul 2>&1
if errorlevel 1 (
    echo ❌ Node.js not found!
    echo Install from: https://nodejs.org/
    pause
    exit /b 1
)
echo ✅ Node: 
node --version

:: Check pnpm
echo.
echo Checking pnpm...
pnpm --version >nul 2>&1
if errorlevel 1 (
    echo 📦 Installing pnpm...
    npm install -g pnpm
)
echo ✅ pnpm: 
pnpm --version

:: Check if already installed
echo.
echo Checking dependencies...
if exist "node_modules" (
    echo ✅ Dependencies installed
) else (
    echo 📦 Installing...
    call pnpm install 2>&1
    if errorlevel 1 (
        echo ❌ Install failed!
        pause
        exit /b 1
    )
)

:: Check UI dependencies
echo.
echo Checking UI dependencies...
if exist "packages\ui\node_modules" (
    echo ✅ UI deps installed
) else (
    echo 📦 Installing UI deps...
    cd packages\ui
    call pnpm install 2>&1
    if errorlevel 1 (
        echo ❌ UI install failed!
        pause
        exit /b 1
    )
    cd ..\..
)

echo.
echo ✅ All checks passed!
echo.
echo Starting Web UI...
cd packages\ui
pnpm dev 2>&1

echo.
echo ⚠️ Server stopped with error? Check above!
pause

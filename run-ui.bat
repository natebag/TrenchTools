@echo off
cd /d "%~dp0"

echo ==========================================
echo TrenchSniper OS - Web UI Launcher
echo ==========================================
echo.

:: Step 1: Check Node
echo [1/5] Checking Node.js...
node --version
if errorlevel 1 (
    echo.
    echo ❌ ERROR: Node.js not found!
    echo    Install from: https://nodejs.org/
    echo.
    goto end
)
echo ✅ Node.js OK
echo.

:: Step 2: Check pnpm
echo [2/5] Checking pnpm...
pnpm --version
if errorlevel 1 (
    echo    Installing pnpm...
    npm install -g pnpm
)
echo ✅ pnpm OK
echo.

:: Step 3: Install deps
echo [3/5] Installing dependencies (this may take a minute)...
call pnpm install
if errorlevel 1 (
    echo ❌ ERROR: pnpm install failed
    goto end
)
echo ✅ Dependencies OK
echo.

:: Step 4: Install UI deps
echo [4/5] Installing UI dependencies...
cd packages\ui
call pnpm install
if errorlevel 1 (
    echo ❌ ERROR: UI install failed
    cd ..\..
    goto end
)
cd ..\..
echo ✅ UI Dependencies OK
echo.

:: Step 5: Run UI
echo [5/5] Starting Web UI Dashboard...
echo Opening: http://localhost:5173
echo.
echo ==========================================
echo 🚀 DASHBOARD IS STARTING...
echo ==========================================
echo.
cd packages\ui
start http://localhost:5173
call pnpm dev
if errorlevel 1 (
    echo.
    echo ❌ Dev server failed to start
    goto end
)

:end
echo.
echo ==========================================
echo Process ended. Press any key to close.
echo ==========================================
pause >nul

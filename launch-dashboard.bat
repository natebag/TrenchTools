@echo off
cd /d "C:\Users\SCICO\.openclaw\workspace\TrenchSniper-OS"
>launch.log 2>&1 (
  echo =========================================
  echo TrenchSniper Dashboard Launcher
  echo =========================================
  echo [%date% %time%] Starting...
  
  echo [%date% %time%] Step 1: Check Node...
  node --version
  if errorlevel 1 (
    echo ERROR: Node.js not installed!
    goto error
  )
  
  echo [%date% %time%] Step 2: Check pnpm...
  pnpm --version
  if errorlevel 1 (
    echo Installing pnpm...
    npm install -g pnpm
  )
  
  echo [%date% %time%] Step 3: Root install...
  if not exist "node_modules" (
    pnpm install
  )
  
  echo [%date% %time%] Step 4: UI install...
  cd packages\ui
  if not exist "node_modules" (
    pnpm install
  )
  
  echo [%date% %time%] Step 5: Launch UI...
  start http://localhost:5173
  pnpm dev
  
  echo [%date% %time%] Server stopped.
  goto done
  
  :error
  echo ERROR occurred - see launch.log for details
  
  :done
  echo [%date% %time%] Done.
)

if exist launch.log (
  type launch.log
  echo.
  echo ^^^^^^^^^^^^^^^^^^ CHECK ABOVE FOR ERRORS ^^^^^^^^^^^^^^^^^^
  echo Log saved to: C:\Users\SCICO\.openclaw\workspace\TrenchSniper-OS\launch.log
)

pause

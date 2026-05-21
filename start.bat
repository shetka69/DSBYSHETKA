@echo off
setlocal
cd /d "%~dp0"

if not exist node_modules (
  echo Installing dependencies...
  call npm.cmd install
  if errorlevel 1 (
    echo.
    echo Failed to install dependencies.
    pause
    exit /b 1
  )
)

echo Starting DSBYSHETKA Voice...
echo Open the URL shown by Vercel Dev
call npx.cmd vercel dev

pause

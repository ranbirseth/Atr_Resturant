@echo off
TITLE Aatreyo Restaurant - Printer Service
COLOR 0A
ECHO ===================================================
ECHO      AATREYO RESTAURANT - PRINTER SERVICE
ECHO ===================================================
ECHO.
ECHO Checking for Node.js...
node -v >nul 2>&1
IF %ERRORLEVEL% NEQ 0 (
    ECHO [ERROR] Node.js is not installed!
    ECHO Please install Node.js from https://nodejs.org/
    PAUSE
    EXIT
)

ECHO Starting Print Service...
ECHO.
ECHO [INFO] Service running on http://localhost:6000
ECHO [INFO] Minimizing this window is okay.
ECHO [INFO] DO NOT CLOSE THIS WINDOW if you want printing to work.
ECHO.

cd /d "%~dp0"
IF NOT EXIST "node_modules" (
    ECHO First run detected. Installing dependencies...
    call npm install
)

node index.js
PAUSE

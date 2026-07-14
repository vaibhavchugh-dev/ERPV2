@echo off
title Cimmple ERP - Application Launcher
color 0A
echo.
echo ========================================
echo    Cimmple ERP Application Launcher
echo ========================================
echo.

REM Change to the project root directory
cd /d "%~dp0"

REM Check if Node.js is installed
where node >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Node.js is not installed or not in PATH
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)
echo [OK] Node.js found

REM Check if .NET SDK is installed
where dotnet >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] .NET SDK is not installed or not in PATH
    echo Please install .NET SDK from https://dotnet.microsoft.com/
    pause
    exit /b 1
)
echo [OK] .NET SDK found
echo.

REM Check if node_modules exists (frontend dependencies)
if not exist "Cimmple_UI\node_modules" (
    echo [WARNING] Frontend dependencies not found. Installing...
    cd Cimmple_UI
    call npm install
    cd ..
    echo.
)

echo ========================================
echo Starting Backend API Server...
echo ========================================
echo Backend will run on: http://localhost:5172
echo Swagger UI: http://localhost:5172/swagger
echo.
start "Cimmple API Server" cmd /k "title Cimmple API Server && cd /d %~dp0Cimmple_API\CimmpleAPI && echo Starting API Server on port 5172... && dotnet run"

REM Wait for the API to start
echo Waiting for API to initialize...
timeout /t 8 /nobreak >nul

echo.
echo ========================================
echo Starting Frontend Development Server...
echo ========================================
echo Frontend will run on: http://localhost:3000
echo.
start "Cimmple Frontend Server" cmd /k "title Cimmple Frontend Server && cd /d %~dp0Cimmple_UI && echo Starting React Development Server... && npm start"

echo.
echo ========================================
echo Servers Started Successfully!
echo ========================================
echo.
echo Backend API:  http://localhost:5172
echo Swagger UI:   http://localhost:5172/swagger
echo Frontend UI:  http://localhost:3000
echo.
echo ========================================
echo Troubleshooting:
echo ========================================
echo If frontend shows no data:
echo 1. Check browser console (F12) for errors
echo 2. Check Network tab for failed API calls
echo 3. Verify you are logged in (token in localStorage)
echo 4. Test API directly: http://localhost:5172/api/Customer/GetCustomerlist?tenantid=1
echo.
echo Both servers are running in separate windows.
echo Close those windows to stop the servers.
echo.
pause


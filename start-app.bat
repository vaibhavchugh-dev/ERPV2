@echo off
cd /d "%~dp0"

start "Cimmple API" cmd /k "cd /d %~dp0Cimmple_API\CimmpleAPI && dotnet run"
timeout /t 5 /nobreak >nul
start "Cimmple UI" cmd /k "cd /d %~dp0Cimmple_UI && npm start"

echo API: http://localhost:5172
echo UI:  http://localhost:3000

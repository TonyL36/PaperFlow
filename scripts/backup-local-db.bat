@echo off
setlocal enabledelayedexpansion

set ROOT=%~dp0..
set SRC=%ROOT%\.dev\h2
if not exist "%SRC%" (
  echo local db folder not found: %SRC%
  exit /b 1
)

for /f %%i in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd-HHmmss"') do set TS=%%i
set DST=%ROOT%\.dev\backup\h2-%TS%
mkdir "%DST%" >nul 2>nul
xcopy "%SRC%\*" "%DST%\" /E /I /Y >nul
echo backup done: %DST%
endlocal


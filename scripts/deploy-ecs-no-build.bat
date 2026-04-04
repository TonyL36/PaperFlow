@echo off
setlocal

set ROOT=%~dp0
set HOST=%1
if "%HOST%"=="" set HOST=47.109.193.180

set USERNAME_ARG=%2
if "%USERNAME_ARG%"=="" set USERNAME_ARG=root

set PSH=pwsh
where pwsh >nul 2>nul
if errorlevel 1 set PSH=powershell

%PSH% -NoProfile -ExecutionPolicy Bypass -File "%ROOT%deploy-ecs-no-build.ps1" -Host %HOST% -User %USERNAME_ARG%
set EXITCODE=%ERRORLEVEL%
endlocal
exit /b %EXITCODE%

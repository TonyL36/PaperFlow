@echo off
setlocal enabledelayedexpansion

set ROOT=%~dp0
if exist "%ROOT%env\\local.env.bat" call "%ROOT%env\\local.env.bat"

set ACTION=%1
if "%ACTION%"=="" set ACTION=up

set BUILD=%2
if "%BUILD%"=="" set BUILD=build
set SKIPBUILD=
if /I "%BUILD%"=="quick" set SKIPBUILD=-SkipBuild
if /I "%BUILD%"=="nobuild" set SKIPBUILD=-SkipBuild
if /I not "%ACTION%"=="up" set SKIPBUILD=
set EXTRA_ARGS=
set OPEN_AFTER_START=1
for %%A in (%2 %3 %4 %5 %6 %7 %8 %9) do (
  if /I "%%~A"=="--no-open" (
    set OPEN_AFTER_START=0
  ) else (
    if not "%%~A"=="" if /I not "%%~A"=="build" if /I not "%%~A"=="quick" if /I not "%%~A"=="nobuild" set EXTRA_ARGS=!EXTRA_ARGS! %%~A
  )
)

if "%PF_GATEWAY_PORT%"=="" set PF_GATEWAY_PORT=3151
if "%PF_USER_PORT%"=="" set PF_USER_PORT=8081
if "%PF_CONTENT_PORT%"=="" set PF_CONTENT_PORT=8082
if "%PF_SPA_PORT%"=="" set PF_SPA_PORT=9628
if "%PF_DEMO_INGEST_TOKEN%"=="" set PF_DEMO_INGEST_TOKEN=demo-token

set PSH=pwsh
where pwsh >nul 2>nul
if errorlevel 1 set PSH=powershell

%PSH% -NoProfile -ExecutionPolicy Bypass -File "%ROOT%dev.ps1" %ACTION% %SKIPBUILD% -GatewayPort %PF_GATEWAY_PORT% -UserServicePort %PF_USER_PORT% -ContentServicePort %PF_CONTENT_PORT% -SpaPort %PF_SPA_PORT% -DemoIngestToken "%PF_DEMO_INGEST_TOKEN%" %EXTRA_ARGS%
set EXITCODE=%ERRORLEVEL%
if /I "%ACTION%"=="up" if "%OPEN_AFTER_START%"=="1" if "%EXITCODE%"=="0" (
  start "" "http://localhost:%PF_SPA_PORT%/paperflow/"
  start "" "http://localhost:%PF_GATEWAY_PORT%/api/v1/posts?page[number]=1&page[size]=1"
)
endlocal
exit /b %EXITCODE%

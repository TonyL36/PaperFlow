@echo off
setlocal enabledelayedexpansion

set ROOT=%~dp0
if exist "%ROOT%env\\local.env.bat" call "%ROOT%env\\local.env.bat"

set ACTION=%1
if "%ACTION%"=="" set ACTION=up

set BUILD=%2
set SKIPBUILD=-SkipBuild
if /I "%BUILD%"=="build" set SKIPBUILD=

if "%PF_GATEWAY_PORT%"=="" set PF_GATEWAY_PORT=3151
if "%PF_USER_PORT%"=="" set PF_USER_PORT=8081
if "%PF_CONTENT_PORT%"=="" set PF_CONTENT_PORT=8082
if "%PF_SPA_PORT%"=="" set PF_SPA_PORT=9628
if "%PF_DEMO_INGEST_TOKEN%"=="" set PF_DEMO_INGEST_TOKEN=demo-token

pwsh -NoProfile -ExecutionPolicy Bypass -File "%ROOT%dev.ps1" %ACTION% %SKIPBUILD% -GatewayPort %PF_GATEWAY_PORT% -UserServicePort %PF_USER_PORT% -ContentServicePort %PF_CONTENT_PORT% -SpaPort %PF_SPA_PORT% -DemoIngestToken "%PF_DEMO_INGEST_TOKEN%"
endlocal


@echo off
setlocal
set "ROOT=%~dp0"
cd /d "%ROOT%"
call "%ROOT%scripts\run-local.bat" up build --no-open
if errorlevel 1 (
  echo.
  echo Start failed. Check logs above.
) else (
  echo.
  echo Started: http://localhost:9628/paperflow/
  echo Gateway: http://localhost:3151
)
endlocal

@echo off
setlocal
set "ROOT=%~dp0"
set "PSH=pwsh"
where pwsh >nul 2>nul
if errorlevel 1 set "PSH=powershell"
cd /d "%ROOT%"

echo [1/3] Cleanup old processes...
call "%ROOT%scripts\run-local.bat" down

echo [2/3] Quick start (reuse existing build)...
call "%ROOT%scripts\run-local.bat" up quick --no-open -Force
if errorlevel 1 (
  echo.
  echo Quick start failed, retry with full build...
  call "%ROOT%scripts\run-local.bat" up build --no-open -Force
)
if errorlevel 1 (
  echo.
  echo Start failed. Check logs above.
  if exist "%ROOT%.dev\logs" (
    echo.
    echo Latest logs:
    %PSH% -NoProfile -ExecutionPolicy Bypass -Command "Get-ChildItem -Path '%ROOT%.dev\logs' | Sort-Object LastWriteTime -Descending | Select-Object -First 8 Name,LastWriteTime | Format-Table -AutoSize"
  )
  exit /b 1
) else (
  echo [3/3] Health checks...
  %PSH% -NoProfile -ExecutionPolicy Bypass -File "%ROOT%scripts\wait-local-ready.ps1" -GatewayPort 3151 -SpaPort 9628 -TimeoutSeconds 120
  if errorlevel 1 (
    echo.
    echo Services are not ready yet. Check .dev\logs and retry.
    if exist "%ROOT%.dev\logs" (
      echo.
      echo Latest logs:
      %PSH% -NoProfile -ExecutionPolicy Bypass -Command "Get-ChildItem -Path '%ROOT%.dev\logs' | Sort-Object LastWriteTime -Descending | Select-Object -First 8 Name,LastWriteTime | Format-Table -AutoSize"
    )
    exit /b 2
  )
  echo.
  echo Started: http://localhost:9628/paperflow/posts?r=%RANDOM%
  echo Gateway: http://localhost:3151
  start "" "http://localhost:9628/paperflow/posts?r=%RANDOM%"
)
endlocal

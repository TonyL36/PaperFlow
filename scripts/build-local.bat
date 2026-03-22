@echo off
setlocal

set ROOT=%~dp0
if exist "%ROOT%env\\local.env.bat" call "%ROOT%env\\local.env.bat"

pushd "%ROOT%.."
call "%ROOT%run-local.bat" down >nul 2>nul

set MVN_CMD=%ROOT%..\.tools\apache-maven-3.9.9\bin\mvn.cmd
if exist "%MVN_CMD%" (
  call "%MVN_CMD%" -DskipTests -pl backend/services/api-gateway,backend/services/user-service,backend/services/content-service -am package
) else (
  pwsh -NoProfile -ExecutionPolicy Bypass -File "%ROOT%bootstrap-maven.ps1" -Cmd package -Args "-DskipTests","-pl","backend/services/api-gateway,backend/services/user-service,backend/services/content-service","-am"
)
if errorlevel 1 (
  popd
  endlocal
  exit /b 1
)

pushd "apps\\paperflow-web"
npm run build
if errorlevel 1 (
  popd
  popd
  endlocal
  exit /b 1
)
popd
popd

echo build ok
endlocal
exit /b 0

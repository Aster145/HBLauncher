@echo off
setlocal DisableDelayedExpansion
cd /d "%~dp0"
call "%~dp0windows-env.cmd"
"%NODE%" scripts/doctor.cjs --host-only
if errorlevel 1 goto failed
"%NODE%" scripts/check-windows.cjs
if errorlevel 1 goto failed
echo No console or keyboard connection was made.
if not "%~1"=="--no-pause" pause
exit /b 0
:failed
if not "%~1"=="--no-pause" pause
exit /b 1

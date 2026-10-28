@echo off
setlocal DisableDelayedExpansion
cd /d "%~dp0"
call "%~dp0windows-env.cmd"
if not "%~1"=="" set "HB_PC_IP=%~1"
if not "%~2"=="" goto usage
if not defined HB_PC_IP set /p "HB_PC_IP=Enter this computer's LAN IPv4 address (not the Switch IP): "
if not defined HB_PC_IP goto usage
"%NODE%" -e "require('./smilebasic/connection.cjs').chooseHost([process.env.HB_PC_IP]).catch(e=>{console.error(e.message);process.exitCode=1;})"
if errorlevel 1 goto failed
"%NODE%" scripts/doctor.cjs --host-only
if errorlevel 1 goto failed
"%NODE%" scripts/check-windows.cjs
if errorlevel 1 goto failed
echo.
echo Starting HBLauncher on %HB_PC_IP% with the existing NS2 bootstrap.
echo Keep this window open. Use Ctrl+C to stop and wait for cleanup.
"%NODE%" homebrew-launcher/start-launcher.cjs --manual "%HB_PC_IP%"
set "HB_EXIT=%ERRORLEVEL%"
pause
exit /b %HB_EXIT%
:usage
echo Usage: Start-Windows.cmd [computer-LAN-IPv4]
echo Set HB_PC_IP or enter the address when prompted. No connection was started.
pause
exit /b 1
:failed
echo Host preparation check failed. See the error above.
pause
exit /b 1

@echo off
setlocal EnableExtensions
set "SOURCE_REF=263ed6076c3198b66964c98e121806daf411a444"
set "OVERLAY_REF=263ed6076c3198b66964c98e121806daf411a444"
set "OVERLAY_URL=https://raw.githubusercontent.com/TAMAFIT/voicetrader-pwa/%SOURCE_REF%/scripts/local-node/configure-v085-reboot-recovery.ps1"
set "OVERLAY_FILE=%TEMP%\voicetrader-v085-reboot-%RANDOM%%RANDOM%.ps1"

echo VoiceTrader Local Edge Lab v0.85 Reboot Recovery
echo Exact source : %SOURCE_REF%
echo Exact overlay: %OVERLAY_REF%
echo Receipt path collision fix: ON
echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Invoke-WebRequest -UseBasicParsing -Uri '%OVERLAY_URL%' -OutFile '%OVERLAY_FILE%'"
if errorlevel 1 (
  echo ERROR: failed to download exact-pinned v0.85 overlay.
  if exist "%OVERLAY_FILE%" del /q "%OVERLAY_FILE%" >nul 2>&1
  exit /b 1
)
if not exist "%OVERLAY_FILE%" exit /b 1
for %%A in ("%OVERLAY_FILE%") do if %%~zA LEQ 0 (del /q "%OVERLAY_FILE%" >nul 2>&1 & exit /b 1)

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%OVERLAY_FILE%" -OverlayRef "%OVERLAY_REF%" %*
set "RC=%ERRORLEVEL%"
del /q "%OVERLAY_FILE%" >nul 2>&1
if not "%RC%"=="0" (
  echo v0.85 reboot recovery overlay did not complete.
  exit /b %RC%
)
echo v0.85 reboot recovery overlay configured successfully.
echo A later genuine Windows reboot is still required for PROVEN status.
exit /b 0

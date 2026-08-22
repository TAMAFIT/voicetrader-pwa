@echo off
setlocal EnableExtensions
set "SOURCE_REF=263ed6076c3198b66964c98e121806daf411a444"
set "OVERLAY_REF=263ed6076c3198b66964c98e121806daf411a444"
set "URL=https://raw.githubusercontent.com/TAMAFIT/voicetrader-pwa/%SOURCE_REF%/scripts/local-node/configure-v086-soak-certification.ps1"
set "FILE=%TEMP%\voicetrader-v086-soak-%RANDOM%%RANDOM%.ps1"
echo VoiceTrader Local Edge Lab v0.86 24h Soak Certification
echo Exact overlay: %OVERLAY_REF%
echo Receipt path collision fix: ON
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Invoke-WebRequest -UseBasicParsing -Uri '%URL%' -OutFile '%FILE%'"
if errorlevel 1 exit /b 1
if not exist "%FILE%" exit /b 1
for %%A in ("%FILE%") do if %%~zA LEQ 0 (del /q "%FILE%" >nul 2>&1 & exit /b 1)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%FILE%" -OverlayRef "%OVERLAY_REF%" %*
set "RC=%ERRORLEVEL%"
del /q "%FILE%" >nul 2>&1
if not "%RC%"=="0" exit /b %RC%
echo v0.86 soak certifier configured. PROVEN_24H requires 24 consecutive certified hours.
exit /b 0

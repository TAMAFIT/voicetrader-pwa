@echo off
setlocal EnableExtensions

set "FIXED_LAUNCHER_SOURCE=3e5658e4462264614c7830d5b7c757303e4bccb8"
set "V085_URL=https://raw.githubusercontent.com/TAMAFIT/voicetrader-pwa/%FIXED_LAUNCHER_SOURCE%/scripts/local-node/install-v085-reboot-recovery.cmd"
set "V086_URL=https://raw.githubusercontent.com/TAMAFIT/voicetrader-pwa/%FIXED_LAUNCHER_SOURCE%/scripts/local-node/install-v086-soak-certification.cmd"
set "V085_FILE=%TEMP%\voicetrader-recover-v085-%RANDOM%%RANDOM%.cmd"
set "V086_FILE=%TEMP%\voicetrader-recover-v086-%RANDOM%%RANDOM%.cmd"
set "V084_RECEIPT=X:\XVoiceTraderData\state\local-edge-lab-v084-config.json"

net session >nul 2>&1
if errorlevel 1 (
  echo ERROR: Administrator privileges are required.
  exit /b 1
)

if not exist "%V084_RECEIPT%" (
  echo ERROR: healthy v0.84 receipt not found. Refusing partial recovery.
  exit /b 1
)

echo ============================================================
echo VoiceTrader Local Edge Lab recovery

echo Existing v0.84: PRESERVED

echo Installing only fixed v0.85 then fixed v0.86

echo Receipt path collision guard: ON

echo Real money / orders / cloud upload: OFF

echo ============================================================
echo.

echo [1/2] Installing fixed v0.85 reboot recovery...
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Invoke-WebRequest -UseBasicParsing -Uri '%V085_URL%' -OutFile '%V085_FILE%'"
if errorlevel 1 goto :fail85
if not exist "%V085_FILE%" goto :fail85
for %%A in ("%V085_FILE%") do if %%~zA LEQ 0 goto :fail85
call "%V085_FILE%"
set "RC=%ERRORLEVEL%"
del /q "%V085_FILE%" >nul 2>&1
if not "%RC%"=="0" (
  echo ERROR: fixed v0.85 did not complete. v0.86 was not attempted.
  exit /b %RC%
)

echo.
echo [2/2] Installing fixed v0.86 soak certification...
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Invoke-WebRequest -UseBasicParsing -Uri '%V086_URL%' -OutFile '%V086_FILE%'"
if errorlevel 1 goto :fail86
if not exist "%V086_FILE%" goto :fail86
for %%A in ("%V086_FILE%") do if %%~zA LEQ 0 goto :fail86
call "%V086_FILE%"
set "RC=%ERRORLEVEL%"
del /q "%V086_FILE%" >nul 2>&1
if not "%RC%"=="0" (
  echo ERROR: v0.85 is configured, but fixed v0.86 did not complete.
  exit /b %RC%
)

echo.
echo ============================================================
echo SUCCESS: v0.84 preserved, fixed v0.85 + v0.86 installed.
echo v0.85 still requires one genuine later Windows reboot for PROVEN.
echo v0.86 is now collecting toward PROVEN_24H.
echo Real money / orders / cloud upload remain OFF.
echo ============================================================
exit /b 0

:fail85
if exist "%V085_FILE%" del /q "%V085_FILE%" >nul 2>&1
echo ERROR: failed to acquire fixed v0.85 launcher.
exit /b 1

:fail86
if exist "%V086_FILE%" del /q "%V086_FILE%" >nul 2>&1
echo ERROR: failed to acquire fixed v0.86 launcher.
exit /b 1

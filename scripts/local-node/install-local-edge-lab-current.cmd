@echo off
setlocal EnableExtensions
set "V084_SOURCE=a0c24544f194fecd49ce835fe8878a7ac0c8b34c"
set "V085_SOURCE=b65d7d3ed1b26b373009b26c00a900568e4bdc92"
set "V086_SOURCE=15af73d33cdf5349ceecda1587fb0be5392ea62d"
set "V084_URL=https://raw.githubusercontent.com/TAMAFIT/voicetrader-pwa/%V084_SOURCE%/scripts/local-node/install-v084-windows.cmd"
set "V085_URL=https://raw.githubusercontent.com/TAMAFIT/voicetrader-pwa/%V085_SOURCE%/scripts/local-node/install-v085-reboot-recovery.cmd"
set "V086_URL=https://raw.githubusercontent.com/TAMAFIT/voicetrader-pwa/%V086_SOURCE%/scripts/local-node/install-v086-soak-certification.cmd"
set "V084_FILE=%TEMP%\voicetrader-install-v084-%RANDOM%%RANDOM%.cmd"
set "V085_FILE=%TEMP%\voicetrader-install-v085-%RANDOM%%RANDOM%.cmd"
set "V086_FILE=%TEMP%\voicetrader-install-v086-%RANDOM%%RANDOM%.cmd"

echo ============================================================
echo VoiceTrader Local Edge Lab - current one-click install
echo v0.84: dual-venue research runtime + live health gate
echo v0.85: genuine reboot recovery witness
echo v0.86: 24h continuous soak certification
echo Real money / orders / cloud upload: OFF
echo ============================================================
echo.

echo [1/3] Installing exact v0.84 base...
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Invoke-WebRequest -UseBasicParsing -Uri '%V084_URL%' -OutFile '%V084_FILE%'"
if errorlevel 1 goto :fail84download
call "%V084_FILE%"
set "RC=%ERRORLEVEL%"
del /q "%V084_FILE%" >nul 2>&1
if not "%RC%"=="0" (
  echo ERROR: v0.84 did not complete. Later overlays were not attempted.
  exit /b %RC%
)

echo.
echo [2/3] Configuring exact v0.85 reboot recovery...
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Invoke-WebRequest -UseBasicParsing -Uri '%V085_URL%' -OutFile '%V085_FILE%'"
if errorlevel 1 goto :fail85download
call "%V085_FILE%"
set "RC=%ERRORLEVEL%"
del /q "%V085_FILE%" >nul 2>&1
if not "%RC%"=="0" (
  echo ERROR: v0.84 is healthy, but v0.85 did not complete. v0.86 was not attempted.
  exit /b %RC%
)

echo.
echo [3/3] Configuring exact v0.86 24h soak certifier...
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Invoke-WebRequest -UseBasicParsing -Uri '%V086_URL%' -OutFile '%V086_FILE%'"
if errorlevel 1 goto :fail86download
call "%V086_FILE%"
set "RC=%ERRORLEVEL%"
del /q "%V086_FILE%" >nul 2>&1
if not "%RC%"=="0" (
  echo ERROR: v0.84/v0.85 are configured, but v0.86 did not complete.
  exit /b %RC%
)

echo.
echo ============================================================
echo VoiceTrader Local Edge Lab current install completed.
echo v0.84 health had to PASS during installation.
echo v0.85 reboot baseline is configured.
echo v0.86 soak sampling is running.
echo A later genuine Windows reboot is required for reboot PROVEN.
echo 24 consecutive certified hours are required for PROVEN_24H.
echo No reboot was triggered automatically.
echo ============================================================
exit /b 0

:fail84download
echo ERROR: failed to acquire exact v0.84 installer.
if exist "%V084_FILE%" del /q "%V084_FILE%" >nul 2>&1
exit /b 1
:fail85download
echo ERROR: failed to acquire exact v0.85 installer.
if exist "%V085_FILE%" del /q "%V085_FILE%" >nul 2>&1
exit /b 1
:fail86download
echo ERROR: failed to acquire exact v0.86 installer.
if exist "%V086_FILE%" del /q "%V086_FILE%" >nul 2>&1
exit /b 1

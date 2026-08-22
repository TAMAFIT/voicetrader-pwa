@echo off
setlocal EnableExtensions

set "V084_UPGRADER_SOURCE=d6f0762e245b50411f98a00358549361624b2c2f"
set "V084_RUNTIME=fd1d81fe525db925cf73c8a43199d9b6112910d4"
set "V085_SOURCE=b65d7d3ed1b26b373009b26c00a900568e4bdc92"
set "V086_SOURCE=15af73d33cdf5349ceecda1587fb0be5392ea62d"
set "V084_URL=https://raw.githubusercontent.com/TAMAFIT/voicetrader-pwa/%V084_UPGRADER_SOURCE%/scripts/local-node/upgrade-v084-windows.ps1"
set "V085_URL=https://raw.githubusercontent.com/TAMAFIT/voicetrader-pwa/%V085_SOURCE%/scripts/local-node/install-v085-reboot-recovery.cmd"
set "V086_URL=https://raw.githubusercontent.com/TAMAFIT/voicetrader-pwa/%V086_SOURCE%/scripts/local-node/install-v086-soak-certification.cmd"
set "V084_FILE=%TEMP%\voicetrader-upgrade-v084-%RANDOM%%RANDOM%.ps1"
set "V085_FILE=%TEMP%\voicetrader-install-v085-%RANDOM%%RANDOM%.cmd"
set "V086_FILE=%TEMP%\voicetrader-install-v086-%RANDOM%%RANDOM%.cmd"

net session >nul 2>&1
if errorlevel 1 (
  echo ============================================================
  echo VoiceTrader Local Edge Lab - current one-click install
  echo ============================================================
  echo ERROR: Administrator privileges are required.
  echo Right-click this file and choose "Run as administrator".
  goto :fail
)

echo ============================================================
echo VoiceTrader Local Edge Lab - current one-click install

echo v0.84: dual-venue research runtime + live health gate

echo Coinbase fix: sequence continuity tracked PER PRODUCT

echo v0.85: genuine reboot recovery witness

echo v0.86: 24h continuous soak certification

echo Real money / orders / cloud upload: OFF

echo ============================================================
echo.

echo [1/3] Installing exact fixed v0.84 runtime...
echo Exact runtime: %V084_RUNTIME%
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Invoke-WebRequest -UseBasicParsing -Uri '%V084_URL%' -OutFile '%V084_FILE%'"
if errorlevel 1 goto :fail84download
if not exist "%V084_FILE%" goto :fail84download
for %%A in ("%V084_FILE%") do if %%~zA LEQ 0 goto :fail84download
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%V084_FILE%" -RuntimeRef "%V084_RUNTIME%"
set "RC=%ERRORLEVEL%"
del /q "%V084_FILE%" >nul 2>&1
if not "%RC%"=="0" (
  echo ERROR: fixed v0.84 did not complete. v0.85/v0.86 were not attempted.
  goto :fail
)

echo.
echo [2/3] Configuring exact v0.85 reboot recovery...
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Invoke-WebRequest -UseBasicParsing -Uri '%V085_URL%' -OutFile '%V085_FILE%'"
if errorlevel 1 goto :fail85download
if not exist "%V085_FILE%" goto :fail85download
for %%A in ("%V085_FILE%") do if %%~zA LEQ 0 goto :fail85download
call "%V085_FILE%"
set "RC=%ERRORLEVEL%"
del /q "%V085_FILE%" >nul 2>&1
if not "%RC%"=="0" (
  echo ERROR: v0.84 is healthy, but v0.85 did not complete. v0.86 was not attempted.
  goto :fail
)

echo.
echo [3/3] Configuring exact v0.86 24h soak certifier...
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Invoke-WebRequest -UseBasicParsing -Uri '%V086_URL%' -OutFile '%V086_FILE%'"
if errorlevel 1 goto :fail86download
if not exist "%V086_FILE%" goto :fail86download
for %%A in ("%V086_FILE%") do if %%~zA LEQ 0 goto :fail86download
call "%V086_FILE%"
set "RC=%ERRORLEVEL%"
del /q "%V086_FILE%" >nul 2>&1
if not "%RC%"=="0" (
  echo ERROR: v0.84/v0.85 are configured, but v0.86 did not complete.
  goto :fail
)

echo.
echo ============================================================
echo SUCCESS: VoiceTrader Local Edge Lab current install completed.
echo v0.84 live health: PASS

echo v0.85 reboot baseline: configured

echo v0.86 soak sampling: running

echo A later genuine Windows reboot is required for reboot PROVEN.

echo 24 consecutive certified hours are required for PROVEN_24H.

echo No reboot was triggered automatically.

echo Real money / orders / cloud upload remain OFF.

echo ============================================================
set "FINAL_RC=0"
goto :finish

:fail84download
echo ERROR: failed to acquire exact v0.84 upgrader.
goto :fail
:fail85download
echo ERROR: failed to acquire exact v0.85 installer.
goto :fail
:fail86download
echo ERROR: failed to acquire exact v0.86 installer.
goto :fail

:fail
set "FINAL_RC=1"
if exist "%V084_FILE%" del /q "%V084_FILE%" >nul 2>&1
if exist "%V085_FILE%" del /q "%V085_FILE%" >nul 2>&1
if exist "%V086_FILE%" del /q "%V086_FILE%" >nul 2>&1
echo.
echo Installation stopped safely.

:finish
echo.
if /I not "%VOICEDEV_NONINTERACTIVE%"=="1" (
  echo Press any key to close this window.
  pause >nul
)
exit /b %FINAL_RC%

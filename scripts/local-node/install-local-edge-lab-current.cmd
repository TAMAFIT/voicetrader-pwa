@echo off
setlocal EnableExtensions
set "V084_SOURCE=a0c24544f194fecd49ce835fe8878a7ac0c8b34c"
set "V085_SOURCE=b65d7d3ed1b26b373009b26c00a900568e4bdc92"
set "V084_URL=https://raw.githubusercontent.com/TAMAFIT/voicetrader-pwa/%V084_SOURCE%/scripts/local-node/install-v084-windows.cmd"
set "V085_URL=https://raw.githubusercontent.com/TAMAFIT/voicetrader-pwa/%V085_SOURCE%/scripts/local-node/install-v085-reboot-recovery.cmd"
set "V084_FILE=%TEMP%\voicetrader-install-v084-%RANDOM%%RANDOM%.cmd"
set "V085_FILE=%TEMP%\voicetrader-install-v085-%RANDOM%%RANDOM%.cmd"

echo ============================================================
echo VoiceTrader Local Edge Lab - current one-click install
echo Base research runtime: v0.84
echo Reboot recovery proof: v0.85
echo Real money / orders / cloud upload: OFF
echo ============================================================
echo.

echo [1/2] Acquiring exact v0.84 installer...
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Invoke-WebRequest -UseBasicParsing -Uri '%V084_URL%' -OutFile '%V084_FILE%'"
if errorlevel 1 goto :download_fail
call "%V084_FILE%"
set "RC=%ERRORLEVEL%"
del /q "%V084_FILE%" >nul 2>&1
if not "%RC%"=="0" (
  echo ERROR: v0.84 base installation did not complete. v0.85 was not attempted.
  exit /b %RC%
)

echo.
echo [2/2] Acquiring exact v0.85 reboot-recovery overlay...
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Invoke-WebRequest -UseBasicParsing -Uri '%V085_URL%' -OutFile '%V085_FILE%'"
if errorlevel 1 goto :download_fail_v085
call "%V085_FILE%"
set "RC=%ERRORLEVEL%"
del /q "%V085_FILE%" >nul 2>&1
if not "%RC%"=="0" (
  echo ERROR: v0.84 is healthy, but v0.85 reboot-recovery overlay did not complete.
  exit /b %RC%
)

echo.
echo ============================================================
echo VoiceTrader Local Edge Lab current install completed.
echo v0.84 live health was required to PASS.
echo v0.85 baseline is configured.
echo A later genuine Windows reboot is required before reboot recovery can become PROVEN.
echo No reboot was triggered automatically.
echo ============================================================
exit /b 0

:download_fail
echo ERROR: failed to acquire exact v0.84 installer.
if exist "%V084_FILE%" del /q "%V084_FILE%" >nul 2>&1
exit /b 1

:download_fail_v085
echo ERROR: failed to acquire exact v0.85 overlay installer.
if exist "%V085_FILE%" del /q "%V085_FILE%" >nul 2>&1
exit /b 1

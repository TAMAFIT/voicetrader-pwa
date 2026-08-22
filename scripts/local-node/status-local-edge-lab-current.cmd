@echo off
setlocal EnableExtensions
set "V084_STATUS_SOURCE=a0c24544f194fecd49ce835fe8878a7ac0c8b34c"
set "V085_STATUS_SOURCE=b65d7d3ed1b26b373009b26c00a900568e4bdc92"
set "S84=%TEMP%\voicetrader-status-v084-%RANDOM%%RANDOM%.ps1"
set "S85=%TEMP%\voicetrader-status-v085-%RANDOM%%RANDOM%.ps1"

powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Invoke-WebRequest -UseBasicParsing -Uri 'https://raw.githubusercontent.com/TAMAFIT/voicetrader-pwa/%V084_STATUS_SOURCE%/scripts/local-node/status-v084-windows.ps1' -OutFile '%S84%'"
if errorlevel 1 exit /b 1
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Invoke-WebRequest -UseBasicParsing -Uri 'https://raw.githubusercontent.com/TAMAFIT/voicetrader-pwa/%V085_STATUS_SOURCE%/scripts/local-node/status-v085-reboot-recovery.ps1' -OutFile '%S85%'"
if errorlevel 1 (del /q "%S84%" >nul 2>&1 & exit /b 1)

echo.
echo ===== v0.84 runtime health =====
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%S84%"
echo.
echo ===== v0.85 reboot recovery =====
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%S85%"
set "RC=%ERRORLEVEL%"
del /q "%S84%" "%S85%" >nul 2>&1
exit /b %RC%

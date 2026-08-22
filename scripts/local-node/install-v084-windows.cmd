@echo off
setlocal EnableExtensions
set "SOURCE_REF=d6f0762e245b50411f98a00358549361624b2c2f"
set "RUNTIME_REF=d6f0762e245b50411f98a00358549361624b2c2f"
set "UPGRADE_URL=https://raw.githubusercontent.com/TAMAFIT/voicetrader-pwa/%SOURCE_REF%/scripts/local-node/upgrade-v084-windows.ps1"
set "UPGRADE_FILE=%TEMP%\voicetrader-upgrade-v084-%RANDOM%%RANDOM%.ps1"

echo VoiceTrader Local Edge Lab v0.84 RC
echo Exact source : %SOURCE_REF%
echo Exact runtime: %RUNTIME_REF%
echo.
echo Downloading exact-pinned upgrader...
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Invoke-WebRequest -UseBasicParsing -Uri '%UPGRADE_URL%' -OutFile '%UPGRADE_FILE%'"
if errorlevel 1 (
  echo ERROR: failed to download exact-pinned upgrader.
  if exist "%UPGRADE_FILE%" del /q "%UPGRADE_FILE%" >nul 2>&1
  exit /b 1
)

if not exist "%UPGRADE_FILE%" (
  echo ERROR: upgrader file missing after download.
  exit /b 1
)

for %%A in ("%UPGRADE_FILE%") do if %%~zA LEQ 0 (
  echo ERROR: downloaded upgrader is empty.
  del /q "%UPGRADE_FILE%" >nul 2>&1
  exit /b 1
)

echo Starting fail-closed staged upgrade...
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%UPGRADE_FILE%" -RuntimeRef "%RUNTIME_REF%" %*
set "RC=%ERRORLEVEL%"

del /q "%UPGRADE_FILE%" >nul 2>&1
if not "%RC%"=="0" (
  echo.
  echo v0.84 install did not complete. Existing runtime should have been preserved or rolled back.
  exit /b %RC%
)

echo.
echo v0.84 installer completed successfully.
exit /b 0

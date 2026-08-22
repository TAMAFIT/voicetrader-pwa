@echo off
setlocal EnableExtensions

set "V086_LAUNCHER_SOURCE=d2ed6c5fbb49ff4d69af0f5b868ccc7dabf508f4"
set "V086_URL=https://raw.githubusercontent.com/TAMAFIT/voicetrader-pwa/%V086_LAUNCHER_SOURCE%/scripts/local-node/install-v086-soak-certification.cmd"
set "V086_FILE=%TEMP%\voicetrader-recover-v086-%RANDOM%%RANDOM%.cmd"
set "V084_RECEIPT=X:\XVoiceTraderData\state\local-edge-lab-v084-config.json"
set "V085_RECEIPT=X:\XVoiceTraderData\state\local-edge-lab-v085-config.json"

net session >nul 2>&1
if errorlevel 1 (
  echo ERROR: Administrator privileges are required.
  exit /b 1
)
if not exist "%V084_RECEIPT%" (
  echo ERROR: v0.84 receipt missing. Refusing v0.86-only recovery.
  exit /b 1
)
if not exist "%V085_RECEIPT%" (
  echo ERROR: v0.85 receipt missing. Refusing v0.86-only recovery.
  exit /b 1
)

echo ============================================================
echo VoiceTrader Local Edge Lab v0.86-only recovery
echo Existing v0.84: PRESERVED
echo Existing v0.85: PRESERVED
echo v0.86 PowerShell alias collision guard: ON
echo v0.86 receipt path collision guard: ON
echo Real money / orders / cloud upload: OFF
echo ============================================================
echo.

powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Invoke-WebRequest -UseBasicParsing -Uri '%V086_URL%' -OutFile '%V086_FILE%'"
if errorlevel 1 goto :fail
if not exist "%V086_FILE%" goto :fail
for %%A in ("%V086_FILE%") do if %%~zA LEQ 0 goto :fail
call "%V086_FILE%"
set "RC=%ERRORLEVEL%"
del /q "%V086_FILE%" >nul 2>&1
if not "%RC%"=="0" (
  echo ERROR: fixed v0.86 did not complete. v0.84/v0.85 remain preserved.
  exit /b %RC%
)

echo.
echo ============================================================
echo SUCCESS: v0.84 + v0.85 preserved; fixed v0.86 installed.
echo v0.86 is collecting toward PROVEN_24H.
echo A genuine Windows reboot is still required for v0.85 PROVEN.
echo Real money / orders / cloud upload remain OFF.
echo ============================================================
exit /b 0

:fail
if exist "%V086_FILE%" del /q "%V086_FILE%" >nul 2>&1
echo ERROR: failed to acquire fixed v0.86 launcher.
exit /b 1

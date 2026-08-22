param(
  [string]$DataRoot = 'X:\XVoiceTraderData'
)

$ErrorActionPreference = 'Stop'
$TaskName = 'VoiceTrader-LocalNode-GMO-USDJPY'

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = [Security.Principal.WindowsPrincipal]::new($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  if (-not $PSCommandPath) { throw 'Save this script as a .ps1 file before running.' }
  Start-Process -FilePath 'powershell.exe' -Verb RunAs -ArgumentList @(
    '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ('"{0}"' -f $PSCommandPath), '-DataRoot', ('"{0}"' -f $DataRoot)
  )
  exit 0
}

$task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($task) {
  Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
}

Write-Host "Removed scheduled task: $TaskName"
Write-Host "Preserved all market data under: $DataRoot"
Write-Host 'No raw, derived, research, state, or log data was deleted.'

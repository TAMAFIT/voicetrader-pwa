param(
  [string]$DataRoot = 'X:\XVoiceTraderData',
  [string]$RepoRef = '921ad2f1c107d4a82c887b823aa43de33135e4b1'
)

$ErrorActionPreference = 'Stop'
$TaskName = 'VoiceTrader-LocalNode-GMO-Derived'
$RepoBase = "https://raw.githubusercontent.com/TAMAFIT/voicetrader-pwa/$RepoRef"

function Test-Administrator {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = [Security.Principal.WindowsPrincipal]::new($identity)
  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

if (-not (Test-Administrator)) {
  if (-not $PSCommandPath) { throw 'Save this upgrader as a .ps1 file before running.' }
  $arguments = @(
    '-NoProfile','-ExecutionPolicy','Bypass','-File',('"{0}"' -f $PSCommandPath),
    '-DataRoot',('"{0}"' -f $DataRoot),'-RepoRef',('"{0}"' -f $RepoRef)
  )
  Start-Process -FilePath 'powershell.exe' -Verb RunAs -ArgumentList $arguments
  exit 0
}

if (-not (Test-Path $DataRoot)) { throw "VoiceTrader data root does not exist: $DataRoot" }
$configPath = Join-Path $DataRoot 'state\local-node-config.json'
if (-not (Test-Path $configPath)) { throw 'v0.49 Local Node config was not found. Install v0.49 first.' }
$config = Get-Content -Raw $configPath | ConvertFrom-Json
$nodeExe = [string]$config.nodeExe
if (-not $nodeExe -or -not (Test-Path $nodeExe)) {
  $nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
  if (-not $nodeCommand) { throw 'Node.js was not found.' }
  $nodeExe = $nodeCommand.Source
}
$nodeVersionText = (& $nodeExe --version).Trim()
$nodeMajor = [int](($nodeVersionText.TrimStart('v') -split '\.')[0])
if ($nodeMajor -lt 22) { throw "Node.js 22+ is required. Found: $nodeVersionText" }

$runtimeRoot = Join-Path $DataRoot 'runtime\voicetrader-local-node'
$runtimeScriptDir = Join-Path $runtimeRoot 'scripts\local-node'
$runtimeSourceDir = Join-Path $runtimeRoot 'src\short-horizon'
New-Item -ItemType Directory -Force -Path $runtimeScriptDir | Out-Null
New-Item -ItemType Directory -Force -Path $runtimeSourceDir | Out-Null

$downloads = @(
  @{ Url="$RepoBase/scripts/local-node/gmo-quote-derived-worker.mjs"; Destination=(Join-Path $runtimeScriptDir 'gmo-quote-derived-worker.mjs') },
  @{ Url="$RepoBase/src/short-horizon/local-node-gmo-derived.js"; Destination=(Join-Path $runtimeSourceDir 'local-node-gmo-derived.js') }
)
foreach ($download in $downloads) {
  Write-Host "Downloading $($download.Url)"
  Invoke-WebRequest -UseBasicParsing -Uri $download.Url -OutFile $download.Destination
}

$worker = Join-Path $runtimeScriptDir 'gmo-quote-derived-worker.mjs'
& $nodeExe --check $worker
if ($LASTEXITCODE -ne 0) { throw 'Derived worker syntax check failed.' }

$derivedConfigPath = Join-Path $DataRoot 'state\derived-gmo-config.json'
$derivedConfig = [ordered]@{
  schemaVersion='voicetrader-local-derived-config-v1'
  installedAt=(Get-Date).ToUniversalTime().ToString('o')
  dataRoot=$DataRoot
  repo='TAMAFIT/voicetrader-pwa'
  repoRef=$RepoRef
  nodeExe=$nodeExe
  nodeVersion=$nodeVersionText
  taskName=$TaskName
  intervals=@('1s','5s','1m')
  pollMs=15000
  lookbackMinutes=5
  semantics=[ordered]@{
    rawIsAuthoritative=$true
    derivedIsRebuildable=$true
    quoteDirectionBalanceIsOfi=$false
    orderBookObserved=$false
  }
  runtimePolicy=[ordered]@{
    googleCloudEnabled=$false
    cloudUploadEnabled=$false
    githubActionsRequired=$false
    externalNetworkRequired=$false
    orderSubmission=$false
    realMoneyRouting=$false
  }
}
$derivedConfig | ConvertTo-Json -Depth 6 | Set-Content -Encoding UTF8 -Path $derivedConfigPath

$action = New-ScheduledTaskAction `
  -Execute $nodeExe `
  -Argument ('"{0}" --root "{1}" --poll-ms 15000 --lookback-minutes 5' -f $worker,$DataRoot) `
  -WorkingDirectory $runtimeRoot
$trigger = New-ScheduledTaskTrigger -AtStartup
$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet `
  -StartWhenAvailable `
  -RestartCount 999 `
  -RestartInterval (New-TimeSpan -Minutes 1) `
  -ExecutionTimeLimit ([TimeSpan]::Zero) `
  -MultipleInstances IgnoreNew

$existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($existing) {
  Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
}
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings `
  -Description 'VoiceTrader local-only GMO USDJPY derived feature engine. Reads local raw data only; no cloud upload.' | Out-Null
Start-ScheduledTask -TaskName $TaskName
Start-Sleep -Seconds 3

$healthPath = Join-Path $DataRoot 'state\derived-gmo-health.json'
Write-Host ''
Write-Host 'VoiceTrader v0.50 Derived Engine installed.'
Write-Host "Task: $TaskName"
Write-Host "Derived root: $(Join-Path $DataRoot 'derived\gmo-fx\USDJPY\quote-bars')"
Write-Host "Health: $healthPath"
Write-Host 'Intervals: 1s / 5s / 1m'
Write-Host 'Google Cloud = OFF / Cloud upload = OFF / Runtime network = local files only'
Write-Host 'Scientific label: quote-direction balance is NOT OFI; order book is NOT observed.'
if (Test-Path $healthPath) {
  $health = Get-Content -Raw $healthPath | ConvertFrom-Json
  Write-Host "Worker status: $($health.status)"
  Write-Host "Latest pass raw quotes: $($health.lastPass.totals.rawQuotes)"
  Write-Host "Latest pass appended derived records: $($health.lastPass.totals.appended)"
} else {
  Write-Host 'Health file is not visible yet; the startup task may still be initializing.'
}

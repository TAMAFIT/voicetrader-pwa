param(
  [string]$DataRoot = 'X:\XVoiceTraderData',
  [string]$RepoRef = 'e48f351891b5c2a2a45388ae2d0488583e5bf9af'
)

$ErrorActionPreference = 'Stop'
$TaskName = 'VoiceTrader-LocalNode-GMO-USDJPY'
$RepoBase = "https://raw.githubusercontent.com/TAMAFIT/voicetrader-pwa/$RepoRef"

function Test-Administrator {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = [Security.Principal.WindowsPrincipal]::new($identity)
  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

if (-not (Test-Administrator)) {
  if (-not $PSCommandPath) {
    throw 'Save this installer as a .ps1 file before running so it can request administrator privileges.'
  }
  $arguments = @(
    '-NoProfile',
    '-ExecutionPolicy', 'Bypass',
    '-File', ('"{0}"' -f $PSCommandPath),
    '-DataRoot', ('"{0}"' -f $DataRoot),
    '-RepoRef', ('"{0}"' -f $RepoRef)
  )
  Start-Process -FilePath 'powershell.exe' -Verb RunAs -ArgumentList $arguments
  exit 0
}

$resolvedDrive = [System.IO.Path]::GetPathRoot($DataRoot)
if (-not $resolvedDrive -or -not (Test-Path $resolvedDrive)) {
  throw "Data drive does not exist: $resolvedDrive"
}

$nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
if (-not $nodeCommand) {
  $fallbackNode = 'C:\Program Files\nodejs\node.exe'
  if (Test-Path $fallbackNode) {
    $nodeExe = $fallbackNode
  } else {
    throw 'Node.js 22+ was not found. Install current Node.js LTS, then rerun this installer.'
  }
} else {
  $nodeExe = $nodeCommand.Source
}

$nodeVersionText = (& $nodeExe --version).Trim()
$nodeMajor = [int](($nodeVersionText.TrimStart('v') -split '\.')[0])
if ($nodeMajor -lt 22) {
  throw "Node.js 22+ is required for the built-in WebSocket runtime. Found: $nodeVersionText"
}

$directories = @(
  $DataRoot,
  (Join-Path $DataRoot 'raw'),
  (Join-Path $DataRoot 'derived'),
  (Join-Path $DataRoot 'candles'),
  (Join-Path $DataRoot 'research'),
  (Join-Path $DataRoot 'state'),
  (Join-Path $DataRoot 'logs'),
  (Join-Path $DataRoot 'runtime')
)
foreach ($directory in $directories) {
  New-Item -ItemType Directory -Force -Path $directory | Out-Null
}

$runtimeRoot = Join-Path $DataRoot 'runtime\voicetrader-local-node'
$runtimeScriptDir = Join-Path $runtimeRoot 'scripts\local-node'
$runtimeSourceDir = Join-Path $runtimeRoot 'src\short-horizon'
New-Item -ItemType Directory -Force -Path $runtimeScriptDir | Out-Null
New-Item -ItemType Directory -Force -Path $runtimeSourceDir | Out-Null

$downloads = @(
  @{
    Url = "$RepoBase/scripts/local-node/gmo-fx-tick-recorder.mjs"
    Destination = Join-Path $runtimeScriptDir 'gmo-fx-tick-recorder.mjs'
  },
  @{
    Url = "$RepoBase/src/short-horizon/gmo-fx-public-quote.js"
    Destination = Join-Path $runtimeSourceDir 'gmo-fx-public-quote.js'
  },
  @{
    Url = "$RepoBase/src/short-horizon/local-node-gmo-tick.js"
    Destination = Join-Path $runtimeSourceDir 'local-node-gmo-tick.js'
  }
)

foreach ($download in $downloads) {
  Write-Host "Downloading $($download.Url)"
  Invoke-WebRequest -UseBasicParsing -Uri $download.Url -OutFile $download.Destination
}

$recorderScript = Join-Path $runtimeScriptDir 'gmo-fx-tick-recorder.mjs'
& $nodeExe --check $recorderScript
if ($LASTEXITCODE -ne 0) { throw 'Recorder syntax check failed.' }

$configPath = Join-Path $DataRoot 'state\local-node-config.json'
$config = [ordered]@{
  schemaVersion = 'voicetrader-local-node-config-v1'
  installedAt = (Get-Date).ToUniversalTime().ToString('o')
  dataRoot = $DataRoot
  repo = 'TAMAFIT/voicetrader-pwa'
  repoRef = $RepoRef
  nodeExe = $nodeExe
  nodeVersion = $nodeVersionText
  taskName = $TaskName
  source = [ordered]@{
    provider = 'GMO Coin Foreign Exchange FX'
    endpoint = 'wss://forex-api.coin.z.com/ws/public/v1'
    symbol = 'USD_JPY'
    authenticationRequired = $false
  }
  runtimePolicy = [ordered]@{
    googleCloudEnabled = $false
    cloudUploadEnabled = $false
    githubActionsRequired = $false
    telemetryEnabled = $false
    orderSubmission = $false
    realMoneyRouting = $false
  }
}
$config | ConvertTo-Json -Depth 6 | Set-Content -Encoding UTF8 -Path $configPath

$action = New-ScheduledTaskAction `
  -Execute $nodeExe `
  -Argument ('"{0}" --root "{1}"' -f $recorderScript, $DataRoot) `
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
Register-ScheduledTask `
  -TaskName $TaskName `
  -Action $action `
  -Trigger $trigger `
  -Principal $principal `
  -Settings $settings `
  -Description 'VoiceTrader local-only persistent GMO USDJPY public quote recorder. No Google Cloud, no order routing.' | Out-Null

Start-ScheduledTask -TaskName $TaskName
Start-Sleep -Seconds 3
$task = Get-ScheduledTask -TaskName $TaskName
$taskInfo = Get-ScheduledTaskInfo -TaskName $TaskName

Write-Host ''
Write-Host 'VoiceTrader Local Node installed.'
Write-Host "Data root: $DataRoot"
Write-Host "Node: $nodeVersionText ($nodeExe)"
Write-Host "Task: $TaskName / $($task.State)"
Write-Host "Last task result: $($taskInfo.LastTaskResult)"
Write-Host 'Runtime cloud usage: Google Cloud = OFF, cloud upload = OFF, GitHub Actions required = NO'
Write-Host "Health file: $(Join-Path $DataRoot 'state\local-node-health.json')"
Write-Host "Raw data: $(Join-Path $DataRoot 'raw\gmo-fx\USDJPY')"

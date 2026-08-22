param(
  [string]$DataRoot = 'X:\XVoiceTraderData',
  [string]$RuntimeRef = 'd616d082bd95116223052529f30ca59193296c5d',
  [int]$ConsolePort = 17891,
  [int]$HealthTimeoutSeconds = 180,
  [int]$HealthMaxAgeMs = 90000,
  [int]$MinimumFreeGiB = 20
)

$ErrorActionPreference = 'Stop'
$Repo = 'TAMAFIT/voicetrader-pwa'
$RepoBase = "https://raw.githubusercontent.com/$Repo/$RuntimeRef"
$RuntimeRoot = Join-Path $DataRoot 'runtime\voicetrader-local-node'
$Stamp = (Get-Date).ToUniversalTime().ToString('yyyyMMdd-HHmmss')
$Staging = Join-Path $DataRoot "staging\voicetrader-v084-$Stamp"
$Backup = Join-Path $DataRoot "runtime-backups\voicetrader-before-v084-$Stamp"
$ConfigPath = Join-Path $DataRoot 'state\local-edge-lab-v084-config.json'

function Test-Administrator {
  $id = [Security.Principal.WindowsIdentity]::GetCurrent()
  $p = [Security.Principal.WindowsPrincipal]::new($id)
  return $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}
function Assert-ExactCommit([string]$Ref) {
  if ($Ref -notmatch '^[0-9a-f]{40}$') { throw "RuntimeRef must be an exact 40-hex commit SHA. Found: $Ref" }
}
function Get-FreeBytes([string]$Path) {
  $root = [System.IO.Path]::GetPathRoot((Resolve-Path $Path).Path)
  return ([System.IO.DriveInfo]::new($root)).AvailableFreeSpace
}
function Assert-Tcp443([string]$HostName) {
  $result = Test-NetConnection -ComputerName $HostName -Port 443 -InformationLevel Quiet -WarningAction SilentlyContinue
  if (-not $result) { throw "TCP 443 preflight failed: $HostName" }
}
function Download-File([string]$Relative) {
  $dest = Join-Path $Staging ($Relative -replace '/', '\')
  New-Item -ItemType Directory -Force -Path (Split-Path $dest -Parent) | Out-Null
  Invoke-WebRequest -UseBasicParsing -Uri "$RepoBase/$Relative" -OutFile $dest
  if (-not (Test-Path $dest) -or (Get-Item $dest).Length -le 0) { throw "Download failed or empty: $Relative" }
}
function Staged([string]$Relative) { return Join-Path $Staging ($Relative -replace '/', '\') }
function Runtime([string]$Relative) { return Join-Path $RuntimeRoot ($Relative -replace '/', '\') }
function Save-JsonAtomic([string]$Path, $Value) {
  New-Item -ItemType Directory -Force -Path (Split-Path $Path -Parent) | Out-Null
  $tmp = "$Path.tmp"
  $Value | ConvertTo-Json -Depth 12 | Set-Content -Encoding UTF8 -Path $tmp
  Move-Item -Force $tmp $Path
}
function Register-WorkerTask($Def, [string]$NodeExe) {
  $script = Runtime $Def.Script
  if (-not (Test-Path $script)) { throw "Runtime worker missing: $($Def.Script)" }
  $action = New-ScheduledTaskAction -Execute $NodeExe -Argument ('"{0}" {1}' -f $script, $Def.Args) -WorkingDirectory $RuntimeRoot
  $trigger = New-ScheduledTaskTrigger -AtStartup
  $principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
  $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew
  $old = Get-ScheduledTask -TaskName $Def.Name -ErrorAction SilentlyContinue
  if ($old) { Unregister-ScheduledTask -TaskName $Def.Name -Confirm:$false }
  Register-ScheduledTask -TaskName $Def.Name -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description $Def.Description | Out-Null
  Start-ScheduledTask -TaskName $Def.Name
}
function Restore-PreviousRuntime($TaskNames, $OldTaskXml) {
  Write-Host 'ROLLBACK: stopping v0.84 tasks and restoring prior runtime...'
  foreach ($name in $TaskNames) {
    Stop-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName $name -Confirm:$false -ErrorAction SilentlyContinue
  }
  if (Test-Path $RuntimeRoot) { Remove-Item -Recurse -Force $RuntimeRoot }
  if (Test-Path $Backup) { Move-Item $Backup $RuntimeRoot }
  foreach ($name in $OldTaskXml.Keys) {
    Register-ScheduledTask -TaskName $name -Xml $OldTaskXml[$name] -Force | Out-Null
    Start-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue
  }
}

if (-not (Test-Administrator)) {
  if (-not $PSCommandPath) { throw 'Save this upgrader as a .ps1 file before running.' }
  $args = @('-NoProfile','-ExecutionPolicy','Bypass','-File',('"{0}"' -f $PSCommandPath),'-DataRoot',('"{0}"' -f $DataRoot),'-RuntimeRef',$RuntimeRef,'-ConsolePort',$ConsolePort,'-HealthTimeoutSeconds',$HealthTimeoutSeconds,'-HealthMaxAgeMs',$HealthMaxAgeMs,'-MinimumFreeGiB',$MinimumFreeGiB)
  $p = Start-Process powershell.exe -Verb RunAs -Wait -PassThru -ArgumentList $args
  exit $p.ExitCode
}

Assert-ExactCommit $RuntimeRef
if (-not (Test-Path $DataRoot)) { throw "Data root missing: $DataRoot" }
$baseConfig = Join-Path $DataRoot 'state\local-node-config.json'
if (-not (Test-Path $baseConfig)) { throw 'Base Local Node config missing; refusing unknown installation.' }
$cfg = Get-Content -Raw $baseConfig | ConvertFrom-Json
$nodeExe = [string]$cfg.nodeExe
if (-not $nodeExe -or -not (Test-Path $nodeExe)) {
  $cmd = Get-Command node.exe -ErrorAction SilentlyContinue
  if (-not $cmd) { throw 'Node.js not found.' }
  $nodeExe = $cmd.Source
}
$nodeVersion = (& $nodeExe --version).Trim()
$major = [int](($nodeVersion.TrimStart('v') -split '\.')[0])
if ($major -lt 22) { throw "Node.js 22+ required. Found $nodeVersion" }
$freeBytes = Get-FreeBytes $DataRoot
$minimumBytes = [int64]$MinimumFreeGiB * 1GB
if ($freeBytes -lt $minimumBytes) { throw "Insufficient free disk: $([math]::Round($freeBytes/1GB,2)) GiB; require >= $MinimumFreeGiB GiB" }

Write-Host 'Preflight: checking crypto public endpoints...'
Assert-Tcp443 'ws.kraken.com'
Assert-Tcp443 'advanced-trade-ws.coinbase.com'

$runtimeFiles = @(
  'scripts/local-node/gmo-fx-tick-recorder.mjs',
  'scripts/local-node/gmo-quote-derived-worker.mjs',
  'scripts/local-node/kraken-microstructure-recorder.mjs',
  'scripts/local-node/kraken-boundary-window-worker.mjs',
  'scripts/local-node/short-horizon-prospective-worker.mjs',
  'scripts/local-node/short-horizon-scorecard-worker.mjs',
  'scripts/local-node/kraken-closed-hour-audit.mjs',
  'scripts/local-node/kraken-archive-raw.mjs',
  'scripts/local-node/kraken-maintenance-worker.mjs',
  'scripts/local-node/research-evidence-certifier.mjs',
  'scripts/local-node/finalized-scorecard-worker.mjs',
  'scripts/local-node/quoted-cost-resilience-worker.mjs',
  'scripts/local-node/local-lab-ops-worker.mjs',
  'scripts/local-node/local-lab-console.mjs',
  'scripts/local-node/coinbase-microstructure-recorder.mjs',
  'scripts/local-node/coinbase-boundary-window-worker.mjs',
  'scripts/local-node/cross-venue-replication-worker.mjs',
  'scripts/local-node/cross-venue-preregistered-worker.mjs',
  'scripts/local-node/cross-venue-learning-scorecard-worker.mjs',
  'scripts/local-node/v084-health-gate.mjs',
  'src/short-horizon/gmo-fx-public-quote.js',
  'src/short-horizon/local-node-gmo-tick.js',
  'src/short-horizon/local-node-gmo-derived.js',
  'src/short-horizon/local-node-kraken-wire.js',
  'src/short-horizon/kraken-book-integrity.js',
  'src/short-horizon/kraken-microstructure-features.js',
  'src/short-horizon/kraken-boundary-windows.js',
  'src/short-horizon/short-horizon-prospective-experiment.js',
  'src/short-horizon/adaptive-experiment.js',
  'src/short-horizon/blind-epoch.js',
  'src/short-horizon/prospective-scorecard.js',
  'src/short-horizon/quoted-cost-resilience.js',
  'src/short-horizon/local-node-ops.js',
  'src/short-horizon/local-node-coinbase-wire.js',
  'src/short-horizon/coinbase-book-integrity.js',
  'src/short-horizon/coinbase-microstructure-features.js',
  'src/short-horizon/coinbase-boundary-windows.js',
  'src/short-horizon/cross-venue-replication.js',
  'src/short-horizon/cross-venue-preregistered-hypothesis.js',
  'src/short-horizon/cross-venue-learning-scorecard.js',
  'src/short-horizon/cross-venue-blind-manifest.js',
  'src/short-horizon/cross-venue-blind-reveal.js',
  'src/short-horizon/cross-venue-blind-stability.js',
  'src/short-horizon/local-edge-lab-v084-health.js'
)
$testFiles = @(
  'scripts/test-short-horizon-local-node.mjs',
  'scripts/test-short-horizon-local-node-derived.mjs',
  'scripts/test-short-horizon-local-node-kraken.mjs',
  'scripts/test-short-horizon-kraken-book-integrity.mjs',
  'scripts/test-short-horizon-kraken-microstructure-features.mjs',
  'scripts/test-short-horizon-kraken-boundary-windows.mjs',
  'scripts/test-short-horizon-prospective-experiment.mjs',
  'scripts/test-short-horizon-adaptive-postmortem.mjs',
  'scripts/test-short-horizon-blind-epoch.mjs',
  'scripts/test-short-horizon-blind-scorecard.mjs',
  'scripts/test-short-horizon-local-ops.mjs',
  'scripts/test-short-horizon-quoted-execution.mjs',
  'scripts/test-short-horizon-quoted-execution-scorecard.mjs',
  'scripts/test-short-horizon-kraken-raw-audit.mjs',
  'scripts/test-short-horizon-kraken-heartbeat-coverage.mjs',
  'scripts/test-short-horizon-raw-archive.mjs',
  'scripts/test-short-horizon-evidence-certifier.mjs',
  'scripts/test-short-horizon-cost-resilience.mjs',
  'scripts/test-short-horizon-time-integrity.mjs',
  'scripts/test-short-horizon-ablation-scorecard.mjs',
  'scripts/test-short-horizon-stability.mjs',
  'scripts/test-short-horizon-local-node-coinbase.mjs',
  'scripts/test-short-horizon-coinbase-book-integrity.mjs',
  'scripts/test-short-horizon-coinbase-microstructure-features.mjs',
  'scripts/test-short-horizon-coinbase-provider-windows.mjs',
  'scripts/test-short-horizon-cross-venue-replication.mjs',
  'scripts/test-short-horizon-cross-venue-replication-worker.mjs',
  'scripts/test-short-horizon-cross-venue-preregistered.mjs',
  'scripts/test-short-horizon-cross-venue-preregistered-worker.mjs',
  'scripts/test-short-horizon-cross-venue-learning-scorecard.mjs',
  'scripts/test-short-horizon-cross-venue-learning-scorecard-worker.mjs',
  'scripts/test-short-horizon-cross-venue-blind-manifest.mjs',
  'scripts/test-short-horizon-cross-venue-blind-reveal.mjs',
  'scripts/test-short-horizon-cross-venue-blind-stability.mjs',
  'scripts/test-short-horizon-v084-health-gate.mjs'
)

New-Item -ItemType Directory -Force -Path $Staging | Out-Null
try {
  Write-Host 'Stage 1/7: download exact-commit runtime and regressions...'
  foreach ($relative in @($runtimeFiles + $testFiles)) { Download-File $relative }

  Write-Host 'Stage 2/7: syntax checks...'
  foreach ($relative in $runtimeFiles) {
    if ($relative -match '\.(mjs|js)$') {
      & $nodeExe --check (Staged $relative)
      if ($LASTEXITCODE -ne 0) { throw "Syntax failed: $relative" }
    }
  }

  Write-Host 'Stage 3/7: local regression suite; no Actions/cloud...'
  foreach ($relative in $testFiles) {
    & $nodeExe (Staged $relative)
    if ($LASTEXITCODE -ne 0) { throw "Regression failed: $relative" }
  }

  Write-Host 'Stage 4/7: safety scan...'
  $scanTargets = @($runtimeFiles | ForEach-Object { Staged $_ })
  $forbidden = '@google-cloud|googleapis|storage\.googleapis|run\.app|pubsub|bigquery|api\.coinbase\.com/api/v3/brokerage/orders'
  foreach ($file in $scanTargets) {
    if (Select-String -Path $file -Pattern $forbidden -Quiet) { throw "Forbidden cloud/private-order surface found: $file" }
  }
  $requiredSafety = @(
    @{ File='src/short-horizon/local-node-coinbase-wire.js'; Text='orderSubmission:false' },
    @{ File='src/short-horizon/cross-venue-preregistered-hypothesis.js'; Text='adaptiveLearningAuthorized:false' },
    @{ File='src/short-horizon/cross-venue-learning-scorecard.js'; Text='blindResultsConsumed:false' },
    @{ File='src/short-horizon/cross-venue-blind-reveal.js'; Text='noTopUpAfterReveal:true' },
    @{ File='src/short-horizon/local-edge-lab-v084-health.js'; Text='realMoneyRouting:false' }
  )
  foreach ($rule in $requiredSafety) {
    if (-not (Select-String -Path (Staged $rule.File) -Pattern ([regex]::Escape($rule.Text)) -Quiet)) { throw "Safety contract missing: $($rule.File) -> $($rule.Text)" }
  }
} catch {
  Write-Host "PRE-SWITCH FAILURE: $($_.Exception.Message)"
  Remove-Item -Recurse -Force $Staging -ErrorAction SilentlyContinue
  throw
}

$taskDefs = @(
  @{ Name='VoiceTrader-LocalNode-GMO-USDJPY'; Script='scripts/local-node/gmo-fx-tick-recorder.mjs'; Args=('--root "{0}"' -f $DataRoot); Description='GMO USDJPY public raw' },
  @{ Name='VoiceTrader-LocalNode-GMO-Derived'; Script='scripts/local-node/gmo-quote-derived-worker.mjs'; Args=('--root "{0}" --poll-ms 15000 --lookback-minutes 5' -f $DataRoot); Description='GMO derived' },
  @{ Name='VoiceTrader-LocalNode-Kraken-Raw'; Script='scripts/local-node/kraken-microstructure-recorder.mjs'; Args=('--root "{0}" --warn-free-gb 50 --hard-stop-free-gb 10' -f $DataRoot); Description='Kraken exact wire/L2/trade/checksum/OFI' },
  @{ Name='VoiceTrader-LocalNode-Kraken-Windows'; Script='scripts/local-node/kraken-boundary-window-worker.mjs'; Args=('--root "{0}" --poll-ms 2000' -f $DataRoot); Description='Kraken provider-time 1s/5s/15s/60s windows' },
  @{ Name='VoiceTrader-LocalNode-Prospective'; Script='scripts/local-node/short-horizon-prospective-worker.mjs'; Args=('--root "{0}" --poll-ms 1000' -f $DataRoot); Description='Frozen/Adaptive/Null/Phase/Blind prospective' },
  @{ Name='VoiceTrader-LocalNode-Scorecard'; Script='scripts/local-node/short-horizon-scorecard-worker.mjs'; Args=('--root "{0}" --poll-ms 5000' -f $DataRoot); Description='Preliminary scorecards' },
  @{ Name='VoiceTrader-LocalNode-Maintenance'; Script='scripts/local-node/kraken-maintenance-worker.mjs'; Args=('--root "{0}" --poll-ms 600000 --lag-minutes 2 --min-age-hours 24' -f $DataRoot); Description='Raw audit + lossless archive' },
  @{ Name='VoiceTrader-LocalNode-Certifier'; Script='scripts/local-node/research-evidence-certifier.mjs'; Args=('--root "{0}" --poll-ms 15000' -f $DataRoot); Description='Integrity+coverage evidence certifier' },
  @{ Name='VoiceTrader-LocalNode-FinalScorecard'; Script='scripts/local-node/finalized-scorecard-worker.mjs'; Args=('--root "{0}" --poll-ms 15000' -f $DataRoot); Description='Finalized trusted scorecards' },
  @{ Name='VoiceTrader-LocalNode-CostResilience'; Script='scripts/local-node/quoted-cost-resilience-worker.mjs'; Args=('--root "{0}" --poll-ms 15000' -f $DataRoot); Description='Quoted extra-cost break-even resilience' },
  @{ Name='VoiceTrader-LocalNode-Ops'; Script='scripts/local-node/local-lab-ops-worker.mjs'; Args=('--root "{0}" --poll-ms 10000 --size-ms 300000' -f $DataRoot); Description='Lab health/capacity' },
  @{ Name='VoiceTrader-LocalNode-Console'; Script='scripts/local-node/local-lab-console.mjs'; Args=('--root "{0}" --port {1}' -f $DataRoot,$ConsolePort); Description='Loopback-only console' },
  @{ Name='VoiceTrader-LocalNode-Coinbase-Raw'; Script='scripts/local-node/coinbase-microstructure-recorder.mjs'; Args=('--root "{0}" --warn-free-gb 50 --hard-stop-free-gb 10' -f $DataRoot); Description='Coinbase exact wire/L2/trades + trusted microstructure' },
  @{ Name='VoiceTrader-LocalNode-Coinbase-Windows'; Script='scripts/local-node/coinbase-boundary-window-worker.mjs'; Args=('--root "{0}" --poll-ms 2000' -f $DataRoot); Description='Coinbase provider-time 1s/5s/15s/60s windows' },
  @{ Name='VoiceTrader-LocalNode-CrossVenue-Replication'; Script='scripts/local-node/cross-venue-replication-worker.mjs'; Args=('--root "{0}" --poll-ms 2000' -f $DataRoot); Description='Kraken/Coinbase same-time descriptive replication' },
  @{ Name='VoiceTrader-LocalNode-CrossVenue-Preregistered'; Script='scripts/local-node/cross-venue-preregistered-worker.mjs'; Args=('--root "{0}" --poll-ms 2000' -f $DataRoot); Description='Frozen cross-venue preregistration + sealed blind split' },
  @{ Name='VoiceTrader-LocalNode-CrossVenue-Scorecard'; Script='scripts/local-node/cross-venue-learning-scorecard-worker.mjs'; Args=('--root "{0}" --poll-ms 5000' -f $DataRoot); Description='Learning-only cross-venue scorecard; blind directory excluded' }
)
$taskNames = @($taskDefs | ForEach-Object { $_.Name })
$oldTaskXml = @{}
foreach ($name in $taskNames) {
  $task = Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue
  if ($task) { $oldTaskXml[$name] = Export-ScheduledTask -TaskName $name }
  Stop-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue
}

Write-Host 'Stage 5/7: switch runtime and register workers...'
try {
  if (Test-Path $RuntimeRoot) {
    New-Item -ItemType Directory -Force -Path (Split-Path $Backup -Parent) | Out-Null
    Move-Item $RuntimeRoot $Backup
  }
  Move-Item $Staging $RuntimeRoot
  foreach ($def in $taskDefs) { Register-WorkerTask $def $nodeExe }
} catch {
  Restore-PreviousRuntime $taskNames $oldTaskXml
  throw
}

Write-Host 'Stage 6/7: live crypto health gate...'
$deadline = (Get-Date).AddSeconds($HealthTimeoutSeconds)
$health = $null
try {
  do {
    Start-Sleep -Seconds 5
    $healthJson = & $nodeExe (Runtime 'scripts/local-node/v084-health-gate.mjs') --root $DataRoot --max-age-ms $HealthMaxAgeMs --json 2>$null
    if ($healthJson) {
      try { $health = ($healthJson -join "`n") | ConvertFrom-Json } catch { $health = $null }
    }
    if ($health -and $health.status -eq 'PASS') { break }
  } while ((Get-Date) -lt $deadline)

  if (-not $health -or $health.status -ne 'PASS') {
    $failed = if ($health) { ($health.failedChecks -join ', ') } else { 'health-report-unavailable' }
    throw "v0.84 live health gate timed out or blocked: $failed"
  }
  foreach ($name in $taskNames) {
    $task = Get-ScheduledTask -TaskName $name -ErrorAction Stop
    if ($task.State -eq 'Disabled') { throw "Scheduled task disabled after install: $name" }
  }
} catch {
  Restore-PreviousRuntime $taskNames $oldTaskXml
  throw
}

Write-Host 'Stage 7/7: persist exact installation receipt...'
$install = [ordered]@{
  schemaVersion = 'voicetrader-local-edge-lab-v084-rc'
  installedAt = (Get-Date).ToUniversalTime().ToString('o')
  dataRoot = $DataRoot
  repo = $Repo
  exactRuntimeRef = $RuntimeRef
  nodeVersion = $nodeVersion
  console = "http://127.0.0.1:$ConsolePort/"
  components = @('GMO_RAW','GMO_DERIVED','KRAKEN_EXACT_WIRE','KRAKEN_CRC32_L2','KRAKEN_MICROSTRUCTURE','KRAKEN_PROVIDER_WINDOWS','FROZEN_ADAPTIVE_NULL_PHASE','LEGACY_BLIND_EXAM','SIDE_CORRECT_QUOTED_EXECUTION','EVIDENCE_CERTIFIER','FINAL_SCORECARD','COST_RESILIENCE','LOCAL_CONSOLE','COINBASE_EXACT_WIRE','COINBASE_L2_INTEGRITY','COINBASE_MICROSTRUCTURE','COINBASE_PROVIDER_WINDOWS','CROSS_VENUE_REPLICATION','CROSS_VENUE_PREREGISTERED','CROSS_VENUE_LEARNING_SCORECARD')
  scheduledCrossVenue = @('Coinbase Raw','Coinbase Windows','Replication','Preregistered','Learning Scorecard')
  manualExamGates = @('CROSS_VENUE_BLIND_MANIFEST','CROSS_VENUE_BLIND_REVEAL','CROSS_VENUE_BLIND_STABILITY')
  healthGate = [ordered]@{ status=$health.status; evaluatedAtMs=$health.evaluatedAtMs; maxAgeMs=$HealthMaxAgeMs; failedChecks=@($health.failedChecks) }
  runtimePolicy = [ordered]@{ googleCloudEnabled=$false; cloudUploadEnabled=$false; githubActionsRequired=$false; orderSubmission=$false; realMoneyRouting=$false; automaticPromotion=$false }
  researchPolicy = [ordered]@{ predictionInputAuthorized=$false; crossVenueComparabilityClaim=$false; predictiveReplicationClaim=$false; blindDirectoryReadByLearningScorecard=$false; blindRevealIsManualGate=$true; actualFeesObserved=$false; actualSlippageObserved=$false; actualFillObserved=$false; actualNetEvAvailable=$false }
  rollback = [ordered]@{ previousRuntimeBackup=$Backup; priorScheduledTasksCaptured=$oldTaskXml.Count; dataDirectoriesPreserved=$true }
}
Save-JsonAtomic $ConfigPath $install

Write-Host ''
Write-Host 'VoiceTrader Local Edge Lab v0.84 RC installed and live-health verified.'
Write-Host "Exact runtime: $RuntimeRef"
Write-Host "Data: $DataRoot"
Write-Host "Console: http://127.0.0.1:$ConsolePort/"
Write-Host 'Coinbase + Kraken live / Cross-venue observational / Blind reveal manual only'
Write-Host 'Google Cloud OFF / Cloud upload OFF / GitHub Actions runtime dependency NONE / Real money OFF'
Write-Host "Rollback runtime backup retained: $Backup"

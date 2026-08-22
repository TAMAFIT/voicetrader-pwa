param(
  [string]$DataRoot = 'X:\XVoiceTraderData',
  [int]$HealthMaxAgeMs = 90000,
  [switch]$Json
)

$ErrorActionPreference='Stop'
$configPath=Join-Path $DataRoot 'state\local-edge-lab-v084-config.json'
$baseConfigPath=Join-Path $DataRoot 'state\local-node-config.json'
$runtimeRoot=Join-Path $DataRoot 'runtime\voicetrader-local-node'
$healthScript=Join-Path $runtimeRoot 'scripts\local-node\v084-health-gate.mjs'

$taskNames=@(
  'VoiceTrader-LocalNode-GMO-USDJPY',
  'VoiceTrader-LocalNode-GMO-Derived',
  'VoiceTrader-LocalNode-Kraken-Raw',
  'VoiceTrader-LocalNode-Kraken-Windows',
  'VoiceTrader-LocalNode-Prospective',
  'VoiceTrader-LocalNode-Scorecard',
  'VoiceTrader-LocalNode-Maintenance',
  'VoiceTrader-LocalNode-Certifier',
  'VoiceTrader-LocalNode-FinalScorecard',
  'VoiceTrader-LocalNode-CostResilience',
  'VoiceTrader-LocalNode-Ops',
  'VoiceTrader-LocalNode-Console',
  'VoiceTrader-LocalNode-Coinbase-Raw',
  'VoiceTrader-LocalNode-Coinbase-Windows',
  'VoiceTrader-LocalNode-CrossVenue-Replication',
  'VoiceTrader-LocalNode-CrossVenue-Preregistered',
  'VoiceTrader-LocalNode-CrossVenue-Scorecard'
)

$config=$null
if(Test-Path $configPath){try{$config=Get-Content -Raw $configPath|ConvertFrom-Json}catch{}}
$baseConfig=$null
if(Test-Path $baseConfigPath){try{$baseConfig=Get-Content -Raw $baseConfigPath|ConvertFrom-Json}catch{}}
$nodeExe=[string]$baseConfig.nodeExe
if(-not $nodeExe -or -not(Test-Path $nodeExe)){$cmd=Get-Command node.exe -ErrorAction SilentlyContinue;if($cmd){$nodeExe=$cmd.Source}}

$tasks=@()
foreach($name in $taskNames){
  $t=Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue
  $info=if($t){Get-ScheduledTaskInfo -TaskName $name -ErrorAction SilentlyContinue}else{$null}
  $tasks+=[ordered]@{
    name=$name
    exists=[bool]$t
    state=if($t){[string]$t.State}else{'MISSING'}
    lastRunTime=if($info -and $info.LastRunTime -gt [datetime]::MinValue){$info.LastRunTime.ToUniversalTime().ToString('o')}else{$null}
    lastTaskResult=if($info){[int64]$info.LastTaskResult}else{$null}
    nextRunTime=if($info -and $info.NextRunTime -gt [datetime]::MinValue){$info.NextRunTime.ToUniversalTime().ToString('o')}else{$null}
  }
}

$health=$null
if($nodeExe -and (Test-Path $healthScript)){
  $raw=& $nodeExe $healthScript --root $DataRoot --max-age-ms $HealthMaxAgeMs --json 2>$null
  if($raw){try{$health=($raw -join "`n")|ConvertFrom-Json}catch{}}
}

$report=[ordered]@{
  schemaVersion='voicetrader-local-edge-lab-v084-status-v1'
  generatedAt=(Get-Date).ToUniversalTime().ToString('o')
  dataRoot=$DataRoot
  runtimeRoot=$runtimeRoot
  installedConfigPresent=[bool](Test-Path $configPath)
  exactRuntimeRef=if($config){[string]$config.exactRuntimeRef}else{$null}
  installedAt=if($config){[string]$config.installedAt}else{$null}
  nodeExe=$nodeExe
  tasks=$tasks
  taskSummary=[ordered]@{
    expected=$taskNames.Count
    present=@($tasks|Where-Object{$_.exists}).Count
    running=@($tasks|Where-Object{$_.state -eq 'Running'}).Count
    missing=@($tasks|Where-Object{-not $_.exists}|ForEach-Object{$_.name})
    disabled=@($tasks|Where-Object{$_.state -eq 'Disabled'}|ForEach-Object{$_.name})
  }
  health=$health
  manualExamGates=@('CROSS_VENUE_BLIND_MANIFEST','CROSS_VENUE_BLIND_REVEAL','CROSS_VENUE_BLIND_STABILITY')
  governance=[ordered]@{
    statusReadOnly=$true
    blindRevealTriggered=$false
    orderSubmission=$false
    realMoneyRouting=$false
  }
}

if($Json){$report|ConvertTo-Json -Depth 12;exit 0}
Write-Host 'VoiceTrader Local Edge Lab v0.84 status'
Write-Host "Data root: $DataRoot"
Write-Host "Exact runtime: $($report.exactRuntimeRef)"
Write-Host "Tasks: $($report.taskSummary.present)/$($report.taskSummary.expected) present; $($report.taskSummary.running) running"
if($report.taskSummary.missing.Count){Write-Host "Missing: $($report.taskSummary.missing -join ', ')"}
if($health){Write-Host "Health gate: $($health.status)";if($health.failedChecks.Count){Write-Host "Failed checks: $($health.failedChecks -join ', ')"}}else{Write-Host 'Health gate: unavailable'}
Write-Host 'Blind reveal: MANUAL ONLY / not triggered by status'
Write-Host 'Real money: OFF'

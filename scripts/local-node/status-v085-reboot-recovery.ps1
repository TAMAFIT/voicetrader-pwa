param([string]$DataRoot='X:\XVoiceTraderData',[switch]$Json)
$ErrorActionPreference='Stop'
$configFile=Join-Path $DataRoot 'state\local-edge-lab-v085-config.json'
$baselineFile=Join-Path $DataRoot 'state\local-edge-lab-v085-reboot-baseline.json'
$witnessFile=Join-Path $DataRoot 'state\local-edge-lab-v085-reboot-witness.json'
$taskName='VoiceTrader-LocalNode-RebootWitness'
function ReadJson($p){if(Test-Path $p){try{return Get-Content -Raw $p|ConvertFrom-Json}catch{}};return $null}
$config=ReadJson $configFile;$baseline=ReadJson $baselineFile;$witness=ReadJson $witnessFile;$task=Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue;$info=if($task){Get-ScheduledTaskInfo -TaskName $taskName -ErrorAction SilentlyContinue}else{$null}
$proven=[bool]($witness -and $witness.recovery.rebootRecoveryProven -eq $true -and $witness.status -eq 'PROVEN')
$report=[ordered]@{schemaVersion='voicetrader-local-edge-lab-v085-status-v1';generatedAt=(Get-Date).ToUniversalTime().ToString('o');configured=[bool]$config;baseRuntimeRef=if($config){[string]$config.baseRuntimeRef}else{$null};overlayRef=if($config){[string]$config.overlayRef}else{$null};baselineBootId=if($baseline){[string]$baseline.bootId}else{$null};currentWitness=$witness;rebootRecoveryProven=$proven;task=[ordered]@{name=$taskName;exists=[bool]$task;state=if($task){[string]$task.State}else{'MISSING'};lastRunTime=if($info -and $info.LastRunTime -gt [datetime]::MinValue){$info.LastRunTime.ToUniversalTime().ToString('o')}else{$null};lastTaskResult=if($info){[int64]$info.LastTaskResult}else{$null}};governance=[ordered]@{readOnly=$true;blindRevealTriggered=$false;orderSubmission=$false;realMoneyRouting=$false}}
if($Json){$report|ConvertTo-Json -Depth 12;exit 0}
Write-Host 'VoiceTrader v0.85 reboot recovery status';Write-Host "Configured: $($report.configured)";Write-Host "Base runtime: $($report.baseRuntimeRef)";Write-Host "Overlay: $($report.overlayRef)";Write-Host "Task: $($report.task.state)";Write-Host "Reboot recovery proven: $proven";if($witness){Write-Host "Witness status: $($witness.status)";Write-Host "Health: $($witness.recovery.healthStatus)"};Write-Host 'Blind reveal: NOT TOUCHED / Real money: OFF'

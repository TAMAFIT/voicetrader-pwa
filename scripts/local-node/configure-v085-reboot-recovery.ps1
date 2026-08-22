param(
  [string]$DataRoot = 'X:\XVoiceTraderData',
  [string]$OverlayRef = '',
  [int]$HealthMaxAgeMs = 90000,
  [int]$RecoveryTimeoutMs = 300000
)

$ErrorActionPreference='Stop'
$Repo='TAMAFIT/voicetrader-pwa'
$RuntimeRoot=Join-Path $DataRoot 'runtime\voicetrader-local-node'
$V084Config=Join-Path $DataRoot 'state\local-edge-lab-v084-config.json'
$BaseConfig=Join-Path $DataRoot 'state\local-node-config.json'
$Stamp=(Get-Date).ToUniversalTime().ToString('yyyyMMdd-HHmmss')
$Staging=Join-Path $DataRoot "staging\voicetrader-v085-$Stamp"
$Backup=Join-Path $DataRoot "runtime-backups\voicetrader-before-v085-overlay-$Stamp"
$Receipt=Join-Path $DataRoot 'state\local-edge-lab-v085-config.json'
$TaskName='VoiceTrader-LocalNode-RebootWitness'

function Test-Administrator {$id=[Security.Principal.WindowsIdentity]::GetCurrent();$p=[Security.Principal.WindowsPrincipal]::new($id);return $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)}
function Assert-ExactCommit([string]$Ref){if($Ref -notmatch '^[0-9a-f]{40}$'){throw "OverlayRef must be an exact 40-hex commit SHA. Found: $Ref"}}
function Save-JsonAtomic([string]$Path,$Value){New-Item -ItemType Directory -Force -Path (Split-Path $Path -Parent)|Out-Null;$tmp="$Path.tmp";$Value|ConvertTo-Json -Depth 12|Set-Content -Encoding UTF8 -Path $tmp;Move-Item -Force $tmp $Path}
function Staged([string]$r){Join-Path $Staging ($r -replace '/','\')}
function Runtime([string]$r){Join-Path $RuntimeRoot ($r -replace '/','\')}
function Download-Overlay([string]$r){$d=Staged $r;New-Item -ItemType Directory -Force -Path (Split-Path $d -Parent)|Out-Null;Invoke-WebRequest -UseBasicParsing -Uri "https://raw.githubusercontent.com/$Repo/$OverlayRef/$r" -OutFile $d;if(-not(Test-Path $d)-or(Get-Item $d).Length -le 0){throw "Overlay download failed: $r"}}
function Read-Health([string]$NodeExe){$raw=& $NodeExe (Runtime 'scripts/local-node/v084-health-gate.mjs') --root $DataRoot --max-age-ms $HealthMaxAgeMs --json 2>$null;if(-not $raw){return $null};try{return ($raw -join "`n")|ConvertFrom-Json}catch{return $null}}

if(-not(Test-Administrator)){
  if(-not $PSCommandPath){throw 'Save this overlay installer as a .ps1 file before running.'}
  $a=@('-NoProfile','-ExecutionPolicy','Bypass','-File',('"{0}"' -f $PSCommandPath),'-DataRoot',('"{0}"' -f $DataRoot),'-OverlayRef',$OverlayRef,'-HealthMaxAgeMs',$HealthMaxAgeMs,'-RecoveryTimeoutMs',$RecoveryTimeoutMs)
  $p=Start-Process powershell.exe -Verb RunAs -Wait -PassThru -ArgumentList $a;exit $p.ExitCode
}

Assert-ExactCommit $OverlayRef
if(-not(Test-Path $V084Config)){throw 'v0.84 installation receipt missing; refusing reboot overlay.'}
if(-not(Test-Path $BaseConfig)){throw 'Base Local Node config missing.'}
$v084=Get-Content -Raw $V084Config|ConvertFrom-Json
if([string]$v084.healthGate.status -ne 'PASS'){throw 'v0.84 installation receipt is not health-PASS.'}
$base=Get-Content -Raw $BaseConfig|ConvertFrom-Json
$nodeExe=[string]$base.nodeExe
if(-not $nodeExe -or -not(Test-Path $nodeExe)){$cmd=Get-Command node.exe -ErrorAction SilentlyContinue;if(-not $cmd){throw 'Node.js not found.'};$nodeExe=$cmd.Source}
$major=[int](((& $nodeExe --version).Trim().TrimStart('v') -split '\.')[0]);if($major -lt 22){throw 'Node.js 22+ required.'}
$beforeHealth=Read-Health $nodeExe;if(-not $beforeHealth -or $beforeHealth.status -ne 'PASS'){throw "Current v0.84 live health is not PASS: $($beforeHealth.failedChecks -join ', ')"}

$overlayFiles=@(
  'src/short-horizon/local-edge-lab-reboot-recovery.js',
  'scripts/local-node/v085-reboot-witness.mjs'
)
$testFile='scripts/test-short-horizon-v085-reboot-recovery.mjs'
$dependencies=@(
  'src/short-horizon/local-edge-lab-v084-health.js',
  'scripts/local-node/v084-health-gate.mjs'
)

New-Item -ItemType Directory -Force -Path $Staging|Out-Null
try{
  foreach($r in @($overlayFiles+$testFile)){Download-Overlay $r}
  foreach($r in $dependencies){$src=Runtime $r;if(-not(Test-Path $src)){throw "v0.84 dependency missing: $r"};$dst=Staged $r;New-Item -ItemType Directory -Force -Path (Split-Path $dst -Parent)|Out-Null;Copy-Item $src $dst}
  foreach($r in $overlayFiles){& $nodeExe --check (Staged $r);if($LASTEXITCODE -ne 0){throw "Syntax failed: $r"}}
  & $nodeExe (Staged $testFile);if($LASTEXITCODE -ne 0){throw 'v0.85 reboot recovery regression failed'}
  if(Select-String -Path (Staged 'src/short-horizon/local-edge-lab-reboot-recovery.js'),(Staged 'scripts/local-node/v085-reboot-witness.mjs') -Pattern '@google-cloud|googleapis|orderSubmission:true|realMoneyRouting:true|cloudUploadEnabled:true' -Quiet){throw 'Forbidden v0.85 surface found'}
}catch{Remove-Item -Recurse -Force $Staging -ErrorAction SilentlyContinue;throw}

$oldTask=Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
$oldTaskXml=if($oldTask){Export-ScheduledTask -TaskName $TaskName}else{$null}
Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path $Backup|Out-Null
$hadExisting=@{}
foreach($r in $overlayFiles){$dest=Runtime $r;if(Test-Path $dest){$hadExisting[$r]=$true;$b=Join-Path $Backup ($r -replace '/','\');New-Item -ItemType Directory -Force -Path (Split-Path $b -Parent)|Out-Null;Copy-Item $dest $b}else{$hadExisting[$r]=$false}}

try{
  foreach($r in $overlayFiles){$dest=Runtime $r;New-Item -ItemType Directory -Force -Path (Split-Path $dest -Parent)|Out-Null;Copy-Item -Force (Staged $r) $dest}
  $baselineRaw=& $nodeExe (Runtime 'scripts/local-node/v085-reboot-witness.mjs') --root $DataRoot --initialize --runtime-ref $OverlayRef
  if($LASTEXITCODE -ne 0){throw 'Failed to initialize v0.85 reboot baseline'}
  $baseline=($baselineRaw -join "`n")|ConvertFrom-Json
  if(-not $baseline.bootId){throw 'v0.85 baseline bootId missing'}

  if(Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue){Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false}
  $worker=Runtime 'scripts/local-node/v085-reboot-witness.mjs'
  $action=New-ScheduledTaskAction -Execute $nodeExe -Argument ('"{0}" --root "{1}" --max-age-ms {2} --timeout-ms {3}' -f $worker,$DataRoot,$HealthMaxAgeMs,$RecoveryTimeoutMs) -WorkingDirectory $RuntimeRoot
  $trigger=New-ScheduledTaskTrigger -AtStartup
  $principal=New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
  $settings=New-ScheduledTaskSettingsSet -StartWhenAvailable -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew
  Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description 'VoiceTrader v0.85 reboot recovery witness; observational only'|Out-Null
  Start-ScheduledTask -TaskName $TaskName
  Start-Sleep -Seconds 2
  $afterHealth=Read-Health $nodeExe;if(-not $afterHealth -or $afterHealth.status -ne 'PASS'){throw 'v0.84 health regressed after v0.85 overlay'}

  $receipt=[ordered]@{schemaVersion='voicetrader-local-edge-lab-v085-overlay';installedAt=(Get-Date).ToUniversalTime().ToString('o');dataRoot=$DataRoot;baseRuntimeRef=[string]$v084.exactRuntimeRef;overlayRef=$OverlayRef;installBootId=[string]$baseline.bootId;taskName=$TaskName;rebootRecoveryProven=$false;proofRequirement='NEW_BOOT_ID_AND_V084_HEALTH_PASS';runtimePolicy=[ordered]@{googleCloudEnabled=$false;cloudUploadEnabled=$false;orderSubmission=$false;realMoneyRouting=$false};rollback=[ordered]@{overlayBackup=$Backup;priorTaskCaptured=[bool]$oldTaskXml;dataDirectoriesPreserved=$true}}
  Save-JsonAtomic $Receipt $receipt
}catch{
  Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue;Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
  foreach($r in $overlayFiles){$dest=Runtime $r;if($hadExisting[$r]){$b=Join-Path $Backup ($r -replace '/','\');Copy-Item -Force $b $dest}else{Remove-Item -Force $dest -ErrorAction SilentlyContinue}}
  if($oldTaskXml){Register-ScheduledTask -TaskName $TaskName -Xml $oldTaskXml -Force|Out-Null;Start-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue}
  Remove-Item -Recurse -Force $Staging -ErrorAction SilentlyContinue
  throw
}

Remove-Item -Recurse -Force $Staging -ErrorAction SilentlyContinue
Write-Host 'VoiceTrader v0.85 reboot recovery overlay installed.'
Write-Host "Baseline boot ID: $($baseline.bootId)"
Write-Host 'A genuinely new Windows boot plus v0.84 health PASS is required before rebootRecoveryProven=true.'
Write-Host 'Research decisions, Blind Exam, orders, real-money routing and cloud upload remain untouched.'

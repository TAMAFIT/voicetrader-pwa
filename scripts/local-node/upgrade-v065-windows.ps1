param(
  [string]$DataRoot = 'X:\XVoiceTraderData',
  [string]$RepoRef = 'feat/local-node-quoted-execution-v061',
  [int]$ConsolePort = 17891
)
$ErrorActionPreference='Stop'
$RepoBase="https://raw.githubusercontent.com/TAMAFIT/voicetrader-pwa/$RepoRef"
$RuntimeRoot=Join-Path $DataRoot 'runtime\voicetrader-local-node'
$Stamp=(Get-Date).ToUniversalTime().ToString('yyyyMMdd-HHmmss')
$Staging=Join-Path $DataRoot "staging\voicetrader-v065-$Stamp"
$Backup=Join-Path $DataRoot "runtime-backups\voicetrader-before-v065-$Stamp"
function Test-Administrator {$id=[Security.Principal.WindowsIdentity]::GetCurrent();$p=[Security.Principal.WindowsPrincipal]::new($id);return $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)}
if(-not(Test-Administrator)){if(-not $PSCommandPath){throw 'Save this upgrader as a .ps1 file before running.'};$a=@('-NoProfile','-ExecutionPolicy','Bypass','-File',('"{0}"' -f $PSCommandPath),'-DataRoot',('"{0}"' -f $DataRoot),'-RepoRef',('"{0}"' -f $RepoRef),'-ConsolePort',$ConsolePort);Start-Process powershell.exe -Verb RunAs -Wait -ArgumentList $a;exit $LASTEXITCODE}
if(-not(Test-Path $DataRoot)){throw "Data root missing: $DataRoot"}
$baseConfig=Join-Path $DataRoot 'state\local-node-config.json';if(-not(Test-Path $baseConfig)){throw 'Base v0.49 config missing; refusing unknown install.'}
$cfg=Get-Content -Raw $baseConfig|ConvertFrom-Json;$nodeExe=[string]$cfg.nodeExe;if(-not $nodeExe -or -not(Test-Path $nodeExe)){$cmd=Get-Command node.exe -ErrorAction SilentlyContinue;if(-not $cmd){throw 'Node.js not found.'};$nodeExe=$cmd.Source}
$nodeVersion=(& $nodeExe --version).Trim();$major=[int](($nodeVersion.TrimStart('v') -split '\.')[0]);if($major -lt 22){throw "Node.js 22+ required. Found $nodeVersion"}
$runtimeFiles=@(
'scripts/local-node/gmo-fx-tick-recorder.mjs','scripts/local-node/gmo-quote-derived-worker.mjs','scripts/local-node/kraken-microstructure-recorder.mjs','scripts/local-node/kraken-boundary-window-worker.mjs','scripts/local-node/short-horizon-prospective-worker.mjs','scripts/local-node/short-horizon-scorecard-worker.mjs','scripts/local-node/kraken-closed-hour-audit.mjs','scripts/local-node/kraken-archive-raw.mjs','scripts/local-node/kraken-maintenance-worker.mjs','scripts/local-node/research-evidence-certifier.mjs','scripts/local-node/finalized-scorecard-worker.mjs','scripts/local-node/local-lab-ops-worker.mjs','scripts/local-node/local-lab-console.mjs',
'src/short-horizon/gmo-fx-public-quote.js','src/short-horizon/local-node-gmo-tick.js','src/short-horizon/local-node-gmo-derived.js','src/short-horizon/local-node-kraken-wire.js','src/short-horizon/kraken-book-integrity.js','src/short-horizon/kraken-microstructure-features.js','src/short-horizon/kraken-boundary-windows.js','src/short-horizon/short-horizon-prospective-experiment.js','src/short-horizon/adaptive-experiment.js','src/short-horizon/blind-epoch.js','src/short-horizon/prospective-scorecard.js','src/short-horizon/local-node-ops.js')
$testFiles=@('scripts/test-short-horizon-kraken-book-integrity.mjs','scripts/test-short-horizon-kraken-microstructure-features.mjs','scripts/test-short-horizon-kraken-boundary-windows.mjs','scripts/test-short-horizon-prospective-experiment.mjs','scripts/test-short-horizon-adaptive-postmortem.mjs','scripts/test-short-horizon-blind-epoch.mjs','scripts/test-short-horizon-blind-scorecard.mjs','scripts/test-short-horizon-local-ops.mjs','scripts/test-short-horizon-quoted-execution.mjs','scripts/test-short-horizon-quoted-execution-scorecard.mjs','scripts/test-short-horizon-kraken-raw-audit.mjs','scripts/test-short-horizon-raw-archive.mjs','scripts/test-short-horizon-evidence-certifier.mjs')
New-Item -ItemType Directory -Force -Path $Staging|Out-Null
function Dest([string]$r){return Join-Path $Staging ($r -replace '/','\')}
try {
  Write-Host 'Stage 1/5: downloading pinned runtime to staging...'
  foreach($r in @($runtimeFiles+$testFiles)){$d=Dest $r;New-Item -ItemType Directory -Force -Path (Split-Path $d -Parent)|Out-Null;Invoke-WebRequest -UseBasicParsing -Uri "$RepoBase/$r" -OutFile $d}
  Write-Host 'Stage 2/5: syntax checks...'
  foreach($r in $runtimeFiles){& $nodeExe --check (Dest $r);if($LASTEXITCODE -ne 0){throw "Syntax failed: $r"}}
  Write-Host 'Stage 3/5: local regression suite (no Actions/cloud)...'
  foreach($r in $testFiles){& $nodeExe (Dest $r);if($LASTEXITCODE -ne 0){throw "Regression failed: $r"}}
} catch {Write-Host "PRE-SWITCH FAILURE: $($_.Exception.Message)";Remove-Item -Recurse -Force $Staging -ErrorAction SilentlyContinue;throw}
$taskDefs=@(
@{N='VoiceTrader-LocalNode-GMO-USDJPY';S='scripts/local-node/gmo-fx-tick-recorder.mjs';A=('--root "{0}"' -f $DataRoot);D='GMO USDJPY public tick raw recorder'},
@{N='VoiceTrader-LocalNode-GMO-Derived';S='scripts/local-node/gmo-quote-derived-worker.mjs';A=('--root "{0}" --poll-ms 15000 --lookback-minutes 5' -f $DataRoot);D='GMO quote derived worker'},
@{N='VoiceTrader-LocalNode-Kraken-Raw';S='scripts/local-node/kraken-microstructure-recorder.mjs';A=('--root "{0}" --warn-free-gb 50 --hard-stop-free-gb 10' -f $DataRoot);D='Kraken exact wire, L2, trade, checksum, OFI'},
@{N='VoiceTrader-LocalNode-Kraken-Windows';S='scripts/local-node/kraken-boundary-window-worker.mjs';A=('--root "{0}" --poll-ms 2000' -f $DataRoot);D='Trusted 1s/5s/15s/60s boundary windows'},
@{N='VoiceTrader-LocalNode-Prospective';S='scripts/local-node/short-horizon-prospective-worker.mjs';A=('--root "{0}" --poll-ms 1000' -f $DataRoot);D='Frozen Adaptive Null Phase Blind prospective experiments'},
@{N='VoiceTrader-LocalNode-Scorecard';S='scripts/local-node/short-horizon-scorecard-worker.mjs';A=('--root "{0}" --poll-ms 5000' -f $DataRoot);D='Preliminary descriptive scorecards'},
@{N='VoiceTrader-LocalNode-Maintenance';S='scripts/local-node/kraken-maintenance-worker.mjs';A=('--root "{0}" --poll-ms 600000 --lag-minutes 2 --min-age-hours 24' -f $DataRoot);D='Closed-hour raw audit and verified lossless archive'},
@{N='VoiceTrader-LocalNode-Certifier';S='scripts/local-node/research-evidence-certifier.mjs';A=('--root "{0}" --poll-ms 15000' -f $DataRoot);D='Raw-audit evidence finalizer'},
@{N='VoiceTrader-LocalNode-FinalScorecard';S='scripts/local-node/finalized-scorecard-worker.mjs';A=('--root "{0}" --poll-ms 15000' -f $DataRoot);D='Finalized trusted scorecards'},
@{N='VoiceTrader-LocalNode-Ops';S='scripts/local-node/local-lab-ops-worker.mjs';A=('--root "{0}" --poll-ms 10000 --size-ms 300000' -f $DataRoot);D='Local lab health and capacity summary'},
@{N='VoiceTrader-LocalNode-Console';S='scripts/local-node/local-lab-console.mjs';A=('--root "{0}" --port {1}' -f $DataRoot,$ConsolePort);D='Loopback-only Local Edge Lab console'})
$allNames=$taskDefs|ForEach-Object{$_.N};foreach($n in $allNames){Stop-ScheduledTask -TaskName $n -ErrorAction SilentlyContinue}
Write-Host 'Stage 4/5: atomic runtime switch...'
try {
  if(Test-Path $RuntimeRoot){New-Item -ItemType Directory -Force -Path (Split-Path $Backup -Parent)|Out-Null;Move-Item $RuntimeRoot $Backup}
  Move-Item $Staging $RuntimeRoot
  function RegisterTask($x){$script=Join-Path $RuntimeRoot ($x.S -replace '/','\');$action=New-ScheduledTaskAction -Execute $nodeExe -Argument ('"{0}" {1}' -f $script,$x.A) -WorkingDirectory $RuntimeRoot;$trigger=New-ScheduledTaskTrigger -AtStartup;$principal=New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest;$settings=New-ScheduledTaskSettingsSet -StartWhenAvailable -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew;$old=Get-ScheduledTask -TaskName $x.N -ErrorAction SilentlyContinue;if($old){Unregister-ScheduledTask -TaskName $x.N -Confirm:$false};Register-ScheduledTask -TaskName $x.N -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description $x.D|Out-Null;Start-ScheduledTask -TaskName $x.N}
  foreach($x in $taskDefs){RegisterTask $x}
} catch {
  Write-Host "SWITCH FAILURE, rolling back runtime: $($_.Exception.Message)"
  foreach($n in $allNames){Stop-ScheduledTask -TaskName $n -ErrorAction SilentlyContinue;Unregister-ScheduledTask -TaskName $n -Confirm:$false -ErrorAction SilentlyContinue}
  if(Test-Path $RuntimeRoot){Remove-Item -Recurse -Force $RuntimeRoot}
  if(Test-Path $Backup){Move-Item $Backup $RuntimeRoot}
  throw
}
$config=[ordered]@{schemaVersion='voicetrader-local-node-v065';installedAt=(Get-Date).ToUniversalTime().ToString('o');dataRoot=$DataRoot;repo='TAMAFIT/voicetrader-pwa';repoRef=$RepoRef;nodeVersion=$nodeVersion;console="http://127.0.0.1:$ConsolePort/";components=@('GMO_RAW','GMO_DERIVED','KRAKEN_WIRE','CRC32_L2','OFI_MICROPRICE','BOUNDARY_WINDOWS','PROSPECTIVE_FROZEN_ADAPTIVE_NULL_PHASE','BLIND_EXAM','QUOTED_EXECUTION','RAW_AUDIT','LOSSLESS_ARCHIVE','EVIDENCE_CERTIFIER','PRELIM_SCORECARD','FINAL_SCORECARD','LOCAL_CONSOLE');runtimePolicy=[ordered]@{googleCloudEnabled=$false;cloudUploadEnabled=$false;githubActionsRequired=$false;authenticationRequiredForMarketData=$false;orderSubmission=$false;realMoneyRouting=$false;automaticPromotion=$false};evidence=[ordered]@{rawAuditRequiredForFinalized=$true;losslessArchiveOnlyAfterAuditPass=$true;blindExamAdaptiveLearning=$false;quotedSpreadEmbedded=$true;feesObserved=$false;slippageObserved=$false;actualNetEvAvailable=$false};backupRuntime=$Backup}
$config|ConvertTo-Json -Depth 8|Set-Content -Encoding UTF8 -Path (Join-Path $DataRoot 'state\local-node-v065-config.json')
Write-Host 'Stage 5/5: workers started.';Start-Sleep -Seconds 15
Write-Host '';Write-Host 'VoiceTrader Local Edge Lab v0.65 installed.';Write-Host "Data: $DataRoot";Write-Host "Console: http://127.0.0.1:$ConsolePort/";Write-Host 'Google Cloud OFF / Cloud upload OFF / GitHub Actions runtime dependency NONE / Real money OFF';Write-Host "Previous runtime backup: $Backup"

param(
  [string]$DataRoot = 'X:\XVoiceTraderData',
  [string]$RepoRef = 'feat/local-node-ops-v060',
  [int]$ConsolePort = 17891
)

$ErrorActionPreference='Stop'
$RepoBase="https://raw.githubusercontent.com/TAMAFIT/voicetrader-pwa/$RepoRef"
$RuntimeRoot=Join-Path $DataRoot 'runtime\voicetrader-local-node'
$ScriptDir=Join-Path $RuntimeRoot 'scripts\local-node'
$TestDir=Join-Path $RuntimeRoot 'scripts'
$SourceDir=Join-Path $RuntimeRoot 'src\short-horizon'

function Test-Administrator {
  $identity=[Security.Principal.WindowsIdentity]::GetCurrent()
  $principal=[Security.Principal.WindowsPrincipal]::new($identity)
  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}
if(-not(Test-Administrator)){
  if(-not $PSCommandPath){throw 'Save this upgrader as a .ps1 file before running.'}
  $args2=@('-NoProfile','-ExecutionPolicy','Bypass','-File',('"{0}"' -f $PSCommandPath),'-DataRoot',('"{0}"' -f $DataRoot),'-RepoRef',('"{0}"' -f $RepoRef),'-ConsolePort',$ConsolePort)
  Start-Process -FilePath 'powershell.exe' -Verb RunAs -ArgumentList $args2
  exit 0
}

if(-not(Test-Path $DataRoot)){throw "VoiceTrader data root does not exist: $DataRoot"}
$baseConfigPath=Join-Path $DataRoot 'state\local-node-config.json'
if(-not(Test-Path $baseConfigPath)){throw 'Base v0.49 Local Node config was not found. Do not upgrade an unknown installation.'}
$baseConfig=Get-Content -Raw $baseConfigPath|ConvertFrom-Json
$nodeExe=[string]$baseConfig.nodeExe
if(-not $nodeExe -or -not(Test-Path $nodeExe)){$nodeCommand=Get-Command node.exe -ErrorAction SilentlyContinue;if(-not $nodeCommand){throw 'Node.js was not found.'};$nodeExe=$nodeCommand.Source}
$nodeVersion=(& $nodeExe --version).Trim();$nodeMajor=[int](($nodeVersion.TrimStart('v') -split '\.')[0]);if($nodeMajor -lt 22){throw "Node.js 22+ is required. Found: $nodeVersion"}

foreach($dir in @($RuntimeRoot,$ScriptDir,$TestDir,$SourceDir,(Join-Path $DataRoot 'raw'),(Join-Path $DataRoot 'derived'),(Join-Path $DataRoot 'research'),(Join-Path $DataRoot 'state'),(Join-Path $DataRoot 'logs'))){New-Item -ItemType Directory -Force -Path $dir|Out-Null}

$runtimeFiles=@(
  'scripts/local-node/gmo-fx-tick-recorder.mjs',
  'scripts/local-node/gmo-quote-derived-worker.mjs',
  'scripts/local-node/kraken-microstructure-recorder.mjs',
  'scripts/local-node/kraken-boundary-window-worker.mjs',
  'scripts/local-node/short-horizon-prospective-worker.mjs',
  'scripts/local-node/short-horizon-scorecard-worker.mjs',
  'scripts/local-node/local-lab-ops-worker.mjs',
  'scripts/local-node/local-lab-console.mjs',
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
  'src/short-horizon/local-node-ops.js'
)
$testFiles=@(
  'scripts/test-short-horizon-kraken-book-integrity.mjs',
  'scripts/test-short-horizon-kraken-microstructure-features.mjs',
  'scripts/test-short-horizon-kraken-boundary-windows.mjs',
  'scripts/test-short-horizon-prospective-experiment.mjs',
  'scripts/test-short-horizon-adaptive-postmortem.mjs',
  'scripts/test-short-horizon-blind-epoch.mjs',
  'scripts/test-short-horizon-blind-scorecard.mjs',
  'scripts/test-short-horizon-local-ops.mjs'
)
function DestinationFor([string]$relative){return Join-Path $RuntimeRoot ($relative -replace '/','\')}
foreach($relative in @($runtimeFiles+$testFiles)){
  $dest=DestinationFor $relative
  New-Item -ItemType Directory -Force -Path (Split-Path $dest -Parent)|Out-Null
  $url="$RepoBase/$relative"
  Write-Host "Downloading $relative"
  Invoke-WebRequest -UseBasicParsing -Uri $url -OutFile $dest
}

Write-Host 'Running local syntax checks...'
foreach($relative in $runtimeFiles){$dest=DestinationFor $relative;& $nodeExe --check $dest;if($LASTEXITCODE -ne 0){throw "Node syntax check failed: $relative"}}
Write-Host 'Running local regression suite (no GitHub Actions / no cloud)...'
foreach($relative in $testFiles){$dest=DestinationFor $relative;& $nodeExe $dest;if($LASTEXITCODE -ne 0){throw "Local regression test failed: $relative"}}

function Register-VoiceTraderTask([string]$TaskName,[string]$Script,[string]$Arguments,[string]$Description){
  $scriptPath=DestinationFor $Script
  $action=New-ScheduledTaskAction -Execute $nodeExe -Argument ('"{0}" {1}' -f $scriptPath,$Arguments) -WorkingDirectory $RuntimeRoot
  $trigger=New-ScheduledTaskTrigger -AtStartup
  $principal=New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
  $settings=New-ScheduledTaskSettingsSet -StartWhenAvailable -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew
  $existing=Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  if($existing){Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue;Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false}
  Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description $Description|Out-Null
  Start-ScheduledTask -TaskName $TaskName
}

$tasks=@(
  @{Name='VoiceTrader-LocalNode-GMO-USDJPY';Script='scripts/local-node/gmo-fx-tick-recorder.mjs';Args=('--root "{0}"' -f $DataRoot);Description='VoiceTrader persistent public GMO USDJPY raw quote recorder.'},
  @{Name='VoiceTrader-LocalNode-GMO-Derived';Script='scripts/local-node/gmo-quote-derived-worker.mjs';Args=('--root "{0}" --poll-ms 15000 --lookback-minutes 5' -f $DataRoot);Description='VoiceTrader USDJPY derived quote and boundary worker.'},
  @{Name='VoiceTrader-LocalNode-Kraken-Raw';Script='scripts/local-node/kraken-microstructure-recorder.mjs';Args=('--root "{0}" --warn-free-gb 50 --hard-stop-free-gb 10' -f $DataRoot);Description='VoiceTrader Kraken BTC/ETH exact wire, trade, L2, checksum and microstructure recorder.'},
  @{Name='VoiceTrader-LocalNode-Kraken-Windows';Script='scripts/local-node/kraken-boundary-window-worker.mjs';Args=('--root "{0}" --poll-ms 2000' -f $DataRoot);Description='VoiceTrader trusted microstructure 1s/5s/15s/60s boundary window engine.'},
  @{Name='VoiceTrader-LocalNode-Prospective';Script='scripts/local-node/short-horizon-prospective-worker.mjs';Args=('--root "{0}" --poll-ms 1000' -f $DataRoot);Description='VoiceTrader future-only Frozen/Adaptive/Null/Phase/Blind prospective experiment worker.'},
  @{Name='VoiceTrader-LocalNode-Scorecard';Script='scripts/local-node/short-horizon-scorecard-worker.mjs';Args=('--root "{0}" --poll-ms 5000' -f $DataRoot);Description='VoiceTrader blind-separated descriptive research scorecard worker.'},
  @{Name='VoiceTrader-LocalNode-Ops';Script='scripts/local-node/local-lab-ops-worker.mjs';Args=('--root "{0}" --poll-ms 30000 --size-every-ms 300000' -f $DataRoot);Description='VoiceTrader local-only health, freshness and storage summary worker.'},
  @{Name='VoiceTrader-LocalNode-Console';Script='scripts/local-node/local-lab-console.mjs';Args=('--root "{0}" --port {1}' -f $DataRoot,$ConsolePort);Description='VoiceTrader read-only loopback Local Edge Lab console.'}
)
foreach($task in $tasks){Register-VoiceTraderTask $task.Name $task.Script $task.Args $task.Description}

$config=[ordered]@{
  schemaVersion='voicetrader-local-node-v060-config-v1';installedAt=(Get-Date).ToUniversalTime().ToString('o');dataRoot=$DataRoot;repo='TAMAFIT/voicetrader-pwa';repoRef=$RepoRef;nodeExe=$nodeExe;nodeVersion=$nodeVersion;console=[ordered]@{bind='127.0.0.1';port=$ConsolePort;url="http://127.0.0.1:$ConsolePort/"};
  tasks=@($tasks|ForEach-Object{$_.Name});
  capture=[ordered]@{gmoUsdJpyPublicQuotes=$true;krakenBtcEthTrades=$true;krakenBtcEthL2Depth=10;rawAuthoritative=$true;checksumGate='KRAKEN_CRC32_TOP10'};
  research=[ordered]@{windows=@('1s','5s','15s','60s');boundaryFamilies=@('5m','15m','60m');horizonsSec=@(5,15,30,60);experiments=@('BOUNDARY_CONCORDANCE_V1','BOUNDARY_HASH_NULL_V1','PHASE_CONTROL_CONCORDANCE_V1','BOUNDARY_ADAPTIVE_V1');adaptiveLearningHorizonSec=15;blindEpoch='short-horizon-live-epoch-001';blindFraction=0.2;blindNeverLearns=$true;automaticPromotion=$false;transactionCostsModeled=$false;actualNetEvAvailable=$false};
  runtimePolicy=[ordered]@{googleCloudEnabled=$false;cloudUploadEnabled=$false;githubActionsRequired=$false;telemetryEnabled=$false;authenticationRequiredForCurrentFeeds=$false;orderSubmission=$false;realMoneyRouting=$false}
}
$configPath=Join-Path $DataRoot 'state\local-node-v060-config.json';$config|ConvertTo-Json -Depth 10|Set-Content -Encoding UTF8 -Path $configPath
$urlFile=Join-Path $DataRoot 'VoiceTrader Local Edge Lab.url';@("[InternetShortcut]","URL=http://127.0.0.1:$ConsolePort/","IconIndex=0")|Set-Content -Encoding ASCII -Path $urlFile
try{$publicDesktop=[Environment]::GetFolderPath('CommonDesktopDirectory');if($publicDesktop){Copy-Item -Force $urlFile (Join-Path $publicDesktop 'VoiceTrader Local Edge Lab.url')}}catch{}

Start-Sleep -Seconds 15
Write-Host ''
Write-Host 'VoiceTrader Local Edge Lab v0.60 installed.'
Write-Host "Data root: $DataRoot"
Write-Host "Pinned repo ref: $RepoRef"
Write-Host "Console: http://127.0.0.1:$ConsolePort/"
Write-Host 'Google Cloud = OFF / Cloud upload = OFF / GitHub Actions runtime dependency = NONE'
Write-Host 'Real-money routing = OFF / Automatic promotion = OFF'
Write-Host 'Frozen + Adaptive + Hash Null + Phase Control + 20% Blind Exam are active prospectively.'
Write-Host "Config: $configPath"
$kh=Join-Path $DataRoot 'state\kraken-microstructure-health.json';if(Test-Path $kh){$h=Get-Content -Raw $kh|ConvertFrom-Json;Write-Host "Kraken: $($h.status) messages=$($h.counts.messages) checksumMatches=$($h.counts.checksumMatches) mismatches=$($h.counts.checksumMismatches) OFI=$($h.semantics.ofiAvailable)"}
$ph=Join-Path $DataRoot 'state\short-horizon-prospective-health.json';if(Test-Path $ph){$h=Get-Content -Raw $ph|ConvertFrom-Json;Write-Host "Prospective: signals=$($h.counts.signalsWritten) outcomes=$($h.counts.outcomesWritten) adaptiveUpdates=$($h.counts.adaptiveUpdates) blindRetired=$($h.counts.blindOutcomesRetired)"}

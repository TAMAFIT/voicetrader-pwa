param(
  [string]$DataRoot = 'X:\XVoiceTraderData',
  [string]$RepoRef = 'ccca1556ab17a63256ba41d63495f699d641b42a'
)

$ErrorActionPreference='Stop'
$RepoBase="https://raw.githubusercontent.com/TAMAFIT/voicetrader-pwa/$RepoRef"
$DerivedTask='VoiceTrader-LocalNode-GMO-Derived'
$KrakenTask='VoiceTrader-LocalNode-Kraken-Raw'

function Test-Administrator {
  $identity=[Security.Principal.WindowsIdentity]::GetCurrent()
  $principal=[Security.Principal.WindowsPrincipal]::new($identity)
  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}
if(-not(Test-Administrator)){
  if(-not $PSCommandPath){throw 'Save this upgrader as a .ps1 file before running.'}
  $arguments=@('-NoProfile','-ExecutionPolicy','Bypass','-File',('"{0}"' -f $PSCommandPath),'-DataRoot',('"{0}"' -f $DataRoot),'-RepoRef',('"{0}"' -f $RepoRef))
  Start-Process -FilePath 'powershell.exe' -Verb RunAs -ArgumentList $arguments
  exit 0
}

if(-not(Test-Path $DataRoot)){throw "VoiceTrader data root does not exist: $DataRoot"}
$baseConfigPath=Join-Path $DataRoot 'state\local-node-config.json'
if(-not(Test-Path $baseConfigPath)){throw 'v0.49 Local Node config was not found. Install v0.49 first.'}
$baseConfig=Get-Content -Raw $baseConfigPath|ConvertFrom-Json
$nodeExe=[string]$baseConfig.nodeExe
if(-not $nodeExe -or -not(Test-Path $nodeExe)){$nodeCommand=Get-Command node.exe -ErrorAction SilentlyContinue;if(-not $nodeCommand){throw 'Node.js was not found.'};$nodeExe=$nodeCommand.Source}
$nodeVersionText=(& $nodeExe --version).Trim();$nodeMajor=[int](($nodeVersionText.TrimStart('v') -split '\.')[0]);if($nodeMajor -lt 22){throw "Node.js 22+ is required. Found: $nodeVersionText"}

$runtimeRoot=Join-Path $DataRoot 'runtime\voicetrader-local-node';$scriptDir=Join-Path $runtimeRoot 'scripts\local-node';$sourceDir=Join-Path $runtimeRoot 'src\short-horizon'
New-Item -ItemType Directory -Force -Path $scriptDir|Out-Null;New-Item -ItemType Directory -Force -Path $sourceDir|Out-Null
$downloads=@(
  @{Url="$RepoBase/scripts/local-node/gmo-quote-derived-worker.mjs";Destination=(Join-Path $scriptDir 'gmo-quote-derived-worker.mjs')},
  @{Url="$RepoBase/src/short-horizon/local-node-gmo-derived.js";Destination=(Join-Path $sourceDir 'local-node-gmo-derived.js')},
  @{Url="$RepoBase/scripts/local-node/kraken-microstructure-recorder.mjs";Destination=(Join-Path $scriptDir 'kraken-microstructure-recorder.mjs')},
  @{Url="$RepoBase/src/short-horizon/local-node-kraken-wire.js";Destination=(Join-Path $sourceDir 'local-node-kraken-wire.js')},
  @{Url="$RepoBase/src/short-horizon/kraken-book-integrity.js";Destination=(Join-Path $sourceDir 'kraken-book-integrity.js')}
)
foreach($download in $downloads){Write-Host "Downloading $($download.Url)";Invoke-WebRequest -UseBasicParsing -Uri $download.Url -OutFile $download.Destination}

$derivedWorker=Join-Path $scriptDir 'gmo-quote-derived-worker.mjs';$krakenRecorder=Join-Path $scriptDir 'kraken-microstructure-recorder.mjs'
& $nodeExe --check $derivedWorker;if($LASTEXITCODE -ne 0){throw 'Derived worker syntax check failed.'}
& $nodeExe --check $krakenRecorder;if($LASTEXITCODE -ne 0){throw 'Kraken recorder syntax check failed.'}

function Register-VoiceTraderTask([string]$TaskName,[string]$Arguments,[string]$Description){
  $action=New-ScheduledTaskAction -Execute $nodeExe -Argument $Arguments -WorkingDirectory $runtimeRoot
  $trigger=New-ScheduledTaskTrigger -AtStartup
  $principal=New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
  $settings=New-ScheduledTaskSettingsSet -StartWhenAvailable -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew
  $existing=Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue;if($existing){Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue;Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false}
  Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description $Description|Out-Null;Start-ScheduledTask -TaskName $TaskName
}
Register-VoiceTraderTask $DerivedTask ('"{0}" --root "{1}" --poll-ms 15000 --lookback-minutes 5' -f $derivedWorker,$DataRoot) 'VoiceTrader local-only USDJPY derived quote engine.'
Register-VoiceTraderTask $KrakenTask ('"{0}" --root "{1}" --warn-free-gb 50 --hard-stop-free-gb 10' -f $krakenRecorder,$DataRoot) 'VoiceTrader public Kraken BTC/ETH trade + L2 recorder with CRC32 book integrity verification.'

$config=[ordered]@{schemaVersion='voicetrader-local-upgrade-v052';installedAt=(Get-Date).ToUniversalTime().ToString('o');dataRoot=$DataRoot;repo='TAMAFIT/voicetrader-pwa';repoRef=$RepoRef;nodeVersion=$nodeVersionText;components=@(
  [ordered]@{id='gmo-derived';task=$DerivedTask;intervals=@('1s','5s','1m');runtimeNetwork='NONE'},
  [ordered]@{id='kraken-verified-raw';task=$KrakenTask;endpoint='wss://ws.kraken.com/v2';symbols=@('BTC/USD','ETH/USD');channels=@('book','trade');bookDepth=10;checksum='CRC32_TOP10_EVERY_BOOK_MESSAGE';authenticationRequired=$false}
);runtimePolicy=[ordered]@{googleCloudEnabled=$false;cloudUploadEnabled=$false;githubActionsRequired=$false;orderSubmission=$false;realMoneyRouting=$false};integrity=[ordered]@{krakenExactWirePreserved=$true;krakenPerMessageSha256=$true;krakenChecksumVerification=$true;checksumMismatchAction='FAIL_CLOSED_RECONNECT';ofiAvailable=$false;micropriceAvailable=$false}}
$config|ConvertTo-Json -Depth 8|Set-Content -Encoding UTF8 -Path (Join-Path $DataRoot 'state\local-node-v052-config.json')

Start-Sleep -Seconds 10
Write-Host '';Write-Host 'VoiceTrader Local Node upgraded through v0.52.';Write-Host "Data root: $DataRoot";Write-Host 'Google Cloud = OFF / Cloud upload = OFF / GitHub Actions runtime dependency = NONE';Write-Host 'USDJPY Derived: 1s / 5s / 1m';Write-Host 'Kraken: BTC/USD + ETH/USD Trade + L2 depth 10 + CRC32 integrity';Write-Host 'OFI/Microprice remain disabled until v0.53 derived feature gate.'
$derivedHealth=Join-Path $DataRoot 'state\derived-gmo-health.json';$krakenHealth=Join-Path $DataRoot 'state\kraken-microstructure-health.json'
if(Test-Path $derivedHealth){$h=Get-Content -Raw $derivedHealth|ConvertFrom-Json;Write-Host "Derived worker: $($h.status)"}
if(Test-Path $krakenHealth){$h=Get-Content -Raw $krakenHealth|ConvertFrom-Json;Write-Host "Kraken: $($h.status) messages=$($h.counts.messages) book=$($h.counts.book) trade=$($h.counts.trade) checksumMatches=$($h.counts.checksumMatches) mismatches=$($h.counts.checksumMismatches) synchronized=$($h.integrity.bookSynchronizationVerified) freeGB=$([math]::Round($h.storage.freeBytes/1GB,2))"}else{Write-Host 'Kraken health file not visible yet; task may still be connecting.'}

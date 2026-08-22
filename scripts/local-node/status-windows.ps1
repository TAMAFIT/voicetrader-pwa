param(
  [string]$DataRoot = 'X:\XVoiceTraderData'
)

$ErrorActionPreference = 'Stop'
$TaskName = 'VoiceTrader-LocalNode-GMO-USDJPY'
$healthPath = Join-Path $DataRoot 'state\local-node-health.json'

$task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if (-not $task) {
  Write-Host "Task: NOT INSTALLED ($TaskName)"
} else {
  $info = Get-ScheduledTaskInfo -TaskName $TaskName
  Write-Host "Task: $($task.State)"
  Write-Host "Last run: $($info.LastRunTime)"
  Write-Host "Last result: $($info.LastTaskResult)"
}

if (-not (Test-Path $healthPath)) {
  Write-Host "Health: not found ($healthPath)"
  exit 0
}

$health = Get-Content -Raw -Path $healthPath | ConvertFrom-Json
Write-Host "Health status: $($health.status)"
Write-Host "Health timestamp: $($health.timestampIso)"
Write-Host "Stored quotes: $($health.counts.storedQuotes)"
Write-Host "Reconnects: $($health.counts.reconnects)"
Write-Host "Last quote: $($health.lastQuote.marketStatus) bid=$($health.lastQuote.bid) ask=$($health.lastQuote.ask)"
Write-Host "Last raw file: $($health.storage.lastRawFile)"
if ($health.storage.freeBytes -ne $null) {
  $freeGiB = [math]::Round(([double]$health.storage.freeBytes / 1GB), 2)
  Write-Host "Free space: $freeGiB GiB"
}
Write-Host "Google Cloud used: $($health.guarantees.googleCloudUsed)"
Write-Host "Cloud upload: $($health.guarantees.cloudUpload)"
Write-Host "GitHub Actions required: $($health.guarantees.githubActionsRequired)"

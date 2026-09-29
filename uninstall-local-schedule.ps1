$ErrorActionPreference = 'Stop'
$task = Get-ScheduledTask -TaskName 'PolicyRadarFreeUpdate' -ErrorAction SilentlyContinue
if ($task) {
  Unregister-ScheduledTask -TaskName 'PolicyRadarFreeUpdate' -Confirm:$false
  Write-Host '本地自动检查任务已移除。' -ForegroundColor Green
} else {
  Write-Host '未找到本地自动检查任务。'
}

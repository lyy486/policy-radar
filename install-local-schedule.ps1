$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
if (-not (Test-Path (Join-Path $PSScriptRoot 'data\local-email.json'))) { throw '请先运行 configure-local-email.cmd 完成邮箱配置。' }

$runner = Join-Path $PSScriptRoot 'run-local-update.ps1'
$argument = '-NoProfile -ExecutionPolicy Bypass -File "' + $runner + '"'
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $argument
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Hours 1) -RepetitionDuration (New-TimeSpan -Days 3650)
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 10)
Register-ScheduledTask -TaskName 'PolicyRadarFreeUpdate' -Action $action -Trigger $trigger -Settings $settings -Description '每小时检查教师考试官方政策并发送邮件提醒' -Force | Out-Null
Write-Host '每小时自动检查任务已安装。电脑关机期间不会执行，重新开机后会继续。' -ForegroundColor Green

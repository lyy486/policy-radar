param([switch]$TestEmail)

$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
$configPath = Join-Path $PSScriptRoot 'data\local-email.json'
if (-not (Test-Path -LiteralPath $configPath)) { throw '尚未配置本地邮箱，请先运行 configure-local-email.cmd。' }

$config = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
if ($config.smtpHost -notin @('smtp.qq.com', 'smtp.163.com')) { throw '不允许的 SMTP 主机。' }
$securePassword = ConvertTo-SecureString -String $config.encryptedPassword
$credential = [System.Management.Automation.PSCredential]::new('smtp', $securePassword)
$plainPassword = $credential.GetNetworkCredential().Password

$env:SMTP_HOST = [string]$config.smtpHost
$env:SMTP_PORT = [string]$config.smtpPort
$env:SMTP_USER = [string]$config.smtpUser
$env:SMTP_PASS = $plainPassword
$env:SMTP_FROM = [string]$config.smtpFrom
$env:ALERT_EMAIL_TO = [string]$config.alertEmailTo

try {
  if ($TestEmail) { node scripts/send-test-email.js } else { npm run free:update }
  if ($LASTEXITCODE -ne 0) { throw '邮箱任务执行失败。' }
} finally {
  $plainPassword = $null
  Remove-Item Env:SMTP_HOST,Env:SMTP_PORT,Env:SMTP_USER,Env:SMTP_PASS,Env:SMTP_FROM,Env:ALERT_EMAIL_TO -ErrorAction SilentlyContinue
}

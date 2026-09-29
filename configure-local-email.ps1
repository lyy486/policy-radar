$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

Write-Host 'Free email alert setup' -ForegroundColor Cyan
Write-Host '1. QQ Mail (smtp.qq.com)'
Write-Host '2. 163 Mail (smtp.163.com)'
$provider = Read-Host 'Enter 1 or 2'
$smtpHost = switch ($provider) {
  '1' { 'smtp.qq.com' }
  '2' { 'smtp.163.com' }
  default { throw 'Enter 1 for QQ Mail or 2 for 163 Mail.' }
}

$sender = (Read-Host 'Sender email address').Trim()
if ($sender -notmatch '^[^@\s]+@[^@\s]+\.[^@\s]+$') { throw 'Sender email address is invalid.' }
$recipient = (Read-Host 'Recipient email address; press Enter to use sender').Trim()
if (-not $recipient) { $recipient = $sender }
if ($recipient -notmatch '^[^@\s]+@[^@\s]+\.[^@\s]+$') { throw 'Recipient email address is invalid.' }

Write-Host 'Enter the SMTP authorization code, not your web password. Input is hidden.' -ForegroundColor Yellow
$authorizationCode = Read-Host 'SMTP authorization code' -AsSecureString
$encryptedAuthorizationCode = ConvertFrom-SecureString -SecureString $authorizationCode
if (-not $encryptedAuthorizationCode) { throw 'SMTP authorization code cannot be empty.' }

$config = [ordered]@{
  smtpHost = $smtpHost
  smtpPort = 465
  smtpUser = $sender
  smtpFrom = $sender
  alertEmailTo = $recipient
  encryptedPassword = $encryptedAuthorizationCode
  createdAt = (Get-Date).ToString('o')
}

$dataDirectory = Join-Path $PSScriptRoot 'data'
New-Item -ItemType Directory -Path $dataDirectory -Force | Out-Null
$configPath = Join-Path $dataDirectory 'local-email.json'
$config | ConvertTo-Json | Set-Content -LiteralPath $configPath -Encoding UTF8
Write-Host 'Authorization code encrypted with this Windows user DPAPI.' -ForegroundColor Green

if (-not (Test-Path (Join-Path $PSScriptRoot 'node_modules\nodemailer'))) {
  Write-Host 'Installing required dependencies...' -ForegroundColor Cyan
  npm ci
  if ($LASTEXITCODE -ne 0) { throw 'npm ci failed.' }
}

& (Join-Path $PSScriptRoot 'run-local-update.ps1') -TestEmail

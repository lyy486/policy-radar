$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
. (Join-Path $PSScriptRoot 'scripts/local-email-diagnostics.ps1')
$stage = 'provider'
$failureCode = 'SETUP_FAILED'

try {
Write-LocalEmailResult -ProjectRoot $PSScriptRoot -Status 'awaiting_input' -Stage $stage
Write-Host 'Free email alert setup' -ForegroundColor Cyan
Write-Host '1. QQ Mail (smtp.qq.com)'
Write-Host '2. 163 Mail (smtp.163.com)'
$provider = (Read-Host 'Enter 1 or 2').Trim()
$smtpHost = switch ($provider) {
  '1' { 'smtp.qq.com' }
  '2' { 'smtp.163.com' }
  default { $failureCode = 'INVALID_PROVIDER'; throw 'Enter 1 for QQ Mail or 2 for 163 Mail.' }
}

$stage = 'sender'
Write-LocalEmailResult -ProjectRoot $PSScriptRoot -Status 'awaiting_input' -Stage $stage
$sender = (Read-Host 'Sender email address').Trim()
if ($sender -notmatch '^[^@\s]+@[^@\s]+\.[^@\s]+$') { $failureCode = 'INVALID_ADDRESS'; throw 'Sender email address is invalid.' }
$stage = 'recipient'
Write-LocalEmailResult -ProjectRoot $PSScriptRoot -Status 'awaiting_input' -Stage $stage
$recipient = (Read-Host 'Recipient email address; press Enter to use sender').Trim()
if (-not $recipient) { $recipient = $sender }
if ($recipient -notmatch '^[^@\s]+@[^@\s]+\.[^@\s]+$') { $failureCode = 'INVALID_ADDRESS'; throw 'Recipient email address is invalid.' }

$stage = 'authorization'
Write-LocalEmailResult -ProjectRoot $PSScriptRoot -Status 'awaiting_input' -Stage $stage
Write-Host 'Enter the SMTP authorization code, not your web password. Input is hidden.' -ForegroundColor Yellow
$authorizationCode = Read-Host 'SMTP authorization code' -AsSecureString
if ($authorizationCode.Length -eq 0) { $failureCode = 'EMPTY_AUTHORIZATION'; throw 'Authorization code cannot be empty.' }
$stage = 'save_config'
Write-LocalEmailResult -ProjectRoot $PSScriptRoot -Status 'running' -Stage $stage
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
  $stage = 'dependencies'
  Write-LocalEmailResult -ProjectRoot $PSScriptRoot -Status 'running' -Stage $stage
  Write-Host 'Installing required dependencies...' -ForegroundColor Cyan
  npm ci
  if ($LASTEXITCODE -ne 0) { $failureCode = 'DEPENDENCY_FAILED'; throw 'npm ci failed.' }
}

$stage = 'smtp'
Write-LocalEmailResult -ProjectRoot $PSScriptRoot -Status 'running' -Stage $stage
& (Join-Path $PSScriptRoot 'run-local-update.ps1') -TestEmail
} catch {
  if ($stage -ne 'smtp') { Write-LocalEmailResult -ProjectRoot $PSScriptRoot -Status 'failed' -Stage $stage -Code $failureCode }
  Write-Host ('Setup/test did not finish at stage: ' + $stage + '. Safe details: data/local-email-test-result.json') -ForegroundColor Red
  throw 'Local email setup/test failed. No input values were logged.'
} finally {
  if ($authorizationCode) { $authorizationCode.Dispose() }
}

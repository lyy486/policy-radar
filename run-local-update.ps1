param([switch]$TestEmail)

$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
. (Join-Path $PSScriptRoot 'scripts/local-email-diagnostics.ps1')
$stage = 'configuration'
$resultRecorded = $false
$plainPassword = $null
$credential = $null
$securePassword = $null

try {
  if ($TestEmail) { Write-LocalEmailResult -ProjectRoot $PSScriptRoot -Status 'running' -Stage $stage }
  $configPath = Join-Path $PSScriptRoot 'data/local-email.json'
  if (-not (Test-Path -LiteralPath $configPath)) { throw 'Local email is not configured.' }
  $config = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
  if ($config.smtpHost -notin @('smtp.qq.com', 'smtp.163.com')) { throw 'SMTP host is not allowed.' }
  $securePassword = ConvertTo-SecureString -String $config.encryptedPassword
  $credential = [System.Management.Automation.PSCredential]::new('smtp', $securePassword)
  $plainPassword = $credential.GetNetworkCredential().Password
  $env:SMTP_HOST = [string]$config.smtpHost
  $env:SMTP_PORT = [string]$config.smtpPort
  $env:SMTP_USER = [string]$config.smtpUser
  $env:SMTP_PASS = $plainPassword
  $env:SMTP_FROM = [string]$config.smtpFrom
  $env:ALERT_EMAIL_TO = [string]$config.alertEmailTo

  $stage = 'smtp'
  if ($TestEmail) {
    Write-LocalEmailResult -ProjectRoot $PSScriptRoot -Status 'running' -Stage $stage
    $previousPreference = $ErrorActionPreference
    try {
      $ErrorActionPreference = 'Continue'
      $global:LASTEXITCODE = -1
      $outputLines = & node scripts/send-test-email.js 2>&1
      $commandSucceeded = $?
      $exitCode = $LASTEXITCODE
    } finally { $ErrorActionPreference = $previousPreference }
    if (-not $commandSucceeded -or $exitCode -ne 0) {
      $failure = Get-LocalEmailFailure -OutputText ($outputLines -join [Environment]::NewLine)
      Write-LocalEmailResult -ProjectRoot $PSScriptRoot -Status 'failed' -Stage $stage -Code $failure.code -ResponseCode $failure.responseCode
      $resultRecorded = $true
      throw 'SMTP test failed.'
    }
    Write-LocalEmailResult -ProjectRoot $PSScriptRoot -Status 'server_accepted' -Stage $stage
    $resultRecorded = $true
    Write-Host 'SMTP server accepted the test email. Check your inbox and spam folder.' -ForegroundColor Green
  } else {
    npm run free:update
    if ($LASTEXITCODE -ne 0) { throw 'Email update failed.' }
  }
} catch {
  if ($TestEmail -and -not $resultRecorded) {
    $code = $(if ($stage -eq 'configuration') { 'CONFIG_ERROR' } else { 'SMTP_FAILED' })
    Write-LocalEmailResult -ProjectRoot $PSScriptRoot -Status 'failed' -Stage $stage -Code $code
  }
  throw 'Email task failed. For a test, see data/local-email-test-result.json; never share an authorization code.'
} finally {
  $outputLines = $null
  $plainPassword = $null
  $credential = $null
  if ($securePassword) { $securePassword.Dispose() }
  Remove-Item Env:SMTP_HOST,Env:SMTP_PORT,Env:SMTP_USER,Env:SMTP_PASS,Env:SMTP_FROM,Env:ALERT_EMAIL_TO -ErrorAction SilentlyContinue
}

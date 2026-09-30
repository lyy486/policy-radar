# Diagnostic records contain fixed metadata only. Never log inputs or raw errors.
function Write-LocalEmailResult {
  param([string]$ProjectRoot, [string]$Status, [string]$Stage, [string]$Code = 'NONE', [int]$ResponseCode = 0)
  $statuses = @('awaiting_input', 'running', 'failed', 'server_accepted')
  $stages = @('provider', 'sender', 'recipient', 'authorization', 'save_config', 'dependencies', 'configuration', 'smtp')
  $codes = @('NONE', 'INVALID_PROVIDER', 'INVALID_ADDRESS', 'EMPTY_AUTHORIZATION', 'SETUP_FAILED', 'CONFIG_ERROR', 'DEPENDENCY_FAILED', 'EAUTH', 'ECONNECTION', 'ESOCKET', 'ETIMEDOUT', 'EDNS', 'EENVELOPE', 'EMESSAGE', 'ETLS', 'SMTP_FAILED')
  $smtpCodes = @(250, 421, 450, 451, 452, 454, 500, 501, 502, 503, 504, 530, 534, 535, 538, 550, 551, 552, 553, 554)
  $record = [ordered]@{
    recordedAt = [DateTime]::UtcNow.ToString('o')
    status = $(if ($Status -in $statuses) { $Status } else { 'failed' })
    stage = $(if ($Stage -in $stages) { $Stage } else { 'unknown' })
    code = $(if ($Code -cin $codes) { $Code } else { 'UNKNOWN' })
    responseCode = $(if ($ResponseCode -in $smtpCodes) { $ResponseCode } else { $null })
  }
  try {
    $directory = Join-Path $ProjectRoot 'data'
    New-Item -ItemType Directory -Path $directory -Force -ErrorAction Stop | Out-Null
    $record | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $directory 'local-email-test-result.json') -Encoding UTF8 -ErrorAction Stop
  } catch { throw 'Could not save the local diagnostic record.' }
}

function Get-LocalEmailFailure {
  param([string]$OutputText)
  $codeMatch = [regex]::Match($OutputText, 'code:\s*[''"]?(EAUTH|ECONNECTION|ESOCKET|ETIMEDOUT|EDNS|EENVELOPE|EMESSAGE|ETLS)\b')
  $responseMatch = [regex]::Match($OutputText, 'responseCode:\s*(\d{3})\b')
  return @{
    code = $(if ($codeMatch.Success) { $codeMatch.Groups[1].Value } else { 'SMTP_FAILED' })
    responseCode = $(if ($responseMatch.Success) { [int]$responseMatch.Groups[1].Value } else { 0 })
  }
}

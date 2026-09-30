import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { FREE_RELEASE_FILES } from '../scripts/free-release-manifest.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const entries = ['configure-local-email.ps1', 'run-local-update.ps1', 'scripts/local-email-diagnostics.ps1'];
const quote = (value) => "'" + value.replaceAll("'", "''") + "'";

test('release includes local diagnostic implementation and regression tests, not local reports', () => {
  assert.ok(FREE_RELEASE_FILES.includes('scripts/local-email-diagnostics.ps1'));
  assert.ok(FREE_RELEASE_FILES.includes('test/local-email.test.js'));
  assert.ok(!FREE_RELEASE_FILES.includes('data/local-email-test-result.json'));
});

function runPowerShell(code) {
  const prelude = '$ProgressPreference = "SilentlyContinue"; [Console]::OutputEncoding = [Text.UTF8Encoding]::new($false); ';
  return spawnSync(join(process.env.SystemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe'),
    ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(prelude + code, 'utf16le').toString('base64')],
    { encoding: 'utf8', timeout: 15000, windowsHide: true, env: { ...process.env, PSModulePath: '' } });
}

test('local email entry scripts use Windows PowerShell safe encoding', async () => {
  for (const file of entries) {
    const bytes = await readFile(join(root, file));
    const asciiOnly = bytes.every((byte) => byte < 128);
    const hasUtf8Bom = bytes.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf]));
    assert.ok(asciiOnly || hasUtf8Bom, file + ' needs ASCII or an explicit UTF-8 BOM for Windows PowerShell 5.1');
  }
});

test('local launcher isolates inherited PowerShell module paths without changing global settings', async () => {
  const launcher = await readFile(join(root, 'configure-local-email.cmd'), 'utf8');
  assert.match(launcher, /setlocal/i);
  assert.match(launcher, /set "PSModulePath="/i);
  assert.match(launcher, /%SystemRoot%\\System32\\WindowsPowerShell\\v1.0\\powershell.exe/i);
  assert.match(launcher, /endlocal/i);
});

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'policy-radar-email-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await mkdir(join(directory, 'scripts'));
  for (const file of entries) {
    await cp(join(root, file), join(directory, file));
  }
  return directory;
}

test('diagnostics whitelist metadata and never save supplied secret-shaped text', { skip: process.platform !== 'win32' }, async (t) => {
  const directory = await fixture(t);
  const reportPath = join(directory, 'data/local-email-test-result.json');
  const result = runPowerShell(`. ${quote(join(directory, 'scripts/local-email-diagnostics.ps1'))}
    Write-LocalEmailResult -ProjectRoot ${quote(directory)} -Status 'PRIVATE_CANARY' -Stage 'PRIVATE_CANARY' -Code 'PRIVATE_CANARY' -ResponseCode 999
    $failure = Get-LocalEmailFailure -OutputText "Error PRIVATE_CANARY; code: 'EAUTH'; responseCode: 535"
    $failure | ConvertTo-Json -Compress`);
  assert.equal(result.status, 0, result.stderr);
  const raw = await readFile(reportPath, 'utf8');
  assert.doesNotMatch(raw, /PRIVATE_CANARY/);
  const report = JSON.parse(raw.replace(/^\uFEFF/, ''));
  assert.equal(report.status, 'failed');
  assert.equal(report.stage, 'unknown');
  assert.equal(report.code, 'UNKNOWN');
  assert.equal(report.responseCode, null);
  assert.deepEqual(Object.keys(report).sort(), ['code', 'recordedAt', 'responseCode', 'stage', 'status'].sort());
  assert.deepEqual(JSON.parse(result.stdout), { code: 'EAUTH', responseCode: 535 });
});

for (const scenario of [
  { name: 'invalid sender', answers: ['1', 'invalid'], stage: 'sender', code: 'INVALID_ADDRESS' },
  { name: 'invalid recipient', answers: ['1', 'sender@example.invalid', 'invalid'], stage: 'recipient', code: 'INVALID_ADDRESS' },
  { name: 'empty hidden authorization', answers: ['1', 'sender@example.invalid', ''], empty: true, stage: 'authorization', code: 'EMPTY_AUTHORIZATION' },
  { name: 'dependency failure', answers: ['1', 'sender@example.invalid', ''], dependenciesFail: true, stage: 'dependencies', code: 'DEPENDENCY_FAILED' },
  { name: 'complete mocked setup', answers: [' 1 ', 'sender@example.invalid', ''], stage: 'smtp', code: 'NONE', success: true }
]) {
  test('local setup handles ' + scenario.name + ' without contacting a mail server', { skip: process.platform !== 'win32' }, async (t) => {
    const directory = await fixture(t);
    if (!scenario.dependenciesFail) await mkdir(join(directory, 'node_modules/nodemailer'), { recursive: true });
    const result = runPowerShell(`$global:answers = @(${scenario.answers.map(quote).join(',')}); $global:answerIndex = 0
      function Read-Host {
        param($Prompt, [switch]$AsSecureString)
        if ($AsSecureString) { ${scenario.empty ? 'return [Security.SecureString]::new()' : "return (ConvertTo-SecureString 'TEST_ONLY_NOT_REAL_SECRET' -AsPlainText -Force)"} }
        $value = $global:answers[$global:answerIndex]; $global:answerIndex++; return $value
      }
      function npm { $global:LASTEXITCODE = 1 }
      function node { $global:LASTEXITCODE = 0; Write-Output 'PRIVATE_CANARY' }
      try { & ${quote(join(directory, 'configure-local-email.ps1'))} } catch { Write-Output 'Expected controlled failure' }`);
    assert.equal(result.status, 0, result.stderr);
    const raw = await readFile(join(directory, 'data/local-email-test-result.json'), 'utf8');
    const report = JSON.parse(raw.replace(/^\uFEFF/, ''));
    assert.equal(report.status, scenario.success ? 'server_accepted' : 'failed', result.stdout);
    assert.equal(report.stage, scenario.stage);
    assert.equal(report.code, scenario.code);
    assert.doesNotMatch(raw + result.stdout + result.stderr, /PRIVATE_CANARY|TEST_ONLY_NOT_REAL_SECRET|sender@example/);
  });
}

test('missing configuration replaces an old accepted result with a current config failure', { skip: process.platform !== 'win32' }, async (t) => {
  const directory = await fixture(t);
  const result = runPowerShell(`. ${quote(join(directory, 'scripts/local-email-diagnostics.ps1'))}
    Write-LocalEmailResult -ProjectRoot ${quote(directory)} -Status 'server_accepted' -Stage 'smtp'
    try { & ${quote(join(directory, 'run-local-update.ps1'))} -TestEmail } catch { Write-Output 'Expected config failure' }`);
  assert.equal(result.status, 0, result.stderr);
  const raw = await readFile(join(directory, 'data/local-email-test-result.json'), 'utf8');
  const report = JSON.parse(raw.replace(/^\uFEFF/, ''));
  assert.equal(report.status, 'failed');
  assert.equal(report.stage, 'configuration');
  assert.equal(report.code, 'CONFIG_ERROR');
});

test('setup records invalid input before saving configuration without logging the entered value', { skip: process.platform !== 'win32' }, async (t) => {
  const directory = await fixture(t);
  const result = runPowerShell(`function Read-Host { param($Prompt, [switch]$AsSecureString); return 'PRIVATE_CANARY' }
    try { & ${quote(join(directory, 'configure-local-email.ps1'))} } catch { Write-Output 'Expected controlled setup failure' }`);
  assert.equal(result.status, 0, result.stderr);
  const raw = await readFile(join(directory, 'data/local-email-test-result.json'), 'utf8');
  const report = JSON.parse(raw.replace(/^\uFEFF/, ''));
  assert.equal(report.status, 'failed');
  assert.equal(report.stage, 'provider');
  assert.equal(report.code, 'INVALID_PROVIDER');
  assert.doesNotMatch(raw + result.stdout + result.stderr, /PRIVATE_CANARY/);
  await assert.rejects(readFile(join(directory, 'data/local-email.json')), { code: 'ENOENT' });
});

for (const { success, native, launchFailure } of [{ success: false }, { success: true }, { success: false, native: true }, { success: false, launchFailure: true }]) {
  test('local SMTP mock ' + (launchFailure ? 'does not reuse a stale zero exit code when launch fails' : native ? 'redacts native stderr' : success ? 'records server acceptance, not delivery' : 'records a redacted 535 authentication failure'), { skip: process.platform !== 'win32' }, async (t) => {
    const directory = await fixture(t);
    await mkdir(join(directory, 'data'));
    const result = runPowerShell(`$dummy = ConvertTo-SecureString 'TEST_ONLY_NOT_REAL_SECRET' -AsPlainText -Force
      @{smtpHost='smtp.qq.com';smtpPort=465;smtpUser='sender@example.invalid';smtpFrom='sender@example.invalid';alertEmailTo='receiver@example.invalid';encryptedPassword=(ConvertFrom-SecureString $dummy)} | ConvertTo-Json | Set-Content -Encoding UTF8 -LiteralPath ${quote(join(directory, 'data/local-email.json'))}
      $global:LASTEXITCODE = 0
      function node { ${launchFailure ? 'Write-Error "PRIVATE_CANARY command did not launch"' : native
        ? '& ' + quote(process.execPath) + ' -e ' + quote('console.error("PRIVATE_CANARY TEST_ONLY_NOT_REAL_SECRET; code: EAUTH; responseCode: 535");process.exit(1)')
        : '$global:LASTEXITCODE = ' + (success ? 0 : 1) + '; Write-Output "PRIVATE_CANARY TEST_ONLY_NOT_REAL_SECRET; code: EAUTH; responseCode: 535"'} }
      try { & ${quote(join(directory, 'run-local-update.ps1'))} -TestEmail } catch { Write-Output 'Controlled failure, see safe report' }
      if (Test-Path Env:SMTP_PASS) { throw 'SMTP secret environment was not cleared' }`);
    assert.equal(result.status, 0, result.stderr);
    const raw = await readFile(join(directory, 'data/local-email-test-result.json'), 'utf8');
    const report = JSON.parse(raw.replace(/^\uFEFF/, ''));
    assert.equal(report.status, success ? 'server_accepted' : 'failed', result.stdout);
    assert.equal(report.stage, 'smtp', result.stdout);
    assert.equal(report.code, success ? 'NONE' : launchFailure ? 'SMTP_FAILED' : 'EAUTH');
    assert.equal(report.responseCode, success || launchFailure ? null : 535);
    assert.doesNotMatch(raw + result.stdout + result.stderr, /PRIVATE_CANARY|TEST_ONLY_NOT_REAL_SECRET|sender@example|receiver@example/);
  });
}

test('local email scripts parse in Windows PowerShell 5.1 without executing credentials', { skip: process.platform !== 'win32' }, () => {
  const files = entries.map((file) => quote(join(root, file))).join(',');
  const result = runPowerShell(`$results = @(foreach ($file in @(${files})) {
    $tokens = $null; $errors = $null
    [void][System.Management.Automation.Language.Parser]::ParseFile($file, [ref]$tokens, [ref]$errors)
    [pscustomobject]@{ file = [IO.Path]::GetFileName($file); errorCount = @($errors).Count }
  }); ConvertTo-Json -InputObject $results -Compress`);
  assert.equal(result.status, 0, result.stderr);
  for (const item of JSON.parse(result.stdout)) assert.equal(item.errorCount, 0, item.file);
});

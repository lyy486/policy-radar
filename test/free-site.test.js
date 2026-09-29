import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { dirname } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  buildStaticPayload,
  createAlertEmail,
  findUnnotifiedPolicies
} from '../scripts/free-site-lib.js';
import { FREE_RELEASE_FILES } from '../scripts/free-release-manifest.js';
import * as freeSiteLib from '../scripts/free-site-lib.js';

const validPolicy = {
  id: 'policy-1',
  title: '长春市公开招聘教师报名公告',
  summary: '来自官方来源列表页，详情请打开原文核对。',
  regionId: 'changchun',
  policyType: '教师招聘',
  category: '报名时间',
  publishedAt: '2026-09-27T01:00:00.000Z',
  fetchedAt: '2026-09-27T02:00:00.000Z',
  sourceName: '长春市教育局',
  sourceUrl: 'https://example.gov.cn/notice/1.html',
  contentHash: 'hash-1',
  isDemo: false
};

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));

function runNodeScript(script, environment) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [script], { cwd: projectRoot, env: { ...process.env, ...environment } });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

async function createSmtpMock() {
  let message = '';
  const server = createServer((socket) => {
    let buffer = '';
    let readingData = false;
    socket.write('220 localhost policy-radar-test\r\n');
    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      while (buffer.includes('\r\n')) {
        const lineEnd = buffer.indexOf('\r\n');
        const line = buffer.slice(0, lineEnd);
        buffer = buffer.slice(lineEnd + 2);
        if (readingData) {
          if (line === '.') { readingData = false; socket.write('250 queued\r\n'); }
          else message += line + '\n';
          continue;
        }
        const command = line.toUpperCase();
        if (command.startsWith('EHLO') || command.startsWith('HELO')) socket.write('250-localhost\r\n250 AUTH PLAIN LOGIN\r\n');
        else if (command.startsWith('AUTH')) socket.write('235 authenticated\r\n');
        else if (command.startsWith('MAIL FROM') || command.startsWith('RCPT TO')) socket.write('250 ok\r\n');
        else if (command === 'DATA') { readingData = true; socket.write('354 end with dot\r\n'); }
        else if (command === 'QUIT') { socket.write('221 bye\r\n'); socket.end(); }
        else socket.write('250 ok\r\n');
      }
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { server, port: server.address().port, getMessage: () => message };
}

test('buildStaticPayload only publishes current non-demo official records', () => {
  const payload = buildStaticPayload({
    policies: [
      validPolicy,
      { ...validPolicy, id: 'demo', contentHash: 'demo', isDemo: true },
      { ...validPolicy, id: 'archived', contentHash: 'archived', isArchived: true },
      { ...validPolicy, id: 'unsafe', contentHash: 'unsafe', sourceUrl: 'javascript:alert(1)' }
    ],
    sourceState: {},
    lastSync: { completedAt: '2026-09-27T02:05:00.000Z' }
  });

  assert.equal(payload.policies.length, 1);
  assert.equal(payload.policies[0].id, 'policy-1');
  assert.equal(payload.generatedAt, '2026-09-27T02:05:00.000Z');
});

test('findUnnotifiedPolicies returns each policy once', () => {
  const result = findUnnotifiedPolicies([validPolicy, { ...validPolicy, id: 'policy-2', contentHash: 'hash-2' }], ['hash-1']);
  assert.deepEqual(result.map((item) => item.contentHash), ['hash-2']);
});

test('alert batches persist only successful sends and retain older history', async () => {
  const policies = Array.from({ length: 25 }, (_, index) => ({ ...validPolicy, contentHash: 'new-' + index }));
  const original = { hashes: ['older-than-current-page'], initializedAt: 'original-baseline' };
  let state = original;
  const batches = [];
  const options = {
    policies, readState: async () => state, writeState: async (next) => { state = next; },
    sendAlert: async (batch) => { batches.push(batch); return true; },
    logger: { log() {}, warn() {} }, now: () => 'test-timestamp'
  };
  await freeSiteLib.deliverPolicyAlerts(options);
  assert.equal(batches[0].length, 20);
  assert.deepEqual(state.hashes, ['older-than-current-page', ...policies.slice(0, 20).map((policy) => policy.contentHash)]);
  assert.deepEqual(original.hashes, ['older-than-current-page']);
  assert.equal(state.initializedAt, 'original-baseline');
  await freeSiteLib.deliverPolicyAlerts(options);
  assert.deepEqual(batches[1].map((policy) => policy.contentHash), policies.slice(20).map((policy) => policy.contentHash));
  assert.equal(state.hashes.length, 26);
  await freeSiteLib.deliverPolicyAlerts(options);
  assert.equal(batches.length, 2);
});

test('notified state parser rejects corrupt JSON and invalid hash structures', () => {
  for (const raw of ['{broken', 'null', '[]', '{}', '{"hashes":null}', '{"hashes":"hash-1"}', '{"hashes":[42]}', '{"hashes":[""]}']) {
    assert.throws(() => freeSiteLib.parseNotifiedState(raw), /提醒去重状态无效/);
  }
  assert.deepEqual(freeSiteLib.parseNotifiedState('{"hashes":["hash-1"],"initializedAt":"kept"}'), { hashes: ['hash-1'], initializedAt: 'kept' });
  assert.deepEqual(freeSiteLib.parseNotifiedState('{"hashes":[]}'), { hashes: [] });
});

test('corrupt or unreadable dedup state skips all sending and preserves original state', async () => {
  const warnings = [];
  for (const readState of [
    async () => freeSiteLib.parseNotifiedState('{broken'),
    async () => freeSiteLib.parseNotifiedState('{"hashes":null}'),
    async () => { throw Object.assign(new Error('private file contents'), { code: 'EACCES' }); }
  ]) {
    let writes = 0;
    let sends = 0;
    await freeSiteLib.deliverPolicyAlerts({
      policies: [validPolicy], readState, writeState: async () => { writes += 1; },
      sendAlert: async () => { sends += 1; return true; },
      logger: { log() {}, warn(message) { warnings.push(message); } }
    });
    assert.equal(writes, 0);
    assert.equal(sends, 0);
  }
  assert.equal(warnings.length, 3);
  assert.ok(warnings.every((message) => message.includes('::warning::') && message.includes('保留原状态') && message.includes('网页数据已更新')));
  assert.ok(warnings.every((message) => !message.includes('private file contents')));
});

test('only a missing dedup state initializes a baseline without sending history', async () => {
  let saved;
  await freeSiteLib.deliverPolicyAlerts({
    policies: [validPolicy], readState: async () => null, writeState: async (state) => { saved = state; },
    sendAlert: async () => assert.fail('initial history must not be sent'),
    logger: { log() {}, warn() {} }, now: () => 'first-run'
  });
  assert.deepEqual(saved, { hashes: ['hash-1'], initializedAt: 'first-run' });
});

test('failed or unconfigured sending never marks pending policies as sent', async () => {
  for (const sendAlert of [async () => false, async () => { throw Object.assign(new Error('private SMTP details'), { code: 'EAUTH' }); }]) {
    const warnings = [];
    await freeSiteLib.deliverPolicyAlerts({
      policies: [validPolicy], readState: async () => ({ hashes: [] }),
      writeState: async () => assert.fail('unsent policies must remain pending'), sendAlert,
      logger: { log() {}, warn(message) { warnings.push(message); } }
    });
    assert.ok(warnings.every((message) => !message.includes('private SMTP details')));
  }
});

test('alert helpers handle missing fields, invalid URLs and escaped text safely', () => {
  const payload = buildStaticPayload({ policies: [
    { ...validPolicy, id: 'recent', publishedAt: null, fetchedAt: '2026-09-28T00:00:00Z' },
    { id: 'defaults', title: `<>&"'`, regionId: 'jilin', sourceUrl: validPolicy.sourceUrl, contentHash: 'defaults' },
    { ...validPolicy, id: 'invalid-date', publishedAt: 'not-a-date' },
    { ...validPolicy, sourceUrl: 'not a URL' }
  ] }, { generatedAt: 'explicit-time' });
  assert.equal(payload.policies.length, 3);
  assert.equal(payload.policies[0].id, 'recent');
  assert.equal(payload.generatedAt, 'explicit-time');
  assert.deepEqual(buildStaticPayload({}).policies, []);
  const message = createAlertEmail([{ title: `<>&"'`, sourceUrl: validPolicy.sourceUrl }]);
  assert.ok(message.html.includes('&lt;&gt;&amp;&quot;&#39;'));
  assert.ok(message.text.includes('官方来源'));
  assert.ok(!message.text.includes('手机网页'));
  assert.deepEqual(findUnnotifiedPolicies(), []);
  assert.deepEqual(findUnnotifiedPolicies([{ contentHash: null }]), []);
});

test('baseline uses a real timestamp when a test clock is not injected', async () => {
  let saved;
  await freeSiteLib.deliverPolicyAlerts({
    policies: [], readState: async () => null, writeState: async (state) => { saved = state; },
    sendAlert: async () => assert.fail('empty baseline must not send')
  });
  assert.ok(Number.isFinite(Date.parse(saved.initializedAt)));
});

test('createAlertEmail contains official links and no credentials', () => {
  const email = createAlertEmail([validPolicy], 'https://example.github.io/policy-radar/');
  assert.match(email.subject, /1 条/);
  assert.match(email.text, /长春市公开招聘教师报名公告/);
  assert.ok(email.text.includes('https://example.gov.cn/notice/1.html'));
  assert.match(email.html, /rel="noreferrer"/);
  assert.doesNotMatch(email.text, /SMTP_PASS|AppSecret|token/i);
});

test('free mobile site is static, installable and does not call private APIs', async () => {
  const [html, app, manifest, worker] = await Promise.all([
    readFile(new URL('../free-site/index.html', import.meta.url), 'utf8'),
    readFile(new URL('../free-site/app.js', import.meta.url), 'utf8'),
    readFile(new URL('../free-site/manifest.webmanifest', import.meta.url), 'utf8'),
    readFile(new URL('../free-site/sw.js', import.meta.url), 'utf8')
  ]);

  assert.match(html, /manifest.webmanifest/);
  assert.match(html, /Content-Security-Policy/);
  assert.ok(app.includes('./data/policies.json'));
  assert.ok(!app.includes('/api/'));
  assert.ok(app.includes("element('region-filter').value = 'all'"));
  assert.equal(JSON.parse(manifest).display, 'standalone');
  assert.match(worker, /free-policy-radar/);
});

test('free deployment workflow updates hourly and deploys GitHub Pages', async () => {
  const workflow = await readFile(new URL('../.github/workflows/free-policy-radar.yml', import.meta.url), 'utf8');
  assert.ok(workflow.includes("cron: '17 * * * *'"));
  assert.match(workflow, /npm run free:update/);
  assert.match(workflow, /actions\/deploy-pages@/);
  assert.ok(workflow.includes('secrets.SMTP_PASS'));
  assert.ok(!workflow.includes('SMTP_PASS: "'));
  assert.ok(!workflow.includes('\n  push:'));
});

test('free release package includes only the static deployment surface', () => {
  const files = new Set(FREE_RELEASE_FILES);
  ['.github/workflows/free-policy-radar.yml', 'free-site/index.html', 'scripts/free-update.js', 'src/source-registry.js', 'data/free-store.json', 'configure-local-email.ps1', 'install-local-schedule.ps1'].forEach((path) => assert.ok(files.has(path)));
  ['.env', 'data/store.json', 'miniprogram/app.js', 'src/server.js', 'policy-radar-deploy.zip'].forEach((path) => assert.ok(!files.has(path)));
});

test('local preview only exposes to the LAN after explicit opt-in', async () => {
  const [preview, launcher] = await Promise.all([
    readFile(new URL('../scripts/free-preview.js', import.meta.url), 'utf8'),
    readFile(new URL('../start-free-lan.ps1', import.meta.url), 'utf8')
  ]);
  assert.match(preview, /ALLOW_LAN/);
  assert.ok(preview.includes("requestedHost === '0.0.0.0'"));
  assert.ok(launcher.includes("$env:ALLOW_LAN = 'true'"));
  assert.ok(launcher.includes("$env:HOST = '0.0.0.0'"));
});

test('local email setup encrypts the SMTP authorization code and supports hourly scheduling', async () => {
  const [configure, runner, installer] = await Promise.all([
    readFile(new URL('../configure-local-email.ps1', import.meta.url), 'utf8'),
    readFile(new URL('../run-local-update.ps1', import.meta.url), 'utf8'),
    readFile(new URL('../install-local-schedule.ps1', import.meta.url), 'utf8')
  ]);
  assert.match(configure, /Read-Host.+-AsSecureString/);
  assert.match(configure, /ConvertFrom-SecureString/);
  assert.match(runner, /ConvertTo-SecureString/);
  assert.ok(runner.includes("$env:SMTP_PASS"));
  assert.doesNotMatch(runner, /Write-Host.+SMTP_PASS/);
  assert.match(installer, /Register-ScheduledTask/);
  assert.match(installer, /New-TimeSpan -Hours 1/);
});

test('test email script completes an authenticated SMTP delivery', async () => {
  const smtp = await createSmtpMock();
  try {
    const result = await runNodeScript('scripts/send-test-email.js', {
      SMTP_HOST: '127.0.0.1', SMTP_PORT: String(smtp.port), SMTP_USER: 'sender@example.com',
      SMTP_PASS: 'not-a-real-secret', SMTP_FROM: 'sender@example.com', ALERT_EMAIL_TO: 'receiver@example.com'
    });
    assert.equal(result.code, 0, result.stderr);
    assert.match(result.stdout, /测试邮件已发送/);
    assert.match(smtp.getMessage(), /Subject:/);
    assert.match(smtp.getMessage(), /To: receiver@example.com/);
  } finally {
    await new Promise((resolve) => smtp.server.close(resolve));
  }
});

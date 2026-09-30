import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { dirname } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { isApprovedFreeSource, listSourceCoverage } from '../src/source-registry.js';
import { syncSources } from '../src/sync-service.js';

import {
  buildStaticPayload,
  createAlertEmail,
  findUnnotifiedPolicies
} from '../scripts/free-site-lib.js';
import { FREE_RELEASE_FILES } from '../scripts/free-release-manifest.js';
import * as freeSiteLib from '../scripts/free-site-lib.js';
import * as policyService from '../src/policy-service.js';

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
  sourceId: 'legacy-source',
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
  assert.equal(payload.policies[0].sourceId, 'legacy-source');
  assert.equal(payload.generatedAt, '2026-09-27T02:05:00.000Z');
});

test('findUnnotifiedPolicies returns each policy once', () => {
  const result = findUnnotifiedPolicies([validPolicy, { ...validPolicy, id: 'policy-2', contentHash: 'hash-2' }], ['hash-1']);
  assert.deepEqual(result.map((item) => item.contentHash), ['hash-2']);
});

const quietLogger = { log() {}, warn() {} };
const baselinePolicy = { ...validPolicy, sourceId: 'new-source', contentHash: 'historical-2025', publishedAt: '2025-01-01T00:00:00Z' };
const firstSuccessAt = '2026-09-30T01:00:00.000Z';

test('new source history is baselined while old source pending alerts and all old hashes survive', async () => {
  const original = { hashes: ['retained-old-hash'], initializedAt: 'old-start' };
  let state = original; const sends = [];
  const options = {
    policies: [baselinePolicy, validPolicy], initialSourceIds: ['new-source'],
    sourceBaselines: [{ sourceId: 'new-source', hashes: ['historical-2025'], capturedAt: firstSuccessAt }],
    readState: async () => state, writeState: async (next) => { state = next; },
    sendAlert: async (batch) => { sends.push(batch.map((policy) => policy.contentHash)); return true; }, logger: quietLogger
  };
  await freeSiteLib.deliverPolicyAlerts(options);
  assert.deepEqual(sends, [['hash-1']]);
  assert.deepEqual(state.hashes, ['retained-old-hash', 'historical-2025', 'hash-1']);
  assert.deepEqual(state.initializedSourceIds, ['new-source']);
  assert.equal(state.initializedAt, 'old-start');
  assert.deepEqual(original, { hashes: ['retained-old-hash'], initializedAt: 'old-start' });
  const nextPolicy = { ...baselinePolicy, contentHash: 'really-new' };
  await freeSiteLib.deliverPolicyAlerts({ ...options, policies: [...options.policies, nextPolicy] });
  await freeSiteLib.deliverPolicyAlerts({ ...options, policies: [...options.policies, nextPolicy] });
  assert.deepEqual(sends, [['hash-1'], ['really-new']]);
});

test('failed new source attempts neither initialize its baseline nor send cached history', async () => {
  let state = { hashes: ['retained'] }; let writes = 0; let sends = 0;
  await freeSiteLib.deliverPolicyAlerts({
    policies: [baselinePolicy], initialSourceIds: ['new-source'], sourceBaselines: [],
    readState: async () => state, writeState: async (next) => { writes += 1; state = next; },
    sendAlert: async () => { sends += 1; return true; }, logger: quietLogger
  });
  assert.equal(sends, 0); assert.equal(writes, 0); assert.deepEqual(state, { hashes: ['retained'] });
});

test('corrupt dedup and failed baseline persistence cannot send or lose a pending initialization', async () => {
  const options = { policies: [baselinePolicy], initialSourceIds: ['new-source'],
    sourceBaselines: [{ sourceId: 'new-source', hashes: ['historical-2025'], capturedAt: firstSuccessAt }],
    sendAlert: async () => assert.fail('must not send before baseline is persisted'), logger: quietLogger };
  await freeSiteLib.deliverPolicyAlerts({ ...options,
    readState: async () => freeSiteLib.parseNotifiedState('{broken'),
    writeState: async () => assert.fail('corrupt dedup must be preserved')
  });
  await assert.rejects(freeSiteLib.deliverPolicyAlerts({ ...options,
    readState: async () => ({ hashes: ['old'] }), writeState: async () => { throw new Error('disk full'); }
  }), /disk full/);
});

test('source snapshot persists once across retries without swallowing subsequent new hashes', () => {
  const sources = [{ id: 'legacy-source' }, { id: 'new-source', alertBaselineOnFirstSync: true }, { id: 'future-source' }];
  const previous = { 'legacy-source': { lastSuccessAt: 'old', etag: 'legacy' }, 'new-source': { lastSuccessAt: 'preflight', etag: 'cached', parserVersion: 'old-version' } };
  const plan = freeSiteLib.planSourceBaselineSync(sources, previous);
  assert.deepEqual(plan.initialSourceIds, ['new-source', 'future-source']);
  assert.equal(plan.sourceState['legacy-source'].etag, 'legacy');
  assert.equal(plan.sourceState['new-source'].etag, undefined);
  assert.equal(previous['new-source'].etag, 'cached');
  const captured = freeSiteLib.captureSourceBaselines({
    initialSourceIds: plan.initialSourceIds, sourceState: plan.sourceState, policies: [baselinePolicy, validPolicy],
    results: [{ sourceId: 'new-source', status: 'ok', completedAt: firstSuccessAt }, { sourceId: 'future-source', status: 'failed' }]
  });
  assert.deepEqual(captured.sourceBaselines, [{ sourceId: 'new-source', hashes: ['historical-2025'], capturedAt: firstSuccessAt }]);
  assert.equal(captured.sourceState['future-source']?.freeAlertBaseline, undefined);
  const retryPlan = freeSiteLib.planSourceBaselineSync(sources, captured.sourceState);
  const retry = freeSiteLib.captureSourceBaselines({
    initialSourceIds: retryPlan.initialSourceIds, sourceState: retryPlan.sourceState,
    policies: [baselinePolicy, { ...baselinePolicy, contentHash: 'later-policy' }],
    results: [{ sourceId: 'new-source', status: 'ok', completedAt: 'later-success' }]
  });
  assert.deepEqual(retry.sourceBaselines, captured.sourceBaselines);
  assert.deepEqual(retry.sourceState['new-source'].freeAlertBaseline, { hashes: ['historical-2025'], capturedAt: firstSuccessAt });
  const failed = freeSiteLib.captureSourceBaselines({ initialSourceIds: ['new-source'], sourceState: retry.sourceState, policies: [], results: [{ sourceId: 'new-source', status: 'failed' }] });
  assert.deepEqual(failed.sourceBaselines, []);
  assert.deepEqual(failed.sourceState['new-source'].freeAlertBaseline, retry.sourceState['new-source'].freeAlertBaseline);
});

test('source initialization metadata rejects corruption and accepts a verified empty snapshot', async () => {
  for (const initializedSourceIds of [null, 'new-source', [123], [''], ['bad source']]) {
    assert.throws(() => freeSiteLib.parseNotifiedState(JSON.stringify({ hashes: [], initializedSourceIds })), /提醒去重状态无效/);
  }
  assert.deepEqual(freeSiteLib.parseNotifiedState('{"hashes":[],"initializedSourceIds":["new-source"]}').initializedSourceIds, ['new-source']);
  assert.throws(() => freeSiteLib.planSourceBaselineSync([{ id: 'new-source' }], { 'new-source': { freeAlertBaseline: { hashes: 'bad' } } }), /来源基线状态无效/);
  assert.throws(() => freeSiteLib.planSourceBaselineSync([{ id: 'new-source' }], { 'new-source': { freeAlertBaseline: { hashes: [], capturedAt: 'not-a-date' } } }), /来源基线状态无效/);
  const capture = freeSiteLib.captureSourceBaselines({ initialSourceIds: ['new-source'], sourceState: {}, policies: [], results: [{ sourceId: 'new-source', status: 'ok', completedAt: firstSuccessAt }] });
  let state = { hashes: ['old'] };
  await freeSiteLib.deliverPolicyAlerts({ policies: [], initialSourceIds: ['new-source'], ...capture, readState: async () => state, writeState: async (next) => { state = next; }, sendAlert: async () => assert.fail('empty snapshot'), logger: quietLogger });
  assert.deepEqual(state.initializedSourceIds, ['new-source']);
  assert.deepEqual(state.hashes, ['old']);
});

test('corrupt dedup recovery reuses the first snapshot and still sends later arrivals once', async () => {
  const sources = [{ id: 'new-source', alertBaselineOnFirstSync: true }];
  const initial = freeSiteLib.captureSourceBaselines({ initialSourceIds: ['new-source'], sourceState: {}, policies: [baselinePolicy], results: [{ sourceId: 'new-source', status: 'ok', completedAt: firstSuccessAt }] });
  let sends = []; let state = { hashes: ['old-hash'] }; let writes = 0;
  const options = { policies: [baselinePolicy], initialSourceIds: ['new-source'], sourceBaselines: initial.sourceBaselines,
    readState: async () => { throw new Error('corrupt'); }, writeState: async (next) => { writes += 1; state = next; },
    sendAlert: async (batch) => { sends = [...sends, batch.map((item) => item.contentHash)]; return true; }, logger: quietLogger };
  await freeSiteLib.deliverPolicyAlerts(options);
  assert.equal(writes, 0); assert.deepEqual(sends, []);
  const plan = freeSiteLib.planSourceBaselineSync(sources, initial.sourceState);
  const policies = [baselinePolicy, validPolicy, { ...baselinePolicy, contentHash: 'later-arrival' }];
  const recovered = freeSiteLib.captureSourceBaselines({ initialSourceIds: plan.initialSourceIds, sourceState: plan.sourceState, policies, results: [{ sourceId: 'new-source', status: 'ok', completedAt: '2026-09-30T02:00:00Z' }] });
  const retryOptions = { ...options, ...recovered, policies, readState: async () => state };
  await freeSiteLib.deliverPolicyAlerts(retryOptions);
  await freeSiteLib.deliverPolicyAlerts(retryOptions);
  assert.deepEqual(sends, [['hash-1', 'later-arrival']]);
  assert.deepEqual(state.hashes, ['old-hash', 'historical-2025', 'hash-1', 'later-arrival']);
});

test('a 304 without a prior snapshot cannot initialize, while a persisted successful snapshot can', () => {
  const options = { initialSourceIds: ['new-source'], sourceState: {}, policies: [baselinePolicy], results: [{ sourceId: 'new-source', status: 'not-modified' }] };
  assert.deepEqual(freeSiteLib.captureSourceBaselines(options).sourceBaselines, []);
  const saved = { hashes: ['historical-2025'], capturedAt: firstSuccessAt };
  assert.deepEqual(freeSiteLib.captureSourceBaselines({ ...options, sourceState: { 'new-source': { freeAlertBaseline: saved } } }).sourceBaselines, [{ sourceId: 'new-source', ...saved }]);
});

test('free-update wiring persists a new source snapshot before sending only eligible pending notices', async () => {
  const script = (await readFile(new URL('../scripts/free-update.js', import.meta.url), 'utf8')).replace(/^import .+;\r?$/gm, '');
  const storedFiles = new Map([['data/free-notified.json', JSON.stringify({ hashes: ['retained'] })]]);
  let stored = { policies: [validPolicy, baselinePolicy], sourceState: { 'legacy-source': { lastSuccessAt: firstSuccessAt }, 'new-source': { lastSuccessAt: firstSuccessAt, etag: 'preflight-cache' } } };
  const sources = [{ id: 'legacy-source', enabled: true, url: validPolicy.sourceUrl }, { id: 'new-source', enabled: true, url: validPolicy.sourceUrl, alertBaselineOnFirstSync: true }];
  const messages = []; const events = [];
  const runUpdate = async () => runInNewContext('(async () => {' + script + '\n})()', {
    ...freeSiteLib, ...policyService, structuredClone, URL, console: quietLogger,
    process: { env: { SMTP_HOST: 'smtp.example.invalid', SMTP_USER: 'fixture@example.invalid', SMTP_PASS: 'fake-only', ALERT_EMAIL_TO: 'fixture@example.invalid' } },
    resolve: (path) => path, dirname: () => 'memory', mkdir: async () => {},
    readFile: async (path) => storedFiles.get(path),
    writeFile: async (path, value) => { storedFiles.set(path, value); events.push(path); },
    loadStore: async () => structuredClone(stored),
    persistStore: async (store) => { stored = structuredClone(store); events.push('persistStore'); },
    listSources: () => sources, listSourceCoverage: () => [], isApprovedFreeSource,
    syncSources: async ({ store }) => {
      events.push(store.sourceState['new-source'].etag === undefined ? 'unconditional' : 'conditional');
      store.sourceState = { ...store.sourceState, 'new-source': { ...store.sourceState['new-source'], etag: 'later-cache', lastSuccessAt: firstSuccessAt } };
      return sources.map((source) => ({ sourceId: source.id, status: 'ok', completedAt: firstSuccessAt }));
    },
    nodemailer: { createTransport: () => ({ sendMail: async (message) => { messages.push(message); events.push('send'); } }) }
  });
  await runUpdate();
  assert.equal(messages.length, 1);
  assert.match(messages[0].text, /发布日期：2026-09-27/);
  assert.doesNotMatch(messages[0].text, /2025-01-01/);
  assert.deepEqual(events.slice(0, 5), ['unconditional', 'persistStore', 'free-site/data/policies.json', 'data/free-notified.json', 'send']);
  assert.deepEqual(stored.sourceState['new-source'].freeAlertBaseline.hashes, ['historical-2025']);
  stored = { ...stored, policies: [...stored.policies, { ...baselinePolicy, contentHash: 'after-snapshot', publishedAt: '2026-09-30T00:00:00Z' }] };
  await runUpdate(); await runUpdate();
  assert.equal(messages.length, 2);
  assert.match(messages[1].text, /发布日期：2026-09-30/);
  assert.deepEqual(JSON.parse(storedFiles.get('data/free-notified.json')).hashes, ['retained', 'historical-2025', 'hash-1', 'after-snapshot']);
});

test('email labels newly collected notices and uses actual publication date, never fetch date', () => {
  const message = createAlertEmail([baselinePolicy, { ...validPolicy, publishedAt: null, fetchedAt: '2026-09-30T00:00:00Z' }]);
  assert.match(message.subject, /新收录公告/);
  assert.match(message.text, /发布日期：2025-01-01/);
  assert.match(message.text, /发布日期：官网未标明/);
  assert.match(message.html, /2025-01-01.*官网未标明/);
  assert.doesNotMatch(message.text, /2026-09-30/);
  assert.doesNotMatch(message.subject, /条新公告/);
  assert.match(message.text, /新收录不等于新发布/);
  const invalidDate = createAlertEmail([{ ...validPolicy, publishedAt: 'not-a-date' }]);
  assert.match(invalidDate.text, /发布日期：官网未标明/);
  assert.match(createAlertEmail([{ ...validPolicy, publishedAt: '2025-01-01T16:00:00Z' }]).text, /发布日期：2025-01-02/);
});

test('public metadata and cloud email use one audited Changchun plus provincial scope', async () => {
  const payload = buildStaticPayload({});
  assert.deepEqual(payload.alertScope.regionIds, ['jilin', ...policyService.CHANGCHUN_REGION_IDS]);
  assert.deepEqual(payload.alertScope.policyTypes, ['教师招聘', '特岗教师', '教师资格考试']);
  assert.deepEqual(payload.regionGroups.find((group) => group.id === 'changchun-all').regionIds, [...policyService.CHANGCHUN_REGION_IDS]);
  assert.deepEqual(Object.keys(payload.alertScope).sort(), ['categories', 'id', 'label', 'policyTypes', 'regionIds']);
  payload.alertScope.regionIds.push('outsider');
  assert.ok(!buildStaticPayload({}).alertScope.regionIds.includes('outsider'));
  const policies = [
    validPolicy,
    { ...validPolicy, contentHash: 'district', regionId: 'nong-an-cc' },
    { ...validPolicy, contentHash: 'province-special', regionId: 'jilin', policyType: '特岗教师' },
    { ...validPolicy, contentHash: 'province-qualification', regionId: 'jilin', policyType: '教师资格考试' },
    { ...validPolicy, contentHash: 'other-city', regionId: 'tonghua' },
    { ...validPolicy, contentHash: 'non-teacher', policyType: '公务员考试' }
  ];
  let sent; let saved;
  await freeSiteLib.deliverPolicyAlerts({
    policies, readState: async () => ({ hashes: [] }), writeState: async (next) => { saved = next; },
    sendAlert: async (batch) => { sent = batch; return true; }, logger: { log() {}, warn() {} }
  });
  assert.deepEqual(sent.map((item) => item.contentHash), ['hash-1', 'district', 'province-special', 'province-qualification']);
  assert.deepEqual(saved.hashes, sent.map((item) => item.contentHash));
});

test('scope initialization does not mark out-of-scope notices as previously sent', async () => {
  let saved;
  await freeSiteLib.deliverPolicyAlerts({
    policies: [validPolicy, { ...validPolicy, contentHash: 'outside', regionId: 'tonghua' }],
    readState: async () => null, writeState: async (next) => { saved = next; },
    sendAlert: async () => assert.fail('baseline must not send'), logger: { log() {}, warn() {} }
  });
  assert.deepEqual(saved.hashes, ['hash-1']);
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
  assert.ok(html.includes('页面筛选只影响本页，不修改邮件提醒范围'));
  assert.ok(html.includes('alert-scope'));
  assert.equal(JSON.parse(manifest).display, 'standalone');
  assert.match(worker, /free-policy-radar/);
});

async function loadMockMobileSite(payload, { storage = new Map(), storageThrows = false } = {}) {
  let currentPayload = payload;
  let intervalCallback;
  const notifications = [];
  const nodes = new Map();
  const makeNode = () => ({
    textContent: '', children: [], options: [{ value: 'all' }], value: 'all', listeners: {},
    append(...children) { this.children.push(...children); },
    replaceChildren(...children) { this.children = children; },
    add(option) { this.options.push(option); },
    addEventListener(event, listener) { this.listeners[event] = listener; }
  });
  const getNode = (id) => {
    if (!nodes.has(id)) nodes.set(id, makeNode());
    return nodes.get(id);
  };
  getNode('keyword-filter').value = '';
  const source = await readFile(new URL('../free-site/app.js', import.meta.url), 'utf8');
  function MockNotification(title, options) { notifications.push({ title, ...options }); }
  MockNotification.permission = 'granted';
  MockNotification.requestPermission = async () => 'granted';
  runInNewContext(source, {
    document: { getElementById: getNode, createElement: makeNode },
    window: { addEventListener() {}, Notification: MockNotification }, navigator: {},
    localStorage: {
      getItem: (key) => { if (storageThrows) throw new Error('storage disabled'); return storage.get(key) ?? null; },
      setItem: (key, value) => { if (storageThrows) throw new Error('storage disabled'); storage.set(key, value); }
    },
    Option: function (label, value) { this.label = label; this.value = value; },
    fetch: async () => ({ ok: true, json: async () => currentPayload }),
    Notification: MockNotification, setInterval(callback) { intervalCallback = callback; }, URL, Intl
  }, { filename: 'free-site/app.js' });
  await new Promise(setImmediate);
  const textOf = (node) => node.textContent + node.children.map(textOf).join(' ');
  return {
    text: (id) => textOf(getNode(id)),
    value: (id) => getNode(id).value, storage, notifications,
    select: (value) => { getNode('region-filter').value = value; getNode('region-filter').listeners.change(); },
    filter: (id, value) => { getNode(id).value = value; getNode(id).listeners[id === 'keyword-filter' ? 'input' : 'change'](); },
    refresh: async (nextPayload) => { currentPayload = nextPayload; await intervalCallback(); await new Promise(setImmediate); }
  };
}

function pendingCoveragePayload(overrides = {}) {
  return {
    ...buildStaticPayload({}),
    regions: policyService.JILIN_REGIONS,
    policyTypes: policyService.POLICY_TYPES, categories: policyService.REQUEST_CATEGORIES,
    coverage: listSourceCoverage().map((item) => ({ ...item, status: item.regionId === 'jilin' ? 'active' : 'pending' })),
    ...overrides
  };
}

test('mobile defaults focus on Changchun and province while keeping all three teacher policy types', async () => {
  const payload = pendingCoveragePayload({ policies: [
    validPolicy,
    { ...validPolicy, contentHash: 'district', title: '农安特岗', regionId: 'nong-an-cc', policyType: '特岗教师' },
    { ...validPolicy, contentHash: 'province', title: '省级教资考试', regionId: 'jilin', policyType: '教师资格考试' },
    { ...validPolicy, contentHash: 'outside', title: '通化教师公告', regionId: 'tonghua' }
  ] });
  const app = await loadMockMobileSite(payload);
  assert.equal(app.value('region-filter'), 'changchun-all');
  assert.equal(app.value('type-filter'), 'all');
  assert.equal(app.text('result-count'), '3');
  assert.match(app.text('policy-list'), /农安特岗/);
  assert.match(app.text('policy-list'), /省级教资考试/);
  assert.doesNotMatch(app.text('policy-list'), /通化教师公告/);
  assert.match(app.text('alert-scope'), /邮件提醒范围.*长春.*吉林省级.*教师招聘.*特岗教师.*教师资格考试/);
});

test('mobile filter changes survive refresh without changing email scope', async () => {
  const payload = pendingCoveragePayload();
  const first = await loadMockMobileSite(payload);
  first.select('nong-an-cc');
  first.filter('type-filter', '特岗教师');
  first.filter('category-filter', '报名时间');
  first.filter('keyword-filter', '面试');
  const second = await loadMockMobileSite(payload, { storage: first.storage });
  for (const [id, expected] of [['region-filter', 'nong-an-cc'], ['type-filter', '特岗教师'], ['category-filter', '报名时间'], ['keyword-filter', '面试']]) {
    assert.equal(second.value(id), expected);
  }
  assert.equal(first.text('alert-scope'), second.text('alert-scope'));
});

test('invalid saved filters and disabled local storage safely fall back to defaults', async () => {
  for (const saved of ['{broken', 'null', '[]', '{"region":"outside","type":"all","category":"all","keyword":""}', '{"region":"all","type":"all","category":"all","keyword":42}']) {
    const app = await loadMockMobileSite(pendingCoveragePayload({ policies: [validPolicy] }), { storage: new Map([['policyRadarFilters', saved]]) });
    assert.equal(app.value('region-filter'), 'changchun-all');
    assert.equal(app.value('keyword-filter'), '');
    assert.equal(app.text('result-count'), '1');
  }
  const app = await loadMockMobileSite(pendingCoveragePayload({ policies: [validPolicy] }), { storageThrows: true });
  assert.equal(app.text('result-count'), '1');
  assert.doesNotThrow(() => app.select('all'));
});

test('page notifications and unread counts only include current matching filters', async () => {
  const payload = pendingCoveragePayload();
  const app = await loadMockMobileSite(payload);
  app.filter('type-filter', '特岗教师');
  app.filter('category-filter', '报名时间');
  app.filter('keyword-filter', '报名');
  const policies = [
    { ...validPolicy, contentHash: 'match', title: '农安特岗报名公告', regionId: 'nong-an-cc', policyType: '特岗教师' },
    { ...validPolicy, contentHash: 'region', title: '通化特岗报名公告', regionId: 'tonghua', policyType: '特岗教师' },
    { ...validPolicy, contentHash: 'type' },
    { ...validPolicy, contentHash: 'category', policyType: '特岗教师', category: '面试' },
    { ...validPolicy, contentHash: 'keyword', title: '资格要求', summary: '', policyType: '特岗教师' }
  ];
  await app.refresh({ ...payload, policies });
  assert.equal(app.notifications.length, 1);
  assert.equal(app.notifications[0].body, '农安特岗报名公告');
  assert.equal(app.text('new-count'), '1');
  await app.refresh({ ...payload, policies });
  assert.equal(app.notifications.length, 1);
});

test('mobile startup explicitly discloses unconnected Changchun official sources', async () => {
  const app = await loadMockMobileSite(pendingCoveragePayload());
  assert.match(app.text('coverage-status'), /长春市及各区县官方来源尚未接入/);
  assert.doesNotMatch(app.text('coverage-status'), /73.*已覆盖|全省已覆盖/);
});

test('pending region filters warn about missing coverage while retaining provincial notices', async () => {
  const policies = [
    { ...validPolicy, title: '省级教师招聘公告', regionId: 'jilin' },
    { ...validPolicy, title: '长春市教师招聘公告', contentHash: 'cc', regionId: 'changchun' },
    { ...validPolicy, title: '通化市教师招聘公告', contentHash: 'th', regionId: 'tonghua' }
  ];
  const app = await loadMockMobileSite(pendingCoveragePayload({ policies }));
  for (const region of ['changchun-all', 'changchun', 'chaoyang-cc']) {
    app.select(region);
    assert.match(app.text('coverage-status'), /当前无结果不代表没有公告，请同时关注官方渠道/);
    assert.match(app.text('coverage-status'), /省级.*核对/);
    assert.match(app.text('policy-list'), /省级教师招聘公告/);
    assert.doesNotMatch(app.text('policy-list'), /通化市教师招聘公告/);
  }
  const emptyApp = await loadMockMobileSite(pendingCoveragePayload());
  emptyApp.select('changchun');
  assert.match(emptyApp.text('policy-list'), /当前无结果不代表没有公告，请同时关注官方渠道/);
});

test('coverage warnings change when Changchun sources become partly or fully connected', async () => {
  const pending = pendingCoveragePayload();
  const partial = await loadMockMobileSite({ ...pending, coverage: pending.coverage.map((item) => item.regionId === 'changchun' ? { ...item, status: 'active' } : item) });
  assert.match(partial.text('coverage-status'), /长春市及各区县仅部分来源已接入/);
  assert.doesNotMatch(partial.text('coverage-status'), /长春市及各区县官方来源尚未接入/);
  const complete = await loadMockMobileSite({ ...pending, coverage: pending.coverage.map((item) => ({ ...item, status: 'active' })) });
  complete.select('changchun-all');
  assert.doesNotMatch(complete.text('coverage-status'), /尚未接入|仅部分来源已接入/);
  assert.match(complete.text('coverage-status'), /不代表完整覆盖/);
});

test('missing coverage metadata remains unknown rather than being advertised as connected', async () => {
  const app = await loadMockMobileSite(pendingCoveragePayload({ coverage: [] }));
  assert.match(app.text('coverage-status'), /接入状态尚未.*核验/);
  app.select('baishan');
  assert.match(app.text('coverage-status'), /当前无结果不代表没有公告，请同时关注官方渠道/);
});

test('failed source attempts update status without discarding trusted history or cached policies', async () => {
  const previous = Object.freeze({ lastAttemptAt: '2026-09-27T00:00:00Z', lastSuccessAt: '2026-09-27T00:00:00Z', etag: 'trusted-etag', lastSeen: 1 });
  const store = { policies: [validPolicy], sourceState: { mock: previous }, subscriptions: [], notifications: [] };
  const source = { id: 'mock', enabled: true, url: 'https://example.gov.cn/notices/', userAgent: 'PolicyRadarTest' };
  const results = await syncSources({ store, sources: [source], fetchImpl: async () => ({ status: 403, ok: false }) });
  assert.equal(results[0].status, 'failed');
  assert.equal(store.sourceState.mock.lastAttemptAt, results[0].completedAt);
  assert.equal(store.sourceState.mock.lastError, '来源响应 403');
  assert.equal(store.sourceState.mock.lastSuccessAt, previous.lastSuccessAt);
  assert.equal(store.sourceState.mock.etag, 'trusted-etag');
  assert.equal(store.sourceState.mock.lastSeen, 1);
  assert.deepEqual(store.policies, [validPolicy]);
  assert.equal(previous.lastAttemptAt, '2026-09-27T00:00:00Z');
  const recovered = await syncSources({ store, sources: [source], fetchImpl: async () => ({ status: 304, ok: false }) });
  assert.equal(recovered[0].status, 'not-modified');
  assert.equal(store.sourceState.mock.lastError, null);
  assert.equal(store.sourceState.mock.lastSuccessAt, recovered[0].completedAt);
  assert.equal(store.sourceState.mock.etag, 'trusted-etag');
});

test('a first failed attempt records failure without inventing a successful fetch', async () => {
  const store = { policies: [], sourceState: {} };
  const results = await syncSources({ store, sources: [{ id: 'first', enabled: true, url: 'https://example.gov.cn/' }], fetchImpl: async () => ({ status: 404, ok: false }) });
  assert.equal(store.sourceState.first?.lastError, '来源响应 404');
  assert.equal(store.sourceState.first?.lastAttemptAt, results[0].completedAt);
  assert.equal(store.sourceState.first?.lastSuccessAt, undefined);
});

test('mobile failure notice counts unavailable sources while retaining cached records without leaking errors', async () => {
  const app = await loadMockMobileSite(pendingCoveragePayload({
    policies: [validPolicy], sourceState: {
      first: { lastError: 'sensitive-example-one', lastAttemptAt: '2026-09-30T00:00:00Z' },
      second: { lastError: 'sensitive-example-two', lastAttemptAt: '2026-09-30T00:00:00Z' },
      good: { lastError: null }, unknown: {}
    }
  }));
  const notice = app.text('coverage-status');
  assert.match(notice, /2 个来源最近一次读取失败/);
  assert.match(notice, /保留.*公告.*核对官网/);
  assert.doesNotMatch(notice, /sensitive-example|全部正常/);
  assert.match(app.text('policy-list'), /长春市公开招聘教师报名公告/);
});

test('cleared source failures remove stale alerts without claiming all sources are healthy', async () => {
  const app = await loadMockMobileSite(pendingCoveragePayload({ sourceState: { recovered: { lastError: null } } }));
  assert.doesNotMatch(app.text('coverage-status'), /读取失败|全部正常/);
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

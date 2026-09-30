import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import nodemailer from 'nodemailer';

import { FREE_ALERT_SCOPE, JILIN_REGIONS, POLICY_TYPES, REQUEST_CATEGORIES } from '../src/policy-service.js';
import { isApprovedFreeSource, listSourceCoverage, listSources } from '../src/source-registry.js';
import { loadStore, persistStore } from '../src/store.js';
import { syncSources } from '../src/sync-service.js';
import { buildStaticPayload, captureSourceBaselines, createAlertEmail, deliverPolicyAlerts, parseNotifiedState, planSourceBaselineSync } from './free-site-lib.js';

const storePath = resolve(process.env.FREE_STORE_PATH ?? 'data/free-store.json');
const notifiedPath = resolve(process.env.FREE_NOTIFIED_PATH ?? 'data/free-notified.json');
const outputPath = resolve(process.env.FREE_SITE_DATA_PATH ?? 'free-site/data/policies.json');

async function readNotifiedState() {
  try {
    return parseNotifiedState(await readFile(notifiedPath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(value, null, 2) + '\n', 'utf8');
}

function smtpConfiguration() {
  const required = ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'ALERT_EMAIL_TO'];
  if (required.some((name) => !process.env[name])) return null;
  const port = Number(process.env.SMTP_PORT || 465);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('SMTP_PORT 配置无效');
  return {
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    to: process.env.ALERT_EMAIL_TO,
    from: process.env.SMTP_FROM ?? process.env.SMTP_USER
  };
}

async function sendAlert(policies) {
  const config = smtpConfiguration();
  if (!config || policies.length === 0) return false;
  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: config.user, pass: config.pass },
    tls: { rejectUnauthorized: true },
    connectionTimeout: 20_000,
    greetingTimeout: 20_000,
    socketTimeout: 30_000
  });
  const message = createAlertEmail(policies, process.env.PUBLIC_SITE_URL ?? '');
  await transporter.sendMail({ from: config.from, to: config.to, subject: message.subject, text: message.text, html: message.html });
  return true;
}

const loadedStore = await loadStore(storePath);
const store = structuredClone(loadedStore);
store.filePath = loadedStore.filePath;
store.subscriptions = [];
store.notifications = [];
store.users = [];
store.wechatDeliveries = [];

const sources = listSources().filter(isApprovedFreeSource);
const baselinePlan = planSourceBaselineSync(sources, store.sourceState);
store.sourceState = baselinePlan.sourceState;
const results = await syncSources({ store, sources });
const sourceBaselineResult = captureSourceBaselines({ initialSourceIds: baselinePlan.initialSourceIds, sourceState: store.sourceState, results, policies: store.policies });
store.sourceState = sourceBaselineResult.sourceState;
await persistStore(store);

const payload = buildStaticPayload(store, {
  regions: JILIN_REGIONS,
  policyTypes: POLICY_TYPES,
  categories: REQUEST_CATEGORIES,
  coverage: listSourceCoverage()
});
await writeJson(outputPath, payload);

await deliverPolicyAlerts({
  policies: payload.policies,
  scope: FREE_ALERT_SCOPE,
  initialSourceIds: baselinePlan.initialSourceIds,
  sourceBaselines: sourceBaselineResult.sourceBaselines,
  readState: readNotifiedState,
  writeState: (state) => writeJson(notifiedPath, state),
  sendAlert
});

const succeeded = results.filter((result) => ['ok', 'not-modified'].includes(result.status)).length;
console.log('免费版更新完成：' + succeeded + '/' + results.length + ' 个来源成功，网页共 ' + payload.policies.length + ' 条公告。');

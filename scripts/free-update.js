import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import nodemailer from 'nodemailer';

import { JILIN_REGIONS, POLICY_TYPES, REQUEST_CATEGORIES } from '../src/policy-service.js';
import { listSourceCoverage, listSources } from '../src/source-registry.js';
import { loadStore, persistStore } from '../src/store.js';
import { syncSources } from '../src/sync-service.js';
import { buildStaticPayload, createAlertEmail, findUnnotifiedPolicies } from './free-site-lib.js';

const storePath = resolve(process.env.FREE_STORE_PATH ?? 'data/free-store.json');
const notifiedPath = resolve(process.env.FREE_NOTIFIED_PATH ?? 'data/free-notified.json');
const outputPath = resolve(process.env.FREE_SITE_DATA_PATH ?? 'free-site/data/policies.json');

async function fileExists(path) {
  try { await access(path); return true; } catch { return false; }
}

async function readNotifiedState() {
  if (!await fileExists(notifiedPath)) return null;
  try {
    const parsed = JSON.parse(await readFile(notifiedPath, 'utf8'));
    return { hashes: Array.isArray(parsed.hashes) ? parsed.hashes.map(String) : [] };
  } catch {
    return { hashes: [] };
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
  const message = createAlertEmail(policies.slice(0, 20), process.env.PUBLIC_SITE_URL ?? '');
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

const sources = listSources().filter((source) => source.enabled && new URL(source.url).protocol === 'https:');
const results = await syncSources({ store, sources });
await persistStore(store);

const payload = buildStaticPayload(store, {
  regions: JILIN_REGIONS,
  policyTypes: POLICY_TYPES,
  categories: REQUEST_CATEGORIES,
  coverage: listSourceCoverage()
});
await writeJson(outputPath, payload);

const notifiedState = await readNotifiedState();
const currentHashes = payload.policies.map((policy) => policy.contentHash);
if (!notifiedState) {
  await writeJson(notifiedPath, { hashes: currentHashes, initializedAt: new Date().toISOString() });
  console.log('免费提醒已建立基线；首次运行不会发送历史公告。');
} else {
  const newPolicies = findUnnotifiedPolicies(payload.policies, notifiedState.hashes);
  let sent = false;
  if (newPolicies.length > 0) {
    try {
      sent = await sendAlert(newPolicies);
    } catch (error) {
      console.warn('::warning::邮件发送失败，网页数据仍已更新。错误代码：' + String(error?.code ?? 'unknown'));
    }
  }
  if (sent) {
    await writeJson(notifiedPath, { hashes: currentHashes, updatedAt: new Date().toISOString() });
    console.log('已发送新公告邮件：' + Math.min(newPolicies.length, 20) + ' 条。');
  } else if (newPolicies.length > 0) {
    console.log('发现新公告，但未配置完整邮箱 Secrets；数据网页已更新。');
  } else {
    console.log('没有发现需要发送的新公告。');
  }
}

const succeeded = results.filter((result) => ['ok', 'not-modified'].includes(result.status)).length;
console.log('免费版更新完成：' + succeeded + '/' + results.length + ' 个来源成功，网页共 ' + payload.policies.length + ' 条公告。');

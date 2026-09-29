import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { dirname, resolve } from 'node:path';

const DEFAULT_DATA = {
  policies: [],
  subscriptions: [],
  notifications: [],
  users: [],
  wechatDeliveries: [],
  auditLogs: [],
  syncRuns: []
};

const pendingWrites = new Map();

export async function loadStore(filePath) {
  const absolutePath = resolve(filePath);
  try {
    const parsed = JSON.parse(await readFile(absolutePath, 'utf8'));
    return {
      filePath: absolutePath,
      policies: Array.isArray(parsed.policies) ? parsed.policies : [],
      subscriptions: Array.isArray(parsed.subscriptions) ? parsed.subscriptions : [],
      notifications: Array.isArray(parsed.notifications) ? parsed.notifications : [],
      users: Array.isArray(parsed.users) ? parsed.users : [],
      wechatDeliveries: Array.isArray(parsed.wechatDeliveries) ? parsed.wechatDeliveries : [],
      auditLogs: Array.isArray(parsed.auditLogs) ? parsed.auditLogs : [],
      syncRuns: Array.isArray(parsed.syncRuns) ? parsed.syncRuns : [],
      lastSync: parsed.lastSync && typeof parsed.lastSync === 'object' ? structuredClone(parsed.lastSync) : null,
      sourceSyncAt: parsed.sourceSyncAt && typeof parsed.sourceSyncAt === 'object' ? structuredClone(parsed.sourceSyncAt) : {},
      sourceState: parsed.sourceState && typeof parsed.sourceState === 'object' ? structuredClone(parsed.sourceState) : {}
    };
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    await mkdir(dirname(absolutePath), { recursive: true });
    const store = { filePath: absolutePath, ...structuredClone(DEFAULT_DATA), sourceSyncAt: {}, sourceState: {} };
    await persistStore(store);
    return store;
  }
}

export async function persistStore(store) {
  const absolutePath = resolve(store.filePath);
  const previous = pendingWrites.get(absolutePath) ?? Promise.resolve();
  const write = previous.catch(() => {}).then(async () => {
    const payload = JSON.stringify({ policies: store.policies, subscriptions: store.subscriptions, notifications: store.notifications, users: store.users ?? [], wechatDeliveries: store.wechatDeliveries ?? [], auditLogs: store.auditLogs ?? [], syncRuns: store.syncRuns ?? [], ...(store.lastSync ? { lastSync: store.lastSync } : {}), sourceSyncAt: store.sourceSyncAt ?? {}, sourceState: store.sourceState ?? {} }, null, 2);
    const temporaryPath = `${absolutePath}.${process.pid}.${randomUUID()}.tmp`;
    await writeFile(temporaryPath, `${payload}\n`, 'utf8');
    await rename(temporaryPath, absolutePath);
  });
  pendingWrites.set(absolutePath, write);
  try { await write; } finally {
    if (pendingWrites.get(absolutePath) === write) pendingWrites.delete(absolutePath);
  }
}

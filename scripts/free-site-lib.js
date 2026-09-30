import { FREE_ALERT_SCOPE, REGION_GROUPS } from '../src/policy-service.js';

const SAFE_PROTOCOLS = new Set(['http:', 'https:']);
const isSourceId = (value) => typeof value === 'string' && /^[a-z0-9][a-z0-9_-]{0,79}$/i.test(value);
const isHashList = (value) => Array.isArray(value) && value.every((hash) => typeof hash === 'string' && hash.trim().length > 0);

function isSafeOfficialUrl(value) {
  try {
    return SAFE_PROTOCOLS.has(new URL(value).protocol);
  } catch {
    return false;
  }
}

function policyTimestamp(policy) {
  const value = policy.publishedAt ?? policy.fetchedAt ?? 0;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[character]);
}

export function buildStaticPayload(store, metadata = {}) {
  const policies = (store.policies ?? [])
    .filter((policy) => !policy.isDemo && !policy.isArchived && isSafeOfficialUrl(policy.sourceUrl))
    .map((policy) => ({
      id: String(policy.id),
      title: String(policy.title),
      summary: String(policy.summary ?? '请打开官方原文核对。'),
      regionId: String(policy.regionId),
      policyType: String(policy.policyType ?? '教师招聘'),
      category: String(policy.category ?? '招聘公告'),
      requiresTeacherVerification: policy.requiresTeacherVerification === true,
      publishedAt: policy.publishedAt ?? null,
      fetchedAt: policy.fetchedAt ?? null,
      sourceName: String(policy.sourceName ?? '官方来源'),
      sourceId: isSourceId(policy.sourceId) ? policy.sourceId : null,
      sourceUrl: String(policy.sourceUrl),
      contentHash: String(policy.contentHash)
    }))
    .sort((left, right) => policyTimestamp(right) - policyTimestamp(left))
    .slice(0, 500);

  return {
    generatedAt: store.lastSync?.completedAt ?? metadata.generatedAt ?? new Date().toISOString(),
    policies,
    regions: metadata.regions ?? [],
    policyTypes: metadata.policyTypes ?? [],
    categories: metadata.categories ?? [],
    alertScope: structuredClone(FREE_ALERT_SCOPE),
    regionGroups: structuredClone(REGION_GROUPS),
    coverage: metadata.coverage ?? [],
    sourceState: Object.fromEntries(Object.entries(store.sourceState ?? {}).map(([id, state]) => {
      const { detailTitleCache: _internalCache, ...publicState } = state;
      return [id, publicState];
    }))
  };
}

export function findUnnotifiedPolicies(policies, notifiedHashes) {
  const notified = new Set((notifiedHashes ?? []).map(String));
  return (policies ?? []).filter((policy) => policy.contentHash && !notified.has(String(policy.contentHash)));
}

export function parseNotifiedState(raw) {
  let parsed;
  try { parsed = JSON.parse(raw); } catch { throw new Error('提醒去重状态无效'); }
  if (!parsed || Array.isArray(parsed) || !isHashList(parsed.hashes)
    || parsed.initializedSourceIds !== undefined && (!Array.isArray(parsed.initializedSourceIds) || !parsed.initializedSourceIds.every(isSourceId))) {
    throw new Error('提醒去重状态无效');
  }
  return { ...parsed, hashes: [...parsed.hashes], ...(parsed.initializedSourceIds ? { initializedSourceIds: [...new Set(parsed.initializedSourceIds)] } : {}) };
}

function validateSourceBaseline(baseline) {
  if (!baseline || !isHashList(baseline.hashes) || typeof baseline.capturedAt !== 'string' || !Number.isFinite(Date.parse(baseline.capturedAt))) {
    throw new Error('来源基线状态无效');
  }
  return { hashes: [...baseline.hashes], capturedAt: baseline.capturedAt };
}

export function planSourceBaselineSync(sources, sourceState = {}) {
  const initialSourceIds = sources.filter((source) => source.alertBaselineOnFirstSync === true
    || !sourceState[source.id]?.lastSuccessAt || sourceState[source.id]?.freeAlertBaselinePending === true
    || sourceState[source.id]?.freeAlertBaseline !== undefined).map((source) => source.id);
  const allIds = [...new Set([...Object.keys(sourceState), ...initialSourceIds])];
  const prepared = Object.fromEntries(allIds.map((id) => {
    const entry = sourceState[id] ?? {};
    if (entry.freeAlertBaseline !== undefined) validateSourceBaseline(entry.freeAlertBaseline);
    if (!initialSourceIds.includes(id) || entry.freeAlertBaseline) return [id, structuredClone(entry)];
    // A 304 cannot establish a first successful content snapshot.
    const { etag, lastModified, parserVersion, ...withoutCacheValidators } = entry;
    return [id, { ...withoutCacheValidators, freeAlertBaselinePending: true }];
  }));
  return { initialSourceIds, sourceState: prepared };
}

export function captureSourceBaselines({ initialSourceIds, sourceState, results, policies }) {
  const completed = new Map(results.filter((result) => ['ok', 'not-modified'].includes(result.status)).map((result) => [result.sourceId, result]));
  const nextSourceState = initialSourceIds.reduce((current, sourceId) => {
    const existing = current[sourceId]?.freeAlertBaseline;
    if (existing !== undefined) { validateSourceBaseline(existing); return current; }
    const result = completed.get(sourceId);
    if (result?.status !== 'ok') return current;
    const hashes = policies.filter((policy) => policy.sourceId === sourceId && !policy.isArchived && !policy.isDemo
      && isSafeOfficialUrl(policy.sourceUrl) && typeof policy.contentHash === 'string' && policy.contentHash.trim()).map((policy) => policy.contentHash);
    const baseline = validateSourceBaseline({ hashes: [...new Set(hashes)], capturedAt: result.completedAt });
    return { ...current, [sourceId]: { ...current[sourceId], freeAlertBaselinePending: false, freeAlertBaseline: baseline } };
  }, { ...sourceState });
  const sourceBaselines = initialSourceIds.filter((id) => completed.has(id) && nextSourceState[id]?.freeAlertBaseline)
    .map((sourceId) => ({ sourceId, ...validateSourceBaseline(nextSourceState[sourceId].freeAlertBaseline) }));
  return { sourceState: nextSourceState, sourceBaselines };
}

function mergeSourceBaselines(state, initialSourceIds, sourceBaselines) {
  const initialized = new Set(state.initializedSourceIds ?? []);
  const pending = sourceBaselines.filter((baseline) => {
    if (!isSourceId(baseline.sourceId) || !initialSourceIds.includes(baseline.sourceId)) throw new Error('来源基线状态无效');
    validateSourceBaseline(baseline);
    return !initialized.has(baseline.sourceId);
  });
  if (!pending.length) return state;
  return { ...state, hashes: [...new Set([...state.hashes, ...pending.flatMap((baseline) => baseline.hashes)])],
    initializedSourceIds: [...new Set([...initialized, ...pending.map((baseline) => baseline.sourceId)])] };
}

export function selectAlertPolicies(policies, scope = FREE_ALERT_SCOPE) {
  return policies.filter((policy) => scope.regionIds.includes(policy.regionId)
    && scope.policyTypes.includes(policy.policyType ?? '教师招聘')
    && scope.categories.includes(policy.category ?? '招聘公告'));
}

export async function deliverPolicyAlerts({ policies, scope = FREE_ALERT_SCOPE, initialSourceIds = [], sourceBaselines = [], readState, writeState, sendAlert, logger = console, now = () => new Date().toISOString() }) {
  const scopedPolicies = selectAlertPolicies(policies, scope);
  let state;
  try { state = await readState(); if (state !== null) state = parseNotifiedState(JSON.stringify(state)); } catch {
    logger.warn('::warning::提醒去重状态损坏或无法读取，已停止本次发信并保留原状态；网页数据已更新。');
    return;
  }
  const isFirstRun = state === null;
  const priorState = state ?? { hashes: scopedPolicies.filter((policy) => !initialSourceIds.includes(policy.sourceId)).map((policy) => policy.contentHash), initializedAt: now() };
  state = mergeSourceBaselines(priorState, initialSourceIds, sourceBaselines);
  if (isFirstRun || state !== priorState) await writeState(state);
  if (isFirstRun) {
    logger.log('免费提醒已建立基线；首次运行不会发送历史公告。');
    return;
  }
  const pendingSources = initialSourceIds.filter((id) => !state.initializedSourceIds?.includes(id));
  const eligible = scopedPolicies.filter((policy) => !pendingSources.includes(policy.sourceId));
  const batch = findUnnotifiedPolicies(eligible, state.hashes).slice(0, 20);
  if (batch.length === 0) {
    logger.log('没有发现需要发送的新收录公告。');
    return;
  }
  let sent;
  try { sent = await sendAlert(batch); } catch (error) {
    logger.warn('::warning::邮件发送失败，网页数据仍已更新。错误代码：' + String(error?.code ?? 'unknown'));
    return;
  }
  if (!sent) {
    logger.log('发现新收录公告，但未配置完整邮箱 Secrets；数据网页已更新。');
    return;
  }
  await writeState({
    ...state,
    hashes: [...new Set([...state.hashes, ...batch.map((policy) => policy.contentHash)])],
    updatedAt: now()
  });
  logger.log('已发送新收录公告邮件：' + batch.length + ' 条。');
}

function publicationDate(policy) {
  if (!policy.publishedAt || !Number.isFinite(Date.parse(policy.publishedAt))) return '官网未标明';
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(policy.publishedAt));
}

function policyWarnings(policy) {
  return [
    String(policy.sourceUrl).startsWith('http:') ? '官方 HTTP 来源，传输未加密，请核对官网原文。' : '',
    policy.requiresTeacherVerification ? '综合招聘线索：教师岗位及编制性质需核对官方正文和岗位表。' : ''
  ].filter(Boolean);
}

export function createAlertEmail(policies, siteUrl = '') {
  const items = policies.map((policy) => {
    const title = escapeHtml(policy.title);
    const sourceUrl = escapeHtml(policy.sourceUrl);
    const sourceName = escapeHtml(policy.sourceName ?? '官方来源');
    const warnings = policyWarnings(policy).map(warning => '<br><strong>' + escapeHtml(warning) + '</strong>').join('');
    return '<li><strong>' + title + '</strong><br><span>' + sourceName + '</span><br><span>发布日期：' + publicationDate(policy) + '</span>' + warnings + '<br><a href="' + sourceUrl + '" rel="noreferrer">查看官方原文</a></li>';
  }).join('');
  const siteLine = siteUrl ? '\n手机网页：' + siteUrl : '';
  const text = policies.map((policy, index) => [
    String(index + 1) + '. ' + policy.title,
    '来源：' + (policy.sourceName ?? '官方来源'),
    '发布日期：' + publicationDate(policy),
    ...policyWarnings(policy),
    '原文：' + policy.sourceUrl
  ].join('\n')).join('\n\n') + siteLine + '\n\n新收录不等于新发布或尚在报名期，请以官方原文为准。';
  const siteHtml = siteUrl ? '<p><a href="' + escapeHtml(siteUrl) + '" rel="noreferrer">打开手机政策雷达</a></p>' : '';
  return {
    subject: '政策雷达：' + policies.length + ' 条新收录公告',
    text,
    html: '<h2>' + policies.length + ' 条新收录公告</h2><ol>' + items + '</ol>' + siteHtml + '<p>新收录不等于新发布或尚在报名期，请以官方原文为准。</p>'
  };
}

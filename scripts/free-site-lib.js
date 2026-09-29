const SAFE_PROTOCOLS = new Set(['http:', 'https:']);

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
      publishedAt: policy.publishedAt ?? null,
      fetchedAt: policy.fetchedAt ?? null,
      sourceName: String(policy.sourceName ?? '官方来源'),
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
    coverage: metadata.coverage ?? [],
    sourceState: store.sourceState ?? {}
  };
}

export function findUnnotifiedPolicies(policies, notifiedHashes) {
  const notified = new Set((notifiedHashes ?? []).map(String));
  return (policies ?? []).filter((policy) => policy.contentHash && !notified.has(String(policy.contentHash)));
}

export function parseNotifiedState(raw) {
  let parsed;
  try { parsed = JSON.parse(raw); } catch { throw new Error('提醒去重状态无效'); }
  if (!parsed || Array.isArray(parsed) || !Array.isArray(parsed.hashes)
    || !parsed.hashes.every((hash) => typeof hash === 'string' && hash.trim().length > 0)) {
    throw new Error('提醒去重状态无效');
  }
  return { ...parsed, hashes: [...parsed.hashes] };
}

export async function deliverPolicyAlerts({ policies, readState, writeState, sendAlert, logger = console, now = () => new Date().toISOString() }) {
  let state;
  try { state = await readState(); } catch {
    logger.warn('::warning::提醒去重状态损坏或无法读取，已停止本次发信并保留原状态；网页数据已更新。');
    return;
  }
  if (state === null) {
    await writeState({ hashes: policies.map((policy) => policy.contentHash), initializedAt: now() });
    logger.log('免费提醒已建立基线；首次运行不会发送历史公告。');
    return;
  }
  const batch = findUnnotifiedPolicies(policies, state.hashes).slice(0, 20);
  if (batch.length === 0) {
    logger.log('没有发现需要发送的新公告。');
    return;
  }
  let sent;
  try { sent = await sendAlert(batch); } catch (error) {
    logger.warn('::warning::邮件发送失败，网页数据仍已更新。错误代码：' + String(error?.code ?? 'unknown'));
    return;
  }
  if (!sent) {
    logger.log('发现新公告，但未配置完整邮箱 Secrets；数据网页已更新。');
    return;
  }
  await writeState({
    ...state,
    hashes: [...new Set([...state.hashes, ...batch.map((policy) => policy.contentHash)])],
    updatedAt: now()
  });
  logger.log('已发送新公告邮件：' + batch.length + ' 条。');
}

export function createAlertEmail(policies, siteUrl = '') {
  const items = policies.map((policy) => {
    const title = escapeHtml(policy.title);
    const sourceUrl = escapeHtml(policy.sourceUrl);
    const sourceName = escapeHtml(policy.sourceName ?? '官方来源');
    return '<li><strong>' + title + '</strong><br><span>' + sourceName + '</span><br><a href="' + sourceUrl + '" rel="noreferrer">查看官方原文</a></li>';
  }).join('');
  const siteLine = siteUrl ? '\n手机网页：' + siteUrl : '';
  const text = policies.map((policy, index) => [
    String(index + 1) + '. ' + policy.title,
    '来源：' + (policy.sourceName ?? '官方来源'),
    '原文：' + policy.sourceUrl
  ].join('\n')).join('\n\n') + siteLine + '\n\n请以官方原文为准。';
  const siteHtml = siteUrl ? '<p><a href="' + escapeHtml(siteUrl) + '" rel="noreferrer">打开手机政策雷达</a></p>' : '';
  return {
    subject: '政策雷达：发现 ' + policies.length + ' 条新公告',
    text,
    html: '<h2>发现 ' + policies.length + ' 条新公告</h2><ol>' + items + '</ol>' + siteHtml + '<p>请以官方原文为准。</p>'
  };
}

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

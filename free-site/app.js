const CHANGCHUN_REGION_IDS = new Set(['changchun','chaoyang-cc','nanguan-cc','kuancheng-cc','erdao-cc','lvyuan-cc','shuangyang-cc','jiutai-cc','jingyue-cc','lianhuashan-cc','dehui-cc','yushu-cc','nong-an-cc']);
const state = { payload: null, knownHashes: new Set(), initialized: false, installPrompt: null, notifiedThisSession: new Set() };
const element = (id) => document.getElementById(id);

function safeDate(value) {
  if (!value) return '官网未标明';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '官网未标明' : new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function create(tag, options = {}) {
  const node = document.createElement(tag);
  if (options.className) node.className = options.className;
  if (options.text) node.textContent = options.text;
  return node;
}

function regionName(regionId) {
  return state.payload?.regions?.find((region) => region.id === regionId)?.name ?? regionId;
}

function safeExternalUrl(value) {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : '#';
  } catch { return '#'; }
}

function readKnownHashes(policies) {
  try {
    const saved = JSON.parse(localStorage.getItem('policyRadarKnownHashes') ?? 'null');
    return { hashes: new Set(Array.isArray(saved) ? saved.map(String) : policies.map((policy) => policy.contentHash)), hadSavedState: Array.isArray(saved) };
  } catch {
    return { hashes: new Set(policies.map((policy) => policy.contentHash)), hadSavedState: false };
  }
}

function coverageNotice() {
  const coverage = state.payload?.coverage ?? [];
  const byRegion = new Map(coverage.map((item) => [item.regionId, item]));
  const changchun = [...CHANGCHUN_REGION_IDS].map((id) => byRegion.get(id));
  const connected = changchun.filter((item) => item?.status === 'active').length;
  const allConnected = connected === CHANGCHUN_REGION_IDS.size;
  const changchunNote = allConnected ? '长春市及各区县已有接入来源。'
    : connected > 0 ? '长春市及各区县仅部分来源已接入。'
      : changchun.every((item) => item?.status === 'pending') ? '长春市及各区县官方来源尚未接入。'
        : '长春市及各区县来源接入状态尚未全部核验。';
  const region = element('region-filter').value;
  const selectionConnected = region === 'all' || (region === 'changchun-all' ? allConnected : byRegion.get(region)?.status === 'active');
  const selectedNote = selectionConnected ? '' : (region === 'changchun-all' ? '所选长春地区' : regionName(region)) + '官方来源尚未完全接入或接入状态未核验。';
  const caution = !allConnected || !selectionConnected ? '当前无结果不代表没有公告，请同时关注官方渠道。' : '';
  const provinceNote = region !== 'all' && region !== 'jilin' ? '同时保留省级可能相关公告，是否适用请核对官方原文。' : '';
  const activeCount = [...byRegion.values()].filter((item) => item.status === 'active').length;
  const failedCount = Object.values(state.payload?.sourceState ?? {}).filter((item) => item?.lastError).length;
  const failureNote = failedCount > 0 ? failedCount + ' 个来源最近一次读取失败，已保留此前公告；最新情况请核对官网。' : '';
  return failureNote + activeCount + ' 个地区有已接入来源（不代表完整覆盖）。' + changchunNote + selectedNote + caution + provinceNote;
}

function matchesFilters(policy) {
  const region = element('region-filter').value;
  const type = element('type-filter').value;
  const category = element('category-filter').value;
  const keyword = element('keyword-filter').value.trim().toLowerCase();
  const regionMatch = region === 'all' || policy.regionId === region || policy.regionId === 'jilin' || (region === 'changchun-all' && CHANGCHUN_REGION_IDS.has(policy.regionId));
  return regionMatch && (type === 'all' || policy.policyType === type) && (category === 'all' || policy.category === category) && (!keyword || (policy.title + ' ' + policy.summary).toLowerCase().includes(keyword));
}

function policyCard(policy) {
  const isNew = !state.knownHashes.has(policy.contentHash);
  const card = create('article', { className: 'policy-card' + (isNew ? ' is-new' : '') });
  const titleRow = create('div');
  if (isNew) titleRow.append(create('span', { className: 'tag new-tag', text: '新' }));
  titleRow.append(create('h2', { text: policy.title }));
  card.append(titleRow, create('p', { text: policy.summary }));
  const meta = create('div', { className: 'meta' });
  [regionName(policy.regionId), policy.policyType, policy.category, '发布：' + safeDate(policy.publishedAt), policy.sourceName].forEach((text, index) => meta.append(create('span', { className: index < 3 ? 'tag' : '', text })));
  const link = create('a', { className: 'official-link', text: '查看官方原文 →' });
  link.href = safeExternalUrl(policy.sourceUrl);
  link.target = '_blank';
  link.rel = 'noreferrer';
  card.append(meta, link);
  return card;
}

function currentNewPolicies() {
  return (state.payload?.policies ?? []).filter((policy) => !state.knownHashes.has(policy.contentHash));
}

function render() {
  const policies = (state.payload?.policies ?? []).filter(matchesFilters);
  const list = element('policy-list');
  list.replaceChildren();
  policies.forEach((policy) => list.append(policyCard(policy)));
  if (!policies.length) list.append(create('div', { className: 'empty', text: '暂无匹配公告。当前无结果不代表没有公告，请同时关注官方渠道。免费版仅展示已接入的核验来源。' }));
  element('coverage-status').textContent = coverageNotice();
  element('result-count').textContent = String(policies.length);
  element('new-count').textContent = String(currentNewPolicies().length);
}

function fillSelect(selectId, values, valueKey, labelKey) {
  const select = element(selectId);
  const existing = new Set([...select.options].map((option) => option.value));
  values.forEach((item) => {
    const value = typeof item === 'string' ? item : item[valueKey];
    const label = typeof item === 'string' ? item : item[labelKey];
    if (!existing.has(value)) select.add(new Option(label, value));
  });
}

function notifyNewPolicies(policies) {
  if (Notification.permission !== 'granted') return;
  const fresh = policies.filter((policy) => !state.notifiedThisSession.has(policy.contentHash));
  if (!fresh.length) return;
  fresh.forEach((policy) => state.notifiedThisSession.add(policy.contentHash));
  new Notification('政策雷达发现新公告', { body: fresh.length === 1 ? fresh[0].title : '发现 ' + fresh.length + ' 条新公告，请打开网页查看。', icon: './icon.svg' });
}

async function loadData({ background = false } = {}) {
  const response = await fetch('./data/policies.json', { cache: 'no-store' });
  if (!response.ok) throw new Error('数据读取失败：' + response.status);
  const payload = await response.json();
  const previousHashes = new Set(state.payload?.policies?.map((policy) => policy.contentHash) ?? []);
  state.payload = payload;
  fillSelect('region-filter', [{ id: 'changchun-all', name: '长春市及各区县' }, ...(payload.regions ?? [])], 'id', 'name');
  fillSelect('type-filter', payload.policyTypes ?? [], '', '');
  fillSelect('category-filter', payload.categories ?? [], '', '');
  if (!state.initialized) {
    const knownState = readKnownHashes(payload.policies ?? []);
    state.knownHashes = knownState.hashes;
    if (!knownState.hadSavedState) localStorage.setItem('policyRadarKnownHashes', JSON.stringify([...state.knownHashes]));
    state.initialized = true;
    element('region-filter').value = 'all';
  }
  const newlyFetched = (payload.policies ?? []).filter((policy) => !previousHashes.has(policy.contentHash));
  if (background) notifyNewPolicies(newlyFetched);
  element('sync-status').textContent = payload.generatedAt ? '数据更新：' + safeDate(payload.generatedAt) : '等待首次自动更新';
  render();
}

function markAllRead() {
  state.knownHashes = new Set((state.payload?.policies ?? []).map((policy) => policy.contentHash));
  localStorage.setItem('policyRadarKnownHashes', JSON.stringify([...state.knownHashes]));
  render();
}

async function enableNotifications() {
  if (!('Notification' in window)) { element('notify-button').textContent = '当前浏览器不支持'; return; }
  const permission = await Notification.requestPermission();
  element('notify-button').textContent = permission === 'granted' ? '页面内通知已开启' : '通知未授权';
}

window.addEventListener('beforeinstallprompt', (event) => { event.preventDefault(); state.installPrompt = event; element('install-button').hidden = false; });
element('install-button').addEventListener('click', async () => { if (!state.installPrompt) return; await state.installPrompt.prompt(); state.installPrompt = null; element('install-button').hidden = true; });
['region-filter','type-filter','category-filter','keyword-filter'].forEach((id) => element(id).addEventListener(id === 'keyword-filter' ? 'input' : 'change', render));
element('mark-read-button').addEventListener('click', markAllRead);
element('notify-button').addEventListener('click', enableNotifications);
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
loadData().catch((error) => { element('sync-status').textContent = error.message; element('policy-list').append(create('div', { className: 'empty', text: '暂时无法读取数据，请稍后刷新。' })); });
setInterval(() => loadData({ background: true }).catch(() => {}), 5 * 60 * 1000);

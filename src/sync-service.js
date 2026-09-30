import { createContentHash, JILIN_REGIONS, REQUEST_CATEGORIES, POLICY_TYPES } from './policy-service.js';
import { parseJilinExamResponse } from './adapters/jilin-exam.js';

const MAX_BYTES = 1_500_000;
export const PARSER_VERSION = '2026-09-30.4';
const LINK_RE = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
const DETAIL_RE = /\.(?:s?html?|aspx|pdf)(?:$|[?#])/i;
const NAVIGATION_PATH_RE = /\/(?:index|default|home|list|channel)(?:[_-]\d+)?\.(?:s?html?|aspx)$/i;
const DATE_RE = /(20\d{2})[\/.-](\d{1,2})[\/.-](\d{1,2})/;
const CN_DATE_RE = /(20\d{2})年(\d{1,2})月(\d{1,2})日?/;
const COMPACT_DATE_RE = /(?:^|\D)(20\d{2})(\d{2})(\d{2})(?:\D|$)/;
const PATH_DATE_RE = /\/(20\d{2})(\d{2})(\d{2})\//;
const RETRY_DELAY_MS = 350;
// 教师考试雷达不收录普通中高考、学业水平考试等同站点的无关通知。
const IRRELEVANT_TITLE_RE = /中考|高考|学业水平考试|招生录取|中职招生|专业技术资格|职称|岗位评聘|评审|黄大年|最美教师|奖教金|比赛|职业技能|培训补贴/;
const GENERIC_RECRUITMENT_RE = /招聘|招录|选聘|公开考试/;
const TEACHER_SIGNAL_RE = /教师|老师|中小学|幼儿园|特岗|特设岗位|教师资格|教资|师范|教育系统|学校/;
const EXAM_EVENT_RE = /招聘|招录|选聘|特岗|特设岗位|教师资格|教资|报名|笔试|面试|资格审查|资格复审|资格审核|体检|成绩|分数|递补|拟聘|拟录用|录用|公费师范|师范生/;

export function isRelevantTeacherTitle(title) {
  const normalizedTitle = String(title ?? '');
  if (IRRELEVANT_TITLE_RE.test(normalizedTitle)) return false;
  if (!TEACHER_SIGNAL_RE.test(normalizedTitle)) return false;
  return EXAM_EVENT_RE.test(normalizedTitle);
}

function stripHtml(value) { return String(value).replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/\s+/g, ' ').trim(); }
function parseDate(text, href, context = '') {
  // 同条目旁的日期最接近实际发布日期；链接路径次之，标题中的年度通常只是招聘年度。
  for (const candidate of [context, href, text]) {
    const match = candidate.match(DATE_RE) ?? candidate.match(CN_DATE_RE) ?? candidate.match(PATH_DATE_RE) ?? candidate.match(COMPACT_DATE_RE);
    if (!match) continue;
    const [year, month, day] = match.slice(1).map(Number);
    if (month < 1 || month > 12 || day < 1 || day > 31) continue;
    const date = new Date(Date.UTC(year, month - 1, day, 1));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) continue;
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }
  return null;
}
function absoluteUrl(base, href) { return new URL(href, base).href; }
function isSameOfficialHost(sourceUrl, candidateUrl) {
  try {
    const source = new URL(sourceUrl);
    const candidate = new URL(candidateUrl);
    return candidate.origin === source.origin && !candidate.username && !candidate.password;
  } catch { return false; }
}
function matchesDetailPath(source, candidateUrl) {
  if (!source.detailPathPrefix) return true;
  const configured = source.detailPathPrefix;
  if (typeof configured !== 'string' || !/^\/(?!\/)/.test(configured) || /[?#%\\]/.test(configured)) return false;
  const prefix = `${configured.replace(/\/+$/, '')}/`;
  try {
    if (new URL(prefix, source.url).pathname !== prefix) return false;
    const decodedPath = decodeURIComponent(new URL(candidateUrl).pathname);
    if (/[%\\]/.test(decodedPath)) return false;
    const normalized = new URL(decodedPath, source.url);
    return isSameOfficialHost(source.url, normalized.href) && normalized.pathname.startsWith(prefix);
  } catch { return false; }
}
function classifyPolicyType(title, fallback = '教师招聘') {
  if (/特岗|特设岗位/.test(title)) return '特岗教师';
  if (/教师资格|教资|资格认定/.test(title)) return '教师资格考试';
  return POLICY_TYPES.includes(fallback) ? fallback : '教师招聘';
}
function classifyCategory(title, fallback = '招聘公告') {
  if (/教育政策/.test(fallback) && !/招聘|报名|笔试|面试|资格|体检|成绩|递补|拟聘|拟录用/.test(title)) return '教育政策';
  if (/报名/.test(title)) return '报名时间';
  // Classify the announced event before generic exam-format words in its title.
  if (/成绩|分数/.test(title)) return '成绩';
  if (/准考证/.test(title) && !/(?:笔试|面试|考试)(?:时间|日期|安排)/.test(title)) return '招聘公告';
  if (/笔试/.test(title)) return '笔试时间';
  if (/资格审查|资格复审|资格审核|资格认定|认定申请/.test(title)) return '资格审查';
  if (/面试/.test(title)) return '面试';
  if (/体检/.test(title)) return '体检';
  if (/递补/.test(title)) return '递补';
  if (/拟聘|拟录用/.test(title)) return '拟聘用名单';
  if (/教师资格|教资/.test(title)) return '资格审查';
  return REQUEST_CATEGORIES.includes(fallback) ? fallback : '招聘公告';
}

function escapeRegExp(value) { return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
const REGION_LEVEL_PRIORITY = { province: 1, city: 2, prefecture: 2, district: 3, county: 3, 'county-city': 3, management: 3 };

// Use the single region registry so province-level sources can be narrowed to the
// city/county named in an official title without maintaining another region list.
const REGION_TITLE_HINTS = [
  ...JILIN_REGIONS
    .slice()
    .sort((left, right) => (REGION_LEVEL_PRIORITY[right.level] ?? 0) - (REGION_LEVEL_PRIORITY[left.level] ?? 0) || right.name.length - left.name.length)
    .map((region) => [region.id, new RegExp(escapeRegExp(region.name)), REGION_LEVEL_PRIORITY[region.level] ?? 0]),
  ['jiutai-cc', /九台市/, 3],
  ['jingyue-cc', /净月高新技术产业开发区/, 3],
  ['lianhuashan-cc', /莲花山/, 3]
];

function inferRegionId(title, fallback) {
  const matches = REGION_TITLE_HINTS.filter(([, pattern]) => pattern.test(title));
  if (matches.length === 0) return fallback;
  const highestPriority = Math.max(...matches.map(([, , priority]) => priority));
  const mostSpecific = matches.filter(([, , priority]) => priority === highestPriority);
  return mostSpecific.length === 1 ? mostSpecific[0][0] : fallback;
}

export function policyMatchesSubscription(policy, subscription) {
  if (!subscription?.enabled) return false;
  const regionMatches = subscription.regionIds?.includes(policy.regionId);
  const typeMatches = !subscription.policyTypes?.length || subscription.policyTypes.includes(policy.policyType ?? '教师招聘');
  const categoryMatches = !subscription.categories?.length || subscription.categories.includes(policy.category);
  const keywordText = `${policy.title} ${policy.summary}`.toLowerCase();
  const keywordMatches = !subscription.keywords?.length || subscription.keywords.some((keyword) => keywordText.includes(String(keyword).toLowerCase()));
  return regionMatches && typeMatches && categoryMatches && keywordMatches;
}

function queueNotifications(store, policies) {
  const existing = new Set((store.notifications ?? []).map((notification) => `${notification.subscriptionId}:${notification.contentHash}`));
  const additions = [];
  for (const subscription of store.subscriptions ?? []) {
    for (const policy of policies) {
      if (!policyMatchesSubscription(policy, subscription)) continue;
      const key = `${subscription.id}:${policy.contentHash}`;
      if (existing.has(key)) continue;
      existing.add(key);
      additions.push({
        id: createContentHash(key).slice(0, 32), subscriptionId: subscription.id, policyId: policy.id,
        contentHash: policy.contentHash, title: policy.title, summary: policy.summary,
        sourceName: policy.sourceName, sourceUrl: policy.sourceUrl, createdAt: policy.fetchedAt,
        status: 'unread', channel: 'in-app'
      });
    }
  }
  store.notifications = [...(store.notifications ?? []), ...additions];
  return additions;
}

function adjacentDateContext(html, match) {
  const index = match.index ?? 0;
  const before = html.slice(Math.max(0, index - 400), index);
  const after = html.slice(index + match[0].length, index + match[0].length + 400);
  const boundaries = [...before.matchAll(/<\/?(?:li|tr|article)\b[^>]*>/gi)];
  const lastBoundary = boundaries.at(-1);
  const withinItem = lastBoundary && !lastBoundary[0].startsWith('</');
  const priorDate = withinItem ? before.slice(lastBoundary.index + lastBoundary[0].length).split(/<\/a>/i).pop() : '';
  const nextDate = after.split(/<a\b|<\/?(?:li|tr|article|div|p)\b/i)[0];
  return `${stripHtml(priorDate ?? '')} ${stripHtml(nextDate)}`;
}

function officialListEntries(html, source) {
  const entries = [];
  for (const match of html.matchAll(LINK_RE)) {
    const href = match[1]; const title = stripHtml(match[2]);
    if (!href || !title || title.length < 4 || title.length > 180 || !DETAIL_RE.test(href)) continue;
    let sourceUrl;
    try { sourceUrl = absoluteUrl(source.url, href); } catch { continue; }
    if (!isSameOfficialHost(source.url, sourceUrl) || !matchesDetailPath(source, sourceUrl) || NAVIGATION_PATH_RE.test(new URL(sourceUrl).pathname)) continue;
    entries.push({ title, sourceUrl, publishedAt: parseDate(title, sourceUrl, adjacentDateContext(html, match)) });
  }
  return entries;
}

function policiesFromEntries(entries, source, now) {
  const policies = [];
  const seen = new Set();
  for (const { title, sourceUrl, publishedAt, sourcePublishedAt } of entries) {
    if (!matchesDetailPath(source, sourceUrl)) continue;
    const titlePattern = source.titlePattern ? new RegExp(source.titlePattern) : /教师|招聘|特岗|资格|报名|笔试|面试|体检|成绩|递补|拟聘|教育/;
    const excludedTitlePattern = source.excludeTitlePattern ? new RegExp(source.excludeTitlePattern) : null;
    const teacherRelevant = isRelevantTeacherTitle(title);
    const requiresTeacherVerification = !teacherRelevant && source.includeGeneralRecruitment === true
      && /事业单位/.test(title) && GENERIC_RECRUITMENT_RE.test(title) && !IRRELEVANT_TITLE_RE.test(title);
    if (excludedTitlePattern?.test(title) || (!requiresTeacherVerification && (!titlePattern.test(title) || !teacherRelevant))) continue;
    const contentHash = createContentHash(`${sourceUrl}|${title}`);
    if (seen.has(contentHash)) continue;
    seen.add(contentHash);
    const id = createContentHash(`${source.id}|${sourceUrl}|${title}|${publishedAt}`).slice(0, 24);
    const summary = requiresTeacherVerification
      ? '综合事业单位招聘线索，是否包含教师岗位、编制性质和考试安排，需核对官方正文及岗位表。'
      : '来自官方来源列表页，详情请打开原文核对。';
    policies.push({ id, title, summary, ...(requiresTeacherVerification ? { requiresTeacherVerification: true } : {}), regionId: inferRegionId(title, source.regionIds[0]), policyType: classifyPolicyType(title, source.policyType), category: classifyCategory(title, source.category), publishedAt, ...(sourcePublishedAt !== undefined ? { sourcePublishedAt } : {}), fetchedAt: now.toISOString(), sourceId: source.id, sourceName: source.name, sourceUrl, contentHash, isDemo: false });
  }
  return policies;
}

export function parseOfficialList(html, source, now = new Date()) {
  return policiesFromEntries(officialListEntries(html, source), source, now);
}

function assertRecognizedList(html, entries) {
  const maintenance = /维护中|正在维护|网站维护|系统维护|暂停访问|服务暂停|under maintenance/i;
  const challenge = /验证码|访问验证|安全验证|人机验证|访问受限|访问被拒绝|拒绝访问|captcha|access denied|verify (?:you are|that you are)/i;
  // A help/about link is not evidence of a notice list. Recognize dated records or
  // notice-like titles, while checking explicit page status headings independently.
  const recognized = entries.some(({ title, publishedAt }) => publishedAt || /公告|通知|公示|通告|简章|办法|方案|细则|公报/.test(title) || isRelevantTeacherTitle(title));
  const statusHeadings = [...html.matchAll(/<(title|h[12])\b[^>]*>([\s\S]*?)<\/\1>/gi)]
    .map((match) => stripHtml(match[2].replace(LINK_RE, '')))
    .filter((heading) => !/公告|通知|公示|指南|说明|办法|方案|细则/.test(heading)).join(' ');
  if (recognized && !maintenance.test(statusHeadings) && !challenge.test(statusHeadings)) return;
  const visible = stripHtml(html);
  if (maintenance.test(visible)) {
    throw new Error('来源页面处于维护状态，未发现可识别的公开列表链接');
  }
  if (challenge.test(visible)) {
    throw new Error('来源页面需要验证或已被拦截，未发现可识别的公开列表链接');
  }
  throw new Error('来源页面未发现可识别的公开列表链接');
}

function responseHeader(response, name) {
  if (!response?.headers) return null;
  if (typeof response.headers.get === 'function') return response.headers.get(name);
  return response.headers[name] ?? response.headers[name.toLowerCase()] ?? null;
}

async function fetchWithRetry(fetchImpl, url, options) {
  let lastError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetchImpl(url, options);
      if (attempt === 0 && response.status >= 500 && response.status < 600) {
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
        continue;
      }
      return response;
    } catch (error) {
      lastError = error;
      if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    }
  }
  throw lastError ?? new Error('来源请求失败');
}

export async function fetchOfficialSource(source, fetchImpl = fetch, now = new Date(), sourceState = {}) {
  const sourceProtocol = new URL(source.url).protocol;
  if (sourceProtocol === 'http:' && source.allowHttp !== true) throw new Error('HTTP 来源未明确获准，仅允许本地试验配置');
  const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const headers = { accept: source.parser === 'jilin-exam' ? 'application/json' : 'text/html,application/xhtml+xml', 'user-agent': source.userAgent };
    const cacheCompatible = sourceState.parserVersion === PARSER_VERSION;
    if (cacheCompatible && sourceState.etag) headers['if-none-match'] = String(sourceState.etag);
    if (cacheCompatible && sourceState.lastModified) headers['if-modified-since'] = String(sourceState.lastModified);
    const response = await fetchWithRetry(fetchImpl, source.url, { signal: controller.signal, redirect: 'manual', headers });
    const etag = responseHeader(response, 'etag') ?? sourceState.etag ?? null;
    const lastModified = responseHeader(response, 'last-modified') ?? sourceState.lastModified ?? null;
    if (response.status === 304) return { notModified: true, policies: [], etag, lastModified, parserVersion: PARSER_VERSION };
    if (!response.ok || response.status >= 300 && response.status < 400) throw new Error(`来源响应 ${response.status}`);
    const length = Number(responseHeader(response, 'content-length') ?? 0);
    if (length > MAX_BYTES) throw new Error('来源响应过大');
    const html = await response.text();
    if (Buffer.byteLength(html, 'utf8') > MAX_BYTES) throw new Error('来源响应过大');
    const entries = source.parser === 'jilin-exam' ? parseJilinExamResponse(html, source) : officialListEntries(html, source);
    if (source.parser !== 'jilin-exam') assertRecognizedList(html, entries);
    return { notModified: false, policies: policiesFromEntries(entries, source, now), etag, lastModified, parserVersion: PARSER_VERSION };
  } finally { clearTimeout(timeout); }
}

export async function syncSources({ store, sources, fetchImpl = fetch, onEvent = () => {} }) {
  if (!store.sourceState || typeof store.sourceState !== 'object') store.sourceState = {};
  const results = [];
  for (const source of sources.filter((item) => item.enabled)) {
    const startedAt = new Date().toISOString();
    try {
      const fetched = await fetchOfficialSource(source, fetchImpl, new Date(), store.sourceState?.[source.id] ?? {});
      const policies = fetched.policies;
      if (fetched.notModified) {
        const result = {
          runId: createContentHash(`${source.id}|${startedAt}`).slice(0, 32), sourceId: source.id, status: 'not-modified', inserted: 0, notifications: 0,
          seen: store.sourceState?.[source.id]?.lastSeen ?? 0, startedAt, completedAt: new Date().toISOString(),
          etag: fetched.etag, lastModified: fetched.lastModified, parserVersion: fetched.parserVersion
        };
        store.sourceState[source.id] = {
          ...(store.sourceState[source.id] ?? {}), lastAttemptAt: result.completedAt,
          lastSuccessAt: result.completedAt, lastError: null, lastSeen: result.seen, lastInserted: 0,
          ...(result.etag ? { etag: result.etag } : {}),
          ...(result.lastModified ? { lastModified: result.lastModified } : {}),
          parserVersion: fetched.parserVersion
        };
        results.push(result); onEvent(result); continue;
      }
      const knownHashes = new Set(store.policies.map((policy) => policy.contentHash));
      const inserted = policies.filter((policy) => !knownHashes.has(policy.contentHash));
      const incomingByHash = new Map(policies.map((policy) => [policy.contentHash, policy]));
      const refreshed = store.policies.map((policy) => {
        const incoming = incomingByHash.get(policy.contentHash);
        return incoming ? { ...policy, publishedAt: incoming.publishedAt, ...(incoming.sourcePublishedAt !== undefined ? { sourcePublishedAt: incoming.sourcePublishedAt } : {}), ...(incoming.requiresTeacherVerification ? { requiresTeacherVerification: true, summary: incoming.summary } : {}), fetchedAt: incoming.fetchedAt, policyType: incoming.policyType, category: incoming.category } : policy;
      });
      store.policies = [...refreshed, ...inserted];
      const notifications = queueNotifications(store, inserted);
      const result = { runId: createContentHash(`${source.id}|${startedAt}`).slice(0, 32), sourceId: source.id, status: 'ok', inserted: inserted.length, notifications: notifications.length, seen: policies.length, startedAt, completedAt: new Date().toISOString(), etag: fetched.etag, lastModified: fetched.lastModified, parserVersion: fetched.parserVersion };
      store.sourceState[source.id] = {
        ...(store.sourceState[source.id] ?? {}), lastAttemptAt: result.completedAt,
        lastSuccessAt: result.completedAt, lastError: null, lastSeen: result.seen, lastInserted: result.inserted,
        ...(result.etag ? { etag: result.etag } : {}),
        ...(result.lastModified ? { lastModified: result.lastModified } : {}),
        parserVersion: fetched.parserVersion
      };
      results.push(result); onEvent(result);
    } catch (error) {
      const result = { runId: createContentHash(`${source.id}|${startedAt}`).slice(0, 32), sourceId: source.id, status: 'failed', error: error.message, parserVersion: PARSER_VERSION, startedAt, completedAt: new Date().toISOString() };
      store.sourceState = {
        ...store.sourceState,
        [source.id]: {
          ...(store.sourceState[source.id] ?? {}),
          lastAttemptAt: result.completedAt,
          lastError: result.error ?? '来源读取失败'
        }
      };
      results.push(result); onEvent(result);
    }
  }
  store.lastSync = { completedAt: new Date().toISOString(), results };
  return results;
}

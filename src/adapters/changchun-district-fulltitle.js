import { createHash } from 'node:crypto';

// These six lists are isolated from the previously released four-source adapter.
const SOURCES = Object.freeze({
  'nanguan-education-notices': { url: 'http://nanguan.changchun.gov.cn/ywdt/tzgg/', prefixes: ['/ywdt/tzgg/'], wrapperClass: 'left_list' },
  'kuancheng-education-notices': { url: 'http://kuancheng.changchun.gov.cn/sy/gsgg/tzgg/', prefixes: ['/sy/gsgg/tzgg/'], wrapperId: 'con_one_1', listClass: 'x_zcjd_li' },
  'erdao-education-notices': { url: 'http://erdao.changchun.gov.cn/zwgk/zdly/gsgg/', prefixes: ['/zwgk/zdly/gsgg/'], wrapperClass: 'xly_box_rcon' },
  'lvyuan-education-notices': { url: 'http://www.luyuan.gov.cn/ywdt/tzgg/', prefixes: ['/ywdt/tzgg/', '/zwdt/lyq/'], listClass: 'list_right_bar_zjdc' },
  'shuangyang-education-notices': { url: 'http://shuangyang.changchun.gov.cn/dzxx/tzgg/', prefixes: ['/dzxx/tzgg/'], wrapperClass: 'xly_box_rcon' },
  'yushu-education-notices': { url: 'http://yushu.changchun.gov.cn/xxgk/qwfb/gsgg/', prefixes: ['/xxgk/qwfb/gsgg/'], wrapperClass: 'right_box', listClass: 'x_zcjd_li' }
});
export const DISTRICT_FULLTITLE_CACHE_VERSION = '2026-10-01.1';
const SAFE_ERROR = '长春区县公告完整标题未全部核验，本轮未更新该来源。';
const MAX_BYTES = 1_500_000;
const MAX_ENTRIES = 100;
const MAX_REQUESTS = 16;
const DETAIL_TIMEOUT_MS = 15_000;
const TOTAL_TIMEOUT_MS = 45_000;
const TAG_RE = /<\/?([a-z][a-z\d]*)\b(?:[^"'<>]|"[^"]*"|'[^']*')*>/gi;
const RAW_TEXT_TAGS = new Set(['script', 'style', 'textarea', 'xmp', 'iframe', 'noembed', 'noscript', 'title']);
const BLOCKED_TAGS = new Set(['script', 'style', 'template', 'noscript', 'nav', 'aside', 'textarea', 'xmp', 'iframe', 'noembed', 'plaintext']);
const ENTITIES = Object.freeze({ nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: String.fromCharCode(39), hellip: '…', middot: '·', ndash: '–', mdash: '—' });
const unavailable = () => new Error(SAFE_ERROR);

function configurationFor(source) {
  const configuration = source && Object.hasOwn(SOURCES, source.id) ? SOURCES[source.id] : null;
  if (!configuration || source.url !== configuration.url) throw unavailable();
  return configuration;
}

function decodeEntities(value) {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (original, entity) => {
    const key = entity.toLowerCase();
    if (key[0] !== '#') return Object.hasOwn(ENTITIES, key) ? ENTITIES[key] : original;
    const point = key[1] === 'x' ? Number.parseInt(key.slice(2), 16) : Number(key.slice(1));
    return point > 0 && point <= 0x10ffff && !(point >= 0xd800 && point <= 0xdfff) ? String.fromCodePoint(point) : original;
  });
}

function attribute(tag, name) {
  const attributes = tag.replace(/^<\/?[^\s>]+/, '').replace(/\/?>$/, '');
  const pattern = /([^\s=/'"<>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  const matches = [...attributes.matchAll(pattern)].filter((match) => match[1].toLowerCase() === name);
  if (matches.length !== 1) return null;
  return decodeEntities(matches[0][2] ?? matches[0][3] ?? matches[0][4] ?? '');
}

const hasClass = (tag, name) => (attribute(tag, 'class') ?? '').split(/\s+/).includes(name);
const plainText = (value) => decodeEntities(value.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const normalizeTitle = (value) => value.replace(/^[\s＞>]+/, '').replace(/\s+/g, ' ').trim();
const isTruncated = (value) => /(?:\.{3}|…)+$/.test(value);
const validTitle = (value) => typeof value === 'string' && value.length >= 4 && value.length <= 180 && !/[<>\u0000-\u001f\u007f]/.test(value);
const completeTitle = (value) => validTitle(value) && !isTruncated(value);
const titleFingerprint = (value) => createHash('sha256').update(value).digest('hex');

function* htmlTokens(html) {
  const pattern = new RegExp(TAG_RE);
  let match;
  while ((match = pattern.exec(html))) {
    yield match;
    const tag = match[1].toLowerCase();
    if (match[0].startsWith('</')) continue;
    if (tag === 'plaintext') return;
    if (!RAW_TEXT_TAGS.has(tag)) continue;
    const ending = new RegExp(`<\\/(${tag})\\b(?:[^"'<>]|"[^"]*"|'[^']*')*>`, 'gi');
    ending.lastIndex = pattern.lastIndex;
    const closing = ending.exec(html);
    if (!closing) return;
    yield closing;
    pattern.lastIndex = closing.index + closing[0].length;
  }
}

function cleanHtml(html) {
  if (typeof html !== 'string' || Buffer.byteLength(html, 'utf8') > MAX_BYTES) throw unavailable();
  const input = html.replace(/<!--[\s\S]*?(?:-->|$)/g, '');
  let blocked = [];
  let cursor = 0;
  let parts = [];
  for (const match of htmlTokens(input)) {
    const tag = match[1].toLowerCase();
    if (!BLOCKED_TAGS.has(tag)) continue;
    if (!match[0].startsWith('</')) {
      if (!blocked.length) parts = [...parts, input.slice(cursor, match.index)];
      blocked = [...blocked, tag];
    } else if (blocked.at(-1) === tag) {
      blocked = blocked.slice(0, -1);
      if (!blocked.length) cursor = match.index + match[0].length;
    }
  }
  return [...parts, blocked.length ? '' : input.slice(cursor)].join('');
}

function assertAvailable(html) {
  const headings = [...html.matchAll(/<(title|h[1-3])\b[^>]*>([\s\S]*?)<\/\1>/gi)].map((match) => plainText(match[2])).join(' ');
  if (/系统维护|网站维护|维护中|正在维护|暂停访问|服务暂停|人机验证|验证码|访问受限|访问被拒绝|拒绝访问|captcha|access denied|under maintenance/i.test(headings)) throw unavailable();
}

// Consume all tags, including quoted attributes, before matching target elements.
function* elements(html, tag, matches = () => true) {
  let depth = 0;
  let start = null;
  let opening = '';
  for (const match of htmlTokens(html)) {
    if (match[1].toLowerCase() !== tag) continue;
    if (/^<\//.test(match[0])) {
      if (start === null) continue;
      depth -= 1;
      if (depth === 0) { yield { opening, content: html.slice(start, match.index) }; start = null; }
    } else if (start !== null) { depth += 1; }
    else if (matches(match[0])) { depth = 1; start = match.index + match[0].length; opening = match[0]; }
  }
  if (start !== null) throw unavailable();
}

function mainList(html, configuration) {
  const wrappers = configuration.wrapperId || configuration.wrapperClass
    ? [...elements(html, 'div', (tag) => configuration.wrapperId ? attribute(tag, 'id') === configuration.wrapperId : hasClass(tag, configuration.wrapperClass))]
    : [{ content: html }];
  if (wrappers.length !== 1) throw unavailable();
  const lists = [...elements(wrappers[0].content, 'ul', (tag) => !configuration.listClass || hasClass(tag, configuration.listClass))];
  if (lists.length !== 1) throw unavailable();
  return lists[0].content;
}

function articleUrl(raw, configuration) {
  if (!raw || /[%\\\s?#&\u0000-\u001f\u007f]/.test(raw) || raw.startsWith('//')) return null;
  const origin = new URL(configuration.url).origin;
  if (/^[a-z][a-z\d+.-]*:/i.test(raw) && !raw.startsWith(`${origin}/`)) return null;
  try {
    const url = new URL(raw, configuration.url);
    if (url.origin !== origin || url.username || url.password || url.port) return null;
    const allowed = configuration.prefixes.some((prefix) => url.pathname.startsWith(prefix) && /^20\d{4}\/t20\d{6}_\d+\.html$/.test(url.pathname.slice(prefix.length)));
    return allowed ? url.href : null;
  } catch { return null; }
}

function publicationDate(row) {
  const withoutAnchors = row.replace(/<a\b[^>]*>[\s\S]*?<\/a>/gi, '');
  const span = [...elements(withoutAnchors, 'span')][0];
  const value = span ? plainText(span.content) : '';
  const normalized = value.startsWith('[') && value.endsWith(']') ? value.slice(1, -1) : value;
  const match = normalized.match(/^(20\d{2})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? normalized : null;
}

function candidateFromRow(row, configuration) {
  if (/<(?:ul|ol)\b/i.test(row)) throw unavailable();
  const anchors = [...htmlTokens(row)].filter((match) => match[1].toLowerCase() === 'a' && !match[0].startsWith('</'));
  if (!anchors.length) return [];
  const targets = anchors.map((match) => articleUrl(attribute(match[0], 'href'), configuration));
  if (targets.some((target) => !target) || new Set(targets).size !== 1) return [];
  const first = [...elements(row, 'a')][0];
  if (!first) return [];
  const visible = normalizeTitle(plainText(first.content));
  const attributes = anchors.map((match) => normalizeTitle(attribute(match[0], 'title') ?? ''));
  const listTitle = attributes.find(completeTitle) ?? visible;
  if (!validTitle(listTitle)) throw unavailable();
  return [{ listTitle, sourceUrl: targets[0], publishedAt: publicationDate(row), needsFullTitle: isTruncated(listTitle) }];
}

export function parseChangchunDistrictFulltitleList(html, source) {
  const configuration = configurationFor(source);
  const clean = cleanHtml(html);
  assertAvailable(clean);
  const candidates = [...elements(mainList(clean, configuration), 'li')].flatMap(({ content }) => candidateFromRow(content, configuration));
  if (candidates.some((candidate) => candidates.some((item) => item.sourceUrl === candidate.sourceUrl
    && (item.listTitle !== candidate.listTitle || item.publishedAt !== candidate.publishedAt)))) throw unavailable();
  const unique = candidates.filter((candidate, index) => candidates.findIndex((item) => item.sourceUrl === candidate.sourceUrl) === index);
  if (!unique.length || unique.length > MAX_ENTRIES) throw unavailable();
  return unique;
}

function matchesListTitle(title, listTitle) {
  const prefix = listTitle.replace(/(?:\.{3}|…)+$/, '').replace(/\s+/g, '');
  return prefix.length >= 2 && title.replace(/\s+/g, '').startsWith(prefix);
}

// All seven saved detail samples agree on these head selectors; never guess h1/h2.
export function extractChangchunDistrictDetailTitle(html, source, sourceUrl, listTitle) {
  const configuration = configurationFor(source);
  if (articleUrl(sourceUrl, configuration) !== sourceUrl) throw unavailable();
  const clean = cleanHtml(html);
  assertAvailable(clean);
  const heads = [...elements(clean, 'head')];
  if (heads.length !== 1) throw unavailable();
  const metas = [...htmlTokens(heads[0].content)].filter((match) => match[1].toLowerCase() === 'meta' && attribute(match[0], 'name') === 'ArticleTitle');
  const titles = [...new Set(metas.map((match) => normalizeTitle(attribute(match[0], 'content') ?? '')))];
  const pageTitles = [...elements(heads[0].content, 'title')].map(({ content }) => normalizeTitle(decodeEntities(content)));
  if (titles.length !== 1 || pageTitles.length !== 1 || titles[0] !== pageTitles[0] || !completeTitle(titles[0]) || !matchesListTitle(titles[0], listTitle)) throw unavailable();
  return titles[0];
}

function validTimestamp(value) {
  if (typeof value !== 'string') return false;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString() === value;
}

function validatedCache(cache, configuration) {
  if (cache?.version !== DISTRICT_FULLTITLE_CACHE_VERSION || !cache.entries || typeof cache.entries !== 'object' || Array.isArray(cache.entries)) return {};
  const valid = Object.entries(cache.entries).filter(([url, entry]) => articleUrl(url, configuration) === url
    && entry && completeTitle(entry.title) && normalizeTitle(entry.title) === entry.title
    && /^[a-f0-9]{64}$/.test(entry.listTitleFingerprint) && validTimestamp(entry.verifiedAt)).slice(0, MAX_ENTRIES);
  return Object.fromEntries(valid.map(([url, entry]) => [url, { title: entry.title, listTitleFingerprint: entry.listTitleFingerprint, verifiedAt: entry.verifiedAt }]));
}

function currentCache(candidates, previous) {
  return Object.fromEntries(candidates.filter((candidate) => candidate.needsFullTitle
    && previous[candidate.sourceUrl]?.listTitleFingerprint === titleFingerprint(candidate.listTitle)
    && matchesListTitle(previous[candidate.sourceUrl].title, candidate.listTitle))
    .map((candidate) => [candidate.sourceUrl, previous[candidate.sourceUrl]]));
}

const header = (response, name) => typeof response.headers?.get === 'function' ? response.headers.get(name) : response.headers?.[name];

async function boundedBody(response, signal) {
  if (Number(header(response, 'content-length')) > MAX_BYTES) throw unavailable();
  if (!response.body?.getReader) {
    const text = await response.text();
    if (typeof text !== 'string' || Buffer.byteLength(text, 'utf8') > MAX_BYTES || signal.aborted) throw unavailable();
    return text;
  }
  const reader = response.body.getReader();
  let chunks = [];
  let size = 0;
  try {
    for (;;) {
      if (signal.aborted) throw unavailable();
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > MAX_BYTES) throw unavailable();
      chunks = [...chunks, part.value];
    }
    return Buffer.concat(chunks).toString('utf8');
  } finally { reader.releaseLock(); }
}

async function detailHtml(url, fetchImpl, totalSignal) {
  if (totalSignal.aborted) throw unavailable();
  const controller = new AbortController();
  const relayAbort = () => controller.abort();
  const timer = setTimeout(relayAbort, DETAIL_TIMEOUT_MS);
  totalSignal.addEventListener('abort', relayAbort, { once: true });
  let rejectOnAbort;
  const aborted = new Promise((_, reject) => { rejectOnAbort = () => reject(unavailable()); controller.signal.addEventListener('abort', rejectOnAbort, { once: true }); });
  const read = async () => {
    const response = await fetchImpl(url, { method: 'GET', redirect: 'manual', credentials: 'omit', signal: controller.signal, headers: { accept: 'text/html,application/xhtml+xml', 'user-agent': 'PolicyRadar/0.2 (public-title-verification)' } });
    if (controller.signal.aborted || !response.ok || response.status < 200 || response.status >= 300 || response.redirected || response.url && response.url !== url) throw unavailable();
    const contentType = header(response, 'content-type');
    if (contentType && !/^(?:text\/html|application\/xhtml\+xml)(?:;|$)/i.test(contentType)) throw unavailable();
    return boundedBody(response, controller.signal);
  };
  try { return await Promise.race([read(), aborted]); }
  catch { controller.abort(); throw unavailable(); }
  finally { clearTimeout(timer); totalSignal.removeEventListener('abort', relayAbort); controller.signal.removeEventListener('abort', rejectOnAbort); }
}

function resultFor(entries, cacheEntries, incomplete) {
  return { entries: incomplete ? [] : entries, detailTitleCache: { version: DISTRICT_FULLTITLE_CACHE_VERSION, entries: cacheEntries }, incomplete, ...(incomplete ? { error: SAFE_ERROR } : {}) };
}

export async function resolveChangchunDistrictTitles(html, source, { cache = {}, fetchImpl = fetch, now = new Date() } = {}) {
  let previous = {};
  let candidates;
  let verifiedAt;
  try {
    const configuration = configurationFor(source);
    previous = validatedCache(cache, configuration);
    candidates = parseChangchunDistrictFulltitleList(html, source);
    verifiedAt = now.toISOString();
  } catch { return resultFor([], previous, true); }
  let cacheEntries = currentCache(candidates, previous);
  let entries = [];
  let requests = 0;
  let incomplete = false;
  const total = new AbortController();
  const timer = setTimeout(() => total.abort(), TOTAL_TIMEOUT_MS);
  try {
    for (const candidate of candidates) {
      let title = candidate.listTitle;
      if (candidate.needsFullTitle) {
        const cached = cacheEntries[candidate.sourceUrl];
        if (cached) title = cached.title;
        else if (requests >= MAX_REQUESTS || total.signal.aborted) { incomplete = true; continue; }
        else {
          requests += 1;
          try {
            const document = await detailHtml(candidate.sourceUrl, fetchImpl, total.signal);
            title = extractChangchunDistrictDetailTitle(document, source, candidate.sourceUrl, candidate.listTitle);
            cacheEntries = { ...cacheEntries, [candidate.sourceUrl]: { title, listTitleFingerprint: titleFingerprint(candidate.listTitle), verifiedAt } };
          } catch { incomplete = true; continue; }
        }
      }
      entries = [...entries, { title, sourceUrl: candidate.sourceUrl, publishedAt: candidate.publishedAt }];
    }
    return resultFor(entries, cacheEntries, incomplete);
  } finally { clearTimeout(timer); }
}

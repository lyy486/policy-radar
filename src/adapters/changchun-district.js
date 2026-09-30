// Only these four independently verified static district lists are supported.
const SOURCES = Object.freeze({
  'chaoyang-education-notices': { url: 'http://chaoyang.changchun.gov.cn/zwdt/tzgg/', prefix: '/zwdt/tzgg/', wrapperId: 'con_one_1', listClass: 'x_zcjd_li', dateTag: 'span' },
  'dehui-education-notices': { url: 'http://dehui.changchun.gov.cn/ywdt/tzgg/rsxx/', prefix: '/ywdt/tzgg/', wrapperClass: 'news_list', dateTag: 'span' },
  'jiutai-education-notices': { url: 'http://jiutai.changchun.gov.cn/dzxx/tzgg/', prefix: '/dzxx/tzgg/', wrapperClass: 'xyh_listul', dateTag: 'span' },
  'lianhuashan-education-notices': { url: 'http://lianhuashan.changchun.gov.cn/xwxx/tzgg/', prefix: '/xwxx/tzgg/', listClass: 'news_list', dateTag: 'i' }
});
const LIST_ERROR = '长春区县栏目未返回可识别的主列表，可能正在维护、需要验证或页面结构已变化';
const ENTITIES = Object.freeze({ nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: String.fromCharCode(39), hellip: '…', middot: '·', ndash: '–', mdash: '—' });

function decodeEntities(value) {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (original, entity) => {
    const key = entity.toLowerCase();
    if (key[0] !== '#') return ENTITIES[key] ?? original;
    const point = key[1] === 'x' ? Number.parseInt(key.slice(2), 16) : Number(key.slice(1));
    return point > 0 && point <= 0x10ffff && !(point >= 0xd800 && point <= 0xdfff) ? String.fromCodePoint(point) : original;
  });
}

function attribute(tag, name) {
  const match = tag.match(new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i'));
  return match ? decodeEntities(match[1] ?? match[2]) : null;
}

function hasClass(tag, name) {
  return (attribute(tag, 'class') ?? '').split(/\s+/).includes(name);
}

function plainText(value) {
  return decodeEntities(value.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

// Track complete boundaries, never borrowing a date from the following item.
function* elements(html, tag, matches = () => true) {
  const pattern = /<\/?([a-z][a-z\d]*)\b(?:[^"'<>]|"[^"]*"|'[^']*')*>/gi;
  let depth = 0;
  let start = null;
  let opening = '';
  for (const match of html.matchAll(pattern)) {
    if (match[1].toLowerCase() !== tag) continue;
    if (/^<\//.test(match[0])) {
      if (start === null) continue;
      depth -= 1;
      if (depth === 0) {
        yield { opening, content: html.slice(start, match.index) };
        start = null;
      }
    } else if (start !== null) {
      depth += 1;
    } else if (matches(match[0])) {
      depth = 1;
      start = match.index + match[0].length;
      opening = match[0];
    }
  }
  if (start !== null) throw new Error(LIST_ERROR);
}

function mainList(html, configuration) {
  const wrappers = configuration.wrapperId || configuration.wrapperClass
    ? [...elements(html, 'div', (tag) => configuration.wrapperId
      ? attribute(tag, 'id') === configuration.wrapperId : hasClass(tag, configuration.wrapperClass))]
    : [{ content: html }];
  if (wrappers.length !== 1) throw new Error(LIST_ERROR);
  const lists = [...elements(wrappers[0].content, 'ul', (tag) => !configuration.listClass || hasClass(tag, configuration.listClass))];
  if (!lists.length || configuration.listClass && lists.length !== 1) throw new Error(LIST_ERROR);
  return lists[0].content;
}

function articleUrl(raw, configuration) {
  if (!raw || /[%\\\s?#\u0000-\u001f\u007f]/.test(raw)) return null;
  const origin = new URL(configuration.url).origin;
  // Reject disguised schemes, userinfo and explicit alternative authorities.
  if (/^[a-z][a-z\d+.-]*:/i.test(raw) && !raw.startsWith(`${origin}/`)) return null;
  if (raw.startsWith('//')) return null;
  try {
    const url = new URL(raw, configuration.url);
    if (url.origin !== origin || url.username || url.password || !url.pathname.startsWith(configuration.prefix)) return null;
    if (!/\/20\d{4}\/t20\d{6}_\d+\.html$/.test(url.pathname)) return null;
    return url.href;
  } catch { return null; }
}

function publicationDate(row, dateTag) {
  const withoutAnchors = row.replace(/<a\b[^>]*>[\s\S]*?<\/a>/gi, '');
  const element = [...elements(withoutAnchors, dateTag)][0];
  const value = element ? plainText(element.content) : '';
  const normalized = value.startsWith('[') && value.endsWith(']') ? value.slice(1, -1) : value;
  const match = normalized.match(/^(20\d{2})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${match[1]}-${match[2]}-${match[3]}`;
}

function completeTitle(anchor) {
  const candidates = [attribute(anchor.opening, 'title') ?? '', plainText(anchor.content)]
    .map((value) => value.replace(/^\s*(?:＞|>)+\s*/, '').replace(/\s+/g, ' ').trim());
  const truncated = (value) => /(?:\.{3}|…)+$/.test(value);
  const title = candidates.find((value) => value && !truncated(value));
  if (!title && candidates.some(truncated)) throw new Error('长春区县公告标题被截断，无法从本条目恢复完整标题');
  return title && title.length >= 4 && title.length <= 180 ? title : null;
}

function entriesFromRow(row, configuration) {
  if (/<(?:ul|ol)\b/i.test(row)) throw new Error(LIST_ERROR);
  return [...elements(row, 'a')].flatMap((anchor) => {
    const sourceUrl = articleUrl(attribute(anchor.opening, 'href'), configuration);
    if (!sourceUrl) return [];
    const title = completeTitle(anchor);
    return title ? [{ title, sourceUrl, publishedAt: publicationDate(row, configuration.dateTag) }] : [];
  });
}

export function parseChangchunDistrictList(html, source) {
  const configuration = source && Object.hasOwn(SOURCES, source.id) ? SOURCES[source.id] : null;
  if (!configuration || source.url !== configuration.url) throw new Error('长春区县栏目来源地址不符合已核验范围');
  if (typeof html !== 'string') throw new Error(LIST_ERROR);
  const clean = html.replace(/<!--[\s\S]*?-->|<(script|style|template|noscript|nav|aside)\b[^>]*>[\s\S]*?<\/\1>/gi, '');
  const headings = [...clean.matchAll(/<(title|h[1-3])\b[^>]*>([\s\S]*?)<\/\1>/gi)]
    .map((match) => plainText(match[2])).join(' ');
  if (/维护|暂停访问|服务暂停|人机验证|验证码|访问受限|访问被拒绝|access denied|captcha|under maintenance/i.test(headings)) throw new Error(LIST_ERROR);
  const entries = [...elements(mainList(clean, configuration), 'li')].flatMap(({ content }) => entriesFromRow(content, configuration));
  const unique = entries.filter((entry, index) => entries.findIndex((item) => item.sourceUrl === entry.sourceUrl) === index);
  if (!unique.length) throw new Error(LIST_ERROR);
  return unique;
}

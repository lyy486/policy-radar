// Verified public JSONP contract for the Nong'an education department, first page only.
// Query order and duplicate form parameters intentionally match the observed request.
const SOURCE_URL = 'http://infogate.changchun.gov.cn/govsearch/jsonp/gkml/zf_list.jsp?page=1&lb=58855&sword=&searchColumn=all&searchYear=all&pubURL=http%3A%2F%2Fzwgk.changchun.gov.cn%2Fna&SType=1&searchColumnYear=all&searchYear=all&pubURL=&SType=1&channelId=58855&callback=result';
const ARTICLE = /^http:\/\/zwgk\.changchun\.gov\.cn\/na\/xzfzcbm\/naxjyj\/zdlyjczwgk\/20\d{4}\/t20\d{6}_[1-9]\d*\.html$/;
const STATUS_TITLE = /维护中|正在维护|网站维护|系统维护|暂停访问|服务暂停|验证码|安全验证|人机验证|访问受限|访问被拒绝|拒绝访问|captcha|access denied|under maintenance/i;
const ENTITIES = Object.freeze({
  nbsp: ' ', ensp: ' ', emsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'",
  ndash: '–', mdash: '—', hellip: '…', ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’', middot: '·'
});
const RESPONSE_ERROR = '农安教育公开接口未返回有效的固定JSONP，可能维护、拦截或响应截断';
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

function decodeEntity(original, entity) {
  const name = entity.toLowerCase();
  if (!name.startsWith('#')) return Object.hasOwn(ENTITIES, name) ? ENTITIES[name] : original;
  const hex = name.startsWith('#x');
  const code = Number.parseInt(name.slice(hex ? 2 : 1), hex ? 16 : 10);
  if (code === 0 || code > 0x10FFFF || (code >= 0xD800 && code <= 0xDFFF)) return '\uFFFD';
  return String.fromCodePoint(code);
}

function plainTitle(value) {
  const decoded = value.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]+);/gi, decodeEntity);
  if (/<(?:script|style)\b/i.test(decoded)) return null;
  const title = decoded.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  if (/[<>]/.test(title)) return null;
  if (title.length < 4 || title.length > 180 || /\.\.\.|…|⋯/.test(title) || STATUS_TITLE.test(title)) return null;
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\uFFFD]/u.test(title)) return null;
  if (/&(?:#x?[a-z0-9]+|[a-z][a-z0-9]+);/i.test(title)) return null;
  return title;
}

function publicationDate(value) {
  const match = typeof value === 'string' ? value.match(/^(20\d{2})-(\d{2})-(\d{2})$/) : null;
  if (!match) return null;
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  // tip.dates is a calendar publication date; efectdate and URL dates mean something else.
  return value;
}

function validateEnvelope(payload) {
  if (!isObject(payload) || !Number.isSafeInteger(payload.num) || payload.num < 0
    || payload.nPage !== 1 || !Array.isArray(payload.data)) {
    throw new Error('农安教育公开接口结构或分页信息不符合已验证格式');
  }
  // The bound URL always requests page one; the official loader uses 16 rows per page.
  if (payload.data.length !== Math.min(payload.num, 16)) {
    throw new Error('农安教育公开接口分页记录数不一致，可能响应不完整');
  }
  return payload.data;
}

function entryFromRecord(record) {
  if (!isObject(record) || typeof record.title !== 'string' || typeof record.puburl !== 'string'
    || (record.tip != null && !isObject(record.tip))) {
    throw new Error('农安教育公开接口公告字段不符合已验证格式');
  }
  // Validate the raw absolute string before URL normalization can conceal escapes.
  if (!ARTICLE.test(record.puburl) || /[%\\\s]/.test(record.puburl)) return null;
  const title = plainTitle(record.title);
  if (!title) throw new Error('农安教育公开接口公告标题不完整或无法识别');
  return { title, sourceUrl: record.puburl, publishedAt: publicationDate(record.tip?.dates) };
}

export function parseNonganEducationResponse(text, source) {
  if (source?.id !== 'nong-an-education-notices' || source.url !== SOURCE_URL) {
    throw new Error('农安教育公开接口来源不符合已核验的精确范围');
  }
  if (typeof text !== 'string' || text.length > 1_500_000) throw new Error(RESPONSE_ERROR);
  const wrapper = text.trim().match(/^result\s*\(([\s\S]*)\)\s*;?$/);
  if (!wrapper) throw new Error(RESPONSE_ERROR);
  let payload;
  try { payload = JSON.parse(wrapper[1]); } catch { throw new Error(RESPONSE_ERROR); }
  const records = validateEnvelope(payload);
  const entries = records.map(entryFromRecord).filter(Boolean)
    .filter((entry, index, all) => all.findIndex((candidate) => candidate.sourceUrl === entry.sourceUrl) === index);
  if (records.length && !entries.length) throw new Error('农安教育公开接口未返回可识别的已核验范围内公告');
  return entries;
}

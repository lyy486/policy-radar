// This adapter supports only the two verified Changchun New Area talent lists.
const ORIGIN = 'https://rcjy.ccxq.gov.cn';
const SOURCES = new Set([ORIGIN + '/content/news/list/3/1.html', ORIGIN + '/content/news/list/4/1.html']);
const ARTICLE = /^(?:https:\/\/rcjy\.ccxq\.gov\.cn)?\/content\/news\/show\/[1-9]\d*\.html$/;
const LIST_ERROR = '新区人才栏目未返回可识别的主列表，可能正在维护或页面结构已变化';

function hasClass(tag, name) {
  const match = tag.match(/\sclass\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
  return (match?.[1] ?? match?.[2] ?? '').split(/\s+/).includes(name);
}

// Match complete div boundaries so one card never borrows the next card's date.
function* divContents(html, className) {
  let depth = 0;
  let start = null;
  for (const match of html.matchAll(/<\/?div\b[^>]*>/gi)) {
    if (/^<\//.test(match[0])) {
      if (start === null) continue;
      depth -= 1;
      if (depth === 0) {
        yield html.slice(start, match.index);
        start = null;
      }
    } else if (start !== null) {
      depth += 1;
    } else if (hasClass(match[0], className)) {
      depth = 1;
      start = match.index + match[0].length;
    }
  }
  if (start !== null) throw new Error(LIST_ERROR);
}

function plainText(value) {
  const entities = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#160': ' ' };
  return value.replace(/<[^>]+>/g, ' ')
    .replace(/&(nbsp|amp|lt|gt|quot|apos|#160);/gi, (_all, entity) => entities[entity.toLowerCase()])
    .replace(/\s+/g, ' ').trim();
}

function publicationDate(card) {
  const span = [...card.matchAll(/<span\b([^>]*)>([\s\S]*?)<\/span>/gi)]
    .find((match) => hasClass(match[1], 'time1'));
  const value = span ? plainText(span[2]) : '';
  const match = value.match(/^(20\d{2})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  // The source gives a calendar date, not a publication time or fetch timestamp.
  return value;
}

function entryFromCard(card, source) {
  const titleBlock = [...divContents(card, 't')][0] ?? '';
  const anchor = titleBlock.match(/<a\b([^>]*)>([\s\S]*?)<\/a>/i);
  if (!anchor) return [];
  const href = anchor[1].match(/\shref\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
  const path = href?.[1] ?? href?.[2] ?? '';
  const title = plainText(anchor[2]);
  if (!ARTICLE.test(path) || /\s/.test(path) || title.length < 4 || title.length > 180) return [];
  return [{ title, sourceUrl: new URL(path, source.url).href, publishedAt: publicationDate(card) }];
}

export function parseChangchunTalentList(html, source) {
  if (!SOURCES.has(source?.url)) throw new Error('新区人才栏目来源地址不符合已核验范围');
  if (typeof html !== 'string') throw new Error(LIST_ERROR);
  const clean = html.replace(/<!--[\s\S]*?-->|<script\b[^>]*>[\s\S]*?<\/script>|<style\b[^>]*>[\s\S]*?<\/style>/gi, '');
  const headings = [...clean.matchAll(/<(?:title|h[1-3])\b[^>]*>([\s\S]*?)<\/(?:title|h[1-3])>/gi)]
    .map((match) => plainText(match[1])).join(' ');
  if (/维护|暂停访问|服务暂停|人机验证|验证码|访问受限|access denied|captcha|under maintenance/i.test(headings)) throw new Error(LIST_ERROR);
  const entries = [...divContents(clean, 'listb')].flatMap((card) => entryFromCard(card, source));
  if (!entries.length) throw new Error(LIST_ERROR);
  return entries;
}

// This is the verified public first-page list, not a general Jingyue crawler.
const SOURCE_URL = 'http://jingyue.changchun.gov.cn/zw/tzgg/';
const CROSS_ARTICLE = /^http:\/\/zwgk\.changchun\.gov\.cn\/jy\/kfqzcbm\/jygxjscykfqkjcxwyh\/zdlyjczwgk\/20\d{4}\/t20\d{6}_[1-9]\d*\.html$/;
const LOCAL_ARTICLE = /^(?:http:\/\/jingyue\.changchun\.gov\.cn\/zw\/tzgg\/|\/zw\/tzgg\/|\.\/)20\d{4}\/t20\d{6}_[1-9]\d*\.html$/;
const LIST_ERROR = '净月通知栏目未返回完整可识别的主列表，可能维护、拦截或页面结构变化';
const TITLE_ERROR = '净月通知栏目公告标题不完整或无法识别';
const STATUS = /维护中|正在维护|网站维护|系统维护|暂停访问|服务暂停|验证码|安全验证|人机验证|访问受限|访问被拒绝|拒绝访问|captcha|access denied|under maintenance/i;
const ENTITIES = Object.freeze({
  nbsp: ' ', ensp: ' ', emsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'",
  ndash: '–', mdash: '—', hellip: '…', ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’', middot: '·'
});
const RAW_TEXT = new Set(['script', 'style', 'textarea', 'xmp', 'iframe', 'noembed', 'title']);
const EXCLUDED = new Set(['script', 'style', 'textarea', 'xmp', 'iframe', 'noembed', 'nav', 'aside', 'template', 'noscript']);

function readTag(html, index) {
  const header = html.slice(index).match(/^<(\/?)([a-z][\w:-]*)(?=[\s/>])/i);
  if (!header && !/^<[!?]/.test(html.slice(index, index + 2))) return null;
  let quote = null;
  for (let cursor = index + 1; cursor < html.length; cursor += 1) {
    const character = html[cursor];
    if (quote) { if (character === quote) quote = null; }
    else if (character === '"' || character === "'") quote = character;
    else if (character === '<') throw new Error(LIST_ERROR);
    else if (character === '>') {
      const raw = html.slice(index, cursor + 1);
      const closing = header?.[1] === '/';
      if (closing && !/^<\/[a-z][\w:-]*\s*>$/i.test(raw)) throw new Error(LIST_ERROR);
      return { raw, name: header?.[2].toLowerCase() ?? '#declaration', closing, index, end: cursor + 1 };
    }
  }
  throw new Error(LIST_ERROR);
}

// Consume EVERY complete tag, including quoted attributes, before selecting any tag name.
// Raw-text bodies and comments are atomic too; tag-looking attribute text is never markup.
function* htmlTokens(html) {
  let cursor = 0;
  while (cursor < html.length) {
    const index = html.indexOf('<', cursor);
    if (index === -1) return;
    if (html.startsWith('<!--', index)) {
      const end = html.indexOf('-->', index + 4);
      if (end === -1) throw new Error(LIST_ERROR);
      cursor = end + 3;
      yield { name: '#comment', index, end: cursor };
      continue;
    }
    const tag = readTag(html, index);
    if (!tag) { cursor = index + 1; continue; }
    if (tag.name === 'plaintext') throw new Error(LIST_ERROR);
    yield tag;
    cursor = tag.end;
    if (!tag.closing && RAW_TEXT.has(tag.name)) {
      const closingPattern = new RegExp('</' + tag.name + '\\s*>', 'gi');
      closingPattern.lastIndex = cursor;
      const closing = closingPattern.exec(html);
      if (!closing) throw new Error(LIST_ERROR);
      cursor = closing.index + closing[0].length;
      yield { raw: closing[0], name: tag.name, closing: true, index: closing.index, end: cursor };
    }
  }
}

function attribute(tag, name) {
  const matches = [...tag.matchAll(/\s([a-z][\w:-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>]+)))?/gi)]
    .filter((match) => match[1].toLowerCase() === name);
  if (matches.length > 1 || matches.some((match) => match[2] === undefined && match[3] === undefined)) throw new Error(LIST_ERROR);
  return matches.length ? matches[0][2] ?? matches[0][3] : null;
}

const hasClass = (tag, name) => (attribute(tag, 'class') ?? '').split(/\s+/).includes(name);

// Balance complete element boundaries so dates cannot cross into neighboring cards.
function* elementContents(html, name, className) {
  let depth = 0;
  let start = null;
  for (const tag of htmlTokens(html)) {
    if (tag.name !== name) continue;
    if (tag.closing) {
      if (start === null) continue;
      depth -= 1;
      if (depth === 0) {
        yield html.slice(start, tag.index);
        start = null;
      }
    } else if (start !== null) {
      if (!className || hasClass(tag.raw, className)) throw new Error(LIST_ERROR);
      depth += 1;
    } else if (!className || hasClass(tag.raw, className)) {
      if (/\/>$/.test(tag.raw)) throw new Error(LIST_ERROR);
      depth = 1;
      start = tag.end;
    }
  }
  if (start !== null) throw new Error(LIST_ERROR);
}

function removeExcluded(html) {
  let stack = [];
  let output = '';
  let cursor = 0;
  for (const tag of htmlTokens(html)) {
    if (tag.name === '#comment' && !stack.length) {
      output += html.slice(cursor, tag.index);
      cursor = tag.end;
    }
    if (!EXCLUDED.has(tag.name)) continue;
    if (!tag.closing) {
      if (!stack.length) output += html.slice(cursor, tag.index);
      stack = [...stack, tag.name];
    } else {
      if (stack.at(-1) !== tag.name) throw new Error(LIST_ERROR);
      stack = stack.slice(0, -1);
      if (!stack.length) cursor = tag.end;
    }
  }
  if (stack.length) throw new Error(LIST_ERROR);
  return output + html.slice(cursor);
}

function validatePageTitle(html) {
  const tags = [...htmlTokens(html)].filter((tag) => tag.name === 'title');
  if (!tags.length) return;
  if (tags.length !== 2 || tags[0].closing || !tags[1].closing) {
    throw new Error(LIST_ERROR);
  }
  const content = html.slice(tags[0].end, tags[1].index);
  if (/[<>]/.test(content)) throw new Error(LIST_ERROR);
}

function decodeEntity(original, entity) {
  const name = entity.toLowerCase();
  if (!name.startsWith('#')) return Object.hasOwn(ENTITIES, name) ? ENTITIES[name] : original;
  const hex = name.startsWith('#x');
  const code = Number.parseInt(name.slice(hex ? 2 : 1), hex ? 16 : 10);
  if (code === 0 || code > 0x10FFFF || (code >= 0xD800 && code <= 0xDFFF)) return '\uFFFD';
  return String.fromCodePoint(code);
}

const decodeText = (value) => value.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]+);/gi, decodeEntity)
  .replace(/\s+/g, ' ').trim();

function plainText(value) {
  let output = '';
  let cursor = 0;
  for (const tag of htmlTokens(value)) {
    output += value.slice(cursor, tag.index);
    cursor = tag.end;
  }
  return decodeText(output + value.slice(cursor));
}

function completeTitle(value, isMarkup = false) {
  const title = isMarkup ? plainText(value) : decodeText(value);
  if (title.length < 4 || title.length > 180 || /\.\.\.|…|⋯|[<>]/.test(title) || STATUS.test(title)
    || /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\uFFFD]/u.test(title)
    || /&(?:#x?[a-z0-9]+|[a-z][a-z0-9]+);/i.test(title)) throw new Error(TITLE_ERROR);
  return title;
}

function articleUrl(href) {
  // Verify raw strings first: URL normalization must not conceal escapes or traversal.
  if (!href || /[%\\\s]/.test(href) || (!CROSS_ARTICLE.test(href) && !LOCAL_ARTICLE.test(href))) return null;
  return new URL(href, SOURCE_URL).href;
}

function titleLink(heading) {
  const tags = [...htmlTokens(heading)].filter((tag) => tag.name === 'a');
  let depth = 0;
  let anchors = [];
  for (const tag of tags) {
    if (tag.closing) {
      if (depth === 0) throw new Error(LIST_ERROR);
      depth -= 1;
    } else {
      if ((anchors.length && depth === 0) || anchors.length === 2) throw new Error(LIST_ERROR);
      depth += 1;
      anchors = [...anchors, tag.raw];
    }
  }
  if (depth || !anchors.length || heading.slice(0, tags[0].index).trim()
    || heading.slice(tags.at(-1).end).trim()) throw new Error(LIST_ERROR);
  if (anchors.length === 2 && (heading.slice(tags[0].end, tags[1].index).trim()
    || heading.slice(tags[2].end, tags[3].index).trim())) throw new Error(LIST_ERROR);
  const hrefs = anchors.map((tag) => attribute(tag, 'href'));
  if (hrefs.some((href) => !href)) throw new Error(LIST_ERROR);
  const urls = hrefs.map(articleUrl);
  if (urls.every((url) => url === null)) return null;
  if (urls.some((url) => url !== urls[0])) throw new Error(LIST_ERROR);
  const titles = anchors.map((tag) => attribute(tag, 'title')).filter((title) => title !== null)
    .map((title) => completeTitle(title));
  if (titles.some((title) => title !== titles[0])) throw new Error(TITLE_ERROR);
  // The official list currently nests two identical hrefs. Never borrow another link's title.
  return { title: titles[0] ?? completeTitle(heading, true), sourceUrl: urls[0] };
}

function publicationDate(card) {
  const bottoms = [...elementContents(card, 'div', 'media-bottom')];
  if (bottoms.length !== 1) return null;
  const dates = [...elementContents(bottoms[0], 'i')]
    .map((value) => plainText(value).match(/^(20\d{2})年(\d{2})月(\d{2})日$/)).filter(Boolean);
  if (dates.length !== 1) return null;
  const [, yearText, monthText, dayText] = dates[0];
  const [year, month, day] = [yearText, monthText, dayText].map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return yearText + '-' + monthText + '-' + dayText;
}

function entryFromCard(card) {
  const headings = [...elementContents(card, 'h4', 'media-heading')];
  if (headings.length !== 1) throw new Error(LIST_ERROR);
  const link = titleLink(headings[0]);
  return link ? { ...link, publishedAt: publicationDate(card) } : null;
}

export function parseJingyueEducationList(html, source) {
  if (source?.id !== 'jingyue-education-notices' || source.url !== SOURCE_URL) {
    throw new Error('净月通知栏目来源不符合已核验的精确范围');
  }
  if (typeof html !== 'string' || html.length > 1_500_000) throw new Error(LIST_ERROR);
  const clean = removeExcluded(html);
  validatePageTitle(clean);
  const pageHeadings = ['title', 'h1', 'h2', 'h3'].flatMap((name) => [...elementContents(clean, name)])
    .map(plainText).join(' ');
  if (STATUS.test(pageHeadings)) throw new Error(LIST_ERROR);
  const lists = [...elementContents(clean, 'div', 'list-entry-page')];
  if (lists.length !== 1) throw new Error(LIST_ERROR);
  const entries = [...elementContents(lists[0], 'div', 'list-entry')].map(entryFromCard).filter(Boolean)
    .filter((entry, index, all) => all.findIndex((item) => item.sourceUrl === entry.sourceUrl) === index);
  if (!entries.length) throw new Error(LIST_ERROR);
  return entries;
}

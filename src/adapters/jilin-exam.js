// Only the public JSON contract verified for the Jilin exam institute is supported.
// New endpoint shapes or article paths must be verified before adding fallbacks.
const ARTICLE_PATH = /^\/(?:front\/content|site1\/xiangqingye)\/(\d+)\/?$/;
const LOCAL_TIME = /^(20\d{2})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/;

function parsePublicationTime(value) {
  const match = typeof value === 'string' ? value.match(LOCAL_TIME) : null;
  if (!match) return null;
  const [year, month, day, hour, minute, second] = match.slice(1).map(Number);
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59 || second > 59) return null;
  const local = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  if (local.getUTCFullYear() !== year || local.getUTCMonth() !== month - 1 || local.getUTCDate() !== day) return null;
  // API timestamps have no offset; this provincial source publishes in Asia/Shanghai.
  return new Date(local.getTime() - 8 * 60 * 60 * 1000).toISOString();
}

function verifiedArticleUrl(record, sourceUrl, channelId) {
  if (!Number.isSafeInteger(record.id) || record.id <= 0 || record.channelId !== channelId) return null;
  if (typeof record.url !== 'string' || !record.url) return null;
  try {
    const article = new URL(record.url);
    const path = article.pathname.match(ARTICLE_PATH);
    if (article.protocol !== 'https:' || article.origin !== sourceUrl.origin || article.username || article.password) return null;
    if (!path || Number(path[1]) !== record.id || article.search || article.hash) return null;
    return article.href;
  } catch { return null; }
}

function validateEnvelope(payload) {
  const data = payload?.data;
  if (payload?.code !== '00000 00000' || !data || !Array.isArray(data.records)) {
    throw new Error('教资接口响应状态或结构不符合已验证格式');
  }
  if (!Number.isSafeInteger(data.total) || data.total < 0 || !Number.isSafeInteger(data.current) || data.current < 1) {
    throw new Error('教资接口分页信息无效');
  }
  if (data.records.length > data.total || (data.total > 0 && data.records.length === 0)) {
    throw new Error('教资接口记录数与分页信息不一致');
  }
  return data.records;
}

export function parseJilinExamResponse(text, source) {
  const sourceUrl = new URL(source.url);
  const channelId = Number(sourceUrl.searchParams.get('channelIdStr'));
  if (sourceUrl.protocol !== 'https:' || sourceUrl.pathname !== '/server-front/front/content/page' || !Number.isSafeInteger(channelId) || channelId <= 0) {
    throw new Error('教资接口地址不符合已验证的公开接口格式');
  }
  let payload;
  try { payload = JSON.parse(text); } catch { throw new Error('教资接口未返回有效JSON，可能正在维护或被拦截'); }
  const records = validateEnvelope(payload);
  const entries = records.flatMap((record) => {
    if (!record || typeof record !== 'object' || typeof record.title !== 'string') {
      throw new Error('教资接口公告字段不符合已验证格式');
    }
    const title = record.title.replace(/\s+/g, ' ').trim();
    const sourceUrlValue = verifiedArticleUrl(record, sourceUrl, channelId);
    if (!sourceUrlValue || title.length < 4 || title.length > 180) return [];
    const rawTime = record.publishTime ?? record.publishTimeStr;
    const publishedAt = parsePublicationTime(rawTime);
    return [{ title, sourceUrl: sourceUrlValue, publishedAt, sourcePublishedAt: publishedAt ? rawTime : null }];
  });
  if (records.length && !entries.length) throw new Error('教资接口未返回可识别的同源公告');
  return entries;
}

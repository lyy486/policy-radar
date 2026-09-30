import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createContentHash } from '../src/policy-service.js';
import { DISTRICT_FULLTITLE_CACHE_VERSION, parseChangchunDistrictFulltitleList, extractChangchunDistrictDetailTitle, resolveChangchunDistrictTitles } from '../src/adapters/changchun-district-fulltitle.js';

const sources = Object.freeze({
  nanguan: Object.freeze({ id: 'nanguan-education-notices', url: 'http://nanguan.changchun.gov.cn/ywdt/tzgg/' }),
  kuancheng: Object.freeze({ id: 'kuancheng-education-notices', url: 'http://kuancheng.changchun.gov.cn/sy/gsgg/tzgg/' }),
  erdao: Object.freeze({ id: 'erdao-education-notices', url: 'http://erdao.changchun.gov.cn/zwgk/zdly/gsgg/' }),
  lvyuan: Object.freeze({ id: 'lvyuan-education-notices', url: 'http://www.luyuan.gov.cn/ywdt/tzgg/' }),
  shuangyang: Object.freeze({ id: 'shuangyang-education-notices', url: 'http://shuangyang.changchun.gov.cn/dzxx/tzgg/' }),
  yushu: Object.freeze({ id: 'yushu-education-notices', url: 'http://yushu.changchun.gov.cn/xxgk/qwfb/gsgg/' })
});
const source = sources.nanguan;
const href = './202609/t20260923_3514398.html';
const url = new URL(href, source.url).href;
const listTitle = '教师招聘第1批...';
const fullTitle = '教师招聘第1批拟聘用人员公示';
const recordedAt = new Date('2026-10-01T01:00:00.000Z');
const fingerprint = (value) => createHash('sha256').update(value).digest('hex');
const row = (title = listTitle, link = href, date = '2026-09-22') => `<li><a href="${link}">${title}</a>${date === null ? '' : `<span class="data">${date}</span>`}</li>`;
const wrap = (rows) => `<div class="left_list"><ul>${rows}</ul><a href="./index_1.html">下一页</a></div>`;
const detail = (title = fullTitle, duplicate = false) => `<html><head><meta name="ArticleTitle" content="${title}">${duplicate ? `<meta content="${title}" name="ArticleTitle">` : ''}<title>${title}</title></head><body><h1>标题外的普通导航</h1></body></html>`;
const response = (html = detail(), extra = {}) => ({ status: 200, ok: true, headers: new Headers({ 'content-type': 'text/html' }), text: async () => html, ...extra });
const noNetwork = async () => { throw new Error('unexpected real-network substitute'); };
const run = (rows = row(), options = {}) => resolveChangchunDistrictTitles(wrap(rows), source, { fetchImpl: noNetwork, now: recordedAt, ...options });
const cacheFor = (cacheUrl = url, title = fullTitle, text = listTitle) => ({ version: DISTRICT_FULLTITLE_CACHE_VERSION, entries: { [cacheUrl]: { title, listTitleFingerprint: fingerprint(text), verifiedAt: recordedAt.toISOString() } } });
const flush = () => new Promise((resolve) => setImmediate(resolve));

test('六个已核实主列表范围逐li解析，日期只取同行span', () => {
  const snippets = [
    ['nanguan', wrap(row('教师招聘公告'))],
    ['kuancheng', `<div id="con_one_1"><ul class="x_zcjd_li mar0"><li><span>[2026-09-22]</span><a href="${href}">＞＞ <a href="${href}">教师招聘公告</a></a></li></ul></div>`],
    ['erdao', `<div class="xly_box_rcon"><ul><li><span>2026-09-22</span><span>[公示公告]</span><a href="${href}">教师招聘公告</a></li></ul></div>`],
    ['lvyuan', `<ul class="list_right_bar_zjdc mar0">${row('教师招聘公告')}</ul>`],
    ['shuangyang', `<div class="xly_box_rcon"><ul><li><span>2026-09-22</span><span>[通知公告]</span><a href="${href}">教师招聘公告</a></li></ul></div>`],
    ['yushu', `<div class="right_box"><ul class="x_zcjd_li mar0"><li><span>[2026-09-22]</span><a href="${href}">＞＞教师招聘公告</a></li></ul></div>`]
  ];
  for (const [name, html] of snippets) {
    const entries = parseChangchunDistrictFulltitleList(html, sources[name]);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].listTitle, '教师招聘公告');
    assert.equal(entries[0].publishedAt, '2026-09-22');
    assert.equal(entries[0].needsFullTitle, false);
  }
});

test('完整可见标题不联网；HTML实体和装饰字符只规范化一次', async () => {
  const result = await run(row('＞＞教师&nbsp;招聘 &amp; 考试公告'));
  assert.equal(result.incomplete, false);
  assert.deepEqual(result.entries, [{ title: '教师 招聘 & 考试公告', sourceUrl: url, publishedAt: '2026-09-22' }]);
  assert.deepEqual(result.detailTitleCache.entries, {});
});

test('截断标题先补全再提供entries，普通公告也不能提前关键词过滤', async () => {
  const result = await run(row('项目安排第1批...'), { fetchImpl: async () => response(detail('项目安排第1批教师招聘面试公告')) });
  assert.equal(result.incomplete, false);
  assert.equal(result.entries[0].title, '项目安排第1批教师招聘面试公告');
  assert.equal(result.entries[0].publishedAt, '2026-09-22');
  assert.equal(result.detailTitleCache.entries[url].verifiedAt, recordedAt.toISOString());
  assert.deepEqual(Object.keys(result.detailTitleCache.entries[url]).sort(), ['listTitleFingerprint', 'title', 'verifiedAt']);
});

test('详情只接受head中已核实ArticleTitle与title一致，同值重复meta允许', () => {
  assert.equal(extractChangchunDistrictDetailTitle(detail(fullTitle, true), source, url, listTitle), fullTitle);
  const escaped = '<html><head><title>教师招聘第1批 &amp; 考试公告</title><meta content="教师招聘第1批 &amp; 考试公告" name="ArticleTitle"></head></html>';
  assert.equal(extractChangchunDistrictDetailTitle(escaped, source, url, listTitle), '教师招聘第1批 & 考试公告');
});

test('缺失冲突截断伪meta维护和前缀冲突详情失败关闭', async () => {
  const invalid = [
    '<html><head><title>教师招聘公告</title></head></html>', detail('完全无关的公告标题'), detail('教师招聘第1批...'),
    detail().replace('</head>', '<meta name="ArticleTitle" content="冲突的招聘公告"></head>'),
    detail().replace(`<title>${fullTitle}</title>`, '<title>冲突的招聘公告</title>'),
    `<html><head><script>${detail()}</script><title>${fullTitle}</title></head><body><meta name="ArticleTitle" content="${fullTitle}"></body></html>`,
    `<html><head><meta data-x='name="ArticleTitle" content="${fullTitle}"'><title>${fullTitle}</title></head></html>`,
    '<html><head><title>网站维护中 CAPTCHA</title><meta name="ArticleTitle" content="网站维护中 CAPTCHA"></head></html>'
  ];
  for (const html of invalid) {
    const result = await run(row(), { fetchImpl: async () => response(html) });
    assert.equal(result.incomplete, true);
    assert.deepEqual(result.entries, []);
    assert.deepEqual(result.detailTitleCache.entries, {});
    assert.doesNotMatch(result.error, /CAPTCHA|冲突的招聘/);
  }
});

test('缓存命中不再GET且不修改输入对象，跨时钟变化内容哈希稳定', async () => {
  const first = await run(row(), { fetchImpl: async () => response() });
  const cache = structuredClone(first.detailTitleCache);
  const before = JSON.stringify(cache);
  const second = await run(row(), { cache, now: new Date('2099-01-01T00:00:00.000Z') });
  assert.equal(second.incomplete, false);
  assert.equal(JSON.stringify(cache), before);
  assert.deepEqual(second.detailTitleCache, cache);
  assert.equal(createContentHash(`${first.entries[0].sourceUrl}|${first.entries[0].title}`), createContentHash(`${second.entries[0].sourceUrl}|${second.entries[0].title}`));
});

test('版本指纹时间完整标题或缓存前缀不合法时重新核验，不信任跨源缓存', async () => {
  const mutations = [
    { ...cacheFor(), version: 'outdated' },
    cacheFor(url, fullTitle, '别的列表标题...'),
    cacheFor(url, '完全无关的完整标题'), cacheFor(url, '教师招聘第1批...'),
    { version: DISTRICT_FULLTITLE_CACHE_VERSION, entries: { [url]: { ...cacheFor().entries[url], verifiedAt: 'bad-date' } } },
    cacheFor('http://evil.example/ywdt/tzgg/202609/t20260923_3514398.html'),
    { version: DISTRICT_FULLTITLE_CACHE_VERSION, entries: [] }
  ];
  for (const cache of mutations) {
    let calls = 0;
    const result = await run(row(), { cache, fetchImpl: async () => { calls += 1; return response(); } });
    assert.equal(result.incomplete, false);
    assert.equal(calls, 1);
    assert.deepEqual(Object.keys(result.detailTitleCache.entries), [url]);
  }
});

test('详情失败不输出半成品，保留成功缓存且继续后续条目，下一轮只补失败项', async () => {
  const secondUrl = new URL('./202609/t20260924_2.html', source.url).href;
  const rows = row() + row('教师招聘第2批...', secondUrl);
  const calls = [];
  const first = await run(rows, { fetchImpl: async (target) => { calls.push(target); return target === url ? response('', { status: 503, ok: false }) : response(detail('教师招聘第2批录用公告')); } });
  assert.deepEqual(calls, [url, secondUrl]);
  assert.equal(first.incomplete, true);
  assert.deepEqual(first.entries, []);
  assert.deepEqual(Object.keys(first.detailTitleCache.entries), [secondUrl]);
  const resumedCalls = [];
  const second = await run(rows, { cache: first.detailTitleCache, fetchImpl: async (target) => { resumedCalls.push(target); return response(); } });
  assert.equal(second.incomplete, false);
  assert.equal(second.entries.length, 2);
  assert.deepEqual(resumedCalls, [url]);
});

test('每源最多16个详情GET，无重试；第17项下一轮由缓存续跑', async () => {
  const items = Array.from({ length: 17 }, (_, index) => ({ href: `./202609/t20260923_${index + 1}.html`, title: `教师招聘第${index + 1}批...`, full: `教师招聘第${index + 1}批录用公告` }));
  const rows = items.map((item) => row(item.title, item.href)).join('');
  const titles = new Map(items.map((item) => [new URL(item.href, source.url).href, item.full]));
  let calls = 0;
  const fetchImpl = async (target) => { calls += 1; return response(detail(titles.get(target))); };
  const first = await run(rows, { fetchImpl });
  assert.equal(calls, 16);
  assert.equal(first.incomplete, true);
  assert.deepEqual(first.entries, []);
  assert.equal(Object.keys(first.detailTitleCache.entries).length, 16);
  const second = await run(rows, { cache: first.detailTitleCache, fetchImpl });
  assert.equal(calls, 17);
  assert.equal(second.incomplete, false);
  assert.equal(second.entries.length, 17);
});

test('仅当前首页缓存保留且最多100项，超大主列表明确失败', async () => {
  const foreignUrl = new URL('./202609/t20260924_2.html', source.url).href;
  const cache = { version: DISTRICT_FULLTITLE_CACHE_VERSION, entries: { ...cacheFor().entries, ...cacheFor(foreignUrl).entries } };
  const result = await run(row(), { cache });
  assert.deepEqual(Object.keys(result.detailTitleCache.entries), [url]);
  const rows = Array.from({ length: 101 }, (_, index) => row('普通完整公告标题', `./202609/t20260923_${index}.html`)).join('');
  const tooLarge = await run(rows, { cache });
  assert.equal(tooLarge.incomplete, true);
  assert.equal(tooLarge.entries.length, 0);
  assert.ok(Object.keys(tooLarge.detailTitleCache.entries).length <= 100);
});

test('日期缺失或非法时null，详情PubDate、URL、邻行、now不能补齐', async () => {
  for (const date of [null, '', '2026-02-29', '2026-02-31', '2026-00-01', '2026-13-01', '2026-09-00', '2026-09-32', '2026-9-22', '[2026-09-22', '2026-09-22]']) {
    const result = await run(row(listTitle, href, date), { fetchImpl: async () => response(detail().replace('</head>', '<meta name="PubDate" content="2026-10-01"></head>')) });
    assert.equal(result.entries[0].publishedAt, null);
  }
  const result = await run(row(listTitle, href, '2024-02-29'), { fetchImpl: async () => response() });
  assert.equal(result.entries[0].publishedAt, '2024-02-29');
});

test('绿园仅两精确同源前缀，拒绝微信及其他栏目', async () => {
  const rows = row('普通完整公告标题') + row('另一条完整公告标题', '../../zwdt/lyq/202608/t20260819_3506951.html') + row('外域完整公告标题', 'https://mp.weixin.qq.com/s/anything') + row('其他栏目完整公告标题', '/anything/202609/t20260923_1.html');
  const result = await resolveChangchunDistrictTitles(`<ul class="list_right_bar_zjdc">${rows}</ul>`, sources.lvyuan, { fetchImpl: noNetwork });
  assert.equal(result.incomplete, false);
  assert.equal(result.entries.length, 2);
});

test('精确源身份和URL绑定；恶意详情被排除，不扩大任何全局同源规则', async () => {
  for (const candidate of [null, {}, { ...source, id: '__proto__' }, { ...source, id: 'chaoyang-education-notices' }, { ...source, url: source.url + '?token=private-canary' }, { ...source, url: source.url.replace('http:', 'https:') }]) {
    const result = await resolveChangchunDistrictTitles(wrap(row()), candidate, { fetchImpl: noNetwork });
    assert.equal(result.incomplete, true);
    assert.doesNotMatch(result.error, /private-canary/);
  }
  const invalid = ['http://evil.example/ywdt/tzgg/202609/t20260923_1.html', 'http://nanguan.changchun.gov.cn.evil.example/ywdt/tzgg/202609/t20260923_1.html', 'https://nanguan.changchun.gov.cn/ywdt/tzgg/202609/t20260923_1.html', 'http://u:p@nanguan.changchun.gov.cn/ywdt/tzgg/202609/t20260923_1.html', 'http://nanguan.changchun.gov.cn:81/ywdt/tzgg/202609/t20260923_1.html', '//nanguan.changchun.gov.cn/ywdt/tzgg/202609/t20260923_1.html', 'javascript:alert(1)', '../outside/202609/t20260923_1.html', './%2e%2e/202609/t20260923_1.html', './202609/t20260923_%31.html', href + '?x=private-canary', href + '#details', href + String.fromCharCode(92), href + '&#10;', './index.html', './202609/people.xlsx'];
  const result = await run(row('有效完整公告标题') + invalid.map((link) => row('恶意完整公告标题', link)).join(''));
  assert.equal(result.entries.length, 1);
});

test('规范URL去重，不从主列表之外侧栏脚本样式注释或伪属性引入条目', async () => {
  const fake = wrap(row('另一条完整公告标题', './202609/t20260923_2.html'));
  const html = `<!--${fake}--><script>${fake}</script><style>${fake}</style><template>${fake}</template><nav>${fake}</nav><aside>${fake}</aside><a title='${fake}'>说明</a>${wrap(row('有效完整公告标题') + row('有效完整公告标题', url))}<div class="sidebar">${row('侧栏完整公告标题')}</div>`;
  const result = await resolveChangchunDistrictTitles(html, source, { fetchImpl: noNetwork });
  assert.equal(result.entries.length, 1);
});

test('详情请求使用独立signal、GET、无凭据和手工重定向', async () => {
  const signals = [];
  const result = await run(row() + row('教师招聘第2批...', './202609/t20260924_2.html'), { fetchImpl: async (target, options) => {
    assert.equal(options.method, 'GET'); assert.equal(options.redirect, 'manual'); assert.equal(options.credentials, 'omit');
    assert.equal(options.signal.aborted, false); signals.push(options.signal);
    return response(detail(target === url ? fullTitle : '教师招聘第2批拟聘用公告'));
  } });
  assert.equal(result.incomplete, false);
  assert.notEqual(signals[0], signals[1]);
});

test('非成功状态、已跟随重定向、响应URL改变、类型错误与异常仅产生固定安全错误', async () => {
  const bad = [response('', { status: 302, ok: false, headers: new Headers({ location: 'http://evil.example' }) }), response('', { status: 403, ok: false }), response('', { redirected: true }), response('', { url: 'http://evil.example' }), response('', { headers: new Headers({ 'content-type': 'application/pdf' }) })];
  for (const value of bad) {
    const result = await run(row(), { fetchImpl: async () => value });
    assert.equal(result.incomplete, true); assert.deepEqual(result.entries, []); assert.doesNotMatch(result.error, /evil|private/);
  }
  const result = await run(row(), { fetchImpl: async () => { throw new Error('private-token-canary'); } });
  assert.equal(result.incomplete, true); assert.doesNotMatch(result.error, /private-token/);
});

test('1.5MB上限覆盖Content-Length、流式字节和text兼容分支', async () => {
  for (const value of [response(detail(), { headers: new Headers({ 'content-length': '1500001' }) }), response('x'.repeat(1500001)), response('', { body: new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(1500001)); controller.close(); } }) })]) {
    const result = await run(row(), { fetchImpl: async () => value });
    assert.equal(result.incomplete, true); assert.deepEqual(result.entries, []);
  }
  const bytes = new TextEncoder().encode(detail());
  const result = await run(row(), { fetchImpl: async () => response('', { body: new ReadableStream({ start(controller) { controller.enqueue(bytes); controller.close(); } }) }) });
  assert.equal(result.entries[0].title, fullTitle);
});

test('单次15秒真实定时器会中止忽略signal的fetch，然后继续后项', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const signals = [];
  const task = run(row() + row('教师招聘第2批...', './202609/t20260924_2.html'), { now: new Date('2099-01-01T00:00:00.000Z'), fetchImpl: async (target, options) => { signals.push(options.signal); return target === url ? new Promise(() => {}) : response(detail('教师招聘第2批录用公告')); } });
  await flush(); t.mock.timers.tick(15000); await flush();
  const result = await task;
  assert.equal(signals[0].aborted, true); assert.equal(result.incomplete, true); assert.deepEqual(result.entries, []);
  assert.equal(Object.values(result.detailTitleCache.entries)[0].verifiedAt, '2099-01-01T00:00:00.000Z');
});

test('总45秒预算不受注入now影响，停止后续GET并保留安全部分结果', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let calls = 0;
  const rows = Array.from({ length: 6 }, (_, index) => row(`教师招聘第${index}批...`, `./202609/t20260923_${index}.html`)).join('');
  const task = run(rows, { now: new Date('1900-01-01T00:00:00.000Z'), fetchImpl: async () => { calls += 1; return new Promise(() => {}); } });
  await flush();
  for (let index = 0; index < 3; index += 1) { t.mock.timers.tick(15000); await flush(); }
  const result = await task;
  assert.equal(result.incomplete, true); assert.equal(calls, 3); assert.deepEqual(result.entries, []);
});

test('正文流读取也受15秒约束，不能绕过fetch超时', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const task = run(row(), { fetchImpl: async () => response('', { body: { getReader: () => ({ read: () => new Promise(() => {}), releaseLock() {} }) } }) });
  await flush(); t.mock.timers.tick(15000); await flush();
  assert.equal((await task).incomplete, true);
});

test('列表维护破损缺失或无有效详情返回incomplete，不破坏已核验缓存', async () => {
  for (const html of ['', null, '<h1>系统维护中</h1>', wrap(''), wrap(row()).replace('</ul>', ''), wrap(row()) + wrap(row()), '<div class="sidebar">' + row() + '</div>', wrap(row('无效完整公告标题', 'http://evil.example/1.html'))]) {
    const result = await resolveChangchunDistrictTitles(html, source, { cache: cacheFor(), fetchImpl: noNetwork });
    assert.equal(result.incomplete, true); assert.deepEqual(result.entries, []); assert.deepEqual(result.detailTitleCache, cacheFor());
  }
});

test('HTML实体仅从自有映射读取，不将constructor等继承属性当成实体', async () => {
  const result = await run(row('教师招聘 &constructor; &toString; 公告'));
  assert.equal(result.incomplete, false);
  assert.equal(result.entries[0].title, '教师招聘 &constructor; &toString; 公告');
});

test('原始文本RCDATA与嵌套template中的伪列表不能进入解析', async () => {
  const fake = wrap(row('伪造的完整公告标题', './202609/t20260924_2.html'));
  const real = wrap(row('有效的完整公告标题'));
  for (const tag of ['textarea', 'xmp', 'iframe', 'noembed', 'noscript', 'title']) {
    const fragment = `<${tag}>${fake}</${tag}>`;
    const onlyFake = await resolveChangchunDistrictTitles(fragment, source, { fetchImpl: noNetwork });
    assert.equal(onlyFake.incomplete, true, tag);
    const mixed = await resolveChangchunDistrictTitles(fragment + real, source, { fetchImpl: noNetwork });
    assert.equal(mixed.incomplete, false, tag);
    assert.equal(mixed.entries[0].title, '有效的完整公告标题');
    const unclosed = await resolveChangchunDistrictTitles(`<${tag}>${fake}`, source, { fetchImpl: noNetwork });
    assert.equal(unclosed.incomplete, true, tag);
  }
  const nested = await resolveChangchunDistrictTitles(`<template><template></template>${fake}</template>${real}`, source, { fetchImpl: noNetwork });
  assert.equal(nested.incomplete, false);
  assert.equal(nested.entries[0].title, '有效的完整公告标题');
  assert.equal((await resolveChangchunDistrictTitles(`<plaintext>${fake}${real}`, source, { fetchImpl: noNetwork })).incomplete, true);
});

test('合法同源详情的空短超长标题使整源incomplete，不能当作外链静默丢弃', async () => {
  for (const text of ['', '短', 'x'.repeat(181)]) {
    const result = await run(row('有效的完整公告标题') + row(text, './202609/t20260924_2.html'));
    assert.equal(result.incomplete, true);
    assert.deepEqual(result.entries, []);
  }
});

test('同一规范详情URL出现冲突标题时失败关闭，相同标题仍可去重', async () => {
  const conflict = await run(row('有效的完整公告标题') + row('另一条冲突公告标题', url));
  assert.equal(conflict.incomplete, true);
  assert.deepEqual(conflict.entries, []);
  const same = await run(row('有效的完整公告标题') + row('有效的完整公告标题', url));
  assert.equal(same.incomplete, false);
  assert.equal(same.entries.length, 1);
});

test('title的RCDATA不承载真实meta，且字面HTML不得视为标题格式', () => {
  const title = '教师招聘面试公告';
  const fakeMeta = `<html><head><title><meta name="ArticleTitle" content="${title}">${title}</title></head><body>没有真实ArticleTitle元数据</body></html>`;
  assert.throws(() => extractChangchunDistrictDetailTitle(fakeMeta, source, url, '教师招聘...'));
  const literalMarkup = `<html><head><meta name="ArticleTitle" content="${title}"><title><b>${title}</b></title></head></html>`;
  assert.throws(() => extractChangchunDistrictDetailTitle(literalMarkup, source, url, '教师招聘...'));
});

test('同URL同标题但同行日期冲突时失败关闭，包括缺失与有效日期冲突', async () => {
  for (const date of ['2026-09-23', null]) {
    const conflict = await run(row('有效的完整公告标题') + row('有效的完整公告标题', url, date));
    assert.equal(conflict.incomplete, true);
    assert.deepEqual(conflict.entries, []);
  }
  const same = await run(row('有效的完整公告标题', href, null) + row('有效的完整公告标题', url, null));
  assert.equal(same.incomplete, false);
  assert.equal(same.entries.length, 1);
  assert.equal(same.entries[0].publishedAt, null);
});

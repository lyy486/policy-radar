import test from 'node:test';
import assert from 'node:assert/strict';
import { parseJingyueEducationList } from '../src/adapters/jingyue-education.js';

const SOURCE = Object.freeze({
  id: 'jingyue-education-notices', url: 'http://jingyue.changchun.gov.cn/zw/tzgg/'
});
const CROSS = 'http://zwgk.changchun.gov.cn/jy/kfqzcbm/jygxjscykfqkjcxwyh/zdlyjczwgk/';
const LOCAL = './202609/t20260903_3509787.html';
const URL = `${CROSS}202609/t20260928_3515159.html`;
const TITLE = '关于开展《关于发布体育科技创新需求并征集解决方案的通知》的通知';

// Cropped from the public first-page cache, verified 2026-10-01 Asia/Shanghai.
// Preserve all ten complete titles and same-card dates, including the nested anchors.
const REAL_ROWS = [
  [TITLE, `${CROSS}202609/t20260928_3515159.html`, '2026年09月28日'],
  ['关于组织开展 2027年长春市省级促进中小企业发展奖补资金项目申报工作的通知', `${CROSS}202609/t20260924_3514862.html`, '2026年09月24日'],
  ['关于组织开展2026年(第二十九批)省级企业技术中心申报工作的通知', `${CROSS}202609/t20260922_3514253.html`, '2026年09月22日'],
  ['关于申报2023年度国家高新技术企业认定奖励的通知', `${CROSS}202609/t20260915_3512195.html`, '2026年09月15日'],
  ['关于调整公共资源交易场地的通知', LOCAL, '2026年09月03日'],
  ['市工信局《关于开展2026年工业和信息化领域创新任务揭榜挂帅工作的通知》', `${CROSS}202608/t20260810_3505204.html`, '2026年08月10日'],
  ['市科技局发布《长春英才支持计划”科技创新项目2026年度项目》的通知', `${CROSS}202608/t20260806_3504739.html`, '2026年08月06日'],
  ['省科技厅开展《吉林省科技发展计划2027年度项目申报指南》的通知', `${CROSS}202608/t20260805_3504546.html`, '2026年08月05日'],
  ['关于开展《2026年度“先投后股”方式支持科技成果转化项目申报指南》的通知', `${CROSS}202608/t20260803_3504063.html`, '2026年08月03日'],
  ['市工信局《关于组织开展国家级零碳工厂建设名单申报工作的通知》', `${CROSS}202607/t20260731_3503672.html`, '2026年07月31日']
];
const heading = (title = TITLE, href = URL, attributes = '') => `<a href="${href}" ${attributes}>${title}</a>`;
const card = (title = TITLE, href = URL, date = '2026年09月28日', options = {}) => `
<div class="list-entry"><div class="media"><div class="media-body">
<h4 class="media-heading">${options.heading ?? heading(title, href, options.attributes)}</h4>
<p>摘要可以...省略......并显示2025年01月01日</p></div>
${date === null ? '' : `<div class="media-bottom"><i>${date}</i><!--<i>来源：</i>--></div>`}
</div></div>`;
const page = (cards = card()) => `<html><head><title>净月高新技术产业开发区</title></head><body>
<div class="list-entry-page">${cards}</div></body></html>`;
const REAL_HTML = page(REAL_ROWS.map(([title, href, date]) => card(title, href, date, {
  heading: `<a href="${href}" target="blank">${heading(title, href, 'target="_blank"')}</a>`
})).join(''));
const parse = (html = REAL_HTML, source = SOURCE) => parseJingyueEducationList(html, source);
const fails = (html) => assert.throws(() => parse(html), (error) => {
  assert.match(error.message, /净月/);
  assert.doesNotMatch(error.message, /SECRET_CANARY/);
  return true;
});

test('returns all ten genuine complete titles and dates before teacher filtering', () => {
  const entries = parse();
  assert.equal(entries.length, 10);
  assert.deepEqual(entries.map((entry) => entry.title), REAL_ROWS.map(([title]) => title));
  assert.deepEqual(entries.map((entry) => entry.publishedAt), [
    '2026-09-28', '2026-09-24', '2026-09-22', '2026-09-15', '2026-09-03',
    '2026-08-10', '2026-08-06', '2026-08-05', '2026-08-03', '2026-07-31'
  ]);
  assert.equal(entries.filter((entry) => entry.sourceUrl.startsWith(CROSS)).length, 9);
  assert.equal(entries[4].sourceUrl, `${SOURCE.url}202609/t20260903_3509787.html`);
  assert.equal(entries.filter((entry) => /教师|学校|招聘|招募|面试|特岗|教资/.test(entry.title)).length, 0);
});

test('binds both source id and exact verified public list URL', () => {
  for (const source of [undefined, null, {}, { ...SOURCE, id: 'other' },
    { ...SOURCE, url: SOURCE.url.replace('http:', 'https:') },
    { ...SOURCE, url: `${SOURCE.url}?page=1` }, { ...SOURCE, url: `${SOURCE.url}index.html` }]) {
    assert.throws(() => parseJingyueEducationList(REAL_HTML, source), /净月.*来源/);
  }
});

test('accepts only exact verified detail origins and department prefixes', () => {
  const localAbsolute = `${SOURCE.url}202609/t20260903_3509787.html`;
  for (const href of [LOCAL, '/zw/tzgg/202609/t20260903_3509787.html', localAbsolute, URL]) {
    assert.equal(parse(page(card(TITLE, href)))[0].sourceUrl, href === URL ? URL : localAbsolute);
  }
  const invalid = [
    URL.replace('/jy/', '/na/'), URL.replace('jygxjscykfqkjcxwyh', 'other'),
    URL.replace('http:', 'https:'), URL.replace('http:', ''),
    URL.replace('changchun.gov.cn', 'changchun.gov.cn.evil.example'),
    URL.replace('http://', 'http://user@'), URL.replace('.gov.cn/', '.gov.cn:80/'),
    URL.replace('/202609/', '/%2e%2e/202609/'), URL.replace('/202609/', '/%252e%252e/202609/'),
    URL.replace('/202609/', '/other/../202609/'), URL.replace('/202609/', '/\\202609/'),
    `${URL}?x=1`, `${URL}#part`, `${URL}.pdf`, `${URL} `,
    URL.replace('t20260928_', 't20260928_0'), LOCAL.replace('./', '../'),
    'javascript:alert(1)', 'http://127.0.0.1/202609/t20260928_3515159.html'
  ];
  for (const href of invalid) {
    const entries = parse(page(card(TITLE, URL) + card('不可信的公告链接', href)));
    assert.equal(entries.length, 1, href);
    fails(page(card(TITLE, href)));
  }
});

test('uses only the main list and excludes navigation, sidebar, script and templates', () => {
  const decoy = card('SECRET_CANARY教师招聘通知', LOCAL);
  const excluded = ['nav', 'aside', 'template', 'noscript', 'script', 'style']
    .map((tag) => `<${tag}>${page(decoy)}</${tag}>`).join('');
  const html = `${excluded}${page(`${card()}<template><template>${decoy}</template>${decoy}</template>`)}
    <div class="sidebar">${decoy}</div>${decoy}<!--${page(decoy)}-->`;
  assert.deepEqual(parse(html), [{ title: TITLE, sourceUrl: URL, publishedAt: '2026-09-28' }]);
  fails('<div class="list-entry-page-other">' + card() + '</div>');
  fails(page('<div class="list-entry-other">' + heading() + '</div>'));
});

test('rejects empty shells, missing headings and broken or ambiguous list structure', () => {
  for (const html of ['', '<html><body>正常页面空壳</body></html>', page(''), page() + page(),
    page().replace('</div></body>', '</body>'),
    page(card().replace('<h4 class="media-heading">', '<h4 class="other">')),
    page(card().replace('</h4>', '')), page(card().replace(heading(), '')),
    page(card().replace('<div class="media">', `<div class="media">${card()}`)),
    page(card().replace('</h4>', `</h4><h4 class="media-heading">${heading()}</h4>`))]) fails(html);
});

test('rejects truncated titles for the whole source, but may use a complete title attribute', () => {
  for (const title of ['教师招聘公告...', '教师招聘公告…', '教师招聘公告⋯', '教师招聘公告&hellip;']) {
    fails(page(card() + card(title, LOCAL)));
    assert.equal(parse(page(card(title, URL, '2026年09月28日', { attributes: `title="${TITLE}"` })))[0].title, TITLE);
  }
  fails(page(card('教师招聘公告...', URL, '2026年09月28日', { attributes: 'title="招聘公告也..."' })));
  assert.equal(parse(page(card('<span>教师</span>招聘公告&nbsp;&#x26;&#38;政策')))[0].title, '教师招聘公告 &&政策');
  assert.equal(parse(page(card('教师招聘公告', URL, '2026年09月28日', {
    heading: `<a href='${URL}' title='教师资格考试&ldquo;通知&rdquo;'>教师资格...</a>`
  })))[0].title, '教师资格考试“通知”');
});

test('rejects invalid or unsafe titles without exposing response content', () => {
  for (const title of ['', '短', '长'.repeat(181), 'SECRET_CANARY网站维护中',
    'SECRET_CANARY&constructor;', 'SECRET_CANARY&#x110000;', 'SECRET_CANARY&#0;',
    'SECRET_CANARY&#xD800;', 'SECRET_CANARY&#x7f;', 'SECRET_CANARY<',
    'SECRET_CANARY&lt;script&gt;', 'SECRET_CANARY', 'SECRET_CANARY�']) {
    fails(page(card() + card(title, LOCAL)));
  }
});

test('keeps dates within the same card and never infers from URL, summary or adjacent entries', () => {
  const html = page(card(TITLE, URL, null) + card('另一则普通公告通知', LOCAL, '2024年02月29日'));
  assert.deepEqual(parse(html).map((entry) => entry.publishedAt), [null, '2024-02-29']);
  for (const date of ['', '2026年02月29日', '2026年13月01日', '2026年04月31日',
    '2026-09-28', '2026年9月28日', 'SECRET_CANARY', '2026年00月01日']) {
    assert.equal(parse(page(card(TITLE, URL, date)))[0].publishedAt, null);
  }
  assert.equal(parse(page(card().replace('</i><!--', '</i><i>2026年09月29日</i><!--')))[0].publishedAt, null);
  assert.equal(parse(page(card().replace('media-bottom', 'other')))[0].publishedAt, null);
});

test('supports observed same-href nested anchors but rejects conflicting or malformed links', () => {
  assert.equal(parse(page(card(TITLE, URL, undefined, { heading: `<a href="${URL}">${heading()}</a>` })))[0].title, TITLE);
  for (const value of [`<a href="${URL}">${heading(TITLE, LOCAL)}</a>`,
    `<a href="https://evil.example/">${heading()}</a>`,
    `<a href="${URL}">${heading()}`, `${heading()}${heading()}`,
    heading(TITLE, URL, `href="${LOCAL}"`), `<a data-href="${URL}">${TITLE}</a>`,
    `<a href="${URL}"><a href="${URL}">${heading()}</a></a>`,
    `<a href="${URL}" title="完整标题一">${heading(TITLE, URL, 'title="完整标题二"')}</a>`]) {
    fails(page(card(TITLE, URL, undefined, { heading: value })));
  }
});

test('fails a mixed list when a card lacks href or nested anchor text is ambiguous', () => {
  for (const value of ['<a>' + TITLE + '</a>',
    '<a href="' + URL + '">额外的另一则标题' + heading() + '</a>',
    '<a href="' + URL + '">' + heading() + '额外的另一则标题</a>']) {
    fails(page(card() + card(TITLE, LOCAL, undefined, { heading: value })));
  }
});

test('rejects fake lists inside raw text containers and their incomplete boundaries', () => {
  const decoy = page(card('SECRET_CANARY教师招聘通知', LOCAL));
  for (const tag of ['textarea', 'xmp', 'iframe', 'noembed']) {
    fails('<' + tag + '>' + decoy + '</' + tag + '>');
    fails('<' + tag + '>' + page());
    assert.equal(parse('<' + tag + '>' + decoy + '</' + tag + '>' + page()).length, 1);
  }
  fails('<title>' + decoy + '</title>');
  fails('<title><div class="list-entry-page">' + card() + '</div></title>');
  fails('<title>' + page());
  fails('<plaintext>' + page());
});

test('rejects unquoted or duplicate relevant attributes instead of selecting a later value', () => {
  for (const attributes of ['href=https://evil.example/ href="' + URL + '"',
    'href="' + URL + '" href=https://evil.example/', 'href=' + URL,
    'href href="' + URL + '"', 'href="' + URL + '" title title="完整教师招聘通知"',
    'href="' + URL + '" title=教师招聘... title="完整教师招聘通知"',
    'href="' + URL + '" title=完整教师招聘通知']) {
    fails(page(card() + card(TITLE, LOCAL, undefined, { heading: '<a ' + attributes + '>教师招聘通知</a>' })));
  }
});

test('never treats quoted attributes as main lists or announcement headings', () => {
  const fakeHeading = '<h4 class="media-heading"><a href="./202609/t20260930_900009.html">教师招聘笔试公告</a></h4>';
  const date = '<div class="media-bottom"><i>2026年09月29日</i></div>';
  const fake = '<div class="list-entry-page"><div class="list-entry">' + fakeHeading + date + '</div></div>';
  const quoted = (value) => "<span title='" + value + "'>普通说明文字</span>";
  fails("<a title='" + fake + "'>普通说明文字</a>");
  fails('<div class="list-entry-page"><div class="list-entry">' + quoted(fakeHeading) + date + '</div></div>');
  assert.deepEqual(parse(quoted(fake) + page()), parse(page()));
  assert.deepEqual(parse(page(card() + quoted(card('教师招聘笔试公告', LOCAL)))), parse(page()));
});

test('never treats quoted attributes as anchors, date elements or maintenance headings', () => {
  const quoted = (value) => "<span title='" + value + "'>普通说明文字</span>";
  fails(page(card(TITLE, URL, undefined, { heading: quoted(heading('教师招聘笔试公告', LOCAL)) })));
  assert.deepEqual(parse(page(card(TITLE, URL, undefined, {
    heading: '<a href="' + URL + '" data-note=\'' + heading('教师招聘笔试公告', LOCAL) + '\'>' + TITLE + '</a>'
  }))), parse(page()));
  const fakeDate = quoted('<i>2024年02月29日</i>');
  assert.equal(parse(page(card(TITLE, URL, '').replace('<i></i>', fakeDate)))[0].publishedAt, null);
  const fakeBottom = quoted('<div class="media-bottom"><i>2024年02月29日</i></div>');
  assert.equal(parse(page(card(TITLE, URL, null).replace('<p>', fakeBottom + '<p>')))[0].publishedAt, null);
  assert.deepEqual(parse(quoted('<h1>Access denied</h1><title>SECRET_CANARY</title>') + page()), parse(page()));
  assert.deepEqual(parse(quoted('<!--x--><script>SECRET_CANARY</script><nav>decoy</nav>') + page()), parse(page()));
});

test('deduplicates identical recognized article URLs in original order', () => {
  const entries = parse(page(card() + card() + card('普通政务公告通知', LOCAL)));
  assert.deepEqual(entries.map((entry) => entry.title), [TITLE, '普通政务公告通知']);
});

test('rejects maintenance, blocked, oversized and malformed inert responses safely', () => {
  for (const html of [null, 4, {}, 'x'.repeat(1_500_001),
    page().replace('净月高新技术产业开发区', 'SECRET_CANARY安全验证'),
    page().replace('<body>', '<body><h1>Access denied</h1>'),
    '<script>' + page(), '<template>' + page(), '<nav>' + page(), '<!--' + page(),
    '<template></nav>' + page(), page(card(TITLE, URL, undefined, { heading: '</a>' + heading() }))]) fails(html);
  assert.equal(parse(page().replace('<div class="media">', '<div>')).length, 1);
});

test('rejects tokenizer-level malformed quoted tags and self-closing structural tags', () => {
  for (const html of [
    '<a title="unterminated>' + page(),
    '<div class="list-entry-page><div class="list-entry">' + card() + '</div>',
    '<!-- unterminated ' + page(),
    '<div class="list-entry-page"/><div class="list-entry">' + card() + '</div>',
    '<div class="list-entry-page"><div class="list-entry"/>' + card() + '</div>',
    '<div class="list-entry-page"><div class="list-entry"><h4 class="media-heading"/>' + card() + '</div></div>'
  ]) fails(html);
});

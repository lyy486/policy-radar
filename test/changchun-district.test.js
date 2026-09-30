import test from 'node:test';
import assert from 'node:assert/strict';
import { parseChangchunDistrictList } from '../src/adapters/changchun-district.js';

const sources = Object.freeze({
  chaoyang: Object.freeze({ id: 'chaoyang-education-notices', url: 'http://chaoyang.changchun.gov.cn/zwdt/tzgg/' }),
  dehui: Object.freeze({ id: 'dehui-education-notices', url: 'http://dehui.changchun.gov.cn/ywdt/tzgg/rsxx/' }),
  jiutai: Object.freeze({ id: 'jiutai-education-notices', url: 'http://jiutai.changchun.gov.cn/dzxx/tzgg/' }),
  lianhuashan: Object.freeze({ id: 'lianhuashan-education-notices', url: 'http://lianhuashan.changchun.gov.cn/xwxx/tzgg/' })
});
const source = sources.chaoyang;
const href = './202609/t20260923_3514398.html';
const title = '2026年教师招聘笔试公告';
const row = (link = href, date = '2026-09-22', text = title, attributes = '') =>
  `<li>${date === null ? '' : `<span>[${date}]</span>`}<a href="${link}" ${attributes}>${text}</a></li>`;
const wrap = (rows) => `<div id="con_one_1"><div class="breadcrumb">当前位置</div><ul class="x_zcjd_li mar0">${rows}</ul></div>`;
const parse = (rows) => parseChangchunDistrictList(wrap(rows), source);

// Minimal synthetic records preserve the four independently observed public layouts.
test('朝阳主列表使用完整title属性替代截断文字，日期取本行而非URL', () => {
  const html = wrap(row(href, '2026-09-22', '＞＞2026年教师招聘...', `title="${title}"`));
  assert.deepEqual(parseChangchunDistrictList(html, source), [{ title, sourceUrl: new URL(href, source.url).href, publishedAt: '2026-09-22' }]);
});

test('德惠首个主ul接受同源公告公示兄弟路径，忽略第二个ul', () => {
  const html = `<div class="news_list"><ul><li><a title="教师招聘面试公告" href="../gggs/202608/t20260820_3507076.html">教师招聘...</a><span> 2026-08-20 </span></li></ul><ul>${row('./202609/t20260923_999.html')}</ul></div>`;
  assert.deepEqual(parseChangchunDistrictList(html, sources.dehui), [{ title: '教师招聘面试公告', sourceUrl: 'http://dehui.changchun.gov.cn/ywdt/tzgg/gggs/202608/t20260820_3507076.html', publishedAt: '2026-08-20' }]);
});

test('九台精确匹配class token，排除right_xyh_listul侧栏与外部导航', () => {
  const html = `<div class="right_xyh_listul currency_ul"><ul>${row('./202609/t20260923_999.html')}</ul></div><div class="xyh_listul currency_ul"><ul><li><a href="${href}" title="九台区教师招聘公告">九台区教师...</a><span>2026-09-22</span></li></ul></div><nav>${row('./202609/t20260923_998.html')}</nav>`;
  assert.deepEqual(parseChangchunDistrictList(html, sources.jiutai), [{ title: '九台区教师招聘公告', sourceUrl: new URL(href, sources.jiutai.url).href, publishedAt: '2026-09-22' }]);
});

test('莲花山仅取本行i日期，2026-09-22优先于URL的20260923', () => {
  const html = `<ul class="news_list"><li><a href="${href}" title="莲花山教师招聘公告">莲花山教师...</a><span>2026-10-01</span><i>2026-09-22</i></li></ul>`;
  assert.deepEqual(parseChangchunDistrictList(html, sources.lianhuashan), [{ title: '莲花山教师招聘公告', sourceUrl: new URL(href, sources.lianhuashan.url).href, publishedAt: '2026-09-22' }]);
});

test('没有title属性时可见完整标题可用，清理装饰字符与命名数字实体', () => {
  const result = parse(row(href, '2024-02-29', ' ＞＞ <b>&#x6559;&#24072;</b>&nbsp;招聘 &amp; 面试 &quot;通知&quot; &#39;公告&#39;'));
  assert.equal(result[0].title, `教师 招聘 & 面试 "通知" '公告'`);
  assert.equal(result[0].publishedAt, '2024-02-29');
});

test('完整title属性优先且解码实体，空属性或截断属性可退回完整可见标题', () => {
  assert.equal(parse(row(href, null, '错误可见标题', 'title="教师&#32;招聘&amp;考试公告"'))[0].title, '教师 招聘&考试公告');
  assert.equal(parse(row(href, null, title, 'title=""'))[0].title, title);
  assert.equal(parse(row(href, null, title, 'title="教师招聘..."'))[0].title, title);
  assert.equal(parse(row(href, null, '错误标题', "title='教师招聘面试公告'"))[0].title, '教师招聘面试公告');
});

test('无法还原的尾部省略号必须报错，不能静默收录截断标题', () => {
  for (const text of ['教师招聘...', '教师招聘…', '教师招聘……', '教师招聘&hellip;']) {
    assert.throws(() => parse(row(href, null, text)), /截断/);
    assert.throws(() => parse(row(href, null, text, 'title="教师招聘..."')), /截断/);
  }
  assert.equal(parse(row(href, null, '教师招聘...事项说明公告'))[0].title, '教师招聘...事项说明公告');
});

test('缺失或非法日期为null，不从标题URL抓取时间邻项及锚点内span猜测', () => {
  const invalid = [null, '', '2026-02-29', '2026-02-31', '2026-00-10', '2026-13-01', '2026-09-00', '2026-09-32', '2026-9-22', '2026-09-22 01:00', 'not-a-date'];
  for (const date of invalid) {
    const rows = row('./202609/t20260921_1.html', '2026-09-21') + row(href, date, '2026-10-01教师招聘公告') + row('./202609/t20260924_2.html', '2026-09-24');
    assert.deepEqual(parse(rows).map((entry) => entry.publishedAt), ['2026-09-21', null, '2026-09-24']);
  }
  assert.equal(parse(row(href, null, '<span>2026-10-01</span>教师招聘公告'))[0].publishedAt, null);
  assert.equal(parseChangchunDistrictList(`<ul class="news_list">${row()}</ul>`, sources.lianhuashan)[0].publishedAt, null);
});

test('所有源严格绑定id和精确栏目URL，拒绝私密查询且错误不回显输入', () => {
  const invalid = [null, {}, { ...source, id: 'unknown' }, { ...source, id: '__proto__' }, { ...source, id: sources.jiutai.id }, { ...source, url: source.url.replace('http:', 'https:') }, { ...source, url: source.url + 'index.html' }, { ...source, url: source.url + '?token=private-canary' }];
  for (const candidate of invalid) {
    assert.throws(() => parseChangchunDistrictList(wrap(row()), candidate), (error) => {
      assert.match(error.message, /长春区县/);
      assert.doesNotMatch(error.message, /private-canary/);
      return true;
    });
  }
  assert.throws(() => parseChangchunDistrictList(null, source), /长春区县/);
  assert.equal(source.url, 'http://chaoyang.changchun.gov.cn/zwdt/tzgg/');
});

test('不接受外链伪协议端口userinfo编码逃逸越详情路径或导航附件', () => {
  const root = 'http://chaoyang.changchun.gov.cn';
  const invalid = [
    `http://evil.example/zwdt/tzgg/202609/t20260923_1.html`, `${root}.evil.example/zwdt/tzgg/202609/t20260923_1.html`,
    `https://chaoyang.changchun.gov.cn/zwdt/tzgg/202609/t20260923_1.html`, `http://u:p@chaoyang.changchun.gov.cn/zwdt/tzgg/202609/t20260923_1.html`,
    `http://chaoyang.changchun.gov.cn:81/zwdt/tzgg/202609/t20260923_1.html`, '//evil.example/zwdt/tzgg/202609/t20260923_1.html',
    'javascript:alert(1)', 'data:text/html,notice', 'http:evil.example/notice.html', 'https://mp.weixin.qq.com/s/anything',
    './index.html', './202609/P020260923.xlsx', '../outside/202609/t20260923_1.html', './../../../outside/202609/t20260923_1.html',
    './%2e%2e/outside/202609/t20260923_1.html', './202609/t20260923_%31.html', './202609%2ft20260923_1.html',
    href + '?next=private-canary', href + '#details', href + String.fromCharCode(92) + 'evil', href + String.fromCharCode(10),
    './202609/t20260923_1.html&#10;', './%252e%252e/outside/202609/t20260923_1.html'
  ];
  const entries = parse(row() + invalid.map((value) => row(value)).join(''));
  assert.equal(entries.length, 1);
  assert.equal(entries[0].sourceUrl, new URL(href, source.url).href);
});

test('规范化同源URL后去重，保留第一条完整标题与本行日期', () => {
  const absolute = new URL(href, source.url).href;
  const result = parse(row(href) + row(absolute, '2026-09-23', '重复教师招聘公告'));
  assert.equal(result.length, 1);
  assert.equal(result[0].publishedAt, '2026-09-22');
});

test('仅主列表逐li解析，外部侧栏脚本样式注释模板导航均不参与', () => {
  const fake = wrap(row('./202609/t20260923_999.html'));
  const html = `<!--${fake}--><script>${fake}</script><style>${fake}</style><template>${fake}</template><nav>${fake}</nav><aside>${fake}</aside>${wrap(row())}<div class="sidebar"><ul>${row('./202609/t20260923_998.html')}</ul></div>`;
  assert.equal(parseChangchunDistrictList(html, source).length, 1);
  assert.throws(() => parseChangchunDistrictList(`<div class="right_xyh_listul"><ul>${row()}</ul></div>`, sources.jiutai), /长春区县/);
  assert.throws(() => parseChangchunDistrictList(`<ul class="x_zcjd_li">${row()}</ul>`, source), /长春区县/);
});

test('主列表空壳缺失维护验证码不完整或重复边界应报错', () => {
  const invalid = ['', '<h1>系统维护中</h1>', '<h2>人机验证 CAPTCHA</h2>', wrap(''), '<div id="con_one_1"></div>', '<div id="con_one_1"><ul class="x_zcjd_li">' + row(), wrap(row()).replace('</ul>', ''), wrap(row()) + wrap(row()), `<h1>网站维护</h1>${wrap(row())}`, `<title>Access denied</title>${wrap(row())}`, wrap('<li><ul>' + row() + '</ul></li>')];
  for (const html of invalid) assert.throws(() => parseChangchunDistrictList(html, source), /长春区县/);
});

test('其他标签属性中的伪主列表标记不能改变真实结构边界', () => {
  const fake = wrap(row('./202609/t20260923_999.html'));
  const html = `<a title='${fake}'>普通说明文字</a>${wrap(row())}`;
  assert.equal(parseChangchunDistrictList(html, source).length, 1);
});

test('日期方括号必须成对，不把残缺标签内容识别为完整日期', () => {
  for (const date of ['[2026-09-22', '2026-09-22]']) {
    const html = wrap(`<li><span>${date}</span><a href="${href}">${title}</a></li>`);
    assert.equal(parseChangchunDistrictList(html, source)[0].publishedAt, null);
  }
});

test('有真实普通公告仍返回供上层筛选，全部非法或无标题详情则失败', () => {
  assert.equal(parse(row(href, '2026-09-22', '行政处罚信息公示'))[0].title, '行政处罚信息公示');
  for (const rows of [row('https://evil.example/1.html'), row(href, null, ''), row(href, null, '短'), row(href, null, '标'.repeat(181)), '<li><span>2026-09-22</span></li>']) {
    assert.throws(() => parse(rows), /长春区县/);
  }
});

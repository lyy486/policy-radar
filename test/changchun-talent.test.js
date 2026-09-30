import test from 'node:test';
import assert from 'node:assert/strict';
import { parseChangchunTalentList } from '../src/adapters/changchun-talent.js';

const origin = 'https://rcjy.ccxq.gov.cn';
const source = Object.freeze({ url: `${origin}/content/news/list/3/1.html` });
const recruitmentSource = Object.freeze({ url: `${origin}/content/news/list/4/1.html` });
// Reduced public HTML observed on 2026-10-01. Titles, URLs, dates and card nesting
// are real; unrelated images, attributes and most summaries have been omitted.
const noticesFixture = `
<div class="listb  news_noimg ">
  <div class="bl"><div class="pic"><img src="/storage/"></div></div>
  <div class="br link_gray6">
    <div class="t substring"><a href="https://rcjy.ccxq.gov.cn/content/news/show/1160.html"><span style=color:#000000;>关于开展长春新区域内吉林省2027年度创业项目入库征集工作的通知</span></a></div>
    <div class="time substring">公告通知<span class="time1">2026-09-29</span></div>
    <div class="clear"></div><div class="summary">自本通知公布之日起至2026年10月8日16:00</div>
  </div><div class="clear"></div>
</div>
<div class="listb news_noimg">
  <div class="br link_gray6">
    <div class="t substring"><a href="https://rcjy.ccxq.gov.cn/content/news/show/1154.html"><span style=color:#000000;>2026年长春新区公办学校面向社会招募银龄教师拟聘用公示</span></a></div>
    <div class="time substring">公告通知<span class="time1">2026-08-26</span></div>
    <div class="clear"></div><div class="summary">公示期自2026年8月26日至2026年9月1日。</div>
  </div><div class="clear"></div>
</div>`;
const recruitmentFixture = `
<div class="listb news_noimg"><div class="br link_gray6">
  <div class="t substring"><a href="https://rcjy.ccxq.gov.cn/content/news/show/1136.html"><span style=color:#000000;>2026年长春新区公办学校面向社会招募银龄教师公告</span></a></div>
  <div class="time substring">招考招聘<span class="time1">2026-07-29</span></div>
</div><div class="clear"></div></div>
<div class="listb news_noimg"><div class="br link_gray6">
  <div class="t substring"><a href="https://rcjy.ccxq.gov.cn/content/news/show/716.html"><span style=color:#000000;>长春新区面向东北师范大学、吉林师范大学2024年应届毕业生公开招聘编外合同制教师公告</span></a></div>
  <div class="time substring">招考招聘<span class="time1">2023-11-22</span></div>
</div><div class="clear"></div></div>`;
const sidebar = `<div class="r"><div class="listbox"><div class="ntit"><div class="tlh">热门资讯</div></div>
<ul class="link_gray6"><li><a href="https://rcjy.ccxq.gov.cn/content/news/show/611.html">关于调整长春新区面向社会公开招聘工作人员笔试形式为线上笔试的通知</a></li></ul></div>
<div class="listbox"><div class="ntit">推荐资讯</div><a href="/content/news/show/1090.html">长春新区2026年“企业文化进校园”春季巡展活动</a></div></div>`;
const card = (href, date = '2026-09-29', title = '教师招聘考试通知') => `<div class='listb news_noimg'><div class='br'>
<div class='t substring'><a href="${href}">${title}</a></div>
${date === null ? '' : `<span class='time1'>${date}</span>`}
<div class='summary'>请关注2026-10-01的安排</div></div></div>`;

test('新区公告列表逐卡读取真实标题日期，不借用正文摘要日期', () => {
  assert.deepEqual(parseChangchunTalentList(noticesFixture, source), [
    { title: '关于开展长春新区域内吉林省2027年度创业项目入库征集工作的通知', sourceUrl: `${origin}/content/news/show/1160.html`, publishedAt: '2026-09-29' },
    { title: '2026年长春新区公办学校面向社会招募银龄教师拟聘用公示', sourceUrl: `${origin}/content/news/show/1154.html`, publishedAt: '2026-08-26' }
  ]);
});

test('新区招考栏目解析真实主列表，排除热门资讯和推荐资讯', () => {
  const entries = parseChangchunTalentList(recruitmentFixture + sidebar, recruitmentSource);
  assert.deepEqual(entries.map(({ sourceUrl, publishedAt }) => [sourceUrl, publishedAt]), [
    [`${origin}/content/news/show/1136.html`, '2026-07-29'],
    [`${origin}/content/news/show/716.html`, '2023-11-22']
  ]);
  assert.match(entries[1].title, /编外合同制教师/);
});

test('缺失或非法日期保持null，不从相邻条目、标题或抓取日期补齐', () => {
  const invalid = [null, '', 'not-a-date', '2026-02-29', '2026-02-31', '2026-00-15', '2026-13-01', '2026-09-00', '2026-09-32', '2026-9-29', '2026-09-29 00:00:00'];
  for (const date of invalid) {
    const html = card('/content/news/show/10.html') + card('/content/news/show/11.html', date, '2026-10-01教师招聘通知') + card('/content/news/show/12.html', '2024-02-29');
    assert.deepEqual(parseChangchunTalentList(html, source).map((entry) => entry.publishedAt), ['2026-09-29', null, '2024-02-29']);
  }
});

test('新区详情只允许同源HTTPS已核验数字路径，不接受外域或伪协议', () => {
  const invalid = [
    'https://evil.example/content/news/show/1.html', 'https://rcjy.ccxq.gov.cn.evil.example/content/news/show/1.html',
    'http://rcjy.ccxq.gov.cn/content/news/show/1.html', 'https://u:p@rcjy.ccxq.gov.cn/content/news/show/1.html',
    'https://rcjy.ccxq.gov.cn:444/content/news/show/1.html', '//evil.example/content/news/show/1.html',
    'javascript:alert(1)', 'data:text/html,notice', 'https:evil.example/content/news/show/1.html',
    '/content/news/list/3/1.html', '/content/news/show/abc.html', '/content/news/show/1.html?next=evil',
    '/content/news/show/1.html#details', '/content/news/show/0.html', '/anything/../content/news/show/1.html',
    '/content/news/show/%31.html', '/content/news/show/1.html' + String.fromCharCode(92) + 'evil', '/content/news/show/1.html' + String.fromCharCode(10),
    'https://mp.weixin.qq.com/s/tMjOAyWETFEPBbUeW2MLWw'
  ];
  const entries = parseChangchunTalentList(card('/content/news/show/1.html') + invalid.map((href) => card(href)).join(''), source);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].sourceUrl, `${origin}/content/news/show/1.html`);
});

test('空白、维护、验证码、空卡片、缺失主列表和截断HTML不能报成功零条', () => {
  for (const html of ['', '<h1>系统维护中</h1>', '<h1>人机验证</h1>', sidebar, '<div class="listb"></div>', '<div class="listb"><div class="t"><a href="/content/news/show/1.html">教师招聘考试</a></div>', `<h1>网站维护</h1>${noticesFixture}`]) {
    assert.throws(() => parseChangchunTalentList(html, source), /新区人才/);
  }
});

test('仅摘要链接或全部不可信详情时明确报错，不假装解析成功', () => {
  for (const html of [card('https://evil.example/content/news/show/1.html'), `<div class="listb"><div class="summary"><a href="/content/news/show/1.html">教师招聘考试通知</a></div></div>`, card('/content/news/show/1.html', null, '')]) {
    assert.throws(() => parseChangchunTalentList(html, source), /新区人才/);
  }
});

test('脚本样式和注释中的假列表不参与提取，标题实体安全还原', () => {
  const decoy = card('/content/news/show/999.html');
  const html = `<!--${decoy}--><script>${decoy}</script><style>${decoy}</style>${card('/content/news/show/10.html', '2026-09-29', '<span>教师&nbsp;招聘 &amp; 考试通知</span>')}`;
  const result = parseChangchunTalentList(html, source);
  assert.equal(result.length, 1);
  assert.equal(result[0].title, '教师 招聘 & 考试通知');
});

test('仅接受这两个显式来源配置，错误不泄露输入内容', () => {
  for (const url of [null, 'not-a-url', 'http://rcjy.ccxq.gov.cn/content/news/list/3/1.html', 'https://evil.example/content/news/list/3/1.html', `${origin}/content/news/list/5/1.html`, `${origin}/content/news/list/3/2.html`, 'https://u:p@rcjy.ccxq.gov.cn/content/news/list/3/1.html', `${source.url}?token=private-canary`]) {
    assert.throws(() => parseChangchunTalentList(noticesFixture, { url }), (error) => {
      assert.match(error.message, /新区人才/);
      assert.doesNotMatch(error.message, /private-canary|u:p/);
      return true;
    });
  }
  assert.throws(() => parseChangchunTalentList(null, source), /新区人才/);
  assert.equal(source.url, `${origin}/content/news/list/3/1.html`);
});

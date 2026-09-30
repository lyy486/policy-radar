import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchOfficialSource, isRelevantTeacherTitle, parseOfficialList, syncSources, PARSER_VERSION } from '../src/sync-service.js';

const source = {
  id: 'fixture-jilin',
  name: '吉林来源测试页',
  url: 'https://example.gov.cn/notice/',
  regionIds: ['jilin'],
  category: '教师招聘',
  titlePattern: '教师|特岗',
  enabled: true,
  userAgent: 'PolicyRadarTest/1.0'
};

const html = '<a href="/2026/09/24/t20260924_1.html">吉林省特岗教师招聘报名公告</a><a href="/2026/09/24/t20260924_2.html">普通会议通知</a>';
const fetchImpl = async () => ({ ok: true, status: 200, headers: { get: () => null }, text: async () => html });

test('来源 5xx 只重试一次并且恢复后保留真实结果', async () => {
  let attempts = 0;
  const result = await fetchOfficialSource(source, async () => {
    attempts += 1;
    return attempts === 1 ? { ok: false, status: 503 } : fetchImpl();
  });
  assert.equal(attempts, 2);
  assert.equal(result.policies.length, 1);
});

test('未获准 HTTP 和超限响应在解析前安全拒绝', async () => {
  await assert.rejects(() => fetchOfficialSource({ ...source, url: 'http://example.gov.cn/' }, async () => assert.fail('未获准来源不得发请求')), /HTTP 来源未明确获准/);
  await assert.rejects(() => fetchOfficialSource(source, async () => ({ ok: true, status: 200, headers: { 'content-length': '1500001' }, text: async () => assert.fail('超限正文不得读取') })), /来源响应过大/);
  await assert.rejects(() => fetchOfficialSource(source, async () => ({ ok: true, status: 200, text: async () => 'x'.repeat(1500001) })), /来源响应过大/);
});

test('同步只发布来源允许的教师政策并生成去重提醒', async () => {
  const store = {
    policies: [],
    subscriptions: [{ id: 'sub-1', regionIds: ['jilin'], policyTypes: ['特岗教师'], categories: ['报名时间'], keywords: [], enabled: true }],
    notifications: []
  };
  const first = await syncSources({ store, sources: [source], fetchImpl });
  assert.equal(first[0].inserted, 1);
  assert.match(first[0].runId, /^[a-f0-9]{32}$/);
  assert.equal(first[0].parserVersion, PARSER_VERSION);
  assert.equal(first[0].notifications, 1);
  assert.equal(store.policies[0].policyType, '特岗教师');
  assert.equal(store.policies[0].category, '报名时间');
  assert.equal(store.policies[0].publishedAt, '2026-09-24T01:00:00.000Z');
  assert.equal(store.notifications.length, 1);

  const second = await syncSources({ store, sources: [source], fetchImpl });
  assert.equal(second[0].inserted, 0);
  assert.equal(second[0].notifications, 0);
  assert.equal(store.notifications.length, 1);
});

test('来源网络异常只短暂重试一次并继续正常去重', async () => {
  let attempts = 0;
  const store = { policies: [], subscriptions: [], notifications: [] };
  const result = await syncSources({
    store,
    sources: [source],
    fetchImpl: async () => {
      attempts += 1;
      if (attempts === 1) throw new Error('暂时网络错误');
      return { ok: true, status: 200, headers: { get: () => null }, text: async () => html };
    }
  });
  assert.equal(attempts, 2);
  assert.equal(result[0].status, 'ok');
  assert.equal(result[0].inserted, 1);
});

test('来源 4xx 不重试，避免对拒绝请求增加压力', async () => {
  let attempts = 0;
  const result = await syncSources({
    store: { policies: [], subscriptions: [], notifications: [] },
    sources: [source],
    fetchImpl: async () => {
      attempts += 1;
      return { ok: false, status: 403, headers: { get: () => null }, text: async () => '' };
    }
  });
  assert.equal(attempts, 1);
  assert.equal(result[0].status, 'failed');
});

test('来源返回空页或拦截页时不能伪装成成功的零条结果', async () => {
  const result = await syncSources({
    store: { policies: [], subscriptions: [], notifications: [] },
    sources: [source],
    fetchImpl: async () => ({ ok: true, status: 200, headers: { get: () => null }, text: async () => '<html><body>访问验证</body></html>' })
  });
  assert.equal(result[0].status, 'failed');
  assert.match(result[0].error, /公开列表链接/);
});

test('同步会复用来源缓存校验器并保存新的 ETag', async () => {
  const calls = [];
  const store = { policies: [], subscriptions: [], notifications: [], sourceState: {} };
  const fetchImpl = async (_url, options) => {
    calls.push(options.headers);
    return {
      ok: true,
      status: 200,
      headers: { get: (name) => name.toLowerCase() === 'etag' ? '"v1"' : null },
      text: async () => '<a href="/2026/09/24/t20260924_1.html">吉林省特岗教师招聘报名公告</a>'
    };
  };

  await syncSources({ store, sources: [source], fetchImpl });
  assert.equal(calls[0]['if-none-match'], undefined);
  assert.equal(store.sourceState[source.id].etag, '"v1"');
  assert.equal(store.sourceState[source.id].parserVersion, PARSER_VERSION);

  await syncSources({ store, sources: [source], fetchImpl });
  assert.equal(calls[1]['if-none-match'], '"v1"');
});

test('解析器版本变化时忽略旧缓存头并重新读取正文', async () => {
  const calls = [];
  const store = { policies: [], subscriptions: [], notifications: [], sourceState: {
    [source.id]: { etag: '"old"', lastModified: 'yesterday', parserVersion: 'old-parser' }
  } };
  const result = await syncSources({
    store,
    sources: [source],
    fetchImpl: async (_url, options) => {
      calls.push(options.headers);
      return { ok: true, status: 200, headers: { get: () => null }, text: async () => html };
    }
  });
  assert.equal(result[0].status, 'ok');
  assert.equal(calls[0]['if-none-match'], undefined);
  assert.equal(calls[0]['if-modified-since'], undefined);
  assert.equal(store.sourceState[source.id].parserVersion, PARSER_VERSION);
});

test('来源返回 304 时不重新解析或重复提醒', async () => {
  const store = {
    policies: [],
    subscriptions: [{ id: 'sub-1', regionIds: ['jilin'], policyTypes: ['特岗教师'], categories: ['报名时间'], keywords: [], enabled: true }],
    notifications: [],
    sourceState: { [source.id]: { etag: '"v1"', lastSeen: 1, parserVersion: PARSER_VERSION } }
  };
  const result = await syncSources({
    store,
    sources: [source],
    fetchImpl: async (_url, options) => {
      assert.equal(options.headers['if-none-match'], '"v1"');
      return { ok: false, status: 304, headers: { get: () => '"v1"' }, text: async () => { throw new Error('304 不应读取正文'); } };
    }
  });
  assert.equal(result[0].status, 'not-modified');
  assert.equal(result[0].inserted, 0);
  assert.equal(result[0].notifications, 0);
  assert.equal(store.policies.length, 0);
});

test('同步忽略跳出官方域名的链接', async () => {
  const externalHtml = '<a href="https://phishing.example/2026/09/24/fake.html">特岗教师招聘公告</a><a href="/2026/09/24/official.html">特岗教师报名公告</a>';
  const externalFetch = async () => ({ ok: true, status: 200, headers: { get: () => null }, text: async () => externalHtml });
  const store = { policies: [], subscriptions: [], notifications: [] };
  const result = await syncSources({ store, sources: [source], fetchImpl: externalFetch });
  assert.equal(result[0].inserted, 1);
  assert.equal(store.policies[0].sourceUrl, 'https://example.gov.cn/2026/09/24/official.html');
});

test('本地明确允许的 HTTP 官方来源可以解析同源链接', () => {
  const httpSource = { id: 'http-source', name: 'HTTP 官方测试来源', url: 'http://example.gov.cn/notice/', regionIds: ['changchun'], category: '教师招聘', titlePattern: '教师', transport: 'http', allowHttp: true };
  const policies = parseOfficialList('<a href="/notice/20260925.html">长春市教师招聘公告</a>', httpSource, new Date('2026-09-25T00:00:00Z'));
  assert.equal(policies.length, 1);
  assert.equal(policies[0].sourceUrl, 'http://example.gov.cn/notice/20260925.html');
});

test('同步不会访问禁用来源', async () => {
  let fetchCount = 0;
  const result = await syncSources({
    store: { policies: [], subscriptions: [], notifications: [] },
    sources: [{ enabled: false, id: 'disabled-source', url: 'https://example.gov.cn/' }],
    fetchImpl: async () => { fetchCount += 1; throw new Error('不应被调用'); }
  });
  assert.equal(fetchCount, 0);
  assert.deepEqual(result, []);
});

test('同步排除同页面中的中高考等无关通知', async () => {
  const unrelatedHtml = '<a href="/2026/09/24/teacher.html">教师资格认定公告</a><a href="/2026/09/24/zhongkao.html">2026年中考成绩发布通知</a>';
  const unrelatedFetch = async () => ({ ok: true, status: 200, headers: { get: () => null }, text: async () => unrelatedHtml });
  const store = { policies: [], subscriptions: [], notifications: [] };
  const result = await syncSources({ store, sources: [source], fetchImpl: unrelatedFetch });
  assert.equal(result[0].inserted, 1);
  assert.equal(store.policies[0].title, '教师资格认定公告');
});

test('从标题识别长春区县并优先分类资格审查', () => {
  const source = { id: 'changchun-test', name: '长春官方来源', url: 'https://example.gov.cn/notice/', regionIds: ['changchun'], category: '教师招聘', titlePattern: '教师|招聘|资格|面试' };
  const html = '<a href="/notice/20260925.shtml">长春市朝阳区2026年教师招聘面试资格复审通知</a>';
  const policies = parseOfficialList(html, source, new Date('2026-09-25T00:00:00Z'));
  assert.equal(policies.length, 1);
  assert.equal(policies[0].regionId, 'chaoyang-cc');
  assert.equal(policies[0].category, '资格审查');
});

test('从标题识别吉林省市县并保留全省来源的地区归属', () => {
  const source = { id: 'jilin-test', name: '吉林省官方来源', url: 'https://example.gov.cn/notice/', regionIds: ['jilin'], category: '教师招聘', titlePattern: '教师|招聘|资格' };
  const html = '<a href="/notice/tonghua.shtml">通化市教育局关于教师招聘资格审查公告</a><a href="/notice/huinan.shtml">辉南县教育局教师招聘公告</a><a href="/notice/multi.shtml">通化市、白山市联合教师招聘公告</a>';
  const policies = parseOfficialList(html, source, new Date('2026-09-25T00:00:00Z'));
  assert.deepEqual(policies.map((policy) => policy.regionId), ['tonghua', 'huinan-th', 'jilin']);
});

test('教师资格认定公告归入资格审查事项', () => {
  const policies = parseOfficialList(
    '<a href="/2026/notice.html">长春市教育局关于2026年下半年中小学教师资格认定工作公告</a> 2026-09-23',
    { id: 'cc', url: 'https://jyj.changchun.gov.cn/xxgk/tzgg/', regionIds: ['changchun'], category: '教师招聘' },
    new Date('2026-09-25T00:00:00Z')
  );
  assert.equal(policies[0].policyType, '教师资格考试');
  assert.equal(policies[0].category, '资格审查');
});

test('被官方列表截断的教师资格标题仍不归入招聘公告', () => {
  const policies = parseOfficialList(
    '<a href="/2026/notice.html">长春市教育局关于2026年上半年第二批次中小学教师资格...</a> 2026-06-11',
    { id: 'cc', url: 'https://jyj.changchun.gov.cn/xxgk/tzgg/', regionIds: ['changchun'], category: '教师招聘' },
    new Date('2026-09-25T00:00:00Z')
  );
  assert.equal(policies[0].category, '资格审查');
});

test('从链接旁的日期文本解析发布日期，并保留 PDF 官方正文链接', () => {
  const source = { id: 'date-adjacent-test', name: '日期邻近测试来源', url: 'https://example.gov.cn/notice/', regionIds: ['changchun'], category: '教师招聘', titlePattern: '教师' };
  const html = '<li><a href="/notice/detail.html">长春市教师招聘报名公告</a><span>2026年09月23日</span></li>'
    + '<li><a href="/notice/attachment.pdf">长春市特岗教师招聘公告</a><span>2026-09-22</span></li>';
  const policies = parseOfficialList(html, source, new Date('2026-09-25T00:00:00Z'));
  assert.equal(policies.length, 2);
  assert.equal(policies[0].publishedAt, '2026-09-23T01:00:00.000Z');
  assert.equal(policies[1].sourceUrl, 'https://example.gov.cn/notice/attachment.pdf');
  assert.equal(policies[1].publishedAt, '2026-09-22T01:00:00.000Z');
});

test('发布日期优先使用同条目日期，不被标题中的招聘年度误导', () => {
  const source = { id: 'date-priority-test', name: '日期优先级测试来源', url: 'https://example.gov.cn/notice/', regionIds: ['jilin'], category: '教师招聘', titlePattern: '教师' };
  const html = '<li><a href="/notice/20250601/detail.html">2025年吉林省教师招聘报名公告</a><span>2026年09月23日</span></li>';
  const policies = parseOfficialList(html, source, new Date('2026-09-25T00:00:00Z'));
  assert.equal(policies.length, 1);
  assert.equal(policies[0].publishedAt, '2026-09-23T01:00:00.000Z');
});

test('没有可验证发布日期时不把抓取时间冒充发布日期', () => {
  const source = { id: 'date-missing-test', name: '缺少日期测试来源', url: 'https://example.gov.cn/notice/', regionIds: ['jilin'], category: '教师招聘', titlePattern: '教师' };
  const policies = parseOfficialList('<a href="/notice/detail.html">教师招聘公告</a>', source, new Date('2026-09-25T00:00:00Z'));
  assert.equal(policies.length, 1);
  assert.equal(policies[0].publishedAt, null);
});

test('日期字段超出月份范围时不伪造发布时间', () => {
  const source = { id: 'date-test', name: '日期测试来源', url: 'https://example.gov.cn/notice/', regionIds: ['jilin'], category: '教师招聘', titlePattern: '教师' };
  const policies = parseOfficialList('<a href="/notice/20261340.html">2026年13月40日教师招聘公告</a>', source, new Date('2026-09-25T00:00:00Z'));
  assert.equal(policies.length, 1);
  assert.equal(policies[0].publishedAt, null);
});

test('日期字段超出当月实际天数时不伪造发布时间', () => {
  const source = { id: 'date-day-test', name: '日期测试来源', url: 'https://example.gov.cn/notice/', regionIds: ['jilin'], category: '教师招聘', titlePattern: '教师' };
  const policies = parseOfficialList('<a href="/notice/20260231.html">2026年2月31日教师招聘公告</a>', source, new Date('2026-09-25T00:00:00Z'));
  assert.equal(policies.length, 1);
  assert.equal(policies[0].publishedAt, null);
});

test('来源排除规则可以阻止相似但无关的职业培训通知', () => {
  const source = { id: 'hrss-filter-test', name: '人社测试来源', url: 'https://example.gov.cn/notice/', regionIds: ['baishan'], category: '教师招聘', titlePattern: '教师|教育|学校', excludeTitlePattern: '职业技能|培训补贴|专业技术资格|职称|评审' };
  const html = '<a href="/notice/20260925.html">职业教育中心培训补贴公示</a><a href="/notice/20260924.html">中小学教师招聘公告</a>';
  const policies = parseOfficialList(html, source, new Date('2026-09-25T00:00:00Z'));
  assert.deepEqual(policies.map((policy) => policy.title), ['中小学教师招聘公告']);
});

test('相关性规则拒绝历史中高考标题', () => {
  assert.equal(isRelevantTeacherTitle('教师招聘公告'), true);
  assert.equal(isRelevantTeacherTitle('长春市事业单位公开招聘公告'), false);
  assert.equal(isRelevantTeacherTitle('长春市教育系统公开招聘中小学教师公告'), true);
  assert.equal(isRelevantTeacherTitle('关于公布在职教师违规补课监督举报电话的公告'), false);
  assert.equal(isRelevantTeacherTitle('教师培训项目开班通知'), false);
  assert.equal(isRelevantTeacherTitle('2026年中考成绩发布通知'), false);
  assert.equal(isRelevantTeacherTitle('教师职称评审拟通过人员公示'), false);
  assert.equal(isRelevantTeacherTitle('中小学教师资格认定公告'), true);
});

test('HTTP 200 维护和验证页面仅含首页链接时失败且不覆盖历史成功时间', async () => {
  const cases = [
    ['<h1>网站维护中</h1><a href="/index.html">返回网站首页</a>', /维护/],
    ['<h1>请完成验证码验证</h1><a href="/index.html">返回网站首页</a>', /验证|拦截/],
    ['<a href="/index.html">网站首页导航</a>', /公开列表链接/]
  ];
  for (const [body, expected] of cases) {
    const previous = { lastSuccessAt: '2026-09-20T01:00:00.000Z', lastSeen: 3, etag: '"known-good"' };
    const store = { policies: [], subscriptions: [], notifications: [], sourceState: { [source.id]: previous } };
    const result = await syncSources({ store, sources: [source], fetchImpl: async () => ({ ok: true, status: 200, text: async () => body }) });
    assert.equal(result[0].status, 'failed');
    assert.match(result[0].error, expected);
    assert.equal(store.sourceState[source.id].lastSuccessAt, previous.lastSuccessAt);
    assert.equal(store.sourceState[source.id].lastSeen, 3);
    assert.equal(store.sourceState[source.id].etag, '"known-good"');
  }
});

test('可识别的公开列表没有教师公告仍是有效零匹配结果', async () => {
  const result = await fetchOfficialSource(source, async () => ({ ok: true, status: 200, text: async () => '<li><a href="/2026/09/29/notice.html">普通会议通知</a><span>2026-09-29</span></li>' }));
  assert.deepEqual(result.policies, []);
});

test('日期不从上一条目或下一条目的日期跨越赋给缺日期公告', () => {
  const body = '<li><a href="/notice/first.html">教师招聘第一公告</a><span>2026-09-28</span></li>'
    + '<li><a href="/notice/middle.html">教师招聘缺少日期公告</a></li>'
    + '<li><span>2026-09-30</span><a href="/notice/last.html">教师招聘最后公告</a></li>';
  const policies = parseOfficialList(body, source);
  assert.deepEqual(policies.map((policy) => policy.publishedAt), ['2026-09-28T01:00:00.000Z', null, '2026-09-30T01:00:00.000Z']);
});

test('列表重复链接只生成一次政策且拒绝同域不同端口和用户信息链接', () => {
  const body = '<a href="/notice/same.html">教师招聘公告</a><a href="/notice/same.html">教师招聘公告</a>'
    + '<a href="https://example.gov.cn:444/notice/port.html">教师招聘端口公告</a>'
    + '<a href="https://name@example.gov.cn/notice/user.html">教师招聘用户公告</a>';
  const policies = parseOfficialList(body, source);
  assert.equal(policies.length, 1);
  assert.equal(policies[0].sourceUrl, 'https://example.gov.cn/notice/same.html');
});

test('维护或拦截页中的帮助详情链接不构成公告列表且保留可信状态', async () => {
  for (const [body, expected] of [
    ['<h1>Under maintenance</h1><a href="/help.html">Help center</a>', /维护/],
    ['<p>Under maintenance</p><a href="/help.html">Help center</a>', /维护/],
    ['<h1>请完成安全验证</h1><a href="/help.html">查看帮助说明</a>', /验证|拦截/],
    ['<title>Under maintenance</title><a href="/help.html">网站维护通知</a>', /维护/],
    ['<a href="/help.html">Help center</a>', /公开列表链接/]
  ]) {
    const previous = { lastSuccessAt: '2026-09-20T01:00:00.000Z', lastSeen: 3, etag: '"known-good"' };
    const store = { policies: [], subscriptions: [], notifications: [], sourceState: { [source.id]: previous } };
    const result = await syncSources({ store, sources: [source], fetchImpl: async () => ({ ok: true, status: 200, text: async () => body }) });
    assert.equal(result[0].status, 'failed');
    assert.match(result[0].error, expected);
    assert.equal(store.sourceState[source.id].lastSuccessAt, previous.lastSuccessAt);
    assert.equal(store.sourceState[source.id].lastSeen, 3);
    assert.equal(store.sourceState[source.id].etag, '"known-good"');
  }
});

test('真正公告列表中出现维护或验证码字样不会误判来源故障', async () => {
  for (const title of ['教师招聘报名系统维护通知', '教师资格报名验证码获取方式通知']) {
    const body = `<title>官方公告列表</title><h1>通知公告</h1><li><a href="/notice/20260930.html">${title}</a><span>2026-09-30</span></li>`;
    const result = await fetchOfficialSource(source, async () => ({ ok: true, status: 200, text: async () => body }));
    assert.equal(result.policies.length, 1);
    assert.equal(result.policies[0].title, title);
  }
  const body = '<h1>通知公告</h1><li><a href="/notice/20260930.html">普通网站维护通知</a><span>2026-09-30</span></li>';
  const result = await fetchOfficialSource(source, async () => ({ ok: true, status: 200, text: async () => body }));
  assert.deepEqual(result.policies, []);
});

test('笔试和面试成绩公告按成绩事件分类而不是考试形式', () => {
  for (const title of [
    '2026年上半年中小学教师资格考试笔试成绩发布公告',
    '2025年下半年中小学教师资格考试（笔试）成绩复核公告',
    '2026年上半年中小学教师资格考试面试成绩发布公告',
    '关于2026年教师招聘笔试分数查询的通知'
  ]) {
    const [policy] = parseOfficialList(`<a href="/notice/20260930.html">${title}</a>`, source);
    assert.equal(policy.category, '成绩', title);
  }
});

test('成绩分类修复保留报名和纯笔试面试及资格审查的原有正例', () => {
  for (const [title, expected] of [
    ['2026年教师资格考试（笔试）报名公告', '报名时间'],
    ['2026年教师资格考试（笔试）公告', '笔试时间'],
    ['2026年教师资格考试笔试时间及准考证打印公告', '笔试时间'],
    ['2026年教师资格考试面试安排及准考证打印通知', '面试'],
    ['2026年教师资格考试（笔试）报名与准考证打印须知', '报名时间'],
    ['2026年教师招聘面试安排通知', '面试'],
    ['2026年教师招聘面试资格复审公告', '资格审查']
  ]) {
    const [policy] = parseOfficialList(`<a href="/notice/20260930.html">${title}</a>`, source);
    assert.equal(policy.category, expected, title);
  }
});

test('准考证专门通知使用一般公告而不是将打印日误当考试时间', () => {
  for (const title of [
    '2026年中小学教师资格考试（笔试）准考证打印公告',
    '2026年教师招聘笔试准考证下载通知',
    '2026年中小学教师资格考试面试准考证有关事项通知'
  ]) {
    const [policy] = parseOfficialList(`<a href="/notice/20260930.html">${title}</a>`, source);
    assert.equal(policy.category, '招聘公告', title);
  }
});

test('新解析版本刷新已有成绩公告分类而不改变哈希或重复插入', async () => {
  const body = '<a href="/notice/20260930.html">2026年教师资格考试笔试成绩发布公告</a>';
  const cached = { ...parseOfficialList(body, source)[0], category: '笔试时间' };
  const store = { policies: [cached], subscriptions: [], notifications: [], sourceState: {
    [source.id]: { parserVersion: '2026-09-30.2', etag: '"previous-classification"' }
  } };
  const results = await syncSources({ store, sources: [source], fetchImpl: async (_url, options) => {
    assert.equal(options.headers['if-none-match'], undefined);
    return { ok: true, status: 200, text: async () => body };
  } });
  assert.equal(results[0].status, 'ok');
  assert.equal(results[0].inserted, 0);
  assert.equal(store.policies[0].category, '成绩');
  assert.equal(store.policies[0].contentHash, cached.contentHash);
});

test('显式详情目录只接收同源目录内链接并拒绝越栏目和协议变更', () => {
  const scoped = { ...source, url: 'http://example.gov.cn/sydw/', allowHttp: true, detailPathPrefix: '/ywdt/tzgg/' };
  const links = [
    '/ywdt/tzgg/20260930.html', '/ywdt/tzgg/sub/20260930.html',
    '/ywdt/tzgg-extra/20260930.html', '/ywdt/other/20260930.html',
    '/ywdt/tzgg/../other/20260930.html', '/ywdt/tzgg/%2e%2e/other/20260930.html',
    '/ywdt/tzgg/%2e%2e%2fother/20260930.html', '/ywdt/tzgg/%252e%252e%252fother/20260930.html',
    '/ywdt/tzgg/%ZZ/20260930.html',
    'https://example.gov.cn/ywdt/tzgg/20260930.html',
    'http://external.gov.cn/ywdt/tzgg/20260930.html',
    'http://user@example.gov.cn/ywdt/tzgg/20260930.html'
  ];
  const body = links.map((url, index) => `<a href="${url}">教师招聘公告${index}</a>`).join('');
  const policies = parseOfficialList(body, scoped);
  assert.deepEqual(policies.map((policy) => policy.sourceUrl), ['http://example.gov.cn/ywdt/tzgg/20260930.html', 'http://example.gov.cn/ywdt/tzgg/sub/20260930.html']);
  assert.equal(parseOfficialList(body, { ...scoped, detailPathPrefix: '/ywdt/tzgg' }).length, 2);
  for (const detailPathPrefix of ['not-absolute', '//external.example/', '/ywdt/../', '/ywdt/?column=1', true]) {
    assert.deepEqual(parseOfficialList(body, { ...scoped, detailPathPrefix }), []);
  }
});

test('限定栏目只有其他栏目链接时不能作为有效公开列表，未限定来源保持兼容', async () => {
  const body = '<a href="/other/20260930.html">教师招聘公告</a>';
  assert.equal(parseOfficialList(body, source).length, 1);
  await assert.rejects(() => fetchOfficialSource({ ...source, detailPathPrefix: '/ywdt/tzgg/' }, async () => ({ ok: true, status: 200, text: async () => body })), /公开列表链接/);
});

test('综合事业单位线索仅显式开启来源收录且明确教师岗位待核验', () => {
  const body = [
    '长春市事业单位公开招聘公告', '吉林省事业单位招录公告',
    '长春市事业单位选聘公告', '吉林省事业单位公开考试公告',
    '吉林省企业公开招聘公告', '吉林省事业单位年度会议通知'
  ].map((title, index) => `<a href="/notice/20260930_${index}.html">${title}</a>`).join('');
  for (const includeGeneralRecruitment of [undefined, false, 'true']) {
    assert.deepEqual(parseOfficialList(body, { ...source, includeGeneralRecruitment }), []);
  }
  const policies = parseOfficialList(body, { ...source, includeGeneralRecruitment: true });
  assert.equal(policies.length, 4);
  for (const policy of policies) {
    assert.equal(policy.requiresTeacherVerification, true);
    assert.equal(policy.summary, '综合事业单位招聘线索，是否包含教师岗位、编制性质和考试安排，需核对官方正文及岗位表。');
    assert.doesNotMatch(policy.summary, /已确认|教师编制岗位已/);
  }
});

test('综合线索开关不改变明确教师公告也不绕过排除规则', () => {
  const body = '<a href="/notice/20260930.html">长春市事业单位中小学教师招聘公告</a>';
  const now = new Date('2026-09-30T00:00:00Z');
  const ordinary = parseOfficialList(body, source, now);
  const enabled = parseOfficialList(body, { ...source, includeGeneralRecruitment: true }, now);
  assert.deepEqual(enabled, ordinary);
  assert.equal(enabled[0].requiresTeacherVerification, undefined);
  const excluded = '<a href="/notice/20260930.html">事业单位职业技能岗位公开招聘公告</a>';
  assert.deepEqual(parseOfficialList(excluded, { ...source, includeGeneralRecruitment: true }), []);
  const customExcluded = '<a href="/notice/20260930.html">事业单位驾驶员公开招聘公告</a>';
  assert.deepEqual(parseOfficialList(customExcluded, { ...source, includeGeneralRecruitment: true, excludeTitlePattern: '驾驶员' }), []);
});

test('综合线索重复链接及重复同步只产生一份政策并保留待核验标记', async () => {
  const scoped = { ...source, includeGeneralRecruitment: true };
  const link = '<a href="/notice/20260930.html">长春市事业单位公开招聘公告</a>';
  const store = { policies: [], subscriptions: [], notifications: [] };
  const fetchImpl = async () => ({ ok: true, status: 200, text: async () => link + link });
  const first = await syncSources({ store, sources: [scoped], fetchImpl });
  assert.equal(first[0].inserted, 1);
  const hash = store.policies[0].contentHash;
  const second = await syncSources({ store, sources: [scoped], fetchImpl });
  assert.equal(second[0].inserted, 0);
  assert.equal(store.policies.length, 1);
  assert.equal(store.policies[0].contentHash, hash);
  assert.equal(store.policies[0].requiresTeacherVerification, true);
});

test('已有同哈希综合公告同步时补上待核验信息而不重复插入', async () => {
  const scoped = { ...source, includeGeneralRecruitment: true };
  const body = '<a href="/notice/20260930.html">长春市事业单位公开招聘公告</a>';
  const parsed = parseOfficialList(body, scoped)[0];
  const { requiresTeacherVerification, ...cached } = parsed;
  const store = { policies: [{ ...cached, summary: '旧版公告摘要' }], subscriptions: [], notifications: [] };
  const results = await syncSources({ store, sources: [scoped], fetchImpl: async () => ({ ok: true, status: 200, text: async () => body }) });
  assert.equal(results[0].inserted, 0);
  assert.equal(store.policies.length, 1);
  assert.equal(store.policies[0].contentHash, parsed.contentHash);
  assert.equal(store.policies[0].requiresTeacherVerification, true);
  assert.equal(store.policies[0].summary, parsed.summary);
});

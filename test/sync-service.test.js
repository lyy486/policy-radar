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

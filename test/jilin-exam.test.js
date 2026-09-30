import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchOfficialSource, parseOfficialList, syncSources } from '../src/sync-service.js';

const source = {
  id: 'fixture-jilin-exam', name: '吉林省教育考试院教资栏目',
  url: 'https://www.jleea.com.cn/server-front/front/content/page?isStatic=false&pageSize=15&channelIdStr=10649&isPageQuery=true&pageNum=1',
  parser: 'jilin-exam', enabled: true, regionIds: ['jilin'], policyType: '教师资格考试', titlePattern: '教师资格'
};
// Public API fields and samples observed on 2026-09-30; failures below are synthetic.
const record = { id: 202828, title: '2026年下半年中小学教师资格考试 （笔试）考前温馨提示',
  publishTime: '2026-09-07 09:05:25', publishTimeStr: '2026-09-07 09:05:25',
  url: 'https://www.jleea.com.cn/front/content/202828', channelName: '中小学教师资格考试', channelId: 10649 };
const envelope = (records = [record], metadata = {}) => ({ code: '00000 00000', data: { total: 104, current: 1, records, ...metadata } });
const response = (body) => async (_url, options) => {
  assert.equal(options.redirect, 'manual');
  return { status: 200, ok: true, headers: { get: () => null }, text: async () => JSON.stringify(body) };
};

test('显式教资适配读取真实JSON结构并按中国时区准确保留发布日期', async () => {
  const result = await fetchOfficialSource(source, response(envelope()), new Date('2026-09-30T00:00:00Z'));
  assert.equal(result.policies.length, 1);
  assert.equal(result.policies[0].sourceUrl, record.url);
  assert.equal(result.policies[0].publishedAt, '2026-09-07T01:05:25.000Z');
  assert.equal(result.policies[0].sourcePublishedAt, record.publishTime);
  assert.equal(result.policies[0].policyType, '教师资格考试');
  assert.equal(result.policies[0].category, '笔试时间');
});

test('教资接口请求声明JSON且保留禁止自动重定向', async () => {
  await fetchOfficialSource(source, async (_url, options) => {
    assert.match(options.headers.accept, /application\/json/);
    return response(envelope())(_url, options);
  });
});

test('教资适配只接受API原生同源HTTPS已知详情路径并去重', async () => {
  const records = [record, record,
    { ...record, id: 202668, url: 'https://www.jleea.com.cn/site1/xiangqingye/202668/', publishTime: '2026-05-12 16:45:13' },
    { ...record, url: 'http://www.jleea.com.cn/front/content/202828' },
    { ...record, url: 'https://evil.example/front/content/202828' },
    { ...record, url: 'https://www.jleea.com.cn:444/front/content/202828' },
    { ...record, url: 'https://u@www.jleea.com.cn/front/content/202828' },
    { ...record, url: 'https://www.jleea.com.cn/front/channel/10649' },
    { ...record, url: 'https://www.jleea.com.cn/arbitrary/202828' },
    { ...record, url: 'https://www.jleea.com.cn/front/content/12345' },
    { ...record, channelId: 10000 },
    { ...record, url: '' }];
  const result = await fetchOfficialSource(source, response(envelope(records)));
  assert.equal(result.policies.length, 2);
  assert.equal(result.policies[1].publishedAt, '2026-05-12T08:45:13.000Z');
});

test('gov-list默认解析器不能自动接受无后缀详情或JSON接口', async () => {
  const normalSource = { ...source, parser: 'gov-list' };
  assert.deepEqual(parseOfficialList('<a href="/front/content/202828">教师资格考试笔试公告</a>', normalSource), []);
  await assert.rejects(() => fetchOfficialSource(normalSource, async () => ({ status: 200, ok: true, text: async () => JSON.stringify(envelope()) })), /公开列表链接/);
});

test('教资接口明确空列表为有效结果，非教师条目不误作来源失败', async () => {
  const empty = await fetchOfficialSource(source, response(envelope([], { total: 0 })));
  assert.deepEqual(empty.policies, []);
  const unrelated = await fetchOfficialSource(source, response(envelope([{ ...record, title: '普通会议通知' }])));
  assert.deepEqual(unrelated.policies, []);
});

test('教资接口错误或结构变更不能报告成功且保留上次成功时间', async () => {
  for (const payload of [
    { code: 'failed', data: envelope().data }, { code: '00000 00000', data: {} },
    envelope([], { total: 104 }), envelope([record], { total: -1 }), envelope([record], { current: 0 }),
    envelope([{ ...record, url: 'https://evil.example/front/content/202828' }])
  ]) {
    const store = { policies: [], subscriptions: [], notifications: [], sourceState: { [source.id]: { lastSuccessAt: '2026-09-20T00:00:00Z' } } };
    const result = await syncSources({ store, sources: [source], fetchImpl: response(payload) });
    assert.equal(result[0].status, 'failed');
    assert.equal(store.sourceState[source.id].lastSuccessAt, '2026-09-20T00:00:00Z');
    assert.match(result[0].error, /教资接口/);
  }
});

test('教资接口返回维护HTML时安全失败且不泄漏原始内容', async () => {
  await assert.rejects(() => fetchOfficialSource(source, async () => ({ status: 200, ok: true, text: async () => '<h1>维护中</h1><a href="/">主页</a> private-canary-value' })), (error) => {
    assert.match(error.message, /教资接口/);
    assert.doesNotMatch(error.message, /private-canary/);
    return true;
  });
});

test('教资非法日期或缺少发布日期不借用另一条日期也不伪造抓取时间', async () => {
  for (const publishTime of ['', null, '2026-02-31 09:00:00', '2026-09-30 24:00:00', 'not-a-date']) {
    const result = await fetchOfficialSource(source, response(envelope([{ ...record, publishTime, publishTimeStr: publishTime }])));
    assert.equal(result.policies[0].publishedAt, null);
  }
});

test('教资重复同步刷新准确时间和原始时间但不重复提醒', async () => {
  const store = { policies: [], subscriptions: [], notifications: [] };
  await syncSources({ store, sources: [source], fetchImpl: response(envelope()) });
  const changed = { ...record, publishTime: '2026-09-08 10:06:26' };
  const result = await syncSources({ store, sources: [source], fetchImpl: response(envelope([changed])) });
  assert.equal(result[0].inserted, 0);
  assert.equal(store.policies.length, 1);
  assert.equal(store.policies[0].publishedAt, '2026-09-08T02:06:26.000Z');
  assert.equal(store.policies[0].sourcePublishedAt, changed.publishTime);
});

test('教资接口来源配置与公告字段不符时返回固定安全错误', async () => {
  for (const url of [
    'https://www.jleea.com.cn/wrong?channelIdStr=10649',
    'https://www.jleea.com.cn/server-front/front/content/page',
    'https://www.jleea.com.cn/server-front/front/content/page?channelIdStr=invalid'
  ]) {
    await assert.rejects(() => fetchOfficialSource({ ...source, url }, response(envelope())), /教资接口地址/);
  }
  await assert.rejects(() => fetchOfficialSource(source, response(envelope([null]))), /教资接口公告字段/);
});

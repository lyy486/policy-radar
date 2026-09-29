import test from 'node:test';
import assert from 'node:assert/strict';
import { createPolicyService, JILIN_REGIONS } from '../src/policy-service.js';

function serviceWith(policies = []) {
  return createPolicyService({ store: { policies, subscriptions: [] } });
}

test('默认订阅幂等且停用操作只影响当前用户', () => {
  const store = { policies: [], subscriptions: [{ id: 'other', userId: 'other-user', enabled: true }], notifications: [] };
  const service = createPolicyService({ store, userId: 'current-user' });
  const first = service.ensureDefaultSubscription();
  assert.equal(first.userId, 'current-user');
  assert.deepEqual(service.ensureDefaultSubscription(), first);
  assert.equal(store.subscriptions.length, 2);
  assert.equal(service.disableSubscriptions()[0].enabled, false);
  assert.equal(store.subscriptions.find((item) => item.id === 'other').enabled, true);
  assert.deepEqual(service.listPolicyTypes(), ['教师招聘', '特岗教师', '教师资格考试']);
  assert.ok(service.listCategories().includes('报名时间'));
});

test('策略查询验证非法输入、时间范围和分页边界', () => {
  const service = serviceWith([
    { id: 'old', title: '早期教师招聘', regionId: 'jilin', category: '招聘公告', publishedAt: '2026-01-01T00:00:00Z' },
    { id: 'new', title: '最新教师招聘', regionId: 'jilin', category: '招聘公告', fetchedAt: '2026-02-01T00:00:00Z' }
  ]);
  assert.deepEqual(service.listPolicies({ regionId: 'all', policyType: '教师招聘', category: 'all', since: '2026-01-02', limit: 1 }).map((item) => item.id), ['new']);
  assert.equal(service.getPolicyById(), null);
  assert.equal(service.getPolicyById('x'.repeat(129)), null);
  for (const input of [null, [], 'invalid']) assert.throws(() => service.replaceSubscription(input), /格式错误/);
  for (const field of ['policyTypes', 'categories', 'channels']) {
    assert.throws(() => service.replaceSubscription({ regionIds: ['jilin'], [field]: [] }), /至少选择/);
  }
});

test('按地区、类别和关键词筛选并按时间倒序', () => {
  const service = serviceWith([
    { id: '1', title: '长春报名公告', summary: '资格要求', regionId: 'changchun', category: '报名时间', publishedAt: '2026-01-02T00:00:00Z' },
    { id: '2', title: '南关体检公告', summary: '时间安排', regionId: 'nanguan-cc', category: '体检', publishedAt: '2026-01-03T00:00:00Z' },
    { id: '3', title: '长春资格问答', summary: '报名说明', regionId: 'changchun', category: '教师资格考试', publishedAt: '2026-01-04T00:00:00Z' }
  ]);
  assert.deepEqual(service.listPolicies({ regionId: 'changchun', keyword: '资格' }).map((policy) => policy.id), ['3', '1']);
  assert.deepEqual(service.listPolicies({ category: '报名时间' }).map((policy) => policy.id), ['1']);
  assert.deepEqual(service.listPolicies({ regionId: 'changchun-all' }).map((policy) => policy.id), ['3', '2', '1']);
});

test('按政策 ID 查询详情不受列表分页限制且隐藏已归档记录', () => {
  const service = serviceWith([
    { id: 'older', title: '较早公告', regionId: 'changchun', category: '招聘公告', publishedAt: '2025-01-01T00:00:00Z' },
    { id: 'archived', title: '已归档公告', regionId: 'changchun', category: '招聘公告', isArchived: true }
  ]);
  assert.equal(service.getPolicyById('older').title, '较早公告');
  assert.equal(service.getPolicyById('archived'), null);
  assert.equal(service.getPolicyById('missing'), null);
});

test('长春全选不包含行政上独立的公主岭市', () => {
  const service = serviceWith([
    { id: 'cc', title: '长春教师公告', summary: '', regionId: 'changchun', category: '招聘公告', publishedAt: '2026-01-02T00:00:00Z' },
    { id: 'gzl', title: '公主岭教师公告', summary: '', regionId: 'gongzhuling-cc', category: '招聘公告', publishedAt: '2026-01-03T00:00:00Z' }
  ]);
  assert.deepEqual(service.listPolicies({ regionId: 'changchun-all' }).map((policy) => policy.id), ['cc']);
});

test('吉林省全选接口包含所有登记地区', () => {
  const service = serviceWith([
    { id: 'cc', title: '长春教师公告', summary: '', regionId: 'changchun', category: '招聘公告', publishedAt: '2026-01-02T00:00:00Z' },
    { id: 'jl', title: '吉林市教师公告', summary: '', regionId: 'jilin-city', category: '招聘公告', publishedAt: '2026-01-03T00:00:00Z' },
    { id: 'outside', title: '外省公告', summary: '', regionId: 'outside', category: '招聘公告', publishedAt: '2026-01-04T00:00:00Z' }
  ]);
  assert.deepEqual(service.listPolicies({ regionId: 'jilin-all' }).map((policy) => policy.id), ['jl', 'cc']);
});

test('吉林地区注册表包含官方站群列出的辉南县和长白山管委会', () => {
  assert.ok(JILIN_REGIONS.some((region) => region.name === '辉南县'));
  assert.ok(JILIN_REGIONS.some((region) => region.name === '长白山管委会'));
});

test('吉林省地区注册表包含县级地区且全省订阅不受 30 个地区限制', () => {
  const service = serviceWith();
  const regions = service.listRegions();
  assert.ok(regions.some((region) => region.id === 'yongji-jl' && region.name === '永吉县'));
  assert.ok(regions.some((region) => region.id === 'yanji-yb' && region.name === '延吉市'));
  const subscription = service.replaceSubscription({ regionIds: ['jilin-all'] });
  assert.equal(subscription.regionIds.length > 30, true);
  assert.equal(subscription.regionIds.length, regions.length);
});

test('订阅设置会去重、裁剪并拒绝空地区', () => {
  const service = serviceWith();
  assert.throws(() => service.replaceSubscription({ regionIds: [] }), /至少选择/);
  const subscription = service.replaceSubscription({ regionIds: ['changchun-all', 'changchun'], keywords: [' 报名 ', '', '报名'] });
  assert.deepEqual(subscription.regionIds, ['changchun', 'chaoyang-cc', 'nanguan-cc', 'kuancheng-cc', 'erdao-cc', 'lvyuan-cc', 'shuangyang-cc', 'jiutai-cc', 'jingyue-cc', 'lianhuashan-cc', 'dehui-cc', 'yushu-cc', 'nong-an-cc']);
  assert.deepEqual(subscription.keywords, ['报名']);
});

test('首次使用默认关注长春市及各区县的三类教师考试政策', () => {
  const service = serviceWith();
  const [subscription] = service.listSubscriptions();
  assert.equal(subscription.isDefault, true);
  assert.deepEqual(subscription.regionIds, [
    'changchun', 'chaoyang-cc', 'nanguan-cc', 'kuancheng-cc', 'erdao-cc', 'lvyuan-cc',
    'shuangyang-cc', 'jiutai-cc', 'jingyue-cc', 'lianhuashan-cc', 'dehui-cc', 'yushu-cc', 'nong-an-cc'
  ]);
  assert.deepEqual(subscription.policyTypes, ['教师招聘', '特岗教师', '教师资格考试']);
  assert.equal(subscription.enabled, true);
});

test('修改订阅范围会清理不再匹配的旧提醒', () => {
  const service = createPolicyService({ store: {
    policies: [
      { id: 'cc', title: '长春招聘公告', summary: '', regionId: 'changchun', policyType: '教师招聘', category: '招聘公告' },
      { id: 'jl', title: '吉林招聘公告', summary: '', regionId: 'jilin', policyType: '教师招聘', category: '招聘公告' }
    ],
    subscriptions: [{ id: 'sub', regionIds: ['jilin'], keywords: [], policyTypes: ['教师招聘'], categories: ['招聘公告'], enabled: true }],
    notifications: [
      { id: 'n1', policyId: 'cc', status: 'unread' },
      { id: 'n2', policyId: 'jl', status: 'unread' }
    ]
  } });
  service.replaceSubscription({ regionIds: ['changchun'], policyTypes: ['教师招聘'], categories: ['招聘公告'] });
  assert.deepEqual(service.listNotifications().map((notification) => notification.id), ['n1']);
});

test('通知标记接口拒绝非字符串 ID', () => {
  const service = serviceWith();
  assert.throws(() => service.markNotificationsRead({ ids: [123] }), /字符串/);
});

test('用户订阅和未读提醒互相隔离', () => {
  const store = {
    policies: [{ id: 'p1', title: '公告', summary: '', regionId: 'jilin', policyType: '教师招聘', category: '招聘公告' }],
    subscriptions: [
      { id: 'a', userId: 'user-a', regionIds: ['jilin'], policyTypes: ['教师招聘'], categories: ['招聘公告'], keywords: [], enabled: true },
      { id: 'b', userId: 'user-b', regionIds: ['jilin'], policyTypes: ['教师招聘'], categories: ['招聘公告'], keywords: [], enabled: true }
    ],
    notifications: [
      { id: 'na', subscriptionId: 'a', policyId: 'p1', status: 'unread', createdAt: '2026-09-25T00:00:00Z' },
      { id: 'nb', subscriptionId: 'b', policyId: 'p1', status: 'unread', createdAt: '2026-09-25T00:00:00Z' }
    ]
  };
  const first = createPolicyService({ store, userId: 'user-a' });
  assert.deepEqual(first.listNotifications().map((item) => item.id), ['na']);
  first.markNotificationsRead({ ids: ['na'] });
  assert.equal(store.notifications.find((item) => item.id === 'nb').status, 'unread');
});

test('无用户身份的兼容上下文也不能读取或修改其他用户提醒', () => {
  const store = {
    policies: [{ id: 'p1', title: '公告', summary: '', regionId: 'jilin', policyType: '教师招聘', category: '招聘公告' }],
    subscriptions: [
      { id: 'local', regionIds: ['jilin'], policyTypes: ['教师招聘'], categories: ['招聘公告'], keywords: [], enabled: true },
      { id: 'private', userId: 'user-b', regionIds: ['jilin'], policyTypes: ['教师招聘'], categories: ['招聘公告'], keywords: [], enabled: true }
    ],
    notifications: [
      { id: 'local-notice', subscriptionId: 'local', policyId: 'p1', status: 'unread', createdAt: '2026-09-25T00:00:00Z' },
      { id: 'private-notice', subscriptionId: 'private', policyId: 'p1', status: 'unread', createdAt: '2026-09-25T00:00:00Z' }
    ]
  };
  const service = createPolicyService({ store });
  assert.deepEqual(service.listNotifications().map((item) => item.id), ['local-notice']);
  service.markNotificationsRead({});
  assert.equal(store.notifications.find((item) => item.id === 'local-notice').status, 'read');
  assert.equal(store.notifications.find((item) => item.id === 'private-notice').status, 'unread');
});

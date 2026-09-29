import { createHash, randomUUID } from 'node:crypto';

const JILIN_REGIONS = [
  ['jilin', '吉林省', 'province'], ['changchun', '长春市', 'city'], ['chaoyang-cc', '朝阳区', 'district'],
  ['nanguan-cc', '南关区', 'district'], ['kuancheng-cc', '宽城区', 'district'], ['erdao-cc', '二道区', 'district'],
  ['lvyuan-cc', '绿园区', 'district'], ['shuangyang-cc', '双阳区', 'district'], ['jiutai-cc', '九台区', 'district'],
  ['jingyue-cc', '净月区', 'district'], ['lianhuashan-cc', '莲花山生态旅游度假区', 'district'], ['dehui-cc', '德惠市', 'county-city'],
  ['yushu-cc', '榆树市', 'county-city'], ['nong-an-cc', '农安县', 'county'], ['gongzhuling-cc', '公主岭市', 'county-city'],
  ['jilin-city', '吉林市', 'city'], ['changyi-jl', '昌邑区', 'district'], ['chuanying-jl', '船营区', 'district'], ['longtan-jl', '龙潭区', 'district'], ['fengman-jl', '丰满区', 'district'], ['yongji-jl', '永吉县', 'county'], ['jiaohe-jl', '蛟河市', 'county-city'], ['huadian-jl', '桦甸市', 'county-city'], ['shulan-jl', '舒兰市', 'county-city'], ['panshi-jl', '磐石市', 'county-city'],
  ['siping', '四平市', 'city'], ['tiexi-sp', '铁西区', 'district'], ['tiedong-sp', '铁东区', 'district'], ['lishu-sp', '梨树县', 'county'], ['yitong-sp', '伊通满族自治县', 'county'], ['shuangliao-sp', '双辽市', 'county-city'],
  ['liaoyuan', '辽源市', 'city'], ['longshan-ly', '龙山区', 'district'], ['xi-an-ly', '西安区', 'district'], ['dongfeng-ly', '东丰县', 'county'], ['dongliao-ly', '东辽县', 'county'],
  ['tonghua', '通化市', 'city'], ['dongchang-th', '东昌区', 'district'], ['erdaojiang-th', '二道江区', 'district'], ['tonghua-county-th', '通化县', 'county'], ['huinan-th', '辉南县', 'county'], ['liuhe-th', '柳河县', 'county'], ['meihekou-th', '梅河口市', 'county-city'], ['jian-th', '集安市', 'county-city'],
  ['baishan', '白山市', 'city'], ['hunjiang-bs', '浑江区', 'district'], ['jiangyuan-bs', '江源区', 'district'], ['fusong-bs', '抚松县', 'county'], ['jingyu-bs', '靖宇县', 'county'], ['changbai-bs', '长白朝鲜族自治县', 'county'], ['linjiang-bs', '临江市', 'county-city'],
  ['songyuan', '松原市', 'city'], ['ningjiang-sy', '宁江区', 'district'], ['qianguo-sy', '前郭尔罗斯蒙古族自治县', 'county'], ['changling-sy', '长岭县', 'county'], ['qianan-sy', '乾安县', 'county'], ['fuyu-sy', '扶余市', 'county-city'],
  ['baicheng', '白城市', 'city'], ['taobei-bc', '洮北区', 'district'], ['taonan-bc', '洮南市', 'county-city'], ['daan-bc', '大安市', 'county-city'], ['zhenlai-bc', '镇赉县', 'county'], ['tongyu-bc', '通榆县', 'county'],
  ['yanbian', '延边州', 'prefecture'], ['yanji-yb', '延吉市', 'county-city'], ['tumen-yb', '图们市', 'county-city'], ['dunhua-yb', '敦化市', 'county-city'], ['hunchun-yb', '珲春市', 'county-city'], ['longjing-yb', '龙井市', 'county-city'], ['helong-yb', '和龙市', 'county-city'], ['wangqing-yb', '汪清县', 'county'], ['antu-yb', '安图县', 'county'], ['changbaishan-jl', '长白山管委会', 'management']
].map(([id, name, level]) => ({ id, name, level }));

// 公主岭市保留历史 ID `gongzhuling-cc`，但行政上不属于长春市全域。
const CHANGCHUN_REGION_IDS = new Set([
  'changchun', 'chaoyang-cc', 'nanguan-cc', 'kuancheng-cc', 'erdao-cc', 'lvyuan-cc',
  'shuangyang-cc', 'jiutai-cc', 'jingyue-cc', 'lianhuashan-cc', 'dehui-cc', 'yushu-cc', 'nong-an-cc'
]);
const JILIN_REGION_IDS = new Set(JILIN_REGIONS.map((region) => region.id));

const POLICY_TYPES = ['教师招聘', '特岗教师', '教师资格考试'];
const REQUEST_CATEGORIES = ['招聘公告', '报名时间', '笔试时间', '面试', '资格审查', '体检', '成绩', '递补', '拟聘用名单'];
const CATEGORIES = [...REQUEST_CATEGORIES, '教育政策'];

const DEFAULT_SUBSCRIPTION = {
  id: 'local-default-subscription',
  regionIds: [...CHANGCHUN_REGION_IDS],
  keywords: [],
  policyTypes: [...POLICY_TYPES],
  categories: [...REQUEST_CATEGORIES],
  channels: ['in-app'],
  enabled: true,
  isDefault: true
};

const DEFAULT_POLICIES = [{
  id: 'demo-jilin-teacher', title: '吉林省教师考试政策示例（演示数据）',
  summary: '演示数据，不代表真实政策；正式同步后仅展示官方来源的标题和短摘要。', regionId: 'jilin', policyType: '教师招聘', category: '招聘公告',
  publishedAt: '2026-09-24T09:00:00+08:00', fetchedAt: '2026-09-24T09:01:00+08:00',
  sourceName: '吉林省教育厅（示例）', sourceUrl: 'https://jyt.jl.gov.cn/zwgk/ggl/', contentHash: 'demo-jilin-teacher', isDemo: true
}];

function clone(value) { return structuredClone(value); }
function normalizeStrings(values, maxItems, maxLength) {
  if (!Array.isArray(values)) throw new Error('字段必须是数组');
  if (values.some((value) => typeof value !== 'string')) throw new Error('数组元素必须是字符串');
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].slice(0, maxItems).map((value) => value.slice(0, maxLength));
}
function expandRegionIds(regionIds) {
  const ids = new Set(regionIds);
  if (ids.has('jilin-all')) {
    JILIN_REGIONS.forEach((region) => ids.add(region.id));
    ids.delete('jilin-all');
  }
  if (ids.has('changchun-all')) {
    CHANGCHUN_REGION_IDS.forEach((id) => ids.add(id));
    ids.delete('changchun-all');
  }
  return [...ids];
}

function policyMatchesSubscription(policy, subscription) {
  if (!policy || !subscription?.enabled) return false;
  const keywordText = `${policy.title ?? ''} ${policy.summary ?? ''}`.toLowerCase();
  return subscription.regionIds.includes(policy.regionId)
    && subscription.policyTypes.includes(policy.policyType ?? '教师招聘')
    && subscription.categories.includes(policy.category)
    && (!subscription.keywords.length || subscription.keywords.some((keyword) => keywordText.includes(keyword.toLowerCase())));
}

export function createContentHash(input) { return createHash('sha256').update(String(input)).digest('hex'); }

export function createPolicyService({ store, userId = null }) {
  if (!Array.isArray(store.notifications)) store.notifications = [];
  if (!Array.isArray(store.subscriptions)) store.subscriptions = [];
  if (!userId && store.subscriptions.length === 0) {
    store.subscriptions = [clone(DEFAULT_SUBSCRIPTION)];
  }
  const visibleSubscriptions = () => store.subscriptions.filter((subscription) => userId ? subscription.userId === userId : !subscription.userId);
  const visibleSubscriptionIds = () => new Set(visibleSubscriptions().map((subscription) => subscription.id));
  const notificationVisible = (notification, subscriptionIds) => subscriptionIds.has(notification.subscriptionId) || (!userId && !notification.subscriptionId);
  return {
    listRegions() { return clone(JILIN_REGIONS); },
    listPolicyTypes() { return [...POLICY_TYPES]; },
    listCategories() { return [...new Set([...CATEGORIES, ...store.policies.map((policy) => policy.category)])].sort(); },
    listPolicies({ regionId, policyType, category, keyword, since, limit = 50 } = {}) {
      const normalizedKeyword = String(keyword ?? '').trim().slice(0, 80).toLowerCase();
      const normalizedSince = since ? new Date(since).getTime() : Number.NaN;
      const requestedRegion = regionId === 'changchun-all'
        ? CHANGCHUN_REGION_IDS
        : regionId === 'jilin-all' ? JILIN_REGION_IDS : null;
      const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 100);
      return store.policies
        .filter((policy) => policy.isArchived !== true)
        .filter((policy) => !regionId || regionId === 'all' || policy.regionId === regionId || requestedRegion?.has(policy.regionId))
        .filter((policy) => !policyType || policyType === 'all' || (policy.policyType ?? '教师招聘') === policyType)
        .filter((policy) => !category || category === 'all' || policy.category === category)
        .filter((policy) => !normalizedKeyword || `${policy.title} ${policy.summary}`.toLowerCase().includes(normalizedKeyword))
        .filter((policy) => Number.isNaN(normalizedSince) || new Date(policy.publishedAt ?? policy.fetchedAt).getTime() >= normalizedSince)
        .sort((a, b) => new Date(b.publishedAt ?? b.fetchedAt).getTime() - new Date(a.publishedAt ?? a.fetchedAt).getTime())
        .slice(0, safeLimit).map(clone);
    },
    getPolicyById(policyId) {
      const id = String(policyId ?? '').trim();
      if (!id || id.length > 128) return null;
      const policy = store.policies.find((item) => item.id === id && item.isArchived !== true);
      return policy ? clone(policy) : null;
    },
    listSubscriptions() { return visibleSubscriptions().map(clone); },
    listNotifications({ unreadOnly = false, limit = 50 } = {}) {
      const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 100);
      return store.notifications
        .filter((notification) => notificationVisible(notification, visibleSubscriptionIds()))
        .filter((notification) => !unreadOnly || notification.status === 'unread')
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, safeLimit).map(clone);
    },
    markNotificationsRead(input = {}) {
      const ids = input.ids === undefined ? null : normalizeStrings(input.ids, 100, 80);
      const subscriptionIds = visibleSubscriptionIds();
      store.notifications = store.notifications.map((notification) => notificationVisible(notification, subscriptionIds) && (ids === null || ids.includes(notification.id))
        ? { ...notification, status: 'read', readAt: new Date().toISOString() }
        : notification);
      return this.listNotifications();
    },
    ensureDefaultSubscription() {
      const current = visibleSubscriptions();
      if (current.length > 0) return clone(current[0]);
      const subscription = { ...clone(DEFAULT_SUBSCRIPTION), id: userId ? `sub-${userId}` : DEFAULT_SUBSCRIPTION.id, ...(userId ? { userId } : {}), updatedAt: new Date().toISOString() };
      store.subscriptions = [...store.subscriptions, subscription];
      return clone(subscription);
    },
    replaceSubscription(input) {
      if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('请求数据格式错误');
      const regionIds = expandRegionIds(normalizeStrings(input.regionIds, 100, 40)).filter((id) => JILIN_REGIONS.some((region) => region.id === id));
      const keywords = normalizeStrings(input.keywords ?? [], 20, 40);
      const policyTypes = normalizeStrings(input.policyTypes ?? POLICY_TYPES, POLICY_TYPES.length, 40).filter((type) => POLICY_TYPES.includes(type));
      const categories = normalizeStrings(input.categories ?? REQUEST_CATEGORIES, REQUEST_CATEGORIES.length, 40).filter((category) => REQUEST_CATEGORIES.includes(category));
      const channels = normalizeStrings(input.channels ?? ['in-app'], 2, 20).filter((channel) => ['in-app', 'wechat'].includes(channel));
      if (regionIds.length === 0) throw new Error('至少选择一个地区');
      if (policyTypes.length === 0 || categories.length === 0 || channels.length === 0) throw new Error('至少选择一个政策类型、事项和提醒渠道');
      const previous = visibleSubscriptions()[0];
      const subscription = { id: previous?.id ?? (userId ? `sub-${userId}` : randomUUID()), ...(userId ? { userId } : {}), regionIds, keywords, policyTypes, categories, channels, enabled: true, updatedAt: new Date().toISOString() };
      const others = store.subscriptions.filter((item) => item.id !== previous?.id);
      store.subscriptions = [...others, clone(subscription)];
      const policiesById = new Map(store.policies.map((policy) => [policy.id, policy]));
      const visibleIds = new Set(visibleSubscriptions().map((item) => item.id));
      store.notifications = store.notifications.filter((notification) => (!visibleIds.has(notification.subscriptionId) && (userId || notification.subscriptionId))
        || policyMatchesSubscription(policiesById.get(notification.policyId), subscription));
      return clone(subscription);
    },
    disableSubscriptions() {
      const visibleIds = visibleSubscriptionIds();
      store.subscriptions = store.subscriptions.map((subscription) => visibleIds.has(subscription.id) ? { ...subscription, enabled: false, updatedAt: new Date().toISOString() } : subscription);
      return visibleSubscriptions().map(clone);
    }
  };
}

export { DEFAULT_POLICIES, DEFAULT_SUBSCRIPTION, JILIN_REGIONS, JILIN_REGION_IDS, CHANGCHUN_REGION_IDS, POLICY_TYPES, CATEGORIES, REQUEST_CATEGORIES };

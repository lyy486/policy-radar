import test from 'node:test';
import assert from 'node:assert/strict';
import { listSources, listSourceCoverage, isApprovedFreeSource } from '../src/source-registry.js';
import { parseOfficialList, fetchOfficialSource, syncSources } from '../src/sync-service.js';
import { createContentHash } from '../src/policy-service.js';
import { FREE_UPGRADE_FILES } from '../scripts/free-release-manifest.js';
import { planSourceBaselineSync, captureSourceBaselines, deliverPolicyAlerts } from '../scripts/free-site-lib.js';

const batch = ['chaoyang', 'dehui', 'jiutai', 'lianhuashan'];
const configured = key => listSources().find(item => item.id === `${key}-education-notices`);
const row = (id, title) => `<li><a href="/ywdt/tzgg/gggs/202609/t20260930_${id}.html" title="${title}">${title}</a><span>2026-09-30</span></li>`;
const listing = rows => `<div class="news_list"><ul>${rows}</ul></div><aside><a href="/ywdt/tzgg/gggs/202601/t20260101_123456.html">侧栏教师招聘旧公告</a></aside>`;
const response = body => async () => ({ ok: true, status: 200, headers: { get: () => null }, text: async () => body });

test('only the verified district batch is enabled with exact HTTP consent and historical baselines', () => {
  for (const key of batch) {
    const source = configured(key);
    assert.equal(source.parser, 'changchun-district', key);
    assert.equal(source.enabled, true, key);
    assert.equal(source.userApprovedPublicHttp, true, key);
    assert.equal(source.alertBaselineOnFirstSync, true, key);
    assert.equal(source.includeGeneralRecruitment, true, key);
    assert.equal(isApprovedFreeSource(source), true, key);
    assert.equal(isApprovedFreeSource({ ...source, url: source.url + '?unverified=1' }), false);
    assert.equal(listSourceCoverage().find(item => item.regionId === source.regionIds[0]).status, 'active');
  }
  for (const key of ['nanguan', 'kuancheng', 'erdao', 'lvyuan', 'shuangyang', 'jingyue', 'yushu', 'nong-an']) {
    const source = configured(key);
    assert.equal(source.enabled, false, key);
    assert.equal(source.userApprovedPublicHttp, true, 'consent is recorded without enabling unready sources');
    assert.equal(isApprovedFreeSource({ ...source, enabled: true }), false, key);
  }
});

test('district routing excludes sidebar notices and labels general recruitment as unverified', async () => {
  const source = { ...configured('dehui'), enabled: true };
  const body = listing(row(999991, '测试事业单位公开招聘工作人员面试公告'));
  const result = await fetchOfficialSource(source, response(body));
  assert.equal(result.policies.length, 1);
  assert.equal(result.policies[0].requiresTeacherVerification, true);
  assert.equal(result.policies[0].publishedAt, '2026-09-30');
  assert.match(result.policies[0].summary, /需核对/);
});

test('new district parsing does not change legacy government titles or hashes', () => {
  const source = listSources().find(item => item.id === 'changchun-education-notices');
  const href = '/xxgk/tzgg/202609/t20260930_999990.html';
  const visible = '测试教师招聘公告...';
  const html = `<li><a href="${href}" title="测试教师招聘公告完整属性">${visible}</a><span>2026-09-30</span></li>`;
  const policy = parseOfficialList(html, source)[0];
  assert.equal(policy.title, visible);
  assert.equal(policy.contentHash, createContentHash(`${new URL(href, source.url).href}|${visible}`));
  assert.equal(listSources().filter(item => item.enabled && !batch.some(key => item.id === `${key}-education-notices`)).length, 13);
});

test('new district baseline suppresses history while preserving old pending alerts and later new items', async () => {
  const source = configured('dehui');
  const plan = planSourceBaselineSync([source], {});
  const store = { policies: [], subscriptions: [], notifications: [], sourceState: plan.sourceState };
  const results = await syncSources({ store, sources: [source], fetchImpl: response(listing(row(999991, '测试教师招聘公告'))) });
  assert.equal(results[0]?.inserted, 1);
  const captured = captureSourceBaselines({ initialSourceIds: plan.initialSourceIds, sourceState: store.sourceState, results, policies: store.policies });
  const oldPending = { ...store.policies[0], sourceId: 'changchun-hrss-notices', regionId: 'changchun', title: '既有来源待发测试公告', contentHash: 'b'.repeat(64) };
  let state = { hashes: ['a'.repeat(64)], initializedSourceIds: [] };
  const sent = [];
  const options = { initialSourceIds: plan.initialSourceIds, sourceBaselines: captured.sourceBaselines, readState: async () => state, writeState: async value => { state = structuredClone(value); }, sendAlert: async items => { sent.push(items.map(item => item.contentHash)); return true; }, logger: { log() {}, warn() {} } };
  await deliverPolicyAlerts({ ...options, policies: [...store.policies, oldPending] });
  assert.deepEqual(sent, [['b'.repeat(64)]]);
  assert.ok(state.hashes.includes('a'.repeat(64)));
  assert.ok(state.initializedSourceIds.includes(source.id));
  const fresh = parseOfficialList(listing(row(999992, '测试教师招聘面试公告')), source)[0];
  await deliverPolicyAlerts({ ...options, policies: [...store.policies, oldPending, fresh] });
  await deliverPolicyAlerts({ ...options, policies: [...store.policies, oldPending, fresh] });
  assert.deepEqual(sent, [['b'.repeat(64)], [fresh.contentHash]]);
  const failed = await syncSources({ store, sources: [source], fetchImpl: response('<title>网站维护中</title>') });
  assert.equal(failed[0].status, 'failed');
  assert.equal(store.policies.length, 1);
});

test('district release includes parser and regression tests but excludes cloud state', () => {
  for (const file of ['src/adapters/changchun-district.js', 'test/changchun-district.test.js', 'test/district-source-integration.test.js']) assert.ok(FREE_UPGRADE_FILES.includes(file), file);
  for (const file of ['data/free-store.json', 'data/free-notified.json', 'free-site/data/policies.json', 'data/local-email.json']) assert.equal(FREE_UPGRADE_FILES.includes(file), false);
});

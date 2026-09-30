import test from 'node:test';
import assert from 'node:assert/strict';
import { listSources, listSourceCoverage, isApprovedFreeSource } from '../src/source-registry.js';
import { fetchOfficialSource, parseOfficialList, syncSources, PARSER_VERSION } from '../src/sync-service.js';
import { buildStaticPayload, captureSourceBaselines, planSourceBaselineSync, deliverPolicyAlerts } from '../scripts/free-site-lib.js';
import { FREE_UPGRADE_FILES } from '../scripts/free-release-manifest.js';

const districts = ['nanguan', 'kuancheng', 'erdao', 'lvyuan', 'shuangyang', 'yushu'];
const configured = key => listSources().find(item => item.id === `${key}-education-notices`);
const source = () => ({ ...configured('nanguan'), enabled: true, parser: 'changchun-district-fulltitle' });
const row = (id, title) => `<li><a href="./202609/t20260930_${id}.html">${title}</a><span class="data">2026-09-29</span></li>`;
const listing = rows => `<div class="left_list"><ul>${rows}</ul></div>`;
const detail = title => `<html><head><meta name="ArticleTitle" content="${title}"><title>${title}</title></head></html>`;
const response = (body, status = 200, extra = {}) => ({ status, ok: status === 200, headers: new Headers(extra), text: async () => body });
const urlFor = id => new URL(`./202609/t20260930_${id}.html`, source().url).href;
const blankStore = sourceState => ({ policies: [], notifications: [], subscriptions: [], sourceState });

test('all twelve consented districts are enabled, exact-bound, and preserve unapproved candidates', () => {
  for (const key of [...districts, 'jingyue', 'nong-an']) {
    const item = configured(key);
    assert.equal(item.enabled, true, key);
    assert.equal(item.alertBaselineOnFirstSync, true, key);
    assert.equal(isApprovedFreeSource(item), true, key);
    assert.equal(isApprovedFreeSource({ ...item, url: item.url + '#unverified' }), false);
    assert.equal(isApprovedFreeSource({ ...item, userApprovedPublicHttp: false }), false);
    assert.equal(listSourceCoverage().find(region => region.regionId === item.regionIds[0]).status, 'active');
    assert.equal(item.parser, districts.includes(key) ? 'changchun-district-fulltitle' : key === 'jingyue' ? 'jingyue-education' : 'nongan-education');
  }
  assert.equal(listSources().filter(item => item.enabled).length, 25);
  assert.equal(listSources().filter(item => isApprovedFreeSource(item) && item.url.startsWith('http:')).length, 15);
  for (const item of listSources().filter(item => /qikai|gongzhuling/.test(item.id))) assert.equal(isApprovedFreeSource({ ...item, enabled: true, url: item.url.replace('https:', 'http:') }), false);
});

test('async district routing resolves every truncated title before teacher keyword filtering', async () => {
  const requests = [];
  const result = await fetchOfficialSource(source(), async (url, options) => {
    requests.push({ url, options });
    return response(url === source().url ? listing(row(900001, '关于组织开展...')) : detail('关于组织开展教师招聘笔试的通知'));
  });
  assert.equal(result.policies.length, 1);
  assert.equal(result.policies[0].title, '关于组织开展教师招聘笔试的通知');
  assert.equal(result.policies[0].publishedAt, '2026-09-29');
  assert.equal(result.policies[0].category, '笔试时间');
  assert.equal(result.detailTitleIncomplete, false);
  assert.equal(requests.length, 2);
  assert.equal(requests[1].options.redirect, 'manual');
  assert.ok(result.detailTitleCache.entries[urlFor(900001)]);
  assert.throws(() => parseOfficialList(listing(row(900001, '关于组织开展...')), source()), /异步/);
});

test('partial detail failures persist safe progress but not policies, validators, success or baselines', async () => {
  const item = source();
  const prior = { lastSuccessAt: '2026-09-28T01:00:00.000Z', etag: 'old', lastModified: 'old-date', parserVersion: PARSER_VERSION };
  const store = blankStore({ [item.id]: prior });
  const body = listing(row(900001, '教师招聘第一批...') + row(900002, '教师招聘第二批...'));
  const results = await syncSources({ store, sources: [item], fetchImpl: async url => {
    if (url === item.url) return response(body, 200, { etag: 'new', 'last-modified': 'new-date' });
    return url === urlFor(900001) ? response(detail('教师招聘第一批面试公告')) : response('temporarily unavailable', 503);
  } });
  assert.equal(results[0].status, 'failed');
  assert.equal(store.policies.length, 0);
  const state = store.sourceState[item.id];
  assert.equal(state.lastSuccessAt, prior.lastSuccessAt);
  assert.equal(state.etag, 'old');
  assert.equal(state.lastModified, 'old-date');
  assert.equal(state.detailTitleIncomplete, true);
  assert.ok(state.detailTitleCache.entries[urlFor(900001)]);
  assert.equal(state.detailTitleCache.entries[urlFor(900002)], undefined);
  const captured = captureSourceBaselines({ initialSourceIds: [item.id], sourceState: store.sourceState, results, policies: store.policies });
  assert.deepEqual(captured.sourceBaselines, []);
  const invalid304 = await syncSources({ store, sources: [item], fetchImpl: async (_url, options) => {
    assert.equal(options.headers['if-none-match'], undefined);
    assert.equal(options.headers['if-modified-since'], undefined);
    return response('', 304);
  } });
  assert.equal(invalid304[0].status, 'failed');
  assert.equal(store.sourceState[item.id].lastSuccessAt, prior.lastSuccessAt);
  const calls = [];
  const retry = await syncSources({ store, sources: [item], fetchImpl: async (url, options) => {
    calls.push(url);
    if (url === item.url) {
      assert.equal(options.headers['if-none-match'], undefined);
      return response(body, 200, { etag: 'completed' });
    }
    assert.equal(url, urlFor(900002), 'completed title is reused without downloading again');
    return response(detail('教师招聘第二批面试公告'));
  } });
  assert.equal(retry[0].status, 'ok');
  assert.equal(store.policies.length, 2);
  assert.equal(store.sourceState[item.id].detailTitleIncomplete, false);
  assert.equal(store.sourceState[item.id].etag, 'completed');
  assert.equal(calls.length, 2);
  const unchanged = await syncSources({ store, sources: [item], fetchImpl: async (_url, options) => {
    assert.equal(options.headers['if-none-match'], 'completed'); return response('', 304);
  } });
  assert.equal(unchanged[0].status, 'not-modified');
  assert.equal(store.policies.length, 2);
});

test('public payload excludes internal detail caches without mutating stored state', () => {
  const state = { lastSuccessAt: '2026-09-30', lastError: null, detailTitleIncomplete: true, detailTitleCache: { version: 'v1', entries: { 'http://example.test/': { title: 'cache-only-title' } } } };
  const store = blankStore({ [source().id]: state });
  const before = structuredClone(store);
  const payload = buildStaticPayload(store);
  assert.equal(payload.sourceState[source().id].detailTitleCache, undefined);
  assert.equal(payload.sourceState[source().id].lastSuccessAt, state.lastSuccessAt);
  assert.equal(JSON.stringify(payload).includes('cache-only-title'), false);
  assert.deepEqual(store, before);
});

test('completed fulltitle source establishes historical baseline and later alerts only once', async () => {
  const item = source();
  const plan = planSourceBaselineSync([item], {});
  const store = blankStore(plan.sourceState);
  const run = async id => syncSources({ store, sources: [item], fetchImpl: async () => response(listing(row(id, '教师招聘笔试安排公告'))) });
  const results = await run(900001);
  const captured = captureSourceBaselines({ initialSourceIds: plan.initialSourceIds, sourceState: store.sourceState, results, policies: store.policies });
  let state = { hashes: ['old-hash'], initializedSourceIds: [] };
  const sent = [];
  const options = { initialSourceIds: plan.initialSourceIds, sourceBaselines: captured.sourceBaselines, readState: async () => state, writeState: async value => { state = structuredClone(value); }, sendAlert: async items => { sent.push(items); return true; }, logger: { log() {}, warn() {} } };
  await deliverPolicyAlerts({ ...options, policies: store.policies });
  assert.equal(sent.length, 0);
  assert.ok(state.hashes.includes('old-hash'));
  assert.ok(state.initializedSourceIds.includes(item.id));
  await run(900002);
  await deliverPolicyAlerts({ ...options, policies: store.policies });
  await deliverPolicyAlerts({ ...options, policies: store.policies });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].length, 1);
});

test('Jingyue routing permits only its verified public disclosure paths', async () => {
  const item = { ...configured('jingyue'), enabled: true, parser: 'jingyue-education' };
  const href = 'http://zwgk.changchun.gov.cn/jy/kfqzcbm/jygxjscykfqkjcxwyh/zdlyjczwgk/202609/t20260930_900001.html';
  const body = `<div class="list-entry-page"><div class="list-entry"><div class="media"><div class="media-body"><h4 class="media-heading"><a href="${href}">教师招聘笔试公告</a></h4></div><div class="media-bottom"><i>2026年09月29日</i></div></div></div></div>`;
  const result = await fetchOfficialSource(item, async () => response(body));
  assert.equal(result.policies.length, 1);
  assert.equal(result.policies[0].sourceUrl, href);
  assert.equal(parseOfficialList(body, { ...item, parser: 'gov-list' }).length, 0);
});

test('second-batch upgrade includes dedicated adapters and tests, never cloud state', () => {
  for (const path of ['src/adapters/nongan-education.js', 'src/adapters/jingyue-education.js', 'src/adapters/changchun-district-fulltitle.js', 'test/nongan-source-integration.test.js', 'test/jingyue-education.test.js', 'test/changchun-district-fulltitle.test.js', 'test/district-batch2-integration.test.js']) assert.ok(FREE_UPGRADE_FILES.includes(path), path);
  for (const path of ['data/free-store.json', 'data/free-notified.json', 'free-site/data/policies.json', 'data/local-email.json']) assert.equal(FREE_UPGRADE_FILES.includes(path), false);
});

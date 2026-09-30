import test from 'node:test';
import assert from 'node:assert/strict';
import { listSources, isApprovedFreeSource, listSourceCoverage } from '../src/source-registry.js';
import { fetchOfficialSource, syncSources, isRelevantTeacherTitle } from '../src/sync-service.js';
import { FREE_UPGRADE_FILES } from '../scripts/free-release-manifest.js';

const source = {
  id: 'changchun-talent-notices', name: '长春新区人才就业网公告通知',
  url: 'https://rcjy.ccxq.gov.cn/content/news/list/3/1.html',
  parser: 'changchun-talent', regionIds: ['changchun'], category: '招聘公告',
  titlePattern: '教师|学校|招聘|招募|面试', includeGeneralRecruitment: true,
  detailPathPrefix: '/content/news/show/', enabled: true, userAgent: 'PolicyRadarTest/1.0'
};
const row = (id, title, date) => `<div class="listb news_noimg"><div class="br link_gray6"><div class="t substring"><a href="https://rcjy.ccxq.gov.cn/content/news/show/${id}.html"><span>${title}</span></a></div><div class="time substring"><span class="time1">${date}</span></div><div class="clear"></div></div></div>`;
const html = `<div id="news_list"><div class="list load_more_body">${row(1136, '2026年长春新区公办学校面向社会招募银龄教师公告', '2026-07-29')}${row(1109, '2026年长春新区事业单位公开招聘工作人员面试公告', '2026-05-07')}</div></div><aside><a href="/content/news/show/716.html">2024年长春新区教师招聘旧推荐</a></aside>`;
const response = (body = html) => async () => ({ ok: true, status: 200, headers: { get: () => null }, text: async () => body });

test('verified Xinqu lists use HTTPS and per-source historical baselines', () => {
  for (const [id, channel] of [['changchun-talent-notices', 3], ['changchun-talent-recruitment', 4]]) {
    const configured = listSources().find(item => item.id === id);
    assert.ok(configured, id);
    assert.equal(configured.url, `https://rcjy.ccxq.gov.cn/content/news/list/${channel}/1.html`);
    assert.equal(configured.parser, 'changchun-talent');
    assert.equal(configured.alertBaselineOnFirstSync, true);
    assert.equal(configured.includeGeneralRecruitment, true);
    assert.equal(configured.detailPathPrefix, '/content/news/show/');
    assert.equal(isApprovedFreeSource(configured), true);
    assert.deepEqual(configured.regionIds, ['changchun']);
  }
  assert.match(listSourceCoverage().find(item => item.regionId === 'changchun').note, /新区/);
  assert.equal(listSources().find(item => item.id === 'nanguan-education-notices').enabled, true);
});

test('only the opted-in source admits 招募 without changing existing-source alert scope', () => {
  const title = '2026年长春新区公办学校面向社会招募银龄教师公告';
  assert.equal(isRelevantTeacherTitle(title, true), true);
  assert.equal(isRelevantTeacherTitle(title), false);
  assert.equal(isRelevantTeacherTitle('2026年志愿者招募公告', true), false);
});

test('Xinqu adapter preserves per-row dates and excludes old sidebar recommendations', async () => {
  const result = await fetchOfficialSource(source, response());
  assert.equal(result.policies.length, 2);
  assert.deepEqual(result.policies.map(item => item.publishedAt?.slice(0, 10)), ['2026-07-29', '2026-05-07']);
  assert.ok(result.policies.every(item => item.regionId === 'changchun'));
  assert.equal(result.policies[1].requiresTeacherVerification, true);
  assert.doesNotMatch(result.policies[0].summary, /确认.*编制|属于事业编制/);
});

test('repeated Xinqu sync deduplicates and maintenance retains prior announcements', async () => {
  const store = { policies: [], subscriptions: [], notifications: [] };
  const first = await syncSources({ store, sources: [source], fetchImpl: response() });
  assert.equal(first[0].inserted, 2);
  const second = await syncSources({ store, sources: [source], fetchImpl: response() });
  assert.equal(second[0].inserted, 0);
  const failed = await syncSources({ store, sources: [source], fetchImpl: response('<html><title>系统维护</title><body>正在维护</body></html>') });
  assert.equal(failed[0].status, 'failed');
  assert.equal(store.policies.length, 2);
});

test('upgrade includes Xinqu adapter and tests without touching cloud-owned state', () => {
  for (const file of ['src/adapters/changchun-talent.js', 'test/changchun-talent.test.js', 'test/talent-source-integration.test.js']) assert.ok(FREE_UPGRADE_FILES.includes(file), file);
  for (const file of ['data/free-notified.json', 'data/free-store.json', 'free-site/data/policies.json']) assert.equal(FREE_UPGRADE_FILES.includes(file), false);
});

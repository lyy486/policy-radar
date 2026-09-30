import test from 'node:test';
import assert from 'node:assert/strict';
import { listSources, listSourceCoverage, isApprovedFreeSource } from '../src/source-registry.js';
import { parseOfficialList } from '../src/sync-service.js';
import { FREE_RELEASE_FILES } from '../scripts/free-release-manifest.js';
import * as releaseManifest from '../scripts/free-release-manifest.js';

test('verified provincial teacher-exam source uses the public API and dedicated parser', () => {
  const source = listSources().find(item => item.id === 'jilin-exam-teacher');
  assert.ok(source);
  assert.equal(source.enabled, true);
  assert.equal(source.parser, 'jilin-exam');
  assert.equal(source.alertBaselineOnFirstSync, true, 'new source must baseline historical records before alerting');
  const url = new URL(source.url);
  assert.equal(url.origin, 'https://www.jleea.com.cn');
  assert.equal(url.pathname, '/server-front/front/content/page');
  assert.equal(url.searchParams.get('channelIdStr'), '10649');
  assert.equal(source.policyType, '教师资格考试');
  assert.deepEqual(source.regionIds, ['jilin']);
  assert.ok(source.verificationNote.includes('ntce.neea.edu.cn'));
});

test('Gongzhuling coverage does not incorrectly exclude it from Changchun', () => {
  const source = listSources().find(item => item.id === 'gongzhuling-government-candidate');
  const coverage = listSourceCoverage().find(item => item.regionId === 'gongzhuling-cc');
  assert.doesNotMatch(source.verificationNote, /不计入长春|不属于长春/);
  assert.doesNotMatch(coverage.note, /不计入长春|不属于长春/);
  assert.equal(source.enabled, false);
  assert.equal(coverage.status, 'pending');
});

test('release includes dedicated parser, source tests and credential-free audit workflow', () => {
  for (const path of ['src/adapters/jilin-exam.js', 'test/jilin-exam.test.js', 'test/source-registry.test.js', '.github/workflows/source-audit.yml']) {
    assert.ok(FREE_RELEASE_FILES.includes(path), path);
  }
  assert.ok(!FREE_RELEASE_FILES.includes('data/local-email.json'));
});

test('upgrade manifest preserves cloud history and dedup while including package metadata', () => {
  assert.ok(Array.isArray(releaseManifest.FREE_UPGRADE_FILES));
  for (const path of ['data/free-store.json', 'data/free-notified.json', 'free-site/data/policies.json', 'data/local-email.json']) {
    assert.ok(!releaseManifest.FREE_UPGRADE_FILES.includes(path));
  }
  for (const path of ['package.json', 'package-lock.json', 'test/mobile-display.test.js', 'test/source-baseline-retry.test.js']) {
    assert.ok(releaseManifest.FREE_UPGRADE_FILES.includes(path));
  }
});

test('Dehui approved source uses the verified personnel list and exact access scope', () => {
  const source = listSources().find(item => item.id === 'dehui-education-notices');
  assert.equal(source.url, 'http://dehui.changchun.gov.cn/ywdt/tzgg/rsxx/');
  assert.equal(source.detailPathPrefix, '/ywdt/tzgg/');
  assert.equal(source.includeGeneralRecruitment, true);
  assert.equal(source.alertBaselineOnFirstSync, true);
  assert.equal(source.enabled, true);
  assert.equal(isApprovedFreeSource(source), true);
  assert.equal(isApprovedFreeSource({ ...source, url: source.url + '?unverified=1' }), false,
    'approval applies only to the exact verified district list');
});

test('Dehui cross-column recruitment remains an unverified lead rather than a verified teacher post', () => {
  const source = listSources().find(item => item.id === 'dehui-education-notices');
  const html = `<div class="news_list"><ul>
    <li><a href="/ywdt/tzgg/gggs/202608/t20260820_3507076.html">2026年德惠市事业单位公开招聘工作人员（含专项招聘高校毕业生）面试公告</a><span>2026-08-20</span></li>
    <li><a href="/ywdt/zwdt/202608/t20260820_3507000.html">教师招聘相关活动新闻</a><span>2026-08-20</span></li>
    <li><a href="http://other.example/202608/t20260820_3507001.html">教师招聘公告</a><span>2026-08-20</span></li>
  </ul></div>`;
  const policies = parseOfficialList(html, source, new Date('2026-09-30T20:00:00Z'));
  assert.equal(policies.length, 1);
  assert.equal(policies[0].sourceUrl, 'http://dehui.changchun.gov.cn/ywdt/tzgg/gggs/202608/t20260820_3507076.html');
  assert.equal(policies[0].requiresTeacherVerification, true);
  assert.match(policies[0].summary, /需核对/);
});

test('Nongan candidate records the actual education platform without claiming dynamic records are available', () => {
  const source = listSources().find(item => item.id === 'nong-an-education-notices');
  const coverage = listSourceCoverage().find(item => item.regionId === 'nong-an-cc');
  assert.equal(source.url, 'http://zwgk.changchun.gov.cn/na/xzfzcbm/naxjyj/zdlyjczwgk/');
  assert.equal(source.reviewStatus, 'dynamic-list-pending');
  assert.match(source.verificationNote, /动态/);
  assert.match(coverage.note, /动态/);
  assert.equal(source.enabled, false);
  assert.equal(coverage.status, 'pending');
  assert.equal(isApprovedFreeSource(source), false);
  assert.equal(isApprovedFreeSource({ ...source, enabled: true, userApprovedPublicHttp: true }), false);
});

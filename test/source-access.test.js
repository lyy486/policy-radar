import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as registry from '../src/source-registry.js';
import { buildStaticPayload, createAlertEmail } from '../scripts/free-site-lib.js';
import { fetchOfficialSource } from '../src/sync-service.js';
import { FREE_UPGRADE_FILES } from '../scripts/free-release-manifest.js';

test('pre-release cloud verification cannot use mail credentials or deploy public data', async () => {
  const workflow = await readFile(new URL('../.github/workflows/verify.yml', import.meta.url), 'utf8');
  assert.ok(FREE_UPGRADE_FILES.includes('.github/workflows/verify.yml'));
  assert.match(workflow, /pull_request:/);
  assert.match(workflow, /contents: read/);
  assert.match(workflow, /--test-concurrency=1/);
  assert.doesNotMatch(workflow, /secrets\.|free:update|send-test-email|deploy-pages|contents: write/);
});

test('approved city lists retain exact access scope after the verified district expansion', () => {
  for (const [id, url, prefix] of [
    ['changchun-education-notices', 'http://jyj.changchun.gov.cn/xxgk/tzgg/', '/xxgk/tzgg/'],
    ['changchun-jingkai-notices', 'http://www.cetdz.gov.cn/zw/ggxx/tzgg/', '/zw/ggxx/tzgg/']
  ]) {
    const source = registry.listSources().find(item => item.id === id);
    assert.ok(source, id);
    assert.equal(source.enabled, true);
    assert.equal(source.url, url);
    assert.equal(source.detailPathPrefix, prefix);
    assert.equal(source.alertBaselineOnFirstSync, true);
    assert.equal(source.userApprovedPublicHttp, true);
    assert.equal(registry.isApprovedFreeSource(source), true);
    assert.equal(registry.isApprovedFreeSource({ ...source, userApprovedPublicHttp: false }), false);
    assert.equal(registry.isApprovedFreeSource({ ...source, url: url + '?proxy=1' }), false);
    assert.equal(registry.isApprovedFreeSource({ ...source, url: url.replace('http:', 'ftp:') }), false);
    assert.equal(registry.isApprovedFreeSource({ ...source, id: 'nanguan-education-notices' }), false);
  }
  const approvedHttp = registry.listSources().filter(item => item.url.startsWith('http:') && registry.isApprovedFreeSource(item));
  assert.equal(approvedHttp.length, 7);
  assert.equal(registry.listSources().find(item => item.id === 'nanguan-education-notices').enabled, false);
});

test('Jingkai general recruitment remains unconfirmed teacher lead with HTTP warning', async () => {
  const source = registry.listSources().find(item => item.id === 'changchun-jingkai-notices');
  assert.ok(source);
  const html = '<li><a href="./202605/t20260508_3485754.html">2026年长春经济技术开发区事业单位公开招聘工作人员面试公告</a><span>2026-05-08</span></li>';
  const result = await fetchOfficialSource(source, async () => ({ ok: true, status: 200, headers: { get: () => null }, text: async () => html }));
  assert.equal(result.policies.length, 1);
  assert.equal(result.policies[0].requiresTeacherVerification, true);
  assert.match(result.policies[0].publishedAt, /^2026-05-08/);
  const email = createAlertEmail(result.policies);
  assert.match(email.text, /传输未加密/);
  assert.match(email.text, /教师岗位及编制性质需核对/);
});

test('personal-use HTTP approval enables only the exact Changchun official notice list', () => {
  assert.equal(typeof registry.isApprovedFreeSource, 'function');
  const source = registry.listSources().find(s => s.id === 'changchun-hrss-notices');
  assert.equal(source.enabled, true);
  assert.equal(source.alertBaselineOnFirstSync, true);
  assert.equal(source.detailPathPrefix, '/ywdt/tzgg/');
  assert.equal(registry.isApprovedFreeSource(source), true);
  assert.equal(registry.isApprovedFreeSource({ ...source, userApprovedPublicHttp: false }), false);
  for (const url of ['http://evil.example/ywdt/tzgg/', 'http://ccrs.changchun.gov.cn:8080/ywdt/tzgg/', 'http://ccrs.changchun.gov.cn/other/', 'http://u:p@ccrs.changchun.gov.cn/ywdt/tzgg/', 'http://ccrs.changchun.gov.cn/ywdt/tzgg/?proxy=1']) {
    assert.equal(registry.isApprovedFreeSource({ ...source, url }), false, url);
  }
  assert.equal(registry.isApprovedFreeSource({ ...source, id: 'not-approved' }), false);
  assert.equal(registry.isApprovedFreeSource({ ...source, enabled: false }), false);
  assert.equal(registry.isApprovedFreeSource({ ...source, url: 'broken' }), false);
  assert.equal(registry.isApprovedFreeSource(registry.listSources().find(s => s.id === 'jilin-exam-teacher')), true);
});

test('verified recruitment lists retain explicitly unconfirmed teacher leads', () => {
  for (const id of ['changchun-hrss-notices', 'jilin-hrss-recruitment']) {
    const source = registry.listSources().find(s => s.id === id);
    assert.ok(source);
    assert.equal(source.enabled, true);
    assert.equal(source.includeGeneralRecruitment, true);
    assert.equal(source.alertBaselineOnFirstSync, true);
  }
});

test('HTTP and unconfirmed teacher notices carry warnings in public data and email', async () => {
  const policy = { id: 'lead', title: '长春市事业单位公开招聘公告', sourceId: 'changchun-hrss-notices', sourceUrl: 'http://ccrs.changchun.gov.cn/ywdt/tzgg/202609/t20260930_1.html', regionId: 'changchun', contentHash: 'fixture', requiresTeacherVerification: true };
  const payload = buildStaticPayload({ policies: [policy] });
  assert.equal(payload.policies[0].requiresTeacherVerification, true);
  const mail = createAlertEmail(payload.policies);
  for (const output of [mail.text, mail.html]) {
    assert.match(output, /传输未加密/);
    assert.match(output, /教师岗位.*核对/);
  }
  const app = await readFile(new URL('../free-site/app.js', import.meta.url), 'utf8');
  assert.ok(app.includes('传输未加密'));
  assert.ok(app.includes('requiresTeacherVerification'));
});

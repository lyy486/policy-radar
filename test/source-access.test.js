import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as registry from '../src/source-registry.js';
import { buildStaticPayload, createAlertEmail } from '../scripts/free-site-lib.js';

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

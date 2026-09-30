import test from 'node:test';
import assert from 'node:assert/strict';
import { listSources, listSourceCoverage } from '../src/source-registry.js';
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

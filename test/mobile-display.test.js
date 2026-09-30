import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

const app = await readFile(new URL('../free-site/app.js', import.meta.url), 'utf8');
const html = await readFile(new URL('../free-site/index.html', import.meta.url), 'utf8');
const declarations = app.slice(0, app.indexOf('function create('));
const dates = runInNewContext(declarations + '; ({safeDate})', { Intl, Date });

test('official publication display does not invent time from date-only list entries', () => {
  const published = dates.safeDate('2026-07-03T01:00:00.000Z', false);
  assert.doesNotMatch(published, /\d{1,2}:\d{2}/);
  assert.match(published, /2026.*7.*3/);
  assert.match(dates.safeDate('2026-09-30T09:11:32.000Z'), /\d{1,2}:\d{2}/);
  assert.equal(dates.safeDate(null, false), '官网未标明');
  assert.equal(dates.safeDate('not-a-date', false), '官网未标明');
  assert.match(dates.safeDate('2026-09-29T23:50:00Z', false), /2026.*9.*30/);
  assert.ok(app.includes('safeDate(policy.publishedAt, false)'));
});

test('unread history is not described as newly published announcements', () => {
  assert.ok(html.includes('条未读公告'));
  assert.ok(html.includes('可能包含历史'));
  assert.ok(app.includes("text: '未读'"));
  assert.ok(app.includes('新收录公告'));
  assert.ok(!app.includes('政策雷达发现新公告'));
});

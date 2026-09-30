import test from 'node:test';
import assert from 'node:assert/strict';
import { parseNonganEducationResponse } from '../src/adapters/nongan-education.js';

// Actual public API metadata observed 2026-09-30 UTC; no personal roster content.
const REAL_PAYLOAD = {
  "num": 62,
  "nPage": 1,
  "data": [
    {
      "title": "农安县教育局机关简介",
      "puburl": "http://zwgk.changchun.gov.cn/na/xzfzcbm/naxjyj/zdlyjczwgk/202302/t20230202_3185683.html",
      "tip": {
        "dates": "2026-06-11"
      }
    },
    {
      "title": "2026年致全县中小学新生家长的一封信",
      "puburl": "http://zwgk.changchun.gov.cn/na/xzfzcbm/naxjyj/zdlyjczwgk/202606/t20260601_3490523.html",
      "tip": {
        "dates": "2026-06-01"
      }
    },
    {
      "title": "农安县教育局2026年部门预算公开（汇总、本级、二级单位）",
      "puburl": "http://zwgk.changchun.gov.cn/na/xzfzcbm/naxjyj/zdlyjczwgk/202605/t20260514_3487043.html",
      "tip": {
        "dates": "2026-05-14"
      }
    },
    {
      "title": "农安县教育局行政执法主体及执法事项公示",
      "puburl": "http://zwgk.changchun.gov.cn/na/xzfzcbm/naxjyj/zdlyjczwgk/202603/t20260326_3476440.html",
      "tip": {
        "dates": "2026-03-26"
      }
    },
    {
      "title": "农安县教育局2025年法治政府建设工作报告",
      "puburl": "http://zwgk.changchun.gov.cn/na/xzfzcbm/naxjyj/zdlyjczwgk/202603/t20260309_3472352.html",
      "tip": {
        "dates": "2026-03-09"
      }
    },
    {
      "title": "校外培训监管处罚决定书",
      "puburl": "http://zwgk.changchun.gov.cn/na/xzfzcbm/naxjyj/zdlyjczwgk/202602/t20260204_3466011.html",
      "tip": {
        "dates": "2026-02-04"
      }
    },
    {
      "title": "关于召开农安县人民政府收购合隆镇鑫海实验学校资产听证会的公告",
      "puburl": "http://zwgk.changchun.gov.cn/na/xzfzcbm/naxjyj/zdlyjczwgk/202512/t20251230_3456558.html",
      "tip": {
        "dates": "2025-12-30"
      }
    },
    {
      "title": "农安县2025年下半年高中学业考试时间及科目",
      "puburl": "http://zwgk.changchun.gov.cn/na/xzfzcbm/naxjyj/zdlyjczwgk/202512/t20251209_3445992.html",
      "tip": {
        "dates": "2025-12-09"
      }
    },
    {
      "title": "农安县教育局2024年度部门决算（汇总、本级、二级单位）",
      "puburl": "http://zwgk.changchun.gov.cn/na/xzfzcbm/naxjyj/zdlyjczwgk/202510/t20251030_3437228.html",
      "tip": {
        "dates": "2025-10-31"
      }
    },
    {
      "title": "农安县教育局涉企行政检查事项清单",
      "puburl": "http://zwgk.changchun.gov.cn/na/xzfzcbm/naxjyj/zdlyjczwgk/202510/t20251009_3432306.html",
      "tip": {
        "dates": "2025-10-09"
      }
    },
    {
      "title": "关于农安县第五幼儿园正式办学的通知",
      "puburl": "http://zwgk.changchun.gov.cn/na/xzfzcbm/naxjyj/zdlyjczwgk/202509/t20250910_3426197.html",
      "tip": {
        "dates": "2025-09-10"
      }
    },
    {
      "title": "致全县2025年义务教育新生家长的一封信",
      "puburl": "http://zwgk.changchun.gov.cn/na/xzfzcbm/naxjyj/zdlyjczwgk/202506/t20250609_3406940.html",
      "tip": {
        "dates": "2025-06-09"
      }
    },
    {
      "title": "农安县教育局2025年部门预算（汇总、本级、二级单位）",
      "puburl": "http://zwgk.changchun.gov.cn/na/xzfzcbm/naxjyj/zdlyjczwgk/202505/t20250521_3401721.html",
      "tip": {
        "dates": "2025-05-21"
      }
    },
    {
      "title": "农安县教育局2024年法治政府建设工作报告",
      "puburl": "http://zwgk.changchun.gov.cn/na/xzfzcbm/naxjyj/zdlyjczwgk/202503/t20250327_3389313.html",
      "tip": {
        "dates": "2025-03-27"
      }
    },
    {
      "title": "关于长春市农安高级中学变更校名为农安县第二实验中学的通知",
      "puburl": "http://zwgk.changchun.gov.cn/na/xzfzcbm/naxjyj/zdlyjczwgk/202503/t20250324_3388462.html",
      "tip": {
        "dates": "2025-03-24"
      }
    },
    {
      "title": "农安县义务教育学校学籍管理办法（试行）",
      "puburl": "http://zwgk.changchun.gov.cn/na/xzfzcbm/naxjyj/zdlyjczwgk/202411/t20241113_3358905.html",
      "tip": {
        "dates": "2024-11-13"
      }
    }
  ]
};

const SOURCE_URL = 'http://infogate.changchun.gov.cn/govsearch/jsonp/gkml/zf_list.jsp?page=1&lb=58855&sword=&searchColumn=all&searchYear=all&pubURL=http%3A%2F%2Fzwgk.changchun.gov.cn%2Fna&SType=1&searchColumnYear=all&searchYear=all&pubURL=&SType=1&channelId=58855&callback=result';
const SOURCE = Object.freeze({ id: 'nong-an-education-notices', url: SOURCE_URL });
const RECORD = REAL_PAYLOAD.data[0];
const wrap = (value) => 'result(' + JSON.stringify(value) + ');';
const response = (records = [RECORD], extra = {}) => wrap({ num: records.length, nPage: 1, data: records, ...extra });
const parse = (text, source = SOURCE) => parseNonganEducationResponse(text, source);

test('真实公开JSONP首屏完整保留16条、官方发布日期及正文地址', () => {
  const entries = parse('\r\n' + wrap(REAL_PAYLOAD) + '\n');
  assert.equal(entries.length, 16);
  assert.deepEqual(entries[0], { title: '农安县教育局机关简介', sourceUrl: RECORD.puburl, publishedAt: '2026-06-11' });
  assert.equal(entries[15].publishedAt, '2024-11-13');
  assert.equal(entries[15].title, '农安县义务教育学校学籍管理办法（试行）');
  assert.equal(entries.some((entry) => /招聘/.test(entry.title)), false);
  assert.deepEqual(Object.keys(entries[0]), ['title', 'sourceUrl', 'publishedAt']);
});

test('来源id及完整GET地址精确绑定，不能删除重复参数或改变端点', () => {
  const urls = [undefined, '', SOURCE_URL + ' ', SOURCE_URL + '#fragment', SOURCE_URL + '&extra=1',
    SOURCE_URL.replace('http:', 'https:'), SOURCE_URL.replace('page=1', 'page=2'),
    SOURCE_URL.replace('lb=58855', 'lb=99999'), SOURCE_URL.replace('channelId=58855', 'channelId=1'),
    SOURCE_URL.replace('callback=result', 'callback=other'), SOURCE_URL.replace('&pubURL=&SType=1', ''),
    SOURCE_URL.replace('infogate.changchun.gov.cn', 'u@infogate.changchun.gov.cn'),
    SOURCE_URL.replace('infogate.changchun.gov.cn', 'infogate.changchun.gov.cn:80'),
    SOURCE_URL.replace('page=1&lb=58855', 'lb=58855&page=1')];
  for (const url of urls) assert.throws(() => parse(response(), { ...SOURCE, url }), /农安.*来源/);
  for (const source of [null, undefined, {}, { ...SOURCE, id: 'other' }]) {
    assert.throws(() => parseNonganEducationResponse(response(), source), /农安.*来源/);
  }
});

test('只解析固定result JSONP，不执行脚本、不容忍维护挑战或截断响应', () => {
  const empty = JSON.stringify({ num: 0, nPage: 1, data: [] });
  const invalid = [null, undefined, 1, {}, '', '<h1>网站维护中</h1>private-canary',
    '<title>Access denied captcha</title>', empty, 'other(' + empty + ');',
    'result(' + empty + ');globalThis.nonganCanary=1;', 'result(' + empty + ');result(' + empty + ');',
    '/* unsafe */result(' + empty + ');', 'result({bad:1});', 'result(' + empty.slice(0, -1),
    'result((globalThis.nonganCanary=1));', 'result(' + empty + ');<!--tail-->', 'x'.repeat(1_500_001)];
  for (const text of invalid) {
    assert.throws(() => parse(text), (error) => /农安/.test(error.message) && !/private-canary/.test(error.message));
  }
  assert.equal(globalThis.nonganCanary, undefined);
  assert.deepEqual(parse(' result ( ' + empty + ' ) '), []);
});

test('严格校验num/nPage/data，不把结构变化、空洞或部分页当成功', () => {
  const invalid = [null, [], true, {}, { num: 0, nPage: 1 },
    { num: '0', nPage: 1, data: [] }, { num: -1, nPage: 1, data: [] },
    { num: 0.5, nPage: 1, data: [] }, { num: Number.MAX_SAFE_INTEGER + 1, nPage: 1, data: [] },
    { num: 0, nPage: 0, data: [] }, { num: 0, nPage: 2, data: [] },
    { num: 0, nPage: '1', data: [] }, { num: 0, nPage: 1, data: {} },
    { num: 1, nPage: 1, data: [] }, { num: 0, nPage: 1, data: [RECORD] },
    { num: 62, nPage: 1, data: [RECORD] }, { num: 17, nPage: 1, data: Array(17).fill(RECORD) }];
  for (const payload of invalid) assert.throws(() => parse(wrap(payload)), /农安.*(?:结构|分页)/);
  assert.deepEqual(parse(response([])), []);
});

test('公告字段类型改变安全失败，缺少日期不等于未知记录结构', () => {
  for (const item of [null, [], 'text', 5, {}, { ...RECORD, title: null },
    { ...RECORD, puburl: undefined }, { ...RECORD, puburl: 4 },
    { ...RECORD, tip: [] }, { ...RECORD, tip: 'dates' }, { ...RECORD, tip: 3 }]) {
    assert.throws(() => parse(response([item])), /农安.*字段/);
  }
});

test('正文只接受实际同源同协议原始路径，不允许URL规范化掩盖逃逸', () => {
  const prefix = 'http://zwgk.changchun.gov.cn/na/xzfzcbm/naxjyj/zdlyjczwgk/';
  const tail = '202302/t20230202_3185683.html';
  const badUrls = ['javascript:void(0)', '//zwgk.changchun.gov.cn/' + tail, '/na/' + tail,
    RECORD.puburl.replace('http:', 'https:'), RECORD.puburl.replace('zwgk.', 'evil.'),
    RECORD.puburl.replace('zwgk.changchun.gov.cn', 'zwgk.changchun.gov.cn.evil.example'),
    RECORD.puburl.replace('zwgk.changchun.gov.cn', 'zwgk.changchun.gov.cn.'),
    RECORD.puburl.replace('zwgk.changchun.gov.cn', 'u:p@zwgk.changchun.gov.cn'),
    RECORD.puburl.replace('zwgk.changchun.gov.cn', 'zwgk.changchun.gov.cn:80'),
    RECORD.puburl.replace('zwgk.changchun.gov.cn', 'zwgk.changchun.gov.cn:8080'),
    RECORD.puburl.replace('naxjyj', 'naxrlzyhshbzj'), RECORD.puburl.toUpperCase(),
    prefix + '../' + tail, prefix + './' + tail, prefix + '%2e%2e/' + tail,
    prefix + '%252e%252e/' + tail, prefix + '%2F' + tail, prefix + '\\' + tail,
    prefix + '202302/../' + tail, RECORD.puburl.replace('.html', '%2ehtml'),
    RECORD.puburl + '?next=evil', RECORD.puburl + '#fragment', RECORD.puburl + '/extra',
    ' ' + RECORD.puburl, RECORD.puburl + '\n', RECORD.puburl.replace('.html', '.pdf'), ''];
  for (const puburl of badUrls) {
    assert.equal(parse(response([RECORD, { ...RECORD, puburl }])).length, 1, puburl);
    assert.throws(() => parse(response([{ ...RECORD, puburl }])), /农安.*公告/);
  }
});

test('发布日期只能来自tip.dates，返回日期本身，不补时间或借用URL和成文日期', () => {
  for (const dates of [undefined, null, '', 20260611, '2026-02-29', '2026-02-31', '2026-13-01',
    '2026-00-01', '2026-01-00', '2026-6-11', '2026/06/11', '2026-06-11T00:00:00Z', '2026-06-11\n', 'invalid']) {
    const entry = parse(response([{ ...RECORD, efectdate: '2026.01.01 00:00:00', tip: { dates } }]))[0];
    assert.equal(entry.publishedAt, null);
  }
  for (const tip of [undefined, null, {}]) assert.equal(parse(response([{ ...RECORD, tip }]))[0].publishedAt, null);
  assert.equal(parse(response([{ ...RECORD, tip: { dates: '2024-02-29' } }]))[0].publishedAt, '2024-02-29');
  assert.equal(parse(response())[0].publishedAt, '2026-06-11');
});

test('清理font高亮、普通标记、命名及数字实体，不把教资办理改写为招聘', () => {
  const title = '  农安县教育局认定<font color=blue>教师</font>资格证流程&nbsp;&amp;&quot;说明&quot;&apos;\n&#x6559;&#24072; ';
  const entry = parse(response([{ ...RECORD, title }]))[0];
  assert.equal(entry.title, '农安县教育局认定教师资格证流程 &"说明"\' 教师');
  assert.doesNotMatch(entry.title, /招聘/);
  const formatted = parse(response([{ ...RECORD, title: '&lt;b&gt;教师&lt;/b&gt;&ensp;资格认定&mdash;办理指南' }]))[0];
  assert.equal(formatted.title, '教师 资格认定—办理指南');
  const second = parse(response([{ ...RECORD, title: '教师&#x1F4D6;资格认定&amp;#说明' }]))[0];
  assert.equal(second.title, '教师📖资格认定&#说明');
});

test('截短标题、状态标题、无效实体及隐藏脚本不能制造有效公告', () => {
  const badTitles = ['', '短', '教'.repeat(181), '教师招聘公告...', '教师资格认定…', '教师招聘&hellip;',
    '网站维护中', '系统正在维护', '访问受限安全验证', 'Access denied captcha', '教师\u0000招聘公告',
    '教师&#0;招聘公告', '教师&#xD800;招聘公告', '教师&#x110000;招聘公告',
    '<script>globalThis.nonganCanary=1</script>', '&lt;script&gt;alert(1)&lt;/script&gt;',
    '教师招聘公告<script>bad', '教师招聘公告<font', '教师&unverifiedEntity;招聘公告', '教师&constructor;招聘公告'];
  for (const title of badTitles) {
    assert.throws(() => parse(response([RECORD, { ...RECORD, title }])), /农安.*公告标题/, title);
    assert.throws(() => parse(response([{ ...RECORD, title }])), /农安.*公告/);
  }
  assert.equal(globalThis.nonganCanary, undefined);
});

test('合法正文链接的异常标题不能被其他正常记录掩盖，固定错误不回显标题', () => {
  const broken = { ...REAL_PAYLOAD.data[1], title: '教师招聘private-title-canary...' };
  assert.throws(() => parse(response([RECORD, broken])), (error) => {
    assert.equal(error.message, '农安教育公开接口公告标题不完整或无法识别');
    assert.doesNotMatch(error.message, /private-title-canary/);
    return true;
  });
  const outside = { ...broken, puburl: 'https://outside.invalid/notice.html' };
  assert.equal(parse(response([RECORD, outside])).length, 1);
});

test('按正文URL去重且保留首条，不修改调用方配置或记录', () => {
  const before = JSON.stringify(REAL_PAYLOAD);
  const entries = parse(response([RECORD, { ...RECORD, title: '相同文章的新标题', tip: { dates: '2026-07-01' } }, REAL_PAYLOAD.data[1]]));
  assert.equal(entries.length, 2);
  assert.equal(entries[0].title, RECORD.title);
  assert.equal(entries[0].publishedAt, '2026-06-11');
  assert.equal(JSON.stringify(REAL_PAYLOAD), before);
  assert.deepEqual(SOURCE, { id: 'nong-an-education-notices', url: SOURCE_URL });
});

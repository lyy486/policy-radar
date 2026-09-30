import test from 'node:test';
import assert from 'node:assert/strict';
import { listSources, listSourceCoverage, isApprovedFreeSource } from '../src/source-registry.js';
import { fetchOfficialSource, parseOfficialList, syncSources } from '../src/sync-service.js';
import { FREE_UPGRADE_FILES } from '../scripts/free-release-manifest.js';
import { planSourceBaselineSync, captureSourceBaselines, deliverPolicyAlerts } from '../scripts/free-site-lib.js';

const API = 'http://infogate.changchun.gov.cn/govsearch/jsonp/gkml/zf_list.jsp?page=1&lb=58855&sword=&searchColumn=all&searchYear=all&pubURL=http%3A%2F%2Fzwgk.changchun.gov.cn%2Fna&SType=1&searchColumnYear=all&searchYear=all&pubURL=&SType=1&channelId=58855&callback=result';
const source = () => listSources().find(item => item.id === 'nong-an-education-notices');
const record = (id, title = '农安县教师招聘笔试时间公告') => ({ title, puburl: `http://zwgk.changchun.gov.cn/na/xzfzcbm/naxjyj/zdlyjczwgk/202609/t20260930_${id}.html`, tip: { dates: '2026-09-30' } });
const body = records => `result(${JSON.stringify({num:records.length,nPage:1,data:records})});`;
const response = text => async () => ({ok:true,status:200,headers:{get:()=>null},text:async()=>text});

test('Nongan is bound to its approved public dynamic endpoint without widening other sources', () => {
  const configured = source();
  assert.equal(configured.url, API);
  assert.equal(configured.parser, 'nongan-education');
  assert.equal(configured.enabled, true);
  assert.equal(configured.alertBaselineOnFirstSync, true);
  assert.equal(configured.detailPathPrefix, undefined);
  assert.equal(isApprovedFreeSource(configured), true);
  assert.equal(listSourceCoverage().find(item=>item.regionId==='nong-an-cc').status,'active');
  for (const url of [API.replace('page=1','page=2'),API.replace('callback=result','callback=evil'),API.replace('channelId=58855','channelId=58856'),API+'&extra=1']) assert.equal(isApprovedFreeSource({...configured,url}),false);
  assert.equal(isApprovedFreeSource({...configured,userApprovedPublicHttp:false}),false);
  assert.equal(listSources().find(item=>item.id==='jingyue-education-notices').parser,'jingyue-education');
});

test('verified JSONP empty lists succeed but broken wrappers do not masquerade as no announcements', async () => {
  let request;
  const fetched = await fetchOfficialSource(source(), async (url,options) => { request={url,options}; return response(body([]))(); });
  assert.deepEqual(fetched.policies, []);
  assert.equal(request.url,API);
  assert.equal(request.options.redirect,'manual');
  assert.match(request.options.headers.accept,/javascript/);
  assert.equal(Object.keys(request.options.headers).some(key=>/authorization|cookie/i.test(key)),false);
  await assert.rejects(fetchOfficialSource(source(),response('<title>网站维护中</title>')),/JSONP/);
});

test('Nongan cross-host details remain adapter-specific and classification retains teacher qualification meaning', async () => {
  const records=[record(999901,'农安县2026年教师资格认定申请公告'),record(999902)];
  const fetched=await fetchOfficialSource(source(),response(body(records)));
  assert.equal(fetched.policies.length,2);
  assert.equal(fetched.policies[0].policyType,'教师资格考试');
  assert.equal(fetched.policies[0].publishedAt,'2026-09-30');
  assert.equal(fetched.policies[1].category,'笔试时间');
  assert.deepEqual(parseOfficialList(`<a href="${records[0].puburl}">${records[0].title}</a>`,{...source(),parser:'gov-list'}),[]);
});

test('Nongan initial snapshot is historical and later new notices send once while failures preserve history', async () => {
  const configured=source(), plan=planSourceBaselineSync([configured],{});
  const store={policies:[],subscriptions:[],notifications:[],sourceState:plan.sourceState};
  const results=await syncSources({store,sources:[configured],fetchImpl:response(body([record(999901)]))});
  assert.equal(results[0].status,'ok');
  const captured=captureSourceBaselines({initialSourceIds:plan.initialSourceIds,sourceState:store.sourceState,results,policies:store.policies});
  let state={hashes:['a'.repeat(64)],initializedSourceIds:[]};
  const sent=[];
  const options={initialSourceIds:plan.initialSourceIds,sourceBaselines:captured.sourceBaselines,readState:async()=>state,writeState:async value=>{state=structuredClone(value);},sendAlert:async items=>{sent.push(items.map(item=>item.contentHash));return true;},logger:{log(){},warn(){}}};
  await deliverPolicyAlerts({...options,policies:store.policies});
  assert.equal(sent.length,0);
  assert.ok(state.hashes.includes('a'.repeat(64)));
  assert.ok(state.initializedSourceIds.includes(configured.id));
  await syncSources({store,sources:[configured],fetchImpl:response(body([record(999901),record(999902)]))});
  await deliverPolicyAlerts({...options,policies:store.policies});
  await deliverPolicyAlerts({...options,policies:store.policies});
  assert.equal(sent.length,1);assert.equal(sent[0].length,1);
  const failure=await syncSources({store,sources:[configured],fetchImpl:response('result({invalid})')});
  assert.equal(failure[0].status,'failed');assert.equal(store.policies.length,2);
});

test('Nongan safe upgrade contains dedicated tests and no live state or local email configuration', () => {
  for(const file of ['src/adapters/nongan-education.js','test/nongan-education.test.js','test/nongan-source-integration.test.js']) assert.ok(FREE_UPGRADE_FILES.includes(file),file);
  for(const file of ['data/free-store.json','data/free-notified.json','free-site/data/policies.json','data/local-email.json']) assert.equal(FREE_UPGRADE_FILES.includes(file),false);
});

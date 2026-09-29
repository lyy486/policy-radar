import { JILIN_REGIONS } from './policy-service.js';

const COMMON = {
  intervalMinutes: 60,
  enabled: true,
  parser: 'gov-list',
  userAgent: 'PolicyRadar/0.2 (personal-use; contact required before deployment)'
};

const CHANGCHUN_TITLE_PATTERN = '招聘|特岗|特设岗位|教师资格|教资|报名|笔试|面试|资格审查|资格复审|体检|成绩|递补|拟聘|拟录用|中小学教师';
const CHANGCHUN_HTTPS_CANDIDATES = [
  ['chaoyang-https-candidate', '朝阳区政府新域名候选入口', 'chaoyang-cc', 'https://chaoyang.changchun.gov.cn/'],
  ['nanguan-https-candidate', '南关区政府新域名候选入口', 'nanguan-cc', 'https://nanguan.gov.cn/'],
  ['kuancheng-https-candidate', '宽城区政府新域名候选入口', 'kuancheng-cc', 'https://jckc.gov.cn/'],
  ['erdao-https-candidate', '二道区政府新域名候选入口', 'erdao-cc', 'https://ccerdao.gov.cn/'],
  ['lvyuan-https-candidate', '绿园区政府新域名候选入口', 'lvyuan-cc', 'https://luyuan.gov.cn/'],
  ['shuangyang-https-candidate', '双阳区政府新域名候选入口', 'shuangyang-cc', 'https://shuangyang.gov.cn/'],
  ['jiutai-https-candidate', '九台区政府新域名候选入口', 'jiutai-cc', 'https://jiutai.gov.cn/'],
  ['jingyue-https-candidate', '净月区政府新域名候选入口', 'jingyue-cc', 'https://jingyue.gov.cn/'],
  ['lianhuashan-https-candidate', '莲花山生态旅游度假区新域名候选入口', 'lianhuashan-cc', 'https://cclm.gov.cn/'],
  ['dehui-https-candidate', '德惠市政府新域名候选入口', 'dehui-cc', 'https://dehui.gov.cn/'],
  ['yushu-https-candidate', '榆树市政府新域名候选入口', 'yushu-cc', 'https://yushu.gov.cn/'],
  ['nong-an-https-candidate', '农安县政府新域名候选入口', 'nong-an-cc', 'https://nongan.gov.cn/']
].map(([id, name, regionId, url]) => ({
  ...COMMON,
  enabled: false,
  id,
  name,
  regionIds: [regionId],
  category: '教师招聘',
  titlePattern: CHANGCHUN_TITLE_PATTERN,
  url,
  transport: 'https',
  reviewStatus: 'https-pending',
  verificationNote: '吉林省政府站群目录列出的地区政府域名；当前仅登记候选，必须在目标服务器核验 DNS、证书、页面归属、robots、列表结构和人工抽样后才能启用'
}));

export const SOURCE_REGISTRY = [
  { ...COMMON, id: 'jilin-education-announcements', name: '吉林省教育厅公示公告（教师考试相关）', regionIds: ['jilin'], category: '教师招聘', titlePattern: '招聘|特岗|特设岗位|教师资格|教资|报名|笔试|面试|资格审查|资格复审|体检|成绩|递补|拟聘|拟录用|中小学教师', url: 'https://jyt.jl.gov.cn/zwgk/ggl/', transport: 'https', reviewStatus: 'verified-reachable-title-filtered' },
  { ...COMMON, enabled: false, id: 'jilin-education-notices', name: '吉林省教育厅文件通知', regionIds: ['jilin'], category: '教育政策', url: 'https://jyt.jl.gov.cn/zwgk/wjtz/', transport: 'https', reviewStatus: 'unreachable-404' },
  { ...COMMON, id: 'jilin-hrss-announcements', name: '吉林省人力资源和社会保障厅公告（教师相关）', regionIds: ['jilin'], category: '教师招聘', titlePattern: '教师|教育|学校|中小学|幼儿园|特岗|师范', url: 'https://hrss.jl.gov.cn/gg/', transport: 'https', reviewStatus: 'verified-reachable-title-filtered' },
  { ...COMMON, id: 'jilin-hrss-headlines', name: '吉林省人力资源和社会保障厅今日头条（教师相关）', regionIds: ['jilin'], category: '教师招聘', titlePattern: '教师|教育|学校|中小学|幼儿园|特岗|师范', url: 'https://hrss.jl.gov.cn/jrtt/', transport: 'https', reviewStatus: 'verified-reachable-title-filtered' },
  { ...COMMON, enabled: false, id: 'jilin-city-education-announcements', name: '吉林市教育局公告公示（教师考试相关）', regionIds: ['jilin-city'], category: '教师招聘', titlePattern: '招聘|特岗|特设岗位|教师资格|教资|报名|笔试|面试|资格审查|资格复审|体检|成绩|递补|拟聘|拟录用|中小学教师', url: 'https://www.jlcity.gov.cn/bmwz/edu/zwgk/gggs/', transport: 'https', reviewStatus: 'runtime-pending', verificationNote: '当前运行环境 HTTPS 连接失败；保持禁用，待目标云服务器复测官方入口' },
  { ...COMMON, enabled: false, id: 'jilin-city-education-notices', name: '吉林市教育局文件通知（教师考试相关）', regionIds: ['jilin-city'], category: '教师招聘', titlePattern: '招聘|特岗|特设岗位|教师资格|教资|报名|笔试|面试|资格审查|资格复审|体检|成绩|递补|拟聘|拟录用|中小学教师', url: 'https://www.jlcity.gov.cn/bmwz/edu/zwgk/wjtz/', transport: 'https', reviewStatus: 'runtime-pending', verificationNote: '当前运行环境 HTTPS 连接失败；保持禁用，待目标云服务器复测官方入口' },
  { ...COMMON, enabled: false, id: 'jilin-city-hrss-announcements', name: '吉林市人力资源和社会保障局公告（教师相关）', regionIds: ['jilin-city'], category: '教师招聘', titlePattern: '教师|教育|学校|中小学|幼儿园|特岗|师范', url: 'https://www.jlcity.gov.cn/bmwz/rsj/gg/', transport: 'https', reviewStatus: 'runtime-pending', verificationNote: '当前运行环境 HTTPS 连接失败；保持禁用，待目标云服务器复测官方入口' },
  { ...COMMON, enabled: false, id: 'baishan-education-announcements', name: '白山市教育局公告公示（教师考试相关）', regionIds: ['baishan'], category: '教师招聘', titlePattern: '招聘|特岗|特设岗位|教师资格|教资|报名|笔试|面试|资格审查|资格复审|体检|成绩|递补|拟聘|拟录用|中小学教师', excludeTitlePattern: '专业技术资格|职称|评审', url: 'https://edu.cbs.gov.cn/zwgk/gsgg/', transport: 'https', reviewStatus: 'runtime-pending', verificationNote: '当前运行环境 HTTPS 连接失败；保持禁用，待目标云服务器复测官方入口' },
  { ...COMMON, enabled: false, id: 'baishan-hrss-announcements', name: '白山市人力资源和社会保障局公告（教师相关）', regionIds: ['baishan'], category: '教师招聘', titlePattern: '教师|中小学|幼儿园|特岗|师范', excludeTitlePattern: '职业技能|培训补贴', url: 'https://hrss.cbs.gov.cn/gzdt/tzgg/', transport: 'https', reviewStatus: 'runtime-pending', verificationNote: '当前运行环境 HTTPS 连接失败；保持禁用，待目标云服务器复测官方入口' },
  { ...COMMON, id: 'tonghua-education-announcements', name: '通化市教育相关公开信息（教师考试相关）', regionIds: ['tonghua'], category: '教师招聘', titlePattern: '招聘|特岗|特设岗位|教师资格|教资|报名|笔试|面试|资格审查|资格复审|体检|成绩|递补|拟聘|拟录用|中小学教师', url: 'https://www.tonghua.gov.cn/zwgk/jyta/', transport: 'https', reviewStatus: 'verified-reachable-title-filtered' },
  { ...COMMON, id: 'tonghua-hrss-announcements', name: '通化市人力资源和社会保障局公示公告（教师相关）', regionIds: ['tonghua'], category: '教师招聘', titlePattern: '教师|教育|学校|中小学|幼儿园|特岗|师范', url: 'https://rsj.tonghua.gov.cn/gsgg/', transport: 'https', reviewStatus: 'verified-reachable-title-filtered' },
  { ...COMMON, id: 'songyuan-government-notices', name: '松原市人民政府通知公告（教师相关）', regionIds: ['songyuan'], category: '教师招聘', titlePattern: '招聘|特岗|教师资格|教资|教师|中小学|幼儿园|报名|笔试|面试|资格审查|资格复审|体检|成绩|递补|拟聘|拟录用', url: 'https://www.jlsy.gov.cn/zwgk/tzgg/', transport: 'https', reviewStatus: 'verified-reachable-title-filtered' },
  { ...COMMON, enabled: false, id: 'liaoyuan-government-news', name: '辽源市人民政府政务信息（教师相关）', regionIds: ['liaoyuan'], category: '教师招聘', titlePattern: '招聘|特岗|教师资格|教资|教师|中小学|幼儿园|报名|笔试|面试|资格审查|资格复审|体检|成绩|递补|拟聘|拟录用', url: 'https://www.liaoyuan.gov.cn/xxgk/dtxw/zwlb/', transport: 'https', reviewStatus: 'runtime-pending', verificationNote: '当前运行环境 HTTPS 连接失败；保持禁用，待目标云服务器复测官方入口' },
  { ...COMMON, enabled: false, id: 'siping-education-candidate', name: '四平市教育局候选入口（教师考试相关）', regionIds: ['siping'], category: '教师招聘', titlePattern: '招聘|特岗|特设岗位|教师资格|教资|报名|笔试|面试|资格审查|资格复审|体检|成绩|递补|拟聘|拟录用|中小学教师', url: 'https://edu.siping.gov.cn/', transport: 'https', allowHttp: true, reviewStatus: 'https-pending', verificationNote: '官方页面 HTTP 可访问但 HTTPS/TLS 尚未核验；仅允许本机显式试验，不得用于生产' },
  { ...COMMON, enabled: false, id: 'siping-hrss-candidate', name: '四平市人社局候选入口（教师相关）', regionIds: ['siping'], category: '教师招聘', titlePattern: '教师|教育|学校|中小学|幼儿园|特岗|师范', url: 'https://hrss.siping.gov.cn/', transport: 'https', allowHttp: true, reviewStatus: 'https-pending', verificationNote: '官方页面 HTTP 可访问但 HTTPS/TLS 尚未核验；仅允许本机显式试验，不得用于生产' },
  { ...COMMON, enabled: false, id: 'baicheng-education-candidate', name: '白城市教育局候选入口（教师考试相关）', regionIds: ['baicheng'], category: '教师招聘', titlePattern: '招聘|特岗|特设岗位|教师资格|教资|报名|笔试|面试|资格审查|资格复审|体检|成绩|递补|拟聘|拟录用|中小学教师', url: 'https://jy.jlbc.gov.cn/', transport: 'https', allowHttp: true, reviewStatus: 'https-pending', verificationNote: '官方页面 HTTP 可访问但 HTTPS/TLS 尚未核验；仅允许本机显式试验，不得用于生产' },
  { ...COMMON, enabled: false, id: 'baicheng-hrss-candidate', name: '白城市人社局候选入口（教师相关）', regionIds: ['baicheng'], category: '教师招聘', titlePattern: '教师|教育|学校|中小学|幼儿园|特岗|师范', url: 'https://hrss.jlbc.gov.cn/', transport: 'https', allowHttp: true, reviewStatus: 'https-pending', verificationNote: '官方页面 HTTP 可访问但 HTTPS/TLS 尚未核验；仅允许本机显式试验，不得用于生产' },
  { ...COMMON, enabled: false, id: 'yanbian-government-candidate', name: '延边州政府通知公告候选入口（教师相关）', regionIds: ['yanbian'], category: '教师招聘', titlePattern: '招聘|特岗|教师资格|教资|教师|中小学|幼儿园|报名|笔试|面试|资格审查|资格复审|体检|成绩|递补|拟聘|拟录用', url: 'https://www.yanbian.gov.cn/zw/tzgg/', transport: 'https', allowHttp: true, reviewStatus: 'https-pending', verificationNote: '官方页面 HTTP 可访问但 HTTPS/TLS 尚未核验；仅允许本机显式试验，不得用于生产' },
  { ...COMMON, enabled: false, id: 'yanbian-education-candidate', name: '延边州教育局候选入口（教师考试相关）', regionIds: ['yanbian'], category: '教师招聘', titlePattern: '招聘|特岗|特设岗位|教师资格|教资|报名|笔试|面试|资格审查|资格复审|体检|成绩|递补|拟聘|拟录用|中小学教师', url: 'https://edu.yanbian.gov.cn/', transport: 'https', allowHttp: true, reviewStatus: 'https-pending', verificationNote: '百度官方结果与州政府部门目录均指向延边州教育局；当前 HTTP 可访问，HTTPS 请求超时，生产禁用' },
  { ...COMMON, enabled: false, id: 'yanbian-hrss-candidate', name: '延边州人力资源和社会保障局候选入口（教师相关）', regionIds: ['yanbian'], category: '教师招聘', titlePattern: '教师|教育|学校|中小学|幼儿园|特岗|师范|招聘|招录|选聘', url: 'https://hrss.yanbian.gov.cn/', transport: 'https', allowHttp: true, reviewStatus: 'https-pending', verificationNote: '官方结果指向延边州人社局网站；当前 HTTPS 请求超时，生产禁用' },
  { ...COMMON, enabled: false, id: 'gongzhuling-government-candidate', name: '公主岭市政府政务信息候选入口（教师相关）', regionIds: ['gongzhuling-cc'], category: '教师招聘', titlePattern: '招聘|特岗|教师资格|教资|教师|中小学|幼儿园|报名|笔试|面试|资格审查|资格复审|体检|成绩|递补|拟聘|拟录用', url: 'https://www.gongzhuling.gov.cn/zw/dzxx/bmdt/', transport: 'https', allowHttp: true, reviewStatus: 'https-pending', verificationNote: '公主岭市政府官方政务信息入口 HTTP 可访问但 HTTPS/TLS 尚未核验；仅允许本机显式试验，不计入长春全选' },
  { ...COMMON, enabled: false, id: 'jiangyuan-government-announcements-candidate', name: '江源区人民政府公告栏候选入口（教师考试相关）', regionIds: ['jiangyuan-bs'], category: '教师招聘', titlePattern: '招聘|特岗|特设岗位|教师资格|教资|教师|中小学|幼儿园|学校|教育系统|报名|笔试|面试|资格审查|资格复审|体检|成绩|递补|拟聘|拟录用', excludeTitlePattern: '专业技术资格|职称|评审|劳务派遣|农民工', url: 'https://jy.cbs.gov.cn/zwgk/ggl/', transport: 'https', reviewStatus: 'official-list-runtime-pending', verificationNote: '官方站点和公告列表已人工核验；当前 Node 运行时连接仍被对端中断，保持禁用，待目标云服务器复测' },
  { ...COMMON, enabled: false, id: 'jingyu-government-announcements-candidate', name: '靖宇县人民政府公示公告候选入口（教师考试相关）', regionIds: ['jingyu-bs'], category: '教师招聘', titlePattern: '招聘|特岗|特设岗位|教师资格|教资|教师|中小学|幼儿园|学校|教育系统|报名|笔试|面试|资格审查|资格复审|体检|成绩|递补|拟聘|拟录用', excludeTitlePattern: '专业技术资格|职称|评审|劳务派遣|农民工', url: 'https://jyx.cbs.gov.cn/wzsy/gsgg/', transport: 'https', reviewStatus: 'official-list-runtime-pending', verificationNote: '候选审计曾返回 HTTP 200，但 robots.txt 和完整页面抓取不稳定，尚未完成列表解析与人工抽样，保持禁用，待目标云服务器复测' },
  { ...COMMON, enabled: false, id: 'changchun-education-notices', name: '长春市教育局通知公告', regionIds: ['changchun'], category: '教师招聘', titlePattern: '招聘|特岗|特设岗位|教师资格|教资|报名|笔试|面试|资格审查|资格复审|体检|成绩|递补|拟聘|拟录用|中小学教师', url: 'http://jyj.changchun.gov.cn/xxgk/tzgg/', transport: 'http', allowHttp: true, reviewStatus: 'https-pending', verificationNote: '官方页面可访问但当前 HTTPS TLS 不兼容；仅允许本机显式试验，不得用于生产' },
  { ...COMMON, enabled: false, id: 'changchun-hrss-notices', name: '长春市人力资源和社会保障局通知公告', regionIds: ['changchun'], category: '教师招聘', titlePattern: '招聘|特岗|特设岗位|教师资格|教资|报名|笔试|面试|资格审查|资格复审|体检|成绩|递补|拟聘|拟录用|中小学教师', url: 'http://ccrs.changchun.gov.cn/ywdt/tzgg/', transport: 'http', allowHttp: true, reviewStatus: 'https-pending', verificationNote: '官方页面可访问但当前 HTTPS TLS 不兼容；仅允许本机显式试验，不得用于生产' },
  { ...COMMON, enabled: false, id: 'nanguan-education-notices', name: '南关区政府通知公告（教师考试相关）', regionIds: ['nanguan-cc'], category: '教师招聘', titlePattern: '招聘|特岗|特设岗位|教师资格|教资|报名|笔试|面试|资格审查|资格复审|体检|成绩|递补|拟聘|拟录用|中小学教师', url: 'http://nanguan.changchun.gov.cn/ywdt/tzgg/', transport: 'http', allowHttp: true, reviewStatus: 'local-http-verified', verificationNote: '官方区政府入口 HTTP 列表页已核验；HTTPS/TLS 未通过，生产禁用' },
  { ...COMMON, enabled: false, id: 'chaoyang-education-notices', name: '朝阳区政府通知公告（教师考试相关）', regionIds: ['chaoyang-cc'], category: '教师招聘', titlePattern: '招聘|特岗|特设岗位|教师资格|教资|报名|笔试|面试|资格审查|资格复审|体检|成绩|递补|拟聘|拟录用|中小学教师', url: 'http://chaoyang.changchun.gov.cn/zwdt/tzgg/', transport: 'http', allowHttp: true, reviewStatus: 'local-http-verified', verificationNote: '官方区政府入口 HTTP 列表页已核验；HTTPS/TLS 未通过，生产禁用' },
  { ...COMMON, enabled: false, id: 'kuancheng-education-notices', name: '宽城区政府通知公告（教师考试相关）', regionIds: ['kuancheng-cc'], category: '教师招聘', titlePattern: '招聘|特岗|特设岗位|教师资格|教资|报名|笔试|面试|资格审查|资格复审|体检|成绩|递补|拟聘|拟录用|中小学教师', url: 'http://kuancheng.changchun.gov.cn/sy/gsgg/tzgg/', transport: 'http', allowHttp: true, reviewStatus: 'local-http-verified', verificationNote: '官方区政府入口 HTTP 列表页已核验；HTTPS/TLS 未通过，生产禁用' },
  { ...COMMON, enabled: false, id: 'erdao-education-notices', name: '二道区政府通知公告（教师考试相关）', regionIds: ['erdao-cc'], category: '教师招聘', titlePattern: '招聘|特岗|特设岗位|教师资格|教资|报名|笔试|面试|资格审查|资格复审|体检|成绩|递补|拟聘|拟录用|中小学教师', url: 'http://erdao.changchun.gov.cn/zwgk/zdly/gsgg/', transport: 'http', allowHttp: true, reviewStatus: 'local-http-verified', verificationNote: '官方区政府入口 HTTP 列表页已核验；HTTPS/TLS 未通过，生产禁用' },
  { ...COMMON, enabled: false, id: 'lvyuan-education-notices', name: '绿园区政府通知公告（教师考试相关）', regionIds: ['lvyuan-cc'], category: '教师招聘', titlePattern: '招聘|特岗|特设岗位|教师资格|教资|报名|笔试|面试|资格审查|资格复审|体检|成绩|递补|拟聘|拟录用|中小学教师', url: 'http://www.luyuan.gov.cn/ywdt/tzgg/', transport: 'http', allowHttp: true, reviewStatus: 'local-http-verified', verificationNote: '绿园区政府官方列表页 HTTP 已核验；HTTPS/TLS 未通过，生产禁用' },
  { ...COMMON, enabled: false, id: 'shuangyang-education-notices', name: '双阳区政府通知公告（教师考试相关）', regionIds: ['shuangyang-cc'], category: '教师招聘', titlePattern: '招聘|特岗|特设岗位|教师资格|教资|报名|笔试|面试|资格审查|资格复审|体检|成绩|递补|拟聘|拟录用|中小学教师', url: 'http://shuangyang.changchun.gov.cn/dzxx/tzgg/', transport: 'http', allowHttp: true, reviewStatus: 'local-http-verified', verificationNote: '官方区政府入口 HTTP 列表页已核验；HTTPS/TLS 未通过，生产禁用' },
  { ...COMMON, enabled: false, id: 'jiutai-education-notices', name: '九台区政府通知公告（教师考试相关）', regionIds: ['jiutai-cc'], category: '教师招聘', titlePattern: '招聘|特岗|特设岗位|教师资格|教资|报名|笔试|面试|资格审查|资格复审|体检|成绩|递补|拟聘|拟录用|中小学教师', url: 'http://jiutai.changchun.gov.cn/dzxx/tzgg/', transport: 'http', allowHttp: true, reviewStatus: 'local-http-verified', verificationNote: '官方区政府入口 HTTP 列表页已核验；HTTPS/TLS 未通过，生产禁用' },
  { ...COMMON, enabled: false, id: 'jingyue-education-notices', name: '净月区政府通知公告（教师考试相关）', regionIds: ['jingyue-cc'], category: '教师招聘', titlePattern: '招聘|特岗|特设岗位|教师资格|教资|报名|笔试|面试|资格审查|资格复审|体检|成绩|递补|拟聘|拟录用|中小学教师', url: 'http://jingyue.changchun.gov.cn/zw/tzgg/', transport: 'http', allowHttp: true, reviewStatus: 'local-http-verified', verificationNote: '官方区政府入口 HTTP 列表页已核验；HTTPS/TLS 未通过，生产禁用' },
  { ...COMMON, enabled: false, id: 'lianhuashan-education-notices', name: '莲花山生态旅游度假区通知公告（教师考试相关）', regionIds: ['lianhuashan-cc'], category: '教师招聘', titlePattern: '招聘|特岗|特设岗位|教师资格|教资|报名|笔试|面试|资格审查|资格复审|体检|成绩|递补|拟聘|拟录用|中小学教师', url: 'http://lianhuashan.changchun.gov.cn/xwxx/tzgg/', transport: 'http', allowHttp: true, reviewStatus: 'local-http-verified', verificationNote: '官方区政府入口 HTTP 列表页已核验；HTTPS/TLS 未通过，生产禁用' },
  { ...COMMON, enabled: false, id: 'dehui-education-notices', name: '德惠市政府通知公告（教师考试相关）', regionIds: ['dehui-cc'], category: '教师招聘', titlePattern: '招聘|特岗|特设岗位|教师资格|教资|报名|笔试|面试|资格审查|资格复审|体检|成绩|递补|拟聘|拟录用|中小学教师', url: 'http://dehui.changchun.gov.cn/ywdt/tzgg/', transport: 'http', allowHttp: true, reviewStatus: 'local-http-verified', verificationNote: '官方县市政府入口 HTTP 列表页已核验；HTTPS/TLS 未通过，生产禁用' },
  { ...COMMON, enabled: false, id: 'yushu-education-notices', name: '榆树市政府通知公告（教师考试相关）', regionIds: ['yushu-cc'], category: '教师招聘', titlePattern: '招聘|特岗|特设岗位|教师资格|教资|报名|笔试|面试|资格审查|资格复审|体检|成绩|递补|拟聘|拟录用|中小学教师', url: 'http://yushu.changchun.gov.cn/xxgk/qwfb/gsgg/', transport: 'http', allowHttp: true, reviewStatus: 'local-http-verified', verificationNote: '官方县市政府入口 HTTP 列表页已核验；HTTPS/TLS 未通过，生产禁用' },
  { ...COMMON, enabled: false, id: 'nong-an-education-notices', name: '农安县政府政务信息（教师考试相关）', regionIds: ['nong-an-cc'], category: '教师招聘', titlePattern: '招聘|特岗|特设岗位|教师资格|教资|报名|笔试|面试|资格审查|资格复审|体检|成绩|递补|拟聘|拟录用|中小学教师', url: 'http://www.nongan.gov.cn/dtxx/zwdt/', transport: 'http', allowHttp: true, reviewStatus: 'local-http-verified', verificationNote: '官方县政府入口 HTTP 列表页已核验；HTTPS/TLS 未通过，生产禁用' },
  ...CHANGCHUN_HTTPS_CANDIDATES
];

export const SOURCE_COVERAGE = [
  { regionId: 'jilin', status: 'active', note: '省教育厅、人社厅已接入' },
  { regionId: 'changchun', status: 'pending', note: '市教育局、人社局 HTTPS 页面待核验' },
  { regionId: 'jilin-city', status: 'pending', note: '官方入口已登记，但当前 HTTPS 运行时连接失败，待目标云服务器复测' },
  { regionId: 'siping', status: 'pending', note: '待核验教育局、人社局官方 HTTPS 来源' },
  { regionId: 'liaoyuan', status: 'pending', note: '官方入口已登记，但当前 HTTPS 运行时连接失败，待目标云服务器复测' },
  { regionId: 'tonghua', status: 'active', note: '市政府教育公开信息、人社局 HTTPS 来源已接入' },
  { regionId: 'baishan', status: 'pending', note: '官方入口已登记，但当前 HTTPS 运行时连接失败，待目标云服务器复测' },
  { regionId: 'songyuan', status: 'active', note: '市政府通知公告 HTTPS 来源已接入，标题过滤教师事项' },
  { regionId: 'baicheng', status: 'pending', note: '待核验教育局、人社局官方 HTTPS 来源' },
  { regionId: 'yanbian', status: 'pending', note: '待核验教育局、人社局官方 HTTPS 来源' },
  { regionId: 'chaoyang-cc', status: 'pending', note: '官方 HTTP 列表已核验，HTTPS/TLS 待核验' },
  { regionId: 'nanguan-cc', status: 'pending', note: '官方 HTTP 列表已核验，HTTPS/TLS 待核验' },
  { regionId: 'kuancheng-cc', status: 'pending', note: '官方 HTTP 列表已核验，HTTPS/TLS 待核验' },
  { regionId: 'erdao-cc', status: 'pending', note: '官方 HTTP 列表已核验，HTTPS/TLS 待核验' },
  { regionId: 'lvyuan-cc', status: 'pending', note: '官方 HTTP 列表已核验，HTTPS/TLS 待核验' },
  { regionId: 'shuangyang-cc', status: 'pending', note: '官方 HTTP 列表已核验，HTTPS/TLS 待核验' },
  { regionId: 'jiutai-cc', status: 'pending', note: '官方 HTTP 列表已核验，HTTPS/TLS 待核验' },
  { regionId: 'jingyue-cc', status: 'pending', note: '官方 HTTP 列表已核验，HTTPS/TLS 待核验' },
  { regionId: 'lianhuashan-cc', status: 'pending', note: '官方 HTTP 列表已核验，HTTPS/TLS 待核验' },
  { regionId: 'dehui-cc', status: 'pending', note: '官方 HTTP 列表已核验，HTTPS/TLS 待核验' },
  { regionId: 'yushu-cc', status: 'pending', note: '官方 HTTP 列表已核验，HTTPS/TLS 待核验' },
  { regionId: 'nong-an-cc', status: 'pending', note: '官方 HTTP 政务列表已核验，HTTPS/TLS 待核验' },
  { regionId: 'gongzhuling-cc', status: 'pending', note: '公主岭市独立核验，不属于长春市及各区县全选' }
];

export const SOURCE_REGISTRY_VERSION = '2026-09-26.4';
export function listSources() { return SOURCE_REGISTRY.map((source) => ({ ...source })); }
export function listSourceCoverage() {
  const registered = new Set(SOURCE_COVERAGE.map((item) => item.regionId));
  const pendingRegions = JILIN_REGIONS
    .filter((region) => !registered.has(region.id))
    .map((region) => ({ regionId: region.id, status: 'pending', note: '地区已注册，官方 HTTPS 来源待登记与核验' }));
  return [...SOURCE_COVERAGE, ...pendingRegions].map((item) => ({ ...item }));
}

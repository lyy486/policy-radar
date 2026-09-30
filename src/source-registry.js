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
  { ...COMMON, id: 'changchun-talent-notices', name: '长春新区人才就业网公告通知', regionIds: ['changchun'], category: '招聘公告', titlePattern: '教师|学校|招聘|招募|面试', parser: 'changchun-talent', includeGeneralRecruitment: true, alertBaselineOnFirstSync: true, detailPathPrefix: '/content/news/show/', url: 'https://rcjy.ccxq.gov.cn/content/news/list/3/1.html', transport: 'https', reviewStatus: 'verified-list-and-samples', verificationNote: '2026-10-01：长春市官网→新区管委会官网→人才就业网身份链及官方招聘原文指定渠道已核验；HTTPS标准证书200、robots404。仅收录本栏目首页主列表，排除侧栏推荐；按长春市筛选，日期取同卡片。银龄/编外不代表事业编制。' },
  { ...COMMON, id: 'changchun-talent-recruitment', name: '长春新区人才就业网招考招聘', regionIds: ['changchun'], category: '招聘公告', titlePattern: '教师|学校|招聘|招募|面试', parser: 'changchun-talent', includeGeneralRecruitment: true, alertBaselineOnFirstSync: true, detailPathPrefix: '/content/news/show/', url: 'https://rcjy.ccxq.gov.cn/content/news/list/4/1.html', transport: 'https', reviewStatus: 'verified-list-and-samples', verificationNote: '2026-10-01：新区官网导航与正式招募原文明确指定本站；HTTPS200、robots404。仅本栏目首页同源主列表，外部微信公众号链接不自动抓取。首轮建立历史基线不群发。银龄招募适用于退休教师，编外合同岗位不作为编制认定。' },
  { ...COMMON, id: 'jilin-hrss-recruitment', name: '吉林省人社厅事业单位公开招聘公告', regionIds: ['jilin'], category: '招聘公告', includeGeneralRecruitment: true, alertBaselineOnFirstSync: true, detailPathPrefix: '/rsrc/sydwrsgl/gkzp/', url: 'https://hrss.jl.gov.cn/rsrc/sydwrsgl/gkzp/', transport: 'https', reviewStatus: 'verified-list-and-sample-attachments', verificationNote: '2026-09-30：官网导航与12、13号详情、岗位表人工核验；robots404。综合公告仅为待核对教师岗位线索，不承诺编制或统一考试时间。' },
  { ...COMMON, id: 'jilin-exam-teacher', name: '吉林省教育考试院中小学教师资格考试', regionIds: ['jilin'], category: '招聘公告', policyType: '教师资格考试', parser: 'jilin-exam', alertBaselineOnFirstSync: true, url: 'https://www.jleea.com.cn/server-front/front/content/page?isStatic=false&pageSize=15&channelIdStr=10649&isPageQuery=true&pageNum=1', transport: 'https', reviewStatus: 'verified-public-api', verificationNote: '2026-09-30：ntce.neea.edu.cn 省级考试机构官方外链确认域名；教资栏目10649公开API与前三条原文人工比对，robots返回404；按小时检查首页15条，不代表全部历史公告或长春教师编制招聘' },
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
  { ...COMMON, enabled: false, id: 'gongzhuling-government-candidate', name: '公主岭市政府政务信息候选入口（教师相关）', regionIds: ['gongzhuling-cc'], category: '教师招聘', titlePattern: '招聘|特岗|教师资格|教资|教师|中小学|幼儿园|报名|笔试|面试|资格审查|资格复审|体检|成绩|递补|拟聘|拟录用', url: 'https://www.gongzhuling.gov.cn/zw/dzxx/bmdt/', transport: 'https', allowHttp: true, reviewStatus: 'https-pending', verificationNote: '公主岭市政府官方政务信息入口 HTTP 可访问但 HTTPS/TLS 尚未核验；仅允许本机显式试验；省政府目录确认公主岭属于长春分组，已纳入长春全选，来源仍待云端核验' },
  { ...COMMON, enabled: false, id: 'jiangyuan-government-announcements-candidate', name: '江源区人民政府公告栏候选入口（教师考试相关）', regionIds: ['jiangyuan-bs'], category: '教师招聘', titlePattern: '招聘|特岗|特设岗位|教师资格|教资|教师|中小学|幼儿园|学校|教育系统|报名|笔试|面试|资格审查|资格复审|体检|成绩|递补|拟聘|拟录用', excludeTitlePattern: '专业技术资格|职称|评审|劳务派遣|农民工', url: 'https://jy.cbs.gov.cn/zwgk/ggl/', transport: 'https', reviewStatus: 'official-list-runtime-pending', verificationNote: '官方站点和公告列表已人工核验；当前 Node 运行时连接仍被对端中断，保持禁用，待目标云服务器复测' },
  { ...COMMON, enabled: false, id: 'jingyu-government-announcements-candidate', name: '靖宇县人民政府公示公告候选入口（教师考试相关）', regionIds: ['jingyu-bs'], category: '教师招聘', titlePattern: '招聘|特岗|特设岗位|教师资格|教资|教师|中小学|幼儿园|学校|教育系统|报名|笔试|面试|资格审查|资格复审|体检|成绩|递补|拟聘|拟录用', excludeTitlePattern: '专业技术资格|职称|评审|劳务派遣|农民工', url: 'https://jyx.cbs.gov.cn/wzsy/gsgg/', transport: 'https', reviewStatus: 'official-list-runtime-pending', verificationNote: '候选审计曾返回 HTTP 200，但 robots.txt 和完整页面抓取不稳定，尚未完成列表解析与人工抽样，保持禁用，待目标云服务器复测' },
  { ...COMMON, enabled: false, id: 'changchun-education-notices', name: '长春市教育局通知公告', regionIds: ['changchun'], category: '教师招聘', titlePattern: '招聘|特岗|特设岗位|教师资格|教资|报名|笔试|面试|资格审查|资格复审|体检|成绩|递补|拟聘|拟录用|中小学教师', url: 'http://jyj.changchun.gov.cn/xxgk/tzgg/', transport: 'http', allowHttp: true, reviewStatus: 'https-pending', verificationNote: '官方页面可访问但当前 HTTPS TLS 不兼容；仅允许本机显式试验，不得用于生产' },
  { ...COMMON, id: 'changchun-hrss-notices', name: '长春市人力资源和社会保障局通知公告', regionIds: ['changchun'], category: '教师招聘', titlePattern: CHANGCHUN_TITLE_PATTERN, includeGeneralRecruitment: true, alertBaselineOnFirstSync: true, detailPathPrefix: '/ywdt/tzgg/', url: 'http://ccrs.changchun.gov.cn/ywdt/tzgg/', transport: 'http', allowHttp: true, userApprovedPublicHttp: true, reviewStatus: 'user-approved-public-http', verificationNote: '2026-09-30：用户明确同意个人使用此官方HTTP栏目。官方身份、公开列表及原文已核验，robots200未见Disallow；只读、无凭据、无自动重定向、限频。传输未加密，请核对官网原文；其他HTTP来源不因此获准。' },
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
  { regionId: 'jilin', status: 'active', note: '省教育厅、人社厅及省考试院教资公开接口已接入（不代表完整覆盖）' },
  { regionId: 'changchun', status: 'active', transport: 'http', note: '已接入市人社局获准HTTP栏目与长春新区人才就业网两个HTTPS栏目；市人社传输未加密，教育局及其余区县未完整覆盖，银龄/编外不等于编制' },
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
  { regionId: 'gongzhuling-cc', status: 'pending', note: '公主岭已纳入长春全选；官方来源仍待核验' }
];

export const SOURCE_REGISTRY_VERSION = '2026-10-01.1';
export function isApprovedFreeSource(source) {
  if (!source.enabled) return false;
  let url;
  try { url = new URL(source.url); } catch { return false; }
  if (url.username || url.password) return false;
  if (url.protocol === 'https:') return true;
  return source.id === 'changchun-hrss-notices' && source.userApprovedPublicHttp === true && source.allowHttp === true
    && url.href === 'http://ccrs.changchun.gov.cn/ywdt/tzgg/';
}
export function listSources() { return SOURCE_REGISTRY.map((source) => ({ ...source })); }
export function listSourceCoverage() {
  const registered = new Set(SOURCE_COVERAGE.map((item) => item.regionId));
  const pendingRegions = JILIN_REGIONS
    .filter((region) => !registered.has(region.id))
    .map((region) => ({ regionId: region.id, status: 'pending', note: '地区已注册，官方 HTTPS 来源待登记与核验' }));
  return [...SOURCE_COVERAGE, ...pendingRegions].map((item) => ({ ...item }));
}

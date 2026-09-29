import nodemailer from 'nodemailer';

const required = ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'ALERT_EMAIL_TO'];
if (required.some((name) => !process.env[name])) throw new Error('邮箱测试配置不完整');
const port = Number(process.env.SMTP_PORT || 465);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('SMTP_PORT 配置无效');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port,
  secure: port === 465,
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  tls: { rejectUnauthorized: true },
  connectionTimeout: 20_000,
  greetingTimeout: 20_000,
  socketTimeout: 30_000
});

await transporter.sendMail({
  from: process.env.SMTP_FROM ?? process.env.SMTP_USER,
  to: process.env.ALERT_EMAIL_TO,
  subject: '政策雷达测试邮件',
  text: '邮箱提醒配置成功。以后发现新的官方教师考试公告时，会向这个邮箱发送提醒。请始终以官方原文为准。',
  html: '<p><strong>邮箱提醒配置成功。</strong></p><p>以后发现新的官方教师考试公告时，会向这个邮箱发送提醒。</p><p>请始终以官方原文为准。</p>'
});
console.log('测试邮件已发送，请检查收件箱和垃圾邮件目录。');

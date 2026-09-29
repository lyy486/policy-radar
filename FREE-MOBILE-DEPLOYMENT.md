# 免费手机网页版部署说明

这套方案不需要云服务器、域名、备案或微信小程序。使用 GitHub Pages 免费托管网页，GitHub Actions 每小时检查一次已核验的官方来源，发现新公告后可通过你自己的邮箱免费发送提醒。

## 你需要准备

1. 一个 GitHub 账号。
2. 一个用于发信的 QQ 邮箱、163 邮箱或其他支持 SMTP 的邮箱。
3. 一个接收提醒的邮箱，可以与发信邮箱相同。

不要把邮箱密码、授权码或任何密钥发给别人，也不要写进代码文件。只把授权码填入 GitHub 的加密 Secrets。

## 第一步：创建免费仓库

1. 登录 GitHub，创建一个新的 Public（公开）仓库，例如 `policy-radar`。GitHub 免费账号的公开仓库可免费使用 Pages。
2. 将本项目所有文件上传到仓库的 `main` 分支。
3. 打开仓库 Settings → Pages，将 Source 设为 GitHub Actions。
4. 打开 Settings → Actions → General → Workflow permissions，选择 Read and write permissions 并保存。

仓库公开只代表程序代码和官方公告数据公开；下面配置的邮箱授权码不会公开。

## 第二步：配置免费邮件提醒

在仓库中打开 Settings → Secrets and variables → Actions → New repository secret，逐个添加：

| 名称 | QQ 邮箱示例 | 说明 |
|---|---|---|
| `SMTP_HOST` | `smtp.qq.com` | 发信服务器 |
| `SMTP_PORT` | `465` | 加密端口 |
| `SMTP_USER` | 你的完整 QQ 邮箱 | 发信账号 |
| `SMTP_PASS` | 邮箱生成的 SMTP 授权码 | 不是网页登录密码 |
| `SMTP_FROM` | 与 `SMTP_USER` 相同 | 发件人 |
| `ALERT_EMAIL_TO` | 接收提醒的邮箱 | 可与发件人相同 |

QQ 邮箱需要在邮箱设置中开启 SMTP 服务并生成授权码。163 邮箱可使用 `smtp.163.com` 和端口 `465`，其他字段相同。

## 第三步：首次运行

1. 打开仓库的 Actions 页面。
2. 选择“免费政策雷达更新与发布”。
3. 点击 Run workflow。
4. 首次运行只建立公告基线，不发送旧公告；以后发现新公告才发送邮件。
5. 运行完成后，在 Settings → Pages 可看到网址，通常格式为 `https://你的用户名.github.io/policy-radar/`。

## 手机使用

- 安卓 Chrome：打开网址 → 浏览器菜单 → “添加到主屏幕”。
- iPhone Safari：打开网址 → 分享按钮 → “添加到主屏幕”。
- 网页打开时，可点击“开启页面内通知”；网页关闭后主要依靠邮件提醒。

## 暂时没有 GitHub 账号：同一 Wi-Fi 查看

可以先双击 `start-free-lan.cmd`。窗口会显示一个 `http://192.168...:4173/` 形式的地址，手机连接与电脑相同的 Wi-Fi 后即可打开。

- 这种方式不花钱，也不需要账号。
- 电脑必须保持开机，启动窗口不能关闭。
- 只允许 Windows 防火墙的“专用网络”，不要允许公用网络。
- 局域网 HTTP 页面只能用于临时查看，可靠邮件提醒和手机桌面安装仍建议使用 GitHub Pages 的 HTTPS 网址。

## 不用 GitHub：电脑开机时自动发邮件

如果暂时不注册 GitHub，也可以让这台电脑每小时检查一次，并把新公告发到手机邮箱：

1. 双击 `configure-local-email.cmd`。
2. 选择 QQ 邮箱或 163 邮箱，输入发信邮箱、接收邮箱和 SMTP 授权码。
3. 授权码使用 Windows DPAPI 加密，只能由当前 Windows 用户在这台电脑上解密；不会写进代码或压缩包。
4. 配置完成后会自动发送一封测试邮件。
5. 收到测试邮件后，双击 `install-local-schedule.cmd`，安装每小时检查任务。
6. 如需停止自动检查，双击 `uninstall-local-schedule.cmd`。

这种模式完全免费，但电脑关机或断网时无法检查。长期使用仍推荐 GitHub Pages，因为电脑关机后也能继续运行。

## 更新频率和限制

- 工作流每小时第 17 分钟尝试检查一次；免费平台可能延迟，不能承诺严格实时。
- 只读取已核验、公开、允许正常访问的 HTTPS 官方来源；不绕过验证码、登录、robots 或反爬限制。
- 长春部分区县官网目前没有稳定 HTTPS 入口，因此不能虚假宣称已经完整实时覆盖。来源核验通过后可继续接入。
- 邮件和网页都只作为提醒，报名、考试和录用信息必须以官方原文为准。

## 本机预览

安装 Node.js 20 或更高版本后，可以双击 `start-free-site.cmd`，或运行：

```text
npm ci
npm run free:preview
```

浏览器打开 `http://127.0.0.1:4173/`。如要在本机重新读取官方来源，运行 `npm run free:update`；未配置邮箱环境变量时不会发送邮件。

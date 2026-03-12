# Cloudflare Workers 69yun69 签到

基于 Cloudflare Workers 实现的 **69yun69.com** 机场自动签到脚本，支持定时签到和手动触发，并集成企业微信通知。

## 功能特性

- 专为 **69yun69.com** 机场定制

- ✅ **自动签到**：通过 Cron Trigger 定时执行每日签到
- ✅ **手动触发**：通过 URL 路径手动执行签到
- ✅ **企业微信通知**：签到结果推送到企业微信群
- ✅ **调试模式**：详细日志输出，便于排查问题
- ✅ **Cookie 智能解析**：正确处理 Expires 时间戳中的逗号
- ✅ **反爬虫兼容**：模拟浏览器请求头，避免 IP 被拦截

## 部署步骤

### 1. 准备 Cloudflare Workers

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. 进入 **Workers & Pages**
3. 创建新的 Worker，命名为 `airport-checkin`

### 2. 配置环境变量

在 Workers 的 **Settings** → **Variables** → **Environment Variables** 中添加以下变量：

| 变量名 | 说明 | 示例 |
|--------|------|------|
| `JC` 或 `DOMAIN` | 机场域名 | `69yun69.com` |
| `ZH` 或 `USER` | 登录邮箱 | `user@example.com` |
| `MM` 或 `PASS` | 登录密码 | `your_password` |
| `QYWXKEY` | 企业微信 Webhook Key（可选） | `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx` |

### 3. 上传代码

将 `workers.js` 的完整内容复制到 Worker 编辑器中并保存。

### 4. 配置 Cron Trigger

在 Workers 的 **Triggers** → **Cron Triggers** 中添加定时任务：

```
0 0 * * *
```

**⚠️ 重要：Cloudflare Workers 使用 UTC 时间**

Cron Trigger 的执行时间基于 UTC 时区，而北京时间是 UTC+8。

| 北京时间 | UTC 时间 | Cron 表达式 |
|----------|----------|-------------|
| 每天凌晨 00:00 | 前一天 16:00 | `0 16 * * *` |
| 每天早上 08:00 | 当天 00:00 | `0 0 * * *` |
| 每天中午 12:00 | 当天 04:00 | `0 4 * * *` |
| 每天晚上 20:00 | 当天 12:00 | `0 12 * * *` |

**换算公式**：北京时间 = UTC 时间 + 8 小时

例如，如果你希望每天北京时间早上 8:00 执行签到，应该设置 Cron 为 `0 0 * * *`（UTC 00:00）。

## API 路径说明

部署完成后，可通过以下路径访问不同功能：

| 路径 | 功能 | 说明 |
|------|------|------|
| `/` | 帮助信息 | 显示所有可用路径和使用说明 |
| `/{password}` | 手动签到 | 将 `{password}` 替换为你的实际密码，手动触发签到 |
| `/qywx` | 测试企微推送 | 发送测试消息到企业微信，验证配置是否正确 |
| `/status` | 查看签到结果 | 显示最后一次签到执行的结果 |
| `/debug` | 调试模式签到 | 执行签到并返回详细日志，便于问题排查 |

### 示例

假设你的 Worker 域名是 `https://checkin.example.workers.dev`，密码是 `mypassword`：

- 访问帮助：`https://checkin.example.workers.dev/`
- 手动签到：`https://checkin.example.workers.dev/mypassword`
- 测试企微：`https://checkin.example.workers.dev/qywx`
- 查看结果：`https://checkin.example.workers.dev/status`
- 调试签到：`https://checkin.example.workers.dev/debug`

## 本地调试

如需在本地测试签到逻辑，可以使用 `test-local.js` 脚本。

### 1. 创建 `.env` 文件

在项目根目录创建 `.env` 文件（已加入 `.gitignore`）：

```env
JC=69yun69.com
ZH=user@example.com
MM=your_password
QYWXKEY=your_webhook_key
```

### 2. 运行测试脚本

```bash
node test-local.js
```

该脚本会输出详细的登录和签到过程日志。

## 常见问题

### 1. 签到失败：返回 HTML 页面

**错误信息**：`签到接口返回登录页面，Cookie 可能已失效`

**可能原因**：
- Cloudflare Worker 的 IP 被机场屏蔽
- 账号被封禁或异常

**解决方案**：
- 尝试使用其他 Cloudflare 账号部署
- 联系机场客服确认账号状态

### 2. 企业微信通知未收到

**检查步骤**：
1. 确认 `QYWXKEY` 已正确配置
2. 访问 `/qywx` 路径测试 Webhook
3. 检查企业微信机器人是否被限制推送频率

### 3. 定时任务未执行或执行时间不对

**检查步骤**：
1. 确认 Cron Trigger 已正确配置
2. 查看 Workers 日志确认任务是否启动
3. 检查环境变量是否全部设置

**时间偏差问题**：
- Cloudflare Workers Cron Trigger 使用 **UTC 时间**
- 北京时间是 UTC+8，需进行时区换算
- 示例：如需北京时间 08:00 签到，应设置 `0 0 * * *`（UTC 00:00）

## 安全建议

- ✅ 环境变量存储敏感信息，不要硬编码在代码中
- ✅ 定期更换登录密码
- ✅ 将 `.env` 文件加入 `.gitignore`，避免提交到 Git

## 许可证

MIT License

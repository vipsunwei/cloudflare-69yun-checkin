// 从 .env 文件加载配置
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function loadEnvFile() {
  const envPath = path.join(__dirname, '.env');

  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf-8');
    envContent.split('\n').forEach(line => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const [key, ...valueParts] = trimmed.split('=');
        const value = valueParts.join('=').trim();
        if (key && value) {
          process.env[key] = value;
        }
      }
    });
    console.log('✅ 已加载 .env 文件\n');
  } else {
    console.log('⚠️ 未找到 .env 文件，请手动设置环境变量\n');
  }
}

// 加载环境变量
loadEnvFile();

const domain = "这里填机场域名";
const user = "这里填邮箱";
const pass = "这里填密码";
let qiandaoRes;

let QYWXKEY = ""; // 企业微信 Webhook 关键值
let DEBUG_MODE = true; // 调试模式开关

// 简单的日志输出函数
function log(message, data = null) {
  if (DEBUG_MODE) {
    console.log(`[DEBUG] ${message}`);
    if (data !== null) {
      console.log(JSON.stringify(data, null, 2));
    }
  }
}

// 本地测试主函数
async function localTest() {
  log("========== 开始本地测试 ==========");

  // 从环境变量读取或使用硬编码的值
  const configDomain = process.env.JC || process.env.DOMAIN || domain;
  const configUser = process.env.ZH || process.env.USER || user;
  const configPass = process.env.MM || process.env.PASS || pass;
  const configQYWXKEY = process.env.QYWXKEY || QYWXKEY;

  let finalDomain = configDomain;
  if (!finalDomain.includes("//")) finalDomain = `https://${finalDomain}`;

  log("配置信息:", {
    domain: finalDomain,
    user: configUser.substring(0, 1) + "****" + configUser.substring(configUser.length - 5),
    pass: configPass.substring(0, 1) + "****" + configPass.substring(configPass.length - 1),
    QYWXKEY: configQYWXKEY ? "已配置" : "未配置",
  });

  const result = await checkin(finalDomain, configUser, configPass, configQYWXKEY);
  log("========== 测试结束 ==========");
  console.log("\n========== 最终结果 ==========");
  console.log(result);
  console.log("================================");
}

// 发送企业微信群通知
async function sendWechatNotification(msg) {
  if (!QYWXKEY) {
    log("⚠️ 企业微信 Webhook 未配置，跳过推送");
    return;
  }

  const webhookUrl = `https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=${QYWXKEY}`;
  const payload = {
    msgtype: "text",
    text: {
      content: msg,
    },
  };

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    log("✅ 企业微信通知推送成功");
  } catch (error) {
    log("❌ 企业微信通知推送失败:", error);
  }
}

// 机场签到逻辑
async function checkin(domain, user, pass, qywxKey) {
  QYWXKEY = qywxKey;
  try {
    if (!domain || !user || !pass) {
      throw new Error("必需的配置参数缺失");
    }

    qiandaoRes =
      `🚀 机场签到通知 🚀\n\n` +
      `🔹 网址: ${domain}\n` +
      `🔹 账号: ${user.substring(0, 1)}****${user.substring(user.length - 5)}\n` +
      `🔹 密码: ${pass.substring(0, 1)}****${pass.substring(pass.length - 1)}\n` +
      `📢 企业微信推送: ${QYWXKEY ? "✅ 已启用" : "❌ 未启用"}`;

    log("发送登录请求...", {
      url: `${domain}/auth/login`,
      email: user,
    });

    const loginResponse = await fetch(`${domain}/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
        "Origin": domain,
        "Referer": `${domain}/auth/login`,
      },
      body: JSON.stringify({
        email: user,
        passwd: pass,
        remember_me: "on",
        code: "",
      }),
    });

    log("登录响应状态:", {
      status: loginResponse.status,
      statusText: loginResponse.statusText,
      ok: loginResponse.ok,
    });

    if (!loginResponse.ok) {
      const errorText = await loginResponse.text();
      log("登录失败响应:", errorText);
      throw new Error(`登录失败: ${errorText}`);
    }

    const loginJson = await loginResponse.json();
    log("登录响应JSON:", loginJson);

    if (loginJson.ret !== 1) {
      throw new Error(`登录失败: ${loginJson.msg || "未知错误"}`);
    }

    const cookieHeader = loginResponse.headers.get("set-cookie");
    log("获取到的 Set-Cookie 头:", cookieHeader);

    if (!cookieHeader) {
      throw new Error("登录成功但未收到 Cookie");
    }

    // 正确解析 Set-Cookie 头
    // Set-Cookie 格式: name1=value1; Expires=...; Path=/, name2=value2; Expires=...; Path=/, ...
    // 每个 cookie 后的属性之间用 ; 分隔，多个 cookie 之间用 , 分隔
    // 但是在 Expires=xxx, xxx GMT 里的逗号不应该被当作分隔符
    const cookieArray = [];

    // 先按 , 分割，但要跳过 Expires 里面的逗号
    let currentCookie = "";
    let inExpires = false;

    for (let i = 0; i < cookieHeader.length; i++) {
      const char = cookieHeader[i];
      const nextChar = cookieHeader[i + 1];

      // 检测是否在 Expires 字段里
      if (cookieHeader.substring(i).startsWith("Expires=")) {
        inExpires = true;
      }

      if (inExpires && char === ',' && nextChar === ' ') {
        // Expires 里的逗号，跳过
        currentCookie += char;
        continue;
      }

      if (!inExpires && char === ',' && nextChar === ' ') {
        // 多个 cookie 之间的分隔符
        cookieArray.push(currentCookie.trim());
        currentCookie = "";
        i++; // 跳过空格
        continue;
      }

      if (inExpires && char === ';' && nextChar === ' ') {
        // Expires 结束
        inExpires = false;
      }

      currentCookie += char;
    }

    if (currentCookie.trim()) {
      cookieArray.push(currentCookie.trim());
    }

    // 提取每个 cookie 的 name=value 部分
    const cookies = cookieArray
      .map(cookie => {
        const firstSemiColon = cookie.indexOf(";");
        if (firstSemiColon === -1) {
          return cookie.trim();
        }
        return cookie.substring(0, firstSemiColon).trim();
      })
      .filter(cookie => cookie.includes("="))
      .join("; ");

    log("提取的 Cookie:", cookies);

    await new Promise((resolve) => setTimeout(resolve, 1000));

    log("发送签到请求...", {
      url: `${domain}/user/checkin`,
      cookiePreview: cookies.substring(0, 100) + (cookies.length > 100 ? "..." : ""),
    });

    const checkinResponse = await fetch(`${domain}/user/checkin`, {
      method: "POST",
      headers: {
        Cookie: cookies,
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
        "Origin": domain,
        "Referer": `${domain}/user`,
      },
    });

    log("签到响应状态:", {
      status: checkinResponse.status,
      statusText: checkinResponse.statusText,
      ok: checkinResponse.ok,
      responseHeaders: Object.fromEntries(checkinResponse.headers.entries()),
    });

    const responseText = await checkinResponse.text();
    log("签到响应原始内容:", responseText);

    // 检查是否返回了 HTML（未认证）
    if (responseText.trim().startsWith("<!DOCTYPE") || responseText.trim().startsWith("<html")) {
      log("签到接口返回 HTML，可能需要重新登录", {
        status: checkinResponse.status,
        contentType: checkinResponse.headers.get("content-type"),
        responsePreview: responseText.substring(0, 200)
      });
      throw new Error(
        `签到接口返回登录页面，Cookie 可能已失效或 IP 被拦截。\n` +
        `Content-Type: ${checkinResponse.headers.get("content-type")}\n` +
        `建议检查：\n1. 账号是否被封禁\n2. Cloudflare IP 是否被机场屏蔽`
      );
    }

    try {
      const checkinResult = JSON.parse(responseText);
      log("签到响应解析后:", checkinResult);
      if (checkinResult.ret === 1) {
        qiandaoRes = `✅ 签到成功 ✅\n🎉 ${checkinResult.msg}`;
        log("签到成功!");
      } else {
        qiandaoRes = `⚠️ 签到失败 ⚠️\n${checkinResult.msg || "未知原因"}`;
        log("签到失败!");
      }
    } catch (e) {
      log("解析签到响应失败", { error: e.message });
      throw new Error(
        `解析签到响应失败: ${e.message}\n\n原始响应: ${responseText}`,
      );
    }

    await sendWechatNotification(qiandaoRes);
    return qiandaoRes;
  } catch (error) {
    log("签到流程出错:", { error: error.message, stack: error.stack });
    qiandaoRes = `❌ 签到错误 ❌\n${error.message}`;

    await sendWechatNotification(qiandaoRes);
    return qiandaoRes;
  }
}

// 如果直接运行此文件，执行本地测试
localTest().catch(console.error);

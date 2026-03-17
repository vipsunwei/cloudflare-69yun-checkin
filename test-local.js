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

// Cookie 解析函数
function extractCookies(response) {
  const cookieHeader = response.headers.get("set-cookie");
  if (!cookieHeader) return [];

  const cookieArray = [];
  let currentCookie = "";
  let inExpires = false;

  for (let i = 0; i < cookieHeader.length; i++) {
    const char = cookieHeader[i];
    const nextChar = cookieHeader[i + 1];

    if (cookieHeader.substring(i).startsWith("Expires=")) {
      inExpires = true;
    }

    if (inExpires && char === "," && nextChar === " ") {
      currentCookie += char;
      continue;
    }

    if (!inExpires && char === "," && nextChar === " ") {
      cookieArray.push(currentCookie.trim());
      currentCookie = "";
      i++;
      continue;
    }

    if (inExpires && char === ";" && nextChar === " ") {
      inExpires = false;
    }

    currentCookie += char;
  }

  if (currentCookie.trim()) {
    cookieArray.push(currentCookie.trim());
  }

  const pairs = cookieArray
    .map((cookie) => {
      const firstSemiColon = cookie.indexOf(";");
      if (firstSemiColon === -1) {
        return cookie.trim();
      }
      return cookie.substring(0, firstSemiColon).trim();
    })
    .filter((cookie) => cookie.includes("="));

  return pairs;
}

// Cookie 映射函数
function cookieMap(pairs) {
  const map = new Map();
  for (const pair of pairs) {
    const eqIdx = pair.indexOf("=");
    if (eqIdx > 0) map.set(pair.substring(0, eqIdx).trim(), pair);
  }
  return map;
}

// 合并 Cookie 函数
function mergeCookies(existing, newPairs) {
  const map = cookieMap(existing);
  for (const pair of newPairs) {
    const eqIdx = pair.indexOf("=");
    if (eqIdx > 0) map.set(pair.substring(0, eqIdx).trim(), pair);
  }
  return Array.from(map.values());
}

// Cookie 转字符串函数
function cookieString(pairs) {
  return pairs.join("; ");
}

// Cookie 名称列表函数
function cookieNameList(pairs) {
  return pairs.map((p) => p.split("=")[0]).join(", ");
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
      `📢 企业微信推送: ${QYWXKEY ? "✅ 已启用" : "❌ 未启用"}\n` +
      `⏳ 正在签到中...`;

    // Step 1: 访问登录页获取初始会话 Cookie
    log("访问站点获取初始会话...");
    const initResponse = await fetch(`${domain}/auth/login`, {
      method: "GET",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });

    let allCookies = extractCookies(initResponse);
    if (allCookies.length > 0) {
      log(`初始 Cookie: ${cookieNameList(allCookies)}`);
    } else {
      log("初始访问未获取到 Cookie");
    }

    // Step 2: 登录（携带初始 Cookie 以绑定会话）
    log(`请求登录接口: ${domain}/auth/login`);
    const loginResponse = await fetch(`${domain}/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        Accept: "application/json, text/plain, */*",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
        Origin: domain,
        Referer: `${domain}/auth/login`,
        Cookie: cookieString(allCookies),
      },
      body: JSON.stringify({
        email: user,
        passwd: pass,
        remember_me: "on",
        code: "",
      }),
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

    // 合并登录后的 Cookie
    const loginCookies = extractCookies(loginResponse);
    allCookies = mergeCookies(allCookies, loginCookies);
    if (allCookies.length === 0) {
      throw new Error("未能获取到有效的 Cookie");
    }
    log(`登录后 Cookie (${allCookies.length}): ${cookieNameList(allCookies)}`);

    // Step 3: 等待会话就绪
    log("验证会话状态...");
    const maxSessionChecks = 6;
    let sessionReady = false;

    for (let sc = 1; sc <= maxSessionChecks; sc++) {
      await new Promise((resolve) =>
        setTimeout(resolve, sc === 1 ? 1500 : 2000),
      );

      const verifyResponse = await fetch(`${domain}/user`, {
        method: "GET",
        headers: {
          Cookie: cookieString(allCookies),
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          Referer: `${domain}/auth/login`,
        },
        redirect: "manual",
      });

      const verifyStatus = verifyResponse.status;
      // 合并验证响应的 Cookie
      const verifyCookies = extractCookies(verifyResponse);
      if (verifyCookies.length > 0) {
        allCookies = mergeCookies(allCookies, verifyCookies);
      }

      if (verifyStatus === 200 || verifyStatus === 304) {
        log(`✓ 会话验证通过 (第 ${sc} 次检查)`);
        sessionReady = true;
        break;
      } else if (verifyStatus >= 300 && verifyStatus < 400) {
        if (sc < maxSessionChecks) {
          log(
            `会话尚未就绪 (HTTP ${verifyStatus})，等待重试... (${sc}/${maxSessionChecks})`,
          );
        } else {
          log(
            `会话始终未就绪 (HTTP ${verifyStatus})，已尝试 ${maxSessionChecks} 次`,
          );
        }
      } else {
        log(`会话验证异常 (HTTP ${verifyStatus})，跳过等待`);
        sessionReady = true;
        break;
      }
    }

    if (!sessionReady) {
      throw new Error(
        "会话验证失败: 登录成功但 Session 始终未就绪",
      );
    }

    // Step 4: 签到
    await new Promise((resolve) => setTimeout(resolve, 1000));
    log("正在发送签到请求...");
    log(`签到使用 Cookie: ${cookieNameList(allCookies)}`);

    const checkinResponse = await fetch(`${domain}/user/checkin`, {
      method: "POST",
      headers: {
        Cookie: cookieString(allCookies),
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        Accept: "application/json, text/plain, */*",
        "Content-Type": "application/json",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
        Origin: domain,
        Referer: `${domain}/user`,
        "X-Requested-With": "XMLHttpRequest",
      },
      redirect: "manual",
    });

    const checkinSetCookies = extractCookies(checkinResponse);
    log(`签到响应状态码: ${checkinResponse.status}`);
    if (checkinSetCookies.length > 0) {
      log(`签到响应 Set-Cookie: ${cookieNameList(checkinSetCookies)}`);
    }

    // 检测重定向（通常意味着 session 失效）
    if (
      checkinResponse.status >= 300 &&
      checkinResponse.status < 400
    ) {
      const location =
        checkinResponse.headers.get("location") || "未知";
      // 诊断信息：打印所有发送的 cookie 值（名称+值前4字符）
      const cookieDiag = allCookies
        .map((p) => {
          const eq = p.indexOf("=");
          const name = p.substring(0, eq);
          const val = p.substring(eq + 1);
          return `${name}=${val.substring(0, 4)}...`;
        })
        .join(", ");
      log(`诊断 Cookie: ${cookieDiag}`);
      throw new Error(
        `签到请求被重定向 (HTTP ${checkinResponse.status}) -> ${location}，Cookie/Session 失效`,
      );
    }

    if (!checkinResponse.ok) {
      throw new Error(
        `签到请求失败 (HTTP ${checkinResponse.status})`,
      );
    }

    const responseText = await checkinResponse.text();
    const contentType =
      checkinResponse.headers.get("content-type") || "";
    log(`签到响应 Content-Type: ${contentType}`);

    // 检查是否返回了 HTML（未认证）
    if (
      responseText.trim().startsWith("<!DOCTYPE") ||
      responseText.trim().startsWith("<html")
    ) {
      throw new Error(
        `签到接口返回登录页面，Cookie 可能已失效或 IP 被拦截。\n` +
          `Content-Type: ${contentType}\n` +
          `建议检查：\n1. 账号是否被封禁\n2. Cloudflare IP 是否被机场屏蔽`,
      );
    }

    let checkinResult;
    try {
      checkinResult = JSON.parse(responseText);
      log("签到响应:", checkinResult);
    } catch (e) {
      throw new Error(
        `解析签到响应失败 (HTTP ${checkinResponse.status}): ${responseText.substring(0, 200)}...`,
      );
    }

    if (checkinResult.ret === 1) {
      qiandaoRes = `✅ 签到成功 ✅\n🎉 ${checkinResult.msg}`;
    } else {
      qiandaoRes = `⚠️ 签到失败 ⚠️\n${checkinResult.msg || "未知原因"}`;
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

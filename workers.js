let domain = "这里填机场域名";
let user = "这里填邮箱";
let pass = "这里填密码";
let qiandaoRes;

let QYWXKEY = ""; // 企业微信 Webhook 关键值
let DEBUG_MODE = false; // 调试模式开关，生产环境设为 false

// 简单的日志输出函数
function log(message, data = null) {
  if (DEBUG_MODE) {
    console.log(`[DEBUG] ${message}`);
    if (data !== null) {
      console.log(data);
    }
  }
}

export default {
  async fetch(request, env, ctx) {
    await initializeVariables(env, false); // 不预设 qiandaoRes
    const url = new URL(request.url);
    const pathname = url.pathname;

    // 根路径 - 显示帮助信息
    if (pathname === "/") {
      const maskedUser = `${user.substring(0, 1)}****${user.substring(user.length - 5)}`;
      const maskedPass = `${pass.substring(0, 1)}****${pass.substring(pass.length - 1)}`;
      const qywxStatus = QYWXKEY ? "✅ 已启用" : "❌ 未启用";
      const helpText = `
🚀 机场签到 Workers

当前配置：
🔹 账号: ${maskedUser}
🔹 密码: ${maskedPass}
📢 企业微信推送: ${qywxStatus}

可用路径：
• /{完整密码}  - 手动执行签到
• /qywx    - 测试企业微信 Webhook 配置（发送测试消息）
• /status  - 查看最后一次签到结果
• /debug   - 开启调试模式并执行签到（会在响应中返回详细日志）

提示：将 {完整密码} 替换为你的实际密码
      `.trim();
      return new Response(helpText, {
        status: 200,
        headers: { "Content-Type": "text/plain;charset=UTF-8" },
      });
    }

    // 手动签到
    if (pathname === `/${pass}`) {
      qiandaoRes = "⏳ 正在执行签到，请稍候...";
      try {
        await checkin();
        return new Response(qiandaoRes, {
          status: 200,
          headers: { "Content-Type": "text/plain;charset=UTF-8" },
        });
      } catch (error) {
        return new Response(`❌ 签到失败: ${error.message}`, {
          status: 500,
          headers: { "Content-Type": "text/plain;charset=UTF-8" },
        });
      }
    }

    // 调试模式签到
    if (pathname === "/debug") {
      DEBUG_MODE = true;
      qiandaoRes = "⏳ 正在调试模式执行签到，请稍候...";
      const logs = [];
      const originalLog = log;

      // 捕获日志
      log = function (message, data = null) {
        logs.push(`[DEBUG] ${message}`);
        if (data !== null) {
          logs.push(JSON.stringify(data, null, 2));
        }
        originalLog(message, data);
      };

      try {
        await checkin();
        return new Response(
          `📋 调试日志:\n\n${logs.join("\n")}\n\n📌 最终结果:\n${qiandaoRes}`,
          {
            status: 200,
            headers: { "Content-Type": "text/plain;charset=UTF-8" },
          },
        );
      } catch (error) {
        return new Response(
          `📋 调试日志:\n\n${logs.join("\n")}\n\n❌ 错误: ${error.message}\n${error.stack}`,
          {
            status: 500,
            headers: { "Content-Type": "text/plain;charset=UTF-8" },
          },
        );
      } finally {
        DEBUG_MODE = false;
      }
    }

    // 测试企业微信 Webhook 配置
    if (pathname === "/qywx") {
      if (!QYWXKEY) {
        return new Response("⚠️ 企业微信 Webhook 未配置", {
          status: 400,
          headers: { "Content-Type": "text/plain;charset=UTF-8" },
        });
      }

      const testMessage = `🧪 企业微信 Webhook 测试消息\n\n✅ 配置成功！\n\n📅 时间: ${new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}`;

      try {
        await sendWechatNotification(testMessage);
        return new Response(testMessage, {
          status: 200,
          headers: { "Content-Type": "text/plain;charset=UTF-8" },
        });
      } catch (error) {
        return new Response(`❌ 企业微信推送失败: ${error.message}`, {
          status: 500,
          headers: { "Content-Type": "text/plain;charset=UTF-8" },
        });
      }
    }

    // 查看签到结果
    if (pathname === "/status") {
      if (!qiandaoRes) {
        return new Response("⚠️ 暂无签到结果，请先执行签到", {
          status: 400,
          headers: { "Content-Type": "text/plain;charset=UTF-8" },
        });
      }
      return new Response(qiandaoRes, {
        status: 200,
        headers: { "Content-Type": "text/plain;charset=UTF-8" },
      });
    }

    // 未知路径
    return new Response("❌ 未知的路径，请访问 / 查看帮助", {
      status: 404,
      headers: { "Content-Type": "text/plain;charset=UTF-8" },
    });
  },

  async scheduled(controller, env, ctx) {
    console.log("⏰ Cron job started");
    try {
      await initializeVariables(env);
      await checkin();
      console.log("✅ Cron job completed successfully");
    } catch (error) {
      console.error("❌ Cron job failed:", error);
      qiandaoRes = `⚠️ 定时任务执行失败: ${error.message}`;

      await sendWechatNotification(qiandaoRes);
    }
  },
};

async function initializeVariables(env, setQiandaoRes = true) {
  domain = env.JC || env.DOMAIN || domain;
  user = env.ZH || env.USER || user;
  pass = env.MM || env.PASS || pass;
  QYWXKEY = env.QYWXKEY || QYWXKEY;

  if (!domain.includes("//")) domain = `https://${domain}`;

  if (setQiandaoRes) {
    qiandaoRes =
      `🚀 机场签到通知 🚀\n\n` +
      `🔹 网址: ${domain}\n` +
      `🔹 账号: ${user.substring(0, 1)}****${user.substring(user.length - 5)}\n` +
      `🔹 密码: ${pass.substring(0, 1)}****${pass.substring(pass.length - 1)}\n` +
      `📢 企业微信推送: ${QYWXKEY ? "✅ 已启用" : "❌ 未启用"}`;
  }
}

// 发送企业微信群通知
async function sendWechatNotification(msg) {
  if (!QYWXKEY) {
    console.warn("⚠️ 企业微信 Webhook 未配置，跳过推送");
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
    console.log("✅ 企业微信通知推送成功");
  } catch (error) {
    console.error("❌ 企业微信通知推送失败:", error);
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

  // 提取每个 cookie 的 name=value 部分
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
async function checkin() {
  try {
    if (!domain || !user || !pass) {
      throw new Error("必需的配置参数缺失");
    }

    // 初始化 qiandaoRes
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

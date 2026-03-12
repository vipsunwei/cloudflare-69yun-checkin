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
      const helpText = `
🚀 机场签到 Workers

可用路径：
• /${pass}  - 手动执行签到
• /qywx    - 测试企业微信 Webhook 配置（发送测试消息）
• /status  - 查看最后一次签到结果
• /debug   - 开启调试模式并执行签到（会在响应中返回详细日志）

提示：将 ${pass} 替换为你的实际密码
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
      log = function(message, data = null) {
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
          }
        );
      } catch (error) {
        return new Response(
          `📋 调试日志:\n\n${logs.join("\n")}\n\n❌ 错误: ${error.message}\n${error.stack}`,
          {
            status: 500,
            headers: { "Content-Type": "text/plain;charset=UTF-8" },
          }
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

      const testMessage = `🧪 企业微信 Webhook 测试消息\n\n✅ 配置成功！\n\n📅 时间: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`;

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

    const responseText = await checkinResponse.text();

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
      log("签到响应:", checkinResult);
      if (checkinResult.ret === 1) {
        qiandaoRes = `✅ 签到成功 ✅\n🎉 ${checkinResult.msg}`;
      } else {
        qiandaoRes = `⚠️ 签到失败 ⚠️\n${checkinResult.msg || "未知原因"}`;
      }
    } catch (e) {
      log("解析签到响应失败", { error: e.message });
      throw new Error(
        `解析签到响应失败: ${e.message}\n\n原始响应: ${responseText.substring(0, 500)}`,
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

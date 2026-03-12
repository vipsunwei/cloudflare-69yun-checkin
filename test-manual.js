// 从 .env 文件加载配置
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function loadEnvFile() {
  const envPath = path.join(__dirname, '.env');
  const env = {};

  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf-8');
    envContent.split('\n').forEach(line => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const [key, ...valueParts] = trimmed.split('=');
        const value = valueParts.join('=').trim();
        if (key && value) {
          env[key] = value;
        }
      }
    });
  }

  return env;
}

const env = loadEnvFile();
const pass = env.MM || env.PASS || "your_password_here";

console.log("测试密码路径匹配:");
console.log("从 .env 读取的密码:", env.MM || env.PASS || "未设置");
console.log("最终密码:", pass);

// 模拟不同的 pathname
const testPaths = [
  `/${pass}`,
  `/test123`,
  `/`,
  `/qywx`
];

testPaths.forEach(pathname => {
  console.log(`\n路径: ${pathname}`);
  console.log(`匹配结果: ${pathname === `/${pass}` ? "✅ 匹配" : "❌ 不匹配"}`);
});

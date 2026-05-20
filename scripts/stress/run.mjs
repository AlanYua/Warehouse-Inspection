/**
 * 壓測入口（autocannon）
 *
 * 需求：先啟動 app（建議用 build+start，不要用 dev）
 *   npm run build
 *   npm run start
 *
 * 用法：
 *   node scripts/stress/run.mjs documents
 *   node scripts/stress/run.mjs dashboard
 *   node scripts/stress/run.mjs daily-shipped
 *
 * 可調環境變數：
 *   STRESS_BASE_URL=http://localhost:3000
 *   STRESS_DURATION=30
 *   STRESS_CONNECTIONS=50
 *   STRESS_PIPELINING=1
 */
import autocannon from "autocannon";
import { loginNextAuth } from "./nextauth.mjs";

const scenario = process.argv[2] || "documents";
const baseUrl = process.env.STRESS_BASE_URL || "http://localhost:3000";
const duration = Number(process.env.STRESS_DURATION || 30);
const connections = Number(process.env.STRESS_CONNECTIONS || 50);
const pipelining = Number(process.env.STRESS_PIPELINING || 1);

function q(params) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

function pickUrl(sc) {
  // 盡量挑「會打到 DB」且「真實會被用」的路徑
  if (sc === "documents") {
    // 常見：列表（limit/offset）+ 偶爾帶 q（contains 會最重）
    // 這裡用固定 q，讓你用資料量推到 full scan 的痛點
    return `/api/documents${q({
      limit: 50,
      offset: 0,
      includeShipped: 0,
      q: process.env.STRESS_Q || "",
    })}`;
  }
  if (sc === "dashboard") {
    // 用較大的日期範圍更接近「資料量大」的 worst-case
    const from = process.env.STRESS_FROM || "2025-01-01";
    const to = process.env.STRESS_TO || "2026-12-31";
    return `/api/dashboard${q({ from, to })}`;
  }
  if (sc === "daily-shipped") {
    const date = process.env.STRESS_DATE || "2026-04-30";
    return `/api/reports/daily-shipped${q({ date })}`;
  }
  throw new Error(`unknown scenario: ${sc}`);
}

const path = pickUrl(scenario);
const targetUrl = new URL(path, baseUrl).toString();

const { cookie } = await loginNextAuth({
  baseUrl,
  username: process.env.STRESS_USER || "admin",
  password: process.env.STRESS_PASS || "admin123",
});

console.log(
  JSON.stringify(
    {
      scenario,
      url: targetUrl,
      duration,
      connections,
      pipelining,
    },
    null,
    2,
  ),
);

const instance = autocannon(
  {
    url: targetUrl,
    method: "GET",
    duration,
    connections,
    pipelining,
    headers: {
      cookie,
      // 避免被某些中間層當成 cache key；同時也更像真實瀏覽器
      "user-agent": "stress/autocannon",
      accept: "application/json",
    },
    timeout: 30, // 秒；避免掛死
  },
  (err, result) => {
    if (err) {
      console.error(err);
      process.exitCode = 1;
      return;
    }
    // 以 JSON 輸出，方便你貼到 issue 或用腳本比較不同資料量/參數
    console.log(JSON.stringify(result, null, 2));
  },
);

autocannon.track(instance, { renderProgressBar: true });


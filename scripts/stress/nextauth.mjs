/**
 * NextAuth Credentials：用 admin/admin123 取得可重用的 Cookie header。
 *
 * - 先 GET /api/auth/csrf 拿 csrfToken + cookie
 * - 再 POST /api/auth/callback/credentials 完成登入，取得 session cookie
 */
import { setTimeout as delay } from "node:timers/promises";

function joinSetCookies(setCookieHeaders) {
  if (!setCookieHeaders) return "";
  const arr = Array.isArray(setCookieHeaders) ? setCookieHeaders : [setCookieHeaders];
  return arr
    .map((h) => String(h).split(";")[0])
    .filter(Boolean)
    .join("; ");
}

function mergeCookieJar(jar, setCookieHeaders) {
  const sc = joinSetCookies(setCookieHeaders);
  if (!sc) return jar;
  const next = new Map();
  for (const part of jar.split(";")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const [k, v] = trimmed.split("=");
    if (k) next.set(k, v ?? "");
  }
  for (const part of sc.split(";")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const [k, v] = trimmed.split("=");
    if (k) next.set(k, v ?? "");
  }
  return [...next.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

function pickSetCookie(headers) {
  // Node fetch Headers: getSetCookie() exists in undici; fallback to raw iterator.
  // @ts-expect-error - undici Headers 才有 getSetCookie；其他 runtime 走 fallback
  if (typeof headers.getSetCookie === "function") return headers.getSetCookie();
  const out = [];
  for (const [k, v] of headers) {
    if (String(k).toLowerCase() === "set-cookie") out.push(v);
  }
  return out;
}

async function readJson(res) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export async function loginNextAuth({
  baseUrl,
  username = "admin",
  password = "admin123",
  maxRetries = 3,
}) {
  let lastErr;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      let cookieJar = "";
      const csrfRes = await fetch(`${baseUrl}/api/auth/csrf`, {
        redirect: "manual",
      });
      cookieJar = mergeCookieJar(cookieJar, pickSetCookie(csrfRes.headers));
      const csrfJson = await readJson(csrfRes);
      const csrfToken = csrfJson?.csrfToken;
      if (!csrfToken) throw new Error("NextAuth csrfToken not found");

      const body = new URLSearchParams({
        csrfToken,
        username,
        password,
        redirect: "false",
        callbackUrl: `${baseUrl}/`,
      });

      const loginRes = await fetch(`${baseUrl}/api/auth/callback/credentials`, {
        method: "POST",
        redirect: "manual",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          cookie: cookieJar,
        },
        body,
      });
      cookieJar = mergeCookieJar(cookieJar, pickSetCookie(loginRes.headers));

      if (loginRes.status >= 400) {
        const t = await loginRes.text().catch(() => "");
        throw new Error(`login failed: ${loginRes.status} ${t.slice(0, 200)}`);
      }

      if (!cookieJar) throw new Error("login cookie jar empty");
      return { cookie: cookieJar };
    } catch (e) {
      lastErr = e;
      await delay(200 * attempt);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}


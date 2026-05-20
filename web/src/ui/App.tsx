import { useEffect, useMemo, useState } from "react";

type Me = { user: { id: string; username: string; name: string | null; role: string } | null };

type ImportLog = {
  id: string;
  filename: string | null;
  source: string;
  successCount: number;
  errorCount: number;
  message: string | null;
  createdAt: string;
};

type DailyRow = {
  id: string;
  documentType: string;
  documentNumber: string;
  inspectTotal: number;
  logisticsNo: string | null;
  packageCount: number | null;
};
type DailyDept = { departmentId: string; departmentName: string; rows: DailyRow[] };
type DailyPayload = { date: string; totalDocs: number; byDepartment: DailyDept[] };

function todayYmdLocal() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

async function readText(res: Response) {
  const t = await res.text();
  return t || `HTTP ${res.status}`;
}

export function App() {
  const [me, setMe] = useState<Me>({ user: null });
  const [route, setRoute] = useState<"logs" | "daily" | "login">("login");
  const [login, setLogin] = useState({ username: "admin", password: "admin123" });
  const [msg, setMsg] = useState<string | null>(null);

  const [logs, setLogs] = useState<ImportLog[]>([]);
  const [date, setDate] = useState(todayYmdLocal());
  const [daily, setDaily] = useState<DailyPayload | null>(null);

  const authed = !!me.user;

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/auth/me", { credentials: "include" });
      if (res.ok) setMe((await res.json()) as Me);
      setRoute(res.ok ? "logs" : "login");
    })();
  }, []);

  async function doLogin(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(login),
    });
    if (!res.ok) {
      setMsg(await readText(res));
      return;
    }
    const m = (await res.json()) as { ok: boolean; user: Me["user"] };
    setMe({ user: m.user });
    setRoute("logs");
  }

  async function doLogout() {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    setMe({ user: null });
    setRoute("login");
  }

  useEffect(() => {
    if (!authed) return;
    if (route !== "logs") return;
    void (async () => {
      const res = await fetch("/api/import/logs", { credentials: "include" });
      if (res.ok) setLogs((await res.json()) as ImportLog[]);
    })();
  }, [authed, route]);

  useEffect(() => {
    if (!authed) return;
    if (route !== "daily") return;
    void (async () => {
      const res = await fetch(`/api/reports/daily-shipped?date=${encodeURIComponent(date)}`, {
        credentials: "include",
      });
      if (!res.ok) {
        setMsg(await readText(res));
        setDaily(null);
        return;
      }
      setDaily((await res.json()) as DailyPayload);
    })();
  }, [authed, route, date]);

  const totalInspect = useMemo(() => {
    if (!daily) return 0;
    let s = 0;
    for (const d of daily.byDepartment) for (const r of d.rows) s += r.inspectTotal;
    return s;
  }, [daily]);

  return (
    <div style={{ fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif", padding: 16, maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ fontWeight: 700 }}>Shipping Inspection（SPA 測試版）</div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {authed && (
            <>
              <button onClick={() => setRoute("logs")}>匯入紀錄</button>
              <button onClick={() => setRoute("daily")}>日報表</button>
            </>
          )}
          {authed ? (
            <button onClick={() => void doLogout()}>登出（{me.user?.username}）</button>
          ) : null}
        </div>
      </div>

      {msg && <pre style={{ background: "#f6f6f6", padding: 12, overflow: "auto" }}>{msg}</pre>}

      {!authed || route === "login" ? (
        <form onSubmit={(e) => void doLogin(e)} style={{ marginTop: 18, display: "grid", gap: 8, maxWidth: 360 }}>
          <div style={{ fontWeight: 600 }}>登入</div>
          <input value={login.username} onChange={(e) => setLogin((s) => ({ ...s, username: e.target.value }))} placeholder="username" />
          <input value={login.password} onChange={(e) => setLogin((s) => ({ ...s, password: e.target.value }))} placeholder="password" type="password" />
          <button type="submit">登入</button>
          <div style={{ color: "#666", fontSize: 12 }}>預設 seed：admin / admin123</div>
        </form>
      ) : route === "logs" ? (
        <div style={{ marginTop: 18 }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>匯入紀錄</div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>時間</th>
                <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>來源</th>
                <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>檔名</th>
                <th style={{ textAlign: "right", borderBottom: "1px solid #ddd", padding: 8 }}>成功</th>
                <th style={{ textAlign: "right", borderBottom: "1px solid #ddd", padding: 8 }}>失敗</th>
                <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>訊息</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id}>
                  <td style={{ borderBottom: "1px solid #f0f0f0", padding: 8, whiteSpace: "nowrap" }}>{new Date(l.createdAt).toLocaleString()}</td>
                  <td style={{ borderBottom: "1px solid #f0f0f0", padding: 8, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>{l.source}</td>
                  <td style={{ borderBottom: "1px solid #f0f0f0", padding: 8 }}>{l.filename ?? "—"}</td>
                  <td style={{ borderBottom: "1px solid #f0f0f0", padding: 8, textAlign: "right" }}>{l.successCount}</td>
                  <td style={{ borderBottom: "1px solid #f0f0f0", padding: 8, textAlign: "right" }}>{l.errorCount}</td>
                  <td style={{ borderBottom: "1px solid #f0f0f0", padding: 8, fontSize: 12, color: "#333" }}>{(l.message ?? "—").slice(0, 240)}</td>
                </tr>
              ))}
              {logs.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ padding: 12, color: "#666" }}>無資料</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{ marginTop: 18 }}>
          <div style={{ display: "flex", gap: 12, alignItems: "end", flexWrap: "wrap" }}>
            <div style={{ fontWeight: 600 }}>日報表（已出貨）</div>
            <label style={{ fontSize: 12, color: "#666" }}>
              日期{" "}
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </label>
            <div style={{ fontSize: 12, color: "#666" }}>
              單據數：{daily?.totalDocs ?? 0}，驗收總數合計：{totalInspect}
            </div>
          </div>
          {!daily ? (
            <div style={{ padding: 12, color: "#666" }}>無資料</div>
          ) : (
            <div style={{ display: "grid", gap: 18, marginTop: 12 }}>
              {daily.byDepartment.map((d) => (
                <div key={d.departmentId} style={{ border: "1px solid #eee", borderRadius: 8, padding: 12 }}>
                  <div style={{ fontWeight: 600, marginBottom: 8 }}>{d.departmentName}（{d.rows.length}）</div>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>類型</th>
                        <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>單據號碼</th>
                        <th style={{ textAlign: "right", borderBottom: "1px solid #ddd", padding: 8 }}>驗收總數</th>
                        <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>物流號碼</th>
                        <th style={{ textAlign: "right", borderBottom: "1px solid #ddd", padding: 8 }}>件數</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.rows.map((r) => (
                        <tr key={r.id}>
                          <td style={{ borderBottom: "1px solid #f0f0f0", padding: 8 }}>{r.documentType}</td>
                          <td style={{ borderBottom: "1px solid #f0f0f0", padding: 8, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>{r.documentNumber}</td>
                          <td style={{ borderBottom: "1px solid #f0f0f0", padding: 8, textAlign: "right" }}>{r.inspectTotal}</td>
                          <td style={{ borderBottom: "1px solid #f0f0f0", padding: 8, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 12 }}>{r.logisticsNo ?? "—"}</td>
                          <td style={{ borderBottom: "1px solid #f0f0f0", padding: 8, textAlign: "right" }}>{r.packageCount ?? "—"}</td>
                        </tr>
                      ))}
                      {d.rows.length === 0 && (
                        <tr>
                          <td colSpan={5} style={{ padding: 12, color: "#666" }}>無資料</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}


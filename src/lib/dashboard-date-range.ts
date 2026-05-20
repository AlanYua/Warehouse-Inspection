/**
 * 儀表板日期區間：以執行環境本地時區的日曆日為準（含首尾兩日）。
 */

export function localCalendarYmd(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function startOfLocalDayYmd(ymd: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const da = Number(m[3]);
  const d = new Date(y, mo - 1, da, 0, 0, 0, 0);
  if (
    d.getFullYear() !== y ||
    d.getMonth() !== mo - 1 ||
    d.getDate() !== da
  ) {
    return null;
  }
  return d;
}

function endOfLocalDayYmd(ymd: string): Date | null {
  const start = startOfLocalDayYmd(ymd);
  if (!start) return null;
  const d = new Date(start);
  d.setHours(23, 59, 59, 999);
  return d;
}

function todayLocalRange(): { start: Date; end: Date } {
  const n = new Date();
  const y = n.getFullYear();
  const mo = n.getMonth();
  const da = n.getDate();
  return {
    start: new Date(y, mo, da, 0, 0, 0, 0),
    end: new Date(y, mo, da, 23, 59, 59, 999),
  };
}

/** 未帶參數時預設為「當日」；只帶一邊則視為該日單日區間。 */
export function parseDashboardDateRangeQuery(
  from: string | null,
  to: string | null,
):
  | { ok: true; start: Date; end: Date }
  | { ok: false; message: string } {
  const f = from?.trim() || null;
  const t = to?.trim() || null;

  if (!f && !t) {
    const r = todayLocalRange();
    return { ok: true, start: r.start, end: r.end };
  }

  const fromYmd = f ?? t!;
  const toYmd = t ?? f!;
  const start = startOfLocalDayYmd(fromYmd);
  const end = endOfLocalDayYmd(toYmd);
  if (!start || !end) {
    return { ok: false, message: "日期格式須為 YYYY-MM-DD" };
  }
  if (start > end) {
    const s2 = startOfLocalDayYmd(toYmd);
    const e2 = endOfLocalDayYmd(fromYmd);
    if (!s2 || !e2) {
      return { ok: false, message: "日期格式須為 YYYY-MM-DD" };
    }
    return { ok: true, start: s2, end: e2 };
  }
  return { ok: true, start, end };
}

/** 日報表查詢：日期區間（UTC 日界） */

export function parseYmd(s: string | null): Date | null {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null;
  return new Date(Date.UTC(y, mo - 1, d, 0, 0, 0, 0));
}

export function toYmdLocal(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function todayYmdLocal() {
  return toYmdLocal(new Date());
}

export function resolveDailyDateRange(params: {
  dateFrom?: string | null;
  dateTo?: string | null;
  /** 相容舊版單日 ?date= */
  date?: string | null;
}): { startUtc: Date; endUtc: Date; dateFrom: string; dateTo: string } {
  const today = todayYmdLocal();
  const legacy = params.date?.trim() || "";
  let fromYmd = (params.dateFrom?.trim() || legacy || today).slice(0, 10);
  let toYmd = (params.dateTo?.trim() || legacy || fromYmd).slice(0, 10);
  if (fromYmd > toYmd) [fromYmd, toYmd] = [toYmd, fromYmd];

  const startUtc = parseYmd(fromYmd) ?? parseYmd(today)!;
  const endDay = parseYmd(toYmd) ?? startUtc;
  const endUtc = new Date(endDay.getTime() + 24 * 60 * 60 * 1000 - 1);

  return { startUtc, endUtc, dateFrom: fromYmd, dateTo: toYmd };
}

export function formatDailyRangeLabel(dateFrom: string, dateTo: string) {
  return dateFrom === dateTo ? dateFrom : `${dateFrom} ~ ${dateTo}`;
}

export function dailyRangeExportSuffix(dateFrom: string, dateTo: string) {
  const f = dateFrom.replaceAll("-", "");
  const t = dateTo.replaceAll("-", "");
  return f === t ? f : `${f}-${t}`;
}

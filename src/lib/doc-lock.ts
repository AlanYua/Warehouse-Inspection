/**
 * 檢驗鎖定過期判斷：LOCK_TTL_MINUTES（預設 30）分鐘未續鎖視為過期，可供搶鎖。
 */
const ttlMin = Number(process.env.LOCK_TTL_MINUTES || 30);

export function lockExpired(lockedAt: Date | null): boolean {
  if (!lockedAt) return true;
  return Date.now() - lockedAt.getTime() > ttlMin * 60 * 1000;
}

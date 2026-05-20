/**
 * 結構化 Logger — 輕量封裝，正式環境只輸出 warn+error。
 * 用法：
 *   import { log } from "@/lib/logger";
 *   log.info("sync", { docId, changed: true });
 *   log.error("import-fail", { file, reason });
 */

type Level = "debug" | "info" | "warn" | "error";

const LEVELS: Record<Level, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const MIN_LEVEL: Level =
  process.env.NODE_ENV === "production" ? "warn" : "debug";

function emit(level: Level, tag: string, data?: Record<string, unknown>) {
  if (LEVELS[level] < LEVELS[MIN_LEVEL]) return;

  const entry = {
    ts: new Date().toISOString(),
    level,
    tag,
    ...data,
  };

  switch (level) {
    case "error":
      console.error(JSON.stringify(entry));
      break;
    case "warn":
      console.warn(JSON.stringify(entry));
      break;
    default:
      console.log(JSON.stringify(entry));
  }
}

export const log = {
  debug: (tag: string, data?: Record<string, unknown>) =>
    emit("debug", tag, data),
  info: (tag: string, data?: Record<string, unknown>) =>
    emit("info", tag, data),
  warn: (tag: string, data?: Record<string, unknown>) =>
    emit("warn", tag, data),
  error: (tag: string, data?: Record<string, unknown>) =>
    emit("error", tag, data),
};

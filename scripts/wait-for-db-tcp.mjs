/**
 * 等 PostgreSQL 在 Docker 網路內開始聽 5432（不依賴 compose health / pg_isready）。
 * 環境變數：WAIT_DB_HOST（預設 db）、WAIT_DB_PORT（預設 5432）、
 * WAIT_DB_TIMEOUT_MS（預設 120000）、WAIT_DB_INTERVAL_MS（預設 1000）。
 */
import net from "node:net";

const host = process.env.WAIT_DB_HOST ?? "db";
const port = Number(process.env.WAIT_DB_PORT ?? "5432");
const timeoutMs = Number(process.env.WAIT_DB_TIMEOUT_MS ?? "120000");
const intervalMs = Number(process.env.WAIT_DB_INTERVAL_MS ?? "1000");
const deadline = Date.now() + timeoutMs;

function tryOnce() {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port }, () => {
      socket.end();
      resolve();
    });
    socket.setTimeout(5000);
    socket.on("error", reject);
    socket.on("timeout", () => {
      socket.destroy();
      reject(new Error("socket timeout"));
    });
  });
}

async function main() {
  for (;;) {
    if (Date.now() > deadline) {
      console.error(
        `wait-for-db-tcp: 逾時 ${timeoutMs}ms，仍無法連上 ${host}:${port}（請查 db 日誌與 DB_PASSWORD / 舊 volume）`,
      );
      process.exit(1);
    }
    try {
      await tryOnce();
      console.log(`wait-for-db-tcp: ${host}:${port} 已可連線`);
      return;
    } catch {
      await new Promise((r) => setTimeout(r, intervalMs));
    }
  }
}

await main();

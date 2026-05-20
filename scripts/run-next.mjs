/**
 * 啟動 Next CLI 時強制 NODE_PATH 指向本專案 node_modules。
 * 原因：.next 若被 symlink 到專案外，server bundle 解析 externals 會找不到 react/next。
 */
import { spawn } from "node:child_process";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const nextCli = path.join(root, "node_modules", "next", "dist", "bin", "next");
const nm = path.join(root, "node_modules");
const env = {
  ...process.env,
  NODE_PATH: [nm, process.env.NODE_PATH].filter(Boolean).join(path.delimiter),
};

// Next CLI 沒有 --webpack 這個參數；它只影響 dev/build 的 bundler 行為。
// 為了讓 package.json 可固定帶 --webpack（Windows/watchpack workaround），在 start 時忽略它。
const argv = process.argv.slice(2);
const cmd = argv[0];
const baseArgs = cmd === "start" ? argv.filter((a) => a !== "--webpack") : argv;

function hasPortArg(args) {
  return args.includes("-p") || args.includes("--port");
}

function canListen(port, host = "::") {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.once("error", () => resolve(false));
    s.listen(port, host, () => {
      s.close(() => resolve(true));
    });
  });
}

async function withAutoPort(args) {
  if (!cmd || (cmd !== "dev" && cmd !== "start")) return args;
  if (env.PORT || hasPortArg(args)) return args;

  // start：固定 3000（除非明確指定 PORT/-p）。若 3000 被佔用就讓 Next 直接報錯。
  if (cmd === "start") return [...args, "-p", "3000"];

  // dev：3000 被佔用時自動往上找，避免每次手動改 PORT / 關掉舊 process
  for (let p = 3000; p <= 3010; p++) {
    if (await canListen(p)) return [...args, "-p", String(p)];
  }
  return args;
}

const finalArgs = await withAutoPort(baseArgs);

const child = spawn(process.execPath, [nextCli, ...finalArgs], {
  cwd: root,
  env,
  stdio: "inherit",
});

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});

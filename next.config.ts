import type { NextConfig } from "next";
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-DNS-Prefetch-Control", value: "on" },
  {
    key: "Permissions-Policy",
    value: "camera=(self), microphone=(), geolocation=()",
  },
];

const isDev = process.env.NODE_ENV !== "production";

const nextConfig: NextConfig = {
  // production 預設 Turbopack；dev 的 webpack watchOptions 僅在 --webpack 時生效
  turbopack: {},
  output: isDev ? undefined : "standalone",
  poweredByHeader: false,
  outputFileTracingRoot: import.meta.dirname,
  // 縮小 standalone trace 圖，降低 build 峰值記憶體（Coolify 常死在 Collecting build traces）
  serverExternalPackages: ["@prisma/client", "prisma", "exceljs", "bcryptjs"],
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
  webpack: (config, { dev }) => {
    if (dev) {
      // Windows: 避免 Watchpack 掃到系統保護檔/資料夾導致 EINVAL lstat
      // 例如：C:\hiberfil.sys / pagefile.sys / swapfile.sys / System Volume Information
      // 注意：此專案的 webpack schema 對 ignored array 只接受「字串 glob」(不吃 RegExp)。
      const add = [
        "**/System Volume Information/**",
        "**/hiberfil.sys",
        "**/pagefile.sys",
        "**/swapfile.sys",
        "**/DumpStack.log.tmp",
        // 有些環境 Watchpack 會以絕對路徑掃到磁碟根目錄；加上 C: 版 glob 壓掉 lstat 例外
        "C:/**/System Volume Information/**",
        "C:/**/hiberfil.sys",
        "C:/**/pagefile.sys",
        "C:/**/swapfile.sys",
        "C:/**/DumpStack.log.tmp",
        // 再補「絕對路徑」版本（用 /，避免 watchpack glob 解析 \ 造成 regex 破壞）
        "C:/System Volume Information/**",
        "C:/hiberfil.sys",
        "C:/pagefile.sys",
        "C:/swapfile.sys",
        "C:/DumpStack.log.tmp",
      ];

      const prev = config.watchOptions;
      const prevIgnored = prev?.ignored;
      const base = Array.isArray(prevIgnored)
        ? prevIgnored
        : prevIgnored
          ? [prevIgnored]
          : [];
      const baseStrings = base.filter(
        (x): x is string => typeof x === "string" && x.trim() !== "",
      );

      // 避免 mutate Next 內部可能 freeze 的物件：整包 watchOptions 換新 object
      config.watchOptions = {
        ...(prev ?? {}),
        ignored: [...baseStrings, ...add],
      };
    }
    return config;
  },
};

export default nextConfig;

import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    ".next-dev/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // macOS AppleDouble 垃圾檔（會害 parser 報錯）
    "**/._*",
    ".DS_Store",
    // 封存區（歷史/實驗/一次性腳本）
    "_archive/**",
  ]),
]);

export default eslintConfig;

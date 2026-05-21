# 封存區（`_archive`）

主線程式只跑 **Next.js**（`src/` + `prisma/` + `scripts/`）。以下檔案已移出根目錄，方便你檢視後刪除。

| 子資料夾 | 內容 | 可否刪除 |
|----------|------|----------|
| `legacy-server/server/` | 舊 Fastify API（已由 Next `/api/*` 取代） | 通常可整包刪 |
| `legacy-web/web/` | 舊 Vite + React 實驗前端 | 通常可整包刪 |
| `public-assets/` | Next 範本 SVG、單據篩選 HTML mockup（主程式未引用） | 可刪 |
| `backups/` | 本機 Postgres dump（2026-03 / 2026-05） | 確認已備份到別處後可刪 |
| `scripts-oneoff/` | 一次性除錯／遷移腳本 | 用完可刪 |
| `data/dev.db` | 早期 SQLite 殘檔（現用 PostgreSQL） | 可刪 |

## `scripts-oneoff/` 說明

- `backfill-lines-from-products.mjs` — 從商品表回填明細儲位（一次性）
- `debug-doc.mjs` / `debug-product.mjs` — 本機除錯用
- `deploy-staging.ps1` — 舊版 robocopy 部署腳本（路徑寫死本機）

## 還原方式

若要暫時取回某目錄，移回專案根目錄即可，例如：

```powershell
Move-Item .\_archive\legacy-server\server .\server
```

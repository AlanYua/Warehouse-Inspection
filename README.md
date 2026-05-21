## Shipping Inspection v2（本機開發最小集）

### 架構（只留 Next）
- **唯一入口**：Next.js App Router（`src/app`）同時提供 UI + `/api/*`。
- 歷史實驗碼、mockup、舊 dump、一次性腳本 → **`_archive/`**（見該目錄 README，確認後可自行刪除）。

### 需求
- Node.js 20+
- Windows 已安裝 PostgreSQL（本專案用 `.env` 的 `DATABASE_URL` 連線）

### 安裝

```bash
npm ci
```

### DB 初始化 / 同步

```bash
npm run db:push
```

（需要示範資料才跑）

```bash
npm run db:seed
```

### 啟動

```bash
npm run dev
```

## Windows 正式機運行（最小集）

### 環境變數
- 複製 `.env.example` 成 `.env`，至少設定：
  - `DATABASE_URL`
  - `AUTH_SECRET`（正式機請換成長且隨機）
  - `AUTH_URL`（正式網址/網域）

### 一鍵 build + start（PowerShell）

```powershell
.\scripts\run-prod.ps1
```

（只 build）

```powershell
.\scripts\run-prod.ps1 -BuildOnly
```

（只 start；例如已經 build 好）

```powershell
.\scripts\run-prod.ps1 -StartOnly
```

### 清空資料（危險）

```bash
$env:DB_CLEAN_CONFIRM="YES"; npm run db:clean-current
```

### 備份 / 還原

```bash
npm run db:backup
# restore 需帶 dump 檔案路徑（PowerShell 例）
npm run db:restore -- C:\path\to\shipping_inspection-YYYYMMDD-HHMMSS.dump
```
清目前資料（單據/明細/商品/通路）
.\scripts\db-clean-current.ps1

幾乎全清、保留 admin
.\scripts\db-clean-all.ps1

直接在專案根目錄用 PowerShell 跑：
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\db-clean-current.ps1
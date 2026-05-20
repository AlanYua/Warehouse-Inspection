# 正式上線：Cloudflare + Vultr Tokyo + Coolify

架構：**Cloudflare → Coolify 反代 → Next.js app**；同機 **PostgreSQL** + **sync worker**。

---

## 0. 前置需求

| 項目 | 建議 |
|------|------|
| 網域 | 已接入 Cloudflare（橘雲 Proxy ON） |
| VPS | Vultr Tokyo，≥ **4GB RAM** / 2 vCPU / 80GB SSD |
| OS | Ubuntu 22.04/24.04 |
| Repo | GitHub/GitLab 可讓 Coolify 拉取 |

---

## 1. Vultr 開機

1. 建立 VPS（Tokyo）。
2. 防火牆只開：**22**（SSH，建議改 key）、**80/443**（給 Coolify/Traefik）。
3. **不要**對外開 5432、3000。
4. SSH 登入後更新系統：

```bash
sudo apt update && sudo apt upgrade -y
```

---

## 2. 安裝 Coolify

依 [Coolify 官方文件](https://coolify.io/docs/get-started/installation) 在 VPS 執行安裝腳本（通常一條 curl）。

安裝完成後：

- 開 `http://<VPS_IP>:8000` 完成 Coolify 初始設定。
- 之後用 **https + 子網域** 管理 Coolify（可在 Coolify 內綁定 `coolify.yourdomain.com`）。

---

## 3. Cloudflare

**逐步操作請照 [`deploy/CLOUDFLARE.md`](./CLOUDFLARE.md)**（DNS、SSL、Cache Rules、驗證、DuckDNS 限制）。

摘要：

| 類型 | 名稱 | 內容 | Proxy |
|------|------|------|-------|
| A | `wms` | VPS 公網 IP | 橘雲 ON |

`AUTH_URL=https://wms.你的網域.com`（與 DNS 一致、https、無尾斜線）。

---

## 4. Coolify 建立專案

### 4.1 新增 Resource → Docker Compose

- **Repository**：本專案 Git URL
- **Branch**：`main`（或你的正式分支）
- **Docker Compose file**：`docker-compose.prod.yml`
- **Build**：開啟（會 build `app` + `worker`）

### 4.2 環境變數

在 Coolify「Environment Variables」貼上（或從 `.env.production.example` 複製）：

```env
DB_PASSWORD=<openssl rand -base64 32>
AUTH_SECRET=<openssl rand -base64 32>
AUTH_URL=https://wms.yourdomain.com
LOCK_TTL_MINUTES=30
SYNC_CRON_EXPRESSION=0 * * * *
ERP_API_URL=
ERP_DB_URL=
```

產生密鑰（本機或 VPS）：

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

### 4.3 網域綁在 `app` service

- Service：**app**
- Port：**3000**
- Domain：`wms.yourdomain.com`
- HTTPS：由 Coolify/Traefik 自動處理

`worker`、`db` **不要**綁公開網域。

### 4.4 Deploy

第一次 deploy 會：

1. build Docker images
2. 啟動 Postgres
3. `app` 啟動時自動 `prisma migrate deploy`
4. `worker` 背景排程啟動

---

## 5. 建立第一個管理員

Deploy 成功後，在 Coolify「Terminal」選 **worker** 容器（或 SSH 進 VPS 專案目錄）：

```bash
docker compose -f docker-compose.prod.yml run --rm \
  -e ADMIN_PASSWORD='你的強密碼' \
  worker node ./node_modules/tsx/dist/cli.mjs prisma/seed.ts
```

- 只會建立/更新 `admin` 帳號（**不會**灌 demo 資料，除非 `SEED_DEMO=YES`）。
- 登入：`https://wms.yourdomain.com`，帳號 `admin`。

---

## 6. 驗證

| 檢查 | URL / 指令 |
|------|------------|
| 存活探針 | `GET https://wms.yourdomain.com/api/health/live` → `{"ok":true,"db":"ok"}` |
| 登入 | 瀏覽器登入 admin |
| Worker log | Coolify → worker → Logs，應看到 `sync worker cron:` |
| DB migration | app log 無 migrate 錯誤 |

---

## 7. 備份（必做）

在 VPS 專案目錄（有 `.env` 與 `docker-compose.prod.yml`）：

```bash
chmod +x scripts/backup-db.sh
./scripts/backup-db.sh
```

Cron（每天 03:00）：

```bash
crontab -e
# 加入（路徑改成你的）：
0 3 * * * cd /data/coolify/.../your-project && ./scripts/backup-db.sh
```

備份檔在 `backups/`。請再 **rsync 到機外**（另一台 VPS、S3、R2、本機 NAS）。

---

## 8. 更新版號

1. `git push` 到正式分支
2. Coolify → **Redeploy**
3. 看 app log：`migrate deploy` 成功即可

---

## 9. 故障排除

| 現象 | 處理 |
|------|------|
| 登入後馬上登出 | `AUTH_URL` 必須與瀏覽器網址完全一致（https、無尾斜線） |
| 502 Bad Gateway | app 未起來；看 app container log、RAM 是否不足 |
| migrate 失敗 | DB 已是舊 schema：依 `.env.example` 註解跑 `prisma migrate resolve` |
| API 回傳舊資料 | Cloudflare 快取未 Bypass `/api/*` |
| 同步沒跑 | 確認 worker container 在跑、看 worker logs |

---

## 10. 本機先測正式 compose（可選）

**演示（含 SEED_DEMO、開 3000 port）**：見 [`deploy/DEMO-DOCKER.md`](./DEMO-DOCKER.md)

```powershell
.\scripts\run-docker-demo.ps1
```

手動方式：

```bash
cp deploy/env.docker.demo.example .env.docker.demo
docker compose -f docker-compose.prod.yml -f docker-compose.demo.yml --env-file .env.docker.demo up -d --build
docker compose -f docker-compose.prod.yml -f docker-compose.demo.yml --env-file .env.docker.demo run --rm -e SEED_DEMO=YES -e ADMIN_PASSWORD=demo-admin-2026 worker node ./node_modules/tsx/dist/cli.mjs prisma/seed.ts
curl -s http://127.0.0.1:3000/api/health/live
```

---

## 檔案對照

| 檔案 | 用途 |
|------|------|
| `docker-compose.prod.yml` | 正式三服務：db / app / worker |
| `Dockerfile` | `runner`（Next）、`worker`（排程） |
| `.env.production.example` | 環境變數範本 |
| `scripts/backup-db.sh` | Postgres 備份 |
| `/api/health/live` | 監控探針（無需登入） |

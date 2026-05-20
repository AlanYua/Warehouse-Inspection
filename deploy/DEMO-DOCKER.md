# 本機 Docker 演示（prod compose + 示範資料）

給客戶遠端看、或辦公室多人同時登入測流程用。

## 0. 安裝 Docker Desktop

Windows 需先安裝 [Docker Desktop](https://www.docker.com/products/docker-desktop/)，安裝後**重開 PowerShell**，確認：

```powershell
docker --version
docker compose version
```

## 1. 一鍵啟動（含 SEED_DEMO）

專案根目錄 PowerShell：

```powershell
.\scripts\run-docker-demo.ps1
```

會自動：

1. 若無 `.env.docker.demo`，從 `deploy/env.docker.demo.example` 複製
2. `docker compose -f docker-compose.prod.yml -f docker-compose.demo.yml up -d --build`
3. 在 **worker** 容器執行 `SEED_DEMO=YES` seed

## 2. 演示帳號

| 帳號 | 密碼 | 角色 |
|------|------|------|
| admin | `.env.docker.demo` 的 `ADMIN_PASSWORD`（預設 demo-admin-2026） | 管理員 |
| warehouse | warehouse123 | 倉庫 |
| sales | sales123 | 業務 |
| procurement | proc123 | 採購 |

本機開啟：<http://127.0.0.1:3000>

## 3. 給客戶「遠端」看（本機當伺服器）

瀏覽器網址必須與 `AUTH_URL` **完全一致**，否則登入後會被登出。

### 作法 A：Cloudflare Quick Tunnel（免費、快）

```powershell
# 另開一個終端（需已安裝 cloudflared）
cloudflared tunnel --url http://127.0.0.1:3000
```

會印出 `https://xxxx.trycloudflare.com`，然後：

```powershell
.\scripts\run-docker-demo.ps1 -AuthUrl "https://xxxx.trycloudflare.com"
```

若 app 已在跑，改完 `AUTH_URL` 後重啟 app：

```powershell
docker compose -f docker-compose.prod.yml -f docker-compose.demo.yml --env-file .env.docker.demo restart app
```

把隧道網址傳給客戶即可。

### 作法 B：路由器 port forward

1. 路由器把 **3000** 轉到你這台 PC 的內網 IP  
2. `.env.docker.demo` 設 `AUTH_URL=http://你的公網IP:3000`（有 HTTPS 更好）  
3. `docker compose ... restart app`

### 作法 C：直接上 VPS

照 `deploy/DEPLOY.md` 部署；seed 時加 `SEED_DEMO=YES`（見該文件 §5）。

## 4. 常用指令

```powershell
# 只重灌 demo 資料（DB 已在跑）
.\scripts\run-docker-demo.ps1 -SeedOnly

# 不 rebuild 映像
.\scripts\run-docker-demo.ps1 -NoBuild

# 看 log
docker compose -f docker-compose.prod.yml -f docker-compose.demo.yml --env-file .env.docker.demo logs -f app

# 停止（保留 DB volume）
docker compose -f docker-compose.prod.yml -f docker-compose.demo.yml --env-file .env.docker.demo down

# 連 DB 一併刪（重新來過）
docker compose -f docker-compose.prod.yml -f docker-compose.demo.yml --env-file .env.docker.demo down -v
```

## 5. 多人演示技巧

- 同一台電腦：**Chrome 一般 + Chrome 無痕 + Edge**，各登不同帳號  
- `LOCK_TTL_MINUTES=5`（demo env 預設）方便示範鎖定過期／交棒  
- 同一張單仍只能一人編輯；不同單可多人同時操作

## 檔案

| 檔案 | 用途 |
|------|------|
| `docker-compose.prod.yml` | db / app / worker |
| `docker-compose.demo.yml` | 本機開 3000 port |
| `deploy/env.docker.demo.example` | 環境變數範本 |
| `.env.docker.demo` | 實際設定（gitignore） |
| `scripts/run-docker-demo.ps1` | 一鍵啟動 + seed |

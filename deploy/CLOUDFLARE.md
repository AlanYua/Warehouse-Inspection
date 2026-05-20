# Cloudflare 設定清單（倉檢系統正式上線）

> **前提**：你要有一個**自己擁有**的網域（例如 `yourcompany.com`），且 Nameserver 已改到 Cloudflare。  
> `*.duckdns.org` **無法**掛進你的 Cloudflare 帳號做橘雲代理（你不掌控 duckdns.org 的 DNS）。

---

## A. 還沒有網域？

1. 向 Namecheap / Cloudflare Registrar / Gandi 等購買網域（約 USD 10/年）。
2. Cloudflare Dashboard → **Add a site** → 輸入網域 → 選 **Free** plan。
3. 依畫面把網域註冊商的 **Nameserver** 改成 Cloudflare 給你的兩組（例如 `ada.ns.cloudflare.com`）。
4. 等狀態變 **Active**（通常數分鐘～48 小時）。

**正式對外網址建議**：`https://wms.你的網域.com`  
（之後 Coolify `AUTH_URL` 必須與此完全一致。）

---

## B. DNS 記錄（VPS IP 開好後再填）

Cloudflare → 你的網域 → **DNS** → **Records** → Add record：

| 類型 | 名稱 | IPv4 位址 | Proxy |
|------|------|-----------|-------|
| `A` | `wms` | `<Vultr 公網 IP>` | **Proxied（橘雲 ON）** |
| `A` | `coolify`（可選） | 同上 | Proxied |

- **不要**為 `db`、postgres 建任何記錄。
- VPS 還沒開：可先不建，或建完 IP 確定後再改。

檢查：終端機 `dig wms.你的網域.com +short` 應看到 Cloudflare IP（104.x / 172.x），不是 VPS 真實 IP。

---

## C. SSL/TLS

**SSL/TLS** → Overview：

| 項目 | 設定 |
|------|------|
| Encryption mode | **Full (strict)** |

說明：訪客 ↔ Cloudflare 用 CF 憑證；Cloudflare ↔ VPS 用 Let's Encrypt（Coolify 申請）。  
若 VPS 尚未有有效憑證，暫時可先用 **Full**，證書好了再改 **Full (strict)**。

**SSL/TLS** → **Edge Certificates**：

- **Always Use HTTPS**：ON
- **Minimum TLS Version**：TLS 1.2（預設即可）
- **Automatic HTTPS Rewrites**：ON

---

## D. 快取規則（必做，否則 API/登入會壞）

**Rules** → **Cache Rules** → **Create rule**

### Rule 1：API 不快取

- **Rule name**：`Bypass API`
- **When**：Custom filter expression  
  ```
  (http.request.uri.path starts_with "/api/")
  ```
- **Then**：
  - Cache eligibility：**Bypass cache**
  -（若有）Cache level：**Bypass**

### Rule 2：登入 / Auth 不快取

- **Rule name**：`Bypass Auth`
- **When**：
  ```
  (http.request.uri.path starts_with "/api/auth") or
  (http.request.uri.path eq "/login")
  ```
- **Then**：Cache eligibility → **Bypass cache**

### Rule 3（可選）：靜態資源快取

- **When**：`(http.request.uri.path starts_with "/_next/static/")`
- **Then**：Cache eligibility → **Eligible for cache**，Edge TTL 例如 1 month

> 舊版 **Page Rules** 若你還在用：`*.yourdomain.com/api/*` → Cache Level Bypass（免費方案 Page Rules 有限，優先用 Cache Rules）。

---

## E. 安全（建議）

**Security** → **Settings**：

| 項目 | 建議 |
|------|------|
| Security Level | Medium |
| Bot Fight Mode | ON（免費方案） |
| Browser Integrity Check | ON |

**WAF**（Free 基本規則即可，先不擋太兇，避免誤殺倉庫內網 IP）。

---

## F. 網路（一般不用改）

**Network**：

- **HTTP/2**、**HTTP/3 (QUIC)**：ON
- **WebSockets**：ON（Next.js 若未來用到）

**Speed** → **Optimization**：可先維持預設；不要對 HTML 開 Aggressive 快取。

---

## G. 上傳 / Excel

免費方案單檔上傳上限約 **100MB**，倉檢 Excel 通常夠用。  
若常超過，再考慮調整或走直連 VPS（不經 CF）。

---

## H. 與本專案對齊的環境變數

Coolify / `.env`：

```env
AUTH_URL=https://wms.你的網域.com
```

- 必須 **https**
- **不要**尾端斜線 `/`
- 子網域名稱必須與 DNS 的 `wms` 記錄一致

監控 URL（UptimeRobot / CF Health Checks）：

```
https://wms.你的網域.com/api/health/live
```

預期：`{"ok":true,"db":"ok"}`（需 app 已 deploy）

---

## I. 驗證 Cloudflare 是否 OK（VPS 還沒裝 app 前）

1. DNS 橘雲 ON，`dig` 回 CF IP。
2. SSL 模式 Full (strict) 或暫時 Full。
3. Cache Rules 已建立 Bypass `/api/`。
4. 瀏覽器開 `https://wms.你的網域.com`：
   - VPS/Coolify **未就緒**：可能 502/521/522 → **正常**，代表 CF 已指到 origin，等 Coolify。
   - **未就緒卻顯示舊站**：清 CF 快取或確認 DNS 指到正確 IP。

錯誤碼速查：

| 碼 | 意思 |
|----|------|
| 521 | Origin 拒絕連線（VPS 沒聽 443/80） |
| 522 | Origin 逾時（防火牆擋、服務沒起） |
| 525 | SSL 握手失敗（多為 Full strict 但 VPS 無有效憑證） |

---

## J. 若堅持用 DuckDNS、不用自有網域

無法做標準「橘雲 → VPS」。替代：

1. **買網域**（建議，最省事），或  
2. **不用 Cloudflare**，DuckDNS A 記錄直指 VPS + Coolify Let's Encrypt（無 DDoS 邊緣防護），或  
3. **Cloudflare Tunnel**（`cloudflared` 在 VPS，可不暴露 80/443；網址會是 `*.cfargotunnel.com` 或自訂網域仍要自有 domain）。

本專案正式架構以 **自有網域 + Cloudflare Proxy** 為準。

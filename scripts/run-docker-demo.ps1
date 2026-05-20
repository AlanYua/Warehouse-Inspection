# 本機正式 compose 演示：build + up + SEED_DEMO=YES
# 需求：Docker Desktop（Windows）已安裝且在 PATH
#
#   .\scripts\run-docker-demo.ps1
#   .\scripts\run-docker-demo.ps1 -AuthUrl "https://xxxx.trycloudflare.com"
#   .\scripts\run-docker-demo.ps1 -SeedOnly   # 容器已在跑，只重灌 demo 資料

param(
  [string]$AuthUrl = "",
  [switch]$SeedOnly,
  [switch]$NoBuild
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

function Find-Docker {
  $candidates = @(
    "docker",
    "$env:ProgramFiles\Docker\Docker\resources\bin\docker.exe",
    "${env:ProgramFiles(x86)}\Docker\Docker\resources\bin\docker.exe"
  )
  foreach ($c in $candidates) {
    try {
      $null = & $c version 2>&1
      if ($LASTEXITCODE -eq 0) { return $c }
    } catch { }
  }
  return $null
}

$docker = Find-Docker
if (-not $docker) {
  Write-Host "找不到 docker。請先安裝 Docker Desktop 並重開 PowerShell。" -ForegroundColor Red
  Write-Host "  https://www.docker.com/products/docker-desktop/" -ForegroundColor Yellow
  exit 1
}

$envFile = Join-Path $Root ".env.docker.demo"
$envExample = Join-Path $Root "deploy\env.docker.demo.example"
if (-not (Test-Path $envFile)) {
  if (-not (Test-Path $envExample)) {
    throw "缺少 $envExample"
  }
  Copy-Item $envExample $envFile
  Write-Host "已建立 $envFile（請視需要改 DB_PASSWORD / AUTH_SECRET）" -ForegroundColor Yellow
}

if ($AuthUrl) {
  $content = Get-Content $envFile -Raw
  if ($content -match "(?m)^AUTH_URL=.*$") {
    $content = $content -replace "(?m)^AUTH_URL=.*$", "AUTH_URL=$AuthUrl"
  } else {
    $content += "`nAUTH_URL=$AuthUrl`n"
  }
  Set-Content -Path $envFile -Value $content.TrimEnd() -NoNewline
  Add-Content -Path $envFile -Value ""
  Write-Host "AUTH_URL => $AuthUrl" -ForegroundColor Cyan
}

function Get-EnvValue([string]$key) {
  $line = Get-Content $envFile | Where-Object { $_ -match "^\s*$key\s*=" } | Select-Object -First 1
  if (-not $line) { return $null }
  return ($line -split "=", 2)[1].Trim().Trim('"')
}

$compose = @(
  "compose",
  "-f", "docker-compose.prod.yml",
  "-f", "docker-compose.demo.yml",
  "--env-file", ".env.docker.demo"
)

if (-not $SeedOnly) {
  $upArgs = @($compose + @("up", "-d") + $(if (-not $NoBuild) { "--build" }))
  Write-Host ">> $docker $($upArgs -join ' ')" -ForegroundColor Green
  & $docker @upArgs
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

  Write-Host "等待 app 健康檢查..." -ForegroundColor Cyan
  $deadline = (Get-Date).AddMinutes(8)
  $ok = $false
  while ((Get-Date) -lt $deadline) {
    try {
      $r = Invoke-WebRequest -Uri "http://127.0.0.1:3000/api/health/live" -UseBasicParsing -TimeoutSec 5
      if ($r.StatusCode -eq 200) { $ok = $true; break }
    } catch { }
    Start-Sleep -Seconds 3
  }
  if (-not $ok) {
    Write-Host "app 尚未就緒，請稍後手動檢查：curl http://127.0.0.1:3000/api/health/live" -ForegroundColor Yellow
    & $docker @compose logs app --tail 40
  }
}

$adminPw = Get-EnvValue "ADMIN_PASSWORD"
if (-not $adminPw) { $adminPw = "demo-admin-2026" }

Write-Host ">> 灌入 demo 帳號與示範單據 (SEED_DEMO=YES)..." -ForegroundColor Green
& $docker @compose run --rm `
  -e "SEED_DEMO=YES" `
  -e "ADMIN_PASSWORD=$adminPw" `
  worker node ./node_modules/tsx/dist/cli.mjs prisma/seed.ts
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$authUrlShow = Get-EnvValue "AUTH_URL"
if (-not $authUrlShow) { $authUrlShow = "http://127.0.0.1:3000" }

Write-Host ""
Write-Host "=== 演示環境就緒 ===" -ForegroundColor Green
Write-Host "網址：    $authUrlShow"
Write-Host "admin：   $adminPw"
Write-Host "warehouse / sales / procurement：warehouse123 / sales123 / proc123"
Write-Host ""
Write-Host "多人同時登入：不同瀏覽器或無痕視窗各開一個帳號。"
Write-Host "客戶遠端：見 deploy/DEMO-DOCKER.md（隧道 + 改 AUTH_URL 後重啟 app）。"
Write-Host "停止：    docker compose -f docker-compose.prod.yml -f docker-compose.demo.yml --env-file .env.docker.demo down"

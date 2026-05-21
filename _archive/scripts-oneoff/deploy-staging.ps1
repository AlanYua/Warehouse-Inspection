$ErrorActionPreference = "Stop"
$src = "C:\Users\Administrator\Desktop\Warehouse  Inspection"
$dst = Join-Path $env:TEMP "shipping-deploy"
if (Test-Path $dst) { Remove-Item $dst -Recurse -Force }
New-Item -ItemType Directory -Path $dst -Force | Out-Null

$exclude = @("node_modules", ".next", ".next-dev", ".git")
robocopy $src $dst /E /XD node_modules .next .next-dev .git "web\node_modules" /NFL /NDL /NJH /NJS /nc /ns /np | Out-Null
if ($LASTEXITCODE -ge 8) { throw "robocopy failed: $LASTEXITCODE" }

# docker-compose: production bindings (compatible with compose 1.25+)
$compose = Join-Path $dst "docker-compose.yml"
$c = Get-Content $compose -Raw
$c = $c -replace '(?ms)\s+ports:\s*\r?\n\s+- "5432:5432"\s*\r?\n', "`n"
$c = $c -replace '"3000:3000"', '"127.0.0.1:3000:3000"'
$c = $c -replace '\$\{DB_PASSWORD:-changeme\}', '${DB_PASSWORD}'
$c = $c -replace '\$\{AUTH_URL:-http://localhost:3000\}', '${AUTH_URL}'
$c = $c -replace '(?ms)depends_on:\s*\r?\n\s+db:\s*\r?\n\s+condition: service_healthy', "depends_on:`n      - db"
if ($c -notmatch '(?m)^version:\s*') {
  $c = "version: '3.3'`n$c"
}
Set-Content -Path $compose -Value $c -NoNewline

# .env for VPS (only keys docker-compose needs; no DATABASE_URL colons)
$envSrc = Join-Path $src ".env"
$envDst = Join-Path $dst ".env"
$authSecret = "changeme-run-openssl-on-vps"
if (Test-Path $envSrc) {
  foreach ($line in (Get-Content $envSrc -Encoding UTF8)) {
    if ($line -match '^\s*AUTH_SECRET=(.+)$') { $authSecret = $Matches[1].Trim().Trim('"') }
  }
}
$dbPass = -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 32 | ForEach-Object { [char]$_ })
@(
  "DB_PASSWORD=$dbPass"
  "AUTH_SECRET=$authSecret"
  "AUTH_URL=https://warehouseinspection.duckdns.org"
) | Set-Content $envDst -Encoding UTF8

Write-Host "Staging ready: $dst"
Get-ChildItem $dst | Select-Object Name

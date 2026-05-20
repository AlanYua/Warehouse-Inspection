# Local PostgreSQL bootstrap:
# - Create role "shipping"
# - Create database "shipping_inspection" owned by "shipping"
# Uses scripts/local-postgres-init.sql via psql.

param(
  [string] $PgSuperUser = "postgres",
  [string] $PgHost = "127.0.0.1",
  [int] $PgPort = 0
)

$ErrorActionPreference = "Stop"
$sql = Join-Path $PSScriptRoot "local-postgres-init.sql"

if (-not (Test-Path $sql)) {
  throw "Missing SQL file: $sql"
}

function Resolve-PgExe([string] $exeName) {
  $cmd = Get-Command $exeName -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }

  $svc = Get-CimInstance Win32_Service -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -like 'postgresql*' } |
    Select-Object -First 1
  if ($null -ne $svc -and $svc.PathName) {
    $m = [regex]::Match($svc.PathName, '"(?<pgctl>[^"]+pg_ctl\.exe)"')
    if ($m.Success) {
      $bin = Split-Path -Parent $m.Groups["pgctl"].Value
      $candidate = Join-Path $bin $exeName
      if (Test-Path $candidate) { return $candidate }
    }
  }

  $common = @(
    "C:\Program Files\PostgreSQL\18\bin",
    "C:\Program Files\PostgreSQL\17\bin",
    "C:\Program Files\PostgreSQL\16\bin",
    "C:\Program Files\PostgreSQL\15\bin"
  )
  foreach ($dir in $common) {
    $candidate = Join-Path $dir $exeName
    if (Test-Path $candidate) { return $candidate }
  }

  throw "Missing $exeName (PATH or PostgreSQL install not found)"
}

function Get-DatabaseUrlFromEnv([string] $projectRoot) {
  $envPath = Join-Path $projectRoot ".env"
  if (-not (Test-Path $envPath)) { return $null }

  $line = (Get-Content $envPath -ErrorAction SilentlyContinue) |
    Where-Object { $_ -match '^\s*DATABASE_URL\s*=' } |
    Select-Object -First 1
  if (-not $line) { return $null }

  $m = [regex]::Match($line, '^\s*DATABASE_URL\s*=\s*"?([^"]+)"?\s*$')
  if (-not $m.Success) { return $null }
  return $m.Groups[1].Value
}

$projectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")

$dbUrl = Get-DatabaseUrlFromEnv -projectRoot $projectRoot
$envHost = $null
$envPort = $null
$envUser = $null
$envPass = $null
$envDb = $null

if ($null -ne $dbUrl) {
  $uri = [Uri]$dbUrl
  $envHost = $uri.Host
  $envPort = $uri.Port
  $envDb = $uri.AbsolutePath.TrimStart("/")
  if ($uri.UserInfo) {
    $pair = $uri.UserInfo.Split(":", 2)
    $envUser = $pair[0]
    if ($pair.Length -gt 1) { $envPass = $pair[1] }
  }
}

if ($PgHost -eq "127.0.0.1" -and $null -ne $envHost -and $envHost -ne "127.0.0.1") {
  $PgHost = $envHost
}

if ($PgPort -le 0) {
  $PgPort = if ($null -ne $envPort -and $envPort -gt 0) { $envPort } else { 5432 }
}

$shippingPass = if ($null -ne $envPass -and $envPass.Length -gt 0) { $envPass } else { "shipping" }
$shippingPassEsc = $shippingPass -replace "'", "''"

$psqlExe = Resolve-PgExe "psql.exe"

Write-Host "Using psql: $psqlExe" -ForegroundColor Cyan
Write-Host "Connecting as -U $PgSuperUser to ${PgHost}:${PgPort} ..." -ForegroundColor Cyan

& $psqlExe -U $PgSuperUser -h $PgHost -p $PgPort -d postgres -v ON_ERROR_STOP=1 -f $sql
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

# Align role password with DATABASE_URL
& $psqlExe -U $PgSuperUser -h $PgHost -p $PgPort -d postgres -v ON_ERROR_STOP=1 -c "ALTER ROLE shipping PASSWORD '$shippingPassEsc';"
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

Write-Host ""
Write-Host "Done. DATABASE_URL should look like:" -ForegroundColor Green
if ($null -ne $dbUrl) {
  $u = if ($null -ne $envUser -and $envUser.Length -gt 0) { $envUser } else { "shipping" }
  $d = if ($null -ne $envDb -and $envDb.Length -gt 0) { $envDb } else { "shipping_inspection" }
  Write-Host "  postgresql://${u}:***@${PgHost}:${PgPort}/${d}" -ForegroundColor Green
} else {
  Write-Host "  postgresql://shipping:***@${PgHost}:${PgPort}/shipping_inspection" -ForegroundColor Green
}
Write-Host "Next:" -ForegroundColor Green
Write-Host "  npm run db:push" -ForegroundColor Green
Write-Host "  npm run db:seed" -ForegroundColor Green

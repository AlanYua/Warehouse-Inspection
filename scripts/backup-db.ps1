param(
  [string] $OutDir = (Join-Path $PSScriptRoot "..\\backups"),
  [string] $EnvPath = (Join-Path $PSScriptRoot "..\\.env")
)

$ErrorActionPreference = "Stop"

function Get-DatabaseUrlFromEnv([string] $path) {
  if (-not (Test-Path $path)) { throw "Missing .env: $path" }
  $line = (Get-Content $path -ErrorAction Stop) |
    Where-Object { $_ -match '^\s*DATABASE_URL\s*=' } |
    Select-Object -First 1
  if (-not $line) { throw "Missing DATABASE_URL in .env" }
  $m = [regex]::Match($line, '^\s*DATABASE_URL\s*=\s*"?([^"]+)"?\s*$')
  if (-not $m.Success) { throw "Unable to parse DATABASE_URL line: $line" }
  return $m.Groups[1].Value
}

function Parse-PgUrl([string] $url) {
  $m = [regex]::Match(
    $url,
    '^postgres(ql)?://(?<user>[^:\/]+):(?<pass>[^@\/]+)@(?<host>[^:\/]+):(?<port>\d+)/(?<db>[^\?\s]+)'
  )
  if (-not $m.Success) { throw "Unsupported DATABASE_URL: $url" }
  return @{
    user = $m.Groups["user"].Value
    pass = $m.Groups["pass"].Value
    host = $m.Groups["host"].Value
    port = [int]$m.Groups["port"].Value
    db   = $m.Groups["db"].Value
  }
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

$pgDumpExe = Resolve-PgExe "pg_dump.exe"

$parts = Parse-PgUrl (Get-DatabaseUrlFromEnv $EnvPath)

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$ts = Get-Date -Format "yyyyMMdd-HHmmss"
$outFile = Join-Path $OutDir ("{0}-{1}.dump" -f $parts.db, $ts)

Write-Host "Backing up DB: $($parts.db) @ $($parts.host):$($parts.port) -> $outFile" -ForegroundColor Cyan

# Use env var to avoid showing password in history
$env:PGPASSWORD = $parts.pass
try {
  & $pgDumpExe -h $parts.host -p $parts.port -U $parts.user -d $parts.db -F c -Z 6 -f $outFile
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
} finally {
  Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue
}

Write-Host "Done:" -ForegroundColor Green
Write-Host "  $outFile" -ForegroundColor Green

param(
  [switch]$Force
)

$ErrorActionPreference = "Stop"

$envFile = Join-Path $PSScriptRoot "..\.env"
if (-not (Test-Path $envFile)) {
  throw "Missing .env at $envFile"
}

$dbUrlLine = (
  Get-Content $envFile -Raw
).TrimStart([char]0xFEFF)

$m = [regex]::Match($dbUrlLine, 'DATABASE_URL\s*=\s*(\"[^\"]*\"|''[^'']*''|[^\r\n#]+)')
if (-not $m.Success) {
  throw "Missing DATABASE_URL in .env"
}
$dbUrl = $m.Groups[1].Value.Trim().Trim('"').Trim("'")
if (-not $Force) {
  if ($dbUrl -notmatch 'localhost|127\.0\.0\.1') {
    throw "Refused: DATABASE_URL does not look local. Use -Force to override. DATABASE_URL=$dbUrl"
  }
}

$env:DB_CLEAN_CONFIRM = "YES"
Write-Host "[db-clean-current] DATABASE_URL=$dbUrl"
npm run db:clean-current


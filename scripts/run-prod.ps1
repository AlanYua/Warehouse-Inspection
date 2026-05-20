param(
  [switch] $BuildOnly,
  [switch] $StartOnly
)

$ErrorActionPreference = "Stop"

function Ensure-Command([string] $name) {
  $cmd = Get-Command $name -ErrorAction SilentlyContinue
  if (-not $cmd) { throw "Missing command: $name" }
}

Ensure-Command "node"
Ensure-Command "npm"

if (-not $StartOnly) {
  Write-Host "==> build" -ForegroundColor Cyan
  npm run build
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  if ($BuildOnly) { exit 0 }
}

Write-Host "==> start" -ForegroundColor Cyan
$env:NODE_ENV = "production"
npm run start
exit $LASTEXITCODE


# First push to GitHub (Git for Windows required; create empty repo on GitHub first)
# Run from repo root:
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\push-github.ps1

param(
  [string] $RemoteUrl = "https://github.com/AlanYua/Warehouse-Inspection.git",
  [string] $GitUserName = "AlanYua",
  [string] $GitUserEmail = "AlanYua@users.noreply.github.com"
)

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root
if (-not (Test-Path "package.json")) {
  throw "package.json not found. Script must live in repo /scripts folder."
}

function Resolve-GitExe {
  $cmd = Get-Command git -ErrorAction SilentlyContinue
  if ($cmd -and $cmd.Source) { return $cmd.Source }
  $pf86 = ${env:ProgramFiles(x86)}
  foreach ($p in @(
      "$env:ProgramFiles\Git\cmd\git.exe",
      "$env:ProgramFiles\Git\bin\git.exe",
      "$pf86\Git\cmd\git.exe",
      "$pf86\Git\bin\git.exe"
    )) {
    if ($p -and (Test-Path -LiteralPath $p)) { return $p }
  }
  return $null
}

$gitExe = Resolve-GitExe
if (-not $gitExe) {
  throw "git not found in PATH or under Program Files. Install Git for Windows: https://git-scm.com/download/win then reopen Cursor/terminal (or add Git\cmd to PATH)."
}

Write-Host "Using git: $gitExe"

function Invoke-Git {
  param([Parameter(Mandatory)][string[]] $GitArgs)
  & $gitExe @GitArgs
  if ($LASTEXITCODE -ne 0) {
    throw "git failed (exit $LASTEXITCODE): $gitExe $($GitArgs -join ' ')"
  }
}

if (-not (Test-Path ".git")) {
  Invoke-Git @("init")
}

$prevEa = $ErrorActionPreference
$ErrorActionPreference = "Continue"
$remoteNames = @(& $gitExe remote 2>$null)
$ErrorActionPreference = $prevEa
if ($remoteNames -contains "origin") {
  Invoke-Git @("remote", "set-url", "origin", $RemoteUrl)
} else {
  Invoke-Git @("remote", "add", "origin", $RemoteUrl)
}

Invoke-Git @("branch", "-M", "main")

# Commit identity (this repo only) — avoids "Author identity unknown"
$prevEa = $ErrorActionPreference
$ErrorActionPreference = "Continue"
$haveEmail = & $gitExe config --get user.email 2>$null
$ErrorActionPreference = $prevEa
if (-not $haveEmail) {
  Invoke-Git @("config", "user.name", $GitUserName)
  Invoke-Git @("config", "user.email", $GitUserEmail)
  Write-Host "Set local git user.name=$GitUserName user.email=$GitUserEmail (override: -GitUserName -GitUserEmail)"
}

# Drop huge dirs from index if they were staged (e.g. web/node_modules)
$ErrorActionPreference = "Continue"
foreach ($p in @("_archive/legacy-web/web/node_modules", "_archive/**/node_modules", "node_modules", ".next", ".next-dev")) {
  if (Test-Path -LiteralPath (Join-Path $root $p)) {
    & $gitExe rm -r --cached --ignore-unmatch -- $p 2>$null | Out-Null
  }
}
$ErrorActionPreference = "Stop"

Invoke-Git @("add", "-A")
$st = & $gitExe status --porcelain
if ($LASTEXITCODE -ne 0) { throw "git status failed" }
if ($st) {
  Invoke-Git @("commit", "-m", "chore: initial push for Coolify deploy")
} else {
  Write-Host "Nothing to commit; pushing existing commits."
}

Write-Host "Pushing to $RemoteUrl ..."
Write-Host "If prompted for password, use a GitHub Personal Access Token."
Invoke-Git @("push", "-u", "origin", "main")

Write-Host "Done. Verify files on GitHub."

# Copy .env.local from the main checkout into the current worktree.
#
# Worktrees get every tracked file plus a symlinked node_modules, which is
# enough for `npm test`, `npm run typecheck` and `npm run lint` - none of those
# read .env.local. Only `npm run dev` and `npm run build` need the real
# Supabase and Fitbit values, so this is a deliberate opt-in step rather than
# something that fires automatically: secrets get copied when you ask for them,
# not every time an agent opens a worktree.
#
# ASCII only on purpose - Windows PowerShell 5.1 reads this file as ANSI and
# mangles anything outside it, which is a parse error inside a quoted string.
#
# Usage, from inside the worktree:
#   powershell -ExecutionPolicy Bypass -File scripts/worktree-env.ps1
#   powershell -ExecutionPolicy Bypass -File scripts/worktree-env.ps1 -Force

[CmdletBinding()]
param(
    # Overwrite an existing .env.local in the worktree.
    [switch]$Force
)

$ErrorActionPreference = 'Stop'

# --git-common-dir points at the .git of the main checkout even when we are
# inside a linked worktree, which is how we find the original .env.local.
$commonDir = git rev-parse --path-format=absolute --git-common-dir
if ($LASTEXITCODE -ne 0) { throw 'Not inside a git repository.' }

$mainRepo = (Split-Path $commonDir -Parent) -replace '/', '\'
$here = (git rev-parse --show-toplevel) -replace '/', '\'

if ($mainRepo -eq $here) {
    Write-Host 'Already in the main checkout, nothing to copy.'
    exit 0
}

$source = Join-Path $mainRepo '.env.local'
$target = Join-Path $here '.env.local'

if (-not (Test-Path $source)) {
    throw "No .env.local in the main checkout at $mainRepo. Copy .env.local.example and fill it in first."
}

if ((Test-Path $target) -and -not $Force) {
    throw "$target already exists. Re-run with -Force to overwrite it."
}

Copy-Item $source $target -Force
Write-Host "Copied .env.local into $here"

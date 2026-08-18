param([switch]$SkipPush)

# Publish FEDDA everywhere, in one step.
#
# The mirrors only protect you while they agree. Pushing to GitHub without
# regenerating the one on feddakalkun.com leaves the domain serving an older
# commit - and since the updater tries the domain first, everyone would quietly
# stay behind. That drifted within minutes of the mirror being set up, which is
# why this exists rather than a note telling you to remember.
#
#   .\scripts\sync_mirror.ps1              push, regenerate, upload, verify
#   .\scripts\sync_mirror.ps1 -SkipPush    mirror only, no push

$ErrorActionPreference = "Continue"

$Repo   = Split-Path $PSScriptRoot -Parent
$Bare   = "H:\Fedda-Hub\fedda.git"
$Remote = "fedda@204.168.229.123"
$Site   = "~/feddakalkun.com"

Write-Host ""
Write-Host "  FEDDA mirror sync" -ForegroundColor Cyan
Write-Host ""

Push-Location $Repo

if (-not $SkipPush) {
    Write-Host "  [1/4] Pushing to GitHub..." -ForegroundColor White
    git push origin main 2>$null | Out-Null
    if ($LASTEXITCODE -ne 0) {
        # A rewritten root commit is normal here - the public repo is kept as a
        # single amended commit - so a plain push is refused by design.
        Write-Host "        plain push refused, using --force-with-lease" -ForegroundColor DarkGray
        git push --force-with-lease origin main 2>$null | Out-Null
        if ($LASTEXITCODE -ne 0) { Write-Host "  [ERROR] push failed" -ForegroundColor Red; Pop-Location; exit 1 }
    }
} else {
    Write-Host "  [1/4] Push skipped." -ForegroundColor DarkGray
}

$Head = (git rev-parse --short HEAD)
Write-Host "  [2/4] Rebuilding the bare repo at $Head..." -ForegroundColor White

# file:// rather than a path: a local-path clone copies every object in the
# store, reachable or not. That once made a 4.5 MB tree into a 291 MB upload.
Remove-Item $Bare -Recurse -Force -ErrorAction SilentlyContinue
git clone --bare --quiet "file://$($Repo -replace '\\','/')" $Bare 2>$null | Out-Null
if (-not (Test-Path $Bare)) { Write-Host "  [ERROR] bare clone failed" -ForegroundColor Red; Pop-Location; exit 1 }

Push-Location $Bare
git update-server-info                       # writes info/refs, which dumb HTTP needs
Pop-Location

Write-Host "  [3/4] Uploading to feddakalkun.com..." -ForegroundColor White
# public/, not dist/: vite build empties dist and would take the mirror with it.
tar -cz -C (Split-Path $Bare -Parent) (Split-Path $Bare -Leaf) |
    ssh -o BatchMode=yes $Remote "rm -rf $Site/public/fedda.git && tar -xz -C $Site/public && cp -r $Site/public/fedda.git $Site/dist/fedda.git"
if ($LASTEXITCODE -ne 0) { Write-Host "  [ERROR] upload failed" -ForegroundColor Red; Pop-Location; exit 1 }

Write-Host "  [4/4] Verifying both sources..." -ForegroundColor White
$ok = $true
foreach ($url in @("https://feddakalkun.com/fedda.git",
                   "https://github.com/Feddakalkun/feddahubV3-0_torch2.10.0-cu130.git")) {
    $refs = (git ls-remote $url main 2>$null)
    $sha  = if ($refs) { ($refs -split "\s+")[0].Substring(0, 7) } else { "no answer" }
    $same = ($sha -eq $Head)
    if (-not $same) { $ok = $false }
    Write-Host ("        {0,-62} {1} {2}" -f $url, $sha, $(if ($same) { "OK" } else { "MISMATCH" })) `
        -ForegroundColor $(if ($same) { "Green" } else { "Red" })
}

Write-Host ""
if ($ok) { Write-Host "  Both sources serve $Head." -ForegroundColor Green }
else     { Write-Host "  Sources disagree - see above." -ForegroundColor Red }
Write-Host ""
Pop-Location

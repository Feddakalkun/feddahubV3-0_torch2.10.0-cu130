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
$Bare   = "H:\Fedda-Hub\Fedda-HubV3\fedda.git"
$Remote = "fedda@204.168.229.123"
$Site   = "~/feddakalkun.com"

Write-Host ""
Write-Host "  FEDDA mirror sync" -ForegroundColor Cyan
Write-Host ""

Push-Location $Repo

if (-not $SkipPush) {
    Write-Host "  [1/5] Pushing to GitHub..." -ForegroundColor White
    git push origin main 2>$null | Out-Null
    if ($LASTEXITCODE -ne 0) {
        # A rewritten root commit is normal here - the public repo is kept as a
        # single amended commit - so a plain push is refused by design.
        Write-Host "        plain push refused, using --force-with-lease" -ForegroundColor DarkGray
        git push --force-with-lease origin main 2>$null | Out-Null
        if ($LASTEXITCODE -ne 0) { Write-Host "  [ERROR] push failed" -ForegroundColor Red; Pop-Location; exit 1 }
    }
} else {
    Write-Host "  [1/5] Push skipped." -ForegroundColor DarkGray
}

$Head = (git rev-parse --short HEAD)
Write-Host "  [2/5] Rebuilding the bare repo at $Head..." -ForegroundColor White

# file:// rather than a path: a local-path clone copies every object in the
# store, reachable or not. That once made a 4.5 MB tree into a 291 MB upload.
Remove-Item $Bare -Recurse -Force -ErrorAction SilentlyContinue
git clone --bare --quiet "file://$($Repo -replace '\\','/')" $Bare 2>$null | Out-Null
if (-not (Test-Path $Bare)) { Write-Host "  [ERROR] bare clone failed" -ForegroundColor Red; Pop-Location; exit 1 }

Push-Location $Bare
git update-server-info                       # writes info/refs, which dumb HTTP needs
Pop-Location

Write-Host "  [3/5] Uploading the repo..." -ForegroundColor White
# public/, not dist/: vite build empties dist and would take the mirror with it.
#
# Through cmd, not a PowerShell pipeline. PowerShell treats a pipe as text and
# re-encodes it, so the tarball arrives corrupt - "gzip: stdin: not in gzip
# format". cmd passes the bytes through untouched.
$parent = Split-Path $Bare -Parent
$leaf   = Split-Path $Bare -Leaf
# dist is removed before the copy. `cp -r src dst` puts src *inside* dst when
# dst already exists, which left dist serving the old commit with a nested
# copy of the new one inside it.
$remoteCmd = "rm -rf $Site/public/fedda.git $Site/dist/fedda.git && tar -xz -C $Site/public && cp -r $Site/public/fedda.git $Site/dist/fedda.git"
cmd /c "tar -cz -C ""$parent"" ""$leaf"" | ssh -o BatchMode=yes $Remote ""$remoteCmd"""
if ($LASTEXITCODE -ne 0) { Write-Host "  [ERROR] upload failed" -ForegroundColor Red; Pop-Location; exit 1 }

# The installer is not in the bare repo - it is a file people download before
# they have a repo at all, so it is served from the site root and was uploaded
# by hand once. That meant a fix to the .bat could sit in git indefinitely while
# the domain kept handing out the old one. Both files go up with the rest now.
#
# installer_rev.txt is what a running installer checks itself against, so it is
# written last: if the .bat upload fails, the rev on the site still describes
# the .bat on the site, and nobody is told to re-download something unchanged.
Write-Host "  [4/5] Uploading the installer..." -ForegroundColor White
$bat = Join-Path $Repo "installer\FEDDA_Hub_v3.0_Installer.bat"
$rev = Join-Path $Repo "installer\installer_rev.txt"
$batRev = (Select-String -Path $bat -Pattern 'INSTALLER_REV=([0-9.\-]+)').Matches[0].Groups[1].Value
$fileRev = (Get-Content $rev -Raw).Trim()
if ($batRev -ne $fileRev) {
    Write-Host "  [ERROR] rev mismatch: .bat says $batRev, installer_rev.txt says $fileRev" -ForegroundColor Red
    Write-Host "          Bump both together - the installer checks one against the other." -ForegroundColor Red
    Pop-Location; exit 1
}
foreach ($f in @($bat, $rev)) {
    $n = Split-Path $f -Leaf
    # $($Remote): rather than $Remote: - a colon straight after a variable name
    # is a drive qualifier to PowerShell, and it would send the file nowhere.
    $dest = "$($Remote):$Site/public/$n"
    & scp -q -o BatchMode=yes $f $dest
    if ($LASTEXITCODE -ne 0) { Write-Host "  [ERROR] upload of $n failed" -ForegroundColor Red; Pop-Location; exit 1 }
    & ssh -o BatchMode=yes $Remote "cp $Site/public/$n $Site/dist/$n"
    if ($LASTEXITCODE -ne 0) { Write-Host "  [ERROR] copy of $n into dist failed" -ForegroundColor Red; Pop-Location; exit 1 }
}
Write-Host "        rev $batRev" -ForegroundColor DarkGray

Write-Host "  [5/5] Verifying both sources..." -ForegroundColor White
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

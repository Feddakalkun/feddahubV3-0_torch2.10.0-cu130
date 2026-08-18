@echo off
setlocal EnableDelayedExpansion
title FEDDA - move an existing install to v3.0

:: Point an existing FEDDA install at the v3.0 repository.
::
:: Installs made before v3.0 clone from Fedda_hub_v2.0. That repository is
:: going away, and their update.bat cannot move itself: the old guard refuses
:: an update when the histories differ, which is exactly what a new repository
:: looks like. So the move is done here, once, by hand.
::
:: Models, outputs and settings are untouched - only the code is repointed.

set "NEW_URL=https://github.com/Feddakalkun/feddahubV3-0_torch2.10.0-cu130.git"
set "ALT_URL=https://feddakalkun.com/fedda.git"

echo.
echo   ============================================================
echo      FEDDA  -  move this install to v3.0
echo   ============================================================
echo.

:: Run from the install root (the folder holding app\), or from inside app\.
if exist "%~dp0app\.git" (
    set "APP_DIR=%~dp0app"
) else if exist "%~dp0.git" (
    set "APP_DIR=%~dp0."
) else (
    echo   [ERROR] No FEDDA install found here.
    echo           Put this file next to your run.bat and try again.
    echo.
    pause
    exit /b 1
)

pushd "!APP_DIR!"

for /f "delims=" %%R in ('git remote get-url origin 2^>nul') do set "OLD_URL=%%R"
echo   Currently pointing at:
echo     !OLD_URL!
echo.

echo   [1/3] Repointing to v3.0...
git remote set-url origin "%NEW_URL%" >nul 2>&1

echo   [2/3] Fetching...
git fetch origin main >nul 2>&1
if errorlevel 1 (
    echo         GitHub did not answer - trying feddakalkun.com...
    git remote set-url origin "%ALT_URL%" >nul 2>&1
    git fetch origin main >nul 2>&1
    if errorlevel 1 (
        echo   [ERROR] Neither source answered. Check your connection.
        popd
        pause
        exit /b 1
    )
)

:: reset --hard, not merge: the two repositories share no history, so there is
:: nothing to merge onto. Local edits to FEDDA's own files are replaced;
:: models, outputs and config\runtime_settings.json are untracked and stay.
echo   [3/3] Updating the code...
git reset --hard origin/main >nul 2>&1
if errorlevel 1 (
    echo   [ERROR] Could not update. Nothing was changed.
    popd
    pause
    exit /b 1
)

echo.
echo   ------------------------------------------------------------
echo    Done. This install now follows v3.0.
echo.
echo    Run update.bat next - it will move PyTorch to CUDA 13.0 and
echo    ComfyUI to v0.33.1. That part takes a few minutes.
echo   ------------------------------------------------------------
echo.
popd
pause

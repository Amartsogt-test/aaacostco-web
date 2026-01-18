@echo off
echo ============================================
echo   ULTIMATE GITHUB FIX (RESETTING TO SERVER STATE)
echo ============================================

echo [1/5] Fetching latest server info...
git fetch origin

echo [2/5] Resetting all local history to match server (Dropping bad history)...
git reset --mixed origin/master

echo [3/5] Re-staging files (Ignoring secrets)...
git add .

echo [4/5] Committing Clean Version...
git commit -m "Update daily scripts with AI pipeline (Clean Squash)"

echo [5/5] Pushing to GitHub...
git push

echo.
echo ============================================
echo   FIX COMPLETE!
echo ============================================
pause

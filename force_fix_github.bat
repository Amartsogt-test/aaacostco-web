@echo off
echo ============================================
echo   FORCE CLEANING GITHUB HISTORY
echo ============================================

echo [1/5] Undoing last 5 failed update attempts (Keeping your files safe)...
git reset --mixed HEAD~5

echo [2/5] Explicitly removing secret file from tracking...
git rm --cached functions/service-account.json
git rm --cached functions\service-account.json

echo [3/5] Re-adding ONLY safe files...
git add .

echo [4/5] Committing safe version...
git commit -m "Update daily scripts with AI pipeline (Clean Push)"

echo [5/5] Pushing to GitHub...
git push

echo.
echo ============================================
echo   HOPEFULLY FIXED NOW!
echo ============================================
pause

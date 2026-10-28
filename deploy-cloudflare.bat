@echo off
echo ==================================================
echo CLOUDFLARE PAGES DEPLOYMENT AUTOMATION
echo ==================================================
echo.

echo 1. Building frontend...
call npm run build
if %errorlevel% neq 0 (
    echo Error: Build failed!
    pause
    exit /b %errorlevel%
)
echo.

echo 2. Uploading to Cloudflare Pages...
cd dist
call npx wrangler pages deploy . --project-name costco-fe --branch master
cd ..
echo.

echo ==================================================
echo Success! Deployed to Cloudflare Pages.
echo ==================================================

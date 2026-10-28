@echo off
cd /d "%~dp0"
echo ============================================================
echo   AAACOSTCO - KOREA OFFICE PC SETUP
echo   Working directory: %~dp0
echo ============================================================
echo.

echo [1/4] Installing root Node.js packages (npm install)...
call npm install
if %errorlevel% neq 0 (
    echo [ERROR] npm install failed. Please check that Node.js is installed!
    pause
    exit /b 1
)

echo.
echo [2/4] Installing functions / scraper helper packages...
if exist "functions\package.json" (
    pushd functions
    call npm install
    popd
)

echo.
echo [3/4] Installing Playwright Chromium browser (for Costco.co.kr scraper)...
call npx playwright install chromium

echo.
echo [4/4] Setting up Python virtual environment (scraper\.venv)...
set "PY_CMD="
where python >nul 2>&1
if %errorlevel% equ 0 set "PY_CMD=python"
if "%PY_CMD%"=="" (
    where py >nul 2>&1
    if %errorlevel% equ 0 set "PY_CMD=py -3"
)
if "%PY_CMD%"=="" (
    if exist "%LOCALAPPDATA%\Programs\Python\Python311\python.exe" (
        set "PY_CMD="%LOCALAPPDATA%\Programs\Python\Python311\python.exe""
    ) else if exist "%WINDIR%\py.exe" (
        set "PY_CMD="%WINDIR%\py.exe" -3"
    )
)

if not "%PY_CMD%"=="" (
    pushd scraper
    if not exist ".venv\Scripts\python.exe" (
        %PY_CMD% -m venv .venv
    )
    call .venv\Scripts\activate.bat
    python -m pip install -r requirements.txt
    python -m playwright install chromium
    popd
) else (
    echo [WARNING] Python not found in PATH. Only Node.js scripts will run.
)

echo.
echo ============================================================
echo   SETUP COMPLETED SUCCESSFULLY!
echo   - Start local dev server:        npm run dev
echo   - Deploy to Cloudflare Pages:    deploy-cloudflare.bat
echo   - Refresh Costco member cookie:  start-costco-browser.bat
echo   - Register weekly task (Admin):  setup-weekly-task.bat
echo ============================================================
pause

@echo off
cd /d "%~dp0"
echo Starting Bank Rates Update...
node scripts/core/fetch-bank-rates.js
echo Done.
exit

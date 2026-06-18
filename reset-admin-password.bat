@echo off
REM ============================================================
REM  ADMIN (00880088) NUUTS UG SHINECHLEH
REM  Nuuts ugiig ene file dotor BICHEHGUI - ajillah ued tani
REM  asuuna. Nuuts ug hen ch haragdahgui (hidden input) bolon
REM  file/tuuhend hadgalagdahgui.
REM  Shaardlaga: functions\service-account.json baih.
REM ============================================================
cd /d E:\aaacostco

echo.
echo Admin (00880088@sms.costco.mn) -iin shine nuuts ug oruulna uu.
echo (Hamgiin baga ni 5 temdegt. Bichihed haragdahgui.)
echo.

for /f "delims=" %%p in ('powershell -NoProfile -Command "$s=Read-Host -AsSecureString 'Shine nuuts ug'; [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($s))"') do set "ADMINPASS=%%p"

if "%ADMINPASS%"=="" (
    echo Nuuts ug hooson baina. Tsutslalaa.
    pause
    exit /b 1
)

node scripts\grant-admin.cjs 00880088@sms.costco.mn "%ADMINPASS%" 00880088

REM Garaltend nuuts ug uldehguin tuld huvisagchiig tseverlene.
set "ADMINPASS="

echo.
echo Duuslaa. Site deer 00880088 bicheed, tavisan nuuts ugeeree neverne uu.
pause

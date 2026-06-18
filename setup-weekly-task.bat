@echo off
REM ============================================================
REM  NEG UDAAGIIN TOHIRGOO (Run as administrator):
REM  run-weekly-maintenance.bat -g 7 honog tutam (Nyam garig 09:00)
REM  Windows Task Scheduler-t burtgene.
REM ============================================================
set TASKNAME=Aaacostco Weekly Maintenance
set SCRIPT=E:\aaacostco\run-weekly-maintenance.bat

echo Task burtgej baina: "%TASKNAME%"
echo Script: %SCRIPT%
echo Tsag:   7 honog tutam, Nyam garig 09:00
echo.

schtasks /create /tn "%TASKNAME%" /tr "\"%SCRIPT%\"" /sc weekly /d SUN /st 09:00 /f

if %errorlevel%==0 (
    echo.
    echo AMJILTTAI! 7 honog tutam Nyam garig 09:00-d ajillana.
) else (
    echo.
    echo ALDAA. "Run as administrator" gej dahin oroldono uu.
)
echo.
pause

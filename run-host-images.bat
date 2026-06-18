@echo off
REM Re-run ONLY the image-hosting step (retries un-hosted / failed images).
REM Idempotent: already-hosted products are skipped; only failed/new ones retry.
cd /d E:\aaacostco
if not exist logs mkdir logs
echo.                                                    >> logs\host-images.log
echo ===== host-images retry: %date% %time% =====        >> logs\host-images.log
call npm run core:host-images                            >> logs\host-images.log 2>&1
echo ----- host-images done: %date% %time% -----          >> logs\host-images.log

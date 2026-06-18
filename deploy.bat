@echo off
cd /d E:\aaacostco
echo ==================================================
echo FIREBASE DEPLOYMENT AUTOMATION
echo ==================================================
echo.
echo 1. Эхлээд таны браузер дээр Google нэвтрэх цонх нээгдэнэ. Тэнд нэвтэрнэ үү.
echo 2. Нэвтэрч дууссаны дараа энэ цонх автоматаар үргэлжлүүлэн deploy хийх болно.
echo.
echo ==================================================
call npx firebase login
echo.
echo Deploy хийж эхэлж байна...
call npx firebase deploy
echo.
echo Баяр хүргэе! Deploy амжилттай дууслаа.
pause

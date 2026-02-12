@echo off
@chcp 65001 >nul
echo ============================================
echo   COSTCO БҮРЭН ЗАСВАР ҮЙЛЧИЛГЭЭНИЙ ПАЙПЛАЙН (АВТОМАТ)
echo   Тооцоолсон хугацаа: Хэдэн цаг
echo ============================================
echo.
echo Энэхүү скрипт нь дараах дарааллаар ажиллана:
echo 1. Орчуулгын алдааг засах
echo 2. Бүтээгдэхүүний тайлбар үүсгэх
echo 3. Жингийн алдааг засах
echo 4. Засагдаагүй жингүүдийг дахин оролдох
echo 5. Эцсийн тайлан үүсгэх
echo.

echo.
echo [1/5] Орчуулга засаж байна (fix-translations.cjs)...
echo ----------------------------------------
call node scripts/fix-translations.cjs
echo.

echo.
echo [2/5] Тайлбар үүсгэж байна (generate-descriptions.cjs)...
echo ----------------------------------------
call node scripts/generate-descriptions.cjs
echo.

echo.
echo [3/5] Жин засаж байна (fix-weights.cjs)...
echo ----------------------------------------
call node scripts/fix-weights.cjs
echo.

echo.
echo [4/5] Засагдаагүй жингүүдийг дахин оролдож байна (retry-unfixable.cjs)...
echo ----------------------------------------
call node scripts/retry-unfixable.cjs
echo.

echo.
echo [5/5] Эцсийн тайлан үүсгэж байна (generate-maintenance-report.cjs)...
echo ----------------------------------------
call node scripts/generate-maintenance-report.cjs
echo.

echo.
echo ============================================
echo   БҮХ ДААЛГАВАР ДУУСЛАА!
echo   Үр дүнг maintenance_report.md -ээс харна уу.
echo ============================================
REM pause - removed for automation

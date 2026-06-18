# AAA Costco SMS Gateway

60649999 дугаар руу ирсэн SMS мессежийг Firebase Cloud Function руу дамжуулах хөнгөн Андройд апп.

## Тохиргоо

1. **SmsReceiver.java** файлд:
   - `WEBHOOK_URL` — Deploy хийсний дараа Firebase-аас өгсөн URL-аар солих
   - `WEBHOOK_SECRET` — functions/.env дотор байгаа `SMS_WEBHOOK_SECRET`-тай ижил байх

2. **Build хийх:**
   ```bash
   cd sms-gateway
   ./gradlew assembleDebug
   ```

3. **60649999 дугаартай сим карт** суулгасан Андройд утас дээр суулгах:
   ```bash
   adb install app/build/outputs/apk/debug/app-debug.apk
   ```

4. **Эрх олгох:** Апп-ыг нээхэд SMS эрх асуух болно → "Зөвшөөрөх" дарна.

5. **Хэвийн ажиллагаа:** Апп нэг удаа нээгдэхэд Foreground Service эхлэх бөгөөд утас унтрахгүй л бол ажиллаж байх болно.

## Ажиллах зарчим

1. Хэрэглэгч вэбсайтаас 3 оронтой код авна (жнь: 472)
2. Хэрэглэгч өөрийн утаснаас `472` гэж 60649999 руу SMS илгээнэ
3. Энэ апп тухайн SMS-ийг барьж аваад Firebase руу POST хийнэ
4. Firebase сервер кодыг шалгаад хэрэглэгчийг баталгаажуулна

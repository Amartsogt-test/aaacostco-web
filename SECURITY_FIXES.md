# Аюулгүй байдлын засварууд — хийсэн зүйл ба таны хийх алхамууд
**Огноо:** 2026-06-12

Энэ баримт нь кодод хийгдсэн засваруудыг болон **таны гараар хийх ёстой алхамуудыг** (нэвтрэлтийн мэдээлэл солих, deploy, git цэвэрлэх) жагсаав.

---

## A. Кодод хийгдсэн засварууд (хийгдсэн ✅)

| # | Файл | Засвар |
|---|------|--------|
| 1 | `functions/index.js` | **SMS админ арын хаалга устгасан** (`verified: phone === "00880088"` → `false`). |
| 2 | `functions/index.js` | SMS код **3 → 6 оронтой** (`crypto.randomInt`). |
| 3 | `functions/index.js` | `smsWebhook` **fail-closed** + constant-time secret шалгалт (`SMS_WEBHOOK_SECRET` заавал). |
| 4 | `functions/index.js` | `verifySmsCode`-ийн shadow password **санамсаргүй** (`crypto.randomBytes`). |
| 5 | `functions/index.js` | `wireCallback` **fail-closed** + `crypto.timingSafeEqual` (`WIRE_WEBHOOK_SECRET` заавал). |
| 6 | `functions/index.js` | `aiProxy`-д **нэвтрэлт заавал** (`request.auth` шалгана). |
| 7 | `functions/index.js` | `createOrder`-т **үнийн аудит**: бараа бүрийн серверийн үнэ, тэмдэглэгээ (`priceAudit.flagged`). |
| 8 | `firestore.rules` | **Email-д суурилсан админ дүрэм хассан** (`token.email == '00880088@...'`). Зөвхөн custom claim + user-doc. |
| 9 | `storage.rules` | `chat-attachments` зөвхөн зураг/PDF, устгал админд. |
| 10 | `src/pages/Login.jsx` | Hardcoded-password backdoor → **аюулгүй админ нэвтрэлт** (нууц үг код дотор байхгүй). |
| 11 | `src/services/aiService.js`, `src/pages/PriceTagScanner.jsx` | `aiProxy` дуудахын өмнө `ensureSignedIn()`. |
| 12 | `android/app/build.gradle` | Signing нууц үг **env/keystore.properties-ээс** (hardcoded `"password"` арилгасан). |
| 13 | `scripts/grant-admin.cjs` | **Шинэ:** аюулгүй админ эрх олгох скрипт (custom claim + хүчтэй нууц үг). |
| 14 | `.gitignore` | Нууц файлуудыг нэмсэн. |

---

## B. Таны гараар хийх ёстой алхамууд (ЗААВАЛ)

### 1. Админ нэвтрэлтээ тохируулах (SMS шаардахгүй) — эхэнд хий
Локал дээрээ project root дотор:
```bash
node scripts/grant-admin.cjs 00880088@sms.costco.mn 'ӨӨРИЙН-УРТ-ХҮЧТЭЙ-НУУЦ-ҮГ' 00880088
```
Энэ нь админ акаунтад хүчтэй нууц үг тавьж, `isAdmin` custom claim олгоно.
Дараа нь сайт дээр `00880088` гэж бичээд **тэр нууц үгээ** оруулж нэвтэрнэ. SMS огт хэрэггүй.
> `functions/service-account.json` танай компьютер дээр байгаа тул скрипт шууд ажиллана.

### 2. Задарсан нэвтрэлтийн мэдээллийг ЦУЦЛАХ/СОЛИХ (бүгд эвдэрсэн гэж үз)
- **Facebook Page token** (`page_access_token.txt`) — Facebook дээр шинээр үүсгэ.
- **Gemini API key** (`scraper/.env`) — Google AI Studio дээр хуучныг устгаж шинийг авах.
- **Costco акаунт нууц үг** (`scraper/.env`) — солих.
- **Android keystore** — задарсан тул **шинэ keystore үүсгэх**:
  ```bash
  keytool -genkey -v -keystore release-key-NEW.keystore -alias costco-client -keyalg RSA -keysize 2048 -validity 10000
  ```
  Дараа нь `android/keystore.properties` (git-д орохгүй) үүсгэж:
  ```
  storeFile=release-key-NEW.keystore
  storePassword=ШИНЭ-ХҮЧТЭЙ-НУУЦ-ҮГ
  keyAlias=costco-client
  keyPassword=ШИНЭ-ХҮЧТЭЙ-НУУЦ-ҮГ
  ```

### 3. Webhook secret-уудыг тохируулах (одоо ЗААВАЛ)
```bash
firebase functions:secrets:set SMS_WEBHOOK_SECRET
firebase functions:secrets:set WIRE_WEBHOOK_SECRET
```
SMS gateway болон Wire.mn dashboard дээрх secret-тэй ижил утга тавина.
> ⚠️ Эдгээрийг тохируулахгүй бол webhook-ууд бүх хүсэлтийг татгалзана (зориуд аюулгүй болгосон).

### 4. Git-ээс нууц файлуудыг устгах (локал дээрээ)
```bash
git rm --cached page_access_token.txt scraper/.env scraper/state.json state.json android/app/release-key.keystore
git commit -m "Remove tracked secrets; rotate credentials"
```
Дараа нь **git түүхээ цэвэрлэх** (хуучин commit-уудад секрет үлдсэн):
```bash
# git-filter-repo суулгасан байх шаардлагатай
git filter-repo --invert-paths --path page_access_token.txt --path scraper/.env --path scraper/state.json --path state.json --path android/app/release-key.keystore
git push --force --all
```
> Энэ нь түүхийг дахин бичих тул багийн бусад гишүүдтэй тохиролц.

### 5. Хамаарлын эмзэг байдал засах
```bash
npm audit fix
cd functions && npm audit fix && cd ..
```

### 6. Build шалгаад deploy хийх
```bash
npm run build
firebase deploy --only functions,firestore:rules,storage
```
> Хуучин `verifyAdminLogin` функц байвал устга:
> `firebase functions:delete verifyAdminLogin --region us-central1`

### 7. Firebase Console тохиргоо
- **Authentication → Sign-in method → Email/Password** идэвхтэй байг (админ нэвтрэлт үүнийг ашиглана; shadow акаунтууд одоо санамсаргүй нууц үгтэй тул аюулгүй).
- **Anonymous** provider идэвхтэй байг (зочдын AI хайлт/чат үүнийг ашиглана).

---

## C. Sandbox дээр шалгаж чадаагүй зүйл (та локал дээрээ шалгана уу)
- `npm run build` — энэ орчны mount дээр esbuild хоёртын файл ажиллахгүй (segfault) тул build-г бүрэн ажиллуулж чадсангүй. Кодын синтаксыг гараар болон `node --check`-ээр (functions, скрипт) баталгаажуулсан. Та локал дээрээ `npm run build` ажиллуулж эцсийн баталгаа аваарай.
- `git rm --cached` болон `npm audit fix` — mount дээрх git/npm бичилт найдваргүй тул дээрх B хэсэгт командыг өгсөн, локал дээрээ ажиллуулна уу.

---

## D. Үлдсэн зөвлөмж (заавал биш, доод эрсдэл)
- `createOrder`-ийн нийт дүнг серверт **бүрэн дахин тооцоолох** (хүргэлт/ханш/markup томьёог backend рүү зөөх). Одоо зөвхөн аудит флаг тавьдаг.
- `orders` дүрмийн `allow create: if !isAuth() ...` нь нэвтрээгүй хэрэглэгчид дурын захиалга үүсгэх боломж өгдөг (spam). Бүх захиалга `createOrder` функцээр дамждаг тул клиент талын create-г `if false` болгож болно (зочдын checkout тестлэсний дараа).
- `generate_base64_secret.js`, `test-keys.js` зэрэг debug файлуудыг production-оос цэвэрлэх.

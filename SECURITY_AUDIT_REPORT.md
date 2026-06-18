# Аюулгүй байдлын шалгалтын тайлан — AAA Costco
**Огноо:** 2026-06-12 · **Хамрах хүрээ:** Firebase + React (Vite) + Cloud Functions + Android (Capacitor) + Scraper

---

## Хамгийн ноцтой 3 цоорхой (ЯАРАЛТАЙ засах)

### 🔴 1. SMS нэвтрэлтэд админ нэвтрэх "арын хаалга" (CRITICAL)
`functions/index.js:1492` дотор:
```js
verified: phone === "00880088",
```
`requestSmsCode` функц `00880088` дугаараар код хүсэхэд кодыг **шууд баталгаажуулсан** (`verified: true`) болгож үүсгэдэг. Firestore дүрэмд (`firestore.rules`):
```js
request.auth.token.email == '00880088@sms.costco.mn'  // → isAdmin
```
гэж байгаа тул дараах гинжин урвал үүснэ:

1. Хэн ч (нэвтрээгүй) `requestSmsCode({phone:"00880088"})` дуудна
2. `verifySmsCode({sessionId})` → `00880088@sms.costco.mn` хэрэглэгчийг үүсгэж/олж custom token буцаана
3. Энэ token-ы `email` талбар нь админ имэйлтэй тэнцэх тул → **бүрэн админ эрх**

**Үр дагавар:** Хэн ч ямар ч нэвтрэлтгүйгээр админ болж, бараа/үнэ/захиалга/хэрэглэгчийн мэдээллийг бүхэлд нь удирдах боломжтой.
**Засвар:** `verified: phone === "00880088"` мөрийг устгах. Тестийн дугаарыг код дотор биш зөвхөн emulator/env-ээр тусгаарлах. Админыг зөвхөн `setCustomUserClaims`-ээр олгож, имэйлд суурилсан админ шалгалтыг (`token.email == ...`) firestore.rules-ээс хасах.

---

### 🔴 2. Эх кодод нийтлэгдсэн нууц түлхүүр, нэвтрэх мэдээлэл (CRITICAL)
Git-д track хийгдсэн, түүхэнд үлдсэн нууц файлууд:

| Файл | Юу задарсан |
|------|-------------|
| `page_access_token.txt` | Facebook Page Access token (`EAAa7k...`) |
| `scraper/.env` | Costco акаунт `gege841@naver.com` / `Bilgee9911`, **Gemini API key** `AIzaSyCvw7...` |
| `android/app/release-key.keystore` | Android **release гарын үсгийн keystore** + `build.gradle`-д нууц үг `"password"` |
| `state.json`, `scraper/state.json` | Costco session cookie-ууд |

`android/app/build.gradle:22-24`:
```
storePassword "password"
keyPassword   "password"
```

**Үр дагавар:** Keystore + нууц үг задарсан тул **халдагч таны нэрийн дор хортой APK гарын үсэглэх** боломжтой. Facebook token, Costco акаунт, Gemini key бүгд ашиглагдах боломжтой.
**Засвар:**
1. Бүх дээрх түлхүүр/нууц үг/token-г **нэн даруй цуцалж шинэчлэх** (Facebook token, Gemini key, Costco нууц үг).
2. **Шинэ keystore үүсгэх** (хуучин нь эргэлт буцалтгүй задарсан), хүчтэй нууц үг `gradle.properties`/env-д хадгалах.
3. Эдгээр файлыг git-ээс устгах: `git rm --cached ...`, дараа нь **git түүхээ цэвэрлэх** (`git filter-repo` эсвэл BFG). `.gitignore`-д нэмэх.

---

### 🔴 3. SMS баталгаажуулалтыг бүрэн тойрох боломж (CRITICAL/HIGH)
Хэд хэдэн сул тал нэгдэж бүрэн тойрох боломж үүсгэж байна:

- **Код хэрэглэгчид буцаагддаг** — `requestSmsCode` хариунд `code`-г шууд буцаана (`functions/index.js:1499`).
- **Webhook "fail-open"** — `smsWebhook`: `if (webhookSecret && secret !== ...)`. Хэрэв `SMS_WEBHOOK_SECRET` тохируулагдаагүй бол **secret шалгахгүй**, хэн ч POST хийж дурын session-г баталгаажуулна.
- **3 оронтой код** — `Math.floor(Math.random()*900)+100` = ердөө 900 хувилбар (brute force амархан).
- **Таамаглах боломжтой нууц үг** — `SMS$${phone}$CostcoVerified2026` (`index.js:1597`). Хэрэв Firebase Auth-д Email/Password provider идэвхтэй бол халдагч дурын дугаарын `{phone}@sms.costco.mn` / `SMS${phone}$CostcoVerified2026`-аар **шууд нэвтэрнэ** — бүх SMS урсгалыг тойроод.

**Үр дагавар:** Дурын хэрэглэгчийн (мөн админы) акаунтыг эзэмших.
**Засвар:** `SMS_WEBHOOK_SECRET`-г заавал шаардах (fail-closed). 6 оронтой код ашиглах + оролдлогын тоо хязгаарлах. Shadow password-г санамсаргүй (random) болгож firestore-д хадгалах эсвэл зөвхөн custom token ашиглаж Email/Password provider-г **унтраах**.

---

## Дунд зэргийн эрсдэл

### 🟠 4. `aiProxy` функцэд нэвтрэлтийн шалгалт байхгүй
`functions/index.js:378` — `aiProxy` ямар ч `request.auth` шалгалтгүй. Хэн ч Gemini API-г таны төслийн төлбөрөөр чөлөөтэй дуудах → **зардал шавхах / квот дуусгах** дайралт.
**Засвар:** `if (!request.auth) throw ...` нэмэх, дуудлагын тоог хязгаарлах (rate limit).

### 🟠 5. Захиалгын үнэд клиентийг итгэдэг (price tampering)
`createOrder` (`index.js:713`) нь `order.total`, `items[].price`-г клиентээс шууд авдаг, серверт дахин тооцдоггүй. Халдагч `total: 0` гэх мэт захиалга үүсгэж болно.
**Засвар:** Үнийг серверт `products` коллекшнаас дахин тооцоолох. (Одоогоор гар аргаар төлбөр шалгадаг тул админ барьж авах боломжтой ч систем дээр итгэх ёсгүй.)

### 🟠 6. Wire төлбөрийн webhook мөн "fail-open"
`wireCallback` (`index.js:999`) — `if (secret) {...}`. `WIRE_WEBHOOK_SECRET` тохируулагдаагүй бол гарын үсэггүй хүсэлт хүлээн авна → **хуурамч төлбөр баталгаажуулах**. Мөн `expected !== v1` нь constant-time биш (timing).
**Засвар:** Secret-г заавал шаардах. `crypto.timingSafeEqual` ашиглах.

### 🟠 7. Эмзэг хамаарлууд (npm audit)
- **Root:** 23 эмзэг байдал (12 high) — `vite`, `tar`, `yaml`. `npm audit fix`-ээр засагдана.
- **functions:** 18 (2 critical) — `protobufjs`, `fast-xml-parser` (ихэнх нь firebase-admin-ийн transitive). `npm audit fix` + firebase-admin шинэчлэх.

---

## Бага эрсдэл / эмх цэгцийн асуудал

- **Storage дүрэм:** `chat-attachments` нь зөвхөн хэмжээ (10MB) шалгана, **content-type шалгахгүй** — дурын файл (.exe г.м) байршуулж болно. Зураг/баримтаар хязгаарлах.
- **Coupon TOCTOU:** `validateCoupon`/`createOrder` хоорондын зайд купоны хэрэглээг зэрэг олон удаа ашиглаж болзошгүй (transaction ашиглах).
- **`generate_base64_secret.js`** нь `functions/service-account.json`-г base64 болгодог — энэ файл өөрөө track хийгдээгүй нь сайн хэрэг, гэхдээ workflow болгоомжтой.
- **Хэрэглэгдээгүй debug/туршилтын файлууд** олон (`test-keys.js`, `diagnostic.cjs`, `debug-failure.png` г.м) — production repo-оос цэвэрлэх.
- ProductDetail дахь `dangerouslySetInnerHTML` нь **DOMPurify-аар цэвэрлэгдсэн** (✅ зөв хийгдсэн).

---

## Эхэнд хийх алхамууд (priority)
1. **SMS `00880088` арын хаалгыг устгах** (#1) — нэн даруй.
2. **Бүх задарсан түлхүүр/keystore/нууц үгийг цуцалж, шинэчилж, git түүхээс устгах** (#2).
3. **`SMS_WEBHOOK_SECRET` + `WIRE_WEBHOOK_SECRET`-г заавал шаардах** (fail-closed) (#3, #6).
4. **`aiProxy`-д auth нэмэх** (#4).
5. **`npm audit fix` ажиллуулах** (#7).
6. Захиалгын үнийг серверт баталгаажуулах (#5).

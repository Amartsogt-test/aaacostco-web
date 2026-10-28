# 🇰🇷 Солонгос дахь оффисын компьютерт `aaacostco` төслийг суулгах болон ажиллуулах заавар

Энэхүү багцад `aaacostco` (costco.mn) төслийн **Cloudflare (Pages + Workers + D1)** болон **Scraper / Sync** скриптүүд, бүх тохиргооны нууц файлууд (`.env.local`, `scraper/.env`, `functions/service-account.json`, `cloudflare/seed/*.sql`) бүрэн багтсан болно.

---

## 1. Урьдчилсан шаардлага (Солонгос дахь компьютер дээр суулгах програмууд)

Шинэ компьютер дээр дараах програмууд суусан байх шаардлагатай:
1. **Node.js (v20 буюу LTS хувилбар)** — [https://nodejs.org/](https://nodejs.org/)
2. **Git for Windows** — [https://git-scm.com/](https://git-scm.com/)
3. **Google Chrome** — Costco.co.kr scraper болон cookie шинэчлэхэд ашиглагдана
4. **Python 3.11+** *(сонголтоор, `scraper/` доторх Python скриптүүдийг ашиглах бол)* — [https://www.python.org/](https://www.python.org/) (Суулгахдаа **"Add Python to PATH"** сонголтыг заавал чагтална)

---

## 2. Төслийг задлах ба анхны суулгалт хийх

1. Бэлтгэсэн `aaacostco-korea-transfer.zip` файлыг Солонгос дахь компьютерийн дурын хавтаст (жишээ нь `D:\Apps\aaacostco` эсвэл `C:\Apps\aaacostco`) задална.
   - *Тэмдэглэл: Бүх `.bat` файлуудын замыг `E:\aaacostco` гэж хатуу бичигдсэн байсныг `%~dp0` (автоматаар тухайн хавтсаа таних) болгон зассан тул аль ч диск дээр байрлуулж болно.*
2. Хавтас доторх **`setup-korea-pc.bat`** файлыг ажиллуулна. Энэ нь:
   - `npm install` (үндсэн болон `functions` хавтасны багцууд)
   - `npx playwright install chromium` (Costco scraper-ийн хөтөч)
   - Python `.venv` болон `requirements.txt` багцуудыг автоматаар суулгана.

---

## 3. Cloudflare эрх нэвтрэх (Нэг удаа)

Солонгос дахь компьютерээс Cloudflare Pages болон Workers руу deploy хийхийн тулд терминал (`cmd` эсвэл `PowerShell`) нээгээд дараах командыг ажиллуулж Cloudflare аккаунтаараа нэвтэрнэ:

```bash
npx wrangler login
```

Хөтөч нээгдэхэд Cloudflare аккаунтаараа зөвшөөрөл (`Allow`) өгнө. Шалгахдаа:
```bash
npx wrangler whoami
```

---

## 4. Багцад орсон чухал нууц болон тохиргооны файлууд

Git-д ордоггүй боловч энэ ZIP багцад **бүрэн багтаасан** файлууд:
- `.env.local` — Frontend болон AI орчуулгын түлхүүрүүд (`VITE_API_BASE`, `VITE_USE_WORKER_AUTH`, `GEMINI_API_KEY`, `VITE_AUTH_SALT`)
- `scraper/.env` — Costco.co.kr нэвтрэх мэдээлэл болон Gemini API key (`COSTCO_USER`, `COSTCO_PASS`, `GEMINI_API_KEY`)
- `functions/service-account.json` — Firebase Admin SDK түлхүүр (`costco-fe034` төслийн өдөр тутмын sync скриптүүдэд шаардлагатай)
- `functions/scraper.js` — `npm run core:sync` командад дуудагддаг үндсэн scraper модуль (сэргээгдсэн)
- `cloudflare/seed/*.sql` — Бүх бараа болон захиалгын D1 SQLite өгөгдлийн сангийн нөөц (170+ MB)

---

## 5. Өдөр тутмын болон 7 хоног тутмын удирдлагын командууд

| Үйлдэл | Команд эсвэл `.bat` файл | Тайлбар |
|---|---|---|
| **Локал тестлэх** | `npm run dev` | `http://localhost:5173` дээр сайтыг асаах |
| **Frontend deploy (Cloudflare Pages)** | `deploy-cloudflare.bat` | Сайтыг build хийгээд `costco-fe` Cloudflare Pages руу илгээх |
| **Backend Worker deploy** | `cd cloudflare && npx wrangler deploy` | `costco-api` Cloudflare Worker-ийг шинэчлэх |
| **Costco гишүүний Cookie шинэчлэх** | `start-costco-browser.bat` | Солонгос дахь оффисоос `costco.co.kr` руу шууд хурдан орж гишүүнээр нэвтрээд cookie хадгалах |
| **Өдөр тутмын бараа синк** | `run-daily-sync.bat` | Бараа татах, үнэ/жин бодох, AI орчуулах, search index + home snapshot үүсгэх |
| **7 хоног тутмын бүрэн засвар** | `run-weekly-maintenance.bat` | Cookie шинэчлэх -> Синк -> Засвар -> Cloudflare Pages руу deploy хийх |
| **Автомат хуваарьт оруулах** | `setup-weekly-task.bat` *(Run as Admin)* | Windows Task Scheduler-т долоо хоног бүрийн Ням гарагийн 09:00 цагт автоматаар ажиллахаар бүртгэх |

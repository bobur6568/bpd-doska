# BPD Doskasi — ishga tushirish qo'llanmasi

Bu tizim statik saytdir (GitHub Pages) + Firebase (Authentication + Firestore).
Server kodi yo'q — barcha xavfsizlik Firestore Security Rules orqali ta'minlanadi.

## 1-qadam — Firebase loyihasi

1. https://console.firebase.google.com → **Add project** → nomi: `bpd-doskasi` (Google Analytics shart emas).
2. **Build → Authentication → Get started → Sign-in method → Email/Password** ni yoqing.
3. **Build → Firestore Database → Create database** → *Start in production mode* → mintaqa tanlang.
4. **Project settings** (⚙️) → *Your apps* → Web (`</>`) belgisi → nom: `bpd` → chiqqan `firebaseConfig` obyektini nusxalab oling.
5. Shu config'ni `js/firebase-config.js` faylidagi `firebaseConfig` o'rniga qo'ying.

## 2-qadam — Xavfsizlik qoidalarini joylashtirish

**Firestore Database → Rules** bo'limiga o'ting, `firestore.rules` faylining butun matnini
u yerga nusxalab, **Publish** tugmasini bosing.

## 3-qadam — Birinchi admin hisobini qo'lda yaratish

Tizimda foydalanuvchi yaratishning o'zi admin huquqi talab qiladi — shuning uchun **eng
birinchi** admin hisobini Firebase Console orqali qo'lda yaratish kerak (keyingi barcha
28 ta hisobni endi tizimning o'zidagi "Foydalanuvchilar" bo'limidan yaratasiz):

1. **Authentication → Users → Add user**:
   - Email: `admin@bpd.uzauto.local` (yoki xohlagan login, lekin oxiri albatta `@bpd.uzauto.local` bo'lishi kerak — bu `js/firebase-config.js` dagi `LOGIN_DOMAIN` bilan bir xil bo'lishi shart)
   - Parol: xohlagan parol
   - **Add user** tugmasini bosing, chiqqan **User UID** ni nusxalang.
2. **Firestore Database → Data → Start collection** → collection ID: `users` → Document ID: (nusxalagan UID) → quyidagi maydonlarni qo'shing:
   | Maydon | Turi | Qiymat |
   |---|---|---|
   | username | string | admin |
   | fullName | string | (ismingiz) |
   | workplace | string | UzAuto Motors |
   | position | string | Tizim admin |
   | role | string | admin |
   | active | boolean | true |
   | photo | null | — |
3. Saytga shu login (`admin`) va o'rnatgan parolingiz bilan kiring — endi qolgan 27 ta hisobni "Foydalanuvchilar" bo'limidan yaratishingiz mumkin.

## 4-qadam — GitHub Pages'ga joylashtirish

1. GitHub'da yangi repository yarating (masalan `bpd-doskasi`).
2. Shu papkadagi barcha fayllarni (`index.html`, `css/`, `js/`, `firestore.rules`) repo ildiziga yuklang:
   ```
   git init
   git add .
   git commit -m "BPD Doskasi"
   git branch -M main
   git remote add origin https://github.com/<username>/bpd-doskasi.git
   git push -u origin main
   ```
3. GitHub repo **Settings → Pages** → Source: `main` branch, `/ (root)` → Save.
4. Bir necha daqiqadan so'ng `https://<username>.github.io/bpd-doskasi/` manzilida ishga tushadi.
5. **Muhim:** Firebase Console → Authentication → Settings → *Authorized domains* ga shu
   GitHub Pages domenini (`<username>.github.io`) qo'shing — aks holda login ishlamaydi.

## Tizim qanday ishlaydi (qisqacha)

- **Rollar:** admin, doska egasi (boardOwner), doska bo'yicha mas'ul (responsible),
  maqsad egasi (goalOwner, bo'lim boshiga), element egasi (elementOwner).
- **Tayinlash zanjiri:** doska egasi → mas'ulni belgilaydi → mas'ul har bo'limga maqsad
  egasini belgilaydi → maqsad egasi o'z bo'limidagi elementlarga element egalarini
  belgilaydi. Har bir bog'lanish 3 oyda (90 kunda) bir marta o'zgartirilishi mumkin.
- **Tasdiq zanjiri:** element egasi oylik reja/fakt + hujjat (rasm) kiritadi → maqsad
  egasi tasdiqlaydi/rad etadi → mas'ul tasdiqlaydi/rad etadi → doska egasi yakuniy
  tasdiqlaydi. Doska egasi tasdiqlagandan keyin yozuv **qulflanadi** — hech kim
  (admin ham) o'zgartira olmaydi. Har qanday bosqichda rad etilsa, element egasiga
  qaytadan tahrirlash uchun qaytadi.
- **Chora-tadbir:** maqsad egasi element egalariga, mas'ul esa maqsad egalariga
  bajarish muddati bilan vazifa belgilay oladi; muddat yaqinlashganda/o'tganda
  ranglar bilan ko'rsatiladi.

## Bilib qo'yish kerak bo'lgan cheklovlar

- **Xodimlar elektron pochtasi shart emas** — login shunchaki "username", tizim buni
  ichkarida `username@bpd.uzauto.local` ko'rinishiga o'giradi.
- **Parolni "unutdim" holati:** admin boshqa birovning parolini to'g'ridan-to'g'ri
  qayta o'rnata olmaydi (bu server kodi — Cloud Function — talab qiladi, uni hozircha
  qurmadik, chunki bu Firebase'ning pullik "Blaze" rejasini talab qiladi). Xodim parolini
  "Mening profilim" bo'limidan joriy parolni bilgan holda o'zgartira oladi. Agar butunlay
  unutib qo'ysa, hozircha yagona yechim — admin Firebase Console'dan o'sha foydalanuvchi
  uchun Authentication bo'limida parolni qo'lda yangilashi (Console'da bu imkoniyat bor).
- **Rasm/hujjatlar** siqilgan holda (~150–700KB) to'g'ridan-to'g'ri Firestore'da
  saqlanadi — alohida Storage xizmati va to'lov kartasi kerak emas.
- Firebase'ning bepul (Spark) rejasi kunlik ~50,000 o'qish / ~20,000 yozishni qamrab
  oladi — 28 nafar xodim uchun bu chegaradan foydalanish ehtimoli juda past.

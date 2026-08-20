# Kad AR Kimpalan — Panduan Lengkap (Sifar Pengetahuan Coding)

Sistem penuh: Belajar (AR/3D) + Kuiz (cari-item, markah, papan pendahulu) +
Admin (urus kandungan). Ikut langkah 1 hingga 7 secara berurutan — jangan
langkau, setiap langkah bergantung pada langkah sebelumnya.

**Struktur keseluruhan:** GitHub Pages (hos webapp) → Google Apps Script (API)
→ Google Sheet (data & kandungan).

---

## LANGKAH 1 — Cipta Google Sheet

1. Pergi ke [sheets.google.com](https://sheets.google.com) → **Blank spreadsheet**.
2. Namakan ia sesuatu yang senang cam — contoh **"Kad AR Kimpalan - Data"**.
3. Biarkan dulu, kita akan isi struktur secara automatik di Langkah 2.

## LANGKAH 2 — Pasang Backend (Apps Script)

1. Dalam Google Sheet tadi: menu **Extensions → Apps Script**. Ini buka
   editor kod dalam tab baru.
2. Padam SEMUA kod default (`function myFunction() {...}`) dalam kotak kod.
3. Buka fail `apps-script/Code.gs` dari kit ini, **salin SEMUA kandungannya**,
   dan **tampal** ke dalam editor Apps Script tadi.
4. Cari baris ini berhampiran atas fail:
   ```
   const ADMIN_PASSCODE = "kimpalan2026";
   ```
   **Tukar `"kimpalan2026"` kepada kata laluan admin pilihan kamu sendiri.**
   Ini kata laluan untuk masuk halaman admin nanti — jangan kongsi dengan pelajar.
5. Simpan (ikon disket atau Ctrl+S). Namakan projek — contoh "Kad AR Backend".
6. Di bar atas editor, ada dropdown fungsi (biasanya tertulis nama fungsi
   pertama). Klik dropdown, pilih **`initializeSheets`**.
7. Klik butang **Run** (▶).
8. Kali pertama, Google akan minta kebenaran:
   - Klik **Review permissions**.
   - Pilih akaun Google kamu.
   - Akan ada amaran "Google hasn't verified this app" — ini normal untuk
     skrip sendiri. Klik **Advanced** → **Go to (nama projek) (unsafe)**.
   - Klik **Allow**.
9. Selepas Run selesai (tiada ralat merah di bawah), **kembali ke tab Google
   Sheet** — kamu akan nampak tab baru terhasil di bawah: `Topics`, `Items`,
   `Hotspots`, `Questions`, `Scores`, lengkap dengan lajur dan **satu contoh
   topik SMAW** sudah diisi automatik. Ini bukti backend berjaya disambung.

## LANGKAH 3 — Deploy sebagai Web App (dapatkan API_URL)

1. Dalam editor Apps Script yang sama: klik **Deploy** (kanan atas) →
   **New deployment**.
2. Klik ikon gear ⚙️ sebelah "Select type" → pilih **Web app**.
3. Isi:
   - **Description**: apa-apa, contoh "v1"
   - **Execute as**: **Me** (akaun kamu)
   - **Who has access**: **Anyone**
4. Klik **Deploy**.
5. Sekali lagi mungkin diminta kebenaran — klik **Authorize access** dan
   ulang proses kebenaran macam Langkah 2.8.
6. Selepas deploy berjaya, kamu akan nampak **Web app URL** — bentuknya
   seperti:
   ```
   https://script.google.com/macros/s/AKfycbx.../exec
   ```
   **Salin URL ini penuh-penuh.** Ini adalah `API_URL` kamu.

   > Setiap kali kamu ubah kod `Code.gs` selepas ini, kamu perlu buat
   > **Deploy → Manage deployments → (pilih deployment) → Edit (pensel) →
   > Version: New version → Deploy** supaya perubahan reflect di URL yang sama.

## LANGKAH 4 — Sambungkan Webapp ke API

1. Dalam kit ini, buka fail `shared/js/api.js` dengan editor teks (Notepad,
   VS Code, atau terus edit dalam GitHub selepas Langkah 5).
2. Cari baris:
   ```js
   const API_URL = "PASTE_APPS_SCRIPT_WEB_APP_URL_HERE";
   ```
3. Ganti dengan URL dari Langkah 3.6, contoh:
   ```js
   const API_URL = "https://script.google.com/macros/s/AKfycbx.../exec";
   ```
4. Simpan fail.

## LANGKAH 5 — Letak di GitHub Pages (hosting percuma)

1. Pergi ke [github.com](https://github.com), log masuk akaun kamu.
2. Klik **+** (atas kanan) → **New repository**.
3. Namakan repo — contoh `kad-ar-kimpalan`. Set **Public**. Klik **Create repository**.
4. Dalam repo kosong tadi, klik **uploading an existing file** (atau
   **Add file → Upload files**).
5. Drag SEMUA folder & fail dari kit ini (`student/`, `admin/`, `shared/`,
   `targets/`, `README.md` — **tak perlu** upload folder `apps-script/`,
   ia dah masuk dalam Google Sheet) ke dalam kotak upload GitHub.
6. Scroll bawah, klik **Commit changes**.
7. Pergi ke tab **Settings** (repo yang sama) → **Pages** (menu kiri).
8. Di bawah "Build and deployment" → **Source**: pilih **Deploy from a branch**.
9. **Branch**: pilih `main`, folder `/ (root)` → **Save**.
10. Tunggu 1-2 minit, refresh halaman — akan muncul URL macam:
    ```
    https://username-kamu.github.io/kad-ar-kimpalan/
    ```
11. Untuk buka webapp pelajar: tambah `student/` di hujung URL:
    ```
    https://username-kamu.github.io/kad-ar-kimpalan/student/
    ```
    Untuk admin:
    ```
    https://username-kamu.github.io/kad-ar-kimpalan/admin/
    ```

**Nak edit fail lepas ni?** Klik fail dalam GitHub → ikon pensel (Edit) →
ubah → **Commit changes**. GitHub Pages akan auto-update dalam 1-2 minit.

## LANGKAH 6 — Sediakan Kad AR Fizikal

Ini langkah kreatif — buat SEBELUM pameran/kelas, bukan waktu build sistem.

1. Reka satu kad/kertas untuk **setiap item** (bukan setiap topik) — contoh
   topik SMAW ada 3 kad: Mesin, Pemegang Elektrod, Tanglung Bumi. Setiap kad
   perlu corak/imej unik, padat dengan butiran visual (bukan warna kosong).
   Boleh guna Canva — reka satu "keluarga" corak yang nampak sepadan (border
   sama, glyph tengah lain-lain).
2. **Susunan penting**: urutan kamu compile kad MESTI sama dengan
   `target_index` yang kamu masukkan dalam Sheet `Items` untuk setiap item
   (0, 1, 2, ...). Kad kedudukan 0 dalam compiler = item dengan
   `target_index = 0`.
3. Buka compiler percuma: **https://hiukim.github.io/mind-ar-js-doc/tools/compile/**
4. Drag SEMUA kad **untuk satu topik** ke compiler (ikut urutan Langkah 6.2),
   klik **Start**, tunggu proses siap, klik **Download**. Ini turunkan fail
   `targets.mind`.
5. **Tukar nama fail** kepada `{topic_id}.mind` — contoh untuk topik `smaw`,
   namakan `smaw.mind`.
6. Upload fail ini ke folder `targets/` dalam repo GitHub kamu (Langkah 5.4-6,
   guna cara "Add file → Upload files" yang sama).
7. Ulang Langkah 6.3-6.6 untuk setiap topik lain yang kamu ada.
8. Cetak kad-kad tersebut (kertas/kadbod), laminate untuk pameran.

## LANGKAH 7 — Uji

1. Buka `student/` di **telefon** (bukan hanya komputer — kamera perlu diuji
   di peranti sebenar).
2. Pilih topik → **Belajar** → cuba Mod 3D dulu (tak perlu kamera/kad).
3. Klik **AR**, benarkan kamera, halakan ke kad sebenar.
4. Balik ke senarai topik → **Kuiz** → isi Nama/Kelas/Institusi → mula →
   cari kad yang diminta → **Ini Dia!** → jawab soalan → sehingga selesai.
5. Klik **Papan Pendahulu** — pastikan skor kamu muncul.
6. Buka `admin/` → masukkan kata laluan (Langkah 2.4) → cuba tambah satu
   item baru → refresh `student/` → pastikan item baru muncul.

---

## Susun Atur Data (rujukan pantas)

| Sheet | Apa dia | Contoh |
|---|---|---|
| `Topics` | Senarai topik besar | SMAW, PPE, Jenis Sambungan |
| `Items` | Setiap kad/item fizikal dalam satu topik | Mesin, Pemegang Elektrod |
| `Hotspots` | Titik boleh-ketik pada model 3D setiap item | "Dial Arus" pada Mesin |
| `Questions` | Soalan MCQ susulan untuk setiap item (kuiz) | 1 soalan per item (boleh tambah lebih) |
| `Scores` | Rekod setiap kali pelajar habiskan kuiz | Nama, Kelas, Institusi, Skor |

**`target_index`** dalam `Items` mesti padan dengan urutan kad dalam fail
`.mind` topik berkenaan (Langkah 6.2-6.4).

**`model_ref`** dalam `Items` mesti sama dengan nama fungsi dalam
`shared/js/models.js` (contoh `buildSMAWMachine`). Kalau tak padan, item
akan papar kotak generik oren — bukan ralat, cuma tanda model belum dibina/
dikaitkan.

## Tambah Topik / Item Baru (tanpa sentuh kod)

1. Buka `admin/` → tab **Topics** → isi borang → Simpan.
2. Tab **Items** → tambah satu baris untuk setiap kad fizikal dalam topik
   itu, dengan `target_index` bermula dari 0.
3. Tab **Hotspots** dan **Questions** → tambah mengikut `item_id` berkenaan.
4. Reka & compile kad fizikal (Langkah 6) untuk topik baru ini.
5. Selesai — `student/` akan terus papar topik baru tanpa perlu edit kod.

## Ganti Model Placeholder dengan Model 3D Sebenar

Bila kamu dah ada fail `.glb` (dari scan photogrammetry atau Blender):

1. Upload fail `.glb` ke folder baru `shared/assets/models/` dalam repo GitHub.
2. Dalam `shared/js/models.js`, cari `registerModel("nama_model_ref", ...)`
   yang berkenaan, ganti dengan versi guna GLTFLoader (contoh kod ada di
   penghujung fail `models.js`).
3. Hotspot (dari Sheet `Hotspots`) TERUS BERFUNGSI tanpa ubah — cuma
   koordinat `pos_x/pos_y/pos_z` mungkin perlu dilaraskan supaya jatuh tepat
   pada model baru (kita akan bina alat click-to-place untuk ni bila sampai
   masanya — buat sekarang, laraskan angka secara manual dan reload untuk
   lihat kesan).

## Troubleshooting

- **"API belum disambung"** → `API_URL` dalam `shared/js/api.js` masih
  `PASTE_APPS_SCRIPT_WEB_APP_URL_HERE`. Ulang Langkah 4.
- **Kata laluan admin sentiasa "salah"** → semak `ADMIN_PASSCODE` dalam
  `Code.gs` sama dengan yang kamu taip; lepas ubah `Code.gs`, kamu MESTI
  buat "New version" deploy semula (Langkah 3, nota di bawah).
- **Data tak muncul dalam webapp lepas edit di admin** → cuba refresh
  (Ctrl+Shift+R / hard refresh) — browser kadang cache fetch lama.
- **AR Mode terus tukar ke ralat** → fail `targets/{topic_id}.mind` belum
  wujud atau nama fail tak padan `topic_id` dalam Sheet. Semak Langkah 6.5-6.
- **Kamera tak minta kebenaran** → webapp dibuka guna `file://` terus, bukan
  melalui GitHub Pages punya `https://`. Guna URL dari Langkah 5.10-11.
- **Ralat "Sheet tidak wujud"** → `initializeSheets` belum dijalankan
  berjaya, atau nama tab dalam Sheet telah ditukar secara manual. Jangan
  tukar nama tab `Topics/Items/Hotspots/Questions/Scores`.

## Nota Kuiz — cara markah dikira

Setiap item bernilai **2 markah**: 1 markah bila kad betul dijumpai & disahkan
("Ini Dia!"), 1 markah lagi bila soalan susulan dijawab betul. Kalau satu
item tiada soalan dalam Sheet `Questions`, item itu cuma bernilai 1 markah
(automatik dikira dalam jumlah `total_possible`).

# SIG Kelas — SIG Web Sederhana untuk Pembelajaran Geografi

Aplikasi Sistem Informasi Geografis ringan berbasis browser: impor peta raster, georeferensi,
garis astronomis, digitasi, layout kartografi, dan ekspor PNG / JPEG / PDF.

**Tanpa instalasi, tanpa internet, tanpa library eksternal** (HTML5 Canvas + JavaScript murni).

## Cara menjalankan

**Paling mudah:** ekstrak folder, lalu klik dua kali `index.html` (Chrome / Edge / Firefox).

Alternatif lewat server lokal (opsional):

```bash
cd sig-kelas
python3 -m http.server 8080      # lalu buka http://localhost:8080
```

**Dipakai siswa / deploy online:** unggah seluruh folder ke hosting statis gratis
(GitHub Pages, Netlify Drop, Cloudflare Pages). Tidak ada proses build.

## Struktur proyek

```
sig-kelas/
├── index.html          Kerangka halaman & semua panel kontrol
├── README.md
├── css/
│   └── style.css       Tampilan (tanpa framework; responsif untuk tablet)
└── js/                 (dimuat berurutan oleh index.html — tanpa ES module, jadi jalan dari file://)
    ├── state.js        State aplikasi, event bus, auto-save localStorage, undo, toast
    ├── geo.js          Georeferensi (piksel ⇄ lintang/bujur), parser & format koordinat, geometri
    ├── raster.js       Impor PNG/JPG/GeoTIFF sederhana + peta contoh
    ├── render.js       Menggambar raster, garis astronomis, objek vektor (dipakai peta & layout)
    ├── symbols.js      Pustaka simbol titik, gaya garis (jalan/sungai/batas), pola poligon
    ├── mapview.js      Peta interaktif: pan/zoom/pinch, digitasi titik-garis-poligon, seleksi, edit titik sudut
    ├── layout.js       Desainer layout: judul, bingkai, legenda, skala, arah utara, logo, garis
    ├── exporter.js     Ekspor PNG/JPEG/PDF (penulis PDF sendiri), GeoJSON, simpan proyek
    ├── ui.js           Panel: tab, georef, grid, layer manager, atribut, layout, ekspor
    └── main.js         Titik masuk
```

## Alur penggunaan di kelas

1. **Data** — klik *Muat peta contoh*, atau unggah gambar peta (PNG/JPG/GeoTIFF). Bisa juga seret file ke jendela.
2. **Georef** — klik *Tambah titik referensi*, klik titik di peta, isi Lintang & Bujur.
   Format: `-6.2`, `6.2 S`, `6°12'30" LS`, `106 49 BT`, `95,5 E` (LU/LS/BT/BB atau N/S/E/W).
   - 2 titik (sudut berlawanan) → peta menghadap utara.
   - ≥3 titik → affine (peta boleh miring); ≥4 titik menampilkan galat RMSE (km).
3. **Grid** — atur interval lintang & bujur (derajat atau menit), warna, gaya garis, format label, tebalkan 0°.
4. **Digitasi** — pilih mode ✋ Pilih / ● Titik / ╱ Garis / ⬠ Poligon (tombol melayang di peta atau tombol `V`, `1`, `2`, `3`).
   Isi nama & keterangan di panel *Atribut objek* (panjang/luas ikut dihitung bila sudah georeferensi).
   **Gaya objek** (panel *Atribut objek*, muncul setelah objek dipilih):
   - **Titik** — 20 simbol peta (kota, ibu kota, sekolah, rumah sakit, tempat ibadah, gunung, gunung api, bandara, pelabuhan, dll.)
     atau **ikon gambar sendiri** (unggah PNG/JPG lewat tombol ＋; tersimpan di pustaka ikon dan bisa dipakai ulang). Ukuran 10–64 px.
   - **Garis** — preset: jalan utama, jalan lokal, jalan setapak, rel kereta api, sungai, jalur pelayaran,
     batas negara, batas provinsi, batas kabupaten/kota. Warna dan ketebalan tetap bisa diubah.
   - **Poligon** — preset (wilayah administratif, hutan, perairan, permukiman, sawah, lahan kering, hanya batas),
     pola isi (warna penuh, arsir, silang, kotak-kotak, titik, gelombang, pohon, tanpa isi), kepekatan isi,
     serta gaya, tebal, dan warna garis tepi.
   Semua gaya ikut tampil di legenda otomatis, layout, dan ekspor.
5. **Layer Manager** (kanan) — ikon 👁 menyembunyikan/menampilkan raster, garis astronomis, layer vektor, bahkan objek satu per satu.
6. **Layout** — judul, legenda otomatis, skala (≈ 1 : n), arah utara (ikut berputar jika peta miring), logo sekolah,
   bingkai tunggal/ganda, garis pemisah, dan garis bebas. **Seret elemen langsung di pratinjau.**
7. **Ekspor** — PNG / JPEG / PDF (A4, A3, Letter; lanskap/potret; resolusi 96–288 dpi).

### Pintasan keyboard (tampilan peta)

| Tombol | Fungsi |
|---|---|
| `V` / `1` / `2` / `3` | Pilih / Titik / Garis / Poligon |
| `Enter`, klik 2×, klik kanan | Selesaikan garis / poligon |
| `Backspace` | Hapus titik terakhir (saat menggambar) |
| `Esc` | Batal |
| `Del` | Hapus objek terpilih |
| `Ctrl+Z` | Undo |
| `F` | Pas ke layar |

## Penyimpanan data

- **Otomatis** di browser (localStorage): peta, titik referensi, objek, pengaturan, logo. Jika gambar terlalu besar dan penyimpanan penuh, aplikasi memberi tahu.
- **Simpan Proyek / Buka Proyek** — file `.sigkelas.json` (membawa gambar peta di dalamnya), cocok untuk dibagikan ke siswa.
- **Ekspor GeoJSON** — objek digitasi dalam koordinat lintang/bujur (bila sudah georeferensi), bisa dibuka di QGIS.

## Catatan teknis & batasan

- Model proyeksi: **equirectangular (plate carrée)** — garis lintang/bujur lurus. Cocok untuk peta dunia/regional sederhana,
  bukan untuk peta berproyeksi lain (Mercator, UTM, dll.) pada area luas.
- **GeoTIFF**: didukung yang tanpa kompresi, berbasis strip, 8-bit (gray/RGB/RGBA/palet), 16-bit & float32 satu band.
  Bila ada metadata lintang/bujur, titik referensi dibuat otomatis. GeoTIFF terkompresi/tile/terproyeksi: konversi ke PNG/JPG di QGIS.
- Skala "≈ 1 : n" benar jika layout dicetak pada ukuran kertas penuh (100%).
- PDF berisi gambar resolusi tinggi (bukan vektor).
- Peta contoh Indonesia hanya ilustrasi kasar untuk latihan, bukan data akurat.

## Ide pengembangan

Import GeoJSON, ukuran simbol per objek, kisi grid di luar bingkai peta, proyeksi Mercator, mode kuis (siswa menandai koordinat yang diminta).

## Di HP & sebagai aplikasi Android

- Tampilan otomatis menyesuaikan layar ≤ 900 px: peta layar penuh, panel alat/layer berupa *bottom sheet* (ketuk tab di bawah), tombol **✎ Edit objek** setelah memilih objek, cubit 2 jari untuk zoom (peta & layout), menu ⋯ di kanan atas.
- Gambar besar (foto dari HP) otomatis dikecilkan ke maks. 3000 px agar muat di penyimpanan.
- Untuk membungkus menjadi aplikasi Android (Android Studio), memasang iklan Monetag, dan mengunggah ke APKPure, ikuti **`PANDUAN-ANDROID-STUDIO.md`** pada paket `paket-android`.
- Pengaturan iklan: `js/ads-config.js` (nonaktif secara bawaan).

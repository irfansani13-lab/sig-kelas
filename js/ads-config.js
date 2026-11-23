/* ads-config.js — PENGATURAN IKLAN MONETAG (satu-satunya file yang perlu Anda isi)
   ------------------------------------------------------------------------------
   Iklan HANYA aktif bila:
     1) enabled = true,
     2) aplikasi dibuka dari alamat HTTPS yang tercantum di allowedHosts
        (domain yang sudah diverifikasi di akun Monetag Anda), dan
     3) kode zona (zone) + alamat skrip (src) sudah diisi.
   Saat dibuka dari file lokal / mode offline di aplikasi Android, iklan otomatis mati.

   Cara mengisi zone & src: di dashboard Monetag buat zona "Vignette Banner" dan "In-Page Push",
   lalu salin kodenya. Kodenya berbentuk kira-kira:
       (function(s){ s.dataset.zone='1234567', s.src='https://contoh-domain.net/tag.min.js' })(...)
   → zone  = angka pada  s.dataset.zone   (contoh '1234567')
   → src   = alamat pada s.src            (contoh 'https://contoh-domain.net/tag.min.js')
   Salin PERSIS seperti yang diberikan Monetag (domain skrip bisa berbeda tiap akun). */
window.SIG_ADS = {
  enabled: false,                          // ubah ke true setelah semuanya terisi

  allowedHosts: ['irfansani13-lab.github.io'],    // domain situs Anda yang sudah diverifikasi di Monetag

  vignette:   { zone: '12328968', src: 'https://n6wxm.com/vignette.min.js' },       // Vignette Banner → tab Data s.d. Digitasi
  inPagePush: { zone: '12328982', src: 'https://nap5k.com/tag.min.js' },       // In-Page Push    → saat ekspor peta

  /* Aturan agar tidak mengganggu aktivitas siswa */
  minStartDelaySec: 120,   // vignette tidak muncul sebelum aplikasi dipakai selama ini (detik)
  idleSec: 8,              // …dan hanya saat siswa diam (tidak menyentuh layar / mengetik) selama ini
  cooldownMin: 30,         // jeda minimal antar-sesi vignette (menit)
  pushCooldownSec: 90      // jeda minimal In-Page Push antar-ekspor (detik)
};

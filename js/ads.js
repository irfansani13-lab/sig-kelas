/* ads.js — iklan Monetag yang "sopan" untuk kegiatan belajar di kelas.
   • Vignette Banner : hanya di tab Data → Georef → Grid → Digitasi, hanya saat siswa diam
                       (tidak sedang menggambar, menyentuh layar, atau mengetik).
                       Disembunyikan otomatis saat siswa mulai menggambar / membuka tab Layout & Ekspor.
   • In-Page Push    : muncul sesaat setelah peta berhasil diekspor.
   Pengaturan ada di js/ads-config.js. */
(function () {
  'use strict';
  const SIG = (window.SIG = window.SIG || {});
  const C = window.SIG_ADS || {};
  const EARLY = ['data', 'georef', 'grid', 'digitize'];
  const LS = 'sig-ads-v1';
  const T0 = Date.now();
  let curTab = 'data', lastActivity = Date.now(), pointerDown = false, vigInjected = false, pushAt = 0, phase = null;

  const hostOk = () => location.protocol === 'https:' && (C.allowedHosts || []).indexOf(location.hostname) >= 0;
  const active = () => !!C.enabled && hostOk();
  const valid = (z) => !!z && /^\d+$/.test(String(z.zone || '')) && /^https:\/\//.test(z.src || '');
  const readLS = () => { try { return JSON.parse(localStorage.getItem(LS)) || {}; } catch (e) { return {}; } };
  const writeLS = (o) => { try { localStorage.setItem(LS, JSON.stringify(Object.assign(readLS(), o))); } catch (e) { /* abaikan */ } };

  /** siswa sedang menggambar / menyentuh peta → iklan yang sudah tampil disembunyikan sementara */
  const busy = () => !!(SIG.draft || pointerDown);
  const typing = () => { const a = document.activeElement; return !!a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName); };

  function inject(z, tag) {
    const s = document.createElement('script');
    s.dataset.zone = String(z.zone);
    s.src = z.src;
    s.async = true;
    s.setAttribute('data-sigad-src', tag);
    (document.body || document.documentElement).appendChild(s);
  }

  /* tandai elemen yang disisipkan skrip iklan agar bisa disembunyikan lewat CSS saat siswa sibuk */
  function watchNodes() {
    const known = new WeakSet();
    document.querySelectorAll('body > *').forEach((n) => known.add(n));
    new MutationObserver((muts) => {
      if (!phase) return;
      muts.forEach((m) => m.addedNodes.forEach((n) => {
        if (n.nodeType !== 1 || known.has(n) || /^(SCRIPT|STYLE|LINK|A|INPUT)$/.test(n.tagName)) return;
        known.add(n); n.setAttribute('data-sigad', phase);
      }));
    }).observe(document.body, { childList: true });
  }

  function tick() {
    const early = EARLY.indexOf(curTab) >= 0 && SIG.view === 'map';
    document.body.classList.toggle('ad-busy', busy());
    document.body.classList.toggle('ad-not-early', !early);
    if (!active() || vigInjected || !valid(C.vignette) || !early) return;
    const now = Date.now();
    if (now - T0 < (C.minStartDelaySec || 0) * 1000) return;
    if (now - lastActivity < (C.idleSec || 0) * 1000) return;
    if (busy() || typing()) return;
    if (now - (readLS().vigAt || 0) < (C.cooldownMin || 0) * 60000) return;
    vigInjected = true; phase = 'vig'; writeLS({ vigAt: now });
    inject(C.vignette, 'vig');
  }

  function onExport() {
    if (!active() || !valid(C.inPagePush)) return;
    const now = Date.now();
    if (now - pushAt < (C.pushCooldownSec || 0) * 1000) return;
    pushAt = now; phase = 'push';
    document.querySelectorAll('script[data-sigad-src="push"]').forEach((s) => s.remove());
    setTimeout(() => inject(C.inPagePush, 'push'), 1500); // beri waktu file tersimpan & toast tampil dulu
  }

  function init() {
    if (!active()) return; // iklan mati: tidak ada pendengar/timer sama sekali
    const touch = () => { lastActivity = Date.now(); };
    ['pointerdown', 'keydown', 'wheel', 'touchstart'].forEach((ev) => document.addEventListener(ev, touch, { passive: true, capture: true }));
    document.addEventListener('pointerdown', () => { pointerDown = true; }, { passive: true, capture: true });
    ['pointerup', 'pointercancel'].forEach((ev) => document.addEventListener(ev, () => { pointerDown = false; lastActivity = Date.now(); }, { passive: true, capture: true }));
    watchNodes();
    setInterval(tick, 2000);
  }

  SIG.ads = { onTab: (t) => { curTab = t; lastActivity = Date.now(); }, onExport, status: () => ({ active: active(), hostOk: hostOk(), vignette: valid(C.vignette), push: valid(C.inPagePush) }) };
  document.addEventListener('DOMContentLoaded', init);
})();

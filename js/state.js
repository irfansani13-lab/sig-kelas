/* state.js — state aplikasi, event bus, penyimpanan lokal (localStorage), undo */
(function () {
  'use strict';
  const SIG = (window.SIG = window.SIG || {});
  const KEY = 'sig-kelas-v1';

  /* ---------- event bus sederhana ---------- */
  const bus = {};
  SIG.on = (e, f) => (bus[e] = bus[e] || []).push(f);
  SIG.emit = (e, a) => (bus[e] || []).forEach((f) => f(a));

  SIG.uid = () => Math.random().toString(36).slice(2, 9);
  SIG.FONT = '"Segoe UI", system-ui, -apple-system, Roboto, "Helvetica Neue", Arial, sans-serif';
  SIG.PALETTE = ['#dc2626', '#2563eb', '#16a34a', '#d97706', '#9333ea', '#0891b2', '#be185d', '#4d7c0f'];
  // ukuran kertas dalam piksel pada 96 dpi (lanskap)
  SIG.PAPERS = { A4: [1123, 794], A3: [1587, 1123], Letter: [1056, 816] };
  SIG.view = 'map'; // 'map' | 'layout'

  /* ---------- nilai awal ---------- */
  SIG.defaults = function () {
    const l1 = SIG.uid();
    return {
      raster: null, // {name,w,h,dataUrl,img,visible,opacity}
      gcps: [], // {id,px,py,lat,lon,latText,lonText}
      georef: null, // dihitung otomatis (tidak disimpan)
      showGcps: true,
      grid: { visible: true, latInt: 5, lonInt: 5, linked: true, unit: 'deg', color: '#1d4ed8', width: 1, dash: 'dashed', labels: true, format: 'dms', labelSize: 12, emphasize: true },
      layers: [{ id: l1, name: 'Layer 1', visible: true }],
      activeLayer: l1,
      icons: [], // ikon titik unggahan: {id,name,dataUrl}
      features: [], // {id,layerId,type,coords:[[px,py]],name,desc,color,hidden,style}
      selected: null,
      showLabels: true,
      mode: 'select', // select | point | line | polygon | gcp
      view: { cx: 0, cy: 0, z: 1 },
      layout: {
        paper: 'A4', orient: 'landscape', margin: 18,
        showTitle: true, title: 'Peta Tematik', subtitle: '', titleSize: 30, titleAlign: 'center',
        border: { show: true, style: 'double', width: 3, color: '#111827' },
        titleLine: { show: true, width: 2, color: '#111827' },
        mapGrid: true, mapVectors: true, mapLabels: true,
        legend: { show: true, title: 'Legenda', mode: 'feature', size: 13, x: 0.025, y: 0.58 },
        scale: { show: true, x: 0.70, y: 0.89 },
        north: { show: true, size: 70, x: 0.89, y: 0.2 },
        credit: { show: true, text: 'Dibuat oleh: ………  |  Sumber: ………', size: 12, x: 0.03, y: 0.925 },
        logo: { show: false, dataUrl: null, h: 60, x: 0.025, y: 0.03 },
        lines: [], // {id,x1,y1,x2,y2,color,width,dash}  (pecahan 0–1 dari kertas)
        view: null, // {cx,cy,z} bagian peta di dalam bingkai layout
      },
    };
  };
  SIG.state = SIG.defaults();

  /* ---------- gabung state tersimpan dengan default ---------- */
  const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
  function merge(t, s) {
    for (const k in s) {
      if (isObj(s[k]) && isObj(t[k])) merge(t[k], s[k]);
      else t[k] = s[k];
    }
    return t;
  }

  SIG.loadImage = (src) =>
    new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error('Gagal memuat gambar'));
      i.src = src;
    });

  SIG.restoreImages = async function () {
    const st = SIG.state;
    if (st.raster && st.raster.dataUrl) {
      try { st.raster.img = await SIG.loadImage(st.raster.dataUrl); } catch (e) { st.raster = null; }
    } else if (st.raster) st.raster = null;
    SIG.iconImgs = {};
    for (const ic of st.icons || []) { try { SIG.iconImgs[ic.id] = await SIG.loadImage(ic.dataUrl); } catch (e) { /* abaikan */ } }
    const lg = st.layout.logo;
    if (lg.dataUrl) {
      try { lg._img = await SIG.loadImage(lg.dataUrl); } catch (e) { lg.dataUrl = null; }
    }
  };

  SIG.applyState = async function (obj) {
    const st = merge(SIG.defaults(), obj || {});
    st.mode = 'select';
    st.selected = null;
    SIG.state = st;
    await SIG.restoreImages();
    if (!st.layers.find((l) => l.id === st.activeLayer)) st.activeLayer = st.layers[0] && st.layers[0].id;
    SIG.recomputeGeoref();
    SIG.clearUndo();
  };

  SIG.recomputeGeoref = function () {
    SIG.state.georef = SIG.geo.solve(SIG.state.gcps);
  };

  /* ---------- serialisasi & penyimpanan ---------- */
  SIG.serialize = () =>
    JSON.stringify(
      Object.assign({ v: 1 }, SIG.state),
      (k, v) => (k === 'img' || k === '_img' || k === 'georef' || k === 'selected' ? undefined : v)
    );

  let timer = null, warned = false;
  SIG.schedulePersist = function () {
    clearTimeout(timer);
    timer = setTimeout(() => {
      try { localStorage.setItem(KEY, SIG.serialize()); }
      catch (e) {
        if (!warned) { warned = true; SIG.toast('Penyimpanan otomatis penuh (gambar besar). Gunakan "Simpan Proyek" untuk menyimpan ke file.', 6000); }
      }
    }, 500);
  };
  SIG.loadSaved = function () {
    try { const s = localStorage.getItem(KEY); return s ? JSON.parse(s) : null; } catch (e) { return null; }
  };
  SIG.clearSaved = function () { try { localStorage.removeItem(KEY); } catch (e) { /* abaikan */ } };

  /** panggil setiap kali state berubah. ui=true → bangun ulang panel daftar */
  SIG.touch = function (ui) {
    SIG.emit('redraw');
    if (ui) SIG.emit('ui');
    SIG.schedulePersist();
  };

  /* ---------- undo (objek vektor & layer) ---------- */
  let undoStack = [];
  SIG.clearUndo = () => { undoStack = []; };
  SIG.pushUndo = function () {
    const s = SIG.state;
    undoStack.push(JSON.stringify({ features: s.features, layers: s.layers, activeLayer: s.activeLayer }));
    if (undoStack.length > 60) undoStack.shift();
  };
  SIG.undo = function () {
    if (!undoStack.length) { SIG.toast('Tidak ada langkah untuk di-undo'); return; }
    const o = JSON.parse(undoStack.pop());
    Object.assign(SIG.state, o);
    if (!SIG.state.features.find((f) => f.id === SIG.state.selected)) SIG.state.selected = null;
    SIG.touch(true);
  };

  /* ---------- toast ---------- */
  SIG.toast = function (msg, ms) {
    const t = document.getElementById('toast');
    if (!t) { console.log(msg); return; }
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(SIG._tt);
    SIG._tt = setTimeout(() => t.classList.remove('show'), ms || 3200);
  };
})();

/* symbols.js — pustaka simbol & gaya objek peta:
   • Titik   : simbol peta umum (kota, sekolah, rumah sakit, gunung, …) atau ikon gambar unggahan (PNG/JPG)
   • Garis   : gaya jalan, rel, sungai, jalur pelayaran, batas negara / provinsi / kabupaten
   • Poligon : isi (warna penuh / arsir / pola) + gaya garis tepi, dengan preset (hutan, perairan, permukiman, …)
   Semua digambar ke Canvas 2D sehingga identik di peta, legenda, layout, dan ekspor. */
(function () {
  'use strict';
  const SIG = (window.SIG = window.SIG || {});
  const TAU = Math.PI * 2;
  const rgba = (h, a) => SIG.render.rgba(h, a);

  /* ============================================================
     TITIK — simbol
  ============================================================ */
  /** isi + kontur putih + garis tipis gelap pada path aktif (agar terbaca di atas raster apa pun) */
  function paint(c, color) {
    c.lineJoin = 'round';
    c.lineWidth = 3; c.strokeStyle = '#fff'; c.stroke();
    c.fillStyle = color; c.fill();
    c.lineWidth = 1; c.strokeStyle = 'rgba(0,0,0,.55)'; c.stroke();
  }
  function poly(c, x, y, r, pts) {
    c.beginPath();
    pts.forEach((p, i) => (i ? c.lineTo(x + p[0] * r, y + p[1] * r) : c.moveTo(x + p[0] * r, y + p[1] * r)));
    c.closePath();
  }
  /** simbol bergaris (jangkar): halo putih lalu warna */
  function strokeSym(c, color, fn) {
    c.lineCap = 'round'; c.lineJoin = 'round';
    c.lineWidth = 5; c.strokeStyle = '#fff'; fn(); c.stroke();
    c.lineWidth = 2.2; c.strokeStyle = color; fn(); c.stroke();
  }

  // Setiap simbol: (ctx, x, y, r, color) — r = setengah ukuran
  const POINTS = [
    { id: 'dot', label: 'Titik', draw(c, x, y, r, col) { c.beginPath(); c.arc(x, y, r * 0.7, 0, TAU); paint(c, col); } },
    { id: 'square', label: 'Kotak', draw(c, x, y, r, col) { c.beginPath(); c.rect(x - r * 0.7, y - r * 0.7, r * 1.4, r * 1.4); paint(c, col); } },
    { id: 'triangle', label: 'Segitiga', draw(c, x, y, r, col) { poly(c, x, y, r, [[0, -0.85], [0.85, 0.7], [-0.85, 0.7]]); paint(c, col); } },
    { id: 'diamond', label: 'Belah ketupat', draw(c, x, y, r, col) { poly(c, x, y, r, [[0, -0.95], [0.75, 0], [0, 0.95], [-0.75, 0]]); paint(c, col); } },
    { id: 'star', label: 'Bintang (ibu kota)', draw(c, x, y, r, col) {
      const p = []; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, k = i % 2 ? 0.42 : 1; p.push([Math.cos(a) * k, Math.sin(a) * k]); }
      poly(c, x, y, r, p); paint(c, col); } },
    { id: 'city', label: 'Kota', draw(c, x, y, r, col) {
      c.beginPath(); c.arc(x, y, r * 0.8, 0, TAU); c.fillStyle = '#fff'; c.fill();
      c.lineWidth = 2.4; c.strokeStyle = col; c.stroke();
      c.beginPath(); c.arc(x, y, r * 0.34, 0, TAU); c.fillStyle = col; c.fill(); } },
    { id: 'pin', label: 'Penanda lokasi', draw(c, x, y, r, col) {
      const R = r * 0.7, cy = y - r * 1.05, a1 = (138.2 * Math.PI) / 180, a2 = ((41.8 + 360) * Math.PI) / 180;
      c.beginPath(); c.moveTo(x, y); c.lineTo(x + R * Math.cos(a1), cy + R * Math.sin(a1)); c.arc(x, cy, R, a1, a2, false); c.closePath(); paint(c, col);
      c.beginPath(); c.arc(x, cy, R * 0.38, 0, TAU); c.fillStyle = '#fff'; c.fill(); } },
    { id: 'flag', label: 'Bendera', draw(c, x, y, r, col) {
      c.beginPath(); c.moveTo(x - r * 0.5, y + r); c.lineTo(x - r * 0.5, y - r); c.lineWidth = 3.4; c.strokeStyle = '#fff'; c.stroke(); c.lineWidth = 1.6; c.strokeStyle = '#1f2937'; c.stroke();
      poly(c, x, y, r, [[-0.5, -1], [0.85, -0.5], [-0.5, 0]]); paint(c, col); } },
    { id: 'house', label: 'Permukiman', draw(c, x, y, r, col) {
      poly(c, x, y, r, [[-0.8, 0.7], [-0.8, -0.05], [0, -0.85], [0.8, -0.05], [0.8, 0.7]]); paint(c, col);
      c.fillStyle = '#fff'; c.fillRect(x - r * 0.18, y + r * 0.08, r * 0.36, r * 0.62); } },
    { id: 'school', label: 'Sekolah', draw(c, x, y, r, col) {
      poly(c, x, y, r, [[-0.55, -0.05], [-0.55, 0.55], [0.55, 0.55], [0.55, -0.05]]); paint(c, col);
      poly(c, x, y, r, [[0, -0.8], [0.95, -0.3], [0, 0.2], [-0.95, -0.3]]); paint(c, col); } },
    { id: 'hospital', label: 'Rumah sakit / puskesmas', draw(c, x, y, r, col) {
      c.beginPath(); c.rect(x - r * 0.8, y - r * 0.8, r * 1.6, r * 1.6); paint(c, col);
      c.fillStyle = '#fff'; c.fillRect(x - r * 0.2, y - r * 0.55, r * 0.4, r * 1.1); c.fillRect(x - r * 0.55, y - r * 0.2, r * 1.1, r * 0.4); } },
    { id: 'worship', label: 'Tempat ibadah', draw(c, x, y, r, col) {
      c.beginPath(); c.moveTo(x, y - r * 0.7); c.lineTo(x, y - r * 1.05); c.lineWidth = 3.4; c.strokeStyle = '#fff'; c.stroke(); c.lineWidth = 1.6; c.strokeStyle = '#1f2937'; c.stroke();
      c.beginPath(); c.moveTo(x - r * 0.7, y + r * 0.7); c.lineTo(x - r * 0.7, y); c.arc(x, y, r * 0.7, Math.PI, 0, false); c.lineTo(x + r * 0.7, y + r * 0.7); c.closePath(); paint(c, col); } },
    { id: 'factory', label: 'Industri / pabrik', draw(c, x, y, r, col) {
      c.beginPath(); c.rect(x + r * 0.45, y - r * 0.9, r * 0.3, r * 0.85); paint(c, col);
      poly(c, x, y, r, [[-0.85, 0.7], [-0.85, -0.1], [-0.4, -0.45], [-0.4, -0.1], [0.05, -0.45], [0.05, -0.1], [0.85, -0.1], [0.85, 0.7]]); paint(c, col); } },
    { id: 'mountain', label: 'Gunung / bukit', draw(c, x, y, r, col) { poly(c, x, y, r, [[-0.95, 0.7], [-0.3, -0.35], [0.05, 0.1], [0.45, -0.6], [0.95, 0.7]]); paint(c, col); } },
    { id: 'volcano', label: 'Gunung api', draw(c, x, y, r, col) {
      poly(c, x, y, r, [[-0.95, 0.7], [-0.3, -0.5], [0.3, -0.5], [0.95, 0.7]]); paint(c, col);
      poly(c, x, y, r, [[-0.3, -0.5], [0.3, -0.5], [0.2, -0.22], [-0.2, -0.22]]); c.fillStyle = '#fff'; c.fill(); } },
    { id: 'tree', label: 'Hutan / pohon', draw(c, x, y, r, col) {
      c.fillStyle = '#78350f'; c.fillRect(x - r * 0.12, y + r * 0.2, r * 0.24, r * 0.6);
      c.beginPath(); c.arc(x, y - r * 0.2, r * 0.62, 0, TAU); paint(c, col); } },
    { id: 'water', label: 'Sumber air', draw(c, x, y, r, col) {
      c.beginPath(); c.moveTo(x, y - r * 0.9); c.bezierCurveTo(x + r * 0.2, y - r * 0.5, x + r * 0.75, y, x + r * 0.75, y + r * 0.3);
      c.arc(x, y + r * 0.3, r * 0.75, 0, Math.PI, false); c.bezierCurveTo(x - r * 0.75, y, x - r * 0.2, y - r * 0.5, x, y - r * 0.9); c.closePath(); paint(c, col); } },
    { id: 'airport', label: 'Bandara', draw(c, x, y, r, col) {
      poly(c, x, y, r, [[0, -0.95], [0.14, -0.55], [0.14, -0.2], [0.9, 0.2], [0.9, 0.4], [0.14, 0.2], [0.14, 0.6], [0.4, 0.8], [0.4, 0.92], [0, 0.8], [-0.4, 0.92], [-0.4, 0.8], [-0.14, 0.6], [-0.14, 0.2], [-0.9, 0.4], [-0.9, 0.2], [-0.14, -0.2], [-0.14, -0.55]]); paint(c, col); } },
    { id: 'port', label: 'Pelabuhan', draw(c, x, y, r, col) {
      strokeSym(c, col, () => {
        c.beginPath();
        c.arc(x, y - r * 0.68, r * 0.2, 0, TAU);
        c.moveTo(x, y - r * 0.48); c.lineTo(x, y + r * 0.8);
        c.moveTo(x - r * 0.4, y - r * 0.12); c.lineTo(x + r * 0.4, y - r * 0.12);
        c.moveTo(x - r * 0.75, y + r * 0.2); c.arc(x, y + r * 0.1, r * 0.75, 0.12 * Math.PI, 0.88 * Math.PI, false);
      }); } },
    { id: 'station', label: 'Stasiun / terminal', draw(c, x, y, r, col) {
      c.beginPath(); c.rect(x - r * 0.65, y - r * 0.85, r * 1.3, r * 1.5); paint(c, col);
      c.fillStyle = '#fff'; c.fillRect(x - r * 0.45, y - r * 0.6, r * 0.9, r * 0.5);
      c.beginPath(); c.arc(x - r * 0.3, y + r * 0.3, r * 0.12, 0, TAU); c.arc(x + r * 0.3, y + r * 0.3, r * 0.12, 0, TAU); c.fill(); } },
  ];
  const POINT_BY_ID = Object.fromEntries(POINTS.map((p) => [p.id, p]));

  /* ---------- pustaka ikon gambar unggahan ---------- */
  SIG.iconImgs = SIG.iconImgs || {}; // id -> HTMLImageElement
  const iconOf = (id) => (SIG.state.icons || []).find((i) => i.id === id);

  /** gambar satu titik. style = {symbol,size,icon}; (x,y)=pusat (pin: ujung bawah) */
  function drawPoint(c, x, y, style, color) {
    const size = style.size || 20;
    c.save();
    c.setLineDash([]);
    const im = style.icon && SIG.iconImgs[style.icon];
    if (im) {
      const k = size / Math.max(im.width, im.height);
      c.imageSmoothingEnabled = true;
      c.drawImage(im, x - (im.width * k) / 2, y - (im.height * k) / 2, im.width * k, im.height * k);
    } else {
      (POINT_BY_ID[style.symbol] || POINT_BY_ID.dot).draw(c, x, y, size / 2, color);
    }
    c.restore();
  }

  /* ============================================================
     GARIS — preset
     dash dinyatakan dalam kelipatan lebar garis
  ============================================================ */
  const LINES = {
    plain:      { label: 'Garis biasa',          color: null,      width: 3.5 },
    road_main:  { label: 'Jalan utama',          color: '#f59e0b', width: 4.5, casing: '#78350f' },
    road_local: { label: 'Jalan lokal',          color: '#ffffff', width: 3.2, casing: '#6b7280' },
    trail:      { label: 'Jalan setapak',        color: '#78350f', width: 2.4, dash: [0.1, 2.4], cap: 'round' },
    rail:       { label: 'Rel kereta api',       color: '#111827', width: 2.2, ticks: true },
    river:      { label: 'Sungai',               color: '#2563eb', width: 3.2, smooth: true },
    sea_route:  { label: 'Jalur pelayaran',      color: '#0e7490', width: 2.2, dash: [3, 2.4], cap: 'butt' },
    b_country:  { label: 'Batas negara',         color: '#111827', width: 2.4, dash: [5, 1.4, 1, 1.4, 1, 1.4], cap: 'butt' },
    b_prov:     { label: 'Batas provinsi',       color: '#7e22ce', width: 2.2, dash: [5, 1.4, 1, 1.4], cap: 'butt' },
    b_kab:      { label: 'Batas kabupaten/kota', color: '#b45309', width: 2.2, dash: [3.5, 1.8], cap: 'butt' },
  };
  const LINE_ORDER = ['plain', 'road_main', 'road_local', 'trail', 'rail', 'river', 'sea_route', 'b_country', 'b_prov', 'b_kab'];

  function trace(c, pts, closed, smooth) {
    c.beginPath();
    if (smooth && !closed && pts.length > 2) {
      c.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length - 1; i++) {
        const mx = (pts[i][0] + pts[i + 1][0]) / 2, my = (pts[i][1] + pts[i + 1][1]) / 2;
        c.quadraticCurveTo(pts[i][0], pts[i][1], mx, my);
      }
      const l = pts[pts.length - 1]; c.lineTo(l[0], l[1]);
    } else {
      pts.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])));
      if (closed) c.closePath();
    }
  }

  function strokeLine(c, pts, color, width, preset, closed) {
    const d = LINES[preset] || LINES.plain;
    c.save();
    c.lineJoin = 'round';
    c.lineCap = d.cap || 'round';
    if (d.casing) { trace(c, pts, closed, d.smooth); c.setLineDash([]); c.strokeStyle = d.casing; c.lineWidth = width + Math.max(2, width * 0.7); c.lineCap = 'round'; c.stroke(); }
    trace(c, pts, closed, d.smooth);
    const u = Math.max(width, 1.6);
    c.setLineDash(d.dash ? d.dash.map((v) => v * u) : []);
    c.strokeStyle = color; c.lineWidth = width; c.stroke();
    if (d.ticks) { // bantalan rel: garis tebal putus-putus pendek tegak lurus
      trace(c, pts, closed, false);
      c.lineCap = 'butt'; c.setLineDash([Math.max(1.6, width * 0.9), width * 4.2]); c.lineWidth = width * 3.4; c.stroke();
    }
    c.restore();
  }

  /* ============================================================
     POLIGON — pola isi & preset
  ============================================================ */
  const PATTERNS = {
    solid:  'Warna penuh',
    none:   'Tanpa isi',
    hatch:  'Arsir ╱',
    hatch2: 'Arsir ╲',
    hlines: 'Garis mendatar',
    cross:  'Silang',
    grid:   'Kotak-kotak',
    dots:   'Titik-titik',
    waves:  'Gelombang',
    trees:  'Pohon',
  };
  const PATTERN_ORDER = Object.keys(PATTERNS);
  const patCache = {};
  function tile(pat, color) {
    const key = pat + '|' + color;
    if (patCache[key]) return patCache[key];
    const S = pat === 'trees' ? 16 : 12, cv = document.createElement('canvas');
    cv.width = cv.height = S;
    const g = cv.getContext('2d');
    g.strokeStyle = g.fillStyle = rgba(color, 0.9); g.lineWidth = 1.4; g.lineCap = 'round';
    g.beginPath();
    if (pat === 'hatch') { g.moveTo(-1, S + 1); g.lineTo(S + 1, -1); g.moveTo(-S / 2, S / 2 + 1); g.lineTo(S / 2 + 1, -S / 2); g.moveTo(S / 2 - 1, S * 1.5); g.lineTo(S * 1.5, S / 2 - 1); g.stroke(); }
    else if (pat === 'hatch2') { g.moveTo(-1, -1); g.lineTo(S + 1, S + 1); g.moveTo(-S / 2, S / 2 - 1); g.lineTo(S / 2 + 1, S * 1.5); g.moveTo(S / 2 - 1, -S / 2); g.lineTo(S * 1.5, S / 2 + 1); g.stroke(); }
    else if (pat === 'hlines') { g.moveTo(0, S / 2); g.lineTo(S, S / 2); g.stroke(); }
    else if (pat === 'cross') { g.moveTo(-1, -1); g.lineTo(S + 1, S + 1); g.moveTo(-1, S + 1); g.lineTo(S + 1, -1); g.stroke(); }
    else if (pat === 'grid') { g.moveTo(S / 2, 0); g.lineTo(S / 2, S); g.moveTo(0, S / 2); g.lineTo(S, S / 2); g.stroke(); }
    else if (pat === 'dots') { g.arc(S / 2, S / 2, 1.7, 0, TAU); g.fill(); }
    else if (pat === 'waves') { g.moveTo(0, S / 2); g.quadraticCurveTo(S / 4, S / 2 - 5, S / 2, S / 2); g.quadraticCurveTo((S * 3) / 4, S / 2 + 5, S, S / 2); g.stroke(); }
    else if (pat === 'trees') {
      g.arc(4, 4, 2.6, 0, TAU); g.fill(); g.beginPath(); g.arc(12, 12, 2.6, 0, TAU); g.fill();
      g.beginPath(); g.moveTo(4, 6.5); g.lineTo(4, 9); g.moveTo(12, 14.5); g.lineTo(12, 16); g.stroke();
    }
    return (patCache[key] = cv);
  }

  /** isi poligon sesuai gaya. origin=[ox,oy] → pola menempel pada peta saat digeser */
  function fillPolygon(c, pts, color, st, origin) {
    if (st.pattern === 'none' || !(st.fillOpacity > 0)) return;
    c.save();
    trace(c, pts, true, false);
    if (st.pattern === 'solid') { c.fillStyle = rgba(color, st.fillOpacity); c.fill(); }
    else {
      c.fillStyle = rgba(color, st.fillOpacity * 0.4); c.fill();
      const p = c.createPattern(tile(st.pattern, color), 'repeat');
      if (p) {
        try { if (origin && p.setTransform) p.setTransform(new DOMMatrix([1, 0, 0, 1, origin[0], origin[1]])); } catch (e) { /* abaikan */ }
        c.globalAlpha = Math.min(1, 0.45 + st.fillOpacity);
        c.fillStyle = p; c.fill();
      }
    }
    c.restore();
  }

  const POLYS = {
    umum:       { label: 'Umum',                    color: null,      pattern: 'solid',  op: 0.28, outline: 'plain', ow: 2.5 },
    wilayah:    { label: 'Wilayah administratif',   color: '#f59e0b', pattern: 'solid',  op: 0.18, outline: 'b_prov', ow: 2.4 },
    hutan:      { label: 'Hutan',                   color: '#15803d', pattern: 'trees',  op: 0.35, outline: 'plain', ow: 1.5 },
    air:        { label: 'Danau / perairan',        color: '#0ea5e9', pattern: 'waves',  op: 0.45, outline: 'plain', ow: 1.5 },
    permukiman: { label: 'Permukiman',              color: '#e11d48', pattern: 'cross',  op: 0.3,  outline: 'plain', ow: 1.5 },
    sawah:      { label: 'Sawah / pertanian',       color: '#65a30d', pattern: 'hlines', op: 0.35, outline: 'plain', ow: 1.5 },
    kering:     { label: 'Lahan kering / gurun',    color: '#ca8a04', pattern: 'dots',   op: 0.35, outline: 'plain', ow: 1.5 },
    batas:      { label: 'Hanya batas (tanpa isi)', color: '#111827', pattern: 'none',   op: 0,    outline: 'b_kab', ow: 2.4 },
  };
  const POLY_ORDER = Object.keys(POLYS);

  /* ============================================================
     Gaya bawaan & akses
  ============================================================ */
  const DEFAULTS = {
    point: { symbol: 'dot', size: 20, icon: null },
    line: { preset: 'plain', width: 3.5 },
    polygon: { preset: 'umum', pattern: 'solid', fillOpacity: 0.28, outline: 'plain', outlineWidth: 2.5, outlineColor: null },
  };
  /** gaya efektif sebuah objek (nilai bawaan + f.style) */
  const styleOf = (f) => Object.assign({}, DEFAULTS[f.type], f.style || {});
  /** tulis satu properti gaya */
  function setStyle(f, patch) { f.style = Object.assign({}, f.style || {}, patch); }

  function applyLinePreset(f, id) {
    const d = LINES[id] || LINES.plain;
    setStyle(f, { preset: id, width: d.width });
    if (d.color) f.color = d.color;
  }
  function applyPolyPreset(f, id) {
    const d = POLYS[id] || POLYS.umum;
    setStyle(f, { preset: id, pattern: d.pattern, fillOpacity: d.op, outline: d.outline, outlineWidth: d.ow, outlineColor: null });
    if (d.color) f.color = d.color;
  }

  /* ============================================================
     Gambar mini (daftar pilihan di panel) & contoh di legenda
  ============================================================ */
  const thumbCache = {};
  function thumb(key, w, h, fn) {
    const k = key + '|' + w + 'x' + h;
    if (thumbCache[k]) return thumbCache[k];
    const cv = document.createElement('canvas'), dpr = 2;
    cv.width = w * dpr; cv.height = h * dpr;
    const g = cv.getContext('2d'); g.scale(dpr, dpr);
    fn(g, w, h);
    return (thumbCache[k] = cv.toDataURL());
  }
  const thumbPoint = (id, color, s) => thumb('p' + id + color, s, s, (g, w, h) => drawPoint(g, w / 2, id === 'pin' ? h * 0.92 : h / 2, { symbol: id, size: s * 0.86 }, color));
  const thumbLine = (id, color, width) => thumb('l' + id + color + width, 96, 20, (g, w, h) => strokeLine(g, [[6, h * 0.7], [w * 0.38, h * 0.3], [w * 0.66, h * 0.7], [w - 6, h * 0.35]], color, Math.min(width, 5), id, false));
  const thumbPattern = (pat, color) => thumb('t' + pat + color, 34, 24, (g, w, h) => {
    g.fillStyle = '#fff'; g.fillRect(0, 0, w, h);
    fillPolygon(g, [[1, 1], [w - 1, 1], [w - 1, h - 1], [1, h - 1]], color, { pattern: pat === 'none' ? 'solid' : pat, fillOpacity: pat === 'none' ? 0 : 0.5 }, [0, 0]);
    g.strokeStyle = '#6b7280'; g.lineWidth = 1; g.strokeRect(0.5, 0.5, w - 1, h - 1);
    if (pat === 'none') { g.fillStyle = '#6b7280'; g.font = '10px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('∅', w / 2, h / 2); }
  });
  const thumbPoly = (id, color) => {
    const d = POLYS[id];
    return thumb('o' + id + color, 34, 24, (g, w, h) => {
      g.fillStyle = '#fff'; g.fillRect(0, 0, w, h);
      const pts = [[4, 18], [8, 5], [24, 3], [30, 16]];
      fillPolygon(g, pts, color, { pattern: d.pattern, fillOpacity: d.op }, [0, 0]);
      strokeLine(g, pts, d.outline === 'plain' ? color : (LINES[d.outline].color || color), Math.min(d.ow, 2), d.outline, true);
    });
  };

  /** simbol untuk legenda: (sx,cy) = tepi kiri & tengah vertikal, w = lebar kotak simbol */
  function legendSymbol(c, f, sx, cy, w) {
    const st = styleOf(f);
    c.save(); c.lineJoin = 'round'; c.lineCap = 'round';
    if (f.type === 'point') drawPoint(c, sx + w / 2, cy + (st.symbol === 'pin' && !st.icon ? 9 : 0), { symbol: st.symbol, icon: st.icon, size: Math.min(st.size, 22) }, f.color);
    else if (f.type === 'line') strokeLine(c, [[sx + 2, cy + 4], [sx + w * 0.45, cy - 4], [sx + w - 2, cy + 1]], f.color, Math.min(st.width, 5), st.preset, false);
    else {
      const pts = [[sx + 3, cy - 7], [sx + w - 3, cy - 7], [sx + w - 3, cy + 7], [sx + 3, cy + 7]];
      fillPolygon(c, pts, f.color, st, [sx, cy]);
      strokeLine(c, pts, st.outlineColor || (st.outline !== 'plain' && LINES[st.outline].color) || f.color, Math.min(st.outlineWidth, 3), st.outline, true);
    }
    c.restore();
  }

  /** radius sentuh titik (untuk memilih objek dengan klik) */
  const pointHitRadius = (f) => Math.max(11, (styleOf(f).size || 20) / 2 + 3);

  SIG.symbols = {
    POINTS, LINES, LINE_ORDER, PATTERNS, PATTERN_ORDER, POLYS, POLY_ORDER,
    styleOf, setStyle, applyLinePreset, applyPolyPreset,
    drawPoint, strokeLine, fillPolygon, legendSymbol, pointHitRadius,
    thumbPoint, thumbLine, thumbPattern, thumbPoly, iconOf,
  };
})();

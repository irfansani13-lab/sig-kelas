/* layout.js — desainer layout peta (kartografi): judul, bingkai, legenda, skala, arah utara, logo, garis.
   Semua digambar ke Canvas dalam satuan "piksel kertas @96dpi" sehingga pratinjau = hasil ekspor. */
(function () {
  'use strict';
  const SIG = (window.SIG = window.SIG || {});
  const st = () => SIG.state;
  const FONT = () => SIG.FONT;
  const TAU = Math.PI * 2;
  let canvas, ctx, fitS = 1, dpr = 1;
  let boxes = []; // kotak elemen pada gambar terakhir (untuk hit-test)
  let drag = null;
  const lptrs = new Map(); let lpinch = null; // cubit 2 jari untuk zoom isi peta
  SIG.layoutTool = null; // null | 'line'
  SIG.layoutSel = null; // {kind, id}

  function pageSize(L) {
    const [a, b] = SIG.PAPERS[L.paper] || SIG.PAPERS.A4;
    return L.orient === 'portrait' ? [Math.min(a, b), Math.max(a, b)] : [Math.max(a, b), Math.min(a, b)];
  }
  /** geometri halaman: bingkai, area isi (C), pita judul, kotak peta (M) */
  function geom(L) {
    const [W, H] = pageSize(L);
    const m = L.margin, b = L.border;
    const inner = b.show ? (b.style === 'double' ? b.width + 6 : b.width) : 0;
    const C = { x: m + inner, y: m + inner, w: W - 2 * (m + inner), h: H - 2 * (m + inner) };
    let band = 0;
    if (L.showTitle) band = L.titleSize * 1.2 + (L.subtitle ? Math.max(14, L.titleSize * 0.45) * 1.5 : 0) + 22;
    const M = { x: C.x, y: C.y + band, w: C.w, h: C.h - band };
    return { W, H, m, C, band, M };
  }
  function ensureView(L, G) {
    if (!L.view) fitImage(L, G);
  }
  function fitImage(L, G) {
    L = L || st().layout; G = G || geom(L);
    const r = st().raster;
    if (!r) L.view = { cx: 0, cy: 0, z: 1 };
    else L.view = { cx: r.w / 2, cy: r.h / 2, z: Math.min(G.M.w / r.w, G.M.h / r.h) };
  }
  function fromMap() {
    const L = st().layout, G = geom(L), e = SIG.mapview.getExtent(), r = st().raster;
    let x0 = e.cx - e.w / 2, x1 = e.cx + e.w / 2, y0 = e.cy - e.h / 2, y1 = e.cy + e.h / 2;
    if (r) { // pangkas ke area gambar agar tidak ada ruang kosong
      const a = Math.max(x0, 0), b = Math.min(x1, r.w), c = Math.max(y0, 0), d = Math.min(y1, r.h);
      if (b - a > 5 && d - c > 5) { x0 = a; x1 = b; y0 = c; y1 = d; }
    }
    const w = x1 - x0, h = y1 - y0;
    L.view = { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, z: Math.min(G.M.w / w, G.M.h / h) };
    SIG.touch();
  }

  /* ---------------- elemen: legenda ---------------- */
  function legendRows(L) {
    const s = st(), feats = SIG.visibleFeatures(), rows = [];
    if (L.legend.mode === 'layer') {
      for (const ly of s.layers) {
        if (!ly.visible) continue;
        const fs = feats.filter((f) => f.layerId === ly.id);
        if (fs.length) rows.push({ label: ly.name, kind: fs[0].type, color: fs[0].color, f: fs[0] });
      }
    } else {
      for (const f of feats) rows.push({ label: f.name || '(tanpa nama)', kind: f.type, color: f.color, f });
    }
    if (rows.length > 18) { const n = rows.length - 17; rows.length = 17; rows.push({ label: `… dan ${n} objek lain`, kind: 'none', color: '#000' }); }
    if (s.grid.visible && L.mapGrid && SIG.geo.ready()) rows.push({ label: 'Garis lintang & bujur', kind: 'grid', color: s.grid.color });
    return rows;
  }
  function drawLegend(c, L, x, y, draw) {
    const size = L.legend.size, rows = legendRows(L), pad = 10, sym = 30, lh = size * 1.6;
    const title = L.legend.title || '';
    c.font = `700 ${size + 1}px ${FONT()}`;
    const tw = title ? c.measureText(title).width : 0;
    c.font = `${size}px ${FONT()}`;
    let lw = 0; rows.forEach((r) => (lw = Math.max(lw, c.measureText(r.label).width)));
    if (!rows.length) lw = c.measureText('(belum ada objek)').width - sym - 8;
    const w = Math.max(tw, sym + 8 + lw) + pad * 2;
    const th = title ? size * 1.9 : 0;
    const h = pad * 2 + th + Math.max(1, rows.length) * lh;
    if (draw) {
      c.save();
      c.fillStyle = 'rgba(255,255,255,.95)'; c.fillRect(x, y, w, h);
      c.strokeStyle = '#1f2937'; c.lineWidth = 1; c.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
      c.textBaseline = 'middle'; c.textAlign = 'left'; c.fillStyle = '#111827';
      if (title) { c.font = `700 ${size + 1}px ${FONT()}`; c.fillText(title, x + pad, y + pad + size * 0.9); }
      c.font = `${size}px ${FONT()}`;
      if (!rows.length) { c.fillStyle = '#6b7280'; c.fillText('(belum ada objek)', x + pad, y + pad + th + lh / 2); }
      rows.forEach((r, i) => {
        const cy = y + pad + th + i * lh + lh / 2, sx = x + pad;
        c.lineJoin = 'round'; c.lineCap = 'round';
        if (r.f) SIG.symbols.legendSymbol(c, r.f, sx, cy, sym);
        else if (r.kind === 'grid') { c.strokeStyle = r.color; c.lineWidth = 1.2; c.setLineDash([5, 3]); c.beginPath(); c.moveTo(sx + 2, cy); c.lineTo(sx + sym - 2, cy); c.stroke(); c.setLineDash([]); }
        c.fillStyle = '#111827'; c.font = `${size}px ${FONT()}`; c.fillText(r.label, sx + sym + 8, cy);
      });
      c.restore();
    }
    return { w, h };
  }

  /* ---------------- elemen: skala ---------------- */
  function drawScale(c, L, x, y, draw) {
    const v = L.view, pad = 9;
    if (!SIG.geo.ready()) {
      const t = 'Skala: georeferensi belum aktif';
      c.font = `12px ${FONT()}`;
      const w = c.measureText(t).width + pad * 2, h = 28;
      if (draw) { c.save(); c.fillStyle = 'rgba(255,255,255,.9)'; c.fillRect(x, y, w, h); c.strokeStyle = '#9ca3af'; c.strokeRect(x + .5, y + .5, w - 1, h - 1); c.fillStyle = '#b45309'; c.textBaseline = 'middle'; c.textAlign = 'left'; c.fillText(t, x + pad, y + h / 2); c.restore(); }
      return { w, h };
    }
    const mpl = SIG.geo.metersPerPixel(v.cx, v.cy) / v.z; // meter per piksel kertas
    const len = SIG.geo.niceLength(150 * mpl);
    const bw = len / mpl;
    const ratio = mpl / 0.000264583; // 1 px@96dpi = 0,2646 mm
    const p10 = Math.pow(10, Math.floor(Math.log10(ratio)) - 1);
    const rt = '≈ 1 : ' + (Math.round(ratio / p10) * p10).toLocaleString('id-ID');
    const lab = ['0', SIG.geo.formatDistance(len / 2), SIG.geo.formatDistance(len)];
    c.font = `600 12px ${FONT()}`;
    const titleW = c.measureText('Skala ' + rt).width;
    c.font = `11px ${FONT()}`;
    const tw = Math.max(titleW, bw + c.measureText(lab[2]).width / 2 + 2);
    const w = tw + pad * 2, h = pad * 2 + 8 + 20 + 16;
    if (draw) {
      c.save();
      c.fillStyle = 'rgba(255,255,255,.93)'; c.fillRect(x, y, w, h);
      c.strokeStyle = '#1f2937'; c.lineWidth = 1; c.strokeRect(x + .5, y + .5, w - 1, h - 1);
      const bx = x + pad, by = y + pad + 16;
      c.fillStyle = '#111827'; c.font = `600 12px ${FONT()}`; c.textBaseline = 'middle'; c.textAlign = 'left';
      c.fillText('Skala ' + rt, bx, y + pad + 6);
      const n = 4, sw = bw / n;
      for (let i = 0; i < n; i++) { c.fillStyle = i % 2 ? '#fff' : '#111827'; c.fillRect(bx + i * sw, by, sw, 8); }
      c.strokeStyle = '#111827'; c.lineWidth = 1; c.strokeRect(bx + .5, by + .5, bw, 8);
      c.fillStyle = '#111827'; c.font = `11px ${FONT()}`; c.textBaseline = 'top';
      c.textAlign = 'left'; c.fillText(lab[0], bx, by + 12);
      const w0 = c.measureText(lab[0]).width, w1 = c.measureText(lab[1]).width, w2 = c.measureText(lab[2]).width;
      if (w0 + 4 < bw / 2 - w1 / 2 && bw / 2 + w1 / 2 + 4 < bw - w2 / 2) { c.textAlign = 'center'; c.fillText(lab[1], bx + bw / 2, by + 12); } // lewati label tengah bila bertabrakan
      c.textAlign = 'center'; c.fillText(lab[2], bx + bw, by + 12);
      c.restore();
    }
    return { w, h };
  }

  /* ---------------- elemen: arah utara ---------------- */
  function drawNorth(c, L, x, y, draw) {
    const s = L.north.size, w = s, h = s * 1.1;
    if (draw) {
      let th = 0;
      if (SIG.geo.ready()) {
        const v = L.view, [lon, lat] = SIG.geo.toLL(v.cx, v.cy);
        const a = SIG.geo.toPx(lon, lat), b = SIG.geo.toPx(lon, lat + 0.01);
        th = Math.atan2(b[0] - a[0], -(b[1] - a[1]));
      }
      c.save();
      c.fillStyle = 'rgba(255,255,255,.85)'; c.beginPath(); c.arc(x + s / 2, y + s * 0.6, s * 0.5, 0, TAU); c.fill();
      c.strokeStyle = '#6b7280'; c.lineWidth = 1; c.stroke();
      c.translate(x + s / 2, y + s * 0.62); c.rotate(th);
      const r = s * 0.36;
      c.lineJoin = 'miter';
      c.beginPath(); c.moveTo(0, -r); c.lineTo(-r * 0.4, r * 0.7); c.lineTo(0, r * 0.35); c.closePath(); c.fillStyle = '#fff'; c.fill(); c.strokeStyle = '#111827'; c.lineWidth = 1.4; c.stroke();
      c.beginPath(); c.moveTo(0, -r); c.lineTo(r * 0.4, r * 0.7); c.lineTo(0, r * 0.35); c.closePath(); c.fillStyle = '#111827'; c.fill(); c.stroke();
      c.fillStyle = '#111827'; c.font = `800 ${Math.round(s * 0.26)}px ${FONT()}`; c.textAlign = 'center'; c.textBaseline = 'alphabetic';
      c.fillText('U', 0, -r - s * 0.04);
      c.restore();
    }
    return { w, h };
  }

  /* ---------------- elemen: logo & teks ---------------- */
  function drawLogo(c, L, x, y, draw) {
    const lg = L.logo, im = lg._img;
    if (!im) return { w: 0, h: 0 };
    const h = lg.h, w = (im.naturalWidth / im.naturalHeight) * h;
    if (draw) c.drawImage(im, x, y, w, h);
    return { w, h };
  }
  function drawCredit(c, L, x, y, draw) {
    const t = L.credit.text || '', sz = L.credit.size;
    c.font = `${sz}px ${FONT()}`;
    const w = c.measureText(t).width + 14, h = sz * 1.9;
    if (draw) { c.save(); c.fillStyle = 'rgba(255,255,255,.88)'; c.fillRect(x, y, w, h); c.fillStyle = '#111827'; c.textBaseline = 'middle'; c.textAlign = 'left'; c.fillText(t, x + 7, y + h / 2); c.restore(); }
    return { w, h };
  }

  /* ---------------- gambar seluruh halaman ---------------- */
  function draw(c, o) {
    o = o || {};
    const s = st(), L = s.layout, G = geom(L), { W, H, C, M } = G;
    ensureView(L, G);
    boxes = [];
    c.save();
    c.fillStyle = '#fff'; c.fillRect(0, 0, W, H);

    // peta
    c.save(); c.translate(M.x, M.y);
    SIG.render.drawMap(c, L.view, M.w, M.h, { bg: '#eef3f6', grid: L.mapGrid, vectors: L.mapVectors, labels: L.mapLabels, ui: false });
    if (!s.raster && o.ui) { c.fillStyle = '#6b7280'; c.font = `16px ${FONT()}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('Impor peta raster terlebih dahulu (tab Data)', M.w / 2, M.h / 2); }
    c.restore();
    c.strokeStyle = '#111827'; c.lineWidth = 1.2; c.strokeRect(M.x + .5, M.y + .5, M.w - 1, M.h - 1);

    // judul
    if (L.showTitle) {
      let sz = L.titleSize;
      c.fillStyle = '#111827'; c.textBaseline = 'top';
      c.textAlign = L.titleAlign;
      const tx = L.titleAlign === 'left' ? C.x + 16 : L.titleAlign === 'right' ? C.x + C.w - 16 : C.x + C.w / 2;
      c.font = `800 ${sz}px ${FONT()}`;
      while (sz > 12 && c.measureText(L.title).width > C.w - 40) { sz--; c.font = `800 ${sz}px ${FONT()}`; }
      c.fillText(L.title, tx, C.y + 11);
      if (L.subtitle) {
        const ss = Math.max(14, L.titleSize * 0.45);
        c.font = `${ss}px ${FONT()}`; c.fillStyle = '#374151';
        c.fillText(L.subtitle, tx, C.y + 11 + sz * 1.2);
      }
      if (L.titleLine.show) {
        c.fillStyle = L.titleLine.color;
        c.fillRect(C.x, M.y - L.titleLine.width, C.w, L.titleLine.width);
      }
    }

    // elemen yang dapat dipindah
    const place = (kind, fn) => {
      const cfg = L[kind];
      if (!cfg.show) return;
      const m = fn(c, L, 0, 0, false);
      if (!m.w) return;
      const x = Math.max(0, Math.min(W - m.w, cfg.x * W)), y = Math.max(0, Math.min(H - m.h, cfg.y * H));
      fn(c, L, x, y, true);
      boxes.push({ kind, x, y, w: m.w, h: m.h });
    };
    place('legend', drawLegend);
    place('scale', drawScale);
    place('north', drawNorth);
    place('credit', drawCredit);
    place('logo', drawLogo);

    // garis layout bebas
    for (const ln of L.lines) {
      c.save();
      c.strokeStyle = ln.color; c.lineWidth = ln.width; c.lineCap = 'round';
      c.setLineDash(ln.dash === 'dashed' ? [ln.width * 4, ln.width * 3] : ln.dash === 'dotted' ? [1, ln.width * 2.2] : []);
      c.beginPath(); c.moveTo(ln.x1 * W, ln.y1 * H); c.lineTo(ln.x2 * W, ln.y2 * H); c.stroke();
      c.restore();
      boxes.push({ kind: 'line', id: ln.id, x1: ln.x1 * W, y1: ln.y1 * H, x2: ln.x2 * W, y2: ln.y2 * H });
    }

    // bingkai
    const b = L.border;
    if (b.show) {
      c.strokeStyle = b.color; c.lineJoin = 'miter';
      c.lineWidth = b.width; c.strokeRect(G.m + b.width / 2, G.m + b.width / 2, W - 2 * G.m - b.width, H - 2 * G.m - b.width);
      if (b.style === 'double') {
        c.lineWidth = Math.max(1, b.width / 3);
        const d = G.m + b.width + 3;
        c.strokeRect(d, d, W - 2 * d, H - 2 * d);
      }
    }

    // penanda UI (hanya pratinjau)
    if (o.ui) {
      const sel = SIG.layoutSel;
      c.save(); c.setLineDash([5, 4]); c.lineWidth = 1.5; c.strokeStyle = '#0f766e';
      for (const bx of boxes) {
        if (bx.kind === 'line') {
          if (sel && sel.kind === 'line' && sel.id === bx.id) {
            c.setLineDash([]); c.fillStyle = '#fff'; c.lineWidth = 2;
            for (const [px, py] of [[bx.x1, bx.y1], [bx.x2, bx.y2]]) { c.beginPath(); c.arc(px, py, 6, 0, TAU); c.fill(); c.stroke(); }
            c.setLineDash([5, 4]);
          }
        } else if (sel && sel.kind === bx.kind) c.strokeRect(bx.x - 3, bx.y - 3, bx.w + 6, bx.h + 6);
      }
      c.restore();
    }
    c.restore();
  }

  function renderToCanvas(scale) {
    const L = st().layout, [W, H] = pageSize(L);
    const cv = document.createElement('canvas');
    cv.width = Math.round(W * scale); cv.height = Math.round(H * scale);
    const c = cv.getContext('2d');
    c.scale(scale, scale);
    draw(c, { ui: false });
    return cv;
  }

  /* ---------------- pratinjau & interaksi ---------------- */
  function resize() {
    const wrap = document.getElementById('layout-wrap');
    const r = wrap.getBoundingClientRect();
    if (r.width < 10 || r.height < 10) return;
    const [W, H] = pageSize(st().layout);
    fitS = Math.min((r.width - 36) / W, (r.height - 36) / H);
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.style.width = W * fitS + 'px'; canvas.style.height = H * fitS + 'px';
    canvas.width = Math.round(W * fitS * dpr); canvas.height = Math.round(H * fitS * dpr);
    redraw();
  }
  function redraw() {
    if (!ctx) return;
    const [W, H] = pageSize(st().layout);
    const wantW = Math.round(W * fitS * dpr);
    if (canvas.width !== wantW) { resize(); return; } // kertas berubah ukuran
    ctx.setTransform(dpr * fitS, 0, 0, dpr * fitS, 0, 0);
    ctx.clearRect(0, 0, W, H);
    draw(ctx, { ui: true });
  }
  const pagePt = (e) => { const r = canvas.getBoundingClientRect(); return { x: (e.clientX - r.left) / fitS, y: (e.clientY - r.top) / fitS }; };

  function hit(pt) {
    for (let i = boxes.length - 1; i >= 0; i--) {
      const b = boxes[i];
      if (b.kind === 'line') {
        if (Math.hypot(pt.x - b.x1, pt.y - b.y1) < 10) return { kind: 'line', id: b.id, part: 'p1' };
        if (Math.hypot(pt.x - b.x2, pt.y - b.y2) < 10) return { kind: 'line', id: b.id, part: 'p2' };
        if (SIG.geo.distPointSeg(pt.x, pt.y, b.x1, b.y1, b.x2, b.y2) < 8) return { kind: 'line', id: b.id, part: 'body' };
      } else if (pt.x >= b.x && pt.x <= b.x + b.w && pt.y >= b.y && pt.y <= b.y + b.h) return { kind: b.kind };
    }
    return null;
  }
  const inMap = (pt) => { const G = geom(st().layout); return pt.x >= G.M.x && pt.x <= G.M.x + G.M.w && pt.y >= G.M.y && pt.y <= G.M.y + G.M.h; };

  function onDown(e) {
    canvas.setPointerCapture(e.pointerId);
    lptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (lptrs.size === 2 && st().layout.view) {
      const [a, b] = [...lptrs.values()];
      lpinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: st().layout.view.z };
      drag = null; SIG.emit('redraw'); return;
    }
    if (lptrs.size > 2) return;
    const pt = pagePt(e), L = st().layout, [W, H] = pageSize(L);
    if (SIG.layoutTool === 'line') {
      const ln = { id: SIG.uid(), x1: pt.x / W, y1: pt.y / H, x2: pt.x / W, y2: pt.y / H, color: '#111827', width: 2, dash: 'solid' };
      L.lines.push(ln);
      drag = { type: 'newline', ln };
      return;
    }
    const h = hit(pt);
    if (h) {
      SIG.layoutSel = h;
      if (h.kind === 'line') { const ln = L.lines.find((l) => l.id === h.id); drag = { type: 'line', part: h.part, ln, start: pt, o: { ...ln } }; }
      else drag = { type: 'el', kind: h.kind, start: pt, o: { x: L[h.kind].x, y: L[h.kind].y } };
      SIG.emit('ui');
    } else if (inMap(pt)) {
      SIG.layoutSel = null;
      drag = { type: 'pan', start: pt, o: { cx: L.view.cx, cy: L.view.cy } };
    } else { SIG.layoutSel = null; }
    SIG.emit('redraw');
  }
  function onMove(e) {
    if (lptrs.has(e.pointerId)) lptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (lpinch && lptrs.size === 2) {
      const [a, b] = [...lptrs.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
      if (lpinch.d > 0) st().layout.view.z = clampZ(lpinch.z * (d / lpinch.d));
      SIG.emit('redraw'); return;
    }
    const pt = pagePt(e), L = st().layout, [W, H] = pageSize(L);
    if (!drag) {
      const h = SIG.layoutTool === 'line' ? null : hit(pt);
      canvas.style.cursor = SIG.layoutTool === 'line' ? 'crosshair' : h ? 'move' : inMap(pt) ? 'grab' : 'default';
      return;
    }
    if (drag.type === 'newline') { drag.ln.x2 = pt.x / W; drag.ln.y2 = pt.y / H; }
    else if (drag.type === 'el') {
      L[drag.kind].x = drag.o.x + (pt.x - drag.start.x) / W;
      L[drag.kind].y = drag.o.y + (pt.y - drag.start.y) / H;
    } else if (drag.type === 'line') {
      const dx = (pt.x - drag.start.x) / W, dy = (pt.y - drag.start.y) / H, ln = drag.ln, o = drag.o;
      if (drag.part === 'p1') { ln.x1 = o.x1 + dx; ln.y1 = o.y1 + dy; }
      else if (drag.part === 'p2') { ln.x2 = o.x2 + dx; ln.y2 = o.y2 + dy; }
      else { ln.x1 = o.x1 + dx; ln.y1 = o.y1 + dy; ln.x2 = o.x2 + dx; ln.y2 = o.y2 + dy; }
      if (e.shiftKey && drag.part !== 'body') { // Shift = garis lurus horizontal/vertikal
        const [ax, ay, bx, by] = drag.part === 'p2' ? [ln.x1, ln.y1, ln.x2, ln.y2] : [ln.x2, ln.y2, ln.x1, ln.y1];
        if (Math.abs((bx - ax) * W) > Math.abs((by - ay) * H)) { if (drag.part === 'p2') ln.y2 = ln.y1; else ln.y1 = ln.y2; }
        else { if (drag.part === 'p2') ln.x2 = ln.x1; else ln.x1 = ln.x2; }
      }
    } else if (drag.type === 'pan') {
      L.view.cx = drag.o.cx - (pt.x - drag.start.x) / L.view.z;
      L.view.cy = drag.o.cy - (pt.y - drag.start.y) / L.view.z;
    }
    SIG.emit('redraw');
  }
  function onUp(e) {
    if (e) lptrs.delete(e.pointerId);
    if (lpinch) { if (lptrs.size < 2) { lpinch = null; drag = null; SIG.touch(); } return; }
    if (!drag) return;
    if (drag.type === 'newline') {
      const ln = drag.ln, [W, H] = pageSize(st().layout);
      if (Math.hypot((ln.x2 - ln.x1) * W, (ln.y2 - ln.y1) * H) < 6) st().layout.lines = st().layout.lines.filter((l) => l !== ln);
      else SIG.layoutSel = { kind: 'line', id: ln.id };
      SIG.layoutTool = null;
      SIG.emit('ui');
    }
    drag = null;
    SIG.touch(true);
  }
  /* ---------------- ukuran isi peta & skala otomatis ---------------- */
  const MM_PER_PX_M = 0.000264583; // 1 piksel kertas (96 dpi) = 0,2646 mm = 0,000264583 m
  const clampZ = (z) => Math.max(0.01, Math.min(100, z));
  /** {pct, zFit, ratio}: ukuran isi peta relatif terhadap "seluruh gambar" dan skala 1 : ratio (null bila belum georeferensi) */
  function info() {
    const L = st().layout, r = st().raster;
    if (!r || !L.view) return null;
    const G = geom(L), zFit = Math.min(G.M.w / r.w, G.M.h / r.h);
    const ratio = SIG.geo.ready() ? SIG.geo.metersPerPixel(L.view.cx, L.view.cy) / L.view.z / MM_PER_PX_M : null;
    return { pct: (L.view.z / zFit) * 100, zFit, ratio };
  }
  /** ubah ukuran isi peta (zoom) tanpa menggeser pusatnya */
  function setZoom(z) { const L = st().layout; if (!L.view) return; L.view.z = clampZ(z); SIG.touch(); }
  function zoomBy(f) { const L = st().layout; if (L.view) setZoom(L.view.z * f); }
  function setRelZoomLog2(e) { const i = info(); if (i) setZoom(i.zFit * Math.pow(2, e)); }
  /** atur ukuran isi peta agar skala = 1 : n */
  function setScale(n) {
    const L = st().layout;
    if (!L.view || !SIG.geo.ready() || !(n > 0)) return false;
    setZoom(SIG.geo.metersPerPixel(L.view.cx, L.view.cy) / (n * MM_PER_PX_M));
    return true;
  }
  function onWheel(e) {
    const pt = pagePt(e);
    if (!inMap(pt)) return;
    e.preventDefault();
    const L = st().layout, G = geom(L), v = L.view;
    const lx = pt.x - G.M.x - G.M.w / 2, ly = pt.y - G.M.y - G.M.h / 2;
    const ix = v.cx + lx / v.z, iy = v.cy + ly / v.z;
    v.z = Math.max(0.01, Math.min(100, v.z * Math.exp(-e.deltaY * 0.0015)));
    v.cx = ix - lx / v.z; v.cy = iy - ly / v.z;
    SIG.touch();
  }

  /** letakkan elemen di sudut: area 'map' (kotak peta) atau 'page' (area isi) */
  function placeAt(kind, corner) {
    const L = st().layout, G = geom(L);
    const b = boxes.find((x) => x.kind === kind);
    if (!b) { SIG.toast('Aktifkan elemen terlebih dahulu.'); return; }
    const A = kind === 'logo' || kind === 'credit' ? G.C : G.M, pad = 10;
    const x = corner.includes('l') ? A.x + pad : A.x + A.w - b.w - pad;
    const y = corner[0] === 't' ? A.y + pad : A.y + A.h - b.h - pad;
    L[kind].x = x / G.W; L[kind].y = y / G.H;
    SIG.touch();
  }

  function init() {
    canvas = document.getElementById('layout-canvas');
    ctx = canvas.getContext('2d');
    new ResizeObserver(resize).observe(document.getElementById('layout-wrap'));
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    document.addEventListener('keydown', (e) => {
      if (SIG.view !== 'layout') return;
      const tg = e.target && e.target.tagName;
      if (tg === 'INPUT' || tg === 'TEXTAREA' || tg === 'SELECT') return;
      if (e.key === 'Escape') { SIG.layoutTool = null; SIG.layoutSel = null; SIG.emit('ui'); SIG.emit('redraw'); }
      if ((e.key === 'Delete' || e.key === 'Backspace') && SIG.layoutSel && SIG.layoutSel.kind === 'line') { e.preventDefault(); removeLine(SIG.layoutSel.id); }
    });
    resize();
  }
  function removeLine(id) {
    const L = st().layout;
    L.lines = L.lines.filter((l) => l.id !== id);
    if (SIG.layoutSel && SIG.layoutSel.id === id) SIG.layoutSel = null;
    SIG.touch(true);
  }

  SIG.layout = { init, resize, redraw, renderToCanvas, pageSize, fitImage: () => { fitImage(); SIG.touch(); }, fromMap, placeAt, removeLine, info, zoomBy, setRelZoomLog2, setScale };
})();

/* render.js — menggambar isi peta (raster, garis astronomis, objek vektor) ke sebuah Canvas 2D.
   Dipakai bersama oleh tampilan peta interaktif DAN layout/ekspor, sehingga hasilnya identik. */
(function () {
  'use strict';
  const SIG = (window.SIG = window.SIG || {});
  const st = () => SIG.state;
  const TAU = Math.PI * 2;

  function rgba(hex, a) {
    const n = parseInt((hex || '#000000').slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }
  function path(ctx, pts, close) {
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
    if (close) ctx.closePath();
  }
  function halo(ctx, text, x, y, size) {
    ctx.lineWidth = Math.max(3, size / 3.2);
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(255,255,255,.92)';
    ctx.strokeText(text, x, y);
    ctx.fillText(text, x, y);
  }

  SIG.visibleFeatures = function () {
    const s = st();
    const off = new Set(s.layers.filter((l) => !l.visible).map((l) => l.id));
    return s.features.filter((f) => !f.hidden && !off.has(f.layerId));
  };

  /**
   * Gambar peta pada kotak (0,0)–(w,h) dari ctx saat ini.
   * view = {cx,cy,z}: titik gambar (piksel raster) di tengah kotak & piksel layar per piksel raster.
   * o = {bg, grid, vectors, labels, ui, draft}
   */
  function drawMap(ctx, view, w, h, o) {
    const s = st();
    const z = view.z;
    const P = (x, y) => [(x - view.cx) * z + w / 2, (y - view.cy) * z + h / 2];
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, w, h); ctx.clip();
    if (o.bg) { ctx.fillStyle = o.bg; ctx.fillRect(0, 0, w, h); }

    const r = s.raster;
    if (r && r.img && r.visible) {
      const [x0, y0] = P(0, 0);
      ctx.save();
      ctx.globalAlpha = r.opacity;
      ctx.imageSmoothingEnabled = z < 4;
      ctx.drawImage(r.img, x0, y0, r.w * z, r.h * z);
      ctx.restore();
    } else if (r && o.ui) {
      const [x0, y0] = P(0, 0);
      ctx.save(); ctx.setLineDash([6, 5]); ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.strokeRect(x0, y0, r.w * z, r.h * z); ctx.restore();
    }

    if (o.grid && s.grid.visible && SIG.geo.ready()) drawGrid(ctx, view, w, h, P, o);
    if (o.vectors) drawVectors(ctx, P, o);
    if (o.ui) {
      if (s.showGcps) drawGcps(ctx, P);
      if (o.draft) drawDraft(ctx, P, o.draft);
    }
    ctx.restore();
  }

  /* ---------------------------------------------------------------
     Garis astronomis (paralel lintang & meridian bujur)
  --------------------------------------------------------------- */
  function drawGrid(ctx, view, w, h, P, o) {
    const s = st(), g = s.grid, r = s.raster, z = view.z;
    // area gambar = irisan kotak peta ∩ raster
    let R = { x0: 0, y0: 0, x1: w, y1: h };
    if (r) {
      const [ax, ay] = P(0, 0), [bx, by] = P(r.w, r.h);
      R = { x0: Math.max(0, ax), y0: Math.max(0, ay), x1: Math.min(w, bx), y1: Math.min(h, by) };
      if (R.x1 <= R.x0 || R.y1 <= R.y0) return;
    }
    const toImg = (sx, sy) => [(sx - w / 2) / z + view.cx, (sy - h / 2) / z + view.cy];
    const cs = [[R.x0, R.y0], [R.x1, R.y0], [R.x1, R.y1], [R.x0, R.y1]].map(([x, y]) => SIG.geo.toLL(...toImg(x, y)));
    const lons = cs.map((c) => c[0]), lats = cs.map((c) => c[1]);
    const minLon = Math.min(...lons), maxLon = Math.max(...lons), minLat = Math.min(...lats), maxLat = Math.max(...lats);
    const k = g.unit === 'min' ? 1 / 60 : 1;
    const stepLat = g.latInt * k, stepLon = g.lonInt * k;
    if (!(stepLat > 0) || !(stepLon > 0)) return;
    if ((maxLat - minLat) / stepLat > 300 || (maxLon - minLon) / stepLon > 300) {
      if (o.ui) { ctx.fillStyle = 'rgba(180,30,30,.9)'; ctx.font = `600 13px ${SIG.FONT}`; ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText('Interval garis terlalu rapat — perbesar interval.', R.x0 + 10, R.y0 + 10); }
      return;
    }
    const S = (lon, lat) => { const p = SIG.geo.toPx(lon, lat); return P(p[0], p[1]); };
    const dash = g.dash === 'dashed' ? [8, 5] : g.dash === 'dotted' ? [2, 4] : [];
    const eps = 1e-9;
    const lines = [];
    for (let i = Math.ceil(minLat / stepLat - eps); i <= Math.floor(maxLat / stepLat + eps); i++) {
      const lat = i * stepLat; lines.push({ axis: 'lat', v: lat, a: S(minLon, lat), b: S(maxLon, lat) });
    }
    for (let i = Math.ceil(minLon / stepLon - eps); i <= Math.floor(maxLon / stepLon + eps); i++) {
      const lon = i * stepLon; lines.push({ axis: 'lon', v: lon, a: S(lon, minLat), b: S(lon, maxLat) });
    }
    ctx.save();
    ctx.beginPath(); ctx.rect(R.x0, R.y0, R.x1 - R.x0, R.y1 - R.y0); ctx.clip();
    ctx.lineCap = 'butt';
    for (const L of lines) {
      const zero = g.emphasize && Math.abs(L.v) < 1e-9;
      ctx.setLineDash(zero ? [] : dash);
      ctx.strokeStyle = g.color;
      ctx.lineWidth = zero ? g.width * 2.2 : g.width;
      ctx.beginPath(); ctx.moveTo(L.a[0], L.a[1]); ctx.lineTo(L.b[0], L.b[1]); ctx.stroke();
    }
    ctx.setLineDash([]);
    if (g.labels) {
      const fs = g.labelSize;
      ctx.font = `600 ${fs}px ${SIG.FONT}`;
      ctx.fillStyle = g.color;
      ctx.textBaseline = 'middle';
      const latL = [], lonL = [];
      for (const L of lines) {
        const txt = SIG.geo.formatCoord(L.v, L.axis, g.format);
        if (L.axis === 'lat') {
          const xL = R.x0 + 5, dx = L.b[0] - L.a[0];
          if (Math.abs(dx) < 1e-6) continue;
          const y = L.a[1] + ((xL - L.a[0]) / dx) * (L.b[1] - L.a[1]);
          if (y < R.y0 + fs * 2.8 || y > R.y1 - fs) continue;
          latL.push({ txt, x: xL, y: y - fs * 0.7 });
        } else {
          const yT = R.y0 + fs * 0.9 + 4, dy = L.b[1] - L.a[1];
          if (Math.abs(dy) < 1e-6) continue;
          const x = L.a[0] + ((yT - L.a[1]) / dy) * (L.b[0] - L.a[0]);
          if (x < R.x0 + 30 || x > R.x1 - 30) continue;
          lonL.push({ txt, x, y: yT });
        }
      }
      // gambar label tanpa saling menimpa (lewati yang terlalu rapat)
      latL.sort((a, b) => a.y - b.y);
      let lastY = -1e9;
      ctx.textAlign = 'left';
      for (const l of latL) { if (l.y - lastY < fs * 1.5) continue; halo(ctx, l.txt, l.x, l.y, fs); lastY = l.y; }
      lonL.sort((a, b) => a.x - b.x);
      let lastR = -1e9;
      ctx.textAlign = 'center';
      for (const l of lonL) {
        const tw = ctx.measureText(l.txt).width;
        if (l.x - tw / 2 < lastR + 8) continue;
        halo(ctx, l.txt, l.x, l.y, fs); lastR = l.x + tw / 2;
      }
    }
    ctx.restore();
  }

  /* ---------------------------------------------------------------
     Objek vektor
  --------------------------------------------------------------- */
  function drawVectors(ctx, P, o) {
    const feats = SIG.visibleFeatures();
    const sel = o.ui ? st().selected : null;
    ctx.save();
    ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.setLineDash([]);
    const SY = SIG.symbols, origin = P(0, 0);
    for (const type of ['polygon', 'line', 'point']) {
      for (const f of feats) {
        if (f.type !== type) continue;
        const pts = f.coords.map((c) => P(c[0], c[1]));
        const sty = SY.styleOf(f);
        if (f.id === sel) {
          ctx.save();
          ctx.strokeStyle = ctx.fillStyle = 'rgba(250,204,21,.85)'; ctx.lineWidth = 9;
          if (type === 'point') { ctx.beginPath(); ctx.arc(pts[0][0], pts[0][1], sty.size / 2 + 6, 0, TAU); ctx.fill(); }
          else { path(ctx, pts, type === 'polygon'); ctx.stroke(); }
          ctx.restore();
        }
        if (type === 'polygon') {
          SY.fillPolygon(ctx, pts, f.color, sty, origin);
          const oc = sty.outlineColor || (sty.outline !== 'plain' && SY.LINES[sty.outline].color) || f.color;
          SY.strokeLine(ctx, pts, oc, sty.outlineWidth, sty.outline, true);
        } else if (type === 'line') {
          SY.strokeLine(ctx, pts, f.color, sty.width, sty.preset, false);
        } else {
          SY.drawPoint(ctx, pts[0][0], pts[0][1], sty, f.color);
        }
      }
    }
    if (o.labels) {
      ctx.font = `600 13px ${SIG.FONT}`; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#111827';
      for (const f of feats) {
        if (!f.name) continue;
        const pts = f.coords.map((c) => P(c[0], c[1]));
        if (f.type === 'point') { ctx.textAlign = 'left'; halo(ctx, f.name, pts[0][0] + SIG.symbols.styleOf(f).size / 2 + 4, pts[0][1] - 6, 13); }
        else if (f.type === 'line') { const m = pts[Math.floor(pts.length / 2)]; ctx.textAlign = 'left'; halo(ctx, f.name, m[0] + 8, m[1] - 10, 13); }
        else { const c = SIG.geo.centroid(pts); ctx.textAlign = 'center'; halo(ctx, f.name, c[0], c[1], 13); }
      }
    }
    if (sel) {
      const f = st().features.find((x) => x.id === sel);
      if (f && !f.hidden && f.type !== 'point') {
        for (const c of f.coords) {
          const [x, y] = P(c[0], c[1]);
          ctx.fillStyle = '#fff'; ctx.strokeStyle = '#0f766e'; ctx.lineWidth = 2;
          ctx.fillRect(x - 5, y - 5, 10, 10); ctx.strokeRect(x - 5, y - 5, 10, 10);
        }
      }
    }
    ctx.restore();
  }

  function drawGcps(ctx, P) {
    ctx.save();
    ctx.font = `700 12px ${SIG.FONT}`; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    st().gcps.forEach((gp, i) => {
      const [x, y] = P(gp.px, gp.py);
      const ok = typeof gp.lat === 'number' && typeof gp.lon === 'number';
      const col = ok ? '#dc2626' : '#f59e0b';
      ctx.strokeStyle = col; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, 7, 0, TAU); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x - 13, y); ctx.lineTo(x + 13, y); ctx.moveTo(x, y - 13); ctx.lineTo(x, y + 13); ctx.stroke();
      ctx.fillStyle = col; halo(ctx, 'T' + (i + 1), x + 12, y - 12, 12);
    });
    ctx.restore();
  }

  function drawDraft(ctx, P, d) {
    const pts = d.pts.map((p) => P(p[0], p[1]));
    ctx.save();
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    const col = '#0f766e';
    const all = d.cursor ? pts.concat([P(d.cursor[0], d.cursor[1])]) : pts;
    if (all.length > 1) {
      if (d.type === 'polygon' && all.length > 2) { path(ctx, all, true); ctx.fillStyle = 'rgba(15,118,110,.18)'; ctx.fill(); }
      path(ctx, all, false); ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.setLineDash([8, 5]); ctx.stroke(); ctx.setLineDash([]);
    }
    pts.forEach(([x, y], i) => {
      ctx.beginPath(); ctx.arc(x, y, i === 0 ? 7 : 5, 0, TAU); ctx.fillStyle = i === 0 ? '#fff' : col; ctx.fill();
      ctx.strokeStyle = col; ctx.lineWidth = 2.5; ctx.stroke();
    });
    ctx.restore();
  }

  SIG.render = { drawMap, rgba, halo };
})();

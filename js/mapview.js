/* mapview.js — tampilan peta interaktif: pan/zoom, mode digitasi (titik/garis/poligon), seleksi & edit titik sudut */
(function () {
  'use strict';
  const SIG = (window.SIG = window.SIG || {});
  const st = () => SIG.state;
  let canvas, ctx, W = 400, H = 300, dpr = 1;
  let down = null, pinch = null, pinchUsed = false;
  const ptrs = new Map();
  SIG.draft = null; // {type, pts:[[x,y]], cursor}

  const clampZ = (z) => Math.max(0.02, Math.min(80, z));
  const toImg = (sx, sy) => { const v = st().view; return [(sx - W / 2) / v.z + v.cx, (sy - H / 2) / v.z + v.cy]; };
  const toScr = (x, y) => { const v = st().view; return [(x - v.cx) * v.z + W / 2, (y - v.cy) * v.z + H / 2]; };
  const pos = (e) => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };

  /* ---------- ukuran & gambar ---------- */
  function resize() {
    const r = canvas.parentElement.getBoundingClientRect();
    if (r.width < 10 || r.height < 10) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = r.width; H = r.height;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    redraw();
  }
  function redraw() {
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    SIG.render.drawMap(ctx, st().view, W, H, { bg: '#d5dde1', grid: true, vectors: true, labels: st().showLabels, ui: true, draft: SIG.draft });
    const empty = document.getElementById('map-empty');
    if (empty) empty.hidden = !!st().raster;
    updateDraftBar();
  }

  function fit() {
    const r = st().raster, v = st().view;
    if (!r) { v.cx = 0; v.cy = 0; v.z = 1; }
    else { v.cx = r.w / 2; v.cy = r.h / 2; v.z = clampZ(Math.min((W - 40) / r.w, (H - 40) / r.h)); }
    SIG.emit('redraw');
  }
  function zoomAt(sx, sy, f) {
    const v = st().view;
    const [ix, iy] = toImg(sx, sy);
    v.z = clampZ(v.z * f);
    v.cx = ix - (sx - W / 2) / v.z; v.cy = iy - (sy - H / 2) / v.z;
    SIG.emit('redraw');
  }
  function getExtent() { const v = st().view; return { cx: v.cx, cy: v.cy, w: W / v.z, h: H / v.z }; }
  function zoomToFeature(f) {
    const xs = f.coords.map((c) => c[0]), ys = f.coords.map((c) => c[1]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const v = st().view;
    v.cx = (x0 + x1) / 2; v.cy = (y0 + y1) / 2;
    const w = Math.max(x1 - x0, 30), h = Math.max(y1 - y0, 30);
    v.z = clampZ(Math.min(W / (w * 2.2), H / (h * 2.2), Math.max(v.z, 0.5) * 8));
    SIG.emit('redraw');
  }

  /* ---------- mode ---------- */
  SIG.setMode = function (m) {
    cancelDraft(true);
    st().mode = m;
    if (canvas) canvas.style.cursor = m === 'select' ? 'grab' : 'crosshair';
    SIG.emit('ui'); SIG.emit('redraw');
  };

  /* ---------- digitasi ---------- */
  function newName(type) {
    const n = st().features.filter((f) => f.type === type).length + 1;
    return { point: 'Titik', line: 'Garis', polygon: 'Area' }[type] + ' ' + n;
  }
  function addFeature(type, coords) {
    const s = st();
    SIG.pushUndo();
    let layer = s.layers.find((l) => l.id === s.activeLayer);
    if (!layer) { layer = { id: SIG.uid(), name: 'Layer ' + (s.layers.length + 1), visible: true }; s.layers.push(layer); s.activeLayer = layer.id; }
    if (!layer.visible) { layer.visible = true; SIG.toast(`Layer "${layer.name}" ditampilkan kembali.`); }
    const f = { id: SIG.uid(), layerId: layer.id, type, coords, name: newName(type), desc: '', color: SIG.PALETTE[s.features.length % SIG.PALETTE.length], hidden: false };
    s.features.push(f);
    s.selected = f.id;
    SIG.focusNameNext = true;
    SIG.touch(true);
    return f;
  }
  function finishDraft() {
    const d = SIG.draft;
    if (!d) return;
    const z = st().view.z;
    while (d.pts.length > 1) { // buang titik ganda akibat klik dua kali
      const a = d.pts[d.pts.length - 1], b = d.pts[d.pts.length - 2];
      if (Math.hypot(a[0] - b[0], a[1] - b[1]) * z < 5) d.pts.pop(); else break;
    }
    const min = d.type === 'line' ? 2 : 3;
    if (d.pts.length < min) { SIG.toast(`${d.type === 'line' ? 'Garis' : 'Poligon'} butuh minimal ${min} titik.`); return; }
    const pts = d.pts;
    SIG.draft = null;
    addFeature(d.type, pts);
  }
  function cancelDraft(silent) {
    if (!SIG.draft) return;
    SIG.draft = null;
    if (!silent) SIG.emit('redraw');
  }
  function updateDraftBar() {
    const bar = document.getElementById('float-draft');
    if (!bar) return;
    const d = SIG.draft;
    bar.hidden = !d;
    if (d) document.getElementById('draft-info').textContent = `${d.type === 'line' ? 'Garis' : 'Poligon'}: ${d.pts.length} titik`;
  }

  /* ---------- hit-test ---------- */
  function hitFeature(sx, sy) {
    const feats = SIG.visibleFeatures().slice().reverse();
    const sp = (f) => f.coords.map((c) => toScr(c[0], c[1]));
    for (const f of feats) if (f.type === 'point') { const [x, y] = toScr(f.coords[0][0], f.coords[0][1]); if (Math.hypot(x - sx, y - sy) <= SIG.symbols.pointHitRadius(f)) return f; }
    for (const f of feats) if (f.type === 'line') { const p = sp(f); for (let i = 0; i < p.length - 1; i++) if (SIG.geo.distPointSeg(sx, sy, p[i][0], p[i][1], p[i + 1][0], p[i + 1][1]) <= 8) return f; }
    for (const f of feats) if (f.type === 'polygon') {
      const p = sp(f);
      if (SIG.geo.pointInPoly(sx, sy, p)) return f;
      for (let i = 0; i < p.length; i++) { const q = p[(i + 1) % p.length]; if (SIG.geo.distPointSeg(sx, sy, p[i][0], p[i][1], q[0], q[1]) <= 7) return f; }
    }
    return null;
  }
  function hitVertex(sx, sy) {
    const f = st().features.find((x) => x.id === st().selected);
    if (!f || f.hidden || f.type === 'point') return null;
    for (let i = 0; i < f.coords.length; i++) { const [x, y] = toScr(f.coords[i][0], f.coords[i][1]); if (Math.hypot(x - sx, y - sy) <= 10) return { f, i }; }
    return null;
  }

  /* ---------- klik ---------- */
  function handleClick(p) {
    const s = st(), m = s.mode;
    const [x, y] = toImg(p.x, p.y);
    if (m === 'select') {
      const f = hitFeature(p.x, p.y);
      s.selected = f ? f.id : null;
      SIG.touch(true);
    } else if (m === 'gcp') {
      const r = s.raster;
      if (r && (x < 0 || y < 0 || x > r.w || y > r.h)) { SIG.toast('Klik di dalam area gambar peta.'); return; }
      const id = SIG.uid();
      s.gcps.push({ id, px: Math.round(x * 10) / 10, py: Math.round(y * 10) / 10, lat: null, lon: null, latText: '', lonText: '' });
      SIG.recomputeGeoref();
      SIG.focusGcp = id;
      SIG.setMode('select'); // memicu pembangunan ulang panel + fokus ke kolom Lintang
      SIG.schedulePersist();
    } else if (m === 'point') {
      addFeature('point', [[x, y]]);
    } else if (m === 'line' || m === 'polygon') {
      if (!SIG.draft) SIG.draft = { type: m, pts: [], cursor: null };
      SIG.draft.pts.push([x, y]);
      SIG.emit('redraw');
    }
  }

  /* ---------- pointer events ---------- */
  function onDown(e) {
    canvas.setPointerCapture(e.pointerId);
    const p = pos(e);
    ptrs.set(e.pointerId, p);
    if (ptrs.size === 2) {
      const [a, b] = [...ptrs.values()];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
      pinchUsed = true; down = null; return;
    }
    if (e.button === 2) return;
    const v = st().view;
    down = { x: p.x, y: p.y, cx: v.cx, cy: v.cy, moved: false, drag: null };
    if (st().mode === 'select') {
      const hv = hitVertex(p.x, p.y);
      if (hv) { down.drag = hv; SIG.pushUndo(); }
    }
    if (!down.drag && canvas) canvas.style.cursor = 'grabbing';
  }
  function onMove(e) {
    const p = pos(e);
    if (ptrs.has(e.pointerId)) ptrs.set(e.pointerId, p);
    updateStatus(p);
    if (pinch && ptrs.size === 2) {
      const [a, b] = [...ptrs.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y), cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
      const v = st().view;
      v.cx -= (cx - pinch.cx) / v.z; v.cy -= (cy - pinch.cy) / v.z;
      if (pinch.d > 0) zoomAt(cx, cy, d / pinch.d);
      pinch.d = d; pinch.cx = cx; pinch.cy = cy;
      return;
    }
    if (down) {
      const dx = p.x - down.x, dy = p.y - down.y;
      if (!down.moved && Math.hypot(dx, dy) > 4) down.moved = true;
      if (down.moved) {
        if (down.drag) {
          const [x, y] = toImg(p.x, p.y);
          down.drag.f.coords[down.drag.i] = [x, y];
          SIG.emit('redraw');
        } else {
          const v = st().view;
          v.cx = down.cx - dx / v.z; v.cy = down.cy - dy / v.z;
          SIG.emit('redraw');
        }
      }
    } else if (SIG.draft) {
      SIG.draft.cursor = toImg(p.x, p.y);
      SIG.emit('redraw');
    }
  }
  function onUp(e) {
    const p = pos(e);
    ptrs.delete(e.pointerId);
    if (ptrs.size < 2) pinch = null;
    if (canvas) canvas.style.cursor = st().mode === 'select' ? 'grab' : 'crosshair';
    if (down && !down.moved && !pinchUsed && e.button !== 2) handleClick(p);
    else if (down && down.moved && down.drag) SIG.touch(true);
    down = null;
    if (ptrs.size === 0) pinchUsed = false;
  }
  function updateStatus(p) {
    const el = document.getElementById('status-coords');
    if (!el) return;
    const [x, y] = toImg(p.x, p.y);
    let t = `Piksel ${Math.round(x)}, ${Math.round(y)}`;
    if (SIG.geo.ready()) {
      const [lon, lat] = SIG.geo.toLL(x, y);
      t += `  ·  ${SIG.geo.formatCoord(lat, 'lat', 'dms')} (${lat.toFixed(4)})  ·  ${SIG.geo.formatCoord(lon, 'lon', 'dms')} (${lon.toFixed(4)})`;
    } else t += '  ·  (belum georeferensi)';
    t += `  ·  Zoom ${Math.round(st().view.z * 100)}%`;
    const m = st().mode;
    if (m === 'gcp') t += '  ·  KLIK titik referensi pada peta';
    el.textContent = t;
  }

  /* ---------- keyboard ---------- */
  function onKey(e) {
    if (SIG.view !== 'map') return;
    const tg = e.target && e.target.tagName;
    if (tg === 'INPUT' || tg === 'TEXTAREA' || tg === 'SELECT') return;
    const k = e.key;
    if ((e.ctrlKey || e.metaKey) && k.toLowerCase() === 'z') { e.preventDefault(); SIG.undo(); return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (k === 'v' || k === 'V') SIG.setMode('select');
    else if (k === '1') SIG.setMode('point');
    else if (k === '2') SIG.setMode('line');
    else if (k === '3') SIG.setMode('polygon');
    else if (k === 'f' || k === 'F') fit();
    else if (k === 'Enter') finishDraft();
    else if (k === 'Escape') { if (SIG.draft) cancelDraft(); else if (st().mode !== 'select') SIG.setMode('select'); else { st().selected = null; SIG.touch(true); } }
    else if (k === 'Backspace' && SIG.draft) { e.preventDefault(); SIG.draft.pts.pop(); if (!SIG.draft.pts.length) SIG.draft = null; SIG.emit('redraw'); }
    else if ((k === 'Delete' || k === 'Backspace') && st().selected) { e.preventDefault(); SIG.deleteFeature(st().selected); }
  }

  SIG.deleteFeature = function (id) {
    const s = st();
    SIG.pushUndo();
    s.features = s.features.filter((f) => f.id !== id);
    if (s.selected === id) s.selected = null;
    SIG.touch(true);
  };

  function init() {
    canvas = document.getElementById('map-canvas');
    ctx = canvas.getContext('2d');
    new ResizeObserver(resize).observe(canvas.parentElement);
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    canvas.addEventListener('wheel', (e) => { e.preventDefault(); const p = pos(e); zoomAt(p.x, p.y, Math.exp(-e.deltaY * 0.0015)); }, { passive: false });
    canvas.addEventListener('dblclick', () => { if (SIG.draft) finishDraft(); });
    canvas.addEventListener('contextmenu', (e) => { e.preventDefault(); if (SIG.draft) finishDraft(); });
    document.addEventListener('keydown', onKey);
    document.getElementById('z-in').onclick = () => zoomAt(W / 2, H / 2, 1.4);
    document.getElementById('z-out').onclick = () => zoomAt(W / 2, H / 2, 1 / 1.4);
    document.getElementById('z-fit').onclick = fit;
    document.getElementById('btn-draft-finish').onclick = finishDraft;
    document.getElementById('btn-draft-cancel').onclick = () => cancelDraft();
    canvas.style.cursor = 'grab';
    resize();
  }

  SIG.mapview = { init, resize, redraw, fit, getExtent, zoomToFeature, finishDraft, cancelDraft };
})();

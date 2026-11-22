/* ui.js — panel kontrol: tab, georeferensi, grid, digitasi, layer manager, atribut, layout, ekspor */
(function () {
  'use strict';
  const SIG = (window.SIG = window.SIG || {});
  const $ = (id) => document.getElementById(id);
  const st = () => SIG.state;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const TYPE_ICON = { point: '●', line: '╱', polygon: '⬠' };
  const binders = [];
  let tab = 'data', lastMapTab = 'data', lastLayoutTab = 'layout';

  /* ---------------------------------------------------------------
     Pengikat input ⇄ state berdasarkan "path", mis. 'grid.latInt'
  --------------------------------------------------------------- */
  const getp = (p) => p.split('.').reduce((o, k) => (o == null ? o : o[k]), st());
  function setp(p, v) {
    const ks = p.split('.'), last = ks.pop();
    ks.reduce((o, k) => o[k], st())[last] = v;
  }
  function bind(id, path, kind, after) {
    const el = $(id);
    if (!el) { console.warn('bind: elemen tidak ada', id); return; }
    binders.push(() => {
      if (document.activeElement === el && kind !== 'check') return; // jangan ganggu ketikan
      const v = getp(path);
      if (kind === 'check') el.checked = !!v; else el.value = v == null ? '' : v;
    });
    el.addEventListener('input', () => {
      const v = kind === 'check' ? el.checked : kind === 'num' ? parseFloat(el.value) : el.value;
      if (kind === 'num' && !isFinite(v)) return;
      setp(path, v);
      if (after) after(v);
      SIG.touch();
    });
  }
  function syncInputs() { binders.forEach((f) => f()); }

  /* ---------------------------------------------------------------
     Tab & tampilan
  --------------------------------------------------------------- */
  /* ---- HP: panel alat & layer berupa "bottom sheet" ---- */
  const isMobile = () => window.matchMedia('(max-width:900px)').matches;
  function updateChip() {
    const c = $('m-attr'); if (!c) return;
    c.hidden = !(isMobile() && st().selected && SIG.view === 'map' && document.body.dataset.sheet !== 'layers' && !SIG.draft);
  }
  function setSheet(s) {
    document.body.dataset.sheet = s || '';
    document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === (s === 'layers' ? 'layers' : tab)));
    updateChip();
    setTimeout(() => (SIG.view === 'layout' ? SIG.layout.resize() : SIG.mapview.resize()), 40);
  }
  const closeSheetMobile = () => { if (isMobile()) { setSheet(''); setTimeout(() => { if (SIG.view === 'map' && st().raster) SIG.mapview.fit(); }, 120); } };
  /** tombol Kembali Android: tutup panel / batalkan gambar dulu. true = sudah ditangani */
  window.sigBack = function () {
    const menu = $('top-actions');
    if (menu && menu.classList.contains('open')) { menu.classList.remove('open'); return true; }
    if (document.body.dataset.sheet) { setSheet(''); return true; }
    if (SIG.draft) { SIG.mapview.cancelDraft(); return true; }
    if (st().mode !== 'select' && SIG.view === 'map') { SIG.setMode('select'); return true; }
    return false;
  };
  function setView(v) {
    SIG.view = v;
    $('map-stage').classList.toggle('hidden', v !== 'map');
    $('layout-stage').classList.toggle('hidden', v !== 'layout');
    document.querySelectorAll('#viewtabs button').forEach((b) => b.classList.toggle('on', b.dataset.view === v));
    if (v === 'map') SIG.mapview.resize(); else SIG.layout.resize();
    SIG.emit('redraw');
  }
  function setTab(t) {
    tab = t;
    document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === t));
    document.querySelectorAll('.pane').forEach((p) => p.classList.toggle('on', p.dataset.pane === t));
    const lay = t === 'layout' || t === 'export';
    if (lay) lastLayoutTab = t; else lastMapTab = t;
    if (lay && SIG.view !== 'layout') { st().layout.view = st().layout.view || null; }
    setView(lay ? 'layout' : 'map');
    if (t === 'export') renderExportInfo();
    if (t !== 'georef' && st().mode === 'gcp') SIG.setMode('select');
    updateChip();
    if (SIG.ads) SIG.ads.onTab(t);
  }

  /* ---------------------------------------------------------------
     Render panel-panel daftar
  --------------------------------------------------------------- */
  function renderModes() {
    document.querySelectorAll('.mode-btn').forEach((b) => b.classList.toggle('on', b.dataset.mode === st().mode));
    $('btn-add-gcp').classList.toggle('on', st().mode === 'gcp');
    $('btn-add-gcp').textContent = st().mode === 'gcp' ? '👆 Klik titik pada peta… (Esc batal)' : '＋ Tambah titik referensi (klik di peta)';
    $('btn-add-line').classList.toggle('on', SIG.layoutTool === 'line');
    $('btn-add-line').textContent = SIG.layoutTool === 'line' ? '👆 Seret di layout untuk menggambar garis…' : '＋ Tambah garis bebas (seret di layout)';
  }

  function renderRasterInfo() {
    const r = st().raster;
    $('raster-info').innerHTML = r ? `✔ <b>${esc(r.name)}</b> — ${r.w} × ${r.h} piksel` : 'Belum ada raster.';
  }

  function renderGcps() {
    const box = $('gcp-list');
    const ae = document.activeElement;
    const keep = ae && box.contains(ae) && ae.dataset && ae.dataset.f ? { id: ae.closest('.gcp').dataset.id, f: ae.dataset.f } : null;
    if (keep && !SIG.focusGcp) SIG.focusGcp = keep.id;
    box.innerHTML = '';
    st().gcps.forEach((g, i) => {
      const d = document.createElement('div');
      d.className = 'gcp';
      d.dataset.id = g.id;
      d.innerHTML = `<div class="gcp-head"><span><b>Titik T${i + 1}</b> · piksel (${Math.round(g.px)}, ${Math.round(g.py)})</span><button data-del title="Hapus titik">🗑</button></div>
        <div class="grid2">
          <label>Lintang<input type="text" data-f="lat" placeholder="-6.2 atau 6°12' LS" value="${esc(g.latText)}"></label>
          <label>Bujur<input type="text" data-f="lon" placeholder="106.8 atau 106°49' BT" value="${esc(g.lonText)}"></label>
        </div>`;
      box.appendChild(d);
      ['lat', 'lon'].forEach((f) => {
        const inp = d.querySelector(`[data-f=${f}]`);
        markValid(inp, g[f + 'Text'], f);
      });
    });
    if (SIG.focusGcp) {
      const el = box.querySelector(`[data-id="${SIG.focusGcp}"] [data-f=lat]`);
      if (el) el.focus();
      SIG.focusGcp = null;
    }
    renderGeorefStatus();
  }
  function markValid(inp, text, axis) {
    inp.classList.toggle('bad', !!text && SIG.geo.parseCoord(text, axis) === null);
  }
  function renderGeorefStatus() {
    const g = st().georef, el = $('georef-status');
    if (!g) { el.className = 'status'; el.textContent = ''; return; }
    if (g.ok) {
      el.className = 'status ok';
      el.innerHTML = `✔ <b>Georeferensi aktif</b> — ${g.mode}<br>${g.n > 3 ? 'Galat rata-rata (RMSE): ' + g.rmseKm.toFixed(2) + ' km' : 'Galat tidak dapat dihitung (titik = jumlah minimum; tambah titik untuk uji akurasi)'}${g.warnings.length ? '<br>⚠ ' + g.warnings.map(esc).join('<br>⚠ ') : ''}`;
    } else { el.className = 'status err'; el.textContent = '⚠ ' + g.msg; }
    $('grid-warn').hidden = !!(g && g.ok);
  }

  function renderLayers() {
    const s = st(), box = $('layer-list');
    let h = '';
    h += `<div class="group-title">Raster</div>`;
    if (s.raster) {
      h += `<div class="lrow"><button class="eye ${s.raster.visible ? '' : 'off'}" data-act="toggle-raster" title="Tampilkan/sembunyikan">👁</button><span class="name" style="border:0;font-weight:600">🖼 ${esc(s.raster.name)}</span></div>
            <div class="opacity-row">Transparansi <input type="range" id="rng-opacity" min="0.1" max="1" step="0.05" value="${s.raster.opacity}"></div>`;
    } else h += `<div class="empty-note">(belum ada raster)</div>`;
    h += `<div class="group-title">Garis astronomis</div>
          <div class="lrow"><button class="eye ${s.grid.visible ? '' : 'off'}" data-act="toggle-grid" title="Tampilkan/sembunyikan">👁</button><span class="name" style="border:0">🌐 Lintang &amp; bujur</span></div>`;
    h += `<div class="group-title">Layer vektor</div>`;
    for (const ly of s.layers) {
      const fs = s.features.filter((f) => f.layerId === ly.id);
      h += `<div class="lrow ${ly.id === s.activeLayer ? 'active' : ''}" data-layer="${ly.id}">
              <button class="eye ${ly.visible ? '' : 'off'}" data-act="toggle-layer" title="Tampilkan/sembunyikan layer">👁</button>
              <input class="name" data-act="rename-layer" value="${esc(ly.name)}">
              <label class="tgt" title="Layer tujuan digitasi"><input type="radio" name="activeLayer" data-act="set-active" ${ly.id === s.activeLayer ? 'checked' : ''}> aktif</label>
              <button class="mini" data-act="del-layer" title="Hapus layer">🗑</button>
            </div>`;
      for (const f of fs) {
        h += `<div class="frow ${f.id === s.selected ? 'sel' : ''} ${f.hidden ? 'hid' : ''}" data-fid="${f.id}">
                <button class="eye ${f.hidden ? 'off' : ''}" data-act="toggle-feature" title="Tampilkan/sembunyikan objek">👁</button>
                ${f.type === 'point' ? `<img class="sw-ico" src="${esc(pointThumb(f))}" alt="">` : `<span class="sw" style="background:${esc(f.color)}"></span><span>${TYPE_ICON[f.type]}</span>`}<span class="nm">${esc(f.name || '(tanpa nama)')}</span>
              </div>`;
      }
      if (!fs.length) h += `<div class="frow" style="cursor:default;color:var(--muted)">— kosong —</div>`;
    }
    box.innerHTML = h;
    // dropdown layer aktif (tab digitasi)
    const sel = $('active-layer');
    sel.innerHTML = s.layers.map((l) => `<option value="${l.id}" ${l.id === s.activeLayer ? 'selected' : ''}>${esc(l.name)}</option>`).join('');
  }

  function renderAttrs() {
    const box = $('attr-panel'), s = st();
    const f = s.features.find((x) => x.id === s.selected);
    if (!f) {
      box.innerHTML = `<div class="empty-note">Pilih objek di peta (mode ✋ Pilih) atau dari daftar layer untuk mengisi nama &amp; keterangan.</div>`;
      return;
    }
    const n = f.coords.length;
    box.innerHTML = `
      <div class="meta">${TYPE_ICON[f.type]} ${{ point: 'Titik', line: 'Garis', polygon: 'Poligon' }[f.type]} · ${n} titik${f.type === 'point' && SIG.geo.ready() ? ' · ' + coordText(f.coords[0]) : ''}</div>
      <label>Nama<input type="text" id="at-name" value="${esc(f.name)}"></label>
      <label>Keterangan<textarea id="at-desc">${esc(f.desc)}</textarea></label>
      <div class="grid2">
        <label>Warna<input type="color" id="at-color" value="${esc(f.color)}"></label>
        <label>Layer<select id="at-layer">${s.layers.map((l) => `<option value="${l.id}" ${l.id === f.layerId ? 'selected' : ''}>${esc(l.name)}</option>`).join('')}</select></label>
      </div>
      ${styleHtml(f)}
      ${measureText(f)}
      <div class="row"><button id="at-zoom">🔍 Zoom ke objek</button><button id="at-del" class="danger">🗑 Hapus</button></div>`;
    if (SIG.focusNameNext) {
      SIG.focusNameNext = false;
      const inp = $('at-name'); inp.focus(); inp.select();
    }
    $('at-name').oninput = (e) => { f.name = e.target.value; SIG.touch(); renderLayers(); };
    $('at-desc').oninput = (e) => { f.desc = e.target.value; SIG.touch(); };
    $('at-color').oninput = (e) => { f.color = e.target.value; SIG.touch(); renderLayers(); };
    $('at-color').onchange = () => renderAttrs();
    $('at-layer').onchange = (e) => { SIG.pushUndo(); f.layerId = e.target.value; SIG.touch(true); };
    $('at-del').onclick = () => SIG.deleteFeature(f.id);
    $('at-zoom').onclick = () => { setTab(lastMapTab === 'layout' ? 'digitize' : lastMapTab); SIG.mapview.zoomToFeature(f); };
    bindStyle(box, f);
    $('at-name').addEventListener('keydown', (e) => { if (e.key === 'Enter') e.target.blur(); });
  }

  /* ---------------------------------------------------------------
     Gaya objek: simbol/ikon titik, gaya garis, gaya poligon
  --------------------------------------------------------------- */
  function pointThumb(f) {
    const sty = SIG.symbols.styleOf(f), ic = sty.icon && SIG.symbols.iconOf(sty.icon);
    return ic ? ic.dataUrl : SIG.symbols.thumbPoint(sty.symbol, f.color, 20);
  }
  function styleHtml(f) {
    const SY = SIG.symbols, sty = SY.styleOf(f);
    if (f.type === 'point') {
      const icons = st().icons || [];
      return `<h4>Simbol titik</h4>
        <div class="sym-grid" id="sym-grid">${SY.POINTS.map((p) => `<button type="button" data-sym="${p.id}" title="${p.label}" class="${!sty.icon && sty.symbol === p.id ? 'on' : ''}"><img src="${SY.thumbPoint(p.id, f.color, 28)}" alt="${p.label}"></button>`).join('')}</div>
        <h4>Ikon gambar sendiri</h4>
        <div class="sym-grid" id="icon-grid">${icons.map((i) => `<button type="button" data-icon="${i.id}" title="${esc(i.name)}" class="${sty.icon === i.id ? 'on' : ''}"><img src="${i.dataUrl}" alt=""><span class="x" data-delicon="${i.id}" title="Hapus ikon dari pustaka">×</span></button>`).join('')}
          <label class="icon-up" title="Unggah ikon (PNG / JPG)">＋<input type="file" id="file-icon" accept="image/png,image/jpeg" multiple hidden></label></div>
        <label>Ukuran ikon: <b id="at-size-v">${sty.size}</b> px<input type="range" id="at-size" min="10" max="64" step="1" value="${sty.size}"></label>`;
    }
    if (f.type === 'line') {
      return `<h4>Gaya garis</h4>
        <div class="style-list" id="line-presets">${SY.LINE_ORDER.map((id) => { const d = SY.LINES[id]; return `<button type="button" data-preset="${id}" class="${sty.preset === id ? 'on' : ''}"><img src="${SY.thumbLine(id, d.color || f.color, d.width)}" alt=""><span>${d.label}</span></button>`; }).join('')}</div>
        <label>Ketebalan: <b id="at-width-v">${sty.width}</b> px<input type="range" id="at-width" min="1" max="14" step="0.5" value="${sty.width}"></label>`;
    }
    const oc = sty.outlineColor || f.color;
    return `<h4>Gaya poligon</h4>
      <div class="style-list" id="poly-presets">${SY.POLY_ORDER.map((id) => `<button type="button" data-poly="${id}" class="${sty.preset === id ? 'on' : ''}"><img src="${SY.thumbPoly(id, SY.POLYS[id].color || f.color)}" alt=""><span>${SY.POLYS[id].label}</span></button>`).join('')}</div>
      <h4>Pola isi</h4>
      <div class="sym-grid pat-grid" id="pat-grid">${SY.PATTERN_ORDER.map((p) => `<button type="button" data-pat="${p}" title="${SY.PATTERNS[p]}" class="${sty.pattern === p ? 'on' : ''}"><img src="${SY.thumbPattern(p, f.color)}" alt="${SY.PATTERNS[p]}"></button>`).join('')}</div>
      <label>Kepekatan isi: <b id="at-fillop-v">${Math.round(sty.fillOpacity * 100)}</b>%<input type="range" id="at-fillop" min="0" max="1" step="0.05" value="${sty.fillOpacity}"></label>
      <h4>Garis tepi</h4>
      <label>Gaya<select id="at-outline">${SY.LINE_ORDER.map((id) => `<option value="${id}" ${sty.outline === id ? 'selected' : ''}>${SY.LINES[id].label}</option>`).join('')}</select></label>
      <div class="grid2">
        <label>Tebal: <b id="at-ow-v">${sty.outlineWidth}</b> px<input type="range" id="at-ow" min="0.5" max="10" step="0.5" value="${sty.outlineWidth}"></label>
        <label>Warna tepi<input type="color" id="at-oc" value="${esc(oc)}"></label>
      </div>
      <button type="button" id="at-oc-reset" class="mini-btn">Warna tepi mengikuti gaya / isi</button>`;
  }
  function readIcon(file) {
    return new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(file); });
  }
  async function addIcons(files, f) {
    let last = null;
    for (const file of files) {
      if (!/\.(png|jpe?g)$/i.test(file.name) && !/^image\/(png|jpeg)$/.test(file.type)) { SIG.toast('⚠ Ikon harus berformat PNG atau JPG.'); continue; }
      try {
        const im = await SIG.loadImage(await readIcon(file));
        const k = Math.min(1, 128 / Math.max(im.width, im.height)), cv = document.createElement('canvas');
        cv.width = Math.max(1, Math.round(im.width * k)); cv.height = Math.max(1, Math.round(im.height * k));
        cv.getContext('2d').drawImage(im, 0, 0, cv.width, cv.height);
        const dataUrl = cv.toDataURL('image/png'), id = SIG.uid();
        st().icons.push({ id, name: file.name.replace(/\.[^.]+$/, ''), dataUrl });
        SIG.iconImgs[id] = await SIG.loadImage(dataUrl);
        last = id;
      } catch (e) { SIG.toast('⚠ Gagal memuat ' + file.name); }
    }
    if (last) { SIG.pushUndo(); SIG.symbols.setStyle(f, { icon: last }); SIG.touch(true); SIG.toast('Ikon dipasang pada titik terpilih.'); }
  }
  function bindStyle(box, f) {
    const SY = SIG.symbols, num = (id) => parseFloat($(id).value);
    const live = (id, vid, key, fmt) => { const el = $(id); if (!el) return; el.oninput = () => { const v = num(id); SY.setStyle(f, { [key]: v }); $(vid).textContent = fmt ? fmt(v) : v; SIG.touch(); }; };
    live('at-size', 'at-size-v', 'size'); live('at-width', 'at-width-v', 'width');
    live('at-fillop', 'at-fillop-v', 'fillOpacity', (v) => Math.round(v * 100)); live('at-ow', 'at-ow-v', 'outlineWidth');
    if ($('at-outline')) $('at-outline').onchange = (e) => { SIG.pushUndo(); SY.setStyle(f, { outline: e.target.value, outlineColor: null }); SIG.touch(true); };
    if ($('at-oc')) $('at-oc').oninput = (e) => { SY.setStyle(f, { outlineColor: e.target.value }); SIG.touch(); };
    if ($('at-oc-reset')) $('at-oc-reset').onclick = () => { SY.setStyle(f, { outlineColor: null }); SIG.touch(true); };
    if ($('file-icon')) $('file-icon').onchange = (e) => { const fl = Array.from(e.target.files); e.target.value = ''; addIcons(fl, f); };
    box.onclick = (e) => {
      const del = e.target.closest('[data-delicon]');
      if (del) {
        e.stopPropagation(); e.preventDefault();
        const id = del.dataset.delicon; SIG.pushUndo();
        st().icons = st().icons.filter((i) => i.id !== id); delete SIG.iconImgs[id];
        st().features.forEach((x) => { if (x.style && x.style.icon === id) x.style.icon = null; });
        SIG.touch(true); return;
      }
      const b = e.target.closest('button[data-sym],button[data-icon],button[data-preset],button[data-poly],button[data-pat]');
      if (!b) return;
      SIG.pushUndo();
      if (b.dataset.sym) SY.setStyle(f, { symbol: b.dataset.sym, icon: null });
      else if (b.dataset.icon) SY.setStyle(f, { icon: b.dataset.icon });
      else if (b.dataset.preset) SY.applyLinePreset(f, b.dataset.preset);
      else if (b.dataset.poly) SY.applyPolyPreset(f, b.dataset.poly);
      else if (b.dataset.pat) { const o = { pattern: b.dataset.pat }; if (b.dataset.pat !== 'none' && !(SY.styleOf(f).fillOpacity > 0)) o.fillOpacity = 0.3; SY.setStyle(f, o); }
      SIG.touch(true);
    };
  }
  function coordText(c) {
    const [lon, lat] = SIG.geo.toLL(c[0], c[1]);
    return `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
  }
  /** panjang garis / luas poligon (perkiraan) bila sudah georeferensi */
  function measureText(f) {
    if (!SIG.geo.ready() || f.type === 'point') return '';
    const pts = f.coords.map((c) => SIG.geo.toLL(c[0], c[1]));
    const R = 6371008.8, rad = Math.PI / 180;
    const hav = (a, b) => { const dLat = (b[1] - a[1]) * rad, dLon = (b[0] - a[0]) * rad; const x = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dLon / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); };
    if (f.type === 'line') { let L = 0; for (let i = 0; i < pts.length - 1; i++) L += hav(pts[i], pts[i + 1]); return `<div class="meta">📏 Panjang ≈ ${SIG.geo.formatDistance(L)}</div>`; }
    // luas: proyeksi lokal equirectangular
    const lat0 = pts.reduce((a, p) => a + p[1], 0) / pts.length;
    const xy = pts.map((p) => [(p[0] * rad * R) * Math.cos(lat0 * rad), p[1] * rad * R]);
    let A = 0, P = 0;
    for (let i = 0; i < xy.length; i++) { const j = (i + 1) % xy.length; A += xy[i][0] * xy[j][1] - xy[j][0] * xy[i][1]; P += hav(pts[i], pts[j]); }
    A = Math.abs(A) / 2;
    return `<div class="meta">📐 Luas ≈ ${(A / 1e6).toLocaleString('id-ID', { maximumFractionDigits: 1 })} km² · Keliling ≈ ${SIG.geo.formatDistance(P)}</div>`;
  }

  function renderLines() {
    const box = $('line-list'), L = st().layout;
    box.innerHTML = '';
    L.lines.forEach((ln, i) => {
      const d = document.createElement('div');
      d.className = 'line-item' + (SIG.layoutSel && SIG.layoutSel.id === ln.id ? ' sel' : '');
      d.dataset.id = ln.id;
      d.innerHTML = `<input type="color" data-f="color" value="${esc(ln.color)}" title="Warna">
        <input type="number" data-f="width" min="0.5" max="20" step="0.5" value="${ln.width}" title="Tebal">
        <select data-f="dash"><option value="solid">penuh</option><option value="dashed">putus-putus</option><option value="dotted">titik-titik</option></select>
        <button data-del title="Hapus garis">🗑</button>`;
      d.querySelector('[data-f=dash]').value = ln.dash;
      box.appendChild(d);
    });
  }

  function renderExportInfo() {
    const L = st().layout, [W, H] = SIG.layout.pageSize(L), sc = parseFloat($('export-scale').value) || 1;
    const mm = (px) => Math.round((px * 25.4) / 96);
    $('export-info').innerHTML = `Kertas <b>${L.paper}</b> ${L.orient === 'landscape' ? 'lanskap' : 'potret'} (${mm(W)} × ${mm(H)} mm)<br>Ukuran gambar: <b>${Math.round(W * sc)} × ${Math.round(H * sc)} px</b>`;
  }

  function rebuild() {
    renderModes(); renderRasterInfo(); renderGcps(); renderLayers(); renderAttrs(); renderLines();
    $('chk-show-gcps').checked = st().showGcps;
    $('chk-labels').checked = st().showLabels;
  }

  /* ---------------------------------------------------------------
     Inisialisasi & event
  --------------------------------------------------------------- */
  function init() {
    /* tab & tampilan */
    $('tabs').addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      const t = b.dataset.tab, sheet = document.body.dataset.sheet || '';
      if (isMobile()) {
        if (t === 'layers') { setSheet(sheet === 'layers' ? '' : 'layers'); return; }
        if (t === tab && sheet === 'tools') { setSheet(''); return; } // ketuk lagi = tutup panel
        setTab(t); setSheet('tools'); return;
      }
      setTab(t);
    });
    $('viewtabs').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { setTab(b.dataset.view === 'map' ? lastMapTab : lastLayoutTab); closeSheetMobile(); } });
    $('btn-menu').onclick = (e) => { e.stopPropagation(); $('top-actions').classList.toggle('open'); };
    $('top-actions').addEventListener('click', () => $('top-actions').classList.remove('open'));
    document.addEventListener('click', (e) => { if (!e.target.closest('#top-actions,#btn-menu')) $('top-actions').classList.remove('open'); });
    $('m-attr').onclick = () => { setSheet('layers'); const p = $('attr-panel'); if (p && p.scrollIntoView) p.scrollIntoView({ block: 'nearest' }); };
    SIG.on('ui', updateChip); SIG.on('redraw', updateChip);
    window.addEventListener('resize', () => { if (!isMobile()) { delete document.body.dataset.sheet; updateChip(); } });

    /* data raster */
    async function handleFile(file) {
      if (!file) return;
      try {
        SIG.toast('Memuat peta…', 1500);
        const r = await SIG.raster.loadFile(file);
        SIG.raster.setRaster(r);
        SIG.mapview.fit();
        SIG.touch(true);
        SIG.toast(r.note || 'Peta dimuat. Lanjut ke tab Georef untuk memberi koordinat.', 4500);
        if (r.gcps && r.gcps.length) setTab('grid'); else setTab('georef');
        closeSheetMobile();
      } catch (err) { SIG.toast('⚠ ' + err.message, 6000); }
    }
    $('file-raster').addEventListener('change', (e) => { handleFile(e.target.files[0]); e.target.value = ''; });
    const drop = $('drop');
    ['dragenter', 'dragover'].forEach((ev) => document.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
    ['dragleave', 'drop'].forEach((ev) => document.addEventListener(ev, (e) => { e.preventDefault(); if (ev === 'dragleave' && e.relatedTarget) return; drop.classList.remove('over'); }));
    document.addEventListener('drop', (e) => { const f = e.dataTransfer && e.dataTransfer.files[0]; if (f) handleFile(f); });
    $('btn-sample').onclick = async () => { SIG.raster.setRaster(await SIG.raster.makeSample()); SIG.mapview.fit(); SIG.touch(true); setTab('grid'); closeSheetMobile(); SIG.toast('Peta contoh dimuat (sudah georeferensi).'); };
    $('btn-raster-clear').onclick = () => { if (!st().raster) return; st().raster = null; st().gcps = []; SIG.recomputeGeoref(); st().layout.view = null; SIG.touch(true); };

    /* georeferensi */
    $('btn-add-gcp').onclick = () => { if (st().mode === 'gcp') SIG.setMode('select'); else { if (!st().raster) { SIG.toast('Impor peta raster dulu.'); return; } setView('map'); SIG.setMode('gcp'); } };
    $('gcp-list').addEventListener('input', (e) => {
      const inp = e.target.closest('input[data-f]'); if (!inp) return;
      const g = st().gcps.find((x) => x.id === inp.closest('.gcp').dataset.id), axis = inp.dataset.f;
      g[axis + 'Text'] = inp.value;
      g[axis] = SIG.geo.parseCoord(inp.value, axis);
      markValid(inp, inp.value, axis);
      SIG.recomputeGeoref(); renderGeorefStatus(); SIG.touch();
    });
    $('gcp-list').addEventListener('click', (e) => {
      if (!e.target.closest('[data-del]')) return;
      const id = e.target.closest('.gcp').dataset.id;
      st().gcps = st().gcps.filter((x) => x.id !== id);
      SIG.recomputeGeoref(); SIG.touch(true);
    });
    $('chk-show-gcps').onchange = (e) => { st().showGcps = e.target.checked; SIG.touch(); };

    /* grid */
    bind('grid-visible', 'grid.visible', 'check', () => renderLayers());
    bind('grid-latInt', 'grid.latInt', 'num', (v) => { if (st().grid.linked) { st().grid.lonInt = v; syncInputs(); } });
    bind('grid-lonInt', 'grid.lonInt', 'num', (v) => { if (st().grid.linked) { st().grid.latInt = v; syncInputs(); } });
    bind('grid-unit', 'grid.unit', 'text');
    bind('grid-linked', 'grid.linked', 'check', (v) => { if (v) { st().grid.lonInt = st().grid.latInt; syncInputs(); } });
    bind('grid-color', 'grid.color', 'text');
    bind('grid-width', 'grid.width', 'num');
    bind('grid-dash', 'grid.dash', 'text');
    bind('grid-format', 'grid.format', 'text');
    bind('grid-labels', 'grid.labels', 'check');
    bind('grid-labelSize', 'grid.labelSize', 'num');
    bind('grid-emphasize', 'grid.emphasize', 'check');
    $('grid-presets').addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      const g = st().grid; g.unit = 'deg'; g.latInt = g.lonInt = parseFloat(b.dataset.v); g.linked = true;
      syncInputs(); SIG.touch();
    });

    /* digitasi */
    document.addEventListener('click', (e) => { const b = e.target.closest('.mode-btn'); if (b) { setView('map'); SIG.setMode(b.dataset.mode); } });
    $('active-layer').onchange = (e) => { st().activeLayer = e.target.value; SIG.touch(true); };
    $('chk-labels').onchange = (e) => { st().showLabels = e.target.checked; SIG.touch(); };
    $('btn-undo').onclick = $('btn-undo2').onclick = () => SIG.undo();
    $('btn-geojson').onclick = () => { if (!st().features.length) { SIG.toast('Belum ada objek.'); return; } SIG.exporter.exportGeojson($('export-name').value); if (!SIG.geo.ready()) SIG.toast('Belum georeferensi: koordinat GeoJSON berupa piksel.', 5000); };
    $('btn-clear-features').onclick = () => { if (st().features.length && confirm('Hapus SEMUA objek digitasi?')) { SIG.pushUndo(); st().features = []; st().selected = null; SIG.touch(true); } };

    /* layer manager */
    $('btn-add-layer').onclick = () => {
      SIG.pushUndo();
      const l = { id: SIG.uid(), name: 'Layer ' + (st().layers.length + 1), visible: true };
      st().layers.push(l); st().activeLayer = l.id; SIG.touch(true);
    };
    const ll = $('layer-list');
    ll.addEventListener('click', (e) => {
      const act = e.target.closest('[data-act]'), s = st();
      const fr = e.target.closest('.frow[data-fid]');
      if (act) {
        const a = act.dataset.act;
        if (a === 'toggle-raster') { s.raster.visible = !s.raster.visible; SIG.touch(true); }
        else if (a === 'toggle-grid') { s.grid.visible = !s.grid.visible; $('grid-visible').checked = s.grid.visible; SIG.touch(true); }
        else if (a === 'toggle-layer') { const l = s.layers.find((x) => x.id === act.closest('[data-layer]').dataset.layer); l.visible = !l.visible; SIG.touch(true); }
        else if (a === 'set-active') { s.activeLayer = act.closest('[data-layer]').dataset.layer; SIG.touch(true); }
        else if (a === 'del-layer') {
          const id = act.closest('[data-layer]').dataset.layer;
          const n = s.features.filter((f) => f.layerId === id).length;
          if (s.layers.length === 1) { SIG.toast('Minimal harus ada satu layer.'); return; }
          if (n && !confirm(`Hapus layer beserta ${n} objek di dalamnya?`)) return;
          SIG.pushUndo();
          s.layers = s.layers.filter((l) => l.id !== id); s.features = s.features.filter((f) => f.layerId !== id);
          if (s.activeLayer === id) s.activeLayer = s.layers[0].id;
          if (!s.features.find((f) => f.id === s.selected)) s.selected = null;
          SIG.touch(true);
        } else if (a === 'toggle-feature') { const f = s.features.find((x) => x.id === fr.dataset.fid); f.hidden = !f.hidden; SIG.touch(true); }
        return;
      }
      if (fr) { s.selected = fr.dataset.fid; SIG.touch(true); }
    });
    ll.addEventListener('input', (e) => {
      if (e.target.id === 'rng-opacity') { st().raster.opacity = parseFloat(e.target.value); SIG.touch(); }
      else if (e.target.dataset.act === 'rename-layer') {
        const l = st().layers.find((x) => x.id === e.target.closest('[data-layer]').dataset.layer); l.name = e.target.value;
        const o = $('active-layer').querySelector(`option[value="${l.id}"]`); if (o) o.textContent = l.name;
        SIG.touch();
      }
    });

    /* layout */
    bind('layout-paper', 'layout.paper', 'text', () => { SIG.layout.resize(); renderExportInfo(); });
    bind('layout-orient', 'layout.orient', 'text', () => { SIG.layout.resize(); renderExportInfo(); });
    bind('layout-showTitle', 'layout.showTitle', 'check');
    bind('layout-title', 'layout.title', 'text');
    bind('layout-subtitle', 'layout.subtitle', 'text');
    bind('layout-titleSize', 'layout.titleSize', 'num');
    bind('layout-titleAlign', 'layout.titleAlign', 'text');
    bind('layout-mapGrid', 'layout.mapGrid', 'check');
    bind('layout-mapVectors', 'layout.mapVectors', 'check');
    bind('layout-mapLabels', 'layout.mapLabels', 'check');
    bind('layout-legend-show', 'layout.legend.show', 'check');
    bind('layout-legend-title', 'layout.legend.title', 'text');
    bind('layout-legend-mode', 'layout.legend.mode', 'text');
    bind('layout-legend-size', 'layout.legend.size', 'num');
    bind('layout-scale-show', 'layout.scale.show', 'check');
    bind('layout-north-show', 'layout.north.show', 'check');
    bind('layout-north-size', 'layout.north.size', 'num');
    bind('layout-credit-show', 'layout.credit.show', 'check');
    bind('layout-credit-text', 'layout.credit.text', 'text');
    bind('layout-logo-show', 'layout.logo.show', 'check');
    bind('layout-logo-h', 'layout.logo.h', 'num');
    bind('layout-border-show', 'layout.border.show', 'check');
    bind('layout-border-style', 'layout.border.style', 'text');
    bind('layout-border-width', 'layout.border.width', 'num');
    bind('layout-border-color', 'layout.border.color', 'text');
    bind('layout-margin', 'layout.margin', 'num');
    bind('layout-titleLine-show', 'layout.titleLine.show', 'check');
    bind('layout-titleLine-width', 'layout.titleLine.width', 'num');
    bind('layout-titleLine-color', 'layout.titleLine.color', 'text');
    $('btn-view-fromMap').onclick = () => SIG.layout.fromMap();
    $('btn-view-fit').onclick = () => SIG.layout.fitImage();
    /* ukuran isi peta + skala otomatis */
    const fmtN = (n) => Math.round(n).toLocaleString('id-ID');
    function syncMapSize() {
      if (SIG.view !== 'layout') return;
      const i = SIG.layout.info(), ok = !!i;
      ['ms-slider', 'ms-in', 'ms-out'].forEach((id) => ($(id).disabled = !ok));
      const geo = ok && i.ratio != null;
      $('ms-n').disabled = $('ms-apply').disabled = !geo;
      $('ms-presets').querySelectorAll('button').forEach((b) => (b.disabled = !geo));
      if (!ok) { $('ms-pct').textContent = '—'; $('ms-scale').textContent = 'Impor peta raster dulu.'; return; }
      $('ms-pct').textContent = Math.round(i.pct) + '%';
      if (document.activeElement !== $('ms-slider')) $('ms-slider').value = Math.max(-3, Math.min(4, Math.log2(i.pct / 100))).toFixed(2);
      $('ms-scale').innerHTML = geo ? `Skala peta: <b>1 : ${fmtN(i.ratio)}</b> <em>(otomatis)</em>` : 'Skala belum bisa dihitung — lakukan georeferensi dulu.';
      if (geo && document.activeElement !== $('ms-n')) $('ms-n').value = Math.round(i.ratio);
    }
    $('ms-slider').oninput = (e) => SIG.layout.setRelZoomLog2(parseFloat(e.target.value));
    $('ms-in').onclick = () => SIG.layout.zoomBy(1.25);
    $('ms-out').onclick = () => SIG.layout.zoomBy(0.8);
    const applyScale = () => { const n = parseFloat($('ms-n').value); if (!(n > 0) || !SIG.layout.setScale(n)) SIG.toast('Masukkan angka skala yang valid, mis. 5000000.'); };
    $('ms-apply').onclick = applyScale;
    $('ms-n').addEventListener('keydown', (e) => { if (e.key === 'Enter') applyScale(); });
    $('ms-presets').onclick = (e) => { const b = e.target.closest('button[data-n]'); if (b) { $('ms-n').value = b.dataset.n; applyScale(); } };
    SIG.on('redraw', syncMapSize); SIG.on('ui', syncMapSize);
    syncMapSize();
    document.querySelectorAll('select.place').forEach((sel) => sel.addEventListener('change', () => { if (sel.value) SIG.layout.placeAt(sel.dataset.kind, sel.value); sel.value = ''; }));

    $('file-logo').addEventListener('change', async (e) => {
      const f = e.target.files[0]; e.target.value = '';
      if (!f) return;
      try {
        const url = await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(f); });
        const lg = st().layout.logo;
        lg._img = await SIG.loadImage(url); lg.dataUrl = url; lg.show = true;
        syncInputs(); SIG.touch(true);
        SIG.toast('Logo dipasang — seret di layout untuk memindahkan.');
      } catch (err) { SIG.toast('⚠ Gagal memuat logo (gunakan PNG/JPG).'); }
    });
    $('btn-logo-clear').onclick = () => { const lg = st().layout.logo; lg.dataUrl = null; lg._img = null; lg.show = false; syncInputs(); SIG.touch(true); };

    $('btn-add-line').onclick = () => { SIG.layoutTool = SIG.layoutTool === 'line' ? null : 'line'; renderModes(); SIG.emit('redraw'); };
    const lineList = $('line-list');
    lineList.addEventListener('input', (e) => {
      const f = e.target.dataset.f; if (!f) return;
      const ln = st().layout.lines.find((x) => x.id === e.target.closest('.line-item').dataset.id);
      ln[f] = f === 'width' ? parseFloat(e.target.value) || 1 : e.target.value;
      SIG.touch();
    });
    lineList.addEventListener('click', (e) => {
      const item = e.target.closest('.line-item'); if (!item) return;
      if (e.target.closest('[data-del]')) SIG.layout.removeLine(item.dataset.id);
      else { SIG.layoutSel = { kind: 'line', id: item.dataset.id }; renderLines(); SIG.emit('redraw'); }
    });

    /* ekspor */
    const run = (k) => SIG.exporter.exportAs(k, $('export-name').value, parseFloat($('export-scale').value) || 2);
    $('btn-export-png').onclick = () => run('png');
    $('btn-export-jpg').onclick = () => run('jpg');
    $('btn-export-pdf').onclick = () => run('pdf');
    $('export-scale').onchange = renderExportInfo;

    /* proyek */
    $('btn-save-project').onclick = () => SIG.exporter.saveProject($('export-name').value);
    $('file-project').addEventListener('change', async (e) => {
      const f = e.target.files[0]; e.target.value = '';
      if (!f) return;
      try {
        const obj = JSON.parse(await f.text());
        await SIG.applyState(obj);
        syncInputs(); SIG.mapview.fit(); SIG.touch(true); SIG.toast('Proyek dibuka.');
      } catch (err) { SIG.toast('⚠ File proyek tidak valid.'); }
    });
    $('btn-reset').onclick = async () => {
      if (!confirm('Reset semua data (peta, titik referensi, objek, pengaturan)?')) return;
      SIG.clearSaved(); await SIG.applyState(null); syncInputs(); SIG.mapview.fit(); SIG.touch(true); setTab('data');
    };

    /* Esc membatalkan mode gcp / alat garis */
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && st().mode === 'gcp') SIG.setMode('select');
    });
  }

  SIG.ui = { init, rebuild, syncInputs, setTab, setView };
})();

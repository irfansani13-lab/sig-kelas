/* exporter.js — ekspor layout ke PNG, JPEG, PDF (PDF dibuat sendiri tanpa library) dan GeoJSON */
(function () {
  'use strict';
  const SIG = (window.SIG = window.SIG || {});

  const blobToBase64 = (blob) => new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(',')[1]); fr.onerror = rej; fr.readAsDataURL(blob); });
  const inApp = () => !!(window.AndroidBridge && typeof window.AndroidBridge.saveFile === 'function');
  /** simpan file: di aplikasi Android lewat jembatan native (Download/SIG Kelas), di browser lewat unduhan biasa */
  async function download(blob, filename) {
    if (inApp()) {
      try { window.AndroidBridge.saveFile(await blobToBase64(blob), filename, blob.type || 'application/octet-stream'); }
      catch (e) { SIG.toast('⚠ Gagal menyimpan file.'); }
      return;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  const toBlob = (cv, type, q) => new Promise((res) => cv.toBlob(res, type, q));
  const safeName = (n) => (String(n || 'peta').trim().replace(/[\\/:*?"<>|]+/g, '-') || 'peta');

  /** Bungkus satu gambar JPEG ke dalam PDF 1 halaman (ukuran kertas sesuai layout) */
  function buildPdf(jpeg, imgW, imgH, ptW, ptH) {
    const enc = new TextEncoder();
    const chunks = [], offsets = [];
    let len = 0;
    const push = (x) => { const b = typeof x === 'string' ? enc.encode(x) : x; chunks.push(b); len += b.length; };
    const obj = (n, body) => { offsets[n] = len; push(`${n} 0 obj\n${body}\nendobj\n`); };
    const pw = ptW.toFixed(2), ph = ptH.toFixed(2);
    push('%PDF-1.4\n%âãÏÓ\n');
    obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
    obj(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
    obj(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pw} ${ph}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`);
    offsets[4] = len;
    push(`4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${imgW} /Height ${imgH} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`);
    push(jpeg);
    push('\nendstream\nendobj\n');
    const content = `q ${pw} 0 0 ${ph} 0 0 cm /Im0 Do Q`;
    obj(5, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
    const xref = len;
    let x = 'xref\n0 6\n0000000000 65535 f \n';
    for (let i = 1; i <= 5; i++) x += String(offsets[i]).padStart(10, '0') + ' 00000 n \n';
    push(x);
    push(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
    return new Blob(chunks, { type: 'application/pdf' });
  }

  async function exportAs(kind, name, scale) {
    if (!SIG.state.raster) SIG.toast('Catatan: belum ada peta raster, layout akan kosong.');
    SIG.toast('Menyiapkan file…', 1500);
    await new Promise((r) => setTimeout(r, 30)); // beri waktu browser menampilkan toast
    const cv = SIG.layout.renderToCanvas(scale);
    const base = safeName(name);
    if (kind === 'png') await download(await toBlob(cv, 'image/png'), base + '.png');
    else if (kind === 'jpg') await download(await toBlob(cv, 'image/jpeg', 0.93), base + '.jpg');
    else if (kind === 'pdf') {
      const jpeg = new Uint8Array(await (await toBlob(cv, 'image/jpeg', 0.93)).arrayBuffer());
      const [W, H] = SIG.layout.pageSize(SIG.state.layout);
      await download(buildPdf(jpeg, cv.width, cv.height, W * 0.75, H * 0.75), base + '.pdf');
    }
    SIG.toast(inApp() ? 'File dikirim ke penyimpanan perangkat.' : 'Selesai — periksa folder Unduhan.');
    if (SIG.ads) SIG.ads.onExport();
    return cv;
  }

  /** GeoJSON: koordinat dikonversi ke [bujur, lintang] bila sudah georeferensi */
  function geojson() {
    const s = SIG.state, geo = SIG.geo.ready();
    const conv = (c) => (geo ? SIG.geo.toLL(c[0], c[1]).map((v) => +v.toFixed(7)) : [+c[0].toFixed(2), +c[1].toFixed(2)]);
    const layerName = (id) => (s.layers.find((l) => l.id === id) || {}).name || '';
    const features = s.features.map((f) => {
      const cs = f.coords.map(conv);
      const geometry = f.type === 'point' ? { type: 'Point', coordinates: cs[0] } : f.type === 'line' ? { type: 'LineString', coordinates: cs } : { type: 'Polygon', coordinates: [cs.concat([cs[0]])] };
      return { type: 'Feature', properties: { nama: f.name, keterangan: f.desc, layer: layerName(f.layerId), warna: f.color, tipe: f.type, gaya: SIG.symbols.styleOf(f) }, geometry };
    });
    const fc = { type: 'FeatureCollection', features };
    if (!geo) fc.properties = { catatan: 'Belum georeferensi: koordinat berupa piksel gambar, bukan lintang/bujur.' };
    return fc;
  }
  function exportGeojson(name) {
    download(new Blob([JSON.stringify(geojson(), null, 2)], { type: 'application/geo+json' }), safeName(name) + '.geojson');
  }
  function saveProject(name) {
    download(new Blob([SIG.serialize()], { type: 'application/json' }), safeName(name) + '.sigkelas.json');
  }

  SIG.exporter = { exportAs, exportGeojson, saveProject, buildPdf, geojson };
})();

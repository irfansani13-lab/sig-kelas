/* raster.js — impor gambar peta (PNG/JPG/GeoTIFF sederhana) + peta contoh */
(function () {
  'use strict';
  const SIG = (window.SIG = window.SIG || {});

  /* ---------------- GeoTIFF / TIFF sederhana ----------------
     Didukung: tanpa kompresi, strip (bukan tile), 8-bit gray/RGB/RGBA/palet,
     16-bit & float32 satu band (di-stretch min–max). Jika file memiliki tag
     ModelPixelScale+ModelTiepoint (atau ModelTransformation) dan sistem koordinat
     geografis, titik referensi dibuat otomatis.                              */
  function parseTiff(buf) {
    const dv = new DataView(buf);
    const bo = dv.getUint16(0);
    if (bo !== 0x4949 && bo !== 0x4d4d) throw new Error('Bukan file TIFF.');
    const le = bo === 0x4949;
    if (dv.getUint16(2, le) !== 42) throw new Error('BigTIFF tidak didukung. Konversi ke PNG/JPG atau GeoTIFF standar.');
    const ifd = dv.getUint32(4, le);
    const n = dv.getUint16(ifd, le);
    const tsz = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8, 16: 8 };
    const tags = {};
    for (let i = 0; i < n; i++) {
      const o = ifd + 2 + i * 12;
      const tag = dv.getUint16(o, le), type = dv.getUint16(o + 2, le), count = dv.getUint32(o + 4, le);
      const size = (tsz[type] || 1) * count;
      const pos = size <= 4 ? o + 8 : dv.getUint32(o + 8, le);
      const vals = [];
      const lim = Math.min(count, 100000);
      for (let k = 0; k < lim; k++) {
        switch (type) {
          case 1: case 2: case 6: case 7: vals.push(dv.getUint8(pos + k)); break;
          case 3: vals.push(dv.getUint16(pos + k * 2, le)); break;
          case 4: vals.push(dv.getUint32(pos + k * 4, le)); break;
          case 8: vals.push(dv.getInt16(pos + k * 2, le)); break;
          case 9: vals.push(dv.getInt32(pos + k * 4, le)); break;
          case 11: vals.push(dv.getFloat32(pos + k * 4, le)); break;
          case 12: vals.push(dv.getFloat64(pos + k * 8, le)); break;
          case 5: vals.push(dv.getUint32(pos + k * 8, le) / dv.getUint32(pos + k * 8 + 4, le)); break;
          default: vals.push(0);
        }
      }
      tags[tag] = vals;
    }
    const g = (t, d) => (tags[t] && tags[t].length ? tags[t][0] : d);
    const W = g(256), H = g(257);
    if (!W || !H) throw new Error('Ukuran gambar TIFF tidak terbaca.');
    const comp = g(259, 1), spp = g(277, 1), bits = g(258, 1), photo = g(262, 1), planar = g(284, 1), fmt = g(339, 1);
    if (tags[322]) throw new Error('TIFF berbasis tile belum didukung. Ekspor sebagai PNG/JPG atau GeoTIFF tanpa tile.');
    if (comp !== 1) throw new Error('TIFF terkompresi (LZW/Deflate) belum didukung. Ekspor dari QGIS sebagai PNG/JPG atau GeoTIFF tanpa kompresi.');
    if (planar !== 1 && spp > 1) throw new Error('TIFF planar terpisah belum didukung.');
    const offs = tags[273] || [], cnts = tags[279] || [];
    if (!offs.length) throw new Error('Data strip TIFF tidak ditemukan.');
    const bps = (bits / 8) | 0;
    const rowBytes = W * spp * (bits >= 8 ? bps : 1);
    if (bits < 8) throw new Error('TIFF < 8 bit belum didukung.');
    const raw = new Uint8Array(rowBytes * H);
    let wp = 0;
    for (let i = 0; i < offs.length; i++) {
      const len = Math.min(cnts[i] || rowBytes * H, raw.length - wp);
      raw.set(new Uint8Array(buf, offs[i], len), wp);
      wp += len;
    }
    const rb = new DataView(raw.buffer);
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const cx = canvas.getContext('2d');
    const id = cx.createImageData(W, H);
    const out = id.data;
    if (bits === 8 && (spp === 3 || spp === 4)) {
      for (let p = 0; p < W * H; p++) {
        out[p * 4] = raw[p * spp]; out[p * 4 + 1] = raw[p * spp + 1]; out[p * 4 + 2] = raw[p * spp + 2];
        out[p * 4 + 3] = spp === 4 ? raw[p * spp + 3] : 255;
      }
    } else if (spp === 1) {
      const cmap = tags[320];
      const vals = new Float32Array(W * H);
      let mn = Infinity, mx = -Infinity;
      for (let p = 0; p < W * H; p++) {
        let v;
        if (bits === 8) v = raw[p];
        else if (bits === 16) v = fmt === 2 ? rb.getInt16(p * 2, le) : rb.getUint16(p * 2, le);
        else if (bits === 32 && fmt === 3) v = rb.getFloat32(p * 4, le);
        else if (bits === 32) v = fmt === 2 ? rb.getInt32(p * 4, le) : rb.getUint32(p * 4, le);
        else throw new Error('Format TIFF ' + bits + '-bit belum didukung.');
        vals[p] = v;
        if (isFinite(v) && Math.abs(v) < 1e30) { if (v < mn) mn = v; if (v > mx) mx = v; }
      }
      const stretch = bits !== 8;
      const span = mx - mn || 1;
      for (let p = 0; p < W * H; p++) {
        if (photo === 3 && cmap && bits === 8) {
          const idx = vals[p];
          out[p * 4] = cmap[idx] >> 8; out[p * 4 + 1] = cmap[256 + idx] >> 8; out[p * 4 + 2] = cmap[512 + idx] >> 8; out[p * 4 + 3] = 255;
        } else {
          let v = stretch ? ((vals[p] - mn) / span) * 255 : vals[p];
          if (!isFinite(v)) v = 0;
          if (photo === 0) v = 255 - v;
          out[p * 4] = out[p * 4 + 1] = out[p * 4 + 2] = v; out[p * 4 + 3] = 255;
        }
      }
    } else throw new Error('Kombinasi band/bit TIFF ini belum didukung.');
    cx.putImageData(id, 0, 0);

    // ---- georeferensi dari tag GeoTIFF ----
    let geo = null;
    const keys = tags[34735];
    let model = 2;
    if (keys) for (let k = 4; k + 3 < keys.length; k += 4) if (keys[k] === 1024) model = keys[k + 3];
    const ps = tags[33550], tp = tags[33922], tm = tags[34264];
    let f = null;
    if (tm && tm.length >= 16) f = (px, py) => [tm[3] + tm[0] * px + tm[1] * py, tm[7] + tm[4] * px + tm[5] * py];
    else if (ps && tp && tp.length >= 6) f = (px, py) => [tp[3] + (px - tp[0]) * ps[0], tp[4] - (py - tp[1]) * ps[1]];
    if (f) {
      const corner = [[0, 0], [W, H], [W, 0]].map(([px, py]) => { const [lon, lat] = f(px, py); return { px, py, lon, lat }; });
      const geographic = model === 2 || (!keys && corner.every((c) => Math.abs(c.lon) <= 180 && Math.abs(c.lat) <= 90));
      geo = geographic ? { ok: true, corners: corner } : { ok: false, reason: 'GeoTIFF memakai sistem koordinat terproyeksi (meter), bukan lintang/bujur. Isi titik referensi secara manual.' };
    }
    return { canvas, geo };
  }

  function readAs(file, kind) {
    return new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => res(fr.result);
      fr.onerror = () => rej(new Error('Gagal membaca file'));
      kind === 'buf' ? fr.readAsArrayBuffer(file) : fr.readAsDataURL(file);
    });
  }

  /** Muat file gambar → objek raster siap pakai */
  async function loadFile(file) {
    const name = file.name || 'peta';
    const isTiff = /\.tiff?$/i.test(name) || file.type === 'image/tiff';
    let dataUrl, img, gcps = [], note = '';
    if (isTiff) {
      const { canvas, geo } = parseTiff(await readAs(file, 'buf'));
      dataUrl = canvas.toDataURL('image/png');
      img = await SIG.loadImage(dataUrl);
      if (geo && geo.ok) {
        gcps = geo.corners.map((c) => ({ id: SIG.uid(), px: c.px, py: c.py, lat: c.lat, lon: c.lon, latText: SIG.geo.formatCoord(c.lat, 'lat', 'dec'), lonText: SIG.geo.formatCoord(c.lon, 'lon', 'dec') }));
        note = 'GeoTIFF: titik referensi dibuat otomatis dari metadata file.';
      } else if (geo) note = geo.reason;
    } else {
      if (!/^image\/(png|jpe?g|webp|gif|bmp)$/.test(file.type) && !/\.(png|jpe?g|webp)$/i.test(name)) throw new Error('Format tidak didukung. Gunakan PNG, JPG, atau GeoTIFF.');
      dataUrl = await readAs(file, 'url');
      img = await SIG.loadImage(dataUrl);
      // foto/peta besar dari HP: kecilkan agar ringan & muat di penyimpanan browser
      if (Math.max(img.naturalWidth, img.naturalHeight) > 4096 || file.size > 2.5 * 1024 * 1024) {
        const k = Math.min(1, 3000 / Math.max(img.naturalWidth, img.naturalHeight));
        const c = document.createElement('canvas');
        c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
        const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
        dataUrl = c.toDataURL('image/jpeg', 0.9);
        img = await SIG.loadImage(dataUrl);
        note = 'Gambar besar dikecilkan (maks. 3000 px) agar ringan di HP.';
      }
    }
    return { name, w: img.naturalWidth, h: img.naturalHeight, dataUrl, img, visible: true, opacity: 1, gcps, note };
  }

  /** Pasang raster ke state */
  function setRaster(r) {
    const st = SIG.state;
    st.raster = { name: r.name, w: r.w, h: r.h, dataUrl: r.dataUrl, img: r.img, visible: true, opacity: 1 };
    st.gcps = r.gcps || [];
    st.layout.view = null;
    SIG.recomputeGeoref();
  }

  /* ---------------- Peta contoh (Indonesia, ilustrasi kasar) ---------------- */
  function makeSample() {
    const W = 1380, H = 510;
    const LON0 = 95, LON1 = 141, LAT0 = 6, LAT1 = -11;
    const X = (lon) => ((lon - LON0) / (LON1 - LON0)) * W;
    const Y = (lat) => ((LAT0 - lat) / (LAT0 - LAT1)) * H;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    const sea = g.createLinearGradient(0, 0, 0, H);
    sea.addColorStop(0, '#cfe8f6'); sea.addColorStop(1, '#a9d3ec');
    g.fillStyle = sea; g.fillRect(0, 0, W, H);
    const poly = (pts) => { g.beginPath(); pts.forEach(([lo, la], i) => (i ? g.lineTo(X(lo), Y(la)) : g.moveTo(X(lo), Y(la)))); g.closePath(); g.fill(); g.stroke(); };
    g.fillStyle = '#d9e4b4'; g.strokeStyle = '#7d8f55'; g.lineWidth = 1.6; g.lineJoin = 'round';
    poly([[95.3, 5.6], [98.5, 3.8], [100.5, 2.2], [103.4, 0.4], [104.3, -1.8], [106.0, -3.0], [106.0, -5.8], [104.6, -5.9], [102.3, -4.0], [100.4, -2.0], [98.6, 0.3], [96.2, 2.8]]); // Sumatra
    poly([[100.1, 6.4], [102, 6.2], [104.2, 1.4], [103.4, 1.3], [101.3, 2.8], [100.3, 5.0]]); // Semenanjung Malaya
    poly([[105.2, -6.8], [108, -6.3], [110.5, -6.9], [112.8, -6.9], [114.4, -7.8], [114.4, -8.7], [111, -8.3], [108, -7.8], [106, -7.1]]); // Jawa
    poly([[108.9, 1.9], [110.3, 1.7], [113, 3.2], [115.5, 4.8], [117.7, 4.3], [118.9, 1.0], [117.6, -1.0], [116.5, -3.0], [114.5, -4.0], [111.5, -3.5], [110.2, -3.0], [109.2, -1.5], [109.1, 0.5]]); // Kalimantan
    poly([[120.0, 1.2], [124.8, 1.5], [125, 0.6], [122, 0.8], [121.8, -0.9], [123.3, -0.9], [123.3, -2.0], [121.7, -2.7], [122.6, -4.7], [121.6, -4.9], [120.5, -3.2], [120.4, -5.6], [119.5, -5.5], [119.6, -3], [118.9, -2.8], [119.8, -0.2]]); // Sulawesi
    poly([[131, -0.9], [134.5, -0.8], [137.8, -1.6], [141, -2.6], [141, -9.1], [138.5, -8.3], [137.8, -5.5], [135.5, -4.3], [134.2, -3.8], [132.9, -4.1], [133, -2.6], [132.4, -2.4]]); // Papua
    [[115.2, -8.4, .5, .3], [116.3, -8.6, .5, .35], [117.5, -8.7, 1, .35], [121.5, -8.6, 2.2, .3], [124.5, -9.5, 1.8, .35], [128, .7, .6, 1], [129.3, -3.0, 1.2, .35], [126.3, -3.4, .8, .35]].forEach(([lo, la, rx, ry]) => {
      g.beginPath(); g.ellipse(X(lo), Y(la), rx * (W / 46), ry * (H / 17), 0, 0, 7); g.fill(); g.stroke();
    });
    g.fillStyle = '#4b6a80'; g.font = 'italic 15px sans-serif'; g.textAlign = 'center';
    g.fillText('Samudra Hindia', X(100), Y(-8.5)); g.fillText('Samudra Pasifik', X(135), Y(3.2)); g.fillText('Laut Jawa', X(111), Y(-4.8)); g.fillText('Laut Cina Selatan', X(110), Y(4.5));
    g.fillStyle = '#334155'; g.font = 'bold 13px sans-serif';
    [['SUMATERA', 100.8, 0.3, -.5], ['JAWA', 110, -7.3, 0], ['KALIMANTAN', 113.5, 0.2, 0], ['SULAWESI', 121, -2.2, 0], ['PAPUA', 137.2, -4.5, 0]].forEach(([t, lo, la, rot]) => {
      g.save(); g.translate(X(lo), Y(la)); g.rotate(rot); g.fillText(t, 0, 0); g.restore();
    });
    g.fillStyle = '#64748b'; g.font = '11px sans-serif'; g.textAlign = 'right';
    g.fillText('Peta contoh — ilustrasi kasar, bukan untuk data akurat', W - 8, H - 8);
    const mk = (px, py, lon, lat) => ({ id: SIG.uid(), px, py, lon, lat, lonText: SIG.geo.formatCoord(lon, 'lon', 'dec'), latText: SIG.geo.formatCoord(lat, 'lat', 'dec') });
    const dataUrl = c.toDataURL('image/png');
    return SIG.loadImage(dataUrl).then((img) => ({ name: 'peta-contoh-indonesia.png', w: W, h: H, dataUrl, img, gcps: [mk(0, 0, LON0, LAT0), mk(W, H, LON1, LAT1)] }));
  }

  SIG.raster = { loadFile, setRaster, makeSample };
})();

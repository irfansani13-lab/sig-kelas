/* geo.js — georeferensi (piksel ⇄ lintang/bujur), parser & format koordinat, utilitas geometri */
(function () {
  'use strict';
  const SIG = (window.SIG = window.SIG || {});
  const M_PER_DEG = 111320; // meter per derajat (aproksimasi)
  const rad = Math.PI / 180;

  /* ---------------------------------------------------------------
     Parser koordinat. Contoh yang diterima:
       -6.2 | 6,2 S | 6°12'30" LS | 106 49 BT | 95.5E
  --------------------------------------------------------------- */
  function parseCoord(text, axis) {
    if (typeof text === 'number') return isFinite(text) ? text : null;
    if (text == null) return null;
    let s = String(text).trim().toUpperCase();
    if (!s) return null;
    let hemi = null;
    const hm = s.match(/(LS|LU|BT|BB|N|S|E|W)/);
    if (hm) { hemi = hm[1]; s = s.replace(hm[1], ' '); }
    s = s.replace(/[°º˚'′’"″”]/g, ' ');
    if (/[A-Z]/.test(s)) return null;
    const neg = /-/.test(s);
    const nums = (s.replace(/,/g, '.').match(/\d+(?:\.\d+)?/g) || []).map(Number);
    if (!nums.length || nums.length > 3) return null;
    if ((nums[1] || 0) >= 60 || (nums[2] || 0) >= 60) return null;
    if (hemi) {
      const latH = ['N', 'S', 'LU', 'LS'];
      if ((axis === 'lat') !== latH.includes(hemi)) return null; // hemisfer salah sumbu
    }
    let v = nums[0] + (nums[1] || 0) / 60 + (nums[2] || 0) / 3600;
    if (neg || ['S', 'LS', 'W', 'BB'].includes(hemi)) v = -v;
    const max = axis === 'lat' ? 90 : 180;
    if (Math.abs(v) > max) return null;
    return v;
  }

  /** Format label koordinat: 'dms' → 6°12′ LS ; 'dec' → 6,2° LS */
  function formatCoord(v, axis, fmt) {
    const hemi = axis === 'lat' ? (v < 0 ? 'LS' : 'LU') : v < 0 ? 'BB' : 'BT';
    const a = Math.abs(v);
    if (a < 1e-9) return '0°';
    if (fmt === 'dec') {
      const t = String(parseFloat(a.toFixed(4))).replace('.', ',');
      return t + '° ' + hemi;
    }
    const total = Math.round(a * 3600);
    const d = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
    let out = d + '°';
    if (m || s) out += m + '′';
    if (s) out += s + '″';
    return out + ' ' + hemi;
  }

  /* ---------------------------------------------------------------
     Georeferensi.
     lon = a + b·px + c·py     lat = d + e·px + f·py
     • 2 titik  → peta menghadap utara (c = e = 0)
     • ≥3 titik → affine kuadrat-terkecil (boleh miring/rotasi)
  --------------------------------------------------------------- */
  function solve(gcps) {
    const pts = gcps.filter((g) => typeof g.lat === 'number' && typeof g.lon === 'number');
    const total = gcps.length;
    if (pts.length < 2) {
      return { ok: false, n: pts.length, msg: total ? `Isi lintang & bujur yang valid pada minimal 2 titik (valid: ${pts.length} dari ${total}).` : 'Tambahkan minimal 2 titik referensi.' };
    }
    let T, mode;
    const warnings = [];
    if (pts.length === 2) {
      const [p, q] = pts;
      const dx = q.px - p.px, dy = q.py - p.py;
      if (Math.abs(dx) < 1 || Math.abs(dy) < 1) {
        return { ok: false, n: 2, msg: 'Dua titik tidak boleh sejajar horizontal/vertikal. Pilih titik di sudut berlawanan, atau tambahkan titik ke-3.' };
      }
      const b = (q.lon - p.lon) / dx, f = (q.lat - p.lat) / dy;
      T = { a: p.lon - b * p.px, b, c: 0, d: p.lat - f * p.py, e: 0, f };
      mode = 'menghadap utara (2 titik)';
    } else {
      const n = pts.length;
      const mx = pts.reduce((s, p) => s + p.px, 0) / n, my = pts.reduce((s, p) => s + p.py, 0) / n;
      const mlo = pts.reduce((s, p) => s + p.lon, 0) / n, mla = pts.reduce((s, p) => s + p.lat, 0) / n;
      let Sxx = 0, Sxy = 0, Syy = 0, Sxo = 0, Syo = 0, Sxa = 0, Sya = 0;
      for (const p of pts) {
        const x = p.px - mx, y = p.py - my;
        Sxx += x * x; Sxy += x * y; Syy += y * y;
        Sxo += x * (p.lon - mlo); Syo += y * (p.lon - mlo);
        Sxa += x * (p.lat - mla); Sya += y * (p.lat - mla);
      }
      const D = Sxx * Syy - Sxy * Sxy;
      if (Sxx * Syy === 0 || D < 1e-6 * Sxx * Syy) {
        return { ok: false, n, msg: 'Titik-titik hampir segaris. Sebarkan titik referensi (mis. di tiga sudut peta).' };
      }
      const b = (Syy * Sxo - Sxy * Syo) / D, c = (Sxx * Syo - Sxy * Sxo) / D;
      const e = (Syy * Sxa - Sxy * Sya) / D, f = (Sxx * Sya - Sxy * Sxa) / D;
      T = { a: mlo - b * mx - c * my, b, c, d: mla - e * mx - f * my, e, f };
      mode = `affine (${n} titik)`;
    }
    const det = T.b * T.f - T.c * T.e;
    if (!isFinite(det) || Math.abs(det) < 1e-14) return { ok: false, n: pts.length, msg: 'Titik referensi tidak konsisten (transformasi tidak dapat dibalik).' };
    // galat (km) tiap titik
    let sq = 0;
    for (const p of pts) {
      const lon = T.a + T.b * p.px + T.c * p.py, lat = T.d + T.e * p.px + T.f * p.py;
      const dxm = (lon - p.lon) * M_PER_DEG * Math.cos(p.lat * rad), dym = (lat - p.lat) * M_PER_DEG;
      sq += dxm * dxm + dym * dym;
    }
    const rmseKm = Math.sqrt(sq / pts.length) / 1000;
    if (T.f > 0) warnings.push('Lintang bertambah ke arah bawah gambar — periksa tanda LU/LS.');
    if (T.b < 0) warnings.push('Bujur bertambah ke arah kiri gambar — periksa tanda BT/BB.');
    return { ok: true, n: pts.length, T, det, mode, rmseKm, warnings };
  }

  /** piksel gambar → [bujur, lintang] */
  function toLL(px, py) {
    const T = SIG.state.georef.T;
    return [T.a + T.b * px + T.c * py, T.d + T.e * px + T.f * py];
  }
  /** [bujur, lintang] → piksel gambar */
  function toPx(lon, lat) {
    const g = SIG.state.georef, T = g.T;
    const u = lon - T.a, v = lat - T.d;
    return [(T.f * u - T.c * v) / g.det, (-T.e * u + T.b * v) / g.det];
  }
  const ready = () => !!(SIG.state.georef && SIG.state.georef.ok);

  /** meter per piksel gambar di sekitar titik (px,py) */
  function metersPerPixel(px, py) {
    const T = SIG.state.georef.T;
    const lat = T.d + T.e * px + T.f * py;
    const k = Math.cos(lat * rad);
    const mx = Math.hypot(T.b * k, T.e) * M_PER_DEG;
    const my = Math.hypot(T.c * k, T.f) * M_PER_DEG;
    return (mx + my) / 2;
  }
  /** angka "bulat" (1,2,5 × 10^n) ≤ maxMeters */
  function niceLength(maxMeters) {
    const base = Math.pow(10, Math.floor(Math.log10(maxMeters)));
    for (const m of [5, 2, 1]) if (m * base <= maxMeters) return m * base;
    return base;
  }
  function formatDistance(m) {
    if (m >= 1000) return String(parseFloat((m / 1000).toFixed(2))).replace('.', ',') + ' km';
    return String(parseFloat(m.toFixed(1))).replace('.', ',') + ' m';
  }

  /* ---------- geometri ---------- */
  function distPointSeg(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay;
    const l2 = dx * dx + dy * dy;
    let t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
  }
  function pointInPoly(x, y, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }
  function centroid(pts) {
    const n = pts.length;
    return [pts.reduce((s, p) => s + p[0], 0) / n, pts.reduce((s, p) => s + p[1], 0) / n];
  }

  SIG.geo = { parseCoord, formatCoord, solve, toLL, toPx, ready, metersPerPixel, niceLength, formatDistance, distPointSeg, pointInPoly, centroid, M_PER_DEG };
})();

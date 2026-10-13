/*
 * 3D görünüm: dışa bağımlılık olmadan, SVG çokgenleriyle çizilen döndürülebilir model.
 * Her parça 8 köşeli bir altı yüzlüdür (dikdörtgen kutu ya da eğimli/yamuk parça).
 * Dünya koordinatı: X sağa (A duvarı boyunca), Y yukarı, Z odaya doğru (duvar Z=0).
 * Çizim: döndürme (yaw, pitch) + dik izdüşüm, uzaktan yakına sıralama (ressam algoritması).
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Uc = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const RENK = {
    govde: '#efe6d6', ic: '#e4d9c4', panel: '#d6c3a3', kapak: '#e7cfa8', cekmece: '#dcc19a',
    cam: '#9cc8e6', ayna: '#cfdbe3', arkalik: '#cfc6b8', ayak: '#555555', kulp: '#6f6658', led: '#ffd84d', baza: '#c9bba3',
  };

  /** Eksenlere paralel kutu (8 köşe). */
  function kutu(x1, x2, y1, y2, z1, z2, tur, ek) {
    const [a, b] = x1 < x2 ? [x1, x2] : [x2, x1];
    const [c, d] = y1 < y2 ? [y1, y2] : [y2, y1];
    const [e, f] = z1 < z2 ? [z1, z2] : [z2, z1];
    return Object.assign({ k: [[a, c, e], [b, c, e], [b, d, e], [a, d, e], [a, c, f], [b, c, f], [b, d, f], [a, d, f]], tur }, ek || {});
  }
  /** Üst yüzü eğimli kutu: sol (x1) üst yüksekliği ySol, sağ (x2) üst yüksekliği ySag. */
  function egimliKutu(x1, x2, y1, ySol, ySag, z1, z2, tur, ek) {
    return Object.assign({ k: [[x1, y1, z1], [x2, y1, z1], [x2, ySag, z1], [x1, ySol, z1], [x1, y1, z2], [x2, y1, z2], [x2, ySag, z2], [x1, ySol, z2]], tur }, ek || {});
  }
  /** Eğik plaka (eğimli üst tabla): alt ve üst yüzleri eğik. */
  function egikPlaka(x1, x2, yAltSol, yAltSag, kal, z1, z2, tur) {
    return { k: [[x1, yAltSol, z1], [x2, yAltSag, z1], [x2, yAltSag + kal, z1], [x1, yAltSol + kal, z1], [x1, yAltSol, z2], [x2, yAltSag, z2], [x2, yAltSag + kal, z2], [x1, yAltSol + kal, z2]], tur };
  }

  /**
   * Bir modülün yerel parçaları. Yerel: x 0..W (önden bakınca soldan sağa), y zeminden,
   * z 0 = arka (duvar), z = D gövde ön yüzü; kapaklar z > D.
   */
  function modulParcalari(geo, secenek) {
    const kapaksiz = !!(secenek && secenek.kapaksiz);
    const P = [];
    if (!geo) return P;
    if (geo.panel) return panelParcalari(geo);
    if (geo.lkose) return lKoseParcalari(geo, kapaksiz);
    const { W, D, Ds, t, hb, tk } = geo;
    const Hc = geo.Hc;
    const HcL = geo.egim ? geo.egim.HcL : Hc;
    const HcR = geo.egim ? geo.egim.HcR : Hc;
    const HX = (x) => HcL + ((HcR - HcL) * x) / W;
    const zArka = D - Ds;
    const icOn = geo.kapakTipi === 'ic' || geo.surgu ? tk : 0;
    const zIcOn = D - icOn;
    const zIcArka = zIcOn - geo.icDerinlik;
    const tabla = geo.yapi === 'tabla_boydan';
    // Baza
    if (geo.baza.tip === 'ayak' || geo.baza.tip === 'tekerlek') {
      for (const x of [50, W - 50]) for (const z of [zArka + 50, D - 50]) P.push(kutu(x - 15, x + 15, 0, hb, z - 15, z + 15, 'ayak'));
    } else if (geo.baza.tip === 'panel') {
      P.push(kutu(0, W, 0, hb, zArka, D - geo.baza.geriCekme, 'baza'));
    }
    if (geo.bazaCekmece && !kapaksiz) P.push(kutu(geo.bazaCekmece.x1, geo.bazaCekmece.x2, geo.bazaCekmece.y1, geo.bazaCekmece.y2, D - geo.baza.geriCekme - tk, D - geo.baza.geriCekme, 'kapak'));
    // Gövde
    const yanAlt = hb + (tabla ? t : 0);
    P.push(kutu(0, t, yanAlt, hb + HcL - (tabla ? t : 0), zArka, D, 'govde'));
    P.push(kutu(W - t, W, yanAlt, hb + HcR - (tabla ? t : 0), zArka, D, 'govde'));
    P.push(kutu(tabla ? 0 : t, tabla ? W : W - t, hb, hb + t, zArka, D, 'govde'));
    if (geo.egim) P.push(egikPlaka(tabla ? 0 : t, tabla ? W : W - t, hb + HX(tabla ? 0 : t) - t, hb + HX(tabla ? W : W - t) - t, t, zArka, D, 'govde'));
    else if (geo.ust === 'kusak') {
      P.push(kutu(t, W - t, hb + Hc - t, hb + Hc, D - 100, D, 'govde'));
      P.push(kutu(t, W - t, hb + Hc - t, hb + Hc, zArka, zArka + 100, 'govde'));
    } else P.push(kutu(tabla ? 0 : t, tabla ? W : W - t, hb + Hc - t, hb + Hc, zArka, D, 'govde'));
    // Arkalık
    if (geo.arkalik === 'kanal') {
      const z = zArka + 10;
      P.push(geo.egim ? egimliKutu(t, W - t, hb + t, hb + HcL - t, hb + HcR - t, z, z + geo.ta, 'arkalik') : kutu(t, W - t, hb + t, hb + Hc - t, z, z + geo.ta, 'arkalik'));
    } else if (geo.arkalik === 'cakma') {
      P.push(geo.egim ? egimliKutu(0, W, hb, hb + HcL, hb + HcR, zArka - geo.ta, zArka, 'arkalik') : kutu(0, W, hb, hb + Hc, zArka - geo.ta, zArka, 'arkalik'));
    }
    // Kapaklar kapalıyken yalnızca açık, niş ya da camlı satırların içi görünür
    const acikSatir = (s) => kapaksiz || (!geo.surgu && (s.tip === 'acik' || s.tip === 'nis' || (s.tip === 'kapak' && ['cam', 'cam_profil', 'cam_cerceve'].includes(s.kapakTuru))));
    const herhangiAcik = kapaksiz || geo.satirlar.some(acikSatir);
    // Bölme dikmeleri, ara tablalar
    if (herhangiAcik) for (const dx of geo.dikmeX) P.push(kutu(dx, dx + t, hb + t, hb + HX(dx + t / 2) - t, zIcArka, zIcOn, 'panel'));
    for (const c of geo.sutunlar) {
      c.sinirlar.forEach((b, i) => {
        if (!b.panel) return;
        if (!kapaksiz && !acikSatir(c.satirlar[i]) && !acikSatir(c.satirlar[i + 1])) return;
        P.push(kutu(b.x1, b.x2, hb + b.y - t / 2, hb + b.y + t / 2, zIcArka, zIcOn, 'panel'));
      });
    }
    // Satır içleri
    for (const s of geo.satirlar) {
      if (!acikSatir(s)) continue;
      for (const dx of s.dikmeX) P.push(kutu(dx, dx + t, hb + s.icAlt, hb + s.icUst, zIcArka, zIcOn, 'panel'));
      for (const b of s.bolumler) {
        for (const ry of s.raflar) {
          const cam = s.rafTipi === 'cam';
          P.push(kutu(b.x1 + 1, b.x2 - 1, hb + ry - (cam ? 4 : t / 2), hb + ry + (cam ? 4 : t / 2), zIcArka, zIcOn - 20, cam ? 'cam' : 'panel', cam ? { saydam: 0.45 } : null));
        }
        if (s.aski) P.push(kutu(b.x1, b.x2, hb + s.icUst - 70, hb + s.icUst - 55, (zIcArka + zIcOn) / 2 - 8, (zIcArka + zIcOn) / 2 + 8, 'kulp'));
        if (s.led) P.push(kutu(b.x1 + 10, b.x2 - 10, hb + s.icUst - 6, hb + s.icUst - 1, zIcOn - 40, zIcOn - 20, 'led'));
      }
      if (kapaksiz) {
        for (const c of s.cekmeceler) P.push(kutu(c.x1, c.x2, hb + c.y1, hb + c.y2, zIcOn - c.L, zIcOn, 'ic'));
        for (const c of s.icCekmeceler || []) P.push(kutu(c.x1, c.x2, hb + c.y1, hb + c.y2, zIcOn - (c.L || 300), zIcOn - 25, 'cekmece'));
      }
    }
    if (kapaksiz) return P;
    // Ön yüzler
    const zOn1 = geo.kapakTipi === 'ic' ? D - tk : D;
    const zOn2 = zOn1 + tk;
    if (geo.korPanel) P.push(kutu(geo.korPanel.x1, geo.korPanel.x2, hb + geo.db, hb + Hc - geo.db, zOn1, zOn2, 'kapak'));
    if (geo.surgu) {
      const s = geo.surgu;
      const tur = s.tur === 'ayna' ? 'ayna' : s.tur === 'cam_profil' ? 'cam' : 'kapak';
      for (const k of s.kapaklar) {
        const z = D + (k.arka ? 5 : 12 + tk);
        P.push(kutu(k.x1, k.x2, hb + s.y1, hb + s.y2, z, z + tk, tur, tur === 'cam' ? { saydam: 0.5 } : null));
      }
      return P;
    }
    for (const s of geo.satirlar) {
      if (!s.onler.length) continue;
      for (const o of s.onler) {
        const tur = s.tip === 'kapak' ? (s.kapakTuru === 'ayna' ? 'ayna' : s.kapakTuru === 'cam' || s.kapakTuru === 'cam_profil' ? 'cam' : 'kapak') : 'cekmece';
        const ek = tur === 'cam' ? { saydam: 0.45 } : null;
        if (o.y2sol != null) P.push(egimliKutu(o.x1, o.x2, hb + s.on.y1, hb + o.y2sol, hb + o.y2sag, zOn1, zOn2, tur, ek));
        else P.push(kutu(o.x1, o.x2, hb + s.on.y1, hb + s.on.y2, zOn1, zOn2, tur, ek));
        if (o.kulp && o.kulp.delikler.length) {
          const d = o.kulp.delikler;
          const xs = d.map((p) => o.x1 + p.x);
          const ys = d.map((p) => hb + s.on.y1 + p.y);
          const yatay = o.kulp.yatay;
          const x1 = Math.min(...xs) - (yatay ? 10 : 6);
          const x2 = Math.max(...xs) + (yatay ? 10 : 6);
          const y1 = Math.min(...ys) - (yatay ? 6 : 10);
          const y2 = Math.max(...ys) + (yatay ? 6 : 10);
          P.push(kutu(x1, x2, y1, y2, zOn2 + 18, zOn2 + 28, 'kulp'));
        }
      }
    }
    return P;
  }

  function lKoseParcalari(g, kapaksiz) {
    const { W, W2, D, t, hb, tk, db } = g;
    const Hc = g.Hc;
    const P = [];
    if (g.baza.tip === 'ayak') for (const [x, z] of [[50, 50], [W - 50, 50], [W - 50, D - 50], [50, W2 - 50], [D - 50, W2 - 50], [D - 50, D - 50]]) P.push(kutu(x - 15, x + 15, 0, hb, z - 15, z + 15, 'ayak'));
    for (const y of [hb, hb + Hc - t]) {
      P.push(kutu(0, W, y, y + t, 0, D, 'govde'));
      P.push(kutu(0, D, y, y + t, D, W2, 'govde'));
    }
    P.push(kutu(W - t, W, hb, hb + Hc, 0, D, 'govde'));
    P.push(kutu(0, D, hb, hb + Hc, W2 - t, W2, 'govde'));
    P.push(kutu(0, W, hb, hb + Hc, 0, g.ta, 'arkalik'));
    P.push(kutu(0, g.ta, hb, hb + Hc, g.ta, W2, 'arkalik'));
    if (!kapaksiz) {
      P.push(kutu(D + tk + 3, W - db, hb + db, hb + Hc - db, D, D + tk, 'kapak'));
      P.push(kutu(D, D + tk, hb + db, hb + Hc - db, D, W2 - db, 'kapak'));
    }
    return P;
  }

  function panelParcalari(g) {
    const tur = g.kullanim === 'govde' ? 'govde' : 'kapak';
    if (g.tur === 'yan_kapama') return [kutu(0, g.t, 0, g.boy, 0, g.en, tur)];
    if (g.tur === 'raf' || g.tur === 'tabla') return [kutu(0, g.boy, 0, g.t, 0, g.en, tur)];
    if (g.tur === 'baza') return [kutu(0, g.boy, 0, g.en, 0, g.t, tur)];
    // Dolgu, bulaşık kapağı, serbest: ön düzlemde dik panel (komşu dolapların önüne hizalı)
    const z = 560;
    return [kutu(0, g.W, 0, g.H, z, z + g.t, tur)];
  }

  /** Yerleşimdeki her modülü dünya koordinatına taşır. */
  function projeParcalari(yer, secenek) {
    const P = [];
    for (const y of yer.yerler) {
      const yerel = modulParcalari(y.geo, secenek);
      const donustur = (p) => {
        if (y.duvar === 'kose' || y.duvar === 'A' || yer.tip !== 'L') return [y.duvar === 'kose' ? p[0] : y.bas + p[0], y.montaj + p[1], p[2]];
        // B duvarı: modül +X yönüne bakar; yerel sol (x=0) köşeden uzakta
        return [p[2], y.montaj + p[1], y.bas + y.W - p[0]];
      };
      for (const q of yerel) P.push(Object.assign({}, q, { k: q.k.map(donustur), modul: y.modul.ad }));
    }
    return P;
  }

  // Altı yüzün köşe indisleri (dış normal yönünde saat yönünün tersi)
  const YUZLER = [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [3, 7, 6, 2], [0, 4, 7, 3], [1, 2, 6, 5]];
  const hexRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

  /**
   * Parçaları SVG'ye çizer. gorus: { yaw, pitch } (derece), yakin: yakınlaştırma (1 = sığdır).
   * Dönüş: SVG metni.
   */
  function ciz(parcalar, gorus, secenek) {
    const yaw = ((gorus.yaw || 0) * Math.PI) / 180;
    const pitch = ((gorus.pitch || 0) * Math.PI) / 180;
    const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    const don = ([x, y, z]) => {
      const x1 = cy * x + sy * z;
      const z1 = -sy * x + cy * z;
      const y2 = cp * y - sp * z1;
      const z2 = sp * y + cp * z1;
      return [x1, y2, z2];
    };
    const isik = (() => { const v = [0.35, 0.75, 0.55]; const n = Math.hypot(...v); return v.map((a) => a / n); })();
    // Ressam algoritması parça bazında: her parçanın ağırlık merkezi derinliğine göre uzaktan yakına.
    // Dışbükey bir parçanın kendi görünen yüzleri birbirini örtmez.
    const cizilecek = [];
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of parcalar) {
      const v = p.k.map(don);
      for (const q of v) { minX = Math.min(minX, q[0]); maxX = Math.max(maxX, q[0]); minY = Math.min(minY, -q[1]); maxY = Math.max(maxY, -q[1]); }
      const derinlik = v.reduce((a, q) => a + q[2], 0) / 8;
      const [r, g, bb] = hexRgb(RENK[p.tur] || RENK.govde);
      const yuzler = [];
      for (const idx of YUZLER) {
        const pts = idx.map((i2) => v[i2]);
        const a = pts[1].map((c, k) => c - pts[0][k]);
        const b = pts[3].map((c, k) => c - pts[0][k]);
        let n = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
        const nl = Math.hypot(...n) || 1;
        n = n.map((c) => c / nl);
        if (n[2] <= 0.0001) continue; // arka yüz
        const parlak = 0.62 + 0.38 * Math.max(0, n[0] * isik[0] + n[1] * isik[1] + n[2] * isik[2]);
        yuzler.push({ pts, renk: `rgb(${Math.round(r * parlak)},${Math.round(g * parlak)},${Math.round(bb * parlak)})` });
      }
      cizilecek.push({ derinlik, yuzler, saydam: p.saydam });
    }
    if (!cizilecek.length) return '<p class="bos">Gösterilecek parça yok.</p>';
    cizilecek.sort((a, b) => a.derinlik - b.derinlik);
    const f = (x) => Math.round(x * 10) / 10;
    let s = '';
    for (const p of cizilecek) {
      for (const y of p.yuzler) {
        s += `<polygon points="${y.pts.map((q) => `${f(q[0])},${f(-q[1])}`).join(' ')}" fill="${y.renk}"${p.saydam ? ` fill-opacity="${p.saydam}"` : ''} stroke="rgba(40,32,22,.45)" stroke-width="0.6" vector-effect="non-scaling-stroke"/>`;
      }
    }
    const w = maxX - minX;
    const h = maxY - minY;
    const yakin = Math.max(0.2, (secenek && secenek.yakin) || 1);
    const pay = Math.max(w, h) * 0.06;
    const vw = (w + 2 * pay) / yakin;
    const vh = (h + 2 * pay) / yakin;
    const cx = (minX + maxX) / 2;
    const cyy = (minY + maxY) / 2;
    return `<svg class="uc-svg" viewBox="${f(cx - vw / 2)} ${f(cyy - vh / 2)} ${f(vw)} ${f(vh)}" xmlns="http://www.w3.org/2000/svg">${s}</svg>`;
  }

  return { modulParcalari, projeParcalari, ciz, kutu, RENK };
});

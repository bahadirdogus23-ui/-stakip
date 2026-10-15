/*
 * 3D görünüm: dışa bağımlılık olmadan, SVG çokgenleriyle çizilen döndürülebilir model.
 * Her parça 8 köşeli bir altı yüzlüdür (dikdörtgen kutu ya da eğimli/yamuk parça).
 * Dünya koordinatı: X sağa (A duvarı boyunca), Y yukarı, Z odaya doğru (duvar Z=0).
 * Ölçüler hesap motorunun geometrisinden (geo) alınır; kesim listesiyle aynı yapı kuralları
 * (yanlar/tablalar boydan, kuşak, kanal/çakma arkalık, gömme kapak, sürgü, eğim) uygulanır.
 * Çizim: döndürme (yaw, pitch) + dik izdüşüm. Sıralama: eksenlere paralel parçalar için
 * ayırma ekseni testine dayalı ressam sıralaması (topolojik), gerekirse ağırlık merkezi derinliği.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Uc = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const RENK = {
    govde: '#efe6d6', ic: '#e4d9c4', panel: '#d6c3a3', kapak: '#e7cfa8', cekmece: '#dcc19a',
    cam: '#9cc8e6', ayna: '#cfdbe3', arkalik: '#cfc6b8', ayak: '#555555', kulp: '#6f6658', led: '#ffd84d', baza: '#c9bba3', nesne: '#cccccc',
  };

  /** Eksenlere paralel kutu (8 köşe). */
  function kutu(x1, x2, y1, y2, z1, z2, tur, ek) {
    const [a, b] = x1 < x2 ? [x1, x2] : [x2, x1];
    const [c, d] = y1 < y2 ? [y1, y2] : [y2, y1];
    const [e, f] = z1 < z2 ? [z1, z2] : [z2, z1];
    return Object.assign({ k: [[a, c, e], [b, c, e], [b, d, e], [a, d, e], [a, c, f], [b, c, f], [b, d, f], [a, d, f]], tur }, ek || {});
  }
  /**
   * Dışbükey çokgen prizma: pts 2B çokgen [[u, v]], w1..w2 kalınlık yönü; esle(u, v, w) → [x, y, z].
   * k: sınır kutusu (çakışma/sıralama için 8 köşe), sk: çizim ağı { v: köşeler, f: yüzler }.
   */
  function prizma(pts, esle, w1, w2, tur, ek) {
    const n = pts.length;
    const v = pts.map(([u, vv]) => esle(u, vv, w1)).concat(pts.map(([u, vv]) => esle(u, vv, w2)));
    const f = [pts.map((_, i) => i), pts.map((_, i) => n + i)];
    for (let i = 0; i < n; i++) { const j = (i + 1) % n; f.push([i, j, n + j, n + i]); }
    const b = [0, 1, 2].map((k) => [Math.min(...v.map((q) => q[k])), Math.max(...v.map((q) => q[k]))]);
    return Object.assign(kutu(b[0][0], b[0][1], b[1][0], b[1][1], b[2][0], b[2][1], tur), { sk: { v, f } }, ek || {});
  }
  /**
   * Şekil yolu (Hesap.sekilGeometrisi: M, L, Q köşe radyüsü, A yay, E elips; orijin sol-alt, y yukarı)
   * → çokgen noktaları. Eğriler parçalara bölünür.
   */
  function yolNoktalari(yol, adim) {
    const N = adim || 10;
    const P = [];
    let son = [0, 0];
    const ekle = (q) => { const o = P[P.length - 1]; if (!o || Math.hypot(o[0] - q[0], o[1] - q[1]) > 0.05) P.push(q); son = q; };
    for (const c of yol) {
      if (c[0] === 'M' || c[0] === 'L') ekle([c[1], c[2]]);
      else if (c[0] === 'Q') {
        // Çeyrek daire köşe: merkez = başlangıç + bitiş − köşe
        const [kx, ky, ex, ey] = c.slice(1);
        const o = [son[0] + ex - kx, son[1] + ey - ky];
        const a = [son[0] - o[0], son[1] - o[1]];
        const b = [ex - o[0], ey - o[1]];
        for (let i = 1; i <= N; i++) { const t = (i / N) * Math.PI / 2; ekle([o[0] + a[0] * Math.cos(t) + b[0] * Math.sin(t), o[1] + a[1] * Math.cos(t) + b[1] * Math.sin(t)]); }
      } else if (c[0] === 'A') {
        // Dışa doğru (gidiş yönünün sağına) şişen dairesel yay
        const R = c[1];
        const [ex, ey] = [c[3], c[4]];
        const dx = ex - son[0], dy = ey - son[1];
        const L = Math.hypot(dx, dy);
        if (L < 1e-9) continue;
        const h = Math.sqrt(Math.max(0, R * R - (L / 2) * (L / 2)));
        const o = [(son[0] + ex) / 2 - (dy / L) * h, (son[1] + ey) / 2 + (dx / L) * h];
        const a0 = Math.atan2(son[1] - o[1], son[0] - o[0]);
        let a1 = Math.atan2(ey - o[1], ex - o[0]);
        while (a1 <= a0) a1 += 2 * Math.PI;
        const n = Math.max(4, Math.ceil(((a1 - a0) / (Math.PI / 2)) * N));
        for (let i = 1; i <= n; i++) { const t = a0 + ((a1 - a0) * i) / n; ekle([o[0] + R * Math.cos(t), o[1] + R * Math.sin(t)]); }
      } else if (c[0] === 'E') {
        const [a, b] = [c[1], c[2]];
        for (let i = 0; i < 4 * N; i++) { const t = (i / (4 * N)) * 2 * Math.PI; ekle([a + a * Math.cos(t), b + b * Math.sin(t)]); }
      }
    }
    const o = P[0];
    const z = P[P.length - 1];
    if (P.length > 1 && Math.hypot(o[0] - z[0], o[1] - z[1]) < 0.05) P.pop();
    return P;
  }
  /** Köşeleri ayrı ayrı yuvarlatılmış dikdörtgen (u1..u2 × v1..v2); r: [sol-alt, sağ-alt, sağ-üst, sol-üst]. */
  function yuvarlakDikdortgen(u1, u2, v1, v2, r, adim) {
    const N = adim || 10;
    const P = [];
    const kose = (cx, cy, rr, a0) => {
      if (!(rr > 0)) { P.push([cx, cy]); return; }
      // Köşe noktası (cx, cy); merkez içe doğru
      const ox = cx + (cx === u1 ? rr : -rr);
      const oy = cy + (cy === v1 ? rr : -rr);
      for (let i = 0; i <= N; i++) { const t = a0 + (i / N) * (Math.PI / 2); P.push([ox + rr * Math.cos(t), oy + rr * Math.sin(t)]); }
    };
    kose(u1, v1, r[0], Math.PI);
    kose(u2, v1, r[1], 1.5 * Math.PI);
    kose(u2, v2, r[2], 0);
    kose(u1, v2, r[3], Math.PI / 2);
    return P;
  }
  /** Üst yüzü eğimli kutu: sol (x1) üst yüksekliği ySol, sağ (x2) üst yüksekliği ySag. */
  function egimliKutu(x1, x2, y1, ySol, ySag, z1, z2, tur, ek) {
    return Object.assign({ k: [[x1, y1, z1], [x2, y1, z1], [x2, ySag, z1], [x1, ySol, z1], [x1, y1, z2], [x2, y1, z2], [x2, ySag, z2], [x1, ySol, z2]], tur, egik: true }, ek || {});
  }
  /** Eğik plaka (eğimli üst tabla): alt yüz yAltSol..yAltSag, düşey kalınlık kal. */
  function egikPlaka(x1, x2, yAltSol, yAltSag, kal, z1, z2, tur) {
    return { k: [[x1, yAltSol, z1], [x2, yAltSag, z1], [x2, yAltSag + kal, z1], [x1, yAltSol + kal, z1], [x1, yAltSol, z2], [x2, yAltSag, z2], [x2, yAltSag + kal, z2], [x1, yAltSol + kal, z2]], tur, egik: true };
  }

  /** Ön yüz: kapak türüne göre düz, camlı çerçeveli ya da profilli. */
  function onYuz(P, x1, x2, y1, y2Sol, y2Sag, z1, z2, kapakTuru, cerceve, tur, profil) {
    const egik = Math.abs(y2Sol - y2Sag) > 0.5;
    const tek = (a, b, c, dSol, dSag, t2) => P.push(egik || dSol !== dSag ? egimliKutu(a, b, c, dSol, dSag, z1, z2, t2.tur, t2.ek) : kutu(a, b, c, dSol, z1, z2, t2.tur, t2.ek));
    if (tur === 'cekmece' || egik || !(kapakTuru === 'cam_cerceve' || kapakTuru === 'cam_profil')) {
      const t2 = kapakTuru === 'ayna' ? { tur: 'ayna' } : kapakTuru === 'cam' ? { tur: 'cam', ek: { saydam: 0.45 } } : { tur };
      tek(x1, x2, y1, y2Sol, y2Sag, t2);
      return;
    }
    // Çerçeve + cam: dört çıta ve ortada cam
    const e = Math.min(kapakTuru === 'cam_profil' ? profil : cerceve, (x2 - x1) / 3, (y2Sol - y1) / 3);
    const ct = kapakTuru === 'cam_profil' ? 'ayak' : 'kapak';
    P.push(kutu(x1, x1 + e, y1, y2Sol, z1, z2, ct));
    P.push(kutu(x2 - e, x2, y1, y2Sol, z1, z2, ct));
    P.push(kutu(x1 + e, x2 - e, y1, y1 + e, z1, z2, ct));
    P.push(kutu(x1 + e, x2 - e, y2Sol - e, y2Sol, z1, z2, ct));
    const zc = (z1 + z2) / 2;
    P.push(kutu(x1 + e, x2 - e, y1 + e, y2Sol - e, zc - 2, zc + 2, 'cam', { saydam: 0.4 }));
  }

  /**
   * Kapak yüzey deseni kabartması (ön yüzün önünde 2–4 mm). Parçalar ön yüzün türünü alır;
   * altın çıta kulp türünde ve altın renkte çizilir.
   */
  function desenEkle(P, x1, x2, y1, y2, z, desen, tur) {
    const w = x2 - x1;
    const h = y2 - y1;
    if (w < 120 || h < 80) return;
    if (desen === 'cerceve' || (desen === 'kemer' && h < 400)) {
      const e = Math.min(65, w / 5, h / 5);
      const d = 4;
      P.push(kutu(x1, x1 + e, y1, y2, z, z + d, tur));
      P.push(kutu(x2 - e, x2, y1, y2, z, z + d, tur));
      P.push(kutu(x1 + e, x2 - e, y1, y1 + e, z, z + d, tur));
      P.push(kutu(x1 + e, x2 - e, y2 - e, y2, z, z + d, tur));
    } else if (desen === 'citali') {
      const ad = 30;
      const n = Math.max(2, Math.floor(w / ad));
      const a = w / n;
      for (let i = 0; i < n; i++) P.push(kutu(x1 + i * a + a * 0.18, x1 + i * a + a * 0.82, y1 + 2, y2 - 2, z, z + 3, tur));
    } else if (desen === 'kemer') {
      // İçeride kemerli kabartma pano: yan ve alttan 70 mm, üstü yarım daire
      const e = Math.min(70, w / 5);
      const iw = w - 2 * e;
      const ih = h - 2 * e;
      const f = Math.min(iw / 2, ih * 0.45);
      const R = (iw * iw) / 4 / (2 * f) + f / 2;
      const yol = [['M', 0, 0], ['L', iw, 0], ['L', iw, ih - f], ['A', R, R, 0, ih - f], ['Z']];
      P.push(prizma(yolNoktalari(yol, 8), (u, v, ww) => [x1 + e + u, y1 + e + v, ww], z, z + 3, tur));
    } else if (desen === 'altin_cita') {
      const e = Math.min(55, w / 6, h / 6);
      const c = 6;
      const ek = { renk: '#c9a34a' };
      P.push(kutu(x1 + e, x1 + e + c, y1 + e, y2 - e, z, z + 2, 'kulp', ek));
      P.push(kutu(x2 - e - c, x2 - e, y1 + e, y2 - e, z, z + 2, 'kulp', ek));
      P.push(kutu(x1 + e + c, x2 - e - c, y1 + e, y1 + e + c, z, z + 2, 'kulp', ek));
      P.push(kutu(x1 + e + c, x2 - e - c, y2 - e - c, y2 - e, z, z + 2, 'kulp', ek));
    }
  }

  /**
   * Bir modülün yerel parçaları. Yerel: x 0..W (önden bakınca soldan sağa), y zeminden,
   * z 0 = arka (duvar), z = D gövde ön yüzü; tam bini kapaklar z > D.
   */
  /** Parça türünden malzeme rengine (verilmişse). */
  const TUR_RENK = { govde: 'govde', panel: 'govde', baza: 'govde', kapak: 'kapak', cekmece: 'kapak', ic: 'cekmece', arkalik: 'arkalik' };
  function renklendir(P, renk) {
    for (const p of P) {
      const k = TUR_RENK[p.tur];
      if (k && !p.kul) p.kul = k === 'ic' ? 'cekmece' : k; // boyamada hangi kullanıma gider
      if (renk && k && renk[k]) p.renk = renk[k];
      if (renk && renk.doku && k && renk.doku[k] && !p.doku) p.doku = renk.doku[k];
      if (p.satirRenk) { p.renk = p.satirRenk; p.doku = p.satirDoku || null; } // satıra özel ön yüz rengi
    }
    return P;
  }
  function modulParcalari(geo, secenek) {
    return renklendir(modulParcalariHam(geo, secenek), secenek && secenek.renk);
  }
  function modulParcalariHam(geo, secenek) {
    const kapaksiz = !!(secenek && secenek.kapaksiz);
    const P = [];
    if (!geo) return P;
    if (geo.panel) return panelParcalari(geo);
    if (geo.lkose) return lKoseParcalari(geo, kapaksiz);
    const { W, D, Ds, t, hb, tk } = geo;
    const Hc = geo.Hc;
    const egim = geo.egim;
    const HcL = egim ? egim.HcL : Hc;
    const HcR = egim ? egim.HcR : Hc;
    const HX = (x) => HcL + ((HcR - HcL) * x) / W;
    const cos = egim ? Math.cos(Math.atan(Math.abs(HcR - HcL) / W)) : 1;
    const tc = t / cos; // eğik tablanın düşey kalınlığı
    const zArka = D - Ds;
    const icOn = geo.kapakTipi === 'ic' ? tk : 0; // gömme kapakta iç parçalar kapak kalınlığı kadar geride
    const zIcOn = D - icOn;
    const zIcArka = zIcOn - geo.icDerinlik;
    const tabla = geo.yapi === 'tabla_boydan';
    const kusak = geo.ust === 'kusak' && !egim;
    const kusakEn = geo.kusakEn || 100;
    const gc = (geo.baza && geo.baza.geriCekme) || 0;

    // ---------- Baza ----------
    if (geo.baza.tip === 'ayak' || geo.baza.tip === 'ayak_on' || geo.baza.tip === 'tekerlek') {
      const xs = W > 1000 ? [50, W / 2, W - 50] : [50, W - 50];
      // Baza çekmecesinde önde taşıyıcılar var; ayaklar yalnız arkada (kutunun arkasında)
      const zOnAyak = geo.baza.tip === 'ayak_on' ? D - gc - t - 30 : D - gc - 30;
      const zs = geo.bazaCekmece ? [zArka + 20] : [zArka + 50, zOnAyak];
      for (const x of xs) for (const z of zs) P.push(kutu(x - 15, x + 15, 0, hb, z - 15, z + 15, 'ayak'));
      // Yalnız önde baza bandı (ayaklara klipsli)
      if (geo.baza.tip === 'ayak_on') P.push(kutu(0, W, 3, hb, D - gc - t, D - gc, 'baza'));
    } else if (geo.baza.tip === 'panel' && geo.yanYere) {
      // Yanlar bazaya iner: baza önü ve arkası yanların arasında
      P.push(kutu(t, W - t, 0, hb, zArka, zArka + t, 'baza'));
      P.push(kutu(t, W - t, 0, hb, D - gc - t, D - gc, 'baza'));
    } else if (geo.baza.tip === 'panel') {
      const zOn = D - gc;
      P.push(kutu(0, W, 0, hb, zArka, zArka + t, 'baza'));
      // Baza çekmecesinde ön parça ve yanlar yoktur; yerlerini taşıyıcılar alır
      if (!geo.bazaCekmece) {
        P.push(kutu(0, W, 0, hb, zOn - t, zOn, 'baza'));
        P.push(kutu(0, t, 0, hb, zArka + t, zOn - t, 'baza'));
        P.push(kutu(W - t, W, 0, hb, zArka + t, zOn - t, 'baza'));
      }
    }
    if (geo.bazaCekmece) {
      const bc = geo.bazaCekmece;
      const zOn2 = D - gc;
      const zOn1 = zOn2 - tk;
      const tasL = Ds - gc - tk - 2 - (geo.baza.tip === 'panel' ? t : 0);
      for (const [a, b] of [[0, t], [W - t, W]]) P.push(kutu(a, b, 0, hb, zOn1 - 2 - tasL, zOn1 - 2, 'govde'));
      if (!kapaksiz) P.push(kutu(bc.x1, bc.x2, bc.y1, bc.y2, zOn1, zOn2, 'kapak'));
      const k = (geo.kutular || []).find((x) => x.etiket === 'baza çekmecesi');
      if (kapaksiz && k && !k.metal) P.push(kutu(W / 2 - k.kutuW / 2, W / 2 + k.kutuW / 2, 10, 10 + k.kutuH, zOn1 - k.L, zOn1, 'ic'));
    }

    // ---------- Gövde ----------
    const altYok = !!geo.altYok; // alt tablasız: yanlar ve dikmeler zemine iner
    const yanYere = !!geo.yanYere; // yanlar bazaya iner, alt tabla yanların arasında
    const yanAlt = yanYere ? 0 : hb + (tabla && !altYok ? t : 0);
    const icTaban = altYok ? 0 : t; // iç parçaların alt sınırı
    const yanUstY = tabla ? (kusak ? Hc : Hc - t) : Hc;
    for (const [x1, x2] of [[0, t], [W - t, W]]) {
      if (egim) {
        // Yanın üst kenarı eğime uyar (kalınlık boyunca açılı)
        const d = tabla ? tc : 0;
        P.push(egimliKutu(x1, x2, yanAlt, hb + HX(x1) - d, hb + HX(x2) - d, zArka, D, 'govde'));
      } else P.push(kutu(x1, x2, yanAlt, hb + yanUstY, zArka, D, 'govde'));
    }
    const tx1 = tabla ? 0 : t;
    const tx2 = tabla ? W : W - t;
    if (!altYok) P.push(yanYere ? kutu(t, W - t, hb, hb + t, zArka, D, 'govde') : kutu(tx1, tx2, hb, hb + t, zArka, D, 'govde'));
    const tY = geo.tasmaYan || 0;
    const tOn = geo.tasmaOn || 0;
    if (egim) P.push(egikPlaka(tx1, tx2, hb + HX(tx1) - tc, hb + HX(tx2) - tc, tc, zArka, D, 'govde'));
    else if (kusak) {
      P.push(kutu(t, W - t, hb + Hc - t, hb + Hc, D - kusakEn, D, 'govde'));
      P.push(kutu(t, W - t, hb + Hc - t, hb + Hc, zArka, zArka + kusakEn, 'govde'));
    } else if (geo.kavisR > 0) {
      // Kavisli ön köşeler: üstten bakınca gerçek yay (u = x, v = z; ön kenar v = D + tOn)
      const [x1, x2, z1, z2] = [tx1 - tY, tx2 + tY, zArka, D + tOn];
      const R = Math.min(geo.kavisR, (x2 - x1) / 2, z2 - z1);
      const k = geo.kavisKose || 'on';
      const r = [0, 0, k === 'on' || k === 'sag' ? R : 0, k === 'on' || k === 'sol' ? R : 0];
      P.push(prizma(yuvarlakDikdortgen(x1, x2, z1, z2, r), (u, v, w) => [u, w, v], hb + Hc - t, hb + Hc, 'govde'));
    } else P.push(kutu(tx1 - tY, tx2 + tY, hb + Hc - t, hb + Hc, zArka, D + tOn, 'govde'));

    // ---------- Arkalık ----------
    if (geo.arkalik === 'kanal') {
      const z = zArka + (geo.kanalGeri != null ? geo.kanalGeri : 10);
      P.push(egim
        ? egimliKutu(t, W - t, hb + (altYok ? 10 : t), hb + HX(t) - tc, hb + HX(W - t) - tc, z, z + geo.ta, 'arkalik')
        : kutu(t, W - t, hb + (altYok ? 10 : t), hb + Hc - t, z, z + geo.ta, 'arkalik'));
    } else if (geo.arkalik === 'cakma') {
      P.push(egim ? egimliKutu(0, W, hb, hb + HcL, hb + HcR, zArka - geo.ta, zArka, 'arkalik') : kutu(0, W, hb, hb + Hc, zArka - geo.ta, zArka, 'arkalik'));
    }

    // Alttan LED: modülün altında, ön kenara yakın (asma ünite altında zemine / tezgaha ışık)
    if (geo.ledAlt) {
      const yAlt = hb + (altYok ? 0 : 0);
      P.push(kutu(20, W - 20, yAlt - 4, yAlt - 0.5, D - 70, D - 50, 'led'));
    }

    // ---------- İç parçalar ----------
    // Kapaklar kapalıyken yalnızca açık, niş ya da camlı satırların içi çizilir (ön yüzlerin arkasında kalır)
    const camli = (s) => s.tip === 'kapak' && ['cam', 'cam_profil', 'cam_cerceve'].includes(s.kapakTuru);
    const surguSaydam = geo.surgu && geo.surgu.tur !== 'panel' && geo.surgu.tur !== 'ayna';
    const acikSatir = (s) => kapaksiz || surguSaydam || (!geo.surgu && (s.tip === 'acik' || s.tip === 'nis' || camli(s)));
    const herhangiAcik = geo.satirlar.some(acikSatir);
    const ustSatir = (s) => geo.sutunlar[s.sutun].satirlar.indexOf(s) === 0;
    // Bölücüler (boydan dikme, satır arası tabla): gömme kapakta öne kadar gelir ve kapaklar arasında görünür
    const gomme = geo.kapakTipi === 'ic';
    const zBolOn = zIcArka + (geo.bolucuD || geo.icDerinlik);
    const araD = geo.araTablaD || geo.icDerinlik;
    if (herhangiAcik || gomme) {
      for (const dx of geo.dikmeX) {
        if (egim) P.push(egimliKutu(dx, dx + t, hb + icTaban, hb + HX(dx) - tc, hb + HX(dx + t) - tc, zIcArka, zBolOn, 'panel'));
        else P.push(kutu(dx, dx + t, hb + icTaban, hb + Hc - t, zIcArka, zBolOn, 'panel'));
      }
    }
    for (const c of geo.sutunlar) {
      c.sinirlar.forEach((b, i) => {
        if (!b.panel) return;
        if (!gomme && !acikSatir(c.satirlar[i]) && !acikSatir(c.satirlar[i + 1])) return;
        P.push(kutu(b.x1, b.x2, hb + b.y - t / 2, hb + b.y + t / 2, zBolOn - araD, zBolOn, 'panel'));
      });
    }
    for (const s of geo.satirlar) {
      if (!acikSatir(s)) continue;
      const egikSatir = egim && ustSatir(s);
      for (const dx of s.dikmeX) {
        if (egikSatir) P.push(egimliKutu(dx, dx + t, hb + s.icAlt, hb + HX(dx) - tc, hb + HX(dx + t) - tc, zIcArka, zIcOn, 'panel'));
        else P.push(kutu(dx, dx + t, hb + s.icAlt, hb + s.icUst, zIcArka, zIcOn, 'panel'));
      }
      const dolguH = s.icDolguH || 0;
      for (const b of s.bolumler) {
        for (const ry of s.raflar) {
          if (s.rafSabit) P.push(kutu(b.x1, b.x2, hb + ry - t / 2, hb + ry + t / 2, zIcArka, zIcOn, 'panel'));
          else {
            const cam = s.rafTipi === 'cam';
            const yb = geo.rafYan != null ? geo.rafYan : 1;
            const rg = s.rafGeri != null ? s.rafGeri : geo.rafGeri != null ? geo.rafGeri : 20;
            P.push(kutu(b.x1 + yb, b.x2 - yb, hb + ry - (cam ? 3 : t / 2), hb + ry + (cam ? 3 : t / 2), zIcArka, zIcOn - rg, cam ? 'cam' : 'panel', cam ? { saydam: 0.45 } : null));
          }
        }
        if (s.kanca) for (let i = 0; i < s.kanca; i++) {
          // Portmanto kancaları: arka yüzde, satırın üst bölümünde
          const x = b.x1 + ((i + 0.5) * (b.x2 - b.x1)) / s.kanca;
          P.push(kutu(x - 6, x + 6, hb + s.icUst - 220, hb + s.icUst - 200, zIcArka, zIcArka + 70, 'kulp'));
        }
        if (s.ondenAski) P.push(kutu((b.x1 + b.x2) / 2 - 8, (b.x1 + b.x2) / 2 + 8, hb + s.icUst - 40, hb + s.icUst - 24, zIcArka + 20, zIcOn - 20, 'kulp'));
        if (s.aski) P.push(kutu(b.x1, b.x2, hb + s.icUst - (s.askiUstten || 60) - 8, hb + s.icUst - (s.askiUstten || 60) + 8, (zIcArka + zIcOn) / 2 - 8, (zIcArka + zIcOn) / 2 + 8, 'kulp'));
        if (s.led) P.push(kutu(b.x1 + 10, b.x2 - 10, hb + s.icUst - 6, hb + s.icUst - 1, zIcOn - 40, zIcOn - 20, 'led'));
        if (dolguH && (s.icCekmeceler || []).some((c) => c.x1 >= b.x1 - 1 && c.x2 <= b.x2 + 1)) {
          P.push(kutu(b.x1, b.x1 + t, hb + s.icAlt, hb + s.icAlt + dolguH, zIcArka, zIcOn, 'panel'));
          P.push(kutu(b.x2 - t, b.x2, hb + s.icAlt, hb + s.icAlt + dolguH, zIcArka, zIcOn, 'panel'));
        }
      }
      // Gizli çekmeceler: ön (gövde içinde) ve kutu
      for (const c of s.icCekmeceler || []) {
        const zf2 = zIcOn - 5;
        const zf1 = zf2 - t;
        P.push(kutu(c.x1, c.x2, hb + c.y1, hb + c.y2, zf1, zf2, 'cekmece'));
        if (kapaksiz && c.kutuW) {
          const mx = (c.x1 + c.x2) / 2;
          P.push(kutu(mx - c.kutuW / 2, mx + c.kutuW / 2, hb + c.kutuY1, hb + c.kutuY1 + c.kutuH, zf1 - c.L, zf1, 'ic'));
        }
      }
      if (kapaksiz) {
        const zKutu = geo.surgu || geo.kapakTipi === 'ic' ? D - tk : D;
        for (const c of s.cekmeceler) P.push(kutu(c.x1, c.x2, hb + c.y1, hb + c.y2, zKutu - c.L, zKutu, 'ic'));
      }
    }
    if (kapaksiz) return P;

    // ---------- Ön yüzler ----------
    const zOn1 = geo.kapakTipi === 'ic' ? D - tk : D;
    const zOn2 = zOn1 + tk;
    if (geo.korPanel) P.push(kutu(geo.korPanel.x1, geo.korPanel.x2, hb + geo.db, hb + Hc - geo.db, zOn1, zOn2, 'kapak'));
    if (geo.surgu) {
      const s = geo.surgu;
      const tur = s.tur === 'ayna' ? 'ayna' : s.tur === 'cam_profil' || s.tur === 'cam' ? 'cam' : 'kapak';
      for (const k of s.kapaklar) {
        const z = D + (k.arka ? 5 : 12 + tk);
        if (tur === 'kapak') P.push(kutu(k.x1, k.x2, hb + s.y1, hb + s.y2, z, z + tk, 'kapak'));
        else {
          // Cam/ayna sürgü: alüminyum profil çerçeve + dolgu (kesim listesindeki cam ölçüsüyle)
          const e = geo.profilPay || 18;
          const y1 = hb + s.y1;
          const y2 = hb + s.y2;
          P.push(kutu(k.x1, k.x1 + e, y1, y2, z, z + tk, 'ayak'));
          P.push(kutu(k.x2 - e, k.x2, y1, y2, z, z + tk, 'ayak'));
          P.push(kutu(k.x1 + e, k.x2 - e, y1, y1 + e, z, z + tk, 'ayak'));
          P.push(kutu(k.x1 + e, k.x2 - e, y2 - e, y2, z, z + tk, 'ayak'));
          P.push(kutu(k.x1 + e, k.x2 - e, y1 + e, y2 - e, z + tk / 2 - 2, z + tk / 2 + 2, tur, tur === 'cam' ? { saydam: 0.5 } : null));
        }
      }
    }
    for (const s of geo.satirlar) {
      // Sürgü kapaklı dolapta çekmece önleri gövde içinde gömme
      const z1 = geo.surgu ? D - tk : zOn1;
      const ilk = P.length;
      for (const o of s.onler) {
        const tur = s.tip === 'kapak' ? 'kapak' : 'cekmece';
        const y2Sol = hb + (o.y2sol != null ? o.y2sol : s.on.y2);
        const y2Sag = hb + (o.y2sag != null ? o.y2sag : s.on.y2);
        onYuz(P, o.x1, o.x2, hb + s.on.y1, y2Sol, y2Sag, z1, z1 + tk, s.tip === 'kapak' ? s.kapakTuru : 'panel', geo.cerceveEni || 70, tur, geo.profilPay || 18);
        const duzPanel = s.tip === 'cekmece' || s.kapakTuru === 'panel';
        if (geo.kapakDesen && duzPanel && Math.abs(y2Sol - y2Sag) < 0.5) desenEkle(P, o.x1, o.x2, hb + s.on.y1, y2Sol, z1 + tk, geo.kapakDesen, tur);
        // Gola profil: her ön yüzün üst kenarında koyu kanal
        if (geo.kulpTur === 'gola' && duzPanel) P.push(kutu(o.x1, o.x2, y2Sol - 14, y2Sol, z1 + tk, z1 + tk + 0.6, 'ayak', { renk: '#2a2a2c' }));
        if (o.kulp && o.kulp.delikler.length && !(s.tip === 'cekmece' && !s.cekmeceler.length)) {
          const d = o.kulp.delikler;
          const xs = d.map((p) => o.x1 + p.x);
          const ys = d.map((p) => hb + s.on.y1 + p.y);
          const yatay = o.kulp.yatay;
          const x1 = Math.min(...xs) - (yatay ? 10 : 6);
          const x2 = Math.max(...xs) + (yatay ? 10 : 6);
          const y1 = Math.min(...ys) - (yatay ? 6 : 10);
          const y2 = Math.max(...ys) + (yatay ? 6 : 10);
          P.push(kutu(x1, x2, y1, y2, z1 + tk + 18, z1 + tk + 28, 'kulp', geo.kulpRenk ? { renk: geo.kulpRenk } : null));
          // Kulp ayakları (kapağa bağlanan iki uç)
          for (const [dx, dy] of yatay ? [[xs[0], ys[0]], [xs[xs.length - 1], ys[0]]] : [[xs[0], ys[0]], [xs[0], ys[ys.length - 1]]]) P.push(kutu(dx - 4, dx + 4, dy - 4, dy + 4, z1 + tk, z1 + tk + 18, 'kulp', Object.assign({ ayrinti: true }, geo.kulpRenk ? { renk: geo.kulpRenk } : null)));
        }
      }
      // Ön yüz parçaları satırına bağlanır (3B'de tıklayınca satır düzenlenir / boyanır)
      for (let i = ilk; i < P.length; i++) {
        P[i].satir = [s.sutun, s.no != null ? s.no : 0];
        if (s.onRenk && (P[i].tur === 'kapak' || P[i].tur === 'cekmece')) { P[i].satirRenk = s.onRenk; P[i].satirDoku = s.onDoku || null; }
      }
    }
    return P;
  }

  /** L köşe dolap: A kolu X boyunca (duvar Z=0), B kolu Z boyunca (duvar X=0). */
  function lKoseParcalari(g, kapaksiz) {
    const { W, W2, D, t, hb, tk, db, ta } = g;
    const Hc = g.Hc;
    const P = [];
    const gc = (g.baza && g.baza.geriCekme) || 0;
    if (g.baza.tip === 'ayak' || g.baza.tip === 'ayak_on' || g.baza.tip === 'tekerlek') {
      for (const [x, z] of [[ta + 50, ta + 50], [W - 50, ta + 50], [W - 50, D - gc - 30], [ta + 50, W2 - 50], [D - gc - 30, W2 - 50], [D - gc - 30, D - gc - 30]]) P.push(kutu(x - 15, x + 15, 0, hb, z - 15, z + 15, 'ayak'));
    } else if (g.baza.tip === 'panel') {
      const on = D - gc;
      P.push(kutu(on, W, 0, hb, on - t, on, 'baza'));
      P.push(kutu(on - t, on, 0, hb, on - t, W2, 'baza'));
      P.push(kutu(0, W, 0, hb, 0, t, 'baza'));
      P.push(kutu(0, t, 0, hb, t, W2, 'baza'));
      P.push(kutu(W - t, W, 0, hb, t, on - t, 'baza'));
      P.push(kutu(t, on - t, 0, hb, W2 - t, W2, 'baza'));
    }
    // Arkalıklar (duvar dibinde), tablalar ve kol uçlarındaki yanlar
    P.push(kutu(0, W, hb, hb + Hc, 0, ta, 'arkalik'));
    P.push(kutu(0, ta, hb, hb + Hc, ta, W2, 'arkalik'));
    for (const y of [hb, hb + Hc - t]) {
      P.push(kutu(ta, W - t, y, y + t, ta, D, 'govde'));
      P.push(kutu(ta, D, y, y + t, D, W2 - t, 'govde'));
    }
    P.push(kutu(W - t, W, hb, hb + Hc, ta, D, 'govde'));
    P.push(kutu(ta, D, hb, hb + Hc, W2 - t, W2, 'govde'));
    // Raflar (kapaklar kapalıyken görünmez)
    if (kapaksiz) {
      const rafD = D - ta - (g.rafGeri != null ? g.rafGeri : 20);
      const yb = g.rafYan != null ? g.rafYan : 1;
      for (const ry of g.raflar || []) {
        P.push(kutu(ta, W - t - yb, hb + ry - t / 2, hb + ry + t / 2, ta, ta + rafD, 'panel'));
        P.push(kutu(ta, ta + rafD, hb + ry - t / 2, hb + ry + t / 2, ta + rafD, W2 - t - yb, 'panel'));
      }
      return P;
    }
    // Katlanır kapaklar: B kapağı x = D düzleminde, A kapağı onun kalınlığı + boşluk kadar sonra
    P.push(kutu(W - db - g.kapakA, W - db, hb + db, hb + Hc - db, D, D + tk, 'kapak'));
    P.push(kutu(D, D + tk, hb + db, hb + Hc - db, W2 - db - g.kapakB, W2 - db, 'kapak'));
    if (g.kulpTur === 'kulp') {
      const x = W - db - 40;
      const yOrta = hb + Hc - 120;
      P.push(kutu(x - 6, x + 6, yOrta - 90, yOrta + 90, D + tk + 18, D + tk + 28, 'kulp'));
    }
    return P;
  }

  // ---------- Eşya ve dekor nesneleri ----------
  // Her şekil üst üste binmeyen kutulardan kurulur (çizim sırası güvenli kalsın). z: duvardan öne.
  const koyu = (h, k) => '#' + hexRgb(h).map((c) => Math.max(0, Math.min(255, Math.round(c * k))).toString(16).padStart(2, '0')).join('');
  const KITAP_RENK = ['#8a5a3c', '#34465f', '#9db09a', '#c9a57a', '#7a3b3b', '#e3dccf', '#4b4d50', '#b0763f'];
  function nesneParcalari(g) {
    const { W, H, D } = g;
    const z0 = g.zGeri || 0;
    const r = g.renk || '#cccccc';
    const P = [];
    const k = (x1, x2, y1, y2, za, zb, renk, ek) => P.push(Object.assign(kutu(x1, x2, y1, y2, z0 + za, z0 + zb, 'nesne', ek), { renk }));
    // Dönel dilim: (cx, cz) merkezli rx × rz elips kesitli silindir, y1..y2
    const sil = (cx, cz, rx, rz, y1, y2, renk, ek) => {
      const n = 16;
      const pts = Array.from({ length: n }, (_, i) => [cx + rx * Math.cos((i / n) * 2 * Math.PI), z0 + cz + rz * Math.sin((i / n) * 2 * Math.PI)]);
      P.push(Object.assign(prizma(pts, (u, v, w) => [u, w, v], y1, y2, 'nesne', ek), { renk }));
    };
    const on = Math.min(20, D * 0.08);
    switch (g.nesne) {
      case 'buzdolabi': case 'buzdolabi_genis': {
        k(0, W, 0, H, 0, D - on, r);
        const cift = g.nesne === 'buzdolabi_genis';
        if (cift) {
          k(0, W / 2 - 2, 0, H, D - on, D, koyu(r, 1.05)); k(W / 2 + 2, W, 0, H, D - on, D, koyu(r, 1.05));
          for (const x of [W / 2 - 30, W / 2 + 18]) k(x, x + 12, H * 0.45, H * 0.75, D, D + 25, '#777b80');
        } else {
          const s1 = H * 0.36;
          k(0, W, 0, s1 - 3, D - on, D, koyu(r, 1.05)); k(0, W, s1 + 3, H, D - on, D, koyu(r, 1.05));
          k(W - 60, W - 48, s1 - 160, s1 - 30, D, D + 25, '#777b80'); k(W - 60, W - 48, s1 + 40, s1 + 340, D, D + 25, '#777b80');
        }
        break;
      }
      case 'bulasik': case 'camasir': case 'kurutma': case 'derin_dondurucu': {
        const panel = Math.min(90, H * 0.11);
        k(0, W, 0, H, 0, D - on, r);
        k(0, W, H - panel, H, D - on, D, koyu(r, 0.9));
        k(0, W, 0, H - panel, D - on, D, koyu(r, 1.03));
        if (g.nesne === 'camasir' || g.nesne === 'kurutma') { const c = Math.min(W, H) * 0.55; k(W / 2 - c / 2, W / 2 + c / 2, (H - panel) / 2 - c / 2, (H - panel) / 2 + c / 2, D, D + 8, '#5b6670'); }
        if (g.nesne === 'derin_dondurucu') for (const f of [0.33, 0.66]) k(W * 0.35, W * 0.65, (H - panel) * f - 12, (H - panel) * f - 4, D, D + 15, '#777b80');
        break;
      }
      case 'firin': case 'mikrodalga': {
        const panel = Math.min(90, H * 0.2);
        k(0, W, 0, H, 0, D - on, r);
        k(0, W, H - panel, H, D - on, D, koyu(r, 1.3));
        k(0, W, 0, H - panel, D - on, D, '#22252a');
        k(W * 0.1, W * 0.9, H - panel - 40, H - panel - 28, D, D + 22, '#9a9ea3');
        break;
      }
      case 'aspirator': {
        const alt = Math.min(120, H * 0.3);
        k(0, W, 0, alt, 0, D, r);
        k(W * 0.3, W * 0.7, alt, H, 0, Math.min(D, 260), koyu(r, 0.95));
        break;
      }
      case 'tv55': case 'tv65': case 'tv75': case 'monitor': {
        if (g.nesne === 'monitor') {
          k(W / 2 - 40, W / 2 + 40, 0, 12, D * 0.2, D * 0.8, '#333333');
          k(W / 2 - 15, W / 2 + 15, 12, H * 0.25, D * 0.45, D * 0.55, '#333333');
          k(0, W, H * 0.25, H, D * 0.55, D * 0.75, r);
        } else { k(0, W, 0, H, 0, D * 0.4, '#2a2b2e'); k(0, W, 0, H, D * 0.4, D, r); }
        break;
      }
      case 'kitap': {
        // Farklı en ve boyda kitaplar yan yana
        let x = 0;
        let i = 0;
        while (x < W - 8) {
          const w = Math.min(W - x, [28, 34, 22, 40, 30, 26, 36][i % 7]);
          const h = H * [0.95, 0.82, 1, 0.88, 0.76, 0.92, 0.85][i % 7];
          k(x, x + w - 0.5, 0, h, 0, D * [1, 0.9, 0.95, 0.85, 1, 0.92, 0.88][i % 7], KITAP_RENK[i % KITAP_RENK.length]);
          x += w; i++;
        }
        break;
      }
      case 'kitap_yatay': {
        let y = 0;
        let i = 0;
        while (y < H - 5) {
          const h = Math.min(H - y, [32, 24, 40, 28][i % 4]);
          const ic = [0, 12, 4, 18][i % 4];
          k(ic, W - ic / 2, y, y + h - 0.5, ic / 3, D - ic / 3, KITAP_RENK[(i + 2) % KITAP_RENK.length]);
          y += h; i++;
        }
        break;
      }
      case 'aplik': {
        // Duvar plakası, ince gövde, iki ucunda ışık (duvara yukarı-aşağı hare)
        k(W / 2 - 18, W / 2 + 18, H / 2 - 30, H / 2 + 30, 0, 12, r);
        k(W / 2 - 7, W / 2 + 7, 30, H - 30, 12, D - 30, r);
        P.push(Object.assign(kutu(W / 2 - 9, W / 2 + 9, H - 34, H - 26, z0 + D - 34, z0 + D - 22, 'led'), { ledA: [W / 2, H + 40, z0 + 20], ledB: [W / 2, H + 120, z0 + 20] }));
        P.push(Object.assign(kutu(W / 2 - 9, W / 2 + 9, 26, 34, z0 + D - 34, z0 + D - 22, 'led'), { ledA: [W / 2, -40, z0 + 20], ledB: [W / 2, -120, z0 + 20] }));
        break;
      }
      case 'sarkit': {
        // Tavandan kablo, altta cam küre (dilimler) ve içinde ampul
        const c = Math.min(W, D);
        k(W / 2 - 2, W / 2 + 2, c, H, D / 2 - 2, D / 2 + 2, '#3a3a3a');
        k(W / 2 - 22, W / 2 + 22, c - 10, c + 30, D / 2 - 22, D / 2 + 22, r);
        [0.55, 0.85, 1, 0.85, 0.55].forEach((f, i) => { const w = c * f; sil(W / 2, D / 2, w / 2, w / 2, (i * c) / 5, ((i + 1) * c) / 5, '#e9dcc0', { saydam: 0.55 }); });
        P.push(Object.assign(kutu(W / 2 - 14, W / 2 + 14, c / 2 - 14, c / 2 + 14, z0 + D / 2 - 14, z0 + D / 2 + 14, 'led'), { ledA: [W / 2 - 1, c / 2, z0 + D / 2], ledB: [W / 2 + 1, c / 2, z0 + D / 2] }));
        break;
      }
      case 'pampas': {
        // Seramik vazo ve üstte kabaran tüylü otlar
        const vh = H * 0.38;
        [0.55, 0.85, 0.75, 0.45].forEach((f, i) => { const w = W * 0.55 * f; sil(W / 2, D / 2, w / 2, w / 2, (i * vh) / 4, ((i + 1) * vh) / 4, '#d9cbb4'); });
        // Otlar: vazodan yelpaze gibi açılan ince saplar ve üstlerinde tüylü başaklar
        const oh = H - vh;
        for (let i = 0; i < 7; i++) {
          const a = (i - 3) / 3;
          const x = W / 2 + a * W * 0.38;
          const z = D / 2 + Math.sin(i * 2.1) * D * 0.18;
          const ust = vh + oh * (0.75 + 0.25 * Math.cos(a * 1.2));
          k(W / 2 + a * W * 0.08 - 2, W / 2 + a * W * 0.08 + 2, vh - 20, vh + oh * 0.35, z - 2, z + 2, '#b9a888');
          // Başak: yukarı doğru kabarıp incelen tüylü dilimler
          const y0 = vh + oh * 0.3;
          const pr2 = [0.45, 0.85, 1, 0.8, 0.45];
          pr2.forEach((f, j) => sil(x, z, W * 0.09 * f, D * 0.09 * f, y0 + ((ust - y0) * j) / pr2.length, y0 + ((ust - y0) * (j + 1)) / pr2.length, i % 2 ? r : koyu(r, 0.94)));
        }
        break;
      }
      case 'minder': {
        k(0, W, 0, H * 0.75, 0, D, r);
        k(15, W - 15, H * 0.75, H, 15, D - 15, koyu(r, 1.04));
        break;
      }
      case 'tepsi': {
        k(0, W, 0, 6, 0, D, r);
        k(0, W, 6, H, 0, 6, r); k(0, W, 6, H, D - 6, D, r); k(0, 6, 6, H, 6, D - 6, r); k(W - 6, W, 6, H, 6, D - 6, r);
        break;
      }
      case 'vazo': case 'vazo_uzun': case 'biblo': case 'mum': case 'kettle': case 'blender': {
        // Dönel cisim: üst üste daralan/genişleyen dilimler
        const profil = { vazo: [0.6, 0.9, 1, 0.8, 0.5, 0.65], vazo_uzun: [0.55, 0.8, 0.95, 0.75, 0.5, 0.4, 0.55], biblo: [0.9, 0.6, 0.7, 0.5], mum: [1, 0.85], kettle: [1, 0.95, 0.75, 0.4], blender: [0.9, 0.7, 0.75, 0.85, 1, 0.9] }[g.nesne];
        const n = profil.length;
        profil.forEach((f, i) => {
          const w = W * f;
          const d = D * f;
          sil(W / 2, D / 2, w / 2, d / 2, (H * i) / n, (H * (i + 1)) / n, i === 0 && g.nesne === 'blender' ? '#2b2c2f' : koyu(r, 1 - i * 0.03));
        });
        break;
      }
      case 'saksi': case 'bitki_buyuk': {
        const ph = H * 0.3;
        sil(W / 2, D / 2, W * 0.3, D * 0.3, 0, ph * 0.85, '#a0613d');
        sil(W / 2, D / 2, W * 0.33, D * 0.33, ph * 0.85, ph, koyu('#a0613d', 0.9));
        const yap = [[0.55, 0.12], [0.85, 0.18], [1, 0.2], [0.8, 0.12], [0.5, 0.08], [0.25, 0.1]];
        let y = ph;
        yap.forEach(([f, h], i) => { const hh = (H - ph) * h / 0.8; sil(W / 2 + (i % 2 ? W * 0.04 : -W * 0.03), D / 2, (W * f) / 2, (D * f) / 2, y, Math.min(H, y + hh), koyu(r, 1 + (i % 2) * 0.12)); y += hh; });
        break;
      }
      case 'yatak_cift': case 'yatak_tek': {
        // Baza, şilte, yastıklar (başı duvarda)
        const bz = H * 0.55;
        k(0, W, 0, bz, 0, D, koyu(r, 0.75));
        k(0, W, bz, H, 0, D, r);
        const ny = g.nesne === 'yatak_cift' ? 2 : 1;
        for (let i = 0; i < ny; i++) { const x = (W / ny) * i + 60; k(x, x + W / ny - 120, H, H + 120, 40, 420, '#ffffff'); }
        break;
      }
      case 'kanepe': {
        const ot = H * 0.5;
        k(0, W, 0, 120, 0, D, '#4a4038');
        k(0, W, 120, ot, 0, D, r);
        k(0, W, ot, H, 0, D * 0.25, koyu(r, 0.9));
        k(0, 180, ot, H * 0.72, D * 0.25, D, koyu(r, 0.95)); k(W - 180, W, ot, H * 0.72, D * 0.25, D, koyu(r, 0.95));
        break;
      }
      case 'giysi': {
        // Askıdaki giysiler: farklı kalınlık ve boyda, askı borusundan sarkar
        const RENKLER = ['#5d6d7e', '#a04040', '#e8e2d6', '#2f3a44', '#7a8f5a', '#c9a57a', '#34465f', '#d8b4a0', '#4b4d50'];
        let x = 15;
        let i = 0;
        while (x < W - 30) {
          const w = Math.min(W - 15 - x, [45, 60, 38, 52, 70, 42][i % 6]);
          const h = H * [1, 0.62, 0.85, 0.55, 0.95, 0.7, 0.78][i % 7];
          const d = D * [0.9, 0.95, 0.85, 1][i % 4];
          k(x, x + w - 3, H - h, H - 25, (D - d) / 2, (D + d) / 2, RENKLER[(i * 5 + Math.round(W)) % RENKLER.length]);
          k(x + w / 2 - 4, x + w / 2 + 1, H - 25, H, D / 2 - 2, D / 2 + 2, '#8a8f96'); // askı kancası
          x += w + [6, 14, 4, 20][i % 4];
          i++;
        }
        break;
      }
      case 'mont': {
        const RENKLER = ['#6b4f3a', '#2f3a44', '#8a2f2f', '#56624a', '#b59a7a', '#1f2a36'];
        const n = Math.max(1, Math.floor(W / 230));
        const bw = W / n;
        for (let i = 0; i < n; i++) {
          const canta = i % 3 === 2;
          const h = canta ? H * 0.42 : H * [1, 0.85, 0.92][i % 3];
          const d = canta ? D * 0.6 : D * 0.85;
          k(i * bw + 8, (i + 1) * bw - 8, H - h, H, 0, d, RENKLER[(i + Math.round(W / 7)) % RENKLER.length]);
        }
        break;
      }
      case 'ayakkabi': {
        const RENKLER = ['#3b3b3b', '#7a4b2a', '#e6e2da', '#5b6b7a', '#9a3b3b', '#c9a57a'];
        const n = Math.max(1, Math.floor(W / 210));
        const pw = W / n;
        for (let i = 0; i < n; i++) {
          const h = H * [1, 0.7, 0.85, 0.6][i % 4];
          const L = D * [1, 0.92, 0.85][i % 3];
          const sw = Math.min(85, (pw - 30) / 2);
          for (const j of [0, 1]) {
            const x = i * pw + 10 + j * (sw + 8);
            k(x, x + sw, 0, h, D - L, D, RENKLER[(i * 3 + Math.round(W / 9)) % RENKLER.length]);
          }
        }
        break;
      }
      case 'katli': case 'havlu': {
        const RENKLER = g.nesne === 'havlu' ? ['#e9e4da', '#9db09a', '#e9e4da', '#c9d6df', '#d8b4a0'] : ['#b9a68f', '#34465f', '#e8e2d6', '#7a8f5a', '#a04040', '#5d6d7e', '#d8b4a0'];
        const kat = g.nesne === 'havlu' ? 55 : 38;
        let y = 0;
        let i = 0;
        while (y < H - 10) {
          const h = Math.min(H - y, kat);
          const ic = [0, 8, 3, 12][i % 4];
          k(ic, W - ic / 2, y, y + h - 0.5, ic / 2, D - ic / 3, RENKLER[(i + Math.round(W / 11)) % RENKLER.length]);
          y += h; i++;
        }
        break;
      }
      case 'tabak': {
        k(W * 0.15, W * 0.85, 0, 12, D * 0.15, D * 0.85, koyu(r, 0.95));
        k(0, W, 12, H, 0, D, r);
        break;
      }
      case 'bardak': case 'kavanoz': case 'sise': {
        const n = Math.max(1, Math.floor(W / (g.nesne === 'bardak' ? 75 : 95)));
        const bw = W / n;
        const RENKLER = g.nesne === 'sise' ? ['#6f8f6a', '#8a2f2f', '#c9a57a', '#4b6b8a'] : g.nesne === 'kavanoz' ? ['#d9c9a3', '#b0763f', '#e3dccf', '#8a5a3c'] : ['#cfe3ea'];
        for (let i = 0; i < n; i++) {
          const x = i * bw;
          const w = bw - 14;
          const h = H * (g.nesne === 'bardak' ? 1 : [1, 0.75, 0.88][i % 3]);
          const d = Math.min(D, w);
          const z1 = (D - d) / 2;
          if (g.nesne === 'sise') {
            k(x + 4, x + 4 + w, 0, h * 0.68, z1, z1 + d, RENKLER[i % RENKLER.length]);
            k(x + 4 + w * 0.35, x + 4 + w * 0.65, h * 0.68, h, z1 + d * 0.35, z1 + d * 0.65, RENKLER[i % RENKLER.length]);
          } else if (g.nesne === 'kavanoz') {
            k(x + 4, x + 4 + w, 0, h * 0.86, z1, z1 + d, RENKLER[i % RENKLER.length], { saydam: 0.8 });
            k(x + 4 + 3, x + 4 + w - 3, h * 0.86, h, z1 + 3, z1 + d - 3, '#6b5a4a');
          } else k(x + 4, x + 4 + w, 0, h, z1, z1 + d, RENKLER[0], { saydam: 0.55 });
        }
        break;
      }
      case 'kase': {
        k(W * 0.3, W * 0.7, 0, H * 0.15, D * 0.3, D * 0.7, koyu(r, 0.9));
        k(0, W, H * 0.15, H * 0.55, 0, D, r);
        const M = ['#d23c2c', '#f0b429', '#6aa84f', '#e8742e'];
        for (let i = 0; i < 4; i++) { const x = W * (0.12 + 0.2 * i); k(x, x + W * 0.18, H * 0.55, H * (0.85 + 0.05 * (i % 2)), D * (0.25 + 0.1 * (i % 2)), D * (0.65 + 0.1 * (i % 2)), M[i]); }
        break;
      }
      case 'kupa': {
        k(0, W * 0.78, 0, H, 0, D, r);
        k(W * 0.78, W, H * 0.25, H * 0.75, D * 0.4, D * 0.6, koyu(r, 0.9));
        break;
      }
      case 'laptop': {
        k(0, W, 0, 18, 0, D, r);
        k(0, W, 18, H, 0, 12, '#2a2b2e');
        break;
      }
      case 'lamba': {
        k(W * 0.25, W * 0.75, 0, H * 0.06, D * 0.25, D * 0.75, '#444444');
        k(W * 0.46, W * 0.54, H * 0.06, H * 0.55, D * 0.46, D * 0.54, '#555555');
        k(0, W, H * 0.55, H, 0, D, r);
        break;
      }
      case 'cerceve': {
        k(0, W, 0, 12, 0, D, '#3a2e25');
        k(0, W, 12, H, D - 15, D, '#3a2e25');
        break;
      }
      case 'tablo': case 'ayna_duvar': k(0, W, 0, H, 0, D, r); break;
      case 'kahve': case 'airfryer': case 'robot': case 'cay': case 'tost': case 'ekmek': {
        k(0, W, 0, H * 0.12, 0, D, koyu(r, 0.9));
        k(0, W, H * 0.12, H, 0, D * 0.8, r);
        if (g.nesne === 'kahve' || g.nesne === 'cay') k(W * 0.3, W * 0.7, H * 0.12, H * 0.2, D * 0.8, D, '#aaaaaa');
        break;
      }
      default: k(0, W, 0, H, 0, D, r);
    }
    return P;
  }

  function panelParcalari(g, onZ) {
    let P = panelParcalariHam(g, onZ);
    if (g.ledArka && P.length) {
      // Panel duvardan 30 mm takozla uzak; LED arada kalır
      const it = (q) => [q[0], q[1], q[2] + 30];
      P = P.map((p) => Object.assign({}, p, { k: p.k.map(it) }, p.sk ? { sk: { v: p.sk.v.map(it), f: p.sk.f } } : {}));
      // Arkadan LED: panelin arkasında, kenardan 30 mm içeride çevre boyunca (duvara hare)
      const p = P[0];
      const v = p.sk ? p.sk.v.slice(0, p.sk.v.length / 2) : null;
      const b = [0, 1, 2].map((k) => [Math.min(...p.k.map((q) => q[k])), Math.max(...p.k.map((q) => q[k]))]);
      const z = b[2][0] - 1;
      if (v && v.length > 8) {
        // Şekilli: çevreyi merkeze doğru 30 mm içeri alıp en çok 12 parça
        const m = [(b[0][0] + b[0][1]) / 2, (b[1][0] + b[1][1]) / 2];
        const adim = Math.max(1, Math.floor(v.length / 12));
        const pts = [];
        for (let i = 0; i < v.length; i += adim) { const q = v[i]; const dx = q[0] - m[0]; const dy = q[1] - m[1]; const l = Math.hypot(dx, dy) || 1; pts.push([q[0] - (dx / l) * 30, q[1] - (dy / l) * 30]); }
        // Şerit görünmez (aynanın arkasında); ışık ledA–ledB doğru parçasından yayılır
        pts.forEach((q, i) => { const n = pts[(i + 1) % pts.length]; const mx = (q[0] + n[0]) / 2; const my = (q[1] + n[1]) / 2; P.push(Object.assign(kutu(mx - 2, mx + 2, my - 2, my + 2, z - 3, z, 'led'), { ledA: [q[0], q[1], z], ledB: [n[0], n[1], z] })); });
      } else {
        const [x1, x2] = [b[0][0] + 30, b[0][1] - 30];
        const [y1, y2] = [b[1][0] + 30, b[1][1] - 30];
        for (const [a, c] of [[[x1, y1], [x2, y1]], [[x2, y1], [x2, y2]], [[x2, y2], [x1, y2]], [[x1, y2], [x1, y1]]]) P.push(Object.assign(kutu(Math.min(a[0], c[0]) - 2, Math.max(a[0], c[0]) + 2, Math.min(a[1], c[1]) - 2, Math.max(a[1], c[1]) + 2, z - 3, z, 'led'), { ledA: [a[0], a[1], z], ledB: [c[0], c[1], z] }));
      }
      for (const p2 of P) if (p2.tur === 'led') p2.gizli = true; // panelin arkasında kalır; yalnız ışık verir
    }
    return P;
  }
  function panelParcalariHam(g, onZ) {
    const tur = g.kullanim === 'govde' ? 'govde' : g.kullanim === 'ayna' ? 'ayna' : 'kapak';
    if (g.nesne) return nesneParcalari(g);
    if (g.lambri) {
      // Arka panel duvarda, çıtalar önünde eşit aralıklı
      const L = g.lambri;
      const P = [];
      if (L.arkaKul) P.push(kutu(0, g.W, 0, g.H, 0, L.ta, L.arkaKul === 'govde' ? 'govde' : 'kapak'));
      for (let i = 0; i < L.n; i++) {
        const a = i * (L.ce + L.aralik);
        P.push(L.dikey ? kutu(a, a + L.ce, 0, g.H, L.ta, L.ta + g.t, tur) : kutu(0, g.W, a, a + L.ce, L.ta, L.ta + g.t, tur));
      }
      return P;
    }
    if (g.tur === 'bosluk') return [];
    if (g.sekil && g.sekil.yol) {
      // Şekilli panel: kesim yolu (u: en 0..kutuW, v: boy 0..kutuH) gerçek biçimiyle
      const pts = yolNoktalari(g.sekil.yol);
      if (pts.length >= 3) {
        const z = onZ != null ? onZ : 560;
        if (g.tur === 'duvar') return [prizma(pts, (u, v, w) => [u, v, w], 0, g.t, tur)];
        if (g.tur === 'yan_kapama') return [prizma(pts, (u, v, w) => [w, v, u], 0, g.t, tur)];
        if (g.tur === 'raf' || g.tur === 'tabla') return [prizma(pts, (u, v, w) => [v, w, u], 0, g.t, tur)];
        if (g.tur === 'baza') return [prizma(pts, (u, v, w) => [v, u, w], 0, g.t, tur)];
        return [prizma(pts, (u, v, w) => [u, v, w], z, z + g.t, tur)];
      }
    }
    if (g.tur === 'duvar') return [kutu(0, g.W, 0, g.H, 0, g.t, tur)];
    if (g.tur === 'yan_kapama') return [kutu(0, g.t, 0, g.boy, 0, g.en, tur)];
    if (g.tur === 'raf' || g.tur === 'tabla') return [kutu(0, g.boy, 0, g.t, 0, g.en, tur)];
    if (g.tur === 'baza') return [kutu(0, g.boy, 0, g.en, 0, g.t, tur)];
    // Dolgu, bulaşık kapağı, serbest: komşu dolapların ön düzleminde dik panel
    const z = onZ != null ? onZ : 560;
    return [kutu(0, g.W, 0, g.H, z, z + g.t, tur)];
  }

  /** Yerleşimdeki her modülü dünya koordinatına taşır. */
  function projeParcalari(yer, secenek) {
    const P = [];
    for (const y of yer.yerler) {
      let yerel;
      if (y.geo && y.geo.nesne) yerel = nesneParcalari(y.geo);
      else if (y.geo && y.geo.panel && !['yan_kapama', 'raf', 'tabla', 'baza', 'lambri', 'duvar'].includes(y.geo.tur)) {
        // Ön panel: aynı duvar ve sıradaki en yakın gövdenin ön yüzüne hizalanır
        const komsu = yer.yerler.filter((x) => x !== y && x.geo && !x.geo.panel && x.sira === y.sira && (x.duvar === y.duvar || x.duvar === 'kose'))
          .sort((a, b) => Math.abs(a.bas - y.bas) - Math.abs(b.bas - y.bas))[0];
        yerel = renklendir(panelParcalari(y.geo, komsu ? komsu.geo.D : null), secenek && secenek.renkFn ? secenek.renkFn(y.modul) : null);
      } else yerel = modulParcalari(y.geo, Object.assign({}, secenek, { renk: secenek && secenek.renkFn ? secenek.renkFn(y.kaynak || y.modul) : null }));
      const donustur = (p) => {
        if (y.duvar === 'kose' || y.duvar === 'A' || yer.tip !== 'L') return [y.duvar === 'kose' ? p[0] : y.bas + p[0], y.montaj + p[1], p[2]];
        // B duvarı: modül +X yönüne bakar; yerel sol (x=0) köşeden uzakta
        return [p[2], y.montaj + p[1], y.bas + y.W - p[0]];
      };
      const kaynak = y.kaynak || y.modul;
      for (const q of yerel) P.push(Object.assign({}, q, { k: q.k.map(donustur), modul: y.modul.ad, modulId: kaynak.id }, q.sk ? { sk: { v: q.sk.v.map(donustur), f: q.sk.f } } : {}, q.ledA ? { ledA: donustur(q.ledA), ledB: donustur(q.ledB) } : {}));
    }
    return P;
  }

  /** Çokgenin (düzlemsel olmayabilir) Newell normali. */
  function newell(pts) {
    const n = [0, 0, 0];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      n[0] += (a[1] - b[1]) * (a[2] + b[2]);
      n[1] += (a[2] - b[2]) * (a[0] + b[0]);
      n[2] += (a[0] - b[0]) * (a[1] + b[1]);
    }
    return n;
  }
  // Altı yüzün köşe indisleri
  const YUZLER = [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [3, 7, 6, 2], [0, 4, 7, 3], [1, 2, 6, 5]];
  const hexRgb = (h) => { const x = /^#[0-9a-f]{3}$/i.test(h) ? '#' + h[1] + h[1] + h[2] + h[2] + h[3] + h[3] : h; return [1, 3, 5].map((i) => parseInt(x.slice(i, i + 2), 16) || 0); };

  /**
   * Çizim sırası (uzaktan yakına). İki parçanın ekran kutuları örtüşüyorsa ve dünya
   * eksenlerinden birinde ayrıklarsa, bakış yönüne göre arkadaki önce çizilir. Ayrılamayan
   * çiftlerde (eğik parçalar) ağırlık merkezi derinliği kullanılır. Döngü kalırsa en uzaktaki seçilir.
   */
  /** Noktaların dışbükey zarfı (Andrew monoton zincir), saat yönünün tersine. */
  function zarf(P) {
    const N = P.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    if (N.length < 3) return N;
    const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const alt = [];
    for (const p of N) { while (alt.length >= 2 && cr(alt[alt.length - 2], alt[alt.length - 1], p) <= 0) alt.pop(); alt.push(p); }
    const ust = [];
    for (let i = N.length - 1; i >= 0; i--) { const p = N[i]; while (ust.length >= 2 && cr(ust[ust.length - 2], ust[ust.length - 1], p) <= 0) ust.pop(); ust.push(p); }
    return alt.slice(0, -1).concat(ust.slice(0, -1));
  }
  /** İki dışbükey çokgen ekranda gerçekten örtüşüyor mu (ayırma ekseni testi; değmek örtüşme sayılmaz). */
  function cokgenOrtusur(A, B) {
    for (const P of [A, B]) {
      for (let i = 0; i < P.length; i++) {
        const p = P[i];
        const q = P[(i + 1) % P.length];
        const n = [q[1] - p[1], p[0] - q[0]];
        const l = Math.hypot(n[0], n[1]);
        if (l < 1e-9) continue;
        let a1 = Infinity, a2 = -Infinity, b1 = Infinity, b2 = -Infinity;
        for (const v of A) { const d = (v[0] * n[0] + v[1] * n[1]) / l; a1 = Math.min(a1, d); a2 = Math.max(a2, d); }
        for (const v of B) { const d = (v[0] * n[0] + v[1] * n[1]) / l; b1 = Math.min(b1, d); b2 = Math.max(b2, d); }
        if (a2 <= b1 + 0.3 || b2 <= a1 + 0.3) return false;
      }
    }
    return true;
  }

  function siraBul(ogeler, bakis) {
    const n = ogeler.length;
    const once = Array.from({ length: n }, () => []); // i → i'den sonra çizilmesi gerekenler
    const gelen = new Array(n).fill(0);
    const E = 0.5;
    for (let i = 0; i < n; i++) {
      const a = ogeler[i];
      for (let j = i + 1; j < n; j++) {
        const b = ogeler[j];
        if (a.ex2 <= b.ex1 || b.ex2 <= a.ex1 || a.ey2 <= b.ey1 || b.ey2 <= a.ey1) continue; // ekranda örtüşmez
        if (a.zarf && b.zarf && !cokgenOrtusur(a.zarf, b.zarf)) continue; // kutuları değil, gerçek şekilleri
        let karar = 0; // -1: a önce, 1: b önce
        let enIyi = 0;
        for (let k = 0; k < 3; k++) {
          const v = bakis[k];
          if (Math.abs(v) < 1e-6) continue;
          let yon = 0;
          if (a.b[k][1] <= b.b[k][0] + E) yon = v > 0 ? -1 : 1; // a eksi tarafta
          else if (b.b[k][1] <= a.b[k][0] + E) yon = v > 0 ? 1 : -1;
          if (yon && Math.abs(v) > enIyi) { enIyi = Math.abs(v); karar = yon; }
        }
        if (!karar) karar = a.derinlik <= b.derinlik ? -1 : 1;
        if (karar < 0) { once[i].push(j); gelen[j]++; } else { once[j].push(i); gelen[i]++; }
      }
    }
    // Kahn: hazır olanlardan en uzaktakini (en küçük derinlik) seç
    const sira = [];
    const hazir = [];
    const kullanildi = new Array(n).fill(false);
    for (let i = 0; i < n; i++) if (!gelen[i]) hazir.push(i);
    while (sira.length < n) {
      let sec = -1;
      if (hazir.length) {
        let ei = 0;
        for (let h = 1; h < hazir.length; h++) if (ogeler[hazir[h]].derinlik < ogeler[hazir[ei]].derinlik) ei = h;
        sec = hazir.splice(ei, 1)[0];
      } else {
        // Döngü: kalanlardan en uzaktaki
        for (let i = 0; i < n; i++) if (!kullanildi[i] && (sec < 0 || ogeler[i].derinlik < ogeler[sec].derinlik)) sec = i;
      }
      kullanildi[sec] = true;
      sira.push(sec);
      for (const j of once[sec]) {
        gelen[j]--;
        if (gelen[j] === 0 && !kullanildi[j]) hazir.push(j);
      }
    }
    return sira;
  }

  /**
   * Parçaları SVG'ye çizer. gorus: { yaw, pitch } (derece), secenek.yakin: yakınlaştırma (1 = sığdır).
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
    // Bakana doğru dünya yönü (kamera z ekseninin dünya bileşenleri)
    const bakis = [don([1, 0, 0])[2], don([0, 1, 0])[2], don([0, 0, 1])[2]];
    const isik = (() => { const v = [0.35, 0.75, 0.55]; const n = Math.hypot(...v); return v.map((a) => a / n); })();
    const ogeler = [];
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of parcalar) {
      if (p.ayrinti || p.gizli) continue; // küçük ayrıntılar (kulp ayakları) ve gizli ışık şeritleri yalnız gerçekçi görünümde
      const v = (p.sk ? p.sk.v : p.k).map(don);
      let ex1 = Infinity, ex2 = -Infinity, ey1 = Infinity, ey2 = -Infinity;
      for (const q of v) { ex1 = Math.min(ex1, q[0]); ex2 = Math.max(ex2, q[0]); ey1 = Math.min(ey1, -q[1]); ey2 = Math.max(ey2, -q[1]); }
      minX = Math.min(minX, ex1); maxX = Math.max(maxX, ex2); minY = Math.min(minY, ey1); maxY = Math.max(maxY, ey2);
      const b = [0, 1, 2].map((k) => [Math.min(...p.k.map((q) => q[k])), Math.max(...p.k.map((q) => q[k]))]);
      const derinlik = v.reduce((a, q) => a + q[2], 0) / v.length;
      const [r, g, bb] = hexRgb(p.renk || RENK[p.tur] || RENK.govde);
      const yuzler = [];
      const merkez = v.reduce((a, q) => a.map((c, k) => c + q[k] / v.length), [0, 0, 0]);
      for (const idx of p.sk ? p.sk.f : YUZLER) {
        const pts = idx.map((i2) => v[i2]);
        // Normal: Newell yöntemi (dörtgende köşegen çarpımına eşit; eğik parçalarda da kararlı), dışa doğru yönlendirilir
        let n = newell(pts);
        const nl = Math.hypot(...n);
        if (nl < 1e-9) continue;
        n = n.map((x) => x / nl);
        const yuzMerkez = pts.reduce((s2, q) => s2.map((x, k) => x + q[k] / pts.length), [0, 0, 0]);
        if (n[0] * (yuzMerkez[0] - merkez[0]) + n[1] * (yuzMerkez[1] - merkez[1]) + n[2] * (yuzMerkez[2] - merkez[2]) < 0) n = n.map((x) => -x);
        if (n[2] <= 0.0001) continue; // arka yüz
        const parlak = 0.62 + 0.38 * Math.max(0, n[0] * isik[0] + n[1] * isik[1] + n[2] * isik[2]);
        yuzler.push({ pts, renk: `rgb(${Math.round(r * parlak)},${Math.round(g * parlak)},${Math.round(bb * parlak)})` });
      }
      ogeler.push({ derinlik, yuzler, saydam: p.saydam, b, ex1, ex2, ey1, ey2, zarf: zarf(v.map((q) => [q[0], q[1]])) });
    }
    if (!ogeler.length) return '<p class="bos">Gösterilecek parça yok.</p>';
    const f = (x) => Math.round(x * 10) / 10;
    let s = '';
    for (const i of siraBul(ogeler, bakis)) {
      const p = ogeler[i];
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

  return { modulParcalari, projeParcalari, ciz, kutu, prizma, yolNoktalari, yuvarlakDikdortgen, newell, siraBul, zarf, cokgenOrtusur, RENK };
});

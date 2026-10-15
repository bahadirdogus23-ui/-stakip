/*
 * Delik planı: bir modülün tüm parçalarındaki delik, kanal ve oyma koordinatları.
 * Koordinatlar parçanın görünen yüzünde, sol-alt köşeden mm:
 *  - Yan ve dikmeler: x ön kenardan arkaya, y alt kenardan yukarı.
 *  - Tablalar, kuşaklar, ara tabla, sabit raf: x sol uçtan, y ön kenardan.
 *  - Kapak ve çekmece önü: x sol kenardan, y alt kenardan (önden bakış; menteşe çanakları iç yüzde).
 *  - Çekmece kutusu parçaları: x ön uçtan / sol uçtan, y alt kenardan.
 * Delik türleri: baglanti, pim (raf pimi), mentese (çanak), plaka (menteşe plakası), ray, kulp,
 * vida (vida/çivi/aksesuar yeri). Kanallar: arkalık ve taban kanalı, cam lambası, oyma, LED yeri.
 *
 * Her modül türü (normal gövde, eğimli gövde, L köşe, paneller) ve her parça ele alınır; delik
 * gerektirmeyen parçalar gerekçesiyle "deliksiz" listesinde döner.
 */
(function (root, factory) {
  const api = factory(root.Hesap || (typeof require === 'function' ? require('./hesap.js') : null));
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Delik = api;
})(typeof self !== 'undefined' ? self : this, function (Hesap) {
  'use strict';

  const r1 = (x) => Math.round(x * 10) / 10;
  const say = (v, d) => (Number.isFinite(Number(v)) && v !== '' && v != null ? Number(v) : d);
  const tr = (x) => String(r1(x)).replace('.', ',');
  const ICERI = 37; // 32 mm sistemde ön ve arka kenardan standart mesafe

  /** Bağlantı elemanlarının delikleri: yüz (karşı parçanın yüzü), uç (bağlanan parçanın ucu), çanak (minifix gövdesi). */
  const BAGLANTI = {
    minifix: { yuz: { cap: 5, derinlik: 12, ad: 'Minifix pimi Ø5' }, uc: { cap: 8, derinlik: 34, ad: 'Pim geçişi Ø8 (uçtan)' }, canak: { cap: 15, derinlik: 13, ad: 'Minifix gövdesi Ø15', mesafe: 34 } },
    konfirmat: { yuz: { cap: 7, derinlik: 0, ad: 'Konfirmat Ø7 (boydan, havşalı)' }, uc: { cap: 5, derinlik: 50, ad: 'Konfirmat kılavuz Ø5 (uçtan)' } },
    kavela: { yuz: { cap: 8, derinlik: 12, ad: 'Kavela Ø8' }, uc: { cap: 8, derinlik: 25, ad: 'Kavela Ø8 (uçtan)' } },
    seffaf_kose: { isaret: 'Şeffaf köşe bağlantı yeri (4 vida Ø3 kılavuz)' },
    seffaf_t: { isaret: 'Şeffaf T bağlantı yeri (4 vida Ø3 kılavuz)' },
  };

  /** Derinlik boyunca bağlantı konumları (ön ve arka kenardan 37 mm; derin parçada ortada da). */
  function derinlikKonumlari(z0, z1) {
    const d = z1 - z0;
    if (d < 2 * ICERI + 20) return [(z0 + z1) / 2];
    const L = [z0 + ICERI, z1 - ICERI];
    if (d >= 350) L.splice(1, 0, (z0 + z1) / 2);
    return L;
  }

  /** Minifix yanındaki kavelanın konumları: pim + 32, başka bağlantıyla çakışmıyorsa. */
  function kavelaKonumlari(konumlar, z1) {
    return konumlar.map((z) => z + 32).filter((k) => k < z1 - 20 && konumlar.every((z) => Math.abs(z - k) > 20));
  }

  /** a..b aralığında, uçlardan `uc` içeride, en fazla `aralik` arayla eşit noktalar. */
  function sira(a, b, uc, aralik) {
    const u = Math.min(uc, (b - a) / 2);
    const bas = a + u;
    const son = b - u;
    if (son - bas < 1) return [(a + b) / 2];
    const n = Math.max(1, Math.ceil((son - bas) / aralik));
    const L = [];
    for (let i = 0; i <= n; i++) L.push(bas + (i * (son - bas)) / n);
    return L;
  }

  /** Ön yüzün çekmece kutusuna bağlandığı 4 vida (kutu önünün iç yüzünden). */
  function onBaglantiNoktalari(w, h) {
    const xs = w > 160 ? [40, w - 40] : [w / 2];
    const ys = h >= 80 ? [25, h - 25] : [h / 2];
    const L = [];
    for (const x of xs) for (const y of ys) L.push({ x, y });
    return L;
  }

  function mentesheKonumlari(h) {
    return Hesap.mentesheKonumlari(h, Hesap.mentesheAdedi(h));
  }

  // ------------------------------------------------------------------ plan kurucu
  function planKur() {
    const parcalar = [];
    const P = {
      parcalar,
      yeni(ad, kaynak, w, h, eksen, ek) {
        const p = Object.assign({ ad, kaynak, w: r1(w), h: r1(h), eksen, delikler: [], kanallar: [], notlar: [], adet: 1, konumlar: [] }, ek || {});
        // Ölçüsü geçersiz parça (hesap zaten uyarır) plana girmez
        if (p.w > 0 && p.h > 0) parcalar.push(p);
        return p;
      },
    };
    return P;
  }
  function delik(p, tur, x, y, cap, derinlik, ad, yuz) {
    if (!p) return;
    if (!(x >= -0.5 && y >= -0.5 && x <= p.w + 0.5 && y <= p.h + 0.5)) {
      p.disarida = (p.disarida || 0) + 1;
      if (!p.disariOrnek) p.disariOrnek = `${ad} (${r1(x)}, ${r1(y)})`;
      return;
    }
    // Aynı yerde aynı delik (ör. ara tablasız iki satırın ortak raf pimi) bir kez açılır
    if (p.delikler.some((d) => d.tur === tur && d.cap === cap && d.yuz === (yuz || '') && Math.abs(d.x - x) < 0.6 && Math.abs(d.y - y) < 0.6)) return;
    p.delikler.push({ tur, x: r1(x), y: r1(y), cap, derinlik, ad, yuz: yuz || '' });
  }
  function not(p, metin) {
    if (p && metin && !p.notlar.includes(metin)) p.notlar.push(metin);
  }
  /** Dikdörtgen kanal / oyma. yon: 'x' → x ekseninde a..b aralığı, y tüm boy; 'y' → tersi; yoksa tam dikdörtgen. */
  function kanal(p, x1, y1, x2, y2, ad, konum) {
    if (!p) return;
    p.kanallar.push({ x1: r1(Math.max(0, x1)), y1: r1(Math.max(0, y1)), x2: r1(Math.min(p.w, x2)), y2: r1(Math.min(p.h, y2)), ad, konum: konum || '' });
  }

  /**
   * Yüz–uç birleşimi: A parçasının yüzüne B parçasının ucu dayanır.
   * yuzN(z) → { p, x, y, yuz } (A'daki delik), ucN(z) → { p, x, y, yuz } (B'nin ucundaki delik),
   * canakN(z, mesafe) → { p, x, y, yuz } (B'nin yüzünde, uçtan mesafe kadar içeride).
   */
  function yuzUcBagla(tur, konumlar, zMax, yuzN, ucN, canakN) {
    const b = BAGLANTI[tur] || BAGLANTI.minifix;
    for (const z of konumlar) {
      const a = yuzN(z);
      if (b.isaret) {
        if (a) delik(a.p, 'baglanti', a.x, a.y, 3, 0, b.isaret, a.yuz);
        const c = canakN && canakN(z, 20);
        if (c) delik(c.p, 'baglanti', c.x, c.y, 3, 0, b.isaret, c.yuz);
        continue;
      }
      if (a) delik(a.p, 'baglanti', a.x, a.y, b.yuz.cap, b.yuz.derinlik, b.yuz.ad, a.yuz);
      const u = ucN(z);
      if (u) delik(u.p, 'baglanti', u.x, u.y, b.uc.cap, b.uc.derinlik, b.uc.ad, u.yuz);
      if (b.canak && canakN) {
        const c = canakN(z, b.canak.mesafe);
        if (c) delik(c.p, 'baglanti', c.x, c.y, b.canak.cap, b.canak.derinlik, b.canak.ad, c.yuz);
      }
    }
    if (tur === 'minifix') {
      for (const k of kavelaKonumlari(konumlar, zMax)) {
        const a = yuzN(k);
        const u = ucN(k);
        if (a) delik(a.p, 'baglanti', a.x, a.y, 8, 12, 'Kavela Ø8', a.yuz);
        if (u) delik(u.p, 'baglanti', u.x, u.y, 8, 25, 'Kavela Ø8 (uçtan)', u.yuz);
      }
    }
  }

  /** Parçanın kulp delikleri (Hesap.kulpDelikleri sonucu) ve kulp türüne göre not. */
  function kulpUygula(p, kulp, kulpTur, camli) {
    if (kulp && kulp.delikler) {
      for (const d of kulp.delikler) delik(p, 'kulp', d.x, d.y, 5, 0, camli ? 'Kulp deliği (camcı açar)' : (kulp.dugme ? 'Düğme kulp Ø5 (boydan)' : 'Kulp Ø5 (boydan)'), 'ön yüz');
    } else if (kulpTur === 'gomme') not(p, 'Gömme kulp: kulp frezesi/oyma ölçüsü kulp kataloğuna göre.');
    else if (kulpTur === 'basac') not(p, 'Bas-aç: kulp deliği yok; bas-aç tamponu gövdeye takılır.');
  }

  // ------------------------------------------------------------------ normal ve eğimli gövde
  function govdePlani(P, g, modul, sonuc, A) {
    const HS = sonuc.hirdavatSecimi;
    const govdeTur = HS.baglanti;
    const araTur = HS.araBaglanti === 'ayni' ? (HS.baglanti === 'seffaf_kose' ? 'seffaf_t' : HS.baglanti) : HS.araBaglanti;
    const { t, Ds, W } = g;
    const tablaBoydan = g.yapi === 'tabla_boydan';
    // Gömme kapakta iç parçalar kapak kalınlığı kadar geride başlar; sürgüde raflar tam derin,
    // yalnız çekmeceler (gömme önleriyle) kapak kalınlığı kadar geride
    const icOn = g.kapakTipi === 'ic' ? g.tk : 0;
    const cekOn = g.kapakTipi === 'ic' || g.surgu ? g.tk : 0;
    const icSon = icOn + g.icDerinlik;
    const egim = g.egim;
    const HcL = egim ? egim.HcL : g.Hc;
    const HcR = egim ? egim.HcR : g.Hc;
    const Hc = g.Hc;
    const alfa = egim ? Math.atan(Math.abs(HcL - HcR) / W) : 0;
    const cos = Math.cos(alfa);
    const HcX = (x) => HcL + ((HcR - HcL) * x) / W;
    const kusak = g.ust === 'kusak' && !egim;
    const kusakEn = say(A.kusakGenisligi, 100);
    const kanalGeri = say(A.arkalikGeriPay, 10);
    const kd = say(A.arkalikKanalDerinligi, 8);
    const kutuBul = (etiket) => (g.kutular || []).find((k) => k.etiket === etiket);
    const satirAdi = (sat) => {
      const c = g.sutunlar[sat.sutun];
      const i = c.satirlar.indexOf(sat) + 1;
      return g.sutunlar.length > 1 ? `bölme ${sat.sutun + 1}, satır ${i}` : `satır ${i}`;
    };
    const ustSatir = (sat) => g.sutunlar[sat.sutun].satirlar.indexOf(sat) === 0;

    // ---------- Dikey parçalar ----------
    const V = [];
    const dikey = (o) => { V.push(o); return o; };
    // Eğimli yanın boyu uzun kenardır (kesim listesiyle aynı)
    const yanUst = (xDis, xIc) => {
      const Hs = egim ? Math.max(HcX(xDis), HcX(xIc)) : Hc;
      return tablaBoydan ? (kusak ? Hc : egim ? Hs - t / cos : Hs - t) : Hs;
    };
    const altYok = !!g.altYok; // alt tablasız: yanlar ve dikmeler zemine iner
    const yanYere = !!g.yanYere; // yanlar bazaya iner: alt tabla yanların arasında
    const altUstte = tablaBoydan && !altYok && !yanYere; // alt tabla yanların altında
    const ustUstte = tablaBoydan && !kusak; // üst tabla yanların üstünde
    const yanY0 = yanYere ? -g.hb : altUstte ? t : 0;
    // Gömme kapakta bölücüler öne kadar gelir
    const bolOn = g.kapakTipi === 'ic' ? 0 : icOn;
    const bolD = g.bolucuD || g.icDerinlik;
    const araD = g.araTablaD || g.icDerinlik;
    const yanEksen = 'x: ön kenardan · y: alt kenardan (iç yüz)';
    dikey({
      p: P.yeni(egim ? 'Sol yan' : 'Yan (sol)', egim ? 'Sol yan' : 'Yan', Ds, yanUst(0, t) - yanY0, yanEksen),
      x: 0, y0: yanY0, z0: 0, yuzSol: null, yuzSag: 'iç yüz', tur: govdeTur, kenar: true,
    });
    g.dikmeX.forEach((dx, k) => {
      const ust = egim ? Math.max(HcX(dx), HcX(dx + t)) - t / cos : Hc - t;
      dikey({
        p: P.yeni(`Bölme dikmesi ${k + 1}`, egim ? `Bölme dikmesi (boydan) ${k + 1}` : 'Bölme dikmesi (boydan)', bolD, ust - (altYok ? 0 : t), 'x: ön kenardan · y: alt kenardan', { konumlar: [`soldan ${tr(dx)} mm`] }),
        x: dx, y0: altYok ? 0 : t, z0: bolOn, yuzSol: 'sol yüz', yuzSag: 'sağ yüz', tur: araTur,
      });
    });
    dikey({
      p: P.yeni(egim ? 'Sağ yan' : 'Yan (sağ)', egim ? 'Sağ yan' : 'Yan', Ds, yanUst(W, W - t) - yanY0, yanEksen),
      x: W - t, y0: yanY0, z0: 0, yuzSol: 'iç yüz', yuzSag: null, tur: govdeTur, kenar: true,
    });
    for (const c of g.sutunlar) {
      for (const sat of c.satirlar) {
        sat.dikmeX.forEach((dx, k) => {
          const egik = egim && ustSatir(sat);
          const ust = egik ? Math.max(HcX(dx), HcX(dx + t)) - t / cos : sat.icUst;
          const ek = satirAdi(sat);
          dikey({
            p: P.yeni(`Ara dikme (${ek})${sat.dikmeX.length > 1 ? ` ${k + 1}` : ''}`, egik ? `Ara dikme (${ek}) ${k + 1}` : `Ara dikme (${ek})`, g.icDerinlik, ust - sat.icAlt, 'x: ön kenardan · y: alt kenardan'),
            x: dx, y0: sat.icAlt, z0: icOn, yuzSol: 'sol yüz', yuzSag: 'sağ yüz', tur: araTur, satir: sat,
          });
        });
      }
    }
    for (const v of V) v.w = v.p.w;
    /** X konumunda, sağa (taraf 'sag') veya sola ('sol') bakan dikey yüz; Y yüksekliğinde. */
    const yuzBul = (X, taraf, Y) => {
      const v = V.find((d) => Math.abs((taraf === 'sag' ? d.x + t : d.x) - X) < 1 && (taraf === 'sag' ? d.yuzSag : d.yuzSol) && Y >= d.y0 - 1 && Y <= d.y0 + d.p.h + 1);
      return v ? { v, yuz: taraf === 'sag' ? v.yuzSag : v.yuzSol } : null;
    };
    const yuzDelik = (f, tur, Y, z, cap, der, ad) => delik(f.v.p, tur, z - f.v.z0, Y - f.v.y0, cap, der, ad, f.yuz);

    // ---------- Yatay parçalar ----------
    const Hz = [];
    const yatay = (o) => {
      const h = Object.assign({ egik: false }, o);
      h.yerel = (X) => (h.egik ? (X - h.x0) / cos : X - h.x0);
      h.yAltX = (X) => (h.egik ? HcX(X) - t / cos : h.yAlt);
      h.yUstX = (X) => (h.egik ? HcX(X) : h.yAlt + t);
      h.kapsar = (X) => X >= h.x0 - 1 && X <= h.x0 + h.genis + 1;
      Hz.push(h);
      return h;
    };
    const tablaX0 = tablaBoydan ? 0 : t;
    const tablaGenis = tablaBoydan ? W : W - 2 * t;
    const tablaEksen = (yuz) => `x: sol uçtan · y: ön kenardan (${yuz})`;
    if (!altYok) {
      const ax0 = altUstte ? 0 : t;
      const ag = altUstte ? W : W - 2 * t;
      yatay({ p: P.yeni('Alt tabla', 'Alt tabla', ag, Ds, tablaEksen('üst yüz')), x0: ax0, genis: ag, yAlt: 0, z0: 0, z1: Ds, tur: govdeTur, govde: true, alt: true, ustte: altUstte });
    }
    if (egim) {
      yatay({ p: P.yeni('Üst tabla (eğimli)', 'Üst tabla (eğimli)', tablaGenis / cos, Ds, 'x: sol uçtan, eğik yüzey boyunca · y: ön kenardan'), x0: tablaX0, genis: tablaGenis, egik: true, z0: 0, z1: Ds, tur: govdeTur, govde: true, ust: true, ustte: tablaBoydan });
      not(Hz[Hz.length - 1].p, `Uçlar ${tr(egim.aci)}° açılı kesilir; uç delikleri kesik yüzeye dik delinir.`);
    } else if (kusak) {
      yatay({ p: P.yeni('Ön kuşak', 'Ön kuşak', W - 2 * t, kusakEn, 'x: sol uçtan · y: ön kenardan'), x0: t, genis: W - 2 * t, yAlt: Hc - t, z0: 0, z1: kusakEn, tur: govdeTur, govde: true, ust: true });
      yatay({ p: P.yeni('Arka kuşak', 'Arka kuşak', W - 2 * t, kusakEn, 'x: sol uçtan · y: ön kenardan'), x0: t, genis: W - 2 * t, yAlt: Hc - t, z0: Ds - kusakEn, z1: Ds, tur: govdeTur, govde: true, ust: true });
    } else {
      // Taşmalı üst tabla: yanlardan ve önden taşar (x ve y taşan kenardan ölçülür)
      const tY = g.tasmaYan || 0;
      const tOn = g.tasmaOn || 0;
      const ustAd = g.kavisR > 0 ? 'Üst tabla – kavisli' : 'Üst tabla';
      yatay({ p: P.yeni(ustAd, ustAd, tablaGenis + 2 * tY, Ds + tOn, tablaEksen('alt yüz')), x0: tablaX0 - tY, genis: tablaGenis + 2 * tY, yAlt: Hc - t, z0: -tOn, z1: Ds, tur: govdeTur, govde: true, ust: true, ustte: ustUstte });
    }
    g.sutunlar.forEach((c, si) => {
      const cw = c.x2 - c.x1;
      const ad = g.sutunlar.length > 1 ? `Ara tabla (bölme ${si + 1})` : 'Ara tabla (sabit raf)';
      for (const b of c.sinirlar) {
        if (!b.panel) continue;
        yatay({ p: P.yeni(ad, ad, cw, araD, 'x: sol uçtan · y: ön kenardan', { konumlar: [`alttan ${tr(b.y - t / 2 + g.hb)} mm`] }), x0: c.x1, genis: cw, yAlt: b.y - t / 2, z0: bolOn, z1: bolOn + araD, tur: araTur });
      }
      for (const sat of c.satirlar) {
        if (!sat.rafSabit) continue;
        for (const b of sat.bolumler) {
          for (const ry of sat.raflar) {
            yatay({ p: P.yeni(`Sabit raf (${satirAdi(sat)})`, `Sabit raf (${satirAdi(sat)})`, b.x2 - b.x1, g.icDerinlik, 'x: sol uçtan · y: ön kenardan', { konumlar: [`alttan ${tr(ry - t / 2 + g.hb)} mm`] }), x0: b.x1, genis: b.x2 - b.x1, yAlt: ry - t / 2, z0: icOn, z1: icSon, tur: araTur });
          }
        }
      }
    });
    /** X'te, Y'ye alt yüzü (ust=true) veya üst yüzü dayanan yatay parça. */
    const egimTol = egim ? (Math.abs(HcR - HcL) / W) * t + 1 : 1;
    const yatayBul = (X, Y, ustte, z0, z1) => Hz.filter((h) => h.kapsar(X) && Math.abs((ustte ? h.yAltX(X) : h.yUstX(X)) - Y) < (h.egik ? egimTol : 1) && Math.min(z1, h.z1) - Math.max(z0, h.z0) > 10);

    // ---------- 1) Yatay parçaların uçları dikey yüzlere ----------
    for (const h of Hz) {
      if (h.ustte) continue; // yanların üstünü/altını kapatan tabla: yanlar tablaya oturur
      for (const taraf of ['sol', 'sag']) {
        const X = taraf === 'sol' ? h.x0 : h.x0 + h.genis;
        const Y = (h.egik ? h.yAltX(X) + t / cos / 2 : h.yAlt + t / 2);
        const f = yuzBul(X, taraf === 'sol' ? 'sag' : 'sol', Y);
        if (!f) { not(h.p, `${taraf === 'sol' ? 'Sol' : 'Sağ'} ucunda dikey parça yok; köşebentle sabitleyin.`); continue; }
        const ucX = taraf === 'sol' ? 0 : h.p.w;
        const konumlar = derinlikKonumlari(h.z0, h.z1);
        yuzUcBagla(h.tur, konumlar, h.z1,
          (z) => ({ p: f.v.p, x: z - f.v.z0, y: Y - f.v.y0, yuz: f.yuz }),
          (z) => ({ p: h.p, x: ucX, y: z - h.z0, yuz: taraf === 'sol' ? 'sol uç' : 'sağ uç' }),
          (z, m) => ({ p: h.p, x: taraf === 'sol' ? m : h.p.w - m, y: z - h.z0, yuz: h.alt ? 'alt yüz' : h.ust ? 'alt yüz' : 'alt yüz' }));
      }
    }

    // ---------- 2) Dikey parçaların uçları yatay yüzlere ----------
    for (const v of V) {
      const Xc = v.x + t / 2;
      for (const ucta of ['alt', 'ust']) {
        // Yanların yalnız tablaya oturan uçları bağlanır (tabla yanların arasındaysa bağlantı tablanın ucundan yapılır)
        if (v.kenar && !(ucta === 'alt' ? altUstte : ustUstte)) continue;
        const Y = ucta === 'alt' ? v.y0 : v.y0 + v.p.h;
        const adaylar = yatayBul(Xc, Y, ucta === 'ust', v.z0, v.z0 + v.w);
        if (!adaylar.length) {
          if (!(v.kenar && ucta === 'ust' && kusak)) not(v.p, `${ucta === 'alt' ? 'Alt' : 'Üst'} ucunda panel yok; köşebentle sabitleyin.`);
          continue;
        }
        for (const h of adaylar) {
          const z0 = Math.max(v.z0, h.z0);
          const z1 = Math.min(v.z0 + v.w, h.z1);
          const camYuz = v.yuzSag || v.yuzSol;
          // Çekmeceli satırdaki dikmenin alt ucunda minifix gövdesi ray hattına denk gelir: kavela + tutkal
          const rayHatti = ucta === 'alt' && v.satir && v.satir.cekmeceler.length && v.tur === 'minifix';
          if (rayHatti) not(v.p, 'Alt uç ray hattına yakın: minifix yerine kavela + tutkal ile bağlanır.');
          yuzUcBagla(rayHatti ? 'kavela' : v.tur, derinlikKonumlari(z0, z1), z1,
            (z) => ({ p: h.p, x: h.yerel(Xc), y: z - h.z0, yuz: ucta === 'alt' ? 'üst yüz' : 'alt yüz' }),
            (z) => ({ p: v.p, x: z - v.z0, y: ucta === 'alt' ? 0 : v.p.h, yuz: ucta === 'alt' ? 'alt uç' : 'üst uç' }),
            (z, m) => ({ p: v.p, x: z - v.z0, y: ucta === 'alt' ? m : v.p.h - m, yuz: camYuz }));
        }
      }
    }

    // ---------- 3) Satır içi donanım ----------
    const dolgular = new Map(); // yüz → iç çekmece dolgu paneli
    for (const sat of g.satirlar) {
      const ek = satirAdi(sat);
      const yOrta = (sat.icAlt + sat.icUst) / 2;
      const kutu = kutuBul(ek);
      for (const b of sat.bolumler) {
        const yuzler = [yuzBul(b.x1, 'sag', yOrta), yuzBul(b.x2, 'sol', yOrta)].filter(Boolean);
        // Hareketli raflar: pim sırası (±32 ayar payı)
        if (!sat.rafSabit) {
          // ±32 ayar delikleri satırın iç yüksekliğinde kalır (komşu satıra taşmaz)
          for (const f of yuzler) for (const ry of sat.raflar) for (const z of [icOn + ICERI, icSon - ICERI]) for (const d of [-32, 0, 32]) {
            if (d && (ry + d < sat.icAlt + 10 || ry + d > sat.icUst - 10)) continue;
            yuzDelik(f, 'pim', ry + d, z, 5, 10, sat.rafTipi === 'cam' ? 'Cam raf pimi Ø5' : 'Raf pimi Ø5');
          }
        }
        // Çekmece rayları
        for (const c of sat.cekmeceler.filter((x) => x.x1 >= b.x1 - 1 && x.x2 <= b.x2 + 1)) {
          const yan = !kutu || !kutu.metal && kutu.ray !== 'gizli';
          const y = yan ? c.y1 + 22 : c.y1 - 7;
          const L = c.L || 400;
          const zs = [cekOn + ICERI, cekOn + Math.max(ICERI + 64, L - 32)];
          if (L >= 450) zs.splice(1, 0, cekOn + ICERI + 32 * Math.round((L - 69) / 64));
          for (const f of yuzler) for (const z of zs) yuzDelik(f, 'ray', y, z, 4, 10, yan ? 'Ray vidası Ø4 (ray ekseni kutu tabanı +22)' : 'Gizli/metal ray vidası Ø4');
          if (!yan) for (const f of yuzler) not(f.v.p, 'Gizli/metal ray delik yüksekliği ve konumları ray şablonuna göre kontrol edilmeli.');
        }
        // İç (gizli) çekmeceler: dolgu panelleri yüzlere vidalanır, raylar dolguya takılır
        const ic = (sat.icCekmeceler || []).filter((x) => x.x1 >= b.x1 - 1 && x.x2 <= b.x2 + 1);
        if (ic.length && sat.icDolguH) {
          const dh = sat.icDolguH;
          const vz = [icOn + 60, icSon - 60];
          const vy = [30, dh - 30];
          for (const f of yuzler) {
            for (const z of vz) for (const y of vy) yuzDelik(f, 'vida', sat.icAlt + y, z, 3, 10, 'Dolgu paneli vida yeri Ø3 (kılavuz)');
            const d = P.yeni(`İç çekmece dolgu paneli (${ek})`, `İç çekmece dolgu paneli (${ek})`, g.icDerinlik, dh, 'x: ön kenardan · y: alt kenardan');
            for (const z of vz) for (const y of vy) delik(d, 'vida', z - icOn, y, 4, 0, 'Vida Ø4 (boydan, havşalı; gövdeye)', 'çekmece yüzü');
            for (const k of ic) {
              const L = k.L || 400;
              for (const z of [ICERI, Math.max(ICERI + 64, L - 32)]) delik(d, 'ray', z, k.kutuY1 + 22 - sat.icAlt, 4, 10, 'Ray vidası Ø4 (ray ekseni kutu tabanı +22)', 'çekmece yüzü');
            }
            dolgular.set(f.v.p.ad + '|' + f.yuz + '|' + sat.icAlt, d);
          }
        }
        // Askı borusu flanşları
        if (sat.aski) {
          const y = sat.icUst - (sat.askiUstten || 60);
          const z = (icOn + icSon) / 2;
          for (const f of yuzler) for (const [dz, dy] of [[0, 12], [-10.4, -6], [10.4, -6]]) yuzDelik(f, 'vida', y + dy, z + dz, 3, 10, 'Askı flanşı vidası Ø3');
        }
        // LED: üstteki panelin alt yüzünde profil yeri ve kablo deliği
        if (sat.led && sat.tip !== 'cekmece') {
          const Xc = (b.x1 + b.x2) / 2;
          const ustPanel = (z) => Hz.filter((x) => x.kapsar(Xc) && x.z0 <= z && x.z1 >= z && x.yAltX(Xc) >= sat.icUst - 1).sort((a, c) => a.yAltX(Xc) - c.yAltX(Xc))[0];
          const h = ustPanel(icOn + 25);
          if (h) kanal(h.p, h.yerel(b.x1), icOn + 15 - h.z0, h.yerel(b.x2), icOn + 35 - h.z0, 'LED profili yeri (alt yüz, yüzeye vidalı)', `ön kenardan ${tr(icOn + 15 - h.z0)}–${tr(icOn + 35 - h.z0)} mm`);
          const hk = ustPanel(icSon - 30);
          if (hk) delik(hk.p, 'vida', hk.yerel(b.x2) - 30, icSon - 30 - hk.z0, 10, 0, 'LED kablo deliği Ø10 (boydan)', 'alt yüz');
        }
      }

      // Ön yüzler: menteşe plakaları (gövde tarafı) ve kapak/çekmece önü delikleri
      const onH = sat.on.y2 - sat.on.y1;
      const kapak = sat.tip === 'kapak';
      const egikSatir = egim && ustSatir(sat);
      sat.onler.forEach((o, k) => {
        const w = o.x2 - o.x1;
        const hL = o.y2sol != null ? o.y2sol - sat.on.y1 : onH;
        const hR = o.y2sag != null ? o.y2sag - sat.on.y1 : onH;
        const hKutu = Math.max(hL, hR);
        const yan = sat.onler.length > 1 ? (k === 0 ? ' – sol' : k === sat.onler.length - 1 ? ' – sağ' : ` – ${k + 1}`) : '';
        const tur = kapak ? sat.kapakTuru : 'panel';
        const ekseni = 'x: sol kenardan · y: alt kenardan (önden bakış)';
        const hE = o.menteseSol ? hL : hR; // menteşe kenarının boyu
        const menteseY = mentesheKonumlari(hE).map((pos) => hE - pos); // alttan
        const yana = kapak && sat.acilim === 'yana';

        // Gövde tarafı: menteşe plakaları
        if (yana) {
          const bolum = o.menteseSol
            ? sat.bolumler.reduce((a, b) => (Math.abs(b.x1 - o.x1) < Math.abs(a.x1 - o.x1) ? b : a))
            : sat.bolumler.reduce((a, b) => (Math.abs(b.x2 - o.x2) < Math.abs(a.x2 - o.x2) ? b : a));
          const X = o.menteseSol ? bolum.x1 : bolum.x2;
          const f = Math.abs(X - (o.menteseSol ? o.x1 : o.x2)) < t + 25 ? yuzBul(X, o.menteseSol ? 'sag' : 'sol', yOrta) : null;
          if (f) {
            for (const my of menteseY) {
              const Y = sat.on.y1 + my;
              if (Y - 16 < f.v.y0 + 3 || Y + 16 > f.v.y0 + f.v.p.h - 3) {
                not(f.v.p, `${ek}: menteşe plakası (alttan ${tr(Y)} mm) bu parçanın dışına/tablaya denk geliyor; kapak yüksekliğini veya menteşe yerini kontrol edin.`);
                continue;
              }
              for (const d of [-16, 16]) yuzDelik(f, 'plaka', Y + d, icOn + ICERI, 5, 12, 'Menteşe plakası Ø5');
              const dolgu = dolgular.get(f.v.p.ad + '|' + f.yuz + '|' + sat.icAlt);
              if (dolgu && Y < sat.icAlt + sat.icDolguH) {
                kanal(dolgu, 0, Y - sat.icAlt - 35, 70, Y - sat.icAlt + 35, 'Menteşe plakası için oyma 70×70 mm (boydan)', `alttan ${tr(Y - sat.icAlt - 35)}–${tr(Y - sat.icAlt + 35)} mm, ön kenarda`);
              }
            }
          }
        } else if (kapak && sat.acilim === 'yukari') {
          const Xs = [o.x1 + w * 0.2, o.x1 + w * 0.8];
          for (const X of Xs) {
            const h = Hz.filter((x) => x.kapsar(X) && x.yAltX(X) >= sat.icUst - 1).sort((a, c) => a.yAltX(X) - c.yAltX(X))[0];
            if (h && h.yerel(X) - 16 >= 3 && h.yerel(X) + 16 <= h.p.w - 3) for (const d of [-16, 16]) delik(h.p, 'plaka', h.yerel(X) + d, icOn + ICERI - h.z0, 5, 12, 'Menteşe plakası Ø5 (yukarı kalkan kapak)', 'alt yüz');
            else if (h) not(h.p, `${ek}: yukarı kalkan kapağın menteşe plakası parça ucuna çok yakın; mekanizma şablonuyla yerinde belirleyin.`);
          }
          for (const f of [yuzBul(sat.bolumler[0].x1, 'sag', yOrta), yuzBul(sat.bolumler[sat.bolumler.length - 1].x2, 'sol', yOrta)].filter(Boolean)) {
            not(f.v.p, `Kaldırma mekanizması (${ek}): yan iç yüze mekanizma şablonuyla delinir.`);
          }
        } else if (kapak && sat.acilim === 'asagi') {
          for (const X of [o.x1 + w * 0.2, o.x1 + w * 0.8]) {
            const h = Hz.filter((x) => x.kapsar(X) && x.yUstX(X) <= sat.icAlt + 1).sort((a, c) => c.yUstX(X) - a.yUstX(X))[0];
            if (h) delik(h.p, 'plaka', h.yerel(X), icOn + 10 - h.z0, 5, 0, 'Klapa menteşesi yeri (frezeli, şablonla)', 'üst yüz');
          }
          for (const f of [yuzBul(sat.bolumler[0].x1, 'sag', yOrta), yuzBul(sat.bolumler[sat.bolumler.length - 1].x2, 'sol', yOrta)].filter(Boolean)) {
            not(f.v.p, `Klapa makası / freni (${ek}): yan iç yüze makas şablonuyla delinir.`);
          }
        }

        // Ön yüz parçası
        const kontur = o.y2sol != null ? [[0, 0], [w, 0], [w, hR], [0, hL]] : null;
        const kulpTur = g.kulpTur;
        if (egikSatir) {
          const ad = `${kapak ? 'Kapak' : sat.cekmeceler.length ? 'Çekmece önü' : 'Sabit ön – çekmece sığmadı'} (${ek}) – eğimli ${k + 1}`;
          const p = P.yeni(ad, ad, w, hKutu, ekseni, { kontur });
          if (yana) for (const my of menteseY) delik(p, 'mentese', o.menteseSol ? 22.5 : w - 22.5, my, 35, 12.5, 'Menteşe çanağı Ø35 (iç yüz)', 'iç yüz');
          if (kapak || sat.cekmeceler.length) kulpUygula(p, o.kulp, kulpTur);
          else not(p, 'Sabit ön: gövdeye köşebentle bağlanır (kulp yok).');
          not(p, `Yamuk: sol ${tr(hL)}, sağ ${tr(hR)} mm${yana ? `; menteşeler ${o.menteseSol ? 'sol' : 'sağ'} kenarda, alttan ölçülür` : ''}.`);
          if (!kapak) cekmeceOnBagla(p, o, sat, kutu);
          return;
        }
        if (!kapak) {
          const kutuVar = sat.cekmeceler.length > 0;
          const ad = kutuVar ? `Çekmece önü (${ek})${yan}` : `Sabit ön – çekmece sığmadı (${ek})${yan}`;
          const p = P.yeni(ad, kutuVar ? `Çekmece önü (${ek})` : `Sabit ön – çekmece sığmadı (${ek})`, w, onH, ekseni);
          if (kutuVar) {
            kulpUygula(p, o.kulp, kulpTur);
            cekmeceOnBagla(p, o, sat, kutu);
          } else {
            for (const x of (w > 140 ? [50, w - 50] : [w / 2])) delik(p, 'vida', x, onH / 2, 2.5, 10, 'Köşebent vidası Ø2,5 kılavuz (iç yüz)', 'iç yüz');
            not(p, 'Sabit ön: gövdeye 2 köşebentle bağlanır.');
          }
          return;
        }
        const cups = (p, xKenar) => {
          if (yana) for (const my of menteseY) delik(p, 'mentese', xKenar, my, 35, 12.5, 'Menteşe çanağı Ø35 (iç yüz)', 'iç yüz');
          else if (sat.acilim === 'yukari') for (const x of [w * 0.2, w * 0.8]) delik(p, 'mentese', x, onH - 22.5, 35, 12.5, 'Menteşe çanağı Ø35 (iç yüz, üst kenar)', 'iç yüz');
          else if (sat.acilim === 'asagi') not(p, `Klapa menteşesi alt kenarda, soldan ${tr(w * 0.2)} ve ${tr(w * 0.8)} mm (menteşe şablonuyla frezelenir).`);
        };
        if (tur === 'cam' || tur === 'ayna') {
          const kaynak = `Kapak (${ek}) – ${tur}`;
          const p = P.yeni(`Kapak (${ek})${yan} – ${tur}`, kaynak, w, onH, ekseni);
          if (yana) for (const my of menteseY) delik(p, 'mentese', o.menteseSol ? 22.5 : w - 22.5, my, 26, 0, 'Cam menteşe deliği Ø26 (camcı açar)', 'cam');
          kulpUygula(p, o.kulp, kulpTur, true);
          not(p, `${tur === 'cam' ? 'Cam' : 'Ayna'}: delikler camcıya bu ölçülerle verilir; kıskaçlı cam menteşede delik gerekmez.`);
        } else if (tur === 'cam_profil') {
          const p = P.yeni(`Profil kapak (${ek})${yan}`, null, w, onH, ekseni);
          if (yana) for (const my of menteseY) delik(p, 'mentese', o.menteseSol ? 22.5 : w - 22.5, my, 35, 0, 'Menteşe yuvası (profilde, tedarikçi açar)', 'iç yüz');
          kulpUygula(p, o.kulp, kulpTur);
          not(p, 'Alüminyum profil kapak: menteşe yuvası ve kulp delikleri profil tedarikçisine bu ölçülerle sipariş edilir.');
        } else if (tur === 'cam_cerceve') {
          cerceveKapak(P, ek, yan, w, onH, o, sat, yana ? menteseY : null, A, kulpTur);
        } else {
          const p = P.yeni(`Kapak (${ek})${yan}`, `Kapak (${ek})`, w, onH, ekseni);
          cups(p, o.menteseSol ? 22.5 : w - 22.5);
          kulpUygula(p, o.kulp, kulpTur);
        }
      });

      // İç çekmece önleri
      const icler = sat.icCekmeceler || [];
      if (icler.length) {
        const ikutu = kutuBul(`${ek}, iç çekmece`);
        for (const c of icler) {
          const w = c.x2 - c.x1;
          const h = c.y2 - c.y1;
          const p = P.yeni(`İç çekmece önü (${ek})`, `İç çekmece önü (${ek})`, w, h, 'x: sol kenardan · y: alt kenardan (önden bakış)');
          if (ikutu && !ikutu.metal) {
            const kx1 = (c.x1 + c.x2) / 2 - ikutu.kutuW / 2 + ikutu.tc;
            for (const n of onBaglantiNoktalari(ikutu.kutuW - 2 * ikutu.tc, ikutu.kutuH)) {
              delik(p, 'vida', kx1 + n.x - c.x1, c.kutuY1 + n.y - c.y1, 2.5, 10, 'Ön bağlantı vidası Ø2,5 kılavuz (iç yüz)', 'iç yüz');
            }
          } else not(p, 'Kutuya ön bağlantı aparatıyla takılır (set kataloğuna göre).');
          not(p, HS.kulp === 'kulp' || HS.kulp === 'gomme' ? 'Tutamak: üst kenarda gömme kulp/oyma (kapak arkasında kaldığı için).' : 'Kulpsuz: bas-aç veya üst kenardan tutma oyması.');
        }
      }
    }

    function cekmeceOnBagla(p, o, sat, k) {
      const c = sat.cekmeceler.filter((x) => x.x2 > o.x1 && x.x1 < o.x2).sort((a, b) => (Math.min(b.x2, o.x2) - Math.max(b.x1, o.x1)) - (Math.min(a.x2, o.x2) - Math.max(a.x1, o.x1)))[0];
      if (!c || !k) return;
      if (k.metal) { not(p, 'Metal yanlı çekmece: ön bağlantı braketlerinin delikleri set kataloğuna göre açılır.'); return; }
      const kx1 = c.x1 + k.tc;
      let disarda = 0;
      for (const n of onBaglantiNoktalari(k.kutuW - 2 * k.tc, k.kutuH)) {
        const x = kx1 + n.x - o.x1;
        const y = c.y1 + n.y - sat.on.y1;
        if (x < 10 || x > p.w - 10 || y < 10 || y > p.h - 10) { disarda++; continue; }
        delik(p, 'vida', x, y, 2.5, 10, 'Ön bağlantı vidası Ø2,5 kılavuz (iç yüz)', 'iç yüz');
      }
      if (disarda) not(p, 'Çekmece kutusu bu ön yüzle hizalı değil (ör. kör panel); bağlantı vidalarını yerinde işaretleyin.');
    }

    // ---------- 4) Arkalık: kanallar ve çakma vida yerleri ----------
    if (g.arkalik === 'kanal') {
      const z1 = Ds - kanalGeri - g.ta;
      const z2 = Ds - kanalGeri;
      const ad = `Arkalık kanalı ${tr(g.ta)}×${tr(kd)} mm`;
      for (const v of V.filter((x) => x.kenar)) kanal(v.p, z1, 0, z2, v.p.h, `${ad} (iç yüz)`, `ön kenardan ${tr(z1)}–${tr(z2)} mm`);
      for (const h of Hz.filter((x) => x.govde && x.z0 <= z1 && x.z1 >= z2)) {
        kanal(h.p, 0, z1 - h.z0, h.p.w, z2 - h.z0, `${ad} (${h.alt ? 'üst' : 'alt'} yüz)`, `ön kenardan ${tr(z1 - h.z0)}–${tr(z2 - h.z0)} mm`);
      }
    } else if (g.arkalik === 'cakma') {
      const p0 = say(A.arkalikCakmaPay, 2);
      const ad = egim ? 'Arkalık (çakma) – yamuk' : 'Arkalık (çakma)';
      // Kesim listesiyle aynı: kenar boyları arkalığın kendi sol/sağ kenarındaki gövde yüksekliğinden
      const hSol = (egim ? HcX(p0) : Hc) - 2 * p0;
      const hSag = (egim ? HcX(W - p0) : Hc) - 2 * p0;
      const ark = P.yeni(ad, ad, W - 2 * p0, Math.max(hSol, hSag), 'x: soldan · y: alttan (önden bakış)', {
        kontur: egim ? [[0, 0], [W - 2 * p0, 0], [W - 2 * p0, hSag], [0, hSol]] : null,
      });
      const isaret = (x, y) => delik(ark, 'vida', x - p0, y - p0, 2, 0, 'Arkalık vidası / çivi yeri', 'arka yüz');
      const ustY = (X) => (egim ? HcX(X) - t / cos / 2 : Hc - t / 2);
      for (const X of [t / 2, W - t / 2]) for (const y of sira(0, (X < W / 2 ? HcL : HcR), 50, 150)) isaret(X, y);
      for (const X of sira(0, W, 50, 150)) { isaret(X, t / 2); isaret(X, ustY(X)); }
      if (Math.abs(icSon - Ds) < 1) {
        for (const v of V.filter((x) => !x.kenar && !x.satir)) for (const y of sira(v.y0, v.y0 + v.p.h, 50, 150)) isaret(v.x + t / 2, y);
        for (const h of Hz.filter((x) => !x.govde && x.z1 >= Ds - 1)) for (const X of sira(h.x0, h.x0 + h.genis, 40, 150)) isaret(X, h.yAlt + t / 2);
      }
      not(ark, `Arkalık gövdenin arka kenarlarına ${tr(p0)} mm içeriden çakılır/vidalanır; işaretler parça kenarlarının ortasıdır.`);
    }

    // ---------- 5) Çekmece kutuları ----------
    for (const k of g.kutular || []) kutuPlani(P, k, HS);

    // ---------- 6) Baza, ayak, baza çekmecesi ----------
    const alt = Hz.find((h) => h.alt) || Hz[0];
    const baza = g.baza || { tip: 'yok' };
    const hb = g.hb;
    const gc = say(baza.geriCekme, 0);
    if (baza.tip === 'panel' && yanYere) {
      // Baza önü ve arkası yanların arasında: uçlarından yanların iç yüzüne bağlanır
      const yanlar = V.filter((v) => v.kenar);
      const ys = hb < 100 ? [-hb / 2] : [-hb / 2 - 20, -hb / 2 + 20];
      for (const [ad, z] of [['Baza önü', gc + t / 2], ['Baza arkası', Ds - t / 2]]) {
        const bp = P.yeni(ad, ad, W - 2 * t, hb, 'x: soldan · y: alttan (iç yüz)');
        yanlar.forEach((v, i) => {
          const X = i === 0 ? 0 : W - 2 * t;
          for (const y of ys) {
            delik(bp, 'baglanti', X, y + hb, 8, 25, 'Kavela Ø8 (uçtan)', i === 0 ? 'sol uç' : 'sağ uç');
            delik(v.p, 'baglanti', z - v.z0, y - v.y0, 8, 12, `Kavela Ø8 (${ad.toLowerCase()})`, 'iç yüz');
          }
        });
        not(bp, ad === 'Baza önü' ? `Yanların arasında, önden ${tr(gc)} mm geride; üst kenarı alt tablaya köşebentle.` : 'Yanların arasında, arka kenarla aynı hizada.');
      }
    } else if (baza.tip === 'panel') {
      const onYok = !!g.bazaCekmece;
      const yanL = Ds - gc - 2 * t;
      const ys = hb < 100 ? [hb / 2] : [hb / 2 - 20, hb / 2 + 20];
      const onArka = P.yeni(onYok ? 'Baza arkası' : 'Baza ön/arka', onYok ? 'Baza arkası' : 'Baza ön/arka', W, hb, 'x: soldan · y: alttan (iç yüz)', { adet: onYok ? 1 : 2 });
      const yanP = onYok ? null : P.yeni('Baza yanı', 'Baza yanı', yanL, hb, 'x: ön uçtan · y: alttan', { adet: 2 });
      // Ön/arka parçası iki ucunda yanlara bağlanır; bir yanın iki ucu (ön ve arka) çizilir.
      // Baza çekmecesinde ön parça yoktur: yanların yalnızca arka ucu bağlanır.
      const uclar = [0, yanL];
      if (onYok) not(onArka, 'Baza çekmecesi var: baza yanları yerine çekmece taşıyıcıları kullanılır; arka parça taşıyıcılara köşebentle bağlanır.');
      else [t / 2, W - t / 2].forEach((X, i) => {
        const u = uclar[i];
        yuzUcBagla(govdeTur, ys, hb,
          (y) => ({ p: onArka, x: X, y, yuz: 'iç yüz' }),
          (y) => (u == null ? null : { p: yanP, x: u, y, yuz: u === 0 ? 'ön uç' : 'arka uç' }),
          (y, m) => (u == null ? null : { p: yanP, x: u === 0 ? m : yanL - m, y, yuz: 'iç yüz' }));
      });
      if (govdeTur === 'konfirmat' && !onYok) not(onArka, 'Ön bazada konfirmat başı görünür: tapa ile kapatın veya bu birleşimde minifix kullanın.');
      not(onArka, 'Çerçeve gövdenin altına 4 köşebentle bağlanır.');
    } else if (baza.tip === 'ayak' || baza.tip === 'ayak_on') {
      if (baza.tip === 'ayak_on') not(P.yeni('Baza önü (klipsli)', 'Baza önü (klipsli)', W, hb - 3, 'x: soldan · y: alttan (iç yüz)'), 'Delik yok: ön ayaklara baza klipsiyle takılır.');
      const n = W > 1000 ? 6 : 4;
      const xs = n === 4 ? [50, W - 50] : [50, W / 2, W - 50];
      for (const X of xs) for (const z of (g.bazaCekmece ? [Ds - 20] : [gc + 50, Ds - 50])) delik(alt.p, 'vida', alt.yerel(X), z - alt.z0, 3, 0, 'Ayak bağlantı yeri (ayak tabanı şablonu, 4 vida)', 'alt yüz');
    } else if (baza.tip === 'tekerlek') {
      for (const X of [60, W - 60]) for (const z of [60, Ds - 60]) delik(alt.p, 'vida', alt.yerel(X), z - alt.z0, 3, 0, 'Tekerlek plakası yeri (4 vida Ø3)', 'alt yüz');
    }
    if (g.bazaCekmece) {
      const tasP = sonuc.parcalar.find((x) => x.ad === 'Baza çekmecesi taşıyıcı');
      const tasL = tasP ? tasP.boy : Ds - gc - 20;
      const tas = P.yeni('Baza çekmecesi taşıyıcı', 'Baza çekmecesi taşıyıcı', tasL, tasP ? tasP.en : hb, 'x: ön uçtan · y: alttan', { adet: 2 });
      const k = kutuBul('baza çekmecesi');
      const L = k ? k.L : tasL - 40;
      for (const z of [ICERI, Math.max(ICERI + 64, L - 32)]) delik(tas, 'ray', z, 10 + 22, 4, 10, 'Ray vidası Ø4 (kutu tabanı alttan 10 mm, ray ekseni +22)', 'iç yüz');
      for (const z of derinlikKonumlari(0, tasL)) {
        delik(tas, 'baglanti', z, tas.h, 8, 25, 'Kavela Ø8 (uçtan)', 'üst uç');
        if (tablaBoydan) {
          for (const X of [t / 2, W - t / 2]) delik(alt.p, 'baglanti', alt.yerel(X), gc + z - alt.z0, 8, 12, 'Kavela Ø8 (baza taşıyıcı)', 'alt yüz');
        } else {
          for (const v of V.filter((x) => x.kenar)) delik(v.p, 'baglanti', gc + z - v.z0, 0, 8, 25, 'Kavela Ø8 (uçtan, baza taşıyıcı)', 'alt uç');
        }
      }
      not(tas, 'Taşıyıcılar yanların altına kavela + köşebentle bağlanır; raylar iç yüze.');
      const on = P.yeni('Baza çekmecesi önü', 'Baza çekmecesi önü', g.bazaCekmece.x2 - g.bazaCekmece.x1, g.bazaCekmece.y2 - g.bazaCekmece.y1, 'x: sol kenardan · y: alt kenardan (önden bakış)');
      not(on, 'Bas-aç ile açılır; kutuya içten 4 vidayla, yerinde hizalanarak bağlanır (kulp deliği yok).');
    }

    // ---------- 7) Sürgü kapak ----------
    if (g.surgu) {
      const tabanlar = Hz.filter((h) => h.govde && !h.egik && h.z0 <= 20 && h.z1 >= 20);
      for (const h of tabanlar) for (const x of sira(0, h.p.w, 50, 300)) delik(h.p, 'vida', x, 20 - h.z0, 3, 10, 'Sürgü ray vidası Ø3', h.alt ? 'üst yüz' : 'alt yüz');
      const sp = sonuc.parcalar.find((p) => p.ad === 'Sürgü kapak');
      if (sp) {
        const p = P.yeni('Sürgü kapak', 'Sürgü kapak', sp.en, sp.boy, 'x: sol kenardan · y: alt kenardan (önden bakış)', { adet: sp.adet });
        for (const x of [50, sp.en - 50]) {
          delik(p, 'vida', x, 0, 8, 0, 'Alt tekerlek yuvası (takım şablonu)', 'alt uç');
          delik(p, 'vida', x, sp.boy, 8, 0, 'Üst kılavuz yuvası (takım şablonu)', 'üst uç');
        }
        not(p, 'Tekerlek ve kılavuz delikleri sürgü takımının şablonuna göre kontrol edilmeli.');
      }
      not(alt.p, 'Sürgü ray profili ön kenardan ölçülerek yerleştirilir (ray kataloğu).');
    }

    // ---------- 8) Kör köşe paneli ----------
    if (g.korPanel) {
      const cL = Hc - 2 * t;
      const cita = P.yeni('Kör panel bağlantı çıtası', 'Kör panel bağlantı çıtası', 80, cL, 'x: soldan · y: alttan');
      for (const y of sira(0, cL, 60, 250)) delik(cita, 'vida', 40, y, 4, 0, 'Vida Ø4 (boydan, havşalı; kör panele)', 'ön yüz');
      not(cita, 'Çıta alt ve üst tablaya ikişer köşebentle bağlanır.');
      const kp = P.yeni('Kör köşe paneli', 'Kör köşe paneli', g.korPanel.x2 - g.korPanel.x1, Hc - 2 * g.db, 'x: sol kenardan · y: alt kenardan (önden bakış)');
      not(kp, 'Önden delik yok: çıtadan arkadan vidalanır (vida boyu panel kalınlığını geçmemeli).');
    }
  }

  // ------------------------------------------------------------------ MDF çerçeve + cam kapak
  function cerceveKapak(P, ek, yan, w, h, o, sat, menteseY, A, kulpTur) {
    const e = say(A.cerceveEni, 70);
    const lp = say(A.camLambaPayi, 8);
    const kavY = e >= 60 ? [e / 2 - 16, e / 2 + 16] : [e / 2];
    const dikmeKaynak = `Kapak (${ek}) – çerçeve dikmesi`;
    const kayitKaynak = `Kapak (${ek}) – çerçeve kaydı`;
    const eksen = 'x: dış kenardan · y: alttan (önden bakış)';
    const dik = (ad) => {
      const p = P.yeni(`${ad} (${ek})${yan}`, dikmeKaynak, e, h, eksen);
      // Çerçeveye göre çok kısa kapakta (hesap uyarı verir) parça dışına düşen kavela atlanır
      const ys = h >= 2 * e ? [...kavY, ...kavY.map((k) => h - e + k)] : [h / 2];
      for (const y of ys) delik(p, 'baglanti', e, y, 8, 25, 'Kavela Ø8 (iç kenardan)', 'iç kenar uç');
      if (h < 2 * e) not(p, 'Kapak çerçeve eninin iki katından kısa: çerçeveli cam kapak yapılamaz, kapak türünü değiştirin.');
      kanal(p, e - lp, 0, e, h, `Cam lambası ${tr(lp)} mm (arka yüz)`, `dış kenardan ${tr(e - lp)}–${tr(e)} mm`);
      return p;
    };
    const mDik = dik('Çerçeve dikmesi – menteşe tarafı');
    if (menteseY) for (const my of menteseY) delik(mDik, 'mentese', 22.5, my, 35, 12.5, 'Menteşe çanağı Ø35 (iç yüz)', 'iç yüz');
    const kDik = dik('Çerçeve dikmesi – kulp tarafı');
    if (o.kulp && o.kulp.delikler) {
      for (const d of o.kulp.delikler) {
        const x = o.menteseSol ? w - d.x : d.x;
        if (x > e - lp - 5) { not(kDik, 'Kulp deliği cam bölgesine düşüyor: dikey kulp veya daha küçük kulp aralığı seçin.'); continue; }
        delik(kDik, 'kulp', x, d.y, 5, 0, 'Kulp Ø5 (boydan)', 'ön yüz');
      }
    } else if (kulpTur === 'gomme') not(kDik, 'Gömme kulp: dikmeye frezelenir.');
    const kayit = P.yeni(`Çerçeve kaydı (${ek})${yan}`, kayitKaynak, w - 2 * e, e, 'x: sol uçtan · y: alttan', { adet: 2 });
    for (const y of kavY) {
      delik(kayit, 'baglanti', 0, y, 8, 25, 'Kavela Ø8 (uçtan)', 'sol uç');
      delik(kayit, 'baglanti', w - 2 * e, y, 8, 25, 'Kavela Ø8 (uçtan)', 'sağ uç');
    }
    kanal(kayit, 0, e - lp, w - 2 * e, e, `Cam lambası ${tr(lp)} mm (arka yüz, iç kenarda)`, `iç kenardan ${tr(lp)} mm`);
    not(kayit, 'Üst kayıtta lamba alt kenarda, alt kayıtta üst kenarda (cam tarafı).');
  }

  // ------------------------------------------------------------------ çekmece kutusu
  function kutuPlani(P, k, HS) {
    const et = k.etiket;
    if (k.metal) {
      const a = P.yeni(`Çekmece arkalığı (${et})`, `Çekmece arkalığı (${et})`, k.arkaW, k.arkaH, 'x: sol uçtan · y: alttan', { adet: k.adet });
      not(a, 'Metal yanlara arka bağlantı aparatıyla takılır; delikler set kataloğuna göre.');
      const tb = P.yeni(`Çekmece tabanı (${et})`, `Çekmece tabanı (${et})`, k.tabanBoy, k.tabanEn, 'x: ön uçtan · y: soldan', { adet: k.adet });
      not(tb, 'Metal yanların taban yuvasına oturur; arkalığa 3–4 vidayla bağlanır.');
      return;
    }
    const { tc, L, kutuW, kutuH } = k;
    const owW = kutuW - 2 * tc;
    const kanalli = k.taban === 'kanal';
    const ys = kutuH < 90 ? [kutuH / 2] : [30, kutuH - 30];
    const gizli = k.ray === 'gizli';
    const yan = P.yeni(`Çekmece yanı (${et})`, `Çekmece yanı (${et})`, L, kutuH, 'x: ön uçtan · y: alttan', { adet: 2 * k.adet });
    for (const x of [tc / 2, L - tc / 2]) for (const y of ys) delik(yan, 'baglanti', x, y, 7, 0, 'Konfirmat Ø7 (boydan, havşalı)', 'dış yüz');
    if (!gizli) {
      const xs = [ICERI, L - ICERI];
      if (L >= 450) xs.splice(1, 0, L / 2);
      for (const x of xs) delik(yan, 'ray', x, 22, 3, 10, 'Ray vidası Ø3 (ray ekseni alttan 22)', 'dış yüz');
    } else not(yan, 'Gizli ray: yanda ray deliği yok; kutu rayın üstüne oturur.');
    const onP = P.yeni(`Çekmece kutu önü (${et})`, `Çekmece ön/arka (${et})`, owW, kutuH, 'x: sol uçtan · y: alttan', { adet: k.adet });
    const arkaP = P.yeni(`Çekmece kutu arkası (${et})`, `Çekmece ön/arka (${et})`, owW, kutuH, 'x: sol uçtan · y: alttan', { adet: k.adet });
    for (const p of [onP, arkaP]) for (const y of ys) {
      delik(p, 'baglanti', 0, y, 5, 50, 'Konfirmat kılavuz Ø5 (uçtan)', 'sol uç');
      delik(p, 'baglanti', owW, y, 5, 50, 'Konfirmat kılavuz Ø5 (uçtan)', 'sağ uç');
    }
    for (const n of onBaglantiNoktalari(owW, kutuH)) delik(onP, 'vida', n.x, n.y, 4, 0, 'Ön bağlantı vidası Ø4 (boydan, içten havşalı)', 'iç yüz');
    if (gizli) {
      for (const x of [11, owW - 11]) delik(arkaP, 'ray', x, 7, 6, 10, 'Gizli ray arka pimi Ø6', 'dış yüz');
      not(arkaP, 'Gizli ray: arka pim delikleri ve ön kilit klipsleri ray kataloğuna göre kontrol edilmeli.');
    }
    if (kanalli) {
      const ta = k.ta || 8;
      for (const p of [yan, onP, arkaP]) kanal(p, 0, 10, p.w, 10 + ta, `Taban kanalı ${tr(ta)}×${tr(k.kd || 8)} mm (iç yüz)`, `alttan 10–${tr(10 + ta)} mm`);
    } else {
      const tb = P.yeni(`Çekmece tabanı (${et})`, `Çekmece tabanı (${et})`, L, kutuW, 'x: ön uçtan · y: soldan', { adet: k.adet });
      not(tb, `Alttan zımba/vida: kenarlardan ${tr(tc / 2)} mm içeride, 100–150 mm arayla; önce köşegenler eşitlenir.`);
    }
  }

  // ------------------------------------------------------------------ L köşe dolap
  function lKosePlani(P, g, modul, sonuc, A) {
    const HS = sonuc.hirdavatSecimi;
    const govdeTur = HS.baglanti;
    const araTur = HS.araBaglanti === 'ayni' ? (HS.baglanti === 'seffaf_kose' ? 'seffaf_t' : HS.baglanti) : HS.araBaglanti;
    const { t, Ds, Hc, W: LA, W2: LB, ta } = g;
    const tablaA = LA - ta - t;
    const tablaB = LB - g.D - t;
    const konum = derinlikKonumlari(0, Ds);
    const yanA = P.yeni('Yan (kol ucu) – A kolu', 'Yan (kol ucu)', Ds, Hc, 'x: ön kenardan · y: alttan (iç yüz)');
    const yanB = P.yeni('Yan (kol ucu) – B kolu', 'Yan (kol ucu)', Ds, Hc, 'x: ön kenardan · y: alttan (iç yüz)');
    const tablalar = [];
    for (const [ad, yuz, Y] of [['Alt tabla', 'üst yüz', t / 2], ['Üst tabla', 'alt yüz', Hc - t / 2]]) {
      const a = P.yeni(`${ad} – A kolu`, `${ad} – A kolu`, tablaA, Ds, 'x: köşe ucundan · y: ön kenardan');
      const b = P.yeni(`${ad} – B kolu`, `${ad} – B kolu`, tablaB, Ds, 'x: köşe ucundan · y: ön kenardan');
      tablalar.push(a, b);
      // Kol uçlarında yanlara
      for (const [tb, yanP] of [[a, yanA], [b, yanB]]) {
        yuzUcBagla(govdeTur, konum, Ds,
          (z) => ({ p: yanP, x: z, y: Y, yuz: 'iç yüz' }),
          (z) => ({ p: tb, x: tb.w, y: z, yuz: 'kol ucu' }),
          (z, m) => ({ p: tb, x: tb.w - m, y: z, yuz: 'alt yüz' }));
      }
      // Köşede: B tablasının ucu A tablasının ön kenarına (kavela + alttan birleştirme köprüsü)
      for (const z of konum) {
        delik(a, 'baglanti', Ds - z, 0, 8, 25, 'Kavela Ø8 (ön kenardan, B tablası)', 'ön kenar uç');
        delik(b, 'baglanti', 0, z, 8, 25, 'Kavela Ø8 (uçtan)', 'köşe uç');
      }
      for (const z of [Ds / 4, (3 * Ds) / 4]) {
        delik(a, 'vida', Ds - z, 30, 3, 0, `${araTur === 'seffaf_t' ? 'Şeffaf T bağlantı' : 'Birleştirme köprüsü'} vida yeri (${yuz})`, yuz);
        delik(b, 'vida', 30, z, 3, 0, `${araTur === 'seffaf_t' ? 'Şeffaf T bağlantı' : 'Birleştirme köprüsü'} vida yeri (${yuz})`, yuz);
      }
      not(a, 'Köşe ucu B arkalığına dayanır (bağlantı yok); B tablası bu tablanın ön kenarına kavelayla bağlanır.');
    }
    // Raflar: pimler kol uçlarındaki yanlarda; köşede iki raf birleştirme bağlantısıyla
    for (const ry of g.raflar || []) for (const yanP of [yanA, yanB]) for (const z of [ICERI, Ds - ICERI]) for (const d of [-32, 0, 32]) delik(yanP, 'pim', z, ry + d, 5, 10, 'Raf pimi Ø5', 'iç yüz');
    if ((g.raflar || []).length) {
      const rafD = Ds - say(A.rafOnGeriCekme, 20);
      const rA = P.yeni('Raf – A kolu', 'Raf – A kolu', LA - ta - t - say(A.rafYanBosluk, 1), rafD, 'x: köşe ucundan · y: ön kenardan (alt yüz)', { adet: g.raflar.length });
      const rB = P.yeni('Raf – B kolu', 'Raf – B kolu', LB - ta - t - say(A.rafYanBosluk, 1) - rafD, rafD, 'x: köşe ucundan · y: ön kenardan (alt yüz)', { adet: g.raflar.length });
      for (const f of [0.3, 0.7]) {
        delik(rA, 'vida', rafD * f, 20, 3, 0, 'Raf birleştirme bağlantısı vida yeri', 'alt yüz');
        delik(rB, 'vida', 20, rafD * f, 3, 0, 'Raf birleştirme bağlantısı vida yeri', 'alt yüz');
      }
      not(rA, 'Köşe ucu arkalık önünde bir köşebent/çıta üzerine oturtulabilir (8 mm arkalığa pim takılmaz).');
    }
    // Kapaklar: B kapağı B kolu yanına menteşeli, A kapağı B kapağına katlanır menteşeyle bağlı; kulp A kapağında.
    const h = g.kapakH;
    const my = mentesheKonumlari(h).map((pos) => h - pos);
    const kB = P.yeni('Köşe kapağı – B kolu', 'Köşe kapağı – B kolu', g.kapakB, h, 'x: köşe kenarından · y: alttan (önden bakış)');
    const kA = P.yeni('Köşe kapağı – A kolu', 'Köşe kapağı – A kolu', g.kapakA, h, 'x: köşe kenarından · y: alttan (önden bakış)');
    for (const y of my) {
      delik(kB, 'mentese', g.kapakB - 22.5, y, 35, 12.5, 'Menteşe çanağı Ø35 (iç yüz, kol ucu tarafı)', 'iç yüz');
      for (const d of [-16, 16]) delik(yanB, 'plaka', ICERI, y + g.db + d, 5, 12, 'Menteşe plakası Ø5', 'iç yüz');
      delik(kA, 'mentese', 22.5, y, 35, 12.5, 'Katlanır menteşe çanağı Ø35 (iç yüz, köşe kenarı)', 'iç yüz');
      for (const d of [-16, 16]) delik(kB, 'plaka', 20, y + d, 3, 10, 'Katlanır menteşe plakası vidası Ø3 (iç yüz)', 'iç yüz');
    }
    if (HS.kulp === 'kulp') {
      const c = Hesap.kulpBaglami(modul, A, g.H);
      const k = Hesap.kulpDelikleri(c, 'kapak', 'yana', g.kapakA, h, true, g.hb);
      kulpUygula(kA, k, HS.kulp);
    } else kulpUygula(kA, null, HS.kulp);
    not(kA, 'Kulp kapağın kol ucu tarafındaki serbest kenarında.');
    // Arkalıklar (çakma): tabla ve yan kenarlarına vida/çivi yerleri
    const p0 = say(A.arkalikCakmaPay, 2);
    const arkA = P.yeni('Arkalık – A kolu (çakma)', 'Arkalık – A kolu (çakma)', LA - p0, Hc - 2 * p0, 'x: köşeden · y: alttan');
    const arkB = P.yeni('Arkalık – B kolu (çakma)', 'Arkalık – B kolu (çakma)', LB - ta - p0, Hc - 2 * p0, 'x: A arkalığından · y: alttan');
    const isaret = (p, x, y) => delik(p, 'vida', x, y - p0, 2, 0, 'Arkalık vidası / çivi yeri', 'arka yüz');
    for (const x of sira(ta, LA - t, 50, 150)) { isaret(arkA, x, t / 2); isaret(arkA, x, Hc - t / 2); }
    for (const y of sira(0, Hc, 50, 150)) isaret(arkA, LA - t / 2, y);
    for (const x of sira(0, LB - t - ta, 50, 150)) { isaret(arkB, x, t / 2); isaret(arkB, x, Hc - t / 2); }
    for (const y of sira(0, Hc, 50, 150)) isaret(arkB, LB - t / 2 - ta, y);
    // Baza
    if (g.baza && g.baza.tip === 'panel') {
      for (const ad of ['Baza önü – A kolu', 'Baza önü – B kolu', 'Baza arkası – A kolu', 'Baza arkası – B kolu', 'Baza yanı (kol ucu)']) {
        const sp = sonuc.parcalar.find((p) => p.ad === ad);
        if (!sp) continue;
        const p = P.yeni(ad, ad, sp.boy, sp.en, 'x: soldan · y: alttan', { adet: sp.adet });
        not(p, 'L baza çerçevesi köşelerde köşebentle (her köşeye 1, iç yüzden 4 vida Ø3) yerinde birleştirilir; gövdeye 6 köşebentle bağlanır.');
      }
    } else if (g.baza && (g.baza.tip === 'ayak' || g.baza.tip === 'ayak_on')) {
      const altA = tablalar[0];
      for (const x of [50, tablaA - 50]) for (const y of [50, Ds - 50]) delik(altA, 'vida', x, y, 3, 0, 'Ayak bağlantı yeri (ayak tabanı şablonu)', 'alt yüz');
      const altB = tablalar[1];
      for (const x of [tablaB - 50]) for (const y of [50, Ds - 50]) delik(altB, 'vida', x, y, 3, 0, 'Ayak bağlantı yeri (ayak tabanı şablonu)', 'alt yüz');
    }
  }

  // ------------------------------------------------------------------ paneller
  function panelPlani(P, g, modul, sonuc, A) {
    const HS = sonuc.hirdavatSecimi;
    const tur = g.tur;
    const adBas = Hesap.PANEL_TURLERI[tur] ? Hesap.PANEL_TURLERI[tur].ad : 'Panel';
    const yatayPanel = tur === 'raf' || tur === 'tabla' || tur === 'baza';
    const w = yatayPanel ? g.boy : g.en;
    const h = yatayPanel ? g.en : g.boy;
    if (tur === 'serbest' || tur === 'bosluk' || tur === 'nesne') return;
    const p = P.yeni(adBas, adBas, w, h, yatayPanel ? 'x: sol uçtan · y: ön kenardan / alttan' : 'x: ön kenardan · y: alttan (iç yüz)');
    const kosebent = (x, y, yuz) => { for (const d of [-12, 12]) delik(p, 'vida', x, y + d, 3, 12, 'Köşebent vidası Ø3 (12 mm, boydan delmeyin)', yuz); };
    // Kenardan pay kadar içeride iki nokta; parça kısaysa ortada tek nokta
    const ikiUc = (L, pay) => (L > 2 * pay + 40 ? [pay, L - pay] : [L / 2]);
    if (tur === 'yan_kapama') {
      for (const y of ikiUc(h, 120)) for (const x of ikiUc(w, 60)) kosebent(x, y, 'iç yüz');
      not(p, 'Dolabın yanına 4 köşebentle bağlanır; dolap içinden ayrıca 4×30 vidayla sabitlenebilir.');
    } else if (tur === 'dolgu') {
      for (const y of ikiUc(h, 120)) kosebent(w / 2, y, 'iç yüz');
      not(p, 'Komşu dolaba ve duvar tarafına çıtayla; köşebent vidaları panel kalınlığını geçmemeli.');
    } else if (tur === 'tabla') {
      for (const x of ikiUc(w, 100)) for (const y of ikiUc(h, 60)) kosebent(x, y, 'alt yüz');
      not(p, 'Dolaplara alttan 4 köşebentle bağlanır.');
    } else if (tur === 'raf') {
      const n = Math.max(2, Math.ceil(w / 400));
      const uc = Math.min(100, w / 4);
      const xs = Array.from({ length: n }, (_, i) => uc + (i * (w - 2 * uc)) / (n - 1));
      const der = Math.max(40, Math.min(h - 30, 150));
      for (const x of xs) delik(p, 'baglanti', x, h, 12, der, `Gizli taşıyıcı çubuk yuvası Ø12 × ${tr(der)} (arka kenardan)`, 'arka uç');
      not(p, 'Çubuk yuvaları raf kalınlığının tam ortasından, yüzeye paralel delinir; duvardaki taşıyıcıyla birlikte işaretleyin.');
    } else if (tur === 'bulasik') {
      if (HS.kulp === 'kulp') {
        const c = Hesap.kulpBaglami({}, A, 0);
        const k = Hesap.kulpDelikleri(c, 'cekmece', 'yana', w, h, true, 0);
        kulpUygula(p, k, HS.kulp);
      } else kulpUygula(p, null, HS.kulp);
      not(p, 'Makineye bağlantı vidaları makinenin kağıt şablonuyla işaretlenir (marka/modele göre değişir).');
    } else if (tur === 'baza') {
      for (const x of sira(0, w, 80, 600)) delik(p, 'vida', x, h / 2, 3, 10, 'Baza klipsi yeri (2 vida Ø3)', 'arka yüz');
      not(p, 'Klipsler ayak hizalarına göre kaydırılabilir.');
    }
    if (g.sekil) not(p, 'Şekilli parça: delik koordinatları parçanın dış ölçü kutusuna göredir.');
  }

  // ------------------------------------------------------------------ deliksiz parçalar
  const DELIKSIZ = [
    [/kanallı/i, 'Kanala geçer; delik gerekmez.'],
    [/^Çekmece tabanı/, 'Kanala geçer; delik gerekmez.'],
    [/^(Raf|Cam raf)\b/, 'Raf pimlerine oturur; delik gerekmez.'],
    [/– (cam|ayna|profil camı|çerçeve camı)$|^Sürgü kapak – (cam|ayna)$/, 'Cam/ayna: camcıda kesilir; gerekiyorsa delik camcıda açılır.'],
    [/^Serbest panel/, 'Serbest panel: delik tanımı yok; gerekiyorsa elle işaretleyin.'],
    [/^Lambri/, 'Lambri: çıtalar arka panele / duvara montaj yapıştırıcısı ve gizli vidayla (yandan, çıta aralığından) tutturulur; ön yüzde delik yok.'],
    [/^Duvar kaplama paneli/, 'Duvara Z askı profiliyle (arkadan vidalı) ya da montaj yapıştırıcısıyla; ön yüzde delik yok.'],
  ];

  /**
   * @param modul  proje modülü
   * @param sonuc  Hesap.modulHesapla sonucu
   * @param ayar   proje ayarları
   * @returns { destek, mesaj, parcalar: [{ ad, kaynak, w, h, eksen, delikler, kanallar, notlar, ozet, adet }], deliksiz, eksenNotu }
   */
  function delikPlani(modul, sonuc, ayar) {
    const g = sonuc && sonuc.geo;
    if (!g) return { destek: false, mesaj: 'Geçerli ölçü yok.', parcalar: [], deliksiz: [] };
    const A = ayar || Hesap.varsayilanAyarlar();
    const P = planKur();
    if (g.lkose) lKosePlani(P, g, modul, sonuc, A);
    else if (g.panel) panelPlani(P, g, modul, sonuc, A);
    else govdePlani(P, g, modul, sonuc, A);

    // Aynı yüzde üst üste binen delikler: öncelikli olan kalır (bağlantı > menteşe > ray > vida > kulp > pim)
    const ONCELIK = { baglanti: 6, mentese: 5, plaka: 5, ray: 4, vida: 3, kulp: 2, pim: 1 };
    for (const p of P.parcalar) {
      const atilan = {};
      const kalan = [];
      const sirali = p.delikler.slice().sort((a, b) => (ONCELIK[b.tur] || 0) - (ONCELIK[a.tur] || 0));
      for (const d of sirali) {
        const uc = /(uç|ucu)$/.test(d.yuz);
        const cakisan = !uc && kalan.find((k) => k.yuz === d.yuz && !/(uç|ucu)$/.test(k.yuz) && Math.hypot(k.x - d.x, k.y - d.y) < (k.cap + d.cap) / 2 + 2);
        // Birbirine çok yakın iki raf pimi deliği tek delik olarak açılır
        if (cakisan && d.tur === 'pim' && cakisan.tur === 'pim') continue;
        if (cakisan && (ONCELIK[d.tur] || 0) < (ONCELIK[cakisan.tur] || 0)) {
          atilan[d.ad] = (atilan[d.ad] || 0) + 1;
          continue;
        }
        if (cakisan) not(p, `Dikkat: ${d.ad} ile ${cakisan.ad} çakışıyor (x ${tr(d.x)}, y ${tr(d.y)}); yerinde kontrol edin.`);
        kalan.push(d);
      }
      p.delikler = kalan;
      for (const [ad, n] of Object.entries(atilan)) not(p, `${n} × ${ad} başka bir delikle çakıştığı için atlandı.`);
    }

    // Aynı parçaları birleştir (ölçü + delikler + kanallar aynıysa); konumlar not olarak toplanır
    const gruplar = [];
    for (const p of P.parcalar) {
      p.delikler.sort((a, b) => a.y - b.y || a.x - b.x);
      const imza = JSON.stringify([p.ad, p.kaynak, p.w, p.h, p.delikler, p.kanallar, p.notlar]);
      const v = gruplar.find((x) => x.imza === imza);
      if (v) {
        v.p.adet += p.adet;
        v.p.konumlar.push(...p.konumlar);
      } else gruplar.push({ imza, p });
    }
    const parcalar = gruplar.map((x) => x.p).filter((p) => p.delikler.length || p.kanallar.length || p.notlar.length);
    // Aynı adlı farklı parçalar: tip harfi
    const sayac = {};
    for (const p of parcalar) sayac[p.ad] = (sayac[p.ad] || 0) + 1;
    const harf = {};
    for (const p of parcalar) {
      if (sayac[p.ad] > 1) {
        harf[p.ad] = (harf[p.ad] || 0) + 1;
        p.ad = `${p.ad} – tip ${String.fromCharCode(64 + harf[p.ad])}`;
      }
      if (p.konumlar.length) p.notlar.unshift(`Konum: ${p.konumlar.join(' / ')}`);
      const tur = {};
      for (const d of p.delikler) tur[d.ad] = (tur[d.ad] || 0) + 1;
      p.ozet = Object.entries(tur).map(([a, n]) => `${n} × ${a}`);
      delete p.konumlar;
    }

    // Kesim listesinde olup planda yer almayan parçalar ve nedenleri
    const kapsanan = (ad) => parcalar.some((p) => p.kaynak && (ad === p.kaynak || ad.startsWith(p.kaynak)));
    const deliksiz = [];
    for (const sp of sonuc.parcalar) {
      if (kapsanan(sp.ad) || deliksiz.some((d) => d.ad === sp.ad)) continue;
      const k = DELIKSIZ.find(([re]) => re.test(sp.ad));
      deliksiz.push({ ad: sp.ad, neden: k ? k[1] : 'Delik tanımı yok.' });
    }
    return {
      destek: true,
      mesaj: '',
      parcalar,
      deliksiz,
      eksenNotu: `Bağlantı noktaları ön/arka kenardan ${ICERI} mm (32 mm sistem); derin parçalarda ortada da.`,
    };
  }

  /** Delik planını CNC/atölye için CSV satırlarına çevirir. */
  function csvSatirlari(modulAd, plan) {
    const L = [];
    for (const p of plan.parcalar) {
      for (const d of p.delikler) L.push([modulAd, p.ad, p.adet, p.w, p.h, d.ad, d.yuz, d.x, d.y, d.cap, d.derinlik || '']);
      for (const k of p.kanallar) L.push([modulAd, p.ad, p.adet, p.w, p.h, k.ad, 'kanal', `${k.x1}–${k.x2}`, `${k.y1}–${k.y2}`, '', '']);
    }
    return L;
  }

  return { delikPlani, csvSatirlari, BAGLANTI, derinlikKonumlari };
});

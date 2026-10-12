/*
 * Plaka yerleşimi (kesim optimizasyonu).
 * Giyotin kesim mantığıyla parçaları plakalara yerleştirir: her yerleşim
 * kalan boş alanı tek düz kesimle iki dikdörtgene böler, böylece çıkan
 * plan panel ebatlama makinesinde birebir uygulanabilir.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Yerlesim = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /**
   * @param parcalar  [{ no, ad, w, h, adet, damar }]  w: plaka uzun kenarı yönündeki ölçü
   * @param plaka     { uzun, kisa }
   * @param secenek   { testere, kenarPayi }
   */
  function yerlestir(parcalar, plaka, secenek) {
    const kerf = secenek.testere || 0;
    const kenar = secenek.kenarPayi || 0;
    const PW = plaka.uzun - 2 * kenar;
    const PH = plaka.kisa - 2 * kenar;

    const tekil = [];
    for (const p of parcalar) for (let i = 0; i < p.adet; i++) tekil.push(p);
    tekil.sort((a, b) => Math.max(b.w, b.h) - Math.max(a.w, a.h) || b.w * b.h - a.w * a.h);

    const plakalar = [];
    const sigmayan = [];

    const yeniPlaka = () => {
      const pl = { bos: [{ x: 0, y: 0, w: PW, h: PH }], yerlesen: [] };
      plakalar.push(pl);
      return pl;
    };

    // En iyi kısa kenar uyumu: artan kısa kenar boşluğu en az olan yeri seç.
    const enIyiYer = (pl, p) => {
      let enIyi = null;
      const yonler = [{ w: p.w, h: p.h, dondu: false }];
      if (!p.damar && p.w !== p.h) yonler.push({ w: p.h, h: p.w, dondu: true });
      pl.bos.forEach((r, i) => {
        for (const y of yonler) {
          if (y.w <= r.w && y.h <= r.h) {
            const skor = Math.min(r.w - y.w, r.h - y.h);
            const skor2 = Math.max(r.w - y.w, r.h - y.h);
            if (!enIyi || skor < enIyi.skor || (skor === enIyi.skor && skor2 < enIyi.skor2)) {
              enIyi = { i, r, y, skor, skor2 };
            }
          }
        }
      });
      return enIyi;
    };

    for (const p of tekil) {
      let secilen = null;
      let secilenPlaka = null;
      for (const pl of plakalar) {
        const yer = enIyiYer(pl, p);
        if (yer && (!secilen || yer.skor < secilen.skor)) {
          secilen = yer;
          secilenPlaka = pl;
        }
      }
      if (!secilen) {
        const pl = yeniPlaka();
        const yer = enIyiYer(pl, p);
        if (!yer) {
          plakalar.pop();
          sigmayan.push(p);
          continue;
        }
        secilen = yer;
        secilenPlaka = pl;
      }
      const { r, y, i } = secilen;
      secilenPlaka.yerlesen.push({ x: r.x, y: r.y, w: y.w, h: y.h, dondu: y.dondu, parca: p });
      secilenPlaka.bos.splice(i, 1);

      // Giyotin bölme: büyük artığın tam kenarı alacağı yönde kes.
      const sagW = r.w - y.w - kerf;
      const altH = r.h - y.h - kerf;
      let sag, alt;
      if (sagW * r.h >= altH * r.w) {
        sag = { x: r.x + y.w + kerf, y: r.y, w: sagW, h: r.h };
        alt = { x: r.x, y: r.y + y.h + kerf, w: y.w, h: altH };
      } else {
        sag = { x: r.x + y.w + kerf, y: r.y, w: sagW, h: y.h };
        alt = { x: r.x, y: r.y + y.h + kerf, w: r.w, h: altH };
      }
      if (sag.w > 0 && sag.h > 0) secilenPlaka.bos.push(sag);
      if (alt.w > 0 && alt.h > 0) secilenPlaka.bos.push(alt);
    }

    const plakaAlani = plaka.uzun * plaka.kisa;
    for (const pl of plakalar) {
      const dolu = pl.yerlesen.reduce((a, b) => a + b.w * b.h, 0);
      pl.doluluk = dolu / plakaAlani;
      pl.kenar = kenar;
    }
    return { plakalar, sigmayan, plaka, kenar };
  }

  /** Kesim listesini malzemelere göre gruplayıp her birini yerleştirir. */
  function projeYerlesimi(kesimListesi, ayarlar) {
    const gruplar = new Map();
    for (const p of kesimListesi) {
      const malz = ayarlar.malzemeler.find((m) => m.id === p.malzeme);
      // Cam ve ayna plakadan kesilmez; camcıya net ölçüyle sipariş edilir.
      if (!malz || malz.tur === 'Cam' || malz.tur === 'Ayna') continue;
      if (!gruplar.has(malz.id)) gruplar.set(malz.id, { malzeme: malz, parcalar: [] });
      gruplar.get(malz.id).parcalar.push({
        no: p.no, ad: p.ad, w: p.kesimBoy, h: p.kesimEn, adet: p.adet, damar: p.damar,
      });
    }
    const sonuc = [];
    for (const g of gruplar.values()) {
      const plaka = { uzun: Number(g.malzeme.plakaUzun), kisa: Number(g.malzeme.plakaKisa) };
      const y = yerlestir(g.parcalar, plaka, {
        testere: Number(ayarlar.testereKalinligi) || 0,
        kenarPayi: Number(ayarlar.plakaKenarPayi) || 0,
      });
      sonuc.push(Object.assign({ malzemeId: g.malzeme.id, malzemeAd: g.malzeme.ad, kalinlik: g.malzeme.kalinlik }, y));
    }
    return sonuc;
  }

  return { yerlestir, projeYerlesimi };
});

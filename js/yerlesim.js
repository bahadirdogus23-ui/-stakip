/*
 * Plaka yerleşimi (kesim optimizasyonu).
 * Giyotin kesim mantığıyla parçaları plakalara yerleştirir: her yerleşim
 * kalan boş alanı tek düz kesimle iki dikdörtgene böler, böylece çıkan
 * plan panel ebatlama makinesinde birebir uygulanabilir.
 *
 * Artık stoku: önceki işlerden kalan parçalar (artıklar) varsa, bir parça açık
 * plakalara sığmadığında önce ona sığan en küçük artık kullanılır; sonra yeni
 * tam plaka açılır. İşten çıkacak kullanılabilir artıklar da raporlanır.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Yerlesim = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /**
   * @param parcalar  [{ no, ad, w, h, adet, damar }]  w: plaka uzun kenarı yönündeki ölçü
   * @param plaka     { uzun, kisa }  tam plaka ölçüsü
   * @param secenek   { testere, kenarPayi, artiklar: [{ id, uzun, kisa, adet }], artikMin }
   */
  function yerlestir(parcalar, plaka, secenek) {
    const kerf = secenek.testere || 0;
    const kenar = secenek.kenarPayi || 0;
    const artikMin = secenek.artikMin == null ? 250 : secenek.artikMin;

    const tekil = [];
    for (const p of parcalar) for (let i = 0; i < p.adet; i++) tekil.push(p);
    tekil.sort((a, b) => Math.max(b.w, b.h) - Math.max(a.w, a.h) || b.w * b.h - a.w * a.h);

    // Kullanılabilir artık parçalar (her adet ayrı); kenarları temiz kabul edilir (kenar payı yok)
    const artikHavuzu = [];
    for (const a of secenek.artiklar || []) {
      for (let i = 0; i < (a.adet || 1); i++) artikHavuzu.push({ id: a.id, uzun: Math.max(a.uzun, a.kisa), kisa: Math.min(a.uzun, a.kisa), kullanildi: false });
    }
    artikHavuzu.sort((a, b) => a.uzun * a.kisa - b.uzun * b.kisa);

    const plakalar = [];
    const sigmayan = [];

    const plakaAc = (uzun, kisa, pay, artikId) => ({
      bos: [{ x: 0, y: 0, w: uzun - 2 * pay, h: kisa - 2 * pay }], yerlesen: [], uzun, kisa, kenar: pay, artik: artikId || null,
    });

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
        // Önce parçaya sığan en küçük artık, yoksa yeni tam plaka
        for (const a of artikHavuzu) {
          if (a.kullanildi) continue;
          const pl = plakaAc(a.uzun, a.kisa, 0, a.id);
          const yer = enIyiYer(pl, p);
          if (yer) {
            a.kullanildi = true;
            plakalar.push(pl);
            secilen = yer;
            secilenPlaka = pl;
            break;
          }
        }
      }
      if (!secilen) {
        const pl = plakaAc(plaka.uzun, plaka.kisa, kenar, null);
        const yer = enIyiYer(pl, p);
        if (!yer) {
          sigmayan.push(p);
          continue;
        }
        plakalar.push(pl);
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

    // Tam plakalar önce, artıklar sonra listelenir
    plakalar.sort((a, b) => (a.artik ? 1 : 0) - (b.artik ? 1 : 0));
    const cikanArtiklar = [];
    for (const pl of plakalar) {
      const dolu = pl.yerlesen.reduce((a, b) => a + b.w * b.h, 0);
      pl.doluluk = dolu / (pl.uzun * pl.kisa);
      // Giyotin boşlukları birbirinden ayrıktır; yeterince büyük olanlar yeni artıktır
      pl.artiklar = pl.bos.filter((r) => Math.min(r.w, r.h) >= artikMin).map((r) => ({ uzun: Math.round(Math.max(r.w, r.h)), kisa: Math.round(Math.min(r.w, r.h)), x: r.x, y: r.y, w: r.w, h: r.h }));
      for (const a of pl.artiklar) cikanArtiklar.push({ uzun: a.uzun, kisa: a.kisa });
    }
    const kullanilanArtiklar = [];
    for (const a of artikHavuzu.filter((x) => x.kullanildi)) {
      const v = kullanilanArtiklar.find((k) => k.id === a.id);
      if (v) v.adet++;
      else kullanilanArtiklar.push({ id: a.id, adet: 1, uzun: a.uzun, kisa: a.kisa });
    }
    return {
      plakalar, sigmayan, plaka, kenar,
      tamPlaka: plakalar.filter((p) => !p.artik).length,
      kullanilanArtiklar,
      cikanArtiklar,
    };
  }

  const anahtar = (ad, kalinlik) => `${String(ad || '').trim().toLocaleLowerCase('tr')}|${Number(kalinlik)}`;

  /**
   * Kesim listesini malzemelere göre gruplayıp her birini yerleştirir.
   * artikStok: [{ id, malzemeAd, kalinlik, boy, en, adet }] — aynı ad ve kalınlıktaki artıklar kullanılır.
   */
  function projeYerlesimi(kesimListesi, ayarlar, artikStok) {
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
      const k = anahtar(g.malzeme.ad, g.malzeme.kalinlik);
      const artiklar = (artikStok || []).filter((a) => anahtar(a.malzemeAd, a.kalinlik) === k && a.adet > 0)
        .map((a) => ({ id: a.id, uzun: Number(a.boy), kisa: Number(a.en), adet: Number(a.adet) }));
      const y = yerlestir(g.parcalar, plaka, {
        testere: Number(ayarlar.testereKalinligi) || 0,
        kenarPayi: Number(ayarlar.plakaKenarPayi) || 0,
        artikMin: Number(ayarlar.artikMin) || 250,
        artiklar,
      });
      sonuc.push(Object.assign({ malzemeId: g.malzeme.id, malzemeAd: g.malzeme.ad, kalinlik: g.malzeme.kalinlik }, y));
    }
    return sonuc;
  }

  /** Malzeme başına kullanılan TAM plaka sayısı (maliyet için; artıklar bedelsiz). */
  function plakaSayilari(gruplar) {
    const s = {};
    for (const g of gruplar) s[g.malzemeId] = g.tamPlaka;
    return s;
  }

  return { yerlestir, projeYerlesimi, plakaSayilari };
});

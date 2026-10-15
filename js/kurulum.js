/*
 * Görsel kurulum şeması: her modül için adım adım patlatılmış 3B görünüş.
 * Her adımda önceki adımların parçaları soluk, bu adımda takılan parçalar vurgulu renkte ve
 * takılacağı yönde biraz uzakta (patlatılmış) çizilir; ok takma yönünü gösterir.
 * Parçalar ölçüleriyle (boy × en, adet, bantlı kenarlar) listelenir: etiket olmadan da tanınır.
 */
(function (root, factory) {
  const api = factory(root.Uc || (typeof require === 'function' ? require('./uc.js') : null));
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Kurulum = api;
})(typeof self !== 'undefined' ? self : this, function (Uc) {
  'use strict';

  const VURGU = '#e08a2c';
  const SOLUK = '#ebe7df';
  const OK = '#c0392b';

  const sinir = (p) => [0, 1, 2].map((k) => [Math.min(...p.k.map((q) => q[k])), Math.max(...p.k.map((q) => q[k]))]);
  const tasi = (p, d) => Object.assign({}, p, { k: p.k.map(([x, y, z]) => [x + d[0], y + d[1], z + d[2]]) });

  /**
   * Adım tanımları (gövdeli dolap). sec: 3B parçayı bu adıma alan koşul; yon: patlatma yönü;
   * parca: kesim listesinde bu adımın parçalarını seçen ad deseni.
   */
  function adimlar(g) {
    const ustY = g.hb + g.Hc - g.t - 1;
    const icMi = (b) => b[2][1] <= g.D + 1; // gövde içinde (ön yüzden geride)
    return [
      { baslik: 'Yanları ve alt tablayı birleştirin', kilavuz: /^(Hazırlık|Gövde)$/, sec: (p, b) => p.tur === 'govde' && b[1][0] < ustY, yon: [0, 0, 0], parca: /^(Yan|Sol yan|Sağ yan|Alt tabla)/ },
      { baslik: 'Üst tablayı / kuşakları takın', sec: (p, b) => p.tur === 'govde' && b[1][0] >= ustY, yon: [0, 1, 0], parca: /^(Üst tabla|Ön kuşak|Arka kuşak)/ },
      { baslik: 'Arkalığı yerleştirin', sec: (p) => p.tur === 'arkalik', yon: [0, 0, -1], parca: /^Arkalık/ },
      { baslik: 'Bölmeleri, ara tablaları ve rafları takın', kilavuz: /^İç donanım$/, sec: (p, b) => p.tur === 'panel' || (p.tur === 'cam' && icMi(b)) || ((p.tur === 'kulp' || p.tur === 'led') && icMi(b)), yon: [0, 0, 1], parca: /^(Bölme dikmesi|Ara tabla|Ara dikme|Sabit raf|Raf|Cam raf|Kör panel bağlantı)/ },
      { baslik: 'Bazayı / ayakları takın', kilavuz: /^(Ayaklar|Tekerlekler|Baza|Baza çekmecesi)$/, sec: (p) => p.tur === 'baza' || p.tur === 'ayak', yon: [0, -1, 0], parca: /^Baza/ },
      { baslik: 'Çekmece kutularını kurup raylara takın', kilavuz: /^Çekmece kutuları$/, sec: (p) => p.tur === 'ic' || p.tur === 'cekmece', yon: [0, 0, 1], parca: /^Çekmece (yanı|ön\/arka|tabanı|arkalığı)/ },
      { baslik: 'Kapakları, çekmece önlerini ve kulpları takın', kilavuz: /^(Önler ve kulplar|Kapaklar)$/, sec: (p) => ['kapak', 'kulp', 'cam', 'ayna', 'led'].includes(p.tur), yon: [0, 0, 1], parca: /^(Kapak|Çekmece önü|Sürgü kapak|Kör köşe paneli|Sabit ön|Baza çekmecesi önü)/ },
    ];
  }

  /** Bir adımın görseli: önceki parçalar soluk, bu adımınkiler vurgulu ve patlatılmış, ok ile. */
  function adimCiz(onceki, simdiki, yon, olcek, gorus) {
    const P = onceki.map((p) => Object.assign({}, p, { renk: SOLUK, saydam: 0.55 }));
    const d = yon.map((v) => v * olcek);
    for (const p of simdiki) P.push(Object.assign(tasi(p, d), { renk: VURGU, saydam: undefined }));
    if (simdiki.length && (d[0] || d[1] || d[2])) {
      // Ok: vurgulu parçaların ortasından yerine doğru ince çubuk + uç
      const bs = simdiki.map(sinir);
      const m = [0, 1, 2].map((k) => (Math.min(...bs.map((b) => b[k][0])) + Math.max(...bs.map((b) => b[k][1]))) / 2);
      const bas = m.map((c, k) => c + d[k] * 0.85);
      const son = m.map((c, k) => c + d[k] * 0.2);
      const k = 10;
      const ax = [0, 1, 2].find((i) => d[i] !== 0);
      const kutuK = (a, b) => Uc.kutu(...[0, 1, 2].flatMap((i) => (i === ax ? [Math.min(a[i], b[i]), Math.max(a[i], b[i])] : [a[i] - k, a[i] + k])), 'kulp', { renk: OK });
      P.push(kutuK(bas, son));
      const uc = son.map((c, i) => (i === ax ? c - Math.sign(d[i]) * 30 : c));
      const ucKutu = Uc.kutu(...[0, 1, 2].flatMap((i) => (i === ax ? [Math.min(uc[i], son[i]), Math.max(uc[i], son[i])] : [son[i] - 2.6 * k, son[i] + 2.6 * k])), 'kulp', { renk: OK });
      P.push(ucKutu);
    }
    return Uc.ciz(P, gorus, {});
  }

  /**
   * @returns [{ baslik, svg, parcalar: [{ ad, boy, en, adet, bant, malzeme }] }]
   */
  function sema(modul, sonuc) {
    const g = sonuc && sonuc.geo;
    if (!g || g.bos) return [];
    const gorus = { yaw: -32, pitch: 20 };
    // İç parçalar (kapaksız görünüş) + ön yüzler (kapaklı görünüşten, gövde önündekiler)
    const ic = Uc.modulParcalari(g, { kapaksiz: true });
    const onler = g.panel || g.lkose ? [] : Uc.modulParcalari(g, {}).filter((p) => ['kapak', 'kulp', 'cam', 'ayna'].includes(p.tur) && sinir(p)[2][0] >= g.D - 1);
    const tum = ic.concat(onler);
    if (g.panel || g.lkose) {
      // Panel ve L köşe: tek görsel, tüm parçalar
      return [{ baslik: g.panel ? 'Paneli yerine takın' : 'L köşe dolabı kurun', svg: adimCiz([], tum, [0, 0, 0], 0, gorus), parcalar: sonuc.parcalar }];
    }
    const olcek = Math.max(120, Math.min(350, Math.max(g.W, g.H) * 0.18));
    const kullanildi = new Set();
    const L = [];
    let onceki = [];
    for (const a of adimlar(g)) {
      const simdi = tum.filter((p) => !kullanildi.has(p) && a.sec(p, sinir(p)));
      const parcalar = sonuc.parcalar.filter((p) => a.parca.test(p.ad));
      if (!simdi.length && !parcalar.length) continue;
      for (const p of simdi) kullanildi.add(p);
      L.push({ baslik: a.baslik, kilavuz: a.kilavuz || null, svg: adimCiz(onceki, simdi, a.yon, olcek, gorus), parcalar });
      onceki = onceki.concat(simdi);
    }
    // Sınıflanmayan parça kalırsa ayrı adım
    const kalan = tum.filter((p) => !kullanildi.has(p));
    if (kalan.length) L.push({ baslik: 'Diğer parçaları takın', svg: adimCiz(onceki, kalan, [0, 0, 1], olcek, gorus), parcalar: [] });
    // Bitmiş hali
    L.push({ baslik: 'Bitmiş görünüş', svg: Uc.ciz(Uc.modulParcalari(g, {}), gorus, {}), parcalar: [] });
    return L;
  }

  return { sema, VURGU };
});

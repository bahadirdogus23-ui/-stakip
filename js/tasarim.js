/*
 * Ölçüden otomatik tasarım: kullanıcının verdiği duvar/dolap ölçülerine göre rastgele ama
 * kurala uygun tasarım önerileri üretir (gardırop, mutfak, makyaj masası, dresuar, TV ünitesi...).
 * Her öneri hesap motoruyla doğrulanır: uyarı veren, duvara sığmayan ya da plakaya sığmayan
 * parça içeren öneriler elenir ve başka bir tohumla yeniden üretilir.
 * Aynı tohum aynı tasarımı verir (tekrarlanabilir).
 */
(function (root, factory) {
  const api = factory(root.Hesap || (typeof require === 'function' ? require('./hesap.js') : null));
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Tasarim = api;
})(typeof self !== 'undefined' ? self : this, function (Hesap) {
  'use strict';

  // ---------- Tohumlu rastgele sayı (mulberry32) ----------
  function rastgele(tohum) {
    let a = tohum >>> 0;
    const r = () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    return {
      r,
      sec: (L) => L[Math.floor(r() * L.length)],
      tam: (a2, b) => Math.floor(a2 + r() * (b - a2 + 1)),
      ara: (a2, b) => a2 + r() * (b - a2),
      ihtimal: (p) => r() < p,
      karistir: (L) => { const x = L.slice(); for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [x[i], x[j]] = [x[j], x[i]]; } return x; },
    };
  }
  const yuvarla = (x, adim) => Math.round(x / (adim || 1)) * (adim || 1);
  /** W'yi n tam sayı parçaya böler (artan mm'ler ilk parçalara). */
  function bol(W, n) {
    const taban = Math.floor(W / n);
    const L = new Array(n).fill(taban);
    for (let i = 0; i < W - taban * n; i++) L[i]++;
    return L;
  }
  /** Toplamı n olan 1–3'lük gruplar (kapak gruplama). */
  function grupla(R, n, izinli) {
    const L = [];
    let kalan = n;
    while (kalan > 0) {
      const secenek = izinli.filter((k) => k <= kalan && (kalan - k === 0 || kalan - k >= Math.min(...izinli)));
      const k = secenek.length ? R.sec(secenek) : kalan;
      L.push(k);
      kalan -= k;
    }
    return L;
  }

  // ---------- Modül yapı taşları ----------
  const S = (tip, yukseklik, adet, ek) => Object.assign({ tip, yukseklik: yukseklik == null ? null : Math.round(yukseklik), adet: adet || 1 }, ek || {});
  const SUT = (genislik, satirlar) => ({ genislik: genislik == null ? null : Math.round(genislik), satirlar });
  const BAZA = (h, gc) => ({ tip: 'panel', yukseklik: h, geriCekme: gc });
  const AYAK = (h) => ({ tip: 'ayak', yukseklik: h, geriCekme: 50 });
  /** Hazır modülden başlayıp alanları değiştirir. */
  const hazir = (id, ek) => Object.assign(Hesap.yeniModul(id), ek || {});
  /** Gövdeli serbest modül. */
  const govdeli = (ad, ek) => Object.assign(Hesap.yeniModul('alt_kapak'), {
    ad, yapi: 'yanlar_boydan', ust: 'tam', arkalik: 'kanal', kapakTipi: 'tam', korPanel: 0, onTipi: 'normal', montajYuksekligi: 0, konum: null,
  }, ek);
  const bosluk = (ad, en, boy, ek) => Object.assign(Hesap.yeniModul('bosluk'), { ad, en: Math.round(en), boy: Math.round(boy), montajYuksekligi: 0 }, ek || {});

  // ---------- Türler ----------
  const TURLER = {
    gardirop: {
      ad: 'Gardırop',
      aciklama: 'Duvar boyunca menteşeli ya da sürgülü gardırop; askı, raf ve çekmece bölmeleri',
      alanlar: [
        { ad: 'genislik', etiket: 'Duvar genişliği', vars: 2400, min: 800, max: 6000 },
        { ad: 'yukseklik', etiket: 'Yükseklik (tavan)', vars: 2600, min: 1800, max: 3200 },
        { ad: 'derinlik', etiket: 'Derinlik', vars: 600, min: 450, max: 700 },
      ],
      uret: gardirop,
    },
    mutfak: {
      ad: 'Mutfak',
      aciklama: 'Düz ya da L mutfak: evye, fırın, bulaşık makinesi, buzdolabı, alt ve üst dolaplar',
      alanlar: [
        { ad: 'duvarA', etiket: 'A duvarı', vars: 3600, min: 1800, max: 8000 },
        { ad: 'duvarB', etiket: 'B duvarı (0 = düz mutfak)', vars: 0, min: 0, max: 6000 },
        { ad: 'tavan', etiket: 'Tavan yüksekliği', vars: 2600, min: 2200, max: 3200 },
      ],
      uret: mutfak,
    },
    makyaj: {
      ad: 'Makyaj masası',
      aciklama: 'Çekmeceli ayak ünitesi, diz boşluğu, tabla; aynalı dolap veya raf',
      alanlar: [
        { ad: 'genislik', etiket: 'Genişlik', vars: 1200, min: 800, max: 2400 },
        { ad: 'yukseklik', etiket: 'Masa yüksekliği', vars: 750, min: 650, max: 800 },
        { ad: 'derinlik', etiket: 'Derinlik', vars: 450, min: 350, max: 600 },
      ],
      uret: (R, o, c) => masa(R, o, c, 'makyaj'),
    },
    calisma: {
      ad: 'Çalışma masası',
      aciklama: 'Keson / çekmece ünitesi, diz boşluğu, tabla ve duvar rafı',
      alanlar: [
        { ad: 'genislik', etiket: 'Genişlik', vars: 1400, min: 900, max: 3000 },
        { ad: 'yukseklik', etiket: 'Masa yüksekliği', vars: 750, min: 700, max: 780 },
        { ad: 'derinlik', etiket: 'Derinlik', vars: 600, min: 450, max: 800 },
      ],
      uret: (R, o, c) => masa(R, o, c, 'calisma'),
    },
    dresuar: {
      ad: 'Dresuar / konsol',
      aciklama: 'Antre veya yemek odası için alçak, çekmeceli ve kapaklı konsol; isteğe bağlı aynalı dolap',
      alanlar: [
        { ad: 'genislik', etiket: 'Genişlik', vars: 1200, min: 600, max: 3000 },
        { ad: 'yukseklik', etiket: 'Yükseklik', vars: 850, min: 650, max: 1000 },
        { ad: 'derinlik', etiket: 'Derinlik', vars: 380, min: 300, max: 500 },
      ],
      uret: dresuar,
    },
    tv: {
      ad: 'TV ünitesi',
      aciklama: 'Alçak alt ünite, ortada açık niş; isteğe bağlı asma dolaplar ve raf',
      alanlar: [
        { ad: 'genislik', etiket: 'Duvar genişliği', vars: 2400, min: 1200, max: 5000 },
        { ad: 'yukseklik', etiket: 'Alt ünite yüksekliği', vars: 500, min: 350, max: 700 },
        { ad: 'derinlik', etiket: 'Derinlik', vars: 420, min: 350, max: 550 },
      ],
      uret: tv,
    },
    kitaplik: {
      ad: 'Kitaplık',
      aciklama: 'Açık raflar, alt kapaklı bölmeler, camlı vitrin bölmeleri',
      alanlar: [
        { ad: 'genislik', etiket: 'Duvar genişliği', vars: 2000, min: 500, max: 6000 },
        { ad: 'yukseklik', etiket: 'Yükseklik', vars: 2200, min: 1000, max: 2700 },
        { ad: 'derinlik', etiket: 'Derinlik', vars: 330, min: 250, max: 450 },
      ],
      uret: kitaplik,
    },
    ayakkabilik: {
      ad: 'Ayakkabılık',
      aciklama: 'Raflı kapaklar, üst çekmeceler, isteğe bağlı oturma nişi',
      alanlar: [
        { ad: 'genislik', etiket: 'Genişlik', vars: 1000, min: 500, max: 3000 },
        { ad: 'yukseklik', etiket: 'Yükseklik', vars: 1100, min: 700, max: 2200 },
        { ad: 'derinlik', etiket: 'Derinlik', vars: 350, min: 300, max: 450 },
      ],
      uret: ayakkabilik,
    },
    banyo: {
      ad: 'Banyo',
      aciklama: 'Lavabo altı dolabı, aynalı dolap ve boy dolap',
      alanlar: [
        { ad: 'genislik', etiket: 'Duvar genişliği', vars: 1600, min: 600, max: 3500 },
        { ad: 'tavan', etiket: 'Tavan yüksekliği', vars: 2400, min: 2000, max: 3000 },
      ],
      uret: banyo,
    },
  };

  // ---------- Gardırop ----------
  function gardirop(R, o) {
    const W = o.genislik;
    const D = o.derinlik;
    const hb = 80;
    // Yan boyu plakaya sığmalı (≤ 2750 gövde); tavana 0–40 mm boşluk bırakılır
    const H = Math.min(o.yukseklik - R.sec([0, 20, 40]), 2750 + hb);
    const patara = H >= 2250 ? yuvarla(R.ara(Math.max(350, H - 2200), Math.min(650, H - 1750)), 10) : 0;
    const askiOlur = D >= 550;
    const surgu = W >= 1400 && D >= 600 && R.ihtimal(0.35);
    const ortak = { yukseklik: H, derinlik: D, yapi: 'tabla_boydan', baza: BAZA(hb, 40), arkalik: R.sec(['kanal', 'cakma']) };
    const moduller = [];
    const ozet = [];
    // Bölme içleri: [satırlar (patara hariç)], kısa ad
    const icler = (k, dar) => {
      const L = [
        [[S('kapak', null, k, { raf: R.tam(4, 6) })], 'raflı'],
      ];
      if (askiOlur && !dar) {
        L.push([[S('kapak', null, k, { aski: true })], 'askılı']);
        L.push([[S('kapak', null, k, { aski: true, icCekmece: R.tam(2, 3) })], 'askı + iç çekmece']);
        L.push([[S('kapak', null, k, { raf: 2 }), S('cekmece', 200, k), S('cekmece', 200, k)], 'raf + çekmece']);
      }
      if (askiOlur) L.push([[S('kapak', null, k, { aski: true })], 'askılı']);
      return R.sec(L);
    };
    if (surgu) {
      // Sürgülü: modül en fazla 2700 mm, kapaklar en fazla ~1100 mm
      const nMod = Math.ceil(W / 2700);
      for (const [i, mw] of bol(W, nMod).entries()) {
        const kapak = Math.max(2, Math.ceil(mw / 1100));
        const nSut = R.sec([kapak, kapak + 1].filter((x) => mw / x >= 450));
        const sutunlar = [];
        const tarif = [];
        for (let s = 0; s < (nSut || kapak); s++) {
          const tip = R.sec(askiOlur ? ['aski', 'aski', 'raf', 'cekmece'] : ['raf']);
          const satirlar = [];
          if (patara) satirlar.push(S('acik', patara, 1, { raf: 0 }));
          if (tip === 'aski') satirlar.push(S('acik', null, 1, { aski: true }));
          else if (tip === 'raf') satirlar.push(S('acik', null, 1, { raf: R.tam(4, 6) }));
          else satirlar.push(S('acik', null, 1, { aski: true }), S('cekmece', 200), S('cekmece', 200));
          sutunlar.push(SUT(null, satirlar));
          tarif.push({ aski: 'askı', raf: 'raf', cekmece: 'askı + çekmece' }[tip]);
        }
        moduller.push(govdeli(`Sürgülü gardırop${nMod > 1 ? ` ${i + 1}` : ''}`, Object.assign({}, ortak, {
          genislik: mw, onTipi: 'surgu', surguAdet: kapak, surguTuru: R.sec(['panel', 'panel', 'ayna']), sutunlar,
        })));
        ozet.push(`${mw} mm, ${kapak} sürgü kapak: ${tarif.join(' · ')}`);
      }
    } else {
      // Menteşeli: kapak eni 400–550 mm, modüller 1–3 kapaklı
      const n = Math.max(1, Math.round(W / R.ara(450, 520)));
      const gruplar = grupla(R, n, W / n > 420 ? [2, 2, 1, 3] : [2, 1]);
      const genislikler = gruplar.map((k) => (W * k) / n);
      // Yuvarlama artığını ilk modüle ver
      const tamG = genislikler.map(Math.floor);
      tamG[0] += W - tamG.reduce((a, b) => a + b, 0);
      gruplar.forEach((k, i) => {
        const mw = tamG[i];
        let sutunlar;
        let tarif;
        if (k === 1) {
          const [satirlar, ad] = icler(1, mw < 450);
          sutunlar = [SUT(null, (patara ? [S('kapak', patara, 1)] : []).concat(satirlar))];
          tarif = ad;
        } else if (k === 2 && R.ihtimal(0.5)) {
          // Tek bölme, çift kapak (geniş askı)
          const [satirlar, ad] = icler(2, false);
          sutunlar = [SUT(null, (patara ? [S('kapak', patara, 2)] : []).concat(satirlar))];
          tarif = ad;
        } else {
          // Her kapağa ayrı bölme (aralarında boydan dikme)
          sutunlar = [];
          const adlar = [];
          for (let s = 0; s < k; s++) {
            const [satirlar, ad] = icler(1, mw / k < 450);
            sutunlar.push(SUT(null, (patara ? [S('kapak', patara, 1)] : []).concat(satirlar)));
            adlar.push(ad);
          }
          tarif = adlar.join(' | ');
        }
        moduller.push(govdeli(`Gardırop ${i + 1} (${k} kapak)`, Object.assign({}, ortak, { genislik: mw, sutunlar })));
        ozet.push(`${mw} mm, ${k} kapak: ${tarif}`);
      });
    }
    if (patara) ozet.push(`Üstte ${patara} mm patara bölmesi`);
    return { ad: surgu ? 'Sürgülü gardırop' : 'Menteşeli gardırop', moduller, yerlesim: { tip: 'duz', duvarA: W }, ozet };
  }

  // ---------- Mutfak ----------
  function mutfak(R, o) {
    const A = o.duvarA;
    const B = o.duvarB > 0 ? o.duvarB : 0;
    const L = B >= 1500;
    const ustH = R.sec([720, 720, Math.min(900, Math.max(720, yuvarla(o.tavan - 1450 - 60, 10)))]);
    const ustUst = 1450 + ustH; // üst dolapların üst hizası
    const boyH = Math.min(ustUst, o.tavan - 30);
    const ozet = [];
    // Duvarlara dağıtılacak elemanlar
    const evye = { tur: 'evye', w: R.sec([800, 900]) };
    const bulasik = { tur: 'bulasik', w: 600 };
    const firin = { tur: 'firin', w: 600 };
    const toplam = A + (L ? B - 900 : 0) - (L ? 900 : 0);
    const buzTur = A + B >= 2400 ? R.sec(['serbest', 'serbest', 'ankastre', toplam >= 3200 ? 'yok' : 'serbest']) : 'yok';
    const boyFirin = toplam >= 3400 && R.ihtimal(0.45);
    const duvarlar = { A: [], B: [] };
    // Uzun elemanlar: buzdolabı ve boy fırın uzun duvarın ucunda
    const uzunDuvar = !L || A >= B ? 'A' : 'B';
    const uzunlar = [];
    if (buzTur === 'serbest') uzunlar.push({ tur: 'buz_serbest', w: R.sec([650, 700]) });
    if (buzTur === 'ankastre') uzunlar.push({ tur: 'buz_ankastre', w: 600 });
    if (boyFirin) uzunlar.push({ tur: 'boy_firin', w: 600 });
    // Ocak/fırın ve evye: L'de farklı duvarlarda
    let evyeDuvar = L ? R.sec(['A', 'B']) : 'A';
    let firinDuvar = L ? (evyeDuvar === 'A' ? 'B' : 'A') : 'A';
    // Köşeden sonra 1500 mm'den kısa kalan duvara evye/ocak konmaz; ikisi de uzun duvara
    if (L && (A - 900 < 1500 || B - 900 < 1500)) evyeDuvar = firinDuvar = A >= B ? 'A' : 'B';
    duvarlar[evyeDuvar].push([evye].concat(R.ihtimal(0.85) ? [bulasik] : []));
    if (!boyFirin) duvarlar[firinDuvar].push([{ tur: 'cekmece', w: R.sec([400, 450, 500, 600]) }, firin]);
    else duvarlar[firinDuvar].push([{ tur: 'cekmece', w: R.sec([500, 600]) }, { tur: 'ocak', w: R.sec([600, 800, 900]) }]);
    const sonuc = { A: [], B: [] };
    const uzunluk = { A: L ? A - 900 : A, B: L ? B - 900 : 0 };
    for (const d of L ? ['A', 'B'] : ['A']) {
      let grup = duvarlar[d].map((g) => (R.ihtimal(0.5) ? g.slice().reverse() : g));
      let uz = d === uzunDuvar ? uzunlar.slice() : [];
      const toplamW = () => grup.flat().reduce((a, e) => a + e.w, 0) + uz.reduce((a, e) => a + e.w, 0);
      // Kısa duvarda isteğe bağlı elemanlar sırayla çıkarılır: boy fırın, bulaşık, çekmeceli, buzdolabı
      for (const cikar of ['boy_firin', 'bulasik', 'cekmece', 'buz_serbest', 'buz_ankastre']) {
        if (toplamW() <= uzunluk[d]) break;
        grup = grup.map((g) => g.filter((e) => e.tur !== cikar)).filter((g) => g.length);
        uz = uz.filter((e) => e.tur !== cikar);
      }
      let kalan = uzunluk[d] - toplamW();
      if (kalan < 0) return null;
      // Kalanı esnek alt dolaplarla doldur (300–1000 mm; 200–300 arası şişelik)
      const esnek = [];
      if (kalan >= 300) {
        const n = Math.max(1, Math.round(kalan / R.ara(600, 900)));
        for (const w of bol(kalan, n)) esnek.push({ tur: w > 1000 ? 'alt2' : w < 450 ? 'alt_tek' : R.sec(['alt', 'alt', 'alt_kapak', 'cekmece4']), w });
        kalan = 0;
      } else if (kalan >= 150) { esnek.push({ tur: 'siselik', w: kalan }); kalan = 0; }
      // Artan küçük pay: komşu esnek ya da çekmeceli dolaba eklenir
      const hepsi = grup.flat().concat(esnek);
      if (kalan > 0) {
        const e = hepsi.find((x) => ['alt', 'alt_kapak', 'cekmece', 'cekmece4', 'alt_tek'].includes(x.tur)) || hepsi.find((x) => x.tur === 'evye');
        if (!e) return null;
        e.w += kalan;
      }
      // Sıra: gruplar ve esnek dolaplar karışık; uzunlar duvarın ucunda
      const parcalar = R.karistir(grup.concat(esnek.map((x) => [x])));
      const dizi = parcalar.flat();
      sonuc[d] = L ? dizi : (R.ihtimal(0.5) ? uz.concat(dizi) : dizi.concat(uz));
      if (L) sonuc[d] = dizi.concat(uz); // L'de uzunlar köşeden uzak uçta
    }
    // Modüller
    const moduller = [];
    if (L) {
      moduller.push(hazir('lkose', { ad: 'L Köşe Alt Dolap' }));
      moduller.push(hazir('lkoseust', { ad: 'L Köşe Üst Dolap', yukseklik: ustH }));
    }
    const altH = 870;
    const altOrtak = { yukseklik: altH, derinlik: 560 };
    const ustler = { A: [], B: [] };
    const say = {};
    const adVer = (k) => { say[k] = (say[k] || 0) + 1; return say[k] > 1 ? ` ${say[k]}` : ''; };
    for (const d of ['A', 'B']) {
      if (L) ustler[d].push({ w: 300, tur: 'kose_dolgu' });
      for (const e of sonuc[d]) {
        const duvar = { duvar: d };
        let m = null;
        if (e.tur === 'evye') m = hazir('evye', Object.assign({ genislik: e.w, ad: `Evye Altı${adVer('evye')}` }, altOrtak, duvar));
        else if (e.tur === 'bulasik') m = hazir('bulasik_panel', Object.assign({ en: 597, ad: `Bulaşık Makinesi Kapağı${adVer('bm')}` }, duvar));
        else if (e.tur === 'firin') m = hazir('firin_alt', Object.assign({ genislik: e.w, ad: `Fırın Altı${adVer('f')}` }, altOrtak, duvar));
        else if (e.tur === 'ocak') m = hazir('alt_cekmece3', Object.assign({ genislik: e.w, ad: `Ocak Altı Çekmeceli${adVer('o')}` }, altOrtak, duvar));
        else if (e.tur === 'cekmece') m = hazir('alt_cekmece3', Object.assign({ genislik: e.w, ad: `Çekmeceli Alt${adVer('c')}` }, altOrtak, duvar));
        else if (e.tur === 'cekmece4') m = hazir('alt_cekmece4', Object.assign({ genislik: e.w, ad: `Çatal-Bıçak Çekmeceli${adVer('c4')}` }, altOrtak, duvar));
        else if (e.tur === 'alt') m = hazir('alt', Object.assign({ genislik: e.w, ad: `Alt Dolap${adVer('a')}` }, altOrtak, duvar));
        else if (e.tur === 'alt_kapak') m = hazir('alt_kapak', Object.assign({ genislik: e.w, ad: `Alt Dolap${adVer('a')}` }, altOrtak, duvar));
        else if (e.tur === 'alt2') m = hazir('alt', Object.assign({ genislik: e.w, ad: `Alt Dolap${adVer('a')}`, sutunlar: [SUT(null, [S('cekmece', 150, 2), S('kapak', null, 2, { raf: 1 })])] }, altOrtak, duvar));
        else if (e.tur === 'alt_tek') m = hazir('alt_tek', Object.assign({ genislik: e.w, ad: `Dar Alt Dolap${adVer('t')}` }, altOrtak, duvar));
        else if (e.tur === 'siselik') m = hazir('siselik', Object.assign({ genislik: e.w, ad: `Şişelik${adVer('s')}` }, altOrtak, duvar));
        else if (e.tur === 'buz_serbest') m = bosluk(`Buzdolabı boşluğu${adVer('b')}`, e.w, 1850, duvar);
        else if (e.tur === 'buz_ankastre') m = hazir('buzdolabi_kabin', Object.assign({ genislik: e.w, yukseklik: boyH, ad: `Buzdolabı Kabini${adVer('bk')}` }, duvar));
        else if (e.tur === 'boy_firin') m = hazir('boy_firin', Object.assign({ genislik: e.w, yukseklik: boyH, ad: `Boy Fırın Dolabı${adVer('bf')}` }, duvar));
        moduller.push(m);
        // Üst sıra: altın genişliğiyle hizalı; boy dolapların üstü boş (yerleşim kendiliğinden atlar)
        if (e.tur === 'buz_ankastre' || e.tur === 'boy_firin') continue;
        if (e.tur === 'buz_serbest') ustler[d].push({ w: e.w, tur: 'buz_ustu' });
        else if (e.tur === 'firin' || e.tur === 'ocak') ustler[d].push({ w: e.w, tur: 'aspirator' });
        else if (e.tur === 'bulasik') ustler[d].push({ w: 600, tur: 'ust' });
        else ustler[d].push({ w: e.w, tur: 'ust' });
      }
    }
    // Üst dolaplar: 900'den genişler ikiye bölünür, çok darlar boşluk olarak geçilir
    let camKaldi = R.tam(0, 2);
    for (const d of ['A', 'B']) {
      for (const u of ustler[d]) {
        const duvar = { duvar: d };
        if (u.tur === 'kose_dolgu') { moduller.push(hazir('ust_tek', { genislik: 300, yukseklik: ustH, ad: `Köşe Yanı Üst${adVer('ky')}`, duvar: d, sutunlar: [SUT(null, [S('kapak', null, 1, { raf: 2 })])] })); continue; }
        if (u.tur === 'buz_ustu') {
          const mt = Math.max(1900, ustUst - 450);
          moduller.push(hazir('buzdolabi_ust', { genislik: u.w, yukseklik: ustUst - mt, montajYuksekligi: mt, ad: `Buzdolabı Üstü${adVer('bu')}`, duvar: d }));
          continue;
        }
        if (u.tur === 'aspirator') { moduller.push(hazir('aspirator', { genislik: u.w, yukseklik: 400, montajYuksekligi: ustUst - 400, ad: `Aspiratör Üstü${adVer('as')}`, duvar: d })); continue; }
        const parcalar = u.w > 900 ? bol(u.w, 2) : [u.w];
        for (const w of parcalar) {
          if (w < 250) { moduller.push(bosluk(`Üst boşluk${adVer('ub')}`, w, ustH, { montajYuksekligi: 1450, duvar: d })); continue; }
          if (camKaldi > 0 && w >= 600 && R.ihtimal(0.4)) {
            camKaldi--;
            moduller.push(hazir('ust_cam', { genislik: w, yukseklik: ustH, ad: `Camlı Üst${adVer('uc')}`, duvar: d }));
          } else if (w < 450) moduller.push(hazir('ust_tek', { genislik: w, yukseklik: ustH, ad: `Üst Dolap${adVer('u')}`, duvar: d }));
          else moduller.push(hazir('ust', { genislik: w, yukseklik: ustH, ad: `Üst Dolap${adVer('u')}`, duvar: d, sutunlar: [SUT(null, [S('kapak', null, 2, { raf: ustH > 800 ? 3 : 2 })])] }));
        }
      }
    }
    // Sıralama: önce köşe, sonra A ve B zemin, sonra üst sıra (yerleşim sırası duvar boyunca)
    ozet.push(L ? `L mutfak: A ${A} mm, B ${B} mm` : `Düz mutfak: ${A} mm`);
    ozet.push(`Evye ${evyeDuvar} duvarında${L ? `, ocak/fırın ${firinDuvar} duvarında` : ''}`);
    if (moduller.some((m) => m.ad.startsWith('Buzdolabı boşluğu'))) ozet.push('Serbest buzdolabı boşluğu + üstü dolap');
    if (moduller.some((m) => m.ad.startsWith('Buzdolabı Kabini'))) ozet.push('Ankastre buzdolabı kabini');
    if (moduller.some((m) => m.ad.startsWith('Boy Fırın'))) ozet.push('Boy fırın dolabı');
    if (moduller.some((m) => m.ad.startsWith('Bulaşık'))) ozet.push('Ankastre bulaşık makinesi');
    ozet.push(`Üst dolaplar ${ustH} mm`);
    return { ad: L ? 'L mutfak' : 'Düz mutfak', moduller, yerlesim: { tip: L ? 'L' : 'duz', duvarA: A, duvarB: L ? B : 0 }, ozet };
  }

  // ---------- Makyaj / çalışma masası ----------
  function masa(R, o, ctx, tur) {
    const W = o.genislik;
    const D = o.derinlik;
    const tt = ctx.t; // tabla kalınlığı
    const altH = o.yukseklik - tt;
    const moduller = [];
    const ozet = [];
    const ayakDerin = Math.max(300, D - 20);
    const unite = (ad, w, tip) => {
      let satirlar;
      if (tip === 'cekmece3') satirlar = [S('cekmece', 150), S('cekmece', null), S('cekmece', null)];
      else if (tip === 'cekmece2') satirlar = [S('cekmece', 180), S('cekmece', null)];
      else if (tip === 'kapak') satirlar = [S('cekmece', 150), S('kapak', null, 1, { raf: 1 })];
      else satirlar = [S('acik', null, 1, { raf: 2 })];
      return govdeli(ad, { genislik: w, yukseklik: altH, derinlik: ayakDerin, yapi: 'tabla_boydan', baza: AYAK(R.sec([60, 80, 100])), sutunlar: [SUT(null, satirlar)] });
    };
    // Diz boşluğu en az 500 mm (dar masada 450); ünite buna göre daralır
    const dizMin = W < 1000 ? 450 : 500;
    const uw = Math.min(R.sec([400, 420, 450, 500]), W - dizMin - ctx.t);
    const ikinci = W - uw >= 600 + 350 && R.ihtimal(tur === 'calisma' ? 0.6 : 0.4);
    const uw2 = ikinci ? Math.min(R.sec([350, 400, 450]), W - uw - 600) : 0;
    // Tek üniteli masada tablanın öbür ucu yan (ayak) paneline oturur
    const ayakPanel = ikinci ? 0 : ctx.t;
    const diz = W - uw - uw2 - ayakPanel;
    if (diz < dizMin || uw < 300) return null;
    const solda = R.ihtimal(0.5);
    const u1 = unite(tur === 'makyaj' ? 'Makyaj çekmece ünitesi' : 'Keson', uw, R.sec(['cekmece3', 'cekmece3', 'cekmece2', 'kapak']));
    const bos = bosluk('Diz boşluğu', diz, altH);
    const u2 = ikinci ? unite('Yan ünite', uw2, R.sec(['acik', 'kapak', 'cekmece2']))
      : hazir('yan_kapama', { ad: 'Masa ayağı (yan panel)', boy: altH, en: D, panelMalzeme: 'govde', bantU: 2, bantK: 1 });
    const sira = solda ? [u1, bos, u2] : [u2, bos, u1];
    for (const m of sira) if (m) moduller.push(m);
    // Plakadan uzun tabla iki parça (birleşim bir ünitenin üstüne gelmese de alttan bağlantı plakasıyla)
    const tablaAd = tur === 'makyaj' ? 'Makyaj masası tablası' : 'Çalışma tablası';
    if (W > 2700) {
      const [w1, w2] = bol(W, 2);
      moduller.push(hazir('tabla', { ad: `${tablaAd} 1`, boy: w1, en: D, montajYuksekligi: altH, konum: 0 }));
      moduller.push(hazir('tabla', { ad: `${tablaAd} 2`, boy: w2, en: D, montajYuksekligi: altH, konum: w1 }));
      ozet.push('Tabla iki parça (plaka boyu nedeniyle)');
    } else moduller.push(hazir('tabla', { ad: tablaAd, boy: W, en: D, montajYuksekligi: altH, konum: 0 }));
    ozet.push(`${uw} mm ${tur === 'makyaj' ? 'çekmece ünitesi' : 'keson'}, ${diz} mm diz boşluğu, ${ikinci ? `${uw2} mm yan ünite` : 'öbür uçta yan panel ayak'}`);
    // Üst: makyajda aynalı dolap ya da raf, çalışmada duvar rafı
    if (tur === 'makyaj' && R.ihtimal(0.7)) {
      const aw = Math.min(R.sec([500, 600, 800]), W);
      moduller.push(hazir('aynali', { ad: 'Aynalı dolap', genislik: aw, montajYuksekligi: o.yukseklik + R.sec([300, 350, 400]), konum: Math.round((W - aw) / 2) }));
      ozet.push(`Ortada ${aw} mm aynalı dolap`);
    } else if (R.ihtimal(0.7)) {
      const rw = Math.min(900, W, R.sec([W, Math.round(W * 0.75)])); // 900 üstü raf sehim yapar
      moduller.push(hazir('duvar_rafi', { ad: 'Duvar rafı', boy: rw, en: R.sec([200, 250]), montajYuksekligi: o.yukseklik + R.sec([400, 450, 500]), konum: Math.round((W - rw) / 2) }));
      ozet.push(`Üstte ${rw} mm duvar rafı`);
    }
    return { ad: tur === 'makyaj' ? 'Makyaj masası' : 'Çalışma masası', moduller, yerlesim: { tip: 'duz', duvarA: W }, ozet };
  }

  // ---------- Dresuar ----------
  function dresuar(R, o) {
    const W = o.genislik;
    const H = o.yukseklik;
    const D = o.derinlik;
    const moduller = [];
    const ozet = [];
    const baza = R.ihtimal(0.5) ? AYAK(R.sec([100, 120, 150])) : BAZA(R.sec([60, 80]), 30);
    const nMod = Math.ceil(W / 1800);
    for (const [i, mw] of bol(W, nMod).entries()) {
      const nSut = Math.max(1, Math.round(mw / R.ara(400, 550)));
      const sutunlar = [];
      const tarif = [];
      const ustCekmece = R.ihtimal(0.7) ? R.sec([120, 150]) : 0;
      for (let s = 0; s < nSut; s++) {
        const tip = R.sec(['cekmece', 'kapak', 'kapak', 'acik']);
        const satir = [];
        if (tip === 'cekmece') satir.push(S('cekmece', null), S('cekmece', null), S('cekmece', null));
        else {
          if (ustCekmece) satir.push(S('cekmece', ustCekmece));
          satir.push(tip === 'kapak' ? S('kapak', null, 1, { raf: 1 }) : S('acik', null, 1, { raf: 1, led: R.ihtimal(0.3) }));
        }
        sutunlar.push(SUT(null, satir));
        tarif.push({ cekmece: 'çekmeceler', kapak: 'kapak', acik: 'açık raf' }[tip]);
      }
      moduller.push(govdeli(`Dresuar${nMod > 1 ? ` ${i + 1}` : ''}`, { genislik: mw, yukseklik: H, derinlik: D, yapi: 'tabla_boydan', baza, sutunlar }));
      ozet.push(`${mw} mm: ${tarif.join(' | ')}`);
    }
    if (R.ihtimal(0.5) && W >= 700) {
      const aw = Math.min(R.sec([600, 800, 1000]), W);
      moduller.push(hazir('aynali', { ad: 'Aynalı dolap', genislik: aw, montajYuksekligi: H + R.sec([250, 300, 350]), konum: Math.round((W - aw) / 2), sutunlar: [SUT(null, [S('kapak', null, aw > 600 ? 2 : 1, { kapakTuru: 'ayna', raf: 2, rafTipi: 'cam' })])] }));
      ozet.push(`Üstte ${aw} mm aynalı dolap`);
    }
    return { ad: 'Dresuar', moduller, yerlesim: { tip: 'duz', duvarA: W }, ozet };
  }

  // ---------- TV ünitesi ----------
  function tv(R, o) {
    const W = o.genislik;
    const H = o.yukseklik;
    const D = o.derinlik;
    const moduller = [];
    const ozet = [];
    const nMod = Math.ceil(W / 2400);
    const baza = R.ihtimal(0.5) ? AYAK(R.sec([60, 100, 150])) : BAZA(60, 30);
    for (const [i, mw] of bol(W, nMod).entries()) {
      const nSut = Math.max(2, Math.round(mw / R.ara(500, 700)));
      const orta = Math.floor(nSut / 2);
      const yan = R.sec(['klapa', 'cekmece', 'kapak']);
      const sutunlar = [];
      for (let s = 0; s < nSut; s++) {
        const ortaMi = nSut >= 3 && s === orta;
        let satir;
        if (ortaMi) satir = [S('acik', null, 1, { led: R.ihtimal(0.5) })];
        else if (yan === 'klapa') satir = [S('kapak', null, 1, { acilim: 'asagi' })];
        else if (yan === 'cekmece') satir = H >= 450 ? [S('cekmece', null), S('cekmece', null)] : [S('cekmece', null)];
        else satir = [S('kapak', null, 1)];
        sutunlar.push(SUT(null, satir));
      }
      moduller.push(govdeli(`TV ünitesi${nMod > 1 ? ` ${i + 1}` : ''}`, { genislik: mw, yukseklik: H, derinlik: D, yapi: 'tabla_boydan', baza, sutunlar }));
      ozet.push(`${mw} mm alt ünite, ${nSut} bölme (${{ klapa: 'klapalar', cekmece: 'çekmeceler', kapak: 'kapaklar' }[yan]}${nSut >= 3 ? ', ortada açık niş' : ''})`);
    }
    // Asma dolaplar: iki yanda, TV için ortası boş
    if (W >= 1800 && R.ihtimal(0.65)) {
      const aw = R.sec([400, 450, 600]);
      const ah = R.sec([350, 400, 450]);
      const mt = R.sec([1500, 1600]);
      [0, W - aw].forEach((x, k) => {
        moduller.push(hazir('ust', { ad: `Asma dolap ${k + 1}`, genislik: aw, yukseklik: ah, derinlik: 320, montajYuksekligi: mt, konum: x, sutunlar: [SUT(null, [S('kapak', null, 1, { acilim: 'yukari' })])] }));
      });
      ozet.push(`İki yanda ${aw}×${ah} mm asma dolap`);
    }
    if (R.ihtimal(0.5)) {
      const rw = Math.min(900, Math.round(W * R.sec([0.4, 0.5, 0.6])));
      moduller.push(hazir('duvar_rafi', { ad: 'Duvar rafı', boy: rw, en: 250, montajYuksekligi: H + R.sec([900, 1000]), konum: Math.round((W - rw) / 2) }));
      ozet.push('Ortada duvar rafı');
    }
    return { ad: 'TV ünitesi', moduller, yerlesim: { tip: 'duz', duvarA: W }, ozet };
  }

  // ---------- Kitaplık ----------
  function kitaplik(R, o) {
    const W = o.genislik;
    const H = o.yukseklik;
    const D = o.derinlik;
    const nMod = Math.max(1, Math.round(W / R.ara(700, 900)));
    const moduller = [];
    const ozet = [];
    const altKapak = R.sec([0, 700, 800]);
    const baza = BAZA(60, 30);
    bol(W, nMod).forEach((mw, i) => {
      const tip = R.sec(['acik', 'acik', 'cam', 'kapakli']);
      const kapak = mw > 600 ? 2 : 1;
      const ust = tip === 'acik' ? S('acik', null, 1, { raf: Math.max(2, Math.round((H - altKapak) / 350) - 1), dikme: mw > 900 ? 1 : 0 })
        : tip === 'cam' ? S('kapak', null, kapak, { kapakTuru: 'cam_cerceve', raf: Math.max(2, Math.round((H - altKapak) / 350) - 1), rafTipi: 'cam', led: R.ihtimal(0.5) })
          : S('kapak', null, kapak, { raf: Math.max(2, Math.round((H - altKapak) / 350) - 1) });
      const satirlar = altKapak ? [ust, S('kapak', altKapak - 60, kapak, { raf: 1 })] : [ust];
      moduller.push(govdeli(`Kitaplık ${i + 1}`, { genislik: mw, yukseklik: H, derinlik: D, arkalik: 'cakma', baza, sutunlar: [SUT(null, satirlar)] }));
      ozet.push(`${mw} mm: ${{ acik: 'açık raflar', cam: 'camlı vitrin', kapakli: 'kapaklı' }[tip]}${altKapak ? ' + alt kapak' : ''}`);
    });
    return { ad: 'Kitaplık', moduller, yerlesim: { tip: 'duz', duvarA: W }, ozet };
  }

  // ---------- Ayakkabılık ----------
  function ayakkabilik(R, o) {
    const W = o.genislik;
    const H = o.yukseklik;
    const D = o.derinlik;
    const nMod = Math.max(1, Math.ceil(W / 1200));
    const moduller = [];
    const ozet = [];
    const oturma = W >= 1400 && H <= 1300 ? false : W >= 1600 && R.ihtimal(0.4);
    bol(W, nMod).forEach((mw, i) => {
      const kapak = mw > 600 ? 2 : 1;
      const raf = Math.max(2, Math.round((H - 200) / 170));
      // 900 mm'den geniş modül iki bölmeli (raf açıklığı sehim sınırında kalır)
      const nSut = mw > 900 ? 2 : 1;
      const kSut = nSut === 2 ? 1 : kapak;
      const cekmece = R.ihtimal(0.6) ? R.sec([120, 150]) : 0;
      const sutunlar = [];
      for (let s = 0; s < nSut; s++) {
        const satirlar = [];
        if (cekmece) satirlar.push(S('cekmece', cekmece, kSut));
        satirlar.push(S('kapak', null, kSut, { raf }));
        if (oturma && i === 0 && s === 0) satirlar.push(S('acik', 450, 1));
        sutunlar.push(SUT(null, satirlar));
      }
      moduller.push(govdeli(`Ayakkabılık ${i + 1}`, { genislik: mw, yukseklik: H, derinlik: D, baza: AYAK(R.sec([60, 100])), sutunlar }));
      ozet.push(`${mw} mm, ${nSut === 2 ? '2 bölme, ' : ''}${kapak} kapak, ${raf} raf${cekmece ? ', üst çekmece' : ''}`);
    });
    return { ad: 'Ayakkabılık', moduller, yerlesim: { tip: 'duz', duvarA: W }, ozet };
  }

  // ---------- Banyo ----------
  function banyo(R, o) {
    const W = o.genislik;
    const moduller = [];
    const ozet = [];
    const boyVar = W >= 1100 && R.ihtimal(0.7);
    const boyW = boyVar ? R.sec([350, 400, 450]) : 0;
    const lw = Math.min(W - boyW, R.sec([600, 800, 1000, 1200]));
    if (lw < 500) return null;
    const lavaboCekmece = R.ihtimal(0.5);
    const lav = hazir(lavaboCekmece ? 'lavabo_cekmece' : 'lavabo', { genislik: lw, ad: 'Lavabo dolabı' });
    const boy = boyVar ? hazir('banyo_boy', { genislik: boyW, yukseklik: Math.min(o.tavan - 300, R.sec([1700, 1800, 1900])), ad: 'Banyo boy dolabı' }) : null;
    const boySolda = R.ihtimal(0.5);
    if (boy && boySolda) moduller.push(boy);
    moduller.push(lav);
    if (boy && !boySolda) moduller.push(boy);
    const lavBas = boy && boySolda ? boyW : 0;
    const aw = Math.min(lw, R.sec([600, 800, lw]));
    moduller.push(hazir('aynali', { ad: 'Aynalı banyo dolabı', genislik: aw, montajYuksekligi: R.sec([1150, 1200]), konum: lavBas + Math.round((lw - aw) / 2), sutunlar: [SUT(null, [S('kapak', null, aw > 600 ? 2 : 1, { kapakTuru: 'ayna', raf: 2, rafTipi: 'cam' })])] }));
    ozet.push(`${lw} mm ${lavaboCekmece ? 'çekmeceli ' : ''}lavabo dolabı, üstünde ${aw} mm aynalı dolap`);
    if (boy) ozet.push(`${boyW} mm boy dolap ${boySolda ? 'solda' : 'sağda'}`);
    return { ad: 'Banyo', moduller, yerlesim: { tip: 'duz', duvarA: W }, ozet };
  }

  // ---------- Doğrulama ve öneriler ----------
  function sinirla(tur, olcu) {
    const T = TURLER[tur];
    const o = {};
    for (const a of T.alanlar) {
      const v = Number(olcu && olcu[a.ad]);
      o[a.ad] = Number.isFinite(v) ? Math.min(a.max, Math.max(a.min, Math.round(v))) : a.vars;
    }
    return o;
  }

  /** Tasarımı proje olarak doğrular; sorun yoksa null, varsa gerekçe döner. */
  function dogrula(tasarim, ayar) {
    const proje = Hesap.projeyiNormallestir({ ayarlar: ayar, moduller: tasarim.moduller, yerlesim: tasarim.yerlesim });
    const r = Hesap.projeHesapla(proje);
    for (const m of proje.moduller) {
      const s = r.modulSonuclari[m.id];
      if (!s || !s.geo) return `${m.ad}: hesaplanamadı`;
      if (s.uyarilar.length) return `${m.ad}: ${s.uyarilar[0]}`;
    }
    const yer = r.yerlesim.uyarilar.find((u) => /aşıyor|L köşe|birden fazla/.test(u));
    if (yer) return yer;
    // Parçalar plakaya sığmalı
    for (const p of r.kesimListesi) {
      const malz = Hesap.malzemeBul(proje.ayarlar, p.malzeme);
      if (!malz || Hesap.camMi(malz)) continue;
      const u = Math.max(p.kesimBoy, p.kesimEn);
      const k = Math.min(p.kesimBoy, p.kesimEn);
      if (u > Math.max(malz.plakaUzun, malz.plakaKisa) - 20 || k > Math.min(malz.plakaUzun, malz.plakaKisa) - 20) return `${p.ad} plakaya sığmıyor`;
    }
    return { proje, sonuc: r };
  }

  /**
   * Bir öneri üretir. tohum verilirse aynı tasarım; sığmayan/uyarılı denemeler sonraki tohumla tekrarlanır.
   * @returns { tur, tohum, ad, ozet, moduller, yerlesim, proje, sonuc } ya da null
   */
  function uret(tur, olcu, ayar, tohum) {
    const T = TURLER[tur];
    if (!T) return null;
    const A = ayar || Hesap.varsayilanAyarlar();
    const o = sinirla(tur, olcu);
    const govde = Hesap.malzemeBul(A, A.kullanim.govde);
    const ctx = { t: govde ? Number(govde.kalinlik) || 18 : 18 };
    let t0 = (tohum == null ? Math.floor(Math.random() * 1e9) : tohum) >>> 0;
    for (let deneme = 0; deneme < 40; deneme++, t0 = (t0 + 7919) >>> 0) {
      const R = rastgele(t0);
      let tasarim;
      try { tasarim = T.uret(R, o, ctx); } catch (e) { tasarim = null; }
      if (!tasarim) continue;
      const d = dogrula(tasarim, A);
      if (typeof d === 'string' || !d) continue;
      return Object.assign({ tur, tohum: t0, olcu: o }, tasarim, { moduller: d.proje.moduller, proje: d.proje, sonuc: d.sonuc });
    }
    return null;
  }

  /** Birbirinden farklı en fazla `adet` öneri. */
  function oneriler(tur, olcu, ayar, adet, tohum) {
    const L = [];
    const imzalar = new Set();
    let t = (tohum == null ? Math.floor(Math.random() * 1e9) : tohum) >>> 0;
    for (let i = 0; i < adet * 6 && L.length < adet; i++) {
      const o = uret(tur, olcu, ayar, t);
      t = (t + 104729) >>> 0;
      if (!o) continue;
      const imza = JSON.stringify(o.moduller.map((m) => [m.tip, m.panelTuru, m.genislik, m.en, m.onTipi, m.sutunlar && m.sutunlar.map((c) => c.satirlar.map((s) => [s.tip, s.adet, s.aski, s.raf, s.icCekmece, s.kapakTuru]))]));
      if (imzalar.has(imza)) continue;
      imzalar.add(imza);
      L.push(o);
    }
    return L;
  }

  /** Önizlemede iç düzen gösterilmeli mi (dış görünüşü birbirine benzeyen türler). */
  const IC_ONIZLEME = { gardirop: true, kitaplik: false, ayakkabilik: true };

  return { TURLER, IC_ONIZLEME, uret, oneriler, sinirla, dogrula, rastgele };
});

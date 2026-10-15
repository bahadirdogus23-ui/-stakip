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
    ad, yapi: 'yanlar_boydan', ust: 'tam', arkalik: 'kanal', kapakTipi: 'tam', korPanel: 0, onTipi: 'normal', montajYuksekligi: 0, konum: null, yanlarYere: true,
  }, ek);
  const bosluk = (ad, en, boy, ek) => Object.assign(Hesap.yeniModul('bosluk'), { ad, en: Math.round(en), boy: Math.round(boy), montajYuksekligi: 0 }, ek || {});

  /** Kademeli raf yükseklikleri (satır içinden, alttan): rastgele aralıklarla, üstte en az 180 mm pay. */
  function kademe(R, h, araliklar) {
    const L = [];
    let y = 0;
    for (;;) {
      y += R.sec(araliklar);
      if (y > h - 180) break;
      L.push(y);
    }
    return L;
  }

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
    vestiyer: {
      ad: 'Vestiyer / antre',
      aciklama: 'Askılık (kancalı) nişi, oturak, ayakkabılık, boy dolap; asma ve ayna seçenekleri',
      alanlar: [
        { ad: 'genislik', etiket: 'Duvar genişliği', vars: 1600, min: 900, max: 3600 },
        { ad: 'yukseklik', etiket: 'Yükseklik', vars: 2200, min: 1900, max: 2700 },
        { ad: 'derinlik', etiket: 'Derinlik', vars: 400, min: 300, max: 500 },
      ],
      uret: vestiyer,
    },
    yatak: {
      ad: 'Yatak odası duvarı',
      aciklama: 'Yatak boşluğu, komodinler, yatak başı paneli; yer kalırsa gardırop, isteğe bağlı köprü dolap',
      alanlar: [
        { ad: 'genislik', etiket: 'Duvar genişliği', vars: 3600, min: 2400, max: 7000 },
        { ad: 'yatak', etiket: 'Yatak eni', vars: 1600, min: 900, max: 2000 },
        { ad: 'tavan', etiket: 'Tavan yüksekliği', vars: 2600, min: 2300, max: 3200 },
      ],
      uret: yatak,
    },
  };

  // ---------- Gardırop ----------
  function gardirop(R, o, ctx) {
    const st = ctx.stil;
    const t = ctx.t;
    const W = o.genislik;
    const D = o.derinlik;
    const hb = 80;
    // Yan boyu plakaya sığmalı (plaka 2800 − pay); tavana 0–40 mm boşluk bırakılır
    const H = Math.min(o.yukseklik - R.sec([0, 20, 40]), 2770); // yanlar bazaya iner: yan = H − t
    const patara = H >= 2250 ? yuvarla(R.ara(Math.max(350, H - 2200), Math.min(650, H - 1750)), 10) : 0;
    const askiOlur = D >= 550;
    const surgu = W >= 1400 && D >= 600 && R.ihtimal(0.35);
    const ortak = { yukseklik: H, derinlik: D, yapi: 'tabla_boydan', baza: BAZA(hb, 40), arkalik: R.sec(['kanal', 'cakma']) };
    const moduller = [];
    const ozet = [];
    // Patara altındaki satırın yaklaşık iç yüksekliği (kademeli raflar için, güvenli tarafta)
    const icH = H - hb - patara - 4 * t;
    // Bölme içleri: [satırlar (patara hariç), kısa ad]
    const icler = (k, dar) => {
      // Çift kapaklı tek bölme: raf açıklığı sehim sınırını aşar, yalnız askılı içler
      if (k > 1) return R.sec([[[S('kapak', null, k, { aski: true })], 'askılı'], [[S('kapak', null, k, { aski: true, icCekmece: R.tam(2, 3) })], 'askı + iç çekmece']]);
      const L = [[[S('kapak', null, 1, { raf: R.tam(4, 6) })], 'raflı']];
      if (askiOlur && !dar) {
        L.push([[S('kapak', null, 1, { aski: true })], 'askılı']);
        L.push([[S('kapak', null, 1, { aski: true, icCekmece: R.tam(2, 3) })], 'askı + iç çekmece']);
        L.push([[S('kapak', null, 1, { raf: 2 }), S('cekmece', 200, 1), S('cekmece', 200, 1)], 'raf + çekmece']);
        // Kısa askı: üstte askı, altta raflar (iki satır)
        if (icH > 1700) L.push([[S('kapak', 1000, 1, { aski: true }), S('kapak', null, 1, { raf: 2 })], 'kısa askı + raf']);
      }
      if (askiOlur) L.push([[S('kapak', null, 1, { aski: true })], 'askılı']);
      return R.sec(L);
    };
    // Tek kapaklı bölmelere bir kez uygulanabilecek özel bölmeler
    const ozeller = R.karistir([
      R.ihtimal(0.35) ? 'ayna' : null,
      R.ihtimal(st.cam) ? 'vitrin' : null,
      icH > 1500 && R.ihtimal(0.3) ? 'nis' : null,
    ].filter(Boolean));
    const ozelBolme = (genis) => {
      const tur = ozeller.find((x) => x !== 'nis' || genis >= 420);
      if (!tur) return null;
      ozeller.splice(ozeller.indexOf(tur), 1);
      if (tur === 'ayna') return [[S('kapak', null, 1, { kapakTuru: 'ayna', aski: askiOlur, raf: askiOlur ? 0 : 5 })], 'aynalı kapak'];
      if (tur === 'vitrin') return [[S('kapak', null, 1, { kapakTuru: st.camTur, raf: R.tam(4, 5), rafTipi: 'cam', led: R.ihtimal(st.led) })], 'camlı vitrin'];
      // Makyaj / TV nişi: altta kapaklı, ortada LED'li açık niş, üstte kapaklı raf
      const nisH = R.sec([400, 450, 500]);
      return [[S('kapak', null, 1, { raf: 2 }), S('acik', nisH, 1, { led: R.ihtimal(0.7) }), S('kapak', R.sec([750, 800]), 1, { raf: 1 })], `${nisH} mm açık niş`];
    };
    // Patara satırı: tek kapaklı bölmede bazen yukarı açılır
    const pataraKalkar = patara && patara <= 500 && R.ihtimal(0.4);
    let kalkanVar = false;
    const pataraS = (k) => {
      if (k === 1 && pataraKalkar) kalkanVar = true;
      return S('kapak', patara, k, k === 1 && pataraKalkar ? { acilim: 'yukari' } : {});
    };
    // Uçta açık raf bölmesi (kademeli raflar)
    let ucW = 0;
    let ucSolda = false;
    if (!surgu && W >= 1500 && R.ihtimal(st.acik)) {
      ucW = R.sec([350, 400, 450]);
      ucSolda = R.ihtimal(0.5);
    }
    const ucModul = () => {
      const raflar = kademe(R, H - hb - 2 * t, [280, 320, 360, 400]);
      return govdeli('Uç açık raf', Object.assign({}, ortak, {
        genislik: ucW, _aksan: R.ihtimal(0.6), sutunlar: [SUT(null, [S('acik', null, 1, { rafYukseklikleri: raflar, led: R.ihtimal(st.led * 0.5) })])],
      }));
    };
    const Wg = W - ucW;
    if (ucW && ucSolda) moduller.push(ucModul());
    if (surgu) {
      // Sürgülü: modül en fazla 2700 mm, kapaklar en fazla ~1100 mm
      const nMod = Math.ceil(Wg / 2700);
      for (const [i, mw] of bol(Wg, nMod).entries()) {
        const kapak = Math.max(2, Math.ceil(mw / 1100));
        const nSut = R.sec([kapak, kapak + 1].filter((x) => mw / x >= 450));
        const sutunlar = [];
        const tarif = [];
        for (let s = 0; s < (nSut || kapak); s++) {
          const tip = R.sec(askiOlur ? ['aski', 'aski', 'raf', 'cekmece', 'kademe'] : ['raf', 'kademe']);
          const satirlar = [];
          if (patara) satirlar.push(S('acik', patara, 1, { raf: 0 }));
          if (tip === 'aski') satirlar.push(S('acik', null, 1, { aski: true }));
          else if (tip === 'raf') satirlar.push(S('acik', null, 1, { raf: R.tam(4, 6) }));
          else if (tip === 'kademe') satirlar.push(S('acik', null, 1, { rafYukseklikleri: kademe(R, icH, [250, 300, 350, 400]) }));
          else satirlar.push(S('acik', null, 1, { aski: true }), S('cekmece', 200), S('cekmece', 200));
          sutunlar.push(SUT(null, satirlar));
          tarif.push({ aski: 'askı', raf: 'raf', kademe: 'kademeli raf', cekmece: 'askı + çekmece' }[tip]);
        }
        const surguTuru = R.sec(['panel', 'panel', 'ayna'].concat(R.ihtimal(st.cam) ? ['cam_profil'] : []));
        moduller.push(govdeli(`Sürgülü gardırop${nMod > 1 ? ` ${i + 1}` : ''}`, Object.assign({}, ortak, {
          genislik: mw, onTipi: 'surgu', surguAdet: kapak, surguTuru, sutunlar,
        })));
        ozet.push(`${mw} mm, ${kapak} ${{ panel: 'düz', ayna: 'aynalı', cam_profil: 'camlı' }[surguTuru]} sürgü kapak: ${tarif.join(' · ')}`);
      }
    } else {
      // Menteşeli: kapak eni 400–550 mm, modüller 1–3 kapaklı
      const n = Math.max(1, Math.round(Wg / R.ara(450, 520)));
      const gruplar = grupla(R, n, Wg / n > 420 ? [2, 2, 1, 3] : [2, 1]);
      const genislikler = gruplar.map((k) => (Wg * k) / n);
      // Yuvarlama artığını ilk modüle ver
      const tamG = genislikler.map(Math.floor);
      tamG[0] += Wg - tamG.reduce((a, b) => a + b, 0);
      gruplar.forEach((k, i) => {
        const mw = tamG[i];
        let sutunlar;
        let tarif;
        let aksan = false;
        if (k === 1) {
          const oz = ozelBolme(mw);
          const [satirlar, ad] = oz || icler(1, mw < 450);
          sutunlar = [SUT(null, (patara ? [pataraS(1)] : []).concat(satirlar))];
          tarif = ad;
          aksan = !!oz && R.ihtimal(0.5);
        } else if (k === 2 && askiOlur && R.ihtimal(0.5)) {
          // Tek bölme, çift kapak (geniş askı)
          const [satirlar, ad] = icler(2, false);
          sutunlar = [SUT(null, (patara ? [pataraS(2)] : []).concat(satirlar))];
          tarif = ad;
        } else {
          // Her kapağa ayrı bölme (aralarında boydan dikme)
          sutunlar = [];
          const adlar = [];
          for (let s = 0; s < k; s++) {
            const oz = s === 0 || s === k - 1 ? ozelBolme(mw / k) : null;
            const [satirlar, ad] = oz || icler(1, mw / k < 450);
            sutunlar.push(SUT(null, (patara ? [pataraS(1)] : []).concat(satirlar)));
            adlar.push(ad);
          }
          tarif = adlar.join(' | ');
        }
        moduller.push(govdeli(`Gardırop ${i + 1} (${k} kapak)`, Object.assign({}, ortak, { genislik: mw, sutunlar, _aksan: aksan })));
        ozet.push(`${mw} mm, ${k} kapak: ${tarif}`);
      });
    }
    if (ucW && !ucSolda) moduller.push(ucModul());
    if (ucW) ozet.push(`${ucSolda ? 'Solda' : 'Sağda'} ${ucW} mm kademeli açık raf bölmesi`);
    if (patara) ozet.push(`Üstte ${patara} mm patara bölmesi${kalkanVar ? ' (tek kapaklılar yukarı açılır)' : ''}`);
    return { ad: surgu ? 'Sürgülü gardırop' : 'Menteşeli gardırop', moduller, yerlesim: { tip: 'duz', duvarA: W }, ozet };
  }

  // ---------- Mutfak ----------
  function mutfak(R, o, ctx) {
    const st = ctx.stil;
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
        else if (e.tur === 'bulasik') ustler[d].push({ w: 597, tur: 'ust' }); // panel eniyle hizalı
        else ustler[d].push({ w: e.w, tur: 'ust' });
      }
    }
    // Üst dolaplar: 900'den genişler ikiye bölünür, çok darlar boşluk olarak geçilir
    let camKaldi = R.ihtimal(st.cam * 2) ? R.tam(1, 2) : 0;
    let acikKaldi = R.ihtimal(st.acik) ? R.tam(1, 2) : 0;
    const kalkar = R.ihtimal(0.35);
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
          const ustOrt = { genislik: w, yukseklik: ustH, duvar: d };
          if (acikKaldi > 0 && w >= 400 && R.ihtimal(0.4)) {
            // Açık raflı üst kutu (aksan renkli, LED'li)
            acikKaldi--;
            moduller.push(hazir('ust', Object.assign(ustOrt, { ad: `Açık Raflı Üst${adVer('ua')}`, _aksan: true, sutunlar: [SUT(null, [S('acik', null, 1, { raf: 1, led: R.ihtimal(st.led) })])] })));
          } else if (camKaldi > 0 && w >= 600 && R.ihtimal(0.4)) {
            camKaldi--;
            moduller.push(hazir('ust_cam', Object.assign(ustOrt, { ad: `Camlı Üst${adVer('uc')}`, sutunlar: [SUT(null, [S('kapak', null, 2, { kapakTuru: st.camTur, raf: 2, rafTipi: w > 800 ? 'ahsap' : 'cam', led: R.ihtimal(st.led) })])] })));
          } else if (kalkar && w >= 450) {
            // Yukarı kalkan kapaklar: yüksek dolapta üst üste iki kapak
            const iki = ustH >= 700;
            moduller.push(hazir('ust', Object.assign(ustOrt, { ad: `Kaldırmalı Üst${adVer('uk')}`, sutunlar: [SUT(null, iki ? [S('kapak', null, 1, { acilim: 'yukari', raf: 0 }), S('kapak', null, 1, { acilim: 'yukari', raf: 0 })] : [S('kapak', null, 1, { acilim: 'yukari', raf: 1 })])] })));
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
    ozet.push(`Üst dolaplar ${ustH} mm${kalkar ? ', kaldırmalı kapaklı' : ''}${moduller.some((m) => m.ad.startsWith('Açık Raflı')) ? ', açık raflı üst kutular' : ''}`);
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
  function dresuar(R, o, ctx) {
    const st = ctx.stil;
    const W = o.genislik;
    const D = o.derinlik;
    const moduller = [];
    const ozet = [];
    // Asma (duvara monte, yerden yüksek) ya da ayaklı / bazalı
    const asma = o.yukseklik >= 700 && R.ihtimal(0.3);
    const mt = asma ? R.sec([200, 250, 300]) : 0;
    const H = o.yukseklik - mt;
    const baza = asma ? { tip: 'yok' } : R.ihtimal(st.ayak) ? AYAK(R.sec([100, 120, 150])) : BAZA(R.sec([60, 80]), 30);
    const nMod = Math.ceil(W / 1800);
    for (const [i, mw] of bol(W, nMod).entries()) {
      const nSut = Math.max(1, Math.round(mw / R.ara(400, 550)));
      const sutunlar = [];
      const tarif = [];
      const ustCekmece = R.ihtimal(0.7) ? R.sec([120, 150]) : 0;
      // Simetrik düzen: ortadaki ile kenardakiler farklı
      const kenar = R.sec(['cekmece', 'kapak', 'kapak', 'acik', 'cam']);
      const orta = R.sec(['cekmece', 'kapak', 'acik', 'cam'].filter((x) => x !== kenar));
      for (let s = 0; s < nSut; s++) {
        const tip = nSut >= 3 && s > 0 && s < nSut - 1 ? orta : kenar;
        const kp = mw / nSut > 600 ? 2 : 1; // geniş bölmede çift kapak
        const satir = [];
        if (tip === 'cekmece') satir.push(S('cekmece', null), S('cekmece', null), S('cekmece', null));
        else {
          if (ustCekmece) satir.push(S('cekmece', ustCekmece));
          if (tip === 'kapak') satir.push(S('kapak', null, kp, { raf: 1 }));
          else if (tip === 'cam') satir.push(S('kapak', null, kp, { kapakTuru: st.camTur, raf: 1, rafTipi: 'cam', led: R.ihtimal(st.led) }));
          else satir.push(S('acik', null, 1, { raf: 1, led: R.ihtimal(st.led) }));
        }
        sutunlar.push(SUT(null, satir));
        tarif.push({ cekmece: 'çekmeceler', kapak: 'kapak', acik: 'açık raf', cam: 'camlı kapak' }[tip]);
      }
      moduller.push(govdeli(`Dresuar${nMod > 1 ? ` ${i + 1}` : ''}`, { genislik: mw, yukseklik: H, derinlik: D, yapi: 'tabla_boydan', baza, montajYuksekligi: mt, sutunlar }));
      ozet.push(`${mw} mm: ${tarif.join(' | ')}`);
    }
    if (asma) ozet.push(`Duvara asma, yerden ${mt} mm yüksekte`);
    const ust = R.sec(W >= 700 ? ['ayna', 'ayna', 'raf', 'panel', 'yok'] : ['raf', 'yok']);
    if (ust === 'ayna') {
      const aw = Math.min(R.sec([600, 800]), W);
      moduller.push(hazir('aynali', { ad: 'Aynalı dolap', genislik: aw, montajYuksekligi: o.yukseklik + R.sec([250, 300, 350]), konum: Math.round((W - aw) / 2), sutunlar: [SUT(null, [S('kapak', null, aw > 600 ? 2 : 1, { kapakTuru: 'ayna', raf: 2, rafTipi: 'cam' })])] }));
      ozet.push(`Üstte ${aw} mm aynalı dolap`);
    } else if (ust === 'raf') {
      // Kademeli iki duvar rafı
      const rw = Math.min(900, Math.round(W * R.sec([0.4, 0.5])));
      const y0 = o.yukseklik + R.sec([350, 400]);
      const x1 = Math.round(W * R.sec([0.1, 0.15]));
      moduller.push(hazir('duvar_rafi', { ad: 'Duvar rafı 1', boy: rw, en: 200, montajYuksekligi: y0, konum: x1 }));
      moduller.push(hazir('duvar_rafi', { ad: 'Duvar rafı 2', boy: rw, en: 200, montajYuksekligi: y0 + 300, konum: Math.min(W - rw, x1 + Math.round(rw * 0.6)) }));
      ozet.push('Üstte kademeli iki duvar rafı');
    } else if (ust === 'panel') {
      const pw = Math.min(2700, Math.round(W * R.sec([0.6, 0.8, 1])));
      moduller.push(hazir('duvar_paneli', { ad: 'Duvar paneli', en: pw, boy: R.sec([700, 800, 900]), montajYuksekligi: o.yukseklik + 100, konum: Math.round((W - pw) / 2), _aksan: true }));
      ozet.push(`Üstte ${pw} mm duvar kaplama paneli`);
    }
    return { ad: asma ? 'Asma dresuar' : 'Dresuar', moduller, yerlesim: { tip: 'duz', duvarA: W }, ozet };
  }

  // ---------- TV ünitesi ----------
  function tv(R, o, ctx) {
    const st = ctx.stil;
    const W = o.genislik;
    const D = o.derinlik;
    const moduller = [];
    const ozet = [];
    // Yan boy vitrin(ler): tek ya da iki yanda
    const vitrin = W >= 2200 && R.ihtimal(0.4) ? (W >= 3000 && R.ihtimal(0.5) ? 2 : 1) : 0;
    const vw = vitrin ? R.sec([400, 450, 500]) : 0;
    const vSolda = R.ihtimal(0.5);
    const asma = R.ihtimal(0.4);
    const mt = asma ? R.sec([250, 300, 350, 400]) : 0;
    const H = asma ? Math.min(o.yukseklik, 450) : o.yukseklik;
    const baza = asma ? { tip: 'yok' } : R.ihtimal(st.ayak) ? AYAK(R.sec([100, 150])) : BAZA(60, 30);
    const vitrinH = Math.min(2100, R.sec([1600, 1800, 2000]));
    const vitrinM = (k) => govdeli(`Vitrin ${k}`, {
      genislik: vw, yukseklik: vitrinH, derinlik: Math.min(D, 400), yapi: 'tabla_boydan', baza: BAZA(60, 30), _aksan: R.ihtimal(0.3),
      sutunlar: [SUT(null, [S('kapak', null, 1, { kapakTuru: st.camTur, rafTipi: 'cam', raf: 4, led: R.ihtimal(st.led) }), S('kapak', 450, 1, { raf: 1 })])],
    });
    if (vitrin === 2 || (vitrin && vSolda)) moduller.push(vitrinM(1));
    const Wa = W - vitrin * vw;
    const nMod = Math.ceil(Wa / 2400);
    for (const [i, mw] of bol(Wa, nMod).entries()) {
      const nSut = Math.max(2, Math.ceil(mw / R.ara(480, 600)));
      const orta = Math.floor(nSut / 2);
      const yan = R.sec(['klapa', 'cekmece', 'kapak', 'karma']);
      const sutunlar = [];
      for (let s = 0; s < nSut; s++) {
        const ortaMi = nSut >= 3 && s === orta;
        let satir;
        if (ortaMi) satir = R.ihtimal(0.5) ? [S('acik', null, 1, { led: R.ihtimal(st.led) })] : [S('acik', null, 1, { raf: 1 })];
        else if (yan === 'klapa') satir = [S('kapak', null, 1, { acilim: 'asagi' })];
        else if (yan === 'cekmece') satir = H >= 450 ? [S('cekmece', null), S('cekmece', null)] : [S('cekmece', null)];
        else if (yan === 'karma') satir = s % 2 ? [S('cekmece', null)] : [S('kapak', null, 1, { acilim: 'asagi' })];
        else satir = [S('kapak', null, 1)];
        sutunlar.push(SUT(null, satir));
      }
      moduller.push(govdeli(`TV ünitesi${nMod > 1 ? ` ${i + 1}` : ''}`, { genislik: mw, yukseklik: H, derinlik: D, yapi: 'tabla_boydan', baza, montajYuksekligi: mt, sutunlar }));
      ozet.push(`${mw} mm ${asma ? 'asma ' : ''}alt ünite, ${nSut} bölme (${{ klapa: 'klapalar', cekmece: 'çekmeceler', kapak: 'kapaklar', karma: 'klapa + çekmece' }[yan]}${nSut >= 3 ? ', ortada açık niş' : ''})`);
    }
    if (vitrin === 2 || (vitrin && !vSolda)) moduller.push(vitrinM(vitrin));
    if (asma) ozet.push(`Ünite duvara asma, yerden ${mt} mm`);
    if (vitrin) ozet.push(`${vitrin === 2 ? 'İki yanda' : vSolda ? 'Solda' : 'Sağda'} ${vw}×${vitrinH} mm camlı vitrin`);
    // Üst duvar: TV arkası panel, iki yanda asma dolaplar, kademeli raflar
    const x0 = vitrin && (vitrin === 2 || vSolda) ? vw : 0;
    const ustAlt = mt + H; // ünitenin üstü
    const asmaVar = Wa >= 1800 && R.ihtimal(0.55);
    const aw = R.sec([400, 450, 600]);
    if (asmaVar) {
      const ah = R.sec([350, 400, 450]);
      const amt = Math.max(ustAlt + 1000, R.sec([1500, 1600]));
      [x0, x0 + Wa - aw].forEach((x, k) => {
        moduller.push(hazir('ust', { ad: `Asma dolap ${k + 1}`, genislik: aw, yukseklik: ah, derinlik: 320, montajYuksekligi: amt, konum: x, _aksan: R.ihtimal(0.3), sutunlar: [SUT(null, [S('kapak', null, 1, { acilim: 'yukari' })])] }));
      });
      ozet.push(`İki yanda ${aw}×${ah} mm kaldırmalı asma dolap`);
    }
    const bos = Wa - (asmaVar ? 2 * aw + 200 : 0);
    if (bos >= 900 && R.ihtimal(0.55)) {
      const pw = Math.min(2700, Math.round(Math.min(bos, Math.max(1000, Wa * R.sec([0.45, 0.6])))));
      const ph = R.sec([900, 1000, 1200]);
      moduller.push(hazir('duvar_paneli', { ad: 'TV arkası duvar paneli', en: pw, boy: ph, montajYuksekligi: ustAlt + R.sec([100, 150]), konum: x0 + Math.round((Wa - pw) / 2), _aksan: true }));
      ozet.push(`TV arkasında ${pw}×${ph} mm duvar kaplama paneli`);
    } else if (!asmaVar && R.ihtimal(0.6)) {
      // Kademeli raflar: yan yana iki ya da üç raf farklı yüksekliklerde
      const n = R.sec([2, 3]);
      const rw = Math.min(900, Math.round(Wa * R.sec([0.25, 0.3])));
      const solMu = R.ihtimal(0.5);
      for (let k = 0; k < n; k++) {
        const x = solMu ? x0 + Math.round(k * rw * 0.55) : x0 + Wa - rw - Math.round(k * rw * 0.55);
        moduller.push(hazir('duvar_rafi', { ad: `Duvar rafı ${k + 1}`, boy: rw, en: 220, montajYuksekligi: ustAlt + 800 + k * 300, konum: x }));
      }
      ozet.push(`${solMu ? 'Solda' : 'Sağda'} ${n} kademeli duvar rafı`);
    }
    return { ad: asma ? 'Asma TV ünitesi' : 'TV ünitesi', moduller, yerlesim: { tip: 'duz', duvarA: W }, ozet };
  }

  // ---------- Kitaplık ----------
  function kitaplik(R, o, ctx) {
    const st = ctx.stil;
    const t = ctx.t;
    const W = o.genislik;
    const H = o.yukseklik;
    const D = o.derinlik;
    const nMod = Math.max(1, Math.ceil(W / R.ara(700, 900)));
    const moduller = [];
    const ozet = [];
    const altKapak = R.sec([0, 700, 800]);
    const baza = R.ihtimal(st.ayak * 0.5) ? AYAK(100) : BAZA(60, 30);
    const kademeli = R.ihtimal(0.55); // açık bölmelerde farklı aralıklı raflar
    const desen = R.sec(['karisik', 'ritim', 'karisik']); // ritim: açık / kapaklı dönüşümlü
    const aksanSira = R.ihtimal(0.35);
    bol(W, nMod).forEach((mw, i) => {
      const secenek = (L) => L.filter((x) => (x !== 'cam' || mw <= 800) && (x !== 'karma' || D >= 330));
      const tip = R.sec(desen === 'ritim' ? (i % 2 ? secenek(['cam', 'kapakli']) : ['acik']) : secenek(['acik', 'acik', 'cam', 'kapakli', 'karma']));
      const kapak = mw > 600 ? 2 : 1;
      const ustH = H - 60 - altKapak;
      const rafN = Math.max(2, Math.round(ustH / 350) - 1);
      const acikSatir = () => kademeli
        ? S('acik', null, 1, { rafYukseklikleri: kademe(R, ustH - 4 * t, [240, 300, 360, 420]), dikme: mw > 900 ? 1 : 0, led: R.ihtimal(st.led * 0.4) })
        : S('acik', null, 1, { raf: rafN, dikme: mw > 900 ? 1 : 0 });
      let satirlar;
      if (tip === 'acik') satirlar = [acikSatir()];
      else if (tip === 'cam') satirlar = [S('kapak', null, kapak, { kapakTuru: st.camTur, raf: rafN, rafTipi: 'cam', led: R.ihtimal(st.led) })];
      else if (tip === 'karma') satirlar = [S('acik', null, 1, { raf: Math.max(1, rafN - 2) }), S('cekmece', 180, 1)];
      else satirlar = [S('kapak', null, kapak, { raf: rafN })];
      if (altKapak) satirlar.push(S('kapak', altKapak - 60, kapak, { raf: 1 }));
      moduller.push(govdeli(`Kitaplık ${i + 1}`, { genislik: mw, yukseklik: H, derinlik: D, arkalik: 'cakma', baza, _aksan: aksanSira && i % 2 === 1, sutunlar: [SUT(null, satirlar)] }));
      ozet.push(`${mw} mm: ${{ acik: kademeli ? 'kademeli açık raflar' : 'açık raflar', cam: 'camlı vitrin', kapakli: 'kapaklı', karma: 'açık raf + çekmece' }[tip]}${altKapak ? ' + alt kapak' : ''}`);
    });
    if (aksanSira && nMod > 1) ozet.push('Bölmeler dönüşümlü iki renk');
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

  // ---------- Vestiyer / antre ----------
  function vestiyer(R, o, ctx) {
    const st = ctx.stil;
    const W = o.genislik;
    const H = Math.min(o.yukseklik, 2770);
    const D = o.derinlik;
    const moduller = [];
    const ozet = [];
    const ortak = { yukseklik: H, derinlik: D, yapi: 'tabla_boydan', baza: BAZA(60, 30) };
    const patara = H >= 2100 ? R.sec([300, 350, 400]) : 0;
    const tip = R.sec(W >= 1300 ? ['oturakli', 'oturakli', 'ayakkabi', 'asma'] : ['ayakkabi', 'asma', 'oturakli']);
    const boyDolap = (ad, w, ayna) => govdeli(ad, Object.assign({}, ortak, {
      genislik: w, _aksan: R.ihtimal(0.3),
      sutunlar: [SUT(null, (patara ? [S('kapak', patara, 1)] : []).concat([S('kapak', null, 1, { raf: R.tam(4, 6), kapakTuru: ayna ? 'ayna' : 'panel' })]))],
    }));
    if (tip === 'oturakli') {
      // Ortada askılık + oturak nişi, bir ya da iki yanda boy dolap
      const yan = W >= 1900 && R.ihtimal(0.5) ? 2 : W >= 1100 ? 1 : 0;
      const yw = yan ? R.sec([400, 450, 500]) : 0;
      let orta = W - yan * yw;
      const nOrta = Math.ceil(orta / 1300);
      const solda = R.ihtimal(0.5);
      const ayna = R.ihtimal(0.5);
      if (yan === 2 || (yan === 1 && solda)) moduller.push(boyDolap('Boy dolap 1', yw, ayna));
      for (const [i, w] of bol(orta, nOrta).entries()) {
        const k = w > 650 ? 2 : 1;
        const oturakH = R.sec([420, 450]);
        const satirlar = (patara ? [S('kapak', patara, k)] : []).concat([
          S('acik', null, 1, { aski: true, askiTuru: 'kanca', led: R.ihtimal(st.led) }),
          S('cekmece', oturakH - 260, k), // oturak önü çekmece
          S('acik', 260, 1, { raf: 0 }), // ayakkabı
        ]);
        moduller.push(govdeli(`Oturaklı vestiyer${nOrta > 1 ? ` ${i + 1}` : ''}`, Object.assign({}, ortak, { genislik: w, _aksan: R.ihtimal(0.5), sutunlar: [SUT(null, satirlar)] })));
      }
      if (yan === 2 || (yan === 1 && !solda)) moduller.push(boyDolap(`Boy dolap ${yan}`, yw, ayna && yan === 1));
      ozet.push(`Kancalı askılık nişi, oturak çekmecesi, altında ayakkabı rafı${yan ? `; ${yan === 2 ? 'iki yanda' : solda ? 'solda' : 'sağda'} ${yw} mm boy dolap${ayna ? ' (aynalı kapak)' : ''}` : ''}`);
    } else if (tip === 'ayakkabi') {
      // Altta kapaklı ayakkabılık, üstünde açık askılık
      const n = Math.ceil(W / 900);
      const ayH = R.sec([800, 900, 1000]);
      for (const [i, w] of bol(W, n).entries()) {
        const k = w > 600 ? 2 : 1;
        const satirlar = (patara ? [S('kapak', patara, k)] : [S('acik', 280, 1, { raf: 0 })]).concat([
          S('acik', null, 1, { aski: true, askiTuru: 'kanca' }),
          S('kapak', ayH, k, { raf: Math.max(2, Math.round(ayH / 180) - 1) }),
        ]);
        moduller.push(govdeli(`Vestiyer ${i + 1}`, Object.assign({}, ortak, { genislik: w, sutunlar: [SUT(null, satirlar)] })));
      }
      ozet.push(`Altta ${ayH} mm kapaklı ayakkabılık, üstte kancalı askılık${patara ? ', en üstte kapaklı bölme' : ''}`);
    } else {
      // Asma vestiyer + yerde alçak ayakkabılık + ayna
      const ayW = W; // alçak ayakkabılık / oturak duvar boyunca
      const ayH = R.sec([450, 500]);
      const n = Math.ceil(ayW / 900);
      for (const [i, w] of bol(ayW, n).entries()) {
        moduller.push(govdeli(`Ayakkabılık / oturak ${i + 1}`, { genislik: w, yukseklik: ayH, derinlik: Math.min(D, 380), yapi: 'tabla_boydan', baza: R.ihtimal(st.ayak) ? AYAK(100) : BAZA(60, 30), _aksan: true,
          sutunlar: [SUT(null, [S('kapak', null, w > 600 ? 2 : 1, { raf: 1, acilim: 'yana' })])] }));
      }
      const aw = Math.min(W, R.sec([800, 900, 1000]));
      const amt = R.sec([1000, 1100]);
      const aynaVar = W - aw >= 600;
      const ax = aynaVar ? (R.ihtimal(0.5) ? 0 : W - aw) : Math.round((W - aw) / 2);
      moduller.push(govdeli('Asma vestiyer', { genislik: aw, yukseklik: Math.min(1100, H - amt), derinlik: 300, montajYuksekligi: amt, konum: ax, yapi: 'tabla_boydan',
        sutunlar: [SUT(null, [S('acik', 250, 1, { raf: 0 }), S('acik', null, 1, { aski: true, askiTuru: 'kanca' })])] }));
      if (aynaVar) {
        const mw = Math.min(R.sec([500, 600, 700]), W - aw - 100);
        const kalanX = ax === 0 ? aw : 0;
        const ayna = Object.assign(Hesap.yeniModul('nesne_ayna_duvar'), { ad: 'Ayna', en: mw, boy: 900, montajYuksekligi: ayH + 450, konum: kalanX + Math.round((W - aw - mw) / 2) });
        moduller.push(ayna);
        ozet.push(`Yanında ${mw}×900 mm ayna`);
      }
      ozet.push(`${ayW} mm alçak ayakkabılık (oturak), üstünde ${aw} mm asma vestiyer`);
    }
    return { ad: { oturakli: 'Oturaklı vestiyer', ayakkabi: 'Ayakkabılıklı vestiyer', asma: 'Asma vestiyer' }[tip], moduller, yerlesim: { tip: 'duz', duvarA: W }, ozet };
  }

  // ---------- Eşya ve dekor yerleştirme ----------
  /**
   * Doğrulanmış tasarıma görsel eşya/dekor ekler: açık raflara kitap, vazo, bitki; mutfak nişlerine
   * buzdolabı, fırın, mikrodalga; alçak mobilyaların üstüne lamba, vazo; TV ünitesinin üstüne televizyon.
   * Eşyalar parça ve maliyet üretmez, yerleşimi değiştirmez.
   */
  function dekorEkle(R, tur, sonuc) {
    const L = [];
    const NS = Hesap.NESNELER;
    const nesne = (id, y, a, w, mt, h, d, zGeri, ad) => {
      // Modülün yerel x aralığından duvar konumuna (B duvarında yön terstir)
      const konum = y.duvar === 'B' ? y.bas + y.W - (a + w) : y.bas + a;
      L.push(Object.assign(Hesap.yeniModul('nesne_' + id), {
        ad: `Dekor – ${ad || NS[id].ad}`, en: Math.round(w), boy: Math.round(h), nesneD: Math.round(d), konum: Math.round(konum),
        montajYuksekligi: Math.round(mt), duvarMesafe: Math.round(zGeri), duvar: y.duvar === 'B' ? 'B' : 'A',
      }));
    };
    const yerler = sonuc.yerlesim.yerler.filter((y) => y.geo && y.duvar !== 'kose' && !y.nesne);
    for (const y of yerler) {
      const g = y.geo;
      if (g.panel) {
        // Serbest buzdolabı boşluğu
        if (g.tur === 'bosluk' && /^Yatak boşluğu/.test(y.modul.ad)) {
          const bw = Math.min(g.W - 40, Math.max(900, g.W - 160));
          nesne(bw >= 1200 ? 'yatak_cift' : 'yatak_tek', y, (g.W - bw) / 2, bw, 0, 500, 2000, 0, 'Yatak');
        }
        if (g.tur === 'bosluk' && /Buzdolabı/.test(y.modul.ad) && g.W >= 600) nesne(g.W >= 900 ? 'buzdolabi_genis' : 'buzdolabi', y, 5, g.W - 10, 0, Math.min(1850, g.H || 1850), 650, 0, 'Buzdolabı');
        continue;
      }
      if (g.lkose) continue;
      const t = g.t;
      const icOn = g.kapakTipi === 'ic' ? g.tk : 0;
      const zArkaIc = g.D - icOn - g.icDerinlik; // iç boşluğun arka yüzü
      const dMax = g.icDerinlik - 20;
      for (const s of g.satirlar) {
        // Cihaz nişleri (mutfak): yüksekliğe göre buzdolabı, fırın, mikrodalga
        if (s.tip === 'nis' && tur === 'mutfak') {
          const b = s.bolumler[0];
          const w = b.x2 - b.x1 - 6;
          if (s.icH >= 1600) nesne('buzdolabi', y, b.x1 + 3, w, y.montaj + g.hb + s.icAlt, Math.min(1850, s.icH - 10), Math.min(650, g.D + 60), zArkaIc);
          else if (s.icH >= 560 && s.icH <= 640) nesne('firin', y, b.x1 + 3, w, y.montaj + g.hb + s.icAlt, Math.min(590, s.icH - 4), Math.min(560, g.icDerinlik - 15), zArkaIc + 5);
          else if (s.icH >= 360 && s.icH < 560) nesne('mikrodalga', y, b.x1 + 3, w, y.montaj + g.hb + s.icAlt, Math.min(380, s.icH - 5), Math.min(400, g.icDerinlik - 25), zArkaIc + 20);
          continue;
        }
        // Açık raflar: her yüzeye kitap / vazo / bitki / sepet
        if (s.tip !== 'acik' || s.aski || s.kanca || s.ondenAski || dMax < 120) continue;
        const yuzey = [s.icAlt].concat(s.raflar.map((r) => r + (s.rafTipi === 'cam' ? 4 : t / 2))).sort((a, b) => a - b);
        for (const b of s.bolumler) {
          const w = b.x2 - b.x1 - 20;
          for (let k = 0; k < yuzey.length; k++) {
            const lv = yuzey[k];
            const ust = k + 1 < yuzey.length ? yuzey[k + 1] - t : s.icUst;
            const h = ust - lv - 25;
            if (h < 90 || w < 120 || !R.ihtimal(0.7)) continue;
            const mt = y.montaj + g.hb + lv;
            const secenek = [];
            if (h >= 180) secenek.push('kitap', 'kitap');
            if (h >= 200) secenek.push('vazo');
            if (h >= 260 && w >= 220) secenek.push('saksi');
            if (h >= 180 && w >= 320) secenek.push('sepet');
            if (h >= 90) secenek.push('kitap_yatay');
            if (h >= 150) secenek.push('biblo');
            const id = R.sec(secenek);
            const n = NS[id];
            let oh = Math.min(n.H, h);
            let ow = Math.min(n.W, w);
            if (id === 'kitap') { oh = Math.min(h, R.sec([200, 230, 260])); ow = Math.min(w * R.sec([0.4, 0.55, 0.7]), 380); }
            if (id === 'saksi') { oh = Math.min(h, 420); ow = Math.min(w, oh * 0.55); }
            const od = Math.min(n.D, dMax, id === 'saksi' ? ow : n.D);
            const sol = R.ihtimal(0.5);
            const a = sol ? b.x1 + 10 : b.x2 - 10 - ow;
            nesne(id, y, a, ow, mt, oh, od, zArkaIc + 10);
            // Geniş bölmede yanına küçük bir obje
            const kalan = w - ow - 40;
            if (kalan >= 120 && h >= 150 && R.ihtimal(0.6)) {
              const id2 = R.sec(['vazo', 'biblo', 'mum', 'kitap_yatay']);
              const n2 = NS[id2];
              const w2 = Math.min(n2.W, kalan);
              nesne(id2, y, sol ? b.x2 - 10 - w2 : b.x1 + 10, w2, mt, Math.min(n2.H, h), Math.min(n2.D, dMax), zArkaIc + 10);
            }
          }
        }
      }
      // Alçak mobilyanın üstü (dresuar, TV ünitesi, komodin, ayakkabılık, büfe)
      const ustY = y.montaj + g.H;
      if (g.H <= 1200 && ustY <= 1300 && ['dresuar', 'tv', 'yatak', 'vestiyer', 'kitaplik'].includes(tur) && R.ihtimal(0.75)) {
        const id = R.sec(/komodin/i.test(y.modul.ad) ? ['lamba', 'lamba', 'kitap_yatay'] : ['vazo', 'vazo_uzun', 'lamba', 'saksi', 'biblo', 'kitap_yatay']);
        const n = NS[id];
        const ow = Math.min(n.W, g.W * 0.4);
        nesne(id, y, R.ihtimal(0.5) ? g.W * 0.12 : g.W * 0.88 - ow, ow, ustY, n.H, Math.min(n.D, g.D - 40), (g.D - n.D) / 2);
      }
      // Mutfak: ocak ve küçük ev aletleri tezgah hizasında
      if (tur === 'mutfak' && y.sira === 'zemin' && g.H < 1000) {
        if (/Ocak|Fırın Altı/.test(y.modul.ad) && g.W >= 580) nesne('ocak', y, (g.W - Math.min(580, g.W - 20)) / 2, Math.min(580, g.W - 20), ustY, 50, 510, 40, 'Ocak');
        else if (/Çekmeceli|Alt Dolap/.test(y.modul.ad) && g.W >= 400 && R.ihtimal(0.35)) {
          const id = R.sec(['kahve', 'kettle', 'cay', 'robot', 'airfryer', 'ekmek']);
          const n = NS[id];
          nesne(id, y, g.W / 2 - n.W / 2, n.W, ustY, n.H, n.D, g.D - n.D - 60);
        }
      }
    }
    // TV ünitesinin üstüne televizyon (ünitelerin ortasına)
    if (tur === 'tv') {
      const un = yerler.filter((y) => /^TV ünitesi/.test(y.modul.ad));
      if (un.length) {
        const x1 = Math.min(...un.map((y) => y.bas));
        const x2 = Math.max(...un.map((y) => y.bas + y.W));
        const ust = Math.max(...un.map((y) => y.montaj + y.geo.H));
        const span = x2 - x1;
        const id = ['tv75', 'tv65', 'tv55'].find((k) => NS[k].W <= span * 0.8);
        const n = NS[id || 'tv55'];
        if (id) L.push(Object.assign(Hesap.yeniModul('nesne_' + id), { ad: `Dekor – ${n.ad}`, konum: Math.round((x1 + x2) / 2 - n.W / 2), montajYuksekligi: Math.round(ust + R.sec([180, 220, 260])), duvarMesafe: 30 }));
        if (span >= 1000 && R.ihtimal(0.5)) L.push(Object.assign(Hesap.yeniModul('nesne_soundbar'), { ad: 'Dekor – Soundbar', konum: Math.round((x1 + x2) / 2 - 450), montajYuksekligi: Math.round(ust), duvarMesafe: 120 }));
      }
    }
    // Masa üstü
    if (tur === 'calisma' || tur === 'makyaj') {
      const tabla = sonuc.yerlesim.yerler.find((y) => y.geo && y.geo.panel && y.geo.tur === 'tabla');
      if (tabla) {
        const ust = tabla.montaj + tabla.geo.H;
        if (tur === 'calisma') L.push(Object.assign(Hesap.yeniModul('nesne_monitor'), { ad: 'Dekor – Monitör', konum: Math.round(tabla.bas + tabla.geo.W / 2 - 310), montajYuksekligi: Math.round(ust), duvarMesafe: 80 }));
        L.push(Object.assign(Hesap.yeniModul('nesne_lamba'), { ad: 'Dekor – Masa lambası', konum: Math.round(tabla.bas + (R.ihtimal(0.5) ? 60 : tabla.geo.W - 280)), montajYuksekligi: Math.round(ust), duvarMesafe: 60 }));
      }
    }
    return L;
  }

  // ---------- Banyo ----------
  function banyo(R, o, ctx) {
    const st = ctx.stil;
    const W = o.genislik;
    const moduller = [];
    const ozet = [];
    const boyVar = W >= 1100 && R.ihtimal(0.7);
    const boyW = boyVar ? R.sec([350, 400, 450]) : 0;
    const lw = Math.min(W - boyW, R.sec([600, 800, 1000, 1200]));
    if (lw < 500) return null;
    const lavaboCekmece = R.ihtimal(0.5);
    // Asma lavabo dolabı: tezgâh üstü ~850 mm
    const asma = R.ihtimal(0.5);
    const lav = hazir(lavaboCekmece ? 'lavabo_cekmece' : 'lavabo', { genislik: lw, ad: 'Lavabo dolabı' });
    if (asma) Object.assign(lav, { baza: { tip: 'yok' }, montajYuksekligi: Math.max(0, 850 - lav.yukseklik) });
    let boy = null;
    if (boyVar) {
      const bh = Math.min(o.tavan - 300, R.sec([1700, 1800, 1900]));
      const nis = R.ihtimal(st.acik);
      boy = hazir('banyo_boy', { genislik: boyW, yukseklik: bh, ad: 'Banyo boy dolabı', _aksan: R.ihtimal(0.3) });
      // Ortada açık niş (havlu / sepet)
      if (nis) boy.sutunlar = [SUT(null, [S('kapak', null, 1, { raf: 2 }), S('acik', 350, 1, { led: R.ihtimal(st.led) }), S('kapak', 600, 1, { raf: 1 })])];
    }
    const boySolda = R.ihtimal(0.5);
    if (boy && boySolda) moduller.push(boy);
    moduller.push(lav);
    if (boy && !boySolda) moduller.push(boy);
    const lavBas = boy && boySolda ? boyW : 0;
    const aw = Math.min(lw, R.sec([600, 800]));
    moduller.push(hazir('aynali', { ad: 'Aynalı banyo dolabı', genislik: aw, montajYuksekligi: R.sec([1150, 1200]), konum: lavBas + Math.round((lw - aw) / 2), sutunlar: [SUT(null, [S('kapak', null, aw > 600 ? 2 : 1, { kapakTuru: 'ayna', raf: 2, rafTipi: 'cam' })])] }));
    ozet.push(`${lw} mm ${asma ? 'asma ' : ''}${lavaboCekmece ? 'çekmeceli ' : ''}lavabo dolabı, üstünde ${aw} mm aynalı dolap`);
    if (boy) ozet.push(`${boyW} mm boy dolap ${boySolda ? 'solda' : 'sağda'}${boy.sutunlar.length && boy.sutunlar[0].satirlar.length > 1 ? ', ortada açık niş' : ''}`);
    return { ad: asma ? 'Banyo (asma dolap)' : 'Banyo', moduller, yerlesim: { tip: 'duz', duvarA: W }, ozet };
  }

  // ---------- Yatak odası duvarı ----------
  function yatak(R, o, ctx) {
    const st = ctx.stil;
    const W = o.genislik;
    const moduller = [];
    const ozet = [];
    // Komodinlere en az 2×350 mm kalmıyorsa komodinsiz (yalnız yatak başı)
    const komVar = W - o.yatak - 40 >= 700;
    let yw = komVar ? Math.min(o.yatak + R.sec([100, 160, 200]), W - 700) : W; // yatak + iki yanda pay
    let kw = komVar ? R.sec([450, 500, 550]) : 0;
    let kalan = W - yw - 2 * kw;
    if (kalan < 0) { kw = Math.floor((W - yw) / 2); kalan = W - yw - 2 * kw; }
    // Yanda gardırop sığıyorsa (≥ 900 mm) bir ya da iki yanda
    let solG = 0;
    let sagG = 0;
    if (kalan >= 900 && R.ihtimal(0.75)) {
      if (kalan >= 1800 && R.ihtimal(0.4)) { solG = Math.floor(kalan / 2); sagG = kalan - solG; } else if (R.ihtimal(0.5)) solG = kalan; else sagG = kalan;
    } else yw += kalan; // yatak boşluğu genişler
    const gardiropEkle = (w, yan) => {
      const g = gardirop(R, { genislik: w, yukseklik: o.tavan, derinlik: R.sec([580, 600]) }, ctx);
      g.moduller.forEach((m) => { m.ad = `${yan} ${m.ad.charAt(0).toLowerCase()}${m.ad.slice(1)}`; moduller.push(m); });
      ozet.push(`${yan}da ${w} mm gardırop (${g.ad.toLowerCase()})`);
    };
    // Komodinler: asma ya da ayaklı
    const asma = R.ihtimal(0.4);
    const kh = asma ? R.sec([250, 300, 350]) : R.sec([450, 500, 550]);
    const kmt = asma ? R.sec([300, 350]) : 0;
    const kTip = R.sec(['cekmece2', 'cekmece1', 'acik_cekmece']);
    const komodin = (ad) => govdeli(ad, {
      genislik: kw, yukseklik: kh, derinlik: R.sec([380, 400]), yapi: 'tabla_boydan', montajYuksekligi: kmt, _aksan: R.ihtimal(0.4),
      baza: asma ? { tip: 'yok' } : R.ihtimal(st.ayak) ? AYAK(R.sec([100, 150])) : BAZA(60, 30),
      sutunlar: [SUT(null, kTip === 'cekmece2' && kh >= 400 ? [S('cekmece', null), S('cekmece', null)] : kTip === 'acik_cekmece' ? [S('cekmece', null), S('acik', R.sec([120, 150]), 1)] : [S('cekmece', null)])],
    });
    if (solG) gardiropEkle(solG, 'Sol');
    if (komVar) moduller.push(komodin('Sol komodin'));
    moduller.push(bosluk('Yatak boşluğu', yw, 500));
    if (komVar) moduller.push(komodin('Sağ komodin'));
    if (sagG) gardiropEkle(sagG, 'Sağ');
    const yx = solG + kw; // yatak boşluğunun başı
    const komUst = kmt + kh;
    ozet.push(`${o.yatak} mm yatak için ${yw} mm boşluk${komVar ? `, iki yanda ${kw} mm ${asma ? 'asma ' : ''}komodin` : ' (komodine yer yok)'}`);
    // Yatak başı paneli: yatak eninde (yerden) ya da komodinleri de kapsayan geniş (komodin üstünden)
    const kopru = o.tavan >= 2500 && R.ihtimal(0.45);
    const kopruMt = Math.max(1900, o.tavan - 500);
    const panelTur = R.sec(['dar', 'genis', 'genis', 'yok']);
    if (panelTur === 'dar') {
      const ph = Math.min(R.sec([1100, 1200, 1300]), kopru ? kopruMt - 100 : 9999);
      const pw = Math.min(yw, 2700);
      moduller.push(hazir('duvar_paneli', { ad: 'Yatak başı paneli', en: pw, boy: ph, montajYuksekligi: 0, konum: yx + Math.round((yw - pw) / 2), _aksan: true }));
      ozet.push(`Yatak başı duvar paneli ${pw}×${ph} mm`);
    } else if (panelTur === 'genis') {
      const pw = Math.min(2700, yw + 2 * kw);
      const py = komUst + 50;
      const ph = Math.min(R.sec([700, 800, 900]), (kopru ? kopruMt - 100 : o.tavan - 300) - py);
      if (ph >= 400) {
        moduller.push(hazir('duvar_paneli', { ad: 'Yatak başı paneli', en: pw, boy: ph, montajYuksekligi: py, konum: yx + Math.round((yw - pw) / 2), _aksan: true }));
        ozet.push(`Komodinlerin üstünden ${pw}×${ph} mm yatak başı paneli`);
      }
    }
    // Yatak üstü köprü dolap (kaldırmalı kapaklar)
    if (kopru) {
      const kpW = yw + 2 * kw;
      const n = Math.ceil(kpW / 1200);
      let x = solG;
      for (const [i, w] of bol(kpW, n).entries()) {
        moduller.push(hazir('ust', { ad: `Köprü dolap ${i + 1}`, genislik: w, yukseklik: Math.min(400, o.tavan - kopruMt - 20), derinlik: 350, montajYuksekligi: kopruMt, konum: x, sutunlar: [SUT(null, [S('kapak', null, w > 600 ? 2 : 1, { acilim: w > 600 ? 'yana' : 'yukari', raf: 0 })])] }));
        x += w;
      }
      ozet.push(`Yatak üstünde ${kpW} mm köprü dolap`);
    } else if (komVar && R.ihtimal(0.5) && panelTur !== 'genis') {
      // Komodin üstlerinde duvar rafları
      for (const [k, x] of [[1, solG], [2, solG + kw + yw]]) {
        moduller.push(hazir('duvar_rafi', { ad: `Komodin üstü raf ${k}`, boy: kw, en: 200, montajYuksekligi: komUst + 400, konum: x }));
      }
      ozet.push('Komodin üstlerinde duvar rafları');
    }
    return { ad: 'Yatak odası duvarı', moduller, yerlesim: { tip: 'duz', duvarA: W }, ozet };
  }

  // ---------- Stiller ----------
  /**
   * Her stil bir malzeme paleti (gövde, kapak, aksan renk seçenekleri — malzeme kimlikleri),
   * kulp tipi ve tasarım eğilimleri (ayaklı, açık raf, cam, LED olasılıkları) tanımlar.
   */
  const STILLER = {
    modern: { ad: 'Modern kulpsuz', govde: ['sl18', 'sl18a'], kapak: ['lake18', 'akrilik18', 'sl18a', 'lake18l'], aksan: ['sl18m', 'sl18c'], kulp: ['gola', 'basac'], ayak: 0.15, acik: 0.35, cam: 0.2, led: 0.7, camTur: 'cam_profil', camMalz: 'cam4f' },
    iskandinav: { ad: 'İskandinav', govde: ['sl18'], kapak: ['sl18', 'lake18y', 'sl18k'], aksan: ['sl18m'], kulp: ['kulp', 'gomme'], ayak: 0.8, acik: 0.5, cam: 0.1, led: 0.2, camTur: 'cam_cerceve' },
    klasik: { ad: 'Klasik', govde: ['sl18', 'sl18c'], kapak: ['lake18', 'sl18c', 'sl18k'], aksan: ['sl18c'], kulp: ['kulp'], ayak: 0.1, acik: 0.15, cam: 0.45, led: 0.3, camTur: 'cam_cerceve' },
    endustriyel: { ad: 'Endüstriyel', govde: ['sl18a'], kapak: ['sl18m', 'sl18c', 'sl18a'], aksan: ['sl18m', 'sl18c'], kulp: ['kulp'], metalAyak: true, ayak: 0.7, acik: 0.6, cam: 0.25, led: 0.3, camTur: 'cam_profil', camMalz: 'cam4f' },
    minimal: { ad: 'Minimal', govde: ['sl18'], kapak: ['mdflam18', 'lake18', 'sl18'], aksan: [], kulp: ['basac'], ayak: 0.2, acik: 0.15, cam: 0.05, led: 0.2, camTur: 'cam_profil' },
    iki_renk: { ad: 'İki renkli', govde: ['sl18', 'sl18k'], kapak: ['sl18', 'lake18', 'sl18k'], aksan: ['lake18l', 'lake18y', 'sl18m', 'sl18c', 'sl18a'], kulp: ['gomme', 'kulp', 'gola'], ayak: 0.4, acik: 0.35, cam: 0.2, led: 0.4, camTur: 'cam_profil', ikiRenk: true },
  };
  /** "Proje malzemeleri": malzeme ve kulp değiştirilmez. */
  const NOTR = { ad: 'Proje malzemeleri', ayak: 0.4, acik: 0.35, cam: 0.25, led: 0.4, camTur: 'cam_cerceve' };

  /** Stilden somut palet: { govde, kapak, aksan, kulp, ikiTon }. */
  function paletSec(R, stil, tur) {
    const govde = R.sec(stil.govde);
    const kapak = R.sec(stil.kapak);
    const aksanlar = stil.aksan.filter((x) => x !== kapak && x !== govde);
    const aksan = aksanlar.length && (stil.ikiRenk || R.ihtimal(0.6)) ? R.sec(aksanlar) : null;
    // Mutfakta iki ton: alt dolaplar aksan, üstler açık renk
    const ikiTon = !!aksan && tur === 'mutfak' && (stil.ikiRenk || R.ihtimal(0.35));
    return { govde, kapak, aksan, kulp: R.sec(stil.kulp), ikiTon, cam: stil.camMalz || null };
  }

  /** Paleti modüllere uygular: modül bazında malzeme ve kulp seçimi. _aksan işaretli modüller aksan rengi alır. */
  function stilUygula(moduller, stil, palet) {
    for (const m of moduller) {
      const aksan = !!m._aksan;
      delete m._aksan;
      if (!palet) continue;
      const ust = (Number(m.montajYuksekligi) || 0) >= 1000;
      let kapak = palet.kapak;
      if (palet.aksan && (palet.ikiTon ? !ust : aksan)) kapak = palet.aksan;
      if (m.tip === 'panel') {
        if (m.panelTuru === 'bosluk') continue;
        // Tabla ve raflar gövde rengi (aksan varsa ahşap aksan), diğer paneller kapak rengi
        const p = m.panelMalzeme === 'govde' ? (aksan && palet.aksan) || palet.govde : kapak;
        m.malzeme = Object.assign({}, m.malzeme, { govde: p, kapak: p });
        continue;
      }
      m.malzeme = Object.assign({}, m.malzeme, { govde: palet.govde, kapak });
      if (palet.cam) m.malzeme.cam = palet.cam;
      // Gola profil yalnız yerde duran dolaplarda; asma dolaplarda bas-aç
      const kulp = palet.kulp === 'gola' && (Number(m.montajYuksekligi) || 0) > 0 ? 'basac' : palet.kulp;
      m.hirdavat = Object.assign({}, m.hirdavat, { kulp });
      if (stil.metalAyak && m.baza && m.baza.tip === 'ayak') m.hirdavat.ayak = 'metal';
    }
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

  /** Tasarımı proje olarak doğrular; sorun yoksa { proje, sonuc }, varsa gerekçe döner. */
  function dogrula(tasarim, ayar) {
    const proje = Hesap.projeyiNormallestir({ ayarlar: ayar, moduller: tasarim.moduller, yerlesim: tasarim.yerlesim });
    const r = Hesap.projeHesapla(proje);
    for (const m of proje.moduller) {
      const s = r.modulSonuclari[m.id];
      if (!s || !s.geo) return `${m.ad}: hesaplanamadı`;
      if (s.uyarilar.length) return `${m.ad}: ${s.uyarilar[0]}`;
    }
    const yer = r.yerlesim.uyarilar.find((u) => /aşıyor|L köşe|birden fazla|çakış/.test(u));
    if (yer) return yer;
    // Parçalar plakaya sığmalı
    for (const p of r.kesimListesi) {
      const malz = Hesap.malzemeBul(proje.ayarlar, p.malzeme);
      if (!malz || Hesap.camMi(malz) || malz.tur === 'Lambri / çıta') continue;
      const u = Math.max(p.kesimBoy, p.kesimEn);
      const k = Math.min(p.kesimBoy, p.kesimEn);
      if (u > Math.max(malz.plakaUzun, malz.plakaKisa) - 20 || k > Math.min(malz.plakaUzun, malz.plakaKisa) - 20) return `${p.ad} plakaya sığmıyor`;
    }
    return { proje, sonuc: r };
  }

  /** Stil paletlerindeki, projede bulunmayan malzemeleri varsayılanlardan ekler. */
  function ayarTamamla(A) {
    const var0 = new Set(A.malzemeler.map((m) => m.id));
    const gerek = new Set();
    for (const s of Object.values(STILLER)) for (const id of [].concat(s.govde, s.kapak, s.aksan, s.camMalz || [])) gerek.add(id);
    const ek = Hesap.varsayilanAyarlar().malzemeler.filter((m) => gerek.has(m.id) && !var0.has(m.id));
    return { ayar: ek.length ? Object.assign({}, A, { malzemeler: A.malzemeler.concat(ek) }) : A, ek };
  }

  /**
   * Bir öneri üretir. tohum verilirse aynı tasarım; sığmayan/uyarılı denemeler sonraki tohumla tekrarlanır.
   * secenek.stil: 'rastgele' (varsayılan), 'proje' (proje malzemeleri) ya da STILLER anahtarı.
   * @returns { tur, tohum, ad, ozet, stil, stilAd, palet, ekMalzemeler, moduller, yerlesim, proje, sonuc } ya da null
   */
  function uret(tur, olcu, ayar, tohum, secenek) {
    const T = TURLER[tur];
    if (!T) return null;
    const A0 = ayar || Hesap.varsayilanAyarlar();
    const { ayar: A, ek } = ayarTamamla(A0);
    const o = sinirla(tur, olcu);
    const govde = Hesap.malzemeBul(A, A.kullanim.govde);
    const t = govde ? Number(govde.kalinlik) || 18 : 18;
    const istenen = (secenek && secenek.stil) || 'rastgele';
    let t0 = (tohum == null ? Math.floor(Math.random() * 1e9) : tohum) >>> 0;
    for (let deneme = 0; deneme < 40; deneme++, t0 = (t0 + 7919) >>> 0) {
      const R = rastgele(t0);
      const stilKey = istenen === 'proje' ? 'proje' : STILLER[istenen] ? istenen : R.sec(Object.keys(STILLER));
      const stil = STILLER[stilKey] || NOTR;
      const palet = STILLER[stilKey] ? paletSec(R, stil, tur) : null;
      const ctx = { t, stil };
      let tasarim;
      const tani = secenek && secenek.tani; // geliştirme: elenen denemelerin gerekçesi
      try { tasarim = T.uret(R, o, ctx); } catch (e) { tasarim = null; if (tani) tani(`istisna: ${e.message}`); }
      if (!tasarim) { if (tani) tani('üretilemedi'); continue; }
      stilUygula(tasarim.moduller, stil, palet);
      let d = dogrula(tasarim, A);
      if (typeof d === 'string' || !d) { if (tani) tani(d || 'doğrulanamadı'); continue; }
      // Eşya ve dekor (yalnız görsel); istenmezse secenek.dekor = false
      if (!secenek || secenek.dekor !== false) {
        const dekor = dekorEkle(R, tur, d.sonuc);
        if (dekor.length) {
          const d2 = dogrula({ moduller: d.proje.moduller.concat(dekor), yerlesim: tasarim.yerlesim }, A);
          if (d2 && typeof d2 !== 'string') d = d2;
        }
      }
      // Yalnız kullanılan ek malzemeler projeye eklenecek
      const kullanilan = new Set();
      for (const m of d.proje.moduller) for (const v of Object.values(m.malzeme || {})) kullanilan.add(v);
      const ekMalzemeler = ek.filter((m) => kullanilan.has(m.id));
      const ozet = tasarim.ozet.slice();
      if (palet) {
        const ad = (id) => {
          const m = Hesap.malzemeBul(A, id);
          if (!m) return id;
          const kisa = m.ad.replace(/\s*\d+\s*mm.*$/i, '');
          return kisa.replace(/^(Suntalam|MDF Lake|MDF Lam|Akrilik)\s+/, '') || kisa;
        };
        ozet.unshift(`${stil.ad}: gövde ${ad(palet.govde)}, kapak ${ad(palet.ikiTon ? palet.aksan : palet.kapak)}${palet.ikiTon ? ` (üstler ${ad(palet.kapak)})` : palet.aksan ? `, aksan ${ad(palet.aksan)}` : ''}; ${Hesap.HIRDAVAT_SECENEKLERI.kulp.secenekler[palet.kulp].ad.toLowerCase()}`);
      }
      return Object.assign({ tur, tohum: t0, olcu: o }, tasarim, {
        ozet, stil: stilKey, stilAd: stil.ad, palet, ekMalzemeler, moduller: d.proje.moduller, proje: d.proje, sonuc: d.sonuc,
      });
    }
    return null;
  }

  /** Birbirinden farklı en fazla `adet` öneri. */
  function oneriler(tur, olcu, ayar, adet, tohum, secenek) {
    const L = [];
    const imzalar = new Set();
    let t = (tohum == null ? Math.floor(Math.random() * 1e9) : tohum) >>> 0;
    for (let i = 0; i < adet * 6 && L.length < adet; i++) {
      const o = uret(tur, olcu, ayar, t, secenek);
      t = (t + 104729) >>> 0;
      if (!o) continue;
      const imza = JSON.stringify(o.moduller.map((m) => [m.tip, m.panelTuru, m.genislik, m.en, m.onTipi, m.malzeme, m.sutunlar && m.sutunlar.map((c) => c.satirlar.map((s) => [s.tip, s.adet, s.aski, s.raf, s.icCekmece, s.kapakTuru, s.rafYukseklikleri]))]));
      if (imzalar.has(imza)) continue;
      imzalar.add(imza);
      L.push(o);
    }
    return L;
  }

  /** Önizlemede iç düzen gösterilmeli mi (dış görünüşü birbirine benzeyen türler). */
  const IC_ONIZLEME = { gardirop: true, kitaplik: false, ayakkabilik: true };

  return { TURLER, STILLER, IC_ONIZLEME, uret, oneriler, sinirla, dogrula, rastgele };
});

/*
 * Akıllı süsleme: projeye (ya da tasarım önerisine) görsel eşya ve dekor yerleştirir.
 * Her dolabın ne olduğu (mutfak, gardırop, vestiyer, ayakkabılık, banyo, kitaplık, TV, komodin…) ve her
 * satırın türü (askılı, kancalı, açık raf, camlı vitrin, cihaz nişi) ölçülere ve adlara bakılarak anlaşılır;
 * eşyalar raf aralığına, derinliğe ve genişliğe göre ölçeklenip yan yana boşluklu dizilir.
 * Eşyalar parça ve maliyet üretmez; başka parçaya ya da birbirine giren eşya atılır.
 * Aynı tohum aynı süslemeyi verir (dönerken değişmez); "karıştır" ile yeni tohum seçilir.
 */
(function (root, factory) {
  const api = factory(root.Hesap || (typeof require === 'function' ? require('./hesap.js') : null));
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Dekor = api;
})(typeof self !== 'undefined' ? self : this, function (Hesap) {
  'use strict';

  function rastgele(tohum) {
    let a = tohum >>> 0;
    const r = () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    return { r, sec: (L) => L[Math.floor(r() * L.length)], ihtimal: (p) => r() < p, ara: (a2, b) => a2 + r() * (b - a2) };
  }
  const ozet = (s) => { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };

  /** Yoğunluk: bir yüzeyin süslenme olasılığı ve yüzey başına en fazla eşya. */
  const YOGUNLUK = {
    az: { ad: 'Az', yuzey: 0.35, adet: 1, ust: 0.35 },
    normal: { ad: 'Normal', yuzey: 0.7, adet: 2, ust: 0.7 },
    bol: { ad: 'Bol', yuzey: 0.95, adet: 3, ust: 0.95 },
  };

  /** Raf yüzeyleri için bağlama göre eşya listesi (ağırlıklı). */
  const RAF_ESYA = {
    mutfak: ['tabak', 'tabak', 'bardak', 'bardak', 'kavanoz', 'kavanoz', 'kase', 'saksi', 'sise'],
    gardirop: ['katli', 'katli', 'katli', 'kutu', 'sepet', 'katli'],
    banyo: ['havlu', 'havlu', 'sise', 'saksi', 'mum', 'sepet'],
    ayakkabi: ['ayakkabi'],
    salon: ['kitap', 'kitap', 'kitap', 'kitap', 'kitap_yatay', 'vazo', 'saksi', 'biblo', 'cerceve', 'mum', 'vazo_uzun', 'kitap_yatay', 'sepet'],
    ofis: ['kitap', 'kitap', 'kitap_yatay', 'kutu', 'saksi', 'cerceve'],
  };
  /** Alçak mobilya üstü. */
  const UST_ESYA = {
    mutfak: ['kahve', 'kettle', 'cay', 'ekmek', 'robot', 'airfryer', 'kase', 'tahta', 'saksi', 'sise'],
    komodin: ['lamba', 'lamba', 'kitap_yatay', 'saat', 'kupa'],
    banyo: ['sise', 'havlu', 'saksi', 'mum'],
    salon: ['vazo', 'vazo_uzun', 'lamba', 'saksi', 'biblo', 'kitap_yatay', 'cerceve', 'mum', 'kase', 'pampas', 'pampas', 'tepsi'],
    gardirop: ['sepet', 'kutu', 'kutu'],
  };

  /** Dolabın bağlamı: ad ve ölçülerden. */
  function baglam(y, projeMutfak) {
    const m = y.modul;
    const g = y.geo;
    const ad = String(m.ad || '').toLocaleLowerCase('tr');
    if (/lavabo|banyo|aynalı/.test(ad)) return 'banyo';
    if (/ayakkab/.test(ad)) return 'ayakkabi';
    if (/vestiyer|portmanto|antre/.test(ad)) return 'vestiyer';
    if (/komodin|şifonyer/.test(ad)) return 'komodin';
    if (/^tv|tv ünit|asma tv/.test(ad)) return 'tv';
    if (/gardırop|gardirop|giyinme|elbise/.test(ad) || (g.H >= 1700 && g.D >= 500 && g.satirlar.some((s) => s.aski))) return 'gardirop';
    if (/keson|dosya|çalışma|ofis/.test(ad)) return 'ofis';
    if (projeMutfak && (g.D >= 280 || /mutfak|evye|fırın|ocak|üst dolap|alt dolap|kiler|kahve|çatal|şişelik|buzdolab/.test(ad))) return 'mutfak';
    return 'salon';
  }

  /**
   * @param yer      Hesap yerleşim sonucu (yerler)
   * @param secenek  { yogunluk: 'az'|'normal'|'bol', tohum, tur (tasarım türü ipucu), duvarA, duvarB }
   * @returns nesne modülleri (Hesap.yeniModul('nesne_…') biçiminde)
   */
  function uret(yer, secenek) {
    const S = secenek || {};
    const Y = YOGUNLUK[S.yogunluk] || YOGUNLUK.normal;
    const tohum = (S.tohum >>> 0) || 1;
    const NS = Hesap.NESNELER;
    const L = [];
    const sayac = {};
    const adVer = (ad) => { sayac[ad] = (sayac[ad] || 0) + 1; return sayac[ad] > 1 ? `${ad} ${sayac[ad]}` : ad; };
    const yerler = yer.yerler.filter((y) => y.geo && y.duvar !== 'kose' && !y.nesne);
    const projeMutfak = S.tur === 'mutfak' || yerler.some((y) => /evye|fırın|ocak|aspiratör|buzdolab|bulaşık|çatal|şişelik/i.test(y.modul.ad) || (y.geo.ust === 'kusak' && y.geo.H >= 800 && y.geo.H <= 950));
    /** Modül yerel x aralığından duvar konumuna (B duvarında yön terstir) eşya ekler. */
    const ekle = (id, y, a, w, mt, h, d, zGeri, ad) => {
      if (!(w >= 20 && h >= 20 && d >= 10)) return;
      const konum = y.duvar === 'B' ? y.bas + y.W - (a + w) : y.bas + a;
      L.push(Object.assign(Hesap.yeniModul('nesne_' + id), {
        ad: adVer(`Dekor – ${ad || NS[id].ad}`), en: Math.round(w), boy: Math.round(h), nesneD: Math.round(d), konum: Math.round(konum),
        montajYuksekligi: Math.round(mt), duvarMesafe: Math.round(Math.max(0, zGeri)), duvar: y.duvar === 'B' ? 'B' : 'A',
      }));
    };
    /** Bir eşyanın bu yüzeye sığan ölçüsü (raf aralığı h, genişlik w, derinlik d). */
    const olcu = (R, id, w, h, d) => {
      const n = NS[id];
      let ow = Math.min(n.W, w);
      let oh = Math.min(n.H, h);
      let od = Math.min(n.D, d);
      if (id === 'kitap') { oh = Math.min(h, R.sec([190, 220, 240, 270, 300])); ow = Math.min(w, R.sec([180, 240, 300, 380])); od = Math.min(d, R.sec([150, 180, 210])); }
      if (id === 'katli') { ow = Math.min(w, R.sec([260, 300, 340])); oh = Math.min(h - 10, R.sec([150, 200, 260, 320])); od = Math.min(d - 20, 380); }
      if (id === 'saksi') { oh = Math.min(h, R.sec([280, 350, 420])); ow = Math.min(w, oh * 0.6); od = Math.min(d, ow); }
      if (id === 'bardak' || id === 'kavanoz' || id === 'sise') ow = Math.min(w, R.sec([150, 230, 300]));
      if (id === 'ayakkabi') { ow = w; od = Math.min(d, 300); oh = Math.min(h, 150); }
      return { ow, oh, od };
    };
    /** Bir yüzeyi soldan sağa birkaç eşyayla doldurur (aralarında boşluk). */
    const yuzeyDoldur = (R, y, liste, x1, x2, mt, h, dMax, zGeri, adet) => {
      let x = x1 + R.sec([10, 30, 60]);
      for (let k = 0; k < adet && x < x2 - 60; k++) {
        const id = R.sec(liste);
        const { ow, oh, od } = olcu(R, id, x2 - x - 10, h, dMax);
        if (ow < 50 || oh < 40) break;
        // Derin rafta küçük eşyalar arkaya değil biraz öne
        const z = zGeri + Math.max(5, (dMax - od) * R.sec([0.1, 0.3, 0.5]));
        ekle(id, y, x, ow, mt, oh, od, z);
        x += ow + R.sec([40, 70, 110, 160]);
      }
    };

    for (const y of yerler) {
      const g = y.geo;
      const R = rastgele(ozet(`${y.modul.ad}|${Math.round(y.bas)}|${Math.round(y.montaj)}|${y.duvar}`) ^ tohum); // id rastgele: ad ve konumdan
      if (g.panel) {
        // Boşluklar: yatak ve buzdolabı
        if (g.tur === 'bosluk' && /^Yatak boşluğu/.test(y.modul.ad)) {
          const bw = Math.min(g.W - 40, Math.max(900, g.W - 160));
          ekle(bw >= 1200 ? 'yatak_cift' : 'yatak_tek', y, (g.W - bw) / 2, bw, 0, 500, 2000, 25, 'Yatak');
        } else if (g.tur === 'bosluk' && /Buzdolabı/i.test(y.modul.ad) && g.W >= 600) {
          ekle(g.W >= 900 ? 'buzdolabi_genis' : 'buzdolabi', y, 5, g.W - 10, 0, Math.min(1850, g.H || 1850), 650, 0, 'Buzdolabı');
        } else if (g.tur === 'duvar' && (g.kullanim === 'ayna' || g.ledArka) && y.montaj > 300 && R.ihtimal(Y.ust)) {
          // Ayna / ışıklı panel: iki yanında LED aplik
          const amt = y.montaj + g.H / 2 - 300;
          ekle('aplik', y, -170, 60, amt, 600, 90, 0, 'Aplik');
          ekle('aplik', y, g.W + 110, 60, amt, 600, 90, 0, 'Aplik');
        } else if (g.tur === 'raf' && R.ihtimal(Y.yuzey)) {
          // Duvar rafı üstü
          yuzeyDoldur(R, y, RAF_ESYA.salon, 0, g.W, y.montaj + g.H, 280, g.D - 10, 5, Y.adet);
        } else if (g.tur === 'tabla') {
          const ust = y.montaj + g.H;
          const masa = /makyaj/i.test(y.modul.ad) ? ['lamba', 'biblo', 'mum', 'cerceve'] : ['laptop', 'monitor', 'lamba', 'kupa', 'saksi', 'kitap_yatay'];
          yuzeyDoldur(R, y, masa, 40, g.W - 40, ust, 500, Math.min(g.D - 60, 300), 60, Y.adet + 1);
        }
        continue;
      }
      if (g.lkose) continue;
      const bg = baglam(y, projeMutfak);
      const t = g.t;
      const icOn = g.kapakTipi === 'ic' ? g.tk : 0;
      const zArkaIc = g.D - icOn - g.icDerinlik;
      const dMax = g.icDerinlik - 20;
      for (const s of g.satirlar) {
        const camli = s.tip === 'kapak' && /^cam/.test(s.kapakTuru || '');
        for (const b of s.bolumler) {
          const w = b.x2 - b.x1;
          const tabanY = y.montaj + g.hb + s.icAlt;
          // Askı borusu: askıda giysiler
          if (s.aski) {
            const ray = s.icUst - (s.askiUstten || 60);
            const h = Math.min(1150, ray - s.icAlt - 60);
            if (h >= 300 && R.ihtimal(Math.max(0.5, Y.yuzey))) {
              const dolu = R.sec([0.55, 0.7, 0.85]);
              const gw = Math.max(120, (w - 30) * dolu);
              ekle('giysi', y, b.x1 + 15 + (w - 30 - gw) * R.r(), gw, y.montaj + g.hb + ray + 12 - h, h, Math.min(500, g.icDerinlik - 30), zArkaIc + (g.icDerinlik - Math.min(500, g.icDerinlik - 30)) / 2, 'Askıda giysiler');
            }
            continue;
          }
          // Kanca: mont ve çantalar
          if (s.kanca) {
            const ustK = s.icUst - 205;
            const h = Math.min(950, ustK - s.icAlt - 20);
            if (h >= 300 && R.ihtimal(Math.max(0.5, Y.yuzey))) ekle('mont', y, b.x1 + 15, w - 30, y.montaj + g.hb + ustK - h, h, Math.min(260, g.icDerinlik - 90), zArkaIc + 75, 'Kancada mont ve çanta');
            // Kanca nişinin tabanı oturaksa (altında çekmece) minder
            if (s.icAlt >= 300 && s.icAlt <= 560 && w >= 400 && R.ihtimal(0.85)) ekle('minder', y, b.x1 + 10, w - 20, tabanY, 90, Math.min(400, dMax), zArkaIc + Math.max(10, dMax - 400) + 10, 'Oturak minderi');
            continue;
          }
          // Cihaz nişleri (mutfak): yüksekliğe göre buzdolabı, fırın, mikrodalga
          if (s.tip === 'nis') {
            const iw = w - 6;
            if (bg === 'mutfak' || projeMutfak) {
              if (s.icH >= 1600) ekle('buzdolabi', y, b.x1 + 3, iw, tabanY, Math.min(1850, s.icH - 10), Math.min(650, g.D + 60), zArkaIc);
              else if (s.icH >= 560 && s.icH <= 640) ekle('firin', y, b.x1 + 3, iw, tabanY, Math.min(590, s.icH - 4), Math.min(560, g.icDerinlik - 15), zArkaIc + 5);
              else if (s.icH >= 360 && s.icH < 560) ekle('mikrodalga', y, b.x1 + 3, iw, tabanY, Math.min(380, s.icH - 5), Math.min(400, g.icDerinlik - 25), zArkaIc + 20);
              else if (s.icH >= 300 && R.ihtimal(Y.yuzey)) yuzeyDoldur(R, y, ['kahve', 'kettle', 'cay', 'kupa'], b.x1, b.x2, tabanY, s.icH - 20, dMax, zArkaIc + 10, 2);
            } else if (bg === 'tv' && s.icH >= 70 && R.ihtimal(Y.yuzey)) {
              yuzeyDoldur(R, y, ['konsol', 'modem', 'kitap_yatay'], b.x1, b.x2, tabanY, s.icH - 15, dMax, zArkaIc + 10, 2);
            } else if (s.icH >= 150 && R.ihtimal(Y.yuzey)) yuzeyDoldur(R, y, RAF_ESYA.salon, b.x1, b.x2, tabanY, s.icH - 20, dMax, zArkaIc + 10, Y.adet);
            continue;
          }
          // Açık raf ya da camlı vitrin: her raf yüzeyi
          if (!(s.tip === 'acik' || camli) || s.ondenAski || dMax < 100) continue;
          const yuzey = [s.icAlt].concat(s.raflar.map((r) => r + (s.rafTipi === 'cam' ? 4 : t / 2))).sort((a, c) => a - c);
          for (let k = 0; k < yuzey.length; k++) {
            const lv = yuzey[k];
            const ust = k + 1 < yuzey.length ? yuzey[k + 1] - t : s.icUst;
            const h = ust - lv - 25;
            if (h < 80 || w < 100) continue;
            let liste = RAF_ESYA[bg] || RAF_ESYA.salon;
            // Vestiyer / ayakkabılık altındaki alçak açık raflar: ayakkabı
            if ((bg === 'vestiyer' || bg === 'ayakkabi') && h <= 360 && lv < 500) liste = RAF_ESYA.ayakkabi;
            else if (bg === 'vestiyer') liste = ['sepet', 'kutu', 'katli'];
            else if (camli) liste = bg === 'mutfak' ? ['bardak', 'bardak', 'tabak', 'kase'] : ['vazo', 'biblo', 'bardak', 'kitap', 'cerceve'];
            else if (bg === 'komodin' || bg === 'tv') liste = ['kitap_yatay', 'kutu', 'sepet', 'mum', 'konsol'];
            if (liste === RAF_ESYA.ayakkabi) {
              if (R.ihtimal(Math.max(0.6, Y.yuzey))) ekle('ayakkabi', y, b.x1 + 10, w - 20, y.montaj + g.hb + lv, Math.min(160, h), Math.min(300, dMax), zArkaIc + Math.max(5, dMax - 300), 'Ayakkabılar');
              continue;
            }
            if (!R.ihtimal(Y.yuzey)) continue;
            yuzeyDoldur(R, y, liste, b.x1, b.x2, y.montaj + g.hb + lv, h, dMax, zArkaIc + 10, Y.adet);
          }
        }
      }
      // Alçak mobilyanın üstü: mutfak tezgahı, komodin, dresuar, TV ünitesi, ayakkabılık, lavabo
      const ustY = y.montaj + g.H;
      const tezgah = bg === 'mutfak' && y.sira === 'zemin' && g.H < 1000;
      if (g.H <= 1250 && ustY <= 1350 && R.ihtimal(Y.ust)) {
        let liste = UST_ESYA[bg === 'mutfak' ? 'mutfak' : bg === 'komodin' ? 'komodin' : bg === 'banyo' ? 'banyo' : 'salon'];
        if (tezgah && /ocak|fırın altı/i.test(y.modul.ad) && g.W >= 580) {
          ekle('ocak', y, (g.W - Math.min(580, g.W - 20)) / 2, Math.min(580, g.W - 20), ustY, 50, 510, Math.max(20, g.D - 530), 'Ocak');
          liste = null;
        } else if (tezgah && /evye/i.test(y.modul.ad)) liste = ['sise', 'saksi'];
        if (liste) {
          const dUst = Math.min(g.D - (tezgah ? 60 : 40), 420);
          yuzeyDoldur(R, y, liste, 20, g.W - 20, ustY, 600, dUst, (g.D - dUst) / 2, Math.max(1, Y.adet - (g.W < 600 ? 1 : 0)));
        }
      }
      // Asma dresuar / konsol: bir ucunda tavandan sarkıt lamba
      if (/dresuar|konsol/i.test(y.modul.ad) && g.H <= 700 && R.ihtimal(Y.ust * 0.8)) {
        const tavan = S.tavan || 2600;
        const mt = ustY + R.sec([550, 650, 750]);
        if (tavan - mt >= 400) ekle('sarkit', y, R.ihtimal(0.5) ? 60 : g.W - 280, 220, mt, tavan - mt, 220, Math.max(40, g.D / 2 - 110), 'Sarkıt lamba');
      }
      // Gardırop / boy dolap üstünde kutular ve sepetler (tavana yer varsa)
      if (g.H >= 1700 && bg !== 'mutfak' && R.ihtimal(Y.ust * 0.6)) {
        const tavan = S.tavan || 2600;
        const bos = tavan - ustY;
        if (bos >= 200) yuzeyDoldur(R, y, UST_ESYA.gardirop, 30, g.W - 30, ustY, Math.min(320, bos - 30), Math.min(g.D - 60, 400), 30, Y.adet);
      }
    }

    // TV ünitesi: duvara televizyon (asma dolaplarla çakışmayan en büyüğü) ve soundbar
    const tvler = yerler.filter((y) => !y.geo.panel && baglam(y, projeMutfak) === 'tv');
    if (tvler.length) {
      const R = rastgele(tohum ^ 0x7f4a7c15);
      const x1 = Math.min(...tvler.map((y) => y.bas));
      const x2 = Math.max(...tvler.map((y) => y.bas + y.W));
      const ust = Math.max(...tvler.map((y) => y.montaj + y.geo.H));
      const orta = (x1 + x2) / 2;
      const mt = Math.round(ust + R.sec([180, 220, 260]));
      const asmalar = yer.yerler.filter((y) => y.sira === 'duvar' && y.geo && !y.geo.panel && !y.nesne);
      const bos = (k) => asmalar.every((a) => a.bas >= orta + NS[k].W / 2 + 40 || a.bas + a.W <= orta - NS[k].W / 2 - 40 || a.montaj >= mt + NS[k].H + 40);
      const id = ['tv75', 'tv65', 'tv55'].find((k) => NS[k].W <= (x2 - x1) * 0.8 && bos(k));
      if (id) L.push(Object.assign(Hesap.yeniModul('nesne_' + id), { ad: `Dekor – ${NS[id].ad}`, konum: Math.round(orta - NS[id].W / 2), montajYuksekligi: mt, duvarMesafe: 30, duvar: tvler[0].duvar === 'B' ? 'B' : 'A' }));
      if (x2 - x1 >= 1000 && R.ihtimal(0.6)) L.push(Object.assign(Hesap.yeniModul('nesne_soundbar'), { ad: 'Dekor – Soundbar', konum: Math.round(orta - 450), montajYuksekligi: Math.round(ust), duvarMesafe: 120, duvar: tvler[0].duvar === 'B' ? 'B' : 'A' }));
    }

    // Boş duvar uçlarına büyük saksı bitkisi; alçak mobilyanın üstündeki boş duvara tablo
    const R2 = rastgele(tohum ^ 0x2545f491);
    for (const duvar of ['A', 'B']) {
      const uzun = duvar === 'A' ? S.duvarA || yer.duvarA : S.duvarB || yer.duvarB;
      const zem = yerler.filter((y) => (y.duvar === duvar || (duvar === 'A' && yer.tip !== 'L')) && y.sira === 'zemin' && !(y.geo.panel && y.geo.tur === 'bosluk'));
      if (!zem.length || !(uzun > 0)) continue;
      const son = Math.max(...zem.map((y) => y.bas + y.W));
      const ilk = Math.min(...zem.map((y) => y.bas));
      const sanal = { duvar, bas: 0, W: uzun };
      if (uzun - son >= 450 && R2.ihtimal(Y.ust)) ekle('bitki_buyuk', sanal, son + Math.min(150, (uzun - son - 450) / 2), 450, 0, 1300, 450, 40, 'Büyük saksı bitkisi');
      if (ilk >= 450 && R2.ihtimal(Y.ust * 0.7)) ekle('bitki_buyuk', sanal, Math.max(0, ilk - 600), 450, 0, 1300, 450, 40, 'Büyük saksı bitkisi');
      for (const y of zem) {
        if (y.geo.panel || y.geo.H > 1100 || y.W < 700 || !R2.ihtimal(Y.ust * 0.6)) continue;
        if (baglam(y, projeMutfak) === 'mutfak' || baglam(y, projeMutfak) === 'tv') continue;
        const ust = y.montaj + y.geo.H;
        const tw = Math.min(y.W * 0.7, R2.sec([600, 800, 1000]));
        const th = R2.sec([500, 600, 700]);
        const mt = ust + R2.sec([350, 450]);
        const x = y.bas + (y.W - tw) / 2;
        const ustteVar = yer.yerler.some((o) => o !== y && !o.nesne && (o.duvar === y.duvar || o.duvar === 'kose') && o.bas < x + tw && o.bas + o.W > x && o.montaj < mt + th && o.montaj + (o.geo ? o.geo.H : 0) > mt);
        if (!ustteVar) ekle(R2.ihtimal(0.6) ? 'tablo' : 'ayna_duvar', sanal, x, tw, mt, th, 30, 0);
      }
    }
    return L;
  }

  /** Eşyaların 3B kutuları başka parçalarla ya da birbirleriyle iç içe mi? İç içe olanların adları. */
  function cakismalar(yer, adaylar) {
    const Uc = (typeof self !== 'undefined' && self.Uc) || (typeof require === 'function' ? require('./uc.js') : null);
    if (!Uc) return new Set();
    const P = Uc.projeParcalari(yer, {}).map((p) => ({ p, b: [0, 1, 2].map((k) => [Math.min(...p.k.map((q) => q[k])), Math.max(...p.k.map((q) => q[k]))]) }));
    const ic = (a, b) => [0, 1, 2].every((k) => Math.min(a[k][1], b[k][1]) - Math.max(a[k][0], b[k][0]) > 1);
    const kotu = new Set();
    // Yalnız yeni eklenen süsler elenir; projedeki eşyalar engel sayılır
    const dek = P.filter((x) => x.p.tur === 'nesne' && (!adaylar || adaylar.has(x.p.modul)));
    for (const a of dek) {
      if (kotu.has(a.p.modul)) continue;
      for (const b of P) {
        if (b === a || b.p.modul === a.p.modul || kotu.has(b.p.modul)) continue; // atılan süs engel değil
        if (ic(a.b, b.b)) { kotu.add(a.p.modul); break; }
      }
    }
    return kotu;
  }

  /**
   * Süslenmiş yerleşim: proje sonucu + eşyalar (eşyalar yerleşimi değiştirmez; konumları doğrudan verilir).
   * @returns { yerlesim, moduller } — moduller: eklenen eşya modülleri (çakışanlar atılmış)
   */
  function susle(proje, sonuc, secenek) {
    const yer = sonuc.yerlesim;
    let moduller = uret(yer, Object.assign({ tavan: yer.tavan || (proje.yerlesim && proje.yerlesim.tavan) }, secenek));
    const yerOf = (m) => {
      const g = Hesap.modulHesapla(m, proje.ayarlar).geo;
      const mt = Number(m.montajYuksekligi) || 0;
      return { modul: m, kaynak: m, duvar: yer.tip === 'L' ? m.duvar : 'A', sira: mt > 600 ? 'duvar' : 'zemin', bas: Number(m.konum) || 0, W: g.W, D: g.D, montaj: mt, geo: g, nesne: true };
    };
    let ek = moduller.map(yerOf);
    const birlesik = () => Object.assign({}, yer, { yerler: yer.yerler.concat(ek) });
    const kotu = cakismalar(birlesik(), new Set(moduller.map((m) => m.ad)));
    if (kotu.size) {
      moduller = moduller.filter((m) => !kotu.has(m.ad));
      ek = ek.filter((y) => !kotu.has(y.modul.ad));
    }
    return { yerlesim: birlesik(), moduller };
  }

  return { uret, susle, cakismalar, YOGUNLUK, baglam };
});

/*
 * Delik planı: bir dolabın parçalarındaki delik ve kanal koordinatları.
 * Koordinatlar parçanın görünen yüzünde, sol-alt köşeden mm:
 *  - Yan ve dikmeler: x ön kenardan arkaya, y alt kenardan yukarı (iç yüzden bakış).
 *  - Tablalar, ara tabla, sabit raf: x sol uçtan, y ön kenardan (üst yüzden bakış).
 *  - Kapak ve çekmece önü: x sol kenardan, y alt kenardan (önden bakış; menteşe çanakları iç yüzde).
 * Delik türleri: baglanti (bağlantı elemanı), pim (raf pimi), mentese (çanak), plaka (menteşe plakası),
 * ray (ray vidası), kulp, kanal (arkalık kanalı çizgisi).
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Delik = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const r1 = (x) => Math.round(x * 10) / 10;
  const ICERI = 37; // 32 mm sistemde ön ve arka kenardan standart mesafe

  /** Bağlantı elemanının yan/dikme yüzündeki ve tabla ucundaki delikleri. */
  const BAGLANTI = {
    minifix: { yuz: { cap: 5, derinlik: 12, ad: 'Minifix pimi Ø5' }, uc: { cap: 8, derinlik: 34, ad: 'Pim geçişi Ø8 (uçtan)' }, canak: { cap: 15, derinlik: 13, ad: 'Minifix gövdesi Ø15', mesafe: 34 } },
    konfirmat: { yuz: { cap: 7, derinlik: 0, ad: 'Konfirmat Ø7 (boydan, havşalı)' }, uc: { cap: 5, derinlik: 50, ad: 'Konfirmat kılavuz Ø5 (uçtan)' } },
    kavela: { yuz: { cap: 8, derinlik: 12, ad: 'Kavela Ø8' }, uc: { cap: 8, derinlik: 25, ad: 'Kavela Ø8 (uçtan)' } },
    seffaf_kose: { isaret: 'Şeffaf köşe bağlantı yeri (4 vida Ø3 kılavuz)' },
    seffaf_t: { isaret: 'Şeffaf T bağlantı yeri (4 vida Ø3 kılavuz)' },
  };

  /** Derinlik boyunca bağlantı konumları (ön ve arka kenardan 37 mm; derin parçada ortada da). */
  function derinlikKonumlari(z0, z1, derinlik) {
    const L = [z0 + ICERI, z1 - ICERI];
    if (derinlik >= 350) L.splice(1, 0, (z0 + z1) / 2);
    return L.filter((z, i, a) => z > z0 && z < z1 && (i === 0 || z - a[i - 1] > 20));
  }

  /** Minifix yanındaki kavelanın konumları: pim + 32, başka bağlantıyla çakışmıyorsa. */
  function kavelaKonumlari(konumlar, z1) {
    return konumlar.map((z) => z + 32).filter((k) => k < z1 - 20 && konumlar.every((z) => Math.abs(z - k) > 20));
  }

  function mentesheKonumlari(h, adet) {
    const uc = h < 400 ? Math.max(50, h * 0.2) : 100;
    if (adet <= 1) return [h / 2];
    const L = [];
    for (let i = 0; i < adet; i++) L.push(uc + (i * (h - 2 * uc)) / (adet - 1));
    return L;
  }
  function mentesheAdedi(h) {
    if (h <= 900) return 2;
    if (h <= 1600) return 3;
    if (h <= 2000) return 4;
    return 5;
  }

  /**
   * @param modul  proje modülü
   * @param sonuc  Hesap.modulHesapla sonucu
   * @param ayar   proje ayarları
   * @returns { destek, mesaj, parcalar: [{ ad, kaynak, w, h, eksen, delikler, kanallar, notlar }] }
   */
  function delikPlani(modul, sonuc, ayar) {
    const g = sonuc && sonuc.geo;
    if (!g) return { destek: false, mesaj: 'Geçerli ölçü yok.', parcalar: [] };
    if (g.lkose) return { destek: false, mesaj: 'L köşe dolap için ayrıntılı delik planı henüz yok; parça notlarını kullanın.', parcalar: [] };
    if (g.panel) return { destek: false, mesaj: 'Tek parça panelde bağlantı delikleri montaj yerine göre açılır.', parcalar: [] };

    const HS = sonuc.hirdavatSecimi;
    const govdeTur = HS.baglanti;
    const araTur = HS.araBaglanti === 'ayni' ? (HS.baglanti === 'seffaf_kose' ? 'seffaf_t' : HS.baglanti) : HS.araBaglanti;
    const { t, Ds, W, hb } = g;
    const tablaBoydan = g.yapi === 'tabla_boydan';
    const icOn = g.kapakTipi === 'ic' || g.surgu ? g.tk : 0;
    const icSon = icOn + g.icDerinlik;
    const kusakEn = Number(ayar.kusakGenisligi) || 100;
    const kanalGeri = Number(ayar.arkalikGeriPay) || 10;
    const HcSol = g.egim ? g.egim.HcL : g.Hc;
    const HcSag = g.egim ? g.egim.HcR : g.Hc;

    const parcalar = [];
    const yeniParca = (ad, kaynak, w, h, eksen) => {
      const p = { ad, kaynak, w: r1(w), h: r1(h), eksen, delikler: [], kanallar: [], notlar: [] };
      parcalar.push(p);
      return p;
    };
    const delik = (p, tur, x, y, cap, derinlik, ad, yuz) => {
      if (x < -0.5 || y < -0.5 || x > p.w + 0.5 || y > p.h + 0.5) return;
      p.delikler.push({ tur, x: r1(x), y: r1(y), cap, derinlik, ad, yuz: yuz || '' });
    };

    // ---------- Dikey parçalar: sol yan, sağ yan, bölme dikmeleri ----------
    // Her dikey yüzün hangi bölmeye baktığı: sol yanın iç yüzü → ilk bölmenin solu, vb.
    const yuzler = [];
    const solYanH = tablaBoydan ? HcSol - 2 * t : HcSol;
    const sagYanH = tablaBoydan ? HcSag - 2 * t : HcSag;
    const solYan = yeniParca(g.egim ? 'Sol yan' : 'Yan (sol)', g.egim ? 'Sol yan' : 'Yan', Ds, solYanH, 'x: ön kenardan · y: alt kenardan (iç yüz)');
    const sagYan = yeniParca(g.egim ? 'Sağ yan' : 'Yan (sağ)', g.egim ? 'Sağ yan' : 'Yan', Ds, sagYanH, 'x: ön kenardan · y: alt kenardan (iç yüz)');
    const yanY0 = tablaBoydan ? t : 0;
    yuzler.push({ parca: solYan, sutun: 0, taraf: 'sol', y0: yanY0, z0: 0, yuz: 'iç yüz' });
    g.dikmeX.forEach((dx, k) => {
      const ad = `Bölme dikmesi ${k + 1}`;
      const dik = yeniParca(ad, g.egim ? `Bölme dikmesi (boydan) ${k + 1}` : 'Bölme dikmesi (boydan)', g.icDerinlik, g.Hc - 2 * t, 'x: ön kenardan · y: alt kenardan');
      dik.dx = dx;
      yuzler.push({ parca: dik, sutun: k, taraf: 'sag', y0: t, z0: icOn, yuz: 'sol yüz' });
      yuzler.push({ parca: dik, sutun: k + 1, taraf: 'sol', y0: t, z0: icOn, yuz: 'sağ yüz' });
    });
    yuzler.push({ parca: sagYan, sutun: g.sutunlar.length - 1, taraf: 'sag', y0: yanY0, z0: 0, yuz: 'iç yüz' });

    // Bağlantı deliği: yan/dikme yüzüne yatay bir panelin ucu bağlanır
    const yuzBaglanti = (f, tur, yc, z0, z1) => {
      const b = BAGLANTI[tur] || BAGLANTI.minifix;
      const konumlar = derinlikKonumlari(z0, z1, z1 - z0);
      const y = yc - f.y0;
      for (const z of konumlar) {
        if (b.isaret) delik(f.parca, 'baglanti', z - f.z0, y, 3, 0, b.isaret, f.yuz);
        else delik(f.parca, 'baglanti', z - f.z0, y, b.yuz.cap, b.yuz.derinlik, b.yuz.ad, f.yuz);
      }
      if (tur === 'minifix') for (const k of kavelaKonumlari(konumlar, z1)) delik(f.parca, 'baglanti', k - f.z0, y, 8, 12, 'Kavela Ø8', f.yuz);
    };

    for (const f of yuzler) {
      const sutun = g.sutunlar[f.sutun];
      const kenarFace = f.parca === solYan || f.parca === sagYan;
      // Alt / üst tabla (yalnızca yanlar; yanlar boydan yapıda tablalar yanın yüzüne bağlanır)
      if (kenarFace && !tablaBoydan) {
        yuzBaglanti(f, govdeTur, t / 2, 0, Ds);
        if (g.ust === 'kusak') {
          yuzBaglanti(f, govdeTur, (f.taraf === 'sol' ? HcSol : HcSag) - t / 2, 0, kusakEn);
          yuzBaglanti(f, govdeTur, (f.taraf === 'sol' ? HcSol : HcSag) - t / 2, Ds - kusakEn, Ds);
        } else yuzBaglanti(f, govdeTur, (f.taraf === 'sol' ? HcSol : HcSag) - t / 2, 0, Ds);
      }
      // Ara tablalar ve sabit raflar bu yüzün bölmesinde
      for (const b of sutun.sinirlar) if (b.panel) yuzBaglanti(f, araTur, b.y, icOn, icSon);
      for (const sat of sutun.satirlar) {
        const ilk = sat.bolumler[0];
        const son = sat.bolumler[sat.bolumler.length - 1];
        const bolumBuYuzde = f.taraf === 'sol' ? ilk : son;
        if (!bolumBuYuzde) continue;
        // Raflar: sabit → bağlantı, hareketli → pim sırası (±32 ayar payıyla)
        for (const ry of sat.raflar) {
          if (sat.rafSabit) yuzBaglanti(f, araTur, ry, icOn, icSon);
          else {
            for (const z of [icOn + ICERI, icSon - ICERI]) {
              for (const d of [-32, 0, 32]) delik(f.parca, 'pim', z - f.z0, ry + d - f.y0, 5, 10, 'Raf pimi Ø5', f.yuz);
            }
          }
        }
        // Ray vidaları (bu yüze bakan bölümdeki çekmeceler)
        const cekmeceler = sat.cekmeceler.filter((c) => (f.taraf === 'sol' ? Math.abs(c.x1 - ilk.x1) < 30 : Math.abs(c.x2 - son.x2) < 30));
        for (const c of cekmeceler) {
          const y = c.y1 + 22 - f.y0;
          const L = c.L || 400;
          for (const z of [icOn + ICERI, icOn + Math.max(ICERI + 64, L - 32)]) delik(f.parca, 'ray', z - f.z0, y, 4, 10, 'Ray vidası Ø4 (ray ekseni kutu tabanı +22)', f.yuz);
        }
        if ((sat.icCekmeceler || []).length) f.parca.notlar.push('İç çekmece rayları dolgu paneline takılır; dolgu paneli bu yüze vidalanır.');
        // Menteşe montaj plakaları: bu yüzde menteşelenen kapaklar
        if (sat.tip === 'kapak' && sat.acilim === 'yana' && !g.surgu) {
          const o = f.taraf === 'sol' ? sat.onler[0] : sat.onler[sat.onler.length - 1];
          if (o && (f.taraf === 'sol' ? o.menteseSol : !o.menteseSol)) {
            const h = sat.on.y2 - sat.on.y1;
            for (const pos of mentesheKonumlari(h, mentesheAdedi(h))) {
              const yc = sat.on.y2 - pos - f.y0;
              for (const d of [-16, 16]) delik(f.parca, 'plaka', ICERI + icOn - f.z0, yc + d, 5, 12, 'Menteşe plakası Ø5', f.yuz);
            }
          }
        }
      }
      // Arkalık kanalı (yanlarda)
      if (kenarFace && g.arkalik === 'kanal') f.parca.kanallar.push({ x1: r1(Ds - kanalGeri - g.ta), x2: r1(Ds - kanalGeri), y1: 0, y2: f.parca.h, ad: `Arkalık kanalı ${g.ta}×${Number(ayar.arkalikKanalDerinligi) || 8} mm` });
      // Tablalar boydan: yanın alt/üst kenarından bağlantı
      if (kenarFace && tablaBoydan) f.parca.notlar.push(`Yan, tablaların arasına oturur: alt ve üst kenarlara ${(BAGLANTI[govdeTur] && BAGLANTI[govdeTur].uc ? BAGLANTI[govdeTur].uc.ad : 'bağlantı')} ön/arka kenardan ${ICERI} mm.`);
    }

    // ---------- Yatay parçalar: alt/üst tabla, ara tabla, sabit raf ----------
    const tablaDelikleri = (p, tur, uzunluk, z0, z1, ucNot) => {
      const b = BAGLANTI[tur] || BAGLANTI.minifix;
      const konumlar = derinlikKonumlari(z0, z1, z1 - z0);
      if (tur === 'minifix') {
        for (const k of kavelaKonumlari(konumlar, z1)) {
          delik(p, 'baglanti', 0, k - z0, 8, 25, 'Kavela Ø8 (uçtan)', 'sol uç');
          delik(p, 'baglanti', uzunluk, k - z0, 8, 25, 'Kavela Ø8 (uçtan)', 'sağ uç');
        }
      }
      for (const z of konumlar) {
        const y = z - z0;
        if (b.isaret) {
          delik(p, 'baglanti', 20, y, 3, 0, b.isaret, 'alt yüz');
          delik(p, 'baglanti', uzunluk - 20, y, 3, 0, b.isaret, 'alt yüz');
          continue;
        }
        delik(p, 'baglanti', 0, y, b.uc.cap, b.uc.derinlik, b.uc.ad, 'sol uç');
        delik(p, 'baglanti', uzunluk, y, b.uc.cap, b.uc.derinlik, b.uc.ad, 'sağ uç');
        if (b.canak) {
          delik(p, 'baglanti', b.canak.mesafe, y, b.canak.cap, b.canak.derinlik, b.canak.ad, 'alt yüz');
          delik(p, 'baglanti', uzunluk - b.canak.mesafe, y, b.canak.cap, b.canak.derinlik, b.canak.ad, 'alt yüz');
        }
      }
      if (ucNot) p.notlar.push(ucNot);
    };
    const iw = W - 2 * t;
    if (!tablaBoydan) {
      const alt = yeniParca('Alt tabla', 'Alt tabla', iw, Ds, 'x: sol uçtan · y: ön kenardan (üst yüz)');
      tablaDelikleri(alt, govdeTur, iw, 0, Ds);
      if (g.ust !== 'kusak' && !g.egim) {
        const ust = yeniParca('Üst tabla', 'Üst tabla', iw, Ds, 'x: sol uçtan · y: ön kenardan (alt yüz)');
        tablaDelikleri(ust, govdeTur, iw, 0, Ds);
      } else if (g.ust === 'kusak') {
        for (const ad of ['Ön kuşak', 'Arka kuşak']) tablaDelikleri(yeniParca(ad, ad, iw, kusakEn, 'x: sol uçtan · y: ön kenardan'), govdeTur, iw, 0, kusakEn);
      }
      // Bölme dikmeleri tablalara alttan/üstten bağlanır
      for (const dx of g.dikmeX) {
        for (const p of parcalar.filter((x) => x.ad === 'Alt tabla' || x.ad === 'Üst tabla')) {
          const b = BAGLANTI[araTur] || BAGLANTI.minifix;
          for (const z of derinlikKonumlari(icOn, icSon, g.icDerinlik)) {
            if (b.isaret) delik(p, 'baglanti', dx - t + t / 2, z, 3, 0, b.isaret, 'iç yüz');
            else delik(p, 'baglanti', dx - t + t / 2, z, b.yuz.cap, b.yuz.derinlik, `${b.yuz.ad} (bölme dikmesi)`, 'iç yüz');
          }
        }
      }
    } else {
      const alt = yeniParca('Alt tabla', 'Alt tabla', W, Ds, 'x: sol uçtan · y: ön kenardan (üst yüz)');
      const ust = g.egim ? null : yeniParca('Üst tabla', 'Üst tabla', W, Ds, 'x: sol uçtan · y: ön kenardan (alt yüz)');
      const b = BAGLANTI[govdeTur] || BAGLANTI.minifix;
      for (const p of [alt, ust].filter(Boolean)) {
        for (const z of derinlikKonumlari(0, Ds, Ds)) {
          for (const x of [t / 2, W - t / 2]) {
            if (b.isaret) delik(p, 'baglanti', x, z, 3, 0, b.isaret, 'iç yüz');
            else delik(p, 'baglanti', x, z, b.yuz.cap, b.yuz.derinlik, b.yuz.ad, 'iç yüz');
          }
        }
      }
    }
    g.sutunlar.forEach((c, si) => {
      const cw = c.x2 - c.x1;
      const araSayi = c.sinirlar.filter((b) => b.panel).length;
      if (araSayi) {
        const p = yeniParca(g.sutunlar.length > 1 ? `Ara tabla (bölme ${si + 1})` : 'Ara tabla (sabit raf)', g.sutunlar.length > 1 ? `Ara tabla (bölme ${si + 1})` : 'Ara tabla (sabit raf)', cw, g.icDerinlik, 'x: sol uçtan · y: ön kenardan');
        p.adet = araSayi;
        tablaDelikleri(p, araTur, cw, icOn, icSon);
      }
      const sabitRaflar = c.satirlar.filter((s) => s.rafSabit && s.raflar.length);
      for (const s of sabitRaflar) {
        const w = s.bolumler[0].x2 - s.bolumler[0].x1;
        const p = yeniParca('Sabit raf', 'Sabit raf', w, g.icDerinlik, 'x: sol uçtan · y: ön kenardan');
        p.adet = s.raflar.length * s.bolumler.length;
        tablaDelikleri(p, araTur, w, icOn, icSon);
      }
    });

    // ---------- Ön yüzler: kapaklar ve çekmece önleri ----------
    const satirAdi = (sat) => (g.sutunlar.length > 1 ? `bölme ${sat.sutun + 1}, satır ${g.sutunlar[sat.sutun].satirlar.indexOf(sat) + 1}` : `satır ${g.sutunlar[sat.sutun].satirlar.indexOf(sat) + 1}`);
    for (const sat of g.satirlar) {
      if (g.surgu || !sat.onler.length || sat.sahteOn) continue;
      const h = sat.on.y2 - sat.on.y1;
      sat.onler.forEach((o, k) => {
        const w = o.x2 - o.x1;
        const kapak = sat.tip === 'kapak';
        const yan = sat.onler.length > 1 ? (k === 0 ? ' – sol' : k === sat.onler.length - 1 ? ' – sağ' : ` – ${k + 1}`) : '';
        const ad = `${kapak ? 'Kapak' : 'Çekmece önü'} (${satirAdi(sat)})${yan}`;
        const p = yeniParca(ad, `${kapak ? 'Kapak' : 'Çekmece önü'} (${satirAdi(sat)})`, w, h, 'x: sol kenardan · y: alt kenardan (önden bakış)');
        if (kapak && sat.acilim === 'yana') {
          for (const pos of mentesheKonumlari(h, mentesheAdedi(h))) {
            delik(p, 'mentese', o.menteseSol ? 22.5 : w - 22.5, h - pos, 35, 12.5, 'Menteşe çanağı Ø35 (iç yüz)', 'iç yüz');
          }
        } else if (kapak && sat.acilim === 'yukari') {
          for (const x of [w * 0.2, w * 0.8]) delik(p, 'mentese', x, h - 22.5, 35, 12.5, 'Menteşe çanağı Ø35 (iç yüz, üst kenar)', 'iç yüz');
        } else if (kapak && sat.acilim === 'asagi') {
          for (const x of [w * 0.2, w * 0.8]) p.notlar.push(`Klapa menteşesi alt kenarda, soldan ${r1(x)} mm (menteşe kataloğuna göre frezelenir).`);
        }
        if (o.kulp) for (const d of o.kulp.delikler) delik(p, 'kulp', d.x, d.y, 5, 0, 'Kulp Ø5 (boydan)', 'ön yüz');
        if (!kapak) p.notlar.push('Çekmece kutusuna içten 4 vida ile bağlanır (ayar için öne bağlantı aparatı kullanılabilir).');
        if (o.y2sol != null) p.notlar.push(`Yamuk kapak: sol kenar ${r1(o.y2sol - sat.on.y1)}, sağ kenar ${r1(o.y2sag - sat.on.y1)} mm; delikler dikdörtgen kısma göre.`);
      });
    }

    // Boş parça listesinden yalnızca delik/kanal/notu olanlar
    const dolu = parcalar.filter((p) => p.delikler.length || p.kanallar.length || p.notlar.length);
    for (const p of dolu) {
      const tur = {};
      for (const d of p.delikler) tur[d.ad] = (tur[d.ad] || 0) + 1;
      p.ozet = Object.entries(tur).map(([a, n]) => `${n} × ${a}`);
    }
    return { destek: true, mesaj: '', parcalar: dolu, eksenNotu: `Bağlantı noktaları ön/arka kenardan ${ICERI} mm (32 mm sistem); derin parçalarda ortada da.` };
  }

  return { delikPlani, BAGLANTI, derinlikKonumlari };
});

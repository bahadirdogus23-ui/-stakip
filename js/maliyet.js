/*
 * Fiyat ve maliyet hesabı.
 * Girdi: proje, projeHesapla() sonucu ve malzeme başına kullanılan plaka sayısı.
 * Çıktı: kalem kalem maliyet, modül başına maliyet dağılımı, kâr, KDV ve teklif satırları.
 * Tüm tutarlar TL, kuruş hassasiyetinde yuvarlanır.
 */
(function (root, factory) {
  const api = factory(root.Hesap || (typeof require === 'function' ? require('./hesap.js') : null));
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Maliyet = api;
})(typeof self !== 'undefined' ? self : this, function (Hesap) {
  'use strict';

  const kurus = (x) => Math.round((Number(x) || 0) * 100) / 100;
  const sayi = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

  /** Bir hırdavat kaleminin birim fiyatı: kullanıcı fiyatı, yoksa katalog örnek fiyatı. */
  function hirdavatFiyati(ayar, kod) {
    const F = ayar.fiyat || {};
    if (F.hirdavat && F.hirdavat[kod] != null) return sayi(F.hirdavat[kod]);
    const k = Hesap.HIRDAVAT_KALEMLERI[kod];
    return k ? k.fiyat : 0;
  }

  /**
   * @param proje
   * @param sonuc       Hesap.projeHesapla(proje)
   * @param plakaSayisi { malzemeId: kullanılan plaka adedi } (Yerlesim.projeYerlesimi'nden)
   */
  function maliyetHesapla(proje, sonuc, plakaSayisi) {
    const A = proje.ayarlar;
    const F = A.fiyat;
    const bantCarpan = 1 + sayi(F.bantFire) / 100;
    const kalemler = { malzeme: [], hirdavat: [], hizmet: [], iscilik: [], montaj: [], diger: [] };
    const eksikFiyat = [];

    // ---------- Plaka malzeme, işlem (boya vb.), bant ----------
    const malzemeBirim = {}; // malzemeId -> { m2BasiMaliyet, bantMBasiMaliyet } modül dağıtımı için
    for (const o of sonuc.ozet) {
      const m = Hesap.malzemeBul(A, o.malzemeId);
      if (!m) continue;
      // Cam/ayna: plaka yok, net alan × m² fiyatı (işlem fiyatı alanında tutulur)
      const cam = Hesap.camMi(m);
      const plakaM2 = (sayi(m.plakaUzun) * sayi(m.plakaKisa)) / 1e6;
      const tamPlaka = cam ? 0 : sayi(plakaSayisi[o.malzemeId]);
      const alanPlaka = !cam && plakaM2 > 0 ? (o.alanM2 * (1 + sayi(F.alanFire) / 100)) / plakaM2 : 0;
      const plaka = F.plakaHesabi === 'alan' ? alanPlaka : tamPlaka;
      const plakaTutar = kurus(plaka * sayi(m.plakaFiyati));
      const islemTutar = kurus(o.alanM2 * sayi(m.islemFiyatiM2));
      const bantM = o.bantM * bantCarpan;
      const bantTutar = kurus(bantM * sayi(m.bantFiyati));
      if (plaka > 0 && !(sayi(m.plakaFiyati) > 0)) eksikFiyat.push(`${m.ad} plaka fiyatı`);
      if (cam && o.alanM2 > 0 && !(sayi(m.islemFiyatiM2) > 0)) eksikFiyat.push(`${m.ad} m² fiyatı`);
      if (bantM > 0 && !(sayi(m.bantFiyati) > 0)) eksikFiyat.push(`${m.ad} bant fiyatı`);
      kalemler.malzeme.push({
        malzemeId: m.id, ad: m.ad, cam,
        plaka: Math.round(plaka * 100) / 100, plakaFiyati: sayi(m.plakaFiyati), plakaTutar,
        alanM2: o.alanM2, islemFiyatiM2: sayi(m.islemFiyatiM2), islemTutar,
        bantM: Math.round(bantM * 10) / 10, bantFiyati: sayi(m.bantFiyati), bantTutar,
        tutar: kurus(plakaTutar + islemTutar + bantTutar),
      });
      // Hizmet: ebatlama her zaman gerçek plaka sayısıyla, bant çekme metreyle
      const ebatlama = kurus(tamPlaka * sayi(F.ebatlamaPlaka));
      const bantCekme = kurus(bantM * sayi(F.bantCekmeM));
      if (ebatlama > 0) kalemler.hizmet.push({ ad: `Ebatlama – ${m.ad}`, miktar: tamPlaka, birim: 'plaka', birimFiyat: sayi(F.ebatlamaPlaka), tutar: ebatlama, malzemeId: m.id, tur: 'ebatlama' });
      if (bantCekme > 0) kalemler.hizmet.push({ ad: `Bant çekme – ${m.ad}`, miktar: Math.round(bantM * 10) / 10, birim: 'm', birimFiyat: sayi(F.bantCekmeM), tutar: bantCekme, malzemeId: m.id, tur: 'bant' });
      // Şekilli kesim (CNC/şablon) hizmeti: eğri ve eğik kenar metresi
      const sekilliKesim = kurus(sayi(o.sekilliKenarM) * sayi(F.sekilliKesimM));
      if (sekilliKesim > 0) kalemler.hizmet.push({ ad: `Şekilli kesim (CNC) – ${m.ad}`, miktar: Math.round(sayi(o.sekilliKenarM) * 10) / 10, birim: 'm', birimFiyat: sayi(F.sekilliKesimM), tutar: sekilliKesim, malzemeId: m.id, tur: 'sekil' });
      malzemeBirim[m.id] = {
        m2: o.alanM2 > 0 ? (plakaTutar + islemTutar + ebatlama) / o.alanM2 : 0,
        bantM: o.bantM > 0 ? (bantTutar + bantCekme) / o.bantM : 0,
      };
    }

    // ---------- Hırdavat ----------
    for (const h of sonuc.hirdavat) {
      const birimFiyat = hirdavatFiyati(A, h.kod);
      const katalog = Hesap.HIRDAVAT_KALEMLERI[h.kod];
      if (!(birimFiyat > 0)) eksikFiyat.push(`${katalog ? katalog.ad : h.ad} fiyatı`);
      kalemler.hirdavat.push({
        kod: h.kod, ad: h.ad, adet: h.adet, birim: h.birim,
        fiyatMiktari: h.fiyatMiktari, fiyatBirimi: katalog ? katalog.birim : h.birim,
        birimFiyat, tutar: kurus(h.fiyatMiktari * birimFiyat),
      });
    }

    // ---------- Yerinde montaj hırdavatı (birleştirme, askı, devrilme önleyici) ----------
    for (const h of sonuc.montajHirdavat || []) {
      const birimFiyat = hirdavatFiyati(A, h.kod);
      const katalog = Hesap.HIRDAVAT_KALEMLERI[h.kod];
      if (!(birimFiyat > 0)) eksikFiyat.push(`${katalog ? katalog.ad : h.ad} fiyatı`);
      kalemler.montaj.push({ kod: h.kod, ad: h.ad, adet: h.adet, birim: h.birim, fiyatMiktari: h.fiyatMiktari, fiyatBirimi: katalog ? katalog.birim : h.birim, birimFiyat, tutar: kurus(h.fiyatMiktari * birimFiyat) });
    }

    // ---------- İşçilik ----------
    // Dolap işçiliği yalnızca gövdeli modüllere; tek parça paneller ayrı (düşük) birim fiyatla
    const adetOf = (m) => Math.max(1, Math.floor(sayi(m.adet) || 1));
    const modulAdedi = proje.moduller.filter((m) => m.tip !== 'panel').reduce((a, m) => a + adetOf(m), 0);
    const panelAdedi = proje.moduller.filter((m) => m.tip === 'panel').reduce((a, m) => a + adetOf(m), 0);
    if (modulAdedi && sayi(F.atolyeIscilikModul) > 0) kalemler.iscilik.push({ ad: 'Atölye işçiliği', miktar: modulAdedi, birim: 'modül', birimFiyat: sayi(F.atolyeIscilikModul), tutar: kurus(modulAdedi * sayi(F.atolyeIscilikModul)) });
    if (modulAdedi && sayi(F.montajModul) > 0) kalemler.iscilik.push({ ad: 'Montaj (yerinde kurulum)', miktar: modulAdedi, birim: 'modül', birimFiyat: sayi(F.montajModul), tutar: kurus(modulAdedi * sayi(F.montajModul)) });
    if (panelAdedi && sayi(F.panelIscilik) > 0) kalemler.iscilik.push({ ad: 'Panel işçiliği ve montajı', miktar: panelAdedi, birim: 'panel', birimFiyat: sayi(F.panelIscilik), tutar: kurus(panelAdedi * sayi(F.panelIscilik)) });

    // ---------- Proje geneli: nakliye ve ek kalemler ----------
    if (sayi(F.nakliye) > 0) kalemler.diger.push({ ad: 'Nakliye', tutar: kurus(F.nakliye) });
    for (const e of F.ekKalemler || []) if (sayi(e.tutar) > 0) kalemler.diger.push({ ad: e.ad || 'Ek kalem', tutar: kurus(e.tutar) });

    const topla = (L) => kurus(L.reduce((a, k) => a + k.tutar, 0));
    const ara = {
      malzeme: topla(kalemler.malzeme),
      hirdavat: topla(kalemler.hirdavat),
      hizmet: topla(kalemler.hizmet),
      iscilik: topla(kalemler.iscilik),
      montaj: topla(kalemler.montaj),
      diger: topla(kalemler.diger),
    };
    const maliyet = kurus(ara.malzeme + ara.hirdavat + ara.hizmet + ara.iscilik + ara.montaj + ara.diger);

    // ---------- Modül başına maliyet dağılımı ----------
    // Malzeme/ebatlama net alan payına, bant metre payına göre; hırdavat ve işçilik modülün kendisinden.
    const modulMaliyetleri = [];
    for (const m of proje.moduller) {
      const s = sonuc.modulSonuclari[m.id];
      if (!s) continue;
      const adet = Math.max(1, Math.floor(sayi(m.adet) || 1));
      let malz = 0;
      for (const p of s.parcalar) {
        const b = malzemeBirim[p.malzeme];
        if (!b) continue;
        malz += Hesap.parcaAlanM2(p) * p.adet * b.m2 + Hesap.parcaBantM(p) * p.adet * b.bantM;
        // CNC/şablon kesim ücreti yalnızca şekilli parçaya
        if (p.sekil) malz += ((p.sekil.cnc != null ? p.sekil.cnc : p.sekil.egri || 0) / 1000) * p.adet * sayi(F.sekilliKesimM);
      }
      let hird = 0;
      for (const h of s.hirdavat) hird += h.fiyatMiktari * hirdavatFiyati(A, h.kod);
      const isc = m.tip === 'panel' ? sayi(F.panelIscilik) : sayi(F.atolyeIscilikModul) + sayi(F.montajModul);
      const birim = kurus(malz + hird + isc);
      modulMaliyetleri.push({ id: m.id, ad: m.ad, adet, malzeme: kurus(malz), hirdavat: kurus(hird), iscilik: kurus(isc), birim, toplam: kurus(birim * adet) });
    }

    // ---------- Satış, kâr, KDV ve teklif satırları ----------
    // Kâr tüm kalemlere aynı oranda eklenir. Teklif satırları kuruşa yuvarlanır ve
    // genel toplam satırların toplamından hesaplanır, böylece belge kendi içinde tutarlıdır.
    const karCarpan = 1 + sayi(F.karOrani) / 100;
    const teklifSatirlari = modulMaliyetleri.map((x) => {
      const m = proje.moduller.find((k) => k.id === x.id);
      const olcu = m.tip === 'lkose' ? `L ${m.genislik}+${m.genislik2}×${m.yukseklik}×${m.derinlik}`
        : m.tip === 'panel' ? `${m.boy}×${m.en}` + (m.sekil && m.sekil !== 'dikdortgen' ? ' (şekilli)' : '')
        : `${m.genislik}×${m.yukseklik}×${m.derinlik}`;
      const birimFiyat = kurus(x.birim * karCarpan);
      return { ad: m.ad, aciklama: olcu, adet: x.adet, birimFiyat, tutar: kurus(birimFiyat * x.adet) };
    });
    if (ara.montaj > 0) {
      const birimFiyat = kurus(ara.montaj * karCarpan);
      teklifSatirlari.push({ ad: 'Montaj aksesuarları (birleştirme, askı)', aciklama: '', adet: 1, birimFiyat, tutar: birimFiyat });
    }
    for (const d of kalemler.diger) {
      const birimFiyat = kurus(d.tutar * karCarpan);
      teklifSatirlari.push({ ad: d.ad, aciklama: '', adet: 1, birimFiyat, tutar: birimFiyat });
    }
    // Modüllere dağıtılamayan küçük kalan (yuvarlama, modül dışı malzeme) son satıra değil ayrı izlenir
    const dagitilan = kurus(modulMaliyetleri.reduce((a, x) => a + x.toplam, 0) + ara.diger + ara.montaj);
    const satisKdvHaric = kurus(teklifSatirlari.reduce((a, x) => a + x.tutar, 0));
    const kdv = kurus(satisKdvHaric * sayi(F.kdvOrani) / 100);
    return {
      kalemler,
      ara,
      maliyet,
      dagitimFarki: kurus(maliyet - dagitilan),
      kar: kurus(satisKdvHaric - dagitilan),
      karOrani: sayi(F.karOrani),
      satisKdvHaric,
      kdvOrani: sayi(F.kdvOrani),
      kdv,
      genelToplam: kurus(satisKdvHaric + kdv),
      modulMaliyetleri,
      teklifSatirlari,
      eksikFiyat: [...new Set(eksikFiyat)],
      modulAdedi,
      panelAdedi,
    };
  }

  /** Hazır teklif seçenekleri (kullanıcı düzenler). Boş alan = proje ayarı. */
  const HAZIR_SECENEKLER = [
    { ad: 'Ekonomik', aciklama: 'Suntalam kapak, standart menteşe ve ray', kullanim: { kapak: 'sl18' }, hirdavat: { mentese: 'standart', ray: 'bilyeli', kulp: 'kulp' }, karOrani: null },
    { ad: 'Standart', aciklama: 'Proje ayarlarındaki malzeme ve hırdavat', kullanim: {}, hirdavat: {}, karOrani: null },
    { ad: 'Lüks', aciklama: 'Lake kapak, frenli menteşe, gizli ray, kulpsuz', kullanim: { kapak: 'lake18' }, hirdavat: { mentese: 'frenli', ray: 'gizli', kulp: 'gola' }, karOrani: null },
  ];

  /** Bir seçeneğin uygulandığı proje kopyası (modüle özel seçimler korunur). */
  function secenekProjesi(proje, sec) {
    const p = JSON.parse(JSON.stringify(proje));
    for (const [k, v] of Object.entries(sec.kullanim || {})) if (v && Hesap.KULLANIMLAR.includes(k) && p.ayarlar.malzemeler.some((m) => m.id === v)) p.ayarlar.kullanim[k] = v;
    for (const [k, v] of Object.entries(sec.hirdavat || {})) if (Hesap.hirdavatGecerli(k, v)) p.ayarlar.hirdavat[k] = v;
    if (sec.karOrani != null && Number.isFinite(Number(sec.karOrani))) p.ayarlar.fiyat.karOrani = Number(sec.karOrani);
    return p;
  }

  /**
   * Seçenekli teklif: her seçenek için tam hesap (kesim, plaka, maliyet).
   * plakaSayisiHesapla(proje, sonuc) → { malzemeId: plaka } (yerleşim modülünden).
   */
  function secenekleriHesapla(proje, secenekler, plakaSayisiHesapla) {
    return secenekler.map((sec) => {
      const p = secenekProjesi(proje, sec);
      const sonuc = Hesap.projeHesapla(p);
      const r = maliyetHesapla(p, sonuc, plakaSayisiHesapla(p, sonuc));
      const malz = (k) => (Hesap.malzemeBul(p.ayarlar, p.ayarlar.kullanim[k]) || {}).ad;
      const hs = (k) => Hesap.HIRDAVAT_SECENEKLERI[k].secenekler[p.ayarlar.hirdavat[k]].ad;
      return {
        secenek: sec, proje: p, sonuc, maliyet: r,
        ozellikler: [
          ['Gövde', malz('govde')], ['Kapak', malz('kapak')], ['Çekmece kutusu', malz('cekmece')],
          ['Menteşe', hs('mentese')], ['Çekmece rayı', hs('ray')], ['Kulp', hs('kulp')], ['Bağlantı', hs('baglanti')],
        ],
      };
    });
  }

  return { maliyetHesapla, hirdavatFiyati, kurus, HAZIR_SECENEKLER, secenekProjesi, secenekleriHesapla };
});

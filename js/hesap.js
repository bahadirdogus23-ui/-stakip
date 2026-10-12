/*
 * Mobilya ölçü hesap motoru.
 * Bir modülün (dolap/gövde) dış ölçülerinden ve yapı tercihlerinden
 * tüm parçaların net ve kesim ölçülerini, hırdavat listesini ve
 * çizim için geometrisini üretir. Tüm ölçüler milimetredir.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Hesap = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const RAY_BOYLARI = [250, 300, 350, 400, 450, 500, 550, 600];
  const KULLANIMLAR = ['govde', 'kapak', 'cekmece', 'arkalik'];
  const KULLANIM_AD = { govde: 'Gövde', kapak: 'Kapak / ön', cekmece: 'Çekmece kutusu', arkalik: 'Arkalık / taban' };
  const MALZEME_TURLERI = ['Suntalam', 'MDF Lam', 'MDF Lake', 'Ham MDF', 'Akrilik / parlak', 'Kontrplak', 'Masif panel', 'HDF', 'Kompakt laminat', 'Diğer'];

  /** Seçilebilir hırdavat türleri. Ölçüyü etkileyen değerler burada tutulur. */
  const HIRDAVAT_SECENEKLERI = {
    baglanti: {
      baslik: 'Gövde bağlantısı',
      secenekler: {
        minifix: { ad: 'Minifix + kavela' },
        konfirmat: { ad: 'Konfirmat vida' },
        kavela: { ad: 'Kavela + tutkal' },
      },
    },
    mentese: {
      baslik: 'Menteşe',
      secenekler: {
        standart: { ad: 'Standart 35mm menteşe' },
        frenli: { ad: 'Frenli (yavaş kapanan) menteşe' },
        basac: { ad: 'Yaysız menteşe + bas-aç' },
      },
    },
    ray: {
      baslik: 'Çekmece rayı',
      secenekler: {
        bilyeli: { ad: 'Bilyeli teleskopik ray', yanBosluk: 13, kutuBoyFark: 0 },
        bilyeli_frenli: { ad: 'Frenli bilyeli teleskopik ray', yanBosluk: 13, kutuBoyFark: 0 },
        gizli: { ad: 'Gizli (alttan) frenli ray', yanBosluk: 5, kutuBoyFark: 10 },
        metal: { ad: 'Metal yanlı çekmece sistemi', tabanFark: 75, arkaFark: 87, boyFark: 24 },
      },
    },
    kulp: {
      baslik: 'Kulp',
      secenekler: {
        kulp: { ad: 'Kulp' },
        gomme: { ad: 'Gömme kulp' },
        gola: { ad: 'Gola profil (kulpsuz)' },
        basac: { ad: 'Bas-aç (kulpsuz)' },
      },
    },
    ayak: {
      baslik: 'Ayak',
      secenekler: {
        plastik: { ad: 'Plastik ayarlı ayak' },
        metal: { ad: 'Metal ayarlı ayak' },
      },
    },
  };

  const VARSAYILAN_AYARLAR = {
    malzemeler: [
      { id: 'sl18', ad: 'Suntalam Beyaz 18mm', tur: 'Suntalam', kalinlik: 18, plakaUzun: 2800, plakaKisa: 2100, bant: 0.8, damar: false },
      { id: 'sl18c', ad: 'Suntalam Ceviz 18mm', tur: 'Suntalam', kalinlik: 18, plakaUzun: 2800, plakaKisa: 2100, bant: 0.8, damar: true },
      { id: 'sl16', ad: 'Suntalam Beyaz 16mm', tur: 'Suntalam', kalinlik: 16, plakaUzun: 2800, plakaKisa: 2100, bant: 0.8, damar: false },
      { id: 'mdflam18', ad: 'MDF Lam Beyaz 18mm', tur: 'MDF Lam', kalinlik: 18, plakaUzun: 2800, plakaKisa: 2100, bant: 1, damar: false },
      { id: 'lake18', ad: 'MDF Lake 18mm (boyalı)', tur: 'MDF Lake', kalinlik: 18, plakaUzun: 2800, plakaKisa: 2100, bant: 0, damar: false },
      { id: 'akrilik18', ad: 'Akrilik Parlak 18mm', tur: 'Akrilik / parlak', kalinlik: 18, plakaUzun: 2800, plakaKisa: 1220, bant: 1, damar: false },
      { id: 'kp18', ad: 'Kontrplak 18mm', tur: 'Kontrplak', kalinlik: 18, plakaUzun: 2440, plakaKisa: 1220, bant: 0.5, damar: true },
      { id: 'hdf8', ad: 'HDF Beyaz 8mm', tur: 'HDF', kalinlik: 8, plakaUzun: 2800, plakaKisa: 2100, bant: 0, damar: false },
      { id: 'hdf4', ad: 'HDF Beyaz 4mm', tur: 'HDF', kalinlik: 4, plakaUzun: 2800, plakaKisa: 2100, bant: 0, damar: false },
    ],
    kullanim: { govde: 'sl18', kapak: 'mdflam18', cekmece: 'sl16', arkalik: 'hdf8' },
    hirdavat: { baglanti: 'minifix', mentese: 'frenli', ray: 'bilyeli', kulp: 'kulp', ayak: 'plastik' },
    testereKalinligi: 4,      // kesim bıçağı payı
    plakaKenarPayi: 10,       // plaka kenarından kırpılan pay
    bantDus: true,            // bant kalınlığını kesim ölçüsünden düş
    kapakBoslugu: 3,          // kapaklar arası boşluk
    disBosluk: 1.5,           // tam bini kapakta dış kenar boşluğu
    cekmeceUstBosluk: 40,     // çekmece önü yüksekliği ile kutu yüksekliği farkı
    arkalikKanalDerinligi: 8, // arkalık kanal derinliği
    arkalikGeriPay: 10,       // kanalın arka kenara uzaklığı
    arkalikCakmaPay: 2,       // çakma arkalıkta her kenardan içeri pay
    rafOnGeriCekme: 20,       // hareketli raf önden geri çekme
    rafYanBosluk: 1,          // hareketli raf her yandan boşluk
    kusakGenisligi: 100,      // üst kuşak eni
  };

  const satir = (tip, yukseklik, adet, raf, dikme, aski) => ({ tip, yukseklik, adet, raf: raf || 0, dikme: dikme || 0, aski: !!aski });

  const PRESETLER = {
    alt: {
      ad: 'Alt Dolap', genislik: 600, yukseklik: 870, derinlik: 560,
      yapi: 'yanlar_boydan', ust: 'kusak', arkalik: 'kanal', kapakTipi: 'tam',
      baza: { tip: 'ayak', yukseklik: 100, geriCekme: 50 },
      satirlar: [satir('cekmece', 150, 1), satir('kapak', null, 2, 1)],
    },
    ust: {
      ad: 'Üst Dolap', genislik: 600, yukseklik: 720, derinlik: 320, montajYuksekligi: 1450,
      yapi: 'yanlar_boydan', ust: 'tam', arkalik: 'kanal', kapakTipi: 'tam',
      baza: { tip: 'yok', yukseklik: 0, geriCekme: 0 },
      satirlar: [satir('kapak', null, 2, 2)],
    },
    korkose: {
      ad: 'Kör Köşe Alt Dolap', genislik: 1000, yukseklik: 870, derinlik: 560,
      yapi: 'yanlar_boydan', ust: 'kusak', arkalik: 'kanal', kapakTipi: 'tam',
      baza: { tip: 'ayak', yukseklik: 100, geriCekme: 50 },
      korPanel: 560, korTaraf: 'sol',
      satirlar: [satir('kapak', null, 1, 1)],
    },
    lkose: {
      tip: 'lkose', ad: 'L Köşe Alt Dolap', genislik: 900, genislik2: 900, yukseklik: 870, derinlik: 560,
      ust: 'tam', arkalik: 'cakma', kapakTipi: 'tam', raf: 1,
      baza: { tip: 'ayak', yukseklik: 100, geriCekme: 50 },
      satirlar: [],
    },
    lkoseust: {
      tip: 'lkose', ad: 'L Köşe Üst Dolap', genislik: 600, genislik2: 600, yukseklik: 720, derinlik: 320, montajYuksekligi: 1450,
      ust: 'tam', arkalik: 'cakma', kapakTipi: 'tam', raf: 2,
      baza: { tip: 'yok', yukseklik: 0, geriCekme: 0 },
      satirlar: [],
    },
    gardirop: {
      ad: 'Gardırop', genislik: 1000, yukseklik: 2400, derinlik: 580,
      yapi: 'tabla_boydan', ust: 'tam', arkalik: 'kanal', kapakTipi: 'tam',
      baza: { tip: 'panel', yukseklik: 80, geriCekme: 40 },
      satirlar: [satir('kapak', 400, 2), satir('kapak', null, 2, 0, 0, true)],
    },
    sifonyer: {
      ad: 'Şifonyer', genislik: 800, yukseklik: 900, derinlik: 450,
      yapi: 'tabla_boydan', ust: 'tam', arkalik: 'kanal', kapakTipi: 'tam',
      baza: { tip: 'ayak', yukseklik: 60, geriCekme: 0 },
      satirlar: [satir('cekmece', null, 1), satir('cekmece', null, 1), satir('cekmece', null, 1), satir('cekmece', null, 1)],
    },
    kitaplik: {
      ad: 'Kitaplık', genislik: 800, yukseklik: 2000, derinlik: 300,
      yapi: 'yanlar_boydan', ust: 'tam', arkalik: 'cakma', kapakTipi: 'tam',
      baza: { tip: 'panel', yukseklik: 60, geriCekme: 30 },
      satirlar: [satir('acik', null, 1, 3, 1), satir('kapak', 700, 2, 1)],
    },
  };

  const kopya = (o) => JSON.parse(JSON.stringify(o));
  const r1 = (x) => Math.round(x * 10) / 10;
  const say = (v, vars) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : vars;
  };

  function varsayilanAyarlar() {
    return kopya(VARSAYILAN_AYARLAR);
  }

  let sayac = 0;
  const yeniId = (on) => on + Date.now().toString(36) + (sayac++).toString(36);

  function yeniModul(presetAdi) {
    const p = kopya(PRESETLER[presetAdi] || PRESETLER.alt);
    p.id = yeniId('m');
    p.adet = 1;
    if (!p.tip) p.tip = 'normal';
    if (p.montajYuksekligi == null) p.montajYuksekligi = 0;
    if (p.korPanel == null) p.korPanel = 0;
    if (!p.korTaraf) p.korTaraf = 'sol';
    if (!p.duvar) p.duvar = 'A';
    p.malzeme = {};
    p.hirdavat = {};
    return p;
  }

  function yeniMalzeme() {
    return { id: yeniId('mz'), ad: 'Yeni malzeme 18mm', tur: 'Suntalam', kalinlik: 18, plakaUzun: 2800, plakaKisa: 2100, bant: 0.8, damar: false };
  }

  /**
   * Eski sürüm kayıtlarını ve eksik alanları günceller.
   * v1'de "malzemeler" kullanım adına göre bir nesneydi; artık bir kütüphane dizisidir.
   */
  function projeyiGuncelle(p) {
    const v = varsayilanAyarlar();
    const A = Object.assign({}, v, p.ayarlar || {});
    if (A.malzemeler && !Array.isArray(A.malzemeler)) {
      const eski = A.malzemeler;
      A.malzemeler = [];
      A.kullanim = {};
      for (const k of KULLANIMLAR) {
        const m = eski[k];
        if (!m) { A.kullanim[k] = v.kullanim[k]; continue; }
        let var_ = A.malzemeler.find((x) => x.ad === m.ad && Number(x.kalinlik) === Number(m.kalinlik));
        if (!var_) {
          var_ = Object.assign({ id: 'eski_' + k, tur: 'Diğer' }, m);
          A.malzemeler.push(var_);
        }
        A.kullanim[k] = var_.id;
      }
      for (const m of v.malzemeler) if (!A.malzemeler.some((x) => x.ad === m.ad)) A.malzemeler.push(m);
    }
    if (!Array.isArray(A.malzemeler) || !A.malzemeler.length) A.malzemeler = v.malzemeler;
    A.kullanim = Object.assign({}, v.kullanim, A.kullanim);
    for (const k of KULLANIMLAR) if (!A.malzemeler.some((m) => m.id === A.kullanim[k])) A.kullanim[k] = A.malzemeler[0].id;
    A.hirdavat = Object.assign({}, v.hirdavat, A.hirdavat);
    p.ayarlar = A;
    p.yerlesim = Object.assign({ tip: 'duz', duvarA: 3600, duvarB: 2400 }, p.yerlesim || {});
    for (const m of p.moduller || []) {
      if (!m.tip) m.tip = 'normal';
      if (m.montajYuksekligi == null) m.montajYuksekligi = 0;
      if (m.korPanel == null) m.korPanel = 0;
      if (!m.korTaraf) m.korTaraf = 'sol';
      if (!m.duvar) m.duvar = 'A';
      if (!m.malzeme) m.malzeme = {};
      if (!m.hirdavat) m.hirdavat = {};
      if (!m.satirlar) m.satirlar = [];
      if (!m.baza) m.baza = { tip: 'yok', yukseklik: 0, geriCekme: 0 };
    }
    return p;
  }

  const malzemeBul = (ayar, id) => ayar.malzemeler.find((m) => m.id === id) || null;

  /** Modülün her kullanım için geçerli malzemesi (modül seçimi > proje varsayılanı). */
  function malzemeCoz(modul, ayar) {
    const sonuc = {};
    for (const k of KULLANIMLAR) {
      const secim = modul.malzeme && modul.malzeme[k];
      sonuc[k] = malzemeBul(ayar, secim) || malzemeBul(ayar, ayar.kullanim[k]) || ayar.malzemeler[0];
    }
    return sonuc;
  }

  /** Modülün hırdavat seçimleri (modül seçimi > proje varsayılanı). */
  function hirdavatCoz(modul, ayar) {
    const sonuc = {};
    for (const k of Object.keys(HIRDAVAT_SECENEKLERI)) {
      const secim = modul.hirdavat && modul.hirdavat[k];
      const gecerli = (x) => x && HIRDAVAT_SECENEKLERI[k].secenekler[x];
      sonuc[k] = gecerli(secim) ? secim : gecerli(ayar.hirdavat && ayar.hirdavat[k]) ? ayar.hirdavat[k] : VARSAYILAN_AYARLAR.hirdavat[k];
    }
    return sonuc;
  }

  function mentesheAdedi(kapakYuksekligi) {
    if (kapakYuksekligi <= 900) return 2;
    if (kapakYuksekligi <= 1600) return 3;
    if (kapakYuksekligi <= 2000) return 4;
    return 5;
  }

  function raySec(kullanilabilirDerinlik) {
    let secilen = null;
    for (const b of RAY_BOYLARI) if (b <= kullanilabilirDerinlik) secilen = b;
    return secilen;
  }

  /** Hesap sırasında parça/hırdavat toplayan yardımcı. */
  function toplayici(M) {
    const parcalar = [];
    const hirdavat = [];
    const uyarilar = [];
    return {
      parcalar, hirdavat, uyarilar,
      ekle(ad, kullanim, boy, en, adet, bant) {
        if (adet <= 0) return;
        if (!(boy > 0) || !(en > 0)) {
          uyarilar.push(`"${ad}" parçasının ölçüsü geçersiz çıktı (${r1(boy)} x ${r1(en)}).`);
          return;
        }
        const m = M[kullanim];
        parcalar.push({ ad, kullanim, malzeme: m.id, boy: r1(boy), en: r1(en), adet, bant: bant || { u: 0, k: 0 }, damar: !!m.damar });
      },
      hEkle(ad, adet, birim) {
        if (!(adet > 0)) return;
        const var_ = hirdavat.find((h) => h.ad === ad);
        if (var_) var_.adet = r1(var_.adet + adet);
        else hirdavat.push({ ad, adet: r1(adet), birim: birim || 'adet' });
      },
    };
  }

  /** Bağlantı elemanlarını birleşim sayısına göre ekler. */
  function baglantiEkle(T, tur, birlesim, derinlik, tekNoktali) {
    const basina = derinlik < 350 ? 2 : 3;
    const nokta = birlesim * basina + (tekNoktali || 0);
    if (nokta <= 0) return;
    if (tur === 'konfirmat') {
      T.hEkle('Konfirmat vida 7×50', nokta);
    } else if (tur === 'kavela') {
      T.hEkle('Kavela 8×35', nokta + birlesim);
      T.hEkle('Ahşap tutkalı (birleşim)', birlesim + (tekNoktali ? 1 : 0), 'birleşim');
    } else {
      T.hEkle('Minifix (gövde + pim)', nokta, 'takım');
      T.hEkle('Kavela 8×35', nokta);
    }
  }

  /** Ön yüz (kapak/çekmece önü) için kulp ve benzeri ekler. */
  function kulpEkle(T, kulpTur, adet, onGenisligi) {
    if (kulpTur === 'gola') T.hEkle('Gola profil', (adet * onGenisligi) / 1000, 'm');
    else if (kulpTur === 'basac') T.hEkle('Bas-aç mekanizması', adet);
    else if (kulpTur === 'gomme') T.hEkle('Gömme kulp', adet);
    else T.hEkle('Kulp', adet);
  }

  function mentesheEkle(T, menteseTur, kapakTipi, adet, yarimBini) {
    const bini = kapakTipi === 'ic' ? 'gömme (iç bini)' : yarimBini ? 'yarım bini' : 'tam bini';
    const tur = menteseTur === 'basac' ? 'yaysız' : menteseTur === 'frenli' ? 'frenli' : 'standart';
    T.hEkle(`Menteşe 35mm ${tur}, ${bini}`, adet);
  }

  function bazaEkle(T, baza, hb, W, Ds, t, ayakTur, ayakAdedi) {
    if (baza.tip === 'ayak') {
      T.hEkle(`${HIRDAVAT_SECENEKLERI.ayak.secenekler[ayakTur].ad} (${hb} mm)`, ayakAdedi || (W > 1000 ? 6 : 4));
    } else if (baza.tip === 'panel') {
      const gc = say(baza.geriCekme, 0);
      // Baza çerçevesi: ön parça önden geri çekilir, yanlar gövdeyle aynı hizada.
      T.ekle('Baza ön/arka', 'govde', W, hb, 2, { u: 0, k: 0 });
      T.ekle('Baza yanı', 'govde', Ds - gc - 2 * t, hb, 2, { u: 0, k: 0 });
      if (Ds - gc - 2 * t < 100) T.uyarilar.push('Baza yanı çok kısa; baza geri çekme değerini kontrol edin.');
    }
  }

  /**
   * Tek bir modülü hesaplar (modül adedi ile çarpılmamış, tek gövde için).
   * Dönen parçalar: { ad, kullanim, malzeme(id), boy, en, adet, bant:{u,k}, damar }
   *  - boy: parçanın "uzunluk" yönü (damar yönü), en: diğer yön
   *  - bant.u: boy boyunca uzanan (uzun) kenarlardan bantlı olanların sayısı
   *  - bant.k: en boyunca uzanan (kısa) kenarlardan bantlı olanların sayısı
   */
  function modulHesapla(modul, ayar) {
    const A = ayar || VARSAYILAN_AYARLAR;
    const M = malzemeCoz(modul, A);
    const HS = hirdavatCoz(modul, A);
    if (modul.tip === 'lkose') return lKoseHesapla(modul, A, M, HS);

    const T = toplayici(M);
    const { ekle, hEkle, uyarilar } = T;

    const t = say(M.govde.kalinlik, 18);
    const ta = say(M.arkalik.kalinlik, 8);
    const tc = say(M.cekmece.kalinlik, 16);
    const tk = say(M.kapak.kalinlik, 18);
    const g = say(A.kapakBoslugu, 3);
    const db = say(A.disBosluk, 1.5);

    const W = say(modul.genislik, 0);
    const H = say(modul.yukseklik, 0);
    const D = say(modul.derinlik, 0);
    const baza = modul.baza || { tip: 'yok', yukseklik: 0, geriCekme: 0 };
    const hb = baza.tip === 'yok' ? 0 : say(baza.yukseklik, 0);
    const Hc = H - hb; // gövde (baza hariç) yüksekliği
    const iw = W - 2 * t; // iç genişlik
    const ic = modul.kapakTipi === 'ic';

    if (W < 2 * t + 50 || Hc < 2 * t + 50 || D < 100) {
      uyarilar.push('Ölçüler çok küçük: genişlik, yükseklik ve derinlik kontrol edilmeli.');
      return { parcalar: T.parcalar, hirdavat: T.hirdavat, uyarilar, geo: null, malzemeler: M, hirdavatSecimi: HS };
    }

    // Yan derinliği: çakma arkalık gövdenin arkasına çakıldığı için yanlardan düşülür.
    const Ds = modul.arkalik === 'cakma' ? D - ta : D;
    // Ara tabla, dikme ve raflar için kullanılabilir derinlik
    let icDerinlik = Ds;
    if (modul.arkalik === 'kanal') icDerinlik = Ds - say(A.arkalikGeriPay, 10) - ta;
    if (ic) icDerinlik -= tk;

    // ---------- Gövde ----------
    const usttam = modul.ust !== 'kusak';
    const kusakEn = say(A.kusakGenisligi, 100);
    if (modul.yapi === 'tabla_boydan') {
      ekle('Alt tabla', 'govde', W, Ds, 1, { u: 1, k: 2 });
      if (usttam) {
        ekle('Üst tabla', 'govde', W, Ds, 1, { u: 1, k: 2 });
        ekle('Yan', 'govde', Hc - 2 * t, Ds, 2, { u: 1, k: 0 });
      } else {
        ekle('Yan', 'govde', Hc - t, Ds, 2, { u: 1, k: 1 });
        ekle('Ön kuşak', 'govde', iw, kusakEn, 1, { u: 1, k: 0 });
        ekle('Arka kuşak', 'govde', iw, kusakEn, 1, { u: 0, k: 0 });
      }
    } else {
      ekle('Yan', 'govde', Hc, Ds, 2, { u: 1, k: 0 });
      ekle('Alt tabla', 'govde', iw, Ds, 1, { u: 1, k: 0 });
      if (usttam) {
        ekle('Üst tabla', 'govde', iw, Ds, 1, { u: 1, k: 0 });
      } else {
        ekle('Ön kuşak', 'govde', iw, kusakEn, 1, { u: 1, k: 0 });
        ekle('Arka kuşak', 'govde', iw, kusakEn, 1, { u: 0, k: 0 });
      }
    }
    let birlesim = usttam ? 4 : 2; // alt + üst tablanın iki ucu
    const kusakNokta = usttam ? 0 : 4; // kuşaklar uç başına tek nokta

    // ---------- Arkalık ----------
    if (modul.arkalik === 'kanal') {
      const kd = say(A.arkalikKanalDerinligi, 8);
      ekle('Arkalık (kanallı)', 'arkalik', Hc - 2 * t + 2 * (kd - 1), iw + 2 * (kd - 1), 1);
    } else if (modul.arkalik === 'cakma') {
      const p = say(A.arkalikCakmaPay, 2);
      ekle('Arkalık (çakma)', 'arkalik', Hc - 2 * p, W - 2 * p, 1);
      hEkle('Arkalık vidası / zımba çivisi', Math.ceil((2 * (Hc + W)) / 150));
    }

    bazaEkle(T, baza, hb, W, Ds, t, HS.ayak);

    // ---------- Ön yüz alanı ve kör köşe paneli ----------
    let x0 = ic ? t + g : db;
    let x1 = ic ? W - t - g : W - db;
    const yUst = ic ? Hc - t - g : Hc - db;
    const yAlt = ic ? t + g : db;
    let korPanel = null;
    const kp = say(modul.korPanel, 0);
    if (kp > 0) {
      if (ic) {
        uyarilar.push('Kör köşe paneli yalnızca tam bini kapakla hesaplanır; gömme kapakta dikkate alınmadı.');
      } else if (kp >= W - 200) {
        uyarilar.push(`Kör panel (${kp} mm) dolap genişliğine göre çok geniş.`);
      } else {
        // Kör panel komşu dolabın derinliği + kapak kalınlığı kadar olmalı; kapak kalan kısma yerleşir.
        if (modul.korTaraf === 'sag') {
          korPanel = { x1: W - db - kp, x2: W - db };
          x1 = W - db - kp - g;
        } else {
          korPanel = { x1: db, x2: db + kp };
          x0 = db + kp + g;
        }
        ekle('Kör köşe paneli', 'kapak', yUst - yAlt, kp, 1, { u: 2, k: 2 });
        ekle('Kör panel bağlantı çıtası', 'govde', Hc - 2 * t, 80, 1, { u: 0, k: 0 });
        hEkle('Kör panel bağlantı köşebendi', 4);
      }
    }

    // ---------- Ön düzen (satırlar, yukarıdan aşağı) ----------
    const satirlar = (modul.satirlar || []).map((s) => Object.assign({}, s));
    const geoSatirlar = [];
    const sinirlar = [];
    if (satirlar.length) {
      const panelVar = [];
      const ayrac = [];
      for (let i = 0; i < satirlar.length - 1; i++) {
        const p = !(satirlar[i].tip === 'cekmece' && satirlar[i + 1].tip === 'cekmece');
        panelVar.push(p);
        ayrac.push(ic && p ? t + 2 * g : g);
      }
      const toplamAyrac = ayrac.reduce((a, b) => a + b, 0);
      const kullanilabilir = yUst - yAlt - toplamAyrac;
      const yukseklikler = satirlar.map((s) => {
        const h = Number(s.yukseklik);
        return s.yukseklik === null || s.yukseklik === '' || !Number.isFinite(h) || h <= 0 ? null : h;
      });
      const sabit = yukseklikler.reduce((a, h) => a + (h || 0), 0);
      const serbest = yukseklikler.filter((h) => h === null).length;
      if (serbest > 0) {
        const kalan = (kullanilabilir - sabit) / serbest;
        if (kalan < 60) uyarilar.push(`Otomatik yükseklikli satırlara yalnızca ${r1(kalan)} mm kalıyor; sabit yükseklikleri azaltın.`);
        for (let i = 0; i < yukseklikler.length; i++) if (yukseklikler[i] === null) yukseklikler[i] = kalan;
      } else if (Math.abs(sabit - kullanilabilir) > 0.5) {
        uyarilar.push(`Satır yükseklikleri toplamı (${r1(sabit)}) kullanılabilir yükseklikten (${r1(kullanilabilir)}) farklı; fark son satıra eklendi.`);
        yukseklikler[yukseklikler.length - 1] += kullanilabilir - sabit;
      }

      // Ön yüz konumları ve satır sınırları
      let y = yUst;
      const onlar = [];
      for (let i = 0; i < satirlar.length; i++) {
        const h = yukseklikler[i];
        onlar.push({ y2: y, y1: y - h, h });
        if (i < satirlar.length - 1) {
          sinirlar.push({ y: y - h - ayrac[i] / 2, panel: panelVar[i] });
          y = y - h - ayrac[i];
        }
      }

      const ray = HIRDAVAT_SECENEKLERI.ray.secenekler[HS.ray];
      for (let i = 0; i < satirlar.length; i++) {
        const s = satirlar[i];
        const on = onlar[i];
        const icUst = i === 0 ? Hc - t : sinirlar[i - 1].panel ? sinirlar[i - 1].y - t / 2 : sinirlar[i - 1].y;
        const icAlt = i === satirlar.length - 1 ? t : sinirlar[i].panel ? sinirlar[i].y + t / 2 : sinirlar[i].y;
        const icH = icUst - icAlt;
        const n = Math.max(1, Math.floor(say(s.adet, 1)));
        const dikme = s.tip === 'cekmece' ? n - 1 : Math.max(0, Math.floor(say(s.dikme, 0)));
        const bolum = dikme + 1;
        const secW = (iw - dikme * t) / bolum;
        const bolumler = [];
        for (let k = 0; k < bolum; k++) {
          const bx = t + k * (secW + t);
          bolumler.push({ x1: bx, x2: bx + secW });
        }
        const dikmeX = [];
        for (let k = 0; k < dikme; k++) dikmeX.push(t + (k + 1) * secW + k * t);

        const satirNo = i + 1;
        const geo = { tip: s.tip, on, icUst, icAlt, icH, bolumler, dikmeX, onler: [], raflar: [], cekmeceler: [], aski: false };

        if (dikme > 0) {
          ekle(`Ara dikme (satır ${satirNo})`, 'govde', icH, icDerinlik, dikme, { u: 1, k: 0 });
          birlesim += 2 * dikme;
        }
        if (secW > 0 && secW < 100) uyarilar.push(`Satır ${satirNo}: bölme iç genişliği ${r1(secW)} mm, çok dar.`);

        // Ön yüzler (kapak / çekmece önü)
        if (s.tip !== 'acik') {
          const ayr = ic && n > 1 && dikme >= n - 1 ? t + 2 * g : g;
          const fw = (x1 - x0 - (n - 1) * ayr) / n;
          for (let k = 0; k < n; k++) {
            const fx = x0 + k * (fw + ayr);
            geo.onler.push({ x1: fx, x2: fx + fw });
          }
          const onAd = s.tip === 'kapak' ? 'Kapak' : 'Çekmece önü';
          ekle(`${onAd} (satır ${satirNo})`, 'kapak', on.h, fw, n, { u: 2, k: 2 });
          kulpEkle(T, HS.kulp, n, fw);
          if (s.tip === 'kapak') {
            if (fw > 600) uyarilar.push(`Satır ${satirNo}: kapak genişliği ${r1(fw)} mm; 600 mm üstü kapaklar sarkma yapabilir, kapak adedini artırın.`);
            const yarim = !ic && dikme > 0 && n > 1;
            mentesheEkle(T, HS.mentese, modul.kapakTipi, n * mentesheAdedi(on.h), yarim);
          }
        }

        // Raflar
        if (s.tip === 'kapak' || s.tip === 'acik') {
          const raf = Math.max(0, Math.floor(say(s.raf, 0)));
          if (raf > 0) {
            const yb = say(A.rafYanBosluk, 1);
            ekle(`Raf (satır ${satirNo})`, 'govde', secW - 2 * yb, icDerinlik - say(A.rafOnGeriCekme, 20), raf * bolum, { u: 1, k: 0 });
            hEkle('Raf pimi', 4 * raf * bolum);
            if (secW > 900) uyarilar.push(`Satır ${satirNo}: raf açıklığı ${r1(secW)} mm; ${t} mm rafta sehim olur, ara dikme ekleyin.`);
            for (let j = 1; j <= raf; j++) geo.raflar.push(icAlt + (j * icH) / (raf + 1));
          }
          if (s.aski) {
            geo.aski = true;
            hEkle(`Askı borusu (${r1(secW - 2)} mm)`, bolum);
            hEkle('Askı borusu flanşı', 2 * bolum);
            if (icDerinlik < 500) uyarilar.push(`Satır ${satirNo}: askı için iç derinlik ${r1(icDerinlik)} mm; en az 500 mm önerilir.`);
            if (icH < 900) uyarilar.push(`Satır ${satirNo}: askı bölmesi yüksekliği ${r1(icH)} mm; kısa elbise için bile en az 900 mm önerilir.`);
          }
        }

        // Çekmeceler
        if (s.tip === 'cekmece') {
          const L = raySec(icDerinlik - 10);
          const kutuH = Math.floor(Math.min(on.h - say(A.cekmeceUstBosluk, 40), icH - 15));
          if (!L) {
            uyarilar.push(`Satır ${satirNo}: iç derinlik (${r1(icDerinlik)} mm) en kısa ray (250 mm) için yetersiz.`);
          } else if (kutuH < 50) {
            uyarilar.push(`Satır ${satirNo}: çekmece kutusu yüksekliği ${kutuH} mm, çok düşük.`);
          } else if (HS.ray === 'metal') {
            // Metal yanlı sistem: yanlar hazır gelir, yalnızca taban ve arkalık kesilir.
            const arkaH = kutuH >= 180 ? 167 : kutuH >= 110 ? 100 : 68;
            ekle(`Çekmece tabanı (satır ${satirNo})`, 'cekmece', L - ray.boyFark, secW - ray.tabanFark, bolum, { u: 0, k: 0 });
            ekle(`Çekmece arkalığı (satır ${satirNo})`, 'cekmece', secW - ray.arkaFark, arkaH, bolum, { u: 1, k: 0 });
            hEkle(`Metal yanlı çekmece seti ${L} mm (arka yük. ${arkaH})`, bolum, 'takım');
            uyarilar.push(`Satır ${satirNo}: metal yanlı çekmece ölçüleri genel değerlerdir; kullandığınız markanın kataloğuyla kontrol edin.`);
            for (const b of bolumler) geo.cekmeceler.push({ x1: b.x1 + 5, x2: b.x2 - 5, y1: icAlt + 10, y2: icAlt + 10 + arkaH, L, kutuW: secW - 10, kutuH: arkaH });
          } else {
            const kutuW = secW - 2 * ray.yanBosluk;
            const kutuL = L - ray.kutuBoyFark;
            ekle(`Çekmece yanı (satır ${satirNo})`, 'cekmece', kutuL, kutuH, 2 * bolum, { u: 1, k: 0 });
            ekle(`Çekmece ön/arka (satır ${satirNo})`, 'cekmece', kutuW - 2 * tc, kutuH, 2 * bolum, { u: 1, k: 0 });
            ekle(`Çekmece tabanı (satır ${satirNo})`, 'arkalik', kutuL, kutuW, bolum);
            hEkle(`${ray.ad} ${L} mm`, bolum, 'takım');
            for (const b of bolumler) geo.cekmeceler.push({ x1: b.x1 + ray.yanBosluk, x2: b.x2 - ray.yanBosluk, y1: icAlt + 10, y2: icAlt + 10 + kutuH, L: kutuL, kutuW, kutuH });
          }
          if (HS.kulp === 'basac' && L) hEkle('Ray için bas-aç adaptörü', bolum);
        }
        geoSatirlar.push(geo);
      }

      // Satırlar arası sabit raflar (ara tabla)
      const araTabla = sinirlar.filter((b) => b.panel).length;
      if (araTabla > 0) {
        ekle('Ara tabla (sabit raf)', 'govde', iw, icDerinlik, araTabla, { u: 1, k: 0 });
        birlesim += 2 * araTabla;
      }
    }

    baglantiEkle(T, HS.baglanti, birlesim, Ds, kusakNokta);

    return {
      parcalar: T.parcalar,
      hirdavat: T.hirdavat,
      uyarilar,
      malzemeler: M,
      hirdavatSecimi: HS,
      geo: {
        W, H, D, Hc, hb, t, ta, Ds, icDerinlik, tk,
        kapakTipi: modul.kapakTipi, arkalik: modul.arkalik, ust: modul.ust, yapi: modul.yapi,
        baza: { tip: baza.tip, yukseklik: hb, geriCekme: say(baza.geriCekme, 0) },
        korPanel,
        satirlar: geoSatirlar,
        sinirlar,
      },
    };
  }

  /**
   * L köşe dolap: iki kollu, köşede birleşen gövde.
   * Kuşbakışı köşe (0,0); A kolu x yönünde (genislik), B kolu y yönünde (genislik2).
   * Kapaklar katlanır: B kapağı B kolu ucundaki yana menteşelenir, A kapağı
   * B kapağına kapak-kapak menteşesiyle bağlanır. Tablalar ve raflar iki parça
   * halinde kesilip köşede birleştirilir. Arkalık her kola ayrı çakılır.
   */
  function lKoseHesapla(modul, A, M, HS) {
    const T = toplayici(M);
    const { ekle, hEkle, uyarilar } = T;
    const t = say(M.govde.kalinlik, 18);
    const ta = say(M.arkalik.kalinlik, 8);
    const tk = say(M.kapak.kalinlik, 18);
    const g = say(A.kapakBoslugu, 3);
    const db = say(A.disBosluk, 1.5);
    const LA = say(modul.genislik, 0);
    const LB = say(modul.genislik2, 0);
    const H = say(modul.yukseklik, 0);
    const D = say(modul.derinlik, 0);
    const baza = modul.baza || { tip: 'yok', yukseklik: 0, geriCekme: 0 };
    const hb = baza.tip === 'yok' ? 0 : say(baza.yukseklik, 0);
    const Hc = H - hb;
    const Ds = D - ta; // arkalık arkaya çakılır
    const bos = { parcalar: T.parcalar, hirdavat: T.hirdavat, uyarilar, geo: null, malzemeler: M, hirdavatSecimi: HS };

    if (D < 200 || Hc < 2 * t + 100) {
      uyarilar.push('Ölçüler çok küçük: yükseklik ve derinlik kontrol edilmeli.');
      return bos;
    }
    if (LA < D + tk + 250 || LB < D + 250) {
      uyarilar.push(`Kol genişlikleri derinliğe göre çok küçük; her kol en az ${r1(D + tk + 250)} mm olmalı.`);
      return bos;
    }

    // Gövde: kol uçlarında birer yan, L tablalar iki parça.
    // Arkalıklar duvar dibinde (kalınlık ta); gövde arkalıkların önünden başlar.
    ekle('Yan (kol ucu)', 'govde', Hc, Ds, 2, { u: 1, k: 0 });
    const tablaA = LA - ta - t;      // B arkalığının önünden A yanına kadar, tam derinlik
    const tablaB = LB - D - t;       // A tablasının önünden B yanına kadar
    ekle('Alt tabla – A kolu', 'govde', tablaA, Ds, 1, { u: 1, k: 0 });
    ekle('Alt tabla – B kolu', 'govde', tablaB, Ds, 1, { u: 1, k: 0 });
    ekle('Üst tabla – A kolu', 'govde', tablaA, Ds, 1, { u: 1, k: 0 });
    ekle('Üst tabla – B kolu', 'govde', tablaB, Ds, 1, { u: 1, k: 0 });

    // Arkalıklar: A kolu tam boy, B kolu A arkalığının kalınlığı kadar kısa
    const p = say(A.arkalikCakmaPay, 2);
    ekle('Arkalık – A kolu (çakma)', 'arkalik', Hc - 2 * p, LA - p, 1);
    ekle('Arkalık – B kolu (çakma)', 'arkalik', Hc - 2 * p, LB - ta - p, 1);
    hEkle('Arkalık vidası / zımba çivisi', Math.ceil((2 * (2 * Hc + LA + LB)) / 150));

    bazaEkle(T, baza, hb, Math.max(LA, LB), Ds, t, HS.ayak, baza.tip === 'ayak' ? 6 : 0);
    if (baza.tip === 'panel') uyarilar.push('L köşe dolapta baza çerçevesi iki kol için ayrı ayrı yapılmalı; listedeki baza parçaları yalnızca A kolu içindir.');

    // Kapaklar
    const kapakH = Hc - 2 * db;
    // B kapağı x = D düzleminde durur; A kapağı onun kalınlığı + boşluk kadar sonra başlar.
    const kapakA = LA - D - tk - g - db;
    const kapakB = LB - D - db;
    ekle('Köşe kapağı – A kolu', 'kapak', kapakH, kapakA, 1, { u: 2, k: 2 });
    ekle('Köşe kapağı – B kolu', 'kapak', kapakH, kapakB, 1, { u: 2, k: 2 });
    const mn = mentesheAdedi(kapakH);
    mentesheEkle(T, HS.mentese, 'tam', mn, false);
    T.hEkle('Katlanır kapak bağlantı menteşesi (kapak-kapak)', mn);
    kulpEkle(T, HS.kulp, 1, kapakA);
    if (kapakA > 600 || kapakB > 600) uyarilar.push('Köşe kapaklarından biri 600 mm\'den geniş; katlanır kapak sarkabilir.');

    // Raflar (L raf iki parça)
    const raf = Math.max(0, Math.floor(say(modul.raf, 0)));
    const rafD = Ds - say(A.rafOnGeriCekme, 20);
    const yb = say(A.rafYanBosluk, 1);
    const raflar = [];
    if (raf > 0) {
      ekle('Raf – A kolu', 'govde', LA - ta - t - yb, rafD, raf, { u: 1, k: 0 });
      ekle('Raf – B kolu', 'govde', LB - ta - t - yb - rafD, rafD, raf, { u: 1, k: 0 });
      hEkle('Raf pimi', 6 * raf);
      hEkle('Raf birleştirme bağlantısı', 2 * raf);
      for (let j = 1; j <= raf; j++) raflar.push(t + (j * (Hc - 2 * t)) / (raf + 1));
    }

    // Birleşim: 4 tabla ucu + 2 tabla eki (köşe)
    baglantiEkle(T, HS.baglanti, 6, Ds, 0);

    return {
      parcalar: T.parcalar,
      hirdavat: T.hirdavat,
      uyarilar,
      malzemeler: M,
      hirdavatSecimi: HS,
      geo: {
        lkose: true,
        W: LA, W2: LB, H, D, Hc, hb, t, ta, Ds, tk, db, g,
        kapakH, kapakA, kapakB, raflar,
        baza: { tip: baza.tip, yukseklik: hb, geriCekme: say(baza.geriCekme, 0) },
      },
    };
  }

  /** Bant kalınlığı düşülmüş kesim ölçüsü. */
  function kesimOlcusu(parca, ayar) {
    const A = ayar || VARSAYILAN_AYARLAR;
    const malz = malzemeBul(A, parca.malzeme);
    const bt = A.bantDus && malz ? say(malz.bant, 0) : 0;
    return {
      boy: r1(parca.boy - parca.bant.k * bt),
      en: r1(parca.en - parca.bant.u * bt),
    };
  }

  const montajOf = (m) => Math.max(0, say(m.montajYuksekligi, 0));

  /**
   * Duvar yerleşimi. Düz yerleşimde tüm modüller A duvarına dizilir.
   * L yerleşimde köşe (0,0); A duvarı köşeden sağa, B duvarı köşeden aşağı uzanır.
   * Zemine oturan modüller ile duvara asılanlar ayrı sıralar oluşturur.
   * Sırada L köşe dolap varsa köşeye o yerleşir; yoksa B duvarındaki modüller
   * A duvarındaki dolapların derinliği kadar köşeden uzakta başlar.
   */
  function yerlesimHesapla(proje, sonuclar) {
    const Y = proje.yerlesim || { tip: 'duz', duvarA: 0, duvarB: 0 };
    const L = Y.tip === 'L';
    const yerler = [];
    const uyarilar = [];
    const doluluk = {};
    for (const sira of ['zemin', 'duvar']) {
      const uygun = proje.moduller.filter((m) => sonuclar[m.id] && sonuclar[m.id].geo && (sira === 'zemin' ? montajOf(m) === 0 : montajOf(m) > 0));
      const koseler = uygun.filter((m) => m.tip === 'lkose');
      let kose = null;
      if (L && koseler.length) {
        kose = koseler[0];
        if (koseler.length > 1) uyarilar.push(`Yerleşim: ${sira === 'zemin' ? 'zemin' : 'duvar'} sırasında birden fazla L köşe dolap var; yalnızca "${kose.ad}" köşeye yerleştirildi.`);
      }
      const duvarA = uygun.filter((m) => m !== kose && (!L || m.duvar !== 'B'));
      const duvarB = L ? uygun.filter((m) => m !== kose && m.duvar === 'B') : [];
      let x = 0;
      if (kose) {
        const g = sonuclar[kose.id].geo;
        yerler.push({ modul: kose, duvar: 'kose', sira, bas: 0, W: g.W, W2: g.W2, D: g.D, montaj: montajOf(kose), geo: g });
        x = g.W;
      }
      for (const m of duvarA) {
        const g = sonuclar[m.id].geo;
        yerler.push({ modul: m, duvar: 'A', sira, bas: x, W: g.W, D: g.D, montaj: montajOf(m), geo: g });
        x += g.W;
      }
      const sonA = x;
      let y = 0;
      if (kose) y = sonuclar[kose.id].geo.W2;
      else if (duvarB.length && duvarA.length) {
        y = Math.max(...duvarA.map((m) => sonuclar[m.id].geo.D));
      }
      const baslangicB = y;
      for (const m of duvarB) {
        const g = sonuclar[m.id].geo;
        yerler.push({ modul: m, duvar: 'B', sira, bas: y, W: g.W, D: g.D, montaj: montajOf(m), geo: g });
        y += g.W;
      }
      doluluk[sira] = { A: sonA, B: duvarB.length || kose ? y : 0, koseBosluguB: !kose && duvarB.length && duvarA.length ? baslangicB : 0 };
      const ad = sira === 'zemin' ? 'Zemin dolapları' : 'Üst dolaplar';
      if (Y.duvarA > 0 && sonA > Y.duvarA) uyarilar.push(`Yerleşim: ${ad} A duvarını ${r1(sonA - Y.duvarA)} mm aşıyor.`);
      if (L && Y.duvarB > 0 && y > Y.duvarB) uyarilar.push(`Yerleşim: ${ad} B duvarını ${r1(y - Y.duvarB)} mm aşıyor.`);
      if (doluluk[sira].koseBosluguB > 0) uyarilar.push(`Yerleşim: ${ad} köşesinde L köşe dolap yok; B duvarı ${r1(baslangicB)} mm köşe boşluğuyla başlıyor (kör köşe dolap veya dolgu düşünün).`);
    }
    return { tip: L ? 'L' : 'duz', duvarA: say(Y.duvarA, 0), duvarB: say(Y.duvarB, 0), yerler, doluluk, uyarilar };
  }

  /** Tüm projeyi hesaplar: birleşik kesim listesi, hırdavat, malzeme özetleri, yerleşim. */
  function projeHesapla(proje) {
    const A = proje.ayarlar;
    const tumParcalar = [];
    const hirdavatMap = new Map();
    const uyarilar = [];
    const modulSonuclari = {};

    for (const m of proje.moduller) {
      const sonuc = modulHesapla(m, A);
      modulSonuclari[m.id] = sonuc;
      const adet = Math.max(1, Math.floor(say(m.adet, 1)));
      for (const u of sonuc.uyarilar) uyarilar.push(`${m.ad}: ${u}`);
      for (const p of sonuc.parcalar) tumParcalar.push(Object.assign({}, p, { adet: p.adet * adet, modul: m.ad }));
      for (const h of sonuc.hirdavat) {
        const onceki = hirdavatMap.get(h.ad);
        if (onceki) onceki.adet = r1(onceki.adet + h.adet * adet);
        else hirdavatMap.set(h.ad, { ad: h.ad, adet: r1(h.adet * adet), birim: h.birim });
      }
    }

    // Aynı malzeme + ölçü + bant + ad olan parçaları birleştir
    const grup = new Map();
    for (const p of tumParcalar) {
      const anahtar = [p.malzeme, p.ad, p.boy, p.en, p.bant.u, p.bant.k, p.damar].join('|');
      const g = grup.get(anahtar);
      if (g) {
        g.adet += p.adet;
        if (!g.moduller.includes(p.modul)) g.moduller.push(p.modul);
      } else {
        grup.set(anahtar, Object.assign({}, p, { moduller: [p.modul] }));
      }
    }
    // Malzeme sırası: ilk kullanıldığı kullanım türüne göre, sonra kütüphane sırası
    const malzSira = (id) => {
      const i = A.malzemeler.findIndex((m) => m.id === id);
      return i < 0 ? 999 : i;
    };
    const kullanimSira = {};
    for (const p of grup.values()) {
      const s = KULLANIMLAR.indexOf(p.kullanim);
      if (kullanimSira[p.malzeme] == null || s < kullanimSira[p.malzeme]) kullanimSira[p.malzeme] = s;
    }
    const kesimListesi = [...grup.values()].sort((a, b) =>
      kullanimSira[a.malzeme] - kullanimSira[b.malzeme] || malzSira(a.malzeme) - malzSira(b.malzeme) || b.boy * b.en - a.boy * a.en
    );
    kesimListesi.forEach((p, i) => {
      p.no = i + 1;
      const k = kesimOlcusu(p, A);
      p.kesimBoy = k.boy;
      p.kesimEn = k.en;
    });

    // Malzeme özetleri (m², bant metresi). Bant kalınlığı 0 olan malzeme bantsız kabul edilir.
    const ozet = new Map();
    for (const p of kesimListesi) {
      const malz = malzemeBul(A, p.malzeme);
      if (!ozet.has(p.malzeme)) ozet.set(p.malzeme, { malzemeId: p.malzeme, malzeme: malz.ad, alanM2: 0, bantM: 0, bantKalinlik: malz.bant, parcaAdedi: 0 });
      const o = ozet.get(p.malzeme);
      o.alanM2 += (p.boy * p.en * p.adet) / 1e6;
      if (say(malz.bant, 0) > 0) o.bantM += ((p.bant.u * p.boy + p.bant.k * p.en) * p.adet) / 1000;
      o.parcaAdedi += p.adet;
    }

    const yerlesim = yerlesimHesapla(proje, modulSonuclari);
    for (const u of yerlesim.uyarilar) uyarilar.push(u);

    return {
      kesimListesi,
      hirdavat: [...hirdavatMap.values()],
      ozet: [...ozet.values()],
      uyarilar,
      modulSonuclari,
      yerlesim,
    };
  }

  return {
    RAY_BOYLARI,
    KULLANIMLAR,
    KULLANIM_AD,
    MALZEME_TURLERI,
    HIRDAVAT_SECENEKLERI,
    PRESETLER,
    varsayilanAyarlar,
    yeniModul,
    yeniMalzeme,
    projeyiGuncelle,
    malzemeBul,
    malzemeCoz,
    hirdavatCoz,
    modulHesapla,
    projeHesapla,
    yerlesimHesapla,
    kesimOlcusu,
    mentesheAdedi,
    raySec,
  };
});

/*
 * Mobilya ölçü hesap motoru.
 * Bir modülün (dolap/gövde/panel) dış ölçülerinden ve yapı tercihlerinden
 * tüm parçaların net ve kesim ölçülerini, cam listesini, hırdavat listesini
 * ve çizim için geometrisini üretir. Tüm ölçüler milimetredir.
 *
 * Dolap yapısı: gövde → dikey bölmeler (sütunlar) → her bölmede yukarıdan
 * aşağı satırlar (kapak, çekmece, açık raf, cihaz nişi).
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Hesap = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const RAY_BOYLARI = [250, 300, 350, 400, 450, 500, 550, 600];
  const KULLANIMLAR = ['govde', 'kapak', 'cekmece', 'arkalik', 'cam', 'camRaf', 'ayna'];
  const KULLANIM_AD = {
    govde: 'Gövde', kapak: 'Kapak / ön', cekmece: 'Çekmece kutusu', arkalik: 'Arkalık / taban',
    cam: 'Kapak camı', camRaf: 'Cam raf', ayna: 'Ayna',
  };
  const MALZEME_TURLERI = ['Suntalam', 'MDF Lam', 'MDF Lake', 'Ham MDF', 'Akrilik / parlak', 'Kontrplak', 'Masif panel', 'HDF', 'Kompakt laminat', 'Cam', 'Ayna', 'Diğer'];
  const camMi = (m) => !!m && (m.tur === 'Cam' || m.tur === 'Ayna');

  const SATIR_TIPLERI = { kapak: 'Kapak', cekmece: 'Çekmece', acik: 'Açık raf', nis: 'Cihaz nişi' };
  const KAPAK_TURLERI = { panel: 'Düz panel', cam: 'Cam (çerçevesiz)', cam_profil: 'Alüminyum profil + cam', cam_cerceve: 'MDF çerçeve + cam', ayna: 'Ayna' };
  const ACILIMLAR = { yana: 'Yana açılır', yukari: 'Yukarı kalkar', asagi: 'Aşağı devrilir (klapa)' };
  const SURGU_TURLERI = { panel: 'Düz panel', ayna: 'Ayna (profilli)', cam_profil: 'Cam (profilli)' };
  const PANEL_TURLERI = {
    yan_kapama: { ad: 'Yan kapama paneli', aciklama: 'Dolap dizisinin açıkta kalan yanına' },
    dolgu: { ad: 'Dolgu paneli', aciklama: 'Duvar ile dolap arasındaki boşluğa' },
    bulasik: { ad: 'Bulaşık makinesi kapağı', aciklama: 'Ankastre bulaşık makinesine' },
    raf: { ad: 'Duvar rafı', aciklama: 'Gizli taşıyıcılı duvar rafı' },
    tabla: { ad: 'Tabla', aciklama: 'Masa, tezgah veya çalışma tablası' },
    baza: { ad: 'Baza bandı', aciklama: 'Dolapların altındaki süpürgelik; yerleşimde yer kaplamaz' },
    serbest: { ad: 'Serbest panel', aciklama: 'Herhangi bir düz parça' },
  };

  /** Seçilebilir hırdavat türleri. Ölçüyü etkileyen değerler burada tutulur. */
  const HIRDAVAT_SECENEKLERI = {
    baglanti: {
      baslik: 'Gövde bağlantısı (köşeler)',
      secenekler: {
        minifix: { ad: 'Minifix + kavela' },
        konfirmat: { ad: 'Konfirmat vida' },
        kavela: { ad: 'Kavela + tutkal' },
        seffaf_kose: { ad: 'Şeffaf köşe bağlantı (plastik)' },
      },
    },
    araBaglanti: {
      baslik: 'Ara bağlantı (sabit raf, dikme)',
      secenekler: {
        ayni: { ad: 'Gövde bağlantısıyla aynı' },
        seffaf_t: { ad: 'Şeffaf T bağlantı (plastik)' },
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

  /**
   * Fiyatlandırılan hırdavat kalemleri. Fiyatlar ÖRNEK değerlerdir (TL, KDV hariç);
   * kullanıcı kendi güncel fiyatlarını "Fiyat & maliyet" sekmesinden girer.
   */
  const HIRDAVAT_KALEMLERI = {
    minifix: { ad: 'Minifix (gövde + pim)', birim: 'takım', fiyat: 6 },
    kavela: { ad: 'Kavela 8×35', birim: 'adet', fiyat: 0.5 },
    konfirmat: { ad: 'Konfirmat vida 7×50', birim: 'adet', fiyat: 1.5 },
    tutkal: { ad: 'Ahşap tutkalı', birim: 'birleşim', fiyat: 2 },
    seffaf_kose: { ad: 'Şeffaf köşe bağlantı', birim: 'adet', fiyat: 3 },
    seffaf_t: { ad: 'Şeffaf T bağlantı', birim: 'adet', fiyat: 3 },
    sunta_vidasi: { ad: 'Sunta vidası 3,5×16', birim: 'adet', fiyat: 0.3 },
    mentese_standart: { ad: 'Menteşe standart', birim: 'adet', fiyat: 35 },
    mentese_frenli: { ad: 'Menteşe frenli', birim: 'adet', fiyat: 85 },
    mentese_yaysiz: { ad: 'Menteşe yaysız', birim: 'adet', fiyat: 60 },
    mentese_cam: { ad: 'Cam kapak menteşesi', birim: 'adet', fiyat: 150 },
    mentese_katlanir: { ad: 'Katlanır kapak bağlantı menteşesi', birim: 'adet', fiyat: 120 },
    kapak_kaldirma: { ad: 'Kapak kaldırma mekanizması', birim: 'takım', fiyat: 900 },
    klapa_mentese: { ad: 'Klapa menteşesi', birim: 'adet', fiyat: 60 },
    klapa_kol: { ad: 'Klapa taşıma kolu', birim: 'takım', fiyat: 250 },
    surgu_ray: { ad: 'Sürgü kapak ray profili', birim: 'm', fiyat: 300 },
    surgu_takim: { ad: 'Sürgü kapak tekerlek takımı', birim: 'kapak', fiyat: 400 },
    al_profil: { ad: 'Alüminyum kapak profili', birim: 'm', fiyat: 220 },
    profil_kose: { ad: 'Profil köşe birleştirme', birim: 'adet', fiyat: 8 },
    ray_bilyeli: { ad: 'Bilyeli teleskopik ray', birim: 'takım', fiyat: 220 },
    ray_bilyeli_frenli: { ad: 'Frenli bilyeli teleskopik ray', birim: 'takım', fiyat: 450 },
    ray_gizli: { ad: 'Gizli frenli ray', birim: 'takım', fiyat: 850 },
    cekmece_metal: { ad: 'Metal yanlı çekmece seti', birim: 'takım', fiyat: 2200 },
    basac: { ad: 'Bas-aç mekanizması', birim: 'adet', fiyat: 120 },
    basac_ray: { ad: 'Ray için bas-aç adaptörü', birim: 'adet', fiyat: 250 },
    kulp: { ad: 'Kulp', birim: 'adet', fiyat: 75 },
    kulp_gomme: { ad: 'Gömme kulp', birim: 'adet', fiyat: 60 },
    gola: { ad: 'Gola profil', birim: 'm', fiyat: 280 },
    ayak_plastik: { ad: 'Plastik ayarlı ayak', birim: 'adet', fiyat: 15 },
    ayak_metal: { ad: 'Metal ayarlı ayak', birim: 'adet', fiyat: 60 },
    tekerlek: { ad: 'Tekerlek (frenli)', birim: 'adet', fiyat: 45 },
    raf_pimi: { ad: 'Raf pimi', birim: 'adet', fiyat: 1 },
    cam_raf_pimi: { ad: 'Cam raf pimi', birim: 'adet', fiyat: 4 },
    raf_baglanti: { ad: 'Raf birleştirme bağlantısı', birim: 'adet', fiyat: 10 },
    raf_tasiyici: { ad: 'Gizli raf taşıyıcı', birim: 'adet', fiyat: 60 },
    aski_borusu: { ad: 'Askı borusu', birim: 'm', fiyat: 160 },
    aski_flans: { ad: 'Askı borusu flanşı', birim: 'adet', fiyat: 15 },
    led_serit: { ad: 'LED şerit', birim: 'm', fiyat: 120 },
    led_profil: { ad: 'LED alüminyum profili', birim: 'm', fiyat: 80 },
    led_adaptor: { ad: 'LED adaptörü', birim: 'adet', fiyat: 300 },
    bulasik_seti: { ad: 'Bulaşık makinesi kapak montaj seti', birim: 'takım', fiyat: 150 },
    arkalik_vida: { ad: 'Arkalık vidası / zımba çivisi', birim: 'adet', fiyat: 0.4 },
    kosebent: { ad: 'Bağlantı köşebendi', birim: 'adet', fiyat: 5 },
  };

  const VARSAYILAN_AYARLAR = {
    malzemeler: [
      { id: 'sl18', ad: 'Suntalam Beyaz 18mm', tur: 'Suntalam', kalinlik: 18, plakaUzun: 2800, plakaKisa: 2100, bant: 0.8, damar: false, plakaFiyati: 2200, bantFiyati: 12, islemFiyatiM2: 0 },
      { id: 'sl18c', ad: 'Suntalam Ceviz 18mm', tur: 'Suntalam', kalinlik: 18, plakaUzun: 2800, plakaKisa: 2100, bant: 0.8, damar: true, plakaFiyati: 2600, bantFiyati: 14, islemFiyatiM2: 0 },
      { id: 'sl16', ad: 'Suntalam Beyaz 16mm', tur: 'Suntalam', kalinlik: 16, plakaUzun: 2800, plakaKisa: 2100, bant: 0.8, damar: false, plakaFiyati: 2000, bantFiyati: 12, islemFiyatiM2: 0 },
      { id: 'mdflam18', ad: 'MDF Lam Beyaz 18mm', tur: 'MDF Lam', kalinlik: 18, plakaUzun: 2800, plakaKisa: 2100, bant: 1, damar: false, plakaFiyati: 3200, bantFiyati: 18, islemFiyatiM2: 0 },
      { id: 'lake18', ad: 'MDF Lake 18mm (boyalı)', tur: 'MDF Lake', kalinlik: 18, plakaUzun: 2800, plakaKisa: 2100, bant: 0, damar: false, plakaFiyati: 2600, bantFiyati: 0, islemFiyatiM2: 1400 },
      { id: 'akrilik18', ad: 'Akrilik Parlak 18mm', tur: 'Akrilik / parlak', kalinlik: 18, plakaUzun: 2800, plakaKisa: 1220, bant: 1, damar: false, plakaFiyati: 9000, bantFiyati: 30, islemFiyatiM2: 0 },
      { id: 'kp18', ad: 'Kontrplak 18mm', tur: 'Kontrplak', kalinlik: 18, plakaUzun: 2440, plakaKisa: 1220, bant: 0.5, damar: true, plakaFiyati: 3800, bantFiyati: 15, islemFiyatiM2: 0 },
      { id: 'hdf8', ad: 'HDF Beyaz 8mm', tur: 'HDF', kalinlik: 8, plakaUzun: 2800, plakaKisa: 2100, bant: 0, damar: false, plakaFiyati: 950, bantFiyati: 0, islemFiyatiM2: 0 },
      { id: 'hdf4', ad: 'HDF Beyaz 4mm', tur: 'HDF', kalinlik: 4, plakaUzun: 2800, plakaKisa: 2100, bant: 0, damar: false, plakaFiyati: 650, bantFiyati: 0, islemFiyatiM2: 0 },
      // Cam ve ayna: plakaya yerleştirilmez, m² fiyatıyla (işlem fiyatı alanı) hesaplanır.
      { id: 'cam4', ad: 'Şeffaf temperli cam 4mm', tur: 'Cam', kalinlik: 4, plakaUzun: 3210, plakaKisa: 2250, bant: 0, damar: false, plakaFiyati: 0, bantFiyati: 0, islemFiyatiM2: 900 },
      { id: 'cam4f', ad: 'Füme temperli cam 4mm', tur: 'Cam', kalinlik: 4, plakaUzun: 3210, plakaKisa: 2250, bant: 0, damar: false, plakaFiyati: 0, bantFiyati: 0, islemFiyatiM2: 1000 },
      { id: 'cam4b', ad: 'Buzlu (satine) cam 4mm', tur: 'Cam', kalinlik: 4, plakaUzun: 3210, plakaKisa: 2250, bant: 0, damar: false, plakaFiyati: 0, bantFiyati: 0, islemFiyatiM2: 1100 },
      { id: 'cam8', ad: 'Temperli cam raf 8mm', tur: 'Cam', kalinlik: 8, plakaUzun: 3210, plakaKisa: 2250, bant: 0, damar: false, plakaFiyati: 0, bantFiyati: 0, islemFiyatiM2: 1600 },
      { id: 'ayna4', ad: 'Ayna 4mm', tur: 'Ayna', kalinlik: 4, plakaUzun: 3210, plakaKisa: 2250, bant: 0, damar: false, plakaFiyati: 0, bantFiyati: 0, islemFiyatiM2: 800 },
    ],
    kullanim: { govde: 'sl18', kapak: 'mdflam18', cekmece: 'sl16', arkalik: 'hdf8', cam: 'cam4', camRaf: 'cam8', ayna: 'ayna4' },
    hirdavat: { baglanti: 'minifix', araBaglanti: 'ayni', mentese: 'frenli', ray: 'bilyeli', kulp: 'kulp', ayak: 'plastik' },
    // Fiyat ve maliyet (TL, KDV hariç). Tüm fiyatlar örnektir.
    fiyat: {
      hirdavat: {},             // kod -> birim fiyat (boşsa katalog örnek fiyatı)
      plakaHesabi: 'tam',       // 'tam': yerleşimdeki tam plaka sayısı, 'alan': net alan + fire
      alanFire: 15,             // % (alan hesabında)
      bantFire: 10,             // %
      ebatlamaPlaka: 150,       // plaka başı kesim (ebatlama) ücreti
      bantCekmeM: 12,           // metre başı bant çekme ücreti
      atolyeIscilikModul: 1500, // modül başı atölye işçiliği
      montajModul: 750,         // modül başı yerinde montaj
      nakliye: 2000,            // proje başı
      ekKalemler: [],           // [{ ad, tutar }] tezgah, cam, LED vb.
      karOrani: 30,             // %
      kdvOrani: 20,             // %
    },
    firma: { ad: '', telefon: '', adres: '' },
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
    profilCamPay: 18,         // alüminyum profilli kapakta camın her kenardan küçülmesi
    cerceveEni: 70,           // MDF çerçeveli cam kapakta çerçeve eni
    camLambaPayi: 8,          // çerçeve lambasına giren cam payı (her kenar)
    surguBindirme: 30,        // sürgü kapakların üst üste binme payı
    surguYukseklikPay: 40,    // sürgü kapak yüksekliğinin gövdeden kısalığı (ray payı)
  };

  // ---------- Katalog (hazır modüller) ----------
  const S = (tip, yukseklik, adet, ek) => Object.assign({ tip, yukseklik, adet: adet || 1, raf: 0, dikme: 0, aski: false, kapakTuru: 'panel', acilim: 'yana', rafTipi: 'ahsap', led: false }, ek || {});
  const SUT = (genislik, satirlar) => ({ genislik, satirlar });
  const AYAK = (h) => ({ tip: 'ayak', yukseklik: h || 100, geriCekme: 50 });
  const BAZA = (h, gc) => ({ tip: 'panel', yukseklik: h || 80, geriCekme: gc == null ? 40 : gc });
  const YOK = { tip: 'yok', yukseklik: 0, geriCekme: 0 };
  const G = (grup, ad, aciklama, o) => Object.assign({
    grup, ad, aciklama, tip: 'normal', yapi: 'yanlar_boydan', ust: 'tam', arkalik: 'kanal', kapakTipi: 'tam',
    baza: YOK, montajYuksekligi: 0, korPanel: 0, korTaraf: 'sol', onTipi: 'normal', surguAdet: 2, surguTuru: 'panel', raf: 0,
  }, o);
  const TEK = (...satirlar) => [SUT(null, satirlar)];
  const P = (grup, ad, aciklama, panelTuru, boy, en, ek) => Object.assign({
    grup, ad, aciklama, tip: 'panel', panelTuru, panelMalzeme: 'kapak', boy, en, bantU: 2, bantK: 2, montajYuksekligi: 0,
    genislik: en, yukseklik: boy, derinlik: 0, baza: YOK,
  }, ek || {});
  const ALT = { yukseklik: 870, derinlik: 560, ust: 'kusak', baza: AYAK(100) };
  const UST = { yukseklik: 720, derinlik: 320, montajYuksekligi: 1450 };
  const BOY = { yukseklik: 2150, derinlik: 560, baza: AYAK(100) };

  const PRESETLER = {
    // Mutfak – alt
    alt: G('Mutfak alt', 'Alt Dolap', '1 çekmece + 2 kapak', Object.assign({ genislik: 600, sutunlar: TEK(S('cekmece', 150), S('kapak', null, 2, { raf: 1 })) }, ALT)),
    alt_kapak: G('Mutfak alt', 'Alt Dolap (kapaklı)', '2 kapak, 1 raf', Object.assign({ genislik: 600, sutunlar: TEK(S('kapak', null, 2, { raf: 1 })) }, ALT)),
    alt_tek: G('Mutfak alt', 'Alt Dolap (tek kapak)', 'Dar dolap, 1 kapak', Object.assign({ genislik: 450, sutunlar: TEK(S('cekmece', 150), S('kapak', null, 1, { raf: 1 })) }, ALT)),
    alt_cekmece3: G('Mutfak alt', 'Çekmeceli Alt Dolap (3)', '3 çekmece (tencere)', Object.assign({ genislik: 600, sutunlar: TEK(S('cekmece', 150), S('cekmece', null), S('cekmece', null)) }, ALT)),
    alt_cekmece4: G('Mutfak alt', 'Çekmeceli Alt Dolap (4)', '4 çekmece (çatal-bıçak)', Object.assign({ genislik: 600, sutunlar: TEK(S('cekmece', 150), S('cekmece', 150), S('cekmece', null), S('cekmece', null)) }, ALT)),
    evye: G('Mutfak alt', 'Evye Altı Dolabı', '2 kapak, arkalıksız, raf yok', Object.assign({ genislik: 800, arkalik: 'yok', sutunlar: TEK(S('kapak', null, 2)) }, ALT)),
    firin_alt: G('Mutfak alt', 'Ankastre Fırın Alt Dolabı', 'Fırın nişi + alt çekmece', Object.assign({ genislik: 600, sutunlar: TEK(S('nis', 595), S('cekmece', null)) }, ALT)),
    siselik: G('Mutfak alt', 'Şişelik / Dar Alt Dolap', '150–300 mm dar dolap', Object.assign({ genislik: 200, sutunlar: TEK(S('kapak', null, 1, { raf: 2 })) }, ALT)),
    korkose: G('Mutfak alt', 'Kör Köşe Alt Dolap', 'Köşede kör panelli dolap', Object.assign({ genislik: 900, korPanel: 560, sutunlar: TEK(S('kapak', null, 1, { raf: 1 })) }, ALT)),
    lkose: G('Mutfak alt', 'L Köşe Alt Dolap', 'Katlanır kapaklı köşe', { tip: 'lkose', genislik: 900, genislik2: 900, yukseklik: 870, derinlik: 560, arkalik: 'cakma', raf: 1, baza: AYAK(100) }),
    ada: G('Mutfak alt', 'Mutfak Adası', 'Çekmeceler + kapaklı bölme', { genislik: 1200, yukseklik: 900, derinlik: 600, baza: BAZA(100, 50), sutunlar: [SUT(null, [S('cekmece', 150), S('cekmece', null), S('cekmece', null)]), SUT(null, [S('cekmece', 150), S('kapak', null, 2, { raf: 1 })])] }),
    // Mutfak – üst
    ust: G('Mutfak üst', 'Üst Dolap', '2 kapak, 2 raf', Object.assign({ genislik: 600, sutunlar: TEK(S('kapak', null, 2, { raf: 2 })) }, UST)),
    ust_tek: G('Mutfak üst', 'Üst Dolap (tek kapak)', '1 kapak, 2 raf', Object.assign({ genislik: 400, sutunlar: TEK(S('kapak', null, 1, { raf: 2 })) }, UST)),
    ust_cam: G('Mutfak üst', 'Camlı Üst Dolap (vitrin)', 'Profil cam kapak, cam raf, LED', Object.assign({ genislik: 800, sutunlar: TEK(S('kapak', null, 2, { raf: 2, kapakTuru: 'cam_profil', rafTipi: 'cam', led: true })) }, UST)),
    ust_klapa: G('Mutfak üst', 'Kaldırmalı Kapaklı Üst Dolap', 'Yukarı açılan kapak', { genislik: 800, yukseklik: 360, derinlik: 320, montajYuksekligi: 1810, sutunlar: TEK(S('kapak', null, 1, { acilim: 'yukari' })) }),
    aspirator: G('Mutfak üst', 'Aspiratör Üstü Dolap', 'Kısa, yukarı açılan', { genislik: 600, yukseklik: 400, derinlik: 320, montajYuksekligi: 1770, sutunlar: TEK(S('kapak', null, 1, { acilim: 'yukari' })) }),
    buzdolabi_ust: G('Mutfak üst', 'Buzdolabı Üstü Dolap', 'Derin, kısa dolap', { genislik: 600, yukseklik: 400, derinlik: 560, montajYuksekligi: 1800, sutunlar: TEK(S('kapak', null, 2)) }),
    ust_acik: G('Mutfak üst', 'Açık Raflı Üst Ünite', 'Kapaksız, 2 raf', Object.assign({ genislik: 600, sutunlar: TEK(S('acik', null, 1, { raf: 2 })) }, UST)),
    lkoseust: G('Mutfak üst', 'L Köşe Üst Dolap', 'Katlanır kapaklı köşe', { tip: 'lkose', genislik: 600, genislik2: 600, yukseklik: 720, derinlik: 320, montajYuksekligi: 1450, arkalik: 'cakma', raf: 2 }),
    // Mutfak – boy
    boy_firin: G('Mutfak boy', 'Boy Dolap – Fırın + Mikrodalga', 'Ankastre fırın ve mikrodalga nişli', Object.assign({ genislik: 600, sutunlar: TEK(S('kapak', null, 1, { raf: 1 }), S('nis', 380), S('nis', 595), S('cekmece', 180), S('cekmece', 180)) }, BOY)),
    boy_kiler: G('Mutfak boy', 'Kiler Boy Dolap', 'Üst ve alt kapaklı, bol raflı', Object.assign({ genislik: 600, sutunlar: TEK(S('kapak', 700, 1, { raf: 1 }), S('kapak', null, 1, { raf: 4 })) }, BOY)),
    kahve: G('Mutfak boy', 'Kahve Köşesi', 'Cam kapak, LED\'li makine nişi, çekmece', Object.assign({ genislik: 800, sutunlar: TEK(S('kapak', 600, 2, { kapakTuru: 'cam_profil', raf: 1, rafTipi: 'cam', led: true }), S('acik', 450, 1, { led: true }), S('cekmece', 180, 2), S('kapak', null, 2, { raf: 1 })) }, BOY)),
    buzdolabi_kabin: G('Mutfak boy', 'Ankastre Buzdolabı Kabini', 'Buzdolabı nişi + üst dolap', Object.assign({ genislik: 600, sutunlar: TEK(S('kapak', 400, 1), S('nis', null)) }, BOY)),
    // Yatak odası
    gardirop: G('Yatak odası', 'Gardırop (2 kapak)', 'Üst bölme + askı', { genislik: 1000, yukseklik: 2400, derinlik: 580, yapi: 'tabla_boydan', baza: BAZA(80, 40), sutunlar: TEK(S('kapak', 400, 2), S('kapak', null, 2, { aski: true })) }),
    gardirop3: G('Yatak odası', 'Gardırop (3 kapak)', 'Raflı bölme + askı bölmesi', { genislik: 1500, yukseklik: 2400, derinlik: 580, yapi: 'tabla_boydan', baza: BAZA(80, 40), sutunlar: [SUT(476, [S('kapak', 400, 1), S('kapak', null, 1, { raf: 5 })]), SUT(null, [S('kapak', 400, 2), S('kapak', null, 2, { aski: true })])] }),
    gardirop4: G('Yatak odası', 'Gardırop (4 kapak)', 'Raf + askı + çekmeceli raf', { genislik: 2000, yukseklik: 2400, derinlik: 580, yapi: 'tabla_boydan', baza: BAZA(80, 40), sutunlar: [SUT(476, [S('kapak', 400, 1), S('kapak', null, 1, { raf: 5 })]), SUT(null, [S('kapak', 400, 2), S('kapak', null, 2, { aski: true })]), SUT(476, [S('kapak', 400, 1), S('kapak', null, 1, { raf: 3 }), S('cekmece', 200, 1), S('cekmece', 200, 1)])] }),
    surgulu: G('Yatak odası', 'Sürgülü Gardırop (2 kapak)', 'Askı + raf + iç çekmece', { genislik: 1800, yukseklik: 2400, derinlik: 650, yapi: 'tabla_boydan', baza: BAZA(80, 40), onTipi: 'surgu', surguAdet: 2, sutunlar: [SUT(null, [S('acik', 400), S('acik', null, 1, { aski: true })]), SUT(null, [S('acik', 400), S('acik', null, 1, { raf: 3 }), S('cekmece', 200), S('cekmece', 200)])] }),
    surgulu_ayna: G('Yatak odası', 'Sürgülü Aynalı Gardırop (3 kapak)', 'Aynalı sürgü kapaklar', { genislik: 2400, yukseklik: 2400, derinlik: 650, yapi: 'tabla_boydan', baza: BAZA(80, 40), onTipi: 'surgu', surguAdet: 3, surguTuru: 'ayna', sutunlar: [SUT(null, [S('acik', 400), S('acik', null, 1, { aski: true })]), SUT(null, [S('acik', 400), S('acik', null, 1, { raf: 4 })]), SUT(null, [S('acik', 400), S('acik', null, 1, { aski: true })])] }),
    sifonyer: G('Yatak odası', 'Şifonyer', '4 çekmece', { genislik: 800, yukseklik: 900, derinlik: 450, yapi: 'tabla_boydan', baza: AYAK(60), sutunlar: TEK(S('cekmece', null), S('cekmece', null), S('cekmece', null), S('cekmece', null)) }),
    komodin: G('Yatak odası', 'Komodin', '2 çekmece', { genislik: 450, yukseklik: 500, derinlik: 400, yapi: 'tabla_boydan', baza: AYAK(60), sutunlar: TEK(S('cekmece', null), S('cekmece', null)) }),
    makyaj: G('Yatak odası', 'Makyaj / Çalışma Ünitesi', 'Çekmeceli yan ünite', { genislik: 400, yukseklik: 720, derinlik: 500, yapi: 'tabla_boydan', baza: AYAK(60), sutunlar: TEK(S('cekmece', 150), S('cekmece', null), S('cekmece', null)) }),
    // Banyo
    lavabo: G('Banyo', 'Lavabo Altı Dolabı', '2 kapak, arkalıksız', { genislik: 800, yukseklik: 550, derinlik: 450, arkalik: 'yok', baza: AYAK(100), sutunlar: TEK(S('kapak', null, 2)) }),
    lavabo_cekmece: G('Banyo', 'Lavabo Altı Çekmeceli', '2 çekmece', { genislik: 800, yukseklik: 550, derinlik: 450, arkalik: 'yok', baza: AYAK(100), sutunlar: TEK(S('cekmece', 180), S('cekmece', null)) }),
    banyo_boy: G('Banyo', 'Banyo Boy Dolabı', 'Dar, raflı boy dolap', { genislik: 400, yukseklik: 1700, derinlik: 300, baza: AYAK(100), sutunlar: TEK(S('kapak', null, 1, { raf: 4 })) }),
    aynali: G('Banyo', 'Aynalı Banyo Dolabı', 'Ayna kapak, cam raf', { genislik: 600, yukseklik: 700, derinlik: 150, montajYuksekligi: 1200, sutunlar: TEK(S('kapak', null, 2, { kapakTuru: 'ayna', raf: 2, rafTipi: 'cam' })) }),
    // Salon
    tv: G('Salon', 'TV Ünitesi', 'Kapak + açık niş + çekmece + kapak', { genislik: 1800, yukseklik: 500, derinlik: 420, yapi: 'tabla_boydan', baza: AYAK(60), sutunlar: [SUT(450, [S('kapak', null, 1)]), SUT(null, [S('acik', 200), S('cekmece', null)]), SUT(450, [S('kapak', null, 1)])] }),
    vitrin: G('Salon', 'Vitrin', 'Çerçeveli cam kapak, cam raf, LED', { genislik: 800, yukseklik: 2000, derinlik: 400, baza: BAZA(80, 30), sutunlar: TEK(S('kapak', 1300, 2, { kapakTuru: 'cam_cerceve', raf: 3, rafTipi: 'cam', led: true }), S('kapak', null, 2, { raf: 1 })) }),
    bufe: G('Salon', 'Büfe / Konsol', 'Kapaklı bölme + çekmeceler', { genislik: 1600, yukseklik: 800, derinlik: 450, yapi: 'tabla_boydan', baza: AYAK(100), sutunlar: [SUT(null, [S('kapak', null, 2, { raf: 1 })]), SUT(null, [S('cekmece', null), S('cekmece', null), S('cekmece', null)])] }),
    kitaplik: G('Salon', 'Kitaplık', 'Açık raflar + alt kapak', { genislik: 800, yukseklik: 2000, derinlik: 300, arkalik: 'cakma', baza: BAZA(60, 30), sutunlar: TEK(S('acik', null, 1, { raf: 3, dikme: 1 }), S('kapak', 700, 2, { raf: 1 })) }),
    // Antre
    ayakkabilik: G('Antre', 'Ayakkabılık', 'Üst çekmeceler + raflı kapaklar', { genislik: 900, yukseklik: 1000, derinlik: 350, baza: AYAK(60), sutunlar: TEK(S('cekmece', 120, 2), S('kapak', null, 2, { raf: 4 })) }),
    vestiyer: G('Antre', 'Vestiyer / Portmanto', 'Açık askılık + kapaklı raf', { genislik: 1200, yukseklik: 2000, derinlik: 400, baza: BAZA(60, 30), sutunlar: [SUT(null, [S('acik', 300, 1, { raf: 0 }), S('acik', null)]), SUT(500, [S('kapak', null, 1, { raf: 5 })])] }),
    // Ofis
    dosya: G('Ofis', 'Dosya Dolabı', 'Cam üst kapak + alt kapak', { genislik: 800, yukseklik: 1900, derinlik: 400, baza: BAZA(60, 30), sutunlar: TEK(S('kapak', 1000, 2, { kapakTuru: 'cam_profil', raf: 2 }), S('kapak', null, 2, { raf: 1 })) }),
    keson: G('Ofis', 'Çekmeceli Keson', 'Tekerlekli, 3 çekmece', { genislik: 400, yukseklik: 600, derinlik: 500, yapi: 'tabla_boydan', baza: { tip: 'tekerlek', yukseklik: 60, geriCekme: 0 }, sutunlar: TEK(S('cekmece', 120), S('cekmece', null), S('cekmece', null)) }),
    // Paneller
    yan_kapama: P('Panel', 'Yan Kapama Paneli', 'Dizinin açık yanına', 'yan_kapama', 870, 580, { bantU: 1, bantK: 1 }),
    dolgu: P('Panel', 'Dolgu Paneli', 'Duvar–dolap arası', 'dolgu', 720, 50, { montajYuksekligi: 1450 }),
    bulasik_panel: P('Panel', 'Bulaşık Makinesi Kapağı', 'Ankastre makine için', 'bulasik', 715, 597, { montajYuksekligi: 100 }),
    duvar_rafi: P('Panel', 'Duvar Rafı', 'Gizli taşıyıcılı', 'raf', 800, 250, { panelMalzeme: 'govde', bantU: 1, bantK: 2, montajYuksekligi: 1500 }),
    tabla: P('Panel', 'Masa / Çalışma Tablası', 'Düz tabla', 'tabla', 1200, 600, { panelMalzeme: 'govde', montajYuksekligi: 730 }),
    baza_bandi: P('Panel', 'Baza (Süpürgelik) Bandı', 'Dolap altı süpürgelik', 'baza', 2400, 100, { bantU: 1, bantK: 0 }),
  };
  const KATALOG_GRUPLARI = ['Mutfak alt', 'Mutfak üst', 'Mutfak boy', 'Yatak odası', 'Banyo', 'Salon', 'Antre', 'Ofis', 'Panel'];

  const kopya = (o) => JSON.parse(JSON.stringify(o));
  const r1 = (x) => Math.round(x * 10) / 10;
  const r3 = (x) => Math.round(x * 1000) / 1000;
  const say = (v, vars) => {
    const n = Number(v);
    return v !== null && v !== '' && Number.isFinite(n) ? n : vars;
  };

  function varsayilanAyarlar() {
    return kopya(VARSAYILAN_AYARLAR);
  }

  let sayac = 0;
  const yeniId = (on) => on + Date.now().toString(36) + (sayac++).toString(36);

  function yeniMalzeme() {
    return { id: yeniId('mz'), ad: 'Yeni malzeme 18mm', tur: 'Suntalam', kalinlik: 18, plakaUzun: 2800, plakaKisa: 2100, bant: 0.8, damar: false, plakaFiyati: 0, bantFiyati: 0, islemFiyatiM2: 0 };
  }

  const yeniSatir = (tip) => satirNormallestir(S(tip, tip === 'cekmece' ? 180 : null, tip === 'kapak' ? 2 : 1, { raf: tip === 'kapak' || tip === 'acik' ? 1 : 0 }));

  // ---------- Veri doğrulama ----------
  // Proje dosyası ve tarayıcı kaydı dışarıdan gelir: her alan beklenen türe
  // zorlanır, bilinmeyen alanlar atılır. Böylece arayüze yalnızca sayı, izinli
  // seçenek ve güvenli kimlik ulaşır.
  const sayiAl = (v, vars, min, max) => {
    const n = Number(v);
    if (v === null || v === '' || typeof v === 'boolean' || !Number.isFinite(n)) return vars;
    return Math.min(max == null ? Infinity : max, Math.max(min == null ? -Infinity : min, n));
  };
  const metinAl = (v, vars, uzunluk) => (typeof v === 'string' || typeof v === 'number' ? String(v).slice(0, uzunluk || 120) : vars);
  const secenekAl = (v, izinli, vars) => (izinli.includes(v) ? v : vars);
  const ID_DESENI = /^[A-Za-z0-9_-]{1,40}$/;
  const kimlikAl = (v, on) => (typeof v === 'string' && ID_DESENI.test(v) ? v : yeniId(on));

  function malzemeNormallestir(m) {
    const v = yeniMalzeme();
    return {
      id: kimlikAl(m && m.id, 'mz'),
      ad: metinAl(m && m.ad, v.ad, 80),
      tur: secenekAl(m && m.tur, MALZEME_TURLERI, 'Diğer'),
      kalinlik: sayiAl(m && m.kalinlik, 18, 1, 100),
      plakaUzun: sayiAl(m && m.plakaUzun, 2800, 100, 10000),
      plakaKisa: sayiAl(m && m.plakaKisa, 2100, 100, 10000),
      bant: sayiAl(m && m.bant, 0, 0, 5),
      damar: !!(m && m.damar),
      plakaFiyati: sayiAl(m && m.plakaFiyati, 0, 0),
      bantFiyati: sayiAl(m && m.bantFiyati, 0, 0),
      islemFiyatiM2: sayiAl(m && m.islemFiyatiM2, 0, 0),
    };
  }

  function satirNormallestir(r) {
    const s = r || {};
    const h = sayiAl(s.yukseklik, null, 0, 5000);
    return {
      tip: secenekAl(s.tip, Object.keys(SATIR_TIPLERI), 'kapak'),
      yukseklik: h > 0 ? h : null,
      adet: Math.floor(sayiAl(s.adet, 1, 1, 8)),
      raf: Math.floor(sayiAl(s.raf, 0, 0, 20)),
      dikme: Math.floor(sayiAl(s.dikme, 0, 0, 8)),
      aski: !!s.aski,
      kapakTuru: secenekAl(s.kapakTuru, Object.keys(KAPAK_TURLERI), 'panel'),
      acilim: secenekAl(s.acilim, Object.keys(ACILIMLAR), 'yana'),
      rafTipi: secenekAl(s.rafTipi, ['ahsap', 'cam'], 'ahsap'),
      led: !!s.led,
    };
  }

  function sutunNormallestir(c) {
    const x = c || {};
    const w = sayiAl(x.genislik, null, 0, 10000);
    return { genislik: w > 0 ? w : null, satirlar: (Array.isArray(x.satirlar) ? x.satirlar : []).slice(0, 20).map(satirNormallestir) };
  }

  function modulNormallestir(m, ayar) {
    const x = m || {};
    const malzIdleri = ayar.malzemeler.map((k) => k.id);
    const malzeme = {};
    const hirdavat = {};
    for (const k of KULLANIMLAR) if (x.malzeme && malzIdleri.includes(x.malzeme[k])) malzeme[k] = x.malzeme[k];
    for (const k of Object.keys(HIRDAVAT_SECENEKLERI)) {
      if (x.hirdavat && HIRDAVAT_SECENEKLERI[k].secenekler[x.hirdavat[k]]) hirdavat[k] = x.hirdavat[k];
    }
    const baza = x.baza || {};
    const tip = secenekAl(x.tip, ['normal', 'lkose', 'panel'], 'normal');
    const lk = tip === 'lkose';
    let sutunlar = [];
    if (tip === 'normal') {
      if (Array.isArray(x.sutunlar) && x.sutunlar.length) sutunlar = x.sutunlar.slice(0, 8).map(sutunNormallestir);
      else sutunlar = [sutunNormallestir({ genislik: null, satirlar: x.satirlar })];
    }
    return {
      id: kimlikAl(x.id, 'm'),
      tip,
      ad: metinAl(x.ad, 'Modül', 80),
      adet: Math.floor(sayiAl(x.adet, 1, 1, 999)),
      genislik: sayiAl(x.genislik, 600, 0, 10000),
      genislik2: sayiAl(x.genislik2, 900, 0, 10000),
      yukseklik: sayiAl(x.yukseklik, 720, 0, 5000),
      derinlik: sayiAl(x.derinlik, 560, 0, 3000),
      montajYuksekligi: sayiAl(x.montajYuksekligi, 0, 0, 5000),
      duvar: secenekAl(x.duvar, ['A', 'B'], 'A'),
      yapi: secenekAl(x.yapi, ['yanlar_boydan', 'tabla_boydan'], 'yanlar_boydan'),
      ust: secenekAl(x.ust, ['tam', 'kusak'], 'tam'),
      arkalik: lk ? 'cakma' : secenekAl(x.arkalik, ['kanal', 'cakma', 'yok'], 'kanal'),
      kapakTipi: lk ? 'tam' : secenekAl(x.kapakTipi, ['tam', 'ic'], 'tam'),
      baza: {
        tip: secenekAl(baza.tip, ['yok', 'ayak', 'panel', 'tekerlek'], 'yok'),
        yukseklik: sayiAl(baza.yukseklik, 0, 0, 500),
        geriCekme: sayiAl(baza.geriCekme, 0, 0, 500),
      },
      korPanel: sayiAl(x.korPanel, 0, 0, 2000),
      korTaraf: secenekAl(x.korTaraf, ['sol', 'sag'], 'sol'),
      onTipi: secenekAl(x.onTipi, ['normal', 'surgu'], 'normal'),
      surguAdet: Math.floor(sayiAl(x.surguAdet, 2, 2, 4)),
      surguTuru: secenekAl(x.surguTuru, Object.keys(SURGU_TURLERI), 'panel'),
      raf: Math.floor(sayiAl(x.raf, 0, 0, 20)),
      sutunlar,
      // Panel modül alanları
      panelTuru: secenekAl(x.panelTuru, Object.keys(PANEL_TURLERI), 'serbest'),
      panelMalzeme: secenekAl(x.panelMalzeme, ['kapak', 'govde'], 'kapak'),
      boy: sayiAl(x.boy, 720, 0, 10000),
      en: sayiAl(x.en, 600, 0, 10000),
      bantU: Math.floor(sayiAl(x.bantU, 0, 0, 2)),
      bantK: Math.floor(sayiAl(x.bantK, 0, 0, 2)),
      malzeme,
      hirdavat,
    };
  }

  /** Projeyi doğrular ve eksik alanları varsayılanla tamamlar (yeni nesne döner). */
  function projeyiNormallestir(p) {
    const v = varsayilanAyarlar();
    const g = (p && p.ayarlar) || {};
    const A = {};
    for (const k of Object.keys(v)) {
      if (typeof v[k] === 'number') A[k] = sayiAl(g[k], v[k], 0, 1000);
      else if (typeof v[k] === 'boolean') A[k] = g[k] == null ? v[k] : !!g[k];
    }
    A.malzemeler = (Array.isArray(g.malzemeler) && g.malzemeler.length ? g.malzemeler : v.malzemeler).slice(0, 100).map(malzemeNormallestir);
    const gorulen = new Set();
    for (const m of A.malzemeler) {
      if (gorulen.has(m.id)) m.id = yeniId('mz');
      gorulen.add(m.id);
    }
    A.kullanim = {};
    for (const k of KULLANIMLAR) {
      const id = g.kullanim && g.kullanim[k];
      const vars = A.malzemeler.find((m) => m.id === v.kullanim[k])
        || A.malzemeler.find((m) => (k === 'cam' || k === 'camRaf' || k === 'ayna') === camMi(m))
        || A.malzemeler[0];
      A.kullanim[k] = A.malzemeler.some((m) => m.id === id) ? id : vars.id;
    }
    A.hirdavat = {};
    for (const k of Object.keys(HIRDAVAT_SECENEKLERI)) {
      const x = g.hirdavat && g.hirdavat[k];
      A.hirdavat[k] = HIRDAVAT_SECENEKLERI[k].secenekler[x] ? x : v.hirdavat[k];
    }
    const gf = g.fiyat || {};
    const F = {};
    for (const k of Object.keys(v.fiyat)) if (typeof v.fiyat[k] === 'number') F[k] = sayiAl(gf[k], v.fiyat[k], 0, k.endsWith('Orani') || k.endsWith('Fire') ? 1000 : undefined);
    F.plakaHesabi = secenekAl(gf.plakaHesabi, ['tam', 'alan'], 'tam');
    F.hirdavat = {};
    for (const k of Object.keys(HIRDAVAT_KALEMLERI)) {
      const f = sayiAl(gf.hirdavat && gf.hirdavat[k], null, 0);
      if (f !== null) F.hirdavat[k] = f;
    }
    F.ekKalemler = (Array.isArray(gf.ekKalemler) ? gf.ekKalemler : []).slice(0, 50).map((e) => ({
      ad: metinAl(e && e.ad, 'Ek kalem', 80),
      tutar: sayiAl(e && e.tutar, 0, 0),
    }));
    A.fiyat = F;
    const gfi = g.firma || {};
    A.firma = { ad: metinAl(gfi.ad, '', 80), telefon: metinAl(gfi.telefon, '', 40), adres: metinAl(gfi.adres, '', 200) };

    const moduller = (Array.isArray(p && p.moduller) ? p.moduller : []).slice(0, 300).map((m) => modulNormallestir(m, A));
    const idler = new Set();
    for (const m of moduller) {
      if (idler.has(m.id)) m.id = yeniId('m');
      idler.add(m.id);
    }
    const y = (p && p.yerlesim) || {};
    const t = (p && p.teklif) || {};
    return {
      ad: metinAl(p && p.ad, 'Yeni proje', 80),
      ayarlar: A,
      moduller,
      yerlesim: {
        tip: secenekAl(y.tip, ['duz', 'L'], 'duz'),
        duvarA: sayiAl(y.duvarA, 3600, 0, 50000),
        duvarB: sayiAl(y.duvarB, 2400, 0, 50000),
      },
      teklif: {
        musteri: metinAl(t.musteri, '', 80),
        telefon: metinAl(t.telefon, '', 40),
        adres: metinAl(t.adres, '', 200),
        teklifNo: metinAl(t.teklifNo, '', 40),
        gecerlilikGun: Math.floor(sayiAl(t.gecerlilikGun, 15, 0, 365)),
        teslimSuresi: metinAl(t.teslimSuresi, '', 60),
        not: metinAl(t.not, '', 1000),
      },
    };
  }

  function yeniModul(presetAdi) {
    const p = kopya(PRESETLER[presetAdi] || PRESETLER.alt);
    delete p.id;
    return modulNormallestir(p, VARSAYILAN_AYARLAR);
  }

  function yeniProje(ad) {
    return projeyiNormallestir({ ad: ad || 'Yeni proje', moduller: [yeniModul('alt')] });
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
        const cam = camMi(m);
        parcalar.push({ ad, kullanim, malzeme: m.id, boy: r1(boy), en: r1(en), adet, bant: cam ? { u: 0, k: 0 } : bant || { u: 0, k: 0 }, damar: !cam && !!m.damar, cam });
      },
      /**
       * kod: fiyat kataloğu anahtarı; fiyatMiktari: katalog birimindeki miktar
       * (örn. askı borusu adetle sayılır ama metreyle fiyatlanır).
       */
      hEkle(kod, ad, adet, birim, fiyatMiktari) {
        if (!(adet > 0)) return;
        const fm = fiyatMiktari == null ? adet : fiyatMiktari;
        const var_ = hirdavat.find((h) => h.ad === ad);
        if (var_) {
          var_.adet = r3(var_.adet + adet);
          var_.fiyatMiktari = r3(var_.fiyatMiktari + fm);
        } else hirdavat.push({ kod, ad, adet: r3(adet), birim: birim || 'adet', fiyatMiktari: r3(fm) });
      },
    };
  }

  /**
   * Bağlantı elemanlarını birleşim sayısına göre ekler.
   * tur: minifix | konfirmat | kavela | seffaf_kose | seffaf_t
   */
  function baglantiEkle(T, tur, birlesim, derinlik, tekNoktali) {
    const basina = derinlik < 350 ? 2 : 3;
    const nokta = birlesim * basina + (tekNoktali || 0);
    if (nokta <= 0) return;
    if (tur === 'konfirmat') {
      T.hEkle('konfirmat', 'Konfirmat vida 7×50', nokta);
    } else if (tur === 'kavela') {
      T.hEkle('kavela', 'Kavela 8×35', nokta + birlesim);
      T.hEkle('tutkal', 'Ahşap tutkalı (birleşim)', birlesim + (tekNoktali ? 1 : 0), 'birleşim');
    } else if (tur === 'seffaf_kose' || tur === 'seffaf_t') {
      // Plastik şeffaf bağlantılar her biri 4 sunta vidasıyla tutturulur.
      const ad = tur === 'seffaf_t' ? 'Şeffaf T bağlantı (plastik)' : 'Şeffaf köşe bağlantı (plastik)';
      T.hEkle(tur, ad, nokta);
      T.hEkle('sunta_vidasi', 'Sunta vidası 3,5×16', 4 * nokta);
    } else {
      T.hEkle('minifix', 'Minifix (gövde + pim)', nokta, 'takım');
      T.hEkle('kavela', 'Kavela 8×35', nokta);
    }
  }

  /** Ara (T) birleşimlerde kullanılacak bağlantı türü. */
  function araBaglantiTuru(HS) {
    if (HS.araBaglanti !== 'ayni') return HS.araBaglanti;
    return HS.baglanti === 'seffaf_kose' ? 'seffaf_t' : HS.baglanti;
  }

  /** Ön yüz (kapak/çekmece önü) için kulp ve benzeri ekler. */
  function kulpEkle(T, kulpTur, adet, onGenisligi) {
    if (kulpTur === 'gola') T.hEkle('gola', 'Gola profil', (adet * onGenisligi) / 1000, 'm');
    else if (kulpTur === 'basac') T.hEkle('basac', 'Bas-aç mekanizması', adet);
    else if (kulpTur === 'gomme') T.hEkle('kulp_gomme', 'Gömme kulp', adet);
    else T.hEkle('kulp', 'Kulp', adet);
  }

  function mentesheEkle(T, menteseTur, kapakTipi, adet, yarimBini) {
    const bini = kapakTipi === 'ic' ? 'gömme (iç bini)' : yarimBini ? 'yarım bini' : 'tam bini';
    const tur = menteseTur === 'basac' ? 'yaysız' : menteseTur === 'frenli' ? 'frenli' : 'standart';
    const kod = menteseTur === 'basac' ? 'mentese_yaysiz' : menteseTur === 'frenli' ? 'mentese_frenli' : 'mentese_standart';
    T.hEkle(kod, `Menteşe 35mm ${tur}, ${bini}`, adet);
  }

  function bazaEkle(T, baza, hb, W, Ds, t, ayakTur, ayakAdedi) {
    if (baza.tip === 'ayak') {
      T.hEkle('ayak_' + ayakTur, `${HIRDAVAT_SECENEKLERI.ayak.secenekler[ayakTur].ad} (${hb} mm)`, ayakAdedi || (W > 1000 ? 6 : 4));
    } else if (baza.tip === 'tekerlek') {
      T.hEkle('tekerlek', `Tekerlek (${hb} mm)`, 4);
    } else if (baza.tip === 'panel') {
      const gc = say(baza.geriCekme, 0);
      // Baza çerçevesi: ön parça önden geri çekilir, yanlar gövdeyle aynı hizada.
      T.ekle('Baza ön/arka', 'govde', W, hb, 2, { u: 0, k: 0 });
      T.ekle('Baza yanı', 'govde', Ds - gc - 2 * t, hb, 2, { u: 0, k: 0 });
      if (Ds - gc - 2 * t < 100) T.uyarilar.push('Baza yanı çok kısa; baza geri çekme değerini kontrol edin.');
    }
  }

  /**
   * Bir ön kapağın parçalarını kapak türüne göre ekler (panel, cam, profil, çerçeve, ayna).
   * Dönüş: menteşe türü için camlı mı bilgisi.
   */
  function kapakParcalari(T, A, ad, h, w, n, kapakTuru) {
    const { ekle, hEkle } = T;
    if (kapakTuru === 'cam') {
      ekle(`${ad} – cam`, 'cam', h, w, n);
      return 'cam';
    }
    if (kapakTuru === 'ayna') {
      ekle(`${ad} – ayna`, 'ayna', h, w, n);
      return 'cam';
    }
    if (kapakTuru === 'cam_profil') {
      const p = say(A.profilCamPay, 18);
      ekle(`${ad} – profil camı`, 'cam', h - 2 * p, w - 2 * p, n);
      hEkle('al_profil', 'Alüminyum kapak profili', (n * 2 * (h + w)) / 1000, 'm');
      hEkle('profil_kose', 'Profil köşe birleştirme', 4 * n);
      return 'panel';
    }
    if (kapakTuru === 'cam_cerceve') {
      const e = say(A.cerceveEni, 70);
      const lp = say(A.camLambaPayi, 8);
      ekle(`${ad} – çerçeve dikmesi`, 'kapak', h, e, 2 * n, { u: 2, k: 2 });
      ekle(`${ad} – çerçeve kaydı`, 'kapak', w - 2 * e, e, 2 * n, { u: 2, k: 0 });
      ekle(`${ad} – çerçeve camı`, 'cam', h - 2 * e + 2 * lp - 2, w - 2 * e + 2 * lp - 2, n);
      hEkle('kavela', 'Kavela 8×35', 8 * n);
      if (w - 2 * e < 80 || h - 2 * e < 80) T.uyarilar.push(`${ad}: çerçeveli cam kapak için kapak çok küçük.`);
      return 'panel';
    }
    ekle(ad, 'kapak', h, w, n, { u: 2, k: 2 });
    return 'panel';
  }

  /**
   * Tek bir modülü hesaplar (modül adedi ile çarpılmamış, tek gövde için).
   * Dönen parçalar: { ad, kullanim, malzeme(id), boy, en, adet, bant:{u,k}, damar, cam }
   *  - boy: parçanın "uzunluk" yönü (damar yönü), en: diğer yön
   *  - bant.u: boy boyunca uzanan (uzun) kenarlardan bantlı olanların sayısı
   *  - bant.k: en boyunca uzanan (kısa) kenarlardan bantlı olanların sayısı
   */
  function modulHesapla(modul, ayar) {
    const A = ayar || VARSAYILAN_AYARLAR;
    const M = malzemeCoz(modul, A);
    const HS = hirdavatCoz(modul, A);
    if (modul.tip === 'lkose') return lKoseHesapla(modul, A, M, HS);
    if (modul.tip === 'panel') return panelHesapla(modul, A, M, HS);

    const T = toplayici(M);
    const { ekle, hEkle, uyarilar } = T;
    const bos = () => ({ parcalar: T.parcalar, hirdavat: T.hirdavat, uyarilar, geo: null, malzemeler: M, hirdavatSecimi: HS });

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
    const surgu = modul.onTipi === 'surgu';
    const ic = modul.kapakTipi === 'ic';
    // Sürgü kapaklı dolapta iç çekmeceler gövde içine gömme yerleşir.
    const icDuzen = ic || surgu;

    if (!(t > 0) || !(tk > 0) || !(ta > 0) || !(tc > 0)) {
      uyarilar.push('Malzeme kalınlığı geçersiz; malzeme ayarlarını kontrol edin.');
      return bos();
    }
    if (W < 2 * t + 50 || Hc < 2 * t + 50 || D < 100) {
      uyarilar.push('Ölçüler çok küçük: genişlik, yükseklik ve derinlik kontrol edilmeli.');
      return bos();
    }

    // Yan derinliği: çakma arkalık gövdenin arkasına çakıldığı için yanlardan düşülür.
    const Ds = modul.arkalik === 'cakma' ? D - ta : D;
    // Ara tabla, dikme ve raflar için kullanılabilir derinlik
    let icDerinlik = Ds;
    if (modul.arkalik === 'kanal') icDerinlik = Ds - say(A.arkalikGeriPay, 10) - ta;
    if (icDuzen) icDerinlik -= tk;

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
    const birlesim = usttam ? 4 : 2; // köşe birleşimleri: alt + üst tablanın iki ucu
    const kusakNokta = usttam ? 0 : 4; // kuşaklar uç başına tek nokta
    let araBirlesim = 0; // T birleşimleri: ara tabla ve dikme uçları

    // ---------- Arkalık ----------
    if (modul.arkalik === 'kanal') {
      const kd = say(A.arkalikKanalDerinligi, 8);
      ekle('Arkalık (kanallı)', 'arkalik', Hc - 2 * t + 2 * (kd - 1), iw + 2 * (kd - 1), 1);
    } else if (modul.arkalik === 'cakma') {
      const p = say(A.arkalikCakmaPay, 2);
      ekle('Arkalık (çakma)', 'arkalik', Hc - 2 * p, W - 2 * p, 1);
      hEkle('arkalik_vida', 'Arkalık vidası / zımba çivisi', Math.ceil((2 * (Hc + W)) / 150));
    }

    bazaEkle(T, baza, hb, W, Ds, t, HS.ayak);

    // ---------- Ön yüz alanı ve kör köşe paneli ----------
    let x0 = icDuzen ? t + g : db;
    let x1 = icDuzen ? W - t - g : W - db;
    const yUst = icDuzen ? Hc - t - g : Hc - db;
    const yAlt = icDuzen ? t + g : db;
    let korPanel = null;
    const kp = say(modul.korPanel, 0);
    if (kp > 0) {
      if (icDuzen) {
        uyarilar.push('Kör köşe paneli yalnızca tam bini kapakla hesaplanır; dikkate alınmadı.');
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
        hEkle('kosebent', 'Bağlantı köşebendi', 4);
      }
    }

    // ---------- Dikey bölmeler (sütunlar) ----------
    const sutunlar = modul.sutunlar && modul.sutunlar.length ? modul.sutunlar : [{ genislik: null, satirlar: [] }];
    const ns = sutunlar.length;
    const icToplam = iw - (ns - 1) * t;
    const genislikler = sutunlar.map((c) => (c.genislik > 0 ? Number(c.genislik) : null));
    const sabitG = genislikler.reduce((a, w) => a + (w || 0), 0);
    const serbestG = genislikler.filter((w) => w === null).length;
    if (serbestG > 0) {
      const kalan = (icToplam - sabitG) / serbestG;
      if (kalan < 100) uyarilar.push(`Genişliği otomatik bölmelere yalnızca ${r1(kalan)} mm kalıyor; bölme genişliklerini azaltın.`);
      for (let i = 0; i < ns; i++) if (genislikler[i] === null) genislikler[i] = kalan;
    } else if (Math.abs(sabitG - icToplam) > 0.5) {
      uyarilar.push(`Bölme genişlikleri toplamı (${r1(sabitG)}) iç genişlikten (${r1(icToplam)}) farklı; fark son bölmeye eklendi.`);
      genislikler[ns - 1] += icToplam - sabitG;
    }
    if (ns > 1) {
      ekle('Bölme dikmesi (boydan)', 'govde', Hc - 2 * t, icDerinlik, ns - 1, { u: 1, k: 0 });
      araBirlesim += 2 * (ns - 1);
    }

    const ray = HIRDAVAT_SECENEKLERI.ray.secenekler[HS.ray];
    const geoSutunlar = [];
    const tumSatirlar = [];
    const tumSinirlar = [];
    const dikmeX = [];
    let ledVar = false;
    let cx = t;

    for (let si = 0; si < ns; si++) {
      const cw = genislikler[si];
      const cx1 = cx;
      const cx2 = cx + cw;
      if (si < ns - 1) dikmeX.push(cx2);
      cx = cx2 + t;
      // Bu bölmenin ön yüz aralığı: tam binide dikme ortasında boşluk, gömmede dikmenin iç yüzleri
      const fx0 = si === 0 ? x0 : icDuzen ? cx1 + g : cx1 - t / 2 + g / 2;
      const fx1 = si === ns - 1 ? x1 : icDuzen ? cx2 - g : cx2 + t / 2 - g / 2;
      const ek = (satirNo) => (ns > 1 ? `bölme ${si + 1}, satır ${satirNo}` : `satır ${satirNo}`);
      if (cw < 100) uyarilar.push(`Bölme ${si + 1}: iç genişlik ${r1(cw)} mm, çok dar.`);

      const satirlar = sutunlar[si].satirlar || [];
      const geoSatirlar = [];
      const sinirlar = [];
      if (satirlar.length) {
        // Satırlar arası yatay panel: art arda iki çekmece dışında her sınırda sabit raf
        const panelVar = [];
        const ayrac = [];
        for (let i = 0; i < satirlar.length - 1; i++) {
          const p = !(satirlar[i].tip === 'cekmece' && satirlar[i + 1].tip === 'cekmece');
          panelVar.push(p);
          ayrac.push(icDuzen && p ? t + 2 * g : g);
        }
        const kullanilabilir = yUst - yAlt - ayrac.reduce((a, b) => a + b, 0);
        const yukseklikler = satirlar.map((s) => {
          const h = Number(s.yukseklik);
          return s.yukseklik === null || s.yukseklik === '' || !Number.isFinite(h) || h <= 0 ? null : h;
        });
        const sabit = yukseklikler.reduce((a, h) => a + (h || 0), 0);
        const serbest = yukseklikler.filter((h) => h === null).length;
        if (serbest > 0) {
          const kalan = (kullanilabilir - sabit) / serbest;
          if (kalan < 60) uyarilar.push(`${ns > 1 ? `Bölme ${si + 1}: o` : 'O'}tomatik yükseklikli satırlara yalnızca ${r1(kalan)} mm kalıyor; sabit yükseklikleri azaltın.`);
          for (let i = 0; i < yukseklikler.length; i++) if (yukseklikler[i] === null) yukseklikler[i] = kalan;
        } else if (Math.abs(sabit - kullanilabilir) > 0.5) {
          uyarilar.push(`${ns > 1 ? `Bölme ${si + 1}: s` : 'S'}atır yükseklikleri toplamı (${r1(sabit)}) kullanılabilir yükseklikten (${r1(kullanilabilir)}) farklı; fark son satıra eklendi.`);
          yukseklikler[yukseklikler.length - 1] += kullanilabilir - sabit;
        }

        let y = yUst;
        const onlar = [];
        for (let i = 0; i < satirlar.length; i++) {
          const h = yukseklikler[i];
          onlar.push({ y2: y, y1: y - h, h });
          if (i < satirlar.length - 1) {
            sinirlar.push({ y: y - h - ayrac[i] / 2, panel: panelVar[i], x1: cx1, x2: cx2 });
            y = y - h - ayrac[i];
          }
        }

        for (let i = 0; i < satirlar.length; i++) {
          const s = satirlar[i];
          const on = onlar[i];
          const icUst = i === 0 ? Hc - t : sinirlar[i - 1].panel ? sinirlar[i - 1].y - t / 2 : sinirlar[i - 1].y;
          const icAlt = i === satirlar.length - 1 ? t : sinirlar[i].panel ? sinirlar[i].y + t / 2 : sinirlar[i].y;
          const icH = icUst - icAlt;
          const n = Math.max(1, Math.floor(say(s.adet, 1)));
          const dikme = s.tip === 'cekmece' ? n - 1 : s.tip === 'nis' ? 0 : Math.max(0, Math.floor(say(s.dikme, 0)));
          const bolum = dikme + 1;
          const secW = (cw - dikme * t) / bolum;
          const bolumler = [];
          for (let k = 0; k < bolum; k++) {
            const bx = cx1 + k * (secW + t);
            bolumler.push({ x1: bx, x2: bx + secW });
          }
          const satirDikmeX = [];
          for (let k = 0; k < dikme; k++) satirDikmeX.push(cx1 + (k + 1) * secW + k * t);

          const kapakTuru = s.tip === 'kapak' ? s.kapakTuru || 'panel' : 'panel';
          const acilim = s.tip === 'kapak' ? s.acilim || 'yana' : 'yana';
          const geo = {
            tip: s.tip, sutun: si, on, icUst, icAlt, icH, bolumler, dikmeX: satirDikmeX, onler: [], raflar: [], cekmeceler: [],
            aski: false, kapakTuru, acilim, rafTipi: s.rafTipi || 'ahsap', led: !!s.led,
          };

          if (dikme > 0) {
            ekle(`Ara dikme (${ek(i + 1)})`, 'govde', icH, icDerinlik, dikme, { u: 1, k: 0 });
            araBirlesim += 2 * dikme;
          }
          if (secW > 0 && secW < 100) uyarilar.push(`${ek(i + 1)}: bölme iç genişliği ${r1(secW)} mm, çok dar.`);

          // Ön yüzler. Sürgü kapaklı dolapta kapak satırlarının ön yüzü yoktur (sürgü kapak kapatır).
          const onVar = s.tip === 'cekmece' || (s.tip === 'kapak' && !surgu);
          if (onVar) {
            const ayr = icDuzen && n > 1 && dikme >= n - 1 ? t + 2 * g : g;
            const fw = (fx1 - fx0 - (n - 1) * ayr) / n;
            for (let k = 0; k < n; k++) {
              const fx = fx0 + k * (fw + ayr);
              geo.onler.push({ x1: fx, x2: fx + fw });
            }
            if (s.tip === 'kapak') {
              const camli = kapakParcalari(T, A, `Kapak (${ek(i + 1)})`, on.h, fw, n, kapakTuru) === 'cam';
              kulpEkle(T, HS.kulp, n, fw);
              if (acilim === 'yukari') {
                mentesheEkle(T, HS.mentese, modul.kapakTipi, 2 * n, false);
                hEkle('kapak_kaldirma', 'Kapak kaldırma mekanizması', n, 'takım');
                if (on.h > 600) uyarilar.push(`${ek(i + 1)}: yukarı kalkan kapak ${r1(on.h)} mm; 600 mm üstü için katlanır kaldırma sistemi gerekir.`);
              } else if (acilim === 'asagi') {
                hEkle('klapa_mentese', 'Klapa menteşesi', 2 * n);
                hEkle('klapa_kol', 'Klapa taşıma kolu', n, 'takım');
              } else {
                if (fw > 600) uyarilar.push(`${ek(i + 1)}: kapak genişliği ${r1(fw)} mm; 600 mm üstü kapaklar sarkma yapabilir, kapak adedini artırın.`);
                const adet = n * mentesheAdedi(on.h);
                if (camli) hEkle('mentese_cam', 'Cam kapak menteşesi', adet);
                else mentesheEkle(T, HS.mentese, modul.kapakTipi, adet, !icDuzen && dikme > 0 && n > 1);
                if (!icDuzen && dikme > 0 && n > 1 && !camli) uyarilar.push(`${ek(i + 1)}: ara dikmeye bağlanan kapaklarda yarım bini menteşe kullanılmalı.`);
              }
            } else {
              ekle(`Çekmece önü (${ek(i + 1)})`, 'kapak', on.h, fw, n, { u: 2, k: 2 });
              kulpEkle(T, HS.kulp, n, fw);
            }
          }

          // Raflar, askı, LED
          if (s.tip === 'kapak' || s.tip === 'acik') {
            const raf = Math.max(0, Math.floor(say(s.raf, 0)));
            if (raf > 0) {
              const yb = say(A.rafYanBosluk, 1);
              const rafD = icDerinlik - say(A.rafOnGeriCekme, 20);
              if (s.rafTipi === 'cam') {
                ekle(`Cam raf (${ek(i + 1)})`, 'camRaf', secW - 2 * yb - 2, rafD, raf * bolum);
                hEkle('cam_raf_pimi', 'Cam raf pimi', 4 * raf * bolum);
                if (secW > 800) uyarilar.push(`${ek(i + 1)}: cam raf açıklığı ${r1(secW)} mm; 800 mm üstü için daha kalın cam veya ara dikme önerilir.`);
              } else {
                ekle(`Raf (${ek(i + 1)})`, 'govde', secW - 2 * yb, rafD, raf * bolum, { u: 1, k: 0 });
                hEkle('raf_pimi', 'Raf pimi', 4 * raf * bolum);
                if (secW > 900) uyarilar.push(`${ek(i + 1)}: raf açıklığı ${r1(secW)} mm; ${t} mm rafta sehim olur, ara dikme ekleyin.`);
              }
              for (let j = 1; j <= raf; j++) geo.raflar.push(icAlt + (j * icH) / (raf + 1));
            }
            if (s.aski) {
              geo.aski = true;
              hEkle('aski_borusu', `Askı borusu (${r1(secW - 2)} mm)`, bolum, 'adet', (bolum * (secW - 2)) / 1000);
              hEkle('aski_flans', 'Askı borusu flanşı', 2 * bolum);
              if (icDerinlik < 500) uyarilar.push(`${ek(i + 1)}: askı için iç derinlik ${r1(icDerinlik)} mm; en az 500 mm önerilir.`);
              if (icH < 900) uyarilar.push(`${ek(i + 1)}: askı bölmesi yüksekliği ${r1(icH)} mm; kısa elbise için bile en az 900 mm önerilir.`);
            }
          }
          if (s.led && s.tip !== 'cekmece') {
            ledVar = true;
            const m = (bolum * secW) / 1000;
            hEkle('led_serit', 'LED şerit', m, 'm');
            hEkle('led_profil', 'LED alüminyum profili', m, 'm');
          }
          if (s.tip === 'nis' && icDerinlik < 500 && on.h >= 450) uyarilar.push(`${ek(i + 1)}: cihaz nişi derinliği ${r1(icDerinlik)} mm; ankastre fırın için genelde 550 mm gerekir.`);

          // Çekmeceler
          if (s.tip === 'cekmece') {
            const L = raySec(icDerinlik - 10);
            const kutuH = Math.floor(Math.min(on.h - say(A.cekmeceUstBosluk, 40), icH - 15));
            if (!L) {
              uyarilar.push(`${ek(i + 1)}: iç derinlik (${r1(icDerinlik)} mm) en kısa ray (250 mm) için yetersiz.`);
            } else if (kutuH < 50) {
              uyarilar.push(`${ek(i + 1)}: çekmece kutusu yüksekliği ${kutuH} mm, çok düşük.`);
            } else if (HS.ray === 'metal') {
              // Metal yanlı sistem: yanlar hazır gelir, yalnızca taban ve arkalık kesilir.
              const arkaH = kutuH >= 180 ? 167 : kutuH >= 110 ? 100 : 68;
              ekle(`Çekmece tabanı (${ek(i + 1)})`, 'cekmece', L - ray.boyFark, secW - ray.tabanFark, bolum, { u: 0, k: 0 });
              ekle(`Çekmece arkalığı (${ek(i + 1)})`, 'cekmece', secW - ray.arkaFark, arkaH, bolum, { u: 1, k: 0 });
              hEkle('cekmece_metal', `Metal yanlı çekmece seti ${L} mm (arka yük. ${arkaH})`, bolum, 'takım');
              uyarilar.push(`${ek(i + 1)}: metal yanlı çekmece ölçüleri genel değerlerdir; kullandığınız markanın kataloğuyla kontrol edin.`);
              for (const b of bolumler) geo.cekmeceler.push({ x1: b.x1 + 5, x2: b.x2 - 5, y1: icAlt + 10, y2: icAlt + 10 + arkaH, L, kutuW: secW - 10, kutuH: arkaH });
            } else {
              const kutuW = secW - 2 * ray.yanBosluk;
              const kutuL = L - ray.kutuBoyFark;
              ekle(`Çekmece yanı (${ek(i + 1)})`, 'cekmece', kutuL, kutuH, 2 * bolum, { u: 1, k: 0 });
              ekle(`Çekmece ön/arka (${ek(i + 1)})`, 'cekmece', kutuW - 2 * tc, kutuH, 2 * bolum, { u: 1, k: 0 });
              ekle(`Çekmece tabanı (${ek(i + 1)})`, 'arkalik', kutuL, kutuW, bolum);
              hEkle('ray_' + HS.ray, `${ray.ad} ${L} mm`, bolum, 'takım');
              for (const b of bolumler) geo.cekmeceler.push({ x1: b.x1 + ray.yanBosluk, x2: b.x2 - ray.yanBosluk, y1: icAlt + 10, y2: icAlt + 10 + kutuH, L: kutuL, kutuW, kutuH });
            }
            if (HS.kulp === 'basac' && L) hEkle('basac_ray', 'Ray için bas-aç adaptörü', bolum);
          }
          geoSatirlar.push(geo);
          tumSatirlar.push(geo);
        }

        // Satırlar arası sabit raflar (ara tabla)
        const araTabla = sinirlar.filter((b) => b.panel).length;
        if (araTabla > 0) {
          ekle(ns > 1 ? `Ara tabla (bölme ${si + 1})` : 'Ara tabla (sabit raf)', 'govde', cw, icDerinlik, araTabla, { u: 1, k: 0 });
          araBirlesim += 2 * araTabla;
        }
      }
      for (const b of sinirlar) tumSinirlar.push(b);
      geoSutunlar.push({ x1: cx1, x2: cx2, fx0, fx1, satirlar: geoSatirlar, sinirlar });
    }
    if (ledVar) hEkle('led_adaptor', 'LED adaptörü', 1);

    // ---------- Sürgü kapaklar ----------
    let geoSurgu = null;
    if (surgu) {
      const n = Math.max(2, Math.floor(say(modul.surguAdet, 2)));
      const bind = say(A.surguBindirme, 30);
      const kH = Hc - say(A.surguYukseklikPay, 40);
      const kW = (W + (n - 1) * bind) / n;
      if (modul.surguTuru === 'ayna' || modul.surguTuru === 'cam_profil') {
        const p = say(A.profilCamPay, 18);
        ekle(modul.surguTuru === 'ayna' ? 'Sürgü kapak – ayna' : 'Sürgü kapak – cam', modul.surguTuru === 'ayna' ? 'ayna' : 'cam', kH - 2 * p, kW - 2 * p, n);
        hEkle('al_profil', 'Alüminyum kapak profili', (n * 2 * (kH + kW)) / 1000, 'm');
        hEkle('profil_kose', 'Profil köşe birleştirme', 4 * n);
      } else {
        ekle('Sürgü kapak', 'kapak', kH, kW, n, { u: 2, k: 2 });
      }
      hEkle('surgu_ray', 'Sürgü kapak ray profili (alt + üst)', (2 * W) / 1000, 'm');
      hEkle('surgu_takim', 'Sürgü kapak tekerlek takımı', n, 'kapak');
      kulpEkle(T, HS.kulp === 'kulp' ? 'gomme' : HS.kulp, n, kW);
      if (kW > 1200) uyarilar.push(`Sürgü kapak genişliği ${r1(kW)} mm; kapak adedini artırın.`);
      if (D < 600) uyarilar.push(`Sürgü kapaklı dolapta askı için derinlik en az 600 mm önerilir (şu an ${D} mm).`);
      const kapaklar = [];
      for (let k = 0; k < n; k++) kapaklar.push({ x1: k * (kW - bind), x2: k * (kW - bind) + kW, arka: k % 2 === 0 });
      geoSurgu = { kapaklar, y1: (Hc - kH) / 2, y2: (Hc + kH) / 2, tur: modul.surguTuru };
    }

    baglantiEkle(T, HS.baglanti, birlesim, Ds, kusakNokta);
    baglantiEkle(T, araBaglantiTuru(HS), araBirlesim, Ds, 0);

    return {
      parcalar: T.parcalar,
      hirdavat: T.hirdavat,
      uyarilar,
      malzemeler: M,
      hirdavatSecimi: HS,
      geo: {
        W, H, D, Hc, hb, t, ta, Ds, icDerinlik, tk, db,
        kapakTipi: modul.kapakTipi, arkalik: modul.arkalik, ust: modul.ust, yapi: modul.yapi,
        baza: { tip: baza.tip, yukseklik: hb, geriCekme: say(baza.geriCekme, 0) },
        korPanel,
        sutunlar: geoSutunlar,
        dikmeX,
        satirlar: tumSatirlar,
        sinirlar: tumSinirlar,
        surgu: geoSurgu,
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

    if (!(t > 0) || !(tk > 0) || !(ta > 0)) {
      uyarilar.push('Malzeme kalınlığı geçersiz; malzeme ayarlarını kontrol edin.');
      return bos;
    }
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
    hEkle('arkalik_vida', 'Arkalık vidası / zımba çivisi', Math.ceil((2 * (2 * Hc + LA + LB)) / 150));

    if (baza.tip === 'panel') {
      // L baza çerçevesi: ön parçalar kapak düzleminden gc kadar geride, arka parçalar duvar dibinde.
      const gc = say(baza.geriCekme, 0);
      const on = D - gc; // ön çerçevenin köşeye uzaklığı
      ekle('Baza önü – A kolu', 'govde', LA - on, hb, 1);
      ekle('Baza önü – B kolu', 'govde', LB - on - t, hb, 1);
      ekle('Baza arkası – A kolu', 'govde', LA, hb, 1);
      ekle('Baza arkası – B kolu', 'govde', LB - t, hb, 1);
      ekle('Baza yanı (kol ucu)', 'govde', on - 2 * t, hb, 2);
      if (on - 2 * t < 100) uyarilar.push('Baza yanı çok kısa; baza geri çekme değerini kontrol edin.');
    } else if (baza.tip === 'tekerlek') {
      hEkle('tekerlek', `Tekerlek (${hb} mm)`, 6);
    } else {
      bazaEkle(T, baza, hb, Math.max(LA, LB), Ds, t, HS.ayak, 6);
    }

    // Kapaklar
    const kapakH = Hc - 2 * db;
    // B kapağı x = D düzleminde durur; A kapağı onun kalınlığı + boşluk kadar sonra başlar.
    const kapakA = LA - D - tk - g - db;
    const kapakB = LB - D - db;
    ekle('Köşe kapağı – A kolu', 'kapak', kapakH, kapakA, 1, { u: 2, k: 2 });
    ekle('Köşe kapağı – B kolu', 'kapak', kapakH, kapakB, 1, { u: 2, k: 2 });
    const mn = mentesheAdedi(kapakH);
    mentesheEkle(T, HS.mentese, 'tam', mn, false);
    hEkle('mentese_katlanir', 'Katlanır kapak bağlantı menteşesi (kapak-kapak)', mn);
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
      hEkle('raf_pimi', 'Raf pimi', 6 * raf);
      hEkle('raf_baglanti', 'Raf birleştirme bağlantısı', 2 * raf);
      for (let j = 1; j <= raf; j++) raflar.push(t + (j * (Hc - 2 * t)) / (raf + 1));
    }

    // Birleşim: 4 tabla ucu (köşe) + 2 tabla eki (ara)
    baglantiEkle(T, HS.baglanti, 4, Ds, 0);
    baglantiEkle(T, araBaglantiTuru(HS), 2, Ds, 0);

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

  /**
   * Tek parça panel modülü (yan kapama, dolgu, bulaşık makinesi kapağı, raf, tabla, baza bandı).
   * Yerleşimde kapladığı yer ve görünüş, panel türüne göre yönlendirilir.
   */
  function panelHesapla(modul, A, M, HS) {
    const T = toplayici(M);
    const { ekle, hEkle, uyarilar } = T;
    const tur = modul.panelTuru;
    const kul = modul.panelMalzeme === 'govde' ? 'govde' : 'kapak';
    const t = say(M[kul].kalinlik, 18);
    const boy = say(modul.boy, 0);
    const en = say(modul.en, 0);
    const bos = { parcalar: T.parcalar, hirdavat: T.hirdavat, uyarilar, geo: null, malzemeler: M, hirdavatSecimi: HS };
    if (!(t > 0)) {
      uyarilar.push('Malzeme kalınlığı geçersiz; malzeme ayarlarını kontrol edin.');
      return bos;
    }
    if (boy < 20 || en < 20) {
      uyarilar.push('Panel ölçüleri çok küçük.');
      return bos;
    }
    ekle(PANEL_TURLERI[tur].ad, kul, boy, en, 1, { u: Math.floor(say(modul.bantU, 0)), k: Math.floor(say(modul.bantK, 0)) });
    if (tur === 'bulasik') {
      kulpEkle(T, HS.kulp, 1, en);
      hEkle('bulasik_seti', 'Bulaşık makinesi kapak montaj seti', 1, 'takım');
    } else if (tur === 'raf') {
      hEkle('raf_tasiyici', 'Gizli raf taşıyıcı', Math.max(2, Math.ceil(boy / 400)));
      if (boy > 900 && t < 25) uyarilar.push(`Duvar rafı ${boy} mm uzun; ${t} mm kalınlıkta sehim yapabilir.`);
    } else if (tur === 'yan_kapama' || tur === 'dolgu') {
      hEkle('kosebent', 'Bağlantı köşebendi', tur === 'yan_kapama' ? 4 : 2);
      hEkle('sunta_vidasi', 'Sunta vidası 3,5×16', tur === 'yan_kapama' ? 16 : 8);
    } else if (tur === 'tabla') {
      hEkle('kosebent', 'Bağlantı köşebendi', 4);
      hEkle('sunta_vidasi', 'Sunta vidası 3,5×16', 16);
    }
    // Yerleşim yönü: W duvar boyunca kapladığı yer, D duvardan dışarı, H yükseklik
    let W = en;
    let D = t;
    let H = boy;
    if (tur === 'yan_kapama') { W = t; D = en; H = boy; }
    if (tur === 'raf' || tur === 'tabla') { W = boy; D = en; H = t; }
    return {
      parcalar: T.parcalar, hirdavat: T.hirdavat, uyarilar, malzemeler: M, hirdavatSecimi: HS,
      geo: { panel: true, tur, boy, en, t, W, D, H, bant: { u: modul.bantU, k: modul.bantK }, kullanim: kul, yerlesimDisi: tur === 'baza' },
    };
  }

  /** Bant kalınlığı düşülmüş kesim ölçüsü (camda bant yoktur, net ölçü). */
  function kesimOlcusu(parca, ayar) {
    const A = ayar || VARSAYILAN_AYARLAR;
    const malz = malzemeBul(A, parca.malzeme);
    const bt = A.bantDus && malz && !camMi(malz) ? say(malz.bant, 0) : 0;
    return {
      boy: r1(parca.boy - parca.bant.k * bt),
      en: r1(parca.en - parca.bant.u * bt),
    };
  }

  const montajOf = (m) => Math.max(0, say(m.montajYuksekligi, 0));
  // Zeminden 600 mm'den yüksekte duran modüller asılı (üst) sırada dizilir.
  const ASILI_SINIR = 600;

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
      const secilen = proje.moduller.filter((m) => {
        const s = sonuclar[m.id];
        if (!s || !s.geo || s.geo.yerlesimDisi) return false;
        return sira === 'zemin' ? montajOf(m) <= ASILI_SINIR : montajOf(m) > ASILI_SINIR;
      });
      // Adedi birden fazla olan modül duvarda o kadar yer kaplar: her kopya ayrı dizilir.
      const kopyalar = new Map();
      const uygun = [];
      for (const m of secilen) {
        const n = Math.max(1, Math.floor(say(m.adet, 1)));
        if (m.tip === 'lkose') { uygun.push(m); continue; }
        for (let k = 1; k <= n; k++) {
          const kopya = n > 1 ? Object.assign(Object.create(m), { ad: `${m.ad} (${k}/${n})` }) : m;
          kopyalar.set(kopya, m);
          uygun.push(kopya);
        }
      }
      const kaynak = (x) => kopyalar.get(x) || x;
      const koseler = uygun.filter((m) => m.tip === 'lkose');
      if (L && koseler.some((m) => Math.floor(say(m.adet, 1)) > 1)) uyarilar.push('Yerleşim: L köşe dolabın adedi 1\'den fazla; köşeye yalnızca bir tanesi yerleşir.');
      if (!L && koseler.length) uyarilar.push('Yerleşim: düz yerleşimde L köşe dolap var; köşe dolaplar için L yerleşimi seçin.');
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
        yerler.push({ modul: kose, kaynak: kaynak(kose), duvar: 'kose', sira, bas: 0, W: g.W, W2: g.W2, D: g.D, montaj: montajOf(kose), geo: g });
        x = g.W;
      }
      for (const m of duvarA) {
        const g = sonuclar[m.id].geo;
        yerler.push({ modul: m, kaynak: kaynak(m), duvar: 'A', sira, bas: x, W: g.W, D: g.D, montaj: montajOf(m), geo: g });
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
        yerler.push({ modul: m, kaynak: kaynak(m), duvar: 'B', sira, bas: y, W: g.W, D: g.D, montaj: montajOf(m), geo: g });
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
    for (const m of A.malzemeler) {
      if (!(say(m.kalinlik, 0) > 0)) uyarilar.push(`Malzeme "${m.ad}": kalınlık geçersiz (${m.kalinlik}).`);
      if (!camMi(m) && !(say(m.plakaUzun, 0) >= 100 && say(m.plakaKisa, 0) >= 100)) uyarilar.push(`Malzeme "${m.ad}": plaka ölçüsü geçersiz (${m.plakaUzun}×${m.plakaKisa}).`);
    }
    const modulSonuclari = {};

    for (const m of proje.moduller) {
      const sonuc = modulHesapla(m, A);
      modulSonuclari[m.id] = sonuc;
      const adet = Math.max(1, Math.floor(say(m.adet, 1)));
      for (const u of sonuc.uyarilar) uyarilar.push(`${m.ad}: ${u}`);
      for (const p of sonuc.parcalar) tumParcalar.push(Object.assign({}, p, { adet: p.adet * adet, modul: m.ad }));
      for (const h of sonuc.hirdavat) {
        const onceki = hirdavatMap.get(h.ad);
        if (onceki) {
          onceki.adet = r3(onceki.adet + h.adet * adet);
          onceki.fiyatMiktari = r3(onceki.fiyatMiktari + h.fiyatMiktari * adet);
        } else hirdavatMap.set(h.ad, { kod: h.kod, ad: h.ad, adet: r3(h.adet * adet), birim: h.birim, fiyatMiktari: r3(h.fiyatMiktari * adet) });
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
    // Malzeme sırası: ilk kullanıldığı kullanım türüne göre, sonra kütüphane sırası; cam en sonda
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
      if (!ozet.has(p.malzeme)) ozet.set(p.malzeme, { malzemeId: p.malzeme, malzeme: malz.ad, cam: camMi(malz), alanM2: 0, bantM: 0, bantKalinlik: malz.bant, parcaAdedi: 0 });
      const o = ozet.get(p.malzeme);
      o.alanM2 += (p.boy * p.en * p.adet) / 1e6;
      if (!camMi(malz) && say(malz.bant, 0) > 0) o.bantM += ((p.bant.u * p.boy + p.bant.k * p.en) * p.adet) / 1000;
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
    SATIR_TIPLERI,
    KAPAK_TURLERI,
    ACILIMLAR,
    SURGU_TURLERI,
    PANEL_TURLERI,
    HIRDAVAT_SECENEKLERI,
    HIRDAVAT_KALEMLERI,
    PRESETLER,
    KATALOG_GRUPLARI,
    ASILI_SINIR,
    camMi,
    varsayilanAyarlar,
    yeniModul,
    yeniMalzeme,
    yeniSatir,
    yeniProje,
    projeyiNormallestir,
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

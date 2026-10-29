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
  const MALZEME_TURLERI = ['Suntalam', 'MDF Lam', 'MDF Lake', 'Ham MDF', 'Akrilik / parlak', 'Kontrplak', 'Masif panel', 'HDF', 'Kompakt laminat', 'Lambri / çıta', 'Akustik keçe', 'Cam', 'Ayna', 'Diğer'];
  const camMi = (m) => !!m && (m.tur === 'Cam' || m.tur === 'Ayna');

  const SATIR_TIPLERI = { kapak: 'Kapak', cekmece: 'Çekmece', acik: 'Açık raf', nis: 'Cihaz nişi' };
  /** Masa ayak tipleri. */
  const MASA_AYAKLARI = {
    panel: { ad: 'Yan panel ayak (tabla malzemesinden)' },
    ahsap4: { ad: 'Ahşap 4 ayak (masif, kayıtlı)' },
    metal4: { ad: 'Metal 4 ayak (çerçeveli)' },
    metal_u: { ad: 'Metal U / köprü ayak' },
    x: { ad: 'Metal X ayak' },
    merkez: { ad: 'Merkez tek ayak (yuvarlak masa)' },
  };
  /** Tezgah türleri (3B görünüş rengi ve dokusu). */
  const TEZGAH_TURLERI = {
    beyaz_mermer: { ad: 'Beyaz mermer görünüm (kuvars)', renk: '#ece9e3', doku: 'mermer' },
    gri_kuvars: { ad: 'Gri kuvars', renk: '#a9a8a4', doku: 'mermer' },
    siyah_mermer: { ad: 'Siyah mermer görünüm', renk: '#2f3033', doku: 'mermer' },
    antrasit: { ad: 'Antrasit kompakt', renk: '#45474b', doku: null },
    beton: { ad: 'Beton görünüm', renk: '#b8b3ab', doku: null },
    mese: { ad: 'Masif meşe', renk: '#c9a57a', doku: 'ahsap' },
    ceviz: { ad: 'Ceviz', renk: '#8a5a3c', doku: 'ahsap' },
  };
  /** Kapak yüzey deseni (görünüş + CNC işçiliği). */
  const KAPAK_DESENLERI = { duz: 'Düz', cerceve: 'Çerçeveli (shaker freze)', citali: 'Çıtalı / oluklu (dikey freze)', kemer: 'Kemer desenli (freze)', altin_cita: 'Altın çıta kakmalı' };
  const KULP_RENKLERI = { siyah: '#2b2b2d', altin: '#c9a34a', krom: '#c7cacd', bronz: '#8c6a43', beyaz: '#eeeeea' };
  const KAPAK_TURLERI = { panel: 'Düz panel', cam: 'Cam (çerçevesiz)', cam_profil: 'Alüminyum profil + cam', cam_cerceve: 'MDF çerçeve + cam', ayna: 'Ayna' };
  const KULP_KONUMLARI = { oto: 'Otomatik (alt dolap üstte, üst dolap altta, boy dolap el hizasında)', ust: 'Üstte', orta: 'Ortada', alt: 'Altta' };
  const KULP_YONLERI = { dikey: 'Dikey', yatay: 'Yatay' };
  const ENGEL_TURLERI = {
    pencere: { ad: 'Pencere', alan: true },
    kapi: { ad: 'Kapı', alan: true },
    kolon: { ad: 'Kolon / kiriş', alan: true, derin: true },
    kalorifer: { ad: 'Kalorifer / petek', alan: true },
    priz: { ad: 'Priz / elektrik' },
    su: { ad: 'Su tesisatı' },
    gaz: { ad: 'Gaz vanası' },
    diger: { ad: 'Diğer', alan: true },
  };
  const CEKMECE_ICLERI = { yok: 'Boş', catal: 'Çatal-kaşıklık', bolucu: 'Bölücü seti' };
  const MENTESE_YONLERI = { oto: 'Otomatik', sol: 'Solda', sag: 'Sağda' };
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
    duvar: { ad: 'Duvar kaplama paneli', aciklama: 'Duvara yaslanan dekor panel (TV arkası, yatak başı)' },
    masa: { ad: 'Masa / sehpa', aciklama: 'Tabla ve ayaklar: yan panel, ahşap 4 ayak, metal 4 ayak, U, X ya da merkez ayak; isteğe bağlı kayıt ve bacak paneli' },
    lambri: { ad: 'Lambri', aciklama: 'Belirli aralıkla dizilen çıtalar; isteğe bağlı arka panel (keçe, MDF). Çıta malzemesi "Malzeme" seçiminden, arka panel "Arka panel" seçiminden' },
    bosluk: { ad: 'Boşluk', aciklama: 'Buzdolabı, bulaşık makinesi ya da diz boşluğu için yer tutar; parça çıkmaz' },
    nesne: { ad: 'Eşya / dekor', aciklama: 'Beyaz eşya, elektronik, küçük ev aleti ya da dekor: yalnızca 3B ve çizimde görünür, parça ve maliyet çıkmaz, başka modülleri itmez. Duvarda konum ve yükseklikle yerleştirin' },
  };

  /**
   * 3B ve çizimlerde gösterilen eşya ve dekor nesneleri (ölçüler mm, örnek değerler; serbestçe değiştirilir).
   * W: en, H: yükseklik, D: derinlik, mt: varsayılan zeminden yükseklik, renk: gövde rengi.
   */
  const NESNELER = {
    // Beyaz eşya
    buzdolabi: { grup: 'Beyaz eşya', ad: 'Buzdolabı (tek kapı + dondurucu)', W: 600, H: 1850, D: 650, renk: '#c9ccd0' },
    buzdolabi_genis: { grup: 'Beyaz eşya', ad: 'Gardrop tipi buzdolabı', W: 910, H: 1780, D: 700, renk: '#b9bdc2' },
    bulasik: { grup: 'Beyaz eşya', ad: 'Bulaşık makinesi', W: 600, H: 820, D: 570, renk: '#e9eaec' },
    camasir: { grup: 'Beyaz eşya', ad: 'Çamaşır makinesi', W: 600, H: 850, D: 560, renk: '#f2f3f4' },
    kurutma: { grup: 'Beyaz eşya', ad: 'Kurutma makinesi', W: 600, H: 850, D: 600, renk: '#f2f3f4' },
    derin_dondurucu: { grup: 'Beyaz eşya', ad: 'Derin dondurucu (çekmeceli)', W: 600, H: 850, D: 600, renk: '#eceef0' },
    firin: { grup: 'Beyaz eşya', ad: 'Ankastre fırın', W: 595, H: 595, D: 560, renk: '#3a3d42' },
    mikrodalga: { grup: 'Beyaz eşya', ad: 'Mikrodalga fırın', W: 595, H: 380, D: 400, renk: '#3a3d42' },
    ocak: { grup: 'Beyaz eşya', ad: 'Ankastre ocak', W: 600, H: 50, D: 510, mt: 900, renk: '#1f2124' },
    aspirator: { grup: 'Beyaz eşya', ad: 'Davlumbaz', W: 600, H: 500, D: 480, mt: 1550, renk: '#b9bdc2' },
    kombi: { grup: 'Beyaz eşya', ad: 'Kombi', W: 400, H: 700, D: 300, mt: 1500, renk: '#f4f4f4' },
    // Elektronik
    tv55: { grup: 'Elektronik', ad: 'TV 55"', W: 1230, H: 710, D: 60, mt: 1000, renk: '#18191b' },
    tv65: { grup: 'Elektronik', ad: 'TV 65"', W: 1450, H: 830, D: 60, mt: 950, renk: '#18191b' },
    tv75: { grup: 'Elektronik', ad: 'TV 75"', W: 1680, H: 960, D: 60, mt: 900, renk: '#18191b' },
    soundbar: { grup: 'Elektronik', ad: 'Soundbar', W: 900, H: 65, D: 100, renk: '#2a2b2e' },
    modem: { grup: 'Elektronik', ad: 'Modem', W: 200, H: 40, D: 150, renk: '#f0f0f0' },
    konsol: { grup: 'Elektronik', ad: 'Oyun konsolu', W: 300, H: 90, D: 260, renk: '#f2f2f2' },
    monitor: { grup: 'Elektronik', ad: 'Bilgisayar monitörü', W: 620, H: 450, D: 200, renk: '#222326' },
    yazici: { grup: 'Elektronik', ad: 'Yazıcı', W: 420, H: 250, D: 360, renk: '#d8d9db' },
    klima: { grup: 'Elektronik', ad: 'Klima iç ünitesi', W: 900, H: 300, D: 230, mt: 2100, renk: '#f6f6f6' },
    // Küçük ev aletleri
    kahve: { grup: 'Küçük ev aletleri', ad: 'Kahve makinesi', W: 250, H: 360, D: 400, renk: '#2b2c2f' },
    cay: { grup: 'Küçük ev aletleri', ad: 'Çay makinesi', W: 240, H: 400, D: 240, renk: '#c0c3c7' },
    kettle: { grup: 'Küçük ev aletleri', ad: 'Su ısıtıcı', W: 220, H: 250, D: 180, renk: '#e8e8e8' },
    tost: { grup: 'Küçük ev aletleri', ad: 'Tost makinesi', W: 300, H: 120, D: 340, renk: '#2b2c2f' },
    ekmek: { grup: 'Küçük ev aletleri', ad: 'Ekmek kızartma makinesi', W: 280, H: 200, D: 170, renk: '#c0c3c7' },
    blender: { grup: 'Küçük ev aletleri', ad: 'Blender', W: 180, H: 400, D: 180, renk: '#d0d3d6' },
    robot: { grup: 'Küçük ev aletleri', ad: 'Mutfak robotu', W: 250, H: 360, D: 320, renk: '#e5e5e5' },
    airfryer: { grup: 'Küçük ev aletleri', ad: 'Airfryer', W: 300, H: 330, D: 360, renk: '#2b2c2f' },
    supurge: { grup: 'Küçük ev aletleri', ad: 'Dikey süpürge', W: 260, H: 1150, D: 230, renk: '#7a7f86' },
    robot_supurge: { grup: 'Küçük ev aletleri', ad: 'Robot süpürge', W: 350, H: 100, D: 350, renk: '#2b2c2f' },
    utu: { grup: 'Küçük ev aletleri', ad: 'Ütü', W: 130, H: 150, D: 280, renk: '#6b8fb0' },
    // Mobilya (yalnız görsel)
    yatak_cift: { grup: 'Dekor', ad: 'Çift kişilik yatak', W: 1600, H: 500, D: 2000, renk: '#e8e2d6' },
    yatak_tek: { grup: 'Dekor', ad: 'Tek kişilik yatak', W: 900, H: 450, D: 2000, renk: '#e8e2d6' },
    kanepe: { grup: 'Dekor', ad: 'Kanepe (3 kişilik)', W: 2100, H: 850, D: 900, renk: '#8f9aa6' },
    // Giyim (dolap içi)
    giysi: { grup: 'Giyim', ad: 'Askıda giysiler', W: 800, H: 1000, D: 480, renk: '#5d6d7e' },
    mont: { grup: 'Giyim', ad: 'Kancada mont ve çanta', W: 800, H: 850, D: 250, renk: '#6b4f3a' },
    ayakkabi: { grup: 'Giyim', ad: 'Ayakkabı sırası', W: 800, H: 130, D: 300, renk: '#3b3b3b' },
    katli: { grup: 'Giyim', ad: 'Katlanmış giysiler', W: 300, H: 250, D: 350, renk: '#b9a68f' },
    havlu: { grup: 'Giyim', ad: 'Havlular', W: 300, H: 180, D: 250, renk: '#e9e4da' },
    // Mutfak eşyası
    tabak: { grup: 'Mutfak eşyası', ad: 'Tabak yığını', W: 260, H: 110, D: 260, renk: '#f4f3ef' },
    bardak: { grup: 'Mutfak eşyası', ad: 'Bardak sırası', W: 300, H: 120, D: 80, renk: '#cfe3ea' },
    kavanoz: { grup: 'Mutfak eşyası', ad: 'Kavanozlar', W: 300, H: 180, D: 100, renk: '#d9c9a3' },
    kase: { grup: 'Mutfak eşyası', ad: 'Meyve kasesi', W: 280, H: 120, D: 280, renk: '#c8763a' },
    tahta: { grup: 'Mutfak eşyası', ad: 'Kesme tahtası', W: 350, H: 250, D: 25, renk: '#b8875a' },
    sise: { grup: 'Mutfak eşyası', ad: 'Şişeler', W: 200, H: 260, D: 70, renk: '#6f8f6a' },
    kupa: { grup: 'Mutfak eşyası', ad: 'Kupa', W: 90, H: 100, D: 90, renk: '#d8573f' },
    laptop: { grup: 'Elektronik', ad: 'Dizüstü bilgisayar', W: 330, H: 230, D: 240, renk: '#9aa0a6' },
    saat: { grup: 'Dekor', ad: 'Masa saati', W: 120, H: 120, D: 60, renk: '#2f3a44' },
    // Dekor ve eşya
    kitap: { grup: 'Dekor', ad: 'Kitap sırası', W: 300, H: 240, D: 180, renk: '#8a5a3c' },
    kitap_yatay: { grup: 'Dekor', ad: 'Üst üste kitaplar', W: 260, H: 120, D: 190, renk: '#34465f' },
    vazo: { grup: 'Dekor', ad: 'Vazo', W: 150, H: 300, D: 150, renk: '#9db09a' },
    vazo_uzun: { grup: 'Dekor', ad: 'Uzun vazo', W: 180, H: 550, D: 180, renk: '#c9a57a' },
    biblo: { grup: 'Dekor', ad: 'Biblo', W: 100, H: 160, D: 100, renk: '#e3dccf' },
    saksi: { grup: 'Dekor', ad: 'Saksıda bitki', W: 300, H: 600, D: 300, renk: '#5f8a4c' },
    bitki_buyuk: { grup: 'Dekor', ad: 'Büyük saksı bitkisi', W: 450, H: 1300, D: 450, renk: '#4f7a3f' },
    lamba: { grup: 'Dekor', ad: 'Masa lambası', W: 220, H: 450, D: 220, renk: '#e9dfc9' },
    cerceve: { grup: 'Dekor', ad: 'Fotoğraf çerçevesi', W: 200, H: 250, D: 60, renk: '#3a2e25' },
    tablo: { grup: 'Dekor', ad: 'Duvar tablosu', W: 800, H: 600, D: 30, mt: 1400, renk: '#c58b5c' },
    ayna_duvar: { grup: 'Dekor', ad: 'Duvar aynası', W: 600, H: 900, D: 25, mt: 1100, renk: '#cfdbe3' },
    sepet: { grup: 'Dekor', ad: 'Hasır sepet', W: 350, H: 250, D: 300, renk: '#c8a26b' },
    kutu: { grup: 'Dekor', ad: 'Saklama kutusu', W: 300, H: 200, D: 250, renk: '#ddd6c8' },
    mum: { grup: 'Dekor', ad: 'Mumluk', W: 80, H: 140, D: 80, renk: '#efe7d6' },
    pampas: { grup: 'Dekor', ad: 'Vazoda pampas otu', W: 300, H: 700, D: 300, renk: '#e2d2b0' },
    sandalye: { grup: 'Dekor', ad: 'Sandalye', W: 450, H: 850, D: 520, renk: '#cfc4b3' },
    minder: { grup: 'Dekor', ad: 'Oturak minderi', W: 800, H: 90, D: 380, renk: '#d8ccb8' },
    tepsi: { grup: 'Dekor', ad: 'Dekor tepsi', W: 350, H: 40, D: 220, renk: '#c9a34a' },
    aplik: { grup: 'Aydınlatma', ad: 'Duvar apliği (LED çubuk)', W: 60, H: 600, D: 90, mt: 1400, renk: '#2b2b2d' },
    sarkit: { grup: 'Aydınlatma', ad: 'Sarkıt lamba (cam küre)', W: 220, H: 900, D: 220, mt: 1500, renk: '#c9a34a' },
  };

  /** Panel şekilleri. param: şekle özgü ölçü (etiket), kose: köşe sayısı kullanılır mı. */
  const SEKILLER = {
    dikdortgen: { kisa: 'dikdörtgen', ad: 'Dikdörtgen' },
    egimli: { kisa: 'eğimli', ad: 'Eğimli (yamuk)', param: 'Sağ kenar yüksekliği (mm)', aciklama: 'Sol kenar = boy, sağ kenar = girilen yükseklik; üst kenar eğimli kesilir (çatı altı, merdiven altı).' },
    radyus: { kisa: 'radyüslü', ad: 'Köşe radyüsü', param: 'Radyüs R (mm)', kose: true, aciklama: 'Seçilen sayıda köşe R yarıçapıyla yuvarlatılır.' },
    pah: { kisa: 'pahlı', ad: 'Pah (kesik köşe)', param: 'Pah ölçüsü (mm)', kose: true, aciklama: 'Köşeler 45° düz kesilir.' },
    oval: { kisa: 'oval', ad: 'Oval (elips)', aciklama: 'Boy × en ölçüsünde tam elips.' },
    daire: { kisa: 'daire', ad: 'Daire', aciklama: 'Çap = en; boy dikkate alınmaz.' },
    yarim_daire: { kisa: 'yarım daire', ad: 'Yarım daire', aciklama: 'Düz kenar = en; yükseklik = en / 2.' },
    kapsul: { kisa: 'kapsül', ad: 'Kapsül (iki ucu yarım daire)', aciklama: 'Uzun kenarın iki ucu tam yarım daire; ayna ve panelde trend biçim.' },
    organik: { kisa: 'organik', ad: 'Organik (dalgalı)', param: 'Dalga oranı (%)', aciklama: 'Boy × en kutusuna sığan yumuşak dalgalı biçim (CNC); ayna için.' },
    kemer: { kisa: 'kemerli', ad: 'Kemerli üst (yay)', param: 'Yay yüksekliği f (mm)', aciklama: 'Üst kenar dairesel yay; f yay yüksekliği (sehim).' },
  };

  /**
   * Şekilli panelin geometrisi. W: en, H: boy (yükseklik), p: şekil ölçüsü, n: köşe sayısı.
   * Dönüş: kesim kutusu (plakadan kaba kesim), net alan (mm²), düz ve eğri kenar uzunlukları,
   * şekle özgü bilgiler ve çizim için SVG yolu (orijin sol-alt, y yukarı).
   */
  function sekilGeometrisi(tur, W, H, p, n) {
    const PI = Math.PI;
    const k = Math.max(0, Math.min(4, Math.floor(n || 0)));
    // cnc: düz testereyle kesilemeyen (CNC/şablon gereken) kenar uzunluğu
    const sonuc = (kutuW, kutuH, alan, duz, egri, bilgi, yol, cnc) => ({ kutuW, kutuH, alan, duz, egri, cevre: duz + egri, bilgi, yol, cnc: cnc == null ? egri : cnc });
    const dikd = () => sonuc(W, H, W * H, 2 * (W + H), 0, [], [['M', 0, 0], ['L', W, 0], ['L', W, H], ['L', 0, H], ['Z']]);
    if (tur === 'egimli') {
      const H2 = Math.max(0, Math.min(p || 0, 100000));
      const yuk = Math.max(H, H2);
      const egik = Math.hypot(W, H - H2);
      const aci = (Math.atan2(Math.abs(H - H2), W) * 180) / PI;
      return sonuc(W, yuk, (W * (H + H2)) / 2, W + H + H2 + egik, 0,
        [`eğik kenar ${r1(egik)} mm`, `eğim açısı ${r1(aci)}°`, `testere/makine açısı ${r1(90 - aci)}°`],
        [['M', 0, 0], ['L', W, 0], ['L', W, H2], ['L', 0, H], ['Z']], Math.abs(H - H2) > 0.5 ? egik : 0);
    }
    if (tur === 'radyus' || tur === 'pah') {
      const r = Math.max(0, Math.min(p || 0, W / 2, H / 2));
      if (!r || !k) return dikd();
      // Köşe sırası: sol üst, sağ üst, sağ alt, sol alt
      const yuv = [k >= 1, k >= 2, k >= 3, k >= 4];
      const yol = [['M', yuv[3] ? r : 0, 0], ['L', yuv[2] ? W - r : W, 0]];
      const kose = (cx, cy, x, y) => yol.push(tur === 'radyus' ? ['Q', cx, cy, x, y] : ['L', x, y]);
      if (yuv[2]) kose(W, 0, W, r);
      yol.push(['L', W, yuv[1] ? H - r : H]);
      if (yuv[1]) kose(W, H, W - r, H);
      yol.push(['L', yuv[0] ? r : 0, H]);
      if (yuv[0]) kose(0, H, 0, H - r);
      yol.push(['L', 0, yuv[3] ? r : 0]);
      if (yuv[3]) kose(0, 0, r, 0);
      yol.push(['Z']);
      if (tur === 'radyus') {
        return sonuc(W, H, W * H - k * (1 - PI / 4) * r * r, 2 * (W + H) - 2 * k * r, (k * PI * r) / 2,
          [`R${r1(r)} × ${k} köşe`, `her köşe yayı ${r1((PI * r) / 2)} mm`], yol);
      }
      return sonuc(W, H, W * H - (k * r * r) / 2, 2 * (W + H) - 2 * k * r, k * r * Math.SQRT2,
        [`${r1(r)}×${r1(r)} pah × ${k} köşe`, `pah kenarı ${r1(r * Math.SQRT2)} mm`], yol);
    }
    if (tur === 'oval') {
      const a = W / 2;
      const b = H / 2;
      const cevre = PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b))); // Ramanujan yaklaşımı
      return sonuc(W, H, PI * a * b, 0, cevre, [`elips ${r1(W)}×${r1(H)}`, `çevre ≈ ${r1(cevre)} mm (Ramanujan)`], [['E', a, b]]);
    }
    if (tur === 'daire') {
      const r = W / 2;
      return sonuc(W, W, PI * r * r, 0, 2 * PI * r, [`Ø${r1(W)}`, `çevre ${r1(2 * PI * r)} mm`], [['E', r, r]]);
    }
    if (tur === 'yarim_daire') {
      const r = W / 2;
      return sonuc(W, r, (PI * r * r) / 2, W, PI * r, [`R${r1(r)}`, `yay ${r1(PI * r)} mm`], [['M', 0, 0], ['L', W, 0], ['A', r, r, 0, 0]]);
    }
    if (tur === 'kapsul') {
      const r = Math.min(W, H) / 2;
      const yol = H >= W
        ? [['M', W, r], ['L', W, H - r], ['A', r, r, 0, H - r], ['L', 0, r], ['A', r, r, W, r], ['Z']]
        : [['M', r, 0], ['L', W - r, 0], ['A', r, r, W - r, H], ['L', r, H], ['A', r, r, r, 0], ['Z']];
      const duz = 2 * (Math.max(W, H) - 2 * r);
      return sonuc(W, H, W * H - (4 - PI) * r * r, duz, 2 * PI * r, [`uç yarıçapı R${r1(r)}`, `düz kenarlar ${r1(duz / 2)} mm`], yol, 2 * PI * r);
    }
    if (tur === 'organik') {
      // Yumuşak dalgalı kapalı eğri: elipsin yarıçapı birkaç sinüsle oynatılır, sonra kutuya ölçeklenir
      const a = Math.max(0, Math.min(p || 12, 30)) / 100;
      const N = 72;
      const ham = [];
      for (let i = 0; i < N; i++) {
        const t = (i / N) * 2 * PI;
        const k = 1 + a * Math.sin(2 * t + 0.6) + a * 0.7 * Math.sin(3 * t + 1.9) + a * 0.4 * Math.cos(5 * t);
        ham.push([Math.cos(t) * k, Math.sin(t) * k]);
      }
      const xs = ham.map((q) => q[0]);
      const ys = ham.map((q) => q[1]);
      const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
      const pts = ham.map(([x, y]) => [((x - x0) / (x1 - x0)) * W, ((y - y0) / (y1 - y0)) * H]);
      let alan = 0;
      let cevre = 0;
      pts.forEach((q, i) => { const n2 = pts[(i + 1) % N]; alan += q[0] * n2[1] - n2[0] * q[1]; cevre += Math.hypot(n2[0] - q[0], n2[1] - q[1]); });
      const yol = [['M', pts[0][0], pts[0][1]]].concat(pts.slice(1).map((q) => ['L', q[0], q[1]]), [['Z']]);
      return sonuc(W, H, Math.abs(alan) / 2, 0, cevre, [`dalga %${r1(a * 100)}`, `çevre ≈ ${r1(cevre)} mm`], yol);
    }
    if (tur === 'kemer') {
      const f = Math.max(0, Math.min(p || 0, W / 2, H));
      if (!f) return dikd();
      const R = (W * W) / 4 / (2 * f) + f / 2; // (W²/4 + f²) / 2f
      const yay = 2 * R * Math.asin(W / (2 * R));
      const kesit = R * R * Math.acos((R - f) / R) - (R - f) * Math.sqrt(2 * R * f - f * f);
      return sonuc(W, H, W * (H - f) + kesit, W + 2 * (H - f), yay,
        [`yay yarıçapı R${r1(R)}`, `yay boyu ${r1(yay)} mm`, `yan kenarlar ${r1(H - f)} mm`],
        [['M', 0, 0], ['L', W, 0], ['L', W, H - f], ['A', R, R, 0, H - f], ['Z']]);
    }
    return dikd();
  }

  /** Seçilebilir hırdavat türleri. Ölçüyü etkileyen değerler burada tutulur. */
  const HIRDAVAT_SECENEKLERI = {
    baglanti: {
      baslik: 'Gövde bağlantısı (köşeler)',
      secenekler: {
        minifix: { ad: 'Minifix + kavela' },
        konfirmat: { ad: 'Konfirmat vida' },
        kavela: { ad: 'Kavela + tutkal' },
        seffaf_kose: { ad: 'Şeffaf köşe bağlantı (tek parça köşe takozu)' },
        seffaf_t: { ad: 'Şeffaf T bağlantı (iki parçalı, ortası çektirme vidalı)' },
      },
    },
    araBaglanti: {
      baslik: 'Ara bağlantı (sabit raf, dikme)',
      secenekler: {
        ayni: { ad: 'Gövde bağlantısıyla aynı' },
        seffaf_t: { ad: 'Şeffaf T bağlantı (iki parçalı, ortası çektirme vidalı)' },
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
    kulpRenk: {
      baslik: 'Kulp rengi',
      secenekler: {
        siyah: { ad: 'Mat siyah' },
        altin: { ad: 'Altın / şampanya' },
        krom: { ad: 'Krom / inox' },
        bronz: { ad: 'Antik bronz' },
        beyaz: { ad: 'Beyaz' },
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
    seffaf_kose: { ad: 'Şeffaf köşe bağlantı (köşe takozu)', birim: 'adet', fiyat: 3 },
    seffaf_t: { ad: 'Şeffaf T bağlantı (iki parça + çektirme vidası)', birim: 'takım', fiyat: 6 },
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
    masa_ayak_ahsap: { ad: 'Masif ahşap masa ayağı', birim: 'adet', fiyat: 350 },
    masa_ayak_metal4: { ad: 'Metal masa ayağı takımı (4 ayak + çerçeve)', birim: 'takım', fiyat: 2400 },
    masa_ayak_u: { ad: 'Metal U (köprü) masa ayağı', birim: 'takım', fiyat: 1900 },
    masa_ayak_x: { ad: 'Metal X masa ayağı', birim: 'takım', fiyat: 2100 },
    masa_ayak_merkez: { ad: 'Merkez (tek) masa ayağı', birim: 'adet', fiyat: 2200 },
    masa_gergi: { ad: 'Masa köşe gergi plakası', birim: 'adet', fiyat: 25 },
    masa_keceli_ayak: { ad: 'Keçeli / ayarlı ayak pabucu', birim: 'adet', fiyat: 10 },
    ayak_metal: { ad: 'Metal ayarlı ayak', birim: 'adet', fiyat: 60 },
    tekerlek: { ad: 'Tekerlek (frenli)', birim: 'adet', fiyat: 45 },
    raf_pimi: { ad: 'Raf pimi', birim: 'adet', fiyat: 1 },
    cam_raf_pimi: { ad: 'Cam raf pimi', birim: 'adet', fiyat: 4 },
    raf_baglanti: { ad: 'Raf birleştirme bağlantısı', birim: 'adet', fiyat: 10 },
    raf_tasiyici: { ad: 'Gizli raf taşıyıcı', birim: 'adet', fiyat: 60 },
    aski_borusu: { ad: 'Askı borusu', birim: 'm', fiyat: 160 },
    aski_flans: { ad: 'Askı borusu flanşı', birim: 'adet', fiyat: 15 },
    aski_kancasi: { ad: 'Askı kancası (portmanto)', birim: 'adet', fiyat: 35 },
    onden_aski: { ad: 'Öne çekilir askı (derinlemesine ray)', birim: 'adet', fiyat: 280 },
    led_serit: { ad: 'LED şerit', birim: 'm', fiyat: 120 },
    cnc_desen: { ad: 'Kapak yüzey deseni (CNC freze)', birim: 'm²', fiyat: 650 },
    altin_cita: { ad: 'Altın renkli dekor çıtası', birim: 'm', fiyat: 90 },
    led_profil: { ad: 'LED alüminyum profili', birim: 'm', fiyat: 80 },
    led_adaptor: { ad: 'LED adaptörü', birim: 'adet', fiyat: 300 },
    bulasik_seti: { ad: 'Bulaşık makinesi kapak montaj seti', birim: 'takım', fiyat: 150 },
    arkalik_vida: { ad: 'Arkalık vidası / zımba çivisi', birim: 'adet', fiyat: 0.4 },
    kosebent: { ad: 'Bağlantı köşebendi', birim: 'adet', fiyat: 5 },
    baza_klips: { ad: 'Baza klipsi', birim: 'adet', fiyat: 4 },
    catal_kasiklik: { ad: 'Çatal-kaşıklık', birim: 'adet', fiyat: 350 },
    dolap_birlestirme: { ad: 'Dolap birleştirme vidası (somunlu)', birim: 'adet', fiyat: 4 },
    aski_aparati: { ad: 'Asma dolap askı aparatı', birim: 'adet', fiyat: 45 },
    aski_rayi: { ad: 'Asma dolap askı rayı', birim: 'm', fiyat: 120 },
    devrilme: { ad: 'Devrilme önleyici duvar bağlantısı', birim: 'adet', fiyat: 25 },
    cekmece_bolucu: { ad: 'Çekmece bölücü seti', birim: 'takım', fiyat: 150 },
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
      { id: 'sl18a', ad: 'Suntalam Antrasit 18mm', tur: 'Suntalam', kalinlik: 18, plakaUzun: 2800, plakaKisa: 2100, bant: 0.8, damar: false, plakaFiyati: 2500, bantFiyati: 14, islemFiyatiM2: 0 },
      { id: 'sl18m', ad: 'Suntalam Doğal Meşe 18mm', tur: 'Suntalam', kalinlik: 18, plakaUzun: 2800, plakaKisa: 2100, bant: 0.8, damar: true, plakaFiyati: 2700, bantFiyati: 14, islemFiyatiM2: 0 },
      { id: 'sl18k', ad: 'Suntalam Kaşmir 18mm', tur: 'Suntalam', kalinlik: 18, plakaUzun: 2800, plakaKisa: 2100, bant: 0.8, damar: false, plakaFiyati: 2400, bantFiyati: 14, islemFiyatiM2: 0 },
      { id: 'lake18y', ad: 'MDF Lake Adaçayı Yeşili 18mm', tur: 'MDF Lake', kalinlik: 18, plakaUzun: 2800, plakaKisa: 2100, bant: 0, damar: false, plakaFiyati: 2600, bantFiyati: 0, islemFiyatiM2: 1500 },
      { id: 'lake18l', ad: 'MDF Lake Gece Mavisi 18mm', tur: 'MDF Lake', kalinlik: 18, plakaUzun: 2800, plakaKisa: 2100, bant: 0, damar: false, plakaFiyati: 2600, bantFiyati: 0, islemFiyatiM2: 1500 },
      // Lambri: hazır çıta/profil, plaka yerine boy × en ölçüsünde tek parça olarak alınır (yerleşim çıtaları bunlara dizer)
      { id: 'cita_mese', ad: 'Lambri çıta Meşe kaplama 2800×40×20', tur: 'Lambri / çıta', kalinlik: 20, plakaUzun: 2800, plakaKisa: 40, bant: 0, damar: true, plakaFiyati: 180, bantFiyati: 0, islemFiyatiM2: 0, renk: '#c9a57a' },
      { id: 'cita_ceviz', ad: 'Lambri çıta Ceviz kaplama 2800×40×20', tur: 'Lambri / çıta', kalinlik: 20, plakaUzun: 2800, plakaKisa: 40, bant: 0, damar: true, plakaFiyati: 200, bantFiyati: 0, islemFiyatiM2: 0, renk: '#7a5236' },
      { id: 'cita_siyah', ad: 'Lambri çıta Mat siyah MDF 2800×30×18', tur: 'Lambri / çıta', kalinlik: 18, plakaUzun: 2800, plakaKisa: 30, bant: 0, damar: false, plakaFiyati: 150, bantFiyati: 0, islemFiyatiM2: 0, renk: '#2b2b2b' },
      { id: 'lambri_profil', ad: 'Lambri profil (dilli) 2800×120×12', tur: 'Lambri / çıta', kalinlik: 12, plakaUzun: 2800, plakaKisa: 120, bant: 0, damar: true, plakaFiyati: 420, bantFiyati: 0, islemFiyatiM2: 0, renk: '#d8b98f' },
      { id: 'lake18p', ad: 'MDF Lake Petrol Yeşili 18mm', tur: 'MDF Lake', kalinlik: 18, plakaUzun: 2800, plakaKisa: 2100, bant: 0, damar: false, plakaFiyati: 2600, bantFiyati: 0, islemFiyatiM2: 1500, renk: '#3f5a55' },
      { id: 'lake18v', ad: 'MDF Lake Vizon 18mm', tur: 'MDF Lake', kalinlik: 18, plakaUzun: 2800, plakaKisa: 2100, bant: 0, damar: false, plakaFiyati: 2600, bantFiyati: 0, islemFiyatiM2: 1500, renk: '#a39382' },
      { id: 'mdflam18t', ad: 'MDF Lam Taş Bej 18mm', tur: 'MDF Lam', kalinlik: 18, plakaUzun: 2800, plakaKisa: 2100, bant: 1, damar: false, plakaFiyati: 3300, bantFiyati: 18, islemFiyatiM2: 0, renk: '#c8b9a2' },
      { id: 'mermer12', ad: 'Mermer desenli kompakt panel 12mm', tur: 'Kompakt laminat', kalinlik: 12, plakaUzun: 3050, plakaKisa: 1300, bant: 0, damar: true, plakaFiyati: 7500, bantFiyati: 0, islemFiyatiM2: 0, renk: '#ebe8e2' },
      { id: 'mdfham18', ad: 'Ham MDF 18mm (boyanacak)', tur: 'Ham MDF', kalinlik: 18, plakaUzun: 2800, plakaKisa: 2100, bant: 0, damar: false, plakaFiyati: 1700, bantFiyati: 0, islemFiyatiM2: 1300 },
      { id: 'kece9', ad: 'Akustik keçe 9mm siyah', tur: 'Akustik keçe', kalinlik: 9, plakaUzun: 2800, plakaKisa: 1220, bant: 0, damar: false, plakaFiyati: 1900, bantFiyati: 0, islemFiyatiM2: 0, renk: '#2f2f31' },
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
    hirdavat: { baglanti: 'minifix', araBaglanti: 'ayni', mentese: 'frenli', ray: 'bilyeli', kulp: 'kulp', kulpRenk: 'siyah', ayak: 'plastik' },
    // Fiyat ve maliyet (TL, KDV hariç). Tüm fiyatlar örnektir.
    fiyat: {
      hirdavat: {},             // kod -> birim fiyat (boşsa katalog örnek fiyatı)
      plakaHesabi: 'tam',       // 'tam': yerleşimdeki tam plaka sayısı, 'alan': net alan + fire
      alanFire: 15,             // % (alan hesabında)
      bantFire: 10,             // %
      ebatlamaPlaka: 150,       // plaka başı kesim (ebatlama) ücreti
      bantCekmeM: 12,           // metre başı bant çekme ücreti
      iscilikEsasi: 'm2',       // 'm2': ön yüz (kapladığı) alanın m²'si başına | 'modul': modül başına
      atolyeIscilikM2: 1200,    // m² başı atölye işçiliği (dolabın ön yüz alanı)
      montajM2: 500,            // m² başı yerinde montaj
      panelIscilikM2: 300,      // m² başı panel işçiliği + montajı (yan kapama, lambri, raf…)
      atolyeIscilikModul: 1500, // modül başı atölye işçiliği
      montajModul: 750,         // modül başı yerinde montaj
      panelIscilik: 200,        // panel başı (yan kapama, dolgu, raf vb.) işçilik + montaj
      sekilliKesimM: 40,        // eğri/eğik kenar metresi başı CNC veya şablon kesim ücreti
      nakliye: 2000,            // proje başı
      ekKalemler: [],           // [{ ad, tutar }] tezgah, cam, LED vb.
      karOrani: 30,             // %
      kdvOrani: 20,             // %
    },
    firma: { ad: '', telefon: '', adres: '' },
    testereKalinligi: 4,      // kesim bıçağı payı
    plakaKenarPayi: 10,       // plaka kenarından kırpılan pay
    artikMin: 250,            // stoka alınacak artığın en küçük kenarı (mm)
    bantDus: true,            // bant kalınlığını kesim ölçüsünden düş
    kapakBoslugu: 3,          // kapaklar arası boşluk
    disBosluk: 1.5,           // tam bini kapakta dış kenar boşluğu
    cekmeceUstBosluk: 40,     // çekmece önü yüksekliği ile kutu yüksekliği farkı
    cekmeceTabani: 'cakma',   // 'cakma': alttan çakma, 'kanal': kanala geçme
    icCekmeceYukseklik: 140,  // iç (gizli) çekmece önü varsayılan yüksekliği
    kulpYon: 'dikey',         // kapak kulpu yönü
    kulpKonum: 'oto',         // kapakta kulp konumu
    kulpCekmece: 'ust',       // çekmecede kulp: üstte / ortada
    kulpAralik: 160,          // kulp vida (delik) aralığı; 0 = tek vidalı düğme kulp
    kulpKenar: 40,            // kulp eksenine açılan kenardan mesafe
    kulpUcMesafe: 60,         // üst/alt konumda kulp ucunun kapak kenarına mesafesi
    duvarAski: 'aparat',      // asma dolap: 'aparat' (gizli askı aparatı) | 'ray' (askı rayı + aparat)
    arkalikKanalDerinligi: 8, // arkalık kanal derinliği
    arkalikGeriPay: 10,       // kanalın arka kenara uzaklığı
    arkalikCakmaPay: 2,       // çakma arkalıkta her kenardan içeri pay
    rafOnGeriCekme: 20,       // hareketli raf önden geri çekme
    gommeAraTabla: 'tam',     // gömme kapakta satırlar arası tabla: 'tam' derin | 'kayit' (yalnız önde kayıt)
    gommeKayitEn: 110,        // gömme kapakta ön kayıt derinliği (mm)
    seffafVidaAralik: 32,     // iki parçalı şeffaf T bağlantıda bir yarımın iki kulak vidası arası (mm)
    seffafKenar: 12,          // kulak vidasının birleşim çizgisine (karşı panel yüzeyine) uzaklığı (mm)
    cekmeceRayBosluk: 0,
    cekmeceEkBosluk: 1.8,     // çekmece kutusu ile ray arasında her yandan ek boşluk (sağ + sol = 3,6 mm)
    arkalikDerinlikte: false, // çakma arkalık girilen derinliğe dahil mi (kapalı: yanlar tam derinlik, arkalık arkaya eklenir)      // çekmece kutusu–gövde yan boşluğu (ray başına, mm); 0 = ray kataloğu değeri
    arkalikListede: true,     // arkalık parçaları kesim listesine ve maliyete girsin mi
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
  const AYAK_ON = (h) => ({ tip: 'ayak_on', yukseklik: h || 100, geriCekme: 50 });
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
  const ALT = { yukseklik: 870, derinlik: 560, ust: 'kusak', baza: AYAK_ON(100) };
  const UST = { yukseklik: 720, derinlik: 320, montajYuksekligi: 1450 };
  const BOY = { yukseklik: 2150, derinlik: 560, baza: AYAK_ON(100) };

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
    alt_ic: G('Mutfak alt', 'Alt Dolap (iç çekmeceli)', '2 kapak arkasında 2 gizli çekmece', Object.assign({ genislik: 600, sutunlar: TEK(S('kapak', null, 2, { icCekmece: 2, icCekmeceH: 160 })) }, ALT)),
    alt_baza: G('Mutfak alt', 'Alt Dolap (baza çekmeceli)', 'Süpürgelikte gizli çekmece', Object.assign({ genislik: 600, bazaCekmece: true, sutunlar: TEK(S('cekmece', 150), S('kapak', null, 2, { raf: 1 })) }, ALT, { baza: AYAK(120) })),
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
    buzdolabi_kabin: G('Mutfak boy', 'Buzdolabı Kabini', 'Tabansız buzdolabı nişi + üst dolap', Object.assign({ genislik: 600, sutunlar: TEK(S('kapak', 400, 1), S('nis', null)) }, BOY, { baza: YOK, altTablaYok: true, arkalik: 'yok' })),
    // Yatak odası
    gardirop: G('Yatak odası', 'Gardırop (2 kapak)', 'Üst bölme + askı', { genislik: 1000, yukseklik: 2400, derinlik: 580, yapi: 'tabla_boydan', baza: BAZA(80, 40), sutunlar: TEK(S('kapak', 400, 2), S('kapak', null, 2, { aski: true })) }),
    gardirop3: G('Yatak odası', 'Gardırop (3 kapak)', 'Raflı bölme + askı bölmesi', { genislik: 1500, yukseklik: 2400, derinlik: 580, yapi: 'tabla_boydan', baza: BAZA(80, 40), sutunlar: [SUT(476, [S('kapak', 400, 1), S('kapak', null, 1, { raf: 5 })]), SUT(null, [S('kapak', 400, 2), S('kapak', null, 2, { aski: true })])] }),
    gardirop4: G('Yatak odası', 'Gardırop (4 kapak)', 'Raf + askı + çekmeceli raf', { genislik: 2000, yukseklik: 2400, derinlik: 580, yapi: 'tabla_boydan', baza: BAZA(80, 40), sutunlar: [SUT(476, [S('kapak', 400, 1), S('kapak', null, 1, { raf: 5 })]), SUT(null, [S('kapak', 400, 2), S('kapak', null, 2, { aski: true })]), SUT(476, [S('kapak', 400, 1), S('kapak', null, 1, { raf: 3 }), S('cekmece', 200, 1), S('cekmece', 200, 1)])] }),
    surgulu: G('Yatak odası', 'Sürgülü Gardırop (2 kapak)', 'Askı + raf + iç çekmece', { genislik: 1800, yukseklik: 2400, derinlik: 650, yapi: 'tabla_boydan', baza: BAZA(80, 40), onTipi: 'surgu', surguAdet: 2, sutunlar: [SUT(null, [S('acik', 400), S('acik', null, 1, { aski: true })]), SUT(null, [S('acik', 400), S('acik', null, 1, { raf: 3 }), S('cekmece', 200), S('cekmece', 200)])] }),
    surgulu_ayna: G('Yatak odası', 'Sürgülü Aynalı Gardırop (3 kapak)', 'Aynalı sürgü kapaklar', { genislik: 2400, yukseklik: 2400, derinlik: 650, yapi: 'tabla_boydan', baza: BAZA(80, 40), onTipi: 'surgu', surguAdet: 3, surguTuru: 'ayna', sutunlar: [SUT(null, [S('acik', 400), S('acik', null, 1, { aski: true })]), SUT(null, [S('acik', 400), S('acik', null, 1, { raf: 4 })]), SUT(null, [S('acik', 400), S('acik', null, 1, { aski: true })])] }),
    sifonyer: G('Yatak odası', 'Şifonyer', '4 çekmece', { genislik: 800, yukseklik: 900, derinlik: 450, yapi: 'tabla_boydan', baza: AYAK(60), sutunlar: TEK(S('cekmece', null), S('cekmece', null), S('cekmece', null), S('cekmece', null)) }),
    gardirop_cerceve: G('Yatak odası', 'Gardırop – Çerçeve Desenli', 'Petrol yeşili lake, shaker kapak, altın uzun kulp', { genislik: 2000, yukseklik: 2400, derinlik: 600, yapi: 'tabla_boydan', yanlarYere: true, baza: BAZA(80, 40), kapakDesen: 'cerceve', kulpBoy: 448, malzeme: { kapak: 'lake18p' }, hirdavat: { kulpRenk: 'altin' }, sutunlar: [SUT(500, [S('kapak', 400, 1), S('kapak', null, 1, { raf: 5 })]), SUT(null, [S('kapak', 400, 2), S('kapak', null, 2, { aski: true })]), SUT(500, [S('kapak', 400, 1), S('kapak', null, 1, { raf: 5 })])] }),
    gardirop_kemer: G('Yatak odası', 'Gardırop – Kemer Desenli + Vitrin', 'Kemerli kapak deseni, ortada LED\'li cam vitrin', { genislik: 2000, yukseklik: 2400, derinlik: 600, yapi: 'tabla_boydan', yanlarYere: true, baza: BAZA(80, 40), kapakDesen: 'kemer', kulpBoy: 320, malzeme: { kapak: 'lake18' }, hirdavat: { kulpRenk: 'altin' }, sutunlar: [SUT(null, [S('kapak', null, 2, { aski: true })]), SUT(500, [S('kapak', null, 1, { kapakTuru: 'cam_profil', raf: 5, rafTipi: 'cam', led: true })]), SUT(null, [S('kapak', null, 2, { raf: 5 })])] }),
    gardirop_citali: G('Yatak odası', 'Gardırop – Çıtalı Kapak', 'Dikey oluklu kapaklar, gece mavisi, uzun kulp', { genislik: 1600, yukseklik: 2400, derinlik: 600, yapi: 'tabla_boydan', yanlarYere: true, baza: BAZA(80, 40), kapakDesen: 'citali', kulpBoy: 640, malzeme: { kapak: 'lake18l' }, hirdavat: { kulpRenk: 'krom' }, sutunlar: [SUT(null, [S('kapak', null, 2, { aski: true })]), SUT(null, [S('kapak', null, 2, { raf: 5 })])] }),
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
    tv_asma_led: G('Salon', 'Asma TV Ünitesi (LED\'li)', 'Duvara asma, bas-aç klapalar, ortada niş, altı LED', { genislik: 2400, yukseklik: 400, derinlik: 400, yapi: 'tabla_boydan', montajYuksekligi: 250, baza: YOK, ledAlt: true, ustTasmaYan: 0, hirdavat: { kulp: 'basac' }, sutunlar: [SUT(null, [S('kapak', null, 1, { acilim: 'asagi' })]), SUT(null, [S('kapak', null, 1, { acilim: 'asagi' })]), SUT(560, [S('acik', null, 1, { led: true })]), SUT(null, [S('cekmece', null)]), SUT(null, [S('cekmece', null)])] }),
    nis_led: G('Salon', 'LED\'li Açık Niş (boy)', 'TV yanı dar boy raf, her rafta LED', { genislik: 400, yukseklik: 2200, derinlik: 350, yapi: 'tabla_boydan', baza: BAZA(60, 30), sutunlar: TEK(S('acik', 400, 1, { led: true }), S('acik', 400, 1, { led: true }), S('acik', 400, 1, { led: true }), S('acik', null, 1, { led: true }), S('kapak', 500, 1, { raf: 1 })) }),
    vitrin_siyah: G('Salon', 'Siyah Profil Vitrin (LED\'li)', 'Füme cam, siyah alüminyum profil, cam raf, LED', { genislik: 450, yukseklik: 2200, derinlik: 400, yapi: 'tabla_boydan', baza: BAZA(60, 30), malzeme: { cam: 'cam4f' }, sutunlar: TEK(S('kapak', null, 1, { kapakTuru: 'cam_profil', raf: 4, rafTipi: 'cam', led: true }), S('kapak', 450, 1, { raf: 1 })) }),
    // Antre
    dresuar_asma: G('Antre', 'Asma Dresuar (LED\'li)', 'Duvara asma, 2 çekmece, kavisli uçlar, altı LED', { genislik: 1200, yukseklik: 260, derinlik: 350, yapi: 'tabla_boydan', montajYuksekligi: 760, baza: YOK, ledAlt: true, ustKavisR: 80, ustKapakUstu: true, hirdavat: { kulp: 'basac' }, sutunlar: TEK(S('cekmece', null, 2)) }),
    dresuar_ayakli: G('Antre', 'Ayaklı Dresuar', 'Çekmeceli tabla, metal ayak, altı açık raf', { genislik: 1100, yukseklik: 820, derinlik: 350, yapi: 'tabla_boydan', baza: AYAK(150), ustTasmaYan: 18, ustKapakUstu: true, hirdavat: { ayak: 'metal', kulpRenk: 'altin' }, sutunlar: TEK(S('cekmece', 160, 2), S('acik', null, 1)) }),
    ayakkabilik: G('Antre', 'Ayakkabılık', 'Üst çekmeceler + raflı kapaklar', { genislik: 900, yukseklik: 1000, derinlik: 350, baza: AYAK(60), sutunlar: TEK(S('cekmece', 120, 2), S('kapak', null, 2, { raf: 4 })) }),
    vestiyer: G('Antre', 'Vestiyer / Portmanto', 'Açık askılık + kapaklı raf', { genislik: 1200, yukseklik: 2000, derinlik: 400, baza: BAZA(60, 30), sutunlar: [SUT(null, [S('acik', 300, 1, { raf: 0 }), S('acik', null)]), SUT(500, [S('kapak', null, 1, { raf: 5 })])] }),
    vestiyer_oturak: G('Antre', 'Vestiyer – Oturaklı', 'Askılık nişi, oturak çekmecesi, altta ayakkabı rafı, yanda boy dolap', { genislik: 1400, yukseklik: 2100, derinlik: 400, yapi: 'tabla_boydan', yanlarYere: true, baza: BAZA(60, 30), sutunlar: [SUT(null, [S('kapak', 350, 2, { raf: 0 }), S('acik', null, 1, { aski: true, askiTuru: 'kanca', led: true }), S('cekmece', 160, 2), S('acik', 300, 1, { raf: 0 })]), SUT(450, [S('kapak', 350, 1), S('kapak', null, 1, { raf: 5, kapakTuru: 'ayna' })])] }),
    vestiyer_ayakkabi: G('Antre', 'Vestiyer – Ayakkabılıklı', 'Altta kapaklı ayakkabılık, üstte askılık ve raf', { genislik: 900, yukseklik: 2000, derinlik: 350, yapi: 'tabla_boydan', yanlarYere: true, baza: BAZA(60, 30), sutunlar: [SUT(null, [S('acik', 300, 1, { raf: 0 }), S('acik', null, 1, { aski: true, askiTuru: 'kanca' }), S('kapak', 900, 2, { raf: 4 })])] }),
    vestiyer_acik: G('Antre', 'Açık Vestiyer (asma)', 'Duvara asılı: raf + askı + ayna yanı', { genislik: 900, yukseklik: 1200, derinlik: 300, montajYuksekligi: 900, sutunlar: [SUT(null, [S('acik', 250, 1, { raf: 0 }), S('acik', null, 1, { aski: true, askiTuru: 'kanca' })])] }),
    // Ofis
    dosya: G('Ofis', 'Dosya Dolabı', 'Cam üst kapak + alt kapak', { genislik: 800, yukseklik: 1900, derinlik: 400, baza: BAZA(60, 30), sutunlar: TEK(S('kapak', 1000, 2, { kapakTuru: 'cam_profil', raf: 2 }), S('kapak', null, 2, { raf: 1 })) }),
    keson: G('Ofis', 'Çekmeceli Keson', 'Tekerlekli, 3 çekmece', { genislik: 400, yukseklik: 600, derinlik: 500, yapi: 'tabla_boydan', baza: { tip: 'tekerlek', yukseklik: 60, geriCekme: 0 }, sutunlar: TEK(S('cekmece', 120), S('cekmece', null), S('cekmece', null)) }),
    // Paneller
    yan_kapama: P('Panel', 'Yan Kapama Paneli', 'Dizinin açık yanına', 'yan_kapama', 870, 580, { bantU: 1, bantK: 1 }),
    dolgu: P('Panel', 'Dolgu Paneli', 'Duvar–dolap arası', 'dolgu', 720, 50, { montajYuksekligi: 1450 }),
    bulasik_panel: P('Panel', 'Bulaşık Makinesi Kapağı', 'Ankastre makine için', 'bulasik', 715, 597, { montajYuksekligi: 100 }),
    duvar_rafi: P('Panel', 'Duvar Rafı', 'Gizli taşıyıcılı', 'raf', 800, 250, { panelMalzeme: 'govde', bantU: 1, bantK: 2, montajYuksekligi: 1500 }),
    tabla: P('Panel', 'Tabla (yalnız üst plaka)', 'Ayaksız düz tabla: dolapların ya da ayak ünitesinin üstüne', 'tabla', 1200, 600, { panelMalzeme: 'govde', montajYuksekligi: 730 }),
    masa_calisma: P('Masa', 'Çalışma Masası', 'Yan panel ayaklı, arkada bacak paneli', 'masa', 1200, 600, { panelMalzeme: 'govde', masaH: 750, masaAyak: 'panel', masaTasma: 0, masaArka: true }),
    masa_metal: P('Masa', 'Metal Ayaklı Çalışma Masası', 'Çerçeveli metal 4 ayak, 30 mm taşma', 'masa', 1400, 700, { panelMalzeme: 'govde', masaH: 750, masaAyak: 'metal4', masaTasma: 30, masaAyakKesit: 40 }),
    masa_yemek: P('Masa', 'Yemek Masası (ahşap ayak)', '4 masif ayak, kayıtlı, 6 kişilik', 'masa', 1600, 900, { panelMalzeme: 'govde', masaH: 750, masaAyak: 'ahsap4', masaTasma: 40, masaAyakKesit: 70, masaKayit: true, malzeme: { govde: 'sl18m' } }),
    masa_yuvarlak: P('Masa', 'Yuvarlak Yemek Masası', 'Çap 1000, merkez ayak', 'masa', 1000, 1000, { panelMalzeme: 'govde', masaH: 750, masaAyak: 'merkez', sekil: 'daire' }),
    masa_oval: P('Masa', 'Oval Yemek Masası', '1800 × 950 elips, U ayak', 'masa', 1800, 950, { panelMalzeme: 'govde', masaH: 750, masaAyak: 'metal_u', masaTasma: 150, masaKayit: true, sekil: 'oval' }),
    sehpa: P('Masa', 'Orta Sehpa', 'Alçak, metal ayaklı', 'masa', 1000, 600, { panelMalzeme: 'govde', masaH: 420, masaAyak: 'metal4', masaTasma: 20, masaAyakKesit: 30 }),
    masa_bar: P('Masa', 'Bar Masası', 'Yüksek, X ayak', 'masa', 1200, 500, { panelMalzeme: 'govde', masaH: 1050, masaAyak: 'x', masaTasma: 60 }),
    duvar_paneli: P('Panel', 'Duvar Kaplama Paneli', 'TV arkası, yatak başı', 'duvar', 1200, 1000, { montajYuksekligi: 700, bantU: 2, bantK: 2 }),
    tabla_oval: P('Panel', 'Oval Masa Tablası', 'Kavisli: tam elips, CNC kesim', 'tabla', 1800, 900, { panelMalzeme: 'govde', montajYuksekligi: 730, sekil: 'oval' }),
    tabla_yuvarlak: P('Panel', 'Yuvarlak Masa Tablası', 'Kavisli: daire, çap 1000', 'tabla', 1000, 1000, { panelMalzeme: 'govde', montajYuksekligi: 730, sekil: 'daire' }),
    raf_kavisli: P('Panel', 'Kavisli Uçlu Duvar Rafı', 'Açık ucundaki iki köşe R60', 'raf', 900, 250, { panelMalzeme: 'govde', montajYuksekligi: 1500, sekil: 'radyus', sekilParam: 60, koseSayisi: 2 }),
    ayna_kapsul: P('Panel', 'Kapsül Ayna (arkadan LED)', 'Trend uzun oval ayna, duvara hare ışık', 'duvar', 1600, 600, { panelMalzeme: 'ayna', sekil: 'kapsul', ledArka: true, montajYuksekligi: 350 }),
    ayna_yuvarlak: P('Panel', 'Yuvarlak Ayna (arkadan LED)', 'Çap 800, dresuar üstü', 'duvar', 800, 800, { panelMalzeme: 'ayna', sekil: 'daire', ledArka: true, montajYuksekligi: 1150 }),
    ayna_kemer: P('Panel', 'Kemerli Boy Aynası (LED)', 'Üstü yarım daire, arkadan LED', 'duvar', 1700, 700, { panelMalzeme: 'ayna', sekil: 'kemer', sekilParam: 350, ledArka: true, montajYuksekligi: 300 }),
    ayna_organik: P('Panel', 'Organik Ayna (LED)', 'Dalgalı biçim, CNC kesim, arkadan LED', 'duvar', 1500, 750, { panelMalzeme: 'ayna', sekil: 'organik', sekilParam: 12, ledArka: true, montajYuksekligi: 400 }),
    panel_mermer: P('Panel', 'Mermer Desenli TV Paneli (LED)', 'Kompakt mermer desen, arkadan LED çerçeve', 'duvar', 1500, 2000, { malzeme: { kapak: 'mermer12' }, ledArka: true, montajYuksekligi: 750, bantU: 0, bantK: 0 }),
    kemer_panel: P('Panel', 'Kemerli Duvar Paneli', 'Üstü yay kavisli, ayna ya da dekor arkası', 'duvar', 1600, 800, { montajYuksekligi: 600, sekil: 'kemer', sekilParam: 400 }),
    lambri_dikey: P('Lambri', 'Dikey Çıtalı Lambri', 'Meşe çıta, 40 mm çıta / 20 mm aralık', 'lambri', 2600, 1200, { lambriCitaEn: 40, lambriAralik: 20, malzeme: { kapak: 'cita_mese' } }),
    lambri_kece: P('Lambri', 'Akustik Lambri (keçe arkalı)', 'Ceviz çıta, siyah keçe arka panel', 'lambri', 2400, 1200, { lambriCitaEn: 40, lambriAralik: 15, lambriArka: 'govde', malzeme: { kapak: 'cita_ceviz', govde: 'kece9' } }),
    lambri_tv: P('Lambri', 'TV Arkası Lambri', 'Siyah çıta, meşe arka panel', 'lambri', 1800, 2400, { lambriCitaEn: 30, lambriAralik: 30, lambriArka: 'govde', montajYuksekligi: 300, malzeme: { kapak: 'cita_siyah', govde: 'sl18m' } }),
    lambri_yatay: P('Lambri', 'Yatay Çıtalı Lambri', 'Yatak başı, yatay çıtalar', 'lambri', 1200, 2000, { lambriCitaEn: 40, lambriAralik: 25, lambriYon: 'yatay', montajYuksekligi: 0, malzeme: { kapak: 'cita_mese' } }),
    lambri_profil: P('Lambri', 'Profil Lambri (dilli, bitişik)', 'Hazır 120 mm dilli profil, aralıksız', 'lambri', 2600, 1200, { lambriCitaEn: 120, lambriAralik: 0, malzeme: { kapak: 'lambri_profil' } }),
    bosluk: P('Panel', 'Boşluk (cihaz / diz)', 'Buzdolabı, bulaşık makinesi, diz boşluğu', 'bosluk', 850, 600, { bantU: 0, bantK: 0 }),
    baza_bandi: P('Panel', 'Baza (Süpürgelik) Bandı', 'Dolap altı süpürgelik', 'baza', 2400, 100, { bantU: 1, bantK: 0 }),
  };
  // Eşya ve dekor nesneleri katalogda kendi gruplarında
  for (const [id, n] of Object.entries(NESNELER)) {
    PRESETLER['nesne_' + id] = P(n.grup, n.ad, `${n.W}×${n.H}×${n.D} mm · parça çıkmaz`, 'nesne', n.H, n.W, { nesneTuru: id, nesneD: n.D, montajYuksekligi: n.mt || 0, konum: 0, bantU: 0, bantK: 0 });
  }
  const KATALOG_GRUPLARI = ['Masa', 'Mutfak alt', 'Mutfak üst', 'Mutfak boy', 'Yatak odası', 'Banyo', 'Salon', 'Antre', 'Ofis', 'Panel', 'Lambri', 'Beyaz eşya', 'Elektronik', 'Küçük ev aletleri', 'Mutfak eşyası', 'Giyim', 'Dekor', 'Aydınlatma'];

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
      plakaKisa: sayiAl(m && m.plakaKisa, 2100, 10, 10000),
      bant: sayiAl(m && m.bant, 0, 0, 5),
      damar: !!(m && m.damar),
      plakaFiyati: sayiAl(m && m.plakaFiyati, 0, 0),
      bantFiyati: sayiAl(m && m.bantFiyati, 0, 0),
      islemFiyatiM2: sayiAl(m && m.islemFiyatiM2, 0, 0),
      // Görünüş rengi (3B ve önizleme); verilmemişse addan tahmin edilir
      renk: typeof (m && m.renk) === 'string' && /^#[0-9a-f]{6}$/i.test(m.renk) ? m.renk.toLowerCase() : varsayilanRenk(m && m.ad, m && m.tur),
      // Boyamayla anında oluşan renk tabakası: kaynak malzemenin aynısı, yalnız rengi farklı
      oto: !!(m && m.oto),
      kaynak: m && m.oto && typeof m.kaynak === 'string' ? m.kaynak.slice(0, 40) : null,
    };
  }
  /** Malzeme adından görünüş rengi (ceviz, meşe, antrasit, lake renkleri...). */
  function varsayilanRenk(ad, tur) {
    const a = String(ad || '').toLocaleLowerCase('tr');
    const tablo = [
      [/ceviz/, '#8a5a3c'], [/meşe|mese/, '#c9a57a'], [/antrasit|füme|fume/, '#4b4d50'], [/siyah/, '#2d2d2f'],
      [/kaşmir|kasmir|bej/, '#d8ccb8'], [/gri/, '#9a9a96'], [/adaçayı|yeşil/, '#9db09a'], [/mavi|lacivert/, '#34465f'],
      [/kontrplak|huş/, '#dcc39a'], [/hdf/, '#e6e1d8'], [/ayna/, '#cfdbe3'], [/cam/, '#9cc8e6'],
    ];
    for (const [re, r] of tablo) if (re.test(a)) return r;
    if (tur === 'Cam') return '#9cc8e6';
    if (tur === 'Ayna') return '#cfdbe3';
    return '#f2efe8';
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
      rafSabit: !!s.rafSabit,
      menteseYonu: secenekAl(s.menteseYonu, Object.keys(MENTESE_YONLERI), 'oto'),
      kutuYukseklik: (() => { const v = sayiAl(s.kutuYukseklik, null, 0, 500); return v >= 30 ? v : null; })(),
      rayBoyu: RAY_BOYLARI.includes(Number(s.rayBoyu)) ? Number(s.rayBoyu) : null,
      cekmeceIc: secenekAl(s.cekmeceIc, Object.keys(CEKMECE_ICLERI), 'yok'),
      icCekmece: Math.floor(sayiAl(s.icCekmece, 0, 0, 4)),
      icCekmeceH: (() => { const v = sayiAl(s.icCekmeceH, null, 0, 400); return v >= 60 ? v : null; })(),
      // Elle raf yükseklikleri: satırın iç tabanından rafın üst yüzüne (mm); boşsa raflar eşit aralıklı
      rafYukseklikleri: rafListesi(s.rafYukseklikleri),
      askiUstten: (() => { const v = sayiAl(s.askiUstten, null, 0, 600); return v >= 30 ? v : null; })(),
      rafGeri: sayiAl(s.rafGeri, null, 0, 300),
      altTablaYok: !!s.altTablaYok, // satırın altında sabit tabla olmasın
      // Askı: boru (duvara paralel, derin dolap), kanca (portmanto), önden (derinlemesine çekilir ray, sığ dolap)
      askiTuru: secenekAl(s.askiTuru, ['boru', 'kanca', 'onden'], 'boru'),
      // Bu satırın ön yüzlerine (kapak/çekmece önü) özel malzeme ya da renk tabakası
      onMalzeme: typeof s.onMalzeme === 'string' && s.onMalzeme ? s.onMalzeme.slice(0, 40) : null,
    };
  }
  /** "300, 650" ya da [300, 650] → sıralı, tekrarsız, en fazla 20 pozitif sayı. */
  function rafListesi(v) {
    const L = (Array.isArray(v) ? v : typeof v === 'string' ? v.split(/[;,\s]+/) : []).map((x) => Number(String(x).replace(',', '.')))
      .filter((x) => Number.isFinite(x) && x > 0 && x <= 5000).map((x) => Math.round(x * 10) / 10);
    return [...new Set(L)].sort((a, b) => a - b).slice(0, 20);
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
      if (x.hirdavat && hirdavatGecerli(k, x.hirdavat[k])) hirdavat[k] = x.hirdavat[k];
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
      // Duvardaki sabit konum (köşeden/duvar başından mm); boşsa sıradan dizilir
      konum: sayiAl(x.konum, null, 0, 50000),
      duvar: secenekAl(x.duvar, ['A', 'B'], 'A'),
      yapi: secenekAl(x.yapi, ['yanlar_boydan', 'tabla_boydan'], 'yanlar_boydan'),
      ust: secenekAl(x.ust, ['tam', 'kusak'], 'tam'),
      arkalik: lk ? 'cakma' : secenekAl(x.arkalik, ['kanal', 'cakma', 'yok'], 'kanal'),
      kapakTipi: lk ? 'tam' : secenekAl(x.kapakTipi, ['tam', 'ic'], 'tam'),
      baza: {
        tip: secenekAl(baza.tip, ['yok', 'ayak', 'ayak_on', 'panel', 'tekerlek'], 'yok'),
        yukseklik: sayiAl(baza.yukseklik, 0, 0, 500),
        geriCekme: sayiAl(baza.geriCekme, 0, 0, 500),
      },
      korPanel: sayiAl(x.korPanel, 0, 0, 2000),
      korTaraf: secenekAl(x.korTaraf, ['sol', 'sag'], 'sol'),
      bazaCekmece: !!x.bazaCekmece,
      // Alt tabla yok: yanlar zemine basar, en alt satır zemine açılır (ör. buzdolabı nişi)
      altTablaYok: tip === 'normal' && !!x.altTablaYok,
      // Yanlar bazaya iner (baza çerçevesi yanların arasında, yalnız ön ve arka)
      yanlarYere: !!x.yanlarYere,
      // Üst tabla taşması (tablalar boydan): önden ve her yandan mm; kapak üstü: üst tabla kapakların üstünü de kapatır
      ustTasmaOn: sayiAl(x.ustTasmaOn, 0, 0, 100),
      ustTasmaYan: sayiAl(x.ustTasmaYan, 0, 0, 100),
      ustKapakUstu: !!x.ustKapakUstu,
      // Üst tabla köşe kavisi (R, mm) ve hangi ön köşeler
      ustKavisR: sayiAl(x.ustKavisR, 0, 0, 1000),
      ustKavisKose: secenekAl(x.ustKavisKose, ['on', 'sol', 'sag'], 'on'),
      // Trend: kapak yüzey deseni, uzun kulp (delik aralığı; 0 = proje), alttan LED (asma ünite / üst dolap altı)
      kapakDesen: secenekAl(x.kapakDesen, Object.keys(KAPAK_DESENLERI), 'duz'),
      kulpBoy: sayiAl(x.kulpBoy, 0, 0, 1200),
      ledAlt: !!x.ledAlt,
      ledArka: !!x.ledArka, // panel / ayna arkası LED (duvara hare ışık)
      egimli: !!x.egimli,
      sagYukseklik: sayiAl(x.sagYukseklik, sayiAl(x.yukseklik, 720, 0, 5000), 0, 5000),
      kulpYon: secenekAl(x.kulpYon, ['proje', ...Object.keys(KULP_YONLERI)], 'proje'),
      kulpKonum: secenekAl(x.kulpKonum, ['proje', ...Object.keys(KULP_KONUMLARI)], 'proje'),
      onTipi: secenekAl(x.onTipi, ['normal', 'surgu'], 'normal'),
      surguAdet: Math.floor(sayiAl(x.surguAdet, 2, 2, 4)),
      surguTuru: secenekAl(x.surguTuru, Object.keys(SURGU_TURLERI), 'panel'),
      raf: Math.floor(sayiAl(x.raf, 0, 0, 20)),
      sutunlar,
      // Panel modül alanları
      panelTuru: secenekAl(x.panelTuru, Object.keys(PANEL_TURLERI), 'serbest'),
      nesneTuru: secenekAl(x.nesneTuru, Object.keys(NESNELER), 'buzdolabi'),
      lambriCitaEn: sayiAl(x.lambriCitaEn, 40, 10, 400),
      lambriAralik: sayiAl(x.lambriAralik, 20, 0, 400),
      lambriYon: secenekAl(x.lambriYon, ['dikey', 'yatay'], 'dikey'),
      lambriArka: secenekAl(x.lambriArka, ['yok', 'govde', 'kapak'], 'yok'),
      nesneD: sayiAl(x.nesneD, null, 1, 3000),
      duvarMesafe: sayiAl(x.duvarMesafe, 0, 0, 3000), // nesnenin duvardan uzaklığı (ör. raf içinde öne alma)
      panelMalzeme: secenekAl(x.panelMalzeme, ['kapak', 'govde', 'ayna'], 'kapak'),
      // Masa: yükseklik, ayak tipi, tabla taşması (ayaklardan / panellerden), ayak kesiti, kayıt (etek), bacak paneli
      masaH: sayiAl(x.masaH, 750, 200, 1300),
      masaAyak: secenekAl(x.masaAyak, Object.keys(MASA_AYAKLARI), 'panel'),
      masaTasma: sayiAl(x.masaTasma, 30, 0, 300),
      masaAyakKesit: sayiAl(x.masaAyakKesit, 60, 25, 150),
      masaKayit: !!x.masaKayit,
      masaKayitH: sayiAl(x.masaKayitH, 80, 40, 200),
      masaArka: !!x.masaArka,
      boy: sayiAl(x.boy, 720, 0, 10000),
      en: sayiAl(x.en, 600, 0, 10000),
      bantU: Math.floor(sayiAl(x.bantU, 0, 0, 2)),
      bantK: Math.floor(sayiAl(x.bantK, 0, 0, 2)),
      sekil: secenekAl(x.sekil, Object.keys(SEKILLER), 'dikdortgen'),
      sekilParam: sayiAl(x.sekilParam, 0, 0, 10000),
      koseSayisi: Math.floor(sayiAl(x.koseSayisi, 4, 1, 4)),
      sekilBant: secenekAl(x.sekilBant, ['tum', 'egri', 'yok'], 'tum'),
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
    A.cekmeceTabani = secenekAl(g.cekmeceTabani, ['cakma', 'kanal'], 'cakma');
    A.gommeAraTabla = secenekAl(g.gommeAraTabla, ['tam', 'kayit'], 'tam');
    A.kulpYon = secenekAl(g.kulpYon, Object.keys(KULP_YONLERI), 'dikey');
    A.kulpKonum = secenekAl(g.kulpKonum, Object.keys(KULP_KONUMLARI), 'oto');
    A.kulpCekmece = secenekAl(g.kulpCekmece, ['ust', 'orta'], 'ust');
    A.duvarAski = secenekAl(g.duvarAski, ['aparat', 'ray'], 'aparat');
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
      A.hirdavat[k] = hirdavatGecerli(k, x) ? x : v.hirdavat[k];
    }
    const gf = g.fiyat || {};
    const F = {};
    for (const k of Object.keys(v.fiyat)) if (typeof v.fiyat[k] === 'number') F[k] = sayiAl(gf[k], v.fiyat[k], 0, k.endsWith('Orani') || k.endsWith('Fire') ? 1000 : undefined);
    F.plakaHesabi = secenekAl(gf.plakaHesabi, ['tam', 'alan'], 'tam');
    F.iscilikEsasi = secenekAl(gf.iscilikEsasi, ['m2', 'modul'], 'm2');
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
      id: kimlikAl(p && p.id, 'pr'),
      olusturma: typeof (p && p.olusturma) === 'string' ? p.olusturma.slice(0, 30) : new Date().toISOString(),
      ad: metinAl(p && p.ad, 'Yeni proje', 80),
      artikKullan: !!(p && p.artikKullan),
      ayarlar: A,
      moduller,
      yerlesim: {
        tip: secenekAl(y.tip, ['duz', 'L'], 'duz'),
        duvarA: sayiAl(y.duvarA, 3600, 0, 50000),
        duvarB: sayiAl(y.duvarB, 2400, 0, 50000),
        birlestir: y.birlestir === undefined ? true : !!y.birlestir,
        tavan: sayiAl(y.tavan, 0, 0, 10000),
        // Mutfak tezgahı (3B görünüş): tür, kalınlık, önden taşma, tezgah arası kaplama
        tezgah: (() => {
          const t = y.tezgah || {};
          return { acik: t.acik !== false, tur: secenekAl(t.tur, Object.keys(TEZGAH_TURLERI), 'beyaz_mermer'), renk: typeof t.renk === 'string' && /^#[0-9a-f]{6}$/i.test(t.renk) ? t.renk.toLowerCase() : null, kalinlik: sayiAl(t.kalinlik, 30, 10, 80), tasma: sayiAl(t.tasma, 20, 0, 80), arasi: t.arasi !== false };
        })(),
        koseAcisi: sayiAl(y.koseAcisi, 90, 45, 135),
        duvarSapma: sayiAl(y.duvarSapma, 0, 0, 200),
        engeller: (Array.isArray(y.engeller) ? y.engeller : []).slice(0, 60).map((e) => ({
          tur: secenekAl(e && e.tur, Object.keys(ENGEL_TURLERI), 'diger'),
          duvar: secenekAl(e && e.duvar, ['A', 'B'], 'A'),
          x: sayiAl(e && e.x, 0, 0, 50000),
          y: sayiAl(e && e.y, 0, 0, 10000),
          genislik: sayiAl(e && e.genislik, 0, 0, 50000),
          yukseklik: sayiAl(e && e.yukseklik, 0, 0, 10000),
          derinlik: sayiAl(e && e.derinlik, 0, 0, 3000),
          not: metinAl(e && e.not, '', 80),
        })),
      },
      teklif: {
        musteri: metinAl(t.musteri, '', 80),
        telefon: metinAl(t.telefon, '', 40),
        adres: metinAl(t.adres, '', 200),
        teklifNo: metinAl(t.teklifNo, '', 40),
        gecerlilikGun: Math.floor(sayiAl(t.gecerlilikGun, 15, 0, 365)),
        teslimSuresi: metinAl(t.teslimSuresi, '', 60),
        not: metinAl(t.not, '', 1000),
        secenekler: (Array.isArray(t.secenekler) ? t.secenekler : []).slice(0, 4).map((sc) => {
          const kul = {};
          const hrd = {};
          for (const k of KULLANIMLAR) if (sc && sc.kullanim && A.malzemeler.some((m) => m.id === sc.kullanim[k])) kul[k] = sc.kullanim[k];
          for (const k of Object.keys(HIRDAVAT_SECENEKLERI)) if (sc && sc.hirdavat && hirdavatGecerli(k, sc.hirdavat[k])) hrd[k] = sc.hirdavat[k];
          const kar = sayiAl(sc && sc.karOrani, null, 0, 1000);
          return { id: kimlikAl(sc && sc.id, 'sc'), ad: metinAl(sc && sc.ad, 'Seçenek', 40), aciklama: metinAl(sc && sc.aciklama, '', 120), kullanim: kul, hirdavat: hrd, karOrani: kar };
        }),
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

  /** Malzemenin 3B yüzey dokusu: mermer desenli, ahşap damarlı ya da düz (null). */
  function malzemeDokusu(m) {
    if (!m || camMi(m)) return null;
    if (/mermer|marble|traverten|taş desen/i.test(m.ad)) return 'mermer';
    return m.damar ? 'ahsap' : null;
  }
  /** Modülün görünüş renkleri (3B): gövde, kapak (ön yüzler), çekmece kutusu, arkalık; panelde kendi malzemesi. doku: kullanım → doku. */
  function modulRenkleri(modul, ayar) {
    const M = malzemeCoz(modul, ayar);
    const r = (k) => (M[k] && M[k].renk) || varsayilanRenk(M[k] && M[k].ad, M[k] && M[k].tur);
    const R2 = { govde: r('govde'), kapak: r('kapak'), cekmece: r('cekmece'), arkalik: r('arkalik') };
    R2.doku = { govde: malzemeDokusu(M.govde), kapak: malzemeDokusu(M.kapak), cekmece: malzemeDokusu(M.cekmece), arkalik: malzemeDokusu(M.arkalik) };
    if (modul.tip === 'panel') {
      const k = modul.panelMalzeme === 'govde' ? 'govde' : modul.panelMalzeme === 'ayna' ? 'ayna' : 'kapak';
      const p = k === 'ayna' ? r('ayna') : R2[k];
      const d = k === 'ayna' ? null : R2.doku[k];
      // Lambri: çıtalar kapak, arka panel gövde malzemesinde kalır
      if (modul.panelTuru !== 'lambri') { R2.govde = p; R2.kapak = p; R2.doku.govde = d; R2.doku.kapak = d; }
    }
    return R2;
  }

  /** Boyama paleti: güncel mobilya renkleri (ad, renk). */
  const RENK_PALETI = [
    ['Beyaz', '#f2efe8'], ['Krem', '#ece4d4'], ['Kaşmir', '#d8ccb8'], ['Taş bej', '#c8b9a2'], ['Vizon', '#a39382'],
    ['Mat gri', '#9a9a96'], ['Füme', '#5f6163'], ['Antrasit', '#4b4d50'], ['Mat siyah', '#2d2d2f'],
    ['Açık meşe', '#d9bf98'], ['Doğal meşe', '#c9a57a'], ['Ceviz', '#8a5a3c'], ['Moka', '#6b5545'],
    ['Adaçayı', '#9db09a'], ['Petrol yeşili', '#3f5a55'], ['Gece mavisi', '#34465f'], ['Pudra', '#d9b8b0'], ['Mermer beyaz', '#ebe8e2'],
  ];
  const RENK_KELIME = /\s*\b(beyaz|krem|kaşmir|kasmir|taş bej|bej|vizon|mat gri|gri|füme|fume|antrasit|mat siyah|siyah|açık meşe|doğal meşe|meşe|ceviz|moka|adaçayı yeşili|adaçayı|petrol yeşili|yeşil|gece mavisi|mavi|pudra|mermer beyaz)\b/giu;
  /**
   * Renk tabakası: kaynak malzemenin (kalınlık, plaka, fiyat aynı) istenen renkteki eşi. Varsa yeniden
   * kullanılır, yoksa anında oluşturulur (oto). Kesim ve plaka listesi malzemeye göre ayrıldığı için her
   * renk kendi tabakasında çıkar. Dönüş: malzeme id.
   */
  function renkTabakasi(ayar, kaynakId, renk, renkAd) {
    const r = String(renk || '').toLowerCase();
    if (!/^#[0-9a-f]{6}$/.test(r)) return kaynakId;
    const k0 = malzemeBul(ayar, kaynakId) || ayar.malzemeler[0];
    const kaynak = (k0.oto && malzemeBul(ayar, k0.kaynak)) || k0;
    if ((kaynak.renk || '').toLowerCase() === r) return kaynak.id;
    const ayni = ayar.malzemeler.find((m) => m.renk === r && m.kalinlik === kaynak.kalinlik && m.tur === kaynak.tur && (m.kaynak === kaynak.id || !m.oto));
    if (ayni) return ayni.id;
    const ad = (kaynak.ad.replace(RENK_KELIME, '').replace(/\s{2,}/g, ' ').trim() + ' – ' + (renkAd || r)).slice(0, 80);
    const m = Object.assign({}, kaynak, { id: yeniId('mz'), ad, renk: r, oto: true, kaynak: kaynak.id });
    if (ayar.malzemeler.length >= 100) return kaynak.id;
    ayar.malzemeler.push(m);
    return m.id;
  }
  /** Projede hiçbir yerde kullanılmayan otomatik renk tabakalarını siler. Dönüş: silinen sayısı. */
  function otoTabakalariTemizle(proje) {
    const A = proje.ayarlar;
    const kul = new Set(Object.values(A.kullanim || {}));
    for (const m of proje.moduller) {
      for (const v of Object.values(m.malzeme || {})) kul.add(v);
      for (const c of m.sutunlar || []) for (const r of c.satirlar || []) if (r.onMalzeme) kul.add(r.onMalzeme);
    }
    for (const sc of (proje.teklif && proje.teklif.secenekler) || []) for (const v of Object.values(sc.kullanim || {})) kul.add(v);
    const once = A.malzemeler.length;
    A.malzemeler = A.malzemeler.filter((m) => !m.oto || kul.has(m.id));
    return once - A.malzemeler.length;
  }

  /** Modülün hırdavat seçimleri (modül seçimi > proje varsayılanı). */
  function hirdavatCoz(modul, ayar) {
    const sonuc = {};
    for (const k of Object.keys(HIRDAVAT_SECENEKLERI)) {
      const secim = modul.hirdavat && modul.hirdavat[k];
      const gecerli = (x) => hirdavatGecerli(k, x);
      sonuc[k] = gecerli(secim) ? secim : gecerli(ayar.hirdavat && ayar.hirdavat[k]) ? ayar.hirdavat[k] : VARSAYILAN_AYARLAR.hirdavat[k];
    }
    return sonuc;
  }

  /** Modülün kulp ayarları (modül seçimi > proje). sinif: alt | ust | boy (otomatik konum için). */
  function kulpBaglami(modul, A, H) {
    const montaj = Math.max(0, say(modul.montajYuksekligi, 0));
    return {
      yon: modul.kulpYon && modul.kulpYon !== 'proje' ? modul.kulpYon : A.kulpYon || 'dikey',
      konum: modul.kulpKonum && modul.kulpKonum !== 'proje' ? modul.kulpKonum : A.kulpKonum || 'oto',
      cekmeceKonum: A.kulpCekmece || 'ust',
      aralik: Math.max(0, say(modul.kulpBoy, 0) > 0 ? say(modul.kulpBoy, 0) : say(A.kulpAralik, 160)),
      kenar: Math.max(10, say(A.kulpKenar, 40)),
      ucMesafe: Math.max(10, say(A.kulpUcMesafe, 60)),
      sinif: montaj > ASILI_SINIR ? 'ust' : H >= 1500 ? 'boy' : 'alt',
      montaj,
    };
  }

  /**
   * Kulp delik merkezleri (ön yüzün sol-alt köşesine göre, mm) ve atölye notu.
   * tip: kapak | cekmece; menteseSol: menteşe sol kenarda mı (kulp açılan kenara konur);
   * altYerden: ön yüz alt kenarının zeminden yüksekliği (boy dolapta el hizası için).
   */
  /** Hırdavat seçimi geçerli mi (yalnızca tanımlı anahtarlar; "constructor" gibi miras adlar geçmez). */
  const hirdavatGecerli = (k, x) => Object.prototype.hasOwnProperty.call(HIRDAVAT_SECENEKLERI, k) && typeof x === 'string'
    && Object.prototype.hasOwnProperty.call(HIRDAVAT_SECENEKLERI[k].secenekler, x);

  function kulpDelikleri(c, tip, acilim, w, h, menteseSol, altYerden) {
    const a = c.aralik;
    const yari = a / 2;
    let cx;
    let cy;
    let yatay;
    if (tip === 'cekmece' || acilim === 'yukari' || acilim === 'asagi') {
      yatay = true;
      cx = w / 2;
      if (tip === 'cekmece') cy = c.cekmeceKonum === 'ust' ? h - Math.min(c.ucMesafe, h / 2) : h / 2;
      else cy = acilim === 'yukari' ? Math.min(c.ucMesafe, h / 2) : h - Math.min(c.ucMesafe, h / 2);
    } else {
      yatay = c.yon === 'yatay';
      const uzun = yatay ? 0 : yari;
      const kenardan = c.kenar + (yatay ? yari : 0);
      cx = menteseSol ? w - kenardan : kenardan;
      let konum = c.konum;
      if (konum === 'oto') konum = c.sinif === 'ust' ? 'alt' : c.sinif === 'boy' ? 'el' : 'ust';
      const enAz = c.ucMesafe + uzun;
      if (konum === 'ust') cy = h - enAz;
      else if (konum === 'alt') cy = enAz;
      else if (konum === 'el') cy = Math.min(h - enAz, Math.max(enAz, 1050 - altYerden));
      else cy = h / 2;
      cy = Math.min(Math.max(cy, Math.min(enAz, h / 2)), Math.max(h - enAz, h / 2));
    }
    const delikler = a <= 0 ? [{ x: cx, y: cy }]
      : yatay ? [{ x: cx - yari, y: cy }, { x: cx + yari, y: cy }] : [{ x: cx, y: cy - yari }, { x: cx, y: cy + yari }];
    const yuv = (L) => L.map((x) => r1(x)).join(' / ');
    let not;
    if (tip === 'kapak' && acilim === 'yana') {
      const kenarMes = r1(menteseSol ? w - delikler[0].x : delikler[0].x);
      not = yatay
        ? `Kulp Ø5${a ? ` (aralık ${a})` : ''}: açılan kenardan ${yuv(delikler.map((d) => (menteseSol ? w - d.x : d.x)))}, alttan ${r1(cy)} mm`
        : `Kulp Ø5${a ? ` (aralık ${a})` : ''}: açılan kenardan ${kenarMes}, alttan ${yuv(delikler.map((d) => d.y))} mm`;
    } else {
      not = `Kulp Ø5${a ? ` (aralık ${a})` : ''}: soldan ${yuv(delikler.map((d) => d.x))}, alttan ${r1(cy)} mm`;
    }
    // Delikler ön yüzün içinde (kenardan en az 15 mm) kalmalı. Kalmıyorsa yana açılan kapakta
    // diğer yön denenir; o da olmazsa tek delikli düğme kulba düşülür.
    const pay = 15;
    const icinde = delikler.every((d) => d.x >= pay - 1e-6 && d.x <= w - pay + 1e-6 && d.y >= pay - 1e-6 && d.y <= h - pay + 1e-6);
    if (!icinde && a > 0) {
      if (tip === 'kapak' && acilim === 'yana' && !c.denendi) {
        const alt = kulpDelikleri(Object.assign({}, c, { yon: yatay ? 'dikey' : 'yatay', denendi: true }), tip, acilim, w, h, menteseSol, altYerden);
        if (!alt.dugme) return alt;
      }
      const x = Math.min(Math.max(cx, Math.min(pay, w / 2)), Math.max(w - pay, w / 2));
      const y = Math.min(Math.max(cy, Math.min(pay, h / 2)), Math.max(h - pay, h / 2));
      return { delikler: [{ x, y }], yatay, dugme: true, not: `Kulp sığmıyor (aralık ${a}): tek delikli düğme kulp Ø5, soldan ${r1(x)}, alttan ${r1(y)} mm` };
    }
    return { delikler, yatay, not };
  }

  /** Menteşe çanak (Ø35) delik merkezleri: kapak üst kenarından mm. Uçlar 100 mm, aralar eşit. */
  function mentesheKonumlari(h, adet) {
    // Kısa kapakta uç mesafesi kapak boyunun dörtte birini geçmez (menteşeler üst üste binmez)
    const uc = h < 400 ? Math.min(Math.max(50, h * 0.2), h / 4) : 100;
    if (adet <= 1) return [r1(h / 2)];
    const L = [];
    for (let i = 0; i < adet; i++) L.push(r1(uc + (i * (h - 2 * uc)) / (adet - 1)));
    return L;
  }
  const mentesheNotu = (h, adet) => `Menteşe Ø35 çanak, kenardan 22,5 mm; üstten ${mentesheKonumlari(h, adet).join(' / ')} mm`;

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

  /**
   * Toplam ölçüyü parçalara paylaştırır. degerler: sabit ölçü veya null (oto).
   * Sonuç her zaman toplamı tam doldurur ve hiçbir parça min'in altına inmez
   * (toplam yetmiyorsa eşit bölünür). Sabit ölçüler sığmazsa orantılı küçültülür.
   * Dönüş: { olculer, not } — not, kullanıcıya gösterilecek açıklama (yoksa null).
   */
  function paylastir(degerler, toplam, min) {
    const n = degerler.length;
    const sabitler = degerler.map((v) => (v > 0 ? Number(v) : null));
    const sabit = sabitler.reduce((a, v) => a + (v || 0), 0);
    const oto = sabitler.filter((v) => v === null).length;
    if (n === 0) return { olculer: [], not: null };
    if (toplam < n * min) return { olculer: sabitler.map(() => toplam / n), not: `yer çok dar; ${n} parçaya eşit bölündü (${r1(toplam / n)} mm)` };
    if (oto > 0) {
      const kalan = (toplam - sabit) / oto;
      if (kalan >= min) return { olculer: sabitler.map((v) => (v === null ? kalan : v)), not: null };
      const k = (toplam - oto * min) / sabit;
      return { olculer: sabitler.map((v) => (v === null ? min : v * k)), not: `girilen ölçüler toplamı (${r1(sabit)}) sığmıyor; sabit ölçüler %${Math.round(k * 100)} oranında küçültüldü` };
    }
    const fark = toplam - sabit;
    if (Math.abs(fark) <= 0.5) return { olculer: sabitler, not: null };
    const son = sabitler[n - 1] + fark;
    if (son >= min) {
      const olculer = sabitler.slice();
      olculer[n - 1] = son;
      return { olculer, not: `girilen ölçüler toplamı (${r1(sabit)}) kullanılabilir ölçüden (${r1(toplam)}) farklı; fark (${fark > 0 ? '+' : ''}${r1(fark)}) son parçaya eklendi` };
    }
    const k = toplam / sabit;
    return { olculer: sabitler.map((v) => v * k), not: `girilen ölçüler toplamı (${r1(sabit)}) sığmıyor; tümü %${Math.round(k * 100)} oranında küçültüldü` };
  }

  /** Hesap sırasında parça/hırdavat toplayan yardımcı. */
  function toplayici(M) {
    const parcalar = [];
    const hirdavat = [];
    const uyarilar = [];
    let onMalz = null; // satıra özel ön yüz malzemesi (kapak kullanımının yerine geçer)
    return {
      parcalar, hirdavat, uyarilar,
      onMalzemeAyarla(m) { onMalz = m || null; },
      ekle(ad, kullanim, boy, en, adet, bant, ek) {
        if (adet <= 0) return null;
        if (!(boy > 0) || !(en > 0)) {
          uyarilar.push(`"${ad}" parçasının ölçüsü geçersiz çıktı (${r1(boy)} x ${r1(en)}).`);
          return null;
        }
        const m = kullanim === 'kapak' && onMalz ? onMalz : M[kullanim];
        const cam = camMi(m);
        const p = Object.assign({ ad, kullanim, malzeme: m.id, boy: r1(boy), en: r1(en), adet, bant: cam ? { u: 0, k: 0 } : bant || { u: 0, k: 0 }, damar: !cam && !!m.damar, cam }, ek || {});
        // Atölye notlarında Türkçe ondalık virgül
        if (p.not) p.not = p.not.replace(/(\d)\.(\d)/g, '$1,$2');
        parcalar.push(p);
        return p;
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
      // Köşe takozu: tek parça, her panele 2 vida (4 vida). Açılı T (çektirme): iki yarım parça, her biri
      // kendi paneline 2 vidayla; yarımlar pakete dahil çektirme cıvatasıyla birbirine sıkılır (4 vida + 1 cıvata).
      const ad = tur === 'seffaf_t' ? 'Şeffaf T bağlantı (iki parça + çektirme vidası)' : 'Şeffaf köşe bağlantı (köşe takozu)';
      T.hEkle(tur, ad, nokta, tur === 'seffaf_t' ? 'takım' : 'adet');
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

  function bazaEkle(T, baza, hb, W, Ds, t, ayakTur, ayakAdedi, onYok, yanYok) {
    if (baza.tip === 'ayak' || baza.tip === 'ayak_on') {
      T.hEkle('ayak_' + ayakTur, `${HIRDAVAT_SECENEKLERI.ayak.secenekler[ayakTur].ad} (${hb} mm)`, ayakAdedi || (W > 1000 ? 6 : 4));
      if (baza.tip === 'ayak_on') {
        // Ayaklar + yalnız önde baza bandı (ayaklara klipsle takılır)
        T.ekle('Baza önü (klipsli)', 'govde', W, hb - 3, 1, { u: 1, k: 0 }, { not: `Ön ayaklara klipsle takılır; önden ${say(baza.geriCekme, 0)} mm geride, zeminden 3 mm boşluk` });
        T.hEkle('baza_klips', 'Baza klipsi', W > 1000 ? 3 : 2);
      }
    } else if (baza.tip === 'tekerlek') {
      T.hEkle('tekerlek', `Tekerlek (${hb} mm)`, 4);
    } else if (baza.tip === 'panel') {
      const gc = say(baza.geriCekme, 0);
      // Baza çerçevesi: ön parça önden geri çekilir, yanlar gövdeyle aynı hizada.
      // Zemine değen alt kenar bantlanır (nemden korunur): 1 uzun kenar
      if (onYok) T.ekle('Baza arkası', 'govde', W, hb, 1, { u: 1, k: 0 });
      else T.ekle('Baza ön/arka', 'govde', W, hb, 2, { u: 1, k: 0 });
      if (!yanYok) T.ekle('Baza yanı', 'govde', Ds - gc - 2 * t, hb, 2, { u: 1, k: 0 });
      if (!yanYok && Ds - gc - 2 * t < 100) T.uyarilar.push('Baza yanı çok kısa; baza geri çekme değerini kontrol edin.');
    }
  }

  /**
   * Bir ön kapağın parçalarını kapak türüne göre ekler (panel, cam, profil, çerçeve, ayna).
   * Dönüş: menteşe türü için camlı mı bilgisi.
   */
  function kapakParcalari(T, A, ad, h, w, n, kapakTuru, notu) {
    const { ekle, hEkle } = T;
    const ek = notu ? { not: notu } : undefined;
    if (kapakTuru === 'cam') {
      ekle(`${ad} – cam`, 'cam', h, w, n, null, ek ? { not: notu.replace('Menteşe Ø35 çanak, kenardan 22,5 mm', 'Cam menteşe yeri') } : undefined);
      return 'cam';
    }
    if (kapakTuru === 'ayna') {
      ekle(`${ad} – ayna`, 'ayna', h, w, n, null, ek ? { not: notu.replace('Menteşe Ø35 çanak, kenardan 22,5 mm', 'Cam menteşe yeri') } : undefined);
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
      ekle(`${ad} – çerçeve dikmesi`, 'kapak', h, e, 2 * n, { u: 2, k: 2 }, ek);
      ekle(`${ad} – çerçeve kaydı`, 'kapak', w - 2 * e, e, 2 * n, { u: 2, k: 0 });
      ekle(`${ad} – çerçeve camı`, 'cam', h - 2 * e + 2 * lp - 2, w - 2 * e + 2 * lp - 2, n);
      hEkle('kavela', 'Kavela 8×35', 8 * n);
      if (w - 2 * e < 80 || h - 2 * e < 80) T.uyarilar.push(`${ad}: çerçeveli cam kapak için kapak çok küçük.`);
      return 'panel';
    }
    ekle(ad, 'kapak', h, w, n, { u: 2, k: 2 }, ek);
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
    // Alt tablasız dolapta yanlar zemine basar: baza ve sürgü (alt ray) kullanılamaz
    const altYok = !!modul.altTablaYok && modul.onTipi !== 'surgu';
    if (modul.altTablaYok && !altYok) uyarilar.push('Sürgü kapaklı dolapta alt ray için alt tabla gerekir; alt tabla eklendi.');
    const baza = altYok ? YOK : modul.baza || { tip: 'yok', yukseklik: 0, geriCekme: 0 };
    const hb = baza.tip === 'yok' ? 0 : say(baza.yukseklik, 0);
    let Hc = H - hb; // gövde (baza hariç) yüksekliği; eğimli dolapta alçak taraf
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

    // ---------- Eğimli üst (çatı altı / merdiven altı) ----------
    // Sol yükseklik = modül yüksekliği, sağ yükseklik = sagYukseklik. Satırlar alçak tarafa göre
    // yerleşir; en üst satırın ön yüzleri ve üst tabla eğime göre kesilir.
    let egim = null;
    if (modul.egimli) {
      const H2 = say(modul.sagYukseklik, H);
      const HcR = H2 - hb;
      if (surgu) uyarilar.push('Eğimli dolapta sürgü kapak desteklenmez; eğim uygulanmadı.');
      else if (ic) uyarilar.push('Eğimli dolapta gömme kapak desteklenmez; eğim uygulanmadı.');
      else if (HcR < 2 * t + 150) uyarilar.push(`Sağ yükseklik (${H2} mm) çok küçük; eğim uygulanmadı.`);
      else if (Math.abs(HcR - Hc) >= 1) {
        const alfa = Math.atan2(Math.abs(HcR - Hc), W);
        if (alfa > Math.PI / 3) uyarilar.push(`Eğim ${r1((alfa * 180) / Math.PI)}°; 60°'den dik eğim desteklenmez, eğim uygulanmadı.`);
        else {
          egim = { HcL: Hc, HcR, dH: HcR - Hc, alfa, aciDer: r1((alfa * 180) / Math.PI), min: Math.min(Hc, HcR), max: Math.max(Hc, HcR) };
          Hc = egim.min;
        }
      }
    }
    // x konumundaki gövde dış yüksekliği (eğim yoksa sabit)
    const HcX = (x) => (egim ? egim.HcL + (egim.dH * x) / W : Hc);
    const kulpC = kulpBaglami(modul, A, H);
    const kulpVar = HS.kulp === 'kulp';

    // Yan derinliği: çakma arkalık gövdenin arkasına çakıldığı için yanlardan düşülür.
    // Girilen derinlik gövde (yan) derinliğidir; arkaya çakılan arkalık ayar açıksa bu derinliğe dahil edilir
    const Ds = modul.arkalik === 'cakma' && A.arkalikDerinlikte ? D - ta : D;
    // Ara tabla, dikme ve raflar için kullanılabilir derinlik
    let icDerinlik = Ds;
    if (modul.arkalik === 'kanal') icDerinlik = Ds - say(A.arkalikGeriPay, 10) - ta;
    if (ic) icDerinlik -= tk;
    // Sürgü kapaklı dolapta raflar tam derin; yalnızca gömme iç çekmeceler ön kalınlığı kadar kısalır
    const cekmeceDerinlik = surgu && !ic ? icDerinlik - tk : icDerinlik;
    // Gömme kapakta kapaklar bölücülerin arasına girer: boydan dikmeler ve satır arası tablalar öne kadar gelir
    // (iç raflar kapağın arkasında kalır). İstenirse satır arası tabla yalnız önde bir kayıt olur.
    const bolucuD = ic ? icDerinlik + tk : icDerinlik;
    const araTablaD = ic && A.gommeAraTabla === 'kayit' ? Math.min(bolucuD, Math.max(50, say(A.gommeKayitEn, 110))) : bolucuD;

    // ---------- Gövde ----------
    if (egim && modul.ust === 'kusak') uyarilar.push('Eğimli dolapta kuşak yerine tam üst tabla kullanıldı.');
    const kusakEn = say(A.kusakGenisligi, 100);
    const kusakSigmaz = modul.ust === 'kusak' && !egim && Ds < 2 * kusakEn + 20;
    if (kusakSigmaz) uyarilar.push(`Derinlik (${r1(Ds)} mm) iki kuşak (${kusakEn} mm) için yetersiz; tam üst tabla kullanıldı.`);
    const usttam = modul.ust !== 'kusak' || !!egim || kusakSigmaz;
    const tablaBoydan = modul.yapi === 'tabla_boydan';
    // Yanlar bazaya iner: yalnız baza çerçevesinde; alt tabla yanların arasına girer
    const yanYere = !!modul.yanlarYere && baza.tip === 'panel' && hb > 0;
    const hbYan = yanYere ? hb : 0;
    const altUstte = tablaBoydan && !altYok && !yanYere; // alt tabla yanların altında mı
    // Üst tabla taşması: üst tabla yanların üstünde olmalı (tablalar boydan, tam üst tabla, eğimsiz)
    const tasmaIstek = say(modul.ustTasmaOn, 0) > 0 || say(modul.ustTasmaYan, 0) > 0 || !!modul.ustKapakUstu;
    const tasmaOlur = tablaBoydan && usttam && !egim && !surgu;
    if (tasmaIstek && !tasmaOlur) uyarilar.push('Üst tabla taşması / kapak üstü yalnız "Tablalar boydan", tam üst tablalı, eğimsiz ve menteşeli dolapta uygulanır.');
    // Önden taşan üst tabla tam bini kapakların üstünü de kapatır: kapaklar tablanın altında biter.
    // Ön taşma kapak yüzünden ölçülür (tabla derinliği = gövde + kapak kalınlığı + taşma).
    const kapakUstu = tasmaOlur && !ic && (!!modul.ustKapakUstu || say(modul.ustTasmaOn, 0) > 0);
    const tasmaYan = tasmaOlur ? say(modul.ustTasmaYan, 0) : 0;
    const tasmaOn = tasmaOlur ? say(modul.ustTasmaOn, 0) + (kapakUstu ? tk : 0) : 0;
    const yanNot = altYok ? { not: 'Alt tabla yok: alt ucu zemine basar; zemine/duvara köşebentle sabitleyin' }
      : yanYere ? { not: `Yan bazaya iner: alt ${hb} mm baza yüksekliği; alt tabla yanların arasına girer` } : undefined;
    if (tablaBoydan) {
      if (!altYok) {
        if (altUstte) ekle('Alt tabla', 'govde', W, Ds, 1, { u: 1, k: 2 });
        else ekle('Alt tabla', 'govde', iw, Ds, 1, { u: 1, k: 0 });
      }
      if (usttam) {
        const ustNot = tasmaOn || tasmaYan ? `Taşma: önden ${r1(tasmaOn)}${kapakUstu ? ' (kapak kalınlığı dahil, kapakların üstünü kapatır)' : ''}, yanlardan ${r1(tasmaYan)} mm` : '';
        const kavR = !egim ? Math.min(say(modul.ustKavisR, 0), (Ds + tasmaOn) / 2, (W + 2 * tasmaYan) / 2) : 0;
        if (kavR > 0) {
          // Kavisli ön köşeler: şekilli (CNC/şablon) kesim, bant ön ve yan kenarlar boyunca
          const ub = W + 2 * tasmaYan;
          const ue = Ds + tasmaOn;
          const nK = modul.ustKavisKose === 'on' ? 2 : 1;
          const sg = sekilGeometrisi('radyus', ue, ub, kavR, nK);
          const koseAd = { on: 'iki ön köşe', sol: 'sol ön köşe', sag: 'sağ ön köşe' }[modul.ustKavisKose];
          ekle('Üst tabla – kavisli', 'govde', sg.kutuH, sg.kutuW, 1, { u: 0, k: 0 }, {
            sekil: { tur: 'radyus', alan: sg.alan, cevre: sg.cevre, egri: sg.egri, duz: sg.duz, cnc: sg.cnc },
            bantUzunluk: sg.cevre - ub,
            not: [`${koseAd} R${r1(kavR)} mm kavisli (CNC/şablon); arka kenar düz, bantsız`, ustNot].filter(Boolean).join('; '),
          });
        } else ekle('Üst tabla', 'govde', W + 2 * tasmaYan, Ds + tasmaOn, 1, { u: 1, k: 2 }, ustNot ? { not: ustNot } : undefined);
        ekle('Yan', 'govde', Hc - t - (altUstte ? t : 0) + hbYan, Ds, 2, { u: 1, k: 0 }, yanNot);
      } else {
        ekle('Yan', 'govde', Hc - (altUstte ? t : 0) + hbYan, Ds, 2, { u: 1, k: 1 }, yanNot);
        ekle('Ön kuşak', 'govde', iw, kusakEn, 1, { u: 1, k: 0 });
        ekle('Arka kuşak', 'govde', iw, kusakEn, 1, { u: 0, k: 0 });
      }
    } else {
      ekle('Yan', 'govde', Hc + hbYan, Ds, 2, { u: 1, k: 0 }, yanNot);
      if (!altYok) ekle('Alt tabla', 'govde', iw, Ds, 1, { u: 1, k: 0 });
      if (usttam) {
        ekle('Üst tabla', 'govde', iw, Ds, 1, { u: 1, k: 0 });
      } else {
        ekle('Ön kuşak', 'govde', iw, kusakEn, 1, { u: 1, k: 0 });
        ekle('Arka kuşak', 'govde', iw, kusakEn, 1, { u: 0, k: 0 });
      }
    }
    const birlesim = (usttam ? 4 : 2) - (altYok ? 2 : 0); // köşe birleşimleri: alt + üst tablanın iki ucu
    if (altYok) hEkle('kosebent', 'Bağlantı köşebendi', 4);
    const kusakNokta = usttam ? 0 : 4; // kuşaklar uç başına tek nokta
    let araBirlesim = 0; // T birleşimleri: ara tabla ve dikme uçları

    // ---------- Arkalık ----------
    if (modul.arkalik === 'kanal') {
      const kd = say(A.arkalikKanalDerinligi, 8);
      // Alt tablasızda arkalık alttan zeminden 10 mm yukarıda biter
      ekle('Arkalık (kanallı)', 'arkalik', altYok ? Hc - t + (kd - 1) - 10 : Hc - 2 * t + 2 * (kd - 1), iw + 2 * (kd - 1), 1);
    } else if (modul.arkalik === 'cakma') {
      const p = say(A.arkalikCakmaPay, 2);
      ekle('Arkalık (çakma)', 'arkalik', Hc - 2 * p, W - 2 * p, 1);
      hEkle('arkalik_vida', 'Arkalık vidası / zımba çivisi', Math.ceil((2 * (Hc + W)) / 150));
    }

    const ray0 = HIRDAVAT_SECENEKLERI.ray.secenekler[HS.ray];
    // Kullanıcının girdiği ray yan boşluğu kataloğun önüne geçer (metal yanlı sistem hariç)
    const ray = HS.ray !== 'metal' && say(A.cekmeceRayBosluk, 0) > 0 ? Object.assign({}, ray0, { yanBosluk: say(A.cekmeceRayBosluk, 0) }) : ray0;
    const kd = say(A.arkalikKanalDerinligi, 8);
    let metalUyarisi = false;
    const kutular = []; // delik planı için çekmece kutusu ölçüleri
    /**
     * Çekmece kutusu parçalarını ekler (normal, iç ve baza çekmecesi ortak).
     * acW: rayların takıldığı açıklık, otoH: otomatik kutu yüksekliği, maksH: sığabilecek en yüksek kutu,
     * istenenH / rayIstenen: kullanıcı seçimi (null = otomatik), derinlik: ray için kullanılabilir derinlik.
     */
    function cekmeceKutusu(etiket, acW, otoH, maksH, istenenH, derinlik, rayIstenen, adet) {
      let L = raySec(derinlik - 10);
      if (rayIstenen) {
        if (rayIstenen <= derinlik - 10) L = rayIstenen;
        else uyarilar.push(`${etiket}: ${rayIstenen} mm ray sığmıyor (kullanılabilir ${r1(derinlik - 10)} mm); ${L || '—'} mm seçildi.`);
      }
      if (!L) {
        uyarilar.push(`${etiket}: iç derinlik (${r1(derinlik)} mm) en kısa ray (250 mm) için yetersiz.`);
        return null;
      }
      let kutuH = Math.floor(Math.min(otoH, maksH));
      if (istenenH) {
        if (istenenH > maksH + 0.5) uyarilar.push(`${etiket}: istenen kutu yüksekliği ${istenenH} mm sığmıyor; en fazla ${Math.floor(maksH)} mm yapıldı.`);
        kutuH = Math.floor(Math.min(istenenH, maksH));
      }
      if (kutuH < 50) {
        uyarilar.push(`${etiket}: çekmece kutusu yüksekliği ${kutuH} mm, çok düşük (en az 50 mm).`);
        return null;
      }
      // Kutu eni = açıklık − 2 × (ray yan boşluğu + ek kutu boşluğu)
      const ekB = HS.ray === 'metal' ? 0 : say(A.cekmeceEkBosluk, 0);
      const icGenislik = HS.ray === 'metal' ? acW - ray.arkaFark : acW - 2 * (ray.yanBosluk + ekB) - 2 * tc;
      if (icGenislik < 60) {
        uyarilar.push(`${etiket}: açıklık (${r1(acW)} mm) çekmece kutusu için çok dar.`);
        return null;
      }
      if (HS.ray === 'metal' && kutuH < 68) {
        uyarilar.push(`${etiket}: metal yanlı çekmece için en az 68 mm kutu yüksekliği gerekir (sığan ${kutuH} mm).`);
        return null;
      }
      if (HS.ray === 'metal') {
        // Metal yanlı sistem: yanlar hazır gelir, yalnızca taban ve arkalık kesilir.
        const arkaH = kutuH >= 180 ? 167 : kutuH >= 110 ? 100 : 68;
        ekle(`Çekmece tabanı (${etiket})`, 'cekmece', L - ray.boyFark, acW - ray.tabanFark, adet, { u: 0, k: 0 });
        ekle(`Çekmece arkalığı (${etiket})`, 'cekmece', acW - ray.arkaFark, arkaH, adet, { u: 1, k: 0 });
        hEkle('cekmece_metal', `Metal yanlı çekmece seti ${L} mm (arka yük. ${arkaH})`, adet, 'takım');
        if (!metalUyarisi) uyarilar.push('Metal yanlı çekmece ölçüleri genel değerlerdir; kullandığınız markanın kataloğuyla kontrol edin.');
        metalUyarisi = true;
        kutular.push({ etiket, metal: true, L, tabanBoy: L - ray.boyFark, tabanEn: acW - ray.tabanFark, arkaW: acW - ray.arkaFark, arkaH, adet });
        return { L, kutuW: acW - 10, kutuH: arkaH, pay: 5 };
      }
      const kutuW = acW - 2 * (ray.yanBosluk + ekB);
      const kutuL = L - ray.kutuBoyFark;
      ekle(`Çekmece yanı (${etiket})`, 'cekmece', kutuL, kutuH, 2 * adet, { u: 1, k: 0 });
      ekle(`Çekmece ön/arka (${etiket})`, 'cekmece', kutuW - 2 * tc, kutuH, 2 * adet, { u: 1, k: 0 },
        { not: `Kutu dış eni ${r1(kutuW)} = açıklık ${r1(acW)} − 2 × (ray ${r1(ray.yanBosluk)} + boşluk ${r1(ekB)}) mm` });
      if (A.cekmeceTabani === 'kanal') {
        ekle(`Çekmece tabanı (${etiket})`, 'arkalik', kutuL - 2 * tc + 2 * (kd - 1), kutuW - 2 * tc + 2 * (kd - 1), adet, null,
          { not: `Kanala geçme: yan ve ön/arka parçalarda alttan 10 mm, ${kd} mm derin kanal` });
      } else {
        ekle(`Çekmece tabanı (${etiket})`, 'arkalik', kutuL, kutuW, adet, null, { not: 'Alttan çakma / zımbalama' });
      }
      hEkle('ray_' + HS.ray, `${ray.ad} ${L} mm`, adet, 'takım');
      if (HS.kulp === 'basac') hEkle('basac_ray', 'Ray için bas-aç adaptörü', adet);
      kutular.push({ etiket, metal: false, L: kutuL, kutuW, kutuH, tc, kd, ta, taban: A.cekmeceTabani, ray: HS.ray, adet });
      return { L: kutuL, kutuW, kutuH, pay: ray.yanBosluk + ekB };
    }
    function cekmeceIciEkle(tur, adet, icGenislik) {
      if (tur === 'catal') hEkle('catal_kasiklik', `Çatal-kaşıklık (kutu içi ${r1(icGenislik)} mm)`, adet);
      else if (tur === 'bolucu') hEkle('cekmece_bolucu', 'Çekmece bölücü seti', adet, 'takım');
      if (tur === 'catal' && icGenislik < 250) uyarilar.push(`Çatal-kaşıklık için çekmece içi ${r1(icGenislik)} mm dar.`);
    }

    // ---------- Baza çekmecesi (süpürgelikte gizli çekmece) ----------
    let geoBazaCekmece = null;
    let bazaOnYok = false;
    if (modul.bazaCekmece && !altYok) {
      if (baza.tip !== 'ayak' && baza.tip !== 'panel') {
        uyarilar.push('Baza çekmecesi için ayaklı veya baza çerçeveli dolap gerekir.');
      } else if (hb < 100) {
        uyarilar.push(`Baza çekmecesi için baza yüksekliği en az 100 mm olmalı (şu an ${hb} mm).`);
      } else {
        const gc = say(baza.geriCekme, 0);
        const onH = hb - 10;
        // Önce kutunun sığdığı doğrulanır; sığmazsa ön ve taşıyıcı da eklenmez
        // Ayaklı bazada arka ayaklara yer kalsın (kutu arkası ayakların önünde)
        const k = cekmeceKutusu('baza çekmecesi', W - 2 * t, hb - 45, hb - 25, null, Ds - gc - 30 - (baza.tip === 'ayak' ? 40 : 0), null, 1);
        if (k) {
          ekle('Baza çekmecesi önü', 'kapak', onH, W - 2 * db, 1, { u: 2, k: 2 }, { not: 'Süpürgelik hizasında; bas-aç ile açılır' });
          // Taşıyıcılar yanların altında, çekmece önünün arkasından baza arkasına (ya da gövde arkasına) kadar;
          // panel bazada baza yanlarının yerini alır
          ekle('Baza çekmecesi taşıyıcı', 'govde', Ds - gc - tk - 2 - (baza.tip === 'panel' ? t : 0), hb, 2, { u: 0, k: 0 }, { not: 'Zemine basar ve dolabın önünü taşır; raylar iç yüze; yanların altına kavela + köşebentle' });
          if (HS.kulp !== 'basac') {
            hEkle('basac', 'Bas-aç mekanizması', 1);
            hEkle('basac_ray', 'Ray için bas-aç adaptörü', 1);
          }
          geoBazaCekmece = { x1: db, x2: W - db, y1: 4, y2: 4 + onH };
          bazaOnYok = baza.tip === 'panel';
        }
      }
    }

    // Baza çekmecesinde ön ayaklar çekmece yolunda kalır: yalnızca arka ayaklar
    if (yanYere) {
      // Baza yanların arasında: ön (geri çekilmiş) ve arka parça
      ekle('Baza önü', 'govde', iw, hb, 1, { u: 1, k: 0 }, { not: `Yanların arasında, önden ${r1(say(baza.geriCekme, 0))} mm geride; alt kenar zemine değer (bantlı)` });
      ekle('Baza arkası', 'govde', iw, hb, 1, { u: 1, k: 0 });
      hEkle('kavela', 'Kavela 8×35', 2 * 2 * (hb < 100 ? 1 : 2));
    } else {
      bazaEkle(T, baza, hb, W, Ds, t, HS.ayak, geoBazaCekmece ? (W > 1000 ? 3 : 2) : undefined, bazaOnYok, !!geoBazaCekmece);
      // Baza çerçevesinin köşe birleşimleri (ön/arka ile yanlar): köşe başına 1 (100 mm altı) ya da 2 bağlantı;
      // şeffaf bağlantıda köşe başına tek takoz
      if (baza.tip === 'panel' && !geoBazaCekmece) {
        const seffaf = HS.baglanti === 'seffaf_kose' || HS.baglanti === 'seffaf_t';
        baglantiEkle(T, HS.baglanti, 0, Ds, 4 * (hb < 100 || seffaf ? 1 : 2));
      }
    }

    // ---------- Ön yüz alanı ve kör köşe paneli ----------
    let x0 = icDuzen ? t + g : db;
    let x1 = icDuzen ? W - t - g : W - db;
    const yUst = icDuzen ? Hc - t - g : kapakUstu ? Hc - t - db : Hc - db;
    const yAlt = altYok ? 10 : icDuzen ? t + g : db;
    // Dikey bölme genişlikleri (kör panel kontrolü bunlara bağlı)
    const sutunlar = modul.sutunlar && modul.sutunlar.length ? modul.sutunlar : [{ genislik: null, satirlar: [] }];
    const ns = sutunlar.length;
    const icToplam = iw - (ns - 1) * t;
    const pg = paylastir(sutunlar.map((c) => c.genislik), icToplam, 100);
    const genislikler = pg.olculer;
    if (pg.not) uyarilar.push(`Bölme genişlikleri: ${pg.not}.`);

    let korPanel = null;
    const kp = say(modul.korPanel, 0);
    // Kör panelin kapattığı bölmenin (sol: ilk, sağ: son) ön yüz sınırı
    const korBolmeSiniri = modul.korTaraf === 'sag'
      ? (ns > 1 ? W - t - genislikler[ns - 1] - t / 2 + g / 2 : db)
      : (ns > 1 ? t + genislikler[0] + t / 2 - g / 2 : W - db);
    const korSonrasiKapak = modul.korTaraf === 'sag' ? (W - db - kp - g) - korBolmeSiniri : korBolmeSiniri - (db + kp + g);
    if (kp > 0) {
      if (icDuzen) {
        uyarilar.push('Kör köşe paneli yalnızca tam bini kapakla hesaplanır; dikkate alınmadı.');
      } else if (kp >= W - 200 || korSonrasiKapak < 100) {
        uyarilar.push(`Kör panel (${kp} mm) çok geniş: yanındaki kapağa ${r1(korSonrasiKapak)} mm kalıyor; kör panel uygulanmadı.`);
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
    if (ns > 1) {
      if (egim) {
        let x = t;
        for (let k = 0; k < ns - 1; k++) {
          x += genislikler[k];
          ekle(`Bölme dikmesi (boydan) ${k + 1}`, 'govde', Math.max(HcX(x), HcX(x + t)) - (altYok ? 0 : t) - t / Math.cos(egim.alfa), bolucuD, 1, { u: 1, k: 0 }, { not: `Üst ucu ${egim.aciDer}° eğimli kesilir (ölçü uzun kenar)` });
          x += t;
        }
      } else ekle('Bölme dikmesi (boydan)', 'govde', altYok ? Hc - t : Hc - 2 * t, bolucuD, ns - 1, { u: 1, k: 0 }, ic ? { not: 'Gömme kapak: önde gövdeyle aynı hizada' } : undefined);
      araBirlesim += 2 * (ns - 1);
    }

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
          // Kullanıcı satırın altındaki sabit tablayı kaldırabilir (ör. çekmece altı)
          const p = !(satirlar[i].tip === 'cekmece' && satirlar[i + 1].tip === 'cekmece') && !satirlar[i].altTablaYok;
          panelVar.push(p);
          ayrac.push(icDuzen && p ? t + 2 * g : g);
        }
        const kullanilabilir = yUst - yAlt - ayrac.reduce((a, b) => a + b, 0);
        const py = paylastir(satirlar.map((x) => {
          const h = Number(x.yukseklik);
          return x.yukseklik === null || x.yukseklik === '' || !Number.isFinite(h) || h <= 0 ? null : h;
        }), kullanilabilir, 60);
        const yukseklikler = py.olculer;
        if (py.not) uyarilar.push(`${ns > 1 ? `Bölme ${si + 1} ` : ''}satır yükseklikleri: ${py.not}.`);

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
          // Satıra özel ön yüz malzemesi (boyama): aynı kalınlıkta, cam olmayan malzeme
          const onM = s.onMalzeme ? malzemeBul(A, s.onMalzeme) : null;
          const onGecerli = onM && !camMi(onM) && Math.abs(say(onM.kalinlik, 0) - tk) < 0.01;
          if (onM && !onGecerli) uyarilar.push(`${ek(i + 1)}: ön yüz malzemesi "${onM.ad}" kapak kalınlığından (${tk} mm) farklı ya da cam; proje kapak malzemesi kullanıldı.`);
          T.onMalzemeAyarla(onGecerli ? onM : null);
          const icUst = i === 0 ? Hc - t : sinirlar[i - 1].panel ? sinirlar[i - 1].y - t / 2 : sinirlar[i - 1].y;
          const icAlt = i === satirlar.length - 1 ? (altYok ? 0 : t) : sinirlar[i].panel ? sinirlar[i].y + t / 2 : sinirlar[i].y;
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
            aski: false, kapakTuru, acilim, rafTipi: s.rafTipi || 'ahsap', led: !!s.led, menteseYonu: s.menteseYonu || 'oto',
            rafSabit: !!s.rafSabit && s.rafTipi !== 'cam',
          };

          if (dikme > 0) {
            if (egim && i === 0) {
              satirDikmeX.forEach((dx, k) => ekle(`Ara dikme (${ek(i + 1)}) ${k + 1}`, 'govde', Math.max(HcX(dx), HcX(dx + t)) - t / Math.cos(egim.alfa) - icAlt, icDerinlik, 1, { u: 1, k: 0 }, { not: `Üst ucu ${egim.aciDer}° eğimli kesilir (ölçü uzun kenar)` }));
            } else ekle(`Ara dikme (${ek(i + 1)})`, 'govde', icH, icDerinlik, dikme, { u: 1, k: 0 });
            araBirlesim += 2 * dikme;
          }
          if (secW > 0 && secW < 100) uyarilar.push(`${ek(i + 1)}: bölme iç genişliği ${r1(secW)} mm, çok dar.`);

          // Ön yüzler. Sürgü kapaklı dolapta kapak satırlarının ön yüzü yoktur (sürgü kapak kapatır).
          const onVar = s.tip === 'cekmece' || (s.tip === 'kapak' && !surgu);
          if (onVar) {
            const ayr = icDuzen && n > 1 && dikme >= n - 1 ? t + 2 * g : g;
            const fw = (fx1 - fx0 - (n - 1) * ayr) / n;
            // Eğimli dolabın en üst satırı: ön yüz üst kenarı eğime uyar
            const egimliSatir = !!egim && i === 0;
            const ekstra = (x) => (egimliSatir ? HcX(x) - Hc : 0);
            for (let k = 0; k < n; k++) {
              const fx = fx0 + k * (fw + ayr);
              const menteseSol = s.tip === 'kapak' && acilim === 'yana' ? (n === 1 ? s.menteseYonu !== 'sag' : k % 2 === 0) : true;
              const o = { x1: fx, x2: fx + fw, menteseSol };
              if (egimliSatir) { o.y2sol = on.y2 + ekstra(fx); o.y2sag = on.y2 + ekstra(fx + fw); }
              if (kulpVar) o.kulp = kulpDelikleri(kulpC, s.tip, acilim, fw, on.h, menteseSol, kulpC.montaj + hb + on.y1);
              geo.onler.push(o);
            }
            const kulpNotu = kulpVar ? geo.onler[0].kulp.not : null;
            const notBirlestir = (...L) => L.filter(Boolean).join(' · ') || null;
            if (egimliSatir) {
              // Her ön yüz ayrı yamuk parça: sol ve sağ kenar yükseklikleri farklı
              if (s.tip === 'kapak' && kapakTuru !== 'panel') uyarilar.push(`${ek(i + 1)}: eğimli kapakta yalnızca düz panel desteklenir; düz panel yapıldı.`);
              if (s.tip === 'cekmece') uyarilar.push(`${ek(i + 1)}: eğimli satırda çekmece — ön yüz yamuk kesilir, kutu alçak tarafa göre boyutlanır; üst satırı kapak yapmak daha uygundur.`);
              geo.onler.forEach((o, k) => {
                const hL = on.h + ekstra(o.x1);
                const hR = on.h + ekstra(o.x2);
                const sg = sekilGeometrisi('egimli', fw, hL, hR, 0);
                const ad = s.tip === 'kapak' ? `Kapak (${ek(i + 1)}) – eğimli ${k + 1}` : `Çekmece önü (${ek(i + 1)}) – eğimli ${k + 1}`;
                ekle(ad, 'kapak', sg.kutuH, sg.kutuW, 1, { u: 0, k: 0 }, {
                  sekil: { tur: 'egimli', alan: sg.alan, cevre: sg.cevre, egri: 0, duz: sg.duz, cnc: sg.cnc },
                  bantUzunluk: sg.cevre,
                  not: notBirlestir(`Yamuk: sol ${r1(hL)}, sağ ${r1(hR)} mm; ${sg.bilgi.join(', ')}`, s.tip === 'kapak' && acilim === 'yana' ? mentesheNotu(o.menteseSol ? hL : hR, mentesheAdedi(o.menteseSol ? hL : hR)) + ' (menteşe kenarının üstünden)' : null, o.kulp && o.kulp.not),
                });
              });
            }
            if (s.tip === 'kapak') {
              const yonNotu = n === 1 ? (s.menteseYonu === 'sag' ? ' · menteşe sağ kenarda' : ' · menteşe sol kenarda') : ' · çiftte menteşeler dış kenarlarda';
              const mNotu = acilim === 'yana' ? mentesheNotu(on.h, mentesheAdedi(on.h)) + yonNotu : null;
              const camli = egimliSatir ? false : kapakParcalari(T, A, `Kapak (${ek(i + 1)})`, on.h, fw, n, kapakTuru, notBirlestir(acilim === 'yana' ? mNotu : null, kulpNotu)) === 'cam';
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
                // Eğimli üst satırda her kapağın menteşe kenarı farklı boydadır
                const adet = egimliSatir
                  ? geo.onler.reduce((t2, o) => t2 + mentesheAdedi((o.menteseSol ? o.y2sol : o.y2sag) - on.y1), 0)
                  : n * mentesheAdedi(on.h);
                if (camli) hEkle('mentese_cam', 'Cam kapak menteşesi', adet);
                else mentesheEkle(T, HS.mentese, modul.kapakTipi, adet, !icDuzen && dikme > 0 && n > 1);
                if (!icDuzen && dikme > 0 && n > 1 && !camli) uyarilar.push(`${ek(i + 1)}: ara dikmeye bağlanan kapaklarda yarım bini menteşe kullanılmalı.`);
              }
            } else {
              geo.onGenislik = fw; // çekmece önü, kutu hesaplandıktan sonra eklenir
            }
          }

          // İç (gizli) çekmeceler: kapaklı satırın altında, menteşeyi aşmak için iki yanda dolgu paneliyle
          let rafAlt = icAlt;
          geo.icCekmeceler = [];
          if (s.tip === 'kapak' && s.icCekmece > 0) {
            const n = s.icCekmece;
            const hF = s.icCekmeceH || say(A.icCekmeceYukseklik, 140);
            const bosluk = 3;
            const bolge = n * hF + (n - 1) * bosluk + 5;
            const dolgu = t;
            if (bolge > icH - 80) {
              uyarilar.push(`${ek(i + 1)}: ${n} iç çekmece (${r1(bolge)} mm) bu satıra sığmıyor (iç yükseklik ${r1(icH)} mm); eklenmedi.`);
            } else if (secW - 2 * dolgu < 150) {
              uyarilar.push(`${ek(i + 1)}: iç çekmece için bölme çok dar (${r1(secW)} mm); eklenmedi.`);
            } else {
              const etiket = `${ek(i + 1)}, iç çekmece`;
              const onW = secW - 2 * dolgu - 4;
              // Önce kutu: sığmazsa dolgu ve ön de eklenmez
              const k = cekmeceKutusu(etiket, secW - 2 * dolgu, hF - say(A.cekmeceUstBosluk, 40), hF - 10, s.kutuYukseklik, icDerinlik - t - 5, s.rayBoyu, n * bolum);
              if (k) {
                ekle(`İç çekmece dolgu paneli (${ek(i + 1)})`, 'govde', bolge, icDerinlik, 2 * bolum, { u: 1, k: 0 }, { not: 'Menteşe kolunu aşmak için yana vidalanır; raylar bu panele takılır' });
                ekle(`İç çekmece önü (${ek(i + 1)})`, 'govde', hF - bosluk, onW, n * bolum, { u: 2, k: 2 });
                hEkle('sunta_vidasi', 'Sunta vidası 3,5×16', 8 * bolum);
                kulpEkle(T, HS.kulp === 'kulp' ? 'gomme' : HS.kulp, n * bolum, onW);
                cekmeceIciEkle(s.cekmeceIc, n * bolum, k.kutuW - 2 * tc);
                for (const b of bolumler) {
                  for (let j = 0; j < n; j++) {
                    const y1 = icAlt + 2 + j * (hF + bosluk);
                    geo.icCekmeceler.push({ x1: b.x1 + dolgu + 2, x2: b.x2 - dolgu - 2, y1, y2: y1 + hF - bosluk, L: k.L, kutuH: k.kutuH, kutuW: k.kutuW, kutuY1: y1 + 5 });
                  }
                }
                rafAlt = icAlt + bolge;
                geo.icDolguH = bolge;
              }
            }
          }

          // Raflar, askı, LED
          if (s.tip === 'kapak' || s.tip === 'acik') {
            // Raf konumları: elle girilen yükseklikler (iç tabandan rafın üst yüzüne) ya da eşit aralık
            const rafKal = s.rafTipi === 'cam' ? say(M.camRaf && M.camRaf.kalinlik, 8) : t;
            let elleKonum = null;
            const liste = rafListesi(s.rafYukseklikleri);
            if (liste.length) {
              elleKonum = [];
              for (const h of liste) {
                const merkez = icAlt + h - rafKal / 2;
                if (merkez - rafKal / 2 < rafAlt + 20 || h > icH - 20) { uyarilar.push(`${ek(i + 1)}: ${r1(h)} mm raf satırın içine sığmıyor (iç yükseklik ${r1(icH)} mm${rafAlt > icAlt ? `, iç çekmeceler ${r1(rafAlt - icAlt)} mm` : ''}); atlandı.`); continue; }
                if (elleKonum.length && merkez - elleKonum[elleKonum.length - 1] < rafKal + 40) uyarilar.push(`${ek(i + 1)}: ${r1(h)} mm raf bir öncekine çok yakın.`);
                elleKonum.push(merkez);
              }
            }
            const raf = elleKonum ? elleKonum.length : Math.max(0, Math.floor(say(s.raf, 0)));
            const rafYerlestir = () => {
              if (elleKonum) for (const y of elleKonum) geo.raflar.push(y);
              else for (let j = 1; j <= raf; j++) geo.raflar.push(rafAlt + (j * (icUst - rafAlt)) / (raf + 1));
            };
            geo.askiUstten = s.askiUstten || 60;
            geo.rafGeri = s.rafGeri != null ? s.rafGeri : say(A.rafOnGeriCekme, 20);
            const sabit = s.rafSabit && s.rafTipi !== 'cam';
            if (raf > 0 && sabit) {
              // Sabit raf: bölme genişliğinde, ara bağlantıyla (ör. şeffaf T) iki ucundan bağlanır
              ekle(`Sabit raf (${ek(i + 1)})`, 'govde', secW, icDerinlik, raf * bolum, { u: 1, k: 0 });
              araBirlesim += 2 * raf * bolum;
              if (secW > 900) uyarilar.push(`${ek(i + 1)}: raf açıklığı ${r1(secW)} mm; ${t} mm rafta sehim olur, ara dikme ekleyin.`);
              rafYerlestir();
            } else if (raf > 0) {
              const yb = say(A.rafYanBosluk, 1);
              const rafD = icDerinlik - geo.rafGeri;
              if (s.rafTipi === 'cam') {
                ekle(`Cam raf (${ek(i + 1)})`, 'camRaf', secW - 2 * yb - 2, rafD, raf * bolum);
                hEkle('cam_raf_pimi', 'Cam raf pimi', 4 * raf * bolum);
                if (secW > 800) uyarilar.push(`${ek(i + 1)}: cam raf açıklığı ${r1(secW)} mm; 800 mm üstü için daha kalın cam veya ara dikme önerilir.`);
              } else {
                ekle(`Raf (${ek(i + 1)})`, 'govde', secW - 2 * yb, rafD, raf * bolum, { u: 1, k: 0 });
                hEkle('raf_pimi', 'Raf pimi', 4 * raf * bolum);
                if (secW > 900) uyarilar.push(`${ek(i + 1)}: raf açıklığı ${r1(secW)} mm; ${t} mm rafta sehim olur, ara dikme ekleyin.`);
              }
              rafYerlestir();
            }
            if (s.aski && s.askiTuru === 'kanca') {
              // Portmanto kancaları arkaya / arkalığa vidalanır; derinlik şartı yok
              geo.kanca = Math.max(2, Math.floor(secW / 150));
              hEkle('aski_kancasi', 'Askı kancası (portmanto)', geo.kanca * bolum);
              hEkle('sunta_vidasi', 'Sunta vidası 3,5×16', 2 * geo.kanca * bolum);
            } else if (s.aski && s.askiTuru === 'onden') {
              geo.ondenAski = true;
              hEkle('onden_aski', 'Öne çekilir askı (derinlemesine ray)', bolum);
              if (icDerinlik < 300) uyarilar.push(`${ek(i + 1)}: öne çekilir askı için iç derinlik ${r1(icDerinlik)} mm; en az 300 mm gerekir.`);
              if (icH < 800) uyarilar.push(`${ek(i + 1)}: askı bölmesi yüksekliği ${r1(icH)} mm; en az 800 mm önerilir.`);
            } else if (s.aski) {
              geo.aski = true;
              hEkle('aski_borusu', `Askı borusu (${r1(secW - 2)} mm)`, bolum, 'adet', (bolum * (secW - 2)) / 1000);
              if (icH - geo.askiUstten < 600) uyarilar.push(`${ek(i + 1)}: askı borusunun altında ${r1(icH - geo.askiUstten)} mm kalıyor; askı için en az 600 mm gerekir.`);
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
            const k = cekmeceKutusu(ek(i + 1), secW, on.h - say(A.cekmeceUstBosluk, 40), icH - 15, s.kutuYukseklik, cekmeceDerinlik, s.rayBoyu, bolum);
            const fw = geo.onGenislik;
            if (k) {
              if (!(egim && i === 0)) ekle(`Çekmece önü (${ek(i + 1)})`, 'kapak', on.h, fw, n, { u: 2, k: 2 }, geo.onler[0] && geo.onler[0].kulp ? { not: geo.onler[0].kulp.not } : undefined);
              kulpEkle(T, HS.kulp, n, fw);
            } else {
              // Kutu sığmadı: ön yüz yine kapanmalı, sabit (açılmayan) panel olarak monte edilir
              // Eğimli üst satırda yamuk ön zaten eklendi; ikinci kez eklenmez
              if (egim && i === 0) {
                for (const p of T.parcalar) if (p.ad.startsWith(`Çekmece önü (${ek(i + 1)}) – eğimli`)) p.ad = p.ad.replace('Çekmece önü', 'Sabit ön – çekmece sığmadı');
              }
              if (!(egim && i === 0)) ekle(`Sabit ön – çekmece sığmadı (${ek(i + 1)})`, 'kapak', on.h, fw, n, { u: 2, k: 2 }, { not: 'Çekmece kutusu sığmadı; ön yüz sabit monte edilir (kulp ve ray yok)' });
              hEkle('kosebent', 'Bağlantı köşebendi', 2 * n);
              geo.sahteOn = true;
            }
            if (k) {
              for (const b of bolumler) geo.cekmeceler.push({ x1: b.x1 + k.pay, x2: b.x2 - k.pay, y1: icAlt + 10, y2: icAlt + 10 + k.kutuH, L: k.L, kutuW: k.kutuW, kutuH: k.kutuH });
              cekmeceIciEkle(s.cekmeceIc, bolum, k.kutuW - 2 * tc);
            }
          }
          T.onMalzemeAyarla(null);
          geo.no = i;
          if (onGecerli) { geo.onRenk = onM.renk || varsayilanRenk(onM.ad, onM.tur); geo.onDoku = malzemeDokusu(onM); }
          geoSatirlar.push(geo);
          tumSatirlar.push(geo);
        }

        // Satırlar arası sabit raflar (ara tabla)
        const araTabla = sinirlar.filter((b) => b.panel).length;
        if (araTabla > 0) {
          ekle(ns > 1 ? `Ara tabla (bölme ${si + 1})` : 'Ara tabla (sabit raf)', 'govde', cw, araTablaD, araTabla, { u: 1, k: 0 },
            araTablaD < bolucuD ? { not: `Gömme kapak: yalnız önde ${r1(araTablaD)} mm kayıt` } : ic ? { not: 'Gömme kapak: önde gövdeyle aynı hizada' } : undefined);
          araBirlesim += 2 * araTabla;
        }
      }
      for (const b of sinirlar) tumSinirlar.push(b);
      geoSutunlar.push({ x1: cx1, x2: cx2, fx0, fx1, satirlar: geoSatirlar, sinirlar });
    }
    if (modul.ledAlt) {
      // Alttan LED: asma ünitenin / üst dolabın altında, ön kenara yakın profil içinde
      ledVar = true;
      const m = Math.max(0, W - 40) / 1000;
      hEkle('led_serit', 'LED şerit', m, 'm');
      hEkle('led_profil', 'LED alüminyum profili', m, 'm');
    }
    if (ledVar) hEkle('led_adaptor', 'LED adaptörü', 1);
    // Kapak yüzey deseni: ön yüzlere not, CNC freze ya da altın çıta işçiliği
    const desen = modul.kapakDesen && modul.kapakDesen !== 'duz' && KAPAK_DESENLERI[modul.kapakDesen] ? modul.kapakDesen : null;
    if (desen) {
      const onlar = T.parcalar.filter((p) => p.kullanim === 'kapak' && !p.cam && /^(Kapak|Çekmece önü)/.test(p.ad) && !/çerçeve/.test(p.ad));
      let alan = 0;
      let cita = 0;
      for (const p of onlar) {
        alan += (p.boy * p.en * p.adet) / 1e6;
        cita += (p.adet * 2 * (Math.max(0, p.boy - 100) + Math.max(0, p.en - 100))) / 1000;
        p.not = [p.not, `Yüzey: ${KAPAK_DESENLERI[desen].toLocaleLowerCase('tr')}`].filter(Boolean).join(' · ');
      }
      if (desen === 'altin_cita') { if (cita > 0) hEkle('altin_cita', 'Altın renkli dekor çıtası', r3(cita), 'm'); }
      else if (alan > 0) {
        hEkle('cnc_desen', `Kapak yüzey deseni – ${KAPAK_DESENLERI[desen].toLocaleLowerCase('tr')}`, r3(alan), 'm²');
        const kaplamali = onlar.some((p) => { const mz = malzemeBul(A, p.malzeme); return mz && !['MDF Lake', 'Ham MDF', 'Masif panel'].includes(mz.tur); });
        if (kaplamali) uyarilar.push(`Kapak deseni (${KAPAK_DESENLERI[desen].toLocaleLowerCase('tr')}) freze ister; suntalam, lam ve akrilik yüzeyde yapılmaz. Ön yüzleri MDF Lake ya da ham MDF seçin.`);
      }
    }
    if (T.hirdavat.some((h) => h.kod === 'raf_pimi' || h.kod === 'cam_raf_pimi')) {
      const pimNot = 'Raf pimi delikleri Ø5 × 10 derinlik: önden ve arkadan 37 mm, 32 mm aralıkla (32 sistem)';
      for (const p of T.parcalar) if ((p.ad === 'Yan' || p.ad.startsWith('Ara dikme') || p.ad.startsWith('Bölme dikmesi')) && !p.not) p.not = pimNot;
    }

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

    if (egim) {
      // Yanlar farklı yükseklikte, üst tabla eğik, arkalık yamuk
      const cos = Math.cos(egim.alfa);
      const aci = egim.aciDer;
      const cikar = (ad) => { const i = T.parcalar.findIndex((p) => p.ad === ad); if (i >= 0) T.parcalar.splice(i, 1); };
      cikar('Yan');
      cikar('Üst tabla');
      const yanH = (h) => (tablaBoydan ? h - (altUstte ? t : 0) - t / cos + hbYan : h + hbYan);
      const yanNot = `Üst kenarı kalınlık boyunca ${aci}° eğimli kesilir`;
      // Kalınlık boyunca açılı kesimde kaba ölçü uzun kenardır (yüksek tarafta dış, alçak tarafta iç kenar)
      const yanEkle = (ad, xDis, xIc) => {
        const dis = yanH(HcX(xDis));
        const ic = yanH(HcX(xIc));
        const pim = T.hirdavat.some((h) => h.kod === 'raf_pimi' || h.kod === 'cam_raf_pimi') ? ' · Raf pimi delikleri Ø5 × 10: önden ve arkadan 37 mm, 32 mm aralıkla' : '';
        ekle(ad, 'govde', Math.max(dis, ic), Ds, 1, { u: 1, k: 0 }, { not: `${yanNot}: dış kenar ${r1(dis)}, iç kenar ${r1(ic)} mm${pim}` });
      };
      yanEkle('Sol yan', 0, t);
      yanEkle('Sağ yan', W, W - t);
      const ustBoy = (tablaBoydan ? W : iw) / cos;
      ekle('Üst tabla (eğimli)', 'govde', ustBoy, Ds, 1, { u: 1, k: tablaBoydan ? 2 : 0 }, { not: `Eğim ${aci}°: iki ucu dikey (${aci}° açılı) kesilir; boy eğik yüzeyde ölçülür` });
      const arkaAd = modul.arkalik === 'kanal' ? 'Arkalık (kanallı)' : 'Arkalık (çakma)';
      if (modul.arkalik !== 'yok') {
        cikar(arkaAd);
        const kd = say(A.arkalikKanalDerinligi, 8);
        const p = say(A.arkalikCakmaPay, 2);
        const en = modul.arkalik === 'kanal' ? iw + 2 * (kd - 1) : W - 2 * p;
        // Kenar yükseklikleri arkalığın kendi sol/sağ kenarındaki gövde yüksekliğinden; böylece
        // arkalığın eğimi gövdeyle aynı olur. Kanallıda üst tablanın düşey kalınlığı t/cos'tur.
        const xa = modul.arkalik === 'kanal' ? t - (kd - 1) : p;
        const hX = (x) => (modul.arkalik === 'kanal' ? (altYok ? HcX(x) - t / cos + (kd - 1) - 10 : HcX(x) - t / cos - t + 2 * (kd - 1)) : HcX(x) - 2 * p);
        const hL = hX(xa);
        const hR = hX(xa + en);
        const sg = sekilGeometrisi('egimli', en, hL, hR, 0);
        ekle(`${arkaAd} – yamuk`, 'arkalik', sg.kutuH, sg.kutuW, 1, { u: 0, k: 0 }, {
          sekil: { tur: 'egimli', alan: sg.alan, cevre: sg.cevre, egri: 0, duz: sg.duz, cnc: sg.cnc }, bantUzunluk: 0,
          not: `Yamuk: sol ${r1(hL)}, sağ ${r1(hR)} mm; ${sg.bilgi.join(', ')}`,
        });
      }
    }

    return {
      parcalar: T.parcalar,
      hirdavat: T.hirdavat,
      uyarilar,
      malzemeler: M,
      hirdavatSecimi: HS,
      geo: {
        W, H: egim ? hb + egim.max : H, D, Hc, hb, t, ta, Ds, icDerinlik, cekmeceDerinlik, tk, db,
        egim: egim ? { HcL: egim.HcL, HcR: egim.HcR, aci: egim.aciDer } : null,
        kulpTur: HS.kulp, montajYuksekligi: kulpC.montaj,
        kapakDesen: desen, kulpRenk: KULP_RENKLERI[HS.kulpRenk] || KULP_RENKLERI.siyah, kulpTur: HS.kulp, ledAlt: !!modul.ledAlt,
        kapakTipi: modul.kapakTipi, arkalik: modul.arkalik, ust: usttam ? 'tam' : 'kusak', yapi: modul.yapi, altYok, kavisR: !egim && tablaBoydan && usttam ? say(modul.ustKavisR, 0) : 0, kavisKose: modul.ustKavisKose, bolucuD, araTablaD, yanYere, tasmaOn, tasmaYan, kapakUstu,
        baza: { tip: baza.tip, yukseklik: hb, geriCekme: say(baza.geriCekme, 0) },
        korPanel,
        sutunlar: geoSutunlar,
        dikmeX,
        satirlar: tumSatirlar,
        sinirlar: tumSinirlar,
        surgu: geoSurgu,
        bazaCekmece: geoBazaCekmece,
        kutular,
        kusakEn, kanalGeri: say(A.arkalikGeriPay, 10), rafGeri: say(A.rafOnGeriCekme, 20), rafYan: say(A.rafYanBosluk, 1), cerceveEni: say(A.cerceveEni, 70), profilPay: say(A.profilCamPay, 18),
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
    const Ds = A.arkalikDerinlikte ? D - ta : D; // arkalık arkaya çakılır; derinliğe dahil değilse yanlar tam derinlik
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
      ekle('Baza önü – B kolu', 'govde', LB - on + t, hb, 1); // köşedeki ve kol ucundaki t×t boşlukları kapatır
      ekle('Baza arkası – A kolu', 'govde', LA, hb, 1);
      ekle('Baza arkası – B kolu', 'govde', LB - t, hb, 1);
      ekle('Baza yanı (kol ucu)', 'govde', on - 2 * t, hb, 2, { u: 1, k: 0 });
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
        rafGeri: say(A.rafOnGeriCekme, 20), rafYan: say(A.rafYanBosluk, 1), kulpTur: HS.kulp,
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
    if (tur === 'nesne') {
      // Eşya / dekor: yalnız görsel; parça ve maliyet yok, yerleşimde başka modülleri itmez
      const n = NESNELER[modul.nesneTuru] || NESNELER.buzdolabi;
      const H = say(modul.boy, 0) || n.H;
      const W = say(modul.en, 0) || n.W;
      const D = say(modul.nesneD, 0) || n.D;
      if (H < 10 || W < 10) T.uyarilar.push('Eşya ölçüleri çok küçük.');
      return { parcalar: [], hirdavat: [], uyarilar: T.uyarilar, malzemeler: M, hirdavatSecimi: HS, geo: { panel: true, tur, bos: true, nesne: modul.nesneTuru, nesneAd: n.ad, renk: n.renk, boy: H, en: W, t: 0, W, D, H, zGeri: say(modul.duvarMesafe, 0), bant: { u: 0, k: 0 }, kullanim: 'kapak', sekil: null } };
    }
    if (tur === 'bosluk') {
      // Yalnızca yer tutar: parça, hırdavat ve maliyet yok; yerleşimde derinliği yoktur (üstüne dolap gelebilir)
      const boy = say(modul.boy, 0);
      const en = say(modul.en, 0);
      if (boy < 20 || en < 20) T.uyarilar.push('Boşluk ölçüleri çok küçük.');
      return { parcalar: [], hirdavat: [], uyarilar: T.uyarilar, malzemeler: M, hirdavatSecimi: HS, geo: { panel: true, tur, bos: true, boy, en, t: 0, W: en, D: 0, H: boy, bant: { u: 0, k: 0 }, kullanim: 'kapak', sekil: null } };
    }
    const kul = modul.panelMalzeme === 'govde' ? 'govde' : modul.panelMalzeme === 'ayna' && tur !== 'lambri' ? 'ayna' : 'kapak';
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
    if (tur === 'lambri') return lambriHesapla(modul, T, M, HS, kul, t, boy, en);
    if (tur === 'masa') return masaHesapla(modul, T, M, HS, kul, t, boy, en);
    const sekil = modul.sekil && modul.sekil !== 'dikdortgen' ? modul.sekil : null;
    let sg = null;
    if (sekil) {
      sg = sekilGeometrisi(sekil, en, boy, say(modul.sekilParam, 0), modul.koseSayisi);
      const sb = modul.sekilBant || 'tum';
      const bantMm = sb === 'tum' ? sg.cevre : sb === 'egri' ? (sg.egri > 0 ? sg.egri : sg.cevre - sg.duz) : 0;
      // Eğimli kenarda "eğri" seçimi eğik kenarı kapsar
      const egikKenar = sekil === 'egimli' ? Math.hypot(en, boy - say(modul.sekilParam, 0)) : 0;
      const bantUzunluk = sb === 'egri' && sekil === 'egimli' ? egikKenar : bantMm;
      const tr = (x, b) => String(Math.round(x * 10 ** b) / 10 ** b).replace('.', ',');
      ekle(`${PANEL_TURLERI[tur].ad} – ${SEKILLER[sekil].kisa}`, kul, sg.kutuH, sg.kutuW, 1, { u: 0, k: 0 }, {
        sekil: { tur: sekil, alan: sg.alan, cevre: sg.cevre, egri: sg.egri, duz: sg.duz, cnc: sg.cnc },
        bantUzunluk,
        not: `Şekilli kesim (CNC/şablon): ${sg.bilgi.join(', ').replace(/(\d)\.(\d)/g, '$1,$2')}; net alan ${tr(sg.alan / 1e6, 3)} m², kenar bandı ${tr(bantUzunluk / 1000, 2)} m`,
      });
      if (sekil === 'radyus' && say(modul.sekilParam, 0) > 0 && say(modul.sekilParam, 0) < 3) uyarilar.push('Radyüs 3 mm\'den küçük; kenar bandı makinesi bu köşeyi dönemez.');
      if (sg.egri > 0 && say(M[kul].bant, 0) > 1) uyarilar.push(`Eğri kenarda ${M[kul].bant} mm bant: dar radyüslerde 1 mm üstü bant kırılabilir, ısıtarak yapıştırın.`);
    } else {
      ekle(PANEL_TURLERI[tur].ad, kul, boy, en, 1, { u: Math.floor(say(modul.bantU, 0)), k: Math.floor(say(modul.bantK, 0)) });
    }
    if (tur === 'bulasik') {
      kulpEkle(T, HS.kulp, 1, en);
      hEkle('bulasik_seti', 'Bulaşık makinesi kapak montaj seti', 1, 'takım');
    } else if (tur === 'raf') {
      hEkle('raf_tasiyici', 'Gizli raf taşıyıcı', Math.max(2, Math.ceil(boy / 400)));
      if (boy > 900 && t < 25) uyarilar.push(`Duvar rafı ${boy} mm uzun; ${t} mm kalınlıkta sehim yapabilir.`);
    } else if (tur === 'yan_kapama' || tur === 'dolgu') {
      hEkle('kosebent', 'Bağlantı köşebendi', tur === 'yan_kapama' ? 4 : 2);
      hEkle('sunta_vidasi', 'Sunta vidası 3,5×16', tur === 'yan_kapama' ? 16 : 8);
    } else if (tur === 'duvar') {
      hEkle('aski_rayi', 'Z askı profili (duvar paneli)', (2 * en) / 1000, 'm');
    } else if (tur === 'tabla') {
      hEkle('kosebent', 'Bağlantı köşebendi', 4);
      hEkle('sunta_vidasi', 'Sunta vidası 3,5×16', 16);
    }
    // Yerleşim yönü: W duvar boyunca kapladığı yer, D duvardan dışarı, H yükseklik
    // Şekilli parçada gerçek dış ölçü kutusu kullanılır (ör. daire tabla 600×600)
    const b = sg ? sg.kutuH : boy;
    const e = sg ? sg.kutuW : en;
    let W = e;
    let D = t;
    let H = b;
    if (tur === 'yan_kapama') { W = t; D = e; H = b; }
    if (tur === 'duvar') { W = e; D = t; H = b; }
    if (tur === 'raf' || tur === 'tabla') { W = b; D = e; H = t; }
    if (tur === 'baza') { W = b; D = t; H = e; }
    if (modul.ledArka && (tur === 'duvar' || tur === 'serbest' || tur === 'dolgu')) {
      // Arkadan aydınlatma: panel kenarından 30 mm içeride, çevre boyunca LED (duvara hare ışık)
      const L = Math.max(0, (sg ? sg.cevre : 2 * (b + e)) - 8 * 30) / 1000;
      hEkle('led_serit', 'LED şerit', L, 'm');
      hEkle('led_profil', 'LED alüminyum profili', L, 'm');
      hEkle('led_adaptor', 'LED adaptörü', 1);
      if (kul === 'ayna') for (const p of T.parcalar) p.not = [p.not, 'Arkası LED\'li: aynayı duvardan 25–30 mm mesafeli takozlarla asın'].filter(Boolean).join('; ');
    }
    return {
      parcalar: T.parcalar, hirdavat: T.hirdavat, uyarilar, malzemeler: M, hirdavatSecimi: HS,
      geo: { panel: true, tur, boy: b, en: e, girilenBoy: boy, girilenEn: en, t, W, D, H, bant: { u: modul.bantU, k: modul.bantK }, kullanim: kul, yerlesimDisi: tur === 'baza', sekil: sg ? Object.assign({ tur: sekil }, sg) : null, ledArka: !!modul.ledArka && (tur === 'duvar' || tur === 'serbest' || tur === 'dolgu') },
    };
  }

  /**
   * Masa: boy = tabla uzunluğu, en = tabla derinliği, masaH = toplam yükseklik (zeminden tabla üstüne).
   * Yan panel ayaklıda yanlar tabla malzemesinden, isteğe bağlı bacak paneli (arkada) ve ön kayıt;
   * ahşap 4 ayakta ayaklar hazır masif ayak, kayıtlar (etek) tabla malzemesinden; metal ayaklar hazır takım.
   */
  function masaHesapla(modul, T, M, HS, kul, t, L, Dp) {
    const { ekle, hEkle, uyarilar } = T;
    const H = say(modul.masaH, 750);
    const ayak = MASA_AYAKLARI[modul.masaAyak] ? modul.masaAyak : 'panel';
    const tas = Math.min(say(modul.masaTasma, 0), Math.min(L, Dp) / 4);
    let k = say(modul.masaAyakKesit, 60);
    const hAlt = H - t; // tablanın altı
    const kayit = !!modul.masaKayit || ayak === 'ahsap4';
    const kayitH = Math.min(say(modul.masaKayitH, 80), hAlt - 200);
    const arka = !!modul.masaArka && ayak === 'panel';
    const arkaH = Math.round(Math.min(400, hAlt * 0.55));
    if (hAlt < 150) { uyarilar.push('Masa yüksekliği tabla kalınlığına göre çok az.'); }
    // Tabla (şekilli olabilir)
    const sekil = modul.sekil && modul.sekil !== 'dikdortgen' ? modul.sekil : null;
    let sg = null;
    if (sekil) {
      sg = sekilGeometrisi(sekil, Dp, L, say(modul.sekilParam, 0), modul.koseSayisi);
      ekle(`Tabla – ${SEKILLER[sekil].kisa}`, kul, sg.kutuH, sg.kutuW, 1, { u: 0, k: 0 }, {
        sekil: { tur: sekil, alan: sg.alan, cevre: sg.cevre, egri: sg.egri, duz: sg.duz, cnc: sg.cnc }, bantUzunluk: sg.cevre,
        not: `Şekilli kesim (CNC/şablon): ${sg.bilgi.join(', ').replace(/(\d)\.(\d)/g, '$1,$2')}`,
      });
      if (ayak === 'panel' || ayak === 'ahsap4') uyarilar.push(`Şekilli (${SEKILLER[sekil].kisa}) tablada yan panel / ahşap ayak köşeleri tablanın dışına taşabilir; merkez, U ya da X ayak önerilir.`);
    } else ekle('Tabla', kul, L, Dp, 1, { u: 2, k: 2 });
    const Lb = sg ? sg.kutuH : L;
    const Db = sg ? sg.kutuW : Dp;
    const ic = Lb - 2 * tas; // ayakların dış ölçüsü (boyda)
    const icD = Db - 2 * tas;
    // Küçük tablada ayaklar birbirine girmesin: kesit ve U/X ayak içeri kaçıklığı sınırlanır
    const k0 = k;
    k = Math.max(10, Math.min(k, (ic - 40) / 2, (icD - 40) / 2));
    const uOff = Math.max(0, Math.min(80, (ic - 140) / 2));
    if (k < k0 - 0.5 || ((ayak === 'metal_u' || ayak === 'x') && ic < 300) || (ayak === 'panel' && ic < 2 * t + 150)) uyarilar.push(`Masa ölçüsü (${r1(Lb)} × ${r1(Db)}) bu ayak tipi için çok küçük; ayaklar sığmıyor.`);
    if (ayak === 'panel') {
      ekle('Yan ayak', kul, hAlt, icD, 2, { u: 1, k: 1 }, { not: 'Ön kenar ve alt kenar bantlı; tablaya minifix ile bağlanır, altına ayak pabucu' });
      hEkle('minifix', 'Minifix + kavela', 4);
      hEkle('masa_keceli_ayak', 'Keçeli / ayarlı ayak pabucu', 4);
      if (arka) { ekle('Bacak paneli (arka)', kul, ic - 2 * t, arkaH, 1, { u: 1, k: 0 }, { not: 'Arkadan 40 mm içeride, yan ayaklara ve tablaya bağlanır' }); hEkle('minifix', 'Minifix + kavela', 4); }
      if (kayit) { ekle('Ön kayıt', kul, ic - 2 * t, kayitH, 1, { u: 1, k: 0 }, { not: 'Tablanın altında, önden geride; sehimi önler' }); hEkle('minifix', 'Minifix + kavela', 2); }
      if (!arka && !kayit && Lb > 1000) uyarilar.push('Yan panel ayaklı masada bacak paneli ya da kayıt olmadan masa yana sallanır; "Bacak paneli" ya da "Kayıt" açın.');
    } else if (ayak === 'ahsap4') {
      hEkle('masa_ayak_ahsap', `Masif ahşap ayak ${r1(k)}×${r1(k)}×${r1(hAlt)}`, 4);
      ekle('Kayıt (uzun)', kul, ic - 2 * k, kayitH, 2, { u: 1, k: 0 }, { not: `Ayakların arasında, dış yüzden 15 mm içeride; uçlar kavela ile ayağa` });
      ekle('Kayıt (kısa)', kul, icD - 2 * k, kayitH, 2, { u: 1, k: 0 });
      hEkle('kavela', 'Kavela 8×35', 16);
      hEkle('masa_gergi', 'Masa köşe gergi plakası', 4);
      hEkle('sunta_vidasi', 'Sunta vidası 3,5×16', 16);
    } else {
      const ad = { metal4: 'Metal masa ayağı takımı (4 ayak + çerçeve)', metal_u: 'Metal U (köprü) masa ayağı', x: 'Metal X masa ayağı', merkez: 'Merkez (tek) masa ayağı' }[ayak];
      hEkle({ metal4: 'masa_ayak_metal4', metal_u: 'masa_ayak_u', x: 'masa_ayak_x', merkez: 'masa_ayak_merkez' }[ayak], `${ad} – yükseklik ${r1(hAlt)}`, 1, ayak === 'merkez' ? 'adet' : 'takım');
      hEkle('sunta_vidasi', 'Sunta vidası 4×25 (ayak bağlantı)', ayak === 'merkez' ? 8 : 16);
      if (kayit) { ekle('Kayıt (uzun)', kul, ic - 2 * k, kayitH, 2, { u: 1, k: 0 }); ekle('Kayıt (kısa)', kul, icD - 2 * k, kayitH, 2, { u: 1, k: 0 }); hEkle('masa_gergi', 'Masa köşe gergi plakası', 4); }
      if (ayak === 'merkez' && Math.max(Lb, Db) > 1200) uyarilar.push(`Merkez ayakta tabla ${r1(Math.max(Lb, Db))} mm; 1200 mm üstünde devrilme riski, U ya da 4 ayak önerilir.`);
    }
    if (Lb > 1600 && t < 25 && !kayit && ayak !== 'panel') uyarilar.push(`${r1(Lb)} mm tablada ${t} mm kalınlıkla kayıtsız masa sehim yapabilir; kayıt ekleyin ya da kalın tabla seçin.`);
    return {
      parcalar: T.parcalar, hirdavat: T.hirdavat, uyarilar, malzemeler: M, hirdavatSecimi: HS,
      geo: {
        panel: true, tur: 'masa', boy: Lb, en: Db, girilenBoy: L, girilenEn: Dp, t, W: Lb, D: Db, H, kullanim: kul, bant: { u: 2, k: 2 },
        sekil: sg ? Object.assign({ tur: sekil }, sg) : null,
        masa: { ayak, tas, k, uOff, kayit, kayitH, arka, arkaH, hAlt },
      },
    };
  }

  /**
   * Lambri: çıtalar eşit aralıkla dizilir; kenarlarda çıta olur, kalan pay aralıklara paylaştırılır.
   * Dikeyde çıta boyu = panel boyu, yatayda = panel eni. Arka panel isteğe bağlı (tam ölçü).
   */
  function lambriHesapla(modul, T, M, HS, kul, t, boy, en) {
    const { ekle, hEkle, uyarilar } = T;
    const ce = say(modul.lambriCitaEn, 40);
    const ar = say(modul.lambriAralik, 20);
    const dikey = modul.lambriYon !== 'yatay';
    const dizi = dikey ? en : boy; // çıtaların dizildiği yön
    const citaL = dikey ? boy : en; // çıta boyu
    let n = Math.max(1, Math.floor((dizi + ar) / (ce + ar)));
    if (n === 1 && dizi > ce * 2) n = 2;
    const gercekAralik = n > 1 ? (dizi - n * ce) / (n - 1) : 0;
    const malz = M[kul];
    const uzun = Math.max(say(malz.plakaUzun, 2800), say(malz.plakaKisa, 0));
    if (citaL > uzun - 20) uyarilar.push(`Çıta boyu ${r1(citaL)} mm, malzeme boyu ${uzun} mm'yi aşıyor; çıtalar ek yapılarak kullanılmalı.`);
    if (ce > dizi) uyarilar.push('Çıta eni panel ölçüsünden büyük.');
    const citaNot = { not: `${n} çıta, eksenler arası ${r1(ce + gercekAralik)} mm, aralık ${r1(gercekAralik)} mm; ${dikey ? 'dikey' : 'yatay'}` };
    ekle(`Lambri çıtası (${dikey ? 'dikey' : 'yatay'})`, kul, citaL, ce, n, { u: 0, k: 0 }, citaNot);
    const arkaKul = modul.lambriArka !== 'yok' ? modul.lambriArka : null;
    const ta = arkaKul ? say(M[arkaKul].kalinlik, 9) : 0;
    if (arkaKul) {
      ekle('Lambri arka paneli', arkaKul, boy, en, 1, { u: 0, k: 0 }, { not: 'Duvara yapıştırılır / vidalanır; çıtalar önüne yapıştırılır' });
      hEkle('aski_rayi', 'Z askı profili (duvar paneli)', (2 * en) / 1000, 'm');
    }
    hEkle('sunta_vidasi', 'Sunta vidası 3,5×16', n * Math.max(2, Math.ceil(citaL / 600)));
    return {
      parcalar: T.parcalar, hirdavat: T.hirdavat, uyarilar, malzemeler: M, hirdavatSecimi: HS,
      geo: { panel: true, tur: 'lambri', boy, en, girilenBoy: boy, girilenEn: en, t, W: en, D: t + ta, H: boy, bant: { u: 0, k: 0 }, kullanim: kul, sekil: null,
        lambri: { dikey, n, ce, aralik: gercekAralik, ta, arkaKul } },
    };
  }

  /** Parçanın tek adet net alanı (m²): şekilli parçada gerçek alan. */
  const parcaAlanM2 = (p) => (p.sekil ? p.sekil.alan : p.boy * p.en) / 1e6;
  /** Parçanın tek adet kenar bandı uzunluğu (m). */
  const parcaBantM = (p) => (p.bantUzunluk != null ? p.bantUzunluk : p.bant.u * p.boy + p.bant.k * p.en) / 1000;

  /** Bant kalınlığı düşülmüş kesim ölçüsü (camda bant yoktur; şekilli parçada kaba kesim kutusu). */
  function kesimOlcusu(parca, ayar) {
    const A = ayar || VARSAYILAN_AYARLAR;
    const malz = malzemeBul(A, parca.malzeme);
    const bt = A.bantDus && malz && !camMi(malz) && !parca.sekil ? say(malz.bant, 0) : 0;
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
    const gecerli = (m) => sonuclar[m.id] && sonuclar[m.id].geo && !sonuclar[m.id].geo.yerlesimDisi;
    const siraOf = (m) => (montajOf(m) > ASILI_SINIR ? 'duvar' : 'zemin');
    // Dünyada kaplanan hacimler (X: A duvarı boyunca, Z: B duvarı boyunca / A duvarından uzaklık, Y: yükseklik).
    // Her modül, duvarı boyunca sırası geldiğinde daha önce yerleşmiş hiçbir hacimle çakışmayan ilk konuma kayar:
    // asma dolap boy dolabın üstüne gelmez, boy dolap köşe üst dolabının altına girmez, köşede iki duvar çakışmaz.
    const hacimler = [];
    const cakisan = (k) => hacimler.find((o) => k.x1 < o.x2 - 0.5 && k.x2 > o.x1 + 0.5 && k.z1 < o.z2 - 0.5 && k.z2 > o.z1 + 0.5 && k.y1 < o.y2 - 1 && k.y2 > o.y1 + 1);
    // Ön paneller (dolgu, bulaşık kapağı, serbest) gövdelerin ön düzleminde durur
    const onPanel = (g) => g.panel && !['yan_kapama', 'raf', 'tabla', 'baza', 'bosluk', 'duvar', 'nesne', 'lambri', 'masa'].includes(g.tur);
    const govdeD = {};
    for (const sr of ['zemin', 'duvar']) govdeD[sr] = Math.max(0, ...proje.moduller.filter((m) => gecerli(m) && !sonuclar[m.id].geo.panel && siraOf(m) === sr).map((m) => sonuclar[m.id].geo.D)) || (sr === 'zemin' ? 560 : 320);
    // Düz yerleşimdeki L köşe dolap B kolu kadar odaya taşar
    const derinlik = (g, sira) => (onPanel(g) ? govdeD[sira] + g.t : g.lkose ? g.W2 : g.D);

    // Köşe dolaplar önce (her iki sıra): diğer modüller bunların hacmine göre kayar
    const koseler = {};
    for (const sira of ['zemin', 'duvar']) {
      const k = proje.moduller.filter((m) => m.tip === 'lkose' && gecerli(m) && siraOf(m) === sira);
      if (!k.length) continue;
      if (!L) { uyarilar.push('Yerleşim: düz yerleşimde L köşe dolap var; köşe dolaplar için L yerleşimi seçin.'); continue; }
      koseler[sira] = k[0];
      if (k.length > 1) uyarilar.push(`Yerleşim: ${sira === 'zemin' ? 'zemin' : 'duvar'} sırasında birden fazla L köşe dolap var; yalnızca "${k[0].ad}" köşeye yerleştirildi.`);
      if (Math.floor(say(k[0].adet, 1)) > 1) uyarilar.push('Yerleşim: L köşe dolabın adedi 1\'den fazla; köşeye yalnızca bir tanesi yerleşir.');
      const g = sonuclar[k[0].id].geo;
      const mt = montajOf(k[0]);
      hacimler.push({ x1: 0, x2: g.W, z1: 0, z2: g.D, y1: mt, y2: mt + g.H }, { x1: 0, x2: g.D, z1: 0, z2: g.W2, y1: mt, y2: mt + g.H });
    }

    for (const sira of ['zemin', 'duvar']) {
      // Adedi birden fazla olan modül duvarda o kadar yer kaplar: her kopya ayrı dizilir.
      const kopyalar = new Map();
      const uygun = [];
      for (const m of proje.moduller.filter((x) => gecerli(x) && siraOf(x) === sira && (x.tip !== 'lkose' || !L))) {
        const n = Math.max(1, Math.floor(say(m.adet, 1)));
        for (let k = 1; k <= n; k++) {
          const kopya = n > 1 ? Object.assign(Object.create(m), { ad: `${m.ad} (${k}/${n})` }) : m;
          kopyalar.set(kopya, m);
          uygun.push(kopya);
        }
      }
      const kaynak = (x) => kopyalar.get(x) || x;
      const kose = koseler[sira] || null;
      const duvarA = uygun.filter((m) => !L || m.duvar !== 'B');
      const duvarB = L ? uygun.filter((m) => m.duvar === 'B') : [];
      if (kose) {
        const g = sonuclar[kose.id].geo;
        yerler.push({ modul: kose, kaynak: kose, duvar: 'kose', sira, bas: 0, W: g.W, W2: g.W2, D: g.D, montaj: montajOf(kose), geo: g });
      }
      const yerlestir = (m, duvar, bas) => {
        const g = sonuclar[m.id].geo;
        if (g.nesne) {
          // Eşya / dekor: verilen konumda durur, yer kaplamaz (dolabın içinde ya da önünde olabilir)
          yerler.push({ modul: m, kaynak: kaynak(m), duvar, sira, bas: m.konum != null ? m.konum : bas, W: g.W, D: g.D, montaj: montajOf(m), geo: g, nesne: true });
          return bas;
        }
        const sabit = m.konum != null && m.tip !== 'lkose';
        if (sabit) bas = m.konum;
        const mt = montajOf(m);
        const D = derinlik(g, sira);
        const hacim = (b) => (duvar === 'A' ? { x1: b, x2: b + g.W, z1: 0, z2: D } : { x1: 0, x2: D, z1: b, z2: b + g.W });
        let b = bas;
        for (let i = 0; i < 200; i++) {
          const o = cakisan(Object.assign(hacim(b), { y1: mt, y2: mt + g.H }));
          if (!o) break;
          b = duvar === 'A' ? o.x2 : o.z2;
        }
        hacimler.push(Object.assign(hacim(b), { y1: mt, y2: mt + g.H }));
        yerler.push({ modul: m, kaynak: kaynak(m), duvar, sira, bas: b, W: g.W, D: g.D, montaj: mt, geo: g });
        // Sabit konumlu modül sırayı geri almaz: sonraki modüller en ileri noktadan devam eder
        return sabit ? Math.max(imlec, b + g.W) : b + g.W;
      };
      let imlec = 0;
      let x = kose ? sonuclar[kose.id].geo.W : 0;
      for (const m of duvarA) { imlec = x; x = yerlestir(m, 'A', x); }
      const sonA = x;
      let y = kose ? sonuclar[kose.id].geo.W2 : 0;
      let baslangicB = null;
      for (const m of duvarB) {
        imlec = y;
        y = yerlestir(m, 'B', y);
        if (baslangicB == null) baslangicB = yerler[yerler.length - 1].bas;
      }
      doluluk[sira] = { A: sonA, B: duvarB.length || kose ? y : 0, koseBosluguB: !kose && duvarB.length && duvarA.length ? baslangicB : 0 };
      const ad = sira === 'zemin' ? 'Zemin dolapları' : 'Üst dolaplar';
      if (Y.duvarA > 0 && sonA > Y.duvarA) uyarilar.push(`Yerleşim: ${ad} A duvarını ${r1(sonA - Y.duvarA)} mm aşıyor.`);
      if (L && Y.duvarB > 0 && y > Y.duvarB) uyarilar.push(`Yerleşim: ${ad} B duvarını ${r1(y - Y.duvarB)} mm aşıyor.`);
      if (doluluk[sira].koseBosluguB > 0) {
        // Köşe boşluğu: A duvarındaki bu sıranın derinliği; ilk B modülü daha ileride ise başka bir modül itmiştir
        const aDerin = Math.max(0, ...duvarA.map((m) => derinlik(sonuclar[m.id].geo, sira)));
        if (baslangicB > aDerin + 5) uyarilar.push(`Yerleşim: ${ad} köşesinde L köşe dolap yok (köşe boşluğu ${r1(aDerin)} mm); B duvarındaki ilk modül, yolundaki modüller nedeniyle ${r1(baslangicB)} mm'den başlıyor.`);
        else uyarilar.push(`Yerleşim: ${ad} köşesinde L köşe dolap yok; B duvarı ${r1(baslangicB)} mm köşe boşluğuyla başlıyor (kör köşe dolap veya dolgu düşünün).`);
      }
    }
    const engelAdlari = {};
    for (const [k, v] of Object.entries(ENGEL_TURLERI)) engelAdlari[k] = v.ad;
    return { tip: L ? 'L' : 'duz', duvarA: say(Y.duvarA, 0), duvarB: say(Y.duvarB, 0), yerler, doluluk, uyarilar, engeller: Y.engeller || [], tavan: say(Y.tavan, 0), engelAdlari };
  }

  /**
   * Yerinde montaj hırdavatı: yan yana dolapların birleştirme vidaları, asma dolap askıları,
   * boy dolap devrilme önleyicileri. Yerleşimden çıkarılır (adetli modüllerin her kopyası sayılır).
   */
  function montajHirdavati(proje, yer, A) {
    const L = [];
    const ekle = (kod, ad, adet, birim, fm) => {
      if (!(adet > 0)) return;
      const v = L.find((x) => x.ad === ad);
      if (v) { v.adet = r3(v.adet + adet); v.fiyatMiktari = r3(v.fiyatMiktari + (fm == null ? adet : fm)); }
      else L.push({ kod, ad, adet: r3(adet), birim: birim || 'adet', fiyatMiktari: r3(fm == null ? adet : fm) });
    };
    const govdeli = (y) => y.modul.tip !== 'panel';
    let birlesim = 0;
    if (!proje.yerlesim || proje.yerlesim.birlestir !== false) {
      // Aynı duvarda uç uca değen ve yükseklikleri en az 100 mm örtüşen gövdeler birleştirilir
      // (boy dolap ile yanındaki asma dolap da dahil)
      for (const duvar of ['A', 'B']) {
        const genis = (y) => (y.duvar === 'kose' ? (duvar === 'B' ? y.W2 : y.W) : y.W);
        const dizi = yer.yerler.filter((y) => govdeli(y) && (y.duvar === duvar || (y.duvar === 'kose' && (duvar === 'A' || yer.tip === 'L'))));
        for (const a of dizi) {
          for (const b of dizi) {
            if (a === b || Math.abs(a.bas + genis(a) - b.bas) >= 2) continue;
            const ortak = Math.min(a.montaj + a.geo.H, b.montaj + b.geo.H) - Math.max(a.montaj, b.montaj);
            if (ortak < 100) continue;
            birlesim++;
            ekle('dolap_birlestirme', 'Dolap birleştirme vidası (somunlu)', ortak >= 1500 ? 4 : 2);
          }
        }
      }
    }
    let rayM = 0;
    for (const y of yer.yerler.filter(govdeli)) {
      if (y.sira === 'duvar') {
        const lk = !!(y.geo && y.geo.lkose);
        if (A.duvarAski === 'ray') rayM += (y.W + (lk ? y.geo.W2 : 0)) / 1000;
        ekle('aski_aparati', 'Asma dolap askı aparatı', lk ? 4 : 2);
      } else if (y.geo.H >= 1500) ekle('devrilme', 'Devrilme önleyici duvar bağlantısı', 2);
    }
    if (rayM > 0) ekle('aski_rayi', 'Asma dolap askı rayı', r1(rayM), 'm', rayM);
    return { liste: L, birlesim };
  }

  /**
   * Yerinde ölçü kontrolü: engellerle (pencere, kapı, kolon, priz, su, gaz…) ve tavanla çakışmalar.
   * Duvar boyunca konum köşeden (düz yerleşimde duvarın solundan) ölçülür; yükseklik zeminden.
   * Nokta engeller (priz, su, gaz) bir dolabın arkasına denk gelirse arkalık delik konumu verilir.
   */
  function sahaKontrol(proje, yer) {
    const Y = proje.yerlesim || {};
    const uyarilar = [];
    const notlar = [];
    const engeller = Y.engeller || [];
    const kutular = [];
    for (const y of yer.yerler) {
      if (y.nesne) continue; // eşya/dekor saha kontrolüne girmez
      const alt = y.montaj;
      const ust = y.montaj + y.geo.H;
      if (y.duvar === 'kose') {
        kutular.push({ y, duvar: 'A', x1: 0, x2: y.W, alt, ust, kose: true });
        if (yer.tip === 'L') kutular.push({ y, duvar: 'B', x1: 0, x2: y.W2, alt, ust, kose: true, ikinci: true });
      } else kutular.push({ y, duvar: yer.tip === 'L' ? y.duvar : 'A', x1: y.bas, x2: y.bas + y.W, alt, ust });
    }
    const kesisir = (a1, a2, b1, b2) => Math.min(a2, b2) - Math.max(a1, b1) > 1;
    for (const e of engeller) {
      const tanim = ENGEL_TURLERI[e.tur] || ENGEL_TURLERI.diger;
      const duvar = yer.tip === 'L' ? e.duvar : 'A';
      const ad = `${tanim.ad}${e.not ? ` (${e.not})` : ''}`;
      for (const k of kutular.filter((q) => q.duvar === duvar)) {
        const m = k.y.modul;
        if (tanim.alan) {
          const x2 = e.x + e.genislik;
          const yAlt = e.tur === 'kolon' || e.tur === 'kapi' ? 0 : e.y;
          const yUst = e.tur === 'kolon' ? Infinity : e.tur === 'kapi' ? e.yukseklik : e.y + e.yukseklik;
          if (!kesisir(k.x1, k.x2, e.x, x2)) continue;
          if (kesisir(k.alt, k.ust, yAlt, yUst)) {
            uyarilar.push(`Saha: "${m.ad}" ${duvar} duvarındaki ${ad.toLocaleLowerCase('tr')} ile çakışıyor (${r1(e.x)}–${r1(x2)} mm).`);
          } else if (e.tur === 'pencere' && k.y.sira === 'zemin' && k.ust + 40 > e.y) {
            uyarilar.push(`Saha: "${m.ad}" + tezgah (40 mm) pencere denizliğinden (${e.y} mm) yüksek.`);
          }
        } else if (e.x > k.x1 && e.x < k.x2 && e.y > k.alt && e.y < k.ust) {
          // Nokta engel dolabın arkasında: modül içi konum (soldan, gövde altından)
          const soldan = duvar === 'B' ? k.x2 - e.x : e.x - k.x1;
          const alttan = e.y - k.alt - (k.y.geo.hb || 0);
          if (k.kose) notlar.push({ modul: m.ad, metin: `${ad} köşe dolabın arkasında (${duvar} kolu): köşeden ${r1(e.x)}, zeminden ${r1(e.y)} mm` });
          else notlar.push({ modul: m.ad, metin: `${ad}: arkalıkta delik/kesim — soldan ${r1(soldan)}, gövde altından ${r1(alttan)} mm` });
          if (e.tur === 'gaz') uyarilar.push(`Saha: gaz vanası "${m.ad}" içinde kalıyor; erişim kapağı ve havalandırma bırakın, vana önünü kapatmayın.`);
        }
      }
    }
    if (Y.tavan > 0) {
      for (const k of kutular) {
        if (k.ikinci) continue;
        const bosluk = Y.tavan - k.ust;
        const kosegen = Math.hypot(k.y.geo.H, k.y.geo.D || 0);
        if (bosluk < 0) uyarilar.push(`Saha: "${k.y.modul.ad}" tavanı ${r1(-bosluk)} mm aşıyor (tavan ${Y.tavan} mm).`);
        else {
          if (k.y.geo.H >= 1500 && k.alt < 1 && kosegen > Y.tavan) uyarilar.push(`Saha: "${k.y.modul.ad}" yatık getirilip kaldırılamaz: köşegeni ${r1(kosegen)} mm tavandan (${Y.tavan}) uzun; gövdeyi yerinde birleştirin.`);
          if (bosluk < 100 && (k.y.sira === 'duvar' || k.y.geo.H >= 1500)) notlar.push({ modul: k.y.modul.ad, metin: `Tavana ${r1(bosluk)} mm kalıyor: tavan dolgusu veya korniş önerilir` });
        }
      }
    }
    if (yer.tip === 'L' && Math.abs((Y.koseAcisi || 90) - 90) >= 1) uyarilar.push(`Saha: köşe açısı ${Y.koseAcisi}° (90° değil); L köşe ve köşe dolaplarında dolgu payı bırakın.`);
    if (Y.duvarSapma > 5) uyarilar.push(`Saha: duvar düzlüğünde ${Y.duvarSapma} mm sapma var; dolap dizisinin ucunda dolgu/kapama payı bırakın.`);
    return { uyarilar: [...new Set(uyarilar)], notlar };
  }

  /** Tüm projeyi hesaplar: birleşik kesim listesi, hırdavat, malzeme özetleri, yerleşim. */
  /**
   * Modülün kapladığı ön yüz (duvar) alanı, m², tek adet: dolapta genişlik × yükseklik (L köşede iki kol),
   * panelde boy × en; boşluk ve yatay paneller (tabla, raf) için yatay yüzey.
   */
  function modulAlanM2(m) {
    if (!m) return 0;
    if (m.tip === 'panel') {
      if (m.panelTuru === 'bosluk' || m.panelTuru === 'nesne') return 0;
      return (say(m.boy, 0) * say(m.en, 0)) / 1e6;
    }
    if (m.tip === 'lkose') return ((say(m.genislik, 0) + say(m.genislik2, 0) - say(m.derinlik, 0)) * say(m.yukseklik, 0)) / 1e6;
    return (say(m.genislik, 0) * say(m.yukseklik, 0)) / 1e6;
  }

  function projeHesapla(proje) {
    const A = proje.ayarlar;
    const tumParcalar = [];
    const hirdavatMap = new Map();
    const uyarilar = [];
    for (const m of A.malzemeler) {
      if (!(say(m.kalinlik, 0) > 0)) uyarilar.push(`Malzeme "${m.ad}": kalınlık geçersiz (${m.kalinlik}).`);
      if (!camMi(m) && !(say(m.plakaUzun, 0) >= 100 && say(m.plakaKisa, 0) >= 10)) uyarilar.push(`Malzeme "${m.ad}": plaka ölçüsü geçersiz (${m.plakaUzun}×${m.plakaKisa}).`);
    }
    const modulSonuclari = {};

    for (const m of proje.moduller) {
      const sonuc = modulHesapla(m, A);
      modulSonuclari[m.id] = sonuc;
      const adet = Math.max(1, Math.floor(say(m.adet, 1)));
      for (const u of sonuc.uyarilar) uyarilar.push(`${m.ad}: ${u}`);
      for (const p of sonuc.parcalar) if (A.arkalikListede !== false || !/^Arkalık/.test(p.ad)) tumParcalar.push(Object.assign({}, p, { adet: p.adet * adet, modul: m.ad, modulId: m.id }));
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
      const anahtar = [p.malzeme, p.ad, p.boy, p.en, p.bant.u, p.bant.k, p.damar, p.not || '', p.bantUzunluk || ''].join('|');
      const g = grup.get(anahtar);
      if (g) {
        g.adet += p.adet;
        if (!g.moduller.includes(p.modul)) g.moduller.push(p.modul);
        if (!g.modulIdler.includes(p.modulId)) g.modulIdler.push(p.modulId);
      } else {
        grup.set(anahtar, Object.assign({}, p, { moduller: [p.modul], modulIdler: [p.modulId] }));
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
      o.alanM2 += parcaAlanM2(p) * p.adet;
      if (!camMi(malz) && say(malz.bant, 0) > 0) o.bantM += parcaBantM(p) * p.adet;
      if (p.sekil) o.sekilliKenarM = (o.sekilliKenarM || 0) + (p.sekil.cnc != null ? p.sekil.cnc : p.sekil.egri || 0) / 1000 * p.adet;
      o.parcaAdedi += p.adet;
    }

    const yerlesim = yerlesimHesapla(proje, modulSonuclari);
    for (const u of yerlesim.uyarilar) uyarilar.push(u);
    const montaj = montajHirdavati(proje, yerlesim, A);
    const saha = sahaKontrol(proje, yerlesim);
    for (const u of saha.uyarilar) uyarilar.push(u);

    return {
      kesimListesi,
      hirdavat: [...hirdavatMap.values()],
      ozet: [...ozet.values()],
      uyarilar,
      modulSonuclari,
      yerlesim,
      montajHirdavat: montaj.liste,
      birlesimSayisi: montaj.birlesim,
      saha,
    };
  }

  return {
    RAY_BOYLARI,
    KULLANIMLAR,
    KULLANIM_AD,
    MALZEME_TURLERI,
    SATIR_TIPLERI,
    KULP_KONUMLARI,
    KULP_YONLERI,
    ENGEL_TURLERI,
    kulpDelikleri,
    hirdavatGecerli,
    modulRenkleri,
    malzemeDokusu,
    renkTabakasi,
    otoTabakalariTemizle,
    RENK_PALETI,
    varsayilanRenk,
    rafListesi,
    kulpBaglami,
    sahaKontrol,
    montajHirdavati,
    CEKMECE_ICLERI,
    MENTESE_YONLERI,
    SEKILLER,
    sekilGeometrisi,
    parcaAlanM2,
    parcaBantM,
    mentesheKonumlari,
    KAPAK_TURLERI,
    KAPAK_DESENLERI,
    MASA_AYAKLARI,
    TEZGAH_TURLERI,
    KULP_RENKLERI,
    ACILIMLAR,
    SURGU_TURLERI,
    PANEL_TURLERI,
    HIRDAVAT_SECENEKLERI,
    modulAlanM2,
    NESNELER,
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
    paylastir,
    mentesheAdedi,
    raySec,
  };
});

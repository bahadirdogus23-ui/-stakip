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

  const VARSAYILAN_AYARLAR = {
    malzemeler: {
      govde:   { ad: 'Suntalam Beyaz 18mm', kalinlik: 18, plakaUzun: 2800, plakaKisa: 2100, bant: 0.8, damar: false },
      kapak:   { ad: 'MDF Lake 18mm',       kalinlik: 18, plakaUzun: 2800, plakaKisa: 2100, bant: 1.0, damar: false },
      arkalik: { ad: 'HDF Beyaz 8mm',       kalinlik: 8,  plakaUzun: 2800, plakaKisa: 2100, bant: 0,   damar: false },
      cekmece: { ad: 'Suntalam Beyaz 16mm', kalinlik: 16, plakaUzun: 2800, plakaKisa: 2100, bant: 0.8, damar: false },
    },
    testereKalinligi: 4,      // kesim bıçağı payı
    plakaKenarPayi: 10,       // plaka kenarından kırpılan pay
    bantDus: true,            // bant kalınlığını kesim ölçüsünden düş
    kapakBoslugu: 3,          // kapaklar arası boşluk
    disBosluk: 1.5,           // tam bini kapakta dış kenar boşluğu
    rayBoslugu: 13,           // teleskopik ray için her yandan boşluk
    cekmeceUstBosluk: 40,     // çekmece önü yüksekliği ile kutu yüksekliği farkı
    arkalikKanalDerinligi: 8, // arkalık kanal derinliği
    arkalikGeriPay: 10,       // kanalın arka kenara uzaklığı
    arkalikCakmaPay: 2,       // çakma arkalıkta her kenardan içeri pay
    rafOnGeriCekme: 20,       // hareketli raf önden geri çekme
    rafYanBosluk: 1,          // hareketli raf her yandan boşluk
    kusakGenisligi: 100,      // üst kuşak eni
  };

  const PRESETLER = {
    alt: {
      ad: 'Alt Dolap', genislik: 600, yukseklik: 870, derinlik: 560,
      yapi: 'yanlar_boydan', ust: 'kusak', arkalik: 'kanal', kapakTipi: 'tam',
      baza: { tip: 'ayak', yukseklik: 100, geriCekme: 50 },
      satirlar: [
        { tip: 'cekmece', yukseklik: 150, adet: 1, raf: 0, dikme: 0, aski: false },
        { tip: 'kapak', yukseklik: null, adet: 2, raf: 1, dikme: 0, aski: false },
      ],
    },
    ust: {
      ad: 'Üst Dolap', genislik: 600, yukseklik: 720, derinlik: 320, montajYuksekligi: 1450,
      yapi: 'yanlar_boydan', ust: 'tam', arkalik: 'kanal', kapakTipi: 'tam',
      baza: { tip: 'yok', yukseklik: 0, geriCekme: 0 },
      satirlar: [
        { tip: 'kapak', yukseklik: null, adet: 2, raf: 2, dikme: 0, aski: false },
      ],
    },
    gardirop: {
      ad: 'Gardırop', genislik: 1000, yukseklik: 2400, derinlik: 580,
      yapi: 'tabla_boydan', ust: 'tam', arkalik: 'kanal', kapakTipi: 'tam',
      baza: { tip: 'panel', yukseklik: 80, geriCekme: 40 },
      satirlar: [
        { tip: 'kapak', yukseklik: 400, adet: 2, raf: 0, dikme: 0, aski: false },
        { tip: 'kapak', yukseklik: null, adet: 2, raf: 0, dikme: 0, aski: true },
      ],
    },
    sifonyer: {
      ad: 'Şifonyer', genislik: 800, yukseklik: 900, derinlik: 450,
      yapi: 'tabla_boydan', ust: 'tam', arkalik: 'kanal', kapakTipi: 'tam',
      baza: { tip: 'ayak', yukseklik: 60, geriCekme: 0 },
      satirlar: [
        { tip: 'cekmece', yukseklik: null, adet: 1, raf: 0, dikme: 0, aski: false },
        { tip: 'cekmece', yukseklik: null, adet: 1, raf: 0, dikme: 0, aski: false },
        { tip: 'cekmece', yukseklik: null, adet: 1, raf: 0, dikme: 0, aski: false },
        { tip: 'cekmece', yukseklik: null, adet: 1, raf: 0, dikme: 0, aski: false },
      ],
    },
    kitaplik: {
      ad: 'Kitaplık', genislik: 800, yukseklik: 2000, derinlik: 300,
      yapi: 'yanlar_boydan', ust: 'tam', arkalik: 'cakma', kapakTipi: 'tam',
      baza: { tip: 'panel', yukseklik: 60, geriCekme: 30 },
      satirlar: [
        { tip: 'acik', yukseklik: null, adet: 1, raf: 3, dikme: 1, aski: false },
        { tip: 'kapak', yukseklik: 700, adet: 2, raf: 1, dikme: 0, aski: false },
      ],
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
  function yeniModul(presetAdi) {
    const p = kopya(PRESETLER[presetAdi] || PRESETLER.alt);
    p.id = 'm' + Date.now().toString(36) + (sayac++).toString(36);
    p.adet = 1;
    if (p.montajYuksekligi == null) p.montajYuksekligi = 0;
    return p;
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

  /**
   * Tek bir modülü hesaplar (modül adedi ile çarpılmamış, tek gövde için).
   * Dönen parçalar: { ad, malzeme, boy, en, adet, bant:{u,k} }
   *  - boy: parçanın "uzunluk" yönü (damar yönü), en: diğer yön
   *  - bant.u: boy boyunca uzanan (uzun) kenarlardan bantlı olanların sayısı
   *  - bant.k: en boyunca uzanan (kısa) kenarlardan bantlı olanların sayısı
   */
  function modulHesapla(modul, ayar) {
    const A = ayar || VARSAYILAN_AYARLAR;
    const M = A.malzemeler;
    const uyarilar = [];
    const parcalar = [];
    const hirdavat = [];

    const t = say(M.govde.kalinlik, 18);
    const ta = say(M.arkalik.kalinlik, 8);
    const tc = say(M.cekmece.kalinlik, 16);
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
      return { parcalar, hirdavat, uyarilar, geo: null };
    }

    // Yan derinliği: çakma arkalık gövdenin arkasına çakıldığı için yanlardan düşülür.
    const Ds = modul.arkalik === 'cakma' ? D - ta : D;
    // Ara tabla, dikme ve raflar için kullanılabilir derinlik
    let icDerinlik = Ds;
    if (modul.arkalik === 'kanal') icDerinlik = Ds - say(A.arkalikGeriPay, 10) - ta;
    if (ic) icDerinlik -= say(M.kapak.kalinlik, 18);

    const ekle = (ad, malzeme, boy, en, adet, bant, ek) => {
      if (adet <= 0) return;
      if (boy <= 0 || en <= 0) {
        uyarilar.push(`"${ad}" parçasının ölçüsü geçersiz çıktı (${r1(boy)} x ${r1(en)}).`);
        return;
      }
      parcalar.push(Object.assign({ ad, malzeme, boy: r1(boy), en: r1(en), adet, bant: bant || { u: 0, k: 0 } }, ek || {}));
    };
    const hEkle = (ad, adet, birim) => {
      if (adet > 0) hirdavat.push({ ad, adet, birim: birim || 'adet' });
    };

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
    let kusakBirlesim = usttam ? 0 : 4;

    // ---------- Arkalık ----------
    if (modul.arkalik === 'kanal') {
      const kd = say(A.arkalikKanalDerinligi, 8);
      ekle('Arkalık (kanallı)', 'arkalik', Hc - 2 * t + 2 * (kd - 1), iw + 2 * (kd - 1), 1);
    } else if (modul.arkalik === 'cakma') {
      const p = say(A.arkalikCakmaPay, 2);
      ekle('Arkalık (çakma)', 'arkalik', Hc - 2 * p, W - 2 * p, 1);
      hEkle('Arkalık vidası / zımba çivisi', Math.ceil((2 * (Hc + W)) / 150), 'adet');
    }

    // ---------- Baza ----------
    if (baza.tip === 'ayak') {
      hEkle(`Ayarlı ayak (${hb} mm)`, W > 1000 ? 6 : 4);
    } else if (baza.tip === 'panel') {
      const gc = say(baza.geriCekme, 0);
      // Baza çerçevesi: ön parça önden geri çekilir, yanlar gövdeyle aynı hizada.
      ekle('Baza ön/arka', 'govde', W, hb, 2, { u: 0, k: 0 });
      ekle('Baza yanı', 'govde', Ds - gc - 2 * t, hb, 2, { u: 0, k: 0 });
      if (Ds - gc - 2 * t < 100) uyarilar.push('Baza yanı çok kısa; baza geri çekme değerini kontrol edin.');
    }

    // ---------- Ön düzen (satırlar, yukarıdan aşağı) ----------
    const satirlar = (modul.satirlar || []).map((s) => Object.assign({}, s));
    const geoSatirlar = [];
    const sinirlar = [];
    if (satirlar.length) {
      const x0 = ic ? t + g : db;
      const x1 = ic ? W - t - g : W - db;
      const yUst = ic ? Hc - t - g : Hc - db;
      const yAlt = ic ? t + g : db;

      const panelVar = [];
      const ayrac = [];
      for (let i = 0; i < satirlar.length - 1; i++) {
        const p = !(satirlar[i].tip === 'cekmece' && satirlar[i + 1].tip === 'cekmece');
        panelVar.push(p);
        ayrac.push(ic && p ? t + 2 * g : g);
      }
      const toplamAyrac = ayrac.reduce((a, b) => a + b, 0);
      const kullanilabilir = yUst - yAlt - toplamAyrac;
      let sabit = 0;
      let serbest = 0;
      for (const s of satirlar) {
        const h = Number(s.yukseklik);
        if (s.yukseklik === null || s.yukseklik === '' || !Number.isFinite(h) || h <= 0) serbest++;
        else sabit += h;
      }
      const yukseklikler = satirlar.map((s) => {
        const h = Number(s.yukseklik);
        return s.yukseklik === null || s.yukseklik === '' || !Number.isFinite(h) || h <= 0 ? null : h;
      });
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

      const mentese = ic ? 'Menteşe 35mm gömme (iç bini)' : 'Menteşe 35mm tam bini (düz)';
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
          hEkle('Kulp', n);
          if (s.tip === 'kapak') {
            if (fw > 600) uyarilar.push(`Satır ${satirNo}: kapak genişliği ${r1(fw)} mm; 600 mm üstü kapaklar sarkma yapabilir, kapak adedini artırın.`);
            hEkle(mentese, n * mentesheAdedi(on.h));
            if (!ic && dikme > 0 && n > 1) uyarilar.push(`Satır ${satirNo}: ara dikmeye bağlanan kapaklarda yarım bini menteşe kullanılmalı.`);
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
          const ray = say(A.rayBoslugu, 13);
          const kutuW = secW - 2 * ray;
          const L = raySec(icDerinlik - 10);
          const kutuH = Math.floor(Math.min(on.h - say(A.cekmeceUstBosluk, 40), icH - 15));
          if (!L) {
            uyarilar.push(`Satır ${satirNo}: iç derinlik (${r1(icDerinlik)} mm) en kısa ray (250 mm) için yetersiz.`);
          } else if (kutuH < 50) {
            uyarilar.push(`Satır ${satirNo}: çekmece kutusu yüksekliği ${kutuH} mm, çok düşük.`);
          } else {
            ekle(`Çekmece yanı (satır ${satirNo})`, 'cekmece', L, kutuH, 2 * bolum, { u: 1, k: 0 });
            ekle(`Çekmece ön/arka (satır ${satirNo})`, 'cekmece', kutuW - 2 * tc, kutuH, 2 * bolum, { u: 1, k: 0 });
            ekle(`Çekmece tabanı (satır ${satirNo})`, 'arkalik', L, kutuW, bolum);
            hEkle(`Teleskopik ray ${L} mm (takım)`, bolum, 'takım');
            for (const b of bolumler) geo.cekmeceler.push({ x1: b.x1 + ray, x2: b.x2 - ray, y1: icAlt + 10, y2: icAlt + 10 + kutuH, L, kutuW, kutuH });
          }
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

    const birlesimBasi = Ds < 350 ? 2 : 3;
    hEkle('Minifix + kavela takımı', birlesim * birlesimBasi + kusakBirlesim, 'takım');

    // Malzeme kendi damar özelliğini parçalara taşır.
    for (const p of parcalar) p.damar = !!(M[p.malzeme] && M[p.malzeme].damar);

    return {
      parcalar,
      hirdavat,
      uyarilar,
      geo: {
        W, H, D, Hc, hb, t, ta, Ds, icDerinlik,
        tk: say(M.kapak.kalinlik, 18),
        kapakTipi: modul.kapakTipi, arkalik: modul.arkalik, ust: modul.ust, yapi: modul.yapi,
        baza: { tip: baza.tip, yukseklik: hb, geriCekme: say(baza.geriCekme, 0) },
        satirlar: geoSatirlar,
        sinirlar,
      },
    };
  }

  /** Bant kalınlığı düşülmüş kesim ölçüsü. */
  function kesimOlcusu(parca, ayar) {
    const A = ayar || VARSAYILAN_AYARLAR;
    const malz = A.malzemeler[parca.malzeme];
    const bt = A.bantDus && malz ? say(malz.bant, 0) : 0;
    return {
      boy: r1(parca.boy - parca.bant.k * bt),
      en: r1(parca.en - parca.bant.u * bt),
    };
  }

  /** Tüm projeyi hesaplar: birleşik kesim listesi, hırdavat, malzeme özetleri. */
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
        if (onceki) onceki.adet += h.adet * adet;
        else hirdavatMap.set(h.ad, { ad: h.ad, adet: h.adet * adet, birim: h.birim });
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
    const malzSira = ['govde', 'kapak', 'cekmece', 'arkalik'];
    const kesimListesi = [...grup.values()].sort((a, b) =>
      malzSira.indexOf(a.malzeme) - malzSira.indexOf(b.malzeme) || b.boy * b.en - a.boy * a.en
    );
    kesimListesi.forEach((p, i) => {
      p.no = i + 1;
      const k = kesimOlcusu(p, A);
      p.kesimBoy = k.boy;
      p.kesimEn = k.en;
    });

    // Malzeme özetleri (m², bant metresi)
    const ozet = {};
    for (const p of kesimListesi) {
      const malz = A.malzemeler[p.malzeme];
      const anahtar = malz.ad;
      if (!ozet[anahtar]) ozet[anahtar] = { malzeme: anahtar, alanM2: 0, bantM: 0, bantKalinlik: malz.bant, parcaAdedi: 0 };
      const o = ozet[anahtar];
      o.alanM2 += (p.boy * p.en * p.adet) / 1e6;
      o.bantM += ((p.bant.u * p.boy + p.bant.k * p.en) * p.adet) / 1000;
      o.parcaAdedi += p.adet;
    }

    return {
      kesimListesi,
      hirdavat: [...hirdavatMap.values()],
      ozet: Object.values(ozet),
      uyarilar,
      modulSonuclari,
    };
  }

  return {
    RAY_BOYLARI,
    PRESETLER,
    varsayilanAyarlar,
    yeniModul,
    modulHesapla,
    projeHesapla,
    kesimOlcusu,
    mentesheAdedi,
    raySec,
  };
});

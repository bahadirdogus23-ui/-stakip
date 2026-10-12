const test = require('node:test');
const assert = require('node:assert/strict');
const Hesap = require('../js/hesap.js');
const Yerlesim = require('../js/yerlesim.js');
const Maliyet = require('../js/maliyet.js');

const ayar = Hesap.varsayilanAyarlar();
const bul = (sonuc, ad) => sonuc.parcalar.find((p) => p.ad.startsWith(ad));

test('üst dolap: gövde, arkalık, raf ve kapak ölçüleri', () => {
  const m = Hesap.yeniModul('ust'); // 600 x 720 x 320, yanlar boydan, kanallı arkalık, 2 kapak 2 raf
  const s = Hesap.modulHesapla(m, ayar);
  assert.deepEqual(s.uyarilar, []);
  const yan = bul(s, 'Yan');
  assert.equal(yan.boy, 720); assert.equal(yan.en, 320); assert.equal(yan.adet, 2);
  assert.equal(bul(s, 'Alt tabla').boy, 564);
  assert.equal(bul(s, 'Üst tabla').boy, 564);
  // Kanallı arkalık: iç ölçü + 2 x (8 - 1)
  const ark = bul(s, 'Arkalık');
  assert.equal(ark.boy, 684 + 14); assert.equal(ark.en, 564 + 14);
  // Raf: 564 - 2, derinlik 320 - 10 - 8 - 20
  const raf = bul(s, 'Raf');
  assert.equal(raf.boy, 562); assert.equal(raf.en, 282); assert.equal(raf.adet, 2);
  // Kapak: (720 - 3) yükseklik, (600 - 3 - 3) / 2 genişlik
  const kapak = bul(s, 'Kapak');
  assert.equal(kapak.boy, 717); assert.equal(kapak.en, 297); assert.equal(kapak.adet, 2);
  assert.deepEqual(kapak.bant, { u: 2, k: 2 });
  assert.equal(s.hirdavat.find((h) => h.ad.startsWith('Menteşe')).adet, 4);
});

test('alt dolap: çekmece kutusu, ray ve ara tabla', () => {
  const m = Hesap.yeniModul('alt'); // 600 x 870 x 560, ayak 100, kuşak
  const s = Hesap.modulHesapla(m, ayar);
  assert.equal(bul(s, 'Yan').boy, 770);
  assert.equal(bul(s, 'Ön kuşak').en, 100);
  assert.equal(bul(s, 'Ara tabla').adet, 1);
  // İç derinlik 560 - 10 - 8 = 542 -> en uzun ray 500
  const ray = s.hirdavat.find((h) => h.ad.includes('ray'));
  assert.match(ray.ad, /500 mm/);
  const yan = bul(s, 'Çekmece yanı');
  assert.equal(yan.boy, 500); assert.equal(yan.en, 110); // 150 - 40
  // Kutu genişliği 564 - 26 = 538; ön/arka 538 - 2*16
  assert.equal(bul(s, 'Çekmece ön/arka').boy, 506);
  assert.equal(bul(s, 'Çekmece tabanı').en, 538);
  assert.equal(s.hirdavat.find((h) => h.ad.includes('ayarlı ayak')).adet, 4);
});

test('satır yükseklikleri ön yüz alanını tam doldurur', () => {
  const m = Hesap.yeniModul('sifonyer');
  const s = Hesap.modulHesapla(m, ayar);
  const onler = bul(s, 'Çekmece önü');
  // 4 çekmece arka arkaya: aralarında ara tabla yok, 3 boşluk
  const toplam = s.parcalar.filter((p) => p.ad.startsWith('Çekmece önü')).reduce((a, p) => a + p.boy, 0);
  assert.ok(Math.abs(toplam + 3 * 3 + 2 * 1.5 - 840) < 0.5, `toplam ${toplam}`);
  assert.equal(s.parcalar.filter((p) => p.ad.startsWith('Ara tabla')).length, 0);
  assert.ok(onler.boy > 200);
});

test('gömme kapak ve ara dikme', () => {
  const m = Hesap.yeniModul('ust');
  m.kapakTipi = 'ic';
  m.satirlar[0].dikme = 1;
  const s = Hesap.modulHesapla(m, ayar);
  const kapak = bul(s, 'Kapak');
  // Gömme: (600 - 2*18 - 2*3 - (18 + 2*3)) / 2
  assert.equal(kapak.en, (564 - 6 - 24) / 2);
  assert.equal(bul(s, 'Ara dikme').adet, 1);
  assert.match(s.hirdavat.find((h) => h.ad.startsWith('Menteşe')).ad, /gömme/);
});

test('çakma arkalık yan derinliğini azaltır', () => {
  const m = Hesap.yeniModul('kitaplik');
  const s = Hesap.modulHesapla(m, ayar);
  assert.equal(bul(s, 'Yan').en, 300 - 8);
  assert.equal(bul(s, 'Arkalık').en, 800 - 4);
});

test('kesim ölçüsünden bant kalınlığı düşülür', () => {
  const p = { malzeme: 'mdflam18', boy: 700, en: 400, bant: { u: 2, k: 2 } };
  assert.deepEqual(Hesap.kesimOlcusu(p, ayar), { boy: 698, en: 398 });
  const a2 = Object.assign({}, ayar, { bantDus: false });
  assert.deepEqual(Hesap.kesimOlcusu(p, a2), { boy: 700, en: 400 });
});

test('proje: modül adedi çarpılır ve aynı parçalar birleşir', () => {
  const m1 = Hesap.yeniModul('ust');
  const m2 = Hesap.yeniModul('ust');
  m2.ad = 'Üst Dolap 2';
  m1.adet = 2;
  const s = Hesap.projeHesapla({ ayarlar: ayar, moduller: [m1, m2] });
  const yan = s.kesimListesi.find((p) => p.ad === 'Yan');
  assert.equal(yan.adet, 6);
  assert.deepEqual(yan.moduller, ['Üst Dolap', 'Üst Dolap 2']);
  assert.ok(s.ozet.length >= 2);
});

test('yerleşim: tüm parçalar plakaya sığar ve çakışmaz', () => {
  const s = Hesap.projeHesapla({ ayarlar: ayar, moduller: [Hesap.yeniModul('gardirop'), Hesap.yeniModul('alt'), Hesap.yeniModul('alt')] });
  const y = Yerlesim.projeYerlesimi(s.kesimListesi, ayar);
  for (const g of y) {
    assert.equal(g.sigmayan.length, 0);
    const toplam = g.plakalar.reduce((a, p) => a + p.yerlesen.length, 0);
    const beklenen = s.kesimListesi.filter((p) => p.malzeme === g.malzemeId).reduce((a, p) => a + p.adet, 0);
    assert.equal(toplam, beklenen);
    const PW = g.plaka.uzun - 2 * g.kenar;
    const PH = g.plaka.kisa - 2 * g.kenar;
    for (const p of g.plakalar) {
      for (const a of p.yerlesen) {
        assert.ok(a.x >= 0 && a.y >= 0 && a.x + a.w <= PW + 1e-6 && a.y + a.h <= PH + 1e-6);
        for (const b of p.yerlesen) {
          if (a === b) continue;
          const cakisma = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
          assert.ok(!cakisma, 'parçalar çakışıyor');
        }
      }
    }
  }
});

test('yerleşim: damarlı parça döndürülmez, büyük parça sığmayan olarak raporlanır', () => {
  const y = Yerlesim.yerlestir(
    [{ no: 1, ad: 'A', w: 500, h: 2500, adet: 1, damar: true }, { no: 2, ad: 'B', w: 3000, h: 100, adet: 1, damar: false }],
    { uzun: 2800, kisa: 2100 }, { testere: 4, kenarPayi: 10 }
  );
  assert.equal(y.sigmayan.length, 2);
  const y2 = Yerlesim.yerlestir([{ no: 1, ad: 'A', w: 500, h: 2500, adet: 1, damar: false }], { uzun: 2800, kisa: 2100 }, { testere: 4, kenarPayi: 10 });
  assert.equal(y2.plakalar[0].yerlesen[0].dondu, true);
});

const proje = (moduller, ek) => Object.assign({ ad: 'T', ayarlar: Hesap.varsayilanAyarlar(), moduller, yerlesim: { tip: 'duz', duvarA: 0, duvarB: 0 } }, ek || {});

test('L köşe dolap: tablalar, kapaklar ve arkalıklar', () => {
  const m = Hesap.yeniModul('lkose'); // A 900, B 900, Y 870, D 560, ayak 100, çakma arkalık 8
  const s = Hesap.modulHesapla(m, ayar);
  assert.deepEqual(s.uyarilar, []);
  assert.equal(bul(s, 'Yan').boy, 770);
  assert.equal(bul(s, 'Yan').en, 552);
  assert.equal(bul(s, 'Alt tabla – A').boy, 900 - 8 - 18);
  assert.equal(bul(s, 'Alt tabla – B').boy, 900 - 560 - 18);
  // B kapağı x = D düzleminde; A kapağı onun kalınlığı + boşluk sonrasında başlar
  assert.equal(bul(s, 'Köşe kapağı – A').en, 900 - 560 - 18 - 3 - 1.5);
  assert.equal(bul(s, 'Köşe kapağı – B').en, 900 - 560 - 1.5);
  assert.equal(bul(s, 'Arkalık – B').en, 900 - 8 - 2);
  assert.ok(s.hirdavat.some((h) => h.ad.startsWith('Katlanır kapak')));
  assert.equal(s.hirdavat.find((h) => h.ad.includes('ayarlı ayak')).adet, 6);
});

test('kör köşe paneli kapak alanını daraltır', () => {
  const m = Hesap.yeniModul('korkose'); // 1000 genişlik, 560 kör panel solda, 1 kapak
  const s = Hesap.modulHesapla(m, ayar);
  assert.equal(bul(s, 'Kör köşe paneli').en, 560);
  // Kapak: (1000 - 1.5) - (1.5 + 560 + 3)
  assert.equal(bul(s, 'Kapak').en, 1000 - 1.5 - (1.5 + 560 + 3));
});

test('ray tipi çekmece kutusu ölçüsünü değiştirir', () => {
  const m = Hesap.yeniModul('alt');
  m.hirdavat = { ray: 'gizli' };
  let s = Hesap.modulHesapla(m, ayar);
  assert.equal(bul(s, 'Çekmece ön/arka').boy, 564 - 10 - 32);
  assert.equal(bul(s, 'Çekmece yanı').boy, 490);
  m.hirdavat = { ray: 'metal' };
  s = Hesap.modulHesapla(m, ayar);
  assert.equal(bul(s, 'Çekmece yanı'), undefined);
  assert.equal(bul(s, 'Çekmece tabanı').en, 564 - 75);
  assert.ok(s.hirdavat.some((h) => h.ad.startsWith('Metal yanlı')));
});

test('bağlantı, menteşe ve kulp türü seçimi hırdavat listesine yansır', () => {
  const m = Hesap.yeniModul('ust');
  const a2 = Hesap.varsayilanAyarlar();
  a2.hirdavat = { baglanti: 'konfirmat', mentese: 'standart', ray: 'bilyeli', kulp: 'gola', ayak: 'metal' };
  const s = Hesap.modulHesapla(m, a2);
  assert.equal(s.hirdavat.find((h) => h.ad.startsWith('Konfirmat')).adet, 4 * 2);
  assert.ok(!s.hirdavat.some((h) => h.ad.startsWith('Minifix')));
  assert.match(s.hirdavat.find((h) => h.ad.startsWith('Menteşe')).ad, /standart/);
  assert.equal(s.hirdavat.find((h) => h.ad === 'Gola profil').birim, 'm');
});

test('modüle özel malzeme seçimi', () => {
  const m = Hesap.yeniModul('ust');
  m.malzeme = { kapak: 'akrilik18', govde: 'sl18c' };
  const s = Hesap.modulHesapla(m, ayar);
  assert.equal(bul(s, 'Kapak').malzeme, 'akrilik18');
  assert.equal(bul(s, 'Yan').malzeme, 'sl18c');
  assert.equal(bul(s, 'Yan').damar, true);
});

test('L mutfak yerleşimi: köşe dolap köşeye, diğerleri duvarlara dizilir', () => {
  const kose = Hesap.yeniModul('lkose');
  const a1 = Hesap.yeniModul('alt');
  const b1 = Hesap.yeniModul('alt'); b1.duvar = 'B'; b1.genislik = 800;
  const u1 = Hesap.yeniModul('ust');
  const p = proje([a1, kose, b1, u1], { yerlesim: { tip: 'L', duvarA: 2000, duvarB: 1500 } });
  const s = Hesap.projeHesapla(p);
  const yer = s.yerlesim;
  const bulY = (m) => yer.yerler.find((y) => y.modul === m);
  assert.equal(bulY(kose).duvar, 'kose');
  assert.equal(bulY(a1).bas, 900);
  assert.equal(bulY(b1).bas, 900);
  assert.equal(bulY(u1).sira, 'duvar');
  assert.equal(bulY(u1).bas, 0); // üst sırada köşe dolap yok
  assert.equal(yer.doluluk.zemin.A, 1500);
  assert.equal(yer.doluluk.zemin.B, 1700);
  assert.ok(s.uyarilar.some((u) => u.includes('B duvarını 200')));
});

test('L yerleşimde köşe dolabı yoksa B duvarı köşe boşluğuyla başlar', () => {
  const a1 = Hesap.yeniModul('alt');
  const b1 = Hesap.yeniModul('alt'); b1.duvar = 'B';
  const p = proje([a1, b1], { yerlesim: { tip: 'L', duvarA: 3000, duvarB: 3000 } });
  const s = Hesap.projeHesapla(p);
  assert.equal(s.yerlesim.yerler.find((y) => y.modul === b1).bas, 560);
  assert.ok(s.uyarilar.some((u) => u.includes('köşe boşluğu')));
});

// ---------- Hata analizi regresyon testleri ----------

test('hata: yerleşim modül adedini hesaba katar ve taşmayı bildirir', () => {
  const a = Hesap.yeniModul('alt');
  a.adet = 3;
  const s = Hesap.projeHesapla(proje([a], { yerlesim: { tip: 'duz', duvarA: 1000, duvarB: 0 } }));
  assert.equal(s.yerlesim.doluluk.zemin.A, 1800);
  assert.equal(s.yerlesim.yerler.length, 3);
  assert.deepEqual(s.yerlesim.yerler.map((y) => y.modul.ad), ['Alt Dolap (1/3)', 'Alt Dolap (2/3)', 'Alt Dolap (3/3)']);
  assert.ok(s.uyarilar.some((u) => u.includes('A duvarını 800')));
});

test('hata: L köşe dolapta baza çerçevesi iki kol için çıkar', () => {
  const l = Hesap.yeniModul('lkose');
  l.genislik = 1200;
  l.baza = { tip: 'panel', yukseklik: 80, geriCekme: 40 };
  const s = Hesap.modulHesapla(l, ayar);
  const ad = (x) => s.parcalar.find((p) => p.ad === x);
  assert.equal(ad('Baza önü – A kolu').boy, 1200 - 520);
  assert.equal(ad('Baza önü – B kolu').boy, 900 - 520 - 18);
  assert.equal(ad('Baza arkası – A kolu').boy, 1200);
  assert.equal(ad('Baza yanı (kol ucu)').adet, 2);
});

test('hata: geçersiz malzeme kalınlığı ve plaka ölçüsü uyarı verir', () => {
  const A0 = Hesap.varsayilanAyarlar();
  A0.malzemeler[0].kalinlik = 0;
  A0.malzemeler[0].plakaUzun = 0;
  const s = Hesap.projeHesapla(proje([Hesap.yeniModul('ust')], { ayarlar: A0 }));
  assert.ok(s.uyarilar.some((u) => u.includes('kalınlık geçersiz')));
  assert.ok(s.uyarilar.some((u) => u.includes('plaka ölçüsü geçersiz')));
  assert.equal(s.kesimListesi.length, 0);
});

test('hata: dosyadan gelen veri temizlenir (XSS, bilinmeyen değerler)', () => {
  const p = Hesap.projeyiNormallestir({
    ad: 'X',
    ayarlar: { malzemeler: [{ id: 'a" onclick="x', ad: '<b>', kalinlik: '18<script>' }], kdvOrani: 'abc' },
    moduller: [{
      id: 'x" onmouseover="y', ad: '<img src=x>', genislik: '<img src=x onerror=alert(1)>', yukseklik: '720',
      arkalik: 'kotu', baza: { tip: 'roket' }, satirlar: [{ tip: 'kpk', adet: 'iki', yukseklik: -5 }], malzeme: { kapak: 'olmayan' },
    }],
    yerlesim: { tip: 'Z', duvarA: '3000' },
  });
  const m = p.moduller[0];
  assert.match(m.id, /^[A-Za-z0-9_-]+$/);
  assert.match(p.ayarlar.malzemeler[0].id, /^[A-Za-z0-9_-]+$/);
  assert.equal(m.genislik, 600);       // sayı olmayan değer varsayılana döner
  assert.equal(m.yukseklik, 720);      // sayı metni sayıya çevrilir
  assert.equal(p.ayarlar.malzemeler[0].kalinlik, 18);
  assert.equal(m.arkalik, 'kanal');
  assert.equal(m.baza.tip, 'yok');
  assert.deepEqual(m.satirlar[0], { tip: 'kapak', yukseklik: null, adet: 1, raf: 0, dikme: 0, aski: false });
  assert.deepEqual(m.malzeme, {});
  assert.equal(p.yerlesim.tip, 'duz');
  assert.equal(p.yerlesim.duvarA, 3000);
  assert.equal(p.ayarlar.fiyat.kdvOrani, 20);
  assert.equal(typeof m.ad, 'string'); // metin alanları arayüzde kaçışlanır
});

test('hata: aynı kimlikli modüller ayrıştırılır', () => {
  const p = Hesap.projeyiNormallestir({ moduller: [{ id: 'a' }, { id: 'a' }] });
  assert.notEqual(p.moduller[0].id, p.moduller[1].id);
});

// ---------- Fiyat ve maliyet ----------

const maliyetKur = (p) => {
  const s = Hesap.projeHesapla(p);
  const ps = {};
  for (const g of Yerlesim.projeYerlesimi(s.kesimListesi, p.ayarlar)) ps[g.malzemeId] = g.plakalar.length;
  return { s, ps, r: Maliyet.maliyetHesapla(p, s, ps) };
};

test('maliyet: toplamlar tutarlı, modül dağılımı maliyete eşit', () => {
  const u = Hesap.yeniModul('ust'); u.adet = 2;
  const p = Hesap.projeyiNormallestir(proje([Hesap.yeniModul('alt'), u, Hesap.yeniModul('gardirop')]));
  p.ayarlar.fiyat.ekKalemler = [{ ad: 'Tezgah', tutar: 5000 }];
  const { r } = maliyetKur(p);
  const ara = r.ara.malzeme + r.ara.hirdavat + r.ara.hizmet + r.ara.iscilik + r.ara.diger;
  assert.ok(Math.abs(ara - r.maliyet) < 0.01);
  assert.ok(Math.abs(r.dagitimFarki) < 0.05, `dağıtım farkı ${r.dagitimFarki}`);
  const satirToplam = r.teklifSatirlari.reduce((a, x) => a + x.tutar, 0);
  assert.ok(Math.abs(satirToplam - r.satisKdvHaric) < 0.01);
  assert.ok(Math.abs(r.satisKdvHaric - r.maliyet * 1.3) < 0.1);
  assert.ok(Math.abs(r.kdv - r.satisKdvHaric * 0.2) < 0.01);
  assert.ok(Math.abs(r.genelToplam - (r.satisKdvHaric + r.kdv)) < 0.01);
  assert.equal(r.modulAdedi, 4);
  assert.equal(r.kalemler.iscilik[0].tutar, 4 * 1500);
  assert.ok(r.teklifSatirlari.some((x) => x.ad === 'Tezgah' && x.tutar === 6500));
});

test('maliyet: plaka tam sayı veya alan + fire ile hesaplanır', () => {
  const p = Hesap.projeyiNormallestir(proje([Hesap.yeniModul('ust')]));
  const { ps, r } = maliyetKur(p);
  const govde = r.kalemler.malzeme.find((m) => m.malzemeId === 'sl18');
  assert.equal(govde.plaka, ps.sl18);
  assert.equal(govde.plakaTutar, ps.sl18 * 2200);
  p.ayarlar.fiyat.plakaHesabi = 'alan';
  const r2 = maliyetKur(p).r;
  const g2 = r2.kalemler.malzeme.find((m) => m.malzemeId === 'sl18');
  assert.ok(Math.abs(g2.plaka - (g2.alanM2 * 1.15) / 5.88) < 0.01);
  // Ebatlama alan modunda da gerçek plaka sayısıyla
  assert.equal(r2.kalemler.hizmet.find((h) => h.malzemeId === 'sl18' && h.tur === 'ebatlama').miktar, ps.sl18);
});

test('maliyet: hırdavat fiyatı kullanıcı fiyatıyla değişir, askı borusu metreyle', () => {
  const p = Hesap.projeyiNormallestir(proje([Hesap.yeniModul('gardirop')]));
  p.ayarlar.fiyat.hirdavat.mentese_frenli = 100;
  const { r } = maliyetKur(p);
  const m = r.kalemler.hirdavat.find((h) => h.kod === 'mentese_frenli');
  assert.equal(m.tutar, m.adet * 100);
  const aski = r.kalemler.hirdavat.find((h) => h.kod === 'aski_borusu');
  assert.equal(aski.fiyatMiktari, 0.962);
  assert.equal(aski.tutar, 153.92);
});

test('maliyet: eksik fiyat bildirilir, lake malzemede m² işlem fiyatı eklenir', () => {
  const k = Hesap.yeniModul('ust');
  k.malzeme = { kapak: 'lake18' };
  const p = Hesap.projeyiNormallestir(proje([k]));
  p.ayarlar.fiyat.hirdavat.raf_pimi = 0;
  const { r } = maliyetKur(p);
  assert.ok(r.eksikFiyat.some((x) => x.startsWith('Raf pimi')));
  const lake = r.kalemler.malzeme.find((m) => m.malzemeId === 'lake18');
  assert.ok(lake.islemTutar > 0);
  assert.equal(lake.bantTutar, 0);
});

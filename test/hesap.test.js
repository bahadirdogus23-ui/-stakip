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
  m.sutunlar[0].satirlar[0].dikme = 1;
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
  const m = Hesap.yeniModul('korkose'); // 900 genişlik, 560 kör panel solda, 1 kapak
  const s = Hesap.modulHesapla(m, ayar);
  assert.equal(bul(s, 'Kör köşe paneli').en, 560);
  // Kapak: (900 - 1.5) - (1.5 + 560 + 3)
  assert.equal(bul(s, 'Kapak').en, 900 - 1.5 - (1.5 + 560 + 3));
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
  assert.equal(ad('Baza önü – B kolu').boy, 900 - 520 + 18); // köşedeki ve kol ucundaki t×t boşluğu kapatır
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
  assert.deepEqual(m.sutunlar[0].satirlar[0], {
    tip: 'kapak', yukseklik: null, adet: 1, raf: 0, dikme: 0, aski: false, kapakTuru: 'panel', acilim: 'yana', rafTipi: 'ahsap', led: false,
    rafSabit: false, menteseYonu: 'oto', kutuYukseklik: null, rayBoyu: null, cekmeceIc: 'yok', icCekmece: 0, icCekmeceH: null, rafYukseklikleri: [], askiUstten: null, rafGeri: null, altTablaYok: false,
  });
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
  p.ayarlar.fiyat.iscilikEsasi = 'modul';
  const { r } = maliyetKur(p);
  const ara = r.ara.malzeme + r.ara.hirdavat + r.ara.hizmet + r.ara.iscilik + r.ara.montaj + r.ara.diger;
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

// ---------- Katalog, bölmeler, cam, sürgü, panel, bağlantılar ----------

test('katalog: tüm hazır modüller uyarısız hesaplanır', () => {
  for (const k of Object.keys(Hesap.PRESETLER)) {
    const s = Hesap.modulHesapla(Hesap.yeniModul(k), ayar);
    assert.ok(s.geo, `${k} çizilemedi`);
    assert.deepEqual(s.uyarilar, [], `${k}: ${s.uyarilar.join(' | ')}`);
    if (k !== 'bosluk' && !k.startsWith('nesne_')) assert.ok(s.parcalar.length > 0, `${k} parça üretmedi`);
  }
  assert.ok(Object.keys(Hesap.PRESETLER).length >= 45);
});

test('bölmeler: dikey bölme genişlikleri, boydan dikme ve bölme başına kapak', () => {
  const m = Hesap.yeniModul('gardirop3'); // 1500, bölme 1 = 476 iç, bölme 2 oto
  const s = Hesap.modulHesapla(m, ayar);
  const g = s.geo;
  assert.equal(g.sutunlar.length, 2);
  assert.equal(g.sutunlar[0].x2 - g.sutunlar[0].x1, 476);
  assert.equal(g.sutunlar[1].x2 - g.sutunlar[1].x1, 1500 - 36 - 18 - 476);
  const dikme = bul(s, 'Bölme dikmesi');
  assert.equal(dikme.boy, 2320 - 36); // gövde 2400 - baza 80, tablalar arası
  // Bölme 1 kapağı: dış kenardan dikme ortasına kadar
  const k1 = s.parcalar.find((p) => p.ad === 'Kapak (bölme 1, satır 2)');
  assert.equal(k1.en, r(18 + 476 + 9 - 1.5 - 1.5));
  const k2 = s.parcalar.find((p) => p.ad === 'Kapak (bölme 2, satır 2)');
  assert.equal(k2.adet, 2);
  assert.ok(s.hirdavat.some((h) => h.ad.startsWith('Askı borusu')));
  assert.equal(bul(s, 'Raf (bölme 1').adet, 5);
});
function r(x) { return Math.round(x * 10) / 10; }

test('cam: çerçevesiz, profilli ve çerçeveli cam kapak ölçüleri', () => {
  const m = Hesap.yeniModul('ust'); // 600×720, 2 kapak 297×717
  const sat = m.sutunlar[0].satirlar[0];
  sat.kapakTuru = 'cam';
  let s = Hesap.modulHesapla(m, ayar);
  let cam = bul(s, 'Kapak (satır 1) – cam');
  assert.equal(cam.malzeme, 'cam4');
  assert.deepEqual([cam.boy, cam.en, cam.adet], [717, 297, 2]);
  assert.deepEqual(cam.bant, { u: 0, k: 0 });
  assert.ok(s.hirdavat.some((h) => h.kod === 'mentese_cam'));

  sat.kapakTuru = 'cam_profil';
  s = Hesap.modulHesapla(m, ayar);
  cam = bul(s, 'Kapak (satır 1) – profil camı');
  assert.deepEqual([cam.boy, cam.en], [717 - 36, 297 - 36]);
  assert.equal(s.hirdavat.find((h) => h.kod === 'al_profil').fiyatMiktari, 2 * 2 * (717 + 297) / 1000);

  sat.kapakTuru = 'cam_cerceve';
  s = Hesap.modulHesapla(m, ayar);
  assert.equal(bul(s, 'Kapak (satır 1) – çerçeve dikmesi').adet, 4);
  assert.equal(bul(s, 'Kapak (satır 1) – çerçeve kaydı').boy, 297 - 140);
  cam = bul(s, 'Kapak (satır 1) – çerçeve camı');
  assert.deepEqual([cam.boy, cam.en], [717 - 140 + 16 - 2, 297 - 140 + 16 - 2]);
});

test('cam raf ve LED', () => {
  const m = Hesap.yeniModul('ust_cam'); // 800, 2 cam raf, LED
  const s = Hesap.modulHesapla(m, ayar);
  const raf = bul(s, 'Cam raf');
  assert.equal(raf.malzeme, 'cam8');
  assert.equal(raf.boy, 764 - 2 - 2);
  assert.equal(s.hirdavat.find((h) => h.kod === 'cam_raf_pimi').adet, 8);
  assert.equal(s.hirdavat.find((h) => h.kod === 'led_serit').fiyatMiktari, 0.764);
  assert.equal(s.hirdavat.find((h) => h.kod === 'led_adaptor').adet, 1);
});

test('açılım: yukarı kalkan ve aşağı devrilen kapak hırdavatı', () => {
  const m = Hesap.yeniModul('ust_klapa');
  let s = Hesap.modulHesapla(m, ayar);
  assert.equal(s.hirdavat.find((h) => h.kod === 'kapak_kaldirma').adet, 1);
  m.sutunlar[0].satirlar[0].acilim = 'asagi';
  s = Hesap.modulHesapla(m, ayar);
  assert.equal(s.hirdavat.find((h) => h.kod === 'klapa_mentese').adet, 2);
  assert.ok(!s.hirdavat.some((h) => h.kod === 'kapak_kaldirma'));
});

test('sürgü kapak: kapak ölçüsü, ray ve iç çekmece', () => {
  const m = Hesap.yeniModul('surgulu'); // 1800, 2 kapak, bindirme 30
  const s = Hesap.modulHesapla(m, ayar);
  const k = bul(s, 'Sürgü kapak');
  assert.equal(k.adet, 2);
  assert.equal(k.en, (1800 + 30) / 2);
  assert.equal(k.boy, 2320 - 40);
  assert.equal(s.hirdavat.find((h) => h.kod === 'surgu_ray').fiyatMiktari, 3.6);
  assert.ok(!s.hirdavat.some((h) => h.ad.startsWith('Menteşe')));
  // İç çekmece önleri gövde içine gömme yerleşir
  const on = bul(s, 'Çekmece önü');
  assert.ok(on.en < 873);
  assert.equal(s.geo.surgu.kapaklar.length, 2);
});

test('şeffaf T bağlantı ara birleşimlerde, şeffaf köşe bağlantı köşelerde', () => {
  const a2 = Hesap.varsayilanAyarlar();
  a2.hirdavat.araBaglanti = 'seffaf_t';
  const m = Hesap.yeniModul('alt'); // D 560 → 3 nokta; 1 ara tabla (2 uç)
  let s = Hesap.modulHesapla(m, a2);
  assert.equal(s.hirdavat.find((h) => h.kod === 'seffaf_t').adet, 2 * 3);
  assert.equal(s.hirdavat.find((h) => h.kod === 'sunta_vidasi').adet, 4 * 6);
  assert.equal(s.hirdavat.find((h) => h.kod === 'minifix').adet, 2 * 3 + 4); // köşe: alt tabla 2 uç + kuşak 4 nokta
  a2.hirdavat = Object.assign({}, a2.hirdavat, { baglanti: 'seffaf_kose', araBaglanti: 'ayni' });
  s = Hesap.modulHesapla(m, a2);
  assert.ok(s.hirdavat.some((h) => h.kod === 'seffaf_kose'));
  assert.ok(s.hirdavat.some((h) => h.kod === 'seffaf_t'), 'gövdeyle aynı seçilince ara birleşimler T bağlantı olur');
  assert.ok(!s.hirdavat.some((h) => h.kod === 'minifix'));
});

test('panel modülleri: ölçü, bant ve yerleşim yönü', () => {
  const y = Hesap.modulHesapla(Hesap.yeniModul('yan_kapama'), ayar);
  assert.deepEqual([y.parcalar[0].boy, y.parcalar[0].en], [870, 580]);
  assert.equal(y.geo.W, 18);
  assert.equal(y.geo.D, 580);
  const raf = Hesap.modulHesapla(Hesap.yeniModul('duvar_rafi'), ayar);
  assert.equal(raf.geo.W, 800);
  assert.equal(raf.hirdavat.find((h) => h.kod === 'raf_tasiyici').adet, 2);
  const baza = Hesap.yeniModul('baza_bandi');
  const alt = Hesap.yeniModul('alt');
  const s = Hesap.projeHesapla(proje([alt, baza], { yerlesim: { tip: 'duz', duvarA: 3000, duvarB: 0 } }));
  assert.equal(s.yerlesim.yerler.length, 1, 'baza bandı yerleşimde yer kaplamaz');
  assert.ok(s.kesimListesi.some((p) => p.ad === 'Baza bandı'));
});

test('cam plakaya yerleştirilmez, m² fiyatıyla maliyetlenir', () => {
  const p = Hesap.projeyiNormallestir(proje([Hesap.yeniModul('ust_cam')]));
  const s = Hesap.projeHesapla(p);
  const y = Yerlesim.projeYerlesimi(s.kesimListesi, p.ayarlar);
  assert.ok(!y.some((g) => g.malzemeId === 'cam4' || g.malzemeId === 'cam8'));
  const { r } = maliyetKur(p);
  const cam = r.kalemler.malzeme.find((m) => m.malzemeId === 'cam4');
  assert.equal(cam.plaka, 0);
  assert.ok(Math.abs(cam.islemTutar - cam.alanM2 * 900) < 0.01);
  assert.ok(!r.kalemler.hizmet.some((h) => h.malzemeId === 'cam4'));
});

test('600 mm üstü montaj yüksekliği asılı sırada sayılır', () => {
  const b = Hesap.yeniModul('bulasik_panel'); // montaj 100 → zemin
  const u = Hesap.yeniModul('ust_klapa');      // montaj 1810 → duvar
  const s = Hesap.projeHesapla(proje([b, u], { yerlesim: { tip: 'duz', duvarA: 3000, duvarB: 0 } }));
  assert.equal(s.yerlesim.yerler.find((y) => y.modul.id === b.id).sira, 'zemin');
  assert.equal(s.yerlesim.yerler.find((y) => y.modul.id === u.id).sira, 'duvar');
});

// ---------- Şekilli parçalar: formüller bağımsız sayısal yöntemle doğrulanır ----------

/** Şekil yolunu çokgene çevirip alan (shoelace) ve çevre ölçer. */
function ornekle(g) {
  const nokta = [];
  let x = 0, y = 0;
  for (const k of g.yol) {
    if (k[0] === 'M' || k[0] === 'L') { x = k[1]; y = k[2]; nokta.push([x, y]); }
    else if (k[0] === 'Q') { // köşe: radyüs için çeyrek daire
      const [cx, cy, ex, ey] = k.slice(1);
      const r = Math.max(Math.abs(ex - x), Math.abs(ey - y));
      // merkez: köşeden r içeride
      const mx = cx === x ? ex : x, my = cy === y ? ey : y;
      const merk = [cx === x ? ex : x, cy === y ? ey : y];
      const a0 = Math.atan2(y - merk[1], x - merk[0]);
      let a1 = Math.atan2(ey - merk[1], ex - merk[0]);
      let d = a1 - a0; if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI;
      for (let i = 1; i <= 200; i++) nokta.push([merk[0] + r * Math.cos(a0 + (d * i) / 200), merk[1] + r * Math.sin(a0 + (d * i) / 200)]);
      x = ex; y = ey; void mx; void my;
    } else if (k[0] === 'A') { // üst yay: (x,y)'den sol tarafa, tepe noktası k[4] yüksekliği kadar yukarıda
      const R = k[1];
      const sol = 0, sag = x, tabanY = y, f = k[4] === undefined ? 0 : 0;
      void f;
      const W = sag - sol;
      const yayF = R - Math.sqrt(R * R - (W / 2) * (W / 2));
      const merk = [W / 2, tabanY + yayF - R];
      const a0 = Math.atan2(tabanY - merk[1], sag - merk[0]);
      const a1 = Math.PI - a0;
      for (let i = 1; i <= 2000; i++) { const a = a0 + ((a1 - a0) * i) / 2000; nokta.push([merk[0] + R * Math.cos(a), merk[1] + R * Math.sin(a)]); }
      x = sol; y = tabanY;
    } else if (k[0] === 'E') {
      for (let i = 0; i < 20000; i++) { const a = (2 * Math.PI * i) / 20000; nokta.push([k[1] + k[1] * Math.cos(a), k[2] + k[2] * Math.sin(a)]); }
    }
  }
  let alan = 0, cevre = 0;
  for (let i = 0; i < nokta.length; i++) {
    const [x1, y1] = nokta[i], [x2, y2] = nokta[(i + 1) % nokta.length];
    alan += x1 * y2 - x2 * y1;
    cevre += Math.hypot(x2 - x1, y2 - y1);
  }
  return { alan: Math.abs(alan) / 2, cevre };
}

test('şekil formülleri: alan ve çevre sayısal örneklemeyle tutarlı', () => {
  const durumlar = [
    ['egimli', 1000, 2000, 1000, 0], ['egimli', 800, 600, 900, 0],
    ['radyus', 600, 400, 50, 4], ['radyus', 600, 400, 120, 2],
    ['pah', 600, 400, 40, 4], ['oval', 600, 400, 0, 0], ['oval', 1200, 300, 0, 0],
    ['daire', 500, 0, 0, 0], ['yarim_daire', 800, 0, 0, 0], ['kemer', 1000, 800, 200, 0], ['kemer', 600, 1800, 300, 0],
  ];
  for (const [tur, W, H, p, n] of durumlar) {
    const g = Hesap.sekilGeometrisi(tur, W, H, p, n);
    const o = ornekle(g);
    assert.ok(Math.abs(o.alan - g.alan) / g.alan < 0.002, `${tur} alan ${g.alan.toFixed(0)} ≠ ${o.alan.toFixed(0)}`);
    assert.ok(Math.abs(o.cevre - g.cevre) / g.cevre < 0.002, `${tur} çevre ${g.cevre.toFixed(1)} ≠ ${o.cevre.toFixed(1)}`);
  }
  // Bilinen değerler
  const e = Hesap.sekilGeometrisi('egimli', 1000, 2000, 1000);
  assert.equal(e.kutuH, 2000);
  assert.ok(e.bilgi.includes('eğim açısı 45°'), e.bilgi.join());
  const k = Hesap.sekilGeometrisi('kemer', 1000, 800, 200);
  assert.ok(k.bilgi.includes('yay yarıçapı R725'));
});

test('şekilli panel: kaba kesim kutusu, net alan, bant ve CNC maliyeti', () => {
  const m = Hesap.yeniModul('tabla');
  m.sekil = 'oval'; m.boy = 1200; m.en = 800; // tabla: boy × en
  const s = Hesap.modulHesapla(m, ayar);
  const p = s.parcalar[0];
  assert.equal(p.ad, 'Tabla – oval');
  assert.deepEqual([p.boy, p.en], [1200, 800]); // kaba kesim kutusu = boy × en
  const kes = Hesap.kesimOlcusu(p, ayar);
  assert.deepEqual(kes, { boy: p.boy, en: p.en }, 'şekilli parçada bant düşülmez, kaba kutu kesilir');
  assert.ok(Math.abs(Hesap.parcaAlanM2(p) - Math.PI * 0.6 * 0.4) < 1e-6);
  assert.ok(p.not.includes('CNC'));
  const pr = Hesap.projeyiNormallestir(proje([m]));
  const { r } = maliyetKur(pr);
  const cnc = r.kalemler.hizmet.find((h) => h.tur === 'sekil');
  assert.ok(cnc && Math.abs(cnc.miktar - 3.2) < 0.1, 'oval çevresi ≈ 3,2 m CNC');
  assert.ok(Math.abs(r.dagitimFarki) < 0.05);
});

test('kapak notunda menteşe delik konumları, yanlarda raf pimi notu', () => {
  const s = Hesap.modulHesapla(Hesap.yeniModul('gardirop'), ayar);
  const k = s.parcalar.find((p) => p.ad === 'Kapak (satır 2)');
  // 1914 mm kapak → 4 menteşe: 100, 671.3, 1242.7, 1814
  assert.match(k.not, /üstten 100 \/ 671,3 \/ 1242,7 \/ 1814 mm/);
  const u = Hesap.modulHesapla(Hesap.yeniModul('ust'), ayar);
  assert.match(u.parcalar.find((p) => p.ad === 'Yan').not, /32 mm aralıkla/);
  assert.deepEqual(Hesap.mentesheKonumlari(717, 2), [100, 617]);
});

// ---------- Çekmece özelleştirmeleri, gizli çekmeceler, sabit raf, menteşe yönü ----------

test('çekmece kutu yüksekliği ve ray boyu elle seçilir, sığmazsa sınırlanır', () => {
  const m = Hesap.yeniModul('alt_cekmece3'); // 3. çekmece önü büyük
  const s3 = m.sutunlar[0].satirlar[2];
  s3.kutuYukseklik = 120;
  s3.rayBoyu = 400;
  let s = Hesap.modulHesapla(m, ayar);
  const yan = s.parcalar.find((p) => p.ad === 'Çekmece yanı (satır 3)');
  assert.deepEqual([yan.boy, yan.en], [400, 120]);
  assert.ok(s.hirdavat.some((h) => h.ad === 'Bilyeli teleskopik ray 400 mm'));
  s3.kutuYukseklik = 900; // sığmaz
  s3.rayBoyu = 600;       // iç derinlik 542 → sığmaz
  s = Hesap.modulHesapla(m, ayar);
  const y2 = s.parcalar.find((p) => p.ad === 'Çekmece yanı (satır 3)');
  assert.ok(y2.en < 900 && y2.boy === 500);
  assert.ok(s.uyarilar.some((u) => u.includes('sığmıyor; en fazla')));
  assert.ok(s.uyarilar.some((u) => u.includes('600 mm ray sığmıyor')));
});

test('çekmece tabanı kanala geçme seçeneği', () => {
  const a2 = Hesap.varsayilanAyarlar();
  a2.cekmeceTabani = 'kanal';
  const s = Hesap.modulHesapla(Hesap.yeniModul('alt'), a2); // kutu 538 × 500, 16 mm yan
  const t = s.parcalar.find((p) => p.ad.startsWith('Çekmece tabanı'));
  assert.deepEqual([t.boy, t.en], [500 - 32 + 14, 538 - 32 + 14]);
  assert.match(t.not, /kanal/);
});

test('iç (gizli) çekmece: dolgu paneli, iç ön, kutu ve raflar üstte', () => {
  const m = Hesap.yeniModul('alt_kapak'); // 600 alt dolap, 2 kapak, 1 raf
  const sat = m.sutunlar[0].satirlar[0];
  sat.icCekmece = 2;
  sat.icCekmeceH = 150;
  const s = Hesap.modulHesapla(m, ayar);
  const dolgu = s.parcalar.find((p) => p.ad.startsWith('İç çekmece dolgu paneli'));
  assert.equal(dolgu.adet, 2);
  assert.equal(dolgu.boy, 2 * 150 + 3 + 5);
  const on = s.parcalar.find((p) => p.ad.startsWith('İç çekmece önü'));
  assert.deepEqual([on.adet, on.boy, on.en], [2, 147, 564 - 36 - 4]);
  const yan = s.parcalar.find((p) => p.ad.startsWith('Çekmece yanı') && p.ad.includes('iç çekmece'));
  assert.equal(yan.en, 110); // 150 - 40
  assert.equal(s.geo.satirlar[0].icCekmeceler.length, 2);
  // Raf iç çekmece bölgesinin üstünde
  assert.ok(s.geo.satirlar[0].raflar[0] > s.geo.satirlar[0].icCekmeceler[1].y2);
  assert.ok(s.hirdavat.some((h) => h.kod === 'kulp_gomme'));
});

test('iç çekmece sığmazsa eklenmez ve uyarı verir', () => {
  const m = Hesap.yeniModul('ust_klapa'); // 360 yükseklik
  m.sutunlar[0].satirlar[0].icCekmece = 3;
  const s = Hesap.modulHesapla(m, ayar);
  assert.ok(!s.parcalar.some((p) => p.ad.startsWith('İç çekmece')));
  assert.ok(s.uyarilar.some((u) => u.includes('iç çekmece') && u.includes('sığmıyor')));
});

test('baza çekmecesi: süpürgelikte, bas-aç, baza önü yerine geçer', () => {
  const m = Hesap.yeniModul('kitaplik'); // baza çerçevesi 60 → yetersiz
  m.bazaCekmece = true;
  let s = Hesap.modulHesapla(m, ayar);
  assert.ok(s.uyarilar.some((u) => u.includes('en az 100 mm')));
  m.baza = { tip: 'panel', yukseklik: 120, geriCekme: 30 };
  s = Hesap.modulHesapla(m, ayar); // 300 derinlikte ray sığmaz: hiçbir baza çekmecesi parçası eklenmemeli
  assert.ok(s.uyarilar.some((u) => u.includes('baza çekmecesi') && u.includes('ray')));
  assert.ok(!s.parcalar.some((p) => p.ad.startsWith('Baza çekmecesi')), 'sığmayan çekmecenin önü listeye girmemeli');
  m.derinlik = 560;
  s = Hesap.modulHesapla(m, ayar);
  const on = s.parcalar.find((p) => p.ad === 'Baza çekmecesi önü');
  assert.deepEqual([on.boy, on.en], [110, 800 - 3]);
  assert.ok(!s.parcalar.some((p) => p.ad === 'Baza ön/arka'));
  assert.equal(s.parcalar.find((p) => p.ad === 'Baza arkası').adet, 1);
  assert.ok(s.hirdavat.some((h) => h.kod === 'basac'));
  assert.ok(s.geo.bazaCekmece);
});

test('sabit raf ara bağlantıyla bağlanır, raf pimi kullanılmaz', () => {
  const a2 = Hesap.varsayilanAyarlar();
  a2.hirdavat.araBaglanti = 'seffaf_t';
  const m = Hesap.yeniModul('ust'); // 2 raf, D 320 → bağlantı başına 2
  m.sutunlar[0].satirlar[0].rafSabit = true;
  const s = Hesap.modulHesapla(m, a2);
  const raf = s.parcalar.find((p) => p.ad.startsWith('Sabit raf'));
  assert.deepEqual([raf.boy, raf.adet], [564, 2]);
  assert.ok(!s.hirdavat.some((h) => h.kod === 'raf_pimi'));
  assert.equal(s.hirdavat.find((h) => h.kod === 'seffaf_t').adet, 2 * 2 * 2);
});

test('çatal-kaşıklık çekmece içine eklenir; menteşe yönü nota ve çizime yansır', () => {
  const m = Hesap.yeniModul('alt');
  m.sutunlar[0].satirlar[0].cekmeceIc = 'catal';
  let s = Hesap.modulHesapla(m, ayar);
  assert.ok(s.hirdavat.some((h) => h.kod === 'catal_kasiklik'));
  const t = Hesap.yeniModul('ust_tek');
  t.sutunlar[0].satirlar[0].menteseYonu = 'sag';
  s = Hesap.modulHesapla(t, ayar);
  assert.match(s.parcalar.find((p) => p.ad.startsWith('Kapak')).not, /sağ kenarda/);
  assert.equal(s.geo.satirlar[0].menteseYonu, 'sag');
});

// ---- Yerinde ölçü, eğimli gövde, delik planı, montaj, artık, 3B, seçenekli teklif, kulp, birleştirme ----
const Delik = require('../js/delik.js');
const Montaj = require('../js/montaj.js');
const Uc = require('../js/uc.js');

const egimliKiler = (arkalik) => {
  const m = Hesap.yeniModul('boy_kiler');
  m.egimli = true; m.sagYukseklik = 1300;
  if (arkalik) m.arkalik = arkalik;
  return m;
};

test('eğimli gövde: yan yükseklikleri, eğik üst tabla, arkalık gövdeyle aynı açıda', () => {
  for (const ark of ['kanal', 'cakma']) {
    const s = Hesap.modulHesapla(egimliKiler(ark), ayar);
    assert.deepEqual(s.geo.egim, { HcL: 2050, HcR: 1200, aci: 54.8 });
    assert.equal(bul(s, 'Sol yan').boy, 2050);
    assert.equal(bul(s, 'Sağ yan').boy, 1225.5); // alçak tarafta iç kenar uzundur: 1200 + 850 × 18 / 600
    const alfa = Math.atan(850 / 600);
    assert.ok(Math.abs(bul(s, 'Üst tabla (eğimli)').boy - 564 / Math.cos(alfa)) < 0.1);
    const ark2 = bul(s, 'Arkalık');
    assert.equal(ark2.sekil.tur, 'egimli');
    assert.match(ark2.not, /eğim açısı 54,8°/);
    // Yamuk kapak: sol kenar sağdan uzun
    const kapak = s.parcalar.find((p) => /eğimli/.test(p.ad) && p.kullanim === 'kapak');
    const [, sol, sag] = kapak.not.match(/sol ([\d,]+), sağ ([\d,]+)/).map((x) => Number(String(x).replace(',', '.')));
    assert.ok(sol > sag);
  }
});

test('kulp delikleri: kapakta açılan kenar, çekmecede ortalı yatay', () => {
  const c = Hesap.kulpBaglami({}, ayar, 0);
  const k = Hesap.kulpDelikleri(c, 'kapak', 'yana', 297, 717, true, 100);
  assert.equal(k.yatay, false);
  assert.equal(k.delikler.length, 2);
  assert.equal(k.delikler[0].x, 297 - 40); // menteşe solda → kulp sağ kenardan 40
  assert.equal(k.delikler[1].y - k.delikler[0].y, 160);
  const c2 = Hesap.kulpDelikleri(c, 'cekmece', 'yana', 597, 150, true, 100);
  assert.equal(c2.yatay, true);
  assert.equal(c2.delikler[0].x + c2.delikler[1].x, 597); // ortalı
  assert.equal(c2.delikler[1].x - c2.delikler[0].x, 160);
  const ozel = Hesap.kulpBaglami({ kulpYon: 'yatay' }, ayar, 0);
  assert.equal(ozel.yon, 'yatay');
});

test('montaj hırdavatı: yan yana dolaplar birleşir, asma dolaba askı, boy dolaba devrilme önleyici', () => {
  const p = Hesap.yeniProje();
  p.moduller = [Hesap.yeniModul('alt'), Hesap.yeniModul('alt'), Hesap.yeniModul('ust'), Hesap.yeniModul('boy_kiler')];
  const r = Hesap.projeHesapla(p);
  const kod = (k) => (r.montajHirdavat.find((x) => x.kod === k) || {}).adet || 0;
  assert.ok(r.birlesimSayisi >= 2);
  assert.ok(kod('dolap_birlestirme') >= 4);
  assert.equal(kod('aski_aparati'), 2);
  assert.equal(kod('devrilme'), 2);
  p.yerlesim.birlestir = false;
  assert.equal(Hesap.projeHesapla(p).birlesimSayisi, 0);
});

test('yerinde ölçü: pencere çakışması, tavan ve arkalık delik notu', () => {
  const p = Hesap.yeniProje();
  p.moduller = [Hesap.yeniModul('alt'), Hesap.yeniModul('ust')];
  assert.deepEqual(Hesap.projeHesapla(p).saha.uyarilar, []);
  p.yerlesim.engeller = [
    { tur: 'pencere', duvar: 'A', x: 0, genislik: 1000, y: 900, yukseklik: 1200 },
    { tur: 'priz', duvar: 'A', x: 300, genislik: 80, y: 400, yukseklik: 80 },
  ];
  p.yerlesim.tavan = 2000;
  const s = Hesap.projeHesapla(p).saha;
  assert.ok(s.uyarilar.some((u) => /pencere denizliğinden/.test(u)));
  assert.ok(s.uyarilar.some((u) => /pencere ile çakışıyor/.test(u)));
  assert.ok(s.notlar.length >= 1);
  // Kötü veri temizlenir
  p.yerlesim.engeller.push({ tur: '<script>', duvar: 'Z', x: 'a' });
  const n = Hesap.projeyiNormallestir(p);
  assert.ok(n.yerlesim.engeller.every((e) => Hesap.ENGEL_TURLERI[e.tur] && ['A', 'B'].includes(e.duvar)));
});

test('artık stoku: önce sığan artık kullanılır, tam plaka sayısı düşer', () => {
  const parcalar = [{ no: 1, ad: 'A', w: 600, h: 500, adet: 2, damar: false }];
  const plaka = { uzun: 2800, kisa: 2100 };
  const bos = Yerlesim.yerlestir(parcalar, plaka, { testere: 4, kenarPayi: 10 });
  assert.equal(bos.tamPlaka, 1);
  const y = Yerlesim.yerlestir(parcalar, plaka, { testere: 4, kenarPayi: 10, artiklar: [{ id: 'a1', uzun: 1300, kisa: 700, adet: 1 }, { id: 'kucuk', uzun: 300, kisa: 300, adet: 3 }] });
  assert.equal(y.tamPlaka, 0);
  assert.deepEqual(y.kullanilanArtiklar.map((a) => a.id), ['a1']);
  // Giyotin boşlukları üst üste binmez, çıkan artıklar en az artikMin
  for (const pl of y.plakalar) for (const a of pl.artiklar) assert.ok(a.kisa >= 250);
});

test('seçenekli teklif: seçenekler hırdavat ve kapak malzemesini değiştirir, fiyat sıralı', () => {
  const p = Hesap.yeniProje();
  p.moduller = [Hesap.yeniModul('alt_cekmece3'), Hesap.yeniModul('ust')];
  const sayac = (pr, sn) => Yerlesim.plakaSayilari(Yerlesim.projeYerlesimi(sn.kesimListesi, pr.ayarlar, []));
  const R = Maliyet.secenekleriHesapla(p, Maliyet.HAZIR_SECENEKLER, sayac);
  assert.equal(R.length, 3);
  assert.equal(R[2].proje.ayarlar.hirdavat.mentese, 'frenli');
  assert.equal(R[2].proje.ayarlar.kullanim.kapak, 'lake18');
  assert.equal(p.ayarlar.hirdavat.mentese, Hesap.varsayilanAyarlar().hirdavat.mentese); // asıl proje değişmez
  assert.ok(R[0].maliyet.genelToplam < R[2].maliyet.genelToplam);
  const ozel = Maliyet.secenekleriHesapla(p, [{ ad: 'X', kullanim: { kapak: 'yok_boyle' }, hirdavat: { ray: 'olmayan' }, karOrani: 50 }], sayac)[0];
  assert.equal(ozel.proje.ayarlar.kullanim.kapak, p.ayarlar.kullanim.kapak); // geçersiz seçim yok sayılır
  assert.equal(ozel.proje.ayarlar.fiyat.karOrani, 50);
});

test('delik planı: sınırlar içinde, yan ile tabla bağlantı delikleri aynı derinlikte', () => {
  for (const id of ['alt', 'alt_cekmece3', 'ust', 'gardirop']) {
    const m = Hesap.yeniModul(id);
    const s = Hesap.modulHesapla(m, ayar);
    const d = Delik.delikPlani(m, s, ayar);
    assert.equal(d.destek, true, id);
    for (const p of d.parcalar) for (const h of p.delikler) {
      assert.ok(h.x >= 0 && h.x <= p.w && h.y >= 0 && h.y <= p.h, `${id} ${p.ad} ${h.ad} (${h.x},${h.y})`);
    }
    if (m.yapi === 'tabla_boydan') continue; // tablalar yanların üstünde; eşleşme uç deliklerle
    const yan = d.parcalar.find((p) => /^Yan/.test(p.ad));
    const tabla = d.parcalar.find((p) => /^Alt tabla/.test(p.ad));
    const yanX = new Set(yan.delikler.filter((h) => /Minifix|Konfirmat|Kavela/.test(h.ad) && h.y < 30).map((h) => h.x));
    const tablaY = tabla.delikler.filter((h) => /Minifix|Konfirmat|Kavela/.test(h.ad) && h.x < 40).map((h) => h.y);
    assert.ok(tablaY.length > 0 && tablaY.every((y) => yanX.has(y)), `${id}: ${[...yanX]} / ${tablaY}`);
  }

});

test('montaj kılavuzu: köşegen, eğimli gövdede iki ayrı köşegen', () => {
  const p = Hesap.yeniProje();
  const m = Hesap.yeniModul('alt');
  p.moduller = [m];
  const metin = JSON.stringify(Montaj.kilavuz(m, Hesap.modulHesapla(m, ayar), p, Hesap.projeHesapla(p)));
  assert.match(metin, new RegExp(`≈ ${Math.round(Math.hypot(600, 770))} mm`));
  assert.doesNotMatch(metin, /undefined|NaN/);
  const e = egimliKiler();
  p.moduller = [e];
  const m2 = JSON.stringify(Montaj.kilavuz(e, Hesap.modulHesapla(e, ayar), p, Hesap.projeHesapla(p)));
  assert.match(m2, new RegExp(`sol alt → sağ üst ≈ ${Math.round(Math.hypot(600, 1200))} mm`));
  assert.doesNotMatch(m2, /undefined|NaN/);
});

test('3B görünüm: tüm katalog ve L proje NaN içermeden çizilir', () => {
  for (const id of Object.keys(Hesap.PRESETLER)) {
    const m = Hesap.yeniModul(id);
    const s = Hesap.modulHesapla(m, ayar);
    if (!s.geo) continue;
    const svg = Uc.ciz(Uc.modulParcalari(s.geo, {}), { yaw: -35, pitch: 22 }, {});
    assert.doesNotMatch(svg, /NaN|undefined/, id);
  }
  const p = Hesap.yeniProje();
  p.yerlesim.tip = 'L';
  p.moduller = [Hesap.yeniModul('lkose'), Hesap.yeniModul('alt'), Object.assign(Hesap.yeniModul('alt'), { duvar: 'B' }), egimliKiler()];
  const r = Hesap.projeHesapla(p);
  const svg = Uc.ciz(Uc.projeParcalari(r.yerlesim, {}), { yaw: -35, pitch: 22 }, {});
  assert.ok(svg.startsWith('<svg'));
  assert.doesNotMatch(svg, /NaN|undefined/);
});

test('kulp sığmazsa önce diğer yön, sonra tek delikli düğme', () => {
  const c = Object.assign(Hesap.kulpBaglami({ kulpYon: 'yatay' }, ayar, 0), {});
  const dar = Hesap.kulpDelikleri(c, 'kapak', 'yana', 150, 700, true, 100);
  assert.equal(dar.yatay, false); // yatay sığmadı, dikeye döndü
  assert.equal(dar.delikler.length, 2);
  const kucuk = Hesap.kulpDelikleri(c, 'cekmece', 'yana', 150, 120, true, 100);
  assert.equal(kucuk.dugme, true);
  assert.equal(kucuk.delikler.length, 1);
  assert.match(kucuk.not, /düğme/);
});

const delikSay = (d, ad) => d.parcalar.reduce((a, p) => a + p.delikler.filter((h) => h.ad === ad).length * p.adet, 0);

test('delik planı her modülde: deliksiz parçalar gerekçeli, bağlantı çiftleri eşit', () => {
  for (const id of Object.keys(Hesap.PRESETLER)) {
    for (const baglanti of ['minifix', 'konfirmat']) {
      const a = JSON.parse(JSON.stringify(ayar));
      a.hirdavat.baglanti = baglanti;
      const m = Hesap.yeniModul(id);
      const s = Hesap.modulHesapla(m, a);
      const d = Delik.delikPlani(m, s, a);
      assert.equal(d.destek, true, id);
      assert.deepEqual(d.deliksiz.filter((x) => x.neden === 'Delik tanımı yok.'), [], id);
      for (const p of d.parcalar) assert.ok(!p.disarida, `${id} ${p.ad}: ${p.disarida} delik parça dışında`);
      // Her minifix: yüzde pim, uçta geçiş, yüzde gövde; her konfirmat: boydan + uçtan kılavuz
      const pim = delikSay(d, 'Minifix pimi Ø5');
      assert.equal(delikSay(d, 'Pim geçişi Ø8 (uçtan)'), pim, `${id} minifix`);
      assert.equal(delikSay(d, 'Minifix gövdesi Ø15'), pim, `${id} minifix gövdesi`);
      assert.equal(delikSay(d, 'Konfirmat Ø7 (boydan, havşalı)'), delikSay(d, 'Konfirmat kılavuz Ø5 (uçtan)'), `${id} konfirmat`);
    }
  }
});

test('delik planı: yan delikleri tablanın uç delikleriyle aynı derinlikte, ön yüz vidaları kutu önüyle aynı yerde', () => {
  const m = Hesap.yeniModul('alt_cekmece3');
  const s = Hesap.modulHesapla(m, ayar);
  const d = Delik.delikPlani(m, s, ayar);
  const yan = d.parcalar.find((p) => p.ad === 'Yan (sol)');
  const tabla = d.parcalar.find((p) => p.ad === 'Alt tabla');
  const yanZ = yan.delikler.filter((h) => h.ad === 'Minifix pimi Ø5' && h.y === 9).map((h) => h.x);
  const tablaZ = tabla.delikler.filter((h) => h.ad === 'Pim geçişi Ø8 (uçtan)' && h.x === 0).map((h) => h.y);
  assert.deepEqual(yanZ, tablaZ);
  // Çekmece önü pilotları ile kutu önü delikleri: aynı sayıda ve kutu önü genişliği içinde
  const on = d.parcalar.find((p) => p.ad.startsWith('Çekmece önü'));
  const kutuOn = d.parcalar.find((p) => p.ad === `Çekmece kutu önü (${on.ad.match(/\((satır \d+)\)/)[1]})`);
  const pilot = on.delikler.filter((h) => h.ad.startsWith('Ön bağlantı'));
  const vida = kutuOn.delikler.filter((h) => h.ad.startsWith('Ön bağlantı'));
  assert.equal(pilot.length, vida.length);
  const dx = pilot[0].x - vida[0].x;
  const dy = pilot[0].y - vida[0].y;
  for (let i = 0; i < pilot.length; i++) {
    assert.ok(Math.abs(pilot[i].x - vida[i].x - dx) < 0.2 && Math.abs(pilot[i].y - vida[i].y - dy) < 0.2);
  }
  assert.ok(Math.abs(dx - (on.w - kutuOn.w) / 2) < 0.2); // kutu öne ortalı
});

test('delik planı: L köşe, iç çekmece, paneller ve çekmece kutusu', () => {
  const lk = Hesap.yeniModul('lkose');
  const dl = Delik.delikPlani(lk, Hesap.modulHesapla(lk, ayar), ayar);
  const yanA = dl.parcalar.find((p) => p.ad === 'Yan (kol ucu) – A kolu');
  const yanB = dl.parcalar.find((p) => p.ad === 'Yan (kol ucu) – B kolu');
  assert.equal(yanA.delikler.filter((h) => h.tur === 'plaka').length, 0);
  assert.equal(yanB.delikler.filter((h) => h.tur === 'plaka').length, 4);
  const altA = dl.parcalar.find((p) => p.ad === 'Alt tabla – A kolu');
  const altB = dl.parcalar.find((p) => p.ad === 'Alt tabla – B kolu');
  assert.equal(altA.delikler.filter((h) => h.yuz === 'ön kenar uç').length, altB.delikler.filter((h) => h.yuz === 'köşe uç').length);
  assert.ok(dl.parcalar.find((p) => p.ad === 'Köşe kapağı – A kolu').delikler.some((h) => h.tur === 'kulp'));

  const ic = Hesap.yeniModul('alt_ic');
  const di = Delik.delikPlani(ic, Hesap.modulHesapla(ic, ayar), ayar);
  const dolgu = di.parcalar.find((p) => p.ad.startsWith('İç çekmece dolgu paneli'));
  assert.equal(dolgu.adet, 2);
  assert.ok(dolgu.kanallar.some((k) => /oyma/.test(k.ad)), 'menteşe plakası dolguya denk geliyorsa oyma');
  assert.equal(dolgu.delikler.filter((h) => h.tur === 'ray').length, 4);

  const panel = (id) => { const m = Hesap.yeniModul(id); return Delik.delikPlani(m, Hesap.modulHesapla(m, ayar), ayar).parcalar[0]; };
  assert.equal(panel('yan_kapama').delikler.length, 8);
  assert.equal(panel('duvar_rafi').delikler.length, 2);
  assert.ok(panel('bulasik_panel').delikler.some((h) => h.tur === 'kulp'));

  const ck = Hesap.yeniModul('alt_cekmece3');
  const dc = Delik.delikPlani(ck, Hesap.modulHesapla(ck, ayar), ayar);
  const yanlar = dc.parcalar.filter((p) => p.ad.startsWith('Çekmece yanı'));
  assert.ok(yanlar.length >= 1);
  for (const y of yanlar) assert.equal(y.delikler.filter((h) => h.ad.startsWith('Konfirmat')).length, 4);
});

test('eğimli gövde delik planı: tüm uçlar bağlanır, yamuk parçalar kontur taşır', () => {
  for (const yapi of ['yanlar_boydan', 'tabla_boydan']) {
    const m = egimliKiler('cakma');
    m.yapi = yapi;
    const s = Hesap.modulHesapla(m, ayar);
    const d = Delik.delikPlani(m, s, ayar);
    for (const p of d.parcalar) assert.ok(!p.notlar.some((n) => /dikey parça yok|panel yok/.test(n)), `${yapi} ${p.ad}: ${p.notlar}`);
    assert.ok(d.parcalar.find((p) => p.ad === 'Arkalık (çakma) – yamuk').kontur);
    assert.ok(d.parcalar.some((p) => /eğimli/.test(p.ad) && p.kontur));
  }
});

// ---- Hata analizi turu: motor, yerleşim ve 3B regresyonları ----
const UK = require('../tools/uc-kontrol.js');

test('hırdavat seçiminde "constructor" gibi miras adlar varsayılana döner', () => {
  const p = Hesap.projeyiNormallestir({ ayarlar: { hirdavat: { ray: 'constructor', ayak: 'toString' } }, moduller: [Hesap.yeniModul('alt')] });
  assert.equal(p.ayarlar.hirdavat.ray, Hesap.varsayilanAyarlar().hirdavat.ray);
  const r = Hesap.projeHesapla(p);
  assert.ok(!r.hirdavat.some((h) => /undefined/.test(h.ad)));
  assert.ok(!r.uyarilar.some((u) => /NaN/.test(u)));
});

test('şekilli kenar ücreti: eğimli kenar faturalanır, pah iki kez sayılmaz', () => {
  const tabla = (sekil, param, kose) => {
    const m = Object.assign(Hesap.yeniModul('tabla'), { boy: 1000, en: 600, sekil, sekilParam: param, koseSayisi: kose || 0 });
    const p = Hesap.yeniProje();
    p.moduller = [m];
    return Hesap.projeHesapla(Hesap.projeyiNormallestir(p)).kesimListesi.reduce((a, x) => a + (x.sekil ? x.sekil.cnc * x.adet : 0), 0) / 1000;
  };
  assert.ok(Math.abs(tabla('egimli', 300) - Math.hypot(600, 700) / 1000) < 0.01);
  assert.ok(Math.abs(tabla('pah', 50, 4) - (4 * 50 * Math.SQRT2) / 1000) < 0.01);
});

test('eğimli kapak menteşe adedi her kapağın menteşe kenarına göre', () => {
  const m = Hesap.projeyiNormallestir({ moduller: [{ tip: 'normal', genislik: 1000, yukseklik: 1000, sagYukseklik: 2200, derinlik: 400, egimli: true, sutunlar: [{ satirlar: [{ tip: 'kapak', adet: 2 }] }] }] }).moduller[0];
  const s = Hesap.modulHesapla(m, ayar);
  const mentese = s.hirdavat.filter((h) => h.kod.startsWith('mentese_')).reduce((a, h) => a + h.adet, 0);
  const notlar = s.parcalar.filter((p) => /^Kapak .*eğimli/.test(p.ad)).map((p) => (p.not.match(/üstten ([\d,\/ ]+) mm/) || [, ''])[1].split('/').length);
  assert.equal(mentese, notlar.reduce((a, b) => a + b, 0));
});

test('baza çekmecesi: panel bazada yan yerine taşıyıcı, ayaklı bazada yalnız arka ayaklar', () => {
  const panel = Object.assign(Hesap.yeniModul('alt_baza'), { baza: { tip: 'panel', yukseklik: 120, geriCekme: 40 } });
  const sp = Hesap.modulHesapla(panel, ayar);
  assert.ok(!sp.parcalar.some((p) => p.ad === 'Baza yanı'));
  assert.ok(sp.parcalar.some((p) => p.ad === 'Baza çekmecesi taşıyıcı'));
  const sa = Hesap.modulHesapla(Hesap.yeniModul('alt_baza'), ayar);
  assert.equal(sa.hirdavat.find((h) => h.kod.startsWith('ayak_')).adet, 2);
  for (const s of [sp, sa]) for (const k of [false, true]) assert.deepEqual(UK.modulCakismalari(s.geo, { kapaksiz: k }).map((c) => `${c.a.tur}/${c.b.tur}`), []);
});

test('L köşe: baza önü B kolu köşeyi kapatır; düz yerleşimde adet kadar dizilir', () => {
  const lk = Object.assign(Hesap.yeniModul('lkose'), { baza: { tip: 'panel', yukseklik: 100, geriCekme: 40 } });
  const s = Hesap.modulHesapla(lk, ayar);
  const on = 560 - 40;
  assert.equal(s.parcalar.find((p) => p.ad === 'Baza önü – B kolu').boy, 900 - on + 18);
  assert.deepEqual(UK.modulCakismalari(s.geo, {}), []);
  const p = Hesap.yeniProje();
  p.moduller = [Object.assign(Hesap.yeniModul('lkoseust'), { adet: 2 })];
  const r = Hesap.projeHesapla(Hesap.projeyiNormallestir(p));
  assert.equal(r.yerlesim.yerler.length, 2);
  assert.equal(r.montajHirdavat.find((h) => h.kod === 'aski_aparati').adet, 8);
});

test('kulp "el hizası" montaj yüksekliğini hesaba katar', () => {
  const kulpY = (montaj) => {
    const m = Object.assign(Hesap.yeniModul('banyo_boy'), { montajYuksekligi: montaj });
    const s = Hesap.modulHesapla(m, ayar);
    const o = s.geo.satirlar.flatMap((x) => x.onler).find((x) => x.kulp && !x.kulp.yatay);
    return o.kulp.delikler[0].y;
  };
  assert.notEqual(kulpY(0), kulpY(400));
});

test('sığ dolapta kuşak yerine tam üst tabla; şekilli panelin yerleşim ölçüsü gerçek ölçü', () => {
  const m = Object.assign(Hesap.yeniModul('aynali'), { ust: 'kusak' });
  const s = Hesap.modulHesapla(m, ayar);
  assert.equal(s.geo.ust, 'tam');
  assert.ok(s.uyarilar.some((u) => /kuşak/.test(u)));
  const d = Hesap.modulHesapla(Object.assign(Hesap.yeniModul('tabla'), { boy: 1200, en: 600, sekil: 'daire' }), ayar);
  assert.equal(d.geo.W, 600);
});

test('3B: katalogda ve çeşitlemelerinde parçalar iç içe geçmez', () => {
  const cesit = [null, (m) => { m.egimli = true; m.sagYukseklik = Math.max(600, m.yukseklik - 500); }, (m) => { m.yapi = 'tabla_boydan'; }, (m) => { m.kapakTipi = 'ic'; }, (m) => { m.arkalik = 'cakma'; }, (m) => { m.baza = { tip: 'panel', yukseklik: 100, geriCekme: 50 }; }];
  for (const id of Object.keys(Hesap.PRESETLER)) {
    for (const f of cesit) {
      const m = Hesap.yeniModul(id);
      if (f && m.tip === 'panel') continue;
      if (f) f(m);
      const s = Hesap.modulHesapla(m, ayar);
      if (!s.geo) continue;
      for (const kapaksiz of [false, true]) {
        const c = UK.modulCakismalari(s.geo, { kapaksiz });
        assert.equal(c.length, 0, `${id}: ${c.map((x) => `${x.a.tur}∩${x.b.tur}`).join(', ')}`);
      }
    }
  }
});

test('yerleşim: asma dolap boy dolabın üstüne, boy dolap köşe üst dolabının altına gelmez', () => {
  const p = Hesap.yeniProje();
  p.yerlesim.tip = 'L';
  p.moduller = [Hesap.yeniModul('lkoseust'), Hesap.yeniModul('boy_firin'), Hesap.yeniModul('ust'), Hesap.yeniModul('alt'), Object.assign(Hesap.yeniModul('boy_kiler'), { duvar: 'B' }), Object.assign(Hesap.yeniModul('ust'), { duvar: 'B' }), Object.assign(Hesap.yeniModul('tabla'), { duvar: 'B', montajYuksekligi: 730 })];
  const r = Hesap.projeHesapla(Hesap.projeyiNormallestir(p));
  assert.deepEqual(UK.projeCakismalari(r.yerlesim, { kapaksiz: true }).map((c) => `${c.a.modul}∩${c.b.modul}`), []);
  const boy = r.yerlesim.yerler.find((y) => y.modul.ad.startsWith('Boy Dolap'));
  assert.ok(boy.bas >= 600, 'boy dolap köşe üst dolabından sonra başlar');
  // Boy dolap ile yanındaki asma dolap birleştirilir
  assert.ok(r.birlesimSayisi >= 1);
});

// ---- Ölçüden tasarım, duvarda konum, boşluk modülü ----
const Tasarim = require('../js/tasarim.js');

test('ölçüden tasarım: her tür, rastgele ölçülerde uyarısız, çakışmasız ve duvarı dolduran öneri üretir', () => {
  let tohum = 11;
  const rnd = () => ((tohum = (tohum * 1103515245 + 12345) % 2147483648) / 2147483648);
  for (const tur of Object.keys(Tasarim.TURLER)) {
    for (let i = 0; i < 12; i++) {
      const o = {};
      for (const a of Tasarim.TURLER[tur].alanlar) o[a.ad] = Math.round(a.min + rnd() * (a.max - a.min));
      if (tur === 'mutfak' && i % 2) o.duvarB = 0;
      const r = Tasarim.uret(tur, o, ayar, i * 101 + 1);
      assert.ok(r, `${tur} ${JSON.stringify(o)}: öneri yok`);
      for (const m of r.proje.moduller) assert.deepEqual(r.sonuc.modulSonuclari[m.id].uyarilar, [], `${tur}: ${m.ad}`);
      assert.deepEqual(UK.projeCakismalari(r.sonuc.yerlesim, { kapaksiz: true }).map((c) => `${c.a.modul}∩${c.b.modul}`), [], tur);
      const W = o.duvarA || o.genislik;
      const zemin = r.sonuc.yerlesim.yerler.filter((y) => y.sira === 'zemin' && y.duvar !== 'B');
      const son = Math.max(...zemin.map((y) => y.bas + y.W));
      assert.ok(son <= W + 0.5, `${tur}: ${son} > ${W}`);
      if (tur !== 'banyo') assert.ok(W - son <= 5, `${tur}: duvar dolmadı ${son}/${W}`);
    }
  }
});

test('ölçüden tasarım: aynı tohum aynı tasarım, farklı öneriler birbirinden farklı', () => {
  const o = { genislik: 2400, yukseklik: 2600, derinlik: 600 };
  const a = Tasarim.uret('gardirop', o, ayar, 42);
  const b = Tasarim.uret('gardirop', o, ayar, 42);
  const iz = (t) => JSON.stringify(t.moduller.map((m) => [m.genislik, m.onTipi, m.sutunlar]));
  assert.equal(iz(a), iz(b));
  const L = Tasarim.oneriler('mutfak', { duvarA: 3600, duvarB: 0, tavan: 2600 }, ayar, 3, 7);
  assert.equal(L.length, 3);
  assert.equal(new Set(L.map(iz)).size, 3);
  // Sınır dışı ölçü düzeltilir
  assert.equal(Tasarim.sinirla('gardirop', { genislik: 99999, yukseklik: 'x' }).genislik, 6000);
});

test('ölçüden tasarım: stil paleti modüllere uygulanır, eksik malzemeler eklenir', () => {
  // Yeni renkleri içermeyen eski proje ayarı
  const eski = Hesap.varsayilanAyarlar();
  eski.malzemeler = eski.malzemeler.filter((m) => !['sl18a', 'sl18m', 'sl18k', 'lake18y', 'lake18l'].includes(m.id));
  for (const stil of Object.keys(Tasarim.STILLER)) {
    const r = Tasarim.uret('mutfak', { duvarA: 3600, duvarB: 2400, tavan: 2600 }, eski, 5, { stil });
    assert.ok(r, stil);
    assert.equal(r.stil, stil);
    const govdeli = r.proje.moduller.filter((m) => m.tip !== 'panel');
    assert.ok(govdeli.every((m) => m.malzeme.govde === r.palet.govde), `${stil}: gövde`);
    // Gola profil yalnız yerdeki dolaplarda
    assert.ok(govdeli.every((m) => m.hirdavat.kulp !== 'gola' || !(m.montajYuksekligi > 0)), `${stil}: gola`);
    const idler = new Set(eski.malzemeler.map((m) => m.id).concat(r.ekMalzemeler.map((m) => m.id)));
    for (const m of r.proje.moduller) for (const v of Object.values(m.malzeme)) assert.ok(idler.has(v), `${stil}: ${v} eksik`);
  }
  // 'proje': malzeme ve kulp değişmez
  const p = Tasarim.uret('gardirop', { genislik: 2400, yukseklik: 2600, derinlik: 600 }, ayar, 3, { stil: 'proje' });
  assert.ok(p.proje.moduller.every((m) => !Object.keys(m.malzeme).length && !m.hirdavat.kulp));
  assert.deepEqual(p.ekMalzemeler, []);
});

test('ölçüden tasarım: yatak odası duvarı ve kademeli raflar', () => {
  for (let i = 0; i < 10; i++) {
    const r = Tasarim.uret('yatak', { genislik: 2400 + i * 450, yatak: 1600, tavan: 2600 }, ayar, i + 1);
    assert.ok(r, `yatak ${i}`);
    const bos = r.proje.moduller.find((m) => m.ad === 'Yatak boşluğu');
    assert.ok(bos && bos.en >= 1640, 'yatak boşluğu');
  }
  // Çok sayıda gardırop/kitaplık önerisinde kademeli (elle yükseklikli) raf çıkar
  let kademe = 0;
  for (let i = 0; i < 20; i++) {
    const r = Tasarim.uret('kitaplik', { genislik: 2400, yukseklik: 2200, derinlik: 330 }, ayar, i * 13 + 1);
    kademe += r.proje.moduller.some((m) => m.sutunlar.some((c) => c.satirlar.some((s) => s.rafYukseklikleri.length)));
  }
  assert.ok(kademe >= 5, `kademeli raf ${kademe}`);
});

test('duvarda konum: sabit konumlu modül oraya yerleşir, sıra geri gitmez', () => {
  const p = Hesap.yeniProje();
  p.moduller = [Object.assign(Hesap.yeniModul('alt'), { genislik: 600 }), Object.assign(Hesap.yeniModul('ust'), { konum: 1000 }), Hesap.yeniModul('ust'), Object.assign(Hesap.yeniModul('alt'), { konum: 300 })];
  const r = Hesap.projeHesapla(Hesap.projeyiNormallestir(p));
  const ust = r.yerlesim.yerler.filter((y) => y.sira === 'duvar').map((y) => y.bas);
  const alt = r.yerlesim.yerler.filter((y) => y.sira === 'zemin').map((y) => y.bas);
  assert.deepEqual(ust, [1000, 1600]); // sabit, sonra sabitten devam
  assert.deepEqual(alt, [0, 600]); // 300 dolu: çakışmayan ilk yere kayar
});

test('boşluk modülü: parça ve maliyet yok, duvarda yer tutar', () => {
  const p = Hesap.yeniProje();
  p.moduller = [Hesap.yeniModul('alt'), Object.assign(Hesap.yeniModul('bosluk'), { en: 650 }), Hesap.yeniModul('alt')];
  const n = Hesap.projeyiNormallestir(p);
  const r = Hesap.projeHesapla(n);
  assert.equal(r.yerlesim.yerler[2].bas, 1250);
  assert.ok(!r.kesimListesi.some((x) => x.moduller.some((ad) => /Boşluk/.test(ad))));
  const mly = Maliyet.maliyetHesapla(n, r, {});
  assert.ok(!mly.teklifSatirlari.some((x) => /Boşluk/.test(x.ad)));
});

// ---- Hata analizi (3): çizim sırası, ön panel derinliği, baza taşıyıcı, eğimli arkalık ----
const ressamHatalari = require('../tools/ressam-kontrol.js');
const Delik2 = require('../js/delik.js');

test('3B çizim sırası: öndeki parça arkadakinin altında kalmaz (ışın izleme)', () => {
  const sahneler = [];
  const t = Tasarim.uret('mutfak', { duvarA: 4200, duvarB: 3000, tavan: 2600 }, ayar, 2);
  sahneler.push(Uc.projeParcalari(t.sonuc.yerlesim, {}));
  for (const id of ['alt', 'ada', 'bufe', 'gardirop3', 'kahve']) sahneler.push(Uc.modulParcalari(Hesap.modulHesapla(Hesap.yeniModul(id), ayar).geo, {}));
  for (const P of sahneler) {
    for (const g of [{ yaw: -35, pitch: 22 }, { yaw: -60, pitch: 45 }, { yaw: 30, pitch: 15 }, { yaw: 150, pitch: 20 }]) {
      const h = ressamHatalari(P, g, 12);
      assert.equal(h.reduce((a, x) => a + x.n, 0), 0, `${JSON.stringify(g)}: ${h[0] && `${h[0].ust.tur} üstte, ${h[0].gercek.tur} önde`}`);
    }
  }
});

test('ön panel derinliği kendi sırasındaki gövdelerden; köşe boşluğu mesajı doğru', () => {
  const p = Hesap.yeniProje();
  p.yerlesim.tip = 'L';
  p.moduller = [Hesap.yeniModul('alt'), Object.assign(Hesap.yeniModul('alt'), { duvar: 'B' }), Hesap.yeniModul('dolgu'), Hesap.yeniModul('ust'), Object.assign(Hesap.yeniModul('ust'), { duvar: 'B' })];
  const r = Hesap.projeHesapla(Hesap.projeyiNormallestir(p));
  const ustB = r.yerlesim.yerler.find((y) => y.sira === 'duvar' && y.duvar === 'B');
  assert.ok(ustB.bas < 400, `üst B ${ustB.bas}`);
});

test('baza çekmecesi taşıyıcıları zemine basar; eğimli çakma arkalık delik planı kesim listesiyle aynı', () => {
  const s = Hesap.modulHesapla(Hesap.yeniModul('alt_baza'), ayar);
  assert.equal(s.parcalar.find((p) => p.ad === 'Baza çekmecesi taşıyıcı').en, 120);
  const m = Object.assign(Hesap.yeniModul('kitaplik'), { egimli: true, sagYukseklik: 1400 });
  const sk = Hesap.modulHesapla(m, ayar);
  const kesim = sk.parcalar.find((p) => p.ad === 'Arkalık (çakma) – yamuk');
  const plan = Delik2.delikPlani(m, sk, ayar).parcalar.find((p) => p.ad === 'Arkalık (çakma) – yamuk');
  assert.ok(Math.abs(Math.max(plan.w, plan.h) - Math.max(kesim.boy, kesim.en)) < 0.2);
  assert.ok(Math.abs(Math.min(plan.w, plan.h) - Math.min(kesim.boy, kesim.en)) < 0.2);
});

test('raf yükseklikleri elle girilir: iç tabandan rafın üst yüzüne; sığmayan atlanır; askı ve raf derinliği ayarlanır', () => {
  const m = Hesap.yeniModul('kitaplik');
  m.sutunlar[0].satirlar[0].rafYukseklikleri = '350, 700; 1100 99999';
  m.sutunlar[0].satirlar[0].rafGeri = 50;
  const n = Hesap.projeyiNormallestir({ moduller: [m] }).moduller[0];
  assert.deepEqual(n.sutunlar[0].satirlar[0].rafYukseklikleri, [350, 700, 1100, 99999].filter((x) => x <= 5000));
  const s = Hesap.modulHesapla(n, ayar);
  const sat = s.geo.satirlar[0];
  assert.deepEqual(sat.raflar.map((y) => Math.round(y + 9 - sat.icAlt)), [350, 700, 1100]);
  const raf = s.parcalar.find((p) => p.ad === 'Raf (satır 1)');
  assert.equal(raf.adet, 3 * 2); // 2 bölüm (ara dikme)
  assert.equal(raf.en, s.geo.icDerinlik - 50);
  const fazla = Hesap.projeyiNormallestir({ moduller: [Object.assign(Hesap.yeniModul('kitaplik'), { sutunlar: [{ satirlar: [{ tip: 'acik', rafYukseklikleri: [300, 5000] }] }] })] }).moduller[0];
  assert.ok(Hesap.modulHesapla(fazla, ayar).uyarilar.some((u) => /sığmıyor/.test(u)));
  const g = Hesap.yeniModul('gardirop');
  g.sutunlar[0].satirlar[1].askiUstten = 120;
  const sg = Hesap.modulHesapla(Hesap.projeyiNormallestir({ moduller: [g] }).moduller[0], ayar);
  assert.equal(sg.geo.satirlar[1].askiUstten, 120);
});

// ---- Yapı seçenekleri: tabansız niş, yanlar bazaya iner, üst tabla taşması, gömme bölücüler, ayak + ön baza ----
test('buzdolabı kabini tabansız: alt tabla yok, yanlar zemine iner, alt satır zemine açılır', () => {
  const r = Hesap.modulHesapla(Hesap.yeniModul('buzdolabi_kabin'), ayar);
  assert.deepEqual(r.uyarilar, []);
  assert.ok(!r.parcalar.some((p) => p.ad === 'Alt tabla'));
  const yan = r.parcalar.find((p) => p.ad === 'Yan');
  assert.equal(yan.boy, 2150); // yanlar boydan, baza yok
  const alt = r.geo.satirlar[r.geo.satirlar.length - 1];
  assert.equal(alt.icAlt, 0);
  assert.equal(r.geo.baza.tip, 'yok');
});

test('yanlar bazaya iner: baza yanı yok, baza önü/arkası yanların arasında, yan baza kadar uzun', () => {
  const m = Object.assign(Hesap.yeniModul('gardirop'), { yanlarYere: true });
  const n = Hesap.projeyiNormallestir({ moduller: [m] }).moduller[0];
  const r = Hesap.modulHesapla(n, ayar);
  const t = 18;
  assert.deepEqual(r.uyarilar, []);
  assert.ok(!r.parcalar.some((p) => p.ad === 'Baza yanı'));
  assert.equal(r.parcalar.find((p) => p.ad === 'Baza önü').boy, n.genislik - 2 * t);
  assert.equal(r.parcalar.find((p) => p.ad === 'Alt tabla').boy, n.genislik - 2 * t);
  assert.equal(r.parcalar.find((p) => p.ad === 'Yan').boy, n.yukseklik - t); // zeminden üst tablanın altına
  assert.deepEqual(UK.modulCakismalari(r.geo, {}), []);
});

test('üst tabla taşması: yanlardan 18 mm, kapak üstünü kapatır; kapaklar tablanın altında', () => {
  const m = Object.assign(Hesap.yeniModul('komodin'), { ustTasmaYan: 18, ustKapakUstu: true });
  const n = Hesap.projeyiNormallestir({ moduller: [m] }).moduller[0];
  const r = Hesap.modulHesapla(n, ayar);
  assert.deepEqual(r.uyarilar, []);
  const ust = r.parcalar.find((p) => p.ad === 'Üst tabla');
  assert.equal(ust.boy, n.genislik + 36);
  assert.equal(ust.en, n.derinlik + 18); // kapak kalınlığı kadar önde
  const enUst = Math.max(...r.geo.satirlar.map((s) => s.on.y2));
  assert.ok(enUst <= r.geo.Hc - 18);
  assert.deepEqual(UK.modulCakismalari(r.geo, {}), []);
});

test('gömme kapak: bölme dikmesi ve ara tabla öne kadar gelir; istenirse ön kayıt', () => {
  const m = Object.assign(Hesap.yeniModul('gardirop4'), { kapakTipi: 'ic' });
  const n = Hesap.projeyiNormallestir({ moduller: [m] }).moduller[0];
  const tam = Hesap.modulHesapla(n, ayar);
  const ara = tam.parcalar.find((p) => p.ad.startsWith('Ara tabla'));
  assert.equal(ara.en, tam.geo.icDerinlik + 18);
  const A2 = Object.assign({}, ayar, { gommeAraTabla: 'kayit', gommeKayitEn: 110 });
  const k = Hesap.modulHesapla(n, A2);
  assert.equal(k.parcalar.find((p) => p.ad.startsWith('Ara tabla')).en, 110);
});

test('ayak + önde baza, satır altında ara tabla yok, ray boşluğu ve arkalık listesi ayarı', () => {
  const r = Hesap.modulHesapla(Hesap.yeniModul('alt'), ayar);
  assert.ok(r.parcalar.some((p) => p.ad === 'Baza önü (klipsli)'));
  assert.ok(r.hirdavat.some((h) => h.kod === 'baza_klips'));
  const m = Hesap.yeniModul('alt');
  m.sutunlar[0].satirlar[0].altTablaYok = true;
  const n = Hesap.projeyiNormallestir({ moduller: [m] }).moduller[0];
  assert.ok(!Hesap.modulHesapla(n, ayar).parcalar.some((p) => p.ad.startsWith('Ara tabla')));
  const yan = (A) => Hesap.modulHesapla(Hesap.yeniModul('alt_cekmece3'), A).parcalar.find((p) => p.ad.startsWith('Çekmece ön/arka')).boy;
  assert.equal(yan(ayar) - yan(Object.assign({}, ayar, { cekmeceRayBosluk: 15 })), 4);
  const p = Hesap.projeyiNormallestir({ ayarlar: Object.assign({}, ayar, { arkalikListede: false }), moduller: [Hesap.yeniModul('alt')] });
  assert.ok(!Hesap.projeHesapla(p).kesimListesi.some((x) => /^Arkalık/.test(x.ad)));
  // Baza parçalarında zemine değen kenar bantlı
  const g = Hesap.modulHesapla(Hesap.yeniModul('gardirop'), ayar);
  assert.equal(g.parcalar.find((x) => x.ad === 'Baza yanı').bant.u, 1);
});

test('maliyet: işçilik m² esaslı (ön yüz alanı), kapatılan alan raporlanır', () => {
  const g = Hesap.yeniModul('gardirop'); // 1000 × 2400
  const pn = Object.assign(Hesap.yeniModul('duvar_paneli'), { en: 1000, boy: 1000 });
  const p = Hesap.projeyiNormallestir(proje([g, pn, Hesap.yeniModul('bosluk')]));
  const { r } = maliyetKur(p);
  assert.equal(r.alanM2.dolap, 2.4);
  assert.equal(r.alanM2.panel, 1);
  assert.equal(r.alanM2.toplam, 3.4);
  const atolye = r.kalemler.iscilik.find((k) => k.ad === 'Atölye işçiliği');
  assert.equal(atolye.birim, 'm²');
  assert.equal(atolye.tutar, 2.4 * 1200);
  assert.ok(Math.abs(r.dagitimFarki) < 0.05);
});

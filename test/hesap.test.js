const test = require('node:test');
const assert = require('node:assert/strict');
const Hesap = require('../js/hesap.js');
const Yerlesim = require('../js/yerlesim.js');

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
  const ray = s.hirdavat.find((h) => h.ad.startsWith('Teleskopik'));
  assert.match(ray.ad, /500 mm/);
  const yan = bul(s, 'Çekmece yanı');
  assert.equal(yan.boy, 500); assert.equal(yan.en, 110); // 150 - 40
  // Kutu genişliği 564 - 26 = 538; ön/arka 538 - 2*16
  assert.equal(bul(s, 'Çekmece ön/arka').boy, 506);
  assert.equal(bul(s, 'Çekmece tabanı').en, 538);
  assert.equal(s.hirdavat.find((h) => h.ad.startsWith('Ayarlı ayak')).adet, 4);
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
  const p = { malzeme: 'kapak', boy: 700, en: 400, bant: { u: 2, k: 2 } };
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
    const beklenen = s.kesimListesi.filter((p) => ayar.malzemeler[p.malzeme].ad === g.malzemeAd).reduce((a, p) => a + p.adet, 0);
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

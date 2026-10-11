// Çalıştırma: node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cevrimSuresiDk, teorikMaxSefer, nakliyeSimulasyonu, fiyatAt, yakitAnalizi,
  hakedisHesapla, verimHesapla, sonrakiTekrar, gunFarki, dakikaFarki,
} from '../app/js/calc.js';

test('çevrim süresi: 24 km gidiş-dönüş, 30 km/sa, 8+4+5 dk', () => {
  assert.equal(cevrimSuresiDk({ mesafe_km: 24, hiz_kmsa: 30, yukleme_dk: 8, bosaltma_dk: 4, manevra_dk: 5 }), 48 + 17);
});

test('boş alanlarda varsayılan çevrim parametreleri kullanılır, 0 korunur', () => {
  assert.equal(cevrimSuresiDk({ mesafe_km: 30, hiz_kmsa: '', yukleme_dk: '', bosaltma_dk: 0, manevra_dk: 0 }), 60 + 8);
});

test('teorik azami sefer', () => {
  assert.equal(teorikMaxSefer(9, 65), 8);   // 540 / 65 = 8,3
  assert.equal(teorikMaxSefer(8, 0), Infinity);
});

test('nakliye simülasyonu', () => {
  const s = nakliyeSimulasyonu(
    { toplam_miktar: 6000, birim: 'm3', mesafe_km: 24, kapasite_m3: 12, hiz_kmsa: 30, yukleme_dk: 8, bosaltma_dk: 4, manevra_dk: 5,
      vardiya_saat: 9, kamyon_sayisi: 2, hedef_gun: 30, yakit_lt_km: 0.4 },
    { motorin: 50, amortismanSaat: 300, soforGunluk: 2000 });
  assert.equal(s.toplamSefer, 500);
  assert.equal(s.kamyonGunlukSefer, 8);
  assert.equal(s.gunlukSefer, 16);
  assert.equal(s.tamamlanmaGun, 32);                 // 500 / 16 = 31,25
  assert.equal(s.gerekliKamyon, 3);                  // 500 / (8*30) = 2,08
  assert.equal(s.yakitLt, 500 * 24 * 0.4);
  assert.equal(s.yakitTL, 4800 * 50);
  assert.ok(Math.abs(s.amortismanTL - 500 * 65 / 60 * 300) < 1e-6);
  assert.equal(s.personelTL, 2 * 32 * 2000);
  assert.ok(Math.abs(s.toplamTL - (s.yakitTL + s.amortismanTL + s.personelTL)) < 1e-6);
});

test('tonaj yoğunlukla m³e çevrilir; hatalı girdi hata döndürür', () => {
  assert.equal(nakliyeSimulasyonu({ toplam_miktar: 180, birim: 'ton', yogunluk: 1.8, kapasite_m3: 10, mesafe_km: 10 }).toplamSefer, 10);
  assert.ok(nakliyeSimulasyonu({ toplam_miktar: 100, mesafe_km: 10 }).hata);
  assert.ok(nakliyeSimulasyonu({ toplam_miktar: 100, kapasite_m3: 10, mesafe_km: 1000, vardiya_saat: 8 }).hata);
});

test('birim fiyat tarihsel versiyonlama', () => {
  const f = [
    { kod: 'MOTORIN', fiyat: 40, gecerlilik: '2026-01-01' },
    { kod: 'MOTORIN', fiyat: 45, gecerlilik: '2026-06-01' },
    { kod: 'motorin ', fiyat: 50, gecerlilik: '2026-09-01' },
    { kod: 'CIMENTO_TON', fiyat: 3000, gecerlilik: '2026-01-01' },
  ];
  assert.equal(fiyatAt(f, 'MOTORIN', '2025-12-31'), null);
  assert.equal(fiyatAt(f, 'MOTORIN', '2026-03-15'), 40);
  assert.equal(fiyatAt(f, 'MOTORIN', '2026-06-01'), 45);
  assert.equal(fiyatAt(f, 'MOTORIN', '2026-10-01'), 50);
  assert.equal(fiyatAt(f, 'YOK', '2026-10-01'), null);
});

test('yakıt analizi: saatlik ve kilometrik, norm dışı uyarısı', () => {
  assert.deepEqual(yakitAnalizi(160, 10, 'Saat', 15, 0.15), { tuketim: 16, sapma: 1 / 15, normDisi: false });
  const km = yakitAnalizi(200, 400, 'Km', 38, 0.15);
  assert.equal(km.tuketim, 50);
  assert.equal(km.normDisi, true);
  assert.equal(yakitAnalizi(100, 0, 'Saat', 15), null);
});

test('hakediş: KDV, tevkifat, damga, stopaj, avans', () => {
  const h = hakedisHesapla({ miktar: 1000, birim_fiyat: 100, kdv_orani: 20, tevkifat_pay: 4, damga_binde: 9.48, stopaj_orani: 3, avans_mahsup: 5000 });
  assert.equal(h.brut, 100000);
  assert.equal(h.kdv, 20000);
  assert.equal(h.tevkifat, 8000);
  assert.ok(Math.abs(h.damga - 948) < 1e-9);
  assert.equal(h.stopaj, 3000);
  assert.ok(Math.abs(h.net - (120000 - 8000 - 948 - 3000 - 5000)) < 1e-9);
});

test('hakediş: elle brüt, birim fiyat koddan', () => {
  assert.equal(hakedisHesapla({ brut_manuel: 5000, miktar: 1, birim_fiyat: 1 }).brut, 5000);
  assert.equal(hakedisHesapla({ miktar: 10, birim_fiyat: '' }, 250).brut, 2500);
  assert.equal(hakedisHesapla({ miktar: 10, kdv_orani: 0, damga_binde: 0 }, 100).net, 1000);
});

test('verim', () => {
  const v = verimHesapla(1000, 300, '2026-01-01', '2026-01-11', '2026-01-06');
  assert.equal(v.gercekOran, 0.3);
  assert.equal(v.beklenenOran, 0.5);
  assert.ok(Math.abs(v.verim - 0.6) < 1e-9);
});

test('tarih yardımcıları', () => {
  assert.equal(gunFarki('2026-02-27', '2026-03-02'), 3);
  assert.equal(dakikaFarki('2026-01-01T10:00', '2026-01-01T11:30'), 90);
  assert.equal(sonrakiTekrar('2026-01-31T09:00', 'Her hafta'), '2026-02-07T09:00');
  assert.equal(sonrakiTekrar('2026-12-31T09:00', 'Her gün'), '2027-01-01T09:00');
  assert.equal(sonrakiTekrar('2026-01-01T09:00', 'Yok'), null);
});

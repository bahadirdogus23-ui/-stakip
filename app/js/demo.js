// Denemek için örnek veriler (sabit kimlikli; tekrar yüklenince çoğalmaz).
import * as db from './db.js';
import { today, addDays, nowLocal } from './util.js';

export async function ornekVeriYukle() {
  const t = today();
  await db.putMany('santiye', [
    { id: 'demo-s1', proje_kodu: 'ARP-2026-01', ad: 'Sinikli - Kılıçlı Grup Yolu', ilce: 'Arapgir', mahalle: 'Sinikli', is_tipi: 'Stabilizasyon Kaplama', planlanan_kubaj: 6000, baslama: addDays(t, -20), bitis: addDays(t, 25), durum: 'Devam Ediyor' },
    { id: 'demo-s2', proje_kodu: 'ARP-2026-02', ad: 'Sarıçiçek Yayla Yolu', ilce: 'Arapgir', mahalle: 'Sarıçiçek', is_tipi: 'Greyderli Reglaj', planlanan_kubaj: 1500, baslama: addDays(t, -5), bitis: addDays(t, 10), durum: 'Devam Ediyor' },
  ]);
  await db.putMany('arac', [
    { id: 'demo-a1', plaka: '44 ÖRN 001', cinsi: 'Kamyon', marka_model: 'Örnek 3335', kapasite_m3: 12, tonaj: 26, durum: 'Aktif', santiye: 'demo-s1', sayac: 'Km', yakit_norm: 38, son_bakim: addDays(t, -85), bakim_periyot_gun: 90, muayene_bitis: addDays(t, 12) },
    { id: 'demo-a2', plaka: '44 ÖRN 002', cinsi: 'Kamyon', marka_model: 'Örnek 3335', kapasite_m3: 12, tonaj: 26, durum: 'Aktif', santiye: 'demo-s1', sayac: 'Km', yakit_norm: 38, son_bakim: addDays(t, -30), bakim_periyot_gun: 90 },
    { id: 'demo-a3', plaka: 'İM-GRY-01', cinsi: 'Greyder', marka_model: 'Örnek 140', durum: 'Aktif', santiye: 'demo-s2', sayac: 'Saat', yakit_norm: 16, son_bakim: addDays(t, -95), bakim_periyot_gun: 90 },
    { id: 'demo-a4', plaka: 'İM-EKS-01', cinsi: 'Ekskavatör', marka_model: 'Örnek 220', durum: 'Aktif', santiye: 'demo-s1', sayac: 'Saat', yakit_norm: 18, son_bakim: addDays(t, -10), bakim_periyot_gun: 60 },
  ]);
  await db.putMany('personel', [
    { id: 'demo-p1', sicil_no: '1001', ad_soyad: 'Örnek Şoför 1', unvan: 'Şoför', zimmetli_arac: 'demo-a1', santiye: 'demo-s1', durum: 'Görevde' },
    { id: 'demo-p2', sicil_no: '1002', ad_soyad: 'Örnek Şoför 2', unvan: 'Şoför', zimmetli_arac: 'demo-a2', santiye: 'demo-s1', durum: 'Görevde' },
    { id: 'demo-p3', sicil_no: '1003', ad_soyad: 'Örnek Operatör 1', unvan: 'Operatör', zimmetli_arac: 'demo-a3', santiye: 'demo-s2', durum: 'Görevde' },
    { id: 'demo-p4', sicil_no: '1004', ad_soyad: 'Örnek Operatör 2', unvan: 'Operatör', zimmetli_arac: 'demo-a4', santiye: 'demo-s1', durum: 'Görevde' },
  ]);
  await db.putMany('birim_fiyat', [
    { id: 'demo-f1', kod: 'MOTORIN', ad: 'Motorin', birim: 'L', fiyat: 45, gecerlilik: addDays(t, -60), kaynak: 'Örnek' },
    { id: 'demo-f2', kod: 'MOTORIN', ad: 'Motorin', birim: 'L', fiyat: 48, gecerlilik: addDays(t, -10), kaynak: 'Örnek' },
    { id: 'demo-f3', kod: 'SOFOR_GUNLUK', ad: 'Şoför günlük', birim: 'gün', fiyat: 2200, gecerlilik: addDays(t, -60) },
    { id: 'demo-f4', kod: 'KAMYON_AMORTISMAN_SAAT', ad: 'Kamyon amortisman', birim: 'saat', fiyat: 350, gecerlilik: addDays(t, -60) },
    { id: 'demo-f5', kod: 'ALT_TEMEL_M3', ad: 'Alt temel malzemesi', birim: 'm3', fiyat: 180, gecerlilik: addDays(t, -60) },
  ]);
  await db.putMany('nakliye_plan', [
    { id: 'demo-n1', ad: 'Sinikli-Kılıçlı alt temel nakli', santiye: 'demo-s1', malzeme: 'Alt Temel', ocak: 'Örnek Taş Ocağı', toplam_miktar: 6000, birim: 'm3', yogunluk: 1.8,
      mesafe_km: 24, kapasite_m3: 12, hiz_kmsa: 30, yukleme_dk: 8, bosaltma_dk: 4, manevra_dk: 5, vardiya_saat: 9, kamyon_sayisi: 2, hedef_gun: 30, yakit_lt_km: 0.38, baslama: addDays(t, -20) },
  ]);
  const seferler = [];
  for (let i = 1; i <= 6; i++) {
    seferler.push({ id: 'demo-sf' + i + 'a', tarih: addDays(t, -i), arac: 'demo-a1', plan: 'demo-n1', guzergah: 'Ocak - Sinikli', sefer_sayisi: 8, miktar_m3: '', vardiya_saat: 9 });
    seferler.push({ id: 'demo-sf' + i + 'b', tarih: addDays(t, -i), arac: 'demo-a2', plan: 'demo-n1', guzergah: 'Ocak - Sinikli', sefer_sayisi: i === 2 ? 14 : 7, miktar_m3: '', vardiya_saat: 9 });
  }
  await db.putMany('sefer', seferler);
  await db.putMany('yakit', [
    { id: 'demo-y1', tarih: addDays(t, -2), arac: 'demo-a1', litre: 160, calisma: 410, santiye: 'demo-s1' },
    { id: 'demo-y2', tarih: addDays(t, -1), arac: 'demo-a3', litre: 190, calisma: 9, santiye: 'demo-s2', aciklama: 'Kontrol edilecek' },
  ]);
  await db.putMany('saha_is', [
    { id: 'demo-h1', tarih: addDays(t, -15), santiye: 'demo-s1', guzergah: 'Sinikli - Kılıçlı', is_kalemi: 'Yol Genişletme', islem: 'Kazı', km_bas: 0, km_bit: 1.2, miktar: 2400, birim: 'm3' },
    { id: 'demo-h2', tarih: addDays(t, -10), santiye: 'demo-s1', guzergah: 'Sinikli - Kılıçlı', is_kalemi: 'Alt Temel Serimi', islem: 'Dolgu', km_bas: 1.2, km_bit: 2.5, miktar: 1800, birim: 'm3' },
    { id: 'demo-h3', tarih: addDays(t, -3), santiye: 'demo-s1', guzergah: 'Sinikli - Kılıçlı', is_kalemi: 'Stabilizasyon Kaplama', islem: 'Stabilizasyon', km_bas: 0, km_bit: 0.8, miktar: 4000, birim: 'm2' },
    { id: 'demo-h4', tarih: addDays(t, -2), santiye: 'demo-s1', guzergah: 'Sinikli - Kılıçlı', is_kalemi: 'Büz/Menfez Atılımı', islem: 'Büz/Menfez', km_bas: 1.9, km_bit: 1.95, miktar: 1, birim: 'adet' },
  ]);
  await db.putMany('ariza', [
    { id: 'demo-r1', tarih: addDays(t, -4), arac: 'demo-a4', tur: 'Hidrolik', aciklama: 'Kepçe silindirinde kaçak', yedek_parca: 'Hidrolik keçe takımı', parca_durum: 'Talep Edildi', durum: 'Parça Bekliyor' },
  ]);
  await db.put('arac', { ...db.get('arac', 'demo-a4'), durum: 'Arızalı' });
  await db.putMany('olay', [
    { id: 'demo-o1', tarih_saat: nowLocal(new Date(Date.now() - 50 * 60e3)), kategori: 'Yol Kapanma', konum: 'Sarıçiçek Yaylası yolu', ihbar_eden: 'Mahalle muhtarı', aciklama: 'Tipi nedeniyle yol kapandı, 2 araç mahsur', ekip: 'Kar küreme ekibi 1', mudahale_bas: nowLocal(new Date(Date.now() - 20 * 60e3)), durum: 'Müdahale Ediliyor' },
  ]);
  await db.putMany('gorev', [
    { id: 'demo-g1', baslik: 'MASKİ\'ye Sinikli hattı deplase yazısı gönder', kimden: 'Daire Başkanı', son_tarih: addDays(t, -1), oncelik: 'Yüksek', durum: 'Açık' },
    { id: 'demo-g2', baslik: 'Kış öncesi tuz stoğunu kontrol et', kimden: 'Kaymakamlık toplantısı', son_tarih: addDays(t, 2), oncelik: 'Orta', durum: 'Açık' },
  ]);
  await db.putMany('toplanti', [
    { id: 'demo-t1', tarih_saat: addDays(t, 1) + 'T10:00', yer: 'Arapgir Kaymakamlığı', konu: 'Karla Mücadele Hazırlık Toplantısı', katilimcilar: 'Kaymakam\nİlçe Jandarma Komutanı\nKırsal Yol Bakım Onarım Şefi',
      kararlar: 'Kar küreme araçlarının bakımları tamamlanacak ; Bakım şefi ; ' + addDays(t, 10).split('-').reverse().join('.') + '\nTuz stoğu 200 ton olacak ; Depo sorumlusu' },
  ]);
  await db.putMany('hatirlatma', [
    { id: 'demo-hh1', baslik: 'Haftalık puantajı daireye gönder', tarih_saat: addDays(t, 0) + 'T16:30', tekrar: 'Her hafta', tamam: false },
  ]);
}

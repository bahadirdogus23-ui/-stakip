// Tablo tanımları (SRS Bölüm 3). Her tablo: alanlar (form + liste), hesaplanan
// sütunlar, satır renklendirme ve satır işlemleri. Arayüz bu tanımlardan otomatik üretilir.
//
// Alan tipleri: text, number, date, datetime, time, select, ref (başka tabloya bağlantı), textarea, check
// Alan seçenekleri: req (zorunlu), def (varsayılan), list (önceki değerlerden öneri), upper,
//   hide (listede gösterme), noForm (formda gösterme), wide (formda tam genişlik), help

import * as db from './db.js';
import { fmtDate, today, nowLocal, toast, fmtNum } from './util.js';
import { normKod, yakitAnalizi, hakedisHesapla, dakikaFarki, gunFarki, sonrakiTekrar, verimHesapla } from './calc.js';
import * as dm from './domain.js';
import * as rp from './reports.js';

export const IS_KALEMLERI = ['Yol Genişletme', 'Stabilizasyon Kaplama', 'Greyderli Reglaj', 'Asfalt Yama',
  'Büz/Menfez Atılımı', 'Hendek Açma', 'Alt Temel Serimi', 'Sanat Yapısı', 'Kar Küreme', 'Tuzlama', 'Diğer'];
export const ISLEM_RENK = {
  'Kazı': '#d32f2f', 'Dolgu': '#1e66d0', 'Stabilizasyon': '#e0b000', 'Asfalt': '#333333',
  'Büz/Menfez': '#2e7d32', 'Reglaj': '#ef6c00', 'Diğer': '#8a8a8a',
};
const BIRIMLER = ['m3', 'ton', 'm2', 'metre', 'adet', 'kg', 'lt', 'saat', 'sefer'];
const PERSONEL_UNVAN = ['Operatör', 'Şoför', 'Usta', 'İşçi', 'Tekniker', 'Mühendis', 'Şef', 'Diğer'];

const label = (c, id) => { const r = db.get(c, id); return r ? SCHEMAS[c].label(r) : ''; };
const kapali = d => d === 'Tamamlandı' || d === 'Çözüldü';

export const SCHEMAS = {
  // ---------------- MODÜL 1: FİLO ----------------
  arac: {
    title: 'Araç / İş Makinesi', label: r => `${r.plaka}${r.cinsi ? ' (' + r.cinsi + ')' : ''}`,
    fields: [
      { k: 'plaka', l: 'Plaka / Envanter No', t: 'text', req: true, upper: true },
      { k: 'cinsi', l: 'Cinsi', t: 'select', o: ['Greyder', 'Dozer', 'Ekskavatör', 'Beko Loder', 'Lastikli Yükleyici', 'Silindir', 'Kamyon', 'Çekici/Lowbed', 'Arazöz', 'Kar Küreme Aracı', 'Tuzlama Aracı', 'Binek', 'Pikap', 'Diğer'] },
      { k: 'marka_model', l: 'Marka / Model', t: 'text', list: true },
      { k: 'kapasite_m3', l: 'Kapasite (m³/sefer)', t: 'number' },
      { k: 'tonaj', l: 'Tonaj', t: 'number' },
      { k: 'durum', l: 'Güncel Durum', t: 'select', o: ['Aktif', 'Arızalı', 'Bakımda', 'Yatan (Kullanım Dışı)', 'Kiralık'], def: 'Aktif' },
      { k: 'santiye', l: 'Bulunduğu Şantiye', t: 'ref', ref: 'santiye' },
      { k: 'sayac', l: 'Sayaç', t: 'select', o: ['Saat', 'Km'], def: 'Saat', help: 'İş makinesi: Saat, kamyon/binek: Km' },
      { k: 'yakit_norm', l: 'Yakıt Normu (L/saat veya L/100km)', t: 'number' },
      { k: 'son_bakim', l: 'Son Periyodik Bakım', t: 'date' },
      { k: 'bakim_periyot_gun', l: 'Bakım Periyodu (gün)', t: 'number', def: 90 },
      { k: 'muayene_bitis', l: 'Muayene Bitiş', t: 'date' },
      { k: 'sigorta_bitis', l: 'Sigorta Bitiş', t: 'date' },
      { k: 'aciklama', l: 'Açıklama', t: 'textarea', hide: true },
    ],
    computed: [
      { k: 'operator', l: 'Operatör/Şoför', t: 's', f: r => dm.operatorleri(r.id).join(', ') },
      { k: 'sonraki_bakim', l: 'Sonraki Bakım', t: 'd', f: r => r.son_bakim && r.bakim_periyot_gun ? addDaysStr(r.son_bakim, +r.bakim_periyot_gun) : '',
        cls: r => { const s = SCHEMAS.arac.computed[1].f(r); return !s ? '' : s < today() ? 'red' : gunFarki(today(), s) <= 7 ? 'orange' : ''; } },
    ],
    rowCls: r => ['Arızalı', 'Yatan (Kullanım Dışı)'].includes(r.durum) ? 'row-red' : r.durum === 'Bakımda' ? 'row-orange' : '',
    sort: (a, b) => (a.plaka || '').localeCompare(b.plaka || '', 'tr'),
  },

  personel: {
    title: 'Personel', label: r => r.ad_soyad + (r.unvan ? ' (' + r.unvan + ')' : ''),
    fields: [
      { k: 'sicil_no', l: 'Sicil No', t: 'text' },
      { k: 'ad_soyad', l: 'Ad Soyad', t: 'text', req: true },
      { k: 'unvan', l: 'Unvan', t: 'select', o: PERSONEL_UNVAN, def: 'Operatör' },
      { k: 'zimmetli_arac', l: 'Zimmetli Araç', t: 'ref', ref: 'arac' },
      { k: 'santiye', l: 'Görevli Şantiye', t: 'ref', ref: 'santiye' },
      { k: 'telefon', l: 'Telefon', t: 'text' },
      { k: 'durum', l: 'Durum', t: 'select', o: ['Görevde', 'İzinli', 'Raporlu', 'Ayrıldı'], def: 'Görevde' },
    ],
    rowCls: r => r.durum === 'Ayrıldı' ? 'row-muted' : r.durum !== 'Görevde' ? 'row-orange' : '',
    sort: (a, b) => (a.ad_soyad || '').localeCompare(b.ad_soyad || '', 'tr'),
  },

  ariza: {
    title: 'Arıza / Bakım Kaydı', dateField: 'tarih', label: r => `${fmtDate(r.tarih)} ${label('arac', r.arac)} ${r.tur || ''}`,
    help: 'Açık arıza girildiğinde araç otomatik "Arızalı", periyodik bakım "Bakımda" olur. Kayıt "Tamamlandı" yapılınca araç tekrar "Aktif" olur ve son bakım tarihi güncellenir.',
    fields: [
      { k: 'tarih', l: 'Tarih', t: 'date', req: true, def: today },
      { k: 'arac', l: 'Araç', t: 'ref', ref: 'arac', req: true },
      { k: 'tur', l: 'Tür', t: 'select', o: ['Mekanik Arıza', 'Periyodik Bakım', 'Kaporta', 'Lastik', 'Elektrik/Elektronik', 'Hidrolik', 'Diğer'] },
      { k: 'aciklama', l: 'Arıza / İşlem Açıklaması', t: 'textarea', wide: true },
      { k: 'yedek_parca', l: 'Yedek Parça Talebi', t: 'text' },
      { k: 'parca_durum', l: 'Parça Durumu', t: 'select', o: ['', 'Talep Edildi', 'Sipariş Verildi', 'Geldi'] },
      { k: 'durum', l: 'Durum', t: 'select', o: ['Açık', 'Parça Bekliyor', 'Serviste', 'Tamamlandı'], def: 'Açık' },
      { k: 'bitis_tarihi', l: 'Bitiş Tarihi', t: 'date' },
      { k: 'maliyet', l: 'Maliyet (₺)', t: 'number' },
    ],
    computed: [
      { k: 'gun', l: 'Yatış (gün)', t: 'n', f: r => r.tarih ? gunFarki(r.tarih, r.bitis_tarihi || today()) : '' },
    ],
    rowCls: r => r.durum === 'Tamamlandı' ? 'row-muted' : 'row-red',
    async afterSave(r) { await aracDurumGuncelle(r.arac, r); },
    async afterDelete(r) { await aracDurumGuncelle(r.arac); },
  },

  yakit: {
    title: 'Yakıt Girişi', dateField: 'tarih', label: r => `${fmtDate(r.tarih)} ${label('arac', r.arac)}`,
    help: 'Norm dışı (araç normunun ayarlardaki toleransı üzerinde) tüketim kırmızı gösterilir.',
    fields: [
      { k: 'tarih', l: 'Tarih', t: 'date', req: true, def: today },
      { k: 'arac', l: 'Araç', t: 'ref', ref: 'arac', req: true },
      { k: 'litre', l: 'Alınan Yakıt (L)', t: 'number', req: true },
      { k: 'calisma', l: 'Çalışma (saat veya km)', t: 'number', req: true, help: 'Son dolumdan bu yana çalışma saati / km' },
      { k: 'santiye', l: 'Şantiye', t: 'ref', ref: 'santiye' },
      { k: 'aciklama', l: 'Açıklama', t: 'text' },
    ],
    computed: [
      { k: 'tuketim', l: 'Tüketim', t: 'n', f: r => yakitOf(r)?.tuketim ?? '' },
      { k: 'birim', l: 'Birim', t: 's', f: r => db.get('arac', r.arac)?.sayac === 'Km' ? 'L/100km' : 'L/saat' },
      { k: 'norm', l: 'Norm', t: 'n', f: r => db.get('arac', r.arac)?.yakit_norm ?? '' },
      { k: 'sapma', l: 'Sapma %', t: 'pct', f: r => yakitOf(r)?.sapma ?? '', cls: r => yakitOf(r)?.normDisi ? 'red' : '' },
    ],
    rowCls: r => yakitOf(r)?.normDisi ? 'row-red' : '',
  },

  // ---------------- MODÜL 2: NAKLİYE ----------------
  nakliye_plan: {
    title: 'Nakliye Planı / Simülasyon', dateField: 'baslama', label: r => r.ad,
    help: 'Ocak–şantiye nakliyesi için gerekli kamyon, gün, sefer ve maliyet otomatik hesaplanır. Maliyet; Birim Fiyatlar tablosundaki MOTORIN, KAMYON_AMORTISMAN_SAAT ve SOFOR_GUNLUK kodlarının başlama tarihindeki değerleriyle hesaplanır.',
    fields: [
      { k: 'ad', l: 'Plan Adı', t: 'text', req: true, wide: true, ph: 'Örn: Sinikli-Kılıçlı alt temel nakli' },
      { k: 'santiye', l: 'Şantiye', t: 'ref', ref: 'santiye' },
      { k: 'malzeme', l: 'Malzeme', t: 'select', o: ['Alt Temel', 'Dolgu', 'Asfalt Kırığı', 'Stabilize', 'Taş Tozu', 'Hafriyat (Döküm)', 'Diğer'] },
      { k: 'ocak', l: 'Ocak / Ariyet', t: 'text', list: true },
      { k: 'toplam_miktar', l: 'Toplam Miktar', t: 'number', req: true },
      { k: 'birim', l: 'Birim', t: 'select', o: ['m3', 'ton'], def: 'm3' },
      { k: 'yogunluk', l: 'Yoğunluk (ton/m³)', t: 'number', def: 1.8, help: 'Tonaj girildiyse m³\'e çevirmek için' },
      { k: 'mesafe_km', l: 'Gidiş-Dönüş Mesafe (km)', t: 'number', req: true },
      { k: 'kapasite_m3', l: 'Kamyon Kapasitesi (m³/sefer)', t: 'number', req: true },
      { k: 'hiz_kmsa', l: 'Ortalama Hız (km/sa)', t: 'number', def: 30 },
      { k: 'yukleme_dk', l: 'Yükleme (dk)', t: 'number', def: 8 },
      { k: 'bosaltma_dk', l: 'Boşaltma (dk)', t: 'number', def: 4 },
      { k: 'manevra_dk', l: 'Manevra/Bekleme (dk)', t: 'number', def: 5 },
      { k: 'vardiya_saat', l: 'Vardiya (saat/gün)', t: 'number', def: 8 },
      { k: 'kamyon_sayisi', l: 'Mevcut Kamyon Sayısı', t: 'number', def: 1 },
      { k: 'hedef_gun', l: 'Hedef Süre (gün)', t: 'number', help: 'Girilirse bu sürede bitirmek için gereken kamyon sayısı hesaplanır' },
      { k: 'yakit_lt_km', l: 'Yakıt (L/km)', t: 'number', def: 0.35 },
      { k: 'baslama', l: 'Başlama Tarihi', t: 'date', def: today },
    ],
    computed: [
      { k: 'cevrim', l: 'Çevrim (dk)', t: 'n', f: r => dm.planSim(r).cevrimDk },
      { k: 'k_sefer', l: 'Sefer/Kamyon/Gün', t: 'n', f: r => dm.planSim(r).kamyonGunlukSefer ?? '' },
      { k: 'gunluk', l: 'Günlük Sefer (toplam)', t: 'n', f: r => dm.planSim(r).gunlukSefer ?? '' },
      { k: 'top_sefer', l: 'Toplam Sefer', t: 'n', f: r => dm.planSim(r).toplamSefer },
      { k: 'gun', l: 'Tahmini Gün', t: 'n', f: r => dm.planSim(r).tamamlanmaGun ?? '' },
      { k: 'ger_kamyon', l: 'Hedef için Kamyon', t: 'n', f: r => dm.planSim(r).gerekliKamyon ?? '' },
      { k: 'maliyet', l: 'Toplam Nakliye Maliyeti', t: 'money', f: r => dm.planSim(r).toplamTL ?? '' },
      { k: 'gerceklesen', l: 'Taşınan (m³)', t: 'n', f: r => dm.planGerceklesen(r.id) },
      { k: 'kalan', l: 'Kalan İş %', t: 'pct', f: r => { const m = dm.planSim(r).miktarM3; return m ? Math.max(0, 1 - dm.planGerceklesen(r.id) / m) : ''; } },
    ],
    rowCls: r => dm.planSim(r).hata ? 'row-red' : '',
    actions: [{ l: 'Rapor/PDF', fn: r => rp.planRaporu(r) }],
  },

  sefer: {
    title: 'Sefer Puantajı', dateField: 'tarih', label: r => `${fmtDate(r.tarih)} ${label('arac', r.arac)}`,
    help: 'Girilen sefer, plakanın vardiyada atabileceği teorik azami seferi (mesafe × çevrim süresi) aşarsa satır kırmızı ve "DENETİM" işaretli olur.',
    fields: [
      { k: 'tarih', l: 'Tarih', t: 'date', req: true, def: today },
      { k: 'arac', l: 'Plaka', t: 'ref', ref: 'arac', req: true },
      { k: 'plan', l: 'Nakliye Planı', t: 'ref', ref: 'nakliye_plan' },
      { k: 'guzergah', l: 'Gidilen Güzergah', t: 'text', list: true },
      { k: 'mesafe_km', l: 'Gidiş-Dönüş Mesafe (km)', t: 'number', help: 'Boşsa plandan alınır' },
      { k: 'sefer_sayisi', l: 'Atılan Sefer Sayısı', t: 'number', req: true },
      { k: 'miktar_m3', l: 'Taşınan Miktar (m³)', t: 'number', help: 'Boşsa sefer × kapasite' },
      { k: 'vardiya_saat', l: 'Vardiya (saat)', t: 'number', def: 8 },
      { k: 'aciklama', l: 'Açıklama', t: 'text' },
    ],
    computed: [
      { k: 'm3', l: 'Taşınan (hesap, m³)', t: 'n', f: r => dm.seferM3(r) },
      { k: 'teorik', l: 'Teorik Azami Sefer', t: 'n', f: r => dm.seferTeorikMax(r) ?? '' },
      { k: 'denetim', l: 'Denetim', t: 's', f: r => seferSupheli(r) ? '⚠ DENETİM' : '', cls: r => seferSupheli(r) ? 'red' : '' },
    ],
    rowCls: r => seferSupheli(r) ? 'row-red' : '',
  },

  malzeme: {
    title: 'Malzeme / Gider', dateField: 'tarih', label: r => `${fmtDate(r.tarih)} ${r.malzeme_cinsi}`,
    help: 'Tutar, fiyat kodunun KAYIT TARİHİNDEKİ birim fiyatıyla hesaplanır (geriye dönük raporlar doğru kalır).',
    fields: [
      { k: 'tarih', l: 'Tarih', t: 'date', req: true, def: today },
      { k: 'santiye', l: 'Şantiye / Proje', t: 'ref', ref: 'santiye' },
      { k: 'malzeme_cinsi', l: 'Malzeme Cinsi', t: 'select', o: ['Alt Temel', 'Asfalt', 'Büz', 'Taş Tozu', 'Çimento', 'Tuz', 'Solüsyon', 'Kum/Çakıl', 'Demir', 'Diğer'] },
      { k: 'miktar', l: 'Miktar', t: 'number' },
      { k: 'birim', l: 'Birim', t: 'select', o: BIRIMLER },
      { k: 'fiyat_kodu', l: 'Birim Fiyat Kodu', t: 'text', upper: true, list: 'fiyatKodlari' },
      { k: 'yakit_litre', l: 'Yakıt (L)', t: 'number' },
      { k: 'aciklama', l: 'Açıklama', t: 'text' },
    ],
    computed: [
      { k: 'bf', l: 'Birim Fiyat', t: 'money', f: r => dm.fiyat(r.fiyat_kodu, r.tarih) ?? '' },
      { k: 'tutar', l: 'Malzeme Tutarı', t: 'money', f: r => { const f = dm.fiyat(r.fiyat_kodu, r.tarih); return f == null ? '' : f * (+r.miktar || 0); } },
      { k: 'yakit_tl', l: 'Yakıt Tutarı', t: 'money', f: r => { const f = dm.fiyat('MOTORIN', r.tarih); return f == null || !r.yakit_litre ? '' : f * r.yakit_litre; } },
    ],
  },

  // ---------------- MODÜL 3: SAHA & KRİZ ----------------
  santiye: {
    title: 'Şantiye', dateField: 'baslama', label: r => `${r.proje_kodu} - ${r.ad}`,
    fields: [
      { k: 'proje_kodu', l: 'Proje Kodu', t: 'text', req: true, upper: true },
      { k: 'ad', l: 'Yol / Güzergah Adı', t: 'text', req: true, list: true, ph: 'Örn: Sinikli - Kılıçlı Grup Yolu' },
      { k: 'ilce', l: 'İlçe', t: 'text', def: () => dm.ayarlar().ilce },
      { k: 'mahalle', l: 'Mahalle', t: 'text', list: true },
      { k: 'is_tipi', l: 'İş Tipi', t: 'select', o: IS_KALEMLERI },
      { k: 'planlanan_kubaj', l: 'Planlanan Kübaj (m³)', t: 'number' },
      { k: 'baslama', l: 'Başlama', t: 'date' },
      { k: 'bitis', l: 'Planlanan Bitiş', t: 'date' },
      { k: 'durum', l: 'Durum', t: 'select', o: ['Planlandı', 'Devam Ediyor', 'Durduruldu', 'Tamamlandı'], def: 'Devam Ediyor' },
      { k: 'aciklama', l: 'Açıklama', t: 'textarea', hide: true },
    ],
    computed: [
      { k: 'gerceklesen', l: 'Gerçekleşen (m³)', t: 'n', f: r => dm.santiyeGerceklesen(r.id) },
      { k: 'ilerleme', l: 'İlerleme %', t: 'pct', f: r => santiyeVerim(r).gercekOran ?? '' },
      { k: 'verim', l: 'Verim (plana göre)', t: 'pct', f: r => santiyeVerim(r).verim ?? '',
        cls: r => { const v = santiyeVerim(r).verim; return v == null ? '' : v < 0.8 ? 'red' : v < 1 ? 'orange' : 'green'; } },
    ],
    rowCls: r => r.durum === 'Tamamlandı' ? 'row-muted' : r.bitis && r.bitis < today() ? 'row-orange' : '',
    sort: (a, b) => (a.proje_kodu || '').localeCompare(b.proje_kodu || '', 'tr'),
  },

  saha_is: {
    title: 'Saha İşi', dateField: 'tarih', label: r => `${fmtDate(r.tarih)} ${r.guzergah} ${r.is_kalemi || ''}`,
    help: 'Km başlangıç/bitiş girerseniz "Güzergah Lejantı" sekmesinde renkli şerit olarak görünür.',
    fields: [
      { k: 'tarih', l: 'Tarih', t: 'date', req: true, def: today },
      { k: 'santiye', l: 'Şantiye', t: 'ref', ref: 'santiye' },
      { k: 'guzergah', l: 'Grup Yolu / Güzergah', t: 'text', req: true, list: true, ph: 'Örn: Sinikli - Kılıçlı' },
      { k: 'is_kalemi', l: 'İş Kalemi', t: 'select', o: IS_KALEMLERI },
      { k: 'islem', l: 'İşlem (Renk)', t: 'select', o: Object.keys(ISLEM_RENK), help: 'Kırmızı: Kazı, Mavi: Dolgu, Sarı: Stabilizasyon' },
      { k: 'km_bas', l: 'Km Başlangıç', t: 'number' },
      { k: 'km_bit', l: 'Km Bitiş', t: 'number' },
      { k: 'miktar', l: 'Miktar', t: 'number' },
      { k: 'birim', l: 'Birim', t: 'select', o: BIRIMLER },
      { k: 'araclar', l: 'Çalışan Araçlar', t: 'text' },
      { k: 'aciklama', l: 'Açıklama', t: 'textarea', wide: true },
    ],
  },

  olay: {
    title: 'Olay / İhbar Kaydı', dateField: 'tarih_saat', label: r => `${fmtDate(r.tarih_saat)} ${r.kategori} ${r.konum}`,
    help: 'İhbar saati, müdahale başlangıcı ve bitişi saat damgalı tutulur; reaksiyon ve müdahale süreleri otomatik hesaplanır.',
    quick: [{ l: '🚨 Hızlı İhbar (şimdi)', fn: () => ({ tarih_saat: nowLocal(), kategori: 'Kışla Mücadele', durum: 'Bekliyor' }) }],
    fields: [
      { k: 'tarih_saat', l: 'İhbar Tarih/Saat', t: 'datetime', req: true, def: () => nowLocal() },
      { k: 'kategori', l: 'Kategori', t: 'select', o: ['Kışla Mücadele', 'Yol Kapanma', 'Mahsur Kalma', 'Kaza', 'Heyelan/Göçük', 'Su Baskını', 'Araç Arızası', 'Aksam', 'Diğer'] },
      { k: 'konum', l: 'Konum / Yol', t: 'text', req: true, list: true, ph: 'Örn: Sarıçiçek Yaylası yolu' },
      { k: 'ihbar_eden', l: 'İhbar Eden', t: 'text' },
      { k: 'telefon', l: 'Telefon', t: 'text' },
      { k: 'aciklama', l: 'Açıklama', t: 'textarea', wide: true },
      { k: 'ekip', l: 'Gönderilen Ekip / Araç', t: 'text', list: true },
      { k: 'mudahale_bas', l: 'Müdahale Başlangıç', t: 'datetime' },
      { k: 'mudahale_bit', l: 'Müdahale Bitiş', t: 'datetime' },
      { k: 'tuz_ton', l: 'Kullanılan Tuz (ton)', t: 'number' },
      { k: 'solusyon_lt', l: 'Solüsyon (L)', t: 'number' },
      { k: 'durum', l: 'Durum', t: 'select', o: ['Bekliyor', 'Müdahale Ediliyor', 'Çözüldü'], def: 'Bekliyor' },
    ],
    computed: [
      { k: 'reaksiyon', l: 'Reaksiyon (dk)', t: 'n', f: r => dakikaFarki(r.tarih_saat, r.mudahale_bas) ?? '' },
      { k: 'mudahale', l: 'Müdahale Süresi (dk)', t: 'n', f: r => dakikaFarki(r.mudahale_bas, r.mudahale_bit) ?? '' },
    ],
    rowCls: r => r.durum === 'Çözüldü' ? '' : 'row-red',
  },

  vardiya: {
    title: 'Kış Vardiyası', dateField: 'tarih', label: r => `${fmtDate(r.tarih)} ${r.vardiya} ${r.bolge}`,
    fields: [
      { k: 'tarih', l: 'Tarih', t: 'date', req: true, def: today },
      { k: 'vardiya', l: 'Vardiya', t: 'select', o: ['Gündüz 08-16', 'Akşam 16-24', 'Gece 00-08', 'Nöbet (24 saat)'] },
      { k: 'bolge', l: 'Bölge / Güzergah', t: 'text', list: true },
      { k: 'sorumlu', l: 'Ekip Sorumlusu', t: 'ref', ref: 'personel' },
      { k: 'personel', l: 'Ekip (isimler)', t: 'text' },
      { k: 'arac', l: 'Araç', t: 'ref', ref: 'arac' },
      { k: 'gorev', l: 'Görev', t: 'select', o: ['Kar Küreme', 'Tuzlama', 'Kar Küreme + Tuzlama', 'Nöbet / Hazır Bekleme'] },
      { k: 'aciklama', l: 'Açıklama', t: 'text' },
    ],
  },

  // ---------------- MODÜL 4: FİNANS ----------------
  birim_fiyat: {
    title: 'Birim Fiyat', dateField: 'gecerlilik', label: r => `${r.kod} ${fmtNum(r.fiyat)} (${fmtDate(r.gecerlilik)})`,
    help: 'Fiyat değişince eski satırı DEĞİŞTİRMEYİN; yeni geçerlilik tarihli satır ekleyin. Hesaplamalar her kaydın kendi tarihindeki fiyatı kullanır. Standart kodlar: ' + Object.keys(dm.FIYAT_KODLARI).join(', '),
    fields: [
      { k: 'kod', l: 'Kod', t: 'text', req: true, upper: true, list: 'fiyatKodlari' },
      { k: 'ad', l: 'Açıklama', t: 'text', list: true },
      { k: 'birim', l: 'Birim', t: 'text', list: true },
      { k: 'fiyat', l: 'Birim Fiyat (₺)', t: 'number', req: true },
      { k: 'gecerlilik', l: 'Geçerlilik Başlangıcı', t: 'date', req: true, def: today },
      { k: 'kaynak', l: 'Kaynak / Not', t: 'text' },
    ],
    computed: [
      { k: 'guncel', l: 'Durum', t: 's', f: r => r.gecerlilik > today() ? 'İleri tarihli' : dahaYeniFiyatVar(r) ? 'Geçmiş' : 'Güncel' },
    ],
    rowCls: r => dahaYeniFiyatVar(r) ? 'row-muted' : '',
    sort: (a, b) => (a.kod || '').localeCompare(b.kod || '') || (b.gecerlilik || '').localeCompare(a.gecerlilik || ''),
  },

  hakedis: {
    title: 'Hakediş', dateField: 'tarih', label: r => `${r.no || ''} ${r.yuklenici} ${fmtDate(r.tarih)}`,
    help: 'Brüt = Miktar × Birim fiyat (ya da elle brüt). Net = Brüt + KDV − (KDV tevkifatı + damga vergisi + stopaj + teminat + avans mahsubu + diğer).',
    fields: [
      { k: 'tarih', l: 'Hakediş Tarihi', t: 'date', req: true, def: today },
      { k: 'no', l: 'Hakediş No', t: 'text' },
      { k: 'donem', l: 'Dönem', t: 'text', ph: 'Örn: 2026/10' },
      { k: 'yuklenici', l: 'Yüklenici / Araç Sahibi', t: 'text', req: true, list: true },
      { k: 'santiye', l: 'Şantiye', t: 'ref', ref: 'santiye' },
      { k: 'is_kalemi', l: 'İş Kalemi', t: 'text', list: true },
      { k: 'miktar', l: 'Miktar', t: 'number' },
      { k: 'birim', l: 'Birim', t: 'select', o: BIRIMLER },
      { k: 'fiyat_kodu', l: 'Birim Fiyat Kodu', t: 'text', upper: true, list: 'fiyatKodlari' },
      { k: 'birim_fiyat', l: 'Birim Fiyat (elle)', t: 'number', help: 'Boşsa koddan, hakediş tarihindeki fiyat' },
      { k: 'brut_manuel', l: 'Brüt Tutar (elle)', t: 'number', help: 'Doluysa miktar × fiyat yerine kullanılır' },
      { k: 'kdv_orani', l: 'KDV %', t: 'number', def: 20 },
      { k: 'tevkifat_pay', l: 'KDV Tevkifatı (x/10)', t: 'number', def: 0 },
      { k: 'damga_binde', l: 'Damga Vergisi ‰', t: 'number', def: 9.48 },
      { k: 'stopaj_orani', l: 'Stopaj %', t: 'number', def: 0 },
      { k: 'teminat_orani', l: 'Teminat Kesintisi %', t: 'number', def: 0 },
      { k: 'avans_mahsup', l: 'Avans Mahsubu (₺)', t: 'number', def: 0 },
      { k: 'diger_kesinti', l: 'Diğer Kesinti (₺)', t: 'number', def: 0 },
      { k: 'aciklama', l: 'Açıklama', t: 'textarea', hide: true },
    ],
    computed: [
      { k: 'brut', l: 'Brüt', t: 'money', f: r => hakedisOf(r).brut },
      { k: 'kdv', l: 'KDV', t: 'money', f: r => hakedisOf(r).kdv },
      { k: 'kesinti', l: 'Toplam Kesinti', t: 'money', f: r => hakedisOf(r).toplamKesinti },
      { k: 'net', l: 'Net Ödenecek', t: 'money', f: r => hakedisOf(r).net },
    ],
    actions: [{ l: 'Hakediş Raporu', fn: r => rp.hakedisRaporu(r, hakedisOf(r)) }],
  },

  // ---------------- MODÜL 5: EVRAK & AJANDA ----------------
  evrak: {
    title: 'Evrak Arşivi', dateField: 'tarih', label: r => `${r.sayi || ''} ${r.konu}`,
    help: 'Yeni evrak "Evrak Hazırla" sekmesinden oluşturulur.',
    fields: [
      { k: 'tarih', l: 'Tarih', t: 'date', req: true, def: today },
      { k: 'sayi', l: 'Sayı', t: 'text' },
      { k: 'tur', l: 'Tür', t: 'text', list: true },
      { k: 'muhatap', l: 'Muhatap', t: 'text', list: true },
      { k: 'konu', l: 'Konu', t: 'text', wide: true },
      { k: 'durum', l: 'Durum', t: 'select', o: ['Taslak', 'Gönderildi', 'Cevap Bekleniyor', 'Cevaplandı'], def: 'Taslak' },
      { k: 'html', l: 'İçerik', t: 'textarea', hide: true, noForm: true, noExport: true },
    ],
    rowCls: r => r.durum === 'Cevap Bekleniyor' ? 'row-orange' : '',
    actions: [
      { l: 'Yazdır/PDF', fn: r => rp.evrakYazdir(r.html) },
      { l: 'Word', fn: r => rp.wordIndir(r.html, `${r.tur || 'evrak'}-${r.tarih}`) },
    ],
  },

  toplanti: {
    title: 'Toplantı', dateField: 'tarih_saat', label: r => `${fmtDate(r.tarih_saat)} ${r.konu}`,
    help: 'Kararlar alanına her satıra bir karar yazın. Görev oluşturmak için: Karar ; Sorumlu ; Son tarih (GG.AA.YYYY). Sonra "Kararları Göreve Çevir".',
    fields: [
      { k: 'tarih_saat', l: 'Tarih / Saat', t: 'datetime', req: true, def: () => nowLocal() },
      { k: 'yer', l: 'Yer', t: 'text', list: true, ph: 'Örn: Arapgir Kaymakamlığı' },
      { k: 'konu', l: 'Konu', t: 'text', req: true, wide: true, ph: 'Örn: Karla Mücadele Hazırlık Toplantısı' },
      { k: 'katilimcilar', l: 'Katılımcılar', t: 'textarea' },
      { k: 'kararlar', l: 'Kararlar', t: 'textarea', wide: true },
      { k: 'notlar', l: 'Notlar', t: 'textarea', hide: true },
    ],
    rowCls: r => r.tarih_saat > nowLocal() ? 'row-blue' : '',
    actions: [
      { l: 'Kararları Göreve Çevir', fn: kararlariGoreveCevir },
      { l: 'Tutanak', fn: r => rp.toplantiTutanagi(r) },
    ],
  },

  gorev: {
    title: 'Görev', dateField: 'son_tarih', label: r => r.baslik,
    fields: [
      { k: 'baslik', l: 'Ne yapılacak?', t: 'text', req: true, wide: true },
      { k: 'kimden', l: 'Kim istedi?', t: 'text', list: true },
      { k: 'sorumlu', l: 'Sorumlu', t: 'text', list: true },
      { k: 'son_tarih', l: 'Son Tarih', t: 'date' },
      { k: 'oncelik', l: 'Öncelik', t: 'select', o: ['Yüksek', 'Orta', 'Düşük'], def: 'Orta' },
      { k: 'durum', l: 'Durum', t: 'select', o: ['Açık', 'Devam Ediyor', 'Beklemede', 'Tamamlandı'], def: 'Açık' },
      { k: 'kaynak', l: 'Kaynak', t: 'text', hide: true },
      { k: 'detay', l: 'Detay', t: 'textarea', wide: true },
    ],
    rowCls: r => kapali(r.durum) ? 'row-muted' : !r.son_tarih ? '' : r.son_tarih < today() ? 'row-red' : r.son_tarih === today() ? 'row-orange' : '',
    sort: (a, b) => (kapali(a.durum) - kapali(b.durum)) || (a.son_tarih || '9999').localeCompare(b.son_tarih || '9999'),
    actions: [{ l: '✓ Bitti', show: r => !kapali(r.durum), fn: r => db.put('gorev', { ...r, durum: 'Tamamlandı', bitis: today() }) }],
  },

  hatirlatma: {
    title: 'Hatırlatma', dateField: 'tarih_saat', label: r => r.baslik,
    help: 'Zamanı gelen hatırlatmalar bildirim olarak gelir. Tekrarlı hatırlatma "Tamam" yapılınca bir sonraki tarihe kurulur. Telefonda uygulama kapalıyken de hatırlatma almak için Ayarlar > "Takvime aktar (.ics)".',
    fields: [
      { k: 'baslik', l: 'Hatırlatma', t: 'text', req: true, wide: true },
      { k: 'tarih_saat', l: 'Tarih / Saat', t: 'datetime', req: true, def: () => nowLocal(new Date(Date.now() + 3600e3)) },
      { k: 'tekrar', l: 'Tekrar', t: 'select', o: ['Yok', 'Her gün', 'Her hafta', 'Her ay', 'Her yıl'], def: 'Yok' },
      { k: 'aciklama', l: 'Açıklama', t: 'text' },
      { k: 'tamam', l: 'Tamamlandı', t: 'check' },
    ],
    rowCls: r => r.tamam ? 'row-muted' : r.tarih_saat <= nowLocal() ? 'row-red' : '',
    sort: (a, b) => (!!a.tamam - !!b.tamam) || (a.tarih_saat || '').localeCompare(b.tarih_saat || ''),
    beforeSave(r) {
      if (r.tamam && r.tekrar && r.tekrar !== 'Yok') {
        let t = r.tarih_saat;
        do { t = sonrakiTekrar(t, r.tekrar); } while (t && t <= nowLocal());
        if (t) return { ...r, tarih_saat: t, tamam: false };
      }
      return r;
    },
    actions: [{ l: '✓ Tamam', show: r => !r.tamam, fn: r => db.put('hatirlatma', SCHEMAS.hatirlatma.beforeSave({ ...r, tamam: true })) }],
  },

  not: {
    title: 'Not', dateField: 'tarih', label: r => r.baslik || (r.metin || '').slice(0, 40),
    fields: [
      { k: 'tarih', l: 'Tarih', t: 'date', def: today },
      { k: 'baslik', l: 'Başlık', t: 'text' },
      { k: 'etiket', l: 'Etiket', t: 'text', list: true },
      { k: 'metin', l: 'Not', t: 'textarea', req: true, wide: true },
    ],
  },
};

// ---- yardımcılar ----
function addDaysStr(s, n) { const d = new Date(s + 'T00:00'); d.setDate(d.getDate() + n); return d.toLocaleDateString('sv-SE'); }

function yakitOf(r) {
  const a = db.get('arac', r.arac);
  return a ? yakitAnalizi(r.litre, r.calisma, a.sayac, a.yakit_norm, (+dm.ayarlar().yakitTolerans || 15) / 100) : null;
}

function seferSupheli(r) { const m = dm.seferTeorikMax(r); return m != null && +r.sefer_sayisi > m; }

const hakedisOf = r => hakedisHesapla(r, dm.fiyat(r.fiyat_kodu, r.tarih));

const santiyeVerim = r => verimHesapla(r.planlanan_kubaj, dm.santiyeGerceklesen(r.id), r.baslama, r.bitis, today());
export { santiyeVerim };

const dahaYeniFiyatVar = r => db.all('birim_fiyat').some(x => x.id !== r.id &&
  normKod(x.kod) === normKod(r.kod) && x.gecerlilik > r.gecerlilik && x.gecerlilik <= today());

async function aracDurumGuncelle(aracId, kayit) {
  const arac = db.get('arac', aracId);
  if (!arac) return;
  const acik = db.all('ariza').filter(a => a.arac === aracId && a.durum !== 'Tamamlandı');
  let durum = arac.durum;
  if (acik.some(a => a.tur !== 'Periyodik Bakım')) durum = 'Arızalı';
  else if (acik.length) durum = 'Bakımda';
  else if (['Arızalı', 'Bakımda'].includes(arac.durum)) durum = 'Aktif';
  const upd = { ...arac, durum };
  if (kayit?.tur === 'Periyodik Bakım' && kayit.durum === 'Tamamlandı') {
    const t = kayit.bitis_tarihi || kayit.tarih;
    if (!arac.son_bakim || t > arac.son_bakim) upd.son_bakim = t;
  }
  if (upd.durum !== arac.durum || upd.son_bakim !== arac.son_bakim) {
    await db.put('arac', upd);
    toast(`${arac.plaka} durumu: ${upd.durum}`);
  }
}

async function kararlariGoreveCevir(t) {
  const satirlar = (t.kararlar || '').split('\n').map(s => s.trim()).filter(Boolean);
  if (!satirlar.length) return toast('Kararlar alanı boş', 'warn');
  const mevcut = new Set(db.all('gorev').filter(g => g.toplanti === t.id).map(g => g.baslik));
  const yeni = [];
  for (const s of satirlar) {
    const [baslik, sorumlu = '', tarih = ''] = s.split(';').map(x => x.trim());
    if (!baslik || mevcut.has(baslik)) continue;
    const m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(tarih);
    yeni.push({ baslik, sorumlu, son_tarih: m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : '',
      kimden: t.yer || '', oncelik: 'Orta', durum: 'Açık', kaynak: 'Toplantı: ' + t.konu, toplanti: t.id });
  }
  if (!yeni.length) return toast('Yeni görev yok (hepsi daha önce eklenmiş)', 'warn');
  await db.putMany('gorev', yeni);
  toast(`${yeni.length} görev oluşturuldu`, 'ok');
}

export const refLabel = label;

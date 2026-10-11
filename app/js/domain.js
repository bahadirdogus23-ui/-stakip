// Tablolar arası iş kuralları: fiyat sorgusu, sefer miktarı, ilerleme, ayarlar.
import * as db from './db.js';
import { fiyatAt, cevrimSuresiDk, teorikMaxSefer, nakliyeSimulasyonu, VARSAYILAN_CEVRIM } from './calc.js';
import { today } from './util.js';

export const VARSAYILAN_AYARLAR = {
  kurum: 'MALATYA BÜYÜKŞEHİR BELEDİYESİ',
  daire: 'Yol Yapım Bakım ve Onarım Dairesi Başkanlığı',
  birim: 'Arapgir Kırsal Yol Bakım Onarım Şefliği',
  imzaAd: '',
  imzaUnvan: 'Kırsal Yol Bakım Onarım Şefi',
  ilce: 'Arapgir',
  yakitTolerans: 15,
  sunucu: '',
  token: '',
  otoSync: true,
};
export const ayarlar = () => ({ ...VARSAYILAN_AYARLAR, ...db.getMeta('ayarlar', {}) });

// Standart birim fiyat kodları (hesaplamalarda kullanılır).
export const FIYAT_KODLARI = {
  MOTORIN: 'Motorin (₺/L)',
  SOFOR_GUNLUK: 'Şoför günlük ücreti (₺/gün)',
  OPERATOR_SAAT: 'Operatör saat ücreti (₺/saat)',
  KAMYON_AMORTISMAN_SAAT: 'Kamyon amortismanı (₺/saat)',
  ALT_TEMEL_M3: 'Alt temel malzemesi (₺/m³)',
  TAS_TOZU_TON: 'Taş tozu (₺/ton)',
  CIMENTO_TON: 'Çimento (₺/ton)',
  TUZ_TON: 'Yol tuzu (₺/ton)',
  ASFALT_TON: 'Asfalt (₺/ton)',
};

export const fiyat = (kod, tarih = today()) => fiyatAt(db.all('birim_fiyat'), kod, tarih);

export function planFiyatlari(tarih) {
  return {
    motorin: fiyat('MOTORIN', tarih),
    amortismanSaat: fiyat('KAMYON_AMORTISMAN_SAAT', tarih),
    soforGunluk: fiyat('SOFOR_GUNLUK', tarih),
  };
}

export const planSim = p => nakliyeSimulasyonu(p, planFiyatlari(p.baslama || today()));

// Seferde taşınan miktar: girilmişse o, yoksa sefer × araç (veya plan) kapasitesi.
export function seferM3(s) {
  if (s.miktar_m3 !== '' && s.miktar_m3 != null) return +s.miktar_m3 || 0;
  const kap = +db.get('arac', s.arac)?.kapasite_m3 || +db.get('nakliye_plan', s.plan)?.kapasite_m3 || 0;
  return (+s.sefer_sayisi || 0) * kap;
}

// Plakanın vardiyada atabileceği azami teorik sefer (şişirilmiş beyan denetimi).
export function seferTeorikMax(s) {
  const plan = db.get('nakliye_plan', s.plan) || {};
  const mesafe = s.mesafe_km !== '' && s.mesafe_km != null ? s.mesafe_km : plan.mesafe_km;
  if (!(+mesafe > 0)) return null;
  const p = { ...VARSAYILAN_CEVRIM, ...stripEmpty(plan), mesafe_km: mesafe };
  return teorikMaxSefer(s.vardiya_saat || plan.vardiya_saat, cevrimSuresiDk(p));
}

const stripEmpty = o => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== '' && v != null));

export const planGerceklesen = planId =>
  db.all('sefer').filter(s => s.plan === planId).reduce((t, s) => t + seferM3(s), 0);

export function santiyeGerceklesen(santiyeId) {
  const planlar = new Set(db.all('nakliye_plan').filter(p => p.santiye === santiyeId).map(p => p.id));
  return db.all('sefer').filter(s => planlar.has(s.plan)).reduce((t, s) => t + seferM3(s), 0);
}

export const operatorleri = aracId =>
  db.all('personel').filter(p => p.zimmetli_arac === aracId && p.durum !== 'Ayrıldı').map(p => p.ad_soyad);

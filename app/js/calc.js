// Saf hesaplama fonksiyonları (arayüzden bağımsız, birim testleri tests/ altında).

const num = v => (v === '' || v == null || isNaN(+v)) ? 0 : +v;
const orDef = (v, d) => (v === '' || v == null || isNaN(+v)) ? d : +v;

export const VARSAYILAN_CEVRIM = { hiz_kmsa: 30, yukleme_dk: 8, bosaltma_dk: 4, manevra_dk: 5, vardiya_saat: 8 };

// Bir seferin dakika cinsinden çevrim süresi: gidiş-dönüş yolculuk + yükleme + boşaltma + manevra.
export function cevrimSuresiDk(p) {
  const d = VARSAYILAN_CEVRIM;
  const hiz = orDef(p.hiz_kmsa, d.hiz_kmsa) || d.hiz_kmsa;
  return num(p.mesafe_km) / hiz * 60
    + orDef(p.yukleme_dk, d.yukleme_dk) + orDef(p.bosaltma_dk, d.bosaltma_dk) + orDef(p.manevra_dk, d.manevra_dk);
}

// Bir kamyonun bir vardiyada atabileceği azami teorik sefer sayısı.
export function teorikMaxSefer(vardiyaSaat, cevrimDk) {
  if (!(cevrimDk > 0)) return Infinity;
  return Math.floor(orDef(vardiyaSaat, VARSAYILAN_CEVRIM.vardiya_saat) * 60 / cevrimDk);
}

// Nakliye simülasyonu. fiyat: { motorin (₺/L), amortismanSaat (₺/kamyon-saat), soforGunluk (₺/gün) }
export function nakliyeSimulasyonu(p, fiyat = {}) {
  const miktarM3 = p.birim === 'ton' ? num(p.toplam_miktar) / (num(p.yogunluk) || 1.8) : num(p.toplam_miktar);
  const kapasite = num(p.kapasite_m3);
  const cevrimDk = cevrimSuresiDk(p);
  const kamyonGunlukSefer = teorikMaxSefer(p.vardiya_saat, cevrimDk);
  const toplamSefer = kapasite > 0 ? Math.ceil(miktarM3 / kapasite) : 0;
  const kamyon = Math.max(1, Math.round(num(p.kamyon_sayisi)) || 1);

  if (!kapasite) return { hata: 'Kamyon kapasitesi girilmeli', miktarM3, cevrimDk, toplamSefer };
  if (kamyonGunlukSefer < 1) return { hata: 'Çevrim süresi vardiyadan uzun', miktarM3, cevrimDk, toplamSefer };

  const gunlukSefer = kamyonGunlukSefer * kamyon;
  const tamamlanmaGun = Math.ceil(toplamSefer / gunlukSefer);
  const hedefGun = num(p.hedef_gun);
  const gerekliKamyon = hedefGun > 0 ? Math.ceil(toplamSefer / (kamyonGunlukSefer * hedefGun)) : null;
  const kamyonSaat = toplamSefer * cevrimDk / 60;
  const yakitLt = toplamSefer * num(p.mesafe_km) * orDef(p.yakit_lt_km, 0.35);
  const yakitTL = yakitLt * num(fiyat.motorin);
  const amortismanTL = kamyonSaat * num(fiyat.amortismanSaat);
  const personelTL = kamyon * tamamlanmaGun * num(fiyat.soforGunluk);
  const toplamTL = yakitTL + amortismanTL + personelTL;
  return {
    miktarM3, cevrimDk, kamyonGunlukSefer, gunlukSefer, toplamSefer, tamamlanmaGun, gerekliKamyon,
    kamyonSaat, yakitLt, yakitTL, amortismanTL, personelTL, toplamTL,
    m3Maliyet: miktarM3 ? toplamTL / miktarM3 : 0,
  };
}

// Kod/plaka normalizasyonu: Türkçe klavyede "motorin" -> "MOTORIN" (noktalı İ değil).
export const normKod = s => String(s ?? '').trim().toLocaleUpperCase('tr-TR').replace(/İ/g, 'I');

// Tarihsel versiyonlama: verilen tarihte geçerli olan en son birim fiyat.
export function fiyatAt(fiyatlar, kod, tarih) {
  if (!kod) return null;
  const k = normKod(kod);
  const t = (tarih || '9999-12-31').slice(0, 10);
  let best = null;
  for (const f of fiyatlar) {
    if (normKod(f.kod) !== k) continue;
    if (!f.gecerlilik || f.gecerlilik > t) continue;
    if (!best || f.gecerlilik > best.gecerlilik) best = f;
  }
  return best ? num(best.fiyat) : null;
}

// Yakıt tüketim analizi. sayac: 'Saat' -> L/saat, 'Km' -> L/100 km. tolerans: 0.15 = %15
export function yakitAnalizi(litre, calisma, sayac, norm, tolerans = 0.15) {
  if (!(num(calisma) > 0) || !(num(litre) > 0)) return null;
  const tuketim = sayac === 'Km' ? num(litre) / num(calisma) * 100 : num(litre) / num(calisma);
  if (!(num(norm) > 0)) return { tuketim, sapma: null, normDisi: false };
  const sapma = (tuketim - num(norm)) / num(norm);
  return { tuketim, sapma, normDisi: sapma > tolerans };
}

// Hakediş: brüt (KDV hariç) tutardan KDV eklenir, kesintiler düşülür.
// Oranlar yüzde (%), damga binde (‰), KDV tevkifatı x/10 olarak girilir.
export function hakedisHesapla(h, birimFiyat = null) {
  const fiyat = !(h.birim_fiyat === '' || h.birim_fiyat == null) ? num(h.birim_fiyat) : num(birimFiyat);
  const brut = !(h.brut_manuel === '' || h.brut_manuel == null) ? num(h.brut_manuel) : num(h.miktar) * fiyat;
  const kdv = brut * orDef(h.kdv_orani, 20) / 100;
  const tevkifat = kdv * orDef(h.tevkifat_pay, 0) / 10;
  const damga = brut * orDef(h.damga_binde, 9.48) / 1000;
  const stopaj = brut * orDef(h.stopaj_orani, 0) / 100;
  const teminat = brut * orDef(h.teminat_orani, 0) / 100;
  const avans = num(h.avans_mahsup);
  const diger = num(h.diger_kesinti);
  const tahakkuk = brut + kdv;
  const toplamKesinti = tevkifat + damga + stopaj + teminat + avans + diger;
  return { fiyat, brut, kdv, tahakkuk, tevkifat, damga, stopaj, teminat, avans, diger, toplamKesinti, net: tahakkuk - toplamKesinti };
}

const dayMs = 86400000;
const toUtc = s => { const [y, m, d] = s.slice(0, 10).split('-').map(Number); return Date.UTC(y, m - 1, d); };
export const gunFarki = (a, b) => Math.round((toUtc(b) - toUtc(a)) / dayMs);

// Planlanan / gerçekleşen ve zamana göre beklenen ilerleme -> verim oranı.
export function verimHesapla(planlanan, gerceklesen, baslama, bitis, bugun) {
  const gercekOran = num(planlanan) > 0 ? num(gerceklesen) / num(planlanan) : null;
  let beklenenOran = null;
  if (baslama && bitis && bugun) {
    const toplam = gunFarki(baslama, bitis);
    beklenenOran = toplam > 0 ? Math.min(1, Math.max(0, gunFarki(baslama, bugun) / toplam)) : 1;
  }
  const verim = gercekOran != null && beklenenOran > 0 ? gercekOran / beklenenOran : null;
  return { gercekOran, beklenenOran, verim };
}

// Tekrarlayan hatırlatmanın bir sonraki tarihi ("YYYY-MM-DDTHH:MM").
export function sonrakiTekrar(tarihSaat, tekrar) {
  const d = new Date(tarihSaat);
  if (tekrar === 'Her gün') d.setDate(d.getDate() + 1);
  else if (tekrar === 'Her hafta') d.setDate(d.getDate() + 7);
  else if (tekrar === 'Her ay') d.setMonth(d.getMonth() + 1);
  else if (tekrar === 'Her yıl') d.setFullYear(d.getFullYear() + 1);
  else return null;
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export const dakikaFarki = (a, b) => (a && b) ? Math.round((new Date(b) - new Date(a)) / 60000) : null;

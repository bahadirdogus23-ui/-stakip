// Yazdırılabilir (PDF) raporlar ve resmi yazı düzeni.
import * as db from './db.js';
import { esc, fmtDate, fmtNum, fmtTL, today, printHtml, download, fileSafe } from './util.js';
import * as dm from './domain.js';

// k: koddaki sabit etiket (HTML olabilir), v: önceden kaçışlanmış değer
const satir = (k, v) => `<tr><th>${k}</th><td>${v}</td></tr>`;

export function kurumBaslik() {
  const a = dm.ayarlar();
  return `<div class="doc-head">T.C.<br>${esc(a.kurum)}<br>${esc(a.daire)}<br>${esc(a.birim)}</div>`;
}

export function imzaBlok() {
  const a = dm.ayarlar();
  return `<div class="doc-sign">${esc(a.imzaAd) || '&nbsp;'}<br>${esc(a.imzaUnvan)}</div>`;
}

export function raporSayfa(baslik, govde) {
  return `<div class="doc">${kurumBaslik()}<h2 class="doc-title">${esc(baslik)}</h2>${govde}
    <p class="doc-foot">Rapor tarihi: ${fmtDate(today())}</p>${imzaBlok()}</div>`;
}

export function planRaporu(p) {
  const s = dm.planSim(p);
  const f = dm.planFiyatlari(p.baslama || today());
  const gerc = dm.planGerceklesen(p.id);
  const santiye = db.get('santiye', p.santiye);
  const fiyatYok = Object.entries(f).filter(([, v]) => v == null).map(([k]) => k);
  printHtml(raporSayfa('NAKLİYE SİMÜLASYON RAPORU', `
    <h3>Girdiler</h3><table class="doc-table">
    ${satir('Plan', esc(p.ad))}${satir('Şantiye', esc(santiye ? santiye.proje_kodu + ' - ' + santiye.ad : '-'))}
    ${satir('Malzeme / Ocak', esc((p.malzeme || '') + ' / ' + (p.ocak || '')))}
    ${satir('Toplam miktar', `${fmtNum(p.toplam_miktar)} ${esc(p.birim)} (${fmtNum(s.miktarM3)} m³)`)}
    ${satir('Gidiş-dönüş mesafe', fmtNum(p.mesafe_km) + ' km')}${satir('Kamyon kapasitesi', fmtNum(p.kapasite_m3) + ' m³/sefer')}
    ${satir('Yükleme / boşaltma / manevra', `${p.yukleme_dk} / ${p.bosaltma_dk} / ${p.manevra_dk} dk`)}
    ${satir('Vardiya / mevcut kamyon', `${p.vardiya_saat} saat / ${p.kamyon_sayisi} adet`)}</table>
    <h3>Sonuçlar</h3>${s.hata ? `<p class="red">HATA: ${esc(s.hata)}</p>` : `<table class="doc-table">
    ${satir('Çevrim süresi', fmtNum(s.cevrimDk, 1) + ' dk')}
    ${satir('Kamyon başına günlük sefer', s.kamyonGunlukSefer)}${satir('Günlük toplam sefer', s.gunlukSefer)}
    ${satir('Toplam sefer', s.toplamSefer)}${satir('Tahmini tamamlanma', s.tamamlanmaGun + ' gün')}
    ${satir('Hedef süre için gerekli kamyon', s.gerekliKamyon ?? '-')}
    ${satir('Yakıt', `${fmtNum(s.yakitLt, 0)} L = ${fmtTL(s.yakitTL)}`)}${satir('Amortisman', fmtTL(s.amortismanTL))}
    ${satir('Personel', fmtTL(s.personelTL))}${satir('<b>Toplam nakliye maliyeti</b>', '<b>' + fmtTL(s.toplamTL) + '</b>')}
    ${satir('m³ başına maliyet', fmtTL(s.m3Maliyet))}</table>`}
    ${fiyatYok.length ? `<p class="red">Uyarı: Birim fiyat tablosunda eksik fiyat: ${fiyatYok.join(', ')} (0 kabul edildi)</p>` : ''}
    <h3>İlerleme</h3><table class="doc-table">
    ${satir('Taşınan', fmtNum(gerc) + ' m³')}${satir('Kalan iş', s.miktarM3 ? '%' + fmtNum(Math.max(0, 1 - gerc / s.miktarM3) * 100, 1) : '-')}</table>`));
}

export function hakedisRaporu(h, x) {
  const santiye = db.get('santiye', h.santiye);
  printHtml(raporSayfa('HAKEDİŞ ÖZETİ', `<table class="doc-table">
    ${satir('Hakediş No / Dönem', esc(`${h.no || '-'} / ${h.donem || '-'}`))}${satir('Tarih', fmtDate(h.tarih))}
    ${satir('Yüklenici', esc(h.yuklenici))}${satir('Şantiye', esc(santiye ? santiye.proje_kodu + ' - ' + santiye.ad : '-'))}
    ${satir('İş kalemi', esc(h.is_kalemi || '-'))}
    ${satir('Miktar × Birim fiyat', `${fmtNum(h.miktar)} ${esc(h.birim || '')} × ${fmtTL(x.fiyat)}`)}
    ${satir('<b>Brüt tutar (KDV hariç)</b>', '<b>' + fmtTL(x.brut) + '</b>')}
    ${satir(`KDV (%${h.kdv_orani || 20})`, fmtTL(x.kdv))}${satir('<b>Tahakkuk (KDV dahil)</b>', '<b>' + fmtTL(x.tahakkuk) + '</b>')}
    <tr><th colspan="2" style="text-align:left">KESİNTİLER</th></tr>
    ${satir(`KDV tevkifatı (${h.tevkifat_pay || 0}/10)`, fmtTL(x.tevkifat))}${satir(`Damga vergisi (‰${h.damga_binde ?? 9.48})`, fmtTL(x.damga))}
    ${satir(`Stopaj (%${h.stopaj_orani || 0})`, fmtTL(x.stopaj))}${satir(`Teminat (%${h.teminat_orani || 0})`, fmtTL(x.teminat))}
    ${satir('Avans mahsubu', fmtTL(x.avans))}${satir('Diğer', fmtTL(x.diger))}
    ${satir('<b>Toplam kesinti</b>', '<b>' + fmtTL(x.toplamKesinti) + '</b>')}
    ${satir('<b>NET ÖDENECEK</b>', '<b>' + fmtTL(x.net) + '</b>')}</table>
    ${h.aciklama ? `<p>${esc(h.aciklama)}</p>` : ''}`));
}

export function toplantiTutanagi(t) {
  const kararlar = (t.kararlar || '').split('\n').filter(s => s.trim())
    .map((s, i) => { const [k, sor, tar] = s.split(';').map(x => x.trim()); return `<tr><td>${i + 1}</td><td>${esc(k)}</td><td>${esc(sor || '')}</td><td>${esc(tar || '')}</td></tr>`; }).join('');
  const katilim = (t.katilimcilar || '').split(/\n|,/).map(s => s.trim()).filter(Boolean);
  printHtml(raporSayfa('TOPLANTI TUTANAĞI', `<table class="doc-table">
    ${satir('Tarih / Saat', fmtDate(t.tarih_saat))}${satir('Yer', esc(t.yer || ''))}${satir('Konu', esc(t.konu))}</table>
    <h3>Alınan Kararlar</h3><table class="doc-table"><tr><th>#</th><th>Karar</th><th>Sorumlu</th><th>Termin</th></tr>${kararlar || '<tr><td colspan="4">-</td></tr>'}</table>
    ${t.notlar ? `<h3>Notlar</h3><p style="white-space:pre-wrap">${esc(t.notlar)}</p>` : ''}
    <h3>Katılımcılar</h3><table class="doc-table sign-table">${katilim.map(k => `<tr><td>${esc(k)}</td><td style="width:40%">İmza:</td></tr>`).join('') || '<tr><td>-</td></tr>'}</table>`));
}

export const evrakYazdir = html => printHtml(`<div class="doc">${html}</div>`);

// Word, HTML içerikli .doc dosyalarını doğrudan açar ve düzenlenebilir.
export function wordIndir(html, ad) {
  const doc = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8">
  <style>body{font-family:"Times New Roman";font-size:12pt}.doc-head{text-align:center;font-weight:bold}
  .doc-table{border-collapse:collapse;width:100%}.doc-table td,.doc-table th{border:1px solid #000;padding:3pt;text-align:left}
  .doc-sign{margin-left:60%;text-align:center;margin-top:30pt}.doc-right{text-align:right}</style></head><body>${html}</body></html>`;
  download('﻿' + doc, fileSafe(ad) + '.doc', 'application/msword');
}

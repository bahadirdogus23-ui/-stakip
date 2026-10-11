// Hatırlatma motoru: tüm tablolardan uyarı toplar, zamanı gelenler için bildirim
// gösterir ve telefon takvimine aktarılabilen .ics dosyası üretir.
import * as db from './db.js';
import { santiyeVerim } from './schemas.js';
import * as dm from './domain.js';
import { today, nowLocal, addDays, fmtDate, download } from './util.js';
import { gunFarki, yakitAnalizi, normKod } from './calc.js';

// level: 'red' (acil/gecikmiş), 'orange' (yaklaşan), 'info' (bilgi)
export function collect() {
  const out = [];
  const add = (id, level, title, detail, nav) => out.push({ id, level, title, detail, nav });
  const t = today(), now = nowLocal(), in3 = addDays(t, 3), in7 = addDays(t, 7), in15 = addDays(t, 15);

  for (const g of db.all('gorev')) {
    if (g.durum === 'Tamamlandı' || !g.son_tarih) continue;
    const kim = g.kimden ? ` (${g.kimden})` : '';
    if (g.son_tarih < t) add('g-' + g.id, 'red', `Gecikmiş görev: ${g.baslik}`, `Son tarih ${fmtDate(g.son_tarih)}${kim}`, 'ajanda/gorev');
    else if (g.son_tarih === t) add('g-' + g.id, 'orange', `Bugün: ${g.baslik}`, `Son tarih bugün${kim}`, 'ajanda/gorev');
    else if (g.son_tarih <= in3) add('g-' + g.id, 'info', `Yaklaşan görev: ${g.baslik}`, `Son tarih ${fmtDate(g.son_tarih)}${kim}`, 'ajanda/gorev');
  }

  for (const h of db.all('hatirlatma')) {
    if (h.tamam || !h.tarih_saat) continue;
    if (h.tarih_saat <= now) add('h-' + h.id + h.tarih_saat, 'red', `⏰ ${h.baslik}`, `${fmtDate(h.tarih_saat)} ${h.aciklama || ''}`, 'ajanda/hatirlatma');
    else if (h.tarih_saat.slice(0, 10) === t) add('h-' + h.id + h.tarih_saat, 'orange', `⏰ Bugün ${h.tarih_saat.slice(11)}: ${h.baslik}`, h.aciklama || '', 'ajanda/hatirlatma');
  }

  for (const a of db.all('arac')) {
    if (a.son_bakim && a.bakim_periyot_gun) {
      const s = addDays(a.son_bakim, +a.bakim_periyot_gun);
      if (s < t) add('ab-' + a.id + s, 'red', `Bakımı geçmiş: ${a.plaka}`, `Bakım tarihi ${fmtDate(s)} idi`, 'filo/arac');
      else if (s <= in7) add('ab-' + a.id + s, 'orange', `Bakım yaklaşıyor: ${a.plaka}`, `Bakım tarihi ${fmtDate(s)}`, 'filo/arac');
    }
    for (const [k, ad] of [['muayene_bitis', 'Muayene'], ['sigorta_bitis', 'Sigorta']]) {
      if (!a[k]) continue;
      if (a[k] < t) add(k + a.id + a[k], 'red', `${ad} süresi dolmuş: ${a.plaka}`, fmtDate(a[k]), 'filo/arac');
      else if (a[k] <= in15) add(k + a.id + a[k], 'orange', `${ad} bitiyor: ${a.plaka}`, fmtDate(a[k]), 'filo/arac');
    }
  }

  for (const r of db.all('ariza')) {
    if (r.durum === 'Tamamlandı') continue;
    const gun = r.tarih ? gunFarki(r.tarih, t) : 0;
    const plaka = db.get('arac', r.arac)?.plaka || '';
    if (r.durum === 'Parça Bekliyor' || gun >= 3)
      add('ar-' + r.id, gun >= 7 ? 'red' : 'orange', `Yatan araç: ${plaka}`, `${gun} gündür ${r.durum.toLocaleLowerCase('tr-TR')} — ${r.tur || ''} ${r.yedek_parca ? '· Parça: ' + r.yedek_parca : ''}`, 'filo/ariza');
  }

  for (const o of db.all('olay')) {
    if (o.durum === 'Çözüldü') continue;
    add('o-' + o.id, 'red', `🚨 Açık olay: ${o.kategori} — ${o.konum}`, `${fmtDate(o.tarih_saat)} · ${o.durum}`, 'saha/olay');
  }

  const tol = (+dm.ayarlar().yakitTolerans || 15) / 100;
  for (const y of db.all('yakit')) {
    if (!y.tarih || y.tarih < addDays(t, -7)) continue;
    const a = db.get('arac', y.arac);
    const an = a && yakitAnalizi(y.litre, y.calisma, a.sayac, a.yakit_norm, tol);
    if (an?.normDisi) add('y-' + y.id, 'orange', `Norm dışı yakıt: ${a.plaka}`, `${fmtDate(y.tarih)} · sapma %${Math.round(an.sapma * 100)}`, 'filo/yakit');
  }

  for (const s of db.all('sefer')) {
    if (!s.tarih || s.tarih < addDays(t, -7)) continue;
    const m = dm.seferTeorikMax(s);
    if (m != null && +s.sefer_sayisi > m)
      add('s-' + s.id, 'red', `Sefer denetimi: ${db.get('arac', s.arac)?.plaka || ''}`, `${fmtDate(s.tarih)} · beyan ${s.sefer_sayisi}, teorik azami ${m}`, 'nakliye/sefer');
  }

  for (const s of db.all('santiye')) {
    if (s.durum !== 'Devam Ediyor') continue;
    const v = santiyeVerim(s).verim;
    if (v != null && v < 0.8) add('sv-' + s.id, 'orange', `Geride kalan şantiye: ${s.proje_kodu}`, `Plana göre verim %${Math.round(v * 100)}`, 'finans/verim');
    if (s.bitis && s.bitis < t) add('sb-' + s.id, 'orange', `Bitiş tarihi geçti: ${s.proje_kodu} ${s.ad}`, fmtDate(s.bitis), 'saha/santiye');
  }

  for (const m of db.all('toplanti')) {
    if (m.tarih_saat > now && m.tarih_saat.slice(0, 10) <= addDays(t, 1))
      add('t-' + m.id, 'orange', `Toplantı: ${m.konu}`, `${fmtDate(m.tarih_saat)} · ${m.yer || ''}`, 'evrak/toplanti');
  }

  for (const e of db.all('evrak')) {
    if (e.durum === 'Cevap Bekleniyor' && e.tarih && gunFarki(e.tarih, t) >= 10)
      add('e-' + e.id, 'info', `Cevap bekleniyor: ${e.konu}`, `${e.muhatap} · ${gunFarki(e.tarih, t)} gün oldu`, 'evrak/evrak');
  }

  // Kış dönemi (Kasım–Mart): yarın için vardiya planlanmış mı?
  const ay = new Date().getMonth() + 1;
  if (ay >= 11 || ay <= 3) {
    const yarin = addDays(t, 1);
    if (!db.all('vardiya').some(v => v.tarih === yarin))
      add('kv-' + yarin, 'info', 'Yarın için kış vardiyası planlanmadı', fmtDate(yarin), 'saha/vardiya');
  }

  const motorin = db.all('birim_fiyat').filter(f => normKod(f.kod) === 'MOTORIN').map(f => f.gecerlilik).sort().pop();
  if (!motorin) add('bf-yok', 'info', 'Motorin birim fiyatı girilmemiş', 'Nakliye ve yakıt maliyetleri için gerekli', 'finans/birim_fiyat');
  else if (gunFarki(motorin, t) > 30) add('bf-' + motorin, 'info', 'Motorin fiyatı 30 günden eski', `Son güncelleme ${fmtDate(motorin)}`, 'finans/birim_fiyat');

  const bekleyen = db.dirty().length;
  const sonSync = db.getMeta('sonSync', 0);
  if (bekleyen && Date.now() - sonSync > 86400e3) add('sync', 'info', `${bekleyen} değişiklik sunucuya gönderilmedi`, 'İnternet olduğunda "Senkronize" butonuna basın', 'ayar/ayarlar');
  const sonYedek = db.getMeta('sonYedek', 0);
  if (Date.now() - sonYedek > 7 * 86400e3) add('yedek', 'info', 'Haftalık yedek alınmadı', 'Ayarlar > Yedek Al', 'ayar/ayarlar');

  const order = { red: 0, orange: 1, info: 2 };
  return out.sort((a, b) => order[a.level] - order[b.level]);
}

// ---- Bildirimler ----
const notified = new Set(JSON.parse(localStorageGet('bildirilen') || '[]'));
function localStorageGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function localStorageSet(k, v) { try { localStorage.setItem(k, v); } catch { /* yoksay */ } }

export async function bildirimIzniIste() {
  if (!('Notification' in window)) return 'desteklenmiyor';
  return Notification.requestPermission();
}

async function bildir(title, body, tag) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return false;
  const reg = await navigator.serviceWorker?.getRegistration();
  if (reg) await reg.showNotification(title, { body, tag, icon: 'icon.svg', badge: 'icon.svg', requireInteraction: true });
  else new Notification(title, { body, tag });
  return true;
}

// Yeni çıkan kırmızı/turuncu uyarılar için bir kez bildirim gönder.
export async function bildirimKontrol(onToast) {
  const yeni = collect().filter(a => a.level !== 'info' && !notified.has(a.id));
  yeni.forEach(a => notified.add(a.id));
  if (!yeni.length) return;
  const izinli = 'Notification' in window && Notification.permission === 'granted';
  if (izinli) {
    for (const a of yeni.slice(0, 5)) await bildir(a.title, a.detail, a.id);
    if (yeni.length > 5) await bildir(`${yeni.length - 5} uyarı daha var`, 'Panel sekmesine bakın', 'cok');
  } else if (onToast) {
    // Bildirim izni yoksa ekranı kaplamamak için tek özet göster.
    onToast(yeni.length === 1 ? yeni[0] : { level: yeni.some(a => a.level === 'red') ? 'red' : 'orange',
      title: `${yeni.length} yeni uyarı`, detail: 'Panel > Hatırlatmalar ve Uyarılar' });
  }
  localStorageSet('bildirilen', JSON.stringify([...notified].slice(-500)));
}

// ---- Takvim (.ics): telefonun takvimi uygulama kapalıyken de alarm verir ----
export function icsIndir() {
  const ev = [];
  const icsEsc = s => String(s || '').replace(/[\\;,]/g, m => '\\' + m).replace(/\n/g, '\\n');
  const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
  const push = (uid, start, title, desc, allDay) => {
    const dt = allDay ? `DTSTART;VALUE=DATE:${start.slice(0, 10).replace(/-/g, '')}`
      : `DTSTART:${start.replace(/[-:]/g, '').slice(0, 13)}00`;
    ev.push(['BEGIN:VEVENT', `UID:${uid}@kirsal-yol-bakim`, `DTSTAMP:${stamp}`, dt, `SUMMARY:${icsEsc(title)}`, `DESCRIPTION:${icsEsc(desc)}`,
      'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsEsc(title)}`, allDay ? 'TRIGGER:PT8H' : 'TRIGGER:-PT15M', 'END:VALARM', 'END:VEVENT'].join('\r\n'));
  };
  const t = today();
  for (const h of db.all('hatirlatma')) if (!h.tamam && h.tarih_saat >= t) push('h' + h.id, h.tarih_saat, h.baslik, h.aciklama, false);
  for (const g of db.all('gorev')) if (g.durum !== 'Tamamlandı' && g.son_tarih >= t) push('g' + g.id, g.son_tarih, 'Görev: ' + g.baslik, g.detay, true);
  for (const m of db.all('toplanti')) if (m.tarih_saat >= t) push('t' + m.id, m.tarih_saat, 'Toplantı: ' + m.konu, m.yer, false);
  for (const a of db.all('arac')) {
    if (a.son_bakim && a.bakim_periyot_gun) { const s = addDays(a.son_bakim, +a.bakim_periyot_gun); if (s >= t) push('ab' + a.id + s, s, 'Bakım: ' + a.plaka, a.cinsi, true); }
    if (a.muayene_bitis >= t) push('am' + a.id, addDays(a.muayene_bitis, -7), 'Muayene bitiyor: ' + a.plaka, 'Bitiş ' + fmtDate(a.muayene_bitis), true);
    if (a.sigorta_bitis >= t) push('as' + a.id, addDays(a.sigorta_bitis, -7), 'Sigorta bitiyor: ' + a.plaka, 'Bitiş ' + fmtDate(a.sigorta_bitis), true);
  }
  const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Kirsal Yol Bakim//TR', 'CALSCALE:GREGORIAN', ...ev, 'END:VCALENDAR'].join('\r\n');
  download(ics, `hatirlatmalar-${t}.ics`, 'text/calendar');
  return ev.length;
}


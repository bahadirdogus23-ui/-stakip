// Özel ekranlar: Panel, Güzergah Lejantı, Verim Raporu, Ayarlar.
import * as db from './db.js';
import { SCHEMAS, ISLEM_RENK, santiyeVerim } from './schemas.js';
import * as dm from './domain.js';
import { collect, icsIndir, bildirimIzniIste } from './reminders.js';
import { sync } from './sync.js';
import { esc, fmtDate, fmtNum, today, toast, download, printHtml } from './util.js';
import { tableHtml, exportXlsx, columns } from './ui.js';
import { raporSayfa } from './reports.js';
import { ornekVeriYukle } from './demo.js';

// ---------------- PANEL ----------------
export function panelView(root) {
  function refresh() {
    const araclar = db.all('arac');
    const yatan = araclar.filter(a => ['Arızalı', 'Bakımda', 'Yatan (Kullanım Dışı)'].includes(a.durum));
    const gorevler = db.all('gorev').filter(g => g.durum !== 'Tamamlandı');
    const olaylar = db.all('olay').filter(o => o.durum !== 'Çözüldü');
    const bugunSefer = db.all('sefer').filter(s => s.tarih === today());
    const uyarilar = collect();
    const kpi = [
      ['Aktif araç', `${araclar.length - yatan.length} / ${araclar.length}`, 'filo/arac', ''],
      ['Arızalı / bakımda', yatan.length, 'filo/ariza', yatan.length ? 'red' : ''],
      ['Açık olay/ihbar', olaylar.length, 'saha/olay', olaylar.length ? 'red' : ''],
      ['Açık görev', gorevler.length, 'ajanda/gorev', ''],
      ['Geciken görev', gorevler.filter(g => g.son_tarih && g.son_tarih < today()).length, 'ajanda/gorev', gorevler.some(g => g.son_tarih && g.son_tarih < today()) ? 'red' : ''],
      ['Bugün sefer', bugunSefer.reduce((t, s) => t + (+s.sefer_sayisi || 0), 0), 'nakliye/sefer', ''],
      ['Bugün taşınan m³', fmtNum(bugunSefer.reduce((t, s) => t + dm.seferM3(s), 0), 0), 'nakliye/sefer', ''],
      ['Aktif şantiye', db.all('santiye').filter(s => s.durum === 'Devam Ediyor').length, 'saha/santiye', ''],
    ];
    root.innerHTML = `
      <div class="quickbar">
        <a class="btn danger" href="#saha/olay?yeni=ihbar">🚨 Acil İhbar</a>
        <a class="btn" href="#nakliye/sefer">+ Sefer</a><a class="btn" href="#filo/yakit">+ Yakıt</a>
        <a class="btn" href="#filo/ariza">+ Arıza</a><a class="btn" href="#ajanda/gorev">+ Görev</a>
        <a class="btn" href="#ajanda/hatirlatma">+ Hatırlatma</a><a class="btn" href="#ajanda/not">+ Not</a>
      </div>
      <div class="kpis">${kpi.map(([l, n, nav, cls]) => `<a class="kpi ${cls}" href="#${nav}"><b>${n}</b><span>${l}</span></a>`).join('')}</div>
      <div class="panel-grid">
        <section class="card"><h3>🔔 Hatırlatmalar ve Uyarılar (${uyarilar.length})</h3>
          ${uyarilar.length ? `<ul class="alerts">${uyarilar.map(a => `<li class="${a.level}"><a href="#${a.nav}"><b>${esc(a.title)}</b><span>${esc(a.detail)}</span></a></li>`).join('')}</ul>` : '<div class="empty">Uyarı yok 👍</div>'}
        </section>
        <section class="card"><h3>🚜 Araç – Operatör – Şantiye Tahsisi</h3>
          ${araclar.length ? `<div class="table-wrap">${tableHtml([
            { l: 'Plaka', t: 's', f: a => a.plaka }, { l: 'Cinsi', t: 's', f: a => a.cinsi },
            { l: 'Durum', t: 's', f: a => a.durum, cls: a => a.durum === 'Aktif' ? 'green' : 'red' },
            { l: 'Şantiye', t: 's', f: a => { const s = db.get('santiye', a.santiye); return s ? s.proje_kodu + ' ' + s.ad : ''; } },
            { l: 'Operatör', t: 's', f: a => dm.operatorleri(a.id).join(', ') },
          ], araclar.sort((a, b) => (a.durum === 'Aktif') - (b.durum === 'Aktif') || (a.plaka || '').localeCompare(b.plaka || '')))}</div>`
          : '<div class="empty">Araç girilmemiş. <a href="#filo/arac">Araç ekle</a></div>'}
        </section>
      </div>`;
  }
  refresh();
  return { refresh };
}

// ---------------- GÜZERGAH LEJANTI ----------------
export function lejantView(root) {
  const st = { from: '', to: '' };
  root.innerHTML = `<div class="help">ℹ Saha İşleri'nde km başlangıç/bitiş girilen işlemler güzergah üzerinde renkli şerit olarak gösterilir.</div>
    <div class="toolbar"><label class="inline">Başl. <input type="date" class="from"></label><label class="inline">Bitiş <input type="date" class="to"></label>
    <button class="btn pdf">🖨 PDF/Yazdır</button></div>
    <div class="legend">${Object.entries(ISLEM_RENK).map(([k, c]) => `<span><i style="background:${c}"></i>${k}</span>`).join('')}</div>
    <div class="lejant"></div>`;
  root.querySelector('.from').addEventListener('change', e => { st.from = e.target.value; refresh(); });
  root.querySelector('.to').addEventListener('change', e => { st.to = e.target.value; refresh(); });
  root.querySelector('.pdf').addEventListener('click', () => printHtml(raporSayfa('GÜZERGAH İŞLEM LEJANTI',
    root.querySelector('.legend').outerHTML + root.querySelector('.lejant').innerHTML).replace('class="doc"', 'class="doc wide"')));

  function refresh() {
    const isler = db.all('saha_is').filter(r => (!st.from || r.tarih >= st.from) && (!st.to || r.tarih <= st.to));
    const gruplar = {};
    isler.forEach(r => (gruplar[r.guzergah || '(Güzergahsız)'] ||= []).push(r));
    const html = Object.entries(gruplar).sort((a, b) => a[0].localeCompare(b[0], 'tr')).map(([g, list]) => {
      const kmli = list.filter(r => r.km_bas !== '' && r.km_bit !== '' && r.km_bas != null && r.km_bit != null);
      const min = Math.min(...kmli.map(r => Math.min(+r.km_bas, +r.km_bit)));
      const max = Math.max(...kmli.map(r => Math.max(+r.km_bas, +r.km_bit)));
      const span = max - min || 1;
      const W = 1000;
      const svg = kmli.length ? `<svg viewBox="0 0 ${W} 46" class="strip" preserveAspectRatio="none" role="img" aria-label="${esc(g)}">
        <rect x="0" y="12" width="${W}" height="18" fill="var(--strip)"/>
        ${kmli.sort((a, b) => (a.tarih || '').localeCompare(b.tarih || '')).map(r => {
          const x1 = (Math.min(+r.km_bas, +r.km_bit) - min) / span * W, x2 = (Math.max(+r.km_bas, +r.km_bit) - min) / span * W;
          return `<rect x="${x1}" y="12" width="${Math.max(3, x2 - x1)}" height="18" fill="${ISLEM_RENK[r.islem] || ISLEM_RENK['Diğer']}" opacity=".9"><title>${esc(`${r.islem || ''} ${r.km_bas}–${r.km_bit} km · ${fmtDate(r.tarih)} · ${r.is_kalemi || ''}`)}</title></rect>`;
        }).join('')}
        <text x="2" y="44" font-size="11" fill="currentColor">${fmtNum(min, 3)} km</text>
        <text x="${W - 2}" y="44" font-size="11" fill="currentColor" text-anchor="end">${fmtNum(max, 3)} km</text></svg>` : '';
      const rows = list.sort((a, b) => (b.tarih || '').localeCompare(a.tarih || '')).map(r =>
        `<li><i style="background:${ISLEM_RENK[r.islem] || '#999'}"></i>${fmtDate(r.tarih)} · <b>${esc(r.islem || '-')}</b> · ${esc(r.is_kalemi || '')}
         ${r.km_bas !== '' && r.km_bas != null ? ` · km ${fmtNum(r.km_bas, 3)}–${fmtNum(r.km_bit, 3)}` : ''}${r.miktar ? ` · ${fmtNum(r.miktar)} ${esc(r.birim || '')}` : ''}</li>`).join('');
      return `<section class="card"><h3>${esc(g)} <small class="muted">(${list.length} işlem)</small></h3>${svg}<ul class="lejant-list">${rows}</ul></section>`;
    }).join('');
    root.querySelector('.lejant').innerHTML = html || '<div class="empty">Saha işi kaydı yok. <a href="#saha/saha_is">Saha işi ekle</a></div>';
  }
  refresh();
  return { refresh };
}

// ---------------- VERİM RAPORU ----------------
export function verimView(root) {
  const scols = [
    { l: 'Proje Kodu', t: 's', f: s => s.proje_kodu }, { l: 'Yol', t: 's', f: s => s.ad }, { l: 'Durum', t: 's', f: s => s.durum },
    { l: 'Planlanan m³', t: 'n', f: s => s.planlanan_kubaj }, { l: 'Gerçekleşen m³', t: 'n', f: s => dm.santiyeGerceklesen(s.id) },
    { l: 'Gerçekleşme %', t: 'pct', f: s => santiyeVerim(s).gercekOran ?? '' },
    { l: 'Zamana göre beklenen %', t: 'pct', f: s => santiyeVerim(s).beklenenOran ?? '' },
    { l: 'Verim %', t: 'pct', f: s => santiyeVerim(s).verim ?? '', cls: s => { const v = santiyeVerim(s).verim; return v == null ? '' : v < 0.8 ? 'red' : v < 1 ? 'orange' : 'green'; } },
  ];
  const pcols = [
    { l: 'Plan', t: 's', f: p => p.ad }, { l: 'Hedef m³', t: 'n', f: p => dm.planSim(p).miktarM3 },
    { l: 'Taşınan m³', t: 'n', f: p => dm.planGerceklesen(p.id) },
    { l: 'Kalan %', t: 'pct', f: p => { const m = dm.planSim(p).miktarM3; return m ? Math.max(0, 1 - dm.planGerceklesen(p.id) / m) : ''; } },
    { l: 'Planlanan gün', t: 'n', f: p => dm.planSim(p).tamamlanmaGun ?? '' },
    { l: 'Geçen gün', t: 'n', f: p => p.baslama ? Math.max(0, Math.round((new Date(today()) - new Date(p.baslama)) / 864e5)) : '' },
    { l: 'Planlanan sefer', t: 'n', f: p => dm.planSim(p).toplamSefer },
    { l: 'Gerçekleşen sefer', t: 'n', f: p => db.all('sefer').filter(s => s.plan === p.id).reduce((t, s) => t + (+s.sefer_sayisi || 0), 0) },
  ];
  root.innerHTML = `<div class="help">ℹ Verim = gerçekleşen ilerleme ÷ zamana göre olması gereken ilerleme. %100 altı plan gerisinde demektir.</div>
    <div class="toolbar"><button class="btn xls1">⬇ Şantiye Excel</button><button class="btn xls2">⬇ Plan Excel</button><button class="btn pdf">🖨 PDF/Yazdır</button></div>
    <h3>Şantiye Verimi</h3><div class="table-wrap t1"></div><h3>Nakliye Planı İlerlemesi</h3><div class="table-wrap t2"></div>`;
  root.querySelector('.xls1').addEventListener('click', () => exportXlsx('Şantiye Verim', scols, db.all('santiye')));
  root.querySelector('.xls2').addEventListener('click', () => exportXlsx('Nakliye İlerleme', pcols, db.all('nakliye_plan')));
  root.querySelector('.pdf').addEventListener('click', () => printHtml(raporSayfa('ŞANTİYE VERİM RAPORU',
    `<h3>Şantiye Verimi</h3>${tableHtml(scols, db.all('santiye'))}<h3>Nakliye Planı İlerlemesi</h3>${tableHtml(pcols, db.all('nakliye_plan'))}`).replace('class="doc"', 'class="doc wide"')));
  function refresh() {
    const s = db.all('santiye'), p = db.all('nakliye_plan');
    root.querySelector('.t1').innerHTML = s.length ? tableHtml(scols, s) : '<div class="empty">Şantiye yok.</div>';
    root.querySelector('.t2').innerHTML = p.length ? tableHtml(pcols, p) : '<div class="empty">Nakliye planı yok.</div>';
  }
  refresh();
  return { refresh };
}

// ---------------- AYARLAR ----------------
const AYAR_ALANLARI = [
  ['kurum', 'Kurum'], ['daire', 'Daire Başkanlığı'], ['birim', 'Birim / Şeflik'],
  ['imzaAd', 'İmza: Ad Soyad'], ['imzaUnvan', 'İmza: Unvan'], ['ilce', 'Varsayılan ilçe'],
  ['yakitTolerans', 'Yakıt norm toleransı (%)'],
];

export function ayarlarView(root, { onSyncDone }) {
  const a = dm.ayarlar();
  root.innerHTML = `
    <section class="card"><h3>🔄 Senkronizasyon (çevrimdışı → sunucu)</h3>
      <p class="muted small">Veriler her zaman önce bu cihaza kaydedilir. İnternet olduğunda "Senkronize Et" ile sunucuya gönderilir ve diğer cihazlardaki değişiklikler alınır. Otomatik açıksa bağlantı geldiğinde kendiliğinden yapılır.</p>
      <form class="grid-form sync-form">
        <label><span>Sunucu adresi</span><input name="sunucu" placeholder="Boş: bu sayfanın sunucusu" value="${esc(a.sunucu)}"></label>
        <label><span>Sunucu şifresi</span><input name="token" type="password" value="${esc(a.token)}"></label>
        <label class="check"><span>Otomatik senkronizasyon</span><input type="checkbox" name="otoSync" ${a.otoSync ? 'checked' : ''}></label>
        <div class="wide form-btns"><button class="primary" type="submit">Kaydet</button><button type="button" class="btn sync-now">Şimdi Senkronize Et</button></div>
      </form>
      <p class="sync-info small"></p>
    </section>
    <section class="card"><h3>🔔 Hatırlatma ve Bildirimler</h3>
      <p class="muted small">Bildirim izni verilirse zamanı gelen hatırlatmalar, gecikmiş görevler, bakımı yaklaşan araçlar, açık ihbarlar ve denetim uyarıları bildirim olarak gelir (uygulama açıkken veya arka planda).
      Uygulama tamamen kapalıyken de alarm almak için hatırlatmaları telefon takvimine aktarın.</p>
      <div class="toolbar"><button class="btn notif">Bildirim izni ver</button><button class="btn ics">📅 Takvime aktar (.ics)</button><span class="muted small notif-state"></span></div>
    </section>
    <section class="card"><h3>🏛 Kurum ve İmza Bilgileri (evrak ve raporlarda kullanılır)</h3>
      <form class="grid-form kurum-form">${AYAR_ALANLARI.map(([k, l]) => `<label><span>${l}</span><input name="${k}" value="${esc(a[k])}"></label>`).join('')}
      <div class="wide form-btns"><button class="primary" type="submit">Kaydet</button></div></form>
    </section>
    <section class="card"><h3>💾 Yedekleme</h3>
      <p class="muted small">Yedek dosyası tüm verileri içerir. Haftada en az bir kez alıp bilgisayarda/flash bellekte saklayın.</p>
      <div class="toolbar"><button class="btn primary backup">⬇ Yedek Al (.json)</button><button class="btn restore">⬆ Yedekten Yükle</button>
      <button class="btn xlsall">⬇ Tüm tablolar Excel</button><input type="file" accept=".json,application/json" class="hidden restore-file">
      <button class="btn demo">Örnek veri yükle</button></div>
      <p class="muted small backup-info"></p>
    </section>`;

  const $ = s => root.querySelector(s);
  const kaydet = async patch => { await db.setMeta('ayarlar', { ...db.getMeta('ayarlar', {}), ...patch }); toast('Ayarlar kaydedildi', 'ok'); };

  $('.sync-form').addEventListener('submit', e => {
    e.preventDefault();
    const f = e.target.elements;
    kaydet({ sunucu: f.sunucu.value.trim(), token: f.token.value, otoSync: f.otoSync.checked });
  });
  $('.kurum-form').addEventListener('submit', e => { e.preventDefault(); kaydet(Object.fromEntries(new FormData(e.target))); });
  $('.sync-now').addEventListener('click', async () => {
    try { const r = await sync(); toast(`Senkronize edildi: ${r.gonderilen} gönderildi, ${r.alinan} alındı`, 'ok'); onSyncDone?.(); }
    catch (err) { toast('Senkronizasyon başarısız: ' + err.message, 'err', 6000); }
    refresh();
  });

  $('.notif').addEventListener('click', async () => { const p = await bildirimIzniIste(); toast('Bildirim izni: ' + p); refresh(); });
  $('.ics').addEventListener('click', () => { const n = icsIndir(); toast(`${n} etkinlik takvim dosyasına aktarıldı. Dosyayı açıp takviminize ekleyin.`, 'ok', 6000); });

  $('.backup').addEventListener('click', async () => {
    download(JSON.stringify({ format: 'kirsal-yol-bakim', surum: 1, tarih: new Date().toISOString(), veri: db.dump() }, null, 1),
      `kyb-yedek-${today()}.json`, 'application/json');
    await db.setMeta('sonYedek', Date.now());
    refresh();
  });
  $('.restore').addEventListener('click', () => $('.restore-file').click());
  $('.restore-file').addEventListener('change', async e => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const json = JSON.parse(await file.text());
      const veri = json.format === 'kirsal-yol-bakim' ? json.veri : eskiYedektenDonustur(json);
      const adet = Object.values(veri).reduce((t, l) => t + l.length, 0);
      if (!confirm(`${adet} kayıt yüklenecek. Aynı kimlikli kayıtlar yedektekiyle değiştirilir, diğerleri korunur. Devam?`)) return;
      for (const [c, list] of Object.entries(veri)) if (SCHEMAS[c]) await db.putMany(c, list);
      toast(`${adet} kayıt yüklendi`, 'ok');
    } catch (err) { toast('Yedek okunamadı: ' + err.message, 'err'); }
  });
  $('.xlsall').addEventListener('click', () => {
    for (const [c, s] of Object.entries(SCHEMAS)) {
      const rows = db.all(c);
      if (rows.length) exportXlsx(s.title, columns(s, true), rows);
    }
  });
  $('.demo').addEventListener('click', async () => {
    if (!confirm('Denemek için örnek araç, personel, şantiye, sefer, olay vb. kayıtlar eklensin mi?')) return;
    await ornekVeriYukle();
    toast('Örnek veriler yüklendi', 'ok');
  });

  function refresh() {
    const bekleyen = db.dirty().length, son = db.getMeta('sonSync', 0);
    $('.sync-info').textContent = `Bekleyen değişiklik: ${bekleyen} · Son senkronizasyon: ${son ? new Date(son).toLocaleString('tr-TR') : 'hiç'} · Bağlantı: ${navigator.onLine ? 'çevrimiçi' : 'ÇEVRİMDIŞI'}`;
    $('.notif-state').textContent = 'Notification' in window ? 'Durum: ' + ({ granted: 'izin verildi', denied: 'reddedildi (tarayıcı ayarlarından açın)', default: 'sorulmadı' }[Notification.permission]) : 'Bu tarayıcı bildirim desteklemiyor';
    const sy = db.getMeta('sonYedek', 0);
    $('.backup-info').textContent = 'Son yedek: ' + (sy ? new Date(sy).toLocaleString('tr-TR') : 'hiç alınmadı');
  }
  refresh();
  return { refresh };
}

// İlk sürümün (İş Takip v1) yedek dosyasını yeni yapıya çevirir.
function eskiYedektenDonustur(j) {
  if (!Array.isArray(j.tasks)) throw new Error('Tanınmayan dosya biçimi');
  const pr = { high: 'Yüksek', mid: 'Orta', low: 'Düşük' };
  return {
    gorev: j.tasks.map(t => ({ id: 'v1' + t.id, baslik: t.title, kimden: t.from, son_tarih: t.due, oncelik: pr[t.priority] || 'Orta', durum: t.done ? 'Tamamlandı' : 'Açık', detay: t.detail })),
    not: [...(j.notes || []).map(n => ({ id: 'v1' + n.id, tarih: (n.created || '').slice(0, 10), metin: n.text })),
      ...(j.records || []).map(r => ({ id: 'v1r' + r.id, tarih: r.date, baslik: r.category, etiket: r.party, metin: [r.desc, r.amount != null ? 'Tutar: ' + r.amount : ''].filter(Boolean).join('\n') }))],
  };
}

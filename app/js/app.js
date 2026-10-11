// Uygulama girişi: menü, yönlendirme, senkronizasyon durumu, bildirim döngüsü.
import * as db from './db.js';
import { SCHEMAS } from './schemas.js';
import { crudView } from './ui.js';
import { panelView, lejantView, verimView, ayarlarView } from './views.js';
import { evrakView } from './evrak.js';
import { sync, syncUrl } from './sync.js';
import { collect, bildirimKontrol } from './reminders.js';
import { ayarlar } from './domain.js';
import { toast } from './util.js';

const crud = c => ({ id: c, l: SCHEMAS[c].title, crud: c });
const NAV = [
  { id: 'panel', l: '📊 Panel', subs: [{ id: 'ozet', l: 'Özet & Uyarılar', view: panelView }] },
  { id: 'filo', l: '🚜 Filo', subs: [crud('arac'), crud('personel'), crud('ariza'), crud('yakit')] },
  { id: 'nakliye', l: '🚚 Nakliye', subs: [crud('nakliye_plan'), crud('sefer'), crud('malzeme')] },
  { id: 'saha', l: '🛣 Saha & Kriz', subs: [crud('santiye'), crud('saha_is'), { id: 'lejant', l: 'Güzergah Lejantı', view: lejantView }, crud('olay'), crud('vardiya')] },
  { id: 'finans', l: '💰 Finans', subs: [crud('birim_fiyat'), crud('hakedis'), { id: 'verim', l: 'Verim Raporu', view: verimView }] },
  { id: 'evrak', l: '📄 Evrak', subs: [{ id: 'yeni', l: 'Evrak Hazırla', view: evrakView }, crud('evrak'), crud('toplanti')] },
  { id: 'ajanda', l: '📝 Görev & Hatırlatma', subs: [crud('gorev'), crud('hatirlatma'), crud('not')] },
  { id: 'ayar', l: '⚙ Ayarlar', subs: [{ id: 'ayarlar', l: 'Senkronizasyon, Yedek, Kurum', view: (root, o) => ayarlarView(root, o) }] },
];

let current = null;   // { refresh, edit }
const $ = s => document.querySelector(s);

function route() {
  const [path, query] = location.hash.slice(1).split('?');
  const [tabId, subId] = (path || 'panel/ozet').split('/');
  const tab = NAV.find(t => t.id === tabId) || NAV[0];
  const sub = tab.subs.find(s => s.id === subId) || tab.subs[0];

  $('#tabs').innerHTML = NAV.map(t => `<a href="#${t.id}/${t.subs[0].id}" class="${t === tab ? 'active' : ''}">${t.l}</a>`).join('');
  $('#subtabs').innerHTML = tab.subs.length > 1 ? tab.subs.map(s => `<a href="#${tab.id}/${s.id}" class="${s === sub ? 'active' : ''}">${s.l}</a>`).join('') : '';
  $('#subtabs').classList.toggle('hidden', tab.subs.length < 2);

  const root = $('#view');
  root.innerHTML = '';
  current = sub.crud ? crudView(sub.crud, root) : sub.view(root, { onSyncDone: updateStatus });
  if (query === 'yeni=ihbar' && sub.crud === 'olay') {
    current.edit(SCHEMAS.olay.quick[0].fn());
    history.replaceState(null, '', '#saha/olay');
  }
  window.scrollTo(0, 0);
}

function updateStatus() {
  const bekleyen = db.dirty().length;
  const online = navigator.onLine;
  const el = $('#sync-state');
  el.className = 'pill ' + (online ? (bekleyen ? 'orange' : 'green') : 'red');
  el.textContent = (online ? 'Çevrimiçi' : 'Çevrimdışı') + (bekleyen ? ` · ${bekleyen} bekliyor` : ' · eşit');
  const uyarilar = collect().filter(a => a.level !== 'info').length;
  $('#bell').textContent = '🔔 ' + uyarilar;
  $('#bell').className = 'pill ' + (uyarilar ? 'red' : '');
}

async function syncNow(sessiz) {
  if (!syncUrl() || !navigator.onLine) {
    if (!sessiz) toast(navigator.onLine ? 'Sunucu adresi yok (Ayarlar)' : 'Çevrimdışı: veriler cihazda güvende, bağlantı gelince gönderilecek', 'warn', 5000);
    return;
  }
  try {
    const r = await sync();
    if (!sessiz || r.alinan) toast(`Senkronize: ${r.gonderilen} gönderildi, ${r.alinan} alındı`, 'ok');
  } catch (e) {
    if (!sessiz) toast('Senkronizasyon başarısız: ' + e.message, 'err', 6000);
  }
  updateStatus();
}

async function start() {
  try {
    await db.openDb();
  } catch (e) {
    document.body.innerHTML = `<p style="padding:20px">Yerel veritabanı açılamadı (${e.message}). Gizli/özel pencere kullanıyorsanız normal pencerede açın.</p>`;
    return;
  }
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch(err => console.warn('SW kaydı başarısız', err));
  }

  $('#sync-btn').addEventListener('click', () => syncNow(false));
  window.addEventListener('hashchange', route);
  window.addEventListener('online', () => { updateStatus(); if (ayarlar().otoSync) syncNow(true); });
  window.addEventListener('offline', updateStatus);

  let t;
  db.onChange(() => {
    clearTimeout(t);
    t = setTimeout(() => { current?.refresh(); updateStatus(); }, 50);
  });

  route();
  updateStatus();

  const uyariToast = a => toast(`${a.title} — ${a.detail}`, a.level === 'red' ? 'err' : 'warn', 8000);
  bildirimKontrol(uyariToast);
  setInterval(() => { bildirimKontrol(uyariToast); updateStatus(); }, 60e3);
  setInterval(() => { if (ayarlar().otoSync && navigator.onLine) syncNow(true); }, 5 * 60e3);
  if (ayarlar().otoSync) syncNow(true);
}

start();

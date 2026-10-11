// Sunucu senkronizasyonu. Yerelde bekleyen değişiklikleri gönderir, sunucudaki
// yenileri alır. Çakışmada en son değiştirilen kayıt kazanır.
import * as db from './db.js';
import { ayarlar } from './domain.js';

let calisiyor = false;

export function syncUrl() {
  const s = ayarlar().sunucu.trim();
  if (s) return s.replace(/\/+$/, '') + '/api/sync';
  if (location.protocol.startsWith('http')) return new URL('api/sync', location.href).href;
  return null;
}

export async function sync() {
  if (calisiyor) return { gonderilen: 0, alinan: 0 };
  const url = syncUrl();
  if (!url) throw new Error('Sunucu adresi ayarlanmamış');
  if (!navigator.onLine) throw new Error('İnternet bağlantısı yok');
  calisiyor = true;
  try {
    const gonderilecek = db.dirty().map(r => ({ c: r.c, id: r.id, d: r.d, u: r.u, del: r.del }));
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 30000);
    let res;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Token': ayarlar().token || '' },
        body: JSON.stringify({ since: db.getMeta('sonSeq', 0), changes: gonderilecek }),
        signal: ctl.signal,
      });
    } catch (e) {
      throw new Error(e.name === 'AbortError' ? 'Sunucu yanıt vermedi' : 'Sunucuya ulaşılamadı');
    } finally { clearTimeout(timer); }
    if (res.status === 401) throw new Error('Sunucu şifresi hatalı');
    if (!res.ok) throw new Error('Sunucu hatası (' + res.status + ')');
    const out = await res.json();
    await db.markClean(gonderilecek);
    const alinan = await db.applyRemote(out.changes || []);
    await db.setMeta('sonSeq', out.seq);
    await db.setMeta('sonSync', Date.now());
    return { gonderilen: gonderilecek.length, alinan };
  } finally {
    calisiyor = false;
  }
}

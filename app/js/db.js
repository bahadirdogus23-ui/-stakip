// Yerel veritabanı (IndexedDB). Tüm kayıtlar bellekte de tutulur; her değişiklik
// diske yazılır ve senkronize edilene kadar "dirty" olarak işaretlenir.
//
// Kayıt biçimi: { k: 'tablo:id', c: tablo, id, d: veri, u: güncelleme zamanı (ms), del: silindi mi, dirty }

const DB_NAME = 'kirsal-yol-bakim';
const STORE = 'records';
const META = 'meta';

let idb;
const mem = new Map();   // tablo -> Map(id -> kayıt)
const meta = new Map();
const listeners = new Set();

const wrap = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

export async function openDb() {
  idb = await new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => {
      r.result.createObjectStore(STORE, { keyPath: 'k' });
      r.result.createObjectStore(META, { keyPath: 'key' });
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  const tx = idb.transaction([STORE, META]);
  (await wrap(tx.objectStore(STORE).getAll())).forEach(cache);
  (await wrap(tx.objectStore(META).getAll())).forEach(m => meta.set(m.key, m.value));
  // Tarayıcının depolamayı kendiliğinden silmemesi için kalıcı depolama iste.
  navigator.storage?.persist?.().catch(() => {});
}

function cache(rec) {
  if (!mem.has(rec.c)) mem.set(rec.c, new Map());
  mem.get(rec.c).set(rec.id, rec);
}

function write(store, items) {
  if (!items.length) return Promise.resolve();
  const tx = idb.transaction(store, 'readwrite');
  const s = tx.objectStore(store);
  items.forEach(i => s.put(i));
  return new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
}

let emitTimer;
function emit() {
  clearTimeout(emitTimer);
  emitTimer = setTimeout(() => listeners.forEach(fn => fn()), 30);
}
export const onChange = fn => listeners.add(fn);

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

export function all(c) {
  const m = mem.get(c);
  return m ? [...m.values()].filter(r => !r.del).map(r => r.d) : [];
}

export function get(c, id) {
  const r = id && mem.get(c)?.get(id);
  return r && !r.del ? r.d : null;
}

function makeRec(c, data) {
  const id = data.id || uid();
  const prev = mem.get(c)?.get(id);
  return { k: c + ':' + id, c, id, d: { ...data, id }, u: Math.max(Date.now(), (prev?.u || 0) + 1), del: false, dirty: true };
}

export async function put(c, data) {
  const rec = makeRec(c, data);
  cache(rec);
  await write(STORE, [rec]);
  emit();
  return rec.d;
}

export async function putMany(c, list) {
  const recs = list.map(d => makeRec(c, d));
  recs.forEach(cache);
  await write(STORE, recs);
  emit();
}

export async function remove(c, id) {
  const prev = mem.get(c)?.get(id);
  if (!prev) return;
  const rec = { ...prev, u: Math.max(Date.now(), prev.u + 1), del: true, dirty: true };
  cache(rec);
  await write(STORE, [rec]);
  emit();
}

export const dirty = () => [...mem.values()].flatMap(m => [...m.values()]).filter(r => r.dirty);

// Sunucudan gelen kayıtları uygula: hangisi daha yeniyse o kazanır.
export async function applyRemote(list) {
  const changed = [];
  for (const x of list) {
    const cur = mem.get(x.c)?.get(x.id);
    if (cur && cur.u >= x.u) continue;
    const rec = { k: x.c + ':' + x.id, c: x.c, id: x.id, d: x.d, u: x.u, del: !!x.del, dirty: false };
    cache(rec);
    changed.push(rec);
  }
  await write(STORE, changed);
  if (changed.length) emit();
  return changed.length;
}

// Gönderilen kayıtlar o arada tekrar değişmediyse temiz işaretle.
export async function markClean(sent) {
  const upd = [];
  for (const s of sent) {
    const cur = mem.get(s.c)?.get(s.id);
    if (cur && cur.dirty && cur.u === s.u) { cur.dirty = false; upd.push(cur); }
  }
  await write(STORE, upd);
}

export const getMeta = (key, def) => meta.has(key) ? meta.get(key) : def;
export async function setMeta(key, value) {
  meta.set(key, value);
  await write(META, [{ key, value }]);
}

// Yedek: silinmemiş tüm kayıtlar, tablo bazında.
export function dump() {
  const data = {};
  for (const [c, m] of mem) {
    const rows = [...m.values()].filter(r => !r.del).map(r => r.d);
    if (rows.length) data[c] = rows;
  }
  return data;
}

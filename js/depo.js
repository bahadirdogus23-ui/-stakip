/*
 * Veri güvenliği: proje arşivi, sürüm geçmişi, çöp kutusu, klasöre otomatik kayıt ve tam yedek.
 *
 * - Projelerim (IndexedDB): her proje kimliğiyle ayrı saklanır; yeni proje ya da dosyadan açma eskisini silmez.
 * - Sürüm geçmişi: düzenlerken belirli aralıklarla ve riskli işlemlerden önce anlık kopya; budama kuralı
 *   son 40 kopyayı, son 60 günün her gününden birini ve her aydan birini sonsuza dek tutar.
 * - Çöp kutusu: silinen proje çöpe gider, geri alınabilir; kalıcı silme yalnız kullanıcı isteğiyle.
 * - Klasöre kayıt (File System Access API; Chrome / Edge masaüstü): seçilen klasöre her değişiklikte
 *   "Projeler/<ad> (<kimlik>).mobilya.json", sürüm kopyalarında "Yedekler/<yıl-ay>/…" ve günlük tam yedek.
 *   Program klasördeki hiçbir dosyayı silmez.
 * - Tam yedek: tüm projeler + artık stoku tek dosyada; geri yüklemede var olan daha yeni kayıtlar ezilmez.
 * Saf işlevler (budama, dosya adı, yedek birleştirme) Node'da test edilir; tarayıcı işlevleri yoksa sessizce atlanır.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Depo = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const GUN = 86400000;
  const DOSYA_UZANTI = '.mobilya.json';

  // ---------- Saf yardımcılar ----------
  /** Dosya adında kullanılamayan karakterleri temizler. */
  const guvenliAd = (ad) => String(ad || 'proje').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60) || 'proje';
  const kisaId = (id) => String(id || '').slice(-6);
  const projeDosyaAdi = (p) => `${guvenliAd(p.ad)} (${kisaId(p.id)})${DOSYA_UZANTI}`;
  const iki = (x) => String(x).padStart(2, '0');
  const tarihAd = (t) => { const d = new Date(t); return `${d.getFullYear()}-${iki(d.getMonth() + 1)}-${iki(d.getDate())}`; };
  const saatAd = (t) => { const d = new Date(t); return `${iki(d.getHours())}.${iki(d.getMinutes())}`; };

  /**
   * Sürüm budama: silinecek sürümlerin anahtarları. surumler: [{ anahtar, zaman }].
   * Tutulanlar: en yeni 40; son 60 günün her gününün en yenisi; her ayın en yenisi (süresiz);
   * "kalici" işaretli (riskli işlem öncesi) kopyalar 180 gün.
   */
  function budanacaklar(surumler, simdi) {
    const L = surumler.slice().sort((a, b) => b.zaman - a.zaman);
    const tut = new Set(L.slice(0, 40).map((s) => s.anahtar));
    const gun = new Set();
    const ay = new Set();
    for (const s of L) {
      const g = tarihAd(s.zaman);
      if (simdi - s.zaman <= 60 * GUN && !gun.has(g)) { gun.add(g); tut.add(s.anahtar); }
      const a = g.slice(0, 7);
      if (!ay.has(a)) { ay.add(a); tut.add(s.anahtar); }
      if (s.kalici && simdi - s.zaman <= 180 * GUN) tut.add(s.anahtar);
    }
    return L.filter((s) => !tut.has(s.anahtar)).map((s) => s.anahtar);
  }

  /** Dosya / yedek içeriğinden proje(ler): ham proje, sarılmış proje ya da tam yedek. */
  function icerikCoz(veri) {
    if (!veri || typeof veri !== 'object') return null;
    if (veri.tur === 'mobilya-olcu-yedek' && Array.isArray(veri.projeler)) {
      return { projeler: veri.projeler.filter((p) => p && Array.isArray(p.moduller)), artik: Array.isArray(veri.artik) ? veri.artik : null, tamYedek: true, tarih: veri.tarih || null };
    }
    if (veri.tur === 'mobilya-olcu-proje' && veri.proje && Array.isArray(veri.proje.moduller)) return { projeler: [veri.proje], artik: null, tarih: veri.kaydedildi || null };
    if (Array.isArray(veri.moduller)) return { projeler: [veri], artik: null };
    return null;
  }

  /**
   * Yedek birleştirme planı. mevcut: [{ id, guncel }], gelen: [{ proje, guncel }].
   * Aynı kimlik yoksa → ekle; gelen daha yeniyse → güncelle (eskisi sürüm geçmişine alınır);
   * mevcut daha yeni ya da aynıysa → dokunma. Hiçbir kayıt silinmez.
   */
  function birlesimPlani(mevcut, gelen) {
    const M = new Map(mevcut.map((m) => [m.id, m]));
    return gelen.map((g) => {
      const m = M.get(g.proje.id);
      if (!m) return { islem: 'ekle', g };
      if ((g.guncel || 0) > (m.guncel || 0) + 1000) return { islem: 'guncelle', g };
      return { islem: 'atla', g };
    });
  }

  const sarProje = (proje, zaman) => JSON.stringify({ tur: 'mobilya-olcu-proje', surum: 1, kaydedildi: new Date(zaman || Date.now()).toISOString(), proje }, null, 1);
  const tamYedekMetni = (projeler, artik, zaman) => JSON.stringify({ tur: 'mobilya-olcu-yedek', surum: 1, tarih: new Date(zaman || Date.now()).toISOString(), projeler, artik: artik || [] });

  // ---------- IndexedDB ----------
  const VT_AD = 'mobilya-olcu';
  let vtSoz = null;
  function vt() {
    if (vtSoz) return vtSoz;
    vtSoz = new Promise((coz, red) => {
      if (typeof indexedDB === 'undefined') { red(new Error('IndexedDB yok')); return; }
      const r = indexedDB.open(VT_AD, 1);
      r.onupgradeneeded = () => {
        const d = r.result;
        if (!d.objectStoreNames.contains('projeler')) d.createObjectStore('projeler', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('surumler')) d.createObjectStore('surumler', { keyPath: 'anahtar', autoIncrement: true }).createIndex('projeId', 'projeId');
        if (!d.objectStoreNames.contains('ayar')) d.createObjectStore('ayar');
      };
      r.onsuccess = () => coz(r.result);
      r.onerror = () => red(r.error);
      r.onblocked = () => red(new Error('Veritabanı başka sekmede eski sürümle açık'));
    });
    vtSoz.catch(() => { vtSoz = null; });
    return vtSoz;
  }
  const istek = (r) => new Promise((coz, red) => { r.onsuccess = () => coz(r.result); r.onerror = () => red(r.error); });
  async function islem(depo, mod, f) {
    const d = await vt();
    return new Promise((coz, red) => {
      const t = d.transaction(depo, mod);
      let sonuc;
      Promise.resolve(f(t.objectStore(depo), t)).then((x) => { sonuc = x; }, red);
      t.oncomplete = () => coz(sonuc);
      t.onerror = () => red(t.error);
      t.onabort = () => red(t.error || new Error('işlem iptal'));
    });
  }

  const ayarAl = (k) => islem('ayar', 'readonly', (s) => istek(s.get(k)));
  const ayarYaz = (k, v) => islem('ayar', 'readwrite', (s) => istek(s.put(v, k)));

  /** Projeyi arşive yazar (çöpteyse çöpten çıkmaz). */
  async function projeYaz(proje, zaman) {
    const kayit = { id: proje.id, ad: proje.ad, guncel: zaman || Date.now(), modulSayisi: (proje.moduller || []).length, proje };
    return islem('projeler', 'readwrite', async (s) => {
      const eski = await istek(s.get(proje.id));
      if (eski && eski.silindi) kayit.silindi = eski.silindi;
      if (eski && eski.olusturma) kayit.olusturma = eski.olusturma; else kayit.olusturma = kayit.guncel;
      await istek(s.put(kayit));
      return kayit;
    });
  }
  const projeAl = (id) => islem('projeler', 'readonly', (s) => istek(s.get(id)));
  /** Özet liste (proje gövdesi olmadan), en son güncellenen önce. */
  async function projeListesi() {
    const L = await islem('projeler', 'readonly', (s) => istek(s.getAll()));
    return L.map((k) => ({ id: k.id, ad: k.ad, guncel: k.guncel, olusturma: k.olusturma, modulSayisi: k.modulSayisi, silindi: k.silindi || null })).sort((a, b) => b.guncel - a.guncel);
  }
  async function copeAt(id) {
    return islem('projeler', 'readwrite', async (s) => { const k = await istek(s.get(id)); if (k) { k.silindi = Date.now(); await istek(s.put(k)); } });
  }
  async function coptenCikar(id) {
    return islem('projeler', 'readwrite', async (s) => { const k = await istek(s.get(id)); if (k) { delete k.silindi; await istek(s.put(k)); } });
  }
  /** Kalıcı silme (yalnız çöpteki proje; sürüm geçmişi de silinir). Klasördeki dosyalara dokunulmaz. */
  async function kaliciSil(id) {
    const k = await projeAl(id);
    if (!k || !k.silindi) throw new Error('Yalnız çöp kutusundaki proje kalıcı silinebilir');
    await islem('projeler', 'readwrite', (s) => istek(s.delete(id)));
    const anahtarlar = (await surumListesi(id)).map((x) => x.anahtar);
    await islem('surumler', 'readwrite', (s) => Promise.all(anahtarlar.map((a) => istek(s.delete(a)))));
  }

  // ---------- Sürümler ----------
  async function surumListesi(projeId) {
    return islem('surumler', 'readonly', async (s) => {
      const L = await istek(s.index('projeId').getAll(projeId));
      return L.map((x) => ({ anahtar: x.anahtar, projeId: x.projeId, zaman: x.zaman, ad: x.ad, neden: x.neden || '', modulSayisi: x.modulSayisi, kalici: !!x.kalici })).sort((a, b) => b.zaman - a.zaman);
    });
  }
  const surumAl = (anahtar) => islem('surumler', 'readonly', (s) => istek(s.get(anahtar)));
  /**
   * Sürüm ekler. Son sürümle aynı içerikse eklemez. neden verilirse (riskli işlem öncesi) kalıcı işaretlenir.
   * Dönüş: eklenen sürüm ya da null.
   */
  async function surumEkle(proje, neden) {
    const json = JSON.stringify(proje);
    const zaman = Date.now();
    const L = await surumListesi(proje.id);
    if (L.length) {
      const son = await surumAl(L[0].anahtar);
      if (son && son.json === json) {
        // Aynı içerik zaten saklı; riskli işlem nedeniyle işaretlenir (budamada korunur)
        if (neden && !son.neden) { son.neden = neden; son.kalici = true; await islem('surumler', 'readwrite', (s) => istek(s.put(son))); }
        return null;
      }
    }
    const kayit = { projeId: proje.id, zaman, ad: proje.ad, neden: neden || '', kalici: !!neden, modulSayisi: (proje.moduller || []).length, json };
    kayit.anahtar = await islem('surumler', 'readwrite', (s) => istek(s.add(kayit)));
    const sil = budanacaklar(L.concat([{ anahtar: kayit.anahtar, zaman, kalici: kayit.kalici }]), zaman);
    if (sil.length) await islem('surumler', 'readwrite', (s) => Promise.all(sil.map((a) => istek(s.delete(a)))));
    return kayit;
  }

  // ---------- Kalıcı depolama ----------
  /** Tarayıcıdan verinin kendiliğinden silinmemesini (kalıcı depolama) ister. */
  async function kaliciDepolama() {
    try {
      if (!navigator.storage || !navigator.storage.persist) return null;
      if (await navigator.storage.persisted()) return true;
      return await navigator.storage.persist();
    } catch (e) { return null; }
  }

  // ---------- Klasör (File System Access) ----------
  const klasorDestekli = () => typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function';
  let klasor = null; // FileSystemDirectoryHandle
  async function klasorYukle() {
    try { klasor = (await ayarAl('klasor')) || null; } catch (e) { klasor = null; }
    return klasor;
  }
  async function klasorSec() {
    const h = await window.showDirectoryPicker({ id: 'mobilya-olcu', mode: 'readwrite', startIn: 'documents' });
    klasor = h;
    await ayarYaz('klasor', h);
    return h;
  }
  async function klasorBirak() { klasor = null; await ayarYaz('klasor', null); }
  /** 'yok' | 'izinli' | 'izin-gerekli' | 'reddedildi' */
  async function klasorDurumu() {
    if (!klasor) return 'yok';
    try {
      const d = await klasor.queryPermission({ mode: 'readwrite' });
      return d === 'granted' ? 'izinli' : d === 'prompt' ? 'izin-gerekli' : 'reddedildi';
    } catch (e) { return 'izin-gerekli'; }
  }
  /** Kullanıcı tıklamasıyla çağrılmalı. */
  async function klasorIzinIste() {
    if (!klasor) return false;
    return (await klasor.requestPermission({ mode: 'readwrite' })) === 'granted';
  }
  const klasorAdi = () => (klasor ? klasor.name : '');
  async function altKlasor(yol) {
    let h = klasor;
    for (const p of yol) h = await h.getDirectoryHandle(p, { create: true });
    return h;
  }
  // Klasör yazımları tek sırada yürür: aynı dosyaya iki yazıcı aynı anda açılmaz
  let kuyruk = Promise.resolve();
  const sirala = (f) => { const s = kuyruk.then(f, f); kuyruk = s.catch(() => {}); return s; };
  /** Türkçe harfleri ASCII'ye çevirir (bazı dosya sistemleri / eşitleme araçları için yedek ad). */
  const asciiAd = (ad) => ad.replace(/[çÇğĞıİöÖşŞüÜ]/g, (c) => ({ ç: 'c', Ç: 'C', ğ: 'g', Ğ: 'G', ı: 'i', İ: 'I', ö: 'o', Ö: 'O', ş: 's', Ş: 'S', ü: 'u', Ü: 'U' }[c])).replace(/[^\x20-\x7e]/g, '_');
  async function dosyaYaz(dizin, ad0, metin) {
    let ad = ad0;
    let fh;
    try { fh = await dizin.getFileHandle(ad, { create: true }); } catch (e) {
      // Dosya sistemi bu adı kabul etmediyse Türkçe harfsiz adla yazılır
      ad = asciiAd(ad0);
      if (ad === ad0) throw e;
      fh = await dizin.getFileHandle(ad, { create: true });
    }
    const w = await fh.createWritable(); // kapanınca bütün olarak yazılır; yarıda kalırsa eski dosya bozulmaz
    await w.write(metin);
    await w.close();
    return ad;
  }
  /** Projeyi klasöre yazar; ad değiştiyse eski dosya yeniden adlandırılır (destekleniyorsa), silinmez. */
  const klasoraProjeYaz = (proje, zaman) => sirala(() => klasoraProjeYaz0(proje, zaman));
  const klasoraSurumYaz = (proje, zaman) => sirala(() => klasoraSurumYaz0(proje, zaman));
  const klasoraTamYedekYaz = (metin, zaman) => sirala(() => klasoraTamYedekYaz0(metin, zaman));
  async function klasoraProjeYaz0(proje, zaman) {
    if ((await klasorDurumu()) !== 'izinli') return false;
    const dizin = await altKlasor(['Projeler']);
    const ad = projeDosyaAdi(proje);
    const adlar = (await ayarAl('dosyaAdlari')) || {};
    const eski = adlar[proje.id];
    if (eski && eski !== ad && eski !== asciiAd(ad)) {
      try {
        const fh = await dizin.getFileHandle(eski);
        if (typeof fh.move === 'function') await fh.move(ad);
      } catch (e) { /* eski dosya yoksa ya da taşınamıyorsa yenisi yazılır, eskisi kalır */ }
    }
    adlar[proje.id] = await dosyaYaz(dizin, ad, sarProje(proje, zaman));
    await ayarYaz('dosyaAdlari', adlar);
    await ayarYaz('sonKlasorKaydi', zaman || Date.now());
    return true;
  }
  async function klasoraSurumYaz0(proje, zaman) {
    if ((await klasorDurumu()) !== 'izinli') return false;
    const z = zaman || Date.now();
    const dizin = await altKlasor(['Yedekler', tarihAd(z).slice(0, 7)]);
    await dosyaYaz(dizin, `${guvenliAd(proje.ad)} (${kisaId(proje.id)}) ${tarihAd(z)} ${saatAd(z)}${DOSYA_UZANTI}`, sarProje(proje, z));
    return true;
  }
  async function klasoraTamYedekYaz0(metin, zaman) {
    if ((await klasorDurumu()) !== 'izinli') return false;
    const dizin = await altKlasor(['Yedekler']);
    await dosyaYaz(dizin, `Tam yedek ${tarihAd(zaman || Date.now())}.json`, metin);
    return true;
  }
  /** Klasördeki proje dosyalarını okur: [{ proje, guncel, dosya }]. */
  async function klasordenOku() {
    if ((await klasorDurumu()) !== 'izinli') return [];
    const dizin = await altKlasor(['Projeler']);
    const L = [];
    for await (const [ad, h] of dizin.entries()) {
      if (h.kind !== 'file' || !ad.endsWith(DOSYA_UZANTI)) continue;
      try {
        const dosya = await h.getFile();
        const c = icerikCoz(JSON.parse(await dosya.text()));
        if (c && c.projeler[0] && c.projeler[0].id) L.push({ proje: c.projeler[0], guncel: Date.parse(c.tarih) || dosya.lastModified, dosya: ad });
      } catch (e) { /* bozuk dosya atlanır */ }
    }
    // Aynı kimlikli birden çok dosya varsa en yenisi
    const M = new Map();
    for (const x of L) if (!M.has(x.proje.id) || M.get(x.proje.id).guncel < x.guncel) M.set(x.proje.id, x);
    return [...M.values()];
  }

  // ---------- Tam yedek ----------
  async function tumProjeler() {
    const L = await islem('projeler', 'readonly', (s) => istek(s.getAll()));
    return L.filter((k) => !k.silindi).map((k) => k.proje);
  }

  return {
    // saf
    guvenliAd, projeDosyaAdi, budanacaklar, icerikCoz, birlesimPlani, sarProje, tamYedekMetni, tarihAd, DOSYA_UZANTI,
    // tarayıcı
    vt, ayarAl, ayarYaz, projeYaz, projeAl, projeListesi, copeAt, coptenCikar, kaliciSil,
    surumListesi, surumAl, surumEkle, kaliciDepolama, tumProjeler,
    klasorDestekli, klasorYukle, klasorSec, klasorBirak, klasorDurumu, klasorIzinIste, klasorAdi,
    klasoraProjeYaz, klasoraSurumYaz, klasoraTamYedekYaz, klasordenOku,
  };
});

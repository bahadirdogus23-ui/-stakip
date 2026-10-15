/* Arayüz: proje durumu, formlar, sekmeler, yazdırma ve dışa aktarma. */
(function () {
  'use strict';

  const KAYIT_ANAHTARI = 'mobilya-olcu-proje-v2';
  const RENKLER = ['#f6d7a7', '#c8e0f4', '#d4ecd0', '#f3c9d4', '#e3d4f2', '#fbe7a1', '#cfe9ec', '#f2d2bd', '#dfe4c3', '#e9d0e9'];
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const sayiYaz = (x, b = 1) => Number(x).toLocaleString('tr-TR', { maximumFractionDigits: b });

  const KULLANIM_AD = Hesap.KULLANIM_AD;
  const HS = Hesap.HIRDAVAT_SECENEKLERI;

  let proje;
  let seciliId = null;
  let sonuc = null;
  let plakaGruplari = [];
  // Artık stoku atölyeye aittir (projeler arası ortak), tarayıcıda ayrı tutulur
  const ARTIK_ANAHTARI = 'mobilya-olcu-artik-v1';
  function artikYukle() {
    try {
      const L = JSON.parse(localStorage.getItem(ARTIK_ANAHTARI) || '[]');
      return (Array.isArray(L) ? L : []).slice(0, 500).map((a) => ({
        id: /^[A-Za-z0-9_-]{1,40}$/.test(a && a.id) ? a.id : 'ar' + Math.random().toString(36).slice(2, 9),
        malzemeAd: String((a && a.malzemeAd) || '').slice(0, 80),
        kalinlik: Math.max(1, Number(a && a.kalinlik) || 18),
        boy: Math.max(1, Number(a && a.boy) || 0),
        en: Math.max(1, Number(a && a.en) || 0),
        adet: Math.max(0, Math.floor(Number(a && a.adet) || 0)),
        not: String((a && a.not) || '').slice(0, 80),
        tarih: String((a && a.tarih) || '').slice(0, 20),
      })).filter((a) => a.adet > 0 && a.boy > 0 && a.en > 0);
    } catch (e) { return []; }
  }
  let artikStok = artikYukle();
  function artikKaydet() { try { localStorage.setItem(ARTIK_ANAHTARI, JSON.stringify(artikStok)); } catch (e) { /* depolama kapalı */ } }
  const plakaHesapla = (p, s) => Yerlesim.plakaSayilari(Yerlesim.projeYerlesimi(s.kesimListesi, p.ayarlar, proje.artikKullan ? artikStok : null));
  let maliyet = null;
  const para = (x) => Number(x || 0).toLocaleString('tr-TR', { style: 'currency', currency: 'TRY' });

  const yeniProje = () => Hesap.yeniProje();

  function yukle() {
    try {
      const v = localStorage.getItem(KAYIT_ANAHTARI);
      if (v) {
        const p = JSON.parse(v);
        if (p && Array.isArray(p.moduller)) return Hesap.projeyiNormallestir(p);
      }
    } catch (e) { /* bozuk kayıt: yeni proje */ }
    return yeniProje();
  }

  // ---------------- Geri al / yinele ----------------
  // Her kayıtta proje anlık görüntüsü tutulur; art arda hızlı değişiklikler tek adımda birleşir.
  const gecmis = [];
  let ileri = [];
  let sonKayitZamani = 0;
  let canliKayit = false; // yazarken yapılan art arda kayıtlar tek adımda birleşir; düğme işlemleri birleşmez
  let oncekiCanli = false;
  let canliAnahtar = ''; // hangi alana yazıldığı: farklı alanlar ayrı geri alma adımıdır
  let oncekiAnahtar = '';
  function gecmiseEkle(json) {
    const simdi = Date.now();
    if (gecmis.length && gecmis[gecmis.length - 1] === json) return;
    if (gecmis.length > 1 && canliKayit && oncekiCanli && canliAnahtar === oncekiAnahtar && simdi - sonKayitZamani < 2000) gecmis[gecmis.length - 1] = json;
    else gecmis.push(json);
    oncekiCanli = canliKayit;
    oncekiAnahtar = canliAnahtar;
    canliKayit = false;
    if (gecmis.length > 80) gecmis.shift();
    sonKayitZamani = simdi;
    ileri = [];
    gecmisDugmeleri();
  }
  function gecmisDugmeleri() {
    $('#btnGeriAl').disabled = gecmis.length < 2;
    $('#btnYinele').disabled = !ileri.length;
  }
  function gecmisYukle(json) {
    proje = Hesap.projeyiNormallestir(JSON.parse(json));
    if (!proje.moduller.some((m) => m.id === seciliId)) seciliId = proje.moduller[0] ? proje.moduller[0].id : null;
    $('#projeAd').value = proje.ad;
    gecmisAtla = true;
    tumunuCiz(true);
    ayarFormCiz();
    if (aktifSekme === 'maliyet') { fiyatFormCiz(); teklifFormCiz(); }
    gecmisDugmeleri();
  }
  let gecmisAtla = false;
  function geriAl() {
    if (gecmis.length < 2) return;
    ileri.push(gecmis.pop());
    sonKayitZamani = 0;
    gecmisYukle(gecmis[gecmis.length - 1]);
  }
  function yinele() {
    if (!ileri.length) return;
    const j = ileri.pop();
    gecmis.push(j);
    sonKayitZamani = 0;
    gecmisYukle(j);
  }
  document.addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    const yazi = e.target.matches('input[type="text"], input:not([type]), textarea');
    if (yazi) return; // metin alanında tarayıcının kendi geri alması çalışsın
    const k = e.key.toLowerCase();
    if (k === 'z' && !e.shiftKey) { e.preventDefault(); geriAl(); }
    else if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); yinele(); }
  });

  function kaydet() {
    const json = JSON.stringify(proje);
    try { localStorage.setItem(KAYIT_ANAHTARI, json); } catch (e) { /* depolama kapalı olabilir */ }
    if (gecmisAtla) gecmisAtla = false;
    else gecmiseEkle(json);
  }

  const seciliModul = () => proje.moduller.find((m) => m.id === seciliId);
  /** Projede olmayan bir ad: "Alt Dolap", "Alt Dolap 2", ... (en büyük numaranın bir fazlası). */
  function benzersizAd(ad) {
    const kok = ad.trim();
    const adlar = new Set(proje.moduller.map((x) => x.ad));
    if (!adlar.has(kok)) return kok;
    let n = 1;
    const re = new RegExp(`^${kok.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} (\\d+)$`);
    for (const a of adlar) { const r = a.match(re); if (r) n = Math.max(n, Number(r[1])); }
    return `${kok} ${n + 1}`;
  }
  const malzeme = (id) => Hesap.malzemeBul(proje.ayarlar, id);
  const malzemeEtiket = (m) => (m ? `${m.ad}` : '?');

  // ---------------- Modül listesi ----------------
  function modulListesiCiz() {
    const L = proje.yerlesim.tip === 'L';
    $('#modulListesi').innerHTML = proje.moduller.map((m) => {
      const olcu = m.tip === 'lkose'
        ? `L ${m.genislik}+${m.genislik2} × Y${m.yukseklik} × D${m.derinlik}`
        : m.tip === 'panel' && m.panelTuru === 'nesne' ? `Eşya ${m.en} × ${m.boy}`
        : m.tip === 'panel' ? `Panel ${m.boy} × ${m.en}`
        : `G${m.genislik} × Y${m.yukseklik} × D${m.derinlik}${m.sutunlar.length > 1 ? ` · ${m.sutunlar.length} bölme` : ''}`;
      const duvar = L ? (m.tip === 'lkose' ? ' · köşe' : ` · ${m.duvar} duvarı`) : '';
      return `
      <li class="${m.id === seciliId ? 'secili' : ''}" data-id="${esc(m.id)}">
        <span class="m-ad">${esc(m.ad)}${sonuc && sonuc.modulSonuclari[m.id] && sonuc.modulSonuclari[m.id].uyarilar.length ? ` <span class="uyari-rozet" title="${esc(sonuc.modulSonuclari[m.id].uyarilar.join('\n'))}">⚠ ${sonuc.modulSonuclari[m.id].uyarilar.length}</span>` : ''}</span>
        <span class="m-olcu">${esc(olcu)}${m.adet > 1 ? ` · ${esc(m.adet)} ad.` : ''}${duvar}</span>
        <span class="m-arac">
          <button data-islem="yukari" title="Yukarı taşı" aria-label="Yukarı taşı">↑</button>
          <button data-islem="asagi" title="Aşağı taşı" aria-label="Aşağı taşı">↓</button>
          <button data-islem="kopya" title="Çoğalt">⧉</button>
          <button data-islem="sil" title="Sil">✕</button>
        </span>
      </li>`;
    }).join('') || '<li class="bos">Modül yok. Aşağıdan ekleyin.</li>';
  }

  $('#modulListesi').addEventListener('click', (e) => {
    const li = e.target.closest('li[data-id]');
    if (!li) return;
    const id = li.dataset.id;
    const islem = e.target.dataset.islem;
    const i = proje.moduller.findIndex((x) => x.id === id);
    const m = proje.moduller[i];
    if (islem === 'sil') {
      if (!confirm(`"${m.ad}" silinsin mi?`)) return;
      proje.moduller.splice(i, 1);
      if (seciliId === id) seciliId = proje.moduller[0] ? proje.moduller[0].id : null;
    } else if (islem === 'kopya') {
      const k = JSON.parse(JSON.stringify(m));
      k.id = Hesap.yeniModul('alt').id;
      k.ad = benzersizAd(m.ad);
      proje.moduller.splice(i + 1, 0, k);
      seciliId = k.id;
    } else if (islem === 'yukari') {
      if (i > 0) [proje.moduller[i - 1], proje.moduller[i]] = [proje.moduller[i], proje.moduller[i - 1]];
    } else if (islem === 'asagi') {
      if (i < proje.moduller.length - 1) [proje.moduller[i + 1], proje.moduller[i]] = [proje.moduller[i], proje.moduller[i + 1]];
    } else {
      seciliId = id;
    }
    tumunuCiz(true);
  });

  // ---------------- Dolap kataloğu ----------------
  function katalogCiz() {
    const A = Hesap.varsayilanAyarlar();
    const kartlar = {};
    for (const [anahtar, p] of Object.entries(Hesap.PRESETLER)) {
      const m = Hesap.yeniModul(anahtar);
      const geo = Hesap.modulHesapla(m, A).geo;
      const olcu = m.tip === 'lkose' ? `${m.genislik}+${m.genislik2}×${m.yukseklik}` : m.tip === 'panel' ? `${m.boy}×${m.en}` : `${m.genislik}×${m.yukseklik}×${m.derinlik}`;
      (kartlar[p.grup] = kartlar[p.grup] || []).push(`
        <button class="k-kart" data-preset="${esc(anahtar)}" title="${esc(p.aciklama || '')}">
          <span class="k-resim">${geo ? (geo.nesne ? Uc.ciz(Uc.modulParcalari(geo, {}), { yaw: -30, pitch: 15 }, {}) : Cizim.onGorunus(m, geo, {})) : ''}</span>
          <b>${esc(p.ad)}</b><small>${esc(p.aciklama || '')}</small><small class="k-olcu">${esc(olcu)}</small>
        </button>`);
    }
    $('#katalogGruplar').innerHTML = Hesap.KATALOG_GRUPLARI.filter((g) => kartlar[g]).map((g) => `<button type="button" class="ikincil kucuk-buton" data-kgrup="${esc(g)}">${esc(g)}</button>`).join('');
    $('#katalogIcerik').innerHTML = Hesap.KATALOG_GRUPLARI.filter((g) => kartlar[g]).map((g) => `<section data-grup="${esc(g)}"><h3>${esc(g)}</h3><div class="k-izgara">${kartlar[g].join('')}</div></section>`).join('')
      + `<h3>Boş başlangıç</h3><div class="k-izgara"><button class="k-kart k-bos" data-preset="__bos"><b>Boş gövde</b><small>Bölme ve satırları kendiniz ekleyin</small></button></div>`;
  }
  $('#btnKatalog').addEventListener('click', () => {
    if (!$('#katalogIcerik').innerHTML) katalogCiz();
    $('#katalog').showModal();
  });
  $('#katalogKapat').addEventListener('click', () => $('#katalog').close());
  // Katalogda arama: ad, açıklama ve grup adında geçen kartlar kalır
  const trKucuk = (x) => String(x).toLocaleLowerCase('tr');
  $('#katalogAra').addEventListener('input', (e) => {
    const q = trKucuk(e.target.value.trim());
    document.querySelectorAll('#katalogIcerik section[data-grup]').forEach((sec) => {
      let gorunen = 0;
      sec.querySelectorAll('.k-kart').forEach((k) => {
        const ok = !q || trKucuk(k.textContent + ' ' + sec.dataset.grup).includes(q);
        k.hidden = !ok;
        if (ok) gorunen++;
      });
      sec.hidden = !gorunen;
    });
  });
  $('#katalogGruplar').addEventListener('click', (e) => {
    const b = e.target.closest('[data-kgrup]');
    if (!b) return;
    const sec = document.querySelector(`#katalogIcerik section[data-grup="${CSS.escape(b.dataset.kgrup)}"]`);
    if (sec) sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  $('#btnYardim').addEventListener('click', () => $('#yardim').showModal());
  $('#yardimKapat').addEventListener('click', () => $('#yardim').close());
  $('#yardim').addEventListener('click', (e) => { if (e.target === $('#yardim')) $('#yardim').close(); });
  $('#btnGeriAl').addEventListener('click', geriAl);
  $('#btnYinele').addEventListener('click', yinele);
  $('#katalog').addEventListener('click', (e) => {
    if (e.target === $('#katalog')) { $('#katalog').close(); return; }
    const kart = e.target.closest('[data-preset]');
    if (!kart) return;
    let m;
    if (kart.dataset.preset === '__bos') {
      m = Hesap.yeniModul('alt_kapak');
      m.ad = 'Yeni Dolap';
      m.sutunlar = [{ genislik: null, satirlar: [] }];
    } else m = Hesap.yeniModul(kart.dataset.preset);
    m.ad = benzersizAd(m.ad);
    // Hazır modülün kullandığı, projede olmayan malzemeler (ör. lambri çıtası) varsayılanlardan eklenir
    const varsayilan = Hesap.varsayilanAyarlar().malzemeler;
    for (const id of Object.values(m.malzeme || {})) {
      if (proje.ayarlar.malzemeler.some((x) => x.id === id)) continue;
      const v = varsayilan.find((x) => x.id === id);
      if (v) { proje.ayarlar.malzemeler.push(JSON.parse(JSON.stringify(v))); bildir(`Malzemelere eklendi: ${esc(v.ad)}`); }
    }
    proje.moduller.push(m);
    seciliId = m.id;
    $('#katalog').close();
    tumunuCiz(true);
  });

  // ---------------- Ölçüden tasarım öner ----------------
  let tasarimTur = 'gardirop';
  const tasarimOlculeri = {}; // tür → son girilen ölçüler
  let tasarimOnerileri = [];
  function tasarimFormCiz() {
    $('#tasarimTurler').innerHTML = Object.entries(Tasarim.TURLER).map(([k, t]) => `<button type="button" role="radio" aria-checked="${k === tasarimTur}" data-tur="${k}" title="${esc(t.aciklama)}">${esc(t.ad)}</button>`).join('');
    const o = tasarimOlculeri[tasarimTur] || {};
    const stilSec = $('#tasarimStil');
    if (!stilSec.options.length) {
      stilSec.innerHTML = '<option value="rastgele">Rastgele (her öneri farklı stil)</option>'
        + Object.entries(Tasarim.STILLER).map(([k, s]) => `<option value="${k}">${esc(s.ad)}</option>`).join('')
        + '<option value="proje">Proje malzemeleri (renk/kulp değişmez)</option>';
    }
    $('#tasarimAlanlar').innerHTML = Tasarim.TURLER[tasarimTur].alanlar.map((a) => `<label>${esc(a.etiket)} (mm)<input type="number" data-talan="${a.ad}" min="${a.min}" max="${a.max}" step="10" value="${o[a.ad] != null ? o[a.ad] : a.vars}"></label>`).join('');
  }
  function tasarimOlcuOku() {
    const o = {};
    document.querySelectorAll('#tasarimAlanlar [data-talan]').forEach((el) => { o[el.dataset.talan] = el.value === '' ? null : Number(el.value); });
    tasarimOlculeri[tasarimTur] = o;
    return o;
  }
  function tasarimUret() {
    const o = tasarimOlcuOku();
    const T = Tasarim.TURLER[tasarimTur];
    const sinir = Tasarim.sinirla(tasarimTur, o);
    const duzeltilen = T.alanlar.filter((a) => o[a.ad] !== sinir[a.ad]);
    for (const a of duzeltilen) { const el = document.querySelector(`#tasarimAlanlar [data-talan="${a.ad}"]`); if (el) el.value = sinir[a.ad]; }
    $('#tasarimDurum').textContent = 'Hesaplanıyor…';
    // Arayüz güncellensin diye hesap bir sonraki karede
    setTimeout(() => {
      tasarimOnerileri = Tasarim.oneriler(tasarimTur, sinir, proje.ayarlar, 3, null, { stil: $('#tasarimStil').value, dekor: $('#tasarimDekor').checked });
      const not = duzeltilen.length ? `Sınır dışı ölçü düzeltildi: ${duzeltilen.map((a) => `${a.etiket} ${sinir[a.ad]}`).join(', ')}. ` : '';
      $('#tasarimDurum').textContent = not + (tasarimOnerileri.length
        ? `${tasarimOnerileri.length} öneri. Beğenmediyseniz "Öneri üret"e tekrar basın.`
        : 'Bu ölçülerle kurala uygun tasarım bulunamadı; ölçüleri değiştirin.');
      tasarimSonucCiz();
    }, 20);
  }
  function tasarimSonucCiz() {
    $('#tasarimSonuc').innerHTML = tasarimOnerileri.map((t, i) => {
      let fiyat = '';
      try {
        const gr = Yerlesim.projeYerlesimi(t.sonuc.kesimListesi, t.proje.ayarlar, null);
        const r = Maliyet.maliyetHesapla(t.proje, t.sonuc, Yerlesim.plakaSayilari(gr));
        fiyat = `≈ ${para(r.genelToplam)} (KDV dahil, fiyat ayarlarınıza göre)`;
      } catch (e) { fiyat = ''; }
      const govdeSay = t.moduller.filter((m) => !(m.tip === 'panel' && (m.panelTuru === 'bosluk' || m.panelTuru === 'nesne'))).length;
      const yer = t.sonuc.yerlesim;
      return `<article class="t-kart">
        <h3>${esc(t.ad)} <small>Öneri ${i + 1} · ${govdeSay} modül</small></h3>
        ${t.palet ? `<div class="t-palet" title="${esc(t.stilAd)}"><b>${esc(t.stilAd)}</b>${[t.palet.govde, t.palet.kapak, t.palet.aksan].filter(Boolean).map((id) => { const m = Hesap.malzemeBul(t.proje.ayarlar, id); return m ? `<span class="t-renk" style="background:${esc(m.renk)}" title="${esc(m.ad)}"></span>` : ''; }).join('')}</div>` : ''}
        <div class="t-resim">${Uc.ciz(Uc.projeParcalari(yer, { kapaksiz: $('#tasarimIc').checked, renkFn: (m) => Hesap.modulRenkleri(m, t.proje.ayarlar) }), { yaw: -28, pitch: 14 }, {})}</div>
        <details class="t-gorunus"><summary>Ön görünüş</summary>${Cizim.duvarGorunus(yer, 'A')}${yer.tip === 'L' ? Cizim.duvarGorunus(yer, 'B') : ''}</details>
        <ul>${t.ozet.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
        <p class="kucuk">${esc(fiyat)} · ${t.sonuc.kesimListesi.reduce((a, p) => a + p.adet, 0)} parça</p>
        <div class="t-dugmeler">
          <button data-tekle="${i}">Projeye ekle</button>
          <button data-tyeni="${i}" class="ikincil">Yeni proje olarak aç</button>
        </div>
      </article>`;
    }).join('');
  }
  function tasarimUygula(i, yeni) {
    const t = tasarimOnerileri[i];
    if (!t) return;
    const moduller = JSON.parse(JSON.stringify(t.moduller));
    if (!yeni && t.yerlesim.tip === 'L' && proje.moduller.length) { alert('L mutfak önerisi köşeden başladığı için yalnızca yeni proje olarak açılabilir.'); return; }
    if (yeni && proje.moduller.length && !confirm('Mevcut modüller kaldırılıp bu tasarım yeni proje olarak açılsın mı? (Malzeme, hırdavat ve fiyat ayarları korunur.)')) return;
    // Stilin kullandığı, projede olmayan renkler malzeme listesine eklenir
    const ekler = (t.ekMalzemeler || []).filter((m) => !proje.ayarlar.malzemeler.some((x) => x.id === m.id));
    if (ekler.length) {
      proje.ayarlar.malzemeler.push(...JSON.parse(JSON.stringify(ekler)));
    }
    if (yeni) {
      proje.moduller = [];
      proje.yerlesim = Object.assign(proje.yerlesim, { tip: t.yerlesim.tip, duvarA: t.yerlesim.duvarA, duvarB: t.yerlesim.duvarB || 0, engeller: [], tavan: t.olcu.tavan || proje.yerlesim.tavan || 0 });
      proje.ad = `${t.ad} ${t.yerlesim.duvarA}${t.yerlesim.duvarB ? '+' + t.yerlesim.duvarB : ''}`;
      $('#projeAd').value = proje.ad;
    } else {
      // Mevcut modüllerin bittiği yerden başlayarak, öneri içindeki konumlar korunur
      const son = proje.moduller.length ? Math.max(0, ...sonuc.yerlesim.yerler.filter((y) => y.duvar !== 'B').map((y) => y.bas + (y.duvar === 'kose' ? y.W : y.W))) : 0;
      if (son > 0) {
        const bas = new Map(t.sonuc.yerlesim.yerler.map((y) => [y.modul.id, y.bas]));
        for (const m of moduller) if (bas.has(m.id)) m.konum = Math.round(bas.get(m.id) + son);
      }
    }
    let ilk = null;
    for (const m of moduller) {
      m.id = Hesap.yeniModul('alt').id;
      m.ad = benzersizAd(m.ad);
      proje.moduller.push(m);
      if (!ilk && !(m.tip === 'panel' && (m.panelTuru === 'bosluk' || m.panelTuru === 'nesne'))) ilk = m.id;
    }
    seciliId = ilk || seciliId;
    $('#tasarimPencere').close();
    tumunuCiz(true);
    document.querySelector('[data-sekme="uc"]').click();
    bildir(`"${esc(t.ad)}" ${yeni ? 'yeni proje olarak açıldı' : 'projeye eklendi'}: ${moduller.length} modül.${ekler.length ? ` Malzemelere eklendi: ${esc(ekler.map((m) => m.ad).join(', '))}.` : ''}`, true);
  }
  $('#tasarimIc').addEventListener('change', tasarimSonucCiz);
  $('#tasarimDekor').addEventListener('change', tasarimUret);
  $('#btnTasarim').addEventListener('click', () => {
    if (!tasarimOnerileri.length) $('#tasarimIc').checked = !!Tasarim.IC_ONIZLEME[tasarimTur];
    tasarimFormCiz();
    $('#tasarimPencere').showModal();
    if (!tasarimOnerileri.length) tasarimUret();
  });
  $('#tasarimKapat').addEventListener('click', () => $('#tasarimPencere').close());
  $('#tasarimTurler').addEventListener('click', (e) => {
    const b = e.target.closest('[data-tur]');
    if (!b) return;
    tasarimOlcuOku();
    tasarimTur = b.dataset.tur;
    $('#tasarimIc').checked = !!Tasarim.IC_ONIZLEME[tasarimTur];
    tasarimFormCiz();
    tasarimUret();
  });
  $('#btnTasarimUret').addEventListener('click', tasarimUret);
  $('#tasarimAlanlar').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); tasarimUret(); } });
  $('#tasarimSonuc').addEventListener('click', (e) => {
    const ek = e.target.dataset.tekle;
    const yn = e.target.dataset.tyeni;
    if (ek != null) tasarimUygula(Number(ek), false);
    else if (yn != null) tasarimUygula(Number(yn), true);
  });

  // ---------------- Modül formu ----------------
  const secim = (ad, deger, secenekler, ek) =>
    `<select data-alan="${ad}" ${ek || ''}>${secenekler.map(([v, t]) => `<option value="${esc(v)}"${String(v) === String(deger) ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select>`;
  const sayiGir = (alan, deger, ek) => `<input data-alan="${alan}" type="number" value="${deger == null ? '' : esc(deger)}" ${ek || ''}>`;

  function malzemeHirdavatFormu(m) {
    const A = proje.ayarlar;
    const malzSecenek = A.malzemeler.map((x) => [x.id, x.ad]);
    const ozel = Object.keys(m.malzeme || {}).filter((k) => m.malzeme[k]).length + Object.keys(m.hirdavat || {}).filter((k) => m.hirdavat[k]).length;
    return `
      <details class="ozel-secim" ${ozel ? 'open' : ''}>
        <summary>Bu modüle özel malzeme & hırdavat${ozel ? ` <span class="rozet">${ozel}</span>` : ''}</summary>
        <div class="form-izgara">
          ${Hesap.KULLANIMLAR.map((k) => `<label>${KULLANIM_AD[k]}${secim('malzeme.' + k, (m.malzeme || {})[k] || '', [['', `Proje: ${malzemeEtiket(malzeme(A.kullanim[k]))}`], ...malzSecenek])}</label>`).join('')}
          ${Object.entries(HS).map(([k, h]) => `<label>${h.baslik}${secim('hirdavat.' + k, (m.hirdavat || {})[k] || '', [['', `Proje: ${h.secenekler[A.hirdavat[k]].ad}`], ...Object.entries(h.secenekler).map(([v, o]) => [v, o.ad])])}</label>`).join('')}
        </div>
      </details>`;
  }

  /** Bir satırın düzenleme kartı. */
  function satirKarti(m, si, s, i, sayi) {
    const surgu = m.onTipi === 'surgu';
    const kapak = s.tip === 'kapak';
    const rafli = s.tip === 'kapak' || s.tip === 'acik';
    const tipler = Object.entries(Hesap.SATIR_TIPLERI);
    return `
      <div class="satir-kart tip-${esc(s.tip)}" data-sutun="${si}" data-satir="${i}">
        <div class="sk-ust">
          <span class="sk-no">${i + 1}</span>
          ${secim('tip', s.tip, tipler)}
          <label title="Ön yüz yüksekliği; boş = kalanı paylaş">Yük.${sayiGir('yukseklik', s.yukseklik, 'min="0" placeholder="oto"')}</label>
          ${s.tip !== 'nis' && s.tip !== 'acik' ? `<label title="Yan yana kapak / çekmece adedi">Adet${sayiGir('adet', s.adet, 'min="1" max="8"')}</label>` : ''}
          ${rafli ? `<label title="${s.rafYukseklikleri.length ? 'Raf yükseklikleri girildiği için sayı onlardan gelir' : 'Her bölmedeki raf sayısı (eşit aralıklı)'}">Raf${sayiGir('raf', s.rafYukseklikleri.length ? s.rafYukseklikleri.length : s.raf, `min="0" max="20"${s.rafYukseklikleri.length ? ' disabled' : ''}`)}</label>` : ''}
          <span class="sk-arac"><button data-islem="satirYukari" title="Yukarı">↑</button><button data-islem="satirAsagi" title="Aşağı">↓</button><button data-islem="satirSil" title="Sil">✕</button></span>
        </div>
        ${s.tip === 'cekmece' ? `<div class="sk-alt">
          <label title="Çekmece kutusunun (yan) yüksekliği; boş = önden 40 mm kısa">Kutu yük.${sayiGir('kutuYukseklik', s.kutuYukseklik, 'min="50" placeholder="oto"')}</label>
          <label title="Ray boyu; boş = sığan en uzun">Ray${secim('rayBoyu', s.rayBoyu || '', [['', 'Oto'], ...Hesap.RAY_BOYLARI.map((b) => [b, b + ' mm'])])}</label>
          <label>Çekmece içi${secim('cekmeceIc', s.cekmeceIc, Object.entries(Hesap.CEKMECE_ICLERI))}</label>
        </div>` : ''}
        ${rafli || kapak ? `<div class="sk-alt">
          ${rafli ? `<label title="Satır içi dikey ara bölme (yalnızca bu satırda)">Dikme${sayiGir('dikme', s.dikme, 'min="0" max="8"')}</label>` : ''}
          ${kapak && !surgu ? `<label>Kapak${secim('kapakTuru', s.kapakTuru, Object.entries(Hesap.KAPAK_TURLERI))}</label>` : ''}
          ${kapak && !surgu ? `<label>Açılım${secim('acilim', s.acilim, Object.entries(Hesap.ACILIMLAR))}</label>` : ''}
          ${kapak && !surgu && s.adet === 1 && s.acilim === 'yana' ? `<label>Menteşe${secim('menteseYonu', s.menteseYonu, Object.entries(Hesap.MENTESE_YONLERI))}</label>` : ''}
          ${kapak ? `<label title="Kapak arkasında gizli çekmece sayısı (satırın altına)">İç çekmece${sayiGir('icCekmece', s.icCekmece, 'min="0" max="4"')}</label>` : ''}
          ${kapak && s.icCekmece > 0 ? `<label title="Her iç çekmece önünün yüksekliği">İç ç. yük.${sayiGir('icCekmeceH', s.icCekmeceH, 'min="60" placeholder="140"')}</label>
            <label>Çekmece içi${secim('cekmeceIc', s.cekmeceIc, Object.entries(Hesap.CEKMECE_ICLERI))}</label>` : ''}
          ${rafli ? `<label class="genis2" title="Her rafın, satırın iç tabanından rafın üst yüzüne yüksekliği (mm), virgülle. Boş bırakılırsa raflar eşit aralıkla dizilir. İç görünüşte ölçüler yazılır.">Raf yükseklikleri (alttan)<input data-alan="rafYukseklikleri" type="text" inputmode="decimal" value="${esc(s.rafYukseklikleri.join(', '))}" placeholder="eşit aralık · ör. 320, 650"></label>` : ''}
          ${rafli && (s.raf > 0 || s.rafYukseklikleri.length) ? `<label>Raf tipi${secim('rafTipi', s.rafTipi, [['ahsap', 'Ahşap'], ['cam', 'Cam']])}</label>` : ''}
          ${rafli && (s.raf > 0 || s.rafYukseklikleri.length) && !s.rafSabit ? `<label title="Rafın önden geri çekmesi (mm); boş = ayarlardaki değer">Raf geri${sayiGir('rafGeri', s.rafGeri, `min="0" placeholder="${esc(proje.ayarlar.rafOnGeriCekme)}"`)}</label>` : ''}
          ${rafli && s.raf > 0 && s.rafTipi !== 'cam' ? `<label title="Sabit raf ara bağlantıyla (ör. şeffaf T) vidalanır">Montaj${secim('rafSabit', String(!!s.rafSabit), [['false', 'Hareketli (pim)'], ['true', 'Sabit']])}</label>` : ''}
          ${rafli ? `<label class="onay"><input data-alan="aski" type="checkbox" ${s.aski ? 'checked' : ''}> Askı</label>` : ''}
          ${rafli && s.aski ? `<label title="Boru: duvara paralel elbise askısı (derinlik ≥ 500). Kanca: portmanto kancaları (vestiyer). Öne çekilir: sığ dolapta derinlemesine ray (≥ 300).">Askı türü${secim('askiTuru', s.askiTuru, [['boru', 'Askı borusu'], ['kanca', 'Kanca (portmanto)'], ['onden', 'Öne çekilir askı']])}</label>` : ''}
          ${rafli && s.aski && s.askiTuru === 'boru' ? `<label title="Askı borusu ekseninin satırın iç tavanından mesafesi (mm)">Askı üstten${sayiGir('askiUstten', s.askiUstten, 'min="30" placeholder="60"')}</label>` : ''}
          ${rafli ? `<label class="onay"><input data-alan="led" type="checkbox" ${s.led ? 'checked' : ''}> LED</label>` : ''}
        </div>` : ''}
        ${i < m.sutunlar[si].satirlar.length - 1 && !(s.tip === 'cekmece' && m.sutunlar[si].satirlar[i + 1].tip === 'cekmece') ? `<div class="sk-alt"><label class="onay" title="Bu satırla altındaki satır arasına sabit tabla (ara raf) konmaz; iki satır tek iç boşluğu paylaşır"><input data-alan="altTablaYok" type="checkbox" ${s.altTablaYok ? 'checked' : ''}> Altında ara tabla yok</label></div>` : ''}
      </div>`;
  }

  function bolmeDuzenleyici(m) {
    const n = m.sutunlar.length;
    return `
      <h3>Bölmeler ve iç düzen <small>(soldan sağa bölmeler, her birinde yukarıdan aşağı satırlar)</small></h3>
      ${m.sutunlar.map((c, si) => `
        <section class="bolme-kart" data-sutun="${si}">
          <div class="bk-ust">
            <b>${n > 1 ? `Bölme ${si + 1}` : 'İç düzen'}</b>
            ${n > 1 ? `<label title="Bölmenin iç genişliği; boş = kalanı paylaş">İç genişlik${sayiGir('sutunGenislik', c.genislik, 'min="0" placeholder="oto"')}</label>` : ''}
            ${n > 1 ? `<span class="sk-arac"><button data-islem="bolmeSola" title="Sola taşı">←</button><button data-islem="bolmeSaga" title="Sağa taşı">→</button><button data-islem="bolmeSil" title="Bölmeyi sil">✕</button></span>` : ''}
          </div>
          ${c.satirlar.map((s, i) => satirKarti(m, si, s, i)).join('') || '<p class="bos">Bölme boş: aşağıdan satır ekleyin.</p>'}
          <div class="ekle-satir">
            ${Object.entries(Hesap.SATIR_TIPLERI).map(([t, ad]) => `<button data-islem="satirEkle" data-tip="${t}" class="ikincil kucuk-buton">+ ${ad}</button>`).join('')}
          </div>
        </section>`).join('')}
      <button data-islem="bolmeEkle" class="ikincil">+ Dikey bölme ekle</button>
      <p class="not">Dikey bölme, gövdeyi boydan bir dikmeyle ayırır (ör. gardırobun raflı ve askılı tarafları). Bölme genişliği iç ölçüdür; boş bırakılanlar kalan genişliği paylaşır.</p>`;
  }

  function modulFormCiz() {
    const m = seciliModul();
    const kap = $('#modulForm');
    if (!m) { kap.innerHTML = '<p class="bos">Bir modül seçin ya da katalogdan ekleyin.</p>'; return; }
    const L = proje.yerlesim.tip === 'L';
    const lk = m.tip === 'lkose';
    const pn = m.tip === 'panel';
    const duvarSecimi = L && !lk ? `<label>Duvar${secim('duvar', m.duvar, [['A', 'A duvarı'], ['B', 'B duvarı']])}</label>` : '';
    const montaj = `<label title="Zeminden modülün altına mesafe. ${Hesap.ASILI_SINIR} mm üstü asılı (üst sıra) sayılır.">Montaj yük. (mm)${sayiGir('montajYuksekligi', m.montajYuksekligi, 'min="0"')}</label>`
      + (lk ? '' : `<label title="Duvar başından (L yerleşimde köşeden) modülün sol kenarına mesafe. Boş bırakılırsa modül sıradaki yere dizilir.">Duvarda konum (mm)${sayiGir('konum', m.konum, 'min="0" placeholder="sıradan"')}</label>`);

    if (pn && m.panelTuru === 'nesne') {
      const NS = Hesap.NESNELER;
      const gruplar = [...new Set(Object.values(NS).map((n) => n.grup))];
      kap.innerHTML = `
        <h2>Eşya / dekor</h2>
        <div class="form-izgara">
          <label class="genis">Ad<input data-alan="ad" value="${esc(m.ad)}"></label>
          <label class="genis">Eşya<select data-alan="nesneTuru">${gruplar.map((g) => `<optgroup label="${esc(g)}">${Object.entries(NS).filter(([, n]) => n.grup === g).map(([k, n]) => `<option value="${k}"${m.nesneTuru === k ? ' selected' : ''}>${esc(n.ad)}</option>`).join('')}</optgroup>`).join('')}</select></label>
          <label>Genişlik (mm)${sayiGir('en', m.en, 'min="10"')}</label>
          <label>Yükseklik (mm)${sayiGir('boy', m.boy, 'min="10"')}</label>
          <label>Derinlik (mm)${sayiGir('nesneD', m.nesneD, `min="1" placeholder="${NS[m.nesneTuru].D}"`)}</label>
          <label title="Zeminden nesnenin altına (ör. tezgah üstü 900, raf yüksekliği)">Zeminden (mm)${sayiGir('montajYuksekligi', m.montajYuksekligi, 'min="0"')}</label>
          <label title="Duvar başından (L'de köşeden) nesnenin sol kenarına">Duvarda konum (mm)${sayiGir('konum', m.konum, 'min="0" placeholder="0"')}</label>
          <label title="Nesnenin arka yüzünün duvardan uzaklığı (ör. raf içinde öne almak için)">Duvardan (mm)${sayiGir('duvarMesafe', m.duvarMesafe, 'min="0"')}</label>
          ${duvarSecimi}
        </div>
        <p class="not">Eşya ve dekorlar yalnızca 3B görünüşte ve çizimlerde yer alır; kesim listesine, plakaya ve maliyete girmez, dolapları itmez. Dolap içine koymak için konum, yükseklik ve duvardan uzaklığı dolabın iç ölçülerine göre verin.</p>`;
      return;
    }
    if (pn) {
      kap.innerHTML = `
        <h2>Panel</h2>
        <div class="form-izgara">
          <label class="genis">Ad<input data-alan="ad" value="${esc(m.ad)}"></label>
          <label>Panel türü${secim('panelTuru', m.panelTuru, Object.entries(Hesap.PANEL_TURLERI).map(([k, v]) => [k, v.ad]))}</label>
          <label>Malzeme${secim('panelMalzeme', m.panelMalzeme, [['kapak', 'Kapak malzemesi'], ['govde', 'Gövde malzemesi']])}</label>
          <label>Boy (mm)${sayiGir('boy', m.boy, 'min="20"')}</label>
          <label>En (mm)${sayiGir('en', m.en, 'min="20"')}</label>
          <label>Adet${sayiGir('adet', m.adet, 'min="1"')}</label>
          ${m.panelTuru === 'lambri' ? `<label title="Çıta eni (lambri profilinde profil eni)">Çıta eni (mm)${sayiGir('lambriCitaEn', m.lambriCitaEn, 'min="10"')}</label>
          <label title="İki çıta arası boşluk; 0 = bitişik (dilli profil). Kenarlarda çıta olur, artan pay aralıklara paylaştırılır.">Çıta aralığı (mm)${sayiGir('lambriAralik', m.lambriAralik, 'min="0"')}</label>
          <label>Çıta yönü${secim('lambriYon', m.lambriYon, [['dikey', 'Dikey'], ['yatay', 'Yatay']])}</label>
          <label title="Çıtaların arkasına tam ölçü panel (keçe, MDF, suntalam). Malzemesi: gövde ya da kapak malzemesi; modüle özel malzemeden değiştirilebilir.">Arka panel${secim('lambriArka', m.lambriArka, [['yok', 'Yok (çıtalar duvara)'], ['govde', 'Var – gövde malzemesi'], ['kapak', 'Var – kapak malzemesi']])}</label>` : ''}
          ${m.panelTuru === 'lambri' ? '' : `<label>Şekil${secim('sekil', m.sekil, Object.entries(Hesap.SEKILLER).map(([k, v]) => [k, v.ad]))}</label>`}
          ${Hesap.SEKILLER[m.sekil].param ? `<label>${esc(Hesap.SEKILLER[m.sekil].param)}${sayiGir('sekilParam', m.sekilParam, 'min="0"')}</label>` : ''}
          ${Hesap.SEKILLER[m.sekil].kose ? `<label title="Sol üstten saat yönünde">Köşe sayısı${secim('koseSayisi', m.koseSayisi, [[1, '1'], [2, '2 (üst)'], [3, '3'], [4, '4']])}</label>` : ''}
          ${m.sekil === 'dikdortgen'
            ? `<label title="Boy yönündeki bantlı kenar sayısı">Bant – uzun kenar${secim('bantU', m.bantU, [[0, '0'], [1, '1'], [2, '2']])}</label>
               <label title="En yönündeki bantlı kenar sayısı">Bant – kısa kenar${secim('bantK', m.bantK, [[0, '0'], [1, '1'], [2, '2']])}</label>`
            : `<label>Kenar bandı${secim('sekilBant', m.sekilBant, [['tum', 'Tüm çevre'], ['egri', 'Yalnız şekilli kenar'], ['yok', 'Bantsız']])}</label>`}
          ${montaj}${duvarSecimi}
        </div>
        <p class="not">${esc(Hesap.PANEL_TURLERI[m.panelTuru].aciklama)}.${Hesap.SEKILLER[m.sekil].aciklama ? ' ' + esc(Hesap.SEKILLER[m.sekil].aciklama) : ''} Şekilli parça plakadan dikdörtgen kaba ölçüyle kesilir, sonra CNC veya şablonla şekillenir; maliyette gerçek alan ve kenar uzunluğu kullanılır.</p>
        ${malzemeHirdavatFormu(m)}`;
      return;
    }

    const bazaAlanlari = `
        <label title="Ayak + önde baza: mutfakta yaygın; ayaklar taşır, önde klipsli baza bandı">Baza${secim('baza.tip', m.baza.tip, [['yok', 'Yok'], ['ayak', 'Ayarlı ayak'], ['ayak_on', 'Ayak + önde baza'], ['panel', 'Baza çerçevesi'], ['tekerlek', 'Tekerlek']])}</label>
        <label>Baza yük. (mm)${sayiGir('baza.yukseklik', m.baza.yukseklik, `min="0" ${m.baza.tip === 'yok' ? 'disabled' : ''}`)}</label>
        <label title="Ön bazanın kapak düzleminden geride kalması">Baza geri çekme${sayiGir('baza.geriCekme', m.baza.geriCekme, `min="0" ${m.baza.tip !== 'panel' && m.baza.tip !== 'ayak_on' ? 'disabled' : ''}`)}</label>
        ${m.tip === 'normal' && m.baza.tip === 'panel' ? `<label class="onay" title="Tekli mobilyada: yanlar zemine kadar iner, baza yanların arasında kalır; yandan baza görünmez. Mutfak dizisinde kapalı tutun (baza ayrı)."><input data-alan="yanlarYere" type="checkbox" ${m.yanlarYere ? 'checked' : ''}> Yanlar bazaya insin</label>` : ''}
        ${m.tip === 'normal' && (m.baza.tip === 'ayak' || m.baza.tip === 'panel') ? `<label class="onay" title="Süpürgelikte bas-aç ile açılan gizli çekmece (baza en az 100 mm)"><input data-alan="bazaCekmece" type="checkbox" ${m.bazaCekmece ? 'checked' : ''}> Baza çekmecesi (gizli)</label>` : ''}`;

    let html = `
      <h2>${lk ? 'L köşe dolap ölçüleri' : 'Modül ölçüleri'}</h2>
      <div class="form-izgara">
        <label class="genis">Ad<input data-alan="ad" value="${esc(m.ad)}"></label>
        ${lk
          ? `<label title="Köşeden A kolu ucuna, duvar boyunca">A kolu (mm)${sayiGir('genislik', m.genislik, 'min="300"')}</label>
             <label title="Köşeden B kolu ucuna, duvar boyunca">B kolu (mm)${sayiGir('genislik2', m.genislik2, 'min="300"')}</label>`
          : `<label>Genişlik (mm)${sayiGir('genislik', m.genislik, 'min="100"')}</label>`}
        <label title="Zeminden en üste, baza/ayak dahil">Yükseklik (mm)${sayiGir('yukseklik', m.yukseklik, 'min="100"')}</label>
        <label title="Gövde derinliği, kapak hariç">Derinlik (mm)${sayiGir('derinlik', m.derinlik, 'min="100"')}</label>
        <label>Adet${sayiGir('adet', m.adet, 'min="1"')}</label>
        ${montaj}${duvarSecimi}
      </div>`;

    if (lk) {
      html += `
      <h3>Yapı</h3>
      <div class="form-izgara">
        <label>Raf sayısı${sayiGir('raf', m.raf, 'min="0" max="10"')}</label>
        ${bazaAlanlari}
      </div>
      <p class="not">Katlanır iki kapak, L tablalar ve raflar ikişer parça halinde hesaplanır. Arkalık her kola ayrı çakılır.</p>`;
    } else {
      const surgu = m.onTipi === 'surgu';
      html += `
      <h3>Yapı</h3>
      <div class="form-izgara">
        <label>Birleşim${secim('yapi', m.yapi, [['yanlar_boydan', 'Yanlar boydan'], ['tabla_boydan', 'Tablalar boydan']])}</label>
        <label>Üst${secim('ust', m.ust, [['tam', 'Tam üst tabla'], ['kusak', 'Kuşak (tezgah altı)']])}</label>
        <label>Arkalık${secim('arkalik', m.arkalik, [['kanal', 'Kanala geçme'], ['cakma', 'Arkaya çakma'], ['yok', 'Arkalık yok']])}</label>
        <label>Ön tipi${secim('onTipi', m.onTipi, [['normal', 'Menteşeli kapaklar'], ['surgu', 'Sürgü kapak']])}</label>
        ${surgu
          ? `<label>Sürgü kapak adedi${secim('surguAdet', m.surguAdet, [[2, '2'], [3, '3'], [4, '4']])}</label>
             <label>Sürgü kapak türü${secim('surguTuru', m.surguTuru, Object.entries(Hesap.SURGU_TURLERI))}</label>`
          : `<label>Kapak tipi${secim('kapakTipi', m.kapakTipi, [['tam', 'Tam bini (bindirme)'], ['ic', 'Gömme (iç bini)']])}</label>`}
        ${bazaAlanlari}
        ${surgu ? '' : `<label class="onay" title="Çatı altı / merdiven altı: üst kenar eğimli"><input data-alan="egimli" type="checkbox" ${m.egimli ? 'checked' : ''}> Eğimli üst</label>`}
        ${!surgu && m.yapi === 'tabla_boydan' && m.ust === 'tam' && !m.egimli ? `<label title="Üst tablanın kapak yüzünden öne taşması (mm). 0'dan büyükse kapaklar tablanın altında biter.">Üst tabla ön taşma${sayiGir('ustTasmaOn', m.ustTasmaOn, 'min="0" max="100"')}</label>
        <label title="Üst tablanın her yandan taşması (mm), ör. 18">Üst tabla yan taşma${sayiGir('ustTasmaYan', m.ustTasmaYan, 'min="0" max="100"')}</label>
        <label title="Üst tablanın ön köşelerini kavisli (yuvarlatılmış) keser; 0 = düz">Üst tabla kavis R (mm)${sayiGir('ustKavisR', m.ustKavisR, 'min="0"')}</label>
        ${m.ustKavisR > 0 ? `<label>Kavisli köşe${secim('ustKavisKose', m.ustKavisKose, [['on', 'İki ön köşe'], ['sol', 'Sol ön köşe'], ['sag', 'Sağ ön köşe']])}</label>` : ''}
        <label class="onay" title="Üst tabla kapak kalınlığı kadar öne uzar, kapakların üstünü yandan yana kapatır; kapaklar tablanın altında biter"><input data-alan="ustKapakUstu" type="checkbox" ${m.ustKapakUstu ? 'checked' : ''}> Üst tabla kapakların üstünü kapatsın</label>` : ''}
        ${surgu ? '' : `<label class="onay" title="Alt tabla konmaz: yanlar zemine basar, en alt bölme zemine açılır (buzdolabı nişi gibi). Baza kullanılmaz."><input data-alan="altTablaYok" type="checkbox" ${m.altTablaYok ? 'checked' : ''}> Alt tabla yok (zemine açık)</label>`}
        ${m.egimli && !surgu ? `<label title="Sağ kenarın zeminden yüksekliği (sol = Yükseklik)">Sağ yükseklik (mm)${sayiGir('sagYukseklik', m.sagYukseklik, 'min="200"')}</label>` : ''}
        <label>Kulp yönü${secim('kulpYon', m.kulpYon, [['proje', 'Proje ayarı'], ...Object.entries(Hesap.KULP_YONLERI)])}</label>
        <label>Kulp konumu${secim('kulpKonum', m.kulpKonum, [['proje', 'Proje ayarı'], ...Object.entries(Hesap.KULP_KONUMLARI).map(([k, v]) => [k, v.split(' (')[0]])])}</label>
        ${surgu ? '' : `<label title="Kör köşe dolapta komşu dolabın önünde kalan sabit panel">Kör panel (mm)${sayiGir('korPanel', m.korPanel, 'min="0"')}</label>
        <label>Kör panel tarafı${secim('korTaraf', m.korTaraf, [['sol', 'Solda'], ['sag', 'Sağda']], m.korPanel > 0 ? '' : 'disabled')}</label>`}
      </div>
      ${surgu ? '<p class="not">Sürgü kapaklı dolapta satırların kapağı olmaz; sürgü kapaklar tüm önü kapatır. Çekmeceler gövde içine gömme yerleşir.</p>' : ''}
      ${bolmeDuzenleyici(m)}`;
    }
    html += malzemeHirdavatFormu(m);
    kap.innerHTML = html;
  }

  $('#modulForm').addEventListener('change', (e) => {
    clearTimeout(canliZamanlayici);
    const m = seciliModul();
    const el = e.target;
    const alan = el.dataset.alan;
    if (!m || !alan) return;
    const kart = el.closest('[data-satir]');
    const bolme = el.closest('[data-sutun]');
    let deger = el.type === 'checkbox' ? el.checked : el.value;
    if (el.type === 'number') deger = el.value === '' ? null : Number(el.value);
    if (['surguAdet', 'bantU', 'bantK', 'koseSayisi'].includes(alan)) deger = Number(deger);
    if (alan === 'rayBoyu') deger = deger === '' ? null : Number(deger);
    if (alan === 'rafSabit') deger = deger === 'true';
    if (alan === 'rafYukseklikleri') deger = Hesap.rafListesi(el.value);
    if (alan === 'nesneTuru' && Hesap.NESNELER[deger]) {
      // Yeni eşyanın tipik ölçüleri ve adı
      const n = Hesap.NESNELER[deger];
      Object.assign(m, { en: n.W, boy: n.H, nesneD: n.D, ad: benzersizAd(n.ad) });
      if (n.mt != null) m.montajYuksekligi = n.mt;
    }
    if (kart) {
      const s = m.sutunlar[Number(kart.dataset.sutun)].satirlar[Number(kart.dataset.satir)];
      s[alan] = deger;
      if (alan === 'tip' && (deger === 'cekmece' || deger === 'nis')) { s.raf = 0; s.aski = false; s.led = false; s.dikme = 0; }
      if (alan === 'tip' && deger === 'nis') s.adet = 1;
    } else if (alan === 'sutunGenislik' && bolme) {
      m.sutunlar[Number(bolme.dataset.sutun)].genislik = deger > 0 ? deger : null;
    } else if (alan.includes('.')) {
      const [a, b] = alan.split('.');
      if (!m[a]) m[a] = {};
      if (deger === '' && (a === 'malzeme' || a === 'hirdavat')) delete m[a][b];
      else m[a][b] = deger;
    } else {
      m[alan] = deger;
    }
    if (alan === 'adet' && !kart) m.adet = Math.max(1, Number(m.adet) || 1);
    tumunuCiz(true);
  });

  // Yazarken canlı güncelleme: form yeniden çizilmez (odak kaybolmaz), çizim ve listeler güncellenir.
  let canliZamanlayici = null;
  $('#modulForm').addEventListener('input', (e) => {
    const el = e.target;
    if (el.type !== 'number' || !el.dataset.alan) return;
    clearTimeout(canliZamanlayici);
    canliZamanlayici = setTimeout(() => {
      const m = seciliModul();
      if (!m) return;
      const alan = el.dataset.alan;
      const deger = el.value === '' ? null : Number(el.value);
      if (deger === null || !Number.isFinite(deger)) return;
      const kart = el.closest('[data-satir]');
      const bolme = el.closest('[data-sutun]');
      if (kart) m.sutunlar[Number(kart.dataset.sutun)].satirlar[Number(kart.dataset.satir)][alan] = deger;
      else if (alan === 'sutunGenislik' && bolme) m.sutunlar[Number(bolme.dataset.sutun)].genislik = deger > 0 ? deger : null;
      else if (alan.includes('.')) { const [a, b] = alan.split('.'); m[a][b] = deger; }
      else if (alan === 'adet') m.adet = Math.max(1, deger || 1);
      else m[alan] = deger;
      canliKayit = true;
      canliAnahtar = `${seciliId}|${alan}|${kart ? `${kart.dataset.sutun}.${kart.dataset.satir}` : ''}|${bolme ? bolme.dataset.sutun : ''}`;
      tumunuCiz(false);
    }, 250);
  });

  $('#modulForm').addEventListener('click', (e) => {
    const m = seciliModul();
    const islem = e.target.dataset.islem;
    if (!m || !islem) return;
    const kart = e.target.closest('[data-satir]');
    const bolmeEl = e.target.closest('[data-sutun]');
    const si = bolmeEl ? Number(bolmeEl.dataset.sutun) : -1;
    const B = m.sutunlar;
    const S = si >= 0 ? B[si].satirlar : null;
    const i = kart ? Number(kart.dataset.satir) : -1;
    if (islem === 'satirEkle') S.push(Hesap.yeniSatir(e.target.dataset.tip));
    else if (islem === 'satirSil') { S.splice(i, 1); setTimeout(() => bildir('Satır silindi.', true), 0); }
    else if (islem === 'satirYukari' && i > 0) [S[i - 1], S[i]] = [S[i], S[i - 1]];
    else if (islem === 'satirAsagi' && i < S.length - 1) [S[i + 1], S[i]] = [S[i], S[i + 1]];
    else if (islem === 'bolmeEkle') B.push({ genislik: null, satirlar: [Hesap.yeniSatir('kapak')] });
    else if (islem === 'bolmeSil') { if (B.length > 1 && confirm(`Bölme ${si + 1} silinsin mi?`)) B.splice(si, 1); else return; }
    else if (islem === 'bolmeSola' && si > 0) [B[si - 1], B[si]] = [B[si], B[si - 1]];
    else if (islem === 'bolmeSaga' && si < B.length - 1) [B[si + 1], B[si]] = [B[si], B[si + 1]];
    else return;
    tumunuCiz(true);
  });

  // ---------------- Hesap & çizim ----------------
  function uyarilariCiz() {
    const satirlar = [];
    for (const m of proje.moduller) {
      for (const x of (sonuc.modulSonuclari[m.id] || { uyarilar: [] }).uyarilar) {
        satirlar.push(`<li><a href="#" data-modul="${esc(m.id)}">${esc(m.ad)}</a>: ${esc(x)}</li>`);
      }
    }
    const modulUyarisi = new Set(proje.moduller.flatMap((m) => (sonuc.modulSonuclari[m.id] || { uyarilar: [] }).uyarilar.map((x) => `${m.ad}: ${x}`)));
    for (const x of sonuc.uyarilar) if (!modulUyarisi.has(x)) satirlar.push(`<li>${esc(x)}</li>`);
    const n = satirlar.length;
    $('#uyarilar').innerHTML = n ? `<details ${n <= 4 ? 'open' : ''}><summary>⚠ ${n} uyarı</summary><ul>${satirlar.join('')}</ul></details>` : '';
  }
  $('#uyarilar').addEventListener('click', (e) => {
    const a = e.target.closest('a[data-modul]');
    if (!a) return;
    e.preventDefault();
    seciliId = a.dataset.modul;
    if (aktifSekme !== 'cizim') document.querySelector('.sekmeler button[data-sekme="cizim"]').click();
    tumunuCiz(true);
    $('#modulForm').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  function cizimleriCiz() {
    const m = seciliModul();
    const ic = $('#icGorunus').checked;
    if (m) {
      const geo = sonuc.modulSonuclari[m.id].geo;
      $('#cizimOn').innerHTML = Cizim.onGorunus(m, geo, { ic });
      $('#cizimYan').innerHTML = Cizim.yanKesit(m, geo);
    } else {
      $('#cizimOn').innerHTML = '';
      $('#cizimYan').innerHTML = '';
    }
  }
  $('#icGorunus').addEventListener('change', cizimleriCiz);

  function yerlesimCiz() {
    const Y = proje.yerlesim;
    $('#yerlesimForm').innerHTML = `
      <label>Yerleşim${secim('tip', Y.tip, [['duz', 'Düz (tek duvar)'], ['L', 'L (köşeli)']])}</label>
      <label>A duvarı uzunluğu (mm)<input data-alan="duvarA" type="number" min="0" value="${Y.duvarA}"></label>
      <label>B duvarı uzunluğu (mm)<input data-alan="duvarB" type="number" min="0" value="${Y.duvarB}" ${Y.tip === 'L' ? '' : 'disabled'}></label>`;
    sahaCiz();
    const yer = sonuc.yerlesim;
    $('#cizimPlan').innerHTML = Cizim.planCizimi(yer);
    $('#cizimDuvarA').innerHTML = Cizim.duvarGorunus(yer, 'A');
    $('#duvarBKap').hidden = Y.tip !== 'L';
    if (Y.tip === 'L') $('#cizimDuvarB').innerHTML = Cizim.duvarGorunus(yer, 'B');
  }
  function sahaCiz() {
    const Y = proje.yerlesim;
    const L = Y.tip === 'L';
    $('#sahaForm').innerHTML = `
      <label title="Zeminden tavana; 0 = girilmedi">Tavan yüksekliği (mm)<input data-saha="tavan" type="number" min="0" value="${esc(Y.tavan)}"></label>
      <label title="İki duvar arası açı (L mutfak)">Köşe açısı (°)<input data-saha="koseAcisi" type="number" min="45" max="135" value="${esc(Y.koseAcisi)}" ${L ? '' : 'disabled'}></label>
      <label title="Duvar boyunca en büyük düzlük sapması">Duvar sapması (mm)<input data-saha="duvarSapma" type="number" min="0" value="${esc(Y.duvarSapma)}"></label>
      <label class="onay" title="Yan yana dolaplar için birleştirme vidası, asma dolap askısı, boy dolap devrilme önleyici"><input data-saha="birlestir" type="checkbox" ${Y.birlestir !== false ? 'checked' : ''}> Yan yana dolapları birbirine bağla</label>`;
    const tur = Object.entries(Hesap.ENGEL_TURLERI).map(([k, v]) => [k, v.ad]);
    $('#engelTablo').innerHTML = Y.engeller.length
      ? `<table class="liste engel-tablo"><thead><tr><th>Tür</th>${L ? '<th>Duvar</th>' : ''}<th title="Köşeden / duvarın solundan">Konum</th><th title="Zeminden (pencere: denizlik)">Yükseklik</th><th>Genişlik</th><th title="Pencere/kapı/kalorifer yüksekliği">Boy</th><th title="Kolon derinliği">Derinlik</th><th>Not</th><th></th></tr></thead><tbody>
        ${Y.engeller.map((e, i) => {
          const alan = Hesap.ENGEL_TURLERI[e.tur].alan;
          return `<tr data-engel="${i}"><td>${secim('tur', e.tur, tur)}</td>${L ? `<td>${secim('duvar', e.duvar, [['A', 'A'], ['B', 'B']])}</td>` : ''}
            <td><input data-alan="x" type="number" min="0" value="${esc(e.x)}"></td>
            <td><input data-alan="y" type="number" min="0" value="${esc(e.y)}" ${e.tur === 'kolon' || e.tur === 'kapi' ? 'disabled' : ''}></td>
            <td><input data-alan="genislik" type="number" min="0" value="${esc(e.genislik)}" ${alan ? '' : 'disabled'}></td>
            <td><input data-alan="yukseklik" type="number" min="0" value="${esc(e.yukseklik)}" ${alan && e.tur !== 'kolon' ? '' : 'disabled'}></td>
            <td><input data-alan="derinlik" type="number" min="0" value="${esc(e.derinlik)}" ${e.tur === 'kolon' ? '' : 'disabled'}></td>
            <td><input data-alan="not" value="${esc(e.not)}"></td>
            <td><button data-islem="engelSil" class="ikincil kucuk-buton" title="Sil">✕</button></td></tr>`;
        }).join('')}</tbody></table>`
      : '<p class="bos">Engel yok. Pencere, kapı, kolon, priz, su ve gaz çıkışlarını ekleyin; program dolaplarla çakışmaları uyarır.</p>';
    const notlar = (sonuc.saha && sonuc.saha.notlar) || [];
    const sahaUyari = sonuc.uyarilar.filter((u) => u.startsWith('Saha:'));
    $('#sahaNotlari').innerHTML = (sahaUyari.length ? `<ul class="saha-uyari">${sahaUyari.map((u) => `<li>${esc(u.replace('Saha: ', ''))}</li>`).join('')}</ul>` : '')
      + (notlar.length ? `<h4>Montaj notları</h4><ul>${notlar.map((n) => `<li><b>${esc(n.modul)}:</b> ${esc(n.metin)}</li>`).join('')}</ul>` : '');
    if (Y.engeller.length || Y.tavan > 0) $('#sahaKutu').open = true;
  }
  $('#sahaKutu').addEventListener('change', (e) => {
    const el = e.target;
    const Y = proje.yerlesim;
    const tr = el.closest('tr[data-engel]');
    if (tr) {
      const en = Y.engeller[Number(tr.dataset.engel)];
      const alan = el.dataset.alan;
      en[alan] = el.type === 'number' ? Math.max(0, Number(el.value) || 0) : el.value;
    } else if (el.dataset.saha) {
      Y[el.dataset.saha] = el.type === 'checkbox' ? el.checked : Math.max(0, Number(el.value) || 0);
    } else return;
    tumunuCiz(true);
  });
  $('#sahaKutu').addEventListener('click', (e) => {
    const Y = proje.yerlesim;
    if (e.target.dataset.islem === 'engelEkle') Y.engeller.push({ tur: 'priz', duvar: 'A', x: 300, y: 1100, genislik: 0, yukseklik: 0, derinlik: 0, not: '' });
    else if (e.target.dataset.islem === 'engelSil') Y.engeller.splice(Number(e.target.closest('tr').dataset.engel), 1);
    else return;
    tumunuCiz(true);
  });

  $('#yerlesimForm').addEventListener('change', (e) => {
    const el = e.target;
    const alan = el.dataset.alan;
    if (!alan) return;
    proje.yerlesim[alan] = el.type === 'number' ? Number(el.value) || 0 : el.value;
    tumunuCiz(true);
  });

  const bantYazi = (b) => {
    const p = [];
    if (b.u) p.push(`${b.u} uzun`);
    if (b.k) p.push(`${b.k} kısa`);
    return p.length ? p.join(' + ') : 'bantsız';
  };

  /** Kesim listesi tablosu; yazdırmada işaretleme kutusu eklenir. */
  function kesimTablosuHtml(yazdir) {
    const L = sonuc.kesimListesi;
    if (!L.length) return '<p class="bos">Parça yok.</p>';
    let onceki = null;
    const kolon = yazdir ? 10 : 11;
    let html = `<table class="liste kesim"><thead><tr>${yazdir ? '<th class="kutu-sutun">✓</th>' : ''}<th>No</th><th>Parça</th><th>Adet</th>${yazdir ? '' : '<th class="net">Net boy</th><th class="net">Net en</th>'}<th>Kesim boy</th><th>Kesim en</th><th>Bant</th><th>Damar</th><th title="Parça başına delik sayısı (Atölye sekmesindeki delik planı)">Delik</th><th>Modül</th></tr></thead><tbody>`;
    for (const p of L) {
      const malz = malzeme(p.malzeme);
      if (p.malzeme !== onceki) {
        onceki = p.malzeme;
        const toplam = L.filter((x) => x.malzeme === p.malzeme).reduce((a, x) => a + x.adet, 0);
        html += Hesap.camMi(malz)
          ? `<tr class="grup cam-grup"><td colspan="${kolon}">Cam listesi: ${esc(malz.ad)} · ${toplam} adet · ${sayiYaz(L.filter((x) => x.malzeme === p.malzeme).reduce((a, x) => a + (x.boy * x.en * x.adet) / 1e6, 0), 2)} m² · camcıya verilecek net ölçüler (kenar rodajlı)</td></tr>`
          : `<tr class="grup"><td colspan="${kolon}">${esc(malz.ad)} · ${sayiYaz(malz.kalinlik)} mm · plaka ${malz.plakaUzun}×${malz.plakaKisa} · ${toplam} parça${malz.bant > 0 ? ` · bant ${sayiYaz(malz.bant)} mm` : ' · bantsız'}</td></tr>`;
      }
      html += `<tr>${yazdir ? '<td class="kutu-sutun"><span class="isaret"></span></td>' : ''}<td>${p.no}</td><td>${esc(p.ad)}${p.not ? `<div class="parca-not">${esc(p.not)}</div>` : ''}</td><td class="sag kalin">${p.adet}</td>
        ${yazdir ? '' : `<td class="sag net">${sayiYaz(p.boy)}</td><td class="sag net">${sayiYaz(p.en)}</td>`}
        <td class="sag kalin">${sayiYaz(p.kesimBoy)}</td><td class="sag kalin">${sayiYaz(p.kesimEn)}</td>
        <td class="bant-hucre">${Cizim.bantSimgesi(p.bant, 30)}<span>${bantYazi(p.bant)}</span></td><td>${p.damar ? 'Var' : '—'}</td><td class="sag">${esc(kesimDelikSayisi(p))}</td><td class="kucuk">${esc(p.moduller.join(', '))}</td></tr>`;
    }
    return html + '</tbody></table>';
  }

  function kesimTablosuCiz() {
    $('#kesimTablo').innerHTML = kesimTablosuHtml(false);
  }

  function plakaHtml(yazdir) {
    const y = plakaGruplari;
    if (!y.length) return '<p class="bos">Parça yok.</p>';
    let html = `<p class="not">Giyotin kesim planı · testere payı ${proje.ayarlar.testereKalinligi} mm · plaka kenar payı ${proje.ayarlar.plakaKenarPayi} mm. Damarlı malzemede parçalar döndürülmez. Cam ve ayna plakaya yerleştirilmez; kesim listesindeki cam listesine bakın. Yeşil kesikli alanlar stoka alınabilecek artıklardır (en az ${proje.ayarlar.artikMin} mm).</p>`;
    const toplamKullanilan = y.reduce((a, g) => a + g.kullanilanArtiklar.reduce((b, k) => b + k.adet, 0), 0);
    const toplamCikan = y.reduce((a, g) => a + g.cikanArtiklar.length, 0);
    if (!yazdir && (toplamKullanilan || toplamCikan)) {
      html += `<div class="artik-ozet"><span>Bu iş: <b>${toplamKullanilan}</b> artık kullanıyor, <b>${toplamCikan}</b> yeni artık çıkacak.</span> ${y.some((g) => g.sigmayan.length) ? '<span class="hata-yazi">Plakaya sığmayan parça var; stok güncellenemez.</span>' : '<button id="btnIsiTamamla" class="ikincil">Kesim tamamlandı: stoğu güncelle</button>'}</div>`;
    }
    for (const g of y) {
      const ort = g.plakalar.length ? g.plakalar.reduce((a, p) => a + p.doluluk, 0) / g.plakalar.length : 0;
      const artikAdet = g.plakalar.length - g.tamPlaka;
      html += `<section class="plaka-grup"><h3>${esc(g.malzemeAd)} — ${g.tamPlaka} tam plaka (${g.plaka.uzun}×${g.plaka.kisa})${artikAdet ? ` + ${artikAdet} artık` : ''} · ortalama doluluk %${sayiYaz(ort * 100, 0)}</h3>`;
      if (g.sigmayan.length) html += `<p class="hata">Plakaya sığmayan parçalar: ${g.sigmayan.map((p) => `#${p.no} ${esc(p.ad)} (${p.w}×${p.h})`).join(', ')}</p>`;
      if (g.cikanArtiklar.length) html += `<p class="not">Çıkacak artıklar: ${g.cikanArtiklar.map((a) => `${a.uzun}×${a.kisa}`).join(', ')}</p>`;
      let tamNo = 0;
      let artikNo = 0;
      g.plakalar.forEach((p) => {
        const baslik = p.artik ? `Artık ${++artikNo} (${p.uzun}×${p.kisa}, stoktan)` : `Plaka ${++tamNo}/${g.tamPlaka}`;
        html += `<figure class="plaka-kart${p.artik ? ' artik' : ''}"><figcaption>${esc(g.malzemeAd)} · ${baslik} · ${p.yerlesen.length} parça · doluluk %${sayiYaz(p.doluluk * 100, 0)}</figcaption>${Cizim.plakaCizimi(p, g.plaka, RENKLER)}</figure>`;
      });
      html += '</section>';
    }
    return html;
  }

  function artikCiz() {
    const malz = proje.ayarlar.malzemeler.filter((m) => !Hesap.camMi(m));
    $('#artikKullan').checked = !!proje.artikKullan;
    $('#artikMalz').innerHTML = malz.map((m) => `<option value="${esc(m.id)}">${esc(m.ad)}</option>`).join('');
    const toplam = artikStok.reduce((a, x) => a + x.adet, 0);
    $('#artikOzet').textContent = toplam ? `(${toplam} parça)` : '(boş)';
    $('#artikTablo').innerHTML = artikStok.length
      ? `<table class="liste"><thead><tr><th>Malzeme</th><th>Kalınlık</th><th>Boy × en</th><th>Adet</th><th>Not</th><th>Eklendi</th><th></th></tr></thead><tbody>${artikStok.map((a) => `<tr data-artik="${esc(a.id)}"><td>${esc(a.malzemeAd)}</td><td class="sag">${sayiYaz(a.kalinlik)}</td><td class="sag">${a.boy} × ${a.en}</td><td class="sag">${a.adet}</td><td class="kucuk">${esc(a.not)}</td><td class="kucuk">${esc(a.tarih)}</td><td><button data-islem="artikSil" class="ikincil kucuk-buton" title="Sil">✕</button></td></tr>`).join('')}</tbody></table>`
      : '<p class="bos">Stokta artık yok.</p>';
  }
  $('#artikKullan').addEventListener('change', (e) => { proje.artikKullan = e.target.checked; tumunuCiz(false); plakaCiz(); });
  $('#btnArtikEkle').addEventListener('click', () => {
    const m = malzeme($('#artikMalz').value);
    const boy = Number($('#artikBoy').value);
    const en = Number($('#artikEn').value);
    const adet = Math.max(1, Math.floor(Number($('#artikAdet').value) || 1));
    if (!m || !(boy >= 50) || !(en >= 50)) { alert('Malzeme, boy ve en (en az 50 mm) girin.'); return; }
    artikStok.push({ id: 'ar' + Date.now().toString(36), malzemeAd: m.ad, kalinlik: m.kalinlik, boy: Math.max(boy, en), en: Math.min(boy, en), adet, not: $('#artikNot').value.slice(0, 80), tarih: new Date().toLocaleDateString('tr-TR') });
    artikKaydet();
    $('#artikBoy').value = ''; $('#artikEn').value = ''; $('#artikNot').value = '';
    tumunuCiz(false); artikCiz(); plakaCiz();
  });
  $('#artikTablo').addEventListener('click', (e) => {
    if (e.target.dataset.islem !== 'artikSil') return;
    const id = e.target.closest('tr').dataset.artik;
    artikStok = artikStok.filter((a) => a.id !== id);
    artikKaydet(); tumunuCiz(false); artikCiz(); plakaCiz();
  });
  $('#plakaAlan').addEventListener('click', (e) => {
    if (e.target.id !== 'btnIsiTamamla') return;
    const kullanilan = plakaGruplari.reduce((a, g) => a + g.kullanilanArtiklar.reduce((b, k) => b + k.adet, 0), 0);
    const cikan = plakaGruplari.reduce((a, g) => a + g.cikanArtiklar.length, 0);
    if (!confirm(`Kesim tamamlandı mı? ${kullanilan} artık stoktan düşülecek, ${cikan} yeni artık stoka eklenecek.`)) return;
    const tarih = new Date().toLocaleDateString('tr-TR');
    for (const g of plakaGruplari) {
      for (const k of g.kullanilanArtiklar) {
        const a = artikStok.find((x) => x.id === k.id);
        if (a) a.adet -= k.adet;
      }
      g.cikanArtiklar.forEach((c, i) => artikStok.push({ id: `ar${Date.now().toString(36)}${g.malzemeId.slice(0, 6)}${i}`, malzemeAd: g.malzemeAd, kalinlik: g.kalinlik, boy: c.uzun, en: c.kisa, adet: 1, not: proje.ad || '', tarih }));
    }
    artikStok = artikStok.filter((a) => a.adet > 0);
    artikKaydet(); tumunuCiz(false); artikCiz(); plakaCiz();
  });

  function plakaCiz() {
    $('#plakaAlan').innerHTML = plakaHtml();
  }

  function hirdavatHtml() {
    const H = sonuc.hirdavat;
    return H.length
      ? `<table class="liste"><thead><tr><th>Hırdavat</th><th>Miktar</th></tr></thead><tbody>${H.map((h) => `<tr><td>${esc(h.ad)}</td><td class="sag">${sayiYaz(h.adet, 1)} ${h.birim}</td></tr>`).join('')}</tbody></table>`
      : '<p class="bos">—</p>';
  }

  function ozetHtml(plakaSayilari) {
    const O = sonuc.ozet;
    if (!O.length) return '';
    return `<table class="liste"><thead><tr><th>Malzeme</th><th>Parça</th><th>Net alan</th>${plakaSayilari ? '<th>Plaka</th>' : ''}<th>Kenar bandı</th></tr></thead><tbody>${O.map((o) => `<tr><td>${esc(o.malzeme)}</td><td class="sag">${o.parcaAdedi}</td><td class="sag">${sayiYaz(o.alanM2, 2)} m²</td>${plakaSayilari ? `<td class="sag">${plakaSayilari[o.malzemeId] || 0}</td>` : ''}<td class="sag">${o.bantM ? `${sayiYaz(o.bantM, 1)} m <span class="kucuk">(+%10 fire: ${sayiYaz(o.bantM * 1.1, 1)} m, ${o.bantKalinlik} mm)</span>` : '—'}</td></tr>`).join('')}</tbody></table>`;
  }

  function montajHirdavatHtml() {
    const L = sonuc.montajHirdavat || [];
    return L.length
      ? `<table class="liste"><thead><tr><th>Kalem</th><th>Miktar</th></tr></thead><tbody>${L.map((h) => `<tr><td>${esc(h.ad)}</td><td class="sag">${sayiYaz(h.adet, 1)} ${h.birim}</td></tr>`).join('')}</tbody></table><p class="not">${sonuc.birlesimSayisi} dolap birleşimi (yan yana dolaplar). Yerleşim sekmesinden kapatılabilir.</p>`
      : '<p class="bos">Yerinde montaj hırdavatı yok.</p>';
  }

  function hirdavatCiz() {
    $('#hirdavatTablo').innerHTML = hirdavatHtml();
    $('#montajHirdavatTablo').innerHTML = montajHirdavatHtml();
    $('#ozetTablo').innerHTML = ozetHtml();
  }

  // ---------------- Ayarlar ----------------
  const AYAR_ALANLARI = [
    ['testereKalinligi', 'Testere payı (mm)'],
    ['plakaKenarPayi', 'Plaka kenar payı (mm)'],
    ['kapakBoslugu', 'Kapaklar arası boşluk (mm)'],
    ['disBosluk', 'Kapak dış kenar boşluğu (mm)'],
    ['cekmeceUstBosluk', 'Çekmece önü − kutu yük. farkı (mm)'],
    ['icCekmeceYukseklik', 'İç çekmece önü yüksekliği (mm)'],
    ['kulpAralik', 'Kulp delik aralığı (mm, 0 = düğme)'],
    ['kulpKenar', 'Kulp ekseni açılan kenardan (mm)'],
    ['kulpUcMesafe', 'Kulp ucu kapak kenarından (mm)'],
    ['artikMin', 'Stoka alınacak en küçük artık (mm)'],
    ['arkalikKanalDerinligi', 'Arkalık kanal derinliği (mm)'],
    ['arkalikGeriPay', 'Kanalın arkaya mesafesi (mm)'],
    ['arkalikCakmaPay', 'Çakma arkalık kenar payı (mm)'],
    ['rafOnGeriCekme', 'Raf önden geri çekme (mm)'],
    ['gommeKayitEn', 'Gömme kapakta ön kayıt derinliği (mm)'],
    ['cekmeceRayBosluk', 'Çekmece kutusu yan boşluğu, ray başına (mm, 0 = ray kataloğu)'],
    ['rafYanBosluk', 'Raf yan boşluğu (mm)'],
    ['kusakGenisligi', 'Kuşak eni (mm)'],
  ];

  function ayarFormCiz() {
    const A = proje.ayarlar;
    const malzSecenek = A.malzemeler.map((x) => [x.id, x.ad]);
    const kullanilanlar = new Set([...Object.values(A.kullanim), ...proje.moduller.flatMap((m) => Object.values(m.malzeme || {})),
      ...((proje.teklif && proje.teklif.secenekler) || []).flatMap((sc) => Object.values(sc.kullanim || {}))]);
    $('#ayarForm').innerHTML = `
      <h3>Proje varsayılanları</h3>
      <div class="form-izgara">
        ${Hesap.KULLANIMLAR.map((k) => `<label>${KULLANIM_AD[k]}${secim(k, A.kullanim[k], malzSecenek, 'data-kullanim')}</label>`).join('')}
      </div>
      <div class="form-izgara">
        ${Object.entries(HS).map(([k, h]) => `<label>${h.baslik}${secim(k, A.hirdavat[k], Object.entries(h.secenekler).map(([v, o]) => [v, o.ad]), 'data-hirdavat')}</label>`).join('')}
      </div>
      <p class="not">Her modül, modül formundaki "Bu modüle özel malzeme & hırdavat" bölümünden farklı malzeme ve hırdavat kullanabilir. Ray tipi çekmece kutusu ölçülerini değiştirir: bilyeli ray her yandan 13 mm, gizli ray 5 mm boşluk ister; metal yanlı sistemde yalnızca taban ve arkalık kesilir.</p>

      <h3>Malzeme kütüphanesi</h3>
      <div class="tablo-kap">
      <table class="liste ayar-tablo">
        <thead><tr><th title="3B ve önizlemedeki rengi">Renk</th><th>Malzeme adı</th><th>Tür</th><th>Kalınlık</th><th>Plaka uzun</th><th>Plaka kısa</th><th title="0 = bantsız (örn. boyalı lake kenar)">Bant</th><th>Damar</th><th></th></tr></thead>
        <tbody>${A.malzemeler.map((m) => `<tr data-malz="${esc(m.id)}">
            <td><input data-alan="renk" type="color" value="${esc(m.renk || '#f2efe8')}" aria-label="${esc(m.ad)} rengi" class="renk-sec"></td>
            <td><input data-alan="ad" value="${esc(m.ad)}"></td>
            <td>${secim('tur', m.tur || 'Diğer', Hesap.MALZEME_TURLERI.map((t) => [t, t]))}</td>
            <td><input data-alan="kalinlik" type="number" step="0.5" min="1" value="${m.kalinlik}"></td>
            <td><input data-alan="plakaUzun" type="number" min="100" value="${esc(m.plakaUzun)}" ${Hesap.camMi(m) ? 'disabled title="Cam plakaya yerleştirilmez"' : ''}></td>
            <td><input data-alan="plakaKisa" type="number" min="10" value="${esc(m.plakaKisa)}" ${Hesap.camMi(m) ? 'disabled' : ''}></td>
            <td><input data-alan="bant" type="number" step="0.1" min="0" value="${esc(m.bant)}" ${Hesap.camMi(m) ? 'disabled' : ''}></td>
            <td><input data-alan="damar" type="checkbox" ${m.damar ? 'checked' : ''} ${Hesap.camMi(m) ? 'disabled' : ''}></td>
            <td><button data-islem="malzSil" class="ikincil kucuk-buton" ${kullanilanlar.has(m.id) ? 'disabled title="Kullanımda"' : 'title="Sil"'}>✕</button></td></tr>`).join('')}</tbody>
      </table>
      </div>
      <button data-islem="malzEkle" class="ikincil">+ Malzeme ekle</button>
      <p class="not">Türü "Cam" veya "Ayna" olan malzemeler plakaya yerleştirilmez; camcıya verilecek ayrı listede net ölçüyle çıkar ve m² fiyatıyla hesaplanır. Bant kalınlığı 0 olan malzeme bantsız kabul edilir (örn. kenarı boyanan lake). Damar işaretli malzemede parçanın "boy" ölçüsü plakanın uzun kenarına paralel yerleştirilir.</p>

      <h3>Üretim payları</h3>
      <div class="form-izgara">
        ${AYAR_ALANLARI.map(([k, t]) => `<label>${t}<input data-ayar="${k}" type="number" step="0.5" min="0" value="${A[k]}"></label>`).join('')}
        <label>Kulp yönü (kapak)<select data-ayar="kulpYon">${Object.entries(Hesap.KULP_YONLERI).map(([k, v]) => `<option value="${k}"${A.kulpYon === k ? ' selected' : ''}>${v}</option>`).join('')}</select></label>
        <label>Kulp konumu (kapak)<select data-ayar="kulpKonum">${Object.entries(Hesap.KULP_KONUMLARI).map(([k, v]) => `<option value="${k}"${A.kulpKonum === k ? ' selected' : ''}>${v}</option>`).join('')}</select></label>
        <label>Kulp konumu (çekmece)<select data-ayar="kulpCekmece"><option value="ust"${A.kulpCekmece === 'ust' ? ' selected' : ''}>Üstte</option><option value="orta"${A.kulpCekmece === 'orta' ? ' selected' : ''}>Ortada</option></select></label>
        <label>Asma dolap askısı<select data-ayar="duvarAski"><option value="aparat"${A.duvarAski === 'aparat' ? ' selected' : ''}>Gizli askı aparatı</option><option value="ray"${A.duvarAski === 'ray' ? ' selected' : ''}>Askı rayı + aparat</option></select></label>
        <label>Çekmece tabanı<select data-ayar="cekmeceTabani"><option value="cakma"${A.cekmeceTabani === 'cakma' ? ' selected' : ''}>Alttan çakma</option><option value="kanal"${A.cekmeceTabani === 'kanal' ? ' selected' : ''}>Kanala geçme</option></select></label>
        <label title="Gömme (iç bini) kapaklı dolapta satırlar arasındaki tabla: tam derinlik ya da yalnız önde kayıt (10–12 cm yeterli)">Gömme kapakta ara tabla<select data-ayar="gommeAraTabla"><option value="tam"${A.gommeAraTabla === 'tam' ? ' selected' : ''}>Tam derinlik</option><option value="kayit"${A.gommeAraTabla === 'kayit' ? ' selected' : ''}>Önde kayıt</option></select></label>
        <label class="onay"><input data-ayar="bantDus" type="checkbox" ${A.bantDus ? 'checked' : ''}> Bant kalınlığını kesim ölçüsünden düş</label>
        <label class="onay" title="Kapalıysa arkalıklar çizimde görünür ama kesim listesine, plakaya ve maliyete girmez (ayrı alınıyorsa)"><input data-ayar="arkalikListede" type="checkbox" ${A.arkalikListede ? 'checked' : ''}> Arkalıkları kesim listesine ve maliyete kat</label>
      </div>
      <button id="btnAyarSifirla" class="ikincil">Varsayılanlara dön</button>`;
  }

  $('#ayarForm').addEventListener('change', (e) => {
    const el = e.target;
    const A = proje.ayarlar;
    const tr = el.closest('tr[data-malz]');
    const deger = el.type === 'checkbox' ? el.checked : el.type === 'number' ? Number(el.value) : el.value;
    if (tr) A.malzemeler.find((m) => m.id === tr.dataset.malz)[el.dataset.alan] = deger;
    else if (el.hasAttribute('data-kullanim')) A.kullanim[el.dataset.alan] = deger;
    else if (el.hasAttribute('data-hirdavat')) A.hirdavat[el.dataset.alan] = deger;
    else if (el.dataset.ayar) A[el.dataset.ayar] = deger;
    else return;
    tumunuCiz(true);
    if (tr || el.hasAttribute('data-kullanim')) ayarFormCiz();
  });
  $('#ayarForm').addEventListener('click', (e) => {
    const A = proje.ayarlar;
    const islem = e.target.dataset.islem;
    if (islem === 'malzEkle') {
      A.malzemeler.push(Hesap.yeniMalzeme());
    } else if (islem === 'malzSil') {
      const id = e.target.closest('tr').dataset.malz;
      A.malzemeler = A.malzemeler.filter((m) => m.id !== id);
    } else if (e.target.id === 'btnAyarSifirla') {
      if (!confirm('Tüm malzeme, hırdavat ve pay ayarları varsayılana dönsün mü? Modüllere özel malzeme seçimleri de temizlenir.')) return;
      proje.ayarlar = Hesap.varsayilanAyarlar();
      for (const m of proje.moduller) m.malzeme = {};
    } else return;
    tumunuCiz(true);
    ayarFormCiz();
  });

  // ---------------- Fiyat & maliyet ----------------
  /** Küçük "?" bilgi kutusu: tıklayınca/üstüne gelince açıklama açılır. */
  const bilgi = (metin) => `<details class="bilgi" onclick="event.stopPropagation()"><summary aria-label="Bilgi">?</summary><div>${esc(metin)}</div></details>`;
  // [anahtar, etiket, açıklama, yalnız bu işçilik esasında]
  const FIYAT_ALANLARI = [
    ['ebatlamaPlaka', 'Ebatlama (TL/plaka)', 'Plakanın ölçüye kesilmesi (ebatlama) için kesimhaneye ödenen plaka başı ücret. Kullanılan plaka sayısıyla çarpılır.'],
    ['bantCekmeM', 'Bant çekme (TL/m)', 'Kenar bandının makinede çekilmesi için metre başı işçilik. Bant malzemesinin fiyatı ayrıca malzeme tablosunda girilir.'],
    ['atolyeIscilikM2', 'Atölye işçiliği (TL/m²)', 'Dolabın ön yüz alanının (genişlik × yükseklik) metrekaresi başına atölye işçiliği: delik, birleştirme, kapak takma. Örn. 1 m × 2,4 m gardırop = 2,4 m².', 'm2'],
    ['montajM2', 'Montaj (TL/m²)', 'Yerinde kurulumun ön yüz alanı metrekaresi başı ücreti.', 'm2'],
    ['panelIscilikM2', 'Panel işçiliği (TL/m²)', 'Yan kapama, duvar paneli, lambri, raf gibi tek parça panellerin m² başı işçilik + montajı.', 'm2'],
    ['atolyeIscilikModul', 'Atölye işçiliği (TL/modül)', 'Her gövdeli dolap için sabit atölye işçiliği (ölçüden bağımsız).', 'modul'],
    ['montajModul', 'Montaj (TL/modül)', 'Her gövdeli dolap için sabit kurulum ücreti.', 'modul'],
    ['panelIscilik', 'Panel işçiliği (TL/panel)', 'Her tek parça panel için sabit işçilik + montaj.', 'modul'],
    ['sekilliKesimM', 'Şekilli kesim (TL/m)', 'Eğri, eğik ya da kavisli kenarların CNC/şablonla kesimi için kenar metresi başı ücret.'],
    ['nakliye', 'Nakliye (TL/proje)', 'Projenin tek seferlik taşıma ücreti; teklife kâr eklenerek yansır.'],
    ['bantFire', 'Bant firesi (%)', 'Bant uçlarında kesilip atılan pay. Bant metrajı bu oranda artırılır.'],
    ['alanFire', 'Alan firesi (%)', 'Plaka maliyeti "net alan + fire" seçiliyse net parça alanına eklenen kayıp payı.'],
    ['karOrani', 'Kâr oranı (%)', 'Toplam maliyete (malzeme, hırdavat, işçilik, nakliye) eklenen kâr. Teklifteki satış fiyatları bununla hesaplanır.'],
    ['kdvOrani', 'KDV (%)', 'Satış fiyatına eklenen katma değer vergisi oranı.'],
  ];

  function fiyatFormCiz() {
    const A = proje.ayarlar;
    const F = A.fiyat;
    const kullanilan = new Set(sonuc.hirdavat.map((h) => h.kod));
    const kodlar = Object.keys(Hesap.HIRDAVAT_KALEMLERI).sort((a, b) => (kullanilan.has(b) ? 1 : 0) - (kullanilan.has(a) ? 1 : 0));
    $('#fiyatForm').innerHTML = `
      <div class="form-izgara">
        <label><span>Plaka maliyeti ${bilgi('Kullanılan tam plaka: yerleşimde açılan plakaların tamamı ücretlendirilir (artık sizde kalır). Net alan + fire: yalnız parça alanı ve fire yüzdesi ücretlendirilir.')}</span>${secim('plakaHesabi', F.plakaHesabi, [['tam', 'Kullanılan tam plaka'], ['alan', 'Net alan + fire']], 'data-fiyat')}</label>
        <label><span>İşçilik esası ${bilgi('Metrekare: işçilik dolabın ön yüz alanı (kapladığı duvar alanı) üzerinden hesaplanır; büyük dolap daha çok tutar. Modül: her dolaba aynı sabit ücret.')}</span>${secim('iscilikEsasi', F.iscilikEsasi, [['m2', 'Metrekare (ön yüz alanı)'], ['modul', 'Modül başına']], 'data-fiyat')}</label>
        ${FIYAT_ALANLARI.filter((x) => !x[3] || x[3] === F.iscilikEsasi).map(([k, t, b]) => `<label><span>${t} ${bilgi(b)}</span><input data-fiyat="${k}" type="number" min="0" step="any" value="${esc(F[k])}"></label>`).join('')}
      </div>
      <h4>Plaka malzemeleri</h4>
      <div class="tablo-kap"><table class="liste ayar-tablo fiyat-tablo">
        <thead><tr><th>Malzeme</th><th>Plaka (TL)</th><th title="Metre başı kenar bandı">Bant (TL/m)</th><th title="Lake boya vb. m² başı işlem; cam ve aynada m² fiyatı">İşlem / cam (TL/m²)</th></tr></thead>
        <tbody>${A.malzemeler.map((m) => `<tr data-malz="${esc(m.id)}"><td>${esc(m.ad)}</td>
          <td><input data-alan="plakaFiyati" type="number" min="0" step="any" value="${esc(m.plakaFiyati)}" ${Hesap.camMi(m) ? 'disabled title="Cam m² ile fiyatlanır"' : ''}></td>
          <td><input data-alan="bantFiyati" type="number" min="0" step="any" value="${esc(m.bantFiyati)}" ${m.bant > 0 && !Hesap.camMi(m) ? '' : 'disabled title="Bantsız malzeme"'}></td>
          <td><input data-alan="islemFiyatiM2" type="number" min="0" step="any" value="${esc(m.islemFiyatiM2)}"></td></tr>`).join('')}</tbody>
      </table></div>
      <h4>Hırdavat birim fiyatları</h4>
      <div class="tablo-kap"><table class="liste ayar-tablo fiyat-tablo">
        <thead><tr><th>Kalem</th><th>Birim</th><th>Fiyat (TL)</th></tr></thead>
        <tbody>${kodlar.map((k) => {
          const h = Hesap.HIRDAVAT_KALEMLERI[k];
          return `<tr class="${kullanilan.has(k) ? '' : 'soluk'}"><td>${esc(h.ad)}${kullanilan.has(k) ? '' : ' <span class="kucuk">(projede yok)</span>'}</td><td>${esc(h.birim)}</td>
            <td><input data-hfiyat="${esc(k)}" type="number" min="0" step="any" value="${esc(Maliyet.hirdavatFiyati(A, k))}"></td></tr>`;
        }).join('')}</tbody>
      </table></div>
      <h4>Ek kalemler <small>(tezgah, cam, LED, aksesuar…)</small></h4>
      <div id="ekKalemler">${F.ekKalemler.map((e, i) => `<div class="ek-satir" data-ek="${i}"><input data-ekalan="ad" value="${esc(e.ad)}" aria-label="Kalem adı"><input data-ekalan="tutar" type="number" min="0" step="any" value="${esc(e.tutar)}" aria-label="Tutar"><button data-islem="ekSil" class="ikincil kucuk-buton" title="Sil">✕</button></div>`).join('')}</div>
      <button data-islem="ekEkle" class="ikincil">+ Ek kalem</button>
      <p class="not">Ek kalem tutarı maliyet olarak girilir; teklife kâr oranı eklenerek yansır.</p>`;
  }

  $('#fiyatForm').addEventListener('change', (e) => {
    const el = e.target;
    const A = proje.ayarlar;
    const sayiDeger = () => Math.max(0, Number(el.value) || 0);
    const tr = el.closest('tr[data-malz]');
    const ek = el.closest('[data-ek]');
    if (tr) A.malzemeler.find((m) => m.id === tr.dataset.malz)[el.dataset.alan] = sayiDeger();
    else if (el.dataset.hfiyat) A.fiyat.hirdavat[el.dataset.hfiyat] = sayiDeger();
    else if (ek) A.fiyat.ekKalemler[Number(ek.dataset.ek)][el.dataset.ekalan] = el.dataset.ekalan === 'tutar' ? sayiDeger() : el.value;
    else if (el.dataset.alan === 'plakaHesabi') A.fiyat.plakaHesabi = el.value;
    else if (el.dataset.alan === 'iscilikEsasi') { A.fiyat.iscilikEsasi = el.value; fiyatFormCiz(); }
    else if (el.dataset.fiyat) A.fiyat[el.dataset.fiyat] = sayiDeger();
    else return;
    tumunuCiz(false);
  });
  $('#fiyatForm').addEventListener('click', (e) => {
    const F = proje.ayarlar.fiyat;
    const islem = e.target.dataset.islem;
    if (islem === 'ekEkle') F.ekKalemler.push({ ad: 'Tezgah', tutar: 0 });
    else if (islem === 'ekSil') F.ekKalemler.splice(Number(e.target.closest('[data-ek]').dataset.ek), 1);
    else return;
    tumunuCiz(false);
    fiyatFormCiz();
  });

  function teklifFormCiz() {
    const T = proje.teklif;
    const Fi = proje.ayarlar.firma;
    $('#teklifForm').innerHTML = `
      <label>Müşteri<input data-teklif="musteri" value="${esc(T.musteri)}"></label>
      <label>Müşteri telefonu<input data-teklif="telefon" value="${esc(T.telefon)}"></label>
      <label>Teklif no<input data-teklif="teklifNo" value="${esc(T.teklifNo)}"></label>
      <label>Geçerlilik (gün)<input data-teklif="gecerlilikGun" type="number" min="0" value="${esc(T.gecerlilikGun)}"></label>
      <label>Teslim süresi<input data-teklif="teslimSuresi" placeholder="örn. 30 iş günü" value="${esc(T.teslimSuresi)}"></label>
      <label class="genis">Müşteri adresi<input data-teklif="adres" value="${esc(T.adres)}"></label>
      <label class="genis">Teklif notu<textarea data-teklif="not" rows="2" placeholder="Ödeme koşulları, dahil olmayanlar vb.">${esc(T.not)}</textarea></label>
      <label>Firma adı<input data-firma="ad" value="${esc(Fi.ad)}"></label>
      <label>Firma telefonu<input data-firma="telefon" value="${esc(Fi.telefon)}"></label>
      <label class="genis">Firma adresi<input data-firma="adres" value="${esc(Fi.adres)}"></label>`;
  }
  $('#teklifForm').addEventListener('change', (e) => {
    const el = e.target;
    if (el.dataset.teklif) proje.teklif[el.dataset.teklif] = el.type === 'number' ? Math.max(0, Math.floor(Number(el.value) || 0)) : el.value;
    else if (el.dataset.firma) proje.ayarlar.firma[el.dataset.firma] = el.value;
    else return;
    kaydet();
  });

  function maliyetCiz() {
    const r = maliyet;
    const kart = (baslik, deger, alt, vurgu) => `<div class="m-kart${vurgu ? ' vurgu' : ''}"><span>${baslik}</span><b>${para(deger)}</b>${alt ? `<small>${alt}</small>` : ''}</div>`;
    $('#maliyetOzet').innerHTML = `
      ${r.eksikFiyat.length ? `<p class="hata">Fiyatı girilmemiş kalemler: ${esc(r.eksikFiyat.join(', '))}</p>` : ''}
      <div class="m-kartlar">
        ${kart('Toplam maliyet', r.maliyet, `${r.modulAdedi} dolap${r.panelAdedi ? ` + ${r.panelAdedi} panel` : ''} · ${sayiYaz(r.alanM2.toplam, 2)} m²`)}
        ${kart('Kâr', r.kar, `%${sayiYaz(r.karOrani)}`)}
        ${kart('Satış (KDV hariç)', r.satisKdvHaric)}
        ${kart('KDV', r.kdv, `%${sayiYaz(r.kdvOrani)}`)}
        ${kart('Genel toplam', r.genelToplam, 'KDV dahil', true)}
      </div>
      <p class="m-alan">Kapatılan alan: <b>${sayiYaz(r.alanM2.toplam, 2)} m²</b> (dolap ön yüzleri ${sayiYaz(r.alanM2.dolap, 2)} m²${r.alanM2.panel ? `, paneller ${sayiYaz(r.alanM2.panel, 2)} m²` : ''})${r.alanM2.toplam > 0 ? ` · m² satış fiyatı ≈ ${para(r.satisKdvHaric / r.alanM2.toplam)} (KDV hariç)` : ''} ${bilgi('Dolapların genişlik × yükseklik ön yüz alanı ile duvar paneli, lambri vb. panellerin alanı toplamıdır. Müşteriye "kaç m² dolap" sorusunun cevabı.')}</p>
      <div class="m-dagilim">${[['Plaka & bant', r.ara.malzeme], ['Hırdavat', r.ara.hirdavat], ['Ebatlama & bant çekme', r.ara.hizmet], ['İşçilik', r.ara.iscilik], ['Nakliye & ek', r.ara.diger]]
        .map(([t, v]) => `<div><span>${t}</span><b>${para(v)}</b><i style="width:${r.maliyet > 0 ? (100 * v) / r.maliyet : 0}%"></i></div>`).join('')}</div>`;

    $('#modulMaliyetTablo').innerHTML = r.modulMaliyetleri.length ? `<table class="liste"><thead><tr><th>Modül</th><th>Adet</th><th title="Ön yüz alanı (tek adet)">m²</th><th>Malzeme</th><th>Hırdavat</th><th>İşçilik</th><th>Birim maliyet</th><th>Birim satış</th><th>Toplam satış</th></tr></thead><tbody>
      ${r.modulMaliyetleri.map((x, i) => `<tr><td>${esc(x.ad)}</td><td class="sag">${x.adet}</td><td class="sag">${sayiYaz(x.alanM2, 2)}</td><td class="sag">${para(x.malzeme)}</td><td class="sag">${para(x.hirdavat)}</td><td class="sag">${para(x.iscilik)}</td><td class="sag">${para(x.birim)}</td><td class="sag">${para(r.teklifSatirlari[i].birimFiyat)}</td><td class="sag kalin">${para(r.teklifSatirlari[i].tutar)}</td></tr>`).join('')}
      </tbody></table>` : '<p class="bos">Modül yok.</p>';

    const K = r.kalemler;
    let h = '<table class="liste"><thead><tr><th>Kalem</th><th>Miktar</th><th>Birim fiyat</th><th>Tutar</th></tr></thead><tbody>';
    const grup = (t, top) => `<tr class="grup"><td colspan="3">${t}</td><td class="sag">${para(top)}</td></tr>`;
    h += grup('Plaka malzeme, işlem ve bant', r.ara.malzeme);
    for (const m of K.malzeme) {
      if (m.cam) { h += `<tr><td>${esc(m.ad)}</td><td class="sag">${sayiYaz(m.alanM2, 2)} m²</td><td class="sag">${para(m.islemFiyatiM2)}</td><td class="sag">${para(m.islemTutar)}</td></tr>`; continue; }
      h += `<tr><td>${esc(m.ad)} – plaka</td><td class="sag">${sayiYaz(m.plaka, 2)} plaka</td><td class="sag">${para(m.plakaFiyati)}</td><td class="sag">${para(m.plakaTutar)}</td></tr>`;
      if (m.islemTutar > 0) h += `<tr><td>${esc(m.ad)} – işlem</td><td class="sag">${sayiYaz(m.alanM2, 2)} m²</td><td class="sag">${para(m.islemFiyatiM2)}</td><td class="sag">${para(m.islemTutar)}</td></tr>`;
      if (m.bantM > 0) h += `<tr><td>${esc(m.ad)} – kenar bandı</td><td class="sag">${sayiYaz(m.bantM, 1)} m</td><td class="sag">${para(m.bantFiyati)}</td><td class="sag">${para(m.bantTutar)}</td></tr>`;
    }
    h += grup('Hırdavat', r.ara.hirdavat);
    for (const x of K.hirdavat) h += `<tr><td>${esc(x.ad)}</td><td class="sag">${sayiYaz(x.fiyatMiktari, 2)} ${esc(x.fiyatBirimi)}</td><td class="sag">${para(x.birimFiyat)}</td><td class="sag">${para(x.tutar)}</td></tr>`;
    h += grup('Ebatlama ve bant çekme', r.ara.hizmet);
    for (const x of K.hizmet) h += `<tr><td>${esc(x.ad)}</td><td class="sag">${sayiYaz(x.miktar, 1)} ${x.birim}</td><td class="sag">${para(x.birimFiyat)}</td><td class="sag">${para(x.tutar)}</td></tr>`;
    h += grup('İşçilik', r.ara.iscilik);
    for (const x of K.iscilik) h += `<tr><td>${esc(x.ad)}</td><td class="sag">${sayiYaz(x.miktar, 2)} ${x.birim}</td><td class="sag">${para(x.birimFiyat)}</td><td class="sag">${para(x.tutar)}</td></tr>`;
    if (K.diger.length) {
      h += grup('Nakliye ve ek kalemler', r.ara.diger);
      for (const x of K.diger) h += `<tr><td>${esc(x.ad)}</td><td></td><td></td><td class="sag">${para(x.tutar)}</td></tr>`;
    }
    h += `<tr class="toplam"><td colspan="3">Toplam maliyet</td><td class="sag">${para(r.maliyet)}</td></tr></tbody></table>`;
    $('#maliyetKalemleri').innerHTML = h;
  }

  function teklifYazdirHtml() {
    const r = maliyet;
    const T = proje.teklif;
    const Fi = proje.ayarlar.firma;
    const tarih = new Date();
    const gecerli = new Date(tarih.getTime() + T.gecerlilikGun * 86400000);
    const gun = (d) => d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' });
    return `<section class="y-sayfa teklif">
      <header class="t-ust">
        <div><h1>${esc(Fi.ad || 'Fiyat Teklifi')}</h1>${Fi.telefon ? `<p>${esc(Fi.telefon)}</p>` : ''}${Fi.adres ? `<p>${esc(Fi.adres)}</p>` : ''}</div>
        <div class="t-bilgi"><h2>FİYAT TEKLİFİ</h2>
          ${T.teklifNo ? `<p>No: <b>${esc(T.teklifNo)}</b></p>` : ''}<p>Tarih: ${gun(tarih)}</p>${T.gecerlilikGun ? `<p>Geçerlilik: ${gun(gecerli)}</p>` : ''}</div>
      </header>
      <div class="t-musteri"><span>Sayın</span><b>${esc(T.musteri || '—')}</b>${T.telefon ? `<span>${esc(T.telefon)}</span>` : ''}${T.adres ? `<span>${esc(T.adres)}</span>` : ''}</div>
      <p>Proje: <b>${esc(proje.ad || '')}</b></p>
      <table class="liste t-tablo"><thead><tr><th>#</th><th>Ürün</th><th>Ölçü (G×Y×D mm)</th><th>m²</th><th>Adet</th><th>Birim fiyat</th><th>Tutar</th></tr></thead><tbody>
        ${r.teklifSatirlari.map((x, i) => `<tr><td>${i + 1}</td><td>${esc(x.ad)}</td><td>${esc(x.aciklama)}</td><td class="sag">${x.alanM2 ? sayiYaz(x.alanM2 * x.adet, 2) : ''}</td><td class="sag">${x.adet}</td><td class="sag">${para(x.birimFiyat)}</td><td class="sag">${para(x.tutar)}</td></tr>`).join('')}
      </tbody><tfoot>
        <tr><td colspan="3">Toplam kapatılan alan</td><td class="sag">${sayiYaz(r.alanM2.toplam, 2)} m²</td><td colspan="3"></td></tr>
        <tr><td colspan="6">Ara toplam (KDV hariç)</td><td class="sag">${para(r.satisKdvHaric)}</td></tr>
        <tr><td colspan="6">KDV %${sayiYaz(r.kdvOrani)}</td><td class="sag">${para(r.kdv)}</td></tr>
        <tr class="t-genel"><td colspan="6">GENEL TOPLAM</td><td class="sag">${para(r.genelToplam)}</td></tr>
      </tfoot></table>
      <div class="t-kosul">
        <p><b>Malzeme:</b> ${esc([...new Set(sonuc.kesimListesi.map((p) => (malzeme(p.malzeme) || {}).ad).filter(Boolean))].join(', '))}</p>
        ${T.teslimSuresi ? `<p><b>Teslim süresi:</b> ${esc(T.teslimSuresi)}</p>` : ''}
        ${T.not ? `<p class="t-not">${esc(T.not)}</p>` : ''}
      </div>
      <div class="t-imza"><div>Teklifi veren<br><br>…………………………</div><div>Onaylayan (müşteri)<br><br>…………………………</div></div>
    </section>`;
  }

  // ---------------- Seçenekli teklif ----------------
  let secenekSonuclari = [];
  const SECENEK_KULLANIM = ['govde', 'kapak', 'cekmece', 'cam'];
  const SECENEK_HIRDAVAT = ['mentese', 'ray', 'kulp', 'baglanti'];
  function secenekCiz() {
    const T = proje.teklif;
    const A = proje.ayarlar;
    const L = T.secenekler;
    if (!L.length) {
      $('#secenekAlan').innerHTML = `<p class="not">Müşteriye aynı proje için birden çok fiyat sunun (ör. ekonomik / standart / lüks). Her seçenekte malzeme, hırdavat ve kâr oranı ayrı seçilir; boş bırakılan alanlar proje ayarını kullanır.</p>
        <button data-islem="secHazir">Hazır 3 seçenek oluştur</button> <button data-islem="secEkle" class="ikincil">+ Boş seçenek</button>`;
      secenekSonuclari = [];
      return;
    }
    secenekSonuclari = Maliyet.secenekleriHesapla(proje, L, plakaHesapla);
    const malzSec = (k, v) => secim('kul.' + k, v || '', [['', `Proje: ${malzemeEtiket(malzeme(A.kullanim[k]))}`], ...A.malzemeler.filter((m) => (k === 'cam') === Hesap.camMi(m)).map((m) => [m.id, m.ad])]);
    const hirSec = (k, v) => secim('hir.' + k, v || '', [['', `Proje: ${HS[k].secenekler[A.hirdavat[k]].ad}`], ...Object.entries(HS[k].secenekler).map(([a, o]) => [a, o.ad])]);
    const enUcuz = Math.min(...secenekSonuclari.map((r) => r.maliyet.genelToplam));
    $('#secenekAlan').innerHTML = `
      <div class="secenek-izgara">${L.map((sc, i) => {
        const r = secenekSonuclari[i].maliyet;
        return `<div class="secenek-kart" data-secenek="${i}">
          <div class="sk-baslik"><input data-alan="ad" value="${esc(sc.ad)}" aria-label="Seçenek adı"><button data-islem="secSil" class="ikincil kucuk-buton" title="Seçeneği sil">✕</button></div>
          <input data-alan="aciklama" value="${esc(sc.aciklama)}" placeholder="Kısa açıklama" aria-label="Açıklama">
          ${SECENEK_KULLANIM.map((k) => `<label>${KULLANIM_AD[k]}${malzSec(k, sc.kullanim[k])}</label>`).join('')}
          ${SECENEK_HIRDAVAT.map((k) => `<label>${HS[k].baslik}${hirSec(k, sc.hirdavat[k])}</label>`).join('')}
          <label>Kâr oranı (%)<input data-alan="karOrani" type="number" min="0" value="${sc.karOrani == null ? '' : esc(sc.karOrani)}" placeholder="Proje: ${esc(A.fiyat.karOrani)}"></label>
          <div class="sk-toplam${r.genelToplam === enUcuz ? ' ucuz' : ''}"><span>Genel toplam (KDV dahil)</span><b>${para(r.genelToplam)}</b><small>Maliyet ${para(r.maliyet)} · KDV hariç ${para(r.satisKdvHaric)}</small></div>
        </div>`;
      }).join('')}</div>
      <div class="arac-satir">${L.length < 4 ? '<button data-islem="secEkle" class="ikincil">+ Seçenek</button>' : ''}<button id="btnYazdirSecenek">Seçenekli teklif PDF</button></div>`;
  }
  $('#secenekAlan').addEventListener('change', (e) => {
    const el = e.target;
    const kart = el.closest('[data-secenek]');
    if (!kart) return;
    const sc = proje.teklif.secenekler[Number(kart.dataset.secenek)];
    const alan = el.dataset.alan;
    if (alan.startsWith('kul.')) { const k = alan.slice(4); if (el.value) sc.kullanim[k] = el.value; else delete sc.kullanim[k]; }
    else if (alan.startsWith('hir.')) { const k = alan.slice(4); if (el.value) sc.hirdavat[k] = el.value; else delete sc.hirdavat[k]; }
    else if (alan === 'karOrani') sc.karOrani = el.value === '' ? null : Math.max(0, Number(el.value) || 0);
    else sc[alan] = el.value.slice(0, alan === 'ad' ? 40 : 120);
    kaydet();
    secenekCiz();
  });
  $('#secenekAlan').addEventListener('click', (e) => {
    const L = proje.teklif.secenekler;
    const islem = e.target.dataset.islem;
    if (e.target.id === 'btnYazdirSecenek') { yazdir('secenekli'); return; }
    if (islem === 'secHazir') {
      for (const h of Maliyet.HAZIR_SECENEKLER) {
        L.push({ id: 'sc' + Math.random().toString(36).slice(2, 8), ad: h.ad, aciklama: h.aciklama, kullanim: Object.fromEntries(Object.entries(h.kullanim).filter(([, v]) => malzeme(v))), hirdavat: Object.assign({}, h.hirdavat), karOrani: h.karOrani });
      }
    } else if (islem === 'secEkle') L.push({ id: 'sc' + Math.random().toString(36).slice(2, 8), ad: `Seçenek ${L.length + 1}`, aciklama: '', kullanim: {}, hirdavat: {}, karOrani: null });
    else if (islem === 'secSil') { if (!confirm('Seçenek silinsin mi?')) return; L.splice(Number(e.target.closest('[data-secenek]').dataset.secenek), 1); }
    else return;
    kaydet();
    secenekCiz();
  });

  function secenekliYazdirHtml() {
    secenekCiz();
    const R = secenekSonuclari;
    if (!R.length) return '<p>Seçenek yok.</p>';
    const T = proje.teklif;
    const Fi = proje.ayarlar.firma;
    const tarih = new Date();
    const gecerli = new Date(tarih.getTime() + T.gecerlilikGun * 86400000);
    const gun = (d) => d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' });
    const sutun = R.map((r) => `<th>${esc(r.secenek.ad)}${r.secenek.aciklama ? `<br><small>${esc(r.secenek.aciklama)}</small>` : ''}</th>`).join('');
    const ozellik = R[0].ozellikler.map(([ad], i) => `<tr><td>${esc(ad)}</td>${R.map((r) => `<td>${esc(r.ozellikler[i][1] || '—')}</td>`).join('')}</tr>`).join('');
    const satirlar = R[0].maliyet.teklifSatirlari.map((x, i) => `<tr><td>${esc(x.ad)}${x.aciklama ? ` <small>${esc(x.aciklama)}</small>` : ''}${x.adet > 1 ? ` ×${x.adet}` : ''}</td>${R.map((r) => `<td class="sag">${para((r.maliyet.teklifSatirlari[i] || {}).tutar || 0)}</td>`).join('')}</tr>`).join('');
    return `<section class="y-sayfa teklif">
      <header class="t-ust">
        <div><h1>${esc(Fi.ad || 'Fiyat Teklifi')}</h1>${Fi.telefon ? `<p>${esc(Fi.telefon)}</p>` : ''}${Fi.adres ? `<p>${esc(Fi.adres)}</p>` : ''}</div>
        <div class="t-bilgi"><h2>SEÇENEKLİ FİYAT TEKLİFİ</h2>${T.teklifNo ? `<p>No: <b>${esc(T.teklifNo)}</b></p>` : ''}<p>Tarih: ${gun(tarih)}</p>${T.gecerlilikGun ? `<p>Geçerlilik: ${gun(gecerli)}</p>` : ''}</div>
      </header>
      <div class="t-musteri"><span>Sayın</span><b>${esc(T.musteri || '—')}</b>${T.telefon ? `<span>${esc(T.telefon)}</span>` : ''}${T.adres ? `<span>${esc(T.adres)}</span>` : ''}</div>
      <p>Proje: <b>${esc(proje.ad || '')}</b> — aşağıdaki seçeneklerden birini işaretleyerek onaylayabilirsiniz.</p>
      <table class="liste t-tablo secenek-tablo"><thead><tr><th></th>${sutun}</tr></thead><tbody>
        <tr class="grup"><td colspan="${R.length + 1}">Malzeme ve donanım</td></tr>${ozellik}
        <tr class="grup"><td colspan="${R.length + 1}">Ürünler (KDV hariç)</td></tr>${satirlar}
      </tbody><tfoot>
        <tr><td>Ara toplam (KDV hariç)</td>${R.map((r) => `<td class="sag">${para(r.maliyet.satisKdvHaric)}</td>`).join('')}</tr>
        <tr><td>KDV</td>${R.map((r) => `<td class="sag">${para(r.maliyet.kdv)}</td>`).join('')}</tr>
        <tr class="t-genel"><td>GENEL TOPLAM</td>${R.map((r) => `<td class="sag">${para(r.maliyet.genelToplam)}</td>`).join('')}</tr>
        <tr><td>Seçim</td>${R.map(() => '<td class="secim-kutu">☐</td>').join('')}</tr>
      </tfoot></table>
      <div class="t-kosul">${T.teslimSuresi ? `<p><b>Teslim süresi:</b> ${esc(T.teslimSuresi)}</p>` : ''}${T.not ? `<p class="t-not">${esc(T.not)}</p>` : ''}</div>
      <div class="t-imza"><div>Teklifi veren<br><br>…………………………</div><div>Onaylayan (müşteri)<br><br>…………………………</div></div>
    </section>`;
  }

  // ---------------- Atölye: delik planı ve montaj kılavuzu ----------------
  let atolyeModulId = null;
  const kesimNo = (m, kaynak) => {
    const L = sonuc.kesimListesi.filter((p) => (p.modulIdler || []).includes(m.id) && (p.ad === kaynak || p.ad.startsWith(kaynak)));
    return L.length ? L.map((p) => `#${p.no}`).join(', ') : '';
  };
  function delikHtml(m) {
    const d = delikPlaniAl(m);
    if (!d.destek) return `<p class="not">${esc(d.mesaj)}</p>`;
    const deliksiz = d.deliksiz.length ? `<div class="delik-kart deliksiz"><h4>Delik gerektirmeyen parçalar</h4><ul class="kucuk">${d.deliksiz.map((x) => `<li><b>${esc(x.ad)}</b> ${kesimNo(m, x.ad) ? `<span class="rozet">${esc(kesimNo(m, x.ad))}</span>` : ''} — ${esc(x.neden)}</li>`).join('')}</ul></div>` : '';
    return `<p class="not">${esc(d.eksenNotu)} Kırmızı: bağlantı · mavi: raf pimi · kahverengi halka: menteşe çanağı · kahverengi: menteşe plakası · yeşil: ray · siyah: kulp · gri-kahve: vida/aksesuar yeri · beyaz kırmızı halka: uçtan/kenardan delik · gri şerit: kanal · kırmızı alan: oyma.</p>`
      + d.parcalar.map((p) => `
      <div class="delik-kart">
        <h4>${esc(p.ad)} ${kesimNo(m, p.kaynak) ? `<span class="rozet">${esc(kesimNo(m, p.kaynak))}</span>` : ''} <small>${p.w} × ${p.h} mm${p.adet > 1 ? ` · ${p.adet} adet aynı` : ''} · ${esc(p.eksen)}</small></h4>
        <div class="delik-icerik">
          <div class="delik-resim">${Cizim.delikCizimi(p)}</div>
          <div class="delik-liste">
            ${p.ozet.length ? `<p class="kucuk">${esc(p.ozet.join(' · '))}</p>` : ''}
            ${p.delikler.length ? `<div class="delik-tablo-kap"><table class="liste kucuk-tablo"><thead><tr><th>Delik</th><th>Yüz</th><th>x</th><th>y</th><th>Ø×der.</th></tr></thead><tbody>${p.delikler.map((x) => `<tr><td>${esc(x.ad)}</td><td>${esc(x.yuz)}</td><td class="sag">${sayiYaz(x.x)}</td><td class="sag">${sayiYaz(x.y)}</td><td class="sag">${x.cap}${x.derinlik ? '×' + sayiYaz(x.derinlik) : ''}</td></tr>`).join('')}</tbody></table></div>` : ''}
            ${p.kanallar.map((k) => `<p class="kucuk">▭ ${esc(k.ad)}${k.konum ? `: ${esc(k.konum)}` : ''}</p>`).join('')}
            ${p.notlar.map((n) => `<p class="kucuk">• ${esc(n)}</p>`).join('')}
          </div>
        </div>
      </div>`).join('') + deliksiz;
  }
  /** Modül başına delik planı; aynı hesap sonucu için önbellekli. */
  function delikPlaniAl(m) {
    if (!sonuc._delik) sonuc._delik = {};
    if (!sonuc._delik[m.id]) sonuc._delik[m.id] = Delik.delikPlani(m, sonuc.modulSonuclari[m.id], proje.ayarlar);
    return sonuc._delik[m.id];
  }
  /** Kesim listesindeki bir satırın parça başına delik sayısı ("—": delik gerekmez). */
  function kesimDelikSayisi(p) {
    const sayilar = new Set();
    let deliksiz = false;
    for (const m of proje.moduller.filter((x) => (p.modulIdler || []).includes(x.id))) {
      const d = delikPlaniAl(m);
      if (!d.destek) continue;
      for (const x of d.parcalar) if (x.kaynak && (p.ad === x.kaynak || p.ad.startsWith(x.kaynak))) sayilar.add(x.delikler.length);
      if (d.deliksiz.some((x) => x.ad === p.ad)) deliksiz = true;
    }
    if (sayilar.size) return [...sayilar].sort((a, b) => a - b).join(' / ');
    return deliksiz ? '—' : '';
  }
  function montajHtml(m) {
    const k = Montaj.kilavuz(m, sonuc.modulSonuclari[m.id], proje, sonuc);
    return k.map((b) => `<h4>${esc(b.baslik)}</h4><ol class="montaj-adim">${b.adimlar.map((a) => `<li>${esc(a)}</li>`).join('')}</ol>`).join('');
  }
  function atolyeCiz() {
    if (!proje.moduller.some((m) => m.id === atolyeModulId)) atolyeModulId = seciliId;
    $('#atolyeModul').innerHTML = proje.moduller.map((m) => `<option value="${esc(m.id)}"${m.id === atolyeModulId ? ' selected' : ''}>${esc(m.ad)}</option>`).join('');
    const m = proje.moduller.find((x) => x.id === atolyeModulId);
    if (!m) { $('#montajAlan').innerHTML = '<p class="bos">Modül yok.</p>'; $('#delikAlan').innerHTML = ''; return; }
    $('#montajAlan').innerHTML = montajHtml(m);
    $('#delikAlan').innerHTML = delikHtml(m);
  }
  $('#atolyeModul').addEventListener('change', (e) => { atolyeModulId = e.target.value; atolyeCiz(); });
  // Parçasız modüller (boşluk, eşya/dekor) üretim çıktılarına girmez
  const uretimModulleri = () => proje.moduller.filter((m) => !(m.tip === 'panel' && (m.panelTuru === 'bosluk' || m.panelTuru === 'nesne')));
  const delikYazdirHtml = () => uretimModulleri().map((m) => `<section class="y-sayfa">${baslikHtml(`Delik planı — ${m.ad}`)}${delikHtml(m)}</section>`).join('');
  const montajYazdirHtml = () => uretimModulleri().map((m) => `<section class="y-sayfa">${baslikHtml(`Montaj kılavuzu — ${m.ad}`)}<div class="y-modul y-montaj"><div class="y-on">${Cizim.onGorunus(m, sonuc.modulSonuclari[m.id].geo, {})}</div><div>${montajHtml(m)}</div></div></section>`).join('');
  $('#btnYazdirDelik').addEventListener('click', () => yazdir('delik'));
  $('#btnYazdirMontaj').addEventListener('click', () => yazdir('montaj'));

  // ---------------- 3D görünüm ----------------
  const ucGorus = { yaw: -35, pitch: 22, yakin: 1 };
  let ucBekleyen = false;
  function ucCiz() {
    const kapaksiz = $('#ucKapaksiz').checked;
    let P;
    if ($('#ucKapsam').value === 'proje') P = Uc.projeParcalari(sonuc.yerlesim, { kapaksiz, renkFn: (x) => Hesap.modulRenkleri(x, proje.ayarlar) });
    else {
      const m = seciliModul();
      P = m && sonuc.modulSonuclari[m.id] ? Uc.modulParcalari(sonuc.modulSonuclari[m.id].geo, { kapaksiz, renk: Hesap.modulRenkleri(m, proje.ayarlar) }) : [];
    }
    $('#ucAlan').innerHTML = Uc.ciz(P, ucGorus, { yakin: ucGorus.yakin });
  }
  const ucIste = () => {
    if (ucBekleyen) return;
    ucBekleyen = true;
    requestAnimationFrame(() => { ucBekleyen = false; ucCiz(); });
  };
  let surukle = null;
  // İki parmakla yakınlaştırma: etkin dokunuşlar izlenir
  const dokunuslar = new Map();
  let kiskac = null;
  const mesafe = () => { const [a, b] = [...dokunuslar.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
  $('#ucAlan').addEventListener('pointerdown', (e) => {
    dokunuslar.set(e.pointerId, { x: e.clientX, y: e.clientY });
    $('#ucAlan').setPointerCapture(e.pointerId);
    if (dokunuslar.size === 2) { surukle = null; kiskac = { d: mesafe(), yakin: ucGorus.yakin }; return; }
    surukle = { x: e.clientX, y: e.clientY, yaw: ucGorus.yaw, pitch: ucGorus.pitch };
  });
  $('#ucAlan').addEventListener('pointermove', (e) => {
    if (dokunuslar.has(e.pointerId)) dokunuslar.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (kiskac && dokunuslar.size === 2) {
      ucGorus.yakin = Math.max(0.3, Math.min(6, kiskac.yakin * (mesafe() / (kiskac.d || 1))));
      ucIste();
      return;
    }
    if (!surukle) return;
    ucGorus.yaw = surukle.yaw + (e.clientX - surukle.x) * 0.4;
    ucGorus.pitch = Math.max(-10, Math.min(89, surukle.pitch + (e.clientY - surukle.y) * 0.3));
    ucIste();
  });
  const surukleBitir = (e) => { dokunuslar.delete(e.pointerId); if (dokunuslar.size < 2) kiskac = null; surukle = null; };
  $('#ucAlan').addEventListener('pointerup', surukleBitir);
  $('#ucAlan').addEventListener('pointercancel', surukleBitir);
  $('#ucAlan').addEventListener('wheel', (e) => { e.preventDefault(); ucGorus.yakin = Math.max(0.3, Math.min(6, ucGorus.yakin * (e.deltaY < 0 ? 1.12 : 1 / 1.12))); ucIste(); }, { passive: false });
  $('#ucAlan').addEventListener('keydown', (e) => {
    const adim = { ArrowLeft: [-5, 0], ArrowRight: [5, 0], ArrowUp: [0, -5], ArrowDown: [0, 5] }[e.key];
    if (!adim) return;
    e.preventDefault();
    ucGorus.yaw += adim[0];
    ucGorus.pitch = Math.max(-10, Math.min(89, ucGorus.pitch + adim[1]));
    ucIste();
  });
  document.querySelector('.uc-arac').addEventListener('click', (e) => {
    const k = e.target.dataset.uc;
    if (!k) return;
    if (k === 'on') Object.assign(ucGorus, { yaw: 0, pitch: 0 });
    else if (k === 'izo') Object.assign(ucGorus, { yaw: -35, pitch: 22 });
    else if (k === 'ust') Object.assign(ucGorus, { yaw: 0, pitch: 85 });
    else if (k === 'yak') ucGorus.yakin = Math.min(6, ucGorus.yakin * 1.25);
    else if (k === 'uzak') ucGorus.yakin = Math.max(0.3, ucGorus.yakin / 1.25);
    ucCiz();
  });
  $('#ucKapsam').addEventListener('change', ucCiz);
  $('#ucKapaksiz').addEventListener('change', ucCiz);

  // Dar ekranda çizim ile ölçü formu arasında hızlı geçiş
  $('#btnFormaGit').addEventListener('click', () => {
    const form = $('#modulForm');
    const formUstu = form.getBoundingClientRect().top;
    if (formUstu > 80) form.scrollIntoView({ behavior: 'smooth' });
    else document.querySelector('.sag').scrollIntoView({ behavior: 'smooth' });
  });
  window.addEventListener('scroll', () => {
    const b = $('#btnFormaGit');
    b.textContent = $('#modulForm').getBoundingClientRect().top > 80 ? '✎ Ölçüler' : '↑ Çizim';
  }, { passive: true });

  // ---------------- Sekmeler ----------------
  let aktifSekme = 'cizim';
  document.querySelector('.sekmeler').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-sekme]');
    if (!b) return;
    aktifSekme = b.dataset.sekme;
    document.querySelectorAll('.sekmeler button').forEach((x) => x.classList.toggle('aktif', x === b));
    document.querySelectorAll('.sekme').forEach((x) => x.classList.toggle('aktif', x.id === 'sekme-' + aktifSekme));
    if (aktifSekme === 'plaka') { artikCiz(); plakaCiz(); }
    if (aktifSekme === 'yerlesim') yerlesimCiz();
    if (aktifSekme === 'maliyet') { fiyatFormCiz(); teklifFormCiz(); maliyetCiz(); secenekCiz(); }
    if (aktifSekme === 'atolye') atolyeCiz();
    if (aktifSekme === 'uc') ucCiz();
  });

  // ---------------- Yazdırma (PDF) ----------------
  const bugun = () => new Date().toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' });

  function baslikHtml(altBaslik) {
    return `<header class="y-baslik"><div><h1>${esc(proje.ad || 'Proje')}</h1><p>${esc(altBaslik)}</p></div><div class="y-tarih">${bugun()}<br>${proje.moduller.length} modül · ${sonuc.kesimListesi.reduce((a, p) => a + p.adet, 0)} parça</div></header>`;
  }

  const plakaSayilari = () => Yerlesim.plakaSayilari(plakaGruplari);

  function kesimYazdirHtml() {
    return `<section class="y-sayfa">${baslikHtml('Kesim listesi')}
      ${kesimTablosuHtml(true)}
      <h2>Malzeme özeti</h2>${ozetHtml(plakaSayilari())}
      ${sonuc.uyarilar.length ? `<h2>Uyarılar</h2><ul class="y-uyari">${sonuc.uyarilar.map((u) => `<li>${esc(u)}</li>`).join('')}</ul>` : ''}
    </section>`;
  }

  function etiketYazdirHtml() {
    const tekil = [];
    for (const p of sonuc.kesimListesi) for (let i = 1; i <= p.adet; i++) tekil.push({ p, i });
    const SAYFA = 21;
    let html = '';
    for (let s = 0; s < tekil.length; s += SAYFA) {
      html += '<section class="etiket-sayfa">';
      for (const { p, i } of tekil.slice(s, s + SAYFA)) {
        const m = malzeme(p.malzeme);
        html += `<div class="etiket">
          <div class="e-ust"><b>#${p.no}</b><span>${i}/${p.adet}</span></div>
          <div class="e-ad">${esc(p.ad)}</div>${p.not ? `<div class="e-not">${esc(p.not)}</div>` : ''}
          <div class="e-olcu">${sayiYaz(p.kesimBoy)} × ${sayiYaz(p.kesimEn)}</div>
          <div class="e-alt"><span class="e-bant">${Cizim.bantSimgesi(p.bant, 26)}</span><span>${esc(m.ad)}${p.damar ? ' · damar ↔' : ''}<br>${esc(p.moduller.join(', '))} · ${esc(proje.ad || '')}</span></div>
        </div>`;
      }
      html += '</section>';
    }
    return html || '<p>Parça yok.</p>';
  }

  function tumYazdirHtml() {
    let html = `<section class="y-sayfa">${baslikHtml('Proje çizimleri')}`;
    for (const m of uretimModulleri()) {
      const geo = sonuc.modulSonuclari[m.id].geo;
      if (!geo) continue;
      html += `<div class="y-modul"><div class="y-on">${Cizim.onGorunus(m, geo, {})}</div><div class="y-yan">${Cizim.yanKesit(m, geo)}</div></div>`;
    }
    html += '</section>';
    const yer = sonuc.yerlesim;
    html += `<section class="y-sayfa">${baslikHtml('Yerleşim')}<h2>Kuşbakışı plan</h2>${Cizim.planCizimi(yer)}<h2>A duvarı</h2>${Cizim.duvarGorunus(yer, 'A')}${yer.tip === 'L' ? `<h2>B duvarı</h2>${Cizim.duvarGorunus(yer, 'B')}` : ''}</section>`;
    html += `<section class="y-sayfa">${baslikHtml('3D görünüm')}<div class="y-uc">${Uc.ciz(Uc.projeParcalari(yer, { renkFn: (x) => Hesap.modulRenkleri(x, proje.ayarlar) }), { yaw: -35, pitch: 22 }, {})}</div></section>`;
    html += kesimYazdirHtml();
    html += `<section class="y-sayfa">${baslikHtml('Hırdavat listesi')}${hirdavatHtml()}<h2>Yerinde montaj hırdavatı</h2>${montajHirdavatHtml()}</section>`;
    html += montajYazdirHtml();
    html += delikYazdirHtml();
    maliyetCiz();
    if (maliyetDahil) html += `<section class="y-sayfa">${baslikHtml('Maliyet (iç kullanım)')}${$('#maliyetOzet').innerHTML}<h2>Modül başına</h2>${$('#modulMaliyetTablo').innerHTML}<h2>Kalemler</h2>${$('#maliyetKalemleri').innerHTML}</section>`;
    html += `<section class="y-sayfa">${baslikHtml('Plaka kesim planları')}${plakaHtml(true)}</section>`;
    return html;
  }

  function yazdir(tur) {
    const alan = $('#yazdirAlan');
    alan.className = 'yazdir-' + tur;
    const icerik = { etiket: etiketYazdirHtml, kesim: kesimYazdirHtml, teklif: teklifYazdirHtml, tumu: tumYazdirHtml, secenekli: secenekliYazdirHtml, delik: delikYazdirHtml, montaj: montajYazdirHtml }[tur];
    alan.innerHTML = icerik();
    const eskiBaslik = document.title;
    const adlar = { etiket: 'Parça etiketleri', kesim: 'Kesim listesi', teklif: 'Fiyat teklifi', tumu: 'Proje', secenekli: 'Seçenekli teklif', delik: 'Delik planı', montaj: 'Montaj kılavuzu' };
    document.title = `${proje.ad || 'Proje'} - ${adlar[tur]}`;
    window.print();
    document.title = eskiBaslik;
  }
  $('#btnYazdirKesim').addEventListener('click', () => yazdir('kesim'));
  $('#btnYazdirEtiket').addEventListener('click', () => yazdir('etiket'));
  let maliyetDahil = false;
  $('#btnYazdirTumu').addEventListener('click', () => {
    // Kâr ve maliyet müşteriye gitmesin: varsayılan olarak eklenmez, sorulur
    maliyetDahil = confirm('Maliyet ve kâr sayfası da eklensin mi?\n\nTamam: evet (yalnızca iç kullanım — müşteriye göndermeyin)\nİptal: hayır');
    yazdir('tumu');
  });
  $('#btnYazdirTeklif').addEventListener('click', () => yazdir('teklif'));
  window.addEventListener('afterprint', () => { $('#yazdirAlan').innerHTML = ''; });

  // ---------------- Dışa aktarma ----------------
  function indir(ad, icerik, tur) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([icerik], { type: tur }));
    a.download = ad;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0);
  }
  const dosyaAdi = () => (proje.ad || 'proje').replace(/[^\wçğıöşüÇĞİÖŞÜ -]+/g, '').trim() || 'proje';

  $('#btnCsv').addEventListener('click', () => {
    const sayi = (x) => String(x).replace('.', ',');
    const satirlar = [['No', 'Malzeme', 'Kalınlık', 'Parça', 'Adet', 'Net boy', 'Net en', 'Kesim boy', 'Kesim en', 'Bant uzun kenar', 'Bant kısa kenar', 'Damar', 'Modüller', 'Not']];
    for (const p of sonuc.kesimListesi) {
      const m = malzeme(p.malzeme);
      satirlar.push([p.no, m.ad, sayi(m.kalinlik), p.ad, p.adet, sayi(p.boy), sayi(p.en), sayi(p.kesimBoy), sayi(p.kesimEn), p.bant.u, p.bant.k, p.damar ? 'Var' : 'Yok', p.moduller.join(', '), p.not || '']);
    }
    csvIndir(`${dosyaAdi()} - kesim listesi.csv`, satirlar);
  });
  // Excel'in hücreyi formül olarak çalıştırmaması için = + - @ ile başlayan metinler etkisizleştirilir.
  function csvIndir(ad, satirlar) {
    const hucre = (c) => {
      let x = typeof c === 'number' ? String(c).replace('.', ',') : String(c);
      if (typeof c === 'string' && /^[=+\-@\t\r]/.test(x)) x = "'" + x;
      return `"${x.replace(/"/g, '""')}"`;
    };
    const csv = satirlar.map((r) => r.map(hucre).join(';')).join('\r\n');
    indir(ad, '\ufeff' + csv, 'text/csv;charset=utf-8');
  }
  $('#btnDelikCsv').addEventListener('click', () => {
    const satirlar = [['Modül', 'Parça', 'Adet', 'Parça en (x)', 'Parça boy (y)', 'Delik / işlem', 'Yüz', 'x', 'y', 'Çap', 'Derinlik']];
    for (const m of proje.moduller) {
      const d = delikPlaniAl(m);
      if (d.destek) satirlar.push(...Delik.csvSatirlari(m.ad, d));
    }
    csvIndir(`${dosyaAdi()} - delik plani.csv`, satirlar);
  });

  $('#btnKaydet').addEventListener('click', () => indir(`${dosyaAdi()}.json`, JSON.stringify(proje, null, 2), 'application/json'));

  $('#dosyaAc').addEventListener('change', async (e) => {
    const dosya = e.target.files[0];
    e.target.value = '';
    if (!dosya) return;
    try {
      const p = JSON.parse(await dosya.text());
      if (!p || !Array.isArray(p.moduller)) throw new Error('biçim');
      proje = Hesap.projeyiNormallestir(p);
      seciliId = proje.moduller[0] ? proje.moduller[0].id : null;
      $('#projeAd').value = proje.ad || '';
      tumunuCiz(true);
      ayarFormCiz();
      if (aktifSekme === 'maliyet') { fiyatFormCiz(); teklifFormCiz(); }
    } catch (err) {
      alert('Dosya okunamadı: geçerli bir proje dosyası değil.');
    }
  });

  $('#btnYeniProje').addEventListener('click', () => {
    if (!confirm('Mevcut proje silinip yeni proje başlatılsın mı? (Önce "Dosyaya kaydet" ile yedek alabilirsiniz.)')) return;
    proje = yeniProje();
    seciliId = proje.moduller[0].id;
    $('#projeAd').value = proje.ad;
    tumunuCiz(true);
    ayarFormCiz();
    if (aktifSekme === 'maliyet') { fiyatFormCiz(); teklifFormCiz(); }
  });

  $('#projeAd').addEventListener('input', (e) => { proje.ad = e.target.value; kaydet(); });

  // ---------------- Ana döngü ----------------
  // Geçersiz değerleri anında düzelt: proje doğrulayıcısından geçirilir, farklı çıkan alanlar bildirilir
  const ALAN_AD = { genislik: 'Genişlik', genislik2: 'B kolu', yukseklik: 'Yükseklik', derinlik: 'Derinlik', adet: 'Adet', montajYuksekligi: 'Montaj yüksekliği',
    sagYukseklik: 'Sağ yükseklik', kalinlik: 'Kalınlık', plakaUzun: 'Plaka uzun kenar', plakaKisa: 'Plaka kısa kenar', testereKalinligi: 'Testere payı',
    plakaKenarPayi: 'Plaka kenar payı', icCekmeceH: 'İç çekmece yüksekliği', kutuYukseklik: 'Kutu yüksekliği', konum: 'Duvarda konum', duvarA: 'A duvarı', duvarB: 'B duvarı', raf: 'Raf sayısı', dikme: 'Ara dikme', boy: 'Boy', en: 'En', korPanel: 'Kör panel', tavan: 'Tavan' };
  function dogrula() {
    const n = Hesap.projeyiNormallestir(JSON.parse(JSON.stringify(proje)));
    const farklar = [];
    const gez = (a, b, yol) => {
      if (farklar.length > 5) return;
      if (a && b && typeof a === 'object' && typeof b === 'object') {
        for (const k of Object.keys(b)) gez(a[k], b[k], yol.concat(k));
      } else if (a !== b && !(a == null && b == null) && (b === null || typeof b !== 'object')) farklar.push({ yol, eski: a, yeni: b });
    };
    gez(proje, n, []);
    // Ölçü alanında sıfır/eksi: önceki geçerli değer geri yüklenir
    const OLCU = ['genislik', 'genislik2', 'yukseklik', 'derinlik', 'boy', 'en', 'kalinlik', 'plakaUzun', 'plakaKisa'];
    let onceki = null;
    try { onceki = gecmis.length > 1 ? JSON.parse(gecmis[gecmis.length - 2]) : null; } catch (e2) { onceki = null; }
    const yolAl = (o, yol) => yol.reduce((a, k) => (a == null ? a : a[k]), o);
    // Eksi/sıfır ölçü normalleştirmede değişmeyebilir (alt sınır 0): ayrıca yakala
    const tara = (a, yol) => {
      if (a && typeof a === 'object') { for (const k of Object.keys(a)) tara(a[k], yol.concat(k)); return; }
      if (OLCU.includes(yol[yol.length - 1]) && typeof a === 'number' && a <= 0 && !farklar.some((f) => f.yol.join('.') === yol.join('.'))) farklar.push({ yol, eski: a, yeni: a });
    };
    tara(n.moduller, ['moduller']);
    tara(n.ayarlar.malzemeler, ['ayarlar', 'malzemeler']);
    for (const f of farklar) {
      const gecersiz = f.eski == null || f.eski === '' || (typeof f.eski === 'number' && f.eski <= 0);
      if (!OLCU.includes(f.yol[f.yol.length - 1]) || !gecersiz) continue;
      const eski = yolAl(onceki, f.yol);
      if (typeof eski === 'number' && eski > 0) {
        const ust = yolAl(n, f.yol.slice(0, -1));
        if (ust) ust[f.yol[f.yol.length - 1]] = eski;
        f.yeni = eski;
      }
    }
    // Geri yüklenemeyen ve değişmeyen değerler bildirilmez
    for (let i = farklar.length - 1; i >= 0; i--) if (farklar[i].eski === farklar[i].yeni) farklar.splice(i, 1);
    if (!farklar.length) return;
    proje = n;
    if (!proje.moduller.some((m) => m.id === seciliId)) seciliId = proje.moduller[0] ? proje.moduller[0].id : null;
    const yazi = farklar.slice(0, 3).map((f) => `${ALAN_AD[f.yol[f.yol.length - 1]] || f.yol[f.yol.length - 1]} ${f.eski === '' || f.eski == null ? '(boş)' : esc(String(f.eski))} → ${f.yeni == null ? 'otomatik' : esc(String(f.yeni))}`);
    // 2) Geçersiz ara durum geri alma geçmişinde kalmaz: düzeltilmiş durum onun yerine geçer
    if (gecmis.length > 1) gecmis.pop();
    ayarFormCiz();
    tumunuCiz(true);
    bildir(`Geçersiz değer düzeltildi: ${yazi.join(', ')}`);
  }
  let bildirimZaman = null;
  function bildir(metin, geriAlVar) {
    let k = document.getElementById('bildirim');
    if (!k) { k = document.createElement('div'); k.id = 'bildirim'; k.setAttribute('role', 'status'); document.body.appendChild(k); }
    k.innerHTML = `<span>${metin}</span>${geriAlVar ? ' <button type="button" class="ikincil kucuk-buton" data-bildirim="geri">Geri al</button>' : ''}`;
    k.classList.add('acik');
    clearTimeout(bildirimZaman);
    bildirimZaman = setTimeout(() => k.classList.remove('acik'), 6000);
  }
  document.addEventListener('click', (e) => {
    if (e.target.dataset && e.target.dataset.bildirim === 'geri') { $('#btnGeriAl').click(); document.getElementById('bildirim').classList.remove('acik'); }
  });
  // Tüm form değişikliklerinden sonra (özel işleyiciler çalıştıktan sonra) doğrula
  document.addEventListener('change', (e) => { if (e.target.matches('input, select, textarea') && !e.target.closest('#katalog, #dosyaAc, #tasarimPencere')) dogrula(); });

  function tumunuCiz(formDa) {
    sonuc = Hesap.projeHesapla(proje);
    plakaGruplari = Yerlesim.projeYerlesimi(sonuc.kesimListesi, proje.ayarlar, proje.artikKullan ? artikStok : null);
    maliyet = Maliyet.maliyetHesapla(proje, sonuc, Yerlesim.plakaSayilari(plakaGruplari));
    modulListesiCiz();
    if (formDa) modulFormCiz();
    uyarilariCiz();
    cizimleriCiz();
    kesimTablosuCiz();
    hirdavatCiz();
    if (aktifSekme === 'plaka') plakaCiz();
    if (aktifSekme === 'yerlesim') yerlesimCiz();
    if (aktifSekme === 'maliyet') { maliyetCiz(); secenekCiz(); }
    if (aktifSekme === 'atolye') atolyeCiz();
    if (aktifSekme === 'uc') ucCiz();
    kaydet();
  }

  let ilkAcilis = false;
  try { ilkAcilis = !localStorage.getItem(KAYIT_ANAHTARI); } catch (e) { /* yok say */ }
  proje = yukle();
  seciliId = proje.moduller[0] ? proje.moduller[0].id : null;
  $('#projeAd').value = proje.ad;
  ayarFormCiz();
  tumunuCiz(true);
  if (ilkAcilis) $('#yardim').showModal();
})();

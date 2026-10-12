/* Arayüz: proje durumu, formlar, sekmeler, yazdırma ve dışa aktarma. */
(function () {
  'use strict';

  const KAYIT_ANAHTARI = 'mobilya-olcu-proje-v1';
  const RENKLER = ['#f6d7a7', '#c8e0f4', '#d4ecd0', '#f3c9d4', '#e3d4f2', '#fbe7a1', '#cfe9ec', '#f2d2bd', '#dfe4c3', '#e9d0e9'];
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const sayiYaz = (x, b = 1) => Number(x).toLocaleString('tr-TR', { maximumFractionDigits: b });

  const KULLANIM_AD = Hesap.KULLANIM_AD;
  const HS = Hesap.HIRDAVAT_SECENEKLERI;
  const TIP_AD = { kapak: 'Kapak', cekmece: 'Çekmece', acik: 'Açık raf' };

  let proje;
  let seciliId = null;
  let sonuc = null;

  function yeniProje() {
    return Hesap.projeyiGuncelle({ ad: 'Yeni proje', ayarlar: Hesap.varsayilanAyarlar(), moduller: [Hesap.yeniModul('alt')] });
  }

  function yukle() {
    try {
      const v = localStorage.getItem(KAYIT_ANAHTARI);
      if (v) {
        const p = JSON.parse(v);
        if (p && Array.isArray(p.moduller)) return Hesap.projeyiGuncelle(p);
      }
    } catch (e) { /* bozuk kayıt: yeni proje */ }
    return yeniProje();
  }

  function kaydet() {
    try { localStorage.setItem(KAYIT_ANAHTARI, JSON.stringify(proje)); } catch (e) { /* depolama kapalı olabilir */ }
  }

  const seciliModul = () => proje.moduller.find((m) => m.id === seciliId);
  const malzeme = (id) => Hesap.malzemeBul(proje.ayarlar, id);
  const malzemeEtiket = (m) => (m ? `${m.ad}` : '?');

  // ---------------- Modül listesi ----------------
  function modulListesiCiz() {
    const L = proje.yerlesim.tip === 'L';
    $('#modulListesi').innerHTML = proje.moduller.map((m) => {
      const olcu = m.tip === 'lkose'
        ? `L ${m.genislik}+${m.genislik2} × Y${m.yukseklik} × D${m.derinlik}`
        : `G${m.genislik} × Y${m.yukseklik} × D${m.derinlik}`;
      const duvar = L ? (m.tip === 'lkose' ? ' · köşe' : ` · ${m.duvar} duvarı`) : '';
      return `
      <li class="${m.id === seciliId ? 'secili' : ''}" data-id="${m.id}">
        <span class="m-ad">${esc(m.ad)}</span>
        <span class="m-olcu">${olcu}${m.adet > 1 ? ` · ${m.adet} ad.` : ''}${duvar}</span>
        <span class="m-arac">
          <button data-islem="yukari" title="Yukarı taşı">↑</button>
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
      k.ad = m.ad + ' (kopya)';
      proje.moduller.splice(i + 1, 0, k);
      seciliId = k.id;
    } else if (islem === 'yukari') {
      if (i > 0) [proje.moduller[i - 1], proje.moduller[i]] = [proje.moduller[i], proje.moduller[i - 1]];
    } else {
      seciliId = id;
    }
    tumunuCiz(true);
  });

  $('#btnModulEkle').addEventListener('click', () => {
    const m = Hesap.yeniModul($('#presetSec').value);
    const ayni = proje.moduller.filter((x) => x.ad.startsWith(m.ad)).length;
    if (ayni) m.ad += ' ' + (ayni + 1);
    proje.moduller.push(m);
    seciliId = m.id;
    tumunuCiz(true);
  });

  // ---------------- Modül formu ----------------
  const secim = (ad, deger, secenekler, ek) =>
    `<select data-alan="${ad}" ${ek || ''}>${secenekler.map(([v, t]) => `<option value="${esc(v)}"${String(v) === String(deger) ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select>`;

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

  function modulFormCiz() {
    const m = seciliModul();
    const kap = $('#modulForm');
    if (!m) { kap.innerHTML = '<p class="bos">Bir modül seçin.</p>'; return; }
    const L = proje.yerlesim.tip === 'L';
    const lk = m.tip === 'lkose';
    const bazaAlanlari = `
        <label>Baza${secim('baza.tip', m.baza.tip, [['yok', 'Yok'], ['ayak', 'Ayarlı ayak'], ['panel', 'Baza çerçevesi']])}</label>
        <label>Baza yük. (mm)<input data-alan="baza.yukseklik" type="number" min="0" value="${m.baza.yukseklik}" ${m.baza.tip === 'yok' ? 'disabled' : ''}></label>
        <label>Baza geri çekme<input data-alan="baza.geriCekme" type="number" min="0" value="${m.baza.geriCekme}" ${m.baza.tip !== 'panel' ? 'disabled' : ''}></label>`;

    let html = `
      <h2>${lk ? 'L köşe dolap ölçüleri' : 'Modül ölçüleri'}</h2>
      <div class="form-izgara">
        <label class="genis">Ad<input data-alan="ad" value="${esc(m.ad)}"></label>
        ${lk
          ? `<label title="Köşeden A kolu ucuna, duvar boyunca">A kolu (mm)<input data-alan="genislik" type="number" min="300" value="${m.genislik}"></label>
             <label title="Köşeden B kolu ucuna, duvar boyunca">B kolu (mm)<input data-alan="genislik2" type="number" min="300" value="${m.genislik2}"></label>`
          : `<label>Genişlik (mm)<input data-alan="genislik" type="number" min="100" value="${m.genislik}"></label>`}
        <label>Yükseklik (mm)<input data-alan="yukseklik" type="number" min="100" value="${m.yukseklik}" title="Zeminden en üste, baza/ayak dahil"></label>
        <label>Derinlik (mm)<input data-alan="derinlik" type="number" min="100" value="${m.derinlik}" title="Gövde derinliği, kapak hariç"></label>
        <label>Adet<input data-alan="adet" type="number" min="1" value="${m.adet}"></label>
        <label title="Duvara asılan dolaplar için zeminden dolabın altına mesafe. 0 = zemine oturur.">Montaj yük. (mm)<input data-alan="montajYuksekligi" type="number" min="0" value="${m.montajYuksekligi || 0}"></label>
        ${L && !lk ? `<label>Duvar${secim('duvar', m.duvar, [['A', 'A duvarı'], ['B', 'B duvarı']])}</label>` : ''}
      </div>`;

    if (lk) {
      html += `
      <h3>Yapı</h3>
      <div class="form-izgara">
        <label>Raf sayısı<input data-alan="raf" type="number" min="0" max="10" value="${m.raf}"></label>
        ${bazaAlanlari}
      </div>
      <p class="not">Katlanır iki kapak, L tablalar ve raflar ikişer parça halinde hesaplanır. Arkalık her kola ayrı çakılır.</p>`;
    } else {
      html += `
      <h3>Yapı</h3>
      <div class="form-izgara">
        <label>Birleşim${secim('yapi', m.yapi, [['yanlar_boydan', 'Yanlar boydan'], ['tabla_boydan', 'Tablalar boydan']])}</label>
        <label>Üst${secim('ust', m.ust, [['tam', 'Tam üst tabla'], ['kusak', 'Kuşak (tezgah altı)']])}</label>
        <label>Arkalık${secim('arkalik', m.arkalik, [['kanal', 'Kanala geçme'], ['cakma', 'Arkaya çakma'], ['yok', 'Arkalık yok']])}</label>
        <label>Kapak tipi${secim('kapakTipi', m.kapakTipi, [['tam', 'Tam bini (bindirme)'], ['ic', 'Gömme (iç bini)']])}</label>
        ${bazaAlanlari}
        <label title="Kör köşe dolapta komşu dolabın önünde kalan sabit panel. Genelde komşu dolap derinliği + kapak kalınlığı.">Kör panel (mm)<input data-alan="korPanel" type="number" min="0" value="${m.korPanel || 0}"></label>
        <label>Kör panel tarafı${secim('korTaraf', m.korTaraf, [['sol', 'Solda'], ['sag', 'Sağda']], m.korPanel > 0 ? '' : 'disabled')}</label>
      </div>
      <h3>Ön düzen <small>(yukarıdan aşağıya)</small></h3>
      <table class="satir-tablo">
        <thead><tr><th>#</th><th>Tip</th><th title="Ön yüz yüksekliği. Boş bırakılırsa kalan yükseklik paylaştırılır.">Yük.</th><th title="Yan yana kapak/çekmece adedi">Yan yana</th><th title="Her bölmedeki hareketli raf sayısı">Raf</th><th title="Dikey ara bölme sayısı (çekmecede otomatik)">Dikme</th><th title="Elbise askı borusu">Askı</th><th></th></tr></thead>
        <tbody>
          ${m.satirlar.map((s, i) => `
            <tr data-satir="${i}">
              <td>${i + 1}</td>
              <td>${secim('tip', s.tip, Object.entries(TIP_AD))}</td>
              <td><input data-alan="yukseklik" type="number" min="0" placeholder="oto" value="${s.yukseklik == null ? '' : s.yukseklik}"></td>
              <td><input data-alan="adet" type="number" min="1" max="8" value="${s.adet}" ${s.tip === 'acik' ? 'disabled' : ''}></td>
              <td><input data-alan="raf" type="number" min="0" max="20" value="${s.raf}" ${s.tip === 'cekmece' ? 'disabled' : ''}></td>
              <td><input data-alan="dikme" type="number" min="0" max="8" value="${s.tip === 'cekmece' ? Math.max(0, s.adet - 1) : s.dikme}" ${s.tip === 'cekmece' ? 'disabled' : ''}></td>
              <td><input data-alan="aski" type="checkbox" ${s.aski ? 'checked' : ''} ${s.tip === 'cekmece' ? 'disabled' : ''}></td>
              <td class="satir-arac">
                <button data-islem="yukari" title="Yukarı">↑</button><button data-islem="asagi" title="Aşağı">↓</button><button data-islem="sil" title="Sil">✕</button>
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
      <div class="ekle-satir">
        <button data-islem="satirEkle" data-tip="kapak" class="ikincil">+ Kapak</button>
        <button data-islem="satirEkle" data-tip="cekmece" class="ikincil">+ Çekmece</button>
        <button data-islem="satirEkle" data-tip="acik" class="ikincil">+ Açık raf</button>
      </div>`;
    }
    html += malzemeHirdavatFormu(m);
    kap.innerHTML = html;
  }

  $('#modulForm').addEventListener('change', (e) => {
    const m = seciliModul();
    const el = e.target;
    const alan = el.dataset.alan;
    if (!m || !alan) return;
    const tr = el.closest('tr[data-satir]');
    let deger = el.type === 'checkbox' ? el.checked : el.value;
    if (el.type === 'number') deger = el.value === '' ? null : Number(el.value);
    if (tr) {
      const s = m.satirlar[Number(tr.dataset.satir)];
      s[alan] = deger;
      if (alan === 'tip' && deger === 'cekmece') { s.raf = 0; s.aski = false; }
    } else if (alan.includes('.')) {
      const [a, b] = alan.split('.');
      if (!m[a]) m[a] = {};
      if (deger === '' && (a === 'malzeme' || a === 'hirdavat')) delete m[a][b];
      else m[a][b] = deger;
    } else {
      m[alan] = deger;
    }
    if (alan === 'adet' && !tr) m.adet = Math.max(1, Number(m.adet) || 1);
    tumunuCiz(true);
  });

  $('#modulForm').addEventListener('click', (e) => {
    const m = seciliModul();
    const islem = e.target.dataset.islem;
    if (!m || !islem) return;
    const tr = e.target.closest('tr[data-satir]');
    const i = tr ? Number(tr.dataset.satir) : -1;
    const S = m.satirlar;
    if (islem === 'satirEkle') {
      const tip = e.target.dataset.tip;
      S.push({ tip, yukseklik: tip === 'cekmece' ? 180 : null, adet: tip === 'kapak' ? 2 : 1, raf: tip === 'cekmece' ? 0 : 1, dikme: 0, aski: false });
    } else if (islem === 'sil') S.splice(i, 1);
    else if (islem === 'yukari' && i > 0) [S[i - 1], S[i]] = [S[i], S[i - 1]];
    else if (islem === 'asagi' && i < S.length - 1) [S[i + 1], S[i]] = [S[i], S[i + 1]];
    else return;
    tumunuCiz(true);
  });

  // ---------------- Hesap & çizim ----------------
  function uyarilariCiz() {
    const u = sonuc.uyarilar;
    $('#uyarilar').innerHTML = u.length ? `<details ${u.length <= 4 ? 'open' : ''}><summary>⚠ ${u.length} uyarı</summary><ul>${u.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></details>` : '';
  }

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
    const yer = sonuc.yerlesim;
    $('#cizimPlan').innerHTML = Cizim.planCizimi(yer);
    $('#cizimDuvarA').innerHTML = Cizim.duvarGorunus(yer, 'A');
    $('#duvarBKap').hidden = Y.tip !== 'L';
    if (Y.tip === 'L') $('#cizimDuvarB').innerHTML = Cizim.duvarGorunus(yer, 'B');
  }
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
    const kolon = yazdir ? 9 : 10;
    let html = `<table class="liste kesim"><thead><tr>${yazdir ? '<th class="kutu-sutun">✓</th>' : ''}<th>No</th><th>Parça</th><th>Adet</th>${yazdir ? '' : '<th>Net boy</th><th>Net en</th>'}<th>Kesim boy</th><th>Kesim en</th><th>Bant</th><th>Damar</th><th>Modül</th></tr></thead><tbody>`;
    for (const p of L) {
      const malz = malzeme(p.malzeme);
      if (p.malzeme !== onceki) {
        onceki = p.malzeme;
        const toplam = L.filter((x) => x.malzeme === p.malzeme).reduce((a, x) => a + x.adet, 0);
        html += `<tr class="grup"><td colspan="${kolon}">${esc(malz.ad)} · ${sayiYaz(malz.kalinlik)} mm · plaka ${malz.plakaUzun}×${malz.plakaKisa} · ${toplam} parça${malz.bant > 0 ? ` · bant ${sayiYaz(malz.bant)} mm` : ' · bantsız'}</td></tr>`;
      }
      html += `<tr>${yazdir ? '<td class="kutu-sutun"><span class="isaret"></span></td>' : ''}<td>${p.no}</td><td>${esc(p.ad)}</td><td class="sag kalin">${p.adet}</td>
        ${yazdir ? '' : `<td class="sag">${sayiYaz(p.boy)}</td><td class="sag">${sayiYaz(p.en)}</td>`}
        <td class="sag kalin">${sayiYaz(p.kesimBoy)}</td><td class="sag kalin">${sayiYaz(p.kesimEn)}</td>
        <td class="bant-hucre">${Cizim.bantSimgesi(p.bant, 30)}<span>${bantYazi(p.bant)}</span></td><td>${p.damar ? 'Var' : '—'}</td><td class="kucuk">${esc(p.moduller.join(', '))}</td></tr>`;
    }
    return html + '</tbody></table>';
  }

  function kesimTablosuCiz() {
    $('#kesimTablo').innerHTML = kesimTablosuHtml(false);
  }

  function plakaHtml() {
    const y = Yerlesim.projeYerlesimi(sonuc.kesimListesi, proje.ayarlar);
    if (!y.length) return '<p class="bos">Parça yok.</p>';
    let html = `<p class="not">Giyotin kesim planı · testere payı ${proje.ayarlar.testereKalinligi} mm · plaka kenar payı ${proje.ayarlar.plakaKenarPayi} mm. Damarlı malzemede parçalar döndürülmez.</p>`;
    for (const g of y) {
      const ort = g.plakalar.length ? g.plakalar.reduce((a, p) => a + p.doluluk, 0) / g.plakalar.length : 0;
      html += `<section class="plaka-grup"><h3>${esc(g.malzemeAd)} — ${g.plakalar.length} plaka (${g.plaka.uzun}×${g.plaka.kisa}) · ortalama doluluk %${sayiYaz(ort * 100, 0)}</h3>`;
      if (g.sigmayan.length) html += `<p class="hata">Plakaya sığmayan parçalar: ${g.sigmayan.map((p) => `#${p.no} ${esc(p.ad)} (${p.w}×${p.h})`).join(', ')}</p>`;
      g.plakalar.forEach((p, i) => {
        html += `<figure class="plaka-kart"><figcaption>${esc(g.malzemeAd)} · Plaka ${i + 1}/${g.plakalar.length} · ${p.yerlesen.length} parça · doluluk %${sayiYaz(p.doluluk * 100, 0)}</figcaption>${Cizim.plakaCizimi(p, g.plaka, RENKLER)}</figure>`;
      });
      html += '</section>';
    }
    return html;
  }

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

  function hirdavatCiz() {
    $('#hirdavatTablo').innerHTML = hirdavatHtml();
    $('#ozetTablo').innerHTML = ozetHtml();
  }

  // ---------------- Ayarlar ----------------
  const AYAR_ALANLARI = [
    ['testereKalinligi', 'Testere payı (mm)'],
    ['plakaKenarPayi', 'Plaka kenar payı (mm)'],
    ['kapakBoslugu', 'Kapaklar arası boşluk (mm)'],
    ['disBosluk', 'Kapak dış kenar boşluğu (mm)'],
    ['cekmeceUstBosluk', 'Çekmece önü − kutu yük. farkı (mm)'],
    ['arkalikKanalDerinligi', 'Arkalık kanal derinliği (mm)'],
    ['arkalikGeriPay', 'Kanalın arkaya mesafesi (mm)'],
    ['arkalikCakmaPay', 'Çakma arkalık kenar payı (mm)'],
    ['rafOnGeriCekme', 'Raf önden geri çekme (mm)'],
    ['rafYanBosluk', 'Raf yan boşluğu (mm)'],
    ['kusakGenisligi', 'Kuşak eni (mm)'],
  ];

  function ayarFormCiz() {
    const A = proje.ayarlar;
    const malzSecenek = A.malzemeler.map((x) => [x.id, x.ad]);
    const kullanilanlar = new Set([...Object.values(A.kullanim), ...proje.moduller.flatMap((m) => Object.values(m.malzeme || {}))]);
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
        <thead><tr><th>Malzeme adı</th><th>Tür</th><th>Kalınlık</th><th>Plaka uzun</th><th>Plaka kısa</th><th title="0 = bantsız (örn. boyalı lake kenar)">Bant</th><th>Damar</th><th></th></tr></thead>
        <tbody>${A.malzemeler.map((m) => `<tr data-malz="${m.id}">
            <td><input data-alan="ad" value="${esc(m.ad)}"></td>
            <td>${secim('tur', m.tur || 'Diğer', Hesap.MALZEME_TURLERI.map((t) => [t, t]))}</td>
            <td><input data-alan="kalinlik" type="number" step="0.5" min="1" value="${m.kalinlik}"></td>
            <td><input data-alan="plakaUzun" type="number" min="100" value="${m.plakaUzun}"></td>
            <td><input data-alan="plakaKisa" type="number" min="100" value="${m.plakaKisa}"></td>
            <td><input data-alan="bant" type="number" step="0.1" min="0" value="${m.bant}"></td>
            <td><input data-alan="damar" type="checkbox" ${m.damar ? 'checked' : ''}></td>
            <td><button data-islem="malzSil" class="ikincil kucuk-buton" ${kullanilanlar.has(m.id) ? 'disabled title="Kullanımda"' : 'title="Sil"'}>✕</button></td></tr>`).join('')}</tbody>
      </table>
      </div>
      <button data-islem="malzEkle" class="ikincil">+ Malzeme ekle</button>
      <p class="not">Bant kalınlığı 0 olan malzeme bantsız kabul edilir (örn. kenarı boyanan lake). Damar işaretli malzemede parçanın "boy" ölçüsü plakanın uzun kenarına paralel yerleştirilir.</p>

      <h3>Üretim payları</h3>
      <div class="form-izgara">
        ${AYAR_ALANLARI.map(([k, t]) => `<label>${t}<input data-ayar="${k}" type="number" step="0.5" min="0" value="${A[k]}"></label>`).join('')}
        <label class="onay"><input data-ayar="bantDus" type="checkbox" ${A.bantDus ? 'checked' : ''}> Bant kalınlığını kesim ölçüsünden düş</label>
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

  // ---------------- Sekmeler ----------------
  let aktifSekme = 'cizim';
  document.querySelector('.sekmeler').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-sekme]');
    if (!b) return;
    aktifSekme = b.dataset.sekme;
    document.querySelectorAll('.sekmeler button').forEach((x) => x.classList.toggle('aktif', x === b));
    document.querySelectorAll('.sekme').forEach((x) => x.classList.toggle('aktif', x.id === 'sekme-' + aktifSekme));
    if (aktifSekme === 'plaka') plakaCiz();
    if (aktifSekme === 'yerlesim') yerlesimCiz();
  });

  // ---------------- Yazdırma (PDF) ----------------
  const bugun = () => new Date().toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' });

  function baslikHtml(altBaslik) {
    return `<header class="y-baslik"><div><h1>${esc(proje.ad || 'Proje')}</h1><p>${esc(altBaslik)}</p></div><div class="y-tarih">${bugun()}<br>${proje.moduller.length} modül · ${sonuc.kesimListesi.reduce((a, p) => a + p.adet, 0)} parça</div></header>`;
  }

  function plakaSayilari() {
    const s = {};
    for (const g of Yerlesim.projeYerlesimi(sonuc.kesimListesi, proje.ayarlar)) s[g.malzemeId] = g.plakalar.length;
    return s;
  }

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
          <div class="e-ad">${esc(p.ad)}</div>
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
    for (const m of proje.moduller) {
      const geo = sonuc.modulSonuclari[m.id].geo;
      if (!geo) continue;
      html += `<div class="y-modul"><div class="y-on">${Cizim.onGorunus(m, geo, {})}</div><div class="y-yan">${Cizim.yanKesit(m, geo)}</div></div>`;
    }
    html += '</section>';
    const yer = sonuc.yerlesim;
    html += `<section class="y-sayfa">${baslikHtml('Yerleşim')}<h2>Kuşbakışı plan</h2>${Cizim.planCizimi(yer)}<h2>A duvarı</h2>${Cizim.duvarGorunus(yer, 'A')}${yer.tip === 'L' ? `<h2>B duvarı</h2>${Cizim.duvarGorunus(yer, 'B')}` : ''}</section>`;
    html += kesimYazdirHtml();
    html += `<section class="y-sayfa">${baslikHtml('Hırdavat listesi')}${hirdavatHtml()}</section>`;
    html += `<section class="y-sayfa">${baslikHtml('Plaka kesim planları')}${plakaHtml()}</section>`;
    return html;
  }

  function yazdir(tur) {
    const alan = $('#yazdirAlan');
    alan.className = 'yazdir-' + tur;
    alan.innerHTML = tur === 'etiket' ? etiketYazdirHtml() : tur === 'kesim' ? kesimYazdirHtml() : tumYazdirHtml();
    const eskiBaslik = document.title;
    document.title = `${proje.ad || 'Proje'} - ${tur === 'etiket' ? 'Parça etiketleri' : tur === 'kesim' ? 'Kesim listesi' : 'Proje'}`;
    window.print();
    document.title = eskiBaslik;
  }
  $('#btnYazdirKesim').addEventListener('click', () => yazdir('kesim'));
  $('#btnYazdirEtiket').addEventListener('click', () => yazdir('etiket'));
  $('#btnYazdirTumu').addEventListener('click', () => yazdir('tumu'));
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
    const satirlar = [['No', 'Malzeme', 'Kalınlık', 'Parça', 'Adet', 'Net boy', 'Net en', 'Kesim boy', 'Kesim en', 'Bant uzun kenar', 'Bant kısa kenar', 'Damar', 'Modüller']];
    for (const p of sonuc.kesimListesi) {
      const m = malzeme(p.malzeme);
      satirlar.push([p.no, m.ad, sayi(m.kalinlik), p.ad, p.adet, sayi(p.boy), sayi(p.en), sayi(p.kesimBoy), sayi(p.kesimEn), p.bant.u, p.bant.k, p.damar ? 'Var' : 'Yok', p.moduller.join(', ')]);
    }
    const csv = satirlar.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\r\n');
    indir(`${dosyaAdi()} - kesim listesi.csv`, '﻿' + csv, 'text/csv;charset=utf-8');
  });

  $('#btnKaydet').addEventListener('click', () => indir(`${dosyaAdi()}.json`, JSON.stringify(proje, null, 2), 'application/json'));

  $('#dosyaAc').addEventListener('change', async (e) => {
    const dosya = e.target.files[0];
    e.target.value = '';
    if (!dosya) return;
    try {
      const p = JSON.parse(await dosya.text());
      if (!p || !Array.isArray(p.moduller)) throw new Error('biçim');
      proje = Hesap.projeyiGuncelle(p);
      seciliId = proje.moduller[0] ? proje.moduller[0].id : null;
      $('#projeAd').value = proje.ad || '';
      tumunuCiz(true);
      ayarFormCiz();
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
  });

  $('#projeAd').addEventListener('input', (e) => { proje.ad = e.target.value; kaydet(); });

  // ---------------- Ana döngü ----------------
  function tumunuCiz(formDa) {
    sonuc = Hesap.projeHesapla(proje);
    modulListesiCiz();
    if (formDa) modulFormCiz();
    uyarilariCiz();
    cizimleriCiz();
    kesimTablosuCiz();
    hirdavatCiz();
    if (aktifSekme === 'plaka') plakaCiz();
    if (aktifSekme === 'yerlesim') yerlesimCiz();
    kaydet();
  }

  proje = yukle();
  seciliId = proje.moduller[0] ? proje.moduller[0].id : null;
  $('#projeAd').value = proje.ad;
  ayarFormCiz();
  tumunuCiz(true);
})();

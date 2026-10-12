/* Arayüz: proje durumu, formlar, sekmeler ve dışa aktarma. */
(function () {
  'use strict';

  const KAYIT_ANAHTARI = 'mobilya-olcu-proje-v1';
  const RENKLER = ['#f6d7a7', '#c8e0f4', '#d4ecd0', '#f3c9d4', '#e3d4f2', '#fbe7a1', '#cfe9ec', '#f2d2bd', '#dfe4c3', '#e9d0e9'];
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const sayiYaz = (x, b = 1) => Number(x).toLocaleString('tr-TR', { maximumFractionDigits: b });

  const MALZ_AD = { govde: 'Gövde', kapak: 'Kapak / ön', cekmece: 'Çekmece kutusu', arkalik: 'Arkalık / taban' };
  const TIP_AD = { kapak: 'Kapak', cekmece: 'Çekmece', acik: 'Açık raf' };

  let proje;
  let seciliId = null;
  let sonuc = null;

  function yeniProje() {
    const m = Hesap.yeniModul('alt');
    return { ad: 'Yeni proje', ayarlar: Hesap.varsayilanAyarlar(), moduller: [m] };
  }

  function yukle() {
    try {
      const v = localStorage.getItem(KAYIT_ANAHTARI);
      if (v) {
        const p = JSON.parse(v);
        if (p && Array.isArray(p.moduller) && p.ayarlar) return ayarTamamla(p);
      }
    } catch (e) { /* bozuk kayıt: yeni proje */ }
    return yeniProje();
  }

  // Eski kayıtlarda bulunmayan yeni ayarları varsayılanlarla doldur.
  function ayarTamamla(p) {
    const v = Hesap.varsayilanAyarlar();
    p.ayarlar = Object.assign({}, v, p.ayarlar);
    p.ayarlar.malzemeler = Object.assign({}, v.malzemeler, p.ayarlar.malzemeler);
    for (const k of Object.keys(v.malzemeler)) p.ayarlar.malzemeler[k] = Object.assign({}, v.malzemeler[k], p.ayarlar.malzemeler[k]);
    return p;
  }

  function kaydet() {
    try { localStorage.setItem(KAYIT_ANAHTARI, JSON.stringify(proje)); } catch (e) { /* depolama kapalı olabilir */ }
  }

  const seciliModul = () => proje.moduller.find((m) => m.id === seciliId);

  // ---------------- Modül listesi ----------------
  function modulListesiCiz() {
    const ul = $('#modulListesi');
    ul.innerHTML = proje.moduller.map((m) => `
      <li class="${m.id === seciliId ? 'secili' : ''}" data-id="${m.id}">
        <span class="m-ad">${esc(m.ad)}</span>
        <span class="m-olcu">G${m.genislik} × Y${m.yukseklik} × D${m.derinlik}${m.adet > 1 ? ` · ${m.adet} ad.` : ''}</span>
        <span class="m-arac">
          <button data-islem="kopya" title="Çoğalt">⧉</button>
          <button data-islem="sil" title="Sil">✕</button>
        </span>
      </li>`).join('') || '<li class="bos">Modül yok. Aşağıdan ekleyin.</li>';
  }

  $('#modulListesi').addEventListener('click', (e) => {
    const li = e.target.closest('li[data-id]');
    if (!li) return;
    const id = li.dataset.id;
    const islem = e.target.dataset.islem;
    if (islem === 'sil') {
      const m = proje.moduller.find((x) => x.id === id);
      if (!confirm(`"${m.ad}" silinsin mi?`)) return;
      proje.moduller = proje.moduller.filter((x) => x.id !== id);
      if (seciliId === id) seciliId = proje.moduller[0] ? proje.moduller[0].id : null;
    } else if (islem === 'kopya') {
      const m = proje.moduller.find((x) => x.id === id);
      const k = JSON.parse(JSON.stringify(m));
      k.id = Hesap.yeniModul('alt').id;
      k.ad = m.ad + ' (kopya)';
      proje.moduller.splice(proje.moduller.indexOf(m) + 1, 0, k);
      seciliId = k.id;
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
  const secim = (ad, deger, secenekler) =>
    `<select data-alan="${ad}">${secenekler.map(([v, t]) => `<option value="${v}"${String(v) === String(deger) ? ' selected' : ''}>${t}</option>`).join('')}</select>`;

  function modulFormCiz() {
    const m = seciliModul();
    const kap = $('#modulForm');
    if (!m) { kap.innerHTML = '<p class="bos">Bir modül seçin.</p>'; return; }
    kap.innerHTML = `
      <h2>Modül ölçüleri</h2>
      <div class="form-izgara">
        <label class="genis">Ad<input data-alan="ad" value="${esc(m.ad)}"></label>
        <label>Genişlik (mm)<input data-alan="genislik" type="number" min="100" value="${m.genislik}"></label>
        <label>Yükseklik (mm)<input data-alan="yukseklik" type="number" min="100" value="${m.yukseklik}" title="Zeminden en üste, baza/ayak dahil"></label>
        <label>Derinlik (mm)<input data-alan="derinlik" type="number" min="100" value="${m.derinlik}" title="Gövde derinliği, kapak hariç"></label>
        <label>Adet<input data-alan="adet" type="number" min="1" value="${m.adet}"></label>
        <label title="Duvara asılan dolaplar için zeminden dolabın altına mesafe. 0 = zemine oturur.">Montaj yük. (mm)<input data-alan="montajYuksekligi" type="number" min="0" value="${m.montajYuksekligi || 0}"></label>
      </div>
      <h3>Yapı</h3>
      <div class="form-izgara">
        <label>Birleşim${secim('yapi', m.yapi, [['yanlar_boydan', 'Yanlar boydan'], ['tabla_boydan', 'Tablalar boydan']])}</label>
        <label>Üst${secim('ust', m.ust, [['tam', 'Tam üst tabla'], ['kusak', 'Kuşak (tezgah altı)']])}</label>
        <label>Arkalık${secim('arkalik', m.arkalik, [['kanal', 'Kanala geçme'], ['cakma', 'Arkaya çakma'], ['yok', 'Arkalık yok']])}</label>
        <label>Kapak tipi${secim('kapakTipi', m.kapakTipi, [['tam', 'Tam bini (bindirme)'], ['ic', 'Gömme (iç bini)']])}</label>
        <label>Baza${secim('baza.tip', m.baza.tip, [['yok', 'Yok'], ['ayak', 'Ayarlı ayak'], ['panel', 'Baza çerçevesi']])}</label>
        <label>Baza yük. (mm)<input data-alan="baza.yukseklik" type="number" min="0" value="${m.baza.yukseklik}" ${m.baza.tip === 'yok' ? 'disabled' : ''}></label>
        <label>Baza geri çekme<input data-alan="baza.geriCekme" type="number" min="0" value="${m.baza.geriCekme}" ${m.baza.tip !== 'panel' ? 'disabled' : ''}></label>
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
      m[a][b] = deger;
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
  function hesapla() {
    sonuc = Hesap.projeHesapla(proje);
  }

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
    $('#cizimProje').innerHTML = Cizim.projeGorunus(proje.moduller, sonuc.modulSonuclari);
  }
  $('#icGorunus').addEventListener('change', cizimleriCiz);

  const bantGoster = (b) => {
    const p = [];
    if (b.u) p.push(`${b.u} uzun`);
    if (b.k) p.push(`${b.k} kısa`);
    return p.length ? p.join(' + ') : '—';
  };

  function kesimTablosuCiz() {
    const L = sonuc.kesimListesi;
    if (!L.length) { $('#kesimTablo').innerHTML = '<p class="bos">Parça yok.</p>'; return; }
    let onceki = null;
    let html = '<table class="liste"><thead><tr><th>No</th><th>Parça</th><th>Adet</th><th>Net boy</th><th>Net en</th><th>Kesim boy</th><th>Kesim en</th><th>Bant</th><th>Damar</th><th>Modül</th></tr></thead><tbody>';
    for (const p of L) {
      const malz = proje.ayarlar.malzemeler[p.malzeme];
      if (malz.ad + p.malzeme !== onceki) {
        onceki = malz.ad + p.malzeme;
        html += `<tr class="grup"><td colspan="10">${esc(MALZ_AD[p.malzeme])} — ${esc(malz.ad)} (${malz.kalinlik} mm)</td></tr>`;
      }
      html += `<tr><td>${p.no}</td><td>${esc(p.ad)}</td><td class="sag">${p.adet}</td>
        <td class="sag">${sayiYaz(p.boy)}</td><td class="sag">${sayiYaz(p.en)}</td>
        <td class="sag kalin">${sayiYaz(p.kesimBoy)}</td><td class="sag kalin">${sayiYaz(p.kesimEn)}</td>
        <td>${bantGoster(p.bant)}</td><td>${p.damar ? 'Var' : '—'}</td><td class="kucuk">${esc(p.moduller.join(', '))}</td></tr>`;
    }
    html += '</tbody></table>';
    $('#kesimTablo').innerHTML = html;
  }

  function plakaCiz() {
    const y = Yerlesim.projeYerlesimi(sonuc.kesimListesi, proje.ayarlar);
    if (!y.length) { $('#plakaAlan').innerHTML = '<p class="bos">Parça yok.</p>'; return; }
    let html = `<p class="not">Giyotin kesim planı · testere payı ${proje.ayarlar.testereKalinligi} mm · plaka kenar payı ${proje.ayarlar.plakaKenarPayi} mm. Damarlı malzemede parçalar döndürülmez.</p>`;
    for (const g of y) {
      const ort = g.plakalar.length ? g.plakalar.reduce((a, p) => a + p.doluluk, 0) / g.plakalar.length : 0;
      html += `<section class="plaka-grup"><h3>${esc(g.malzemeAd)} — ${g.plakalar.length} plaka (${g.plaka.uzun}×${g.plaka.kisa}) · ortalama doluluk %${sayiYaz(ort * 100, 0)}</h3>`;
      if (g.sigmayan.length) html += `<p class="hata">Plakaya sığmayan parçalar: ${g.sigmayan.map((p) => `#${p.no} ${esc(p.ad)} (${p.w}×${p.h})`).join(', ')}</p>`;
      g.plakalar.forEach((p, i) => {
        html += `<figure class="plaka-kart"><figcaption>Plaka ${i + 1} · ${p.yerlesen.length} parça · doluluk %${sayiYaz(p.doluluk * 100, 0)}</figcaption>${Cizim.plakaCizimi(p, g.plaka, RENKLER)}</figure>`;
      });
      html += '</section>';
    }
    $('#plakaAlan').innerHTML = html;
  }

  function hirdavatCiz() {
    const H = sonuc.hirdavat;
    $('#hirdavatTablo').innerHTML = H.length
      ? `<table class="liste"><thead><tr><th>Malzeme</th><th>Miktar</th></tr></thead><tbody>${H.map((h) => `<tr><td>${esc(h.ad)}</td><td class="sag">${h.adet} ${h.birim}</td></tr>`).join('')}</tbody></table>`
      : '<p class="bos">—</p>';
    const O = sonuc.ozet;
    $('#ozetTablo').innerHTML = O.length
      ? `<table class="liste"><thead><tr><th>Malzeme</th><th>Parça</th><th>Net alan</th><th>Kenar bandı</th></tr></thead><tbody>${O.map((o) => `<tr><td>${esc(o.malzeme)}</td><td class="sag">${o.parcaAdedi}</td><td class="sag">${sayiYaz(o.alanM2, 2)} m²</td><td class="sag">${o.bantM ? `${sayiYaz(o.bantM, 1)} m <span class="kucuk">(+%10 fire: ${sayiYaz(o.bantM * 1.1, 1)} m, ${o.bantKalinlik} mm)</span>` : '—'}</td></tr>`).join('')}</tbody></table>`
      : '';
  }

  // ---------------- Ayarlar ----------------
  const AYAR_ALANLARI = [
    ['testereKalinligi', 'Testere payı (mm)'],
    ['plakaKenarPayi', 'Plaka kenar payı (mm)'],
    ['kapakBoslugu', 'Kapaklar arası boşluk (mm)'],
    ['disBosluk', 'Kapak dış kenar boşluğu (mm)'],
    ['rayBoslugu', 'Ray boşluğu, her yan (mm)'],
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
    $('#ayarForm').innerHTML = `
      <h3>Malzemeler</h3>
      <table class="liste ayar-tablo">
        <thead><tr><th>Kullanım</th><th>Malzeme adı</th><th>Kalınlık</th><th>Plaka uzun</th><th>Plaka kısa</th><th>Bant kalınlığı</th><th>Damar yönü</th></tr></thead>
        <tbody>${Object.keys(MALZ_AD).map((k) => {
          const m = A.malzemeler[k];
          return `<tr data-malz="${k}"><td>${MALZ_AD[k]}</td>
            <td><input data-alan="ad" value="${esc(m.ad)}"></td>
            <td><input data-alan="kalinlik" type="number" step="0.5" min="1" value="${m.kalinlik}"></td>
            <td><input data-alan="plakaUzun" type="number" min="100" value="${m.plakaUzun}"></td>
            <td><input data-alan="plakaKisa" type="number" min="100" value="${m.plakaKisa}"></td>
            <td><input data-alan="bant" type="number" step="0.1" min="0" value="${m.bant}"></td>
            <td><input data-alan="damar" type="checkbox" ${m.damar ? 'checked' : ''}></td></tr>`;
        }).join('')}</tbody>
      </table>
      <p class="not">Aynı ada sahip malzemeler plaka yerleşiminde birlikte değerlendirilir. Damar yönü işaretli malzemede parçanın "boy" ölçüsü plakanın uzun kenarına paralel yerleştirilir.</p>
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
    if (tr) A.malzemeler[tr.dataset.malz][el.dataset.alan] = deger;
    else if (el.dataset.ayar) A[el.dataset.ayar] = deger;
    else return;
    tumunuCiz(false);
  });
  $('#ayarForm').addEventListener('click', (e) => {
    if (e.target.id !== 'btnAyarSifirla') return;
    if (!confirm('Tüm malzeme ve pay ayarları varsayılana dönsün mü?')) return;
    proje.ayarlar = Hesap.varsayilanAyarlar();
    tumunuCiz(false);
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
  });

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
      const m = proje.ayarlar.malzemeler[p.malzeme];
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
      if (!p || !Array.isArray(p.moduller) || !p.ayarlar) throw new Error('biçim');
      proje = ayarTamamla(p);
      seciliId = proje.moduller[0] ? proje.moduller[0].id : null;
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
    tumunuCiz(true);
    ayarFormCiz();
  });

  $('#btnYazdir').addEventListener('click', () => {
    plakaCiz();
    window.print();
  });

  $('#projeAd').addEventListener('input', (e) => { proje.ad = e.target.value; kaydet(); });

  // ---------------- Ana döngü ----------------
  function tumunuCiz(formDa) {
    hesapla();
    modulListesiCiz();
    if (formDa) modulFormCiz();
    uyarilariCiz();
    cizimleriCiz();
    kesimTablosuCiz();
    hirdavatCiz();
    if (aktifSekme === 'plaka') plakaCiz();
    kaydet();
  }

  proje = yukle();
  seciliId = proje.moduller[0] ? proje.moduller[0].id : null;
  $('#projeAd').value = proje.ad;
  ayarFormCiz();
  tumunuCiz(true);
})();

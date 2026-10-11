// Modül 5: Resmi kurum yazışma şablonları. Önizleme düzenlenebilir; çıktı PDF (yazdır)
// veya Word (.doc) olarak alınır ve arşive kaydedilir.
import * as db from './db.js';
import { esc, fmtDate, today, toast, nowLocal } from './util.js';
import { kurumBaslik, imzaBlok, evrakYazdir, wordIndir } from './reports.js';

const v = (x, ph = '……') => x ? esc(x) : ph;

const SABLONLAR = {
  maski: {
    ad: 'MASKİ Hat Deplase Talebi',
    muhatap: ['MALATYA SU VE KANALİZASYON İDARESİ GENEL MÜDÜRLÜĞÜNE (MASKİ)'],
    konu: 'Altyapı hattı deplase talebi',
    kapanis: 'Bilgilerinizi ve gereğini rica ederim.',
    alanlar: [
      ['yol', 'Yol / Güzergah'], ['mahalle', 'Mahalle'], ['km', 'Km aralığı (örn. 0+450 – 0+780)'],
      ['is', 'Yürütülen çalışma', 'Yol genişletme ve stabilizasyon kaplama'],
      ['hat_turu', 'Hat türü (… hattı)', 'içme suyu isale'], ['cap', 'Boru çapı / cinsi'], ['derinlik', 'Gömülme derinliği'],
      ['sorun', 'Tespit edilen durum', 'yeni yol kotunun altında kalarak yetersiz örtü derinliğine sahip olduğu ve yol platformu içinde kaldığı'],
      ['termin', 'Talep edilen termin', ''], ['koordinat', 'Koordinat / konum tarifi'],
    ],
    govde: x => `<p>İlçemiz ${v(x.mahalle)} Mahallesi, ${v(x.yol)} güzergahında Başkanlığımızca ${v(x.is)} çalışmaları yürütülmektedir.</p>
      <p>Yapılan saha incelemesinde, söz konusu güzergahın ${v(x.km)} kilometreleri arasında İdarenize ait ${v(x.hat_turu)} hattının ${v(x.sorun)} tespit edilmiştir.</p>
      <p>Yol çalışmalarının hatta zarar vermeden sürdürülebilmesi ve can/mal güvenliğinin sağlanması için ilgili hattın deplase edilmesi gerekmektedir.
      Hattın ${x.termin ? fmtDate(x.termin) + ' tarihine kadar' : 'en kısa sürede'} deplase edilmesi ve çalışmaların koordinasyonu için İdarenizden yetkili bir personelin görevlendirilmesi hususunda,</p>`,
    ek: x => `<h4>TEKNİK RAPOR</h4><table class="doc-table">
      <tr><th>Yol / Güzergah</th><td>${v(x.yol)}</td></tr><tr><th>Mahalle</th><td>${v(x.mahalle)}</td></tr>
      <tr><th>Km aralığı</th><td>${v(x.km)}</td></tr><tr><th>Hat türü</th><td>${v(x.hat_turu)} hattı</td></tr>
      <tr><th>Çap / cins</th><td>${v(x.cap)}</td></tr><tr><th>Derinlik</th><td>${v(x.derinlik)}</td></tr>
      <tr><th>Konum</th><td>${v(x.koordinat)}</td></tr><tr><th>Yürütülen çalışma</th><td>${v(x.is)}</td></tr>
      <tr><th>Tespit</th><td>${v(x.sorun)}</td></tr><tr><th>Talep</th><td>Hat deplasesi</td></tr></table>`,
  },
  dingil: {
    ad: 'Dingil Yükü Denetimi Talebi',
    muhatap: ['ARAPGİR KAYMAKAMLIĞINA', 'ARAPGİR İLÇE JANDARMA KOMUTANLIĞINA'],
    konu: 'Aşırı tonajlı araçların denetimi',
    kapanis: 'Bilgilerinize ve gereğini arz ederim.',
    alanlar: [
      ['yol', 'Yol / Güzergah', 'Sinikli - Kılıçlı Grup Yolu'], ['yapim', 'Yapım / bakım tarihi', ''],
      ['tonaj', 'Tonaj sınırı (ton)'], ['donem', 'Gözlem dönemi', 'son iki hafta içinde'],
      ['plakalar', 'Tespit edilen plakalar'], ['hasar', 'Gözlenen hasar', 'oturma, tekerlek izi (tekerlek izi oluğu) ve kaplama bozulmaları'],
    ],
    govde: x => `<p>İlçemiz ${v(x.yol)} güzergahında Başkanlığımızca ${x.yapim ? fmtDate(x.yapim) + ' tarihinde' : ''} yapım/bakım çalışması gerçekleştirilmiş olup
      yolun taşıma kapasitesi dikkate alınarak azami tonaj sınırı ${v(x.tonaj)} ton olarak belirlenmiştir.</p>
      <p>Saha gözlemlerimizde, ${v(x.donem)} söz konusu güzergahı aşırı tonajlı kamyonların kullandığı${x.plakalar ? ` (tespit edilen plakalar: ${esc(x.plakalar)})` : ''}
      ve bu durumun yol sathında ${v(x.hasar)} meydana getirdiği tespit edilmiştir.</p>
      <p>Kamu kaynağıyla yapılan yolun korunması ve trafik güvenliğinin sağlanması amacıyla, 2918 sayılı Karayolları Trafik Kanunu ve ilgili mevzuat kapsamında
      söz konusu güzergahta dingil yükü / ağırlık denetimi yapılması hususunda,</p>`,
  },
  tutanak: {
    ad: 'Yol Hasar Tespit Tutanağı',
    muhatap: [''],
    konu: 'Yol hasar tespiti',
    tutanak: true,
    alanlar: [
      ['tarih_saat', 'Tespit tarihi / saati', '', 'datetime'], ['yol', 'Yer / Güzergah'], ['plaka', 'Araç plakası'], ['surucu', 'Sürücü'],
      ['tonaj', 'Tahmini yük (ton)'], ['hasar', 'Tespit edilen hasar'], ['tespit_edenler', 'Tespit edenler (her satıra bir kişi: Ad Soyad - Unvan)', '', 'textarea'],
    ],
    govde: x => `<p>${x.tarih_saat ? fmtDate(x.tarih_saat) : '……'} tarihinde ${v(x.yol)} mevkiinde yapılan kontrolde, ${v(x.plaka)} plakalı
      ${x.surucu ? esc(x.surucu) + ' idaresindeki ' : ''}aracın${x.tonaj ? ` yaklaşık ${esc(x.tonaj)} ton yük ile` : ''} güzergahı kullandığı ve yol sathında
      ${v(x.hasar)} meydana geldiği tespit edilmiştir.</p><p>İşbu tutanak mahallinde düzenlenerek aşağıda isimleri bulunanlarca imza altına alınmıştır.</p>
      <table class="doc-table sign-table">${(x.tespit_edenler || '\n\n').split('\n').map(s => `<tr><td>${esc(s) || '&nbsp;'}</td><td style="width:35%">İmza:</td></tr>`).join('')}</table>`,
  },
  ustyazi: {
    ad: 'Genel Üst Yazı',
    muhatap: ['ARAPGİR KAYMAKAMLIĞINA', 'YOL YAPIM BAKIM VE ONARIM DAİRESİ BAŞKANLIĞINA', 'ARAPGİR BELEDİYE BAŞKANLIĞINA', 'MAHALLE MUHTARLIĞINA'],
    konu: '',
    kapanis: 'Bilgilerinizi ve gereğini arz/rica ederim.',
    alanlar: [['metin', 'Metin', '', 'textarea']],
    govde: x => (x.metin || '……').split(/\n{2,}/).map(p => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join(''),
  },
};

function belge(s, x) {
  if (s.tutanak) {
    return `${kurumBaslik()}<h2 class="doc-title">${esc(s.ad.toLocaleUpperCase('tr-TR'))}</h2>${s.govde(x)}`;
  }
  return `${kurumBaslik()}
    <table class="doc-meta"><tr><td>Sayı : ${v(x.sayi, '')}</td><td class="doc-right">${fmtDate(x.tarih)}</td></tr>
    <tr><td colspan="2">Konu : ${v(x.konu, '')}</td></tr></table>
    <p class="doc-to">${v(x.muhatap)}</p>
    ${x.ilgi ? `<p>İlgi : ${esc(x.ilgi)}</p>` : ''}
    ${s.govde(x)}<p class="doc-close">${esc(x.kapanis || s.kapanis)}</p>
    ${imzaBlok()}
    ${s.ek ? `<p>Ek: Teknik Rapor (1 sayfa)</p><div class="page-break"></div>${s.ek(x)}` : ''}`;
}

export function evrakView(root) {
  root.innerHTML = `<div class="help">ℹ Şablonu seçin, alanları doldurun. Önizleme metni üzerinde doğrudan değişiklik yapabilirsiniz. Ayarlar'daki kurum ve imza bilgileri otomatik kullanılır.</div>
    <div class="evrak-layout">
      <div class="card"><form class="grid-form evrak-form" autocomplete="off"></form></div>
      <div class="card"><div class="toolbar">
        <button class="btn pdf">🖨 Yazdır / PDF</button><button class="btn word">⬇ Word</button><button class="btn primary save">Arşive Kaydet</button>
        <button class="btn reset">↺ Önizlemeyi yenile</button></div>
        <div class="doc preview" contenteditable="true" spellcheck="false"></div></div>
    </div>`;
  const form = root.querySelector('form');
  const preview = root.querySelector('.preview');
  let tip = 'maski', elle = false;

  function build() {
    const s = SABLONLAR[tip];
    const santiyeler = db.all('santiye').map(r => `<option value="${r.id}">${esc(r.proje_kodu + ' - ' + r.ad)}</option>`).join('');
    form.innerHTML = `
      <label class="wide"><span>Şablon</span><select name="tip">${Object.entries(SABLONLAR).map(([k, x]) => `<option value="${k}" ${k === tip ? 'selected' : ''}>${x.ad}</option>`).join('')}</select></label>
      <label class="wide"><span>Şantiyeden doldur</span><select name="santiye"><option value="">—</option>${santiyeler}</select></label>
      ${s.tutanak ? '' : `<label><span>Sayı</span><input name="sayi"></label><label><span>Tarih</span><input type="date" name="tarih" value="${today()}"></label>
      <label class="wide"><span>Muhatap</span><input name="muhatap" list="dl-muhatap" value="${esc(s.muhatap[0])}"><datalist id="dl-muhatap">${s.muhatap.map(m => `<option value="${esc(m)}">`).join('')}</datalist></label>
      <label class="wide"><span>Konu</span><input name="konu" value="${esc(s.konu)}"></label>
      <label class="wide"><span>İlgi (varsa)</span><input name="ilgi"></label>`}
      ${s.alanlar.map(([k, l, def = '', t]) => `<label class="${t === 'textarea' ? 'wide' : ''}"><span>${esc(l)}</span>${t === 'textarea' ? `<textarea name="${k}">${esc(def)}</textarea>`
        : `<input name="${k}" type="${t === 'datetime' ? 'datetime-local' : k === 'termin' || k === 'yapim' ? 'date' : 'text'}" value="${esc(t === 'datetime' ? nowLocal() : def)}">`}</label>`).join('')}
      ${s.tutanak ? '' : `<label class="wide"><span>Kapanış</span><input name="kapanis" value="${esc(s.kapanis)}"></label>`}`;
    elle = false;
    render();
  }

  const values = () => Object.fromEntries(new FormData(form));
  function render() {
    if (!elle) preview.innerHTML = belge(SABLONLAR[tip], values());
  }

  form.addEventListener('change', e => {
    if (e.target.name === 'tip') { tip = e.target.value; return build(); }
    if (e.target.name === 'santiye' && e.target.value) {
      const s = db.get('santiye', e.target.value);
      for (const [k, val] of [['yol', s.ad], ['mahalle', s.mahalle]]) if (form.elements[k] && val) form.elements[k].value = val;
      render();
    }
  });
  form.addEventListener('input', () => {
    if (elle && !confirm('Önizlemede elle değişiklik yaptınız. Formdan yeniden oluşturulsun mu? (elle değişiklikler silinir)')) return;
    elle = false; render();
  });
  preview.addEventListener('input', () => { elle = true; });
  root.querySelector('.reset').addEventListener('click', () => { elle = false; render(); });

  const html = () => preview.innerHTML;
  const ad = () => `${SABLONLAR[tip].ad}-${values().tarih || today()}`;
  root.querySelector('.pdf').addEventListener('click', () => evrakYazdir(html()));
  root.querySelector('.word').addEventListener('click', () => wordIndir(html(), ad()));
  root.querySelector('.save').addEventListener('click', async () => {
    const x = values();
    await db.put('evrak', { tarih: x.tarih || today(), sayi: x.sayi || '', tur: SABLONLAR[tip].ad, muhatap: x.muhatap || '',
      konu: x.konu || SABLONLAR[tip].konu, durum: 'Taslak', html: html() });
    toast('Evrak arşive kaydedildi', 'ok');
  });

  build();
  return { refresh() {} };
}


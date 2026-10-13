/*
 * Tutarlılık denetimi: rastgele ve hazır dolaplar üretip fiziksel kuralları kontrol eder.
 * Kullanım: node tools/denetim.js [deneme sayısı]
 * Her ihlal, onu üreten modülle birlikte raporlanır. Uyarı veren (kullanıcıya bildirilen)
 * durumlar ihlal sayılmaz; sessizce yanlış sonuç üreten durumlar ihlaldir.
 */
'use strict';
const H = require('../js/hesap.js');
const Y = require('../js/yerlesim.js');
const M = require('../js/maliyet.js');
const C = require('../js/cizim.js');
const D = require('../js/delik.js');
const K = require('../js/montaj.js');
const U = require('../js/uc.js');

let tohum = 12345;
const rnd = () => ((tohum = (tohum * 1103515245 + 12345) % 2147483648) / 2147483648);
const sec = (a) => a[Math.floor(rnd() * a.length)];
const ara = (a, b) => Math.round(a + rnd() * (b - a));
const E = 0.6; // ölçü toleransı (mm), 0,1 yuvarlamalar için

const ihlaller = new Map();
function ihlal(kural, modul, detay) {
  if (!ihlaller.has(kural)) ihlaller.set(kural, []);
  const L = ihlaller.get(kural);
  if (L.length < 3) L.push({ detay, modul: JSON.stringify(modul).slice(0, 400) });
  else L.push(null);
}

function rastgeleModul() {
  const m = H.yeniModul(sec(Object.keys(H.PRESETLER)));
  if (m.tip === 'panel' || m.tip === 'lkose') return m;
  m.genislik = ara(300, 2600);
  m.yukseklik = ara(400, 2600);
  m.derinlik = ara(250, 700);
  m.kapakTipi = sec(['tam', 'tam', 'ic']);
  m.arkalik = sec(['kanal', 'cakma', 'yok']);
  m.yapi = sec(['yanlar_boydan', 'tabla_boydan']);
  m.ust = sec(['tam', 'kusak']);
  m.onTipi = rnd() < 0.15 ? 'surgu' : 'normal';
  m.surguAdet = ara(2, 4);
  m.baza = sec([{ tip: 'yok', yukseklik: 0, geriCekme: 0 }, { tip: 'ayak', yukseklik: 100, geriCekme: 50 }, { tip: 'panel', yukseklik: 80, geriCekme: 40 }]);
  const ns = sec([1, 1, 1, 2, 3]);
  m.sutunlar = [];
  for (let i = 0; i < ns; i++) {
    const satirlar = [];
    for (let j = 0, n = ara(1, 4); j < n; j++) {
      const tip = sec(['kapak', 'kapak', 'cekmece', 'acik', 'nis']);
      satirlar.push(H.yeniSatir(tip));
      const s = satirlar[satirlar.length - 1];
      s.yukseklik = rnd() < 0.5 ? null : ara(100, 600);
      if (tip === 'kapak' || tip === 'cekmece') s.adet = ara(1, 3);
      if (tip === 'kapak') { s.kapakTuru = sec(Object.keys(H.KAPAK_TURLERI)); s.acilim = sec(['yana', 'yana', 'yukari', 'asagi']); }
      if (tip === 'kapak' || tip === 'acik') { s.raf = ara(0, 3); s.rafTipi = sec(['ahsap', 'cam']); s.dikme = rnd() < 0.2 ? 1 : 0; s.led = rnd() < 0.3; s.rafSabit = rnd() < 0.3; }
      if (tip === 'kapak') { s.icCekmece = rnd() < 0.3 ? ara(1, 3) : 0; s.icCekmeceH = rnd() < 0.5 ? ara(80, 250) : null; s.menteseYonu = sec(['oto', 'sol', 'sag']); }
      if (tip === 'cekmece' || tip === 'kapak') { s.kutuYukseklik = rnd() < 0.3 ? ara(40, 400) : null; s.rayBoyu = rnd() < 0.3 ? sec(H.RAY_BOYLARI) : null; s.cekmeceIc = sec(['yok', 'catal', 'bolucu']); }
    }
    m.sutunlar.push({ genislik: rnd() < 0.3 ? ara(200, 700) : null, satirlar });
  }
  m.korPanel = rnd() < 0.1 ? ara(300, 600) : 0;
  m.bazaCekmece = rnd() < 0.3;
  if (rnd() < 0.3) m.baza = { tip: sec(['ayak', 'panel']), yukseklik: ara(60, 160), geriCekme: ara(0, 60) };
  if (rnd() < 0.2) { m.egimli = true; m.sagYukseklik = ara(300, 2700); }
  m.kulpYon = sec(['proje', 'dikey', 'yatay']);
  m.kulpKonum = sec(['proje', 'oto', 'ust', 'orta', 'alt']);
  return m;
}

const W0 = (g) => g.W;

function denetle(m, A) {
  let s;
  try { s = H.modulHesapla(m, A); } catch (e) { ihlal('İstisna (çökme)', m, e.stack.split('\n').slice(0, 2).join(' ')); return; }
  const uyarili = s.uyarilar.length > 0;
  for (const p of s.parcalar) {
    if (!(p.boy > 0 && p.en > 0) || !Number.isFinite(p.boy + p.en)) ihlal('Geçersiz parça ölçüsü', m, `${p.ad} ${p.boy}×${p.en}`);
  }
  for (const h of s.hirdavat) if (!Number.isFinite(h.adet) || !Number.isFinite(h.fiyatMiktari)) ihlal('Geçersiz hırdavat miktarı', m, h.ad);
  // Çizim üretilebilmeli
  try {
    const svg = C.onGorunus(m, s.geo, {}) + C.onGorunus(m, s.geo, { ic: true }) + C.yanKesit(m, s.geo);
    if (/NaN|undefined/.test(svg)) ihlal('Çizimde NaN/undefined', m, '');
  } catch (e) { ihlal('Çizim istisnası', m, e.message); }
  const g = s.geo;
  // Delik planı, montaj kılavuzu ve 3B görünüm üretilebilmeli
  try {
    const d = D.delikPlani(m, s, A);
    for (const p of d.parcalar || []) for (const h of p.delikler) {
      if (!(h.x >= -E && h.x <= p.w + E && h.y >= -E && h.y <= p.h + E)) { ihlal('Delik parça dışında', m, `${p.ad} ${h.ad} ${h.x},${h.y} / ${p.w}×${p.h}`); break; }
    }
    const proje = H.projeyiNormallestir({ moduller: [m] });
    const k = JSON.stringify(K.kilavuz(m, s, proje, H.projeHesapla(proje)));
    if (/NaN|undefined/.test(k)) ihlal('Montaj kılavuzunda NaN/undefined', m, '');
    if (g) {
      const svg = U.ciz(U.modulParcalari(g, { kapaksiz: rnd() < 0.5 }), { yaw: ara(-180, 180), pitch: ara(-10, 80) }, {});
      if (/NaN|undefined/.test(svg)) ihlal('3B çizimde NaN/undefined', m, '');
    }
  } catch (e) { ihlal('Atölye/3B istisnası', m, e.stack.split('\n').slice(0, 2).join(' ')); }
  if (!g || g.panel || g.lkose) return;
  // Kulp delikleri ön yüzün içinde
  for (const sat of g.satirlar) for (const o of sat.onler) for (const h of (o.kulp && o.kulp.delikler) || []) {
    if (h.x < -E || h.x > o.x2 - o.x1 + E || h.y < -E || h.y > sat.on.h + E + (o.y2sol ? Math.max(o.y2sol, o.y2sag) - sat.on.y2 : 0)) ihlal('Kulp deliği ön yüz dışında', m, `${h.x},${h.y} / ${o.x2 - o.x1}×${sat.on.h}`);
  }
  // Eğimli üst satırın ön yüzleri eğimin altında kalmalı
  if (g.egim) {
    const HcX = (x) => g.egim.HcL + ((g.egim.HcR - g.egim.HcL) * x) / W0(g);
    for (const sat of g.satirlar) for (const o of sat.onler) {
      if (o.y2sol != null && (o.y2sol > HcX(o.x1) + E || o.y2sag > HcX(o.x2) + E)) ihlal('Eğimli ön yüz gövdeyi aşıyor', m, `${o.y2sol}/${o.y2sag}`);
    }
  }
  const { W, Hc, t, db } = g;
  const icDuzen = g.kapakTipi === 'ic' || !!g.surgu;
  // Ön yüzler gövdenin içinde/üstünde ve birbirleriyle çakışmamalı
  const onler = [];
  for (const sat of g.satirlar) for (const o of sat.onler) onler.push({ x1: o.x1, x2: o.x2, y1: sat.on.y1, y2: sat.on.y2, sat });
  for (const o of onler) {
    if (o.x2 - o.x1 <= 0 || o.y2 - o.y1 <= 0) { if (!uyarili) ihlal('Uyarısız negatif ön yüz', m, JSON.stringify(o).slice(0, 80)); continue; }
    if (o.x1 < -E || o.x2 > W + E || o.y1 < -E || o.y2 > Hc + E) ihlal('Ön yüz gövde dışına taşıyor', m, `${o.x1.toFixed(1)}..${o.x2.toFixed(1)} / ${o.y1.toFixed(1)}..${o.y2.toFixed(1)} (W ${W}, Hc ${Hc})`);
    if (icDuzen && (o.x1 < t - E || o.x2 > W - t + E || o.y1 < t - E || o.y2 > Hc - t + E)) ihlal('Gömme ön yüz gövde açıklığına sığmıyor', m, `${o.x1.toFixed(1)}..${o.x2.toFixed(1)}`);
  }
  for (let i = 0; i < onler.length; i++) for (let j = i + 1; j < onler.length; j++) {
    const a = onler[i], b = onler[j];
    const ust = Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1);
    const dik = Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1);
    if (ust > E && dik > E) ihlal('Ön yüzler çakışıyor', m, `${a.x1.toFixed(0)}-${a.x2.toFixed(0)} & ${b.x1.toFixed(0)}-${b.x2.toFixed(0)}`);
  }
  // Çekmece kutusu açıklığa sığmalı
  for (const sat of g.satirlar) {
    for (const c of sat.cekmeceler) {
      if (c.y2 > sat.icUst + E) ihlal('Çekmece kutusu iç yüksekliği aşıyor', m, `${c.y2} > ${sat.icUst}`);
      if (c.L > g.icDerinlik + E) ihlal('Çekmece boyu iç derinliği aşıyor', m, `${c.L} > ${g.icDerinlik}`);
    }
    if (sat.icH <= 0 && !uyarili) ihlal('Uyarısız negatif iç yükseklik', m, `${sat.icH}`);
  }
  // Yetim parça: çekmece önü olan her çekmecenin kutusu da olmalı
  const kutuSayisi = s.parcalar.filter((p) => p.ad.startsWith('Çekmece yanı') || p.ad.startsWith('Çekmece arkalığı')).reduce((a, p) => a + (p.ad.startsWith('Çekmece yanı') ? p.adet / 2 : p.adet), 0);
  const onSayisi = s.parcalar.filter((p) => p.ad.startsWith('Çekmece önü') || p.ad.startsWith('İç çekmece önü') || p.ad === 'Baza çekmecesi önü').reduce((a, p) => a + p.adet, 0);
  if (onSayisi > kutuSayisi) ihlal('Kutusu olmayan çekmece önü (yetim parça)', m, `${onSayisi} ön, ${kutuSayisi} kutu`);
  // İç çekmeceler satırın iç yüksekliğinde ve raflar üstlerinde
  for (const sat of g.satirlar) {
    for (const c of sat.icCekmeceler || []) if (c.y2 > sat.icUst + E || c.y1 < sat.icAlt - E) ihlal('İç çekmece satır dışında', m, `${c.y1}-${c.y2} / ${sat.icAlt}-${sat.icUst}`);
    const ust = Math.max(0, ...(sat.icCekmeceler || []).map((c) => c.y2));
    for (const ry of sat.raflar) if (ust && ry < ust) ihlal('Raf iç çekmecenin içinde', m, `${ry} < ${ust}`);
    for (const c of sat.cekmeceler) if (c.kutuH > sat.on.h + E && sat.tip === 'cekmece') ihlal('Kutu çekmece önünden yüksek', m, `${c.kutuH} > ${sat.on.h}`);
  }
  // Raflar bölme genişliğinden kısa
  for (const p of s.parcalar.filter((x) => /^(Raf|Cam raf|Sabit raf)/.test(x.ad))) {
    const maxW = Math.max(...g.sutunlar.map((c) => c.x2 - c.x1));
    if (p.boy > maxW + E) ihlal('Raf bölmeden uzun', m, `${p.boy} > ${maxW}`);
    if (p.en > g.icDerinlik + E) ihlal('Raf iç derinlikten derin', m, `${p.en} > ${g.icDerinlik}`);
  }
  // Sürgü kapaklar tüm önü kapatmalı
  if (g.surgu) {
    const k = g.surgu.kapaklar;
    if (Math.abs(k[k.length - 1].x2 - W) > E || Math.abs(k[0].x1) > E) ihlal('Sürgü kapaklar önü tam kapatmıyor', m, `${k[0].x1}..${k[k.length - 1].x2} / ${W}`);
  }
  // Arkalık kanala oturmalı
  const ark = s.parcalar.find((p) => p.ad === 'Arkalık (kanallı)');
  if (ark) {
    const kd = A.arkalikKanalDerinligi;
    if (ark.en > W - 2 * t + 2 * kd + E) ihlal('Arkalık kanaldan geniş', m, `${ark.en}`);
  }
  // Tam binide ön yüzlerin toplam genişliği + boşluklar bölmeyi doldurmalı (tek satırlık kontrol)
  for (const c of g.sutunlar) {
    for (const sat of c.satirlar) {
      if (!sat.onler.length) continue;
      const sol = Math.min(...sat.onler.map((o) => o.x1));
      const sag = Math.max(...sat.onler.map((o) => o.x2));
      if (Math.abs(sol - c.fx0) > E || Math.abs(sag - c.fx1) > E) ihlal('Ön yüzler bölme aralığını doldurmuyor', m, `${sol}-${sag} vs ${c.fx0}-${c.fx1}`);
    }
  }
}

const N = Number(process.argv[2]) || 3000;
const A = H.varsayilanAyarlar();
for (const k of Object.keys(H.PRESETLER)) denetle(H.yeniModul(k), A);
for (let i = 0; i < N; i++) denetle(rastgeleModul(), A);

// Proje düzeyi: maliyet ve yerleşim
for (let i = 0; i < 200; i++) {
  const moduller = [];
  for (let j = 0, n = ara(1, 6); j < n; j++) { const m = rastgeleModul(); m.adet = ara(1, 3); m.duvar = sec(['A', 'B']); moduller.push(m); }
  const engeller = [];
  for (let j = 0, n = ara(0, 4); j < n; j++) engeller.push({ tur: sec(Object.keys(H.ENGEL_TURLERI)), duvar: sec(['A', 'B']), x: ara(0, 4000), genislik: ara(50, 1500), y: ara(0, 2000), yukseklik: ara(50, 1500), derinlik: ara(0, 300) });
  const p = H.projeyiNormallestir({ moduller, yerlesim: { tip: sec(['duz', 'L']), duvarA: ara(1000, 5000), duvarB: ara(1000, 4000), tavan: sec([0, ara(2000, 2900)]), engeller } });
  const artiklar = [];
  for (let j = 0, n = ara(0, 3); j < n; j++) { const mz = sec(p.ayarlar.malzemeler); artiklar.push({ id: 'a' + j, malzemeAd: mz.ad, kalinlik: mz.kalinlik, boy: ara(250, 2800), en: ara(250, 2000), adet: ara(1, 3) }); }
  try {
    const s = H.projeHesapla(p);
    const ps = {};
    for (const g of Y.projeYerlesimi(s.kesimListesi, p.ayarlar, artiklar)) {
      ps[g.malzemeId] = g.tamPlaka;
      if (g.sigmayan.length === 0 && g.plakalar.reduce((a, pl) => a + pl.yerlesen.length, 0) !== s.kesimListesi.filter((x) => x.malzeme === g.malzemeId).reduce((a, x) => a + x.adet, 0)) ihlal('Yerleşimde parça kayboldu', {}, g.malzemeAd);
      for (const pl of g.plakalar) for (const y of pl.yerlesen) if (y.x + y.w > pl.uzun - 2 * pl.kenar + E || y.y + y.h > pl.kisa - 2 * pl.kenar + E) ihlal('Parça plakadan taşıyor', {}, `${pl.uzun}×${pl.kisa}`);
    }
    if (s.saha.uyarilar.some((u) => /NaN|undefined/.test(u))) ihlal('Saha uyarısında NaN', {}, '');
    if (!s.montajHirdavat.every((h) => Number.isFinite(h.adet))) ihlal('Montaj hırdavatı NaN', {}, '');
    U.ciz(U.projeParcalari(s.yerlesim, {}), { yaw: -35, pitch: 22 }, {});
    const r = M.maliyetHesapla(p, s, ps);
    if (Math.abs(r.dagitimFarki) > 0.05 * Math.max(1, s.kesimListesi.length)) ihlal('Maliyet modüllere tam dağıtılmıyor', { moduller: p.moduller.map((m) => m.ad) }, `fark ${r.dagitimFarki}`);
    if (!Number.isFinite(r.genelToplam)) ihlal('Maliyet NaN', {}, '');
    C.planCizimi(s.yerlesim); C.duvarGorunus(s.yerlesim, 'A'); C.duvarGorunus(s.yerlesim, 'B');
  } catch (e) { ihlal('Proje istisnası', {}, e.stack.split('\n').slice(0, 2).join(' ')); }
}

if (!ihlaller.size) console.log(`Denetim temiz: ${N} rastgele + ${Object.keys(H.PRESETLER).length} hazır modül, 200 proje.`);
for (const [k, L] of ihlaller) {
  console.log(`\n✗ ${k}: ${L.length} durum`);
  for (const x of L.filter(Boolean)) console.log(`   ${x.detay}\n     ${x.modul.slice(0, 260)}`);
}
process.exitCode = ihlaller.size ? 1 : 0;

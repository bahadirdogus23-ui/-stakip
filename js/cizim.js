/*
 * SVG teknik çizimler: ön görünüş, iç görünüş (kapaklar kaldırılmış),
 * yan kesit, proje yerleşimi ve plaka kesim planı.
 * Dünya koordinatı: x sağa, y yukarı (zeminden). SVG'de y = -y.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Cizim = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const f = (x) => Math.round(x * 10) / 10;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const rect = (x1, y1, x2, y2, cls) =>
    `<rect class="${cls}" x="${f(Math.min(x1, x2))}" y="${f(-Math.max(y1, y2))}" width="${f(Math.abs(x2 - x1))}" height="${f(Math.abs(y2 - y1))}"/>`;
  const cizgi = (x1, y1, x2, y2, cls) =>
    `<line class="${cls}" x1="${f(x1)}" y1="${f(-y1)}" x2="${f(x2)}" y2="${f(-y2)}"/>`;
  const yazi = (x, y, metin, fs, cls, dondur) =>
    `<text class="${cls || 'yazi'}" x="${f(x)}" y="${f(-y)}" font-size="${f(fs)}"${dondur ? ` transform="rotate(-90 ${f(x)} ${f(-y)})"` : ''}>${esc(metin)}</text>`;

  /** Yatay ölçü çizgisi (y seviyesinde, x1..x2) */
  function olcuYatay(x1, x2, y, fs, metin) {
    const t = fs * 0.4;
    return (
      cizgi(x1, y, x2, y, 'olcu') +
      cizgi(x1, y - t, x1, y + t, 'olcu') +
      cizgi(x2, y - t, x2, y + t, 'olcu') +
      yazi((x1 + x2) / 2, y + fs * 0.35, metin != null ? metin : f(x2 - x1), fs, 'olcu-yazi')
    );
  }
  /** Dikey ölçü çizgisi (x konumunda, y1..y2) */
  function olcuDikey(y1, y2, x, fs, metin) {
    const t = fs * 0.4;
    return (
      cizgi(x, y1, x, y2, 'olcu') +
      cizgi(x - t, y1, x + t, y1, 'olcu') +
      cizgi(x - t, y2, x + t, y2, 'olcu') +
      yazi(x - fs * 0.35, (y1 + y2) / 2, metin != null ? metin : f(y2 - y1), fs, 'olcu-yazi', true)
    );
  }

  /** Bir modülün ön görünüşünü (orijin sol-alt zemin) SVG parçası olarak üretir. */
  function modulGovde(geo, secenek) {
    const ic = !!(secenek && secenek.ic);
    const { W, Hc, hb, t } = geo;
    let s = '';

    // Baza
    if (geo.baza.tip === 'ayak') {
      for (const x of W > 1000 ? [40, W / 2 - 15, W - 70] : [40, W - 70]) s += rect(x, 0, x + 30, hb, 'ayak');
    } else if (geo.baza.tip === 'panel') {
      s += rect(0, 0, W, hb, 'baza');
    }

    const yb = hb; // gövde tabanı
    s += rect(0, yb, W, yb + Hc, 'govde');
    s += rect(t, yb + t, W - t, yb + Hc - t, 'ic');

    // Ara tablalar
    for (const b of geo.sinirlar) if (b.panel) s += rect(t, yb + b.y - t / 2, W - t, yb + b.y + t / 2, 'panel');

    geo.satirlar.forEach((sat) => {
      const goster = ic || sat.tip === 'acik';
      if (!goster) return;
      for (const dx of sat.dikmeX) s += rect(dx, yb + sat.icAlt, dx + t, yb + sat.icUst, 'panel');
      for (const b of sat.bolumler) {
        for (const ry of sat.raflar) s += rect(b.x1 + 1, yb + ry - t / 2, b.x2 - 1, yb + ry + t / 2, 'raf');
        if (sat.aski) {
          const ay = yb + sat.icUst - 60;
          s += cizgi(b.x1, ay, b.x2, ay, 'aski');
          s += `<circle class="aski-ucu" cx="${f(b.x1 + 4)}" cy="${f(-ay)}" r="6"/><circle class="aski-ucu" cx="${f(b.x2 - 4)}" cy="${f(-ay)}" r="6"/>`;
        }
      }
      for (const c of sat.cekmeceler) s += rect(c.x1, yb + c.y1, c.x2, yb + c.y2, 'cekmece-kutu');
    });

    // Ön yüzler
    if (!ic) {
      geo.satirlar.forEach((sat) => {
        if (sat.tip === 'acik') return;
        const y1 = yb + sat.on.y1;
        const y2 = yb + sat.on.y2;
        const n = sat.onler.length;
        sat.onler.forEach((o, k) => {
          s += rect(o.x1, y1, o.x2, y2, sat.tip === 'kapak' ? 'kapak' : 'cekmece-on');
          if (sat.tip === 'kapak') {
            // Menteşe tarafı: tek kapak solda, çiftlerde dışlarda
            const solMentese = n === 1 ? true : k % 2 === 0;
            const mx = solMentese ? o.x1 : o.x2;
            const ax = solMentese ? o.x2 : o.x1;
            s += `<polyline class="acilis" points="${f(ax)},${f(-y2)} ${f(mx)},${f(-(y1 + y2) / 2)} ${f(ax)},${f(-y1)}"/>`;
            const kx = solMentese ? o.x2 - 35 : o.x1 + 35;
            const kh = Math.min(160, (y2 - y1) * 0.3);
            const ky = sat.on.y1 < geo.Hc / 2 && geo.hb + geo.Hc > 1200 ? y2 - 80 - kh : y1 + (y2 - y1) / 2 - kh / 2;
            s += rect(kx - 6, ky, kx + 6, ky + kh, 'kulp');
          } else {
            const kw = Math.min(160, (o.x2 - o.x1) * 0.4);
            const cx = (o.x1 + o.x2) / 2;
            const ky = y2 - Math.min(50, (y2 - y1) / 3);
            s += rect(cx - kw / 2, ky - 6, cx + kw / 2, ky + 6, 'kulp');
          }
        });
      });
    }
    return s;
  }

  function onGorunus(modul, geo, secenek) {
    if (!geo) return '<p class="bos">Çizim için geçerli ölçü girin.</p>';
    const ic = !!(secenek && secenek.ic);
    const { W, H, hb } = geo;
    const fs = Math.max(W, H) / 32;
    const pay = fs * 6;
    let s = modulGovde(geo, secenek);

    // Ölçüler
    s += olcuYatay(0, W, -fs * 2.2, fs);
    s += olcuDikey(0, H, -fs * 2.2, fs);
    if (hb > 0) s += olcuDikey(0, hb, W + fs * 1.6, fs * 0.8);
    geo.satirlar.forEach((sat) => {
      if (ic || sat.tip === 'acik') {
        s += olcuDikey(hb + sat.icAlt, hb + sat.icUst, W + fs * 1.6, fs * 0.8);
        if (sat.bolumler.length > 1 || ic) {
          for (const b of sat.bolumler) s += olcuYatay(b.x1, b.x2, hb + sat.icUst - fs * 1.2, fs * 0.7);
        }
      } else {
        s += olcuDikey(hb + sat.on.y1, hb + sat.on.y2, W + fs * 1.6, fs * 0.8);
        if (sat.onler.length > 1) {
          const o = sat.onler[0];
          s += olcuYatay(o.x1, o.x2, hb + sat.on.y2 - fs * 1.2, fs * 0.7);
        }
      }
    });
    s += cizgi(-pay, 0, W + pay, 0, 'zemin');
    s += yazi(W / 2, H + fs * 1.4, `${modul.ad}${modul.adet > 1 ? ` (${modul.adet} adet)` : ''}`, fs * 1.1, 'baslik');

    const vb = `${f(-pay)} ${f(-H - fs * 3)} ${f(W + 2 * pay)} ${f(H + fs * 3 + pay)}`;
    return `<svg class="cizim" viewBox="${vb}" xmlns="http://www.w3.org/2000/svg">${s}</svg>`;
  }

  /** Yan kesit: derinlik, arkalık, kapak kalınlığı ve tablalar. */
  function yanKesit(modul, geo) {
    if (!geo) return '';
    const { D, H, Hc, hb, t, ta, Ds, tk } = geo;
    const fs = Math.max(D + tk, H) / 32;
    const pay = fs * 6;
    // x=0 gövdenin ön yüzü, arkaya doğru pozitif; kapak x<0 tarafında
    let s = '';
    if (geo.baza.tip === 'panel') s += rect(geo.baza.geriCekme, 0, Ds, hb, 'baza');
    if (geo.baza.tip === 'ayak') s += rect(40, 0, 70, hb, 'ayak') + rect(Ds - 70, 0, Ds - 40, hb, 'ayak');
    s += rect(0, hb, Ds, hb + Hc, 'yan-kesit');
    s += rect(0, hb, Ds, hb + t, 'panel');
    if (geo.ust === 'kusak') {
      s += rect(0, hb + Hc - t, 100, hb + Hc, 'panel');
      s += rect(Ds - 100, hb + Hc - t, Ds, hb + Hc, 'panel');
    } else s += rect(0, hb + Hc - t, Ds, hb + Hc, 'panel');
    const icOn = geo.kapakTipi === 'ic' ? tk : 0;
    for (const b of geo.sinirlar) if (b.panel) s += rect(icOn, hb + b.y - t / 2, icOn + geo.icDerinlik, hb + b.y + t / 2, 'panel');
    for (const sat of geo.satirlar) {
      for (const ry of sat.raflar) s += rect(icOn + 20, hb + ry - t / 2, icOn + geo.icDerinlik, hb + ry + t / 2, 'raf');
      for (const c of sat.cekmeceler) s += rect(icOn + 2, hb + c.y1, icOn + 2 + c.L, hb + c.y2, 'cekmece-kutu');
    }
    if (geo.arkalik === 'kanal') s += rect(Ds - 10 - ta, hb + t - 7, Ds - 10, hb + Hc - t + 7, 'arkalik');
    else if (geo.arkalik === 'cakma') s += rect(Ds, hb + 2, Ds + ta, hb + Hc - 2, 'arkalik');
    // Kapaklar
    for (const sat of geo.satirlar) {
      if (sat.tip === 'acik') continue;
      if (geo.kapakTipi === 'ic') s += rect(0, hb + sat.on.y1, tk, hb + sat.on.y2, 'kapak');
      else s += rect(-tk, hb + sat.on.y1, 0, hb + sat.on.y2, 'kapak');
    }
    const arka = geo.arkalik === 'cakma' ? Ds + ta : Ds;
    s += olcuYatay(0, arka, -fs * 2.2, fs, `${f(arka)}`);
    s += olcuDikey(0, H, -tk - fs * 2.2, fs);
    s += cizgi(-pay, 0, arka + pay, 0, 'zemin');
    s += yazi(arka / 2, H + fs * 1.4, 'Yan kesit', fs * 1.1, 'baslik');
    const vb = `${f(-pay - tk)} ${f(-H - fs * 3)} ${f(arka + tk + 2 * pay)} ${f(H + fs * 3 + pay)}`;
    return `<svg class="cizim" viewBox="${vb}" xmlns="http://www.w3.org/2000/svg">${s}</svg>`;
  }

  /**
   * Tüm modülleri yan yana dizer (adet > 1 olsa da bir kez çizilir).
   * Montaj yüksekliği olan modüller (üst dolaplar) ayrı bir sırada,
   * zeminden o yüksekliğe asılmış olarak çizilir.
   */
  function projeGorunus(moduller, sonuclar) {
    const gecerli = moduller.filter((m) => sonuclar[m.id] && sonuclar[m.id].geo);
    if (!gecerli.length) return '<p class="bos">Henüz modül yok.</p>';
    const montaj = (m) => Math.max(0, Number(m.montajYuksekligi) || 0);
    const sira = { alt: gecerli.filter((m) => !montaj(m)), ust: gecerli.filter((m) => montaj(m) > 0) };
    const genislik = (L) => L.reduce((a, m) => a + sonuclar[m.id].geo.W, 0);
    const toplam = Math.max(genislik(sira.alt), genislik(sira.ust));
    let Hmax = 0;
    for (const m of gecerli) Hmax = Math.max(Hmax, montaj(m) + sonuclar[m.id].geo.H);
    const fs = Math.max(toplam, Hmax) / 45;
    let s = '';
    for (const anahtar of ['alt', 'ust']) {
      let x = 0;
      for (const m of sira[anahtar]) {
        const geo = sonuclar[m.id].geo;
        const y0 = montaj(m);
        s += `<g transform="translate(${f(x)} ${f(-y0)})">${modulGovde(geo, {})}${yazi(geo.W / 2, geo.H + fs * 0.6, m.ad + (m.adet > 1 ? ` ×${m.adet}` : ''), fs, 'baslik')}`;
        s += anahtar === 'alt' ? olcuYatay(0, geo.W, -fs * 2, fs * 0.9) : olcuYatay(0, geo.W, geo.H + fs * 2.2, fs * 0.9);
        s += '</g>';
        x += geo.W;
      }
    }
    // Farklı montaj yükseklikleri çizimin solunda ölçülendirilir.
    const montajlar = [...new Set(sira.ust.map(montaj))].sort((a, b) => a - b);
    montajlar.forEach((y0, i) => { s += olcuDikey(0, y0, -fs * (2 + 2 * i), fs * 0.8); });
    const pay = fs * (4 + 2 * montajlar.length);
    if (sira.alt.length) s += olcuYatay(0, genislik(sira.alt), -fs * 4.5, fs, `Toplam ${f(genislik(sira.alt))}`);
    s += cizgi(-pay, 0, toplam + pay, 0, 'zemin');
    const vb = `${f(-pay)} ${f(-Hmax - fs * 5)} ${f(toplam + 2 * pay)} ${f(Hmax + fs * 11)}`;
    return `<svg class="cizim" viewBox="${vb}" xmlns="http://www.w3.org/2000/svg">${s}</svg>`;
  }

  /** Plaka kesim planı. Plaka sol üst köşesi (0,0), SVG y aşağı. */
  function plakaCizimi(plaka, boyut, renkler) {
    const W = boyut.uzun;
    const H = boyut.kisa;
    const k = plaka.kenar;
    const fs = Math.min(W, H) / 28;
    let s = `<rect class="plaka" x="0" y="0" width="${W}" height="${H}"/>`;
    s += `<rect class="plaka-kenar" x="${k}" y="${k}" width="${W - 2 * k}" height="${H - 2 * k}"/>`;
    for (const y of plaka.yerlesen) {
      const renk = renkler[y.parca.no % renkler.length];
      const x = k + y.x;
      const yy = k + y.y;
      s += `<rect class="yerlesen" x="${f(x)}" y="${f(yy)}" width="${f(y.w)}" height="${f(y.h)}" style="fill:${renk}"><title>${esc(`#${y.parca.no} ${y.parca.ad}: ${y.parca.w} x ${y.parca.h}${y.dondu ? ' (döndürüldü)' : ''}`)}</title></rect>`;
      const kucuk = Math.min(y.w, y.h);
      const yfs = Math.min(fs, kucuk / 2.6, y.w / 6);
      if (yfs > 8) {
        s += `<text class="plaka-yazi" x="${f(x + y.w / 2)}" y="${f(yy + y.h / 2 - yfs * 0.15)}" font-size="${f(yfs)}">#${y.parca.no}</text>`;
        s += `<text class="plaka-yazi ince" x="${f(x + y.w / 2)}" y="${f(yy + y.h / 2 + yfs * 0.95)}" font-size="${f(yfs * 0.75)}">${f(y.parca.w)}×${f(y.parca.h)}</text>`;
      }
    }
    return `<svg class="plaka-svg" viewBox="-10 -10 ${W + 20} ${H + 20}" xmlns="http://www.w3.org/2000/svg">${s}</svg>`;
  }

  return { onGorunus, yanKesit, projeGorunus, plakaCizimi };
});

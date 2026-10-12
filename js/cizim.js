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
    if (geo.lkose) return lKoseKol(geo, (secenek && secenek.kol) || 'A', ic);
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
    if (!ic && geo.korPanel) s += rect(geo.korPanel.x1, yb + 1.5, geo.korPanel.x2, yb + Hc - 1.5, 'kor-panel');
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

  /**
   * L köşe dolabın bir kolunun görünüşü (o kolun duvarına bakarak).
   * A kolu: köşe solda. B kolu: köşe sağda. Yerel x=0 kolun solu.
   */
  function lKoseKol(geo, kol, ic) {
    const { Hc, hb, t, D, tk, db, g } = geo;
    const L = kol === 'B' ? geo.W2 : geo.W;
    const yb = hb;
    // Kuşbakışı koordinattan (köşeye uzaklık) bu görünüşün yerel x'ine
    const X = (u) => (kol === 'B' ? L - u : u);
    const aralik = (u1, u2) => [Math.min(X(u1), X(u2)), Math.max(X(u1), X(u2))];
    let s = '';
    if (geo.baza.tip === 'ayak') for (const u of [D - 70, L - 70]) { const [a] = aralik(u, u + 30); s += rect(a, 0, a + 30, hb, 'ayak'); }
    else if (geo.baza.tip === 'panel') s += rect(0, 0, L, hb, 'baza');
    s += rect(0, yb, L, yb + Hc, 'govde');
    // Diğer kolun ucu (yan panel yüzü) bu görünüşte köşe tarafında görünür
    const [k1, k2] = aralik(0, D);
    s += rect(k1, yb, k2, yb + Hc, 'govde');
    const [i1, i2] = aralik(D, L - t);
    if (ic) {
      s += rect(i1, yb + t, i2, yb + Hc - t, 'ic');
      for (const ry of geo.raflar) s += rect(i1, yb + ry - t / 2, i2, yb + ry + t / 2, 'raf');
      return s;
    }
    const y1 = yb + db;
    const y2 = yb + Hc - db;
    if (kol === 'A') {
      const [d1, d2] = aralik(D + tk + g, L - db);
      s += rect(d1, y1, d2, y2, 'kapak');
      const [e1, e2] = aralik(D, D + tk);
      s += rect(e1, y1, e2, y2, 'kapak');
      // Katlanma (menteşe) tarafı köşede, kulp serbest uçta
      s += `<polyline class="acilis" points="${f(d2)},${f(-y2)} ${f(d1)},${f(-(y1 + y2) / 2)} ${f(d2)},${f(-y1)}"/>`;
      const kh = Math.min(160, (y2 - y1) * 0.3);
      s += rect(d2 - 41, (y1 + y2) / 2 - kh / 2, d2 - 29, (y1 + y2) / 2 + kh / 2, 'kulp');
    } else {
      const [d1, d2] = aralik(D, L - db);
      s += rect(d1, y1, d2, y2, 'kapak');
      s += `<polyline class="acilis" points="${f(d2)},${f(-y2)} ${f(d1)},${f(-(y1 + y2) / 2)} ${f(d2)},${f(-y1)}"/>`;
      const [e1, e2] = aralik(D, D + tk);
      s += rect(e1, y1, e2, y2, 'kapak');
    }
    return s;
  }

  function lKoseOnGorunus(modul, geo, secenek) {
    const ic = !!(secenek && secenek.ic);
    const { W, W2, H, hb } = geo;
    const fs = Math.max(W + W2, H) / 34;
    const ara = fs * 4;
    const pay = fs * 6;
    let s = lKoseKol(geo, 'B', ic);
    s += `<g transform="translate(${f(W2 + ara)} 0)">${lKoseKol(geo, 'A', ic)}${olcuYatay(0, W, -fs * 2.2, fs)}${yazi(W / 2, H + fs * 0.6, 'A kolu', fs * 0.9, 'olcu-yazi')}</g>`;
    s += olcuYatay(0, W2, -fs * 2.2, fs) + yazi(W2 / 2, H + fs * 0.6, 'B kolu', fs * 0.9, 'olcu-yazi');
    s += cizgi(W2 + ara / 2, -fs, W2 + ara / 2, H + fs, 'katlama');
    s += olcuDikey(0, H, -fs * 2.2, fs);
    if (hb > 0) s += olcuDikey(0, hb, W2 + ara + W + fs * 1.6, fs * 0.8);
    s += olcuDikey(hb + geo.db, hb + geo.Hc - geo.db, W2 + ara + W + fs * 1.6, fs * 0.8);
    s += cizgi(-pay, 0, W2 + ara + W + pay, 0, 'zemin');
    s += yazi((W2 + ara + W) / 2, H + fs * 2.2, `${modul.ad} – açılım${modul.adet > 1 ? ` (${modul.adet} adet)` : ''}`, fs * 1.1, 'baslik');
    const vb = `${f(-pay)} ${f(-H - fs * 4)} ${f(W2 + ara + W + 2 * pay)} ${f(H + fs * 4 + pay)}`;
    return `<svg class="cizim" viewBox="${vb}" xmlns="http://www.w3.org/2000/svg">${s}</svg>`;
  }

  /** L köşe dolabın kuşbakışı planı (köşe sol üstte, SVG koordinatlarıyla). */
  function lKosePlan(modul, geo) {
    const { W, W2, D, ta, tk, db, g } = geo;
    const fs = Math.max(W, W2) / 22;
    const pay = fs * 5;
    let s = `<polygon class="plan-govde" points="0,0 ${f(W)},0 ${f(W)},${f(D)} ${f(D)},${f(D)} ${f(D)},${f(W2)} 0,${f(W2)}"/>`;
    s += `<rect class="arkalik" x="0" y="0" width="${f(W)}" height="${f(ta)}"/><rect class="arkalik" x="0" y="${f(ta)}" width="${f(ta)}" height="${f(W2 - ta)}"/>`;
    s += `<rect class="kapak" x="${f(D + tk + g)}" y="${f(D)}" width="${f(W - db - D - tk - g)}" height="${f(tk)}"/>`;
    s += `<rect class="kapak" x="${f(D)}" y="${f(D)}" width="${f(tk)}" height="${f(W2 - db - D)}"/>`;
    const pl = (x1, y1, x2, y2, m) => {
      const t = fs * 0.4;
      const yatay = y1 === y2;
      return `<line class="olcu" x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}"/>` +
        (yatay
          ? `<line class="olcu" x1="${f(x1)}" y1="${f(y1 - t)}" x2="${f(x1)}" y2="${f(y1 + t)}"/><line class="olcu" x1="${f(x2)}" y1="${f(y1 - t)}" x2="${f(x2)}" y2="${f(y1 + t)}"/><text class="olcu-yazi" x="${f((x1 + x2) / 2)}" y="${f(y1 - fs * 0.35)}" font-size="${f(fs)}">${m}</text>`
          : `<line class="olcu" x1="${f(x1 - t)}" y1="${f(y1)}" x2="${f(x1 + t)}" y2="${f(y1)}"/><line class="olcu" x1="${f(x1 - t)}" y1="${f(y2)}" x2="${f(x1 + t)}" y2="${f(y2)}"/><text class="olcu-yazi" x="${f(x1 - fs * 0.35)}" y="${f((y1 + y2) / 2)}" font-size="${f(fs)}" transform="rotate(-90 ${f(x1 - fs * 0.35)} ${f((y1 + y2) / 2)})">${m}</text>`);
    };
    s += pl(0, -fs * 2, W, -fs * 2, f(W));
    s += pl(-fs * 2, 0, -fs * 2, W2, f(W2));
    s += pl(W + fs * 2, 0, W + fs * 2, D, f(D));
    s += `<text class="baslik" x="${f(W / 2 + D / 2)}" y="${f(D + fs * 3)}" font-size="${f(fs)}">Kuşbakışı</text>`;
    return `<svg class="cizim" viewBox="${f(-pay)} ${f(-pay)} ${f(W + 2 * pay)} ${f(W2 + 2 * pay)}" xmlns="http://www.w3.org/2000/svg">${s}</svg>`;
  }

  function onGorunus(modul, geo, secenek) {
    if (!geo) return '<p class="bos">Çizim için geçerli ölçü girin.</p>';
    if (geo.lkose) return lKoseOnGorunus(modul, geo, secenek);
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
    if (geo.lkose) return lKosePlan(modul, geo);
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
   * Bir duvarın görünüşü (o duvara bakarak). A duvarında köşe solda,
   * B duvarında köşe sağda kalır. Asılı dolaplar montaj yüksekliğinde çizilir.
   */
  function duvarGorunus(yer, duvar) {
    const ogeler = yer.yerler.filter((y) => y.duvar === duvar || (y.duvar === 'kose' && yer.tip === 'L'));
    if (!ogeler.length) return '<p class="bos">Bu duvarda modül yok.</p>';
    const genislik = (y) => (y.duvar === 'kose' ? (duvar === 'B' ? y.W2 : y.W) : y.W);
    const doluMax = Math.max(...ogeler.map((y) => y.bas + genislik(y)));
    const duvarL = (duvar === 'B' ? yer.duvarB : yer.duvarA) || doluMax;
    const L = Math.max(duvarL, doluMax);
    // B duvarında görünüş köşe sağda olacak şekilde ters çevrilir
    const konum = (y) => (duvar === 'B' ? duvarL - (y.duvar === 'kose' ? 0 : y.bas) - genislik(y) : y.bas);
    let Hmax = 0;
    for (const y of ogeler) Hmax = Math.max(Hmax, y.montaj + y.geo.H);
    const fs = Math.max(L, Hmax) / 45;
    let s = '';
    s += `<rect class="duvar" x="0" y="${f(-Hmax - fs * 2)}" width="${f(duvarL)}" height="${f(Hmax + fs * 2)}"/>`;
    for (const y of ogeler) {
      const x = konum(y);
      const w = genislik(y);
      s += `<g transform="translate(${f(x)} ${f(-y.montaj)})">${modulGovde(y.geo, { kol: duvar })}${yazi(w / 2, y.geo.H + fs * 0.6, y.modul.ad, fs * 0.9, 'baslik')}</g>`;
      if (y.sira === 'zemin') s += olcuYatay(x, x + w, -fs * 2, fs * 0.85);
      else s += olcuYatay(x, x + w, y.montaj + y.geo.H + fs * 2.2, fs * 0.85);
    }
    // Montaj yükseklikleri
    const montajlar = [...new Set(ogeler.filter((y) => y.montaj > 0).map((y) => y.montaj))].sort((a, b) => a - b);
    montajlar.forEach((m, i) => { s += olcuDikey(0, m, -fs * (2 + 2 * i), fs * 0.8); });
    // Duvar uzunluğu ve kalan boşluk (zemin sırası)
    s += olcuYatay(0, duvarL, -fs * 6.5, fs, `${duvar} duvarı ${f(duvarL)}`);
    const dz = yer.doluluk.zemin;
    const zDolu = duvar === 'B' ? dz.B : dz.A;
    if (zDolu > 0 && duvarL - zDolu > 1) {
      const a1 = duvar === 'B' ? 0 : zDolu;
      const a2 = duvar === 'B' ? duvarL - zDolu : duvarL;
      s += olcuYatay(a1, a2, -fs * 4.2, fs * 0.85, `boş ${f(a2 - a1)}`);
    }
    const pay = fs * (4 + 2 * montajlar.length);
    s += cizgi(-pay, 0, L + pay, 0, 'zemin');
    const vb = `${f(-pay)} ${f(-Hmax - fs * 6)} ${f(L + 2 * pay)} ${f(Hmax + fs * 14)}`;
    return `<svg class="cizim" viewBox="${vb}" xmlns="http://www.w3.org/2000/svg">${s}</svg>`;
  }

  /** Kuşbakışı yerleşim planı. Köşe sol üstte; A duvarı sağa, B duvarı aşağı. */
  function planCizimi(yer) {
    if (!yer.yerler.length) return '<p class="bos">Henüz modül yok.</p>';
    const L = yer.tip === 'L';
    const uzA = Math.max(yer.duvarA || 0, yer.doluluk.zemin.A, yer.doluluk.duvar.A);
    const uzB = L ? Math.max(yer.duvarB || 0, yer.doluluk.zemin.B, yer.doluluk.duvar.B, 700) : 700;
    const fs = Math.max(uzA, uzB) / 50;
    const dk = fs * 2.5; // duvar kalınlığı (çizim için)
    let s = `<rect class="duvar-plan" x="${f(-dk)}" y="${f(-dk)}" width="${f((yer.duvarA || uzA) + dk)}" height="${f(dk)}"/>`;
    if (L) s += `<rect class="duvar-plan" x="${f(-dk)}" y="0" width="${f(dk)}" height="${f(yer.duvarB || uzB)}"/>`;
    const sirali = [...yer.yerler].sort((a, b) => (a.sira === 'zemin' ? 0 : 1) - (b.sira === 'zemin' ? 0 : 1));
    for (const y of sirali) {
      const cls = y.sira === 'zemin' ? 'plan-govde' : 'plan-ust';
      const D = y.geo.D;
      if (y.duvar === 'kose') {
        s += `<polygon class="${cls}" points="0,0 ${f(y.W)},0 ${f(y.W)},${f(D)} ${f(D)},${f(D)} ${f(D)},${f(y.W2)} 0,${f(y.W2)}"/>`;
        if (y.sira === 'zemin') s += `<text class="plan-yazi" x="${f(D / 2)}" y="${f(D / 2)}" font-size="${f(fs * 0.8)}">${esc(y.modul.ad)}</text>`;
      } else if (y.duvar === 'B') {
        s += `<rect class="${cls}" x="0" y="${f(y.bas)}" width="${f(D)}" height="${f(y.W)}"/>`;
        if (y.sira === 'zemin') s += `<text class="plan-yazi" x="${f(D / 2)}" y="${f(y.bas + y.W / 2)}" font-size="${f(fs * 0.8)}" transform="rotate(-90 ${f(D / 2)} ${f(y.bas + y.W / 2)})">${esc(y.modul.ad)}</text>`;
      } else {
        s += `<rect class="${cls}" x="${f(y.bas)}" y="0" width="${f(y.W)}" height="${f(D)}"/>`;
        if (y.sira === 'zemin') s += `<text class="plan-yazi" x="${f(y.bas + y.W / 2)}" y="${f(D / 2)}" font-size="${f(fs * 0.8)}">${esc(y.modul.ad)}</text>`;
      }
    }
    // Ölçüler (zemin sırası modül genişlikleri ve duvar boyları)
    const t = fs * 0.4;
    const yat = (x1, x2, y, m) => `<line class="olcu" x1="${f(x1)}" y1="${f(y)}" x2="${f(x2)}" y2="${f(y)}"/><line class="olcu" x1="${f(x1)}" y1="${f(y - t)}" x2="${f(x1)}" y2="${f(y + t)}"/><line class="olcu" x1="${f(x2)}" y1="${f(y - t)}" x2="${f(x2)}" y2="${f(y + t)}"/><text class="olcu-yazi" x="${f((x1 + x2) / 2)}" y="${f(y - fs * 0.3)}" font-size="${f(fs)}">${m}</text>`;
    const dik = (y1, y2, x, m) => `<line class="olcu" x1="${f(x)}" y1="${f(y1)}" x2="${f(x)}" y2="${f(y2)}"/><line class="olcu" x1="${f(x - t)}" y1="${f(y1)}" x2="${f(x + t)}" y2="${f(y1)}"/><line class="olcu" x1="${f(x - t)}" y1="${f(y2)}" x2="${f(x + t)}" y2="${f(y2)}"/><text class="olcu-yazi" x="${f(x - fs * 0.3)}" y="${f((y1 + y2) / 2)}" font-size="${f(fs)}" transform="rotate(-90 ${f(x - fs * 0.3)} ${f((y1 + y2) / 2)})">${m}</text>`;
    if (yer.duvarA) s += yat(0, yer.duvarA, -dk - fs * 1.5, `A duvarı ${f(yer.duvarA)}`);
    if (L && yer.duvarB) s += dik(0, yer.duvarB, -dk - fs * 1.5, `B duvarı ${f(yer.duvarB)}`);
    const zemin = yer.yerler.filter((y) => y.sira === 'zemin');
    const dA = Math.max(0, ...zemin.filter((y) => y.duvar !== 'B').map((y) => y.geo.D));
    const dB = Math.max(0, ...zemin.filter((y) => y.duvar !== 'A').map((y) => y.geo.D));
    for (const y of zemin) {
      if (y.duvar === 'kose') {
        s += yat(0, y.W, dA + fs * 2, f(y.W));
        s += dik(0, y.W2, dB + fs * 2.5, f(y.W2));
      } else if (y.duvar === 'B') s += dik(y.bas, y.bas + y.W, dB + fs * 2.5, f(y.W));
      else s += yat(y.bas, y.bas + y.W, dA + fs * 2, f(y.W));
    }
    const pay = fs * 5;
    const vb = `${f(-dk - pay)} ${f(-dk - pay)} ${f(uzA + dk + 2 * pay)} ${f(uzB + dk + 2 * pay)}`;
    return `<svg class="cizim plan" viewBox="${vb}" xmlns="http://www.w3.org/2000/svg">${s}</svg>`;
  }

  /** Bantlı kenarları kalın gösteren küçük parça simgesi. Uzun kenar yatay çizilir. */
  function bantSimgesi(bant, boyut) {
    const w = boyut || 34;
    const h = Math.round(w * 0.55);
    const p = 3;
    const k = (x1, y1, x2, y2, var_) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="currentColor" stroke-width="${var_ ? 3.2 : 0.8}"${var_ ? '' : ' stroke-dasharray="2 2"'}/>`;
    return `<svg class="bant-simge" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-label="Bant: ${bant.u} uzun, ${bant.k} kısa kenar">` +
      k(p, h - p, w - p, h - p, bant.u >= 1) + k(p, p, w - p, p, bant.u >= 2) +
      k(p, p, p, h - p, bant.k >= 1) + k(w - p, p, w - p, h - p, bant.k >= 2) + '</svg>';
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

  return { onGorunus, yanKesit, duvarGorunus, planCizimi, plakaCizimi, bantSimgesi };
});

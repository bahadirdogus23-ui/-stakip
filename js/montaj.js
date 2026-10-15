/*
 * Montaj kılavuzu: bir dolabın adım adım kurulum sırası.
 * Parçalar kesim listesindeki numaralarıyla (#no) anılır; ölçüler hesaptan gelir
 * (gönye köşegeni, ray yükseklikleri, menteşe ve kapak boşlukları).
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Montaj = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const r0 = (x) => Math.round(x);
  const tr = (x) => String(x).replace('.', ',');
  const BAGLANTI_AD = {
    minifix: 'minifix + kavela', konfirmat: 'konfirmat vida', kavela: 'kavela + tutkal',
    seffaf_kose: 'şeffaf köşe takozu (her panele 2 vida)', seffaf_t: 'şeffaf T bağlantı (iki parçalı, çektirme vidalı)',
  };

  /**
   * @param modul, sonuc (Hesap.modulHesapla), proje, projeSonuc (Hesap.projeHesapla)
   * @returns [{ baslik, adimlar: [metin] }]
   */
  function kilavuz(modul, sonuc, proje, projeSonuc) {
    const g = sonuc && sonuc.geo;
    if (!g) return [{ baslik: 'Uyarı', adimlar: ['Geçerli ölçü yok; önce ölçüleri düzeltin.'] }];
    if (g.nesne) return [{ baslik: 'Eşya / dekor', adimlar: [`${g.nesneAd}: yalnızca görsel yer tutucu (${g.W}×${g.H}×${g.D} mm); parça ve montaj yoktur.`] }];
    if (g.bos) return [{ baslik: 'Boşluk', adimlar: [`Bu modül yalnızca ${g.en} mm yer tutar (cihaz ya da diz boşluğu); parça ve montaj yoktur. Cihazın montaj ölçülerini kataloğundan kontrol edin.`] }];
    const A = proje.ayarlar;
    const HS = sonuc.hirdavatSecimi;
    const govdeB = BAGLANTI_AD[HS.baglanti] || HS.baglanti;
    const araTur = HS.araBaglanti === 'ayni' ? (HS.baglanti === 'seffaf_kose' ? 'seffaf_t' : HS.baglanti) : HS.araBaglanti;
    const araB = BAGLANTI_AD[araTur] || araTur;

    // Parça numarası: kesim listesinde bu modüle ait, aynı ad ve ölçüdeki satır
    const numara = (adBasi) => {
      const L = sonuc.parcalar.filter((p) => p.ad === adBasi || p.ad.startsWith(adBasi));
      const nolar = [];
      for (const p of L) {
        const k = projeSonuc.kesimListesi.find((x) => x.malzeme === p.malzeme && x.ad === p.ad && x.boy === p.boy && x.en === p.en && x.moduller.includes(modul.ad));
        if (k && !nolar.includes(k.no)) nolar.push(k.no);
      }
      return nolar.length ? nolar.map((n) => `#${n}`).join(', ') : '';
    };
    const parca = (ad, adBasi) => {
      const n = numara(adBasi || ad);
      return n ? `${ad} (${n})` : ad;
    };
    const var_ = (adBasi) => sonuc.parcalar.some((p) => p.ad === adBasi || p.ad.startsWith(adBasi));
    const hir = (kod) => sonuc.hirdavat.filter((h) => h.kod === kod).reduce((a, h) => a + h.adet, 0);

    const bolumler = [];
    const bolum = (baslik, adimlar) => { if (adimlar.filter(Boolean).length) bolumler.push({ baslik, adimlar: adimlar.filter(Boolean) }); };

    // 1. Hazırlık
    bolum('Hazırlık', [
      `Bu modülün parçalarını etiket numaralarına göre ayırın: ${sonuc.parcalar.map((p) => `${p.ad} ×${p.adet}`).join(', ')}.`,
      'Delik planındaki delikleri açın ya da CNC deliklerini kontrol edin; kenar bantlarının yapıştığını ve köşelerin temizlendiğini kontrol edin.',
      `Gövde bağlantısı: ${govdeB}; ara bağlantılar: ${araB}.`,
      [HS.baglanti, araTur].includes('seffaf_kose') ? 'Şeffaf köşe takozu: takozu iç köşeye oturtun, önce dikey panele 2 vidayla (3,5×16), sonra panelleri gönyeleyip yatay panele 2 vidayla tutturun. Takozlar ön ve arka kenardan ~50 mm içeride olmalı.' : null,
      [HS.baglanti, araTur].includes('seffaf_t') ? 'Şeffaf T bağlantı (iki parçalı): her yarım iki kulaklı bir plakadır. Yarımları birleşim köşesine karşılıklı oturtup birini dikey panele, diğerini tablaya/rafa kulak uçlarındaki delik planı kılavuz deliklerine 2’şer sunta vidasıyla (3,5×16) vidalayın; sonra ortadaki göbekten geçen çektirme vidasını sıkarak iki yarımı ve panelleri birbirine çekin. Fazla sıkmayın, plastik çatlar.' : null,
    ]);

    if (g.panel) {
      bolum('Montaj', [
        `${parca(sonuc.parcalar[0].ad)} panelini yerine göre ölçüp gerekirse duvara göre traşlayın.`,
        g.tur === 'raf' ? `Gizli raf taşıyıcılarını (${hir('raf_tasiyici')} adet) teraziyle duvara sabitleyin, rafı taşıyıcılara geçirin.` : null,
        g.tur === 'yan_kapama' || g.tur === 'dolgu' ? 'Paneli komşu dolaba içten köşebent ve sunta vidasıyla bağlayın; vida boyu panel + gövde kalınlığını geçmemeli.' : null,
        g.tur === 'bulasik' ? 'Kapağı bulaşık makinesinin kendi montaj şablonuna göre makine kapağına vidalayın; kapak üst kenarı komşu kapaklarla hizalı olmalı.' : null,
        g.tur === 'tabla' ? 'Tablayı alttan köşebentlerle taşıyıcılara bağlayın; derzlerin terazide olduğunu kontrol edin.' : null,
        g.tur === 'baza' ? 'Baza bandını ayakların klipslerine takın; köşelerde gönye kesin.' : null,
        g.tur === 'duvar' ? 'Z askı profilinin bir yarısını duvara teraziyle, diğerini panelin arkasına vidalayın; paneli askıya oturtun. Priz ve kablo çıkışlarını önceden işaretleyip delin.' : null,
      ]);
      return bolumler;
    }

    if (g.lkose) {
      bolum('Gövde', [
        `İki parçalı alt tablayı (${numara('Alt tabla')}) ve üst tablayı (${numara('Üst tabla')}) köşede birleştirin (${araB}).`,
        `Kol uçlarındaki yanları (${numara('Yan (kol ucu)')}) tablalara bağlayın (${govdeB}).`,
        `Arkalıkları (${numara('Arkalık')}) gönyeyi kontrol ederek her kola çakın; B kolu arkalığı A kolunun arkasına dayanır.`,
      ]);
      bolum('Kapaklar', [
        `Katlanır kapakları (${numara('Köşe kapağı')}) kapak-kapak menteşesiyle birleştirin, B kapağını B kolu yanına asın.`,
        'Kapaklar katlanırken komşu dolabın kulpuna çarpmamalı; gerekirse komşu dolapta dolgu kullanın.',
      ]);
      return bolumler;
    }

    const t = g.t;
    const W = g.W;
    const Hc = g.egim ? Math.max(g.egim.HcL, g.egim.HcR) : g.Hc;
    const tablaBoydan = g.yapi === 'tabla_boydan';

    // 2. Çekmece kutuları
    const cekmeceVar = g.satirlar.some((s) => s.cekmeceler.length || (s.icCekmeceler || []).length) || g.bazaCekmece;
    if (cekmeceVar) {
      bolum('Çekmece kutuları', [
        HS.ray === 'metal'
          ? `Metal yanlı çekmece setlerini kataloğa göre kurun; tabanları (${numara('Çekmece tabanı')}) ve arkalıkları (${numara('Çekmece arkalığı')}) takın.`
          : `Kutuları birleştirin: yanlar (${numara('Çekmece yanı')}) arasına ön/arka parçaları (${numara('Çekmece ön/arka')}) bağlayın.`,
        HS.ray === 'metal' ? null : (A.cekmeceTabani === 'kanal'
          ? `Tabanı (${numara('Çekmece tabanı')}) kanala kaydırıp dördüncü parçayı takın.`
          : `Kutunun köşegenlerini eşitleyip tabanı (${numara('Çekmece tabanı')}) alttan çakın/zımbalayın.`),
        'Her kutunun köşegenlerini ölçün; fark 1 mm\'yi geçmesin.',
      ]);
    }

    // 3. Gövde
    const gov = [];
    const yanlar = `${numara(g.egim ? 'Sol yan' : 'Yan')}${g.egim ? ', ' + numara('Sağ yan') : ''}`;
    if (g.altYok) gov.push(`Alt tabla yok: yanları (${yanlar}) önce üst tablaya bağlayın; gövdeyi yerine koyup yanların alt uçlarını zemine/duvara köşebentle sabitleyin.`);
    else if (tablaBoydan) gov.push(`Yanları (${yanlar}) alt tablanın (${numara('Alt tabla')}) üstüne oturtup ${govdeB} ile bağlayın.`);
    else gov.push(`Alt tablayı (${numara('Alt tabla')}) iki yanın (${yanlar}) arasına ${govdeB} ile bağlayın.`);
    if (g.dikmeX.length) gov.push(g.altYok ? `Boydan bölme dikmelerini (${numara('Bölme dikmesi')}) üst tablaya ${araB} ile bağlayın; alt uçlarını zemine köşebentle sabitleyin.` : `Boydan bölme dikmelerini (${numara('Bölme dikmesi')}) alt tablaya ${araB} ile bağlayın; aralarını delik planındaki ölçüye göre kontrol edin.`);
    if (var_('Ara tabla')) gov.push(`Ara tablaları (${numara('Ara tabla')}) ${araB} ile yerleştirin.`);
    if (var_('Ara dikme')) gov.push(`Satır içi ara dikmeleri (${numara('Ara dikme')}) bağlayın.`);
    if (g.arkalik === 'kanal') gov.push(g.altYok ? `Arkalığı (${numara('Arkalık')}) yanların kanalına alttan kaydırıp üst tablaya oturtun.` : `Arkalığı (${numara('Arkalık')}) yanların ve alt tablanın kanalına kaydırın.`);
    if (g.egim) gov.push(`Eğimli üst tablayı (${numara('Üst tabla')}) ${g.egim.aci}° açılı uçlarıyla yerleştirip bağlayın.`);
    else if (g.ust === 'kusak') gov.push(`Ön ve arka kuşakları (${numara('Ön kuşak')}, ${numara('Arka kuşak')}) takın.`);
    else gov.push(`Üst tablayı (${numara('Üst tabla')}) takın.`);
    if (g.egim) {
      // Yamuk gövdede köşegenler eşit değildir: her biri kendi değeriyle kontrol edilir
      const k1 = r0(Math.hypot(W, g.egim.HcR));
      const k2 = r0(Math.hypot(W, g.egim.HcL));
      gov.push(`Gövdeyi sırtüstü yatırıp köşegenleri ölçün: sol alt → sağ üst ≈ ${k1} mm, sağ alt → sol üst ≈ ${k2} mm olmalı (sapma ≤ 2 mm). Gönye tamam olmadan arkalığı sabitlemeyin.`);
    } else {
      const kosegen = r0(Math.hypot(W, Hc));
      gov.push(`Gövdeyi sırtüstü yatırıp köşegenleri ölçün: ikisi de ≈ ${kosegen} mm olmalı (fark ≤ 2 mm). Gönye tamam olmadan arkalığı sabitlemeyin.`);
    }
    if (g.arkalik === 'cakma') gov.push(`Arkalığı (${numara('Arkalık')}) yaklaşık 15 cm aralıkla çakın/zımbalayın (${hir('arkalik_vida')} adet).`);
    if (g.arkalik === 'yok') gov.push('Arkalık yok: gövdeyi duvara bağlamadan önce gönyeyi koruyan geçici çapraz çıta kullanın.');
    bolum('Gövde', gov);

    // 4. Baza
    if (g.baza.tip === 'ayak' || g.baza.tip === 'ayak_on') bolum('Ayaklar', [`Ayarlı ayakları (${hir('ayak_plastik') || hir('ayak_metal')} adet, ${g.baza.yukseklik} mm) alt tablaya, köşelerden yaklaşık 50 mm içeriden vidalayın.`]);
    else if (g.baza.tip === 'tekerlek') bolum('Tekerlekler', [`Tekerlekleri (${hir('tekerlek')} adet) alt tablaya vidalayın; frenli olanları öne takın.`]);
    else if (g.baza.tip === 'panel') bolum('Baza', [`Baza çerçevesini (${numara('Baza')}) kurun, terazide olduğunu kontrol edip gövdeyi üstüne bağlayın.`]);
    if (g.bazaCekmece) bolum('Baza çekmecesi', [`Taşıyıcıları (${numara('Baza çekmecesi taşıyıcı')}) gövde altına bağlayın, rayları ve bas-aç mekanizmasını takın; çekmece önünü (${numara('Baza çekmecesi önü')}) süpürgelik hizasına ayarlayın.`]);

    // 5. İç donanım
    const ic = [];
    const yatay = g.surgu ? g.tk : g.kapakTipi === 'ic' ? g.tk : 0;
    g.satirlar.forEach((s) => {
      const ad = g.sutunlar.length > 1 ? `bölme ${s.sutun + 1}, satır ${g.sutunlar[s.sutun].satirlar.indexOf(s) + 1}` : `satır ${g.sutunlar[s.sutun].satirlar.indexOf(s) + 1}`;
      if (s.cekmeceler.length) {
        const yuk = s.cekmeceler.map((c) => r0(c.y1 + 22 - t));
        ic.push(`${ad}: rayları yanlara takın — ray ekseni gövde iç tabanından ${[...new Set(yuk)].join(' / ')} mm, önden ${37 + yatay} mm.`);
      }
      if ((s.icCekmeceler || []).length) ic.push(`${ad}: iç çekmece dolgu panellerini (${numara('İç çekmece dolgu paneli')}) yanlara vidalayın, rayları dolgulara takın; iç önleri (${numara('İç çekmece önü')}) kapak kapanınca çarpmayacak şekilde ayarlayın.`);
      if (s.raflar.length) ic.push(s.rafSabit
        ? `${ad}: sabit rafları (${numara('Sabit raf')}) ${araB} ile bağlayın.`
        : `${ad}: raf pimlerini takıp rafları (${numara(s.rafTipi === 'cam' ? 'Cam raf' : 'Raf')}) yerleştirin${s.rafTipi === 'cam' ? ' (cam raf pimi kullanın)' : ''}.`);
      if (s.aski) ic.push(`${ad}: askı borusunu flanşlarla, üstten yaklaşık 60 mm aşağıya takın.`);
      if (s.led) ic.push(`${ad}: LED profilini satırın üst iç kenarına yapıştırın/vidalayın; kabloyu arkalık köşesinden adaptöre götürün.`);
    });
    bolum('İç donanım', ic);

    // 6. Önler
    const on = [];
    if (var_('Çekmece önü')) on.push(`Çekmece önlerini (${numara('Çekmece önü')}) kutulara içten bağlayın; aralar ${tr(A.kapakBoslugu)} mm, dış kenarlar ${tr(A.disBosluk)} mm olacak şekilde ayarlayın.`);
    if (var_('Kapak')) {
      const camli = g.satirlar.some((s) => s.tip === 'kapak' && s.kapakTuru !== 'panel');
      on.push(`Menteşeleri kapaklara (${numara('Kapak')}) takın (Ø35 çanak, kenardan 22,5 mm), montaj plakalarını yanlara vidalayın.`);
      on.push(`Kapakları asın; menteşe vidalarıyla aralıkları ${tr(A.kapakBoslugu)} mm, dış kenarları ${tr(A.disBosluk)} mm yapın, üst kenarları hizalayın.`);
      if (camli) on.push('Cam kapaklarda cam menteşesi / profil adaptörü kullanın; cam yüzeyi koruyucu film çıkarılmadan sıkmayın.');
      if (g.satirlar.some((s) => s.acilim === 'yukari')) on.push('Kaldırmalı kapakta mekanizma kuvvetini kapak ağırlığına göre ayarlayın (kapak her konumda durmalı).');
      if (g.satirlar.some((s) => s.acilim === 'asagi')) on.push('Klapa kapakta taşıma kolunun kapağı yatay tuttuğunu kontrol edin.');
    }
    if (g.korPanel) on.push(`Kör paneli (${numara('Kör köşe paneli')}) bağlantı çıtasıyla (${numara('Kör panel bağlantı çıtası')}) gövdeye sabitleyin.`);
    if (g.surgu) on.push(`Alt ve üst sürgü raylarını takın, kapakları (${numara('Sürgü kapak')}) arka raydan başlayarak yerleştirin; tekerlek ayarıyla kapaklar arası paralel boşluğu eşitleyin.`);
    if (HS.kulp === 'kulp') on.push('Kulpları delik planındaki deliklere takın; vida boyu = ön kalınlığı + kulp diş derinliği.');
    else if (HS.kulp === 'gola') on.push('Gola profilini gövdeye takın; önlerin profil tarafında boşluk bıraktığını kontrol edin.');
    else if (HS.kulp === 'basac') on.push('Bas-aç mekanizmalarını takın, basma mesafesini ayarlayın.');
    bolum('Önler ve kulplar', on);

    // 7. Yerinde montaj
    const yer = [];
    const yerler = projeSonuc.yerlesim.yerler.filter((y) => (y.kaynak || y.modul).id === modul.id);
    if (yerler.some((y) => y.sira === 'duvar')) yer.push(`Askı ${A.duvarAski === 'ray' ? 'rayını teraziyle duvara dübelleyip aparatları raya asın' : 'aparatlarını dolabın üst arka köşelerine takıp duvara dübelleyin'}; dolabı askıdan ayarlayarak hizalayın.`);
    if (yerler.some((y) => y.sira === 'zemin')) yer.push('Ayakları ayarlayarak dolabı terazileyin; tezgah gelecekse komşu dolaplarla aynı yüksekliğe getirin.');
    if (g.H >= 1500) yer.push('Boy dolabı devrilme önleyici bağlantılarla duvara sabitleyin.');
    if (projeSonuc.birlesimSayisi > 0 && proje.yerlesim.birlestir !== false) yer.push('Komşu dolaplarla ön kenarlarını hizalayıp birleştirme vidalarıyla (yanlardan, menteşe plakalarının arasından) bağlayın.');
    for (const n of (projeSonuc.saha && projeSonuc.saha.notlar) || []) if (n.modul === modul.ad) yer.push(n.metin + '.');
    bolum('Yerinde montaj', yer);
    return bolumler;
  }

  return { kilavuz };
});

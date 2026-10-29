# Mobilya Ölçü — geri bildirim düzeni ve yol haritası

Kullanıcı geri bildirimleri dört başlıkta toplandı. Program, sektördeki tasarım/kesim programlarında yaygın olan
**"önce yapı kuralı, sonra modül"** mantığına göre düzenlendi: gövde kuralları (birleşim, üst tabla, baza, kapak tipi)
bir kez "Hazır yapı" ile seçilir, modül yalnızca farklı olduğu yerde değiştirilir.

## 1. Hatalar ve yapı ayarları — tamamlandı

| Geri bildirim | Çözüm | Nerede |
|---|---|---|
| Buzdolabı bölmesine taban konmaz | "Alt tabla yok (zemine açık)": yanlar zemine basar, alt bölme zemine açılır; Buzdolabı Kabini artık tabansız ve bazasız | Modül › Yapı › Gövde |
| Tekli modüllerde üst tabla 18 mm taşma | Üst tabla ön ve yan taşma (mm) | Modül › Yapı › Üst tabla |
| Üst tabla kapakların üstünü yanaktan yanağa kapatsın | "Kapakların üstünü kapatsın": tabla kapak kalınlığı kadar öne uzar, kapaklar altında biter | Modül › Yapı › Üst tabla |
| Yanlar bazaya insin (tekli mobilya), mutfakta baza ayrı | "Yanlar bazaya insin": baza önü/arkası yanların arasına girer, baza yanı kalkar | Modül › Yapı › Zemin ve baza |
| Mutfakta ayak + yalnız önde baza | Yeni baza tipi "Ayak + önde baza" (klipsli baza bandı); mutfak dolaplarının varsayılanı | Modül › Yapı › Zemin ve baza |
| Gömmede ara raf öne uzamıyor | Gömme kapakta boydan dikmeler ve ara tablalar öne kadar gelir | otomatik |
| Gömmede ara raf 10–12 cm yeter | "Gömme kapakta ara tabla: önde kayıt" + kayıt derinliği | Malzeme & ayarlar › Üretim payları |
| Çekmece altı rafı iptal | Satırda "Altında ara tabla yok" | Bölme › satır kartı |
| Baza yanına 1 uzun bant | Zemine değen baza parçalarında 1 uzun kenar bantlı | otomatik |
| Çekmece boşluğu | "Çekmece kutusu yan boşluğu (ray başına)" ayarı (0 = ray kataloğu) | Malzeme & ayarlar |
| Arkalığı hesaba katma | "Arkalıkları kesim listesine ve maliyete kat" anahtarı | Malzeme & ayarlar |
| PDF'lerde boş sayfa | Uzun bloklar sayfaya bölünüyor, başlık tek kalmıyor; bildirim kutusu yazdırılmıyor | otomatik |

## 2. Fiyat — tamamlandı

- İşçilik esası: **metrekare** (dolabın ön yüz alanı; panelde panel alanı) ya da modül başına.
- Kapatılan alan (m²) maliyet özetinde, modül tablosunda ve müşteri teklifinde; m² satış fiyatı.
- Fiyat alanlarının yanında **?** bilgi kutusu: her başlığın ne demek olduğu.

## 3. Yeni içerik — tamamlandı

- **Eşya ve dekor** (katalogda Beyaz eşya / Elektronik / Küçük ev aletleri / Dekor): buzdolabı, bulaşık, çamaşır,
  fırın, ocak, davlumbaz, TV, soundbar, monitör, kahve makinesi, kettle, robot süpürge, kitap, vazo, bitki, lamba,
  tablo, ayna, yatak, kanepe… Ölçüleri serbestçe değişir; parça ve maliyet çıkmaz, dolapları itmez.
- **Lambri**: çıta eni, aralık, yön, arka panel (keçe/MDF). Hazır çıta ve profil malzemeleri (boy halinde stok).
- **Kavis**: modülde üst tabla köşe kavisi; oval/yuvarlak tabla, kavisli raf, kemerli panel hazırları
  (panellerde şekil seçeneği: radyüs, oval, daire, kemer…).
- **Vestiyer**: oturaklı, ayakkabılıklı, asma vestiyer hazırları; kancalı ve öne çekilir askı türü; tasarım önerisi.
- **Tasarım önerileri**: vestiyer türü, otomatik eşya/dekor, TV arkası ve yatak başı lambri, kavisli/kapak üstü
  tablalı dresuar ve komodin, mutfakta kiler ve kahve köşesi.
- **Katalog**: arama kutusu ve grup kısayolları.

## 4. Görsel kurulum şeması — tamamlandı (ilk sürüm)

Her modül için adım adım patlatılmış 3B görünüş: takılan parçalar turuncu, önceki adımlar soluk, ok takma yönünü
gösterir. Parçalar ölçüsü (boy × en), adedi ve bantlı kenar simgesiyle listelenir; etiket olmadan tanınır.
Atölye sekmesinde ve "Kurulum şeması PDF" çıktısında.

## 5. Yeni 3B motoru, nesne menüsü, boyama, trendler — tamamlandı

- **3B motoru (WebGL2)**: derinlik tamponu (üst üste binme hataları yok), gölge haritası, LED şeritlerin
  yüzeylere sıcak ışık vurması, zemin ve duvar, perspektif, sağ tuş/iki parmakla kaydırma, ahşap damarı ve
  mermer dokusu. WebGL yoksa ve baskı/PDF'te SVG çizimi kullanılır.
- **Nesne menüsü**: 3B'de parçaya tıklayınca modül ölçüleri, satır tipi, kapak türü, raf, LED, askı;
  satır/modül çoğaltma ve silme; formda açma.
- **Boyama**: palet ya da özel renk; boya kovası modu; kapsam satır / modül / tüm proje. Seçilen renk için
  kaynak malzemenin aynı kalınlık ve fiyattaki **renk tabakası** anında oluşur; kesim ve plaka listesi renge
  göre ayrılır, kullanılmayan tabakalar silinir.
- **Trendler** (gönderilen görsellerden): kapak deseni (çerçeveli, çıtalı, kemer, altın çıta; freze uyarısı),
  kulp rengi (altın, bronz, krom…) ve uzun kulp, alttan LED (asma ünite, üst dolap altı), arkadan LED'li
  kapsül / yuvarlak / kemer / organik ayna, mermer desenli TV paneli, LED'li niş, siyah profil vitrin,
  aplik, sarkıt, pampas, minder; yeni stiller: sıcak minimal, koyu lüks, neo klasik, japandi.

## 6. Tezgah ve gerçekçi eşyalar — tamamlandı

- **Tezgah (3B)**: tezgah altı dolapların (kuşaklı alt dolap, L köşe, bulaşık makinesi) üstünde kesintisiz,
  önden taşmalı tabla; L köşede iki kollu; evye + batarya, ankastre ocak; üst dolapların altına kadar tezgah
  arası kaplama. Tür (beyaz/siyah mermer, gri kuvars, antrasit, beton, meşe, ceviz), renk, kalınlık, taşma
  3B araç çubuğundan ya da tezgaha tıklayınca açılan menüden. Eşyalar tezgahın üstüne oturur.
- **Eşyalar yeniden modellendi**: torna (dönel) vazo, şişe, kavanoz, bardak, lamba; küre yapraklı bitkiler ve
  zeytin ağacı, meyveli kase; yuvarlak hatlı beyaz eşya, kahve makinesi, airfryer, kanepe, yatak, minder,
  ayakkabı; pürüzsüz gölgeleme; mum, lamba ve sarkıt kendi ışığını verir.

## 7. Veri güvenliği — tamamlandı

- **Projelerim**: her proje kimliğiyle tarayıcı veritabanında (IndexedDB) ayrı saklanır. "Yeni proje",
  "Dosyadan aç" ve tasarımı "yeni proje olarak aç" artık eskisini silmez; ara, aç, kopyala, indir.
- **Sürüm geçmişi**: düzenlerken en az 10 dakikada bir ve riskli işlemlerden (modül silme, başka proje açma,
  tasarım ekleme, yedekten yükleme, eski sürüme dönme) önce kopya; son 40, son 60 günün her günü, her ay.
- **Çöp kutusu**: silinen proje geri alınabilir; kalıcı silme iki onayla, yalnız çöpten.
- **Kayıt klasörü** (Chrome / Edge masaüstü): seçilen klasöre her değişiklikte `Projeler/<ad> (<kimlik>).mobilya.json`,
  sürümlerde `Yedekler/<yıl-ay>/…`, günde bir `Yedekler/Tam yedek <tarih>.json`. Program klasördeki dosyaları
  silmez. İzin gerekirse üstteki durum düğmesiyle tek tıkla sürdürülür; "Klasörden içe aktar" ile yeni bilgisayara taşınır.
- **Tam yedek**: tüm projeler + artık stoku tek dosya; geri yüklemede daha yeni kayıtlar ezilmez, güncellenenlerin
  eskisi sürüm geçmişine alınır. 7 günden eski yedekte hatırlatma.
- Kalıcı depolama istenir; tarayıcının tek-proje kaydı silinse bile arşivden geri gelir; iki sekme uyarısı.

## 8. Kullanım kolaylığı — tamamlandı

- **Masa** modül türü: tabla + ayak (yan panel, ahşap 4 ayak, metal 4 ayak, U, X, merkez), tabla taşması,
  kayıt (etek), bacak paneli, şekilli tabla; kesim listesi, hırdavat, delik planı, montaj tarifi, ön ve yan
  görünüş, 3B; hazırlar: çalışma, metal ayaklı, yemek, yuvarlak, oval, sehpa, bar. Masaya sandalye süsü.
- **3B'de doğrudan düzenleme**: 3D açılış sekmesi; "＋ Ekle"; seçince küçük araç çubuğu (ölçü, özellikler,
  çoğalt, otomatik konum, sil); seçiliyi sürükleyerek duvar boyunca taşıma (komşuya / duvar ucuna yapışma);
  ⇔ ⇕ ↕ tutamaklarla genişlik, yükseklik, montaj yüksekliği (canlı ölçü etiketi); klavye kısayolları.
- **Malzemeler**: seçimler kullanıma göre süzülür ve türe göre gruplanır, renk karesiyle; modül formunda yalnız o
  modülde kullanılan malzeme alanları; kütüphane türe göre gruplu, aranabilir, "yalnız kullanılanlar".

## Sıradaki adaylar

- Kurulum şemasında adım başına vida/minifix yerlerinin büyütülmüş detay çizimi.
- Kavisli uç (çeyrek daire) açık raf modülü.
- 3B'de iki modül arasına sürükleyerek yerleştirme (duvarda konum).
- Tezgahın metre olarak maliyete ve teklife eklenmesi; mutfakta sürekli baza bandı.
- Yapı şablonlarının kullanıcı tarafından kaydedilmesi (kendi atölye kuralları).

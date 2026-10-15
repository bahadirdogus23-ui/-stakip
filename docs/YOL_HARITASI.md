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

## Sıradaki adaylar

- Kurulum şemasında adım başına vida/minifix yerlerinin büyütülmüş detay çizimi.
- Kavisli uç (çeyrek daire) açık raf modülü; 3B'de kavisli kenarların gerçek eğri çizimi.
- Mutfakta sürekli baza bandı ve tezgah modülü (yerleşimden otomatik).
- Yapı şablonlarının kullanıcı tarafından kaydedilmesi (kendi atölye kuralları).

# Mobilya Ölçü

İmal edilecek mobilyayı modül modül tasarlayıp **tüm parça ölçülerini, kesim listesini, plaka yerleşimini ve hırdavat listesini** otomatik çıkaran program. Kurulum gerektirmez: `index.html` dosyasını tarayıcıda açmanız yeterli (internet bağlantısı da gerekmez).

## Neler yapar?

- **Modül tasarımı:** Alt dolap, üst dolap, L köşe (alt/üst), kör köşe, gardırop, şifonyer, kitaplık şablonlarından başlayıp genişlik / yükseklik / derinlik / adet girilir.
- **Köşe dolaplar:** L köşe dolap iki kollu hesaplanır (katlanır kapaklar, iki parça L tabla ve raflar, kola göre arkalık). Normal dolaplara kör köşe paneli eklenebilir.
- **Mutfak / yerleşim:** düz veya L yerleşim; duvar uzunlukları girilir, modüller A/B duvarına atanır. Kuşbakışı plan, iki duvar görünüşü, kalan boşluk ve taşma uyarısı.
- **Malzeme ve hırdavat seçimi:** genişletilebilir malzeme kütüphanesi (suntalam, MDF lam, lake, akrilik, kontrplak, HDF…); gövde / kapak / çekmece / arkalık için proje varsayılanı ve modüle özel seçim. Bağlantı (minifix, konfirmat, kavela), menteşe (standart, frenli, bas-aç), ray (bilyeli, frenli, gizli, metal yanlı), kulp (kulp, gömme, gola, bas-aç) ve ayak tipi seçilir; ray tipi çekmece kutusu ölçüsünü değiştirir.
- **Yapı seçenekleri:** yanlar boydan veya tablalar boydan birleşim, tam üst tabla veya kuşak (tezgah altı), kanala geçme / çakma / arkalıksız, tam bini veya gömme kapak, ayarlı ayak veya baza çerçevesi, duvara asılan dolaplar için montaj yüksekliği.
- **Ön düzen:** yukarıdan aşağıya satırlar (kapak, çekmece, açık raf). Her satırda yükseklik (boş = kalan paylaştırılır), yan yana adet, raf sayısı, ara dikme ve askı borusu.
- **Detaylı ölçü hesabı:**
  - malzeme kalınlıkları (gövde, kapak, çekmece, arkalık ayrı ayrı)
  - kapak arası ve dış kenar boşlukları, gömme kapakta iç boşluklar
  - arkalık kanal derinliği ve kanal mesafesi, çakma arkalık payları
  - çekmece kutusu: ray boşluğu, standart ray boyu seçimi (250–600), kutu yüksekliği
  - hareketli raf yan boşluğu ve önden geri çekme
  - **kenar bandı:** hangi kenarların bantlanacağı ve bant kalınlığının kesim ölçüsünden düşülmesi
- **Çizim:** ölçülü ön görünüş, iç görünüş (kapaklar gizli), yan kesit ve tüm projenin birlikte görünüşü.
- **Kesim listesi:** malzemeye göre gruplu, net ve kesim ölçüleri, bant ve damar bilgisi; CSV olarak Excel'e aktarılır.
- **Plaka yerleşimi:** testere payı ve plaka kenar payı ile giyotin kesim planı, plaka sayısı ve doluluk oranı. Damar yönü işaretli malzemede parçalar döndürülmez.
- **Hırdavat & özet:** menteşe (kapak yüksekliğine göre adet), kulp, ray, raf pimi, ayak, askı borusu, minifix; malzeme başına m² ve bant metrajı.
- **Uyarılar:** sarkma riski olan geniş kapak, sehim yapacak uzun raf, yetersiz çekmece derinliği/yüksekliği, askı için yetersiz derinlik vb.
- **Fiyat & maliyet:** plaka (kullanılan tam plaka ya da net alan + fire), m² işlem (lake boya vb.), kenar bandı, hırdavat (kalem kalem birim fiyat), ebatlama ve bant çekme hizmeti, atölye işçiliği, montaj, nakliye ve serbest ek kalemler (tezgah, cam…). Kâr oranı ve KDV ile satış fiyatı; modül başına maliyet ve satış fiyatı. Hazır gelen fiyatlar **örnektir**, kendi fiyatlarınızı girin.
- **Fiyat teklifi PDF:** firma ve müşteri bilgisi, teklif no, geçerlilik tarihi, modül bazında satış fiyatları, KDV, genel toplam ve imza alanı (maliyet ayrıntısı içermez).
- **PDF çıktı:** atölye için işaretleme kutulu kesim listesi, A4 3×7 (63,5×38,1 mm) parça etiketleri ve çizim + yerleşim + liste + hırdavat + plaka planlarını içeren tüm proje çıktısı. Tarayıcının yazdır penceresinde "PDF olarak kaydet" seçilir.
- Proje tarayıcıda otomatik saklanır; JSON dosyasına kaydedilip tekrar açılabilir. Açılan dosyadaki her alan doğrulanır, geçersiz değerler varsayılana döner.

## Ölçü kuralları

- **Yükseklik** zeminden en üste kadardır (baza/ayak dahil). **Derinlik** gövde derinliğidir, kapak kalınlığı hariçtir.
- Kesim listesinde **boy**, parçanın uzunluk/damar yönüdür. "Bant: 1 uzun + 2 kısa" = boy yönündeki kenarlardan biri ve en yönündeki iki kenar bantlı.
- Tüm üretim payları "Malzeme & ayarlar" sekmesinden atölyenize göre değiştirilebilir.

## Geliştirme

```
js/hesap.js     ölçü hesap motoru (modül → parçalar, hırdavat, geometri)
js/yerlesim.js  plaka yerleşimi (giyotin kesim)
js/maliyet.js   fiyat, maliyet, kâr/KDV ve teklif satırları
js/cizim.js     SVG teknik çizimler
js/app.js       arayüz
```

Testler: `npm test` (Node 18+).

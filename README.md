# Mobilya Ölçü

İmal edilecek mobilyayı modül modül tasarlayıp **tüm parça ölçülerini, kesim listesini, plaka yerleşimini ve hırdavat listesini** otomatik çıkaran program. Kurulum gerektirmez: `index.html` dosyasını tarayıcıda açmanız yeterli (internet bağlantısı da gerekmez).

## Neler yapar?

- **Modül tasarımı:** Alt dolap, üst dolap, gardırop, şifonyer, kitaplık şablonlarından başlayıp genişlik / yükseklik / derinlik / adet girilir.
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
- Proje tarayıcıda otomatik saklanır; JSON dosyasına kaydedilip tekrar açılabilir. Yazdır / PDF ile çizim, liste ve plaka planları çıktı alınır.

## Ölçü kuralları

- **Yükseklik** zeminden en üste kadardır (baza/ayak dahil). **Derinlik** gövde derinliğidir, kapak kalınlığı hariçtir.
- Kesim listesinde **boy**, parçanın uzunluk/damar yönüdür. "Bant: 1 uzun + 2 kısa" = boy yönündeki kenarlardan biri ve en yönündeki iki kenar bantlı.
- Tüm üretim payları "Malzeme & ayarlar" sekmesinden atölyenize göre değiştirilebilir.

## Geliştirme

```
js/hesap.js     ölçü hesap motoru (modül → parçalar, hırdavat, geometri)
js/yerlesim.js  plaka yerleşimi (giyotin kesim)
js/cizim.js     SVG teknik çizimler
js/app.js       arayüz
```

Testler: `npm test` (Node 18+).

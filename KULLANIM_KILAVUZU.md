# AutoMold 3D — Kullanım Kılavuzu

Bu kılavuz AutoMold 3D 0.1.0 içindir. Kurulum ve geliştirici bilgileri için `README.md` dosyasına bakın.

## 1. Program ne yapar, ne yapmaz?

**Yapar**

- 3D modelinizi (STL, OBJ, 3MF, PLY) okur, ölçülerini ve kapalı (su geçirmez) olup olmadığını kontrol eder.
- Modelin etrafına bir dış gövde (kutu veya silindir) koyar ve **Boolean fark** ile modeli bu gövdeden çıkarır. Sonuçta, iç boşluğu modelin birebir negatifi olan bir kalıp elde edilir.
- Kalıbı tek parça (açık), iki parça veya çok parça olarak böler. Parçaları hizalamak için pim ve yuva ekler.
- İsteğe bağlı olarak döküm ağzı ve hava kanalı açar.
- Her adımdan sonra geometriyi kontrol eder. Her parçayı ayrı dosya olarak dışa aktarır ve bir JSON raporu ile PNG önizleme üretir.

**Yapmaz**

- Akış veya hava simülasyonu yapmaz. Hava kapanı noktaları yalnızca geometriye dayanan **önerilerdir**.
- Modeli kendiliğinden büyütmez ya da küçültmez. Ölçek yalnızca sizin onayladığınız birim dönüşümüyle (ör. cm → mm) ve sizin girdiğiniz çekme payıyla değişir.
- Bütün kontroller geçmedikçe bir kalıba "üretime hazır" demez.

## 2. Kurulum ve ilk kontrol

1. Python 3.12'yi kurun. Kurulumda "Add python.exe to PATH" kutusunu işaretleyin.
2. Proje klasöründe `run.bat` dosyasına çift tıklayın. İlk açılış birkaç dakika sürer, çünkü paketler indirilir. Sonraki açılışlarda internet gerekmez.
3. Paketlenmiş sürümü kullanıyorsanız `dist\AutoMold3D\AutoMold3D.exe` dosyasını çalıştırın. Paketi kendiniz oluşturmak için `build_windows.bat` dosyasını kullanın.

**Kurulumu doğrulama.** Komut isteminde şunu çalıştırın:

```bat
AutoMold3D.exe --self-test
```

Kaynaktan kurduysanız şunu çalıştırın:

```bat
.venv\Scripts\python.exe -m automold3d.main --self-test
```

Bu komut arayüz açmadan örnek bir küre için kalıp üretir, ikiye böler, pim ekler ve dışa aktarır. Son satırda `KENDİ KENDİNİ TEST BAŞARILI` yazmalıdır.

## 3. Temel kavramlar

| Kavram | Anlamı |
|---|---|
| **Pozitif model** | Kalıbını almak istediğiniz nesne. |
| **Negatif boşluk** | Kalıbın içindeki, modelle birebir aynı şekilli boşluk. Döküm malzemesi buraya girer. |
| **Dış gövde** | Kalıbın dış sınırı. Otomatik kutu, ölçüsü girilen kutu veya silindir olabilir. |
| **Pay** | Model ile dış duvar arasındaki mesafe (yan, üst, alt ayrı ayrı). |
| **Minimum duvar** | Kalıpta kabul edilen en ince malzeme kalınlığı. Pay ile karıştırmayın. Program gerçek en ince duvarı ölçer ve bu sınırın altındaysa uyarır. |
| **Çekme payı** | Döküm malzemesi kururken küçülüyorsa boşluk bu oranda büyütülür. Varsayılan değeri **0**'dır. Değeri malzemenizin teknik föyünden alın. |
| **Ayırma düzlemi** | Kalıbın bölündüğü düzlem. |
| **Ters açı (undercut)** | Kalıp parçasının dökümden çekilirken takıldığı yüzey. Arayüzde kırmızıyla gösterilir. |
| **Pim / yuva** | Parçaları hizalayan çıkıntı (pim) ve karşı parçadaki delik (yuva). Yuva çapı, pim çapına çap boşluğu eklenerek bulunur. Varsayılan çap boşluğu 0,2 mm'dir. |
| **Döküm ağzı / hava kanalı** | Dökümün yapıldığı delik ve havanın kaçtığı ince kanallar. |

## 4. Kullanım türü: silikon kalıp mı, içine döküm mü?

Sağ paneldeki **Kullanım** seçimi yalnızca varsayılan değerleri değiştirir. Geometri hesabı her iki seçenekte de aynıdır.

- **İçine döküm kalıbı (alçı / reçine / beton / jesmonite):** Dışa aktarılan parçaları 3D yazıcıda basın. Pimleriyle birleştirin, kalıp ayırıcı sürün ve boşluğa dökün. Varsayılanlar: 6 mm pay, 3 mm minimum duvar.
- **Silikon kalıp:** Varsayılan pay 10 mm'dir; bu, silikon et kalınlığına karşılık gelir.
  - Bu modda hesaplanan "kalıp" hacmi, nesnenin etrafına dökülecek **silikonun hacmidir**. Raporda `hacimler_mm3 → parcalar` olarak yazar. 1 000 mm³ = 1 mL'dir; bu değer karıştırmanız gereken silikon miktarını tahmin etmek için kullanılabilir.
  - Silikonun içine konacağı dış kalıp kutusunun iç ölçüsü, raporda `olculer_mm → dis_govde` olarak yazar.
  - Not: Program, basılabilir ve içi boş bir kalıp kutusu (sandık) çizmez; yalnızca ölçüsünü verir.

Taş tozu ve jesmonite gibi malzemelerde çekme genellikle çok azdır. Yine de üreticinin verdiği değeri girin. Bilmiyorsanız 0'da bırakın.

## 5. Adım adım: iki parçalı kalıp

1. **Model İçe Aktar** (Ctrl+I) ile STL dosyanızı seçin.
2. Birim penceresinde dosyanın birimini seçin. STL birim taşımaz; dilimleyicide mm ile çalıştıysanız **mm** seçin. Sağdaki "Ölçüler → Gerçek nesne" satırı dilimleyicideki ölçülerle aynı olmalıdır.
3. Model kapalı değilse program onarım yapılsın mı diye sorar. Onarım yalnızca bellekteki kopyaya uygulanır, kaynak dosyanız değişmez. Onarımı reddederseniz kalıp üretilemez.
4. **Modeli Analiz Et**: tam doğrulama yapılır ve en az ters açılı ayırma düzlemi önerilir. Öneri "Ayırma düzlemi" alanlarına yazılır; isterseniz değiştirin.
5. Payları ve minimum duvarı ayarlayın. Gövdenin tel kafes önizlemesi anında güncellenir. Bu aşamada henüz Boolean işlemi yapılmaz.
6. **Negatif Kalıp Oluştur**. "Kontroller" sekmesinde "Negatif boşluk hacmi" ve "Boşluk kapalı" satırları BAŞARILI olmalıdır.
7. **Pimleri Oluştur**. Kalıp ikiye bölünür, 1. parçaya pimler, 2. parçaya yuvalar eklenir. Görünüm → **Patlatılmış görünüm** ile parçaları ayrık görebilirsiniz.
8. İsteğe bağlı: **Döküm Ağzı Ekle** ve **Hava Kanalları Ekle**. Bu adımlardan önce "Döküm yönü (yukarı)" ayarını, döküm sırasında yukarı bakacak yöne getirin.
9. **Geometriyi Doğrula**. Bütün satırlar BAŞARILI ise program "üretime hazır" der.
10. **Dışa Aktar**: bir klasör ve biçim seçin. Şu dosyalar oluşur:
    - `kalip_parca_1_mm.stl`, `kalip_parca_2_mm.stl` (seçtiğiniz her biçim için)
    - `kalip_onizleme.png`
    - `kalip_raporu.json`
11. **Projeyi Kaydet** (Ctrl+S). `.amproj` dosyası ayarları ve kaynak dosya yolunu saklar. Kalıp geometrisini saklamaz; projeyi açtığınızda işlemleri yeniden çalıştırın.

Yanlış bir adımı **Geri Al** (Ctrl+Z) ile geri alabilir, **Yinele** (Ctrl+Y) ile yineleyebilirsiniz. Ardışık parametre değişiklikleri tek bir geri alma adımı sayılır.

## 6. Diğer kalıp modları

### Mod A — Tek parça açık kalıp

Sabun ve süs kalıpları gibi, arka yüzü düz olan nesneler içindir.

- **Çıkarma yönü**, dökümün kalıptan çekileceği yöndür (ör. +Z).
- Açıklık düzlemi varsayılan olarak modelin en üst noktasıdır. "Açıklık modelin üstünde" kutusunu kaldırarak başka bir yükseklik girebilirsiniz.
- Modelin geniş tarafı açıklığa bakmıyorsa ters açı uyarısı çıkar ve engelleyen yüzeyler kırmızı görünür. Bu durumda modeli çevirin (çıkarma yönünü değiştirin) ya da Mod B'ye geçin.

### Mod C — Çok parçalı kalıp

1. **Düzlemler** alanına her düzlemi `nx, ny, nz, ofset` biçiminde yazın ve düzlemleri `;` ile ayırın.
   - Örnek: `0, 0, 1, -24; 0, 0, 1, -10` iki yatay düzlemdir ve kalıbı üç dilime ayırır.
   - Normali X olan bir düzlem eklerseniz dilimler dikey olarak da bölünür.
2. Ya da **Kalıp → Çok parçalı düzlemleri öner** komutunu kullanın. Komut, "Hedef parça" sayısına kadar düzlem ekleyerek ters açıları gidermeye çalışır.
   - Başarısız olursa bunu açıkça söyler, bulduğu düzlemleri başlangıç olarak yazar ve düzlemleri elle düzenlemenizi ister.
   - Örneğin içinde kapalı bir boşluk bulunan modeller hiçbir düzlemle açılamaz.
3. Her parçanın çıkarma yönü ve kalan ters açısı "Kontroller" sekmesinde listelenir.
4. "Parçalar arası çakışma" satırı BAŞARILI olmalıdır.
5. **Montaj sırası** önerisi sezgiseldir ve her zaman MANUEL İNCELEME olarak işaretlenir. Parçaların birbirine göre sökülme sırasını kendiniz kontrol edin.
6. Pimler her düzleme ayrı ayrı yerleştirilir. Başka bir düzlemi kesen pimler reddedilir ve nedeni yazılır.

## 7. Parametre başvurusu

| Parametre | Varsayılan | Not |
|---|---|---|
| Gövde | Otomatik kutu | Kutu: X/Y/Z dış ölçüsü girilir ve modeli tamamen içine almalıdır. Silindir: Z ekseni boyuncadır. |
| Yan / üst / alt pay | 10 mm (silikon), 6 mm (döküm) | Model sınır kutusundan dış duvara olan mesafe. |
| Min. duvar | 5 mm / 3 mm | Altına düşen yerler UYARI verir. Model gövdenin dışına taşıyorsa HATA verilir. |
| Çekme payı | %0 | Boşluk (1 + %/100) katsayısıyla büyütülür. Gerçek nesne ve boşluk ölçüleri ayrı ayrı gösterilir. |
| Pim çapı / boyu | 5 mm / 5 mm | |
| Çap boşluğu | 0,2 mm | Yuva Ø = pim Ø + boşluk. |
| Ek yuva derinliği | 0,5 mm | Pimin yuvanın dibine oturmaması için eklenen derinlik. |
| Pim konumları | Otomatik | Mod B'de elle giriş: `x, y; x, y` (düzlem koordinatı). |
| Döküm ağzı çapı | 12 mm / 15 mm | Konumu otomatik olarak en yüksek noktadır; elle giriş: `x, y, z`. |
| Kanal adedi / çapı | 2 / 3 mm (silikon), 4 / 3 mm (döküm) | Elle giriş: `x, y, z; x, y, z`. |
| Kalıp çıkma açısı (draft) | 0 | Henüz desteklenmiyor; 0 dışındaki değerler reddedilir. |

## 8. Kontroller ve anlamları

Her kontrol şu dört sonuçtan birini verir: **BAŞARILI**, **UYARI**, **HATA** veya **MANUEL İNCELEME**.

| Kontrol | Ne bakar? |
|---|---|
| Boş geometri | Sonuçta üçgen var mı? |
| Kapalı/geçerli | Parça su geçirmez ve yüzey yönleri tutarlı mı? |
| Hacim | Hacim hesaplanabiliyor mu? |
| Negatif boşluk hacmi | Kalıp hacmi, gövde − model hacmine en fazla %0,5 sapmayla eşit mi? |
| Boşluk kapalı | Boşluk gövdenin içinde mi ve hacmi modelle aynı mı? |
| Minimum duvar kalınlığı | Gerçek en ince duvar ne kadar ve nerede? |
| Parça sayısı / Tek parça | Beklenen sayıda parça var mı; her parça tek bir katı mı? |
| Parçalar birleşince kalıp | Parçaların hacimleri toplamı kalıbın hacmini veriyor mu? |
| Parça sınırları | Parçalar ayırma düzleminde buluşuyor mu? |
| Pim/yuva eşleşmesi | Her pim yuvasına sığıyor mu; reddedilen konum var mı? |
| Ters açı | Kalıptan çıkmayı engelleyen yüzey alanı ne kadar? |
| Döküm ağzı / hava kanalı bağlantısı | Kanal boşluğun içinden başlayıp dış yüzeye açılıyor mu? Bağlantısız kanal HATA verir. |
| Kanal/pim çakışması | Bir kanal bir pim veya yuvanın içinden geçiyor mu? |
| Parçalar arası çakışma (Mod C) | İki parça aynı hacmi paylaşıyor mu? |
| Dışa aktarma doğrulama | Yazılan dosya geri okunduğunda kapalı mı; üçgen sayısı ve hacmi aynı mı? |

## 9. Rapor (`kalip_raporu.json`)

Raporda şu bilgiler bulunur:

- Birim (`mm`).
- Kaynak dosya ve dosyanın SHA-256 özeti.
- Nesne, boşluk ve dış gövde ölçüleri.
- Nesne, boşluk ve parça hacimleri.
- Bütün parametreler.
- Ayırma düzlemleri.
- Pimler: çap, boşluk ve konumlar.
- Kanallar ve hava kapanı önerileri (öneri olarak işaretli).
- Mod C için parça başına çıkarma yönü ve montaj sırası.
- Dosyalar ve SHA-256 özetleri.
- Bütün kontrol sonuçları.

`uretime_hazir` alanı yalnızca bütün kontroller BAŞARILI ise `true` olur.

## 10. Sorun giderme

| Durum | Ne yapmalı? |
|---|---|
| "Model kapalı değil / hacim hesaplanamıyor" | Onarımı kabul edin. Onarım işe yaramazsa modeli dilimleyicide veya bir mesh onarım aracında kapatıp yeniden aktarın. |
| "Model kendi kendini kesiyor" | İç içe geçen gövdeleri modelleme programında birleştirin (union). Aksi halde Boolean sonucu beklenmedik olabilir. |
| "… işlemi başarısız oldu" (Boolean) | Hata mesajını ve `logs\automold.log` dosyasını kontrol edin. Modeli onarıp tekrar deneyin. Program bu durumda geçersiz geometri üretmez. |
| "Geçerli pim konumu yok" | Payları büyütün, pim çapını küçültün veya pim konumlarını elle girin. |
| "Pim/yuva kalıp boşluğuna … yakın" | Elle girilen konumu boşluktan uzaklaştırın. |
| Kanal "bağlantısız" | Kanal konumu boşluk yüzeyinde olmalıdır. Elle girdiyseniz koordinatı düzeltin veya alanı boşaltıp otomatik öneriyi kullanın. |
| "Ayırma düzlemi modeli kesmiyor" | Ofseti modelin en alt ve en üst noktası arasına getirin. |
| "Kutu ölçüleri modeli içine almıyor" | Kutu X/Y/Z ölçülerini büyütün veya Otomatik kutuya geçin. |
| İşlem çok uzun sürüyor | Durum çubuğundaki **İptal** düğmesi işlemi gerçekten durdurur. Çok yoğun modellerde dilimleyicide üçgen sayısını azaltmayı düşünün. |
| STEP menüsü yok | STEP desteği isteğe bağlı CadQuery paketini gerektirir ve bu kurulumda yoktur. Modeli STL veya 3MF olarak dışa aktarın. |
| Kayıt dosyası | Kaynaktan: `logs\automold.log` ve `logs\automold_worker.log`. Paketli sürüm: `%LOCALAPPDATA%\AutoMold3D\logs`. |

## 11. Klavye kısayolları

| Kısayol | İşlem |
|---|---|
| Ctrl+I | Model İçe Aktar |
| Ctrl+N / Ctrl+O | Yeni proje / Proje aç |
| Ctrl+S / Ctrl+Shift+S | Kaydet / Farklı kaydet |
| Ctrl+Z / Ctrl+Y | Geri al / Yinele |
| Ctrl+Q | Çıkış |

## 12. Bilinen sınırlar

- Kalıp çıkma açısı (draft) henüz uygulanmadı.
- Kendi kendini kesme kontrolü, köşe paylaşan üçgen çiftlerini ve tam düzlemsel çakışmaları algılamaz. 600 bin üçgenin üzerindeki modellerde bu kontrol atlanır ve "manuel inceleme" olarak raporlanır.
- 20 binden fazla üçgenli modellerde ayırma düzlemi önerisi, örnekleme ile yaklaşık olarak hesaplanır.
- Mod C'de çıkarma yönü yalnızca modele göre kontrol edilir. Parçaların birbirine göre sökülme sırası sezgiseldir.
- Basılabilir, içi boş bir kalıp kutusu (silikon dökme sandığı) üretilmez.

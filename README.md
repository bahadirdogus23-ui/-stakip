# AutoMold 3D

3D yazıcıdan çıkan bir modelden (STL/OBJ/3MF) **gerçek negatif kalıp boşluğu** üreten çevrimdışı bir masaüstü uygulaması. Kalıbı parçalara böler, hizalama pimleri ekler ve her parçayı ayrı dosya olarak dışa aktarır. Taş tozu, jesmonite, alçı, reçine ve beton dökümleri için silikon kalıp / ana kalıp hazırlamaya yöneliktir.

Kalıp boşluğu, modelin etrafına kutu çizilerek değil, Boolean fark işlemiyle (`Dış gövde − Model`, manifold3d) hesaplanır. Her işlemden sonra geometri kontrol edilir.

> **Durum:** Aşama 0–8 tamamlandı. Ayrıntılı kullanım için **[KULLANIM_KILAVUZU.md](KULLANIM_KILAVUZU.md)** dosyasına bakın.

## Gereksinimler

- Windows 10/11 (testler Linux'ta da çalışır)
- [Python 3.12](https://www.python.org/downloads/). Kurulumda "Add python.exe to PATH" ve "py launcher" seçili olmalı.
- İnternet yalnızca ilk kurulumda, paketleri indirmek için gerekir. Uygulama tamamen çevrimdışı çalışır.

## Kurulum ve çalıştırma

### Windows

`run.bat` dosyasına çift tıklayın. İlk çalıştırmada `.venv` sanal ortamını oluşturur ve paketleri yükler (birkaç dakika sürebilir), ardından uygulamayı açar.

Elle kurmak isterseniz:

```bat
py -3.12 -m venv .venv
.venv\Scripts\python.exe -m pip install -r requirements.txt
.venv\Scripts\python.exe -m automold3d.main
```

### Linux

```bash
./run.sh
```

Ubuntu/Debian'da Qt ve VTK için gereken sistem kütüphaneleri:

```bash
sudo apt install libegl1 libgl1 libxkbcommon0 libxkbcommon-x11-0 libxcb-cursor0 libfontconfig1 libdbus-1-3
```

### Kurulumu doğrulama

```bat
.venv\Scripts\python.exe -m automold3d.main --self-test
```

Bu komut arayüz açmadan örnek bir kalıp üretir, böler, pim ekler ve dışa aktarır. Son satırda `KENDİ KENDİNİ TEST BAŞARILI` yazmalıdır.

### Windows paketi (PyInstaller)

`build_windows.bat` komutu `dist\AutoMold3D\AutoMold3D.exe` içeren tek klasörlük bir paket üretir (yaklaşık 1 GB). Paket Python kurulumu gerektirmez. Hedef makinede `AutoMold3D.exe --self-test` komutuyla doğrulayın. Paketli sürüm kayıtları `%LOCALAPPDATA%\AutoMold3D\logs` klasörüne yazar.

Paket tanımı `packaging/AutoMold3D.spec` dosyasındadır. Aynı tanım Linux'ta derlenip `--self-test` ile doğrulandı. Windows'ta derleme bu ortamda denenemedi.

## Kullanım (kısa)

1. **Model İçe Aktar** (Ctrl+I): STL, OBJ, 3MF veya PLY dosyası seçin. STL ve OBJ birim bilgisi taşımaz; açılan pencerede birimi onaylayın. Model yalnızca mm'ye çevrilir, başka ölçeklenmez. Kaynak dosyaya hiçbir şey yazılmaz.
2. Model kapalı (su geçirmez) değilse hacmi hesaplanamaz. Uygulama onarım yapılıp yapılmayacağını sorar. Onarmazsanız kalıp üretilemez.
3. **Modeli Analiz Et**: tam doğrulamayı yapar (kendi kendini kesme dahil) ve ters açı (undercut) alanı en küçük olan ayırma düzlemini önerip parametrelere yazar.
4. Sağ panelde ayarları yapın:
   - **Kullanım**: "Silikon kalıp" veya "İçine döküm kalıbı". Yalnızca varsayılan değerleri değiştirir.
   - **Kalıp gövdesi**: otomatik kutu, kutu veya silindir.
   - **Paylar**: model ile dış duvar arası mesafe.
   - **Min. duvar**: kontrol edilen en küçük malzeme kalınlığı.
   - **Çekme payı**: varsayılan 0.
   - **Kalıp modu**: A (tek parça açık), B (iki parça) veya C (çok parça).
   - **Ayırma düzlemi**: X/Y/Z ekseni ya da açılı düzlem, artı ofset.
   - **Pimler**: adet, çap, boy ve çap boşluğu (varsayılan 0,2 mm).
5. **Negatif Kalıp Oluştur**: Boolean öncesinde dış gövde tel kafes olarak önizlenir. Mod A'da tek parçalı açık kalıp doğrudan oluşur.
6. Mod B'de **Kalıbı Böl** ile kalıbı ikiye ayırın veya **Pimleri Oluştur** ile bölüp pim ve yuva ekleyin. Pimler 1. parçada, yuvalar 2. parçadadır. Elle konum girmek için "Konumlar" alanına düzlem koordinatı yazın, örneğin `22, 22; -22, -22`. Kurala uymayan konumlar reddedilir ve nedeni yazılır.
   - **Mod C**: "Düzlemler" alanına her düzlemi `nx, ny, nz, ofset` biçiminde, aralarına `;` koyarak yazın.
     - Örnek: `0, 0, 1, -24; 0, 0, 1, -10` modeli üç dilime ayırır.
     - Her düzlem kalıbın tamamını keser ve her bağlı parça ayrı bir kimlik alır.
     - Her parçanın çıkarma yönü, parçanın sınır düzlemlerinin normalleri arasından ters açısı en az olan seçilerek belirlenir.
     - Parçalar ikişer ikişer çakışma için kontrol edilir.
     - Önerilen montaj sırası sezgiseldir ve her zaman "MANUEL İNCELEME" olarak işaretlenir.
     - Bir pim başka bir ayırma düzlemini kesiyorsa reddedilir.
   - **Kalıp → Çok parçalı düzlemleri öner**: düzlemleri tek tek ekleyerek ters açı alanını azaltmaya çalışır. Bu öneri en iyi çaba esaslıdır. Ters açıları gideremezse bunu açıkça söyler; bulduğu düzlemleri başlangıç olarak yazar ve düzlemleri elle düzenlemenizi ister.
7. İsteğe bağlı **Döküm Ağzı Ekle** / **Hava Kanalları Ekle** (varsayılan: kapalı). "Döküm yönü (yukarı)" ayarı döküm sırasında yukarıyı gösteren yöndür.
   - Döküm ağzı boşluğun en yüksek noktasına açılır.
   - Hava kanalları **hava kapanı önerilerine** açılır. Öneriler, boşluk yüzeyinin döküm yönüne göre yerel en yüksek noktalarıdır; akış simülasyonu yapılmaz.
   - Konumları elle de girebilirsiniz (`x, y, z`).
   - Her kanal için başlangıcının boşluğun içinde olduğu ve yolunun dışarıya açık olduğu kontrol edilir. Bağlantısız kanal **HATA** olarak raporlanır.
8. **Geometriyi Doğrula**: tüm kontroller "Kontroller" sekmesinde BAŞARILI / UYARI / HATA / MANUEL İNCELEME olarak listelenir. "Üretime hazır" ifadesi yalnızca bütün kontroller geçtiğinde kullanılır.
9. **Dışa Aktar**: STL / OBJ / 3MF, PNG önizleme ve `kalip_raporu.json` üretir. Dosya adları birimi içerir (`kalip_parca_1_mm.stl`). Her dosya yazıldıktan sonra geri okunur ve kontrol edilir: kapalı mı, üçgen sayısı ve hacim aynı mı.
10. **Projeyi Kaydet** (`.amproj`, JSON): ayarlar ve kaynak dosya yolu kaydedilir. Kalıp geometrisi kaydedilmez; proje açıldığında model yeniden yüklenir ve işlemler yeniden çalıştırılır. Son projeler: Dosya → Son Projeler.

**Geri Al / Yinele** (Ctrl+Z / Ctrl+Y) her işlem ve parametre değişikliği için çalışır. Görünüm menüsünden şunları açıp kapatabilirsiniz: pozitif model, negatif boşluk, dış gövde, patlatılmış görünüm, kesit, şeffaf, tel kafes, ölçüler, pim/kanal. Kalıptan çıkmayı engelleyen yüzeyler kırmızıyla işaretlenir.

Uzun işlemler ayrı bir hesaplama sürecinde çalışır, bu yüzden arayüz donmaz. **İptal** düğmesi işlemi gerçekten durdurur.

## Elle duman testi (smoke test)

Her sürümden önce şu adımları uygulayın:

1. `run.bat` ile uygulamayı açın. Pencere başlığında "AutoMold 3D" yazmalı; menüler Dosya, Düzenle, Model, Kalıp, Görünüm, Araçlar, Yardım olmalı.
2. Bir STL içe aktarın ve birim olarak mm seçin. Sağdaki "Ölçüler" bölümünde nesne boyutları dilimleyicideki ölçülerle aynı olmalı.
3. Ortasından delik bir STL deneyin. Uygulama onarım yapılıp yapılmayacağını sormalı. "Hayır" derseniz "Negatif Kalıp Oluştur" devre dışı kalmalı.
4. Modeli Analiz Et → Negatif Kalıp Oluştur. "Kontroller" sekmesinde "Negatif boşluk hacmi" BAŞARILI olmalı.
5. Pimleri Oluştur. Nesne ağacında "Kalıp parçaları (2)" ve "Pimler (4)" görünmeli. Görünüm → Patlatılmış görünüm açıldığında parçalar ayrılmalı.
6. Yan payı değiştirin. Kalıp silinmeli ve tel kafes önizleme güncellenmeli. Ctrl+Z eski kalıbı geri getirmeli.
7. Yaklaşık 500 bin üçgenli bir model içe aktarın ve kalıp oluşturun. İşlem sürerken pencere taşınabilmeli, menüler açılabilmeli. İptal'e basınca işlem birkaç saniye içinde durmalı.
8. Dışa Aktar: klasörde `kalip_parca_1_mm.stl`, `kalip_parca_2_mm.stl`, `kalip_onizleme.png` ve `kalip_raporu.json` oluşmalı. Aynı klasöre yeniden aktarırken üzerine yazma onayı sorulmalı.
9. Döküm Ağzı Ekle ve Hava Kanalları Ekle'ye basın. Turkuaz kanallar ve öneri küreleri görünmeli; "Kontroller" sekmesinde her kanal için "bağlantısı" satırı BAŞARILI olmalı. "Kanal konumları" alanına modelin dışında kalan bir nokta girip kanalları yeniden ekleyin: o kanal HATA vermeli.
10. Mod C seçin, düzlemlere `0, 0, 1, -24; 0, 0, 1, -10` yazın ve kalıbı oluşturup bölün. Ağaçta 3 parça görünmeli. "Parçalar arası çakışma" BAŞARILI olmalı.
11. Projeyi kaydedin, Dosya → Yeni Proje, ardından Dosya → Son Projeler'den açın. Parametreler geri gelmeli, model yeniden yüklenmeli.

## Testler

```bash
.venv/bin/ruff check .
.venv/bin/pytest -q              # ekran varsa tüm testler
xvfb-run -a .venv/bin/pytest -q  # ekransız Linux (CI) için sanal ekran
```

Ekran bulunmayan Linux ortamında arayüz testleri atlanır; geometri testleri her zaman çalışır. Arayüz testleri içe aktarma, kalıp, pim, dışa aktarma, geri al/yinele, proje kaydetme/açma ve iptal akışlarını kapsar. Ayrıca 500 bin üçgenlik modelde arayüzün tepki süresini ölçer.

## Kayıtlar (log)

- Uygulama: `logs/automold.log`
- Hesaplama süreci: `logs/automold_worker.log`

Dosyalar 2 MB'de döner ve 5 yedek tutulur. Farklı bir klasör için `AUTOMOLD_LOG_DIR` ortam değişkenini kullanın. Son projeler listesi `%APPDATA%\AutoMold3D\recent.sqlite` dosyasında tutulur (Linux'ta `~/.automold3d/`).

## Bilinen sınırlar

- STEP içe aktarma kapalıdır: isteğe bağlı CadQuery paketi gerektirir ve bu kurulumda yoktur.
- Kalıp çıkma açısı (draft) parametresi henüz uygulanmadı; 0 dışındaki değerler reddedilir.
- Kendi kendini kesme kontrolü, aynı köşeyi paylaşan üçgen çiftlerini ve tam düzlemsel çakışmaları algılamaz. 600 bin üçgenin üzerinde bu kontrol atlanır ve "manuel inceleme" olarak raporlanır.
- Ayırma düzlemi önerisi, 20 binden fazla üçgenli modellerde alana göre ağırlıklı örnekleme kullanır.
- Akış simülasyonu yapılmaz.
- Mod C'de çıkarma yönü yalnızca modele karşı kontrol edilir. Parçaların birbirine göre sökülebilirliği (montaj sırası) sezgiseldir ve elle kontrol edilmelidir.

## Yol haritası

| Aşama | İçerik | Durum |
|---|---|---|
| 0 | Kurulum, iskelet, loglama, boş pencere | Tamam |
| 1 | Model içe aktarma ve doğrulama | Tamam |
| 2 | Negatif kalıp boşluğu (Boolean fark) | Tamam |
| 3 | Kalıbı bölme, ayırma yüzeyi, pimler | Tamam |
| 4 | Dışa aktarma (STL/OBJ/3MF, rapor, PNG) | Tamam |
| 5 | Arayüz entegrasyonu, geri al/yinele, proje kaydetme | Tamam |
| 6 | Döküm ağzı ve hava kanalları | Tamam |
| 7 | Çok parçalı kalıplar | Tamam |
| 8 | Kullanım kılavuzu ve Windows paketi | Tamam |

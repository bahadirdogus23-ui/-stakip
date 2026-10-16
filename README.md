# AutoMold 3D

3D yazıcıdan çıkan bir modelden (STL/OBJ/3MF) **gerçek negatif kalıp boşluğu** üreten, kalıbı parçalara bölen, hizalama pimleri ekleyen ve her parçayı ayrı dosya olarak dışa aktaran çevrimdışı masaüstü uygulaması. Taş tozu, jesmonite, alçı, reçine ve beton dökümleri için silikon kalıp / ana kalıp hazırlamaya yöneliktir.

> **Durum: Aşama 0 (kurulum).** Şu an yalnızca boş ana pencere açılıyor. Araç çubuğundaki düğmeler devre dışıdır ve üzerlerinde hangi aşamada ekleneceği yazar.

## Gereksinimler

- Windows 10/11 (veya test için Linux)
- [Python 3.12](https://www.python.org/downloads/) — kurulumda "Add python.exe to PATH" ve "py launcher" seçili olmalı
- İnternet yalnızca ilk kurulumda (paketleri indirmek için) gerekir; uygulama tamamen çevrimdışı çalışır.

## Kurulum ve çalıştırma

### Windows

`run.bat` dosyasına çift tıklayın. İlk çalıştırmada `.venv` sanal ortamını oluşturur ve paketleri yükler (birkaç dakika sürebilir), sonra uygulamayı açar.

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

## Testler

```bash
.venv/bin/ruff check .
.venv/bin/pytest -q              # ekran varsa tüm testler
xvfb-run -a .venv/bin/pytest -q  # ekransız Linux (CI) için sanal ekran
```

Ekran bulunmayan Linux ortamında arayüz testleri atlanır; geometri testleri her zaman çalışır.

## Kayıtlar (log)

Uygulama kayıtları `logs/automold.log` dosyasına yazılır (2 MB'de döner, 5 yedek). Farklı bir klasör için `AUTOMOLD_LOG_DIR` ortam değişkenini kullanın.

## Yol haritası

| Aşama | İçerik | Durum |
|---|---|---|
| 0 | Kurulum, iskelet, loglama, boş pencere | Tamam |
| 1 | Model içe aktarma ve doğrulama | — |
| 2 | Negatif kalıp boşluğu (Boolean fark) | — |
| 3 | Kalıbı bölme, ayırma yüzeyi, pimler | — |
| 4 | Dışa aktarma (STL/OBJ/3MF, rapor, PNG) | — |
| 5 | Arayüz entegrasyonu, geri al/yinele, proje kaydetme | — |
| 6 | Döküm ağzı ve hava kanalları | — |
| 7 | Çok parçalı kalıplar | — |
| 8 | Kullanım kılavuzu ve Windows paketi | — |

STEP desteği isteğe bağlıdır (CadQuery); henüz eklenmedi.

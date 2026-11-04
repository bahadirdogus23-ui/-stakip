# Lokanta Takip

Ana kasa **Python/Tk masaüstü uygulamasıdır**, HTML veya Electron kullanmaz. Garsonlar aynı yerel ağdaki telefon/tablet tarayıcısından bağlanır. İnternet bağlantısı gerekmez; ana bilgisayarın açık olması gerekir.

## Çalıştırma

Hedef sistem Windows 10/11, 64 bit. Kullanıcı `LokantaTakip.exe` dosyasına çift tıklayarak programı açar; Python kurulumu, komut satırı veya BAT dosyası gerekmez. Konsol penceresi açılmaz. Python, Tk ve garson sayfası tek EXE içine paketlenir. Veriler EXE'nin yanında değil, kullanıcı veri klasöründe saklanır; EXE güncellenince korunur.

Windows EXE oluşturma yapılandırması hazırdır; bu Linux ortamında Windows EXE üretilmemiş veya çalıştırılmamıştır. GitHub üzerinde değişiklikler yer aldıktan sonra **Actions → Windows EXE → Run workflow** ile Windows derlemesi çalıştırılır. Başarılı çalışmanın `LokantaTakip-Windows-x64` çıktısını indirip ZIP içinden `LokantaTakip.exe` dosyasını çıkarın. Derleme otomatik olarak paketlenmiş masaüstü penceresi, veritabanı ve garson sayfasını kontrol eder.

Geliştirici Windows makinesinde Python 3.12 ile aynı çıktıyı `python -m pip install -r requirements-build.txt` ve ardından `python -m PyInstaller --noconfirm --clean LokantaTakip.spec` komutlarıyla `dist/LokantaTakip.exe` konumunda üretebilir. `LokantaTakip.exe --self-test` paket kontrolünü çalıştırır. Bu komutlar son kullanıcı için değildir. EXE henüz kod imzası içermez; Windows yayıncıyı doğrulayamayabilir.

Kasa üst kısmında görünen yerel IP adresini ve PIN'i garsona verin. Telefonlar aynı Wi-Fi'da olmalı; işletim sistemi güvenlik duvarında yalnız özel yerel ağ için TCP 8765'e izin verin. Garson adını girer, masayı/ürünü seçer ve sipariş gönderir. Kasa üç saniyede, garson ekranı on saniyede yenilenir. Garson ödemeye veya menü yönetimine erişemez. Mutfağın sipariş durumunu kasa değiştirir.

## Veriler ve yedekler

Windows: `%LOCALAPPDATA%\LokantaTakip`; diğer sistemler: `~/LokantaTakip`. SQLite veritabanı ve `yedekler` klasörü burada tutulur. Her değişiklikten ve açılıştan sonra tutarlı SQLite yedeği alınır; son 100 yedek saklanır. Konumu `--data-dir` ile değiştirebilirsiniz. Elle yedek için **Yedek al** düğmesi vardır. Aynı diskteki yedek disk arızasına karşı korumaz; bu klasörü düzenli olarak harici diske kopyalayın.

Geri yükleme: uygulamayı kapatın, mevcut `lokanta.sqlite3` dosyasını ayrı yere taşıyın; seçtiğiniz yedeği `lokanta.sqlite3` adıyla veri klasörüne kopyalayın ve uygulamayı açın. PIN de veritabanıyla geri yüklenir.

## Mevcut kapsam

Başlangıçta 12 masa, masa ekleme/kaldırma/adlandırma, bölüm oluşturma/kaldırma, masayı bölüme taşıma, bölüm filtreleri, renkli boş/dolu masa kartları, örnek menü, ürün ekleme, sipariş notu ve garson adı, mutfak durumları, nakit/kart ödeme penceresi, alınan tutar ve para üstü, ödeme alındı bildirimi, son 100 ödeme geçmişi, günlük toplam, yerel PIN girişi ve otomatik yedek. Açık hesabı olan masa kaldırılamaz; kaldırılan masanın ödeme geçmişi korunur. Eski veritabanları açılışta mevcut masalar Salon bölümünde kalacak şekilde güncellenir. Ödeme sırasında eklenen yeni siparişler tutar yeniden kontrol edilmeden kapatılamaz. Kart kaydı banka entegrasyonu değildir. Tutarlar kuruş olarak saklanır; geçmiş sipariş fiyatı sonradan değişmez.

Bu ilk sürümde masa taşıma/birleştirme, kısmi ödeme, iptal/iade kayıtları, stok, yazıcı, mali fiş/e-fatura, kullanıcı bazında yetki ve uzak internet erişimi bulunmaz. PIN ortak servis erişimi içindir; güvenilir özel ağda kullanın, portu internete açmayın. Şifreli HTTPS ve bireysel hesaplar olmadan internetten erişim için uygun değildir. Ana bilgisayar kapanınca garson sipariş gönderemez; çevrimdışı sipariş kuyruğu yoktur.

## Geliştirme ve doğrulama

Harici Python paketi gerekmez. `python3 -m unittest discover -s tests -v` testleri çalıştırır. `python3 main.py --headless --data-dir /tmp/lokanta-demo` grafik ekran olmadan garson sunucusunu başlatır. `GET /health` sunucu durumunu döndürür. Grafik arayüzün kullanılabilmesi için masaüstü ekran oturumu gerekir.

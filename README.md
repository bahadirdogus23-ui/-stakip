# Lokanta Takip

Ana kasa **Python/Tk masaüstü uygulamasıdır**, HTML veya Electron kullanmaz. Garsonlar aynı yerel ağdaki telefon/tablet tarayıcısından bağlanır. İnternet bağlantısı gerekmez; ana bilgisayarın açık olması gerekir.

## Çalıştırma

Hedef sistem Windows 10/11, 64 bit. Kullanıcı `LokantaTakip.exe` dosyasına çift tıklayarak programı açar; Python kurulumu, komut satırı veya BAT dosyası gerekmez. Konsol penceresi açılmaz. Python, Tk ve garson sayfası tek EXE içine paketlenir. Veriler EXE'nin yanında değil, kullanıcı veri klasöründe saklanır; EXE güncellenince korunur.

Windows EXE, Windows üzerindeki otomatik derleme akışında üretilir ve test edilir. GitHub üzerinde değişiklikler yer aldıktan sonra **Actions → Windows EXE → Run workflow** ile Windows derlemesi çalıştırılır. Başarılı çalışmanın `LokantaTakip-Windows-x64` çıktısını indirip ZIP içinden `LokantaTakip.exe` dosyasını çıkarın. Derleme otomatik olarak paketlenmiş masaüstü penceresi, veritabanı ve garson sayfasını kontrol eder.

Geliştirici Windows makinesinde Python 3.12 ile aynı çıktıyı `python -m pip install -r requirements-build.txt` ve ardından `python -m PyInstaller --noconfirm --clean LokantaTakip.spec` komutlarıyla `dist/LokantaTakip.exe` konumunda üretebilir. `LokantaTakip.exe --self-test` paket kontrolünü çalıştırır. Bu komutlar son kullanıcı için değildir. EXE henüz kod imzası içermez; Windows yayıncıyı doğrulayamayabilir.

**Garsonlar → Garson bağlantı adreslerini göster** bölümündeki yerel adresi garsona verin. **Garsonlar** menüsünden her garson için ad soyad, kullanıcı adı ve en az 6 karakterlik şifre tanımlayın. Şifreler salt içeren PBKDF2-SHA256 özetiyle saklanır; sonradan görüntülenmez, yenilenir. Şifre yenileme ve hesabı pasife alma mevcut oturumları geçersiz kılar. Ortak PIN girişi kaldırılmıştır; ilk açılışta hesapları kasadan oluşturun. Telefonlar aynı Wi-Fi'da olmalı; işletim sistemi güvenlik duvarında yalnız özel yerel ağ için TCP 8765'e izin verin. Garson kendi kullanıcı adı ve şifresiyle giriş yapar, masayı/ürünü seçer ve sipariş gönderir. Ad soyad ve kalıcı hesap kimliği sunucu tarafından siparişe otomatik eklenir. Garson ekranından çıkış yapılabilir; oturum en fazla 12 saat geçerlidir. Kasa bir saniyede, garson ekranı yedi saniyede yenilenir. Garson ödemeye veya menü yönetimine erişemez. Mutfağın sipariş durumunu kasa değiştirir.

## Veriler ve yedekler

Windows: `%LOCALAPPDATA%\LokantaTakip`; diğer sistemler: `~/LokantaTakip`. SQLite veritabanı ve `yedekler` klasörü burada tutulur. Her değişiklikten ve açılıştan sonra tutarlı SQLite yedeği alınır; son 100 yedek saklanır. Konumu `--data-dir` ile değiştirebilirsiniz. Elle yedek için **Yedekleme → Şimdi yedek al** düğmesi vardır. Aynı diskteki yedek disk arızasına karşı korumaz; bu klasörü düzenli olarak harici diske kopyalayın.

**Yedekleme → Doğrulanmış yedeğe geri dön** seçeneğini kullanın. Dosyanın bütünlüğü ve varsa sağlama toplamı doğrulanır. Onayınızdan sonra garson sunucusu ve yedekleme iş parçacığı durdurulur, mevcut veri `geri-yukleme-oncesi` klasörüne arşivlenir ve yedek atomik olarak geri yüklenir. Sonrasında programı yeniden açın. WAL dosyalarını çalışan uygulamadan elle kopyalamayın; uygulamanın ürettiği yedek dosyalarını kullanın. Garson hesapları da veritabanıyla geri yüklenir; sunucu yeniden başlatılınca tekrar giriş gerekir.

## Mevcut kapsam

Başlangıçta 12 masa, masa ekleme/kaldırma/adlandırma, bölüm oluşturma/kaldırma, masayı bölüme taşıma, bölüm filtreleri, renkli boş/dolu masa kartları, örnek menü, ürün ekleme, sipariş notu ve garson adı, mutfak durumları, nakit/kart ödeme penceresi, alınan tutar ve para üstü, ödeme alındı bildirimi, son 100 ödeme geçmişi, günlük toplam, kişisel garson girişi ve otomatik yedek. Açık hesabı olan masa kaldırılamaz; kaldırılan masanın ödeme geçmişi korunur. Eski veritabanları açılışta mevcut masalar Salon bölümünde kalacak şekilde güncellenir. Ödeme sırasında eklenen yeni siparişler tutar yeniden kontrol edilmeden kapatılamaz. Kart kaydı banka entegrasyonu değildir. Tutarlar kuruş olarak saklanır; geçmiş sipariş fiyatı sonradan değişmez.

Bu ilk sürümde masa taşıma/birleştirme, kısmi ödeme, ödeme iadesi, stok, yazıcı, mali fiş/e-fatura, ayrıntılı rol/yetki yönetimi ve uzak internet erişimi bulunmaz. Garson hesabı yalnızca servis ekranına erişir; hesap yönetimi ve raporlar ana bilgisayardadır. Güvenilir özel ağda kullanın, portu internete açmayın. Yerel HTTP bağlantısı HTTPS ile şifrelenmediği için internetten erişim için uygun değildir. Bağlantı kesildiğinde, daha önce giriş yapılmış açık garson sayfası son bilinen menüyle siparişleri tarayıcıda bekletir; bağlantı gelince otomatik gönderir. İlk giriş veya kapalı sayfayı ağ yokken yeniden açma desteklenmez. Tarayıcı verilerini temizlemek bekleyen siparişleri siler. Bekleyen kayıtlar hesaba göre ayrılır; farklı garson hesabıyla gönderilmez. Oturum süresi dolarsa aynı hesapla tekrar giriş gerekir. Kasaya ulaşmayan kayıtlar açıkça işaretlenir; masa hesabı kapanmışsa otomatik yeni hesap açılmaz, kayıt kontrol için durdurulur.

## Geliştirme ve doğrulama

Harici Python paketi gerekmez. `python3 -m unittest discover -s tests -v` testleri çalıştırır. `python3 main.py --headless --data-dir /tmp/lokanta-demo` grafik ekran olmadan garson sunucusunu başlatır. `GET /health` sunucu durumunu döndürür. Grafik arayüzün kullanılabilmesi için masaüstü ekran oturumu gerekir.

## Özet ve raporlar

Kasadaki **Özet ve raporlar** menüsünden Günlük (bugün), Haftalık (pazartesi–pazar, bu hafta) veya Aylık (bu takvim ayı) seçin. Tarihler ana bilgisayarın yerel saatine göredir. Kapanan adisyon sayısı, toplam tahsilat, nakit ve kart toplamları; ayrıca her hesabın masa, kapanış zamanı, ödeme türü, tutarı ve siparişi giren garsonları gösterilir. Açık adisyonlar tahsilata dahil edilmez; para üstü gelir olarak sayılmaz. Rapor, önceki sürümlerde kaydedilmiş nakit/kart ödemelerini de kapsar. **Raporu yenile** güncel verileri getirir. Eski kayıtların yazılı garson adları korunur; geçmişe geriye dönük hesap ataması yapılmaz.

## Sipariş detayı ve gelişmiş yedekleme

Garson ve sipariş notu ayrı sütunlardadır. Siparişe çift tıklayarak veya **Seçili siparişin detayını göster** düğmesiyle notun tamamını okuyabilirsiniz.

**Yedekleme** menüsü son yedekleri listeler. Son 100 işlem yedeğine ek olarak son 30 günün ve son 12 ayın son durumları ayrı klasörlerde tutulur. Harici disk/ağ klasörü seçilirse ayrıca son 100 yedek oraya yazılır. Her dosya SQLite bütünlük kontrolünden geçirilip geçici dosyadan atomik olarak taşınır. Harici hedef bağlantısı kesilirse yerel kayıt devam eder ve kasa ekranında uyarı görünür. **Yedek dosyasını doğrula**, seçilen dosyanın bütünlüğünü ve uygulama tablolarını kontrol eder; kendiliğinden mevcut verinin üzerine yazmaz. Geri yükleme adımları Veriler ve yedekler bölümündedir.

Bekleyen garson siparişleri benzersiz kimlikle gönderilir. Yanıt kaybolup yeniden gönderildiğinde aynı kayıt ikinci kez işlenmez; bu kontrol sunucu yeniden başlatıldığında da korunur. Bekleyen siparişin masası kapatılmışsa kayıt kasaya otomatik eklenmez; garsonun kontrol edip gerekirse kaldırarak yeniden girmesi gerekir. Telefonunuzun yalnızca internete değil ana bilgisayarın bulunduğu yerel ağa yeniden bağlanması gerekir.

## Arayüz ve hata düzeltmeleri

Kasa ekranı yeniden düzenlendi: ayrı araç çubuğu, bölünebilir masa/adisyon alanları, masa adına göre arama ve dolu/boş filtreleri, sabit ödeme düğmesi, kaydırılabilir listeler. Otomatik yenileme değişmeyen masa kartlarını yeniden oluşturmaz, sipariş seçimini ve kaydırmayı korur. Filtre sonucu boşsa sipariş ekleme kapanır. Tutarlar Türkçe biçimde gösterilir; para girişi 1250,50 veya 1.250,50 olabilir; hatalı ve fazla ondalıklı tutarlar reddedilir. Eski ödeme penceresi daha sonra açılan başka bir adisyonu kapatamaz. Otomatik yedek hatası, kaydedilmiş işlemi başarısız göstermez; kasa uyarı verir.

Garson ekranında giriş, masa seçimi, sipariş girişi ve adisyon ayrı kartlardadır. Hızlı çift dokunma ve geç gelen önceki hesap yanıtları engellenir; başarılı gönderimden sonra adisyon yenilenir. Kuyruktaki sorunlu kayıtlar ayrı gösterilir.

Ek arayüz doğrulaması: masaüstü ekran oturumunda `python tests/ui_smoke.py`. Bu kontrol küçük ekran, filtreler, seçim koruma ve tüm diyalogları çalıştırır; Windows derlemesine de eklenmiştir.

## Dokunmatik garson menüsü ve çoklu sipariş

Masa kartını seçin, ürün kartlarındaki **+ / −** düğmeleriyle farklı ürünleri aynı sepete ekleyin. **Sepeti aç** ekranında her ürüne ayrı not yazabilirsiniz. **Siparişi gönder** sepeti tek işlemde kaydeder. Cihazda bekleyen kayıt güvenle oluşturulduktan sonra masa seçimi ekranına dönülür; sepet ve arama temizlenir, garsonun oturumu açık kalır. Çevrimdışı gönderimler **Bekleyenler** bölümünde görünür. Aynı sepet tekrar iletilirse ikinci sipariş oluşmaz. En fazla 50 ürün satırı ve her satırda 99 adet desteklenir. Ürün fiyatı kasadaki güncel menüden alınır.

Garsonun henüz göndermediği sepeti cihazda taslak olarak saklanır. Oturum açıkken sayfa yeniden yüklendiğinde taslak geri gelir. Ağ tamamen yokken kapalı bir sayfayı yeniden açma desteklenmez.

## Sipariş iptali ve bildirim

Garson **Adisyon → Siparişi iptal et** ile kendi girdiği açık siparişin tamamını, neden belirterek iptal eder. İptal onayı için kasa bağlantısı gerekir; çevrimdışı iptal yapılmış gibi gösterilmez. Kasada listeden bir veya birden fazla satır seçilip **İptal et** kullanılır. Her iki tarafta da ürün silinmez; iptal eden, neden ve zaman saklanır. İptaller tahsilata dahil edilmez. Son aktif ürün iptal edilince adisyon iptal olarak kapanır ve masa boşalır. Ödenmiş adisyonlarda iptal yoktur; ödeme iadesi ayrı bir özelliktir. Kasadaki **İptaller** ekranı son 200 kaydı gösterir; tüm kayıtlar veritabanında korunur.

Yeni garson siparişi kaydedilince kasada masa/garson bilgisi görünür ve Windows'ta yerel iki tonlu ses çalar. Aynı siparişin tekrarı ikinci bildirim üretmez; program açılırken eski siparişler çalmaz. **Ses açık / Ses kapalı** düğmesi tercihi saklar; ses açıldığında örnek ses çalar. Bilgisayar hoparlörü açık ve Windows uygulama sesi duyulur seviyede olmalıdır.

## Yedekleme güvenceleri

SQLite WAL ve FULL eşzamanlama kullanılır. Her değişiklikten sonra, ayrıca program açıkken her beş dakikada bir yedek alınır. Son 100 işlem, 48 saatlik, 30 günlük ve 12 aylık son durum saklanır; seçilen harici hedefe de bu katmanlar yazılır. Dosyalar SQLite yedekleme API'siyle üretilir, kayıt ilişkileri ve bütünlük kontrol edilir, diske yazma tamamlandıktan sonra atomik taşınır ve SHA-256 dosyası oluşturulur. Yeni şemaya geçişten önce ayrıca kopya alınır. Sağlama toplamı bozuk yedek geri yüklemede reddedilir.

Aynı diskteki yedek fiziksel disk arızasını çözmez: **Harici yedek klasörü seç** ile ayrı bir disk veya ağ hedefi tanımlayın. Harici hedef erişilemezse yerel işlemler sürer ve kasa uyarı verir. Yedeğe dönünce yedek tarihinden sonraki siparişler yalnız önceki veri arşivinde kalır.

Geliştirici için gerçek tarayıcı testi: Node üzerinde `playwright-core@1.56.1` kurulu olmalı; `python tests/run_browser_smoke.py` geçici verilerle kendi sunucusunu açar. Windows'ta Edge, Linux'ta Chromium kullanılır; farklı yol `LOKANTA_BROWSER_PATH` ile seçilebilir. Telefon boyutları, çoklu sepet, iptal, otomatik ana ekrana dönüş ve çevrimdışı gönderim test edilir. Bu test Windows CI'a dahildir; son kullanıcıya Node kurulumu gerekmez.

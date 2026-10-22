# Yol Bakım ve Nakliye Takip Programı — Düzeltilmiş Prompt

## Amaç

Malatya Büyükşehir Belediyesi yol bakım ve onarım birimi için yol bakım işlerini ve nakliye kantar fişlerini tek ekrandan yöneten bir program yaz. Program sade, güvenilir ve klavyeyle hızlı kullanılabilir olmalı. Hatırlatıcılar geciken ve acil işleri kendiliğinden göstermeli.

## Teknik zemin

- Tek bir `.html` dosyası olsun. HTML, CSS ve düz JavaScript kullan, kütüphane ya da framework kullanma.
- İnternet gerekmesin. Dosya çift tıklanınca tarayıcıda açılıp çalışsın, sunucu ve kurulum istemesin.
- Veriler tarayıcıda `localStorage` içinde `kantar` anahtarıyla saklansın. Aynı veriler, programın bulunduğu klasördeki `kantar_veri.json` dosyasına da her kayıtta otomatik yazılsın; `Yedekler` alt klasöründe günlük kopya tutulsun. Klasör bir kez seçilir ve hatırlanır (File System Access API, Chrome/Edge). Tarayıcıdaki veriyle dosyadaki farklıysa hangisinin kullanılacağı sorulsun, diğeri yedeklensin. Yazmadan önce dosyanın başka bir bilgisayardan değiştirilip değiştirilmediği kontrol edilsin; değiştiyse üzerine yazılmadan sorulsun. Yeni bilgisayarda tarayıcı boşsa dosyadaki veri kendiliğinden yüklensin. Geçici yazma hataları 5 sn – 2 dk aralıklarla yeniden denensin. Günlük yedek günde bir kez alınsın, ayarlardaki gün sayısından (varsayılan 30) eski yedekler silinsin. Tarayıcıdaki kayıt okunamazsa (bozuksa) program üzerine yazmasın; klasördeki dosyadan kurtarma, yedekten yükleme ya da boş başlama seçenekleri sunsun. Önceki sürümün verileri (`k`, `y`, `v`, `s`) kaybolmadan yeni yapıya dönüştürülsün; eski ortak makine/araç listesindeki iş makineleri ayrı listeye, kamyonlar kamyon listesine taşınsın (şoförü olan kamyon Belediye, diğerleri Müteahhit). Eski `proje`, `brüt` ve `dara` alanlarından `yol` ve `net` alanları üretilsin.
- JSON olarak yedek alınabilsin ve geri yüklenebilsin; daha yeni bir sürümün yedeği yüklenmeye çalışılırsa reddedilsin. Excel'den kopyalanan satırlar ve eski `.xlsx` sefer dosyası içe aktarılabilsin:
  - Başlık satırı ilk 12 satır içinde aranarak bulunsun; tırnaklı, satır içi Enter içeren hücreler doğru okunsun.
  - "Ton" başlıklı sütun kg'a çevrilsin; 1904 tarih sistemli dosyalarda tarih kaydırılsın.
  - Yol ve malzeme adları harf/tire/boşluk farkı gözetmeden mevcut tanımlarla eşleşsin.
  - Fişsiz satırlarda mükerrer denetimi tarih-saat ile birlikte yapılsın; aralık dışı net değerleri raporlansın.
- Kod Model (veri), View (ekran çizimi) ve Controller (olaylar ve iş kuralları) olarak üç bölüme ayrılsın. Fonksiyonlar kısa olsun, gereksiz yorum yazılmasın.
- Temel fonksiyonlar adlarıyla ayrı dursun: `yolEkle`, `bakimPlanla`, `isAta`, `hatirlaticiOlustur`, `seferKaydet`, `raporAl`.
- Arayüz Türkçe olsun. Sayılar Türk biçiminde (1.234,50) gösterilsin. 1366×768 ekranda kaydırmadan çalışılabilsin. Ekran genişliği 1000 px'in altına inince paneller alt alta dizilsin, hiçbiri gizlenmesin.

## Veri modeli

| Tablo | Alanlar |
|---|---|
| Yollar | ad, kod, çeşit (kullanıcı tanımlı liste), ilçe, uzunluk (km), kaplama (kullanıcı tanımlı liste), koordinat (enlem, boylam), hedef tonaj |
| Seferler (kantar) | id, fiş no, yol, malzeme, tarih-saat, plaka, net (kg) |
| İş emirleri | id, yol, konum (isteğe bağlı), iş türü, öncelik, plan tarihi, termin, durum, periyot, ekip, görevli personel, makine ve kamyonlar (her birine operatör), malzemeler (malzeme, cins, miktar), bağlı talep, açıklama, tamamlanma tarihi |
| Talepler | no (yıl/sıra, örn. 2026/014), konum (enlem, boylam), geliş tarihi, kaynak (vatandaş, muhtarlık, CİMER, meclis üyesi…), talep eden, telefon, yol / yer (tanımlı yol ya da serbest adres), ilçe / mahalle, konu, açıklama, durum (İncelenmedi / İncelendi), inceleme tarihi, sonuç, bağlı iş emri |
| Listeler | iş türleri, yol çeşitleri, kaplama türleri (formlarda öneri olarak çıkar, yazılan yeni değer kendiliğinden eklenir) |
| Ekipler | ad, sorumlu, kişi sayısı, yetkinlik, müsaitlik |
| Kamyonlar | plaka, sahiplik (Müteahhit / Belediye / Kiralık), firma, tür, kapasite (ton, varsayılan 35), ekip, şoför, müsaitlik |
| İş makineleri | kod/plaka, tür (greyder, silindir, finişer…), sahiplik (Belediye / Kiralık), firma, ekip, operatör, müsaitlik |
| Malzemeler | ad, birim (ton, adet, m, m², m³, kg, lt), cinsler (ör. büz için Ø30, Ø60…), kantarda tartılır mı |
| Harita çizimleri | tip (hat / alan / nokta), noktalar, ad, yol, renk, açıklama, katman (KML dosya adı) |
| Hatırlatıcılar | id, iş id, uyarı tipi, zaman, mesaj, okundu |
| İşlem günlüğü | zaman, işlem, detay (son 1000 kayıt) |

## Arayüz düzeni

- Solda koyu renkli dikey menü olsun: Ana ekran, Kantar, Talepler, Harita, Puantaj, Raporlar, Tanımlar, Yedek & Ayarlar (Alt+1…8). Talepler satırında incelenmemiş talep sayısı rozet olarak görünsün. 1440 px ve altındaki ekranlarda menü yalnız ikonlara insin. Dar ekranda menü üste yatay olarak geçsin.
- Üst çubukta sayfa başlığı ve kısa açıklaması, **genel arama (Ctrl+K)**, kritik uyarı ve hatırlatma rozetleri, klasör durumu ve tarih-saat görünsün. Genel arama fiş no, plaka (boşluksuz da yazılabilir), yol, iş, talep no, personel ve makinede arasın; sonuca Enter ile gidilsin.
- **Kurum bilgileri** Ayarlar'dan girilsin: kurum (varsayılan Malatya Büyükşehir Belediyesi), daire başkanlığı (varsayılan Kırsal Hizmetler Dairesi Başkanlığı), şube ve üç imza (Düzenleyen, Kontrol Eden, Onaylayan). Tüm rapor, puantaj ve iş programı çıktılarının başında kurum başlığı, sonunda imza alanı olsun.
- **Güvenli düzenleme:** Kaydedilmemiş bir form varken başka kayda, sekmeye geçilirken ya da sayfa kapatılırken "Kaydet / Kaydetmeden devam / Vazgeç" sorulsun. Silme, tamamlama ve not kapatma gibi işlemlerden sonra birkaç saniye "Geri al" düğmesi çıksın. Bildirimler sağ üstte çıksın ve altındaki düğmelere tıklamayı engellemesin.
- **Klavye kuralları (her formda aynı):** Enter bir sonraki boş zorunlu alana geçer, son alanda kaydeder; Ctrl+Enter her yerden kaydeder; Esc vazgeçer. Tarihler `gg.aa.yyyy` görünür.
- Görünüm sade ve mühendislik ofisine uygun olsun: açık gri zemin, beyaz paneller, ince çizgiler, tek vurgu rengi (lacivert-mavi). Durum renkleri yalnızca durum için kullanılsın ve her zaman ikon ve yazıyla birlikte verilsin.
- Grafikler kütüphanesiz SVG ile çizilsin: son 14 gün nakliye sütun grafiği, yollara göre hedef gerçekleşme çubukları, raporda nakliye grafiği (62 günden uzun dönemde aylık; birden çok yıl varsa ay etiketinde yıl yazsın). Üzerine gelince değer görünsün. Pencere boyutu değişince grafik yeniden çizilsin.
- Veri yokken ana ekranda "Başlarken" adımları gösterilsin: yol ekle → tanımları gir → klasör seç → ilk sefer → ilk iş emri, ya da örnek verilerle dene.
- `?` tuşu ya da menüdeki "Kısayollar" bağlantısı tüm klavye kısayollarını listelesin.

## Ekranlar

### 1. Ana ekran (3 panel)

- **Üstte tek satır özet:** bugün sahadaki iş, bugünkü nakliye, çalışan personel (x/y), bu ay tamamlanan, incelenmemiş talep.
- **Sol panel, yollar:** Arama, tipe göre filtre ve yol listesi. Her satırda yol adı, kod, km, açık iş sayısı, hedef çubuğu ve gecikme varsa kırmızı nokta görünsün. Seçili yolun kartında hedef tonaj, gerçekleşen tonaj ve yüzde çubuğu yer alsın; karttan o yola iş emri açılabilsin. "Genel durum" kutusu açılıp kapanabilsin. "+ Yol" ile yeni yol eklensin.
- **Orta panel, planlar ve geçmiş:** Seçili yolun ya da tüm yolların iş emirleri gösterilsin. Gün, hafta, ay, yıl ve tümü filtresi ile ‹ Bugün › gezgini olsun. Liste ve aylık takvim görünümü bulunsun. İş listesinde arama kutusu olsun. Durum süzgeçleri tek satır olsun (Tümü, Açık, Gecikmiş, Acil, Devam ediyor, Tamamlandı; seyrek kullanılanlar "Diğer…" altında). "Program yazdır" seçili dönemin iş programını kurum başlıklı, imzalı ve "Yapıldı" sütunlu olarak yazdırsın. Durumlar renkli ikonla ayrılsın: planlandı (mavi), devam ediyor (turuncu), tamamlandı (yeşil), acil (kırmızı), gecikmiş (koyu kırmızı), periyodik (mor). Tek tıkla iş detayı sağ panelde açılsın. İş takvimde başka güne sürüklenerek ertelenebilsin.
- **Sağ panel, üç sekme:** *Hatırlatıcılar* (gecikmiş, acil, yaklaşan, periyodik uyarılar ve incelenmemiş talepler; sekmede uyarı sayısı görünsün), *İş emri* (yeni ve düzenle formu) ve *Kaynaklar* (ekip, iş makinesi, ekip kamyonu ve personel kartları). Kartlar orta paneldeki işin üstüne sürüklenerek atanabilsin. Bir iş seçilince ya da yeni iş açılınca form sekmesine geçilsin. Aynı ekip, makine ya da kamyon aynı gün iki ayrı işe atanırsa uyarı verilsin. Formun Kaydet / Tamamlandı / Vazgeç / Sil düğmeleri formun altında sabit dursun. Kaynaklar sekmesinde arama kutusu olsun; yeni ya da düzenlenen bir form açıkken karta tıklamak onu forma eklesin.

- **İş durumu ve tarihler:** İş "Tamamlandı" yapılınca bitiş tarihi alanı açılsın (varsayılan bugün, değiştirilebilir); erken biten işte plan tarihi bitişe çekilsin. Bağlı talebin sonucu "İş tamamlandı" olsun. Tamamlanmış iş takvimde sürüklenemesin. Periyodik işte sonraki iş ilk plan tarihine göre hesaplansın ve bugünden önceye düşmesin; talep bağlantısı yeni işe taşınmasın. Silinen işin notları ve bağlantıları temizlensin.

- **İş emrinde malzeme:** İş emri formunda kullanılacak malzemeler (listeden seçilir ya da yazılır), varsa cinsi ve planlanan miktarı girilsin. Miktar birimi malzeme tanımından gelsin: asfalt ton, büz adet (Ø60, Ø100…), beton m³, bordür m gibi. Adet birimli malzemede küsurat kabul edilmesin. Yalnızca kantarda tartılan malzemeler için iş tarihleri arasında o yola kantardan gelen miktar yanında gösterilsin. Raporlarda malzeme ihtiyacı (malzeme, cins, birim, planlanan / gelen / kalan) tablosu olsun.

- **Kamyonlar ve iş makineleri ayrı tutulsun:** Sezonda kantar fişlerinde müteahhit kamyonları girilir; bunlar ekibin parçası değildir. Bu yüzden kamyonlar kendi tanım listesinde sahiplik (Müteahhit / Belediye / Kiralık) ve firma bilgisiyle tutulsun. Kantara yeni bir plaka girilince otomatik olarak *Müteahhit* kamyonu kaydedilsin. Müteahhit kamyonları yalnızca kantar ve hakedişte görünsün; ekipte kalıcı duran belediye ve kiralık kamyonlar ise iş makineleriyle birlikte iş emrinde ve kaynak kartlarında seçilebilsin (şoför atanabilsin). İş makinesi kodu ile kamyon plakası çakışamasın.

- **Görevlendirme (sade):** İş emrinde önce ekip seçilir; ekibin personeli ve makineleri gelir. Altında tek bir "Görevliler" listesi durur: her kişi kendi satırında, kullandığı makine aynı satırda etiket olarak görünür (Mehmet Kaya — 🚜 FN-01). Kullananı olmayan makine ayrı satırda "kullanan seçin" listesiyle görünür.
  - "+ Kişi / makine seç" düğmesi büyük bir seçim penceresi açar: ekiplere göre gruplu, onay kutulu liste; ekip başlığındaki kutu ekibin hepsini işaretler. Her satırda o tarihler için durum yazar: başka işte (turuncu), izinli/raporlu, arızalı/bakımda (gri) — yine de seçilebilir.
  - Kişi işaretlenince kullandığı makine, makine işaretlenince kullananı da işaretlenir; kendiliğinden gelen işaret, onu getiren kaldırılınca kalkar.
  - Pencerede arama kutusu vardır: yazıp Enter'a basmak en uygun eşleşmeyi işaretler (ı/i, Türkçe harf ve boşluk farkı gözetilmez; tam ad, sonra baş harfler öncelikli). Kayıtlı değilse aynı yerde personel / iş makinesi / kamyon olarak tek tıkla eklenir (plaka, kod ya da ad biçiminden tür tahmin edilir).
  - Satırdaki × kişiyi çıkarır (makinesi "kullanan seçin" satırına düşer); makine etiketindeki × yalnız makineyi çıkarır.
  - Aynı kurallar "Personel & makine" sekmesindeki kartlar işe sürüklenince ya da tıklanınca da uygulanır. Çakışma ve izin uyarıları kayıtta gösterilir.

- **Yerinde tanım:** Veri girmek için önce Tanımlar'a gitmek gerekmesin. İş emrinde yol ve ekip seçimlerinin yanında "+" düğmesi olsun; kantarda yol seçiminin yanında da. Listede olmayan bir malzeme yazılınca birimi satırda seçilsin. Yeni iş türü, yol çeşidi ve kaplama yazıldığı anda listelere eklensin. Yeni yol penceresinde yalnızca ad, çeşit ve ilçe görünsün; diğer bilgiler "Diğer bilgiler" altında açılsın.

### Talepler

- Ayrı bir Talepler sekmesi olsun. Solda hızlı giriş formu (konu ilk alan; yol / yer, ilçe / mahalle, talep eden, telefon, açıklama, geliş tarihi, kaynak, İncelendi işareti ve sonuç), sağda liste dursun. Enter kaydetsin; ardışık girişte tarih ve kaynak korunsun. Sonuç yalnız "İncelendi" işaretliyken tutulsun.
- Talep numarası kendiliğinden verilsin (2026/001, 2026/002…); silinen talebin numarası yeniden verilmesin. Her satırda "→ İş emri" düğmesi olsun.
- Listede incelenmeyenler üstte ve kırmızı işaretli dursun, kaç gündür beklediği yazsın. Satırdaki kutu işaretlenince talep "İncelendi" olsun ve inceleme tarihi kaydedilsin. Tümü / İncelenmedi / İncelendi filtresi ve arama olsun.
- "İş emri aç" düğmesi talebin yolunu, konusunu ve açıklamasını iş emri formuna aktarsın. Yol tanımlı değilse yeni yol olarak eklensin mi diye sorsun. İş emri kaydedilince talep "İncelendi · İş emri verildi" olsun ve iş emrinin durumu talep listesinde görünsün.
- İncelenmemiş talepler hatırlatıcılarda ve ana ekran özetinde görünsün. Yol kartında o yola ait talep sayısı yazsın. Talep listesi Excel'e aktarılsın.

### Puantaj

- Ayrı bir Puantaj sekmesi olsun: satırlarda personel, sütunlarda ayın günleri.
- Bir gün için değişiklik yapılmazsa personel, resmî tatil ve dinî bayramlar dışında **Ç (çalıştı)** görünsün. Tatil günleri otomatik **T** olsun. Hafta tatili günleri (Cumartesi/Pazar) seçilsin; değişiklik seçilen aydan itibaren geçerli olsun, geçmiş aylar değişmesin. Gün başlıkları Pt, Sa, Ça, Pe, Cu, Ct, Pz olsun.
- Hücreye tıklanarak ya da klavyeyle durum değiştirilsin: Ç, Y (yarım gün), TÇ (tatilde çalıştı), İ (yıllık izin), M (mazeret), R (raporlu), G (gelmedi), T, H. Shift ile gün aralığı seçilebilsin, gün başlığından tüm liste için tek seferde işlem yapılsın. Fazla mesai saati ve not girilebilsin; menü dışına tıklanınca girilen değer kaybolmasın.
- Ay sonu toplamları (çalışılan gün, izin, rapor, devamsızlık, tatil, fazla mesai) ve günlük çalışan sayısı görünsün. Excel'e aktarılsın, yatay A4 yazdırılsın (kurum başlığı, ay, ekip ve imza alanıyla).
- Resmî tatiller ve dinî bayramlar (arife yarım gün) programda hazır gelsin; idari izin gibi ek tatiller Tanımlar'dan eklenebilsin, hazır olanlar kapatılabilsin.
- Personel tanımı: ad soyad, görev, sicil no, ekip, makinesi, işe giriş ve ayrılış tarihi, aktif/pasif. Pasif yapılınca ayrılış tarihi bugün olarak girilsin ve kişi ileri tarihli açık işlerden çıkarılsın; geçmiş aylarda çizelgede görünmeye devam etsin.
- Personelin bir iş emrinde görevli olduğu günler çizelgede alt çizgiyle işaretlensin; hücre bilgisinde iş adı görünsün.

### Harita ve çizim (her şey haritada)

- Ayrı bir Harita sekmesi olsun. Altlık olarak sokak haritası ya da uydu görüntüsü kullanılsın (internet gerekir). İnternet yoksa ızgara ve ilçe merkezleri görünsün, çizim yine yapılabilsin.
- Hat (yol güzergâhı), alan (yama, serim bölgesi) ve nokta (menfez, çukur) çizilebilsin. Hatların uzunluğu, alanların m² değeri otomatik hesaplansın.
- Her çizim bir yola atanabilsin; atanan çizimler yolun renginde görünsün. Çizimin noktaları sürüklenerek düzeltilebilsin, adı, rengi ve açıklaması değiştirilebilsin.
- **Katmanlar:** Talepler, açık iş emirleri, tamamlanan işler, kendi çizimlerim, her KML dosyası ayrı katman ve ilçe merkezleri açılıp kapatılabilsin; renk açıklaması katman listesinde dursun. Talep işareti iğne biçiminde ve duruma göre renkli (incelenmedi kırmızı, incelendi turuncu, iş emri verildi mavi, iş tamamlandı yeşil); iş emri işareti kare, durum renginde ve ikonlu. Kendi konumu olmayan iş, yolunun üzerinde gösterilsin; üst üste binen işaretler hafifçe aralansın.
- **Haritadan kayıt:** "📍 Talep" aracıyla haritaya tıklanınca kısa talep formu açılsın, en yakın yol ve ilçe kendiliğinden dolsun ("Kaydet ve iş emri aç" de olsun). "🛠 İş" aracıyla tıklanınca iş emri formu o konum ve en yakın yolla açılsın.
- **Konum seçme:** Talep ve iş emri formlarında "Konum" alanı olsun: koordinat, Google Haritalar bağlantısı ya da derece-dakika-saniye yapıştırılabilsin veya "📍 Haritadan" ile haritaya geçip tıklayarak seçilsin; seçimden sonra form kaldığı yerden devam etsin. Konumu olmayan kayıtlara listelerden "📍 Yer ver" ile yer verilebilsin. Talepten açılan iş emrine konum aktarılsın.
- **Ayrıntı kartı:** İşarete tıklayınca sağda kartı açılsın: talepte konu, talep eden, durum, İncelendi kutusu, "İş emri aç / İş emrine git", "Talebi aç", "Yerini değiştir"; işte ekip, personel, makine, "İş emrini aç", "Tamamlandı", "Yerini değiştir". Yol çiziminde o yolun açık iş ve bekleyen talep sayısı, "Bu yola iş emri" ve "Ana ekranda aç" olsun.
- Sağ panelde Talepler / İşler / Çizimler listeleri olsun; tıklayınca haritada o kayda gidilsin. Haritadaki arama kutusu yol adı/kodu, talep no, çizim adı ve koordinat kabul etsin.
- **KML / KMZ:** Google Earth / Haritam dosyaları düğmeyle ya da haritaya sürükleyip bırakarak yüklensin. Nokta, hat, alan, çoklu geometri, GPS izi, klasörler, açıklamalar, ek veriler ve renkler okunsun; hatlar 1,5 m duyarlılıkla sadeleştirilsin. Önizleme penceresinde öğeler seçilsin; adı (tire, harf farkı gözetmeden) ya da kodu tutan yollar kendiliğinden eşleşsin; istenirse eşleşmeyen hatlar için o adla yeni yol açılsın (uzunluk ve ilçe otomatik). Aynı adlı katman yeniden yüklenirse eskisinin yerine geçsin; katman tek tıkla silinsin ve geri alınabilsin. "KML indir" yolları, çizimleri, konumlu talepleri ve açık işleri Google Earth için klasörlü ve renkli olarak versin.
- Yolun uzunluğu, ona atanmış hatların toplamından güncellenebilsin. Yol kartından "Haritada göster" ile yolun çizimlerine gidilsin. Alan hesabı enleme göre düzeltilsin. Yol silinir ya da adı değişirse haritadaki seçim de güncellensin.

### 2. Kantar girişi (hızlı sefer kaydı)

- Sol tarafta iki kutu alt alta dursun:
  - **Sabit bilgiler:** Yol, malzeme ve tarih. Değiştirilene kadar aynı kalsın, sayfa yenilenince de korunsun.
  - **Sefer:** Fiş no, plaka, net kg, ton karşılığı ve Kaydet düğmesi. Plaka yazılırken öneri listesi çıksın; plaka büyük harfe çevrilsin ve Türkçe harfler (İ, Ş, Ç…) Latin karşılığına dönsün (44 Kİ 303 → 44 KI 303).
  - Gece yarısı geçince sabit tarih kendiliğinden bugüne dönsün.
- **Hızlı mod (varsayılan açık):** Fiş no kendiliğinden 1 artsın, plaka korunsun ve imleç net kg alanına dönsün. Kullanıcı sadece kg yazıp Enter'a bassın. Hızlı mod kapalıyken imleç fiş no alanına dönsün.
- Tab ile alanlar arasında geçilsin, Enter kaydetsin, Esc düzenlemeyi iptal etsin, F2 her ekrandan net kg alanına götürsün.
- **Hata denetimi:** Popup çıkmasın. Hatalı alan kırmızıyla işaretlensin ve altında mesaj görünsün.
  - Fiş no isteğe bağlı olsun, fiş numarası olmayan fişler de girilebilsin. Diğer boş alanlar ve geçersiz net kaydı engellesin.
  - Mükerrer fiş no, kapasite aşımı ve bugünkü kayıtlarda aynı plakanın 10 dakika içinde ikinci seferi uyarı versin. Ayrıca: tarih bugün değilse (gün başına bir kez sorulur), net 1.000 kg'ın altındaysa (ton yazılmış olabilir), plaka ilk kez giriliyorsa ve malzeme yeni yazılıyorsa uyarı çıksın. Kullanıcı ikinci kez Enter'a basarsa kayıt yapılsın. Malzeme adı harf farkıyla yazılırsa (asfalt (bsk)) mevcut tanıma bağlansın.
- **Sağda kayıt ağacı (treeview):**
  - Yapı Yol › Malzeme › Gün › Sefer şeklinde olsun. Kendi kaydırma çubuğu bulunsun.
  - En yeni kayıt en üstte görünsün ve kısa süre vurgulansın.
  - Her sefere bir sıra numarası verilsin.
  - Yol düğümünde hedefe göre yüzde gösterilsin.
  - Seferler × ile silinebilsin, ✎ düğmesi ya da çift tıklama ile düzenlenebilsin. Bir günde 400'den çok sefer varsa ilk 400'ü gösterilip kalanı için not düşülsün.
  - Üstteki filtrede (metin, tarih aralığı) filtrelenmiş sefer sayısı ve toplam ton her zaman görünsün.

### 3. Raporlar

- Üç rapor türü olsun: Nakliye hakediş, Bakım işleri ve Talepler. Tarih, yol, malzeme, firma, plaka ve durum filtreleri olsun. Hızlı tarih düğmeleri: Bugün, Bu hafta, Bu ay, Geçen ay, Bu yıl, Tümü (seçili olan vurgulansın). Başlangıç bitişten sonra girilirse yer değiştirsin. Listede artık bulunmayan bir filtre değeri kendiliğinden sıfırlansın.
- Nakliye için icmal (yol × malzeme, hedef %), günlük nakliye grafiği, günlük özet, firma özeti (müteahhit firma başına araç, sefer, ton ve pay), plaka özeti (firma ile), eksik fiş numaraları ve sefer çarşafı hazırlansın.
- Bakım için iş listesi, durum dağılımı ve ekip/makine kullanımı raporlansın.
- Excel (.xlsx) dosyası kütüphane kullanılmadan üretilsin. Tarihler gerçek tarih hücresi (gg.aa.yyyy) olsun; başlık satırında süzgeç, yazdırmada tekrarlanan başlık, sayfaya sığdırma ve sayfa numarası bulunsun. Sayfalar: İcmal, Günlük, Firma Özeti, Plaka Özeti, Nakliye Çarşafı; bakım raporunda Bakım İşleri ve Malzeme İhtiyacı. Dosya adı `Nakliye_Hakedis_06Ekim2026.xlsx` biçiminde olsun.
- Talep raporunda talep sayısı, incelenmeyen, incelenen, iş emri verilen ve ortalama inceleme süresi; talep listesi, konulara ve kaynaklara göre dağılım yer alsın.
- Bakım raporunda görevli personel ayrı sütunda listelensin.
- PDF için yazdırma kullanılsın, belge başlığı dosya adıyla aynı olsun.

### 4. Tanımlar ve yedek

- Yollar, ekipler, personel, kamyonlar, iş makineleri, malzemeler, listeler (iş türleri, yol çeşitleri, kaplama türleri) ve tatiller tablo üzerinde düzenlenebilsin.
- **Excel'den toplu ekleme:** Her tanım tablosunda "Excel'den toplu ekle" düğmesi olsun. Excel'den kopyalanan satırlar yapıştırılınca hepsi tek seferde eklensin; başlık satırı ve kayıtlı olanlar atlansın. Personel, kamyon ve makinede ekip adı yazılırsa ekip yoksa oluşturulsun; makine/şoför/operatör adları eşleştirilsin. Her tablonun üstünde ne işe yaradığını anlatan tek satırlık açıklama olsun. Bir yol, plaka ya da malzeme yeniden adlandırılırsa bağlı seferler ve işler de güncellensin; kullanımda olan kayıt silinemesin.
- Tanımlar ekranında tablo içi arama kutusu olsun. Yol tablosunda ✎ düğmesi ayrıntı penceresini açsın, "Durum" sütununda hedef %, sefer ve iş sayısı görünsün.
- **Silme kuralları:** Seferi ya da işi olan yol silinemesin; bunun yerine başka bir yolla birleştirilmesi önerilsin (seferler ve işler hedef yola taşınır). Personel, ekip ya da araç silinince yalnız açık işlerden çıkarılsın; geçmiş iş ve raporlarda adı "(silindi)" ekiyle görünmeye devam etsin. Aynı adlı yol (harf, tire, boşluk farkı dahil) ikinci kez eklenemesin.
- **Toplu eklemede** Türkçe başlık satırları ("İş türü", "Ad Soyad"…) tanınıp atlansın; reddedilen satır için ekip oluşturulmasın; toplu eklenen kamyonların sahipliği varsayılan Müteahhit olsun.
- Malzeme tanımında birim, cinsler (virgül ya da noktalı virgülle ayrılır) ve "kantarda tartılır" seçimi yapılsın. Kantar ekranının malzeme listesinde yalnız tartılan malzemeler çıksın.
- Şu ayarlar yapılabilsin: yaklaşan iş gün sayısı, açılışta uyarı penceresi, 10 dakika kuralı, yedek saklama süresi, kurum ve imza bilgileri. Sayısal ayarlar makul aralıkla sınırlansın. Hızlı mod kantar ekranındaki kutudan açılıp kapansın.
- İşlem günlüğü sade olsun: zaman, işlem ve kısa detay.
- JSON yedek indirilip yüklenebilsin, içe aktarma yapılabilsin ve tüm veriler onayla silinebilsin. Örnek veri yalnız boş programa yüklensin.

## Hatırlatıcı kuralları

- **Gecikmiş:** Termini geçmiş ve tamamlanmamış işler. Kırmızı gösterilsin.
- **Acil:** Önceliği acil olan ve açık duran işler. Kırmızı gösterilsin.
- **Başlamadı:** Plan tarihi geçmiş ama hâlâ "Planlandı" durumunda olan işler.
- **Yaklaşan:** Plan tarihi N gün içinde olan işler. Sarı gösterilsin.
- **Periyodik:** Periyodik bir iş tamamlanınca bir sonraki iş kendiliğinden planlansın.
- **Elle eklenen:** Kullanıcı tarih ve mesaj girerek hatırlatıcı ekleyebilsin; nota tıklanınca düzenlenebilsin, kapatılan not geri alınabilsin. İleri tarihli notlar zamanı gelene kadar soluk görünsün.
- Program açıldığında özet uyarı gösterilsin (ayardan kapatılabilsin); maddelere tıklanınca ilgili işe ya da talebe gidilsin. Her kayıt ve değişiklikten sonra liste yenilensin.

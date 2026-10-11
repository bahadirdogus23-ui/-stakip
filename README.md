# Kırsal Yol Bakım ve Şantiye Yönetim Sistemi

Arapgir kırsal yol ağındaki şantiye, iş makinesi, nakliye, hakediş, kriz ve resmi yazışma süreçlerini
tek yerden yöneten, **internet yokken de çalışan** uygulama.

- Telefon, tablet ve bilgisayarda tarayıcıdan çalışır; "Ana ekrana ekle / Uygulamayı yükle" ile uygulama gibi kurulur.
- Tüm veriler önce **cihazın kendi hafızasına** (IndexedDB) yazılır. Sahada çekim olmasa da kayıt yapılır.
- İnternet gelince **Senkronize** ile (veya otomatik) merkez sunucuya gönderilir, diğer cihazların kayıtları alınır.

## Kurulum

### 1. Sunucu (merkez bilgisayar)
Python 3 yüklü bir bilgisayarda (ek paket gerekmez):

- **Windows:** `baslat.bat` dosyasını açıp `KYB_TOKEN` şifresini değiştirin, çift tıklayın.
- **Linux/Mac:** `KYB_TOKEN=sifreniz ./baslat.sh`

Tarayıcıda `http://localhost:8080` açılır. Aynı ağdaki telefonlar `http://<bilgisayarın-IP-adresi>:8080` ile bağlanır.
Veriler `server/veri/kyb.sqlite3` dosyasındadır; sunucu her gün açılışta `server/veri/yedek/` altına yedek alır.

> Sahadan (dışarıdan) bağlanmak için sunucunun internete açılması gerekir (belediye bilgi işlem ile
> statik IP/port yönlendirme veya bir bulut sunucu). İnternete açarken mutlaka güçlü bir `KYB_TOKEN` verin ve HTTPS kullanın.

### 2. Cihazlar
1. Sunucu adresini telefonda açın → tarayıcı menüsünden **Ana ekrana ekle**.
2. **Ayarlar** → Sunucu şifresi girin → Kaydet.
3. **Ayarlar** → **Bildirim izni ver** (hatırlatmalar için).
4. İlk denemede **Örnek veri yükle** ile sistemi tanıyabilirsiniz.

## Modüller

| Menü | İçerik |
|---|---|
| 📊 Panel | Özet sayılar, tüm hatırlatma/uyarılar, araç–operatör–şantiye tahsis tablosu, hızlı giriş butonları |
| 🚜 Filo (Modül 1) | Araçlar, personel (zimmetli araç = operatör eşleştirme), arıza/bakım (araç durumu otomatik güncellenir), yakıt (norm dışı tüketim kırmızı) |
| 🚚 Nakliye (Modül 2) | Nakliye simülasyonu (çevrim süresi, gerekli kamyon, tamamlanma günü, günlük sefer, yakıt+amortisman+personel maliyeti), sefer puantajı (kalan iş %, **şişirilmiş sefer denetimi**), malzeme gideri |
| 🛣 Saha & Kriz (Modül 3) | Şantiyeler, saha işleri, **renkli güzergah lejantı** (Kırmızı: Kazı, Mavi: Dolgu, Sarı: Stabilizasyon…), saat damgalı olay/ihbar kaydı (reaksiyon ve müdahale süresi, tuz/solüsyon), kış vardiyaları |
| 💰 Finans (Modül 4) | **Tarihsel versiyonlu** birim fiyatlar, hakediş (KDV, tevkifat, damga, stopaj, teminat, avans → net), verim raporu |
| 📄 Evrak (Modül 5) | MASKİ hat deplase talebi + teknik rapor, Kaymakamlık/Jandarma dingil yükü denetim talebi, yol hasar tespit tutanağı, genel üst yazı; evrak arşivi; toplantılar (kararlar → görev) |
| 📝 Görev & Hatırlatma | Görevler (kim istedi, son tarih), tekrarlı hatırlatmalar, notlar |
| ⚙ Ayarlar | Senkronizasyon, bildirimler, takvime aktarma, kurum/imza bilgileri, yedek al/yükle |

### Ortak özellikler
- Her listede **arama, tarih aralığı ve hücreye tıklayarak tek tıkla filtre**.
- **⬇ Excel**: filtrelenmiş liste, tek satır başlıklı, otomatik filtreli `.xlsx` (pivot analize hazır).
- **🖨 PDF/Yazdır**: kurum başlıklı rapor (yazdır penceresinde "PDF olarak kaydet").
- Evraklar **Word (.doc)** olarak da indirilir; önizleme metni üzerinde doğrudan düzeltme yapılabilir.

### Hatırlatmalar
Sistem şunları kendiliğinden hatırlatır: gecikmiş/bugünkü/yaklaşan görevler, zamanı gelen hatırlatmalar,
bakımı/muayenesi/sigortası yaklaşan araçlar, 3 günden uzun yatan araçlar, açık ihbarlar, norm dışı yakıt,
şüpheli sefer beyanları, plan gerisindeki şantiyeler, yaklaşan toplantılar, cevap bekleyen evraklar,
kış döneminde planlanmamış vardiya, eski motorin fiyatı, gönderilmemiş veriler ve alınmamış haftalık yedek.

Uygulama tamamen kapalıyken de alarm almak için **Ayarlar → Takvime aktar (.ics)** ile hatırlatmalar,
görev tarihleri ve bakım günleri telefonun takvimine eklenir.

### Birim fiyatlar (önemli)
Fiyat değişince eski satırı değiştirmeyin, **yeni geçerlilik tarihli satır ekleyin**. Her kayıt kendi tarihindeki
fiyatla hesaplanır; geriye dönük raporlar doğru kalır. Hesaplamaların kullandığı kodlar:
`MOTORIN`, `SOFOR_GUNLUK`, `KAMYON_AMORTISMAN_SAAT` (ayrıca `ALT_TEMEL_M3`, `TAS_TOZU_TON`, `CIMENTO_TON`, `TUZ_TON`, `ASFALT_TON`, `OPERATOR_SAAT`).

## Geliştirici notları

```
app/            Web uygulaması (derleme gerektirmez, saf JavaScript modülleri)
  js/schemas.js Tablo tanımları — yeni alan/tablo eklemek için burayı düzenleyin
  js/calc.js    Hesaplama formülleri (nakliye, hakediş, yakıt, verim, fiyat versiyonlama)
  js/db.js      Yerel veritabanı (IndexedDB)    js/sync.js  Senkronizasyon
  sw.js         Çevrimdışı önbellek
server/server.py  Senkronizasyon sunucusu (Python standart kütüphanesi + SQLite)
tests/          node --test tests/   ·   python3 -m unittest discover tests
```

Senkronizasyon: her kayıt değiştirilme zamanı taşır; çakışmada en son değiştirilen kazanır, silmeler de yayılır.

# Yol Bakım ve Nakliye programını tarayıcı izni gerektirmeden çalıştırır.
# Program klasöründe yalnızca bu bilgisayardan erişilebilen küçük bir sunucu açar;
# program kayıtları bu sunucu üzerinden doğrudan klasördeki dosyalara yazılır.
# Baslat.bat tarafından çalıştırılır. Pencere açık kaldığı sürece kayıt yapılır.

$ErrorActionPreference = 'Stop'
$Kok = Split-Path -Parent $MyInvocation.MyCommand.Path
$Utf8 = New-Object System.Text.UTF8Encoding($false)
$GuvenliAd = '^(Yedekler/)?[A-Za-z0-9_.\-]+$'

function Program-Bul {
    $adaylar = Get-ChildItem -LiteralPath $Kok -Filter '*.html' |
        Where-Object { Select-String -LiteralPath $_.FullName -Pattern 'kantar_veri.json' -SimpleMatch -Quiet } |
        Sort-Object LastWriteTime -Descending
    return $adaylar | Select-Object -First 1
}

function Calisiyor-Mu([int]$port) {
    try {
        $r = Invoke-RestMethod -Uri "http://localhost:$port/api/durum" -Headers @{ 'X-Kantar' = '1' } -TimeoutSec 2
        return $r.uygulama -eq 'kantar' -and $r.yol -eq $Kok
    } catch { return $false }
}

function Gonder($yanit, [int]$kod, [string]$metin, [string]$tur = 'application/json; charset=utf-8') {
    $b = $Utf8.GetBytes($metin)
    $yanit.StatusCode = $kod
    $yanit.ContentType = $tur
    $yanit.AddHeader('Cache-Control', 'no-store')
    $yanit.ContentLength64 = $b.Length
    $yanit.OutputStream.Write($b, 0, $b.Length)
}

function Json-Metin([string]$s) {
    return '"' + ($s -replace '\\', '\\' -replace '"', '\"') + '"'
}

function Veri-Yolu([string]$ad) {
    if (-not $ad -or $ad -notmatch $GuvenliAd -or $ad.Contains('..')) { throw 'Geçersiz dosya adı' }
    return Join-Path $Kok ($ad -replace '/', '\')
}

function Degisim-Zamani([string]$yol) {
    return ([DateTimeOffset](Get-Item -LiteralPath $yol).LastWriteTimeUtc).ToUnixTimeMilliseconds()
}

function Dosya-Yaz([string]$hedef, [string]$icerik) {
    $dizin = Split-Path -Parent $hedef
    if (-not (Test-Path -LiteralPath $dizin)) { New-Item -ItemType Directory -Path $dizin | Out-Null }
    $gecici = "$hedef.yaziliyor"
    [System.IO.File]::WriteAllText($gecici, $icerik, $Utf8)
    if (Test-Path -LiteralPath $hedef) {
        try { [System.IO.File]::Replace($gecici, $hedef, [NullString]::Value) }
        catch { [System.IO.File]::Copy($gecici, $hedef, $true); Remove-Item -LiteralPath $gecici -Force }
    } else {
        [System.IO.File]::Move($gecici, $hedef)
    }
}

$TURLER = @{ '.html' = 'text/html; charset=utf-8'; '.htm' = 'text/html; charset=utf-8'; '.js' = 'text/javascript; charset=utf-8';
    '.css' = 'text/css; charset=utf-8'; '.json' = 'application/json; charset=utf-8'; '.png' = 'image/png'; '.jpg' = 'image/jpeg';
    '.svg' = 'image/svg+xml'; '.ico' = 'image/x-icon'; '.kml' = 'application/vnd.google-earth.kml+xml' }

function Api($istek, $yanit, [string]$yol) {
    $ad = $istek.QueryString['ad']
    switch ($yol) {
        '/api/durum' {
            return Gonder $yanit 200 ('{"uygulama":"kantar","klasor":' + (Json-Metin (Split-Path -Leaf $Kok)) + ',"yol":' + (Json-Metin $Kok) + '}')
        }
        '/api/var' {
            $d = Veri-Yolu $ad
            if (-not (Test-Path -LiteralPath $d -PathType Leaf)) { return Gonder $yanit 404 '{}' }
            $yanit.AddHeader('X-Mod', [string](Degisim-Zamani $d))
            return Gonder $yanit 200 '{}'
        }
        '/api/oku' {
            $d = Veri-Yolu $ad
            if (-not (Test-Path -LiteralPath $d -PathType Leaf)) { return Gonder $yanit 404 '{}' }
            $yanit.AddHeader('X-Mod', [string](Degisim-Zamani $d))
            return Gonder $yanit 200 ([System.IO.File]::ReadAllText($d, $Utf8))
        }
        '/api/yaz' {
            if ($istek.HttpMethod -ne 'POST') { return Gonder $yanit 405 '{}' }
            $d = Veri-Yolu $ad
            $okuyucu = New-Object System.IO.StreamReader($istek.InputStream, $Utf8)
            $icerik = $okuyucu.ReadToEnd()
            $okuyucu.Close()
            Dosya-Yaz $d $icerik
            return Gonder $yanit 200 ('{"mod":' + (Degisim-Zamani $d) + '}')
        }
        '/api/sil' {
            if ($istek.HttpMethod -ne 'POST') { return Gonder $yanit 405 '{}' }
            $d = Veri-Yolu $ad
            if (Test-Path -LiteralPath $d -PathType Leaf) { Remove-Item -LiteralPath $d -Force }
            return Gonder $yanit 200 '{}'
        }
        '/api/liste' {
            $alt = $istek.QueryString['klasor']
            if ($alt -and $alt -ne 'Yedekler') { return Gonder $yanit 400 '{}' }
            $dizin = if ($alt) { Join-Path $Kok $alt } else { $Kok }
            $adlar = @()
            if (Test-Path -LiteralPath $dizin) {
                $adlar = Get-ChildItem -LiteralPath $dizin -File | Where-Object { $_.Name -match '^[A-Za-z0-9_.\-]+$' } | ForEach-Object { Json-Metin $_.Name }
            }
            return Gonder $yanit 200 ('[' + ($adlar -join ',') + ']')
        }
        default { return Gonder $yanit 404 '{}' }
    }
}

function Statik($yanit, [string]$yol, $program) {
    if ($yol -eq '/') {
        $yanit.StatusCode = 302
        $yanit.RedirectLocation = '/' + [uri]::EscapeDataString($program.Name)
        return
    }
    $ad = [uri]::UnescapeDataString($yol.TrimStart('/'))
    if (-not $ad -or $ad.Contains('/') -or $ad.Contains('\') -or $ad.Contains('..') -or $ad -like '*.ps1' -or $ad -like '*.bat') { return Gonder $yanit 404 'Bulunamadı' 'text/plain; charset=utf-8' }
    $d = Join-Path $Kok $ad
    if (-not (Test-Path -LiteralPath $d -PathType Leaf)) { return Gonder $yanit 404 'Bulunamadı' 'text/plain; charset=utf-8' }
    $uzanti = [System.IO.Path]::GetExtension($d).ToLowerInvariant()
    $tur = $TURLER[$uzanti]
    if (-not $tur) { $tur = 'application/octet-stream' }
    $b = [System.IO.File]::ReadAllBytes($d)
    $yanit.StatusCode = 200
    $yanit.ContentType = $tur
    $yanit.AddHeader('Cache-Control', 'no-cache')
    $yanit.ContentLength64 = $b.Length
    $yanit.OutputStream.Write($b, 0, $b.Length)
}

# ---------------- Başlat ----------------
$Host.UI.RawUI.WindowTitle = 'Yol Bakım - kayıt sunucusu (kapatmayın)'
$program = Program-Bul
if (-not $program) {
    Write-Host "Bu klasörde program dosyası (.html) bulunamadı: $Kok" -ForegroundColor Red
    Read-Host 'Kapatmak için Enter'
    exit 1
}

$dinleyici = $null
$port = 0
foreach ($p in 8765..8785) {
    if (Calisiyor-Mu $p) {
        Start-Process "http://localhost:$p/$([uri]::EscapeDataString($program.Name))"
        exit 0
    }
    try {
        $dinleyici = New-Object System.Net.HttpListener
        $dinleyici.Prefixes.Add("http://localhost:$p/")
        $dinleyici.Start()
        $port = $p
        break
    } catch {
        $dinleyici = $null
    }
}
if (-not $dinleyici) {
    Write-Host 'Kayıt sunucusu başlatılamadı (8765-8785 portları kullanılamıyor).' -ForegroundColor Red
    Write-Host 'Programı yine de dosyaya çift tıklayarak açabilirsiniz; veriler tarayıcıda güvende kalır.'
    Read-Host 'Kapatmak için Enter'
    exit 1
}

$Adres = "http://localhost:$port"
Write-Host "Yol Bakım programı çalışıyor: $Adres" -ForegroundColor Green
Write-Host "Veriler bu klasöre kaydediliyor: $Kok"
Write-Host 'Program kullanıldığı sürece bu pencereyi KAPATMAYIN (küçültebilirsiniz).'
Start-Process "$Adres/$([uri]::EscapeDataString($program.Name))"

while ($dinleyici.IsListening) {
    $baglam = $dinleyici.GetContext()
    $istek = $baglam.Request
    $yanit = $baglam.Response
    try {
        $yol = $istek.Url.AbsolutePath
        $kaynak = $istek.Headers['Origin']
        # Yalnız bu programın kendi sayfası: başka web siteleri ve DNS yönlendirmeleri reddedilir
        if ($istek.Url.Host -ne 'localhost' -or ($kaynak -and $kaynak -ne $Adres)) {
            Gonder $yanit 403 '{}'
        } elseif ($yol.StartsWith('/api/')) {
            if ($istek.Headers['X-Kantar'] -ne '1') { Gonder $yanit 403 '{}' }
            else { Api $istek $yanit $yol }
        } else {
            Statik $yanit $yol $program
        }
    } catch {
        try { Gonder $yanit 500 ($_.Exception.Message) 'text/plain; charset=utf-8' } catch { }
        Write-Host ("Hata: " + $_.Exception.Message) -ForegroundColor Yellow
    } finally {
        try { $yanit.Close() } catch { }
    }
}

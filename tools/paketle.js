/*
 * Programı tek bir HTML dosyasına paketler: CSS ve JS dosyaları sayfanın içine
 * gömülür. Çıktı internetsiz, kurulumsuz, çift tıklayarak açılır.
 * Kullanım: npm run paketle  ->  dist/MobilyaOlcu.html
 */
'use strict';
const fs = require('fs');
const path = require('path');

const kok = path.join(__dirname, '..');
let html = fs.readFileSync(path.join(kok, 'index.html'), 'utf8');

html = html.replace(/<link rel="stylesheet" href="([^"]+)">/g, (_, dosya) => {
  const css = fs.readFileSync(path.join(kok, dosya), 'utf8');
  return `<style>\n${css}\n</style>`;
});
html = html.replace(/<script src="([^"]+)"><\/script>/g, (_, dosya) => {
  const js = fs.readFileSync(path.join(kok, dosya), 'utf8');
  if (/<\/script/i.test(js)) throw new Error(`${dosya} içinde </script> geçiyor; gömülemez.`);
  return `<script>\n${js}\n</script>`;
});
if (/<script src=|<link rel="stylesheet"/.test(html)) throw new Error('Gömülmemiş dış dosya kaldı.');

fs.mkdirSync(path.join(kok, 'dist'), { recursive: true });
const cikti = path.join(kok, 'dist', 'MobilyaOlcu.html');
fs.writeFileSync(cikti, html);
console.log(`${path.relative(kok, cikti)} (${Math.round(html.length / 1024)} KB)`);

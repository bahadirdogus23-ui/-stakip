// Service worker: uygulama dosyalarını önbelleğe alır, internet yokken de açılır.
// Dosyalar değiştiğinde SURUM'u artırın.
const SURUM = 'kyb-v1';
const DOSYALAR = [
  './', 'index.html', 'manifest.webmanifest', 'icon.svg', 'css/style.css',
  'js/app.js', 'js/db.js', 'js/sync.js', 'js/ui.js', 'js/util.js', 'js/calc.js', 'js/domain.js',
  'js/schemas.js', 'js/reports.js', 'js/reminders.js', 'js/views.js', 'js/evrak.js', 'js/xlsx.js', 'js/demo.js',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SURUM).then(c => c.addAll(DOSYALAR)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== SURUM).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Ağ öncelikli (sahada eski sürümde kalmamak için); ağ yoksa ya da zayıf çekimde
// 4 saniyede yanıt gelmezse önbellekten açılır.
const onbellekten = req => caches.match(req, { ignoreSearch: true })
  .then(r => r || (req.mode === 'navigate' ? caches.match('index.html') : undefined));

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.includes('/api/')) return;
  const ag = fetch(e.request).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(SURUM).then(c => c.put(e.request, copy)); }
    return res;
  });
  const zamanAsimi = new Promise(res => setTimeout(res, 4000)).then(() => onbellekten(e.request));
  e.respondWith(
    Promise.race([ag, zamanAsimi.then(r => r || ag)])
      .catch(() => onbellekten(e.request).then(r => r || Response.error()))
  );
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window' }).then(list => {
    if (list.length) return list[0].focus();
    return self.clients.openWindow('./#panel/ozet');
  }));
});

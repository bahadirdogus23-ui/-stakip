#!/usr/bin/env python3
"""Kırsal Yol Bakım - senkronizasyon sunucusu.

Yalnızca Python standart kütüphanesi kullanır (ek kurulum gerekmez).
- Uygulama dosyalarını (../app) sunar.
- /api/sync: cihazlardan gelen değişiklikleri SQLite veritabanına yazar,
  cihaza diğer cihazların değişikliklerini döndürür. Çakışmada en son
  değiştirilen kayıt kazanır.

Çalıştırma:   python3 server.py
Ayarlar (ortam değişkenleri):
  KYB_PORT   dinlenecek port (varsayılan 8080)
  KYB_TOKEN  sunucu şifresi (boşsa şifre istenmez; ağa açıksa mutlaka verin)
  KYB_DB     veritabanı dosyası (varsayılan server/veri/kyb.sqlite3)
"""
import datetime
import hmac
import json
import os
import sqlite3
import sys
import threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.abspath(__file__))
APP_DIR = os.path.normpath(os.path.join(ROOT, '..', 'app'))
MAX_BODY = 50 * 1024 * 1024

_lock = threading.Lock()


def connect(path):
    if path != ':memory:':
        os.makedirs(os.path.dirname(path), exist_ok=True)
    conn = sqlite3.connect(path, check_same_thread=False)
    conn.execute('PRAGMA journal_mode=WAL')
    conn.executescript('''
        CREATE TABLE IF NOT EXISTS records (
            c   TEXT NOT NULL,
            id  TEXT NOT NULL,
            d   TEXT,
            u   INTEGER NOT NULL,
            del INTEGER NOT NULL DEFAULT 0,
            seq INTEGER NOT NULL,
            PRIMARY KEY (c, id)
        );
        CREATE INDEX IF NOT EXISTS idx_records_seq ON records(seq);
    ''')
    return conn


def gunluk_yedek(conn, path):
    """Sunucu her açıldığında günde bir yedek kopya alır."""
    if path == ':memory:':
        return
    klasor = os.path.join(os.path.dirname(path), 'yedek')
    os.makedirs(klasor, exist_ok=True)
    hedef = os.path.join(klasor, f'kyb-{datetime.date.today():%Y%m%d}.sqlite3')
    if not os.path.exists(hedef):
        with sqlite3.connect(hedef) as dst:
            conn.backup(dst)


class GecersizIstek(ValueError):
    pass


def apply_sync(conn, since, changes):
    if not isinstance(since, int) or not isinstance(changes, list):
        raise GecersizIstek('since (sayı) ve changes (liste) gerekli')
    with _lock, conn:
        seq = conn.execute('SELECT COALESCE(MAX(seq), 0) FROM records').fetchone()[0]
        for ch in changes:
            if not isinstance(ch, dict):
                raise GecersizIstek('geçersiz kayıt')
            c, rid, u = ch.get('c'), ch.get('id'), ch.get('u')
            if not isinstance(c, str) or not isinstance(rid, str) or not isinstance(u, int) or not c or not rid:
                raise GecersizIstek('kayıtta c, id, u alanları eksik')
            row = conn.execute('SELECT u FROM records WHERE c=? AND id=?', (c, rid)).fetchone()
            if row and row[0] >= u:
                continue  # sunucudaki daha yeni
            seq += 1
            conn.execute(
                '''INSERT INTO records (c, id, d, u, del, seq) VALUES (?, ?, ?, ?, ?, ?)
                   ON CONFLICT(c, id) DO UPDATE SET d=excluded.d, u=excluded.u, del=excluded.del, seq=excluded.seq''',
                (c, rid, json.dumps(ch.get('d'), ensure_ascii=False), u, 1 if ch.get('del') else 0, seq))
        rows = conn.execute('SELECT c, id, d, u, del FROM records WHERE seq > ? ORDER BY seq', (since,)).fetchall()
    return {
        'seq': seq,
        'changes': [{'c': c, 'id': i, 'd': json.loads(d) if d else None, 'u': u, 'del': bool(dl)} for c, i, d, u, dl in rows],
    }


class Handler(SimpleHTTPRequestHandler):
    conn = None
    token = ''

    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, X-Token')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        if self.path.split('?')[0].endswith(('sw.js', '.html', '/')):
            self.send_header('Cache-Control', 'no-cache')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

    def _json(self, status, obj):
        body = json.dumps(obj, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _yetkili(self):
        return not self.token or hmac.compare_digest(self.headers.get('X-Token', ''), self.token)

    def do_GET(self):
        if self.path.startswith('/api/durum'):
            return self._json(200, {'durum': 'ok', 'zaman': datetime.datetime.now().isoformat()})
        return super().do_GET()

    def do_POST(self):
        if self.path.split('?')[0] != '/api/sync':
            return self._json(404, {'hata': 'bulunamadı'})
        if not self._yetkili():
            return self._json(401, {'hata': 'şifre hatalı'})
        try:
            n = int(self.headers.get('Content-Length', 0))
            if n > MAX_BODY:
                return self._json(413, {'hata': 'istek çok büyük'})
            data = json.loads(self.rfile.read(n) or b'{}')
            return self._json(200, apply_sync(self.conn, data.get('since', 0), data.get('changes', [])))
        except (json.JSONDecodeError, GecersizIstek) as e:
            return self._json(400, {'hata': str(e)})


def main():
    port = int(os.environ.get('KYB_PORT', 8080))
    db_path = os.environ.get('KYB_DB', os.path.join(ROOT, 'veri', 'kyb.sqlite3'))
    conn = connect(db_path)
    gunluk_yedek(conn, db_path)
    Handler.conn = conn
    Handler.token = os.environ.get('KYB_TOKEN', '')
    httpd = ThreadingHTTPServer(('0.0.0.0', port), partial(Handler, directory=APP_DIR))
    print(f'Kırsal Yol Bakım sunucusu: http://localhost:{port}  (veri: {db_path})')
    if not Handler.token:
        print('UYARI: KYB_TOKEN tanımlı değil, sunucu şifresiz çalışıyor.', file=sys.stderr)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == '__main__':
    main()

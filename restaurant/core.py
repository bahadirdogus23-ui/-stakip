import os
import secrets
import sqlite3
import threading
from pathlib import Path
from datetime import datetime
from contextlib import contextmanager, closing

class Store:
    def __init__(self, directory):
        self.directory = Path(directory)
        self.directory.mkdir(parents=True, exist_ok=True)
        self.path = self.directory / 'lokanta.sqlite3'
        self.lock = threading.RLock()
        with self.connect() as db:
            db.executescript('''
            CREATE TABLE IF NOT EXISTS tables(id INTEGER PRIMARY KEY, name TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS products(id INTEGER PRIMARY KEY, name TEXT NOT NULL, price INTEGER NOT NULL CHECK(price>0), active INTEGER DEFAULT 1);
            CREATE TABLE IF NOT EXISTS orders(id INTEGER PRIMARY KEY, table_id INTEGER REFERENCES tables(id), status TEXT DEFAULT 'open', created TEXT DEFAULT CURRENT_TIMESTAMP, closed TEXT, payment TEXT);
            CREATE UNIQUE INDEX IF NOT EXISTS one_open ON orders(table_id) WHERE status='open';
            CREATE TABLE IF NOT EXISTS items(id INTEGER PRIMARY KEY, order_id INTEGER REFERENCES orders(id), name TEXT, price INTEGER, qty INTEGER CHECK(qty>0), note TEXT, state TEXT DEFAULT 'Yeni', waiter TEXT);
            CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT);
            ''')
            if not db.execute('SELECT 1 FROM tables').fetchone():
                db.executemany('INSERT INTO tables(name) VALUES(?)', [(f'Masa {i}',) for i in range(1,13)])
            if not db.execute('SELECT 1 FROM products').fetchone():
                db.executemany('INSERT INTO products(name,price) VALUES(?,?)', [('Mercimek çorbası',9000),('Izgara köfte',25000),('Tavuk şiş',23000),('Mevsim salata',11000),('Ayran',3500),('Çay',2000)])
            db.execute('INSERT OR IGNORE INTO settings VALUES(?,?)', ('pin',str(secrets.randbelow(900000)+100000)))
        self.backup()

    @contextmanager
    def connect(self):
        db = sqlite3.connect(self.path, timeout=15)
        try:
            db.row_factory = sqlite3.Row
            db.execute('PRAGMA foreign_keys=ON')
            with db:
                yield db
        finally:
            db.close()

    def pin(self):
        with self.connect() as db:
            return db.execute("SELECT value FROM settings WHERE key='pin'").fetchone()[0]

    def snapshot(self):
        with self.connect() as db:
            tables = [dict(r) for r in db.execute('''SELECT t.*, o.id AS order_id, COALESCE(SUM(i.price*i.qty),0) AS total FROM tables t LEFT JOIN orders o ON o.table_id=t.id AND o.status='open' LEFT JOIN items i ON i.order_id=o.id GROUP BY t.id ORDER BY t.id''')]
            products = [dict(r) for r in db.execute('SELECT * FROM products WHERE active=1 ORDER BY id')]
            items = [dict(r) for r in db.execute("SELECT i.*,o.table_id FROM items i JOIN orders o ON o.id=i.order_id WHERE o.status='open' ORDER BY i.id")]
            report = dict(db.execute("SELECT COUNT(*) AS count,COALESCE(SUM(total),0) AS total FROM (SELECT o.id, SUM(i.price*i.qty) total FROM orders o JOIN items i ON i.order_id=o.id WHERE o.status='paid' AND date(o.closed,'localtime')=date('now','localtime') GROUP BY o.id)").fetchone())
        return dict(tables=tables, products=products, items=items, report=report)

    def add(self, table, product, qty=1, note='', waiter='Kasa'):
        if type(qty) is not int or not 1 <= qty <= 99:
            raise ValueError('Adet 1–99 arasında olmalı.')
        if len(note)>300 or not 1 <= len(waiter.strip()) <= 50:
            raise ValueError('Garson adı gerekli; not en fazla 300 karakter olabilir.')
        with self.lock, self.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            if not db.execute('SELECT 1 FROM tables WHERE id=?',(table,)).fetchone():
                raise ValueError('Masa bulunamadı.')
            p = db.execute('SELECT * FROM products WHERE id=? AND active=1',(product,)).fetchone()
            if not p: raise ValueError('Ürün bulunamadı.')
            db.execute("INSERT OR IGNORE INTO orders(table_id) VALUES(?)",(table,))
            order = db.execute("SELECT id FROM orders WHERE table_id=? AND status='open'",(table,)).fetchone()[0]
            db.execute('INSERT INTO items(order_id,name,price,qty,note,waiter) VALUES(?,?,?,?,?,?)',(order,p['name'],p['price'],qty,note.strip(),waiter.strip()))
        self.backup()

    def pay(self, table, method):
        if method not in ('Nakit','Kart'): raise ValueError('Ödeme türü geçersiz.')
        with self.lock, self.connect() as db:
            changed = db.execute("UPDATE orders SET status='paid',closed=CURRENT_TIMESTAMP,payment=? WHERE table_id=? AND status='open'",(method,table)).rowcount
            if not changed: raise ValueError('Masanın açık hesabı yok.')
        self.backup()

    def set_state(self, item, state):
        if state not in ('Yeni','Hazırlanıyor','Servis edildi'): raise ValueError('Durum geçersiz.')
        with self.lock, self.connect() as db:
            db.execute("UPDATE items SET state=? WHERE id=? AND order_id IN (SELECT id FROM orders WHERE status='open')",(state,item))
        self.backup()

    def product(self, name, price):
        if not name.strip() or price<=0: raise ValueError('Geçerli ürün adı ve fiyat girin.')
        with self.lock, self.connect() as db:
            db.execute('INSERT INTO products(name,price) VALUES(?,?)',(name.strip(),price))
        self.backup()

    def backup(self):
        with self.lock:
            folder = self.directory / 'yedekler'
            folder.mkdir(exist_ok=True)
            target = folder / (datetime.now().strftime('%Y%m%d-%H%M%S-%f')+'.sqlite3')
            with self.connect() as source, closing(sqlite3.connect(target)) as dest:
                source.backup(dest)
            for old in sorted(folder.glob('*.sqlite3'))[:-100]: old.unlink()
        return target


def default_directory():
    return Path(os.environ.get('LOCALAPPDATA', Path.home())) / 'LokantaTakip'

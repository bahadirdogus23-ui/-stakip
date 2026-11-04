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
            db.execute("CREATE TABLE IF NOT EXISTS sections(id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE)")
            if not db.execute("SELECT 1 FROM sections").fetchone():
                db.execute("INSERT INTO sections(id,name) VALUES(1,'Salon')")
            columns = {r['name'] for r in db.execute('PRAGMA table_info(tables)')}
            if 'section_id' not in columns:
                db.execute('ALTER TABLE tables ADD COLUMN section_id INTEGER NOT NULL DEFAULT 1')
            if 'active' not in columns:
                db.execute('ALTER TABLE tables ADD COLUMN active INTEGER NOT NULL DEFAULT 1')
            db.execute("CREATE TABLE IF NOT EXISTS payments(id INTEGER PRIMARY KEY, order_id INTEGER NOT NULL UNIQUE REFERENCES orders(id), method TEXT NOT NULL, total INTEGER NOT NULL, received INTEGER NOT NULL, change_amount INTEGER NOT NULL, created TEXT DEFAULT CURRENT_TIMESTAMP)")
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
            tables = [dict(r) for r in db.execute('''SELECT t.*, o.id AS order_id, COALESCE(SUM(i.price*i.qty),0) AS total FROM tables t LEFT JOIN orders o ON o.table_id=t.id AND o.status='open' LEFT JOIN items i ON i.order_id=o.id WHERE t.active=1 GROUP BY t.id ORDER BY t.id''')]
            products = [dict(r) for r in db.execute('SELECT * FROM products WHERE active=1 ORDER BY id')]
            items = [dict(r) for r in db.execute("SELECT i.*,o.table_id FROM items i JOIN orders o ON o.id=i.order_id WHERE o.status='open' ORDER BY i.id")]
            report = dict(db.execute("SELECT COUNT(*) AS count,COALESCE(SUM(total),0) AS total FROM (SELECT o.id, SUM(i.price*i.qty) total FROM orders o JOIN items i ON i.order_id=o.id WHERE o.status='paid' AND date(o.closed,'localtime')=date('now','localtime') GROUP BY o.id)").fetchone())
            sections = [dict(r) for r in db.execute('SELECT * FROM sections ORDER BY id')]
            payments = [dict(r) for r in db.execute("SELECT p.*,t.name AS table_name FROM payments p JOIN orders o ON o.id=p.order_id JOIN tables t ON t.id=o.table_id ORDER BY p.id DESC LIMIT 100")]
        return dict(tables=tables, products=products, items=items, report=report, sections=sections, payments=payments)

    def add(self, table, product, qty=1, note='', waiter='Kasa'):
        if type(qty) is not int or not 1 <= qty <= 99:
            raise ValueError('Adet 1–99 arasında olmalı.')
        if len(note)>300 or not 1 <= len(waiter.strip()) <= 50:
            raise ValueError('Garson adı gerekli; not en fazla 300 karakter olabilir.')
        with self.lock, self.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            if not db.execute('SELECT 1 FROM tables WHERE id=? AND active=1',(table,)).fetchone():
                raise ValueError('Masa bulunamadı.')
            p = db.execute('SELECT * FROM products WHERE id=? AND active=1',(product,)).fetchone()
            if not p: raise ValueError('Ürün bulunamadı.')
            db.execute("INSERT OR IGNORE INTO orders(table_id) VALUES(?)",(table,))
            order = db.execute("SELECT id FROM orders WHERE table_id=? AND status='open'",(table,)).fetchone()[0]
            db.execute('INSERT INTO items(order_id,name,price,qty,note,waiter) VALUES(?,?,?,?,?,?)',(order,p['name'],p['price'],qty,note.strip(),waiter.strip()))
        self.backup()

    def pay(self, table, method, received=None, expected_total=None):
        if method not in ('Nakit','Kart'): raise ValueError('Ödeme türü geçersiz.')
        with self.lock, self.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            order = db.execute("SELECT o.id,COALESCE(SUM(i.price*i.qty),0) total FROM orders o LEFT JOIN items i ON i.order_id=o.id WHERE o.table_id=? AND o.status='open' GROUP BY o.id",(table,)).fetchone()
            if not order: raise ValueError('Masanın açık hesabı yok.')
            total=order['total']
            if expected_total is not None and total != expected_total:
                raise ValueError('Adisyona yeni sipariş eklendi. Tutarı kontrol edip ödemeyi tekrar açın.')
            received=total if received is None or method=='Kart' else received
            if type(received) is not int or received<total: raise ValueError('Alınan tutar toplamdan az olamaz.')
            change=received-total
            db.execute('INSERT INTO payments(order_id,method,total,received,change_amount) VALUES(?,?,?,?,?)',(order['id'],method,total,received,change))
            db.execute("UPDATE orders SET status='paid',closed=CURRENT_TIMESTAMP,payment=? WHERE id=?",(method,order['id']))
        self.backup()
        return dict(total=total,received=received,change=change,method=method)

    def add_section(self, name):
        name=name.strip()
        if not name or len(name)>50: raise ValueError('Bölüm adı 1–50 karakter olmalı.')
        with self.lock, self.connect() as db:
            try: db.execute('INSERT INTO sections(name) VALUES(?)',(name,))
            except sqlite3.IntegrityError: raise ValueError('Bu bölüm zaten var.')
        self.backup()

    def remove_section(self, section):
        with self.lock, self.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            if db.execute('SELECT 1 FROM tables WHERE section_id=? AND active=1',(section,)).fetchone():
                raise ValueError('Önce bu bölümdeki masaları taşıyın veya kaldırın.')
            if db.execute('SELECT COUNT(*) FROM sections').fetchone()[0]<=1:
                raise ValueError('En az bir bölüm bulunmalı.')
            # Removed tables retain their history in the default remaining section.
            other=db.execute('SELECT id FROM sections WHERE id<>? LIMIT 1',(section,)).fetchone()[0]
            db.execute('UPDATE tables SET section_id=? WHERE section_id=?',(other,section))
            db.execute('DELETE FROM sections WHERE id=?',(section,))
        self.backup()

    def save_table(self, name, section, table=None):
        name=name.strip()
        if not name or len(name)>50: raise ValueError('Masa adı 1–50 karakter olmalı.')
        with self.lock, self.connect() as db:
            if not db.execute('SELECT 1 FROM sections WHERE id=?',(section,)).fetchone():raise ValueError('Bölüm bulunamadı.')
            if db.execute('SELECT 1 FROM tables WHERE name=? AND active=1 AND id<>?',(name,table or -1)).fetchone():raise ValueError('Bu masa adı kullanılıyor.')
            if table is None:db.execute('INSERT INTO tables(name,section_id) VALUES(?,?)',(name,section))
            else:
                if not db.execute('UPDATE tables SET name=?,section_id=? WHERE id=? AND active=1',(name,section,table)).rowcount:raise ValueError('Masa bulunamadı.')
        self.backup()

    def remove_table(self, table):
        with self.lock, self.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            if db.execute("SELECT 1 FROM orders WHERE table_id=? AND status='open'",(table,)).fetchone():raise ValueError('Açık hesabı olan masa kaldırılamaz.')
            db.execute('UPDATE tables SET active=0 WHERE id=?',(table,))
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

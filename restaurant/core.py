import os
import hashlib
import hmac
import json
import secrets
import sqlite3
import threading
from pathlib import Path
from datetime import datetime, timedelta, date
from contextlib import contextmanager, closing

class Store:
    def __init__(self, directory):
        self.directory = Path(directory)
        self.directory.mkdir(parents=True, exist_ok=True)
        self.path = self.directory / 'lokanta.sqlite3'
        self.lock = threading.RLock()
        if self.path.exists():
            with self.connect() as db:
                if db.execute('PRAGMA quick_check').fetchone()[0]!='ok':raise ValueError('Veritabanı bütünlük kontrolü başarısız. Veri dosyasını koruyup doğrulanmış bir yedeğe dönün.')
                tables={r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
                if db.execute('PRAGMA user_version').fetchone()[0]<2 and {'tables','orders','items','products','settings'}<=tables:
                    from restaurant.backups import save_connection
                    save_connection(db,self.directory/'yedekler'/'gecis-oncesi'/(datetime.now().strftime('%Y%m%d-%H%M%S-%f')+'.sqlite3'))
        with self.connect() as db:
            db.execute('PRAGMA journal_mode=WAL')
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
            if 'epoch' not in {r['name'] for r in db.execute('PRAGMA table_info(tables)')}:
                db.execute('ALTER TABLE tables ADD COLUMN epoch INTEGER NOT NULL DEFAULT 0')
            db.execute('CREATE TABLE IF NOT EXISTS submitted_orders(waiter_id INTEGER NOT NULL REFERENCES waiters(id), request_id TEXT NOT NULL, fingerprint TEXT NOT NULL, PRIMARY KEY(waiter_id,request_id))')
            db.execute("CREATE TABLE IF NOT EXISTS waiters(id INTEGER PRIMARY KEY, username TEXT NOT NULL UNIQUE, name TEXT NOT NULL, password_hash TEXT NOT NULL, salt TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, version INTEGER NOT NULL DEFAULT 1)")
            if 'waiter_id' not in {r['name'] for r in db.execute('PRAGMA table_info(items)')}:
                db.execute('ALTER TABLE items ADD COLUMN waiter_id INTEGER REFERENCES waiters(id)')
            if 'cancelled' not in {r['name'] for r in db.execute('PRAGMA table_info(items)')}:
                db.execute('ALTER TABLE items ADD COLUMN cancelled INTEGER NOT NULL DEFAULT 0')
            db.execute('CREATE TABLE IF NOT EXISTS cancellations(item_id INTEGER PRIMARY KEY REFERENCES items(id), actor TEXT NOT NULL, actor_id INTEGER REFERENCES waiters(id), reason TEXT NOT NULL, created TEXT DEFAULT CURRENT_TIMESTAMP)')
            db.execute('CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, table_id INTEGER REFERENCES tables(id), actor TEXT NOT NULL, detail TEXT NOT NULL, created TEXT DEFAULT CURRENT_TIMESTAMP)')
            if not db.execute('SELECT 1 FROM tables').fetchone():
                db.executemany('INSERT INTO tables(name) VALUES(?)', [(f'Masa {i}',) for i in range(1,13)])
            if not db.execute('SELECT 1 FROM products').fetchone():
                db.executemany('INSERT INTO products(name,price) VALUES(?,?)', [('Mercimek çorbası',9000),('Izgara köfte',25000),('Tavuk şiş',23000),('Mevsim salata',11000),('Ayran',3500),('Çay',2000)])
            db.execute('INSERT OR IGNORE INTO settings VALUES(?,?)', ('pin',str(secrets.randbelow(900000)+100000)))
            db.execute('PRAGMA user_version=2')
        self.auto_backup()

    @contextmanager
    def connect(self):
        db = sqlite3.connect(self.path, timeout=15)
        try:
            db.row_factory = sqlite3.Row
            db.execute('PRAGMA foreign_keys=ON')
            db.execute('PRAGMA synchronous=FULL')
            with db:
                yield db
        finally:
            db.close()

    def pin(self):
        with self.connect() as db:
            return db.execute("SELECT value FROM settings WHERE key='pin'").fetchone()[0]

    def snapshot(self):
        with self.connect() as db:
            db.execute('BEGIN')
            tables = [dict(r) for r in db.execute('''SELECT t.*, o.id AS order_id, COALESCE(SUM(CASE WHEN i.cancelled=0 THEN i.price*i.qty ELSE 0 END),0) AS total FROM tables t LEFT JOIN orders o ON o.table_id=t.id AND o.status='open' LEFT JOIN items i ON i.order_id=o.id WHERE t.active=1 GROUP BY t.id ORDER BY t.id''')]
            products = [dict(r) for r in db.execute('SELECT * FROM products WHERE active=1 ORDER BY id')]
            items = [dict(r) for r in db.execute("SELECT i.*,o.table_id,c.reason AS cancel_reason,c.actor AS cancelled_by FROM items i JOIN orders o ON o.id=i.order_id LEFT JOIN cancellations c ON c.item_id=i.id WHERE o.status='open' ORDER BY i.id")]
            report = dict(db.execute("SELECT COUNT(*) AS count,COALESCE(SUM(total),0) AS total FROM (SELECT o.id, SUM(CASE WHEN i.cancelled=0 THEN i.price*i.qty ELSE 0 END) total FROM orders o JOIN items i ON i.order_id=o.id WHERE o.status='paid' AND date(o.closed,'localtime')=date('now','localtime') GROUP BY o.id)").fetchone())
            sections = [dict(r) for r in db.execute('SELECT * FROM sections ORDER BY id')]
            payments = [dict(r) for r in db.execute("SELECT p.*,t.name AS table_name FROM payments p JOIN orders o ON o.id=p.order_id JOIN tables t ON t.id=o.table_id ORDER BY p.id DESC LIMIT 100")]
        return dict(tables=tables, products=products, items=items, report=report, sections=sections, payments=payments)

    def add(self, table, product, qty=1, note='', waiter='Kasa', waiter_id=None, request_id=None, expected_epoch=None):
        # Retain the fingerprint used by older offline clients.
        fingerprint=hashlib.sha256(json.dumps([table,product,qty,note,expected_epoch],ensure_ascii=False).encode()).hexdigest()
        return self._submit(table,[dict(product=product,qty=qty,note=note)],waiter,waiter_id,request_id,expected_epoch,fingerprint)

    def add_batch(self, table, items, waiter_id, request_id, expected_epoch):
        if type(expected_epoch) is not int or expected_epoch<0:raise ValueError('Masa bilgisini yenileyin.')
        fingerprint=hashlib.sha256(json.dumps(['batch-v1',table,items,expected_epoch],ensure_ascii=False,sort_keys=True).encode()).hexdigest()
        return self._submit(table,items,'Garson',waiter_id,request_id,expected_epoch,fingerprint)

    def _submit(self,table,items,waiter,waiter_id,request_id,expected_epoch,fingerprint):
        if type(table) is not int or not isinstance(items,list) or not 1<=len(items)<=50:
            raise ValueError('Bir masa ve 1–50 arasında ürün satırı seçin.')
        for item in items:
            if not isinstance(item,dict) or type(item.get('product')) is not int:raise ValueError('Ürün bilgisi geçersiz.')
            if type(item.get('qty')) is not int or not 1<=item['qty']<=99:raise ValueError('Adet 1–99 arasında olmalı.')
            if not isinstance(item.get('note',''),str) or len(item.get('note',''))>300:raise ValueError('Not en fazla 300 karakter olabilir.')
        if not 1<=len(waiter.strip())<=50:raise ValueError('Garson adı gerekli.')
        if request_id is not None and (not isinstance(request_id,str) or not 16<=len(request_id)<=100 or waiter_id is None):raise ValueError('Sipariş kimliği geçersiz.')
        with self.lock, self.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            if request_id is not None:
                prior=db.execute('SELECT fingerprint FROM submitted_orders WHERE waiter_id=? AND request_id=?',(waiter_id,request_id)).fetchone()
                if prior:
                    if prior['fingerprint']!=fingerprint:raise ValueError('Sipariş kimliği farklı bilgilerle kullanılmış.')
                    return dict(duplicate=True)
            current=db.execute('SELECT epoch FROM tables WHERE id=? AND active=1',(table,)).fetchone()
            if not current:raise ValueError('Masa bulunamadı.')
            if expected_epoch is not None and current['epoch']!=expected_epoch:raise ValueError('Masanın önceki hesabı kapatılmış. Bekleyen siparişi kontrol edin; gerekirse silip yeniden girin.')
            if waiter_id is not None:
                account=db.execute('SELECT name FROM waiters WHERE id=? AND active=1',(waiter_id,)).fetchone()
                if not account:raise ValueError('Garson hesabı aktif değil.')
                waiter=account['name']
            products=[]
            for item in items:
                product=db.execute('SELECT name,price FROM products WHERE id=? AND active=1',(item['product'],)).fetchone()
                if not product:raise ValueError('Ürün artık menüde yok; sepeti kontrol edin.')
                products.append(product)
            db.execute("INSERT OR IGNORE INTO orders(table_id) VALUES(?)",(table,))
            order=db.execute("SELECT id FROM orders WHERE table_id=? AND status='open'",(table,)).fetchone()[0]
            for item,product in zip(items,products):
                db.execute('INSERT INTO items(order_id,name,price,qty,note,waiter,waiter_id) VALUES(?,?,?,?,?,?,?)',(order,product['name'],product['price'],item['qty'],item.get('note','').strip(),waiter.strip(),waiter_id))
            if request_id is not None:db.execute('INSERT INTO submitted_orders VALUES(?,?,?)',(waiter_id,request_id,fingerprint))
            if waiter_id is not None:
                detail=', '.join(f"{item['qty']} × {product['name']}" for item,product in zip(items,products))
                db.execute("INSERT INTO events(kind,table_id,actor,detail) VALUES('order',?,?,?)",(table,waiter,detail))
        self.auto_backup()
        return dict(duplicate=False,order_id=order)

    def cancel_items(self,item_ids,reason,waiter_id=None):
        if not isinstance(reason,str) or not 3<=len(reason.strip())<=300:raise ValueError('İptal nedeni 3–300 karakter olmalı.')
        if not isinstance(item_ids,list) or not 1<=len(item_ids)<=100 or any(type(i) is not int for i in item_ids):raise ValueError('İptal edilecek siparişi seçin.')
        with self.lock, self.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            actor='Kasa'
            if waiter_id is not None:
                user=db.execute('SELECT name FROM waiters WHERE id=? AND active=1',(waiter_id,)).fetchone()
                if not user:raise ValueError('Garson hesabı aktif değil.')
                actor=user['name']
            rows=[]
            for item_id in set(item_ids):
                row=db.execute('SELECT i.*,o.status,o.table_id FROM items i JOIN orders o ON o.id=i.order_id WHERE i.id=?',(item_id,)).fetchone()
                if not row:raise ValueError('Sipariş bulunamadı.')
                if waiter_id is not None and row['waiter_id']!=waiter_id:raise ValueError('Yalnız kendi girdiğiniz siparişi iptal edebilirsiniz.')
                if row['cancelled']:continue
                if row['status']!='open':raise ValueError('Ödemesi alınan veya kapanmış sipariş iptal edilemez.')
                rows.append(row)
            for row in rows:
                db.execute('UPDATE items SET cancelled=1,state=? WHERE id=?',('İptal',row['id']))
                db.execute('INSERT INTO cancellations(item_id,actor,actor_id,reason) VALUES(?,?,?,?)',(row['id'],actor,waiter_id,reason.strip()))
                db.execute("INSERT INTO events(kind,table_id,actor,detail) VALUES('cancel',?,?,?)",(row['table_id'],actor,f"{row['qty']} × {row['name']} | {reason.strip()}"))
            for order,table in {(r['order_id'],r['table_id']) for r in rows}:
                if not db.execute('SELECT 1 FROM items WHERE order_id=? AND cancelled=0',(order,)).fetchone():
                    db.execute("UPDATE orders SET status='cancelled',closed=CURRENT_TIMESTAMP WHERE id=?",(order,))
                    db.execute('UPDATE tables SET epoch=epoch+1 WHERE id=?',(table,))
        if rows:self.auto_backup()
        return len(rows)

    def cancellation_history(self):
        with self.connect() as db:
            return [dict(r) for r in db.execute("SELECT c.*,i.name,i.qty,i.price,i.waiter,t.name AS table_name FROM cancellations c JOIN items i ON i.id=c.item_id JOIN orders o ON o.id=i.order_id JOIN tables t ON t.id=o.table_id ORDER BY c.created DESC,c.item_id DESC LIMIT 200")]

    def latest_event(self):
        with self.connect() as db:return db.execute('SELECT COALESCE(MAX(id),0) FROM events').fetchone()[0]

    def events_since(self,event_id):
        with self.connect() as db:return [dict(r) for r in db.execute('SELECT e.*,t.name AS table_name FROM events e JOIN tables t ON t.id=e.table_id WHERE e.id>? ORDER BY e.id LIMIT 200',(event_id,))]

    def setting(self,key,default=''):
        with self.connect() as db:
            row=db.execute('SELECT value FROM settings WHERE key=?',(key,)).fetchone()
        return row[0] if row else default

    def set_setting(self,key,value):
        with self.lock,self.connect() as db:db.execute('INSERT OR REPLACE INTO settings VALUES(?,?)',(key,str(value)))
        self.auto_backup()

    def pay(self, table, method, received=None, expected_total=None, expected_order=None):
        if method not in ('Nakit','Kart'): raise ValueError('Ödeme türü geçersiz.')
        with self.lock, self.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            order = db.execute("SELECT o.id,COALESCE(SUM(CASE WHEN i.cancelled=0 THEN i.price*i.qty ELSE 0 END),0) total FROM orders o LEFT JOIN items i ON i.order_id=o.id WHERE o.table_id=? AND o.status='open' GROUP BY o.id",(table,)).fetchone()
            if not order: raise ValueError('Masanın açık hesabı yok.')
            if expected_order is not None and order['id']!=expected_order:raise ValueError('Bu adisyon kapatılmış. Yeni hesabı kontrol edip ödeme ekranını tekrar açın.')
            total=order['total']
            if expected_total is not None and total != expected_total:
                raise ValueError('Adisyona yeni sipariş eklendi. Tutarı kontrol edip ödemeyi tekrar açın.')
            received=total if received is None or method=='Kart' else received
            if type(received) is not int or received<total: raise ValueError('Alınan tutar toplamdan az olamaz.')
            change=received-total
            db.execute('INSERT INTO payments(order_id,method,total,received,change_amount) VALUES(?,?,?,?,?)',(order['id'],method,total,received,change))
            db.execute("UPDATE orders SET status='paid',closed=CURRENT_TIMESTAMP,payment=? WHERE id=?",(method,order['id']))
            db.execute('UPDATE tables SET epoch=epoch+1 WHERE id=?',(table,))
        self.auto_backup()
        return dict(total=total,received=received,change=change,method=method)

    def add_section(self, name):
        name=name.strip()
        if not name or len(name)>50: raise ValueError('Bölüm adı 1–50 karakter olmalı.')
        with self.lock, self.connect() as db:
            try: db.execute('INSERT INTO sections(name) VALUES(?)',(name,))
            except sqlite3.IntegrityError: raise ValueError('Bu bölüm zaten var.')
        self.auto_backup()

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
        self.auto_backup()

    def save_table(self, name, section, table=None):
        name=name.strip()
        if not name or len(name)>50: raise ValueError('Masa adı 1–50 karakter olmalı.')
        with self.lock, self.connect() as db:
            if not db.execute('SELECT 1 FROM sections WHERE id=?',(section,)).fetchone():raise ValueError('Bölüm bulunamadı.')
            if db.execute('SELECT 1 FROM tables WHERE name=? AND active=1 AND id<>?',(name,table or -1)).fetchone():raise ValueError('Bu masa adı kullanılıyor.')
            if table is None:db.execute('INSERT INTO tables(name,section_id) VALUES(?,?)',(name,section))
            else:
                if not db.execute('UPDATE tables SET name=?,section_id=? WHERE id=? AND active=1',(name,section,table)).rowcount:raise ValueError('Masa bulunamadı.')
        self.auto_backup()

    def remove_table(self, table):
        with self.lock, self.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            if db.execute("SELECT 1 FROM orders WHERE table_id=? AND status='open'",(table,)).fetchone():raise ValueError('Açık hesabı olan masa kaldırılamaz.')
            db.execute('UPDATE tables SET active=0 WHERE id=?',(table,))
        self.auto_backup()

    def set_state(self, item, state):
        if state not in ('Yeni','Hazırlanıyor','Servis edildi'): raise ValueError('Durum geçersiz.')
        with self.lock, self.connect() as db:
            db.execute("UPDATE items SET state=? WHERE id=? AND cancelled=0 AND order_id IN (SELECT id FROM orders WHERE status='open')",(state,item))
        self.auto_backup()

    def product(self, name, price):
        if not name.strip() or price<=0: raise ValueError('Geçerli ürün adı ve fiyat girin.')
        with self.lock, self.connect() as db:
            db.execute('INSERT INTO products(name,price) VALUES(?,?)',(name.strip(),price))
        self.auto_backup()

    @staticmethod
    def password_digest(password, salt):
        return hashlib.pbkdf2_hmac('sha256', password.encode(), bytes.fromhex(salt), 600000).hex()

    def waiters(self):
        with self.connect() as db:
            return [dict(r) for r in db.execute('SELECT id,username,name,active FROM waiters ORDER BY id')]

    def save_waiter(self, username, name, password, waiter_id=None):
        username=username.strip().lower();name=name.strip()
        if not username or len(username)>50 or not name or len(name)>50:
            raise ValueError('Kullanıcı adı ve ad soyad 1–50 karakter olmalı.')
        if not 6<=len(password)<=128:raise ValueError('Şifre 6–128 karakter olmalı.')
        salt=secrets.token_hex(16);digest=self.password_digest(password,salt)
        with self.lock, self.connect() as db:
            try:
                if waiter_id is None:
                    db.execute('INSERT INTO waiters(username,name,password_hash,salt) VALUES(?,?,?,?)',(username,name,digest,salt))
                elif not db.execute('UPDATE waiters SET username=?,name=?,password_hash=?,salt=?,version=version+1 WHERE id=?',(username,name,digest,salt,waiter_id)).rowcount:
                    raise ValueError('Garson bulunamadı.')
            except sqlite3.IntegrityError:raise ValueError('Kullanıcı adı zaten kullanılıyor.')
        self.auto_backup()

    def set_waiter_active(self, waiter_id, active):
        with self.lock, self.connect() as db:
            db.execute('UPDATE waiters SET active=?,version=version+1 WHERE id=?',(int(bool(active)),waiter_id))
        self.auto_backup()

    def authenticate(self, username, password):
        if not isinstance(username,str) or not isinstance(password,str) or len(password)>128:return None
        with self.connect() as db:
            row=db.execute('SELECT * FROM waiters WHERE username=?',(username.strip().lower(),)).fetchone()
        salt=row['salt'] if row else '00'*16
        digest=self.password_digest(password,salt)
        if row and row['active'] and hmac.compare_digest(digest,row['password_hash']):
            return dict(id=row['id'],name=row['name'],username=row['username'],version=row['version'])
        return None

    def session_waiter(self, waiter_id, version):
        with self.connect() as db:
            row=db.execute('SELECT id,name,username FROM waiters WHERE id=? AND version=? AND active=1',(waiter_id,version)).fetchone()
        return dict(row) if row else None

    def period_report(self, period='daily', today=None):
        today=today or datetime.now().date()
        if period=='daily':start=today;end=start+timedelta(days=1)
        elif period=='weekly':start=today-timedelta(days=today.weekday());end=start+timedelta(days=7)
        elif period=='monthly':
            start=today.replace(day=1)
            end=date(start.year+1,1,1) if start.month==12 else date(start.year,start.month+1,1)
        else:raise ValueError('Rapor dönemi geçersiz.')
        with self.connect() as db:
            rows=[dict(r) for r in db.execute("""SELECT o.id,t.name AS table_name,datetime(o.closed,'localtime') AS closed,o.payment AS method,
                SUM(CASE WHEN i.cancelled=0 THEN i.price*i.qty ELSE 0 END) AS total,GROUP_CONCAT(DISTINCT CASE WHEN i.cancelled=0 THEN i.waiter END) AS waiters
                FROM orders o JOIN tables t ON t.id=o.table_id JOIN items i ON i.order_id=o.id
                WHERE o.status='paid' AND date(o.closed,'localtime')>=? AND date(o.closed,'localtime')<?
                GROUP BY o.id ORDER BY o.closed DESC,o.id DESC""",(start.isoformat(),end.isoformat()))]
        summary=dict(count=len(rows),total=sum(r['total'] for r in rows),
            cash=sum(r['total'] for r in rows if r['method']=='Nakit'),
            card=sum(r['total'] for r in rows if r['method']=='Kart'))
        return dict(start=start.isoformat(),end=(end-timedelta(days=1)).isoformat(),summary=summary,orders=rows)

    def auto_backup(self):
        try:self.backup()
        except (OSError,sqlite3.Error,ValueError) as error:
            self.last_backup_status=dict(local='',external='',error='Veri kaydedildi; otomatik yedek alınamadı: '+str(error))

    def backup_settings(self):
        with self.connect() as db:
            row=db.execute("SELECT value FROM settings WHERE key='backup_directory'").fetchone()
        return row[0] if row else ''

    def set_backup_directory(self, directory):
        if directory:
            folder=Path(directory);folder.mkdir(parents=True,exist_ok=True)
            # Verify a writable destination before saving configuration.
            probe=folder/('.lokanta-check-'+secrets.token_hex(8))
            probe.write_text('');probe.unlink()
        with self.connect() as db:db.execute("INSERT OR REPLACE INTO settings VALUES('backup_directory',?)",(str(directory),))
        self.auto_backup()

    def backup_status(self):
        return getattr(self,'last_backup_status',dict(local='',external='',error=''))

    def backup(self):
        from restaurant.backups import save_connection, copy_backup, prune
        with self.lock:
            folder=self.directory/'yedekler';now=datetime.now()
            target=folder/(now.strftime('%Y%m%d-%H%M%S-%f')+'.sqlite3')
            with self.connect() as source:save_connection(source,target)
            for location,filename,keep in [
                (folder/'saatlik',now.strftime('%Y-%m-%d-%H'),48),
                (folder/'gunluk',now.strftime('%Y-%m-%d'),30),
                (folder/'aylik',now.strftime('%Y-%m'),12)]:
                copy_backup(target,location/(filename+'.sqlite3'));prune(location,keep)
            prune(folder,100)
            self.last_backup_status=dict(local=str(target),external='',error='',verified=True)
            external=self.backup_settings()
            if external:
                try:
                    destination=Path(external)/'LokantaTakipYedekleri'
                    copy_backup(target,destination/target.name)
                    for name,filename,keep in [('saatlik',now.strftime('%Y-%m-%d-%H'),48),('gunluk',now.strftime('%Y-%m-%d'),30),('aylik',now.strftime('%Y-%m'),12)]:
                        copy_backup(target,destination/name/(filename+'.sqlite3'));prune(destination/name,keep)
                    prune(destination,100)
                    self.last_backup_status['external']=str(destination/target.name)
                except (OSError,sqlite3.Error,ValueError) as error:self.last_backup_status['error']='Harici yedek alınamadı: '+str(error)
        return target


def default_directory():
    return Path(os.environ.get('LOCALAPPDATA', Path.home())) / 'LokantaTakip'

import concurrent.futures
import json
import sqlite3
import tempfile
import unittest
import urllib.request
import urllib.error
from contextlib import closing
from restaurant.core import Store
from restaurant.server import serve

class AppTest(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.store=Store(self.temp.name)
    def tearDown(self):self.temp.cleanup()
    def test_payment_backup_and_restart(self):
        self.store.add(1,1,2,'Az tuzlu','Ali');self.store.set_state(1,'Hazırlanıyor')
        self.assertEqual(self.store.snapshot()['tables'][0]['total'],18000)
        self.store.pay(1,'Kart');s=Store(self.temp.name)
        self.assertIsNone(s.snapshot()['tables'][0]['order_id'])
        self.assertEqual(s.snapshot()['report'],{'count':1,'total':18000})
        with closing(sqlite3.connect(s.backup())) as db:self.assertEqual(db.execute('PRAGMA integrity_check').fetchone()[0],'ok')
    def test_concurrent_orders(self):
        with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:list(pool.map(lambda _:self.store.add(1,1),range(10)))
        self.assertEqual(self.store.snapshot()['tables'][0]['total'],90000)
        self.assertEqual(len(self.store.snapshot()['items']),10)
    def test_validation(self):
        for qty in (0,-1,100,1.5,True):
            with self.assertRaises(ValueError):self.store.add(1,1,qty)
        with self.assertRaises(ValueError):self.store.add(99,1)
        self.assertEqual(self.store.snapshot()['items'],[])
    def test_sections_tables_and_history(self):
        self.store.add_section('Bahçe')
        section=self.store.snapshot()['sections'][-1]['id']
        self.store.save_table('Bahçe 1',section)
        table=self.store.snapshot()['tables'][-1]['id']
        self.store.add(table,1)
        with self.assertRaises(ValueError):self.store.remove_table(table)
        with self.assertRaises(ValueError):self.store.remove_section(section)
        self.store.pay(table,'Nakit',10000)
        self.store.remove_table(table)
        self.store.remove_section(section)
        state=Store(self.temp.name).snapshot()
        self.assertNotIn(table,[t['id'] for t in state['tables']])
        self.assertEqual(state['payments'][0]['table_name'],'Bahçe 1')
        self.assertEqual(state['payments'][0]['change_amount'],1000)
        self.assertEqual(len(state['sections']),1)

    def test_payment_rejects_stale_total_and_insufficient_cash(self):
        self.store.add(1,1)
        with self.assertRaises(ValueError):self.store.pay(1,'Nakit',8000)
        self.store.add(1,1)
        with self.assertRaises(ValueError):self.store.pay(1,'Kart',expected_total=9000)
        self.assertEqual(self.store.snapshot()['payments'],[])
        result=self.store.pay(1,'Nakit',20000,expected_total=18000)
        self.assertEqual(result['change'],2000)
        with self.assertRaises(ValueError):self.store.pay(1,'Nakit',20000)
        self.assertEqual(len(self.store.snapshot()['payments']),1)

    def test_existing_database_migration(self):
        legacy=tempfile.TemporaryDirectory()
        try:
            from pathlib import Path
            with closing(sqlite3.connect(Path(legacy.name)/'lokanta.sqlite3')) as db:
                db.execute('CREATE TABLE tables(id INTEGER PRIMARY KEY, name TEXT NOT NULL)')
                db.execute("INSERT INTO tables VALUES(42,'Eski masa')")
                db.commit()
            migrated=Store(legacy.name)
            self.assertEqual(migrated.snapshot()['tables'][0]['id'],42)
            self.assertEqual(migrated.snapshot()['tables'][0]['section_id'],1)
            migrated.add(42,1)
            self.assertEqual(migrated.snapshot()['tables'][0]['total'],9000)
        finally:legacy.cleanup()

    def test_retried_offline_order_is_not_duplicated(self):
        self.store.save_waiter('ali','Ali','sifre123')
        user=self.store.authenticate('ali','sifre123')
        options=dict(waiter_id=user['id'],request_id='offline-request-00001',expected_epoch=0)
        self.store.add(1,1,**options)
        restarted=Store(self.temp.name)
        restarted.add(1,1,**options)
        self.assertEqual(len(restarted.snapshot()['items']),1)
        with self.assertRaises(ValueError):restarted.add(1,2,**options)
        restarted.pay(1,'Nakit')
        restarted.add(1,1,**options) # Lost success response replayed after payment.
        self.assertEqual(restarted.snapshot()['items'],[])
        with self.assertRaises(ValueError):restarted.add(1,1,waiter_id=user['id'],request_id='offline-request-00002',expected_epoch=0)
        self.assertEqual(restarted.snapshot()['items'],[])

    def test_extended_backups(self):
        from pathlib import Path
        from unittest.mock import patch
        with tempfile.TemporaryDirectory() as external:
            self.store.set_backup_directory(external)
            self.store.add(1,1)
            self.assertTrue(self.store.backup_status()['external'])
            self.assertTrue(list((self.store.directory/'yedekler'/'gunluk').glob('*.sqlite3')))
            self.assertTrue(list((self.store.directory/'yedekler'/'aylik').glob('*.sqlite3')))
            output=Path(self.store.backup_status()['external'])
            with closing(sqlite3.connect(output)) as db:self.assertEqual(db.execute('PRAGMA integrity_check').fetchone()[0],'ok')
            original=Path.mkdir
            def fail_external(path,*args,**kwargs):
                if path==Path(external)/'LokantaTakipYedekleri':raise OSError('Disk bağlı değil')
                return original(path,*args,**kwargs)
            with patch.object(Path,'mkdir',fail_external):self.store.add(1,1)
            self.assertIn('Disk bağlı değil',self.store.backup_status()['error'])
            self.assertEqual(self.store.snapshot()['tables'][0]['total'],18000)

    def test_old_payment_window_cannot_close_new_order(self):
        self.store.add(1,1)
        old=self.store.snapshot()['tables'][0]['order_id']
        self.store.pay(1,'Kart')
        self.store.add(1,1)
        with self.assertRaises(ValueError):self.store.pay(1,'Kart',expected_total=9000,expected_order=old)
        self.assertIsNotNone(self.store.snapshot()['tables'][0]['order_id'])

    def test_automatic_backup_failure_does_not_repeat_committed_order(self):
        from unittest.mock import patch
        with patch.object(self.store,'backup',side_effect=OSError('Disk dolu')):self.store.add(1,1)
        self.assertEqual(len(self.store.snapshot()['items']),1)
        self.assertIn('Disk dolu',self.store.backup_status()['error'])

    def test_money_input_and_display(self):
        from restaurant.formatting import parse_money,money
        for value in ['1234,50','1.234,50','1234.50',' 1234,50 ₺ ']:self.assertEqual(parse_money(value),123450)
        self.assertEqual(money(123450),'1.234,50 TL')
        for value in ['NaN','Infinity','-1','1.234','abc','0,001','9999999999']:
            with self.assertRaises(ValueError):parse_money(value)

    def test_waiter_credentials_persist_securely(self):
        self.store.save_waiter('ali','Ali Kaya','sifre123')
        user=self.store.authenticate('ALI','sifre123')
        self.assertEqual(user['name'],'Ali Kaya')
        self.assertIsNone(self.store.authenticate('ali','hatali'))
        with self.store.connect() as db:
            row=db.execute('SELECT * FROM waiters').fetchone()
            self.assertNotEqual(row['password_hash'],'sifre123')
            self.assertNotIn('password_hash',self.store.waiters()[0])
        self.assertIsNotNone(Store(self.temp.name).authenticate('ali','sifre123'))
        with self.assertRaises(ValueError):self.store.save_waiter('ali','Başka Ali','sifre123')
        with self.assertRaises(ValueError):self.store.save_waiter('veli','Veli','123')

    def test_period_reports_cash_card_and_legacy_payments(self):
        from datetime import date
        for qty,method,day in [(1,'Nakit','2026-11-04'),(2,'Kart','2026-11-02'),(3,'Nakit','2026-10-31'),(4,'Kart','2026-11-01'),(5,'Nakit','2026-12-01')]:
            self.store.add(1,1,qty)
            self.store.pay(1,method)
            with self.store.connect() as db:
                db.execute("UPDATE orders SET closed=datetime(?,'utc') WHERE id=(SELECT MAX(id) FROM orders)",(day+' 12:00:00',))
        # Older releases recorded method on orders without a payments row.
        with self.store.connect() as db:db.execute('DELETE FROM payments')
        today=date(2026,11,4)
        self.assertEqual(self.store.period_report('daily',today)['summary'],dict(count=1,total=9000,cash=9000,card=0))
        self.assertEqual(self.store.period_report('weekly',today)['summary'],dict(count=2,total=27000,cash=9000,card=18000))
        monthly=self.store.period_report('monthly',today)
        self.assertEqual(monthly['summary'],dict(count=3,total=63000,cash=9000,card=54000))
        self.assertEqual(monthly['start'],'2026-11-01')
        self.assertEqual(monthly['end'],'2026-11-30')
        self.assertEqual({r['method'] for r in monthly['orders']},{'Nakit','Kart'})
        self.assertEqual(self.store.period_report('monthly',date(2027,1,1))['summary']['total'],0)

    def test_http_waiter_permissions(self):
        self.store.save_waiter('ayse','Ayşe Yılmaz','guvenli123')
        server=serve(self.store,'127.0.0.1',0);base=f'http://127.0.0.1:{server.server_port}'
        def req(path,data=None,token=''):
            request=urllib.request.Request(base+path,data=json.dumps(data).encode() if data is not None else None,headers={'Authorization':'Bearer '+token,'Content-Type':'application/json'})
            with urllib.request.urlopen(request) as r:return json.load(r)
        try:
            self.assertEqual(req('/health')['status'],'ok')
            with self.assertRaises(urllib.error.HTTPError) as e:req('/api/state')
            self.assertEqual(e.exception.code,401)
            with self.assertRaises(urllib.error.HTTPError):req('/api/login',{'pin':self.store.pin()})
            with self.assertRaises(urllib.error.HTTPError):req('/api/login',{'username':'ayse','password':'yanlis'})
            token=req('/api/login',{'username':'ayse','password':'guvenli123'})['token']
            req('/api/order',{'table':2,'product':1,'qty':3,'waiter':'Sahte İsim'},token)
            state=req('/api/state',token=token)
            self.assertEqual(state['tables'][1]['total'],27000)
            self.assertEqual(state['user']['name'],'Ayşe Yılmaz')
            self.assertEqual(state['items'][0]['waiter'],'Ayşe Yılmaz')
            self.assertEqual(state['items'][0]['waiter_id'],state['user']['id'])
            queued=dict(table=2,product=1,qty=1,note='Az tuzlu',request_id='http-offline-order-0001',epoch=0)
            req('/api/order',queued,token);req('/api/order',queued,token)
            self.assertEqual(len(req('/api/state',token=token)['items']),2)
            self.store.pay(2,'Nakit')
            queued['request_id']='http-offline-order-0002'
            with self.assertRaises(urllib.error.HTTPError) as conflict:req('/api/order',queued,token)
            self.assertEqual(conflict.exception.code,400)

            self.assertNotIn('report',state)
            self.assertNotIn('payments',state)
            with self.assertRaises(urllib.error.HTTPError) as e:req('/api/pay',{},token)
            self.assertEqual(e.exception.code,404)
            req('/api/logout',{},token)
            with self.assertRaises(urllib.error.HTTPError):req('/api/state',token=token)
            token=req('/api/login',{'username':'ayse','password':'guvenli123'})['token']
            self.store.save_waiter('ayse','Ayşe Yılmaz','yenisifre',state['user']['id'])
            with self.assertRaises(urllib.error.HTTPError):req('/api/state',token=token)
            token=req('/api/login',{'username':'ayse','password':'yenisifre'})['token']
            self.store.set_waiter_active(state['user']['id'],False)
            with self.assertRaises(urllib.error.HTTPError):req('/api/state',token=token)
            with self.assertRaises(urllib.error.HTTPError):req('/api/login',{'username':'ayse','password':'yenisifre'})
        finally:server.shutdown();server.server_close()

if __name__=='__main__':unittest.main()

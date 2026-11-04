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

    def test_batch_atomicity_retry_and_notifications(self):
        self.store.save_waiter('ali','Ali','sifre123')
        user=self.store.authenticate('ali','sifre123')
        batch=[dict(product=1,qty=2,note='Az tuzlu'),dict(product=2,qty=1,note='')]
        with self.assertRaises(ValueError):self.store.add_batch(1,batch+[dict(product=999,qty=1)],user['id'],'invalid-batch-00001',0)
        self.assertEqual(self.store.snapshot()['items'],[])
        self.assertEqual(self.store.latest_event(),0)
        result=self.store.add_batch(1,batch,user['id'],'valid-batch-000001',0)
        self.assertFalse(result['duplicate'])
        self.assertTrue(self.store.add_batch(1,batch,user['id'],'valid-batch-000001',0)['duplicate'])
        self.assertEqual(len(self.store.snapshot()['items']),2)
        self.assertEqual(self.store.snapshot()['tables'][0]['total'],43000)
        events=self.store.events_since(0)
        self.assertEqual(len(events),1)
        self.assertEqual(events[0]['actor'],'Ali')
        self.assertIn('Izgara köfte',events[0]['detail'])

    def test_cancellations_permissions_audit_and_payment(self):
        self.store.save_waiter('ali','Ali','sifre123');self.store.save_waiter('ayse','Ayşe','sifre123')
        ali=self.store.authenticate('ali','sifre123');ayse=self.store.authenticate('ayse','sifre123')
        self.store.add(1,1,2,waiter_id=ali['id']);self.store.add(1,2,waiter_id=ayse['id'])
        rows=self.store.snapshot()['items'];first,second=rows[0]['id'],rows[1]['id']
        with self.assertRaises(ValueError):self.store.cancel_items([first],'Yanlış ürün',waiter_id=ayse['id'])
        with self.assertRaises(ValueError):self.store.cancel_items([first,second],'Yanlış ürün',waiter_id=ali['id'])
        self.assertEqual(self.store.cancellation_history(),[])
        self.assertEqual(self.store.cancel_items([first],'Müşteri vazgeçti',waiter_id=ali['id']),1)
        self.assertEqual(self.store.cancel_items([first],'Müşteri vazgeçti',waiter_id=ali['id']),0)
        self.store.set_state(first,'Servis edildi')
        self.assertEqual(self.store.snapshot()['items'][0]['state'],'İptal')
        self.assertEqual(self.store.snapshot()['tables'][0]['total'],25000)
        result=self.store.pay(1,'Nakit',30000)
        self.assertEqual(result['total'],25000)
        self.assertEqual(self.store.period_report()['summary']['cash'],25000)
        with self.assertRaises(ValueError):self.store.cancel_items([second],'Hatalı sipariş')
        history=self.store.cancellation_history()
        self.assertEqual(history[0]['actor'],'Ali')
        self.assertEqual(history[0]['reason'],'Müşteri vazgeçti')

    def test_last_item_cancel_closes_table_and_invalidates_old_cart(self):
        self.store.save_waiter('ali','Ali','sifre123');user=self.store.authenticate('ali','sifre123')
        batch=[dict(product=1,qty=1,note='')]
        self.store.add_batch(1,batch,user['id'],'cancelled-batch-001',0)
        item=self.store.snapshot()['items'][0]['id']
        self.store.cancel_items([item],'Müşteri vazgeçti')
        self.assertIsNone(self.store.snapshot()['tables'][0]['order_id'])
        self.assertEqual(self.store.snapshot()['tables'][0]['epoch'],1)
        self.store.add_batch(1,batch,user['id'],'cancelled-batch-001',0)
        with self.assertRaises(ValueError):self.store.add_batch(1,batch,user['id'],'stale-batch-000001',0)
        self.assertEqual(self.store.snapshot()['report']['count'],0)
        self.assertEqual(len(self.store.cancellation_history()),1)

    def test_verified_restore_and_corruption_rejection(self):
        from restaurant.backups import verify,restore
        from pathlib import Path
        self.store.add(1,1)
        selected=self.store.backup()
        self.assertTrue(selected.with_suffix('.sha256').exists())
        self.store.add(1,2)
        archive=restore(self.store.directory,selected)
        self.assertTrue(verify(archive))
        recovered=Store(self.temp.name)
        self.assertEqual(recovered.snapshot()['tables'][0]['total'],9000)
        with closing(sqlite3.connect(archive)) as db:self.assertEqual(db.execute('SELECT COUNT(*) FROM items').fetchone()[0],2)
        corrupt=Path(self.temp.name)/'bozuk.sqlite3';corrupt.write_bytes(selected.read_bytes())
        corrupt.with_suffix('.sha256').write_text('0'*64)
        with self.assertRaises(ValueError):restore(recovered.directory,corrupt)
        self.assertEqual(recovered.snapshot()['tables'][0]['total'],9000)
        self.assertTrue(list((recovered.directory/'yedekler'/'saatlik').glob('*.sqlite3')))

    def test_http_batch_cancel_and_packaged_assets(self):
        self.store.save_waiter('ali','Ali','sifre123');self.store.save_waiter('ayse','Ayşe','sifre123')
        server=serve(self.store,'127.0.0.1',0);base=f'http://127.0.0.1:{server.server_port}'
        def request(path,data=None,token=''):
            req=urllib.request.Request(base+path,data=json.dumps(data).encode() if data is not None else None,headers={'Authorization':'Bearer '+token,'Content-Type':'application/json'})
            with urllib.request.urlopen(req) as response:return json.load(response)
        try:
            for path,mime in [('/','text/html'),('/waiter.js','application/javascript'),('/waiter.css','text/css')]:
                with urllib.request.urlopen(base+path) as response:
                    self.assertIn(mime,response.headers['Content-Type']);self.assertEqual(response.headers['Cache-Control'],'no-store')
            ali=request('/api/login',dict(username='ali',password='sifre123'))['token']
            ayse=request('/api/login',dict(username='ayse',password='sifre123'))['token']
            batch=dict(table=1,epoch=0,request_id='http-batch-cancel-001',items=[dict(product=1,qty=2,note=''),dict(product=2,qty=1,note='')])
            request('/api/order',batch,ali);request('/api/order',batch,ali)
            state=request('/api/state',token=ali);self.assertEqual(len(state['items']),2)
            item=state['items'][0]['id']
            with self.assertRaises(urllib.error.HTTPError):request('/api/cancel',dict(items=[item],reason='Yanlış sipariş'),ayse)
            request('/api/cancel',dict(items=[item],reason='Müşteri vazgeçti',waiter_id=999),ali)
            self.assertEqual(request('/api/state',token=ali)['tables'][0]['total'],25000)
            self.assertEqual(len(self.store.events_since(0)),2)
        finally:server.shutdown();server.server_close()

    def test_pre_upgrade_backup_and_retention_checksums(self):
        from restaurant.backups import copy_backup,verify
        with self.store.connect() as db:db.execute('PRAGMA user_version=1')
        upgraded=Store(self.temp.name)
        archives=list((upgraded.directory/'yedekler'/'gecis-oncesi').glob('*.sqlite3'))
        self.assertEqual(len(archives),1);verify(archives[0])
        folder=upgraded.directory/'yedekler'
        original=upgraded.backup()
        for index in range(101):copy_backup(original,folder/f'19990101-{index:06d}.sqlite3')
        upgraded.backup()
        snapshots=list(folder.glob('*.sqlite3'));self.assertEqual(len(snapshots),100)
        self.assertEqual(len(list(folder.glob('*.sha256'))),100)
        self.assertFalse((folder/'19990101-000000.sqlite3').exists())
        verify(max(snapshots))

    def test_data_directory_instance_lock(self):
        from restaurant.instance import InstanceLock
        with InstanceLock(self.temp.name):
            with self.assertRaises(RuntimeError):
                with InstanceLock(self.temp.name):pass
        with InstanceLock(self.temp.name):pass

    def test_http_shutdown_finishes_inflight_write_before_restore(self):
        import threading
        from unittest.mock import patch
        self.store.save_waiter('ali','Ali','sifre123')
        server=serve(self.store,'127.0.0.1',0);base=f'http://127.0.0.1:{server.server_port}'
        def request(path,data,token=''):
            req=urllib.request.Request(base+path,data=json.dumps(data).encode(),headers={'Authorization':'Bearer '+token,'Content-Type':'application/json'})
            with urllib.request.urlopen(req) as response:return json.load(response)
        token=request('/api/login',dict(username='ali',password='sifre123'))['token']
        entered=threading.Event();release=threading.Event();closed=threading.Event()
        original=self.store.add_batch
        def delayed(*args,**kwargs):
            entered.set();release.wait(5);return original(*args,**kwargs)
        def close():server.shutdown();server.server_close();closed.set()
        with concurrent.futures.ThreadPoolExecutor() as pool,patch.object(self.store,'add_batch',side_effect=delayed):
            future=pool.submit(request,'/api/order',dict(table=1,epoch=0,request_id='shutdown-batch-0001',items=[dict(product=1,qty=1)]),token)
            self.assertTrue(entered.wait(3))
            shutdown=threading.Thread(target=close);shutdown.start()
            try:self.assertFalse(closed.wait(.7),'Shutdown must wait for pending database writes')
            finally:release.set()
            self.assertTrue(future.result(timeout=5)['ok']);shutdown.join(timeout=5)
            self.assertTrue(closed.is_set())
        self.assertEqual(self.store.snapshot()['tables'][0]['total'],9000)

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

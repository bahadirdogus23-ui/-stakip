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
    def test_http_waiter_permissions(self):
        server=serve(self.store,'127.0.0.1',0);base=f'http://127.0.0.1:{server.server_port}'
        def req(path,data=None,token=''):
            request=urllib.request.Request(base+path,data=json.dumps(data).encode() if data is not None else None,headers={'Authorization':'Bearer '+token,'Content-Type':'application/json'})
            with urllib.request.urlopen(request) as r:return json.load(r)
        try:
            self.assertEqual(req('/health')['status'],'ok')
            with self.assertRaises(urllib.error.HTTPError) as e:req('/api/state')
            self.assertEqual(e.exception.code,401)
            token=req('/api/login',{'pin':self.store.pin()})['token']
            req('/api/order',{'table':2,'product':1,'qty':3,'waiter':'Ayşe'},token)
            state=req('/api/state',token=token)
            self.assertEqual(state['tables'][1]['total'],27000)
            self.assertNotIn('report',state)
            with self.assertRaises(urllib.error.HTTPError) as e:req('/api/pay',{},token)
            self.assertEqual(e.exception.code,404)
        finally:server.shutdown();server.server_close()

if __name__=='__main__':unittest.main()

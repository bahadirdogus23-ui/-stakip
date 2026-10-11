"""Çalıştırma: python3 -m unittest discover tests"""
import json
import os
import sys
import threading
import unittest
import urllib.error
import urllib.request
from functools import partial
from http.server import ThreadingHTTPServer

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'server'))
import server  # noqa: E402


class ApplySyncTest(unittest.TestCase):
    def setUp(self):
        self.conn = server.connect(':memory:')

    def test_yeni_kayit_ve_son_degisen_kazanir(self):
        r = server.apply_sync(self.conn, 0, [{'c': 'arac', 'id': 'a1', 'd': {'plaka': 'X'}, 'u': 100}])
        self.assertEqual(r['seq'], 1)
        self.assertEqual(r['changes'][0]['d'], {'plaka': 'X'})
        # eski sürüm reddedilir
        r = server.apply_sync(self.conn, 1, [{'c': 'arac', 'id': 'a1', 'd': {'plaka': 'ESKI'}, 'u': 50}])
        self.assertEqual(r['changes'], [])
        # yeni sürüm kabul edilir
        r = server.apply_sync(self.conn, 1, [{'c': 'arac', 'id': 'a1', 'd': {'plaka': 'Y'}, 'u': 200}])
        self.assertEqual(r['seq'], 2)
        self.assertEqual(r['changes'][0]['d'], {'plaka': 'Y'})

    def test_ikinci_cihaz_degisiklikleri_alir_ve_silme_yayilir(self):
        server.apply_sync(self.conn, 0, [{'c': 'gorev', 'id': 'g1', 'd': {'baslik': 'A'}, 'u': 1},
                                         {'c': 'gorev', 'id': 'g2', 'd': {'baslik': 'B'}, 'u': 1}])
        server.apply_sync(self.conn, 0, [{'c': 'gorev', 'id': 'g1', 'd': {'baslik': 'A'}, 'u': 5, 'del': True}])
        r = server.apply_sync(self.conn, 0, [])
        durum = {x['id']: x['del'] for x in r['changes']}
        self.assertEqual(durum, {'g1': True, 'g2': False})

    def test_gecersiz_istek(self):
        with self.assertRaises(server.GecersizIstek):
            server.apply_sync(self.conn, 0, [{'c': 'x'}])
        with self.assertRaises(server.GecersizIstek):
            server.apply_sync(self.conn, 'a', [])


class HttpTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        server.Handler.conn = server.connect(':memory:')
        server.Handler.token = 'gizli'
        cls.httpd = ThreadingHTTPServer(('127.0.0.1', 0), partial(server.Handler, directory=server.APP_DIR))
        cls.base = f'http://127.0.0.1:{cls.httpd.server_address[1]}'
        threading.Thread(target=cls.httpd.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()

    def post(self, token):
        req = urllib.request.Request(self.base + '/api/sync', method='POST',
                                     data=json.dumps({'since': 0, 'changes': []}).encode(),
                                     headers={'Content-Type': 'application/json', 'X-Token': token})
        return urllib.request.urlopen(req)

    def test_sifre(self):
        with self.assertRaises(urllib.error.HTTPError) as e:
            self.post('yanlis')
        self.assertEqual(e.exception.code, 401)
        self.assertEqual(json.load(self.post('gizli'))['seq'], 0)

    def test_uygulama_dosyalari_sunulur(self):
        html = urllib.request.urlopen(self.base + '/').read().decode()
        self.assertIn('Kırsal Yol Bakım', html)


if __name__ == '__main__':
    unittest.main()

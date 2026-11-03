import hmac
import json
import secrets
import threading
import time
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from pathlib import Path


def serve(store, host='0.0.0.0', port=8765):
    sessions = {}
    attempts = {}
    lock = threading.Lock()
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *args): pass
        def reply(self, status, obj):
            body = json.dumps(obj, ensure_ascii=False).encode()
            self.send_response(status)
            self.send_header('Content-Type','application/json; charset=utf-8')
            self.send_header('Cache-Control','no-store')
            self.send_header('X-Content-Type-Options','nosniff')
            self.end_headers(); self.wfile.write(body)
        def authorized(self):
            token=self.headers.get('Authorization','').removeprefix('Bearer ')
            with lock: return sessions.get(token,0)>time.time()
        def do_GET(self):
            if self.path=='/':
                body=Path(__file__).with_name('waiter.html').read_bytes()
                self.send_response(200); self.send_header('Content-Type','text/html; charset=utf-8'); self.end_headers(); self.wfile.write(body)
            elif self.path=='/api/state':
                if not self.authorized(): return self.reply(401,{'error':'Giriş yapın.'})
                state=store.snapshot(); state.pop('report',None); self.reply(200,state)
            elif self.path=='/health': self.reply(200,{'status':'ok'})
            else: self.reply(404,{'error':'Bulunamadı.'})
        def do_POST(self):
            try:
                length=int(self.headers.get('Content-Length','0'))
                if not 0<length<=4096: return self.reply(413,{'error':'İstek boyutu geçersiz.'})
                data=json.loads(self.rfile.read(length))
                if not isinstance(data,dict): raise ValueError('Geçersiz istek.')
                if self.path=='/api/login':
                    ip=self.client_address[0]; now=time.time()
                    with lock:
                        history=[t for t in attempts.get(ip,[]) if now-t<60]
                        if len(history)>=10: return self.reply(429,{'error':'Bir dakika sonra tekrar deneyin.'})
                        history.append(now); attempts[ip]=history
                        if not hmac.compare_digest(str(data.get('pin','')),store.pin()): return self.reply(401,{'error':'PIN yanlış.'})
                        token=secrets.token_urlsafe(32); sessions[token]=now+12*3600
                    return self.reply(200,{'token':token})
                if not self.authorized(): return self.reply(401,{'error':'Giriş yapın.'})
                if self.path!='/api/order': return self.reply(404,{'error':'Bulunamadı.'})
                store.add(int(data['table']),int(data['product']),data.get('qty',1),str(data.get('note','')),str(data.get('waiter','')))
                self.reply(200,{'ok':True})
            except (ValueError,KeyError,TypeError): self.reply(400,{'error':'Sipariş bilgilerini kontrol edin.'})
            except Exception: self.reply(500,{'error':'İşlem tamamlanamadı; tekrar göndermeden önce masayı kontrol edin.'})
    server=ThreadingHTTPServer((host,port),Handler)
    threading.Thread(target=server.serve_forever,daemon=True).start()
    return server

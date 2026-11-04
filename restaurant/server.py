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
            with lock: session=sessions.get(token)
            if not session or session['expires']<=time.time():return None
            return store.session_waiter(session['id'],session['version'])
        def do_GET(self):
            assets={'/':('waiter.html','text/html'),'/waiter.js':('waiter.js','application/javascript'),'/waiter.css':('waiter.css','text/css')}
            if self.path in assets:
                name,mime=assets[self.path];body=Path(__file__).with_name(name).read_bytes()
                self.send_response(200);self.send_header('Content-Type',mime+'; charset=utf-8');self.send_header('Cache-Control','no-store');self.send_header('X-Content-Type-Options','nosniff');self.end_headers();self.wfile.write(body)
            elif self.path=='/api/state':
                user=self.authorized()
                if not user: return self.reply(401,{'error':'Giriş yapın.'})
                state=store.snapshot(); state.pop('report',None); state.pop('payments',None); state['user']=user; self.reply(200,state)
            elif self.path=='/health': self.reply(200,{'status':'ok'})
            else: self.reply(404,{'error':'Bulunamadı.'})
        def do_POST(self):
            try:
                length=int(self.headers.get('Content-Length','0'))
                if not 0<length<=131072: return self.reply(413,{'error':'İstek boyutu geçersiz.'})
                data=json.loads(self.rfile.read(length))
                if not isinstance(data,dict): raise ValueError('Geçersiz istek.')
                if self.path=='/api/login':
                    ip=self.client_address[0]; now=time.time()
                    with lock:
                        history=[t for t in attempts.get(ip,[]) if now-t<60]
                        if len(history)>=10: return self.reply(429,{'error':'Bir dakika sonra tekrar deneyin.'})
                        history.append(now); attempts[ip]=history
                    user=store.authenticate(data.get('username',''),data.get('password',''))
                    if not user:return self.reply(401,{'error':'Kullanıcı adı veya şifre yanlış; hesap pasif olabilir.'})
                    token=secrets.token_urlsafe(32)
                    with lock:
                        for old in [key for key,value in sessions.items() if value['expires']<=now]:sessions.pop(old,None)
                        sessions[token]=dict(id=user['id'],version=user['version'],expires=now+12*3600)
                    return self.reply(200,{'token':token})
                user=self.authorized()
                if not user: return self.reply(401,{'error':'Giriş yapın.'})
                if self.path=='/api/logout':
                    with lock:sessions.pop(self.headers.get('Authorization','').removeprefix('Bearer '),None)
                    return self.reply(200,{'ok':True})
                if self.path=='/api/cancel':
                    store.cancel_items(data.get('items'),data.get('reason'),waiter_id=user['id'])
                    return self.reply(200,{'ok':True})
                if self.path!='/api/order': return self.reply(404,{'error':'Bulunamadı.'})
                if 'items' in data:
                    if not data.get('request_id'):raise ValueError('Sipariş kimliği gerekli.')
                    result=store.add_batch(data['table'],data['items'],user['id'],data['request_id'],data.get('epoch'))
                else:
                    result=store.add(int(data['table']),int(data['product']),data.get('qty',1),str(data.get('note','')),user['name'],waiter_id=user['id'],request_id=data.get('request_id'),expected_epoch=data.get('epoch'))
                self.reply(200,{'ok':True})
            except (ValueError,KeyError,TypeError) as error: self.reply(400,{'error':str(error) if isinstance(error,ValueError) else 'Sipariş bilgilerini kontrol edin.'})
            except Exception: self.reply(500,{'error':'İşlem tamamlanamadı; tekrar göndermeden önce masayı kontrol edin.'})
    server=ThreadingHTTPServer((host,port),Handler)
    threading.Thread(target=server.serve_forever,daemon=True).start()
    return server

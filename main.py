import argparse
import time
import sys
import tempfile
from pathlib import Path
from restaurant.core import Store, default_directory
from restaurant.server import serve

def main():
    parser=argparse.ArgumentParser(description='Lokanta masaüstü ve garson sunucusu')
    parser.add_argument('--data-dir',default=str(default_directory()))
    parser.add_argument('--port',type=int,default=8765)
    parser.add_argument('--headless',action='store_true',help='Yalnızca garson sunucusunu çalıştır')
    parser.add_argument('--self-test',action='store_true',help=argparse.SUPPRESS)
    args=parser.parse_args()
    if args.self_test:
        from restaurant.desktop import Desktop
        from restaurant import server as server_module
        assert Path(server_module.__file__).with_name('waiter.html').is_file()
        with tempfile.TemporaryDirectory() as directory:
            store=Store(directory)
            store.add(1,1)
            desktop=Desktop(store,8765)
            try:
                desktop.root.update()
                assert desktop.tree.get_children()
                store.add_section('Bahçe')
                section=store.snapshot()['sections'][-1]['id']
                store.save_table('Bahçe 1',section)
                desktop.refresh(False)
                assert len(desktop.buttons)==13
                desktop.section.set('Bahçe')
                desktop.refresh(False)
                assert len(desktop.buttons)==1
                desktop.manage()
                desktop.history()
                desktop.root.update()
            finally:
                desktop.root.destroy()
        return
    store=Store(args.data_dir);server=serve(store,port=args.port)
    try:
        if args.headless:
            print(f'Garson sunucusu hazır; port {server.server_port}',flush=True)
            while True:time.sleep(1)
        else:
            from restaurant.desktop import Desktop
            Desktop(store,server.server_port).run()
    except KeyboardInterrupt:pass
    finally:server.shutdown();server.server_close()

if __name__=='__main__':
    try:
        main()
    except Exception as error:
        if getattr(sys,'frozen',False) and '--self-test' not in sys.argv:
            import ctypes
            ctypes.windll.user32.MessageBoxW(None,
                f'Lokanta Takip başlatılamadı.\n\n{error}\n\nUygulama zaten açıksa mevcut pencereyi kullanın. Garson bağlantısı için 8765 numaralı bağlantı noktası boş olmalıdır.',
                'Lokanta Takip',0x10)
        raise

import argparse
import time
import sys
import tempfile
import threading
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
        assert all(Path(server_module.__file__).with_name(name).is_file() for name in ('waiter.html','waiter.js','waiter.css'))
        with tempfile.TemporaryDirectory() as directory:
            store=Store(directory)
            store.add(1,1)
            desktop=Desktop(store,8765)
            try:
                desktop.root.update()
                assert desktop.tree.get_children()
                desktop.tree.selection_set(desktop.tree.get_children()[0])
                desktop.item_detail()
                desktop.backup()
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
                desktop.cancellations()
                desktop.staff()
                desktop.reports()
                desktop.root.update()
            finally:
                desktop.root.destroy()
        return
    from restaurant.instance import InstanceLock
    with InstanceLock(args.data_dir):run_program(args)

def run_program(args):
    store=Store(args.data_dir);server=serve(store,port=args.port)
    stop_backups=threading.Event()
    def periodic_backup():
        while not stop_backups.wait(300):store.auto_backup()
    backup_thread=threading.Thread(target=periodic_backup,daemon=True);backup_thread.start()
    desktop=None
    try:
        if args.headless:
            print(f'Garson sunucusu hazır; port {server.server_port}',flush=True)
            while True:time.sleep(1)
        else:
            from restaurant.desktop import Desktop
            desktop=Desktop(store,server.server_port);desktop.run()
    except KeyboardInterrupt:pass
    finally:
        stop_backups.set();server.shutdown();server.server_close();backup_thread.join()
    if desktop and desktop.requested_restore:
        from restaurant.backups import restore
        archive=restore(store.directory,desktop.requested_restore)
        import tkinter as tk
        from tkinter import messagebox
        root=tk.Tk();root.withdraw()
        messagebox.showinfo('Geri yükleme tamamlandı',f'Yedek geri yüklendi. Programı yeniden açabilirsiniz.\nÖnceki verilerin arşivi: {archive}',parent=root);root.destroy()

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

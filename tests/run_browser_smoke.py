"""Isolated real-browser suite. Requires Node + playwright-core and local Chrome/Edge."""
import os
import subprocess
import sys
import tempfile
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from restaurant.core import Store
from restaurant.server import serve

with tempfile.TemporaryDirectory(prefix='lokanta-browser-') as directory:
    store=Store(directory);store.save_waiter('test','Ayşe Yılmaz','test123')
    server=serve(store,'127.0.0.1',0)
    try:
        runtime=dict(os.environ,LOKANTA_TEST_URL=f'http://127.0.0.1:{server.server_port}')
        result=subprocess.run(['node',str(Path(__file__).with_name('browser_smoke.cjs'))],env=runtime,timeout=150)
    finally:server.shutdown();server.server_close()
    sys.exit(result.returncode)

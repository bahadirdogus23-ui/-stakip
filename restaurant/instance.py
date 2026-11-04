"""An OS lock prevents two cashier processes from sharing a live data directory."""
import os
from pathlib import Path

class InstanceLock:
    def __init__(self,directory):self.directory=Path(directory);self.file=None
    def __enter__(self):
        self.directory.mkdir(parents=True,exist_ok=True)
        stream=(self.directory/'lokanta.lock').open('a+b')
        if stream.tell()==0:stream.write(b'0');stream.flush()
        stream.seek(0)
        try:
            if os.name=='nt':
                import msvcrt
                msvcrt.locking(stream.fileno(),msvcrt.LK_NBLCK,1)
            else:
                import fcntl
                fcntl.flock(stream.fileno(),fcntl.LOCK_EX|fcntl.LOCK_NB)
        except OSError:
            stream.close();raise RuntimeError('Bu veri klasörüyle çalışan Lokanta Takip zaten açık. Mevcut pencereyi kullanın.')
        self.file=stream;return self
    def __exit__(self,*args):
        if self.file:
            self.file.seek(0)
            if os.name=='nt':
                import msvcrt
                msvcrt.locking(self.file.fileno(),msvcrt.LK_UNLCK,1)
            else:
                import fcntl
                fcntl.flock(self.file.fileno(),fcntl.LOCK_UN)
            self.file.close();self.file=None

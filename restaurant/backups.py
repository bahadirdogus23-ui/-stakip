"""Verified, atomic SQLite backup files. Never copy a live database file."""
import hashlib
import os
import secrets
import sqlite3
from contextlib import closing
from pathlib import Path

REQUIRED_TABLES={'tables','orders','items','products','settings'}


def digest(path):
    result=hashlib.sha256()
    with Path(path).open('rb') as source:
        for block in iter(lambda:source.read(1024*1024),b''):result.update(block)
    return result.hexdigest()


def verify(path):
    path=Path(path).resolve()
    if not path.is_file():raise ValueError('Yedek dosyası bulunamadı.')
    checksum=path.with_suffix('.sha256')
    if checksum.exists() and checksum.read_text().strip()!=digest(path):raise ValueError('Yedek sağlama toplamı uyuşmuyor. Başka bir yedek seçin.')
    with closing(sqlite3.connect(path.as_uri()+'?mode=ro',uri=True)) as db:
        if db.execute('PRAGMA integrity_check').fetchone()[0]!='ok':raise ValueError('Yedek bütünlüğü bozuk.')
        if db.execute('PRAGMA foreign_key_check').fetchone():raise ValueError('Yedekte ilişkili kayıt hatası var.')
        tables={r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        if not REQUIRED_TABLES<=tables:raise ValueError('Dosya Lokanta Takip yedeği değil.')
        for query in ('SELECT id,name FROM tables LIMIT 1','SELECT id,table_id,status FROM orders LIMIT 1','SELECT id,order_id,price,qty FROM items LIMIT 1'):
            db.execute(query).fetchall()
    return path


def sync_file(path):
    with Path(path).open('r+b') as stream:os.fsync(stream.fileno())


def save_connection(source,destination):
    destination=Path(destination)
    destination.parent.mkdir(parents=True,exist_ok=True)
    temporary=destination.with_name(destination.name+'.'+secrets.token_hex(6)+'.tmp')
    temporary_checksum=temporary.with_suffix('.sha256')
    try:
        with closing(sqlite3.connect(temporary)) as db:
            source.backup(db)
        verify(temporary)
        sync_file(temporary)
        temporary_checksum.write_text(digest(temporary))
        sync_file(temporary_checksum)
        os.replace(temporary,destination)
        os.replace(temporary_checksum,destination.with_suffix('.sha256'))
    finally:
        temporary.unlink(missing_ok=True);temporary_checksum.unlink(missing_ok=True)
    return destination


def copy_backup(source,destination):
    # SQLite backup also supports old valid backup formats and produces a clean single file.
    source=Path(source).resolve()
    with closing(sqlite3.connect(source.as_uri()+'?mode=ro',uri=True)) as db:
        return save_connection(db,destination)


def prune(folder,keep):
    for old in sorted(Path(folder).glob('*.sqlite3'))[:-keep]:
        old.unlink();old.with_suffix('.sha256').unlink(missing_ok=True)


def restore(directory,source):
    """Call only after the HTTP service, backup scheduler and all DB connections stop."""
    directory=Path(directory);current=directory/'lokanta.sqlite3'
    source=verify(source)
    if source==current.resolve():raise ValueError('Çalışan veri dosyası yedek olarak seçilemez.')
    staged=directory/'geri-yukleme.sqlite3'
    copy_backup(source,staged)
    archive=None
    try:
        if current.exists():
            from datetime import datetime
            archive=directory/'geri-yukleme-oncesi'/(datetime.now().strftime('%Y%m%d-%H%M%S-%f')+'.sqlite3')
            copy_backup(current,archive)
        # No live connections remain; a checkpoint closes any journal before replacement.
        if current.exists():
            with closing(sqlite3.connect(current)) as db:
                if db.execute('PRAGMA wal_checkpoint(TRUNCATE)').fetchone()[0]!=0:raise ValueError('Veri dosyası kullanımda; geri yükleme durduruldu.')
        for suffix in ('-wal','-shm'):Path(str(current)+suffix).unlink(missing_ok=True)
        os.replace(staged,current)
        current.with_suffix('.sha256').unlink(missing_ok=True)
    finally:
        staged.unlink(missing_ok=True);staged.with_suffix('.sha256').unlink(missing_ok=True)
    return archive

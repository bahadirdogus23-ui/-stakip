"""Run in a desktop session: python tests/ui_smoke.py (or DISPLAY=:99)."""
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import tempfile
from restaurant.core import Store
from restaurant.desktop import Desktop
with tempfile.TemporaryDirectory() as path:
    store=Store(path);store.add(1,1,waiter='Ayşe')
    app=Desktop(store,8765)
    try:
        for geometry in ('1360x850','1024x680'):
            app.root.geometry(geometry);app.root.update()
            assert app.pay_button.winfo_y()+app.pay_button.winfo_height()<=app.pay_button.master.winfo_height()
            assert app.tree.winfo_height()>80
        original=app.buttons[0]
        app.refresh(False);assert app.buttons[0] is original,'Refresh must preserve unchanged cards'
        first=app.tree.get_children()[0];app.tree.selection_set(first)
        app.refresh(False);assert app.tree.selection()==(first,)
        app.table_search.set('bulunmayan masa');app.root.update()
        assert app.selected is None and str(app.add_button['state'])=='disabled'
        app.table_search.set('Masa 3');app.root.update();assert app.selected==3
        app.table_search.set('');app.select(1)
        app.tree.selection_set(first)
        for fn in (app.item_detail,app.manage,app.staff,app.reports,app.history,app.backup,app.pay):
            fn();app.root.update()
            for window in app.root.winfo_children():
                if window.winfo_class()=='Toplevel':window.destroy()
        print('Small-screen layout, stable refresh, selection, filtering and all dialogs passed.')
    finally:app.root.destroy()

import socket
import tkinter as tk
from tkinter import ttk, messagebox, simpledialog
from decimal import Decimal, InvalidOperation


def money(n): return f'{n/100:,.2f} ₺'

class Desktop:
    def __init__(self, store, port):
        self.store=store; self.selected=1
        self.root=tk.Tk(); self.root.title('Lokanta • Masa ve Adisyon'); self.root.geometry('1180x760'); self.root.minsize(950,650)
        self.root.configure(bg='#f3f5f0')
        style=ttk.Style(); style.theme_use('clam'); style.configure('TButton',padding=10,font=('Segoe UI',11)); style.configure('Treeview',rowheight=34,font=('Segoe UI',11)); style.configure('TLabel',font=('Segoe UI',11))
        top=ttk.Frame(self.root,padding=18); top.pack(fill='x')
        ttk.Label(top,text='LOKANTA  /  Masa ve Adisyon',font=('Segoe UI',22,'bold')).pack(side='left')
        ttk.Button(top,text='Yedek al',command=self.backup).pack(side='right')
        ttk.Button(top,text='Ürün ekle',command=self.product).pack(side='right',padx=8)
        try:
            addresses=sorted(set(socket.gethostbyname_ex(socket.gethostname())[2]))
        except OSError: addresses=[]
        address=', '.join(f'http://{a}:{port}' for a in addresses if not a.startswith('127.')) or f'Bilgisayarın yerel IP adresi:{port}'
        ttk.Label(self.root,text=f'Garson bağlantısı: {address}     •     PIN: {store.pin()}',padding=12).pack(fill='x')
        body=ttk.Frame(self.root,padding=16); body.pack(fill='both',expand=True)
        self.tables=ttk.Frame(body); self.tables.pack(side='left',fill='y',padx=(0,20))
        self.buttons=[]
        for i in range(12):
            b=ttk.Button(self.tables,command=lambda n=i+1:self.select(n),width=20);b.grid(row=i//3,column=i%3,padx=4,pady=6,ipady=18);self.buttons.append(b)
        right=ttk.Frame(body);right.pack(side='left',fill='both',expand=True)
        self.title=ttk.Label(right,font=('Segoe UI',20,'bold'));self.title.pack(anchor='w',pady=8)
        self.tree=ttk.Treeview(right,columns=('product','qty','sum','state','note'),show='headings',selectmode='browse')
        for col,label,width in [('product','Ürün',160),('qty','Adet',45),('sum','Tutar',90),('state','Durum',110),('note','Not / Garson',160)]:
            self.tree.heading(col,text=label);self.tree.column(col,width=width)
        self.tree.pack(fill='both',expand=True)
        row=ttk.Frame(right);row.pack(fill='x',pady=8)
        self.products=ttk.Combobox(row,state='readonly',width=25);self.products.pack(side='left',fill='x',expand=True)
        self.qty=ttk.Spinbox(row,from_=1,to=99,width=4);self.qty.set('1');self.qty.pack(side='left',padx=6)
        ttk.Button(row,text='Ekle',command=self.add).pack(side='left')
        self.note=ttk.Entry(right);self.note.pack(fill='x');ttk.Label(right,text='Sipariş notunu yukarıya yazabilirsiniz.').pack(anchor='w')
        states=ttk.Frame(right);states.pack(fill='x',pady=8)
        for state in ('Hazırlanıyor','Servis edildi'):
            ttk.Button(states,text=state,command=lambda s=state:self.state(s)).pack(side='left',padx=3)
        self.total=ttk.Label(right,font=('Segoe UI',22,'bold'));self.total.pack(anchor='e',pady=8)
        payments=ttk.Frame(right);payments.pack(fill='x')
        for method in ('Nakit','Kart'):
            ttk.Button(payments,text=f'{method} • Hesabı kapat',command=lambda m=method:self.pay(m)).pack(side='left',expand=True,fill='x',padx=3)
        self.report=ttk.Label(self.root,padding=14);self.report.pack(fill='x')
        self.refresh()
    def call(self, fn):
        try: fn();self.refresh(False)
        except Exception as e: messagebox.showerror('İşlem tamamlanamadı',str(e))
    def select(self,n): self.selected=n;self.refresh(False)
    def refresh(self,schedule=True):
        data=self.store.snapshot();self.data=data
        for b,t in zip(self.buttons,data['tables']):b.configure(text=f"{'●' if t['order_id'] else '○'} {t['name']}\n{money(t['total'])}")
        t=next(t for t in data['tables'] if t['id']==self.selected);self.title.configure(text=t['name']);self.total.configure(text='Toplam: '+money(t['total']))
        selected=self.tree.selection();self.tree.delete(*self.tree.get_children())
        for i in data['items']:
            if i['table_id']==self.selected:self.tree.insert('', 'end',iid=str(i['id']),values=(i['name'],i['qty'],money(i['price']*i['qty']),i['state'],f"{i['note']} / {i['waiter']}"))
        if selected and self.tree.exists(selected[0]):self.tree.selection_set(selected[0])
        idx=self.products.current();self.products['values']=[f"{p['name']} · {money(p['price'])}" for p in data['products']]
        if data['products']:self.products.current(max(0,min(idx,len(data['products'])-1)))
        self.report.configure(text=f"Bugün: {data['report']['count']} kapanan adisyon  •  Tahsilat: {money(data['report']['total'])}   |   Veriler: {self.store.directory}   |   Her işlem sonrası otomatik yedek (son 100)")
        if schedule:self.root.after(3000,self.refresh)
    def add(self):
        def action():
            self.store.add(self.selected,self.data['products'][self.products.current()]['id'],int(self.qty.get()),self.note.get());self.note.delete(0,'end')
        self.call(action)
    def pay(self,method):
        if messagebox.askyesno('Hesabı kapat',f'{self.selected}. masa hesabı {method.lower()} ödemesiyle kapatılsın mı?'):
            self.call(lambda:self.store.pay(self.selected,method))
    def state(self,state):
        if self.tree.selection():self.call(lambda:self.store.set_state(int(self.tree.selection()[0]),state))
    def backup(self): self.call(lambda:messagebox.showinfo('Yedek hazır',str(self.store.backup())))
    def product(self):
        name=simpledialog.askstring('Yeni ürün','Ürün adı:')
        if not name:return
        price=simpledialog.askstring('Fiyat','TL cinsinden fiyat:')
        if price is None:return
        def action():
            try: cents=int((Decimal(price.replace(',','.'))*100).quantize(Decimal('1')))
            except InvalidOperation:raise ValueError('Geçerli bir fiyat girin.')
            self.store.product(name,cents)
        self.call(action)
    def run(self):self.root.mainloop()

import socket
import tkinter as tk
from tkinter import ttk, messagebox, simpledialog
from decimal import Decimal, InvalidOperation


def money(n): return f'{n/100:,.2f} ₺'

class Desktop:
    def __init__(self, store, port):
        self.store=store; self.selected=1
        self.root=tk.Tk(); self.root.title('Lokanta • Masa ve Adisyon'); self.root.geometry('1320x840'); self.root.minsize(1100,740)
        self.root.configure(bg='#f3f5f0')
        style=ttk.Style(); style.theme_use('clam'); style.configure('TButton',padding=10,font=('Segoe UI',11)); style.configure('Treeview',rowheight=34,font=('Segoe UI',11)); style.configure('TLabel',font=('Segoe UI',11))
        style.configure('TFrame',background='#f3f5f0')
        style.configure('TLabel',background='#f3f5f0',foreground='#203b33')
        style.configure('Accent.TButton',background='#216650',foreground='white')
        top=ttk.Frame(self.root,padding=18); top.pack(fill='x')
        ttk.Label(top,text='LOKANTA  /  Masa ve Adisyon',font=('Segoe UI',22,'bold')).pack(side='left')
        ttk.Button(top,text='Masa / Bölüm',command=self.manage).pack(side='right',padx=8)
        ttk.Button(top,text='Ödeme geçmişi',command=self.history).pack(side='right',padx=8)
        ttk.Button(top,text='Yedek al',command=self.backup).pack(side='right')
        ttk.Button(top,text='Ürün ekle',command=self.product).pack(side='right',padx=8)
        try:
            addresses=sorted(set(socket.gethostbyname_ex(socket.gethostname())[2]))
        except OSError: addresses=[]
        address=', '.join(f'http://{a}:{port}' for a in addresses if not a.startswith('127.')) or f'Bilgisayarın yerel IP adresi:{port}'
        ttk.Label(self.root,text=f'Garson bağlantısı: {address}     •     PIN: {store.pin()}',padding=12).pack(fill='x')
        body=ttk.Frame(self.root,padding=16); body.pack(fill='both',expand=True)
        left=ttk.Frame(body);left.pack(side='left',fill='both',padx=(0,20))
        self.summary=ttk.Label(left,font=('Segoe UI',12,'bold'));self.summary.pack(anchor='w',pady=8)
        self.section=ttk.Combobox(left,state='readonly',width=36);self.section.pack(fill='x',pady=8)
        self.section.bind('<<ComboboxSelected>>',lambda e:self.refresh(False))
        canvas=tk.Canvas(left,width=435,bg='#f3f5f0',highlightthickness=0)
        scroll=ttk.Scrollbar(left,orient='vertical',command=canvas.yview)
        scroll.pack(side='right',fill='y');canvas.pack(side='left',fill='both',expand=True)
        canvas.configure(yscrollcommand=scroll.set)
        self.tables=ttk.Frame(canvas);canvas.create_window((0,0),window=self.tables,anchor='nw')
        self.tables.bind('<Configure>',lambda e:canvas.configure(scrollregion=canvas.bbox('all')))
        self.buttons=[]
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
        self.pay_button=ttk.Button(payments,text='Ödeme al →',style='Accent.TButton',command=self.pay)
        self.pay_button.pack(fill='x',ipady=8)
        self.feedback=ttk.Label(right,foreground='#216650',wraplength=600);self.feedback.pack(fill='x',pady=8)
        self.report=ttk.Label(self.root,padding=14);self.report.pack(fill='x')
        self.refresh()
    def call(self, fn):
        try: fn();self.refresh(False)
        except Exception as e: messagebox.showerror('İşlem tamamlanamadı',str(e))
    def select(self,n): self.selected=n;self.refresh(False)
    def refresh(self,schedule=True):
        data=self.store.snapshot();self.data=data
        old_section=self.section.get()
        section_names=['Tüm bölümler']+[section['name'] for section in data['sections']]
        self.section['values']=section_names
        self.section.set(old_section if old_section in section_names else section_names[0])
        section_id=next((x['id'] for x in data['sections'] if x['name']==self.section.get()),None)
        visible=[t for t in data['tables'] if section_id is None or t['section_id']==section_id]
        if not any(t['id']==self.selected for t in visible):self.selected=visible[0]['id'] if visible else None
        for child in self.tables.winfo_children():child.destroy()
        self.buttons=[]
        for n,t in enumerate(visible):
            busy=bool(t['order_id']);chosen=t['id']==self.selected
            color='#216650' if busy else '#ffffff'
            b=tk.Button(self.tables,text=f"{'● DOLU' if busy else '○ BOŞ'}\n{t['name']}\n{money(t['total'])}",
                command=lambda i=t['id']:self.select(i),font=('Segoe UI',12,'bold'),width=14,height=4,
                bg=color,fg='white' if busy else '#216650',activebackground='#b9d8c8',relief='solid',
                bd=3 if chosen else 1,highlightthickness=0,cursor='hand2')
            b.grid(row=n//2,column=n%2,padx=6,pady=6);self.buttons.append(b)
        busy=sum(bool(t['order_id']) for t in data['tables'])
        self.summary.configure(text=f"{len(data['tables'])} masa  •  {busy} dolu  •  {len(data['tables'])-busy} boş")
        t=next((t for t in data['tables'] if t['id']==self.selected),None)
        self.title.configure(text=t['name'] if t else 'Bu bölümde masa yok')
        self.total.configure(text='Toplam: '+money(t['total'] if t else 0))
        self.pay_button.configure(state='normal' if t and t['order_id'] else 'disabled')
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
    def pay(self):
        t=next((t for t in self.store.snapshot()['tables'] if t['id']==self.selected),None)
        if not t or not t['order_id']:return
        dialog=tk.Toplevel(self.root);dialog.title('Ödeme al');dialog.geometry('420x420');dialog.transient(self.root);dialog.grab_set()
        box=ttk.Frame(dialog,padding=24);box.pack(fill='both',expand=True)
        ttk.Label(box,text=t['name'],font=('Segoe UI',18,'bold')).pack(anchor='w')
        ttk.Label(box,text='Ödenecek: '+money(t['total']),font=('Segoe UI',22,'bold')).pack(pady=18)
        method=tk.StringVar(value='Nakit')
        choice=ttk.Combobox(box,textvariable=method,values=['Nakit','Kart'],state='readonly');choice.pack(fill='x')
        ttk.Label(box,text='Alınan tutar (TL)').pack(anchor='w',pady=(12,0))
        received=tk.StringVar(value=f"{t['total']/100:.2f}")
        entry=ttk.Entry(box,textvariable=received);entry.pack(fill='x')
        change=ttk.Label(box);change.pack(pady=12)
        def update(*args):
            try:
                amount=int(Decimal(received.get().replace(',','.'))*100)
                difference=amount-t['total']
                change.configure(text=('Para üstü: '+money(difference)) if difference>=0 else ('Eksik tutar: '+money(-difference)))
            except (InvalidOperation,ValueError,OverflowError):change.configure(text='Geçerli tutar girin.')
        def method_changed(event):
            if method.get()=='Kart':received.set(f"{t['total']/100:.2f}");entry.configure(state='disabled')
            else:entry.configure(state='normal')
            update()
        choice.bind('<<ComboboxSelected>>',method_changed);received.trace_add('write',update);update()
        def complete():
            try:
                amount=int((Decimal(received.get().replace(',','.'))*100).quantize(Decimal('1')))
                result=self.store.pay(t['id'],method.get(),amount,expected_total=t['total'])
            except Exception as e:messagebox.showerror('Ödeme alınamadı',str(e),parent=dialog);return
            dialog.destroy();self.feedback.configure(text=f"✓ Ödeme alındı • {t['name']} • {money(result['total'])} {result['method']} • Para üstü {money(result['change'])}")
            self.refresh(False)
        ttk.Button(box,text='Ödemeyi onayla ve masayı kapat',style='Accent.TButton',command=complete).pack(fill='x',pady=12)
        ttk.Button(box,text='Vazgeç',command=dialog.destroy).pack(fill='x')

    def history(self):
        dialog=tk.Toplevel(self.root);dialog.title('Son 100 ödeme');dialog.geometry('850x450')
        tree=ttk.Treeview(dialog,columns=('date','table','method','total','received','change'),show='headings')
        for key,title in [('date','Tarih'),('table','Masa'),('method','Tür'),('total','Toplam'),('received','Alınan'),('change','Para üstü')]:tree.heading(key,text=title);tree.column(key,width=125)
        tree.pack(fill='both',expand=True,padx=16,pady=16)
        for p in self.store.snapshot()['payments']:tree.insert('','end',values=(p['created']+' UTC',p['table_name'],p['method'],money(p['total']),money(p['received']),money(p['change_amount'])))

    def manage(self):
        dialog=tk.Toplevel(self.root);dialog.title('Masa ve bölüm yönetimi');dialog.geometry('600x560');dialog.transient(self.root)
        box=ttk.Frame(dialog,padding=20);box.pack(fill='both',expand=True)
        ttk.Label(box,text='Masa ve bölüm yönetimi',font=('Segoe UI',18,'bold')).pack(anchor='w',pady=8)
        sections=ttk.Combobox(box,state='readonly');sections.pack(fill='x',pady=6)
        tables=ttk.Combobox(box,state='readonly');tables.pack(fill='x',pady=6)
        name=ttk.Entry(box);name.pack(fill='x',pady=6)
        ttk.Label(box,text='Yeni masa veya seçili masanın yeni adı').pack(anchor='w')
        data={}
        def reload():
            data.update(self.store.snapshot());sections['values']=[x['name'] for x in data['sections']]
            sections.current(0);tables['values']=[x['name'] for x in data['tables']]
            if data['tables']:tables.current(0)
            else:tables.set('')
            self.refresh(False)
        def selected_section():return data['sections'][sections.current()]['id']
        def selected_table():
            if tables.current()<0:raise ValueError('Masa seçin.')
            return data['tables'][tables.current()]['id']
        def action(fn):
            try:fn();reload()
            except Exception as e:messagebox.showerror('İşlem tamamlanamadı',str(e),parent=dialog)
        ttk.Button(box,text='+ Masa ekle',command=lambda:action(lambda:self.store.save_table(name.get(),selected_section()))).pack(fill='x',pady=4)
        ttk.Button(box,text='Seçili masayı adlandır / bölüme taşı',command=lambda:action(lambda:self.store.save_table(name.get() or tables.get(),selected_section(),selected_table()))).pack(fill='x',pady=4)
        def remove_table():
            table=selected_table()
            if messagebox.askyesno('Masayı kaldır',f'{tables.get()} kaldırılsın mı? Geçmiş hesaplar korunur.',parent=dialog):self.store.remove_table(table)
        ttk.Button(box,text='Seçili masayı kaldır',command=lambda:action(remove_table)).pack(fill='x',pady=4)
        def add_section():
            value=simpledialog.askstring('Yeni bölüm','Bölüm adı (ör. Bahçe, Teras):',parent=dialog)
            if value:self.store.add_section(value)
        ttk.Button(box,text='+ Bölüm oluştur',command=lambda:action(add_section)).pack(fill='x',pady=4)
        def remove_section():
            if messagebox.askyesno('Bölümü kaldır',f'{sections.get()} bölümü kaldırılsın mı?',parent=dialog):self.store.remove_section(selected_section())
        ttk.Button(box,text='Seçili boş bölümü kaldır',command=lambda:action(remove_section)).pack(fill='x',pady=4)
        ttk.Label(box,text='Açık adisyonu olan masa kaldırılamaz.\nBölümü kaldırmadan önce içindeki masaları taşıyın.',wraplength=500).pack(pady=12)
        reload()

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

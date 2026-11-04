import socket
import tkinter as tk
from tkinter import font as tkfont
from tkinter import ttk, messagebox, simpledialog, filedialog
from pathlib import Path
import sqlite3
from contextlib import closing
from decimal import Decimal, InvalidOperation


from restaurant.formatting import money, parse_money

class Desktop:
    def __init__(self, store, port):
        self.store=store;self.selected=1;self._cards_signature=None;self._items_signature=None
        self.root=tk.Tk();self.root.title('Lokanta Takip | Kasa')
        self.font='Segoe UI' if 'Segoe UI' in tkfont.families(self.root) else 'Helvetica'
        width=min(1360,self.root.winfo_screenwidth()-40);height=min(880,self.root.winfo_screenheight()-80)
        self.root.geometry(f'{width}x{height}+20+20');self.root.minsize(min(1000,width),min(650,height))
        self.root.configure(bg='#eef2f6')
        style=ttk.Style();style.theme_use('clam')
        style.configure('.',font=(self.font,10),background='#eef2f6',foreground='#1c3040')
        style.configure('TButton',padding=(10,7),borderwidth=0)
        style.map('TButton',background=[('active','#dce7ee')])
        style.configure('TEntry',padding=8,fieldbackground='white')
        style.configure('TCombobox',padding=7,fieldbackground='white')
        style.configure('Treeview',rowheight=36,background='white',fieldbackground='white',borderwidth=0)
        style.configure('Treeview.Heading',font=(self.font,10,'bold'),padding=10,background='#e1e9ef')
        style.map('Treeview',background=[('selected','#d3e9df')],foreground=[('selected','#153e31')])
        style.configure('Accent.TButton',background='#146b50',foreground='white',font=(self.font,11,'bold'))
        style.map('Accent.TButton',background=[('disabled','#b5c9c0'),('active','#0d503b')])
        style.configure('Muted.TLabel',foreground='#617687')
        top=tk.Frame(self.root,bg='#153c32',padx=22,pady=16);top.pack(fill='x')
        tk.Label(top,text='LOKANTA',font=(self.font,20,'bold'),bg='#153c32',fg='white').pack(side='left')
        tk.Label(top,text='MASA VE ADİSYON',font=(self.font,10),bg='#153c32',fg='#bbd8ca').pack(side='left',padx=20)
        self.header_total=tk.Label(top,text='',font=(self.font,12,'bold'),bg='#153c32',fg='white');self.header_total.pack(side='right')
        nav=ttk.Frame(self.root,padding=(16,8));nav.pack(fill='x')
        for text,command in [('Masa / Bölüm',self.manage),('Menüye ürün ekle',self.product),('Garsonlar',self.staff),('Özet ve raporlar',self.reports),('Ödeme geçmişi',self.history),('Yedekleme',self.backup)]:
            ttk.Button(nav,text=text,command=command).pack(side='left',padx=(0,5))
        self.report=ttk.Label(self.root,padding=(18,8),style='Muted.TLabel',wraplength=1100);self.report.pack(side='bottom',fill='x')
        body=ttk.Panedwindow(self.root,orient='horizontal');body.pack(fill='both',expand=True,padx=16,pady=(0,8))
        left=ttk.Frame(body,padding=(0,0,14,0));body.add(left,weight=2)
        self.summary=ttk.Label(left,font=(self.font,12,'bold'));self.summary.pack(anchor='w',pady=(10,8))
        self.section=ttk.Combobox(left,state='readonly',width=26);self.section.pack(fill='x',pady=5)
        self.section.bind('<<ComboboxSelected>>',lambda e:self.refresh(False))
        filters=ttk.Frame(left);filters.pack(fill='x',pady=5)
        self.table_search=tk.StringVar();self.table_search.trace_add('write',lambda *a:self.refresh(False))
        ttk.Entry(filters,textvariable=self.table_search,width=16).pack(side='left',fill='x',expand=True)
        self.table_status=ttk.Combobox(filters,values=['Tüm masalar','Dolu','Boş'],state='readonly',width=11);self.table_status.current(0);self.table_status.pack(side='left',padx=(6,0))
        self.table_status.bind('<<ComboboxSelected>>',lambda e:self.refresh(False))
        ttk.Label(left,text='Masa adıyla ara | Bölüm ve durumla filtrele',style='Muted.TLabel').pack(anchor='w',pady=(0,8))
        card_area=ttk.Frame(left);card_area.pack(fill='both',expand=True)
        canvas=tk.Canvas(card_area,width=335,bg='#eef2f6',highlightthickness=0)
        scroll=ttk.Scrollbar(card_area,orient='vertical',command=canvas.yview);scroll.pack(side='right',fill='y');canvas.pack(side='left',fill='both',expand=True)
        canvas.configure(yscrollcommand=scroll.set)
        self.tables=ttk.Frame(canvas);window=canvas.create_window((0,0),window=self.tables,anchor='nw')
        canvas.bind('<Configure>',lambda e:canvas.itemconfigure(window,width=e.width))
        self.tables.columnconfigure((0,1),weight=1)
        self.tables.bind('<Configure>',lambda e:canvas.configure(scrollregion=canvas.bbox('all')))
        canvas.bind('<MouseWheel>',lambda e:canvas.yview_scroll(-int(e.delta/120),'units'))
        self.buttons=[]
        right=ttk.Frame(body,padding=(10,8,0,0));body.add(right,weight=4)
        title_row=ttk.Frame(right);title_row.pack(fill='x',pady=(0,10))
        self.title=ttk.Label(title_row,font=(self.font,18,'bold'));self.title.pack(side='left')
        self.total=ttk.Label(title_row,font=(self.font,16,'bold'));self.total.pack(side='right')
        self.feedback=ttk.Label(right,foreground='#146b50',wraplength=650);self.feedback.pack(side='bottom',fill='x',pady=4)
        self.pay_button=ttk.Button(right,text='Ödeme al ',style='Accent.TButton',command=self.pay);self.pay_button.pack(side='bottom',fill='x',pady=6)
        editor=ttk.LabelFrame(right,text=' SİPARİŞ EKLE ',padding=12);editor.pack(side='bottom',fill='x',pady=8)
        row=ttk.Frame(editor);row.pack(fill='x')
        self.products=ttk.Combobox(row,state='readonly',width=22);self.products.pack(side='left',fill='x',expand=True)
        self.qty=ttk.Spinbox(row,from_=1,to=99,width=4);self.qty.set('1');self.qty.pack(side='left',padx=8)
        self.add_button=ttk.Button(row,text='+ Ekle',style='Accent.TButton',command=self.add);self.add_button.pack(side='left')
        ttk.Label(editor,text='Not (isteğe bağlı, en fazla 300 karakter)',style='Muted.TLabel').pack(anchor='w',pady=(4,2))
        self.note=ttk.Entry(editor);self.note.pack(fill='x');self.note.bind('<Return>',lambda e:self.add())
        actions=ttk.Frame(right);actions.pack(side='bottom',fill='x',pady=6)
        ttk.Button(actions,text='Sipariş detayı',command=self.item_detail).pack(side='left')
        for state in ('Hazırlanıyor','Servis edildi'):ttk.Button(actions,text=state,command=lambda s=state:self.state(s)).pack(side='left',padx=4)
        self.tree=self.table_widget(right,[('product','Ürün',150),('qty','Adet',50),('sum','Tutar',100),('state','Durum',110),('waiter','Garson',130),('note','Not',160)])
        self.tree.bind('<Double-1>',lambda e:self.item_detail())
        self.tree.tag_configure('Yeni',foreground='#9a5d0a');self.tree.tag_configure('Servis edildi',foreground='#146b50')
        self.root.protocol('WM_DELETE_WINDOW',self.close)
        self.refresh()

    def close(self):
        if messagebox.askyesno('Programı kapat','Kasa kapanınca garson bağlantısı kesilecek. Kapatılsın mı?',parent=self.root):self.root.destroy()

    def dialog(self,title,width,height):
        window=tk.Toplevel(self.root);window.title(title);window.transient(self.root)
        w=min(width,self.root.winfo_screenwidth()-60);h=min(height,self.root.winfo_screenheight()-100)
        window.geometry(f'{w}x{h}+30+30');window.minsize(min(w,500),min(h,380))
        window.bind('<Escape>',lambda e:window.destroy())
        return window

    def form_panel(self,dialog):
        outer=ttk.Frame(dialog);outer.pack(fill='both',expand=True)
        canvas=tk.Canvas(outer,bg='#eef2f6',highlightthickness=0)
        scroll=ttk.Scrollbar(outer,orient='vertical',command=canvas.yview)
        scroll.pack(side='right',fill='y');canvas.pack(side='left',fill='both',expand=True)
        canvas.configure(yscrollcommand=scroll.set)
        box=ttk.Frame(canvas,padding=20);window=canvas.create_window((0,0),window=box,anchor='nw')
        canvas.bind('<Configure>',lambda e:canvas.itemconfigure(window,width=e.width))
        box.bind('<Configure>',lambda e:canvas.configure(scrollregion=canvas.bbox('all')))
        return box

    def table_widget(self,parent,columns):
        frame=ttk.Frame(parent);frame.pack(fill='both',expand=True)
        tree=ttk.Treeview(frame,columns=[c[0] for c in columns],show='headings',selectmode='browse',height=6)
        for key,label,width in columns:tree.heading(key,text=label);tree.column(key,width=width,minwidth=45,stretch=True)
        vertical=ttk.Scrollbar(frame,orient='vertical',command=tree.yview);horizontal=ttk.Scrollbar(frame,orient='horizontal',command=tree.xview)
        frame.rowconfigure(0,weight=1);frame.columnconfigure(0,weight=1)
        tree.grid(row=0,column=0,sticky='nsew');vertical.grid(row=0,column=1,sticky='ns');horizontal.grid(row=1,column=0,sticky='ew')
        tree.configure(yscrollcommand=vertical.set,xscrollcommand=horizontal.set)
        return tree

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
        search=self.table_search.get().strip().casefold()
        visible=[t for t in visible if search in t['name'].casefold() and (self.table_status.get()=='Tüm masalar' or bool(t['order_id'])==(self.table_status.get()=='Dolu'))]
        if not any(t['id']==self.selected for t in visible):self.selected=visible[0]['id'] if visible else None
        signature=(self.selected,tuple((t['id'],t['name'],t['total'],t['order_id']) for t in visible))
        changed=signature!=self._cards_signature
        if changed:
            self._cards_signature=signature
            for child in self.tables.winfo_children():child.destroy()
            self.buttons=[]
        for n,t in enumerate(visible if changed else []):
            busy=bool(t['order_id']);chosen=t['id']==self.selected
            color='#216650' if busy else '#ffffff'
            b=tk.Button(self.tables,text=f"{'DOLU' if busy else 'BOŞ'}\n{t['name']}\n{money(t['total'])}",
                command=lambda i=t['id']:self.select(i),font=(self.font,12,'bold'),width=10,height=4,wraplength=150,
                bg=color,fg='white' if busy else '#216650',activebackground='#b9d8c8',relief='solid',
                bd=3 if chosen else 1,highlightthickness=0,cursor='hand2')
            b.grid(row=n//2,column=n%2,padx=5,pady=5,sticky='ew');self.buttons.append(b)
        busy=sum(bool(t['order_id']) for t in data['tables'])
        self.summary.configure(text=f"{len(data['tables'])} masa  |  {busy} dolu  |  {len(data['tables'])-busy} boş")
        t=next((t for t in data['tables'] if t['id']==self.selected),None)
        self.title.configure(text=t['name'] if t else 'Bu bölümde masa yok')
        self.total.configure(text='Toplam: '+money(t['total'] if t else 0))
        self.pay_button.configure(state='normal' if t and t['order_id'] else 'disabled')
        items=[i for i in data['items'] if i['table_id']==self.selected]
        if items!=self._items_signature:
            self._items_signature=items
            selected=self.tree.selection();position=self.tree.yview()
            self.tree.delete(*self.tree.get_children())
            for i in items:self.tree.insert('', 'end',iid=str(i['id']),values=(i['name'],i['qty'],money(i['price']*i['qty']),i['state'],i['waiter'],i['note']),tags=(i['state'],))
            if selected and self.tree.exists(selected[0]):self.tree.selection_set(selected[0])
            if position:self.tree.yview_moveto(position[0])
        self.add_button.configure(state='normal' if t and data['products'] else 'disabled')
        self.header_total.configure(text='Bugünkü tahsilat  '+money(data['report']['total']))
        idx=self.products.current();self.products['values']=[f"{p['name']} · {money(p['price'])}" for p in data['products']]
        if data['products']:self.products.current(max(0,min(idx,len(data['products'])-1)))
        self.report.configure(text=f"Bugün {data['report']['count']} adisyon kapandı  |  Veriler yerel bilgisayarda  |  Otomatik yedekleme açık")
        if self.store.backup_status().get('error'):self.report.configure(text=self.report.cget('text')+'   Uyarı: '+self.store.backup_status()['error'])
        if schedule:self.root.after(3000,self.refresh)
    def add(self):
        def action():
            if self.selected is None:raise ValueError('Önce bir masa seçin.')
            if self.products.current()<0:raise ValueError('Bir ürün seçin.')
            if not self.qty.get().isdigit() or not 1<=int(self.qty.get())<=99:raise ValueError('Adet 1–99 arasında olmalı.')
            self.store.add(self.selected,self.data['products'][self.products.current()]['id'],int(self.qty.get()),self.note.get());self.note.delete(0,'end');self.qty.set('1');self.feedback.configure(text='Sipariş masaya eklendi.')
        self.call(action)
    def pay(self):
        t=next((t for t in self.store.snapshot()['tables'] if t['id']==self.selected),None)
        if not t or not t['order_id']:return
        dialog=self.dialog('Ödeme al',470,500);dialog.grab_set()
        box=ttk.Frame(dialog,padding=24);box.pack(fill='both',expand=True)
        ttk.Label(box,text=t['name'],font=(self.font,18,'bold')).pack(anchor='w')
        ttk.Label(box,text='Ödenecek: '+money(t['total']),font=(self.font,22,'bold')).pack(pady=18)
        method=tk.StringVar(value='Nakit')
        choice=ttk.Combobox(box,textvariable=method,values=['Nakit','Kart'],state='readonly');choice.pack(fill='x')
        ttk.Label(box,text='Alınan tutar (TL)').pack(anchor='w',pady=(12,0))
        received=tk.StringVar(value=f"{t['total']/100:.2f}")
        entry=ttk.Entry(box,textvariable=received);entry.pack(fill='x')
        change=ttk.Label(box);change.pack(pady=12)
        def update(*args):
            try:
                amount=parse_money(received.get())
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
                amount=parse_money(received.get())
                result=self.store.pay(t['id'],method.get(),amount,expected_total=t['total'],expected_order=t['order_id'])
            except Exception as e:messagebox.showerror('Ödeme alınamadı',str(e),parent=dialog);return
            dialog.destroy();self.feedback.configure(text=f"Ödeme alındı | {t['name']} | {money(result['total'])} {result['method']} | Para üstü {money(result['change'])}")
            self.refresh(False)
        ttk.Button(box,text='Ödemeyi onayla ve masayı kapat',style='Accent.TButton',command=complete).pack(fill='x',pady=12)
        ttk.Button(box,text='Vazgeç',command=dialog.destroy).pack(fill='x')

    def staff(self):
        dialog=self.dialog('Garson hesapları',760,660)
        box=self.form_panel(dialog)
        ttk.Label(box,text='Garson hesapları',font=(self.font,20,'bold')).pack(anchor='w')
        ttk.Label(box,text='Hesap oluşturun; şifre değişince ve hesap pasife alınınca eski girişler kapanır.',wraplength=680).pack(anchor='w',pady=8)
        tree=self.table_widget(box,[('name','Ad soyad',210),('username','Kullanıcı adı',190),('active','Durum',100)])
        fields={}
        for key,label in [('name','Ad soyad'),('username','Kullanıcı adı'),('password','Şifre (en az 6 karakter)')]:
            ttk.Label(box,text=label).pack(anchor='w',pady=(8,0))
            fields[key]=ttk.Entry(box,show='•' if key=='password' else '')
            fields[key].pack(fill='x')
        def reload():
            tree.delete(*tree.get_children())
            for u in self.store.waiters():tree.insert('','end',iid=str(u['id']),values=(u['name'],u['username'],'Aktif' if u['active'] else 'Pasif'))
        def choose(event):
            if not tree.selection():return
            values=tree.item(tree.selection()[0],'values')
            for key,value in [('name',values[0]),('username',values[1]),('password','')]:fields[key].delete(0,'end');fields[key].insert(0,value)
        tree.bind('<<TreeviewSelect>>',choose)
        def save(update=False):
            try:
                if update and not tree.selection():raise ValueError('Önce garson seçin.')
                waiter_id=int(tree.selection()[0]) if update else None
                self.store.save_waiter(fields['username'].get(),fields['name'].get(),fields['password'].get(),waiter_id)
                fields['password'].delete(0,'end');reload()
                messagebox.showinfo('Garson hesabı','Hesap kaydedildi. Garson bu kullanıcı adı ve şifreyle giriş yapabilir.',parent=dialog)
            except Exception as e:messagebox.showerror('Hesap kaydedilemedi',str(e),parent=dialog)
        def toggle():
            if not tree.selection():return
            user=next(u for u in self.store.waiters() if u['id']==int(tree.selection()[0]))
            self.store.set_waiter_active(user['id'],not user['active']);reload()
        ttk.Button(box,text='+ Yeni garson oluştur',command=save).pack(fill='x',pady=(12,4))
        ttk.Button(box,text='Seçili hesabı güncelle / yeni şifre ata',command=lambda:save(True)).pack(fill='x',pady=4)
        ttk.Button(box,text='Seçili hesabı aktif / pasif yap',command=toggle).pack(fill='x',pady=4)
        reload()

    def reports(self):
        dialog=self.dialog('Özet ve raporlar',1000,650)
        box=ttk.Frame(dialog,padding=20);box.pack(fill='both',expand=True)
        ttk.Label(box,text='Özet ve raporlar',font=(self.font,22,'bold')).pack(anchor='w')
        period=ttk.Combobox(box,values=['Günlük','Haftalık','Aylık'],state='readonly');period.current(0);period.pack(anchor='w',pady=12)
        dates=ttk.Label(box);dates.pack(anchor='w')
        summary=ttk.Label(box,font=(self.font,15,'bold'),wraplength=950);summary.pack(anchor='w',pady=20)
        ttk.Label(box,text='Kapanan adisyonlar | Ödeme türü ve siparişi giren garsonlar').pack(anchor='w',pady=6)
        tree=self.table_widget(box,[('id','Adisyon',65),('date','Tarih / saat',155),('table','Masa',130),('method','Ödeme',85),('total','Tahsilat',100),('waiters','Garsonlar',220)])
        def load(*args):
            report=self.store.period_report(['daily','weekly','monthly'][period.current()]);r=report['summary']
            dates.configure(text=f"{report['start']} — {report['end']} | Yerel bilgisayar saati | Hafta pazartesi başlar")
            summary.configure(text=f"{r['count']} adisyon   |   Toplam {money(r['total'])}\nNakit {money(r['cash'])}   |   Kart {money(r['card'])}")
            tree.delete(*tree.get_children())
            for o in report['orders']:tree.insert('','end',values=(o['id'],o['closed'],o['table_name'],o['method'],money(o['total']),o['waiters']))
        period.bind('<<ComboboxSelected>>',load)
        ttk.Button(box,text='Raporu yenile',command=load).pack(pady=12)
        load()

    def history(self):
        dialog=self.dialog('Son 100 ödeme',850,450)
        box=ttk.Frame(dialog,padding=20);box.pack(fill='both',expand=True)
        ttk.Label(box,text='Son 100 ödeme',font=(self.font,20,'bold')).pack(anchor='w',pady=(0,12))
        tree=self.table_widget(box,[('date','Tarih / saat',160),('table','Masa',130),('method','Tür',80),('total','Toplam',100),('received','Alınan',100),('change','Para üstü',100)])
        from datetime import datetime, timezone
        for p in self.store.snapshot()['payments']:
            local=datetime.fromisoformat(p['created']).replace(tzinfo=timezone.utc).astimezone().strftime('%d.%m.%Y %H:%M')
            tree.insert('','end',values=(local,p['table_name'],p['method'],money(p['total']),money(p['received']),money(p['change_amount'])))

    def manage(self):
        dialog=self.dialog('Masa ve bölüm yönetimi',600,560)
        box=self.form_panel(dialog)
        ttk.Label(box,text='Masa ve bölüm yönetimi',font=(self.font,18,'bold')).pack(anchor='w',pady=8)
        ttk.Label(box,text='Bölüm / taşınacak hedef bölüm').pack(anchor='w')
        sections=ttk.Combobox(box,state='readonly');sections.pack(fill='x',pady=6)
        ttk.Label(box,text='Düzenlenecek masa').pack(anchor='w')
        tables=ttk.Combobox(box,state='readonly');tables.pack(fill='x',pady=6)
        name=ttk.Entry(box);name.pack(fill='x',pady=6)
        ttk.Label(box,text='Yeni masa veya seçili masanın yeni adı').pack(anchor='w')
        data={}
        def reload():
            old_section=sections.get();old_table=tables.get()
            data.update(self.store.snapshot());sections['values']=[x['name'] for x in data['sections']]
            sections.set(old_section if old_section in sections['values'] else sections['values'][0]);tables['values']=[x['name'] for x in data['tables']]
            if data['tables']:tables.set(old_table if old_table in tables['values'] else tables['values'][0])
            else:tables.set('')
            self.refresh(False)
        def choose_table(event=None):
            if tables.current()<0:return
            t=data['tables'][tables.current()]
            name.delete(0,'end');name.insert(0,t['name'])
            sections.set(next(x['name'] for x in data['sections'] if x['id']==t['section_id']))
        tables.bind('<<ComboboxSelected>>',choose_table)
        def selected_section():return data['sections'][sections.current()]['id']
        def selected_table():
            if tables.current()<0:raise ValueError('Masa seçin.')
            return data['tables'][tables.current()]['id']
        def action(fn):
            try:fn();name.delete(0,'end');reload()
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
        if not self.tree.selection():
            self.feedback.configure(text='Önce listeden bir sipariş seçin.');return
        if self.tree.selection():self.call(lambda:self.store.set_state(int(self.tree.selection()[0]),state))
    def item_detail(self):
        if not self.tree.selection():
            self.feedback.configure(text='Detay için listeden bir sipariş seçin.');return
        item=next((i for i in self.store.snapshot()['items'] if str(i['id'])==self.tree.selection()[0]),None)
        if not item:return
        dialog=self.dialog('Sipariş detayı',600,460)
        box=ttk.Frame(dialog,padding=20);box.pack(fill='both',expand=True)
        ttk.Label(box,text=item['name'],font=(self.font,20,'bold'),wraplength=550).pack(anchor='w')
        ttk.Label(box,text=f"Garson: {item['waiter']}\nAdet: {item['qty']}   |   Tutar: {money(item['qty']*item['price'])}\nDurum: {item['state']}",wraplength=550).pack(anchor='w',pady=16)
        ttk.Label(box,text='Sipariş notunun tamamı').pack(anchor='w')
        text=tk.Text(box,wrap='word',font=(self.font,12),height=8)
        text.insert('1.0',item['note'] or 'Not yok.');text.configure(state='disabled');text.pack(fill='both',expand=True,pady=8)
        ttk.Button(box,text='Kapat',command=dialog.destroy).pack(anchor='e')

    def backup(self):
        dialog=self.dialog('Yedekleme merkezi',760,560)
        box=self.form_panel(dialog)
        ttk.Label(box,text='Yedekleme merkezi',font=(self.font,22,'bold')).pack(anchor='w')
        ttk.Label(box,text='Her işlemde otomatik | Son 100 işlem yedeği | 30 günlük | 12 aylık',wraplength=700).pack(anchor='w',pady=12)
        status=ttk.Label(box,wraplength=700);status.pack(anchor='w',pady=8)
        files=tk.Listbox(box,font=(self.font,10));files.pack(fill='both',expand=True)
        def reload():
            s=self.store.backup_status()
            status.configure(text=f"Yerel klasör: {self.store.directory / 'yedekler'}\nHarici hedef: {self.store.backup_settings() or 'Tanımlanmamış'}\nSon yerel: {s.get('local','')}\nHarici durum: {s.get('error') or s.get('external') or 'Hedef seçilmedi'}")
            files.delete(0,'end')
            for f in sorted((self.store.directory/'yedekler').rglob('*.sqlite3'),reverse=True):files.insert('end',str(f.relative_to(self.store.directory)))
        def run(fn):
            try:fn();name.delete(0,'end');reload()
            except Exception as e:messagebox.showerror('Yedekleme hatası',str(e),parent=dialog)
        def choose():
            folder=filedialog.askdirectory(title='Harici disk veya yedek klasörü',parent=dialog)
            if folder:self.store.set_backup_directory(folder)
        def verify():
            path=filedialog.askopenfilename(title='Doğrulanacak yedek',filetypes=[('SQLite yedeği','*.sqlite3')],parent=dialog)
            if not path:return
            with closing(sqlite3.connect(Path(path).resolve().as_uri()+'?mode=ro',uri=True)) as db:
                if db.execute('PRAGMA integrity_check').fetchone()[0]!='ok':raise ValueError('Yedek bozuk.')
                tables={r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
                if not {'tables','orders','items','products','settings'}<=tables:raise ValueError('Bu dosya Lokanta Takip yedeği değil.')
            messagebox.showinfo('Doğrulandı','Yedek sağlam. Geri yüklemek için uygulamayı kapatın, mevcut veriyi ayrı yere kopyalayın ve yedeği veri klasörüne lokanta.sqlite3 adıyla yerleştirin.',parent=dialog)
        ttk.Button(box,text='Şimdi yedek al',command=lambda:run(self.store.backup)).pack(fill='x',pady=4)
        ttk.Button(box,text='Harici yedek klasörü seç',command=lambda:run(choose)).pack(fill='x',pady=4)
        ttk.Button(box,text='Harici yedeği kapat',command=lambda:run(lambda:self.store.set_backup_directory(''))).pack(fill='x',pady=4)
        ttk.Button(box,text='Yedek dosyasını doğrula',command=lambda:run(verify)).pack(fill='x',pady=4)
        reload()
    def product(self):
        name=simpledialog.askstring('Yeni ürün','Ürün adı:')
        if not name:return
        price=simpledialog.askstring('Fiyat','TL cinsinden fiyat:')
        if price is None:return
        def action():
            try: cents=parse_money(price)
            except (InvalidOperation,ValueError):raise ValueError('Geçerli bir fiyat girin.')
            self.store.product(name,cents)
        self.call(action)
    def run(self):self.root.mainloop()

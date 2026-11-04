'use strict';
const $=id=>document.getElementById(id);
const money=value=>(value/100).toLocaleString('tr-TR',{style:'currency',currency:'TRY'});
const ICONS={
 restaurant:'<path d="M5 3v7m3-7v7m3-7v7M5 7h6m-3 3v11M18 3c-3 3-3 8 0 9h2M20 3v18"/>',
 table:'<rect x="5" y="6" width="14" height="12" rx="3"/><path d="M9 3h6M9 21h6M2 9v6m20-6v6"/>',
 search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4.5 4.5"/>',
 refresh:'<path d="M20 8a8 8 0 1 0 1 6M20 3v5h-5"/>',
 arrow:'<path d="M4 12h16m-6-6 6 6-6 6"/>',
 back:'<path d="M20 12H4m6-6-6 6 6 6"/>',
 plus:'<path d="M12 5v14M5 12h14"/>',minus:'<path d="M5 12h14"/>',
 bag:'<path d="M5 7h14l1 14H4L5 7Z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
 clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
 close:'<path d="m6 6 12 12M6 18 18 6"/>',
 logout:'<path d="M9 4H4v16h5m5-4 4-4-4-4m-6 4h12"/>',
 send:'<path d="m3 3 19 9-19 9 4-9-4-9Zm4 9h15"/>',
 plate:'<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><path d="M1 4v6m2-6v6m-2-2h2m-1 2v10M23 4v16"/>',
 cup:'<path d="M5 8h12v7a5 5 0 0 1-5 5h-2a5 5 0 0 1-5-5V8Z"/><path d="M17 9h2a3 3 0 0 1 0 6h-2M8 3v2m5-2v2"/>',
 bowl:'<path d="M3 11h18a9 9 0 0 1-18 0Zm4 9h10M8 3c-2 2 2 3 0 5m5-5c-2 2 2 3 0 5m5-5c-2 2 2 3 0 5"/>',
 check:'<path d="m5 12 4 4L19 6"/>'
};
function icon(name){const span=document.createElement('span');span.setAttribute('aria-hidden','true');span.innerHTML=`<svg viewBox="0 0 24 24">${ICONS[name]||ICONS.plate}</svg>`;return span}
for(const span of document.querySelectorAll('[data-icon]'))span.append(icon(span.dataset.icon));
function element(tag,cls,text){const el=document.createElement(tag);if(cls)el.className=cls;if(text!==undefined)el.textContent=text;return el}
function action(label,cls,handler,iconName){const el=element('button',cls);el.type='button';el.setAttribute('aria-label',label);if(iconName)el.append(icon(iconName));if(!cls.includes('icon-button')&&!cls.includes('step-button'))el.append(document.createTextNode(label));el.onclick=handler;return el}
let token=sessionStorage.getItem('token')||'',owner=sessionStorage.getItem('owner')||'',state=null;
let activeTable=null,cart=[],homeSection=0,currentView='home',currentTab='menu',cancelItem=null;
let refreshing=false,flushing=false,loggingIn=false,submitting=false,connected=false,toastTimer;
const key=kind=>'lokanta-'+kind+'-'+owner;
function read(kind,fallback){
 const value=localStorage.getItem(key(kind));if(!value)return fallback;
 try{return JSON.parse(value)}catch{if(kind==='queue')throw Error('Cihazdaki bekleyen kayıt okunamıyor. Tarayıcı verilerini silmeden kasaya danışın.');return fallback}
}
function queue(){const list=read('queue',[]);if(!Array.isArray(list))throw Error('Bekleyen kayıt biçimi bozuk. Kasaya danışın.');return list}
function saveQueue(list){localStorage.setItem(key('queue'),JSON.stringify(list));renderPending()}
function saveDraft(){
 try{if(activeTable)localStorage.setItem(key('draft'),JSON.stringify({table:activeTable,lines:cart}));else localStorage.removeItem(key('draft'))}
 catch{msg('Taslak bu cihazda saklanamadı. Sayfayı kapatmayın.',true)}
}
function loadDraft(){
 const draft=read('draft',null);
 if(draft?.table&&Array.isArray(draft.lines)){activeTable=draft.table;cart=draft.lines;return true}return false;
}
function msg(text,error=false){clearTimeout(toastTimer);$('message').textContent=text;$('message').className='toast'+(error?' error':'');$('message').hidden=!text;if(text)toastTimer=setTimeout(()=>{$('message').hidden=true},error?11000:6500)}
function connection(ok){connected=ok;$('connection').textContent=ok?'● Bağlı':'○ Çevrimdışı';$('connection').className='connection'+(ok?'':' offline')}
async function api(path,data){
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),10000),requestedToken=token;
 try{
  const response=await fetch('/api/'+path,{method:data?'POST':'GET',headers:{'Content-Type':'application/json',Authorization:'Bearer '+requestedToken},body:data?JSON.stringify(data):undefined,signal:controller.signal});
  const result=await response.json();
  if(!response.ok){const error=Error(result.error||'İşlem tamamlanamadı.');error.status=response.status;
   if(response.status===401&&token===requestedToken){$('appView').hidden=true;$('loginView').hidden=false;closeDialog('cartDialog');closeDialog('cancelDialog')}
   throw error;
  }
  return result;
 }finally{clearTimeout(timeout)}
}
function showDialog(id){const dialog=$(id);if(!dialog.open){if(dialog.showModal)dialog.showModal();else dialog.setAttribute('open','')}}
function closeDialog(id){const dialog=$(id);if(dialog.open){if(dialog.close)dialog.close();else dialog.removeAttribute('open')}}
function showView(view){
 currentView=view;
 for(const name of ['home','order','pending'])$(name+'View').hidden=name!==view;
 $('bottomNav').hidden=view==='order';$('cartBar').hidden=view!=='order';
 $('navHome').classList.toggle('active',view==='home');$('navPending').classList.toggle('active',view==='pending');
 if(view==='home')renderTables();if(view==='pending')renderPending();if(view==='order')renderOrder();
 window.scrollTo({top:0,behavior:'instant'});
}
function renderIdentity(){
 $('appView').hidden=false;$('loginView').hidden=true;
 $('greeting').textContent='Kolay gelsin, '+state.user.name.split(' ')[0]+'.';
 $('avatar').textContent=state.user.name.split(' ').filter(Boolean).slice(0,2).map(s=>s[0]).join('');
 $('avatar').title=state.user.name+' ('+state.user.username+')';
 $('busyCount').textContent=state.tables.filter(t=>t.order_id).length;
 $('emptyCount').textContent=state.tables.filter(t=>!t.order_id).length;
}
function renderTables(){
 if(!state)return;
 $('sectionTabs').replaceChildren();
 for(const section of [{id:0,name:'Tümü'},...state.sections]){
  $('sectionTabs').append(action(section.name,'chip'+(section.id===homeSection?' active':''),()=>{homeSection=section.id;renderTables()}));
 }
 const search=$('tableSearch').value.trim().toLocaleLowerCase('tr');
 const tables=state.tables.filter(t=>(!homeSection||t.section_id===homeSection)&&t.name.toLocaleLowerCase('tr').includes(search));
 $('tableGrid').replaceChildren();
 if(!tables.length)$('tableGrid').append(element('div','empty-state','Masa bulunamadı. Aramayı veya bölüm filtresini değiştirin.'));
 for(const table of tables){
  const card=action(table.name,'table-card'+(table.order_id?' busy':''),()=>selectTable(table.id));card.replaceChildren();
  card.append(element('span','status-tag',table.order_id?'Adisyon açık':'Boş'));
  const visual=element('span','table-art');visual.append(icon('table'));card.append(visual);
  card.append(element('strong','',table.name),element('span','amount'+(table.total?' has-total':''),table.total?money(table.total):'Siparişe hazır'));
  const arrow=element('span','card-arrow');arrow.append(icon('arrow'));card.append(arrow);$('tableGrid').append(card);
 }
}
function selectTable(id){
 if(cart.length&&activeTable?.id!==id&&!confirm('Mevcut sepet temizlenerek başka masaya geçilsin mi?'))return;
 const table=state.tables.find(t=>t.id===id);if(!table)return;
 if(activeTable?.id!==id){activeTable={id:table.id,name:table.name,epoch:table.epoch};cart=[]}
 saveDraft();$('productSearch').value='';currentTab='menu';showView('order');
}
function cartQty(){return cart.reduce((total,line)=>total+line.qty,0)}
function cartAmount(){return cart.reduce((total,line)=>total+line.price*line.qty,0)}
function productIcon(name){name=name.toLocaleLowerCase('tr');return /çay|ayran|kahve|kola|içecek|soda|meyve suyu|(^|\s)su($|\s)/.test(name)?'cup':/çorba/.test(name)?'bowl':'plate'}
function changeQty(productId,delta){
 if(submitting)return;
 const line=cart.find(i=>i.product===productId),product=state.products.find(p=>p.id===productId);
 if(!line){if(delta<0||!product)return;if(cart.length>=50)return msg('Bir sepette en fazla 50 farklı ürün olabilir.',true);cart.push({product:productId,name:product.name,price:product.price,qty:1,note:''})}
 else{if(line.qty+delta>99)return msg('Aynı üründen en fazla 99 adet eklenebilir.',true);line.qty+=delta;if(line.qty<=0)cart=cart.filter(i=>i!==line)}
 saveDraft();renderProducts();renderCartBar();if($('cartDialog').open)renderCart();
}
function controls(line,productId,name){
 const row=element('div','product-controls');const minus=action(name+' azalt','step-button minus',()=>changeQty(productId,-1),'minus');minus.disabled=!line||submitting;
 const count=element('span','quantity',line?.qty||0);count.setAttribute('aria-label','Sepetteki adet');
 const plus=action(name+' ekle','step-button',()=>changeQty(productId,1),'plus');plus.disabled=submitting;
 row.append(minus,count,plus);return row;
}
function renderProducts(){
 if(!state||!activeTable)return;
 const search=$('productSearch').value.trim().toLocaleLowerCase('tr');
 const products=state.products.filter(p=>p.name.toLocaleLowerCase('tr').includes(search));
 $('productCount').textContent=products.length+' ürün';$('productGrid').replaceChildren();
 if(!products.length)$('productGrid').append(element('div','empty-state','Bu aramada ürün yok. Başka bir ad deneyin.'));
 for(const product of products){
  const card=element('article','product-card'),visual=element('div','product-visual');visual.append(icon(productIcon(product.name)));
  card.append(visual,element('h3','',product.name),element('span','price',money(product.price)),controls(cart.find(i=>i.product===product.id),product.id,product.name));$('productGrid').append(card);
 }
}
function renderCartBar(){
 $('cartCount').textContent=cartQty()+' ürün seçildi';$('cartTotal').textContent=money(cartAmount());$('openCart').disabled=!cart.length||submitting;
}
function renderOrder(){
 if(!activeTable)return;
 $('tableTitle').textContent=activeTable.name;
 const table=state.tables.find(t=>t.id===activeTable.id),stale=!table||table.epoch!==activeTable.epoch;
 $('draftNotice').hidden=!stale;$('draftNotice').textContent='Bu masanın hesabı değişti. Sepeti kontrol edin; yeni sipariş için masa seçim ekranından tekrar seçin.';
 $('menuTab').classList.toggle('selected',currentTab==='menu');$('billTab').classList.toggle('selected',currentTab==='bill');
 $('menuView').hidden=currentTab!=='menu';$('billView').hidden=currentTab!=='bill';
 renderProducts();renderBill();renderCartBar();
}
function renderBill(){
 if(!activeTable||!state)return;
 const items=state.items.filter(i=>i.table_id===activeTable.id);$('billList').replaceChildren();
 $('billTab').textContent='Adisyon'+(items.length?' ('+items.filter(i=>!i.cancelled).length+')':'');
 if(!items.length)$('billList').append(element('div','empty-state','Bu masada kasaya ulaşmış açık sipariş yok.'));
 for(const item of items){
  const card=element('article','bill-card'+(item.cancelled?' cancelled':'')),meta=element('div','meta');
  meta.append(element('h3','',item.qty+' × '+item.name),element('strong','',item.cancelled?'İptal':money(item.qty*item.price)));
  card.append(meta,element('p','small muted','Garson: '+item.waiter+' · '+item.state));
  if(item.note)card.append(element('div','note',item.note));
  if(item.cancelled)card.append(element('p','small danger','İptal: '+item.cancel_reason+' · '+item.cancelled_by));
  else if(item.waiter_id===state.user.id)card.append(action('Siparişi iptal et','cancel-button',()=>openCancel(item),'close'));
  $('billList').append(card);
 }
 const table=state.tables.find(t=>t.id===activeTable.id);
 $('billTotal').replaceChildren(element('span','','Kasadaki toplam'),element('strong','',money(table?.total||0)));
}
function renderCart(){
 $('cartTitle').textContent=(activeTable?.name||'')+' · Sepet';$('cartLines').replaceChildren();
 for(const line of cart){
  const row=element('article','cart-line'),head=element('div','cart-line-head'),label=element('div');label.append(element('h3','',line.name),element('span','small muted',money(line.price*line.qty)));
  head.append(label,controls(line,line.product,line.name));row.append(head);
  const note=element('textarea');note.rows=1;note.maxLength=300;note.value=line.note;note.placeholder='Bu ürüne not ekle…';note.setAttribute('aria-label',line.name+' sipariş notu');note.disabled=submitting;
  note.oninput=()=>{line.note=note.value;saveDraft()};row.append(note);$('cartLines').append(row);
 }
 $('sheetTotal').textContent=money(cartAmount());$('submitOrder').disabled=!cart.length||submitting;$('clearCart').disabled=submitting;
}
function returnHome(){
 cart=[];activeTable=null;homeSection=0;$('tableSearch').value='';$('productSearch').value='';saveDraft();closeDialog('cartDialog');showView('home');
}
function renderPending(){
 const list=queue();$('queueBadge').textContent=list.length;$('pendingList').replaceChildren();
 if(!list.length){const empty=element('div','empty-state');empty.append(icon('check'),element('h3','','Her şey tamam.'),element('p','','Bekleyen siparişiniz yok.'));$('pendingList').append(empty)}
 for(const item of list){
  const card=element('article','pending-card'+(item.error?' has-error':''));card.append(element('h3','',item.label||'Bekleyen sipariş'),element('p','muted',item.error||'Teslim onayı bekleniyor. Bağlantı kurulunca otomatik gönderilecek.'));
  const remove=action('Bekleyen kaydı kaldır','text-button danger',()=>{if(confirm('Bu bekleyen kayıt kaldırılsın mı? Yanıtı kaybolmuş sipariş kasaya ulaşmış olabilir; önce masayı kontrol edin.')){saveQueue(queue().filter(q=>q.request_id!==item.request_id));msg('Bekleyen kayıt kaldırıldı.')}});remove.disabled=flushing;card.append(remove);$('pendingList').append(card);
 }
}
async function refresh(){
 if(refreshing||!token)return;refreshing=true;const requestedToken=token;
 try{
  const next=await api('state');if(requestedToken!==token)return;
  if(owner&&owner!==String(next.user.id))throw Error('Hesap bilgisi değişti. Tekrar giriş yapın.');
  owner=String(next.user.id);sessionStorage.setItem('owner',owner);const first=!state;state=next;connection(true);
  try{localStorage.setItem(key('state'),JSON.stringify(state))}catch{msg('Cihaz depolaması dolu. Çevrimdışı kayıt yapılamayabilir.',true)}
  renderIdentity();if(first&&loadDraft())currentView='order';
  if(currentView==='home')renderTables();if(currentView==='order'){if(first)showView('order');else{renderBill();renderCartBar()}}renderPending();
  await flush();
 }catch(error){
  if(requestedToken!==token)return;connection(false);
  if(error.status===401){msg('Oturum kapandı. Bekleyen siparişler korunuyor; aynı hesapla giriş yapın.',true);return}
  if(!state&&owner){state=read('state',null);if(state){renderIdentity();if(loadDraft())showView('order');else showView('home');renderPending()}}
  msg('Kasaya bağlantı yok. Siparişler bu cihazda bekletilebilir.',true);
 }finally{refreshing=false}
}
async function flush(){
 if(flushing||!token||!owner)return;flushing=true;const account=owner;let sent=false;renderPending();
 try{
  while(queue().some(q=>!q.error)){
   const item=queue().find(q=>!q.error);
   try{await api('order',item)}catch(error){
    if(error.status&&error.status!==401&&error.status<500){const list=queue(),pending=list.find(q=>q.request_id===item.request_id);if(pending){pending.error=error.message;saveQueue(list)};continue}
    connection(false);msg(error.status===401?'Tekrar giriş yapın; bekleyen kayıtlar korunuyor.':'Sipariş cihazda güvende. Bağlantı gelince tekrar gönderilecek.',true);break;
   }
   if(owner!==account)break;
   connection(true);saveQueue(queue().filter(q=>q.request_id!==item.request_id));sent=true;
  }
  if(sent){
   msg('Sipariş kasaya ulaştı.');
   try{const next=await api('state');if(owner===account&&String(next.user.id)===account){state=next;renderIdentity();renderTables();if(activeTable)renderBill();try{localStorage.setItem(key('state'),JSON.stringify(state))}catch{}}}catch{}
  }
 }finally{flushing=false;renderPending()}
}
async function submitOrder(){
 if(submitting||!cart.length||!activeTable||!owner)return;
 const table=state.tables.find(t=>t.id===activeTable.id);
 if(!table||table.epoch!==activeTable.epoch)return msg('Masanın hesabı değişmiş. Sepeti kontrol edip masa seçiminden tekrar başlayın.',true);
 const bytes=new Uint8Array(24);crypto.getRandomValues(bytes);const request_id=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
 const order={request_id,table:activeTable.id,epoch:activeTable.epoch,items:cart.map(i=>({product:i.product,qty:i.qty,note:i.note})),label:activeTable.name+' · '+cart.map(i=>i.qty+' × '+i.name).join(', ')};
 submitting=true;renderCart();
 try{
  saveQueue([...queue(),order]);returnHome();msg('Sipariş cihazda kaydedildi, kasaya gönderiliyor.');
  await flush();
 }catch(error){msg('Kayıt tamamlanamadı: '+error.message,true)}finally{submitting=false;if(activeTable)renderCartBar()}
}
function openCancel(item){
 cancelItem=item;$('cancelSummary').textContent=activeTable.name+' · '+item.qty+' × '+item.name;$('cancelReason').value='';showDialog('cancelDialog');$('cancelReason').focus();
}
async function confirmCancel(){
 if(!cancelItem||$('confirmCancel').disabled)return;
 const reason=$('cancelReason').value.trim();if(reason.length<3)return msg('En az 3 karakterlik bir iptal nedeni girin.',true);
 $('confirmCancel').disabled=true;
 try{await api('cancel',{items:[cancelItem.id],reason});closeDialog('cancelDialog');await refresh();msg('Sipariş iptal edildi; hesap güncellendi.')}
 catch(error){msg(error.status?error.message:'İptal onayı alınamadı. Adisyonu yenileyip kontrol edin; gerekirse tekrar deneyin.',true)}finally{$('confirmCancel').disabled=false}
}
$('loginForm').onsubmit=async event=>{
 event.preventDefault();if(loggingIn||refreshing||flushing)return;loggingIn=true;$('loginButton').disabled=true;
 try{const result=await api('login',{username:$('username').value,password:$('password').value});token=result.token;sessionStorage.setItem('token',token);owner='';state=null;activeTable=null;cart=[];currentView='home';$('password').value='';await refresh();if(state)showView(currentView)}
 catch(error){msg(error.message,true)}finally{loggingIn=false;$('loginButton').disabled=false}
};
$('logout').onclick=async()=>{
 if(flushing||refreshing||submitting)return msg('Gönderim sürüyor; biraz bekleyin.');
 if((queue().length||cart.length)&&!confirm('Taslak ve bekleyen siparişler bu hesaba kayıtlı kalacak. Çıkış yapılsın mı?'))return;
 try{await api('logout',{})}catch{}finally{token='';state=null;cart=[];activeTable=null;sessionStorage.removeItem('token');$('appView').hidden=true;$('loginView').hidden=false;msg('Çıkış yapıldı.')}
};
$('tableSearch').oninput=renderTables;$('productSearch').oninput=renderProducts;
$('backHome').onclick=()=>{if(cart.length){if(!confirm('Sepet temizlenerek masa seçimine dönülsün mü?'))return;returnHome()}else returnHome()};
$('menuTab').onclick=()=>{currentTab='menu';renderOrder()};$('billTab').onclick=()=>{currentTab='bill';renderOrder()};
$('openCart').onclick=()=>{renderCart();showDialog('cartDialog')};$('closeCart').onclick=()=>{if(!submitting)closeDialog('cartDialog')};
$('clearCart').onclick=()=>{if(!submitting&&confirm('Sepet tamamen temizlensin mi?')){cart=[];saveDraft();closeDialog('cartDialog');renderOrder()}};
$('submitOrder').onclick=submitOrder;$('confirmCancel').onclick=confirmCancel;$('closeCancel').onclick=()=>{if(!$('confirmCancel').disabled)closeDialog('cancelDialog')};
$('refresh').onclick=refresh;$('retryQueue').onclick=async()=>{await refresh();await flush()};
$('navHome').onclick=()=>showView('home');$('navPending').onclick=()=>{try{showView('pending')}catch(error){msg(error.message,true)}};
window.addEventListener('online',refresh);window.addEventListener('offline',()=>connection(false));
window.addEventListener('storage',event=>{if(event.key===key('queue')){try{renderPending()}catch(error){msg(error.message,true)}}});
window.addEventListener('beforeunload',event=>{if(flushing){event.preventDefault();event.returnValue=''}});
setInterval(()=>{if(token)refresh()},7000);if(token)refresh();

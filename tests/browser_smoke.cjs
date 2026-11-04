const assert=require('node:assert/strict');
const {chromium}=require('playwright-core');
(async()=>{
 const browser=await chromium.launch({...(process.env.LOKANTA_BROWSER_PATH?{executablePath:process.env.LOKANTA_BROWSER_PATH}:process.platform==='win32'?{channel:'msedge'}:{executablePath:'/usr/bin/chromium'}),headless:true,timeout:20000,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']});
 try{
 const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto(process.env.LOKANTA_TEST_URL);await page.getByLabel('Kullanıcı adı',{exact:true}).fill('test');await page.getByLabel('Şifre',{exact:true}).fill('test123');await page.getByRole('button',{name:'Giriş yap',exact:true}).click();
 await page.waitForFunction(()=>!document.getElementById('appView').hidden);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 if(process.env.LOKANTA_SCREENSHOTS)await page.screenshot({path:process.env.LOKANTA_SCREENSHOTS+'/masalar.png',fullPage:true});
 await page.getByRole('button',{name:'Masa 1',exact:true}).click();
 await page.getByRole('button',{name:'Mercimek çorbası ekle',exact:true}).click();await page.getByRole('button',{name:'Mercimek çorbası ekle',exact:true}).click();await page.getByRole('button',{name:'Izgara köfte ekle',exact:true}).click();
 if(process.env.LOKANTA_SCREENSHOTS)await page.screenshot({path:process.env.LOKANTA_SCREENSHOTS+'/menu.png',fullPage:true});
 await page.getByRole('button',{name:'Sepeti aç'}).click();await page.getByLabel('Mercimek çorbası sipariş notu',{exact:true}).fill('Az tuzlu, ekmeksiz');
 if(process.env.LOKANTA_SCREENSHOTS)await page.screenshot({path:process.env.LOKANTA_SCREENSHOTS+'/sepet.png'});
 await page.getByRole('button',{name:'Siparişi gönder',exact:true}).click();
 await page.waitForFunction(()=>!document.getElementById('homeView').hidden&&document.getElementById('cartDialog').open===false);
 await page.waitForFunction(()=>document.getElementById('queueBadge').textContent==='0');
 const token=await page.evaluate(()=>sessionStorage.getItem('token'));
 let data=await page.evaluate(async token=>(await fetch('/api/state',{headers:{Authorization:'Bearer '+token}})).json(),token);
 assert.equal(data.items.length,2);assert.equal(data.tables[0].total,43000);assert.equal(data.items[0].note,'Az tuzlu, ekmeksiz');
 // Submit automatically reset the form without logging the waiter out.
 assert.equal(await page.evaluate(()=>cart.length),0);assert.equal(await page.evaluate(()=>activeTable),null);
 await page.getByRole('button',{name:'Masa 1',exact:true}).click();await page.getByRole('button',{name:/^Adisyon/}).click();
 await page.getByRole('button',{name:'Siparişi iptal et',exact:true}).first().click();await page.getByLabel('İptal nedeni',{exact:true}).fill('Müşteri çorba istemedi');await page.getByRole('button',{name:'İptali onayla',exact:true}).click();
 await page.waitForFunction(()=>document.getElementById('billTotal').textContent.includes('250'));
 if(process.env.LOKANTA_SCREENSHOTS)await page.screenshot({path:process.env.LOKANTA_SCREENSHOTS+'/adisyon.png',fullPage:true});
 data=await page.evaluate(async token=>(await fetch('/api/state',{headers:{Authorization:'Bearer '+token}})).json(),token);
 assert.equal(data.items.filter(i=>i.cancelled).length,1);assert.equal(data.tables[0].total,25000);
 // Offline batch is persisted and sent once on reconnection, after returning home.
 await page.getByRole('button',{name:'Masa seçimine dön',exact:true}).click();await page.getByRole('button',{name:'Masa 2',exact:true}).click();await page.getByRole('button',{name:'Çay ekle',exact:true}).click();
 await page.context().setOffline(true);await page.getByRole('button',{name:'Sepeti aç'}).click();await page.getByRole('button',{name:'Siparişi gönder',exact:true}).click();
 await page.waitForFunction(()=>!document.getElementById('homeView').hidden&&document.getElementById('queueBadge').textContent==='1');
 await page.context().setOffline(false);await page.evaluate(()=>refresh());await page.waitForFunction(()=>document.getElementById('queueBadge').textContent==='0');
 data=await page.evaluate(async token=>(await fetch('/api/state',{headers:{Authorization:'Bearer '+token}})).json(),token);assert.equal(data.items.filter(i=>i.table_id===2).length,1);
 // Wider and smaller viewports must remain usable.
 for(const width of [360,768,1200]){await page.setViewportSize({width,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true)}
 assert.deepEqual(errors,[]);console.log('Real Chromium: mobile layout, batch notes, automatic home reset, cancellation, offline replay and 360/390/768/1200 px passed.');}finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});

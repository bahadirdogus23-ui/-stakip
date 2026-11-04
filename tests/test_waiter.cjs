const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const crypto=require('node:crypto').webcrypto;
const source=fs.readFileSync('restaurant/waiter.html','utf8').split('<script>')[1].split('</script>')[0];
const data=new Map(),elements=new Map();
function element(){return {value:'',hidden:false,options:[],append(){},replaceChildren(...children){this.options=children},textContent:'',disabled:false}}
const storage={getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};
let attempts=[],accepted=new Set(),loseResponse=true;
const context=vm.createContext({console,crypto,AbortController,setTimeout,clearTimeout,setInterval(){},sessionStorage:{getItem(){return null},setItem(){},removeItem(){}},localStorage:storage,document:{getElementById(id){if(!elements.has(id))elements.set(id,element());return elements.get(id)},createElement:element},window:{addEventListener(){}},Option:function(text,value){return {text,value:String(value)}},confirm:()=>true,fetch:async(url,options)=>{
 const payload=JSON.parse(options.body);attempts.push(payload);accepted.add(payload.request_id);
 if(loseResponse)throw new TypeError('Connection lost after server commit');
 return {ok:true,status:200,json:async()=>({ok:true})};
}});
(async()=>{
 vm.runInContext(source,context);
 vm.runInContext("token='session';owner='1';state={tables:[{id:1,epoch:0,name:'Masa 1'}],products:[{id:1,name:'Çorba'}]};$('table').value='1';$('product').value='1';$('qty').value='2';$('note').value='Soğansız';",context);
 await vm.runInContext("$('send').onclick()",context);
 assert.equal(JSON.parse(data.get('lokanta-queue-1')).length,1,'Lost response must retain order');
 loseResponse=false;
 await vm.runInContext('flush()',context);
 assert.equal(JSON.parse(data.get('lokanta-queue-1')).length,0);
 assert.equal(attempts.length,2);assert.equal(accepted.size,1,'Retries must use identical request ID');
 vm.runInContext("saveQueue([{request_id:'pending-for-user-one'}]);owner='2'",context);
 assert.equal(vm.runInContext('queue().length',context),0,'Accounts must not share pending orders');
 vm.runInContext("owner='1'",context);
 assert.equal(vm.runInContext('queue().length',context),1,'Pending orders survive account switch');
 console.log('Offline queue, lost response retry, stable request ID and account isolation passed.');
})().catch(e=>{console.error(e);process.exitCode=1});

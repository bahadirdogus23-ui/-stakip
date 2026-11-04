const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const crypto=require('node:crypto').webcrypto;
const source=fs.readFileSync('restaurant/waiter.js','utf8');
const local=new Map(),session=new Map(),elements=new Map();
function node(){return {value:'',hidden:false,disabled:false,open:false,children:[],dataset:{},classList:{toggle(){}},append(...children){this.children.push(...children)},replaceChildren(...children){this.children=children},setAttribute(name,value){this[name]=value},removeAttribute(name){delete this[name]},showModal(){this.open=true},close(){this.open=false},focus(){}}}
function storage(map){return {getItem:key=>map.get(key)||null,setItem:(key,value)=>map.set(key,value),removeItem:key=>map.delete(key)}}
const state={user:{id:1,name:'Ayşe Yılmaz',username:'ayse'},tables:[{id:1,epoch:0,name:'Masa 1',total:0},{id:2,epoch:0,name:'Masa 2',total:0}],sections:[{id:1,name:'Salon'}],products:[{id:1,name:'Çorba',price:9000},{id:2,name:'Köfte',price:25000}],items:[]};
let attempts=[],accepted=new Set(),loseResponse=true;
const context=vm.createContext({console,crypto,AbortController,setTimeout(){},clearTimeout(){},setInterval(){},sessionStorage:storage(session),localStorage:storage(local),document:{getElementById(id){if(!elements.has(id))elements.set(id,node());return elements.get(id)},createElement:node,createTextNode:text=>text,querySelectorAll:()=>[]},window:{addEventListener(){},scrollTo(){}},confirm:()=>true,fetch:async(url,options)=>{
 if(url.endsWith('/state'))return {ok:true,status:200,json:async()=>state};
 const payload=JSON.parse(options.body);attempts.push(payload);accepted.add(payload.request_id);
 if(loseResponse)throw new TypeError('Connection lost after commit');
 return {ok:true,status:200,json:async()=>({ok:true})};
}});
(async()=>{
 vm.runInContext(source,context);context.fixture=state;
 vm.runInContext("token='session';owner='1';state=fixture;selectTable(1);changeQty(1,1);changeQty(1,1);changeQty(2,1);cart[0].note='Az tuzlu';saveDraft()",context);
 assert.equal(JSON.parse(local.get('lokanta-draft-1')).lines.length,2);
 await vm.runInContext('submitOrder()',context);
 const pending=JSON.parse(local.get('lokanta-queue-1'));
 assert.equal(pending.length,1,'Lost response must retain the whole batch');
 assert.equal(pending[0].items.length,2);assert.equal(pending[0].items[0].qty,2);assert.equal(pending[0].items[0].note,'Az tuzlu');
 assert.equal(vm.runInContext('currentView',context),'home');assert.equal(vm.runInContext('activeTable',context),null);assert.equal(vm.runInContext('cart.length',context),0);
 assert.equal(vm.runInContext('token',context),'session','Submit must not log out the waiter');
 assert.equal(local.get('lokanta-draft-1'),undefined,'Submit must clear the draft');
 loseResponse=false;await vm.runInContext('flush()',context);
 assert.equal(JSON.parse(local.get('lokanta-queue-1')).length,0);assert.equal(attempts.length,2);assert.equal(accepted.size,1);
 vm.runInContext("saveQueue([{request_id:'pending-for-user-one'}]);owner='2'",context);
 assert.equal(vm.runInContext('queue().length',context),0);
 vm.runInContext("owner='1'",context);assert.equal(vm.runInContext('queue().length',context),1);
 // Previously installed versions can leave single-product records in the queue.
 vm.runInContext("saveQueue([{request_id:'old-single-order-0001',table:1,product:1,qty:1,note:'',epoch:0}])",context);
 await vm.runInContext('flush()',context);assert.equal(JSON.parse(local.get('lokanta-queue-1')).length,0);
 vm.runInContext("saveQueue([]);token='old-session';owner='1';state=null",context);
 let respond;context.fetch=async()=>new Promise(resolve=>respond=resolve);
 const refreshing=vm.runInContext('refresh()',context);vm.runInContext("token='new-session';owner='2'",context);
 respond({ok:true,status:200,json:async()=>state});await refreshing;
 assert.equal(vm.runInContext('owner',context),'2');assert.equal(vm.runInContext('state',context),null);
 console.log('Batch cart, auto-reset, draft persistence, offline retry, account isolation and legacy queue passed.');
})().catch(error=>{console.error(error);process.exitCode=1});

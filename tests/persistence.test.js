'use strict';
const assert=require('node:assert/strict');
const test=require('node:test');
const fs=require('node:fs');
const vm=require('node:vm');
function fixture(load,save){
 const nodes=new Map(),timers=new Map();let id=0;
 function element(){return {value:'',textContent:'',innerHTML:'',style:{},dataset:{},hidden:false,disabled:false,children:[],classList:{add(){},remove(){}},setAttribute(){},append(...items){this.children.push(...items);},appendChild(e){this.children.push(e);},before(e){nodes.set(e.id,e);},remove(){nodes.delete(this.id);},querySelectorAll(){return [];},addEventListener(type,fn){this[type]=fn;},reset(){},focus(){}};}
 const document={getElementById(key){if(!nodes.has(key))nodes.set(key,element());return nodes.get(key);},createElement:element,createTextNode:text=>({textContent:text}),head:{appendChild(){}}};
 nodes.set('tarifa',{...element(),value:'1.00'});
 const context=vm.createContext({document,EnergyCloud:{load,save},EnergyCalc:require('../calc.js'),console:{error(){}},confirm:()=>true,alert:msg=>{throw Error(msg);},setTimeout(fn){const key=++id;timers.set(key,fn);return key;},clearTimeout(key){timers.delete(key);}});
 vm.runInContext(fs.readFileSync(require.resolve('../script.js'),'utf8'),context);
 return {nodes,start:()=>vm.runInContext('initApp()',context),async flush(){const work=[...timers.values()];timers.clear();for(const fn of work)await fn();},add(name){for(const [k,v] of Object.entries({nome:name,potencia:'100',horas:'2',dias:'30','indice-edicao':''}))document.getElementById(k).value=v;document.getElementById('form-aparelho').submit({preventDefault(){}});},status(){return nodes.get('cloud-save-status').children[0].textContent;},retry(){return nodes.get('cloud-save-status').children[2].onclick();}};
}
test('failed initial read sends zero writes and disables editing; retry loads safely',async()=>{
 let writes=0,reads=0;const f=fixture(async()=>{if(++reads===1)throw Error('offline');return {data:{aparelhos:[]},version:1};},async()=>writes++);
 await f.start();await f.flush();assert.equal(writes,0);assert.equal(f.nodes.get('tarifa').disabled,true);assert.match(f.status(),/Nenhuma alteração/);
 await f.retry();await f.flush();assert.equal(reads,2);assert.equal(writes,0);assert.equal(f.nodes.get('tarifa').disabled,false);
 f.add('Lâmpada');await f.flush();assert.equal(writes,1);
});
test('successful initial read never autosaves; failed save is visible and retried with draft intact',async()=>{
 const writes=[];const f=fixture(async()=>({data:{aparelhos:[]},version:1}),async data=>{writes.push(JSON.parse(JSON.stringify(data)));if(writes.length===1)throw Error('offline');return {version:2};});
 await f.start();await f.flush();assert.equal(writes.length,0);
 f.add('Lâmpada');await f.flush();assert.match(f.status(),/Não foi possível salvar/);assert.equal(writes[0].aparelhos[0].nome,'Lâmpada');
 await f.retry();assert.equal(writes.length,2);assert.deepEqual(writes[1],writes[0]);assert.match(f.status(),/Alterações salvas/);
});
test('slow saves serialize snapshots and newer edits finish last',async()=>{
 const writes=[];let release;const f=fixture(async()=>({data:{aparelhos:[]},version:1}),async data=>{writes.push(data);if(writes.length===1)await new Promise(r=>release=r);return {version:writes.length+1};});
 await f.start();f.add('Um');const pending=f.flush();await Promise.resolve();f.add('Dois');await f.flush();assert.equal(writes.length,1);assert.equal(writes[0].aparelhos.length,1);
 release();await pending;assert.equal(writes.length,2);assert.equal(writes[1].aparelhos.length,2);assert.match(f.status(),/Alterações salvas/);
});

test('version conflict stops autosave without overwriting and offers explicit choices',async()=>{
 const saves=[];let cloud={aparelhos:[{nome:'Geladeira',potencia:150,horas:8,dias:30,consumo:36,custo:36}],tarifa:'1.00'};
 let version=7;
 const f=fixture(async()=>({data:JSON.parse(JSON.stringify(cloud)),version}),async(data,base)=>{
  saves.push({data,base});
  if(saves.length===1){version=8;const err=new Error('CONFLITO_VERSAO');err.status=409;err.version=8;throw err;}
  return {version};
 });
 await f.start();await f.flush();
 f.add('Lâmpada');await f.flush();
 assert.equal(saves.length,1);assert.equal(saves[0].base,7);
 assert.match(f.status(),/outra aba ou dispositivo/);
 // conflicted: further edits do not trigger new writes
 f.add('Ventilador');await f.flush();assert.equal(saves.length,1);
 // explicit choice: keep local -> refetches version and overwrites informed
 const keepBtn=f.nodes.get('cloud-save-status').children[4];
 await keepBtn.onclick();await f.flush();
 assert.equal(saves.length,2);assert.equal(saves[1].base,8);
 assert.match(f.status(),/Alterações salvas/);
});
test('version conflict: loading cloud version discards local draft explicitly',async()=>{
 const cloud={aparelhos:[{nome:'Geladeira',potencia:150,horas:8,dias:30,consumo:36,custo:36}],tarifa:'1.00'};
 let version=7;const saves=[];
 const f=fixture(async()=>({data:JSON.parse(JSON.stringify(cloud)),version}),async(data,base)=>{saves.push({data,base});const err=new Error('CONFLITO_VERSAO');err.status=409;err.version=9;throw err;});
 await f.start();await f.flush();
 f.add('Lâmpada');await f.flush();assert.match(f.status(),/outra aba ou dispositivo/);
 version=9;
 const reloadBtn=f.nodes.get('cloud-save-status').children[3];
 await reloadBtn.onclick();await f.flush();
 assert.equal(saves.length,1); // never wrote again
 assert.match(f.status(),/descartadas/);
});

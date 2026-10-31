// Preview data is local to this installation and the exact verified ROM bytes.
export const PREVIEW_VERSION='arcade-car-v1';
export function previewVariant(skin,seat){
 if(!Number.isInteger(skin)||skin<0||skin>39||!Number.isInteger(seat)||seat<1||seat>8)throw Error('Invalid livery.');
 return skin?'cpu-'+String(skin).padStart(2,'0'):'original-'+seat;
}
export function previewKey(scope,digest,skin,seat){return [scope,PREVIEW_VERSION,digest,previewVariant(skin,seat)].join('|');}
export function validPreview(value){return value instanceof Blob&&value.type==='image/png'&&value.size>100&&value.size<250000;}
export function createPreviewStore(indexedDB=globalThis.indexedDB){
 let opening;
 const open=()=>opening??=new Promise((resolve,reject)=>{
  if(!indexedDB){reject(Error('Local storage unavailable.'));return;}
  const request=indexedDB.open('daytona-local-previews-v1',1);
  request.onupgradeneeded=()=>{const store=request.result.createObjectStore('previews',{keyPath:'key'});store.createIndex('scope','scope');};
  request.onsuccess=()=>{const db=request.result;db.onversionchange=()=>{db.close();opening=null;};resolve(db);};request.onerror=()=>reject(request.error);request.onblocked=()=>reject(Error('Preview storage busy.'));
 });
 async function transaction(mode,fn){const db=await open();return new Promise((resolve,reject)=>{const tx=db.transaction('previews',mode);let result;try{result=fn(tx.objectStore('previews'));}catch(e){tx.abort();reject(e);return;}tx.oncomplete=()=>resolve(result?.result);tx.onabort=tx.onerror=()=>reject(tx.error||Error('Preview storage unavailable.'));});}
 return {
  async get(key){const row=await transaction('readonly',s=>s.get(key));return validPreview(row?.blob)?row.blob:null;},
  async put(key,scope,blob){if(validPreview(blob))await transaction('readwrite',s=>s.put({key,scope,blob}));},
  async prune(scope,digest){const keys=await transaction('readonly',s=>s.index('scope').getAllKeys(scope));const prefix=[scope,PREVIEW_VERSION,digest,''].join('|');const others=keys.filter(k=>!k.startsWith(prefix));const remove=others.slice(0,Math.max(0,others.length-47));if(remove.length)await transaction('readwrite',s=>{for(const key of remove)s.delete(key);});}
 };
}
export function createSkinPreviews({getROM,scope=new URL('.',location.href).pathname,store=createPreviewStore(),makeWorker=()=>new Worker(new URL('./skin-preview-worker.js?v=53.8.57',import.meta.url),{type:'module'}),digest=async file=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',await file.arrayBuffer()))].map(b=>b.toString(16).padStart(2,'0')).join('')}={}){
 let file,hashPromise,worker,ready,pending=new Map(),sequence=0,epoch=0,tail=Promise.resolve(),active=false,urls=new Map(),jobs=new Map(),workerFailure,idleTimer;
 function stop(){clearTimeout(idleTimer);active=false;epoch++;worker?.terminate();worker=null;ready=null;workerFailure=null;for(const reject of pending.values())reject(Error('Preview cancelled.'));pending.clear();jobs.clear();tail=Promise.resolve();for(const url of urls.values())URL.revokeObjectURL(url);urls.clear();}
 function begin(){stop();active=true;const next=getROM?.();if(next!==file){file=next;hashPromise=null;}}
 function startWorker(){
  if(workerFailure)return Promise.reject(workerFailure);
  if(ready)return ready;
  let resolveReady,rejectReady;ready=new Promise((resolve,reject)=>{resolveReady=resolve;rejectReady=reject;});
  let owned=null;const timer=setTimeout(()=>fail(Error('Preview preparation timed out.')),120000);
  const fail=error=>{clearTimeout(timer);rejectReady(error);if(worker!==owned)return;workerFailure=error;for(const reject of pending.values())reject(error);pending.clear();owned?.terminate();worker=null;};
  try{
   worker=owned=makeWorker();pending.set('ready',error=>{clearTimeout(timer);rejectReady(error);});
   worker.onerror=()=>fail(Error('Preview unavailable in this browser.'));
   worker.onmessage=({data})=>{
    if(data.type==='ready'){clearTimeout(timer);pending.delete('ready');resolveReady();}
    else if(data.type==='error'){if(!data.id)fail(Error(data.message));else pending.get(data.id)?.(Error(data.message));}
   };
   worker.postMessage({type:'init',file});
  }catch(error){fail(error);}
  return ready;
 }
 async function render(skin,seat){
  clearTimeout(idleTimer);
  await startWorker();const id=++sequence,owned=worker;if(!owned)throw Error('Preview cancelled.');
  return new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>{pending.delete(id);owned.removeEventListener('message',listener);owned.terminate();const error=Error('Preview rendering timed out.');if(worker===owned){worker=null;ready=null;workerFailure=error;}reject(error);},20000);
   const listener=({data})=>{if(data.id!==id)return;clearTimeout(timer);owned.removeEventListener('message',listener);pending.delete(id);
    if(data.type==='error'){reject(Error(data.message));return;}
    if(data.type!=='pixels'||data.width!==174||data.height!==188||!(data.pixels instanceof ArrayBuffer)||data.pixels.byteLength!==174*188*4){reject(Error('Invalid preview.'));return;}
    const canvas=document.createElement('canvas');canvas.width=data.width;canvas.height=data.height;
    try{canvas.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(data.pixels),data.width,data.height),0,0);canvas.toBlob(blob=>blob?resolve(blob):reject(Error('Preview encoding failed.')),'image/png');}catch(error){reject(error);}
   };
   pending.set(id,error=>{clearTimeout(timer);owned.removeEventListener('message',listener);reject(error);});owned.addEventListener('message',listener);owned.postMessage({type:'render',id,skin,seat});
  });
 }
 async function get(skin,seat){
  const variant=previewVariant(skin,seat),ticket=epoch;if(!active||!file)throw Error('Choose a valid ROM first.');
  if(urls.has(variant))return urls.get(variant);if(jobs.has(variant))return jobs.get(variant);
  const cancelled=()=>!active||ticket!==epoch;
  const job=(async()=>{
   if(!hashPromise)hashPromise=digest(file).then(async hash=>{try{await store.prune(scope,hash);}catch{}return hash;});
   const hash=await hashPromise;if(cancelled())throw Error('Preview cancelled.');
   const key=previewKey(scope,hash,skin,seat);let blob;try{blob=await store.get(key);}catch{}
   if(cancelled())throw Error('Preview cancelled.');
   if(!validPreview(blob)){
    const task=tail.catch(()=>{}).then(()=>{if(cancelled())throw Error('Preview cancelled.');return render(skin,seat);});tail=task;blob=await task;
    if(cancelled())throw Error('Preview cancelled.');try{await store.put(key,scope,blob);}catch{}
   }
   if(cancelled())throw Error('Preview cancelled.');const url=URL.createObjectURL(blob);urls.set(variant,url);return url;
  })();jobs.set(variant,job);try{return await job;}finally{if(ticket===epoch){jobs.delete(variant);if(!jobs.size&&worker){clearTimeout(idleTimer);idleTimer=setTimeout(()=>{if(!jobs.size&&!pending.size){worker?.terminate();worker=null;ready=null;}},30000);}}}
 }
 return {begin,get,stop};
}

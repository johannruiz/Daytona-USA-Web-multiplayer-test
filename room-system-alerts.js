import {arrivalRoomKey} from './room-arrivals.js?v=53.8.59';
const active=s=>s&&[...(s.members||[]),...(s.waiting||[])].some(p=>p.id===s.id)&&(s.isHost&&s.phase==='lobby'||['preparing','playing'].includes(s.phase)||s.phase==='waiting'&&['preparing','playing'].includes(s.remotePhase));
export function createRoomSystemAlerts({NotificationAPI=globalThis.Notification,serviceWorkers=globalThis.navigator?.serviceWorker,secure=globalThis.isSecureContext,
 onClick=()=>{},focusWindow=()=>globalThis.focus(),token=()=>globalThis.crypto?.randomUUID?.()||Date.now()+'-'+Math.random().toString(36).slice(2),workerURL=new URL('./room-alerts-sw.js?v=53.8.59',import.meta.url),
 schedule=setTimeout,cancel=clearTimeout}={}){
 let state=null,key='',stamp='',live=false,asked=false,registration=null,workerPromise=null;const notices=new Set();
 const allowed=()=>secure&&NotificationAPI?.permission==='granted';
 const current=(event,savedStamp=stamp)=>active(state)&&arrivalRoomKey(state)===event.roomKey&&savedStamp===stamp;
 function ensureWorker(){
  if(!serviceWorkers||!allowed())return Promise.resolve(null);
  if(workerPromise)return workerPromise;
  workerPromise=(async()=>{try{
   registration=await serviceWorkers.register(workerURL.href,{updateViaCache:'none'});
   const worker=registration.active||registration.installing||registration.waiting;
   if(!worker)return null;if(worker.state==='activated')return worker;
   return await new Promise(resolve=>{
    let timer;const finish=value=>{cancel(timer);worker.removeEventListener('statechange',changed);resolve(value);};
    const changed=()=>{if(worker.state==='activated')finish(worker);else if(worker.state==='redundant')finish(null);};
    timer=schedule(()=>finish(null),5000);worker.addEventListener('statechange',changed);changed();
   });
  }catch{return null;}})().then(worker=>{if(!worker)workerPromise=null;return worker;});return workerPromise;
 }
 serviceWorkers?.addEventListener('message',event=>{
  const data=event.data;
  if(event.source!==registration?.active||data?.type!=='daytona-room-alert-click'||data.stamp!==stamp||!['joined','request','spectating','left'].includes(data.kind)||!active(state)||data.kind==='request'&&!state.isHost)return;
  onClick({kind:data.kind});
 });
 function clear(oldStamp){
  for(const notification of notices)notification.close();notices.clear();
  if(oldStamp)try{registration?.active?.postMessage({type:'daytona-room-alert-close',stamp:oldStamp});}catch{}
 }
 return {
  sync(next){const nextKey=arrivalRoomKey(next),nextLive=active(next);if(key!==nextKey){clear(stamp);key=nextKey;stamp=key?token():'';}else if(live&&!nextLive)clear(stamp);state=next;live=nextLive;},
  // Called synchronously by Create/Join gestures, never on a visit.
  enable(){
   if(!secure||!NotificationAPI)return Promise.resolve(false);
   if(allowed())return ensureWorker().then(()=>true);
   if(NotificationAPI.permission!=='default'||asked)return Promise.resolve(false);
   asked=true;let result;try{result=NotificationAPI.requestPermission();}catch{return Promise.resolve(false);}
   return Promise.resolve(result).then(permission=>permission==='granted'?ensureWorker().then(()=>true):false).catch(()=>false);
  },
  async show(event){
   if(!event.system||!['joined','request','spectating','left'].includes(event.kind)||event.kind==='request'&&!state?.isHost||!allowed()||!current(event))return false;
   const savedStamp=stamp,worker=await ensureWorker();if(!allowed()||!current(event,savedStamp))return false;
   const title='Daytona USA · '+({request:'Join request',joined:event.spectator?'Spectator joined':'Driver joined',spectating:'Now spectating',left:'Left the room'}[event.kind]);
   const body=event.kind==='request'?`${event.name} requested access to ${event.roomName||'your room'}.`:event.kind==='left'?`${event.name} left ${event.roomName||'your room'}.`:event.kind==='spectating'?`${event.name} is now spectating ${event.roomName||'your room'}.`:`${event.name} joined ${event.roomName||'your room'}${event.spectator?' as a spectator':''}.`;
   const tag=`daytona-${savedStamp}-${event.kind}-${event.id}`.slice(0,180);
   if(worker){try{worker.postMessage({type:'daytona-room-alert',title,body,tag,stamp:savedStamp,kind:event.kind});return true;}catch{}}
   try{
    const notification=new NotificationAPI(title,{body,tag,silent:true,icon:new URL('./daytona-logo.png',import.meta.url).href});notices.add(notification);
    notification.onclose=()=>notices.delete(notification);
    notification.onclick=()=>{notification.close();if(current(event,savedStamp)){focusWindow();onClick(event);}};return true;
   }catch{return false;}
  },
  dispose(){clear(stamp);state=null;key='';stamp='';live=false;}
 };
}

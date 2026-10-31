export const ROOM_ANNOUNCEMENT_ENDPOINT='https://daytona-discord.sebiches1.workers.dev/rooms';
// Optional side effect of a successful public-directory publication. Never
// awaited by gameplay or Firebase heartbeats; no recurring client timer.
export function createRoomAnnouncements({endpoint=ROOM_ANNOUNCEMENT_ENDPOINT,fetcher=fetch,
 tokens=async()=>{const sdk=await import('./firebase-client.js?v=53.8.59');return sdk.getConnectionTokens();},
 setTimer=(fn,ms)=>setTimeout(fn,ms),clearTimer=id=>clearTimeout(id)}={}){
 const entries=new Map();
 async function send(entry,action){
  const credentials=await tokens();if(action==='announce'&&entry.closed)return false;
  const response=await fetcher(endpoint,{method:'POST',credentials:'omit',keepalive:action==='close',headers:{'Content-Type':'application/json',Authorization:'Bearer '+credentials.idToken,'X-Firebase-AppCheck':credentials.appCheckToken},body:JSON.stringify({action,roomId:entry.id}),signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw Object.assign(Error('Room announcement unavailable.'),{status:response.status});return true;
 }
 function announce(entry){
  entry.attempts++;entry.task=send(entry,'announce').catch(error=>{
   // One bounded retry for transient failures, never for denied/limited requests.
   if(!entry.closed&&entry.attempts<2&&(!error.status||error.status>=500))entry.timer=setTimer(()=>{entry.timer=null;announce(entry);},30000);
   return false;
  });
 }
 return {
  published(id){if(!/^[a-f0-9]{32}$/.test(id)||entries.has(id))return;const entry={id,closed:false,attempts:0,task:null,timer:null};entries.set(id,entry);announce(entry);},
  withdraw(id){const entry=entries.get(id);if(!entry||entry.closed)return;entry.closed=true;if(entry.timer)clearTimer(entry.timer);entry.timer=null;
   // Close follows any in-flight announce. The server's expiry check covers
   // abrupt page exits and failed keepalive delivery.
   Promise.resolve(entry.task).then(()=>send(entry,'close')).catch(()=>{});
  }
 };
}

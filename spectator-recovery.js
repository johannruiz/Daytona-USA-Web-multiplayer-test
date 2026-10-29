// Driven by the existing viewer frame/watchdog, never a new polling loop.
export const SPECTATOR_RETRY_LIMIT=5;
const delays=[6000,12000,20000,30000,30000];
export function createSpectatorRecovery({request,onRetry=()=>{},onExhausted=()=>{},now=()=>performance.now()}){
 let epoch='',attempts=0,due=null;
 return {
  fail(next){if(next!==epoch){epoch=next;attempts=0;}if(due===null)due=now()+1000;},
  connecting(next){if(next!==epoch){epoch=next;attempts=0;}due=null;},
  healthy(){attempts=0;due=null;},
  cancel(){epoch='';attempts=0;due=null;},
  tick(allowed,at=now()){
   if(!allowed||due===null||at<due)return;
   if(attempts>=SPECTATOR_RETRY_LIMIT){due=null;onExhausted();return;}
   attempts++;due=at+delays[attempts-1];onRetry(attempts,SPECTATOR_RETRY_LIMIT);
   try{request();}catch{} // Optional transport errors stay out of the room UI.
  },
  state:()=>({epoch,attempts,due})
 };
}

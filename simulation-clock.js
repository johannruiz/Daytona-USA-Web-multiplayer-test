// Coordinate fixed simulation steps with presentation. A timer maintains the
// same clock when RAF is absent/slow; it does not race healthy refreshes.
export const ARCADE_STEP_MS=1000/(16000000/(656*424));
export class SimulationClock {
 constructor({step,before=()=>true,onState=()=>{},onError=()=>{},now=()=>performance.now(),schedule=(fn,ms)=>setTimeout(fn,ms),cancel=id=>clearTimeout(id),stepMs=ARCADE_STEP_MS,budgetMs=6,maxSteps=8,presentationGraceMs=32}){
  Object.assign(this,{step,before,onState,onError,now,schedule,cancel,stepMs,budgetMs,maxSteps,presentationGraceMs});
  this.active=false;this.timer=null;this.generation=0;this.ticket=0;this.lagMs=0;this.lastTime=0;this.lastPresentation=null;
 }
 publish(){this.onState({lagMs:this.lagMs,lastTime:this.lastTime});}
 accrue(at=this.now()){const current=Math.max(this.lastTime,at);this.lagMs+=current-this.lastTime;this.lastTime=current;}
 start({reset=true}={}){
  if(this.active&&!reset)return;
  this.stop();this.active=true;
  if(reset){this.lagMs=this.stepMs;this.lastTime=this.now();this.lastPresentation=null;}
  this.publish();this.queue(0);
 }
 cancelTimer(){this.ticket++;if(this.timer!==null)this.cancel(this.timer);this.timer=null;}
 stop(){this.active=false;this.generation++;this.cancelTimer();}
 queue(delay){this.cancelTimer();const generation=this.generation,ticket=this.ticket;this.timer=this.schedule(()=>{if(!this.active||generation!==this.generation||ticket!==this.ticket)return;this.timer=null;this.pump();},delay);}
 present(timestamp=this.now()){
  if(!this.active)return 1;
  this.cancelTimer();this.lastPresentation=this.now();this.pump(timestamp);
  return Math.min(1,Math.max(0,(this.lagMs-Math.max(0,this.lastTime-timestamp))/this.stepMs));
 }
 pump(at=this.now()){
  const generation=this.generation;
  try{
   // RAF's timestamp is stable even when dispatch itself is slightly late.
   // A fallback timer uses actual time; never rewind if it ran before RAF.
   this.accrue(at);this.publish();
   if(this.before(this.lastTime)===false){this.stop();return;}
   const begin=this.now();let count=0;
   while(this.active&&generation===this.generation&&this.lagMs>=this.stepMs&&count<this.maxSteps&&(count===0||this.now()-begin<this.budgetMs)){
    if(this.step(this.now())===false){this.stop();return;}
    this.lagMs-=this.stepMs;count++;
   }
   if(!this.active||generation!==this.generation)return;
   // Native execution also consumes real time; include it before scheduling.
   this.accrue();this.publish();
   const grace=this.lastPresentation===null?0:this.lastPresentation+this.presentationGraceMs-this.lastTime;
   // Do not slip an extra state between healthy refreshes just because the
   // step's own work crossed a deadline. Larger debt still yields/retries.
   const waitForPresentation=grace>0&&this.lagMs<2*this.stepMs;
   this.queue(this.lagMs>=this.stepMs&&!waitForPresentation?0:Math.max(1,this.stepMs-this.lagMs,grace));
  }catch(error){this.stop();this.onError(error);}
 }
}

import {linkIdForSeat} from './central-link.js?v=53.8.45';
import {NATIVE_HZ} from './link-timing.js?v=53.8.45';

const integer=(x,a,b)=>Number.isSafeInteger(x)&&x>=a&&x<=b;
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const stepMs=1000/NATIVE_HZ;
const signature=links=>links.reduce((v,x,i)=>(v|x<<(i*4))>>>0,0);
const mappedIDs=(links,members)=>links.map(link=>members.find((m,i)=>linkIdForSeat(i+1,members.length)===link)?.id);

// Executed after every genuine native step, including steps without drawing.
// Original finish events are retained across races until acknowledged. Coalescing reports cannot
// erase a finish, and duplicates do not generate additional crossings.
export class LocalRaceReporter {
 constructor(){this.reset();}
 reset(){this.lastSent=-Infinity;this.finish=null;this.run=0;this.lastEvent=0;this.lastScene=-1;this.startedAt=0;this.sentFinish=undefined;this.previous=new Map();this.acknowledged=new Set();this.lastReport=null;}
 observe(v,at,uncertaintyMs){
  if(!v||v.length<37||v[0]!==1||!finite(at)||!finite(uncertaintyMs))return null;
  const run=v[1];if(run!==this.run){if(this.lastReport?.run&&!this.acknowledged.has(this.lastReport.run)){this.previous.set(this.lastReport.run,this.lastReport);while(this.previous.size>8)this.previous.delete(this.previous.keys().next().value);}this.run=run;this.startedAt=at;this.finish=null;this.lastEvent=0;this.sentFinish=undefined;this.lastSent=-Infinity;}
  const scene=v[4],valid=v[5]===1;
  if(v[18]===run&&v[17]>this.lastEvent){
   this.lastEvent=v[17];this.finish={sequence:v[17],clock:v[19],lap:v[21],raceTicks:v[20],at,uncertaintyMs:uncertaintyMs+stepMs/2};
  }
  const urgent=this.lastScene!==scene||this.finish?.sequence!==this.sentFinish;
  this.lastScene=scene;if(!urgent&&at-this.lastSent<100)return null;
  this.lastSent=at;this.sentFinish=this.finish?.sequence;
  const result={version:1,run,startedAt:this.startedAt,sequence:v[2],clock:v[3],scene,valid,at,uncertaintyMs:uncertaintyMs+stepMs/2,finish:this.finish};
  if(!valid)return this.publish(result);
  return this.publish({...result,car:v[6],count:v[7],course:v[8],laps:v[9],lap:v[10],roadLap:v[11],progress:v[12],sector:v[13],sectors:v[14],raceTicks:v[15],callback:v[16],checkpoint:v[22],links:Array.from(v.slice(24,24+v[7])),finish:this.finish});
 }
 publish(report){this.lastReport=report;return {...report,previous:[...this.previous.values()]};}
 acknowledge(order,id){const row=order?.rows?.find(r=>r.id===id);if(!row||(row.status!=='finished'&&order.phase!=='final'))return;this.previous.delete(row.run);this.acknowledged.add(row.run);while(this.acknowledged.size>16)this.acknowledged.delete(this.acknowledged.values().next().value);}
}

export function validateRaceReport(value,id,members){
 if(!value||value.version!==1||!integer(value.run,0,0xffffffff)||!integer(value.sequence,1,0xffffffff)||!integer(value.clock,0,0xffffffff)||!integer(value.scene,0,31)||!finite(value.at)||!finite(value.startedAt)||value.startedAt>value.at||value.at-value.startedAt>86400000||!finite(value.uncertaintyMs)||value.uncertaintyMs<0||value.uncertaintyMs>500)return null;
 const base={...value};
 if(value.finish){const f=value.finish;if(!integer(f.sequence,1,0xffffffff)||!integer(f.clock,0,0xffffffff)||!integer(f.lap,1,255)||!integer(f.raceTicks,0,0xffffffff)||!finite(f.at)||f.at>value.at+1||value.at-f.at>300000||!finite(f.uncertaintyMs)||f.uncertaintyMs<0||f.uncertaintyMs>500)return null;}
 if(value.valid!==true)return {...base,valid:false};
 const v=value;
 if(!v.run||!integer(v.count,2,8)||!integer(v.car,0,v.count-1)||!integer(v.course,0,2)||!integer(v.laps,1,255)||!integer(v.lap,0,255)||!integer(v.roadLap,-128,127)||!integer(v.sectors,100,2000)||!integer(v.sector,0,v.sectors)||!integer(v.raceTicks,0,0xffffffff)||!integer(v.callback,0,0xffffffff)||!finite(v.progress)||Math.abs(v.progress)>32768||!Array.isArray(v.links)||v.links.length!==v.count||new Set(v.links).size!==v.count||v.links.some(x=>!integer(x,1,8)))return null;
 const ids=mappedIDs(v.links,members);if(ids.some(x=>!x)||ids[v.car]!==id)return null;
 if(v.finish){const f=v.finish;if(!integer(f.sequence,1,0xffffffff)||!integer(f.clock,0,0xffffffff)||!integer(f.lap,v.laps,255)||!integer(f.raceTicks,0,0xffffffff)||!finite(f.at)||f.at>v.at+1||v.at-f.at>300000||!finite(f.uncertaintyMs)||f.uncertaintyMs<0||f.uncertaintyMs>500)return null;}
 return {...base,ids};
}

function finishAt(v,stamp){
 const f=v.finish;if(!f)return null;
 // The latched event shares its owner's monotonic clock with the current
 // report. It can survive long delays without treating receipt time as finish.
 const elapsed=v.at-f.at;
 return {...f,at:stamp.at-elapsed,uncertainty:Math.max(0,stamp.uncertainty-v.uncertaintyMs)+f.uncertaintyMs+elapsed*.0002};
}

function at(points,time){
 if(!points.length||time<points[0].at||time>points.at(-1).at)return null;
 for(let i=1;i<points.length;i++)if(time<=points[i].at){const a=points[i-1],b=points[i];if(b.at-a.at>300)return null;return a.progress+(b.progress-a.progress)*(time-a.at)/(b.at-a.at);}
 return points.at(-1).progress;
}

// Host-only ledger. A snapshot watermark includes the persistent finish event,
// so the host waits for causal evidence from every participant, not a guessed
// timeout after the first arriving finish packet. Simulation never waits here.
export class HostRaceAuthority {
 constructor(epoch,members,{reverse=false}={}){this.epoch=epoch;this.members=members.map(m=>({...m}));this.reverse=reverse;this.groups=[];this.bindings=new Map();this.serial=0;this.revision=0;}
 observe(id,value,now,toHost){
  const v=validateRaceReport(value,id,this.members);if(!v||!finite(now))return false;
  let old=this.bindings.get(id);
  if(old&&v.run<old.run){const group=[...this.groups].reverse().find(g=>g.tracks.get(id)?.run===v.run);if(!group)return false;const track=group.tracks.get(id);old={run:v.run,sequence:track.sequence||0,group,track};}
  if(old&&v.run===old.run&&v.sequence<=old.sequence)return false;
  if(!v.valid){
   if(old&&v.run===old.run){
    if(old.group.final){old.sequence=old.track.sequence=v.sequence;return true;}
    const stamp=toHost(v.at,v.uncertaintyMs);
    if(!stamp||!finite(stamp.at)||!finite(stamp.uncertainty)||stamp.uncertainty<0||stamp.uncertainty>1000)return false;
    old.sequence=old.track.sequence=v.sequence;
    if(old.track.last)old.track.last={...old.track.last,at:stamp.at,uncertainty:stamp.uncertainty};
    if(v.finish&&!old.track.finish&&v.finish.lap>=old.track.last.laps){const f=finishAt(v,stamp);if(f.uncertainty<=2000)old.track.finish={...f,receivedAt:now};}
    if(v.scene<20||v.scene>=23)old.track.terminal=true;
   }
   return true;
  }
  const stamp=toHost(v.at,v.uncertaintyMs);if(!stamp||!finite(stamp.at)||!finite(stamp.uncertainty)||stamp.uncertainty<0||stamp.uncertainty>1000||stamp.at>now+stamp.uncertainty+10||now-stamp.at>(old?.run===v.run&&(v.scene>=23||v.scene<20)?300000:10000))return false;
  const key=JSON.stringify([v.links,v.course,v.laps,v.sectors,this.reverse]);let group=old?.run===v.run?old.group:null;
  if(group&&group.key!==key)return false;
  if(!group){
   group=[...this.groups].reverse().find(g=>g.key===key&&!g.final&&!g.tracks.has(id)&&Math.abs(g.startAt-(stamp.at-(v.at-v.startedAt)))<=5000);
   if(!group){group={id:`${this.epoch}:${++this.serial}`,key,startAt:stamp.at-(v.at-v.startedAt),course:v.course,laps:v.laps,links:[...v.links],ids:v.ids,tracks:new Map(),final:false,lastPublish:-Infinity,lastKey:'',snapshot:null};this.groups.push(group);while(this.groups.length>16){const removed=this.groups.shift();for(const [who,b] of this.bindings)if(b.group===removed)this.bindings.delete(who);}}
   const track={id,run:v.run,sequence:0,car:v.car,points:[],finish:null,terminal:false,last:null};group.tracks.set(id,track);this.bindings.set(id,{run:v.run,sequence:v.sequence,group,track});
  }
  const binding=old?.run===v.run?old:this.bindings.get(id),track=binding.track;binding.sequence=track.sequence=v.sequence;
  // A final decision is immutable. Old/repeated telemetry cannot revise it.
  if(group.final)return true;
  const wasTerminal=track.terminal;track.last={...v,at:stamp.at,uncertainty:stamp.uncertainty};track.terminal=track.terminal||v.scene>=23;
  const p=track.points.at(-1),delta=p?(v.clock-p.clock)>>>0:1;
  if(!wasTerminal&&(!p||(delta>0&&delta<0x80000000&&stamp.at>p.at))){
   if(p&&(delta>128||Math.abs(v.progress-p.progress)>32))track.points=[];
   track.points.push({clock:v.clock,at:stamp.at,progress:v.progress});while(track.points.length>128)track.points.shift();
  }
  if(v.finish&&!track.finish){
   const f=finishAt(v,stamp);
   if(f.uncertainty<=2000)track.finish={...f,receivedAt:now};
  }
  return true;
 }
 poll(now){
  const updates=[];
  for(const g of this.groups){
   if(g.final||now-g.lastPublish<100||g.ids.some(id=>!g.tracks.has(id)))continue;
   const tracks=g.ids.map(id=>g.tracks.get(id));if(tracks.some(t=>!t.last))continue;
   const common=Math.min(...tracks.map(t=>t.points.at(-1)?.at??-Infinity));
   const values=new Map(tracks.map(t=>[t.id,at(t.points,common)]));
   const commonKnown=finite(common)&&now-common<=1000&&tracks.every(t=>values.get(t.id)!==null);
   const finishes=tracks.filter(t=>t.finish),allTerminal=tracks.every(t=>t.finish||t.terminal);
   // A later complete report with no earlier finish is causal evidence that
   // its owner did not finish before this candidate, allowing for clock bounds.
   const confirmed=new Set(finishes.filter(t=>tracks.every(other=>other.finish||other.terminal||other.last.at-other.last.uncertainty>=t.finish.at+t.finish.uncertainty)).map(t=>t.id));
   if(!commonKnown&&!finishes.length&&!allTerminal)continue;
   if(!commonKnown&&!allTerminal&&tracks.some(t=>!t.finish)&&!g.snapshot)continue;
   const previous=new Map((g.snapshot?.rows||[]).map(r=>[r.id,r.position]));
   const sorted=[...tracks].sort((a,b)=>{
    if(a.finish&&b.finish)return a.finish.at-b.finish.at||a.car-b.car;
    if(a.finish||b.finish)return a.finish?-1:1;
    const pa=commonKnown?values.get(a.id):allTerminal?a.points.at(-1)?.progress:null,pb=commonKnown?values.get(b.id):allTerminal?b.points.at(-1)?.progress:null;
    if(finite(pa)&&finite(pb)){const delta=this.reverse?pa-pb:pb-pa;if(Math.abs(delta)>1/1024)return delta;}
    return (previous.get(a.id)??a.car)-(previous.get(b.id)??b.car);
   });
   const rows=sorted.map((t,i)=>({id:t.id,run:t.run,car:t.car,position:i+1,status:t.finish?(confirmed.has(t.id)?'finished':'confirming'):t.terminal?'dnf':'racing',photoFinish:false}));
   for(let i=0;i<sorted.length;i++)if(sorted[i].finish)for(let j=i+1;j<sorted.length;j++)if(sorted[j].finish){
    const a=sorted[i].finish,b=sorted[j].finish;if(Math.abs(a.at-b.at)<=a.uncertainty+b.uncertainty)rows[i].photoFinish=rows[j].photoFinish=true;
   }
   const terminal=tracks.every(t=>t.finish||t.terminal),allConfirmed=finishes.every(t=>confirmed.has(t.id));
   const phase=terminal&&allConfirmed?'final':finishes.some(t=>!confirmed.has(t.id))?'confirming':'racing';
   const data={version:1,epoch:this.epoch,race:g.id,course:g.course,laps:g.laps,links:g.links,signature:signature(g.links),phase,rows,basis:commonKnown?'common-time':allTerminal?'terminal-progress':'held-order',commonAgeMs:commonKnown?Math.max(0,now-common):null};
   const key=JSON.stringify([phase,rows]);g.lastPublish=now;if(key===g.lastKey)continue;
   data.revision=++this.revision;g.lastPublish=now;g.lastKey=key;g.snapshot=data;g.final=phase==='final';updates.push(structuredClone(data));
  }
  return updates;
 }
}

export function validateRaceOrder(v,epoch,members){
 if(!v||v.version!==1||v.epoch!==epoch||typeof v.race!=='string'||!v.race.startsWith(epoch+':')||v.race.length>80||!integer(v.revision,1,0xffffffff)||!integer(v.course,0,2)||!integer(v.laps,1,255)||!['racing','confirming','final'].includes(v.phase)||!Array.isArray(v.rows)||v.rows.length<2||v.rows.length>8||!Array.isArray(v.links)||v.links.length!==v.rows.length||new Set(v.links).size!==v.links.length||v.links.some(x=>!integer(x,1,8))||v.signature!==signature(v.links))return null;
 const ids=mappedIDs(v.links,members),seen=new Set(),places=new Set();
 for(const r of v.rows){if(!r||!integer(r.car,0,v.rows.length-1)||ids[r.car]!==r.id||seen.has(r.id)||!integer(r.run,1,0xffffffff)||!integer(r.position,1,v.rows.length)||places.has(r.position)||!['racing','confirming','finished','dnf'].includes(r.status)||typeof r.photoFinish!=='boolean')return null;seen.add(r.id);places.add(r.position);}
 if(v.phase==='final'&&v.rows.some(r=>r.status!=='finished'&&r.status!=='dnf'))return null;
 return structuredClone(v);
}

export class RaceOrderInbox {
 constructor(epoch,members){this.epoch=epoch;this.members=members;this.orders=new Map();}
 receive(value){const v=validateRaceOrder(value,this.epoch,this.members);if(!v)return false;const old=this.orders.get(v.race);if(old&&(v.revision<=old.revision||old.phase==='final'))return false;this.orders.set(v.race,v);while(this.orders.size>16)this.orders.delete(this.orders.keys().next().value);return true;}
 forPlayer(id,run){return [...this.orders.values()].reverse().find(v=>v.rows.some(r=>r.id===id&&r.run===run))??null;}
}

export function applyNativeOrder(wasm,sample,order){
 if(!wasm||!sample||sample[5]!==1||!order)return false;
 const row=order.rows.find(r=>r.run===sample[1]&&r.car===sample[6]);
 if(!row||order.signature!==(sample[36]>>>0)||order.course!==sample[8]||order.laps!==sample[9])return false;
 let packed=0,mask=0,finalMask=0;for(const r of order.rows){packed|=(r.position-1)<<(r.car*4);mask|=1<<r.car;if(order.phase==='final'||r.status==='finished')finalMask|=1<<r.car;}
 return !!wasm._daytona_race_order(sample[1],order.revision,order.signature,packed>>>0,mask,finalMask);
}

import {linkIdForSeat,SAMPLE_BYTES,STATE_BYTES,STATE_TAG,SLOT_BYTES} from './central-link.js?v=53.8.59';
import {carColor} from './car-colors.js?v=53.8.59';

// Original block: 00..07 = human ranks by race car ID; 0b = human count;
// 0c..13 = link ID by race car ID. Race IDs are not selectable lobby seats.
export function nativeStandings(bytes,members,localId){
 if(!(bytes instanceof Uint8Array)||bytes.length!==SAMPLE_BYTES||members.length<1||members.length>8)return null;
 const local=members.findIndex(m=>m.id===localId),count=bytes[1+0x0b];
 if(local<0||bytes[0]!==linkIdForSeat(local+1,members.length)||count<1||count>members.length)return null;
 const own=bytes[1+0x44];if(own>=count||bytes[1+0x0c+own]!==bytes[0])return null;
 const ranks=new Map(),seenLinks=new Set(),seenRanks=new Set();
 for(let car=0;car<count;car++){
  const link=bytes[1+0x0c+car],rank=bytes[1+car],index=members.findIndex((_,i)=>linkIdForSeat(i+1,members.length)===link);
  if(index<0||seenLinks.has(link)||rank>=count||seenRanks.has(rank))return null;
  seenLinks.add(link);seenRanks.add(rank);ranks.set(members[index].id,rank+1);
 }
 return ranks;
}
export class RaceStandings {
 constructor(){this.epoch='';this.active=false;this.members=[];this.id='';this.reset();}
 reset(){this.visible=false;this.scene=null;this.coordinator=0;this.source=0;this.own=null;this.ranks=new Map();this.sources=new Map();this.header=new Uint8Array(20).fill(255);this.authoritative=null;this.awaitingFinish=false;}
 sync({active,epoch,id,members}){if(!active||this.epoch!==epoch)this.reset();this.active=!!active;this.epoch=epoch;this.id=id;this.members=members;}
 ingest(bytes){
  if(!this.active||!(bytes instanceof Uint8Array)||bytes.length!==SAMPLE_BYTES)return;
  const local=this.members.findIndex(m=>m.id===this.id);if(local<0||bytes[0]!==linkIdForSeat(local+1,this.members.length))return;
  const scene=bytes[1+0x1b];if(scene>31)return;
  // Boot/attract uses 0..10; selection starts at 11. Preserve genuine final
  // positions through results and name entry; clear only at attract/new race.
  if(scene<=10){if(this.visible||this.ranks.size)this.reset();this.scene=scene;return;}
  if((scene===20&&this.scene!==20)||(scene<20&&this.scene>=20)){this.ranks.clear();this.sources.clear();this.header.fill(255);this.authoritative=null;this.awaitingFinish=false;}
  this.scene=scene;if(scene>=20)this.visible=true;else return;
  this.coordinator=bytes[1+0x18];this.store(bytes[0],bytes.subarray(1,1+0x45));this.apply();
 }
 store(link,header){let sample=this.sources.get(link);if(!sample){sample=new Uint8Array(SAMPLE_BYTES);sample[0]=link;this.sources.set(link,sample);}sample.set(header,1);}
 receive(bytes){
  if(!this.active||!(bytes instanceof Uint8Array)||bytes.length!==STATE_BYTES||bytes[0]!==STATE_TAG)return;
  const count=this.members.length,local=this.members.findIndex(m=>m.id===this.id);if(local<0||count<1||count>8)return;
  for(let slot=0;slot<count;slot++){const source=(local-1-slot+count*8)%count,offset=1+slot*SLOT_BYTES;if(source!==local)this.store(linkIdForSeat(source+1,count),bytes.subarray(offset,offset+0x45));}
  this.apply();
 }
 acceptAuthority(order){
  if(!this.active||!this.visible||this.scene<20||order?.epoch!==this.epoch||!order.rows.some(r=>r.id===this.id))return;
  if(this.authoritative?.race===order.race&&this.authoritative.revision>=order.revision)return;
  this.authoritative=order;this.apply();
 }
 apply(){
  if(this.authoritative){this.ranks=new Map(this.authoritative.rows.map(r=>[r.id,r.position]));return;}
  if(!this.visible||this.scene<20)return;const bytes=this.sources.get(this.coordinator);if(!bytes||bytes[1+0x18]!==this.coordinator)return;
  let changed=this.source!==bytes[0]||this.own!==bytes[1+0x44];for(let i=0;i<this.header.length;i++)if((i<8||i>=11)&&this.header[i]!==bytes[1+i]){changed=true;break;}
  if(!changed)return;this.source=bytes[0];this.own=bytes[1+0x44];this.header.set(bytes.subarray(1,21));
  const index=this.members.findIndex((_,i)=>linkIdForSeat(i+1,this.members.length)===this.coordinator);if(index<0)return;
  const ranks=nativeStandings(bytes,this.members,this.members[index].id);if(ranks?.has(this.id))this.ranks=ranks;
 }
 rows(){return !this.active||!this.visible?[]:this.members.map(m=>({...m,position:this.ranks.get(m.id)??null})).sort((a,b)=>(a.position??99)-(b.position??99)||a.cabinet-b.cabinet);}
}
const ordinal=n=>n==null?'—':`${n}${n===1?'ST':n===2?'ND':n===3?'RD':'TH'}`;
export function mountRaceStandings(element){
 const model=new RaceStandings(),nodes=new Map(),status=document.createElement('small');status.className='race-order-status';status.hidden=true;status.setAttribute('aria-live','polite');element.after(status);let lastRender=-Infinity,lastKey='';
 function clear(){element.hidden=true;status.hidden=true;lastKey='';}
 return {model,
  sync(room){model.sync({active:room.active,epoch:room.epoch,id:room.id,members:room.members});if(!model.active)clear();},
  ingest(bytes){model.ingest(bytes);if(!model.visible)clear();},
  receive(bytes){model.receive(bytes);},
  authority(order){model.acceptAuthority(order);},
  pendingFinish(){model.awaitingFinish=true;},
  update(now){
   if(now-lastRender<100)return;lastRender=now;
   const rows=model.rows();if(!rows.length){clear();return;}
   const authority=model.authoritative,label=authority?.phase==='confirming'?'CONFIRMING FINISH\u2026':authority?.rows.some(r=>r.photoFinish)?'PHOTO FINISH \u00b7 ESTIMATED ORDER':authority?.phase==='final'?'RESULT CONFIRMED':authority?.rows.find(r=>r.id===model.id)?.status==='finished'?'FINISH CONFIRMED':model.awaitingFinish?'CONFIRMING FINISH\u2026':'';if(status.textContent!==label)status.textContent=label;status.hidden=!label;
   const key=JSON.stringify(rows.map(r=>[r.id,r.name,r.cabinet,r.position,!!r.paused,!!r.departed]));if(key===lastKey)return;lastKey=key;
   const wanted=new Set(rows.map(r=>r.id));for(const [id,n] of nodes)if(!wanted.has(id)){n.remove();nodes.delete(id);}
   rows.forEach((r,i)=>{
    let node=nodes.get(r.id);if(!node){node=document.createElement('li');node.className='race-driver';for(const cls of ['race-place','race-name']){const span=document.createElement('span');span.className=cls;node.append(span);}nodes.set(r.id,node);}
    const color=carColor(r.cabinet);node.style.setProperty('--driver-color',color.hudColor||color.color);node.style.setProperty('--driver-outline',r.cabinet===5?'#eee9df':'#070707');node.dataset.unavailable=String(!!(r.paused||r.departed));node.dataset.cabinet=r.cabinet;node.dataset.position=r.position??'';
    node.children[0].textContent=ordinal(r.position);node.children[1].textContent=r.name;node.title=`${r.name} · ${r.position==null?'Not ranked':`Position ${r.position}`}`;
    node.setAttribute('aria-label',node.title);if(element.children[i]!==node)element.insertBefore(node,element.children[i]||null);
   });element.hidden=false;
  }
 };
}

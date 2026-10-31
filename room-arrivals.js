export const arrivalRoomKey=s=>s?.host&&s?.id&&s?.code?`${s.host}:${s.id}:${s.code}`:'';
const label=(value,max)=>String(value||'').replace(/[\u0000-\u001f\u007f]/gu,'').slice(0,max);
// Observe validated room snapshots, never raw PeerJS packets. Membership stages
// are retained across reconnections and waiting-seat promotion in the same room.
export function createRoomArrivals({notify=()=>{}}={}){
 let key='',baseline=false;const seen=new Map();let present=new Map();
 return {update(state){
  const next=arrivalRoomKey(state);
  if(next!==key||state.phase==='idle'){key=next;baseline=false;seen.clear();present.clear();}
  if(!key||!['lobby','waiting','preparing','playing'].includes(state.phase))return;
  // Only a complete roster can establish membership. Recovery/terminal states
  // must never turn a missing roster into a wave of departure alerts.
  if(![...(state.members||[]),...(state.waiting||[])].some(p=>p.id===state.id))return;
  const inGame=['playing','preparing'].includes(state.phase)||state.phase==='waiting'&&['playing','preparing'].includes(state.remotePhase);
  const people=new Map();
  if(state.isHost&&state.visibility==='private')for(const p of state.pending||[])people.set(p.id,{person:p,stage:'request'});
  for(const p of state.waiting||[])people.set(p.id,{person:p,stage:p.needsApproval?'request':'joined'});
  for(const p of (state.members||[]).filter(p=>!p.departed))people.set(p.id,{person:p,stage:'joined'});
  for(const [id,{person,stage}] of people){
   if(!id||id===state.id)continue;
   let record=seen.get(id);if(!record){record={request:false,joined:false};seen.set(id,record);}
   const previous=present.get(id),spectator=!!person.spectator;
   if(baseline&&inGame&&stage==='joined'&&previous?.stage==='joined'&&!previous.person.spectator&&spectator)notify({kind:'spectating',id,name:label(person.name,24)||'Driver',spectator:true,inGame,roomName:label(state.roomName,48),roomKey:key,system:true,sound:true});
   if(record[stage])continue;record[stage]=true;
   const system=stage==='request'?!!state.isHost&&state.visibility==='private':inGame||!!state.isHost&&state.visibility==='public';
   const sound=stage==='request'?!!state.isHost:inGame||!!state.isHost||['lobby','waiting'].includes(state.phase);
   if(baseline&&(stage==='joined'||state.isHost)&&(system||sound))notify({kind:stage,id,name:label(person.name,24)||'Driver',spectator,inGame,waiting:state.waiting?.some(w=>w.id===id),roomName:label(state.roomName,48),roomKey:key,system,sound});
  }
  if(baseline&&inGame)for(const [id,{person,stage}] of present)if(id!==state.id&&stage==='joined'&&!people.has(id))notify({kind:'left',id,name:label(person.name,24)||'Driver',spectator:!!person.spectator,inGame,roomName:label(state.roomName,48),roomKey:key,system:true,sound:true});
  present=new Map([...people].map(([id,p])=>[id,{stage:p.stage,person:{...p.person}}]));
  baseline=true;
  while(seen.size>256)seen.delete(seen.keys().next().value);
 },dispose(){seen.clear();present.clear();baseline=false;key='';}};
}

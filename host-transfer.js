import {BUILD_ID,defaultRoomName,validateSettings} from './room-settings.js?v=53.8.59';
import {MOTION_VERSION} from './motion-channel.js?v=53.8.59';
export const HOST_TRANSFER_VERSION=2;
const token=()=>Array.from(crypto.getRandomValues(new Uint8Array(16)),x=>x.toString(16).padStart(2,'0')).join('');
const validToken=x=>typeof x==='string'&&/^[a-f0-9]{32}$/.test(x);
const allowed=s=>s.phase==='lobby'||s.phase==='waiting'&&s.remotePhase==='lobby';
export class VoluntaryHostTransfer{
 // Prepare a second star while the original one stays authoritative. Only the
 // authenticated old host commits after every participant proves its new link.
 constructor(room){this.room=room;this.current=null;this.timer=null;}
 get busy(){return !!this.current;}
 snapshot(){const r=this.current;return r?{target:r.target,name:r.state.members.find(m=>m.id===r.target)?.name||'Driver',stage:r.committed?'finishing':'connecting'}:null;}
 reason(target){
  const s=this.room;
  if(!s.isHost||s.phase!=='lobby'||this.busy)return 'Hosting can only change in the lobby.';
  if(target===s.id||!s.members.some(m=>m.id===target))return 'Choose another driver in the room.';
  if(s.pending.size||s.swaps.size||[...s.waiters.values()].some(w=>!w.spectator||w.needsApproval))return 'Finish requests and seat swaps before changing host.';
  const people=[...s.members,...s.waiters.values()];
  if(people.some(p=>p.connection==='reconnecting'||p.id!==s.id&&(!s.connections.get(p.id)?.open||s.sessions.get(p.id)?.hostTransfer!==HOST_TRANSFER_VERSION)))return 'Everyone must be connected and use the current version to change host.';
  return '';
 }
 send(c,data){try{this.room.send(c,data);return true;}catch{return false;}}
 packet(r,type,extra={}){return {type,id:r.id,...extra};}
 arm(ms){clearTimeout(this.timer);const r=this.current;this.timer=setTimeout(()=>{if(this.current===r)this.timeout();},ms);}
 timeout(){const r=this.current;if(!r)return;if(r.committed)this.finish();else if(r.decision){
  // Once commit has been sent, a missing answer cannot prove the successor
  // stayed uncommitted. Do not resume the old authority on a network guess.
  const s=this.room;s.leave();s.phase='error';s.error='Hosting transfer could not be confirmed. Rejoin the room using its current invitation.';s.changed();
 }else this.abort('Hosting transfer timed out. Your current host keeps the room.');}
 begin(target){
  const reason=this.reason(target);if(reason){this.room.error=reason;this.room.changed();return false;}
  const s=this.room,state={members:s.members.map(m=>({...m,ready:false})),waiting:s.waitingRoster(),settings:{...s.settings},chat:s.chat.map(m=>({...m})),visibility:s.visibility,roomName:s.roomName,roomNameCustom:s.roomNameCustom===true,revision:s.revision};
  const ids=[...state.members,...state.waiting].map(p=>p.id),keys=ids.map(id=>({id,key:token()}));
  const r=this.current={id:token(),target,from:s.id,secret:token(),state,keys,links:new Map(),proof:new Set(),adopted:new Set(),coordinator:true,committed:false};
  s.error='';s.hostTransferNotice='';this.arm(30000);s.changed();
  if(!this.send(s.connections.get(target),this.prepare(r,target)))this.abort('Could not contact the chosen host.');return !!this.current;
 }
 prepare(r,id){return this.packet(r,'host-transfer-prepare',{target:r.target,from:r.from,secret:r.secret,state:r.state,key:r.keys.find(k=>k.id===id).key,...(id===r.target?{keys:r.keys}:{})});}
 validate(d){
  const s=this.room;if(!validToken(d.id)||!validToken(d.secret)||!validToken(d.key)||d.from!==s.host||typeof d.target!=='string'||!d.state)return null;
  const p=d.state,members=s.validateMembers(p.members,p.waiting),waiting=s.validateWaiters(p.waiting,members),people=[...members,...waiting.values()];
  if(!members.length||d.target===s.host||!members.some(m=>m.id===d.target)||!people.some(m=>m.id===s.id)||[...waiting.values()].some(w=>!w.spectator||w.needsApproval)||people.some(m=>m.connection==='reconnecting'))return null;
  const chat=Array.isArray(p.chat)?p.chat.slice(-60).map(m=>s.validateChatMessage(m)).filter(Boolean):[];
  if(chat.some((m,i)=>i&&m.seq<=chat[i-1].seq)||!Number.isSafeInteger(p.revision)||p.revision<0)return null;
  if(d.target===s.id&&(!Array.isArray(d.keys)||d.keys.length!==people.length||new Set(d.keys.map(k=>k.id)).size!==people.length||d.keys.some(k=>!people.some(p=>p.id===k.id)||!validToken(k.key))||d.keys.find(k=>k.id===s.id)?.key!==d.key))return null;
  return {members,waiting:[...waiting.values()],settings:validateSettings(p.settings),chat,visibility:p.visibility==='public'?'public':'private',roomName:String(p.roomName||'').slice(0,48),roomNameCustom:p.roomNameCustom===true,revision:p.revision};
 }
 receivePrepare(c,d){
  const s=this.room;if(s.isHost||c!==s.server||!allowed(s)||this.busy)return;
  let state;try{state=this.validate(d);}catch{return;}if(!state)return;
  const r=this.current={id:d.id,target:d.target,from:d.from,secret:d.secret,state,key:d.key,keys:d.keys,links:new Map(),proof:new Set(),adopted:new Set(),coordinator:false,committed:false};
  s.hostTransferNotice='';this.arm(30000);s.changed();
  if(r.target===s.id)this.send(c,this.packet(r,'host-transfer-listening'));else this.openLink();
 }
 openLink(){
  const r=this.current,s=this.room;if(!r||r.target===s.id||r.link)return;
  const key=r.key||r.keys.find(k=>k.id===s.id).key;
  try{const c=s.peer.connect(r.target,{reliable:true,serialization:'binary',metadata:{role:'host-transfer-link',build:BUILD_ID,transfer:r.id,token:r.secret,session:key,hostTransfer:HOST_TRANSFER_VERSION,name:s.name,...(s.movementMode!=='reliable'?{motion:MOTION_VERSION}:{})}});r.link=c;this.stage(c,false);}catch{this.abort('Could not establish the new host connection.');}
 }
 connection(c){
  if(c.metadata?.role!=='host-transfer-link')return false;
  const r=this.current,s=this.room,m=c.metadata;
  if(!r||r.committed||r.target!==s.id||m.build!==BUILD_ID||m.transfer!==r.id||m.token!==r.secret||r.keys?.find(k=>k.id===c.peer)?.key!==m.session||c.peer===s.id||r.links.has(c.peer)){c.close();return true;}
  r.links.set(c.peer,c);this.stage(c,true);return true;
 }
 stage(c,incoming){
  const r=this.current;
  const open=()=>{if(this.current!==r)return;if(!c.dataChannel?.ordered||c.dataChannel.maxRetransmits!=null||c.dataChannel.maxPacketLifeTime!=null){this.abort('The new host connection is incompatible.');return;}if(!incoming)this.send(c,this.packet(r,'host-transfer-link-ready'));};
  const data=d=>{if(this.current!==r||d?.id!==r.id)return;
   if(incoming&&d.type==='host-transfer-link-ready'){r.proof.add(c.peer);if(r.proof.size===r.keys.length-1&&!r.notified){r.notified=true;if(!this.send(this.room.server,this.packet(r,'host-transfer-ready')))this.abort('Could not confirm the new connections.');}}
   else if(incoming&&d.type==='host-transfer-commit'&&c.peer===r.from&&r.proof.size===r.keys.length-1)this.commitSuccessor();
   else if(!incoming&&d.type==='host-transfer-commit')this.adopt();
   else if(incoming&&d.type==='host-transfer-adopted')r.adopted.add(c.peer);
  };
  const close=()=>{if(this.current===r&&!r.committed&&!r.decision)this.abort('A connection changed before hosting could move.');};
  c.on('open',open);c.on('data',data);c.on('close',close);c.on('error',close);
  (r.cleanups??=[]).push(()=>{for(const [event,fn] of [['open',open],['data',data],['close',close],['error',close]])c.off?.(event,fn);});
 }
 handle(c,d){
  if(!d?.type?.startsWith('host-transfer-'))return false;
  if(d.type==='host-transfer-prepare'){this.receivePrepare(c,d);return true;}
  const s=this.room,r=this.current;if(!r||d.id!==r.id)return true;
  if(d.type==='host-transfer-listening'&&r.coordinator&&!r.committed&&c===s.connections.get(r.target)){
   if(r.distributed)return true;r.distributed=true;for(const p of [...r.state.members,...r.state.waiting])if(p.id!==s.id&&p.id!==r.target&&!this.send(s.connections.get(p.id),this.prepare(r,p.id))){this.abort('Could not prepare every participant.');return true;}this.openLink();
  }else if(d.type==='host-transfer-ready'&&r.coordinator&&!r.committed&&c===s.connections.get(r.target)){
   if(r.decision)return true;r.decision=true;this.arm(20000);
   if(!this.send(r.link,this.packet(r,'host-transfer-commit'))){r.decision=false;this.abort('Could not confirm the new host.');}
  }else if(d.type==='host-transfer-commit'&&!r.coordinator&&!r.committed&&r.target===s.id&&c===s.server&&r.proof.size===r.keys.length-1){
   this.commitSuccessor();
  }else if(d.type==='host-transfer-commit'&&r.committed&&!s.isHost&&c===s.server)this.send(c,this.packet(r,'host-transfer-adopted'));
  else if(d.type==='host-transfer-adopted'&&r.committed&&s.isHost&&c===s.connections.get(c.peer)){r.adopted.add(c.peer);this.checkFinished();}
  else if(d.type==='host-transfer-finished'&&r.committed&&!s.isHost&&c===s.server)this.finish();
  else if(d.type==='host-transfer-abort'&&!r.committed&&(r.coordinator?c===s.connections.get(c.peer)&&(!r.decision||c.peer===r.target):c===s.server))this.abort(String(d.reason||'Hosting transfer cancelled.').slice(0,180),!!r.coordinator);
  else if(d.type==='host-transfer-commit'&&r.committed&&s.isHost&&c.peer===r.from&&c===s.connections.get(c.peer))this.send(c,this.packet(r,'host-transfer-commit'));
  return true;
 }
 commitSuccessor(){const r=this.current;if(!r||r.committed)return;this.adopt();for(const link of r.links.values())this.send(link,this.packet(r,'host-transfer-commit'));this.checkFinished();}
 adopt(){
  const s=this.room,r=this.current;if(!r||r.committed)return;r.committed=true;this.arm(20000);
  r.old=[...s.connections.values(),s.server].filter(Boolean);for(const clean of r.cleanups||[])clean();r.cleanups=[];
  s.spectators?.close();s.clearSnapshots();s.commands.clear();s.swaps.clear();s.pending.clear();s.sessions.clear();s.connections=new Map();s.server=null;
  s.host=r.target;s.secret=r.secret;s.isHost=s.id===r.target;s.sessionKey=r.key||r.keys.find(k=>k.id===s.id).key;
  s.members=[r.state.members.find(m=>m.id===r.target),...r.state.members.filter(m=>m.id!==r.target)].map(m=>({...m,ready:false,connection:'connected'}));
  s.waiters=s.validateWaiters(r.state.waiting,s.members);s.settings={...r.state.settings};s.visibility=r.state.visibility;s.roomNameCustom=r.state.roomNameCustom;s.roomName=s.roomNameCustom?r.state.roomName:defaultRoomName(r.state.members.find(m=>m.id===r.target)?.name);s.chat=r.state.chat.map(m=>({...m}));s.chatSequence=s.chat.at(-1)?.seq||0;s.chatRate.clear();
  s.revision=r.state.revision+1;s.lobbySequence=0;s.lastLobbySequence=0;s.commandSequence=0;s.lastAck=null;s.epoch='';s.waitEpoch='';s.remotePhase=s.waiters.has(s.id)?'lobby':'';s.phase=s.waiters.has(s.id)?'waiting':'lobby';s.joinRole=s.waiters.get(s.id)?.spectator?'spectator':'driver';s.error='';s.awaitingStop=false;s.reconnectUntil=0;s.retryAt=0;s.retryAttempt=0;s.raceAuthority=null;s.raceInbox=null;s.distributor=null;
  if(s.isHost){
   for(const k of r.keys)if(k.id!==s.id)s.sessions.set(k.id,{key:k.key,until:0,commands:new Map(),hostTransfer:HOST_TRANSFER_VERSION});
   for(const [id,link] of r.links){s.connections.set(id,link);s.attach(link,true,{opened:true,restored:true});}r.adopted.add(s.id);
  }else{s.server=r.link;s.attach(r.link,false,{opened:true,restored:true});this.send(r.link,this.packet(r,'host-transfer-adopted'));}
  s.changed();
 }
 checkFinished(){const r=this.current;if(r?.committed&&this.room.isHost&&r.adopted.size===r.state.members.length+r.state.waiting.length)this.finish();}
 finish(){
  const s=this.room,r=this.current;if(!r)return;
  if(s.isHost)for(const c of s.connections.values())this.send(c,this.packet(r,'host-transfer-finished'));
  clearTimeout(this.timer);this.timer=null;this.current=null;
  for(const c of r.old||[])if(c!==s.server&&![...s.connections.values()].includes(c))try{c.close();}catch{}
  s.hostTransferNotice=`${s.members.find(m=>m.id===s.host)?.name||'Your teammate'} is now the host. Confirm Ready for the next race.`;
  if(s.isHost){for(const m of s.members)if(m.id!==s.id&&s.connections.get(m.id)?.open)s.offerMotion(s.connections.get(m.id));s.publish();}else s.changed();
 }
 abort(reason='Hosting transfer cancelled.',notify=true){
  const s=this.room,r=this.current;if(!r||r.committed)return;
  if(notify){const packet=this.packet(r,'host-transfer-abort',{reason});if(r.coordinator)for(const c of s.connections.values())this.send(c,packet);else this.send(s.server,packet);}
  this.reset();s.hostTransferNotice=reason;s.changed();
 }
 interrupted(conn){const r=this.current;if(!r||r.committed||r.decision||conn&&r.target===this.room.id&&r.notified&&conn===this.room.server)return;this.abort('A participant disconnected. Hosting has not changed.');}
 reset(){const r=this.current;this.current=null;clearTimeout(this.timer);this.timer=null;if(!r)return;for(const clean of r.cleanups||[])clean();if(!r.committed){for(const c of new Set([...r.links.values(),r.link].filter(Boolean)))try{c.close();}catch{}}else{for(const c of r.old||[])try{c.close();}catch{}}}
}

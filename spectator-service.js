import {BUILD_ID} from './room-settings.js?v=53.8.41';
import {SPECTATOR_VERSION,SPECTATOR_HZ} from './spectator-world.js?v=53.8.41';
import {transformPacket} from './spectator-codec.js?v=53.8.41';
import {soundState} from './spectator-audio.js?v=53.8.41';
import {linkIdForSeat} from './central-link.js?v=53.8.41';
const token=()=>Array.from(crypto.getRandomValues(new Uint8Array(16)),v=>v.toString(16).padStart(2,'0')).join('');
const name=v=>String(v||'Spectator').replace(/\s+/gu,' ').trim().slice(0,24)||'Spectator';
const CAP=8,QUEUE=262144;
// Race participants can be a subset of the connected cabinets. Validate the
// source's real link table before interpreting its original actor number.
const soundSource=(room,id,state,grid)=>{
 const index=room.members.findIndex(m=>m.id===id);if(index<0||state.scene<22||state.scene>29)return false;
 if(grid===undefined){grid=0;for(let i=0;i<room.members.length;i++)grid|=(i+1)<<(i*4);grid>>>=0;}
 if(!Number.isInteger(grid)||grid<1||grid>0xffffffff)return false;
 const links=[],seen=new Set();let value=grid;for(let i=0;i<8;i++){const link=value&15;if(!link){if(value)return false;break;}if(link>room.members.length||seen.has(link))return false;links.push(link);seen.add(link);value>>>=4;}
 return links[state.actor]===linkIdForSeat(index+1,room.members.length);
};
export class SpectatorService {
 constructor(room,{getWasm=()=>null,onChange=()=>{},onMessage=()=>{}}={}){Object.assign(this,{room,getWasm,onChange,onMessage});this.viewers=new Map();this.tickets=new Map();this.streams=new Map();this.config=null;this.phase='';this.epoch='';this.frames=[];this.orders=[];this.frame=null;this.serial=0;this.busy=false;this.sending=false;this.timer=null;this.generation=0;this.reaper=null;this.audioWatches=new Map();this.audioPolicies=new Map();this.audioLatest=new Map();this.audioCapture=false;this.audioSentAt=-Infinity;this.audioRates=new Map();this.audioBytes=0;}
 snapshot(){return {viewers:[...this.viewers.values()].filter(v=>v.conn.open).map(v=>({id:v.conn.peer,name:v.name,approved:v.approved,relay:v.relay,connected:v.conn.open})),streams:this.streams.size};}
 changed(){this.onChange(this.snapshot());}
 reconnect(){return this.room.isHost?this.reassign(this.room.id):this.send(this.room.server,{type:'spectator-reconnect',epoch:this.room.waitEpoch||this.room.epoch});}
 reassign(id){const v=this.viewers.get(id),now=performance.now();if(!this.room.isHost||!v?.approved||!v.conn.open||!['preparing','playing'].includes(this.room.phase)||now-(v.retryAt??-Infinity)<5000)return false;v.retryAt=now;v.previousRelay=v.relay;this.revoke(v);this.assignViewers();return true;}
 send(c,d){if(!c?.open||c.dataChannel?.bufferedAmount>QUEUE)return false;try{c.send(d);return true;}catch{return false;}}
 connection(c){
  const meta=c.metadata;if(!['spectator-control','spectator-stream'].includes(meta?.role))return false;
  if(meta.build!==BUILD_ID||meta.version!==SPECTATOR_VERSION){c.close();return true;}
  if(meta.role==='spectator-control')this.control(c);else this.stream(c);return true;
 }
 control(c){
  const room=this.room;if(!room.isHost||c.metadata.token!==room.secret||!['lobby','preparing','playing'].includes(room.phase)||this.viewers.size>=CAP){c.close();return;}
  const v={conn:c,name:name(c.metadata.name),approved:room.visibility==='public',relay:null,last:performance.now()};this.viewers.set(c.peer,v);
  if(!this.reaper)this.reaper=setInterval(()=>this.expire(),2000);
  c.on('open',()=>{this.send(c,{type:'spectator-status',message:v.approved?'Connected. Waiting for a race.':'Waiting for host approval.'});this.changed();});
  c.on('data',d=>{if(d?.type==='spectator-ping'){const now=performance.now();v.last=now;if(!v.pongAt||now-v.pongAt>=500){v.pongAt=now;this.send(c,{type:'spectator-pong'});}}});
  const close=()=>{if(this.viewers.get(c.peer)!==v)return;this.viewers.delete(c.peer);this.revoke(v);this.changed();};c.on('close',close);c.on('error',()=>{close();c.close();});this.changed();
 }
 expire(now=performance.now()){for(const v of [...this.viewers.values()])if(now-v.last>30000){this.viewers.delete(v.conn.peer);this.revoke(v);if(!v.integrated)v.conn.close();this.changed();}if(!this.viewers.size){clearInterval(this.reaper);this.reaper=null;}}
 approve(id,allow){const v=this.viewers.get(id);if(!this.room.isHost||!v)return;v.approved=!!allow;if(!allow){this.send(v.conn,{type:'spectator-status',message:'The host declined this spectator request.'});v.conn.close();this.viewers.delete(id);}else this.send(v.conn,{type:'spectator-status',message:'Approved. Waiting for a race.'});this.changed();}
 // Only a room with one racing host can use the host as its own relay.
 // Ordinary multiplayer continues to distribute spectators to other drivers.
 get soloHostRelay(){return this.room.isHost&&this.room.members?.length===1&&this.room.members[0].id===this.room.id;}
 revoke(v){if(v.relay===this.room.id){this.tickets.delete(v.conn.peer);const s=this.streams.get(v.conn.peer);if(s){this.streams.delete(v.conn.peer);s.conn.close();}}else if(v.relay){const c=this.room.connections.get(v.relay);this.send(c,{type:'spectator-revoke',viewer:v.conn.peer});}this.audioWatches.delete(v.conn.peer);if(this.room.isHost)this.audioPolicy();v.relay=null;if(!this.streams.size){clearInterval(this.timer);this.timer=null;}}
 audioPolicy(){
  if(!this.room.isHost)return;
  const needed=new Set([...this.audioWatches.values()].map(w=>w.target));
  for(const id of new Set([...this.audioPolicies.keys(),...needed])){
   const on=needed.has(id)&&this.room.active;if(this.audioPolicies.get(id)===on)continue;
   this.audioPolicies.set(id,on);if(id===this.room.id){this.audioCapture=on;this.getWasm()?._daytona_spectator_sound_capture?.(Number(on));}
   else this.send(this.room.connections.get(id),{type:'spectator-audio-capture',epoch:this.room.epoch,on});
  }
 }
 audioWatch(relay,viewer,target,on){
  const v=this.viewers.get(viewer);if(!this.room.isHost||!v?.approved||v.relay!==relay||!this.room.active)return;
  if(on&&this.room.members.some(m=>m.id===target))this.audioWatches.set(viewer,{relay,target});else this.audioWatches.delete(viewer);this.audioPolicy();
 }
 audioRoute(source,bytes,grid){
  const relays=new Set([...this.audioWatches.values()].filter(w=>w.target===source).map(w=>w.relay));
  for(const id of relays){if(id===this.room.id){this.audioLatest.set(source,{bytes,grid,at:performance.now()});continue;}const c=this.room.connections.get(id);if((c?.dataChannel?.bufferedAmount||0)<8192)this.send(c,{type:'spectator-audio-relay',epoch:this.room.epoch,source,bytes,...(grid!==undefined?{grid}:{})});}
 }
 sync(state){
  if(this.room.isHost&&this.room.waiters){
   const desired=new Map([...this.room.waiters.values()].filter(w=>w.spectator&&!w.needsApproval).map(w=>[w.id,w]));
   for(const [id,v] of this.viewers)if(v.integrated&&(!desired.has(id)||(id!==this.room.id&&this.room.connections.get(id)!==v.conn))){this.revoke(v);this.viewers.delete(id);}
   for(const [id,w] of desired){
    if(this.viewers.has(id))continue;
    const conn=id===this.room.id?{peer:id,open:true,send:d=>this.onMessage(d),close:()=>{}}:this.room.connections.get(id);
    if(conn?.open)this.viewers.set(id,{conn,name:w.name,approved:true,relay:null,integrated:true,last:performance.now()});
   }
  }
  if(this.room.isHost&&this.epoch!==this.room.epoch)for(const v of this.viewers.values())this.revoke(v);
  if(this.room.isHost&&['preparing','playing'].includes(state.phase))this.assignViewers();
  if(state.phase===this.phase&&this.room.epoch===this.epoch){this.changed();return;}
  const old=this.phase;this.phase=state.phase;this.epoch=this.room.epoch;
  if(old==='playing'&&state.phase!=='playing'&&state.phase!=='preparing')this.stopStreams('The arcade session ended. Waiting for the next session.');
  if(['idle','error'].includes(state.phase)&&this.viewers.size){for(const v of this.viewers.values())if(!v.integrated)v.conn.close();this.viewers.clear();this.changed();}
  this.changed();
 }
 assignViewers(){
  if(!this.room.isHost)return;
  let relays=this.room.members.filter(m=>m.id!==this.room.host&&m.id!==this.room.id&&m.connection!=='reconnecting'&&this.room.connections.get(m.id)?.open);const loads=new Map();
  if(this.soloHostRelay)relays.push(this.room.members[0]);
  const racing=relays.filter(m=>{const scene=this.room.chatScenes?.get(m.id);return scene>=22&&scene<=29;});
  // A connected cabinet can remain in attract while the others race. Move a
  // waiting feed to an actual racer; never add host upload in a linked room.
  if(racing.length)relays=racing;
  for(const v of this.viewers.values())if(v.relay&&!relays.some(m=>m.id===v.relay))this.revoke(v);
  for(const v of this.viewers.values())if(v.relay)loads.set(v.relay,(loads.get(v.relay)||0)+1);
  for(const v of this.viewers.values()){
   if(v.relay||!v.approved||!v.conn.open)continue;
   const relay=relays.filter(m=>(loads.get(m.id)||0)<2).sort((a,b)=>Number(a.id===v.previousRelay)-Number(b.id===v.previousRelay)||(loads.get(a.id)||0)-(loads.get(b.id)||0))[0];
   if(!relay){this.send(v.conn,{type:'spectator-status',message:'All spectator relays are busy. Waiting for a free relay.'});continue;}
   const ticket=token();loads.set(relay.id,(loads.get(relay.id)||0)+1);v.relay=relay.id;
   if(relay.id===this.room.id)this.tickets.set(v.conn.peer,{ticket,epoch:this.room.epoch,until:performance.now()+60000});
   else this.send(this.room.connections.get(relay.id),{type:'spectator-grant',epoch:this.room.epoch,viewer:v.conn.peer,ticket});
   // Existing observers must learn the new room phase/epoch before their
   // ticket on this same reliable host connection, not at the next heartbeat.
   if(v.integrated&&v.conn.peer!==this.room.id)this.room.syncConnection?.(v.conn);
   this.send(v.conn,{type:'spectator-assignment',epoch:this.room.epoch,relay:relay.id,ticket,name:relay.name});
  }
 }
 handle(c,d){
  if(d?.type==='spectator-reconnect'){if(this.room.isHost&&d.epoch===this.room.epoch)this.reassign(c.peer);return true;}
  if(d&&['spectator-audio-watch','spectator-audio-capture','spectator-audio-state','spectator-audio-relay'].includes(d.type)){
   try{
    const room=this.room;
    if(room.isHost){
     if(d.type==='spectator-audio-watch'&&d.epoch===room.epoch&&typeof d.on==='boolean')this.audioWatch(c.peer,d.viewer,d.target,d.on);
     else if(d.type==='spectator-audio-state'&&room.active&&d.epoch===room.epoch&&this.audioPolicies.get(c.peer)){
      const state=soundState(d.bytes),at=performance.now();if(!soundSource(room,c.peer,state,d.grid)||at-(this.audioRates.get(c.peer)??-Infinity)<30)return true;this.audioRates.set(c.peer,at);this.audioRoute(c.peer,d.bytes,d.grid);
     }
    }else if(c===room.server){
     if(d.type==='spectator-audio-capture'&&typeof d.on==='boolean'&&(!d.on||room.active&&d.epoch===room.epoch)){
      this.audioCapture=d.on;this.getWasm()?._daytona_spectator_sound_capture?.(Number(d.on));
     }else if(d.type==='spectator-audio-relay'&&room.active&&d.epoch===room.epoch&&this.streams.size){
      const state=soundState(d.bytes);if(soundSource(room,d.source,state,d.grid))this.audioLatest.set(d.source,{bytes:d.bytes,grid:d.grid,at:performance.now()});
     }
    }
   }catch{} // A malformed optional audio packet never interrupts racing peers.
   return true;
  }
  if(!d||!['spectator-grant','spectator-revoke','spectator-assignment','spectator-status'].includes(d.type))return false;
  if(this.room.isHost||c!==this.room.server)return true;
  if(['spectator-assignment','spectator-status'].includes(d.type)){if(this.room.waiters.get(this.room.id)?.spectator)this.onMessage(d);return true;}
  if(d.type==='spectator-revoke'){this.tickets.delete(d.viewer);const stream=this.streams.get(d.viewer);if(stream){this.streams.delete(d.viewer);stream.conn.close();}return true;}
  if(typeof d.viewer!=='string'||d.viewer.length>100||!/^[a-f0-9]{32}$/.test(d.ticket||'')||!/^[a-f0-9]{32}$/.test(d.epoch||'')||this.tickets.size>=CAP)return true;
  this.tickets.set(d.viewer,{ticket:d.ticket,epoch:d.epoch,until:performance.now()+60000});return true;
 }
 stream(c){
  const t=this.tickets.get(c.peer),m=c.metadata;
  if(this.room.isHost&&!this.soloHostRelay||!t||t.ticket!==m.ticket||t.epoch!==m.epoch||performance.now()>t.until||this.streams.has(c.peer)||this.streams.size>=2){c.close();return;}
  const s={conn:c,begun:false,epoch:m.epoch,audioTarget:'',audioOn:false};this.streams.set(c.peer,s);
  c.on('open',()=>{this.begin(s);this.ensureTimer();this.changed();});
  c.on('data',d=>{
   // The shared ICE-renewal listener handles its own bounded protocol on every
   // PeerJS connection, including visual streams. It is not spectator input.
   if(d?.type==='turn-refresh')return;
   if(d?.type!=='spectator-audio-select'||typeof d.on!=='boolean'||typeof d.target!=='string'||!this.config?.members.some(m=>m.id===d.target)){c.close();return;}
   s.audioTarget=d.target;s.audioOn=d.on;clearTimeout(s.audioWatchTimer);
   const publish=()=>{s.audioWatchAt=performance.now();if(this.room.isHost)this.audioWatch(this.room.id,c.peer,s.audioTarget,s.audioOn);else this.send(this.room.server,{type:'spectator-audio-watch',epoch:s.epoch,viewer:c.peer,target:s.audioTarget,on:s.audioOn});};
   const delay=d.on?Math.max(0,100-(performance.now()-(s.audioWatchAt??-Infinity))):0;
   if(delay)s.audioWatchTimer=setTimeout(publish,delay);else publish();
  });const close=()=>{clearTimeout(s.audioWatchTimer);if(this.streams.get(c.peer)===s){if(this.room.isHost)this.audioWatch(this.room.id,c.peer,s.audioTarget,false);else this.send(this.room.server,{type:'spectator-audio-watch',epoch:s.epoch,viewer:c.peer,target:s.audioTarget,on:false});this.streams.delete(c.peer);if(!this.streams.size){clearInterval(this.timer);this.timer=null;}this.changed();}};c.on('close',close);c.on('error',()=>{close();c.close();});
 }
 prepared(config){
  this.config=config;this.frames=[];this.orders=[];this.serial=0;
  for(const s of this.streams.values())this.begin(s);
 }
 begin(s){if(s.begun||!s.conn.open||!this.config||s.epoch!==this.config.epoch)return;const clock=this.room.environmentState?.()??this.room.environment?.snapshot()??{run:0,elapsed:0};s.begun=this.send(s.conn,{type:'spectator-begin',version:SPECTATOR_VERSION,config:{...this.config,environmentClock:clock}});if(s.begun)s.environmentRun=clock.run;}
 ensureTimer(){if(!this.timer)this.timer=setInterval(()=>{void this.flush();},1000/SPECTATOR_HZ);}
 start(){this.generation++;for(const s of this.streams.values())this.begin(s);if(this.streams.size)this.ensureTimer();}
 get capturing(){return false;}
 beginStep(){} // Racers no longer journal or copy their per-step inbox/inputs.
 order(){}
 endStep(now=performance.now()){
  const wasm=this.getWasm();wasm?._daytona_spectator_sound_capture?.(Number(this.audioCapture));
  if(!this.audioCapture||!this.room.active||now-this.audioSentAt<65||!wasm?._daytona_spectator_sound_export)return;
  this.audioSentAt=now;const ptr=wasm._daytona_spectator_sound_export(),size=wasm._daytona_spectator_sound_size();if(!ptr||!size)return;
  const bytes=wasm.HEAPU8.slice(ptr,ptr+size).buffer,grid=wasm._daytona_spectator_sound_grid?wasm._daytona_spectator_sound_grid()>>>0:undefined;
  if(!soundSource(this.room,this.room.id,soundState(bytes),grid))return;this.audioBytes+=size;
  if(this.room.isHost)this.audioRoute(this.room.id,bytes,grid);else if((this.room.server?.dataChannel?.bufferedAmount||0)<8192)this.send(this.room.server,{type:'spectator-audio-state',epoch:this.room.epoch,bytes,...(grid!==undefined?{grid}:{})});
 }
// A busy viewer keeps its channel: skip this snapshot and export a fresh one
 // after its queue drains. Never accumulate an application-side replay queue.
 async flush(){
  if(this.room.isHost&&!this.soloHostRelay||this.busy||!this.room.active||!this.config||![...this.streams.values()].some(s=>s.begun&&s.conn.open&&(s.conn.dataChannel?.bufferedAmount||0)<=QUEUE))return;
  this.busy=true;const generation=this.generation;
  try{
   const wasm=this.getWasm(),ptr=wasm?._daytona_spectator_world_export();if(!ptr)return;
   const raw=wasm.HEAPU8.slice(ptr,ptr+wasm._daytona_spectator_world_size()).buffer,format=typeof CompressionStream==='function'?'deflate':'raw',bytes=await transformPacket(raw,format);
   if(generation!==this.generation)return;
   for(const [id,s] of this.streams){if(!s.begun||!s.conn.open||(s.conn.dataChannel?.bufferedAmount||0)>QUEUE)continue;if(this.config.settings?.environment==='cycle'){const clock=this.room.environmentState?.()??this.room.environment?.snapshot();if(clock&&clock.run!==s.environmentRun&&this.send(s.conn,{type:'spectator-environment',epoch:this.config.epoch,clock}))s.environmentRun=clock.run;}const sound=this.audioLatest.get(s.audioTarget),audio=s.audioOn&&sound&&performance.now()-sound.at<2000?{source:s.audioTarget,bytes:sound.bytes,...(sound.grid!==undefined?{grid:sound.grid}:{})}:null;if(!this.send(s.conn,{type:'spectator-world',epoch:this.config.epoch,format,bytes,...(audio?{audio}:{})})){if(s.conn.open&&(s.conn.dataChannel?.bufferedAmount||0)>QUEUE)continue;this.streams.delete(id);s.conn.close();this.changed();}}
  }catch{this.stopStreams('The spectator relay stopped. Drivers are unaffected.');}finally{this.busy=false;}
 }
 stopStreams(message){this.audioWatches.clear();if(this.room.isHost)this.audioPolicy();this.audioPolicies.clear();this.audioCapture=false;this.getWasm()?._daytona_spectator_sound_capture?.(0);this.audioLatest.clear();this.audioRates.clear();this.generation++;clearInterval(this.timer);this.timer=null;this.sending=false;this.config=null;this.frames=[];this.orders=[];this.frame=null;this.getWasm()?._daytona_spectator_replay?.(0,0);for(const s of this.streams.values()){this.send(s.conn,{type:'spectator-wait',message});s.conn.close();}this.streams.clear();this.tickets.clear();this.changed();}
 close(){clearInterval(this.reaper);this.reaper=null;this.stopStreams('The relay left the room. The race continues.');for(const v of this.viewers.values()){this.revoke(v);if(!v.integrated)v.conn.close();}this.viewers.clear();this.phase='';this.epoch='';this.changed();}
}
export function spectatorConfig(wasm,room,config){return {epoch:room.epoch,settings:config,members:room.members.map(m=>({id:m.id,name:m.name,cabinet:m.cabinet,skin:m.skin??0})),donor:room.id,host:room.host,eeprom:wasm.HEAPU8.slice(wasm._daytona_eeprom_ptr(),wasm._daytona_eeprom_ptr()+wasm._daytona_eeprom_size()).buffer,drawDistance:wasm._daytona_draw_distance()};}

import {turnClient,maintainIceConfiguration} from './turn-client.js?v=53.8.24';
import {TransportProbe,attachDataChannelProbe,transportSignals} from './transport-probe.js?v=53.8.24';
import {LatestFlow} from './latest-flow.js?v=53.8.24';
import {MotionChannel,MOTION_VERSION,motionChannelId} from './motion-channel.js?v=53.8.24';
import {HostRaceAuthority,RaceOrderInbox,validateRaceOrder} from './race-authority.js?v=53.8.24';
import {HostDistributor,STATE_BYTES,STATE_TAG,compactState,expandState,linkIdForSeat} from './central-link.js?v=53.8.24';
import {SnapshotFlow} from './snapshot-flow.js?v=53.8.24';
import {LinkClock,receivedTiming,sourceTiming} from './link-timing.js?v=53.8.24';
import {HealthSampler,normalizeHealth,STOP_CAUSES,cleanReason} from './connection-health.js?v=53.8.24';
import {PerformanceHistory,PERFORMANCE_BATCH_LIMIT,normalizePerformanceSample} from './performance-history.js?v=53.8.24';
import {BUILD_ID,validateSettings,invitation,parseInvitation} from './room-settings.js?v=53.8.24';
import {validPlayerSkin,skinOwner,validateSkinRoster} from './player-skins.js?v=53.8.24';
import {RoomEnvironmentClock} from './environment.js?v=53.8.24';
const token=()=>Array.from(crypto.getRandomValues(new Uint8Array(16)),x=>x.toString(16).padStart(2,'0')).join('');
const cleanName=value=>String(value||'Driver').trim().slice(0,24)||'Driver';
export const CHAT_LIMIT=240,CHAT_HISTORY_LIMIT=60,CHAT_INTERVAL_MS=900;
const chatText=value=>typeof value==='string'?value.replace(/\s+/gu,' ').trim():'';
const MAX_BUFFER=1024*1024;
const linkError=(message,cause,conn)=>Object.assign(Error(message),{linkCause:cause,linkPeer:conn?.peer});
function packetTiming(){return {count:0,last:null,intervals:[]};}
function recordPacket(timing,enabled){timing.count++;if(!enabled)return;const now=performance.now();if(timing.last!==null){timing.intervals.push(now-timing.last);if(timing.intervals.length>256)timing.intervals.shift();}timing.last=now;}
function timingSummary(timing){const values=[...timing.intervals].sort((a,b)=>a-b);return {packets:timing.count,intervalP95Ms:values.length?values[Math.floor((values.length-1)*.95)]:null,intervalMaxMs:values.length?values.at(-1):null};}
export const PROGRESS_TIMEOUT_MS=10000;
export const CONNECTION_TIMEOUT_MS=20000;
export const OPEN_TIMEOUT_MS=30000;
export const RECONNECT_GRACE_MS=30000;
const retryDelay=attempt=>Math.min(1000*2**Math.min(attempt,4),10000);
const INACTIVE_REASON="The race was interrupted because a cabinet became inactive. Return to the room and start again.";
export class Multiplayer {
 constructor({onChange=()=>{},onPrepare=async()=>{},onStart=()=>{},onStop=()=>{},onBytes=()=>{},onRaceOrder=()=>{},isVisible=()=>true,readHealth=()=>({}),readPerformance=()=>null,movementMode='adaptive'}={}){
  Object.assign(this,{onChange,onPrepare,onStart,onStop,onBytes,onRaceOrder,isVisible,readHealth,readPerformance});this.movementMode=movementMode==='reliable'?'reliable':'adaptive';this.motionTimer=null;this.motionDue=0;this.performanceCaptureEnabled=false;this.hostDiagnosticsEnabled=false;this.reset();
 }
 reset(){this.environmentEpoch='';this.environment=new RoomEnvironmentClock({localTime:(at,now)=>this.server?.clockSync?.localTime(at,now,1000)?.at??null});this.waiters=new Map();this.waitEpoch='';this.remotePhase='';this.chatScenes=new Map();this.chatLocked=new Set();this.raceHistory=new Map();this.raceAuthority=null;this.raceInbox=null;this.raceDeliveries=new Map();this.diagnosticsRevision=0;this.receivedDiagnosticsRevision=-1;this.setPerformanceCapture(this.hostDiagnosticsEnabled);this.distributor=null;this.stateSequence=0;this.awaitingStop=false;this.endedEpoch='';this.progressFrames=0;this.progressAt=0;this.networkStats=new Map();this.payloadSent=0;this.payloadReceived=0;this.chat=[];this.chatSequence=0;this.chatRate=new Map();this.lastChatSent=-Infinity;this.sentTiming=packetTiming();this.receivedTiming=packetTiming();this.peer=null;this.server=null;this.connections=new Map();this.members=[];this.pending=new Map();this.phase='idle';this.isHost=false;this.id='';this.host='';this.secret='';this.epoch='';this.revision=0;this.swaps=new Map();this.swapNotice='';this.visibility='private';this.roomName='';this.settings=validateSettings({mode:0,difficulty:0,region:'Export'});this.error='';this.signaling=true;this.prepared=new Set();this.timer=null;this.generation=(this.generation||0)+1;this.initRecovery();}
 snapshot(){return {visibility:this.visibility,roomName:this.roomName,diagnosticsEnabled:this.performanceCaptureEnabled,phase:this.phase,isHost:this.isHost,id:this.id,host:this.host,code:this.host&&this.secret?invitation(this.host,this.secret):'',members:this.members.map(x=>({...x})),waiting:[...this.waiters.values()].map(x=>({...x})),waitingForRace:this.waiters.has(this.id),spectating:!!this.waiters.get(this.id)?.spectator,rolePending:[...this.commands.values()].some(c=>c.data.type==='set-role'),remotePhase:this.remotePhase,pending:[...this.pending.values(),...(this.isHost?[...this.waiters.values()].filter(w=>w.needsApproval):[])].map(x=>({...x})),settings:{...this.settings},error:this.error,signaling:this.signaling,awaitingStop:this.awaitingStop,chat:this.chat.map(x=>({...x})),chatAvailable:this.chatAllowed(this.id),reconnectUntil:this.reconnectUntil,confirming:this.commands.size,readyPending:[...this.commands.values()].some(c=>c.data.type==='ready'),seatPending:[...this.commands.values()].find(c=>c.data.type==='move-seat')?.data.cabinet??null,seatActionPending:[...this.commands.values()].some(c=>['move-seat','swap-request','swap-answer','swap-cancel'].includes(c.data.type)),swaps:this.swapState(),swapNotice:this.swapNotice,lastAck:this.lastAck};}
 changed(){this.onChange(this.snapshot());}
 recordConnectionEvent(kind,conn=null,detail={}){
  const now=performance.now(),pc=conn?.peerConnection;
  const member=detail.member||this.members.find(m=>m.id===(conn?.peer||this.id))||this.pending.get(conn?.peer)||this.waiters.get(conn?.peer);
  this.connectionEvents.push({id:++this.consoleEventSequence,at:Date.now(),time:now,kind,phase:this.phase,role:this.isHost?'MASTER':'SLAVE',name:cleanName(member?.name||(!conn?this.name:'Driver')),cabinet:member?.cabinet??null,source:detail.source||'observed',cause:detail.cause||null,reason:cleanReason(detail.reason),
   channelState:conn?.dataChannel?.readyState??(conn?.open?'open':null),connectionState:pc?.connectionState??null,iceState:pc?.iceConnectionState??null,
   bufferedBytes:conn?.dataChannel?.bufferedAmount||0,rttMs:this.networkStats.get(conn)?.rttMs??conn?.measuredRttMs??null,lastMessageAgeMs:conn?.lastSeen==null?null:Math.max(0,now-conn.lastSeen),progressAgeMs:conn?.emulation?.at==null?null:Math.max(0,now-conn.emulation.at)});
  if(this.connectionEvents.length>128)this.connectionEvents.shift();
 }
 initRecovery(){this.performanceHistory=new PerformanceHistory();this.performanceAck=0;this.performanceOffered=0;this.connectionEvents=[];this.consoleEventSequence=0;this.consoleRecords=new Map();this.consoleSerial=0;this.healthSampler=new HealthSampler();this.nativeDelivery=new TransportProbe({enabled:this.performanceCaptureEnabled});this.lastHealth=null;this.sessions=new Map();this.sessionKey='';this.reconnectUntil=0;this.retryAt=0;this.retryAttempt=0;this.signalRetryAt=0;this.signalAttempt=0;this.lobbySequence=0;this.lastLobbySequence=0;this.commands=new Map();this.commandSequence=0;this.lastAck=null;}
 diagnosticsPolicy(){return {enabled:this.performanceCaptureEnabled,revision:this.diagnosticsRevision};}
 setDiagnosticsEnabled(on){
  if(!this.isHost||!['lobby','playing'].includes(this.phase)||typeof on!=='boolean')return false;
  this.hostDiagnosticsEnabled=on;if(on===this.performanceCaptureEnabled)return true;
  this.diagnosticsRevision++;this.setPerformanceCapture(on);this.recordConnectionEvent('diagnostics-changed',null,{source:'action',reason:on?'Detailed room diagnostics enabled.':'Detailed room diagnostics disabled.'});
  this.broadcast({type:'diagnostics-policy',diagnostics:this.diagnosticsPolicy()});this.changed();return true;
 }
 applyDiagnosticsPolicy(policy){
  if(!policy||typeof policy.enabled!=='boolean'||!Number.isSafeInteger(policy.revision)||policy.revision<0||policy.revision<=this.receivedDiagnosticsRevision)return false;
  this.receivedDiagnosticsRevision=policy.revision;this.diagnosticsRevision=policy.revision;this.setPerformanceCapture(policy.enabled);return true;
 }
 setPerformanceCapture(on){on=!!on;if(on===this.performanceCaptureEnabled)return;this.performanceCaptureEnabled=on;this.sentTiming=packetTiming();this.receivedTiming=packetTiming();this.networkStats.clear();this.nativeDelivery?.setEnabled(on);for(const c of [...(this.connections?.values()||[]),this.server].filter(Boolean)){c.transportProbe?.setEnabled(on);c.motion?.probe.setEnabled(on);}}
 makePerformance(){
  if(!this.performanceCaptureEnabled)return null;
  const epoch=this.epoch||this.endedEpoch;if(!epoch)return null;
  let packet;try{packet=this.readPerformance(epoch,this.isHost?(this.performanceHistory.records.get(this.id)?.lastSequence||0):this.performanceAck);}catch{return null;}
  if(!packet||packet.version!==1||packet.epoch!==epoch||!Array.isArray(packet.samples)||!packet.samples.length||packet.samples.length>PERFORMANCE_BATCH_LIMIT)return null;
  const samples=packet.samples.map(normalizePerformanceSample);if(samples.some(s=>!s))return null;packet={version:1,epoch,samples};
  if(this.isHost){const member=this.members.find(m=>m.id===this.id);if(member)this.performanceHistory.accept(member,packet,[epoch],{local:true,activeIDs:this.members.map(m=>m.id)});return null;}
  return packet;
 }
 receivePerformance(conn,data){
  if(!this.performanceCaptureEnabled||!this.isHost||this.connections.get(conn.peer)!==conn)return 0;
  const member=this.members.find(m=>m.id===conn.peer);if(!member)return 0;
  try{return this.performanceHistory.accept(member,data.performance,[this.epoch||this.endedEpoch],{activeIDs:this.members.map(m=>m.id)}).ack;}catch{return this.performanceHistory.records.get(conn.peer)?.lastSequence||0;}
 }
 performanceIdentities(){
  const identities=[{id:this.id,serial:0,name:this.name,cabinet:this.members.find(m=>m.id===this.id)?.cabinet??null,self:true}];
  for(const member of this.members){if(member.id===this.id)continue;if(!this.consoleRecords.has(member.id))this.connectionRow(member,this.connections.get(member.id),performance.now());}
  for(const [id,record] of this.consoleRecords)if(record.row)identities.push({id,serial:record.serial,name:record.row.name,cabinet:record.row.cabinet,self:false});
  return identities;
 }
 makeHealth(now=performance.now()){let extra={};try{extra=this.readHealth()||{};}catch{}return this.lastHealth=this.healthSampler.sample(this,now,extra);}
 receiveHealth(conn,data){
  if(!this.isHost||this.connections.get(conn.peer)!==conn||!this.members.some(m=>m.id===conn.peer)||data.health===undefined)return;
  const health=normalizeHealth(data.health);
  if(!health){if(!conn.invalidHealthAt||performance.now()-conn.invalidHealthAt>5000){conn.invalidHealthAt=performance.now();this.recordConnectionEvent('invalid-status-report',conn);}return;}
  if(health.sequence<=(conn.healthSequence||0))return;
  if(this.active&&data.epoch!==this.epoch)return;
  conn.healthSequence=health.sequence;conn.healthReport={...health,receivedAt:performance.now()};
 }
 connectionRow(member,conn,now){
  const stats=this.networkStats.get(conn),flow=conn?.snapshotFlow?.snapshot();
  let record=this.consoleRecords.get(member.id);
  if(!record){record={serial:++this.consoleSerial};this.consoleRecords.set(member.id,record);}
  if(conn){conn.transportProbe?.add('buffered',conn.dataChannel?.bufferedAmount||0);const counters=conn.consoleCounters||{tx:0,rx:0};const prev=conn.consoleRate;
   if(!prev||now-prev.at>=500){conn.consoleRate={at:now,tx:counters.tx,rx:counters.rx,txRate:prev?Math.max(0,counters.tx-prev.tx)*1000/(now-prev.at):null,rxRate:prev?Math.max(0,counters.rx-prev.rx)*1000/(now-prev.at):null};}
  }
  const age=at=>at==null?null:Math.max(0,now-at),report=conn?.healthReport;
  const health=report?Object.fromEntries(Object.entries(report).filter(([key])=>key!=='receivedAt')):null;
  const row={serial:record.serial,name:cleanName(member.name),cabinet:member.cabinet??null,self:false,pending:this.pending.has(member.id),waiting:this.waiters.has(member.id),archived:false,connection:member.connection||'connected',
   rttMs:conn?.measuredRttMs??stats?.rttMs??null,rttSource:Number.isFinite(conn?.measuredRttMs)?'room-ping':stats?.rttMs!=null?'browser':null,transportRttMs:stats?.rttMs??null,statsAgeMs:stats?.at==null?null:Math.max(0,now-stats.at),path:stats?stats.relay?'relay':'direct':null,channelState:conn?.dataChannel?.readyState??(conn?.open?'open':null),connectionState:conn?.peerConnection?.connectionState??null,iceState:conn?.peerConnection?.iceConnectionState??null,
   bufferedBytes:conn?this.movementBuffered(conn):null,inFlight:flow?.inFlight??null,pendingStates:flow?.pending??null,snapshotFlow:flow||null,ackAgeMs:conn?.snapshotFlow?.oldestAgeMs(now)??null,ackProgressAgeMs:conn?.snapshotFlow?.ackProgressAgeMs(now)??null,
   lastMessageAgeMs:age(conn?.lastSeen),progressAgeMs:age(conn?.emulation?.epoch===this.epoch?conn.emulation.at:null),lastStateAgeMs:age(conn?.lastStateAt),reportAgeMs:age(report?.receivedAt),health,
   sentBytes:conn?.consoleCounters?.tx??0,receivedBytes:conn?.consoleCounters?.rx??0,txBytesPerSecond:conn?.consoleRate?.txRate??null,rxBytesPerSecond:conn?.consoleRate?.rxRate??null,performance:this.performanceHistory.summary(member.id),transport:conn?.transportProbe?.snapshot(now)||null,reportedTransport:this.performanceHistory.records.get(member.id)?.samples.at(-1)?.network?.transport||[],reportedNativeDelivery:this.performanceHistory.records.get(member.id)?.samples.at(-1)?.network?.nativeDelivery||null};
  row.motionTransport=conn?.motion?.probe.snapshot(now)||null;row.movementMode=conn?.raceMotion?'latest':conn?.motion?.ready?'available':'reliable';
  row.reportedMotionTransport=this.performanceHistory.records.get(member.id)?.samples.at(-1)?.network?.motion||[];
  row.transportSignals=transportSignals({probe:conn?.raceMotion?row.motionTransport:row.transport,browserRttMs:row.transportRttMs,simulationHz:row.health?.simulationHz});
  record.row=row;return row;
 }
 retainConnection(conn){
  if(!this.isHost)return;const member=this.members.find(m=>m.id===conn.peer)||this.pending.get(conn.peer)||this.waiters.get(conn.peer);if(!member)return;
  const row=this.connectionRow(member,conn,performance.now());this.consoleRecords.get(member.id).row={...row,archived:true,connection:'disconnected'};
  this.trimConsoleRecords();
 }
 trimConsoleRecords(){
  const current=new Set([...this.members.map(m=>m.id),...this.pending.keys(),...this.waiters.keys()]);
  for(const [id,r] of this.consoleRecords)if(this.consoleRecords.size>32&&!current.has(id)&&r.row?.archived)this.consoleRecords.delete(id);
 }
 consoleSnapshot({includePerformance=false}={}){
  if(!this.isHost){if(!this.lastHostReport)return null;return {...structuredClone(this.lastHostReport),...(includePerformance?{performance:structuredClone(this.lastHostPerformance)}:{})};}
  this.makePerformance();
  const now=performance.now(),health=this.makeHealth(now),activeIDs=new Set([this.id]),rows=[{serial:0,self:true,name:cleanName(this.name),cabinet:this.members.find(m=>m.id===this.id)?.cabinet??null,visible:health.visible,health,reportAgeMs:0,connection:'connected',archived:false,rttMs:null,lastMessageAgeMs:0,lastStateAgeMs:null,progressAgeMs:this.active?Math.max(0,now-this.progressAt):null,bufferedBytes:this.diagnostics().bufferedBytes,nativeDelivery:this.nativeDelivery.snapshot(now),performance:this.performanceHistory.summary(this.id)}];
  for(const member of [...this.members,...this.pending.values(),...this.waiters.values()]){
   if(member.id===this.id)continue;activeIDs.add(member.id);const conn=this.connections.get(member.id),previous=this.consoleRecords.get(member.id)?.row;
   rows.push(conn?this.connectionRow(member,conn,now):previous?{...previous,archived:false,connection:member.connection||'reconnecting'}:this.connectionRow(member,null,now));
  }
  for(const [id,record] of this.consoleRecords)if(!activeIDs.has(id)&&record.row)rows.push({...record.row,archived:true,connection:'disconnected',performance:this.performanceHistory.summary(id)});
  this.trimConsoleRecords();
  return {build:BUILD_ID,captureMode:this.performanceCaptureEnabled?'full':'off',generatedAt:new Date().toISOString(),live:true,phase:this.phase,signaling:this.signaling,rows,events:this.connectionEvents.map(e=>({...e})),packetLossPercent:null,raceOrders:[...this.raceHistory.values()].map(v=>structuredClone(v)),raceOrderDelivery:[...this.raceDeliveries.values()].map(d=>({peer:d.peer,race:d.order.race,revision:d.order.revision,acked:d.acked})),...(includePerformance?{performance:this.performanceHistory.report(this.performanceIdentities())}:{})};
 }
 get active(){return this.phase==='playing';}
 get occupied(){return !['idle','error'].includes(this.phase);}
 send(conn,data){if(!conn?.open)throw linkError('A player is disconnected.','transport-interruption',conn);if((conn.dataChannel?.bufferedAmount||0)>MAX_BUFFER){this.recordConnectionEvent('send-queue-limit',conn);throw linkError('A player connection is too slow; the arcade link was stopped.','send-queue-limit',conn);}const measured=this.performanceCaptureEnabled&&conn.transportProbe,start=measured?performance.now():0,submit=measured?.submitTotalMs;try{const result=conn.send(data);if(measured)measured.sendCall(performance.now()-start,submit,!!result&&typeof result.then==='function');}catch(e){this.recordConnectionEvent('send-error',conn);throw linkError(e.message||'Send failed.','send-error',conn);}if(['arcade-sample','arcade-state'].includes(data.type)){this.payloadSent+=data.bytes.byteLength;recordPacket(this.sentTiming,this.performanceCaptureEnabled);if(conn.consoleCounters)conn.consoleCounters.tx+=data.bytes.byteLength;}}
 sendSnapshot(conn,data){
  if(!conn?.open)throw linkError('A player is disconnected.','transport-interruption',conn);
  if(!conn.snapshotFlow||conn.snapshotFlow.epoch!==this.epoch)conn.snapshotFlow=this.newSnapshotFlow(conn);
  conn.latestSnapshot=data;conn.snapshotFlow.offer(data);this.flushSnapshot(conn);this.scheduleMotion();
 }
 flushSnapshot(conn){
  if(!this.active||!conn?.open||conn.snapshotFlow?.epoch!==this.epoch)return;
  if(!conn.raceMotion){conn.snapshotFlow.flush(conn.dataChannel?.bufferedAmount||0,data=>this.send(conn,data));return;}
  try{conn.snapshotFlow.flush(conn.motion?.channel.bufferedAmount||0,data=>{conn.motion.send({...data,receipt:conn.motionReceived?{delivery:conn.motionReceived.delivery,mask:conn.motionReceived.mask}:null},this.members.length);this.payloadSent+=data.bytes.byteLength;recordPacket(this.sentTiming,this.performanceCaptureEnabled);if(conn.consoleCounters)conn.consoleCounters.tx+=data.bytes.byteLength;});}
  catch{this.fallbackMotion(conn,'Movement send unavailable.');}
 }
 acknowledgeSnapshot(conn,data,motion=false){
  if(data.delivery===undefined)return; // Bare local messages have no receipt envelope; sendSnapshot always adds one.
  if(!Number.isSafeInteger(data.delivery)||data.delivery<1)throw Error('Invalid snapshot delivery.');
  if(motion){
   const old=conn.motionReceived,delta=data.delivery-(old?.delivery||0);let receipt;
   if(!old||delta>0){receipt={delivery:data.delivery,mask:!old||delta>=32?1:((old.mask<<delta)|1)>>>0,sentAt:data.sentAt};conn.motionReceived=receipt;}
   else{receipt=old;const bit=old.delivery-data.delivery;if(bit<32)receipt.mask=(receipt.mask|(1<<bit))>>>0;}
   return; // The next outgoing state, ping or pong carries this receipt.
  }
  this.send(conn,{type:'arcade-ack',epoch:this.epoch,kind:data.type,delivery:data.delivery,frames:this.progressFrames});
 }
 clearSnapshots(){clearTimeout(this.motionTimer);this.motionTimer=null;this.motionDue=0;for(const conn of this.isHost?this.connections.values():[this.server])if(conn){conn.snapshotFlow=null;conn.latestSnapshot=null;conn.raceMotion=false;conn.motionEpoch='';}}
 movementBuffered(conn){return (conn?.dataChannel?.bufferedAmount||0)+(conn?.motion?.channel.bufferedAmount||0);}
 currentConnection(conn){return this.isHost?this.connections.get(conn.peer)===conn:this.server===conn;}
 newSnapshotFlow(conn){const observe=(kind,value)=>(conn.raceMotion?conn.motion?.probe:conn.transportProbe)?.add(kind,value);return conn.raceMotion?new LatestFlow(this.epoch,conn.measuredRttMs,observe):new SnapshotFlow(this.epoch,conn.measuredRttMs,observe);}
 scheduleMotion(){
  if(!this.active)return;let delay=null;const now=performance.now(),connections=this.isHost?this.connections.values():[this.server];
  for(const c of connections){if(!c?.raceMotion||!c.open||c.snapshotFlow?.epoch!==this.epoch)continue;const d=c.snapshotFlow.nextDelay(c.motion?.channel.bufferedAmount||0,now);if(d!==null)delay=delay===null?d:Math.min(delay,d);}
  if(delay===null){clearTimeout(this.motionTimer);this.motionTimer=null;this.motionDue=0;return;}
  const due=now+delay;if(this.motionTimer!==null&&this.motionDue<=due+1)return;
  clearTimeout(this.motionTimer);this.motionDue=due;const generation=this.generation,epoch=this.epoch;
  this.motionTimer=setTimeout(()=>{this.motionTimer=null;this.motionDue=0;if(generation!==this.generation||!this.active||this.epoch!==epoch)return;for(const c of this.isHost?this.connections.values():[this.server])if(c?.raceMotion)try{this.flushSnapshot(c);}catch(e){this.end(e.message,e.linkPeer||c.peer,e.linkCause||'send-error');break;}this.scheduleMotion();},delay);
 }
 installMotion(conn,{id,nonce},incoming){
  const generation=this.generation;
  let link;link=new MotionChannel(conn,{id,nonce,enabled:this.performanceCaptureEnabled,onData:data=>{if(generation===this.generation&&conn.motion===link&&this.currentConnection(conn))this.receiveMotion(conn,data,incoming);},onState:state=>{
   if(generation!==this.generation||conn.motion!==link||!this.currentConnection(conn))return;
   this.recordConnectionEvent('motion-'+state,conn);
   if(state==='open'){if(!incoming){link.remoteReady=true;conn.motionDeadline=0;try{this.send(conn,{type:'motion-ready',version:MOTION_VERSION,nonce});}catch{}}}else this.fallbackMotion(conn,'Movement channel '+state+'.');
  },onLow:()=>{if(generation===this.generation&&conn.motion===link&&this.currentConnection(conn))this.scheduleMotion();}});
  conn.motion=link;conn.motionDeadline=performance.now()+10000;return link;
 }
 offerMotion(conn){
  if(conn.motion||this.movementMode==='reliable'||conn.metadata?.motion!==MOTION_VERSION||!conn.peerConnection?.createDataChannel)return;
  try{const id=motionChannelId(conn);if(id===null)return;const nonce=token();this.installMotion(conn,{id,nonce},true);this.send(conn,{type:'motion-offer',version:MOTION_VERSION,id,nonce});}
  catch{conn.motion?.dispose();this.recordConnectionEvent('motion-unavailable',conn);}
 }
 fallbackMotion(conn,reason,{notify=true}={}){
  const wasMotion=conn.raceMotion;conn.motion?.dispose();
  if(wasMotion){conn.raceMotion=false;conn.snapshotFlow=this.newSnapshotFlow(conn);this.recordConnectionEvent('motion-fallback',conn,{reason});
   if(notify&&conn.open)try{this.send(conn,{type:'motion-fallback',epoch:this.epoch,nonce:conn.motion?.nonce});}catch{}
   if(this.active&&conn.latestSnapshot){conn.snapshotFlow.offer(conn.latestSnapshot);this.flushSnapshot(conn);}
  }
  conn.motionDeadline=0;this.scheduleMotion();
 }
 receiveMotion(conn,data,incoming){
  if(!this.active||!conn.raceMotion||!conn.motion?.open||data.epoch!==this.epoch||data.count!==this.members.length)return;
  if(data.type==='motion-ack'){
   if(data.kind!==(this.isHost?'arcade-state':'arcade-sample'))return;
   try{if(conn.snapshotFlow?.acknowledge(data.delivery,performance.now(),data.receiptMask)){conn.lastSeen=performance.now();if(!incoming||this.members.some(m=>m.id===conn.peer))this.observeRemoteFrames(conn,data);this.scheduleMotion();}}catch{conn.motion.invalidMessages++;}return;
  }
  if(data.type!==(incoming?'arcade-sample':'arcade-state'))return;
  if(incoming){const index=this.members.findIndex(m=>m.id===conn.peer);if(index<0||new Uint8Array(data.bytes)[0]!==linkIdForSeat(index+1,this.members.length)){conn.motion.invalidMessages++;return;}}
  if(data.receipt)this.receiveMotionReceipt(conn,{epoch:data.epoch,kind:incoming?'arcade-state':'arcade-sample',delivery:data.receipt.delivery,receiptMask:data.receipt.mask});
  conn.lastSeen=performance.now();this.payloadReceived+=data.bytes.byteLength;recordPacket(this.receivedTiming,this.performanceCaptureEnabled);conn.consoleCounters.rx+=data.bytes.byteLength;
  try{this.handle(conn,data,incoming,true);}catch(e){this.recordConnectionEvent('data-handler-error',conn);this.end(e.message||'Movement state could not be applied.',this.id,'receive-error');}
 }
 makeMotionReceipt(conn){return conn?.raceMotion&&conn.motionReceived?{epoch:this.epoch,kind:this.isHost?'arcade-sample':'arcade-state',delivery:conn.motionReceived.delivery,receiptMask:conn.motionReceived.mask}:null;}
 receiveMotionReceipt(conn,receipt){
  if(!conn.raceMotion||!this.active||receipt?.epoch!==this.epoch||receipt.kind!==(this.isHost?'arcade-state':'arcade-sample'))return;
  try{if(conn.snapshotFlow?.acknowledge(receipt.delivery,performance.now(),receipt.receiptMask))this.scheduleMotion();}catch{if(conn.motion)conn.motion.invalidMessages++;}
 }
 observeRemoteFrames(conn,data){if(this.active&&data.epoch===this.epoch&&Number.isSafeInteger(data.frames)&&data.frames>=0){const previous=conn.emulation;if(!previous||previous.epoch!==this.epoch||data.frames>previous.frames)conn.emulation={epoch:this.epoch,frames:data.frames,at:performance.now()};}}
 broadcast(data){for(const member of this.members){if(member.id===this.id)continue;const conn=this.connections.get(member.id);if(!conn)continue;try{this.send(conn,data);}catch(e){queueMicrotask(()=>{this.detach(conn,true,e.message);try{conn.close();}catch{}});}}}
 broadcastRoom(data){this.broadcast(data);for(const w of this.waiters.values()){const c=this.connections.get(w.id);if(!c?.open)continue;try{this.send(c,data);}catch(e){queueMicrotask(()=>{this.detach(c,true,e.message);try{c.close();}catch{}});}}}
 waitingRoster(){return [...this.waiters.values()].map(w=>({id:w.id,name:w.name,cabinet:w.cabinet,connection:w.connection,needsApproval:!!w.needsApproval,spectator:!!w.spectator}));}
 validateWaiters(value,members){
  if(value===undefined)return new Map();
  const seated=Array.isArray(value)?value.filter(w=>!w?.spectator):[];if(!Array.isArray(value)||value.length>16||members.length+seated.length>8||value.filter(w=>w?.spectator).length>8||value.some(w=>!w||typeof w.id!=='string'||!w.id||w.id.length>100||typeof w.needsApproval!=='boolean'||(w.spectator!==undefined&&typeof w.spectator!=='boolean')||(w.spectator?w.cabinet!=null:!Number.isInteger(w.cabinet)||w.cabinet<1||w.cabinet>8))||new Set([...members,...value].map(w=>w.id)).size!==members.length+value.length||new Set([...members,...seated].map(w=>w.cabinet)).size!==members.length+seated.length)throw Error('Invalid waiting seats.');
  return new Map(value.map(w=>[w.id,{id:w.id,name:cleanName(w.name),cabinet:w.cabinet,needsApproval:w.needsApproval,spectator:!!w.spectator,connection:w.connection==='reconnecting'?'reconnecting':'connected'}]));
 }
 signalingLost(){this.recordConnectionEvent('signaling-disconnected');this.signaling=false;if(!this.signalRetryAt)this.signalRetryAt=performance.now()+retryDelay(this.signalAttempt++);this.changed();}
 connectHost(){
  if(!this.peer||this.peer.destroyed||this.peer.disconnected||this.server)return;
  try{const conn=this.peer.connect(this.host,{reliable:true,serialization:'binary',metadata:{build:BUILD_ID,token:this.secret,name:this.name,session:this.sessionKey,role:this.joinRole||'driver',...(this.movementMode!=='reliable'?{motion:MOTION_VERSION}:{})}});this.server=conn;this.attach(conn,false);}
  catch(e){if(this.phase==='connecting')throw e;this.retryAt=performance.now()+retryDelay(this.retryAttempt++);}
 }
 failRoom(reason){
  // A terminal room notice must stop the native game before changing phase;
  // otherwise it can keep running without the host or its arcade link.
  if(this.active||this.phase==='preparing'||this.epoch)this.stopLocal(reason);
  this.reconnectUntil=0;this.commands.clear();this.awaitingStop=false;this.phase='error';this.error=reason;this.members=[];this.waiters.clear();this.swaps.clear();this.changed();
 }
 syncConnection(conn){
  const admitted=this.members.some(m=>m.id===conn.peer),waiting=this.waiters.has(conn.peer),visible=admitted||waiting;
  this.send(conn,{type:'room-sync',visibility:this.visibility,roomName:this.roomName,diagnostics:this.diagnosticsPolicy(),sequence:++this.lobbySequence,revision:this.revision,admitted,waiting,phase:this.phase,epoch:this.epoch,waiters:visible?this.waitingRoster():[],members:visible?this.members:[],settings:this.settings,environment:visible&&this.settings.environment==='cycle'?this.environment.anchor():null,chat:visible?this.chat:[],swaps:admitted?this.swapState():[],reason:this.error});
 }
 command(type,fields){if(this.commands.size>=32)throw Error('Waiting for the host to confirm pending actions.');const data={type,...fields,command:++this.commandSequence};this.commands.set(data.command,{data,at:performance.now()});try{this.send(this.server,data);}catch{if(this.server)this.detach(this.server,false);}this.changed();}
 acknowledge(conn,data,accepted,reason=''){
  if(!Number.isSafeInteger(data.command)||data.command<1)return;
  const session=this.sessions.get(conn.peer),ack={type:'command-ack',command:data.command,action:data.type,accepted,reason};
  if(session){session.lastCommand=Math.max(session.lastCommand||0,data.command);session.commands.set(data.command,ack);if(session.commands.size>64)session.commands.delete(session.commands.keys().next().value);}
  this.send(conn,ack);
 }
 async openPeer(){
  if(typeof globalThis.Peer!=='function')throw Error('PeerJS could not load. Reload the page.');
  const generation=this.generation;
  const configuration=globalThis.DAYTONA_ICE_SERVERS?{iceServers:globalThis.DAYTONA_ICE_SERVERS,relay:false}:await turnClient.configuration();
  if(generation!==this.generation)return false;
  this.recordConnectionEvent(configuration.relay?'turn-ready':'turn-unavailable');
  const peer=this.peer=new Peer(`dt-${token()}`,{debug:0,config:{iceServers:configuration.iceServers,iceTransportPolicy:'all'}});
  if(!globalThis.DAYTONA_ICE_SERVERS)this.stopIceRefresh=maintainIceConfiguration(peer,configuration,{onChange:next=>{if(generation===this.generation)this.recordConnectionEvent(next.relay?'turn-ready':'turn-unavailable');}});
  peer.on('connection',conn=>{if(this.spectators?.connection(conn))return;if(this.isHost&&generation===this.generation)this.attach(conn,true);else conn.close();});
  peer.on('disconnected',()=>{if(generation===this.generation)this.signalingLost();});
  let opened=false;
  await new Promise((resolve,reject)=>{
   const expiry=setTimeout(()=>reject(Error('PeerJS signaling did not respond. Check your connection and try again.')),OPEN_TIMEOUT_MS);
   peer.on('open',id=>{if(generation!==this.generation)return;clearTimeout(expiry);opened=true;this.id=id;this.signaling=true;this.signalRetryAt=0;this.signalAttempt=0;this.changed();resolve();});
   peer.on('error',err=>{
    if(generation!==this.generation)return;
    const errorType=/^[a-z0-9-]{1,40}$/i.test(err?.type||'')?err.type:'unknown';this.recordConnectionEvent('peer-error:'+errorType);
    if(['network','socket-error','socket-closed','disconnected'].includes(err.type)&&!peer.destroyed){this.signalingLost();return;}
    if(opened&&err.type==='peer-unavailable'&&!this.isHost&&this.phase==='reconnecting'){if(this.server){const conn=this.server;this.detach(conn,false);try{conn.close();}catch{}}return;}
    const e=Error(err.type==='peer-unavailable'?'Room unavailable. Ask the host for a new invitation.':`Connection failed (${err.type||'network'}). Some networks need a TURN relay.`);
    if(!opened){clearTimeout(expiry);reject(e);return;}
    if(this.active||this.phase==='preparing')this.end(e.message,this.id,'local-runtime-error');
    if(peer.destroyed){this.signaling=false;this.pending.clear();this.sessions.clear();this.failRoom(e.message);}else{this.error=e.message;this.changed();}
   });
  });
  this.timer=setInterval(()=>this.heartbeat(),1000);
 }
 async create(name,{visibility='private',roomName=''}={}){if(!['public','private'].includes(visibility))throw Error('Choose a public or private room.');this.leave();this.visibility=visibility;this.roomName=String(roomName).replace(/\s+/gu,' ').trim().slice(0,48)||cleanName(name)+"'s room";this.isHost=true;this.name=cleanName(name);this.phase='connecting';this.changed();try{if(await this.openPeer()===false)return;this.host=this.id;this.secret=token();this.members=[{id:this.id,name:this.name,ready:false,cabinet:1,rtt:null}];this.phase='lobby';this.changed();}catch(e){this.leave();this.phase='error';this.error=e.message;this.changed();}}
 async join(code,name,{publicRoom=false,role='driver'}={}){
  const invite=parseInvitation(code);this.leave();this.joinRole=role==='spectator'?'spectator':'driver';this.visibility=publicRoom?'public':'private';this.name=cleanName(name);this.sessionKey=token();this.host=invite.host;this.secret=invite.token;this.phase='connecting';this.changed();
  try{if(await this.openPeer()===false)return;this.connectHost();}catch(e){this.leave();this.phase='error';this.error=e.message;this.changed();}
 }
 attach(conn,incoming){
  const generation=this.generation;let accepted=false;conn.consoleCounters={tx:0,rx:0};conn.lastSeen=performance.now();conn.openingUntil=conn.lastSeen+OPEN_TIMEOUT_MS;conn.wasOpened=false;
  const expiry=setTimeout(()=>{if(generation!==this.generation||accepted)return;this.recordConnectionEvent('opening-timeout',conn);if(!incoming&&this.server===conn)this.detach(conn,false,'The data channel did not open within 30 seconds.');try{conn.close();}catch{}},OPEN_TIMEOUT_MS);
  conn.on('open',()=>{
   if(generation!==this.generation||(!incoming&&this.server!==conn)){conn.close();return;}
   const channel=conn.dataChannel;if(!channel?.ordered||channel.maxRetransmits!=null||channel.maxPacketLifeTime!=null){if(!incoming)this.failRoom('Incompatible data channel.');conn.close();return;}
   conn.lastSeen=performance.now();conn.wasOpened=true;conn.openingUntil=0;conn.transportProbe=new TransportProbe({enabled:this.performanceCaptureEnabled});conn.stopTransportProbe=attachDataChannelProbe(channel,conn.transportProbe);this.recordConnectionEvent('channel-open',conn);
   if(incoming){
    const meta=conn.metadata,session=this.sessions.get(conn.peer),returning=!!session;
    const valid=meta?.build===BUILD_ID&&meta?.token===this.secret&&/^[a-f0-9]{32}$/.test(meta?.session||'');
    const waitingSession=returning&&this.waiters.has(conn.peer),roomOpen=['lobby','preparing','playing'].includes(this.phase);
    if(!valid||!roomOpen||(returning&&!waitingSession&&this.phase!=='lobby')||(returning?(session.key!==meta.session||(session.until&&performance.now()>session.until)):this.members.length+this.pending.size+this.waiters.size>=16)){
     this.send(conn,{type:'reject',reason:'Invalid invitation, expired session, incompatible version or room full.'});setTimeout(()=>conn.close(),200);return;
    }
    const previous=this.connections.get(conn.peer);this.connections.set(conn.peer,conn);
    if(returning){session.until=0;const member=this.members.find(m=>m.id===conn.peer),pending=this.pending.get(conn.peer);if(member){member.connection='connected';member.ready=false;this.revision++;if(!this.members.some(m=>m.connection==='reconnecting'))this.error='';}if(pending)pending.connection='connected';const w=this.waiters.get(conn.peer);if(w)w.connection='connected';}
    else{this.sessions.set(conn.peer,{key:meta.session,until:0,commands:new Map()});const spectator=meta.role==='spectator'||!this.firstOpenSeat()||this.members.length+[...this.pending.values()].filter(p=>!p.spectator).length+[...this.waiters.values()].filter(p=>!p.spectator).length>=8;const person={id:conn.peer,name:cleanName(meta.name),connection:'connected',spectator};if(this.phase==='lobby')this.pending.set(conn.peer,person);else this.waiters.set(conn.peer,{...person,cabinet:spectator?null:this.firstOpenSeat(),needsApproval:this.visibility!=='public'});}
    accepted=true;clearTimeout(expiry);if(returning)this.recordConnectionEvent('player-reconnected',conn);this.observeTransport(conn,incoming,generation);if(this.phase==='lobby'&&!this.waiters.has(conn.peer)&&!this.pending.get(conn.peer)?.spectator)this.offerMotion(conn);if(this.phase==='lobby'&&this.visibility==='public'&&(!returning||this.waiters.has(conn.peer)))this.approve(conn.peer);else{this.syncConnection(conn);this.publish();}if(previous&&previous!==conn)previous.close();
   }else{accepted=true;clearTimeout(expiry);this.observeTransport(conn,incoming,generation);if(this.phase!=='reconnecting'){this.phase='pending';this.changed();}}
  });
  conn.on('data',data=>{if(generation!==this.generation||(incoming?this.connections.get(conn.peer)!==conn:this.server!==conn))return;conn.lastSeen=performance.now();conn.transportProbe?.dispatched();if(['arcade-sample','arcade-state'].includes(data?.type)&&data.bytes instanceof ArrayBuffer){this.payloadReceived+=data.bytes.byteLength;recordPacket(this.receivedTiming,this.performanceCaptureEnabled);conn.consoleCounters.rx+=data.bytes.byteLength;}try{this.handle(conn,data,incoming);}catch(e){this.recordConnectionEvent('data-handler-error',conn);if(this.isHost){this.detach(conn,true,e.message,false);conn.close();}else{if(this.active||this.phase==='preparing')this.end(e.message,this.id,'data-handler-error');this.detach(conn,false,e.message,false);conn.close();}}});
  conn.on('close',()=>{clearTimeout(expiry);conn.stopTransportProbe?.();conn.motion?.dispose();if(generation===this.generation&&(incoming?this.connections.get(conn.peer)===conn:this.server===conn)){this.recordConnectionEvent('channel-close',conn);this.detach(conn,incoming,'The data channel closed.');}});
  conn.on('error',err=>{clearTimeout(expiry);if(generation===this.generation&&(incoming?this.connections.get(conn.peer)===conn:this.server===conn)){const type=/^[a-z0-9-]{1,40}$/i.test(err?.type||'')?err.type:'transport';this.recordConnectionEvent('channel-error:'+type,conn);this.detach(conn,incoming,`Data channel error (${type}).`);}try{conn.close();}catch{}});
 }
 observeTransport(conn,incoming,generation){
  const pc=conn.peerConnection;if(!pc?.addEventListener)return;
  const observe=()=>{if(generation!==this.generation||(incoming?this.connections.get(conn.peer)!==conn:this.server!==conn))return;
   const state=pc.connectionState;if(state===conn.consoleTransportState)return;conn.consoleTransportState=state;
   if(['connected','disconnected','failed','closed'].includes(state))this.recordConnectionEvent('rtc-'+state,conn);
   // Disconnected can recover after a network hiccup. Failed/closed cannot:
   // stop the current race now, even if PeerJS has not emitted close yet.
   if(state==='failed'||state==='closed'){this.detach(conn,incoming,`The WebRTC connection ${state}.`);try{conn.close();}catch{}}
  };pc.addEventListener('connectionstatechange',observe);observe();
  conn.on('close',()=>pc.removeEventListener?.('connectionstatechange',observe));
 }
 forget(id,reason,cause='transport-interruption',source='observed'){
  const member=this.members.find(m=>m.id===id);this.sessions.delete(id);this.pending.delete(id);this.waiters.delete(id);this.chatRate.delete(id);this.members=this.members.filter(m=>m.id!==id);this.trimConsoleRecords();
  this.cancelSwapsFor(id);
  if(member){this.revision++;for(const m of this.members)m.ready=false;if(this.active||this.phase==='preparing')this.end(reason+' The arcade link must restart.',member,cause,source);else this.error=`${member.name} left the room. ${reason}`;}
  this.publish();
 }
 detach(conn,incoming,reason='The cabinet disconnected.',recover=true,cause='transport-interruption',source='observed'){
  if(incoming){
   if(this.connections.get(conn.peer)!==conn)return;this.retainConnection(conn);this.connections.delete(conn.peer);
   const member=this.members.find(m=>m.id===conn.peer),pending=this.pending.get(conn.peer)||this.waiters.get(conn.peer),session=this.sessions.get(conn.peer);
   if(recover&&session&&(member||pending)){
    this.cancelSwapsFor(conn.peer);session.until=performance.now()+RECONNECT_GRACE_MS;
    if(member){if(this.active||this.phase==='preparing')this.end(reason+' Reconnect in the lobby to start again.',member,cause,source);member.connection='reconnecting';this.revision++;for(const m of this.members)m.ready=false;this.error=`${member.name} is reconnecting. ${reason} Their seat is reserved for 30 seconds.`;}
    if(pending)pending.connection='reconnecting';this.publish();
   }else this.forget(conn.peer,reason,cause,source);
  }else{
   if(this.server!==conn)return;
   conn.snapshotFlow=null;this.server=null;
   const host=this.members.find(m=>m.id===this.host),message=host?`Session interrupted by ${host.name} (cabinet ${host.cabinet}). ${reason}`:reason;
   if(!recover||this.phase==='error'){this.reconnectUntil=0;this.commands.clear();this.awaitingStop=false;this.failRoom(message);return;}
   if(this.active||this.phase==='preparing')this.stopLocal(message+' Reconnecting in the lobby.');
   this.swaps.clear();this.awaitingStop=false;if(!this.reconnectUntil){this.reconnectUntil=performance.now()+RECONNECT_GRACE_MS;this.retryAttempt=0;}
   this.retryAt=performance.now()+retryDelay(this.retryAttempt++);this.phase='reconnecting';this.error=`Connection interrupted. ${reason} Reconnecting automatically…`;for(const m of this.members){m.ready=false;if(m.id===this.id)m.connection='reconnecting';}this.changed();
  }
 }
 // Car numbers are stable across departures; new admissions fill the first vacancy.
 setSkin(skin){
  if(this.phase!=='lobby'||this.awaitingStop||[...this.commands.values()].some(c=>c.data.type==='set-skin'))return false;
  const reason=this.skinChangeError(this.id,skin,this.revision);if(reason){this.error=reason;this.changed();return false;}
  if(this.isHost)this.assignSkin(this.members.find(m=>m.id===this.id),skin);
  else this.command('set-skin',{skin,revision:this.revision});return true;
 }
 skinChangeError(id,skin,revision){
  if(this.phase!=='lobby'||this.awaitingStop)return 'Liveries can only change in the lobby.';
  const member=this.members.find(m=>m.id===id);
  if(!member||member.connection==='reconnecting')return 'Reconnect before choosing a livery.';
  if(!validPlayerSkin(skin))return 'Choose an original arcade livery.';
  if(this.swapFor(id))return 'Finish your seat swap before choosing a livery.';
  const owner=skinOwner(this.members,skin,id);if(owner)return `Reserved by ${owner.name}. Choose another livery.`;
  if(revision!==this.revision)return 'The grid changed. Please confirm your choice again.';
  return '';
 }
 assignSkin(member,skin){
  if((member.skin??0)===skin)return;
  member.skin=skin;this.revision++;this.error='';for(const m of this.members)m.ready=false;this.publish();
 }
 firstOpenSeat(){return Array.from({length:8},(_,i)=>i+1).find(seat=>!this.members.some(m=>m.cabinet===seat)&&![...this.waiters.values()].some(m=>m.cabinet===seat));}
 moveSeat(cabinet){
  if(this.phase!=='lobby'||this.awaitingStop||this.snapshot().seatActionPending||!!this.swapFor(this.id))return false;
  const member=this.members.find(m=>m.id===this.id);
  if(!member||member.connection==='reconnecting'||member.cabinet===cabinet)return false;
  this.swapNotice='';if(this.isHost){const reason=this.seatChangeError(this.id,cabinet,this.revision);if(reason){this.error=reason;this.changed();return false;}this.assignSeat(member,cabinet);}
  else this.command('move-seat',{cabinet,revision:this.revision});
  return true;
 }
 seatChangeError(id,cabinet,revision){
  if(this.phase!=='lobby')return 'Seats can only change in the lobby.';
  const member=this.members.find(m=>m.id===id);
  if(!member||member.connection==='reconnecting')return 'Reconnect before choosing a seat.';
  if(this.swapFor(id))return 'Finish or cancel your swap request before changing seats.';
  if(!Number.isInteger(cabinet)||cabinet<1||cabinet>8)return 'Choose a seat from 1 to 8.';
  if(this.members.some(m=>m.id!==id&&m.cabinet===cabinet)||[...this.waiters.values()].some(w=>w.cabinet===cabinet))return 'That seat is already occupied. Choose another open seat.';
  if(revision!==this.revision)return 'The grid changed. Choose your seat again.';
  return '';
 }
 assignSeat(member,cabinet){
  if(member.cabinet===cabinet)return;
  member.cabinet=cabinet;this.revision++;this.error='';for(const m of this.members)m.ready=false;
  this.recordConnectionEvent('seat-changed',this.connections.get(member.id),{member,source:'action',reason:`Car number changed to ${cabinet}.`});this.publish();
 }
 swapState(){return [...this.swaps.values()].map(({until,...offer})=>({...offer}));}
 swapFor(id){return [...this.swaps.values()].find(s=>s.from===id||s.to===id);}
 applySwaps(value){
  const offers=Array.isArray(value)?value:[],seen=new Set();if(offers.length>4)throw Error('Invalid seat requests.');
  const next=new Map();for(const o of offers){
   if(!o||typeof o.id!=='string'||!/^[a-f0-9]{32}$/.test(o.id)||next.has(o.id)||o.from===o.to||seen.has(o.from)||seen.has(o.to)||!Number.isFinite(o.expiresAt)||!this.members.some(m=>m.id===o.from&&m.cabinet===o.fromCabinet)||!this.members.some(m=>m.id===o.to&&m.cabinet===o.toCabinet))throw Error('Invalid seat request.');
   seen.add(o.from);seen.add(o.to);next.set(o.id,{id:o.id,from:o.from,to:o.to,fromCabinet:o.fromCabinet,toCabinet:o.toCabinet,expiresAt:o.expiresAt});
  }const previous=this.swapFor(this.id)?.id;this.swaps=next;if(this.swapFor(this.id)&&this.swapFor(this.id).id!==previous)this.swapNotice='';
 }
 requestSwap(target){
  if(this.phase!=='lobby'||this.awaitingStop||this.snapshot().seatActionPending)return false;
  this.swapNotice='';if(this.isHost){const reason=this.createSwap(this.id,target,this.revision);if(reason){this.swapNotice=reason;this.changed();return false;}}
  else this.command('swap-request',{target,revision:this.revision});return true;
 }
 answerSwap(id,accept){
  if(this.phase!=='lobby'||this.snapshot().seatActionPending)return false;
  if(this.isHost){const reason=this.acceptSwapAnswer(this.id,id,accept);if(reason){this.swapNotice=reason;this.changed();return false;}}
  else this.command('swap-answer',{id,accept});return true;
 }
 cancelSwap(id){
  if(this.phase!=='lobby'||this.snapshot().seatActionPending)return false;
  if(this.isHost){const reason=this.acceptSwapCancel(this.id,id);if(reason){this.swapNotice=reason;this.changed();return false;}}
  else this.command('swap-cancel',{id});return true;
 }
 createSwap(from,to,revision){
  this.expireSwaps();const a=this.members.find(m=>m.id===from),b=this.members.find(m=>m.id===to);
  if(this.phase!=='lobby'||!a||!b||from===to)return 'Choose another driver in the lobby.';
  if(a.connection==='reconnecting'||b.connection==='reconnecting')return 'Both drivers must be connected to swap.';
  if(this.swapFor(from)||this.swapFor(to))return 'A driver already has a pending swap. Try again after it finishes.';
  if(revision!==this.revision)return 'The grid changed. Choose the driver again.';
  const offer={id:token(),from,to,fromCabinet:a.cabinet,toCabinet:b.cabinet,expiresAt:Date.now()+30000,until:performance.now()+30000};this.swaps.set(offer.id,offer);this.swapNotice='';this.publish();return '';
 }
 acceptSwapAnswer(actor,id,accept){
  const offer=this.swaps.get(id);if(this.phase!=='lobby'||!offer||offer.to!==actor||typeof accept!=='boolean')return 'This swap request is no longer available.';
  if(performance.now()>=offer.until){this.finishSwap(offer,'The seat swap request expired.');return 'This swap request expired.';}
  const a=this.members.find(m=>m.id===offer.from),b=this.members.find(m=>m.id===offer.to);
  if(!a||!b||a.connection==='reconnecting'||b.connection==='reconnecting'||a.cabinet!==offer.fromCabinet||b.cabinet!==offer.toCabinet){this.finishSwap(offer,'The seat swap was cancelled because a driver or seat changed.');return 'The grid changed. Request another swap.';}
  if(!accept){this.finishSwap(offer,`${b.name} declined the seat swap.`);return '';}
  [a.cabinet,b.cabinet]=[b.cabinet,a.cabinet];this.revision++;for(const m of this.members)m.ready=false;
  this.recordConnectionEvent('seats-swapped',this.connections.get(actor),{member:b,source:'action',reason:`Cars ${offer.fromCabinet} and ${offer.toCabinet} exchanged by mutual agreement.`});
  this.finishSwap(offer,'Seat swap accepted. Confirm Ready again.');return '';
 }
 acceptSwapCancel(actor,id){const offer=this.swaps.get(id);if(this.phase!=='lobby'||!offer||offer.from!==actor)return 'This swap request is no longer available.';this.finishSwap(offer,'The seat swap request was cancelled.');return '';}
 finishSwap(offer,message,publish=true){
  if(!this.swaps.delete(offer.id))return;
  for(const id of [offer.from,offer.to]){if(id===this.id)this.swapNotice=message;else{const conn=this.connections.get(id);if(conn?.open)try{this.send(conn,{type:'swap-result',message});}catch{}}}
  if(publish)this.publish();
 }
 cancelSwapsFor(id){for(const offer of [...this.swaps.values()])if(offer.from===id||offer.to===id)this.finishSwap(offer,'The seat swap was cancelled because a driver disconnected.',false);}
 expireSwaps(now=performance.now()){if(!this.isHost)return;for(const offer of [...this.swaps.values()])if(now>=offer.until)this.finishSwap(offer,'The seat swap request expired.');}
 publish(){if(this.isHost&&this.phase!=='idle'){this.broadcastRoom({type:'roster',visibility:this.visibility,roomName:this.roomName,diagnostics:this.diagnosticsPolicy(),sequence:++this.lobbySequence,members:this.members,waiters:this.waitingRoster(),epoch:this.epoch,swaps:this.swapState(),settings:this.settings,revision:this.revision,phase:this.phase});}this.changed();}
 approve(id){if(!this.isHost||this.phase!=='lobby'||(!this.pending.has(id)&&!this.waiters.has(id))||!this.connections.get(id)?.open )return false;const member=this.pending.get(id)||this.waiters.get(id);if(member.spectator){if([...this.waiters.values()].filter(w=>w.spectator&&w.id!==id).length>=8)return false;this.pending.delete(id);this.waiters.set(id,{...member,spectator:true,cabinet:null,needsApproval:false});this.syncConnection(this.connections.get(id));this.publish();return true;}const cabinet=member.cabinet||this.firstOpenSeat();if(!cabinet){member.spectator=true;return this.approve(id);}this.pending.delete(id);this.waiters.delete(id);this.members.push({id:member.id,name:member.name,connection:member.connection,ready:false,cabinet,rtt:null});this.offerMotion(this.connections.get(id));this.recordConnectionEvent('player-admitted',this.connections.get(id),{source:'action'});this.revision++;for(const m of this.members)m.ready=false;const conn=this.connections.get(id);this.syncConnection(conn);this.publish();}
 kick(id){
  const observer=!!this.waiters.get(id)?.spectator;if(!this.isHost||id===this.id||(!observer&&this.phase!=='lobby')||(!observer&&!this.members.some(m=>m.id===id)))return false;
  this.cancelSwapsFor(id);const conn=this.connections.get(id);this.recordConnectionEvent('host-removed-player',conn,{source:'action'});if(conn)this.retainConnection(conn);
  if(conn?.open)this.send(conn,{type:'removed',reason:'The host removed you from this room.'});
  this.connections.delete(id);this.sessions.delete(id);this.pending.delete(id);this.waiters.delete(id);this.members=this.members.filter(m=>m.id!==id);
  this.trimConsoleRecords();if(!observer){this.revision++;for(const m of this.members)m.ready=false;}this.publish();
  if(conn)setTimeout(()=>conn.close(),200);
  return true;
 }
 observeChatScene(id,scene){
  if(!this.active||!this.members.some(m=>m.id===id)||!Number.isInteger(scene)||scene<0||scene>31)return;
  if(this.isHost&&id===this.members[0]?.id){const run=this.environment.run;this.environment.observe(scene);if(this.settings.environment==='cycle'&&this.environment.run!==run)this.broadcastRoom({type:'environment-start',epoch:this.epoch,environment:this.environment.anchor()});}
  if(this.chatScenes.get(id)===scene)return;const before=this.chatAllowed(id);this.chatScenes.set(id,scene);
  if(scene<=10)this.chatLocked.delete(id);else if(scene>=22)this.chatLocked.add(id);
  if(id===this.id&&before!==this.chatAllowed(id)){if(!this.chatAllowed(id))for(const [key,c] of this.commands)if(c.data.type==='chat-submit')this.commands.delete(key);this.changed();}
 }
 chatAllowed(id){if(this.waiters.has(id))return this.isHost?['lobby','preparing','playing'].includes(this.phase):this.phase==='waiting';return this.members.some(m=>m.id===id)&&(this.phase==='lobby'||this.active&&this.chatScenes.has(id)&&!this.chatLocked.has(id));}
 submitChat(value){
  if(!this.members.some(m=>m.id===this.id)&&!this.waiters.has(this.id))throw Error('Chat is available to admitted players only.');
  if(!this.chatAllowed(this.id))throw Error('Chat is paused during the race. It returns in attract mode.');
  const text=chatText(value);if(!text)return false;
  if(text.length>CHAT_LIMIT)throw Error(`Keep your message under ${CHAT_LIMIT} characters.`);
  const now=performance.now();if(now-this.lastChatSent<CHAT_INTERVAL_MS)throw Error('Wait a moment before sending another message.');
  this.lastChatSent=now;
  if(this.isHost)this.acceptChat(this.id,text);else this.command('chat-submit',{text,chatEpoch:this.phase==='waiting'?this.waitEpoch:this.active?this.epoch:''});
  return true;
 }
 acceptChat(id,value){
  const member=this.members.find(m=>m.id===id)||this.waiters.get(id),text=chatText(value),now=performance.now();
  if(!this.isHost||!this.chatAllowed(id)||!member||!text||text.length>CHAT_LIMIT||now-(this.chatRate.get(id)??-Infinity)<CHAT_INTERVAL_MS)return false;
  this.chatRate.set(id,now);
  const message={seq:++this.chatSequence,sender:id,name:member.name,text,time:Date.now()};
  this.chat.push(message);if(this.chat.length>CHAT_HISTORY_LIMIT)this.chat.shift();
  this.broadcastRoom({type:'chat-message',message});this.changed();return true;
 }
 validateChatMessage(m){
  if(!m||!Number.isSafeInteger(m.seq)||m.seq<1||typeof m.sender!=='string'||m.sender.length>100||typeof m.name!=='string'||m.name.length>24||typeof m.text!=='string'||!m.text.length||m.text.length>CHAT_LIMIT||!Number.isFinite(m.time)||m.time<0||m.time>8640000000000000)return null;
  return {seq:m.seq,sender:m.sender,name:cleanName(m.name),text:m.text,time:m.time};
 }
 reject(id,reason='The host declined this request.'){if(!this.isHost||this.phase!=='lobby'||(!this.pending.has(id)&&!this.waiters.has(id)))return false;const conn=this.connections.get(id);if(conn){this.recordConnectionEvent('request-declined',conn,{source:'action'});this.retainConnection(conn);}if(conn?.open){this.send(conn,{type:'reject',reason});setTimeout(()=>conn.close(),200);}this.connections.delete(id);this.sessions.delete(id);this.pending.delete(id);this.waiters.delete(id);this.trimConsoleRecords();this.publish();return true;}
 environmentState(now=performance.now()){const epoch=this.phase==='waiting'?this.waitEpoch:this.epoch;return !this.isHost&&this.environmentEpoch!==epoch?{run:0,elapsed:0}:this.environment.snapshot(now);}
 receiveEnvironmentStart(value,epoch){
  if(this.isHost||!epoch||epoch!==(this.phase==='waiting'?this.waitEpoch:this.epoch)||this.settings.environment!=='cycle')return false;
  if(this.environmentEpoch!==epoch){this.environment.reset();this.environmentEpoch=epoch;}
  return this.environment.receiveStart(value);
 }
 setSettings(value){if(!this.isHost||this.phase!=='lobby')return;this.settings=validateSettings(value);this.revision++;for(const x of this.members)x.ready=false;this.publish();}
 ready(value){if(!this.members.some(m=>m.id===this.id))return;if(this.phase!=='lobby'||this.awaitingStop||(value&&!this.isVisible())||this.snapshot().readyPending||this.snapshot().seatActionPending||this.swapFor(this.id))return;if(this.isHost){this.members.find(m=>m.id===this.id).ready=!!value;this.publish();}else this.command('ready',{value:!!value,revision:this.revision});}
 async start(){
  this.expireSwaps();if(!this.isVisible()||!this.isHost||this.phase!=='lobby'||this.members.length<1||this.pending.size||[...this.waiters.values()].some(w=>!w.spectator)||this.swaps.size||this.members.some(x=>!x.ready||x.connection==='reconnecting'))return;
  this.phase='preparing';this.progressFrames=0;this.epoch=token();this.environment.reset();this.prepared.clear();this.prepareDeadline=performance.now()+60000;this.error='';
  const motionPeers=[];for(const member of this.members){if(member.id===this.id)continue;const c=this.connections.get(member.id);if(!c)continue;c.raceMotion=!!c.motion?.ready;c.motionEpoch=this.epoch;if(c.raceMotion)motionPeers.push({id:member.id,nonce:c.motion.nonce});}
  const data={type:'prepare',diagnostics:this.diagnosticsPolicy(),epoch:this.epoch,members:this.members,settings:this.settings,revision:this.revision,motionPeers};this.broadcast(data);this.publish();if(this.waiters.get(this.id)?.spectator){this.tryGo();return;}await this.prepare(data);
 }
 async prepare(data){
  this.settings=validateSettings(data.settings);if(!this.isHost)this.applyDiagnosticsPolicy(data.diagnostics);if(!/^[a-f0-9]{32}$/.test(data.epoch))throw Error('Invalid race session.');
  this.members=this.validateMembers(data.members,data.waiters??[...this.waiters.values()]);this.epoch=data.epoch;this.progressFrames=0;this.environment.reset();this.phase='preparing';this.chatScenes.clear();this.chatLocked.clear();this.changed();if(!this.isVisible()){this.end(INACTIVE_REASON,this.id,'visibility-interruption');return;}const generation=this.generation,epoch=this.epoch;
  const me=this.members.find(x=>x.id===this.id);if(!me)throw Error('This cabinet is not in the race.');
  if(data.motionPeers!==undefined&&(!Array.isArray(data.motionPeers)||data.motionPeers.length>8||new Set(data.motionPeers.map(m=>m?.id)).size!==data.motionPeers.length||data.motionPeers.some(m=>!m||m.id===this.host||!this.members.some(p=>p.id===m.id)||!/^[a-f0-9]{32}$/.test(m.nonce))))throw Error('Invalid movement roster.');
  if(!this.isHost){const choice=data.motionPeers?.find(p=>p.id===this.id);if(choice&&(!this.server?.motion?.open||choice.nonce!==this.server.motion.nonce))throw Error('Movement channel was not ready. Return to the room and try again.');this.server.raceMotion=!!choice;this.server.motionEpoch=this.epoch;}
  try{await this.onPrepare({...this.settings,master:this.id===this.members[0]?.id,cabinet:me.cabinet},()=>generation!==this.generation||this.epoch!==epoch||this.phase!=='preparing');
   if(generation!==this.generation||this.epoch!==epoch||this.phase!=='preparing')return;
   if(this.isHost){this.prepared.add(this.id);this.tryGo();}else this.send(this.server,{type:'prepared',epoch:this.epoch,revision:this.revision});
  }catch(e){if(generation!==this.generation||this.epoch!==epoch||this.phase!=='preparing')return;if(this.isHost)this.end(e.message,this.id,'prepare-failed');else this.send(this.server,{type:'prepare-failed',epoch:this.epoch,reason:e.message});}
 }
 tryGo(){if(this.phase==='preparing'&&this.members.every(x=>this.prepared.has(x.id))){this.broadcast({type:'go',epoch:this.epoch});this.go();}}
 go(){
  if(!this.isVisible()){this.end(INACTIVE_REASON,this.id,'visibility-interruption');return;}
  const now=performance.now();this.progressFrames=0;this.progressAt=now;
  for(const conn of this.isHost?this.members.filter(m=>m.id!==this.id).map(m=>this.connections.get(m.id)):[this.server])if(conn){conn.lastStateAt=null;conn.latestSnapshot=null;conn.motionReceived=null;conn.emulation={epoch:this.epoch,frames:0,at:now};conn.snapshotFlow=this.newSnapshotFlow(conn);}
  if(this.isHost)this.performanceHistory.beginRace(this.epoch,this.members);
  this.distributor=this.isHost?new HostDistributor(this.members):null;this.raceAuthority=this.isHost?new HostRaceAuthority(this.epoch,this.members,this.settings):null;this.raceInbox=new RaceOrderInbox(this.epoch,this.members);this.raceDeliveries.clear();this.stateSequence=0;this.phase='playing';for(const c of this.isHost?this.members.filter(m=>m.id!==this.id).map(m=>this.connections.get(m.id)):[this.server])if(c)this.recordConnectionEvent(c.raceMotion?'motion-active':'motion-legacy',c);if(!this.waiters.get(this.id)?.spectator)this.onStart();this.changed();
 }
 reportRace(report){
  if(!this.active||!report)return;
  const now=performance.now();
  if(this.isHost){for(const value of [...(Array.isArray(report.previous)?report.previous.slice(-8):[]),report])this.raceAuthority?.observe(this.id,value,now,(at,uncertainty)=>({at,uncertainty}));this.publishRaceOrders(now);}
  else if(this.server?.open&&(this.server.dataChannel?.bufferedAmount||0)<16384)this.send(this.server,{type:'race-progress',epoch:this.epoch,report});
 }
 receiveRaceReport(conn,report){
  const now=performance.now();
  const anchor=conn.clockSync?.age(report?.at,now,750);
  const previous=Array.isArray(report?.previous)?report.previous.slice(-8).filter(r=>r&&r.run<report.run&&r.at<=report.at):[];
  for(const value of [...previous,report])this.raceAuthority?.observe(conn.peer,value,now,(at,uncertainty)=>anchor?{at:now-anchor.ageMs-(report.at-at),uncertainty:uncertainty+anchor.uncertaintyMs+Math.abs(report.at-at)*.0002}:null);
  this.publishRaceOrders(now);
 }
 publishRaceOrders(now=performance.now()){
  if(!this.active||!this.isHost)return;
  for(const order of this.raceAuthority?.poll(now)||[]){
   this.raceInbox.receive(order);this.retainRaceOrder(order);this.onRaceOrder(order);
   for(const member of this.members)if(member.id!==this.id)this.raceDeliveries.set(member.id+':'+order.race,{peer:member.id,order,sentAt:-Infinity,acked:false});
  }
  this.flushRaceOrders(now);
 }
 flushRaceOrders(now=performance.now()){
  if(!this.active||!this.isHost)return;
  for(const delivery of this.raceDeliveries.values()){
   const conn=this.connections.get(delivery.peer);if(delivery.acked||now-delivery.sentAt<1000||!conn?.open||(conn.dataChannel?.bufferedAmount||0)>=16384)continue;
   this.send(conn,{type:'race-order',epoch:this.epoch,order:delivery.order});delivery.sentAt=now;
  }
 }
 retainRaceOrder(order){
  const group=this.raceAuthority?.groups.find(g=>g.id===order.race);
  const evidence=group?[...group.tracks.values()].map(t=>({id:t.id,run:t.run,car:t.car,terminal:t.terminal,finish:t.finish?{...t.finish}:null,lastAtMs:t.last?.at,lastUncertaintyMs:t.last?.uncertainty,lastNativeClock:t.last?.clock,lastNativeLap:t.last?.lap,lastProgress:t.last?.progress})):null;
  this.raceHistory.set(order.race,{...structuredClone(order),roster:this.members.map(m=>({id:m.id,name:m.name,cabinet:m.cabinet})),...(evidence?{evidence}:{})});while(this.raceHistory.size>16)this.raceHistory.delete(this.raceHistory.keys().next().value);
 }
 raceOrderFor(id,run){return this.raceInbox?.forPlayer(id,run)??null;}
 advance(){if(this.active){this.progressFrames++;this.progressAt=performance.now();}}
 visibilityChanged(){if(!this.isVisible()&&(this.active||this.phase==='preparing')){this.recordConnectionEvent('visibility-interruption');this.end(INACTIVE_REASON,this.id,'visibility-interruption');}}
 checkProgress(now=performance.now()){
  if(!this.active)return;
  const connections=this.isHost?this.members.filter(m=>m.id!==this.id).map(m=>this.connections.get(m.id)):[this.server];
  if(!this.waiters.get(this.id)?.spectator&&now-this.progressAt>PROGRESS_TIMEOUT_MS){this.recordConnectionEvent('local-progress-timeout');this.end(INACTIVE_REASON,this.id,'local-progress-timeout');return;}
  const stalled=connections.find(c=>c?.emulation?.epoch===this.epoch&&now-c.emulation.at>PROGRESS_TIMEOUT_MS);
  if(stalled){
   const member=this.members.find(m=>m.id===stalled.peer);
   const label=member?`${cleanName(member.name)} (cabinet ${member.cabinet})`:'the remote cabinet';
   this.recordConnectionEvent('remote-progress-timeout',stalled);this.end(`No emulation progress from ${label}. Return to the room and start again.`,stalled.peer,'remote-progress-timeout');
  }
 }

 validateMembers(members,waiting=[...this.waiters.values()]){const observingHost=Array.isArray(waiting)&&waiting.some(w=>w?.id===this.host&&w.spectator===true&&!w.needsApproval);if(!Array.isArray(members)||members.length>8||(!observingHost&&members[0]?.id!==this.host)||(observingHost&&members.some(m=>m?.id===this.host))||members.some(x=>!x)||new Set(members.map(x=>x.id)).size!==members.length||members.some(x=>!x||typeof x.id!=='string'||!Number.isInteger(x.cabinet)||x.cabinet<1||x.cabinet>8)||new Set(members.map(x=>x.cabinet)).size!==members.length)throw Error('Invalid cabinet roster.');validateSkinRoster(members);return members.map(x=>({id:x.id,name:cleanName(x.name),cabinet:x.cabinet,skin:x.skin??0,ready:!!x.ready,rtt:!this.isHost&&x.id===this.host&&this.server?.open&&Number.isFinite(this.server.measuredRttMs)?Math.round(this.server.measuredRttMs):Number.isFinite(x.rtt)?x.rtt:null,connection:x.connection==='reconnecting'?'reconnecting':'connected'}));}
 handle(conn,data,incoming,motion=false){
  if(this.spectators?.handle(conn,data))return;
  if(!data||typeof data.type!=='string')throw Error('Invalid room message.');
  if(['arcade-sample','arcade-state','arcade-ack'].includes(data.type)&&!!conn.raceMotion!==motion)return;
  if(!incoming||this.members.some(m=>m.id===conn.peer))this.observeRemoteFrames(conn,data);
  if(data.motionReceipt)this.receiveMotionReceipt(conn,data.motionReceipt);
  if(data.type==='motion-offer'&&!incoming){
   if(this.movementMode==='reliable'||!['connecting','pending','waiting','lobby'].includes(this.phase)||conn.motion)return;
   if(data.version!==MOTION_VERSION||!Number.isInteger(data.id)||data.id<0||data.id>=65535||!/^[a-f0-9]{32}$/.test(data.nonce))return;
   try{this.installMotion(conn,data,false);}catch{try{this.send(conn,{type:'motion-unavailable',nonce:data.nonce});}catch{}this.recordConnectionEvent('motion-unavailable',conn);}return;
  }
  if(data.type==='motion-ready'&&incoming){if(data.version===MOTION_VERSION&&conn.motion?.nonce===data.nonce&&!conn.motion.disposed){conn.motion.remoteReady=true;conn.motionDeadline=0;}return;}
  if(data.type==='motion-unavailable'&&incoming){if(conn.motion?.nonce===data.nonce)this.fallbackMotion(conn,'Movement channel unsupported.');return;}
  if(data.type==='motion-fallback'){if(this.epoch&&data.epoch===this.epoch&&data.nonce===conn.motion?.nonce)this.fallbackMotion(conn,'Remote movement fallback.',{notify:false});return;}
  if(data.type==='ping'){const clockReceived=performance.now();this.receiveHealth(conn,data);const performanceAck=this.receivePerformance(conn,data);this.send(conn,{type:'pong',time:data.time,clockReceived,clockSent:performance.now(),...(conn.raceMotion&&conn.motionReceived?{motionReceipt:this.makeMotionReceipt(conn)}:{}),epoch:this.epoch,frames:this.active?this.progressFrames:0,...(this.isHost?{performanceAck}:{})});return;}
  if(data.type==='pong'){const now=performance.now();(conn.clockSync??=new LinkClock()).observe(data.time,data.clockReceived,data.clockSent,now);if(!this.isHost&&this.server===conn&&Number.isSafeInteger(data.performanceAck)&&data.performanceAck>this.performanceAck&&data.performanceAck<=this.performanceOffered)this.performanceAck=data.performanceAck;if(Number.isFinite(data.time)){const member=this.members.find(x=>x.id===conn.peer);conn.measuredRttMs=Math.max(0,now-data.time);if(member)member.rtt=Math.round(conn.measuredRttMs);}return;}
  if(data.type==='arcade-ack'){
   if(!this.active||data.epoch!==this.epoch||!conn.snapshotFlow||conn.snapshotFlow.epoch!==this.epoch)return;
   if(incoming?this.connections.get(conn.peer)!==conn:this.server!==conn)return;
   if(data.kind!==(this.isHost?'arcade-state':'arcade-sample'))throw Error('Invalid snapshot acknowledgment kind.');
   if(conn.snapshotFlow.acknowledge(data.delivery))this.flushSnapshot(conn);return;
  }
  if(incoming){
   if(this.connections.get(conn.peer)!==conn)return;
   if(data.type==='leave'){this.receivePerformance(conn,data);this.recordConnectionEvent('player-left',conn,{source:'action'});this.detach(conn,true,'The player left the room.',false,'player-left','action');conn.close();return;}
   const member=this.members.find(x=>x.id===conn.peer),waiter=this.waiters.get(conn.peer);if(!member&&!(waiter&&['chat-submit','set-role'].includes(data.type)))return;
   if(['ready','chat-submit','move-seat','swap-request','swap-answer','swap-cancel','set-skin','set-role'].includes(data.type)){
    const session=this.sessions.get(conn.peer),saved=session?.commands.get(data.command);if(saved){this.send(conn,saved);return;}
    if((data.command!==undefined||data.type.startsWith('swap-'))&&(!Number.isSafeInteger(data.command)||data.command<1))throw Error('Invalid lobby action.');
    if(data.command!==undefined&&data.command<=(session?.lastCommand||0)){this.acknowledge(conn,data,false,'This action has expired.');return;}
    if(data.type==='set-role'){const reason=this.assignRole(conn.peer,data.role,data.cabinet);this.acknowledge(conn,data,!reason,reason);}else if(data.type==='ready'){const valid=this.phase==='lobby'&&data.revision===this.revision&&!this.swapFor(conn.peer); if(valid){member.ready=!!data.value;this.publish();}this.acknowledge(conn,data,valid,valid?'':'Room settings changed. Please confirm Ready again.');if(!valid&&this.phase==='lobby')this.syncConnection(conn);}
    else if(data.type==='set-skin'){const reason=this.skinChangeError(conn.peer,data.skin,data.revision);if(!reason)this.assignSkin(member,data.skin);this.acknowledge(conn,data,!reason,reason);if(reason&&this.phase==='lobby')this.syncConnection(conn);}
    else if(data.type==='move-seat'){const reason=this.seatChangeError(conn.peer,data.cabinet,data.revision);if(!reason)this.assignSeat(member,data.cabinet);this.acknowledge(conn,data,!reason,reason);if(reason&&this.phase==='lobby')this.syncConnection(conn);}
    else if(data.type.startsWith('swap-')){const reason=data.type==='swap-request'?this.createSwap(conn.peer,data.target,data.revision):data.type==='swap-answer'?this.acceptSwapAnswer(conn.peer,data.id,data.accept):this.acceptSwapCancel(conn.peer,data.id);this.acknowledge(conn,data,!reason,reason);if(reason&&this.phase==='lobby')this.syncConnection(conn);}
    else{const valid=(waiter?data.chatEpoch===this.epoch:!this.active||data.chatEpoch===this.epoch)&&this.acceptChat(conn.peer,data.text);this.acknowledge(conn,data,valid,valid?'':'Chat is paused during the race or the message could not be sent.');}
   }
   else if(data.type==='prepared'&&this.phase==='preparing'&&data.epoch===this.epoch&&data.revision===this.revision){this.prepared.add(conn.peer);this.tryGo();}
   else if(data.type==='prepare-failed'&&this.phase==='preparing'&&data.epoch===this.epoch)this.end('The cabinet could not prepare: '+String(data.reason).slice(0,160),conn.peer,'prepare-failed','reported');
   else if(data.type==='stop'&&(this.active||this.phase==='preparing')&&data.epoch===this.epoch){
    // The connection identifies the requester; clients cannot name another cabinet.
    this.receiveHealth(conn,data);this.receivePerformance(conn,data);this.end(String(data.reason||'The cabinet stopped.').slice(0,180),conn.peer,STOP_CAUSES.includes(data.cause)?data.cause:'requested-stop','reported');
   }
   else if(data.type==='race-progress'&&this.active&&data.epoch===this.epoch)this.receiveRaceReport(conn,data.report);
   else if(data.type==='race-order-ack'&&this.active&&data.epoch===this.epoch){const delivery=this.raceDeliveries.get(conn.peer+':'+data.race);if(delivery?.order.revision===data.revision)delivery.acked=true;}
   else if(data.type==='arcade-sample'&&this.active&&data.epoch===this.epoch){const timing=sourceTiming(conn.clockSync,data.publication,performance.now());if(this.distributor.accept(conn.peer,data.frames,data.bytes,timing)){this.observeChatScene(conn.peer,new Uint8Array(data.bytes)[28]);conn.lastStateAt=performance.now();(motion?conn.motion?.probe:conn.transportProbe)?.stateReceived(timing);if(this.waiters.get(this.id)?.spectator&&conn.peer===this.members[0]?.id){this.progressFrames=data.frames;this.progressAt=performance.now();this.distributeState();}}this.acknowledgeSnapshot(conn,data,motion);}
  }else{
   if(this.server!==conn)return;
   if(data.type==='environment-start'){this.receiveEnvironmentStart(data.environment,data.epoch);return;}
   if(data.type==='diagnostics-policy'){if(this.applyDiagnosticsPolicy(data.diagnostics))this.changed();return;}
   if(data.type==='command-ack'){
    if(this.commands.delete(data.command)){this.lastAck={...data};this.changed();}return;
   }
   if(data.type==='swap-result'){this.swapNotice=String(data.message||'').slice(0,200);this.changed();return;}
   if(data.type==='room-sync'){
    if(!Number.isSafeInteger(data.sequence)||data.sequence<=this.lastLobbySequence)return;
    const settings=validateSettings(data.settings),members=data.admitted||data.waiting?this.validateMembers(data.members,data.waiters??[...this.waiters.values()]):[],waiters=this.validateWaiters(data.waiters,members);
    if(data.waiting&&(data.admitted||!waiters.has(this.id)))throw Error('Missing waiting identity.');
    if(data.admitted&&!members.some(m=>m.id===this.id))throw Error('Missing session identity.');
    const chat=Array.isArray(data.chat)?data.chat.slice(-CHAT_HISTORY_LIMIT).map(m=>this.validateChatMessage(m)).filter(Boolean):[];
    this.visibility=data.visibility==='public'?'public':'private';this.roomName=String(data.roomName||'').slice(0,48);this.applyDiagnosticsPolicy(data.diagnostics);this.lastLobbySequence=data.sequence;this.revision=data.revision;this.settings=settings;this.members=members;this.waiters=waiters;this.waitEpoch=data.waiting?String(data.epoch||''):'';this.remotePhase=String(data.phase||'');this.applySwaps(data.admitted?data.swaps:[]);this.chat=data.admitted||data.waiting?chat:[];
    this.reconnectUntil=0;this.retryAt=0;this.retryAttempt=0;this.awaitingStop=false;this.phase=data.admitted?'lobby':data.waiting?'waiting':'pending';if(data.phase==='playing')this.receiveEnvironmentStart(data.environment,data.epoch);this.error=String(data.reason||'').slice(0,280);
    for(const [id,command] of this.commands){if(command.data.type==='ready')this.commands.delete(id);else command.at=-Infinity;}this.changed();return;
   }
   if(data.type==='pending'){this.phase='pending';this.changed();}
   else if(data.type==='room-closed'){this.detach(conn,false,'The host closed the room.',false);conn.close();}
   else if(data.type==='reject'){this.detach(conn,false,String(data.reason).slice(0,180),false);conn.close();}
   else if(data.type==='welcome'){this.phase='lobby';this.error='';this.changed();}
   else if(data.type==='removed'){this.leave();this.phase='error';this.error='The host removed you from this room.';this.changed();}
   else if(data.type==='chat-history'&&this.phase==='lobby'&&Array.isArray(data.messages)){
    const messages=data.messages.slice(-CHAT_HISTORY_LIMIT).map(m=>this.validateChatMessage(m)).filter(Boolean);
    this.chat=messages.filter((m,i)=>i===0||m.seq>messages[i-1].seq);this.changed();
   }
   else if(data.type==='chat-message'&&['lobby','playing','preparing','waiting'].includes(this.phase)){
    const message=this.validateChatMessage(data.message);
    if(message&&message.seq>(this.chat.at(-1)?.seq??0)){this.chat.push(message);if(this.chat.length>CHAT_HISTORY_LIMIT)this.chat.shift();this.changed();}
   }
   else if(data.type==='roster'){if(!Number.isSafeInteger(data.sequence)||data.sequence<=this.lastLobbySequence)return;this.visibility=data.visibility==='public'?'public':'private';this.roomName=String(data.roomName||'').slice(0,48);this.applyDiagnosticsPolicy(data.diagnostics);this.lastLobbySequence=data.sequence;if(this.awaitingStop&&data.phase==='lobby')this.awaitingStop=false;this.members=this.validateMembers(data.members,data.waiters??[...this.waiters.values()]);this.waiters=this.validateWaiters(data.waiters,this.members);if(this.waiters.has(this.id)){this.phase='waiting';this.waitEpoch=String(data.epoch||'');this.remotePhase=String(data.phase||'');}else if(this.phase==='waiting'&&this.members.some(m=>m.id===this.id)){this.phase='lobby';this.waitEpoch='';this.remotePhase='';}this.applySwaps(data.swaps);this.settings=validateSettings(data.settings);this.revision=data.revision;this.changed();}
   else if(data.type==='prepare'&&this.phase==='lobby'){this.revision=data.revision;void this.prepare(data).catch(e=>this.end(e.message,this.id,'prepare-failed'));}
   else if(data.type==='go'&&this.phase==='preparing'&&data.epoch===this.epoch)this.go();
   else if(data.type==='stop'&&(data.epoch===this.epoch||(this.awaitingStop&&data.epoch===this.endedEpoch)))this.stopLocal(String(data.reason||'The arcade link stopped.').slice(0,280));
   else if(data.type==='race-order'&&this.active&&data.epoch===this.epoch){
    const order=validateRaceOrder(data.order,this.epoch,this.members);if(!order)return;
    if(this.raceInbox.receive(order)){this.retainRaceOrder(order);this.onRaceOrder(order);}
    if((conn.dataChannel?.bufferedAmount||0)<32768)this.send(conn,{type:'race-order-ack',epoch:this.epoch,race:order.race,revision:order.revision});
   }
   else if(data.type==='arcade-state'&&this.active&&data.epoch===this.epoch){
    if(data.encoding!==undefined&&data.encoding!=='cabinet-slots')throw Error('Invalid state encoding.');
    const bytes=data.encoding==='cabinet-slots'?expandState(data.bytes,this.members.length):data.bytes;
    if(!Number.isSafeInteger(data.sequence)||data.sequence<1||!(bytes instanceof ArrayBuffer)||bytes.byteLength!==STATE_BYTES||new Uint8Array(bytes)[0]!==STATE_TAG)throw Error('Invalid centralized state.');
    if(data.sequence>this.stateSequence){this.stateSequence=data.sequence;const transit=conn.clockSync?.age(data.timing?.at,performance.now())??null;const timing=receivedTiming(data.timing,this.members.length,transit);(motion?conn.motion?.probe:conn.transportProbe)?.stateReceived(timing);this.receiveBytes(bytes,timing);}this.acknowledgeSnapshot(conn,data,motion);
   }
  }
 }
 observeNativeDelivery(pending,now=performance.now()){this.nativeDelivery.nativeApplied(pending,now);}
 receiveBytes(bytes,timing=null){if(!(bytes instanceof ArrayBuffer)||bytes.byteLength<1||bytes.byteLength>4096)throw Error('Invalid arcade packet.');this.onBytes(new Uint8Array(bytes),timing);}
 write(bytes,publication=null){
  if(!this.active)return;
  const data={type:'arcade-sample',epoch:this.epoch,frames:this.progressFrames,publication,bytes:bytes.slice().buffer};
  try{
   if(!this.isHost){this.sendSnapshot(this.server,data);return;}
   const now=performance.now(),age=publication&&Number.isFinite(publication.at)&&now>=publication.at?{ageMs:now-publication.at,uncertaintyMs:publication.uncertaintyMs}:null;
   if(!this.distributor.accept(this.id,data.frames,data.bytes,age)||!this.distributor.ready)return;
   this.distributeState();
  }catch(e){this.end(e.message,e.linkPeer||this.id,e.linkCause||'receive-error');}
 }
 distributeState(){
  if(!this.distributor?.ready)return;const sequence=++this.distributor.sequence;
   for(const member of this.members){
    const state=this.distributor.snapshot(member.id),timing=this.distributor.timing(member.id);
    if(member.id===this.id)this.receiveBytes(state,receivedTiming(timing,this.members.length,{ageMs:0,uncertaintyMs:0}));
    else this.sendSnapshot(this.connections.get(member.id),{type:'arcade-state',epoch:this.epoch,frames:this.progressFrames,sequence,encoding:'cabinet-slots',bytes:compactState(state,this.members.length),timing});
   }
 }
 setRole(role,cabinet){
  if(!['driver','spectator'].includes(role)||this.snapshot().rolePending)return false;
  if(this.isHost){const reason=this.assignRole(this.id,role,cabinet);if(reason){this.error=reason;this.changed();return false;}return true;}
  if(!this.server?.open||!['lobby','waiting'].includes(this.phase))return false;
  this.command('set-role',{role,...(cabinet!==undefined?{cabinet}:{})});return true;
 }
 assignRole(id,role,requested){
  if(!this.isHost||!['driver','spectator'].includes(role))return 'Invalid room role.';
  const member=this.members.find(m=>m.id===id),waiting=this.waiters.get(id),person=member||waiting;
  if(!person||waiting?.needsApproval)return 'Wait for host approval.';
  if(role==='spectator'){
   if(waiting?.spectator)return '';
   if(member&&this.phase!=='lobby')return 'You can release your seat after returning to the lobby.';
   if([...this.waiters.values()].filter(w=>w.spectator).length>=8)return 'All spectator places are occupied.';
   this.cancelSwapsFor(id);this.members=this.members.filter(m=>m.id!==id);
   this.waiters.set(id,{id,name:person.name,spectator:true,cabinet:null,needsApproval:false,connection:'connected'});
  }else{
   if(member||waiting&&!waiting.spectator)return '';
   if(id===this.host&&this.phase!=='lobby')return 'Return everyone to the lobby before taking a host seat.';
   if(!['lobby','playing','preparing'].includes(this.phase))return 'Wait for the room to reconnect.';
   const cabinet=requested===undefined?this.firstOpenSeat():requested;
   if(!Number.isInteger(cabinet)||cabinet<1||cabinet>8||this.members.some(m=>m.cabinet===cabinet)||[...this.waiters.values()].some(w=>!w.spectator&&w.cabinet===cabinet))return 'That seat is no longer available. Choose another.';
   this.waiters.delete(id);
   if(this.phase==='lobby'){
    const driver={id,name:person.name,cabinet,skin:0,ready:false,connection:'connected',rtt:null};
    if(id===this.host)this.members.unshift(driver);else this.members.push(driver);
    if(id!==this.id)this.offerMotion(this.connections.get(id));
   }else this.waiters.set(id,{id,name:person.name,cabinet,needsApproval:false,spectator:false,connection:'connected'});
  }
  if(this.phase==='lobby'){this.revision++;for(const m of this.members)m.ready=false;}
  if(id!==this.id&&this.connections.get(id)?.open)this.syncConnection(this.connections.get(id));this.publish();return '';
 }
 stopLocal(reason){this.raceAuthority=null;this.raceInbox=null;this.raceDeliveries.clear();const hadSession=this.active||this.phase==='preparing';this.clearSnapshots();if(this.epoch)this.endedEpoch=this.epoch;this.distributor=null;this.stateSequence=0;this.awaitingStop=false;this.epoch='';this.phase='lobby';this.error=reason;for(const x of this.members)x.ready=false;if(hadSession)this.onStop(reason);if(this.isHost){for(const w of [...this.waiters.values()])if(!w.spectator&&!w.needsApproval&&this.connections.get(w.id)?.open)this.approve(w.id);for(const w of this.waiters.values()){const c=this.connections.get(w.id);if(c?.open)this.syncConnection(c);}}this.changed();}
 end(reason='The arcade session ended.',cabinet=this.id,cause='requested-stop',source='observed'){
  cause=STOP_CAUSES.includes(cause)?cause:'requested-stop';
  const member=typeof cabinet==='string'?this.members.find(m=>m.id===cabinet):cabinet;
  const detail=String(reason).slice(0,180);this.recordConnectionEvent('session-stop',typeof cabinet==='string'?this.connections.get(cabinet):null,{member,source,cause,reason:detail});
  const message=member?`Session interrupted by ${cleanName(member.name)} (cabinet ${member.cabinet}). ${detail}`:detail;
  if(this.isHost){try{this.broadcast({type:'stop',epoch:this.epoch,reason:message});}catch{}this.stopLocal(message);this.publish();}
  else{const hadSession=!!this.epoch;try{if(hadSession)this.send(this.server,{type:'stop',epoch:this.epoch,reason:detail,cause,health:this.makeHealth(),performance:this.makePerformance()});}catch{}this.stopLocal(message);this.awaitingStop=hadSession;this.changed();}
 }
 heartbeat(now=performance.now()){
  this.expireSwaps(now);if(this.active&&this.isHost)this.publishRaceOrders(now);
  const health=this.makeHealth(now),performanceData=this.makePerformance();
  if(!this.signaling&&this.peer&&!this.peer.destroyed&&now>=this.signalRetryAt){this.signalRetryAt=now+retryDelay(this.signalAttempt++);if(this.peer.disconnected)try{this.peer.reconnect();}catch{}}
  if(this.phase==='reconnecting'){
   if(this.peer?.destroyed||now>this.reconnectUntil){const conn=this.server;this.server=null;this.failRoom('Could not reconnect. Return to room selection and try again.');try{conn?.close();}catch{}return;}
   if(!this.server&&now>=this.retryAt)this.connectHost();
  }
  if(this.isHost){for(const [id,session] of this.sessions)if(session.until&&now>session.until){const m=this.members.find(m=>m.id===id)||this.pending.get(id)||this.waiters.get(id);this.recordConnectionEvent('recovery-expired',null,{member:m});this.forget(id,'The reconnection window expired.');}}
  if((this.phase==='lobby'||this.phase==='waiting'||this.active)&&!this.isHost&&this.server?.open)for(const command of this.commands.values())if(now-command.at>=2000&&(this.phase==='lobby'||command.data.type==='set-role'||command.data.type==='chat-submit'&&this.chatAllowed(this.id))){command.at=now;try{this.send(this.server,command.data);}catch{this.detach(this.server,false);break;}}
  this.checkProgress(now);if(this.isHost&&this.phase==='preparing'&&now>this.prepareDeadline){this.recordConnectionEvent('preparation-timeout');this.end('Cabinet preparation timed out.',this.id,'preparation-timeout');return;}
  const connections=this.isHost?[...this.connections.values()]:[this.server].filter(Boolean);
  if(this.active){const stalled=connections.find(conn=>conn?.snapshotFlow?.ackProgressAgeMs(now)>PROGRESS_TIMEOUT_MS);if(stalled){this.recordConnectionEvent('snapshot-ack-timeout',stalled);this.end('No arcade snapshot acknowledgment progress for 10 seconds. Return to the room and start again.',stalled.peer,'snapshot-ack-timeout');return;}}
  for(const conn of connections){
   if(conn.motionDeadline&&now>conn.motionDeadline&&!conn.motion?.ready){conn.motionDeadline=0;this.recordConnectionEvent('motion-timeout',conn);this.fallbackMotion(conn,'Movement negotiation timed out.');}
   if(!conn.open){if(!conn.wasOpened&&conn.openingUntil>now)continue;const opening=!!conn.openingUntil&&!conn.wasOpened;this.recordConnectionEvent(opening?'opening-timeout':'channel-not-open',conn);this.detach(conn,this.isHost,opening?'The data channel did not open within 30 seconds.':'The connection closed.');try{conn.close();}catch{}continue;}
   if(now-conn.lastSeen>CONNECTION_TIMEOUT_MS){this.recordConnectionEvent('silence-timeout',conn);this.detach(conn,this.isHost,'No response for 20 seconds.');try{conn.close();}catch{}continue;}
   try{this.flushSnapshot(conn);const share=!this.isHost&&performanceData&&(conn.dataChannel?.bufferedAmount||0)<16*1024?performanceData:null;(conn.clockSync??=new LinkClock()).sent(now);this.send(conn,{type:'ping',time:now,...(conn.raceMotion&&conn.motionReceived?{motionReceipt:this.makeMotionReceipt(conn)}:{}),epoch:this.epoch,frames:this.active?this.progressFrames:0,...(!this.isHost?{health,...(share?{performance:share}:{})}:{})});if(share)this.performanceOffered=Math.max(this.performanceOffered,share.samples.at(-1).sequence);}catch(e){this.detach(conn,this.isHost,e.message);try{conn.close();}catch{}}
  }
  if(this.isHost&&['lobby','playing'].includes(this.phase))this.publish();else this.changed();
 }
 diagnostics(){
  const connections=(this.isHost?[...this.connections.values()]:[this.server]).filter(c=>c?.open);
  for(const c of connections){c.transportProbe?.add('buffered',c.dataChannel?.bufferedAmount||0);c.motion?.probe.add('buffered',c.motion.channel.bufferedAmount||0);}
  const rtts=connections.map(c=>this.networkStats.get(c)?.rttMs??c.measuredRttMs).filter(Number.isFinite);
  return {topology:'central',central:this.distributor?{samples:this.distributor.samples.size,sequence:this.distributor.sequence,discarded:this.distributor.discarded,agesMs:this.members.map(m=>({cabinet:m.cabinet,ageMs:this.distributor.samples.has(m.id)?performance.now()-this.distributor.samples.get(m.id).at:null}))}:null,connections:connections.length,rttMs:rtts.length?Math.max(...rtts):null,
   bufferedBytes:connections.reduce((sum,c)=>sum+this.movementBuffered(c),0),
   payloadSentBytes:this.payloadSent,payloadReceivedBytes:this.payloadReceived,
   sent:timingSummary(this.sentTiming),received:timingSummary(this.receivedTiming),
   snapshotFlow:connections.map(c=>({cabinet:this.members.find(m=>m.id===c.peer)?.cabinet??null,...(c.snapshotFlow?.snapshot()||{inFlight:0,pending:0,pendingBytes:0,coalesced:0,ackRttMs:null})})),
   nativeDelivery:this.nativeDelivery.snapshot(),motion:connections.filter(c=>c.motion).map(c=>({cabinet:this.members.find(m=>m.id===c.peer)?.cabinet??null,mode:c.raceMotion?'latest':c.motion.ready?'available':'reliable',state:c.motion.channel.readyState,invalidMessages:c.motion.invalidMessages,...c.motion.probe.snapshot()})),transport:connections.map(c=>({cabinet:this.members.find(m=>m.id===c.peer)?.cabinet??null,...c.transportProbe?.snapshot()})),relayConnections:connections.filter(c=>this.networkStats.get(c)?.relay).length,connectionEvents:this.connectionEvents.map(e=>({...e}))};
 }
 async pollDiagnostics(){
  if(!this.performanceCaptureEnabled)return;
  const generation=this.generation;
  const connections=(this.isHost?[...this.connections.values()]:[this.server]).filter(c=>c?.open);
  const next=new Map();
  await Promise.all(connections.map(async conn=>{
   try{if(!conn.peerConnection?.getStats)return;const stats=await conn.peerConnection.getStats();
    let pair;for(const value of stats.values())if(value.type==='transport'&&value.selectedCandidatePairId)pair=stats.get(value.selectedCandidatePairId);
    if(!pair)for(const value of stats.values())if(value.type==='candidate-pair'&&value.nominated&&value.state==='succeeded')pair=value;
    if(pair){const local=stats.get(pair.localCandidateId),remote=stats.get(pair.remoteCandidateId);
     for(const [dc,probe] of [[conn.dataChannel,conn.transportProbe],[conn.motion?.channel,conn.motion?.probe]]){if(!dc||!probe)continue;
      const channel=[...stats.values()].find(value=>value.type==='data-channel'&&value.dataChannelIdentifier===dc.id);
      probe.browserStats({browserRttMs:Number.isFinite(pair.currentRoundTripTime)?pair.currentRoundTripTime*1000:null,...Object.fromEntries([['browserDataTxBytes',channel?.bytesSent],['browserDataRxBytes',channel?.bytesReceived],['browserDataTxMessages',channel?.messagesSent],['browserDataRxMessages',channel?.messagesReceived],['browserIceTxBytes',pair.bytesSent],['browserIceRxBytes',pair.bytesReceived],['browserIceTxPackets',pair.packetsSent],['browserIceRxPackets',pair.packetsReceived]].filter(([,v])=>Number.isFinite(v)&&v>=0))});
     }
     next.set(conn,{at:performance.now(),rttMs:Number.isFinite(pair.currentRoundTripTime)?pair.currentRoundTripTime*1000:null,relay:local?.candidateType==='relay'||remote?.candidateType==='relay'});
    }
   }catch{} // Stats are optional; never interrupt the arcade link.
  }));
  if(this.performanceCaptureEnabled&&generation===this.generation)this.networkStats=new Map([...next].filter(([c])=>c.open&&(this.isHost?this.connections.get(c.peer)===c:this.server===c)));
 }
 leave({unloading=false}={}){
  this.spectators?.close();
  clearTimeout(this.motionTimer);this.motionTimer=null;this.motionDue=0;
  const hadSession=this.active||this.phase==='preparing';
  if(this.isHost&&this.members.length&&!unloading){this.recordConnectionEvent('room-closed',null,{source:'action'});this.lastHostReport={...this.consoleSnapshot(),live:false,phase:'closed'};this.lastHostReport.rows=this.lastHostReport.rows.map(r=>({...r,archived:true}));this.lastHostPerformance=this.performanceHistory.report(this.performanceIdentities());}
  // Best effort: peer closure or the presence timeout still cleans up if this message is lost.
  const connections=this.isHost?[...this.connections.values()]:[this.server].filter(Boolean);
  for(const conn of connections)try{this.send(conn,{type:this.isHost?'room-closed':'leave',...(!this.isHost&&!unloading?{performance:this.makePerformance()}:{})});}catch{}
  // pagehide does not guarantee another timer turn. Close RTC synchronously
  // there; ordinary menu exits retain a short chance to deliver the notice.
  const peer=this.peer;this.generation++;clearInterval(this.timer);this.stopIceRefresh?.();this.stopIceRefresh=null;if(peer){if(unloading)peer.destroy();else setTimeout(()=>peer.destroy(),200);}if(hadSession)this.onStop('You left the room.');this.reset();this.changed();
 }
}

// Optional room-local observations. Never infer packet loss from delayed data.
export const HEALTH_PHASES=['idle','connecting','pending','waiting','lobby','preparing','playing','reconnecting','error'];
export const STOP_CAUSES=['grid-rebuild','requested-stop','player-left','visibility-interruption','local-progress-timeout','remote-progress-timeout','snapshot-ack-timeout','preparation-timeout','prepare-failed','send-error','send-queue-limit','receive-error','data-handler-error','transport-interruption','arcade-link-error','arcade-start-timeout','local-runtime-error'];
const number=(v,max)=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=max;
export function normalizeHealth(h){
 if(!h||!(h.version===1||h.version===2&&h.flowMode==='latest')||!Number.isSafeInteger(h.sequence)||h.sequence<1||!HEALTH_PHASES.includes(h.phase)||typeof h.visible!=='boolean'||typeof h.signaling!=='boolean')return null;
 const result={version:h.version,...(h.version===2?{flowMode:'latest'}:{}),sequence:h.sequence,phase:h.phase,visible:h.visible,signaling:h.signaling};
 if(['full','off'].includes(h.captureMode))result.captureMode=h.captureMode;
 for(const [key,max] of Object.entries({simulationHz:240,sampleMs:120000,bufferedBytes:1024**3,inFlight:h.version===2?256:8,pending:1,ackRttMs:120000,receiveBytes:16*1024**2,backlogMs:120000})){
  if(h[key]===null){result[key]=null;continue;}if(!number(h[key],max))return null;result[key]=h[key];
 }
 if(!Number.isInteger(result.inFlight)||!Number.isInteger(result.pending))return null;
 return result;
}
export function cleanReason(value){return String(value||'').replace(/[\x00-\x1f\x7f]/g,' ').replace(/https?:\/\/\S+/gi,'[link]').replace(/dt-[a-z0-9-]+/gi,'[peer]').replace(/\b[a-f0-9]{32}\b/gi,'[key]').replace(/\b(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?\b/g,'[address]').slice(0,280);}
export class HealthSampler {
 constructor(){this.sequence=0;this.phase='';this.epoch='';this.at=0;this.frames=0;this.hz=null;this.duration=null;}
 sample(room,now,extra={}){
  if(this.phase!==room.phase||this.epoch!==room.epoch||room.progressFrames<this.frames){this.phase=room.phase;this.epoch=room.epoch;this.at=now;this.frames=room.progressFrames;this.hz=null;this.duration=null;}
  if(room.active&&now-this.at>=500){this.duration=now-this.at;this.hz=(room.progressFrames-this.frames)*1000/this.duration;this.at=now;this.frames=room.progressFrames;}
  const conn=room.server,flow=conn?.snapshotFlow?.snapshot();
  return {version:conn?.raceMotion?2:1,...(conn?.raceMotion?{flowMode:'latest'}:{}),sequence:++this.sequence,captureMode:room.performanceCaptureEnabled===false?'off':'full',phase:room.phase,visible:!!room.isVisible(),signaling:!!room.signaling,simulationHz:room.active?this.hz:null,sampleMs:room.active?this.duration:null,
   bufferedBytes:(conn?.dataChannel?.bufferedAmount||0)+(conn?.motion?.channel.bufferedAmount||0),inFlight:flow?.inFlight||0,pending:flow?.pending||0,ackRttMs:flow?.ackRttMs??null,receiveBytes:number(extra.receiveBytes,16*1024**2)?extra.receiveBytes:null,backlogMs:number(extra.backlogMs,120000)?extra.backlogMs:null};
 }
}
const explanations={
 'motion-open':['Movement channel opened','A negotiated unordered channel with zero retransmissions is available. The host selects transport before starting each session.'],
 'motion-active':['Latest-state movement active','This arcade session uses the independent discardable snapshot channel. Room commands and race results stay reliable.'],
 'motion-legacy':['Reliable movement active','This arcade session uses the compatible reliable snapshot path.'],
 'motion-closed':['Movement channel closed','The movement channel closed; when possible, the reliable control connection coordinates a fallback.'],
 'motion-error':['Movement channel error','The browser reported an error on the movement channel.'],
 'motion-unavailable':['Movement channel unavailable','This connection could not negotiate the optional movement channel. The reliable path remains available.'],
 'motion-timeout':['Movement negotiation timeout','The optional movement channel did not become ready within ten seconds.'],
 'motion-fallback':['Movement returned to reliable delivery','The connection switched both endpoints to the reliable snapshot path without changing the session epoch.'],
 'diagnostics-changed':['Diagnostics recording changed','The host changed detailed recording for the room. Connection supervision remains active.'],
 'channel-open':['Connected','The data channel opened.'],
 'channel-close':['Channel closed','The browser reported a closed data channel. This alone does not identify why it closed.'],
 'channel-not-open':['Channel unavailable','The data channel is no longer open.'],
 'opening-timeout':['Connection opening timeout','The data channel did not open within 30 seconds.'],
 'send-queue-limit':['Outgoing queue limit','The observed outgoing queue exceeded the 1 MiB protection.'],
 'send-error':['Send failed','The browser or transport rejected a send.'],
 'data-handler-error':['Invalid or undeliverable data','Received data could not be accepted or delivered to the arcade.'],
 'signaling-disconnected':['Invitation service interrupted','The signaling service disconnected; an existing game connection may still work.'],
 'grid-rebuild':['Grid rebuilt after the race','Remaining drivers reached attract; the room returned to the lobby to remove retired native slots.'],
 'visibility-interruption':['Tab became inactive','The cabinet’s game tab became hidden.'],
 'local-progress-timeout':['Local simulation stopped advancing','No local emulation steps were observed for 10 seconds.'],
 'remote-progress-timeout':['Remote progress timeout','No newer remote emulation counter arrived for 10 seconds. Network delay and a stalled remote simulation cannot be distinguished from this alone.'],
 'snapshot-ack-timeout':['State receipt progress timeout','Outstanding arcade states received no new valid acknowledgment for 10 seconds. The age of an individual old state alone does not trigger this timeout.'],
 'silence-timeout':['Connection silent','No message arrived from this connection for 20 seconds.'],
 'preparation-timeout':['Cabinet setup timeout','The cabinets did not all finish preparation within the allowed time.'],
 'prepare-failed':['Cabinet setup failed','A cabinet reported that it could not prepare the arcade.'],
 'requested-stop':['Return to room requested','A participant requested that the game return to the lobby.'],
 'transport-interruption':['Transport interrupted','The connection could not continue. See the preceding transport event.'],
 'receive-error':['Arcade receive failed','Received state could not be delivered to the arcade.'],
 'arcade-link-error':['Original arcade link lost','The emulated arcade reported a lost link. This alone does not identify the underlying network cause.'],
 'arcade-start-timeout':['Original arcade link setup timeout','The cabinets did not establish their emulated arcade link within 45 seconds.'],
 'local-runtime-error':['Local game error','The local runtime reported an error. See the recorded message.'],
 'player-reconnected':['Player reconnected','The existing room session recovered its data channel. Ready must be confirmed again.'],
 'request-declined':['Request declined','The host declined this pending join request.'],
 'player-left':['Player left','The participant explicitly left the room.'],
 'host-removed-player':['Removed by host','The host removed the participant from the lobby.'],
 'recovery-expired':['Reconnection expired','The reserved connection did not recover within 30 seconds.'],
 'player-admitted':['Player admitted','The host admitted this participant.'],
 'room-closed':['Room closed','The host explicitly closed the room.'],
 'invalid-status-report':['Status report ignored','An optional report contained unsupported or invalid fields; gameplay was not stopped.'],
 'rtc-disconnected':['Transport disconnected','The browser reported a disconnected peer connection. It may recover; this is not proof of packet loss.'],
 'rtc-failed':['Transport failed','The browser reported a failed peer connection. The underlying network cause is unavailable.'],
 'rtc-closed':['Transport closed','The browser reported a closed peer connection. This alone does not identify why it closed.'],
 'rtc-connected':['Transport connected','The browser reported a connected peer connection.'],
};
export function describeEvent(event){
 const kind=event.cause||event.kind;
 if(explanations[kind])return {title:explanations[kind][0],detail:explanations[kind][1]};
 if(kind.startsWith('peer-error:'))return {title:'Peer service error',detail:`The peer service reported ${kind.slice(11)}.`};
 if(kind.startsWith('channel-error:'))return {title:'Data channel error',detail:`The data channel reported ${kind.slice(14)}. The underlying cause may be unavailable.`};
 return {title:'Connection event',detail:'An observed connection state changed.'};
}
export function classifyConnection(row,playing){
 if(row.archived)return {level:'muted',label:'Disconnected',detail:'Last observation retained; this participant does not occupy a current seat.'};
 if(row.connection==='reconnecting')return {level:'warn',label:'Reconnecting',detail:'The lobby is temporarily reserving this participant’s seat.'};
 if(row.self)return {level:row.visible?'ok':'warn',label:row.visible?'Host · local':'Host tab hidden',detail:'Local measurements on the host device.'};
 if(row.connectionState==='failed'||row.iceState==='failed')return {level:'bad',label:'Transport failed',detail:'The browser reports a failed transport; the underlying cause is unknown.'};
 if(row.channelState==='closed'||row.connectionState==='closed')return {level:'bad',label:'Channel closed',detail:'The data channel is closed.'};
 const threshold=Math.max(3000,(row.rttMs||0)*3+1000);
 if(row.lastMessageAgeMs!==null&&row.lastMessageAgeMs>threshold)return {level:'warn',label:'No recent messages',detail:'Messages are delayed or absent. This does not prove the remote game is frozen.'};
 if(row.waiting)return {level:'muted',label:'Waiting for next race',detail:'Room connection only. No arcade snapshots or simulation progress are expected until the next session.'};
 if(row.pending)return {level:'muted',label:'Awaiting admission',detail:'Connected join request. Game telemetry starts after host admission.'};
 if(!row.health||row.reportAgeMs>threshold)return {level:'muted',label:'Awaiting status',detail:'No recent optional status report is available. Other game messages may still be arriving.'};
 if(!row.health.visible)return {level:'warn',label:'Tab hidden · reported',detail:'The participant’s latest report says the game tab is hidden.'};
 if(playing&&row.lastStateAgeMs!==null&&row.lastStateAgeMs>threshold)return {level:'warn',label:'Game updates delayed',detail:'No recent new arcade state arrived from this participant.'};
 if(playing&&row.health.phase==='playing'&&row.health.simulationHz!==null&&row.health.simulationHz<45)return {level:'warn',label:'Lower SIM · reported',detail:'The participant measured fewer than 45 emulation steps per second. This is simulation cadence, not display FPS.'};
 return {level:'ok',label:row.pending?'Awaiting admission':'Connected',detail:row.rttMs>=300?'Connected with high RTT. Stable high latency alone is not a disconnection.':'Messages and recent status are available.'};
}

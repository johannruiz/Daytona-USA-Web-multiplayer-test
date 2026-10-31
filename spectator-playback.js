import {mountSpectatorStatus} from './spectator-view.js?v=53.8.59';
import {BUILD_ID,validateSettings} from './room-settings.js?v=53.8.59';
import {DEFAULT_EEPROM} from './nvram.js?v=53.8.59';
import {linkIdForSeat} from './central-link.js?v=53.8.59';
import {createRenderer} from './renderer.js?v=53.8.59';
import {transformPacket} from './spectator-codec.js?v=53.8.59';
import {SPECTATOR_VERSION,SpectatorWorldBuffer,worldState,worldGridSignature} from './spectator-world.js?v=53.8.59';
import {ARCADE_STEP_MS} from './simulation-clock.js?v=53.8.59';
import {mountSpectatorHUD} from './spectator-hud.js?v=53.8.59';
import {createEnvironment,environmentSnapshot} from './environment.js?v=53.8.59';
import {createSpectatorAudio} from './spectator-audio.js?v=53.8.59';
import {createSpectatorRecovery} from './spectator-recovery.js?v=53.8.59';

export function createSpectatorPlayback({room,getROM,getVolume=()=>1,root,onStatus=()=>{}}){
 const $=id=>root.querySelector('#'+id),hud=mountSpectatorHUD(root);
 const show=mountSpectatorStatus(root);let mode='offline',roomPhase='lobby';
 const status=(s='',kind=mode)=>{mode=kind;show(kind,s);onStatus(s);};
 let wasm,renderer,ready,stream,epoch='',generation=0,disposed=false,visible=true,prepared=false,booting=false,initializedCourse=-1,
  members=[],donor=null,selected=null,latest=null,buffer=new SpectatorWorldBuffer(),raf,lastTick=0,debt=0,currentCamera=-1,
  lastWire=0,handshakeDeadline=0,feedConfigured=false,metricsAt=performance.now(),packets=0,receivedBytes=0,boots=0,failure='';
 let environmentMode='day',renderedWorld=null,environmentClock={run:0,elapsed:0},environmentAt=0,gridKey='',activeIds=new Set();
 const sharedEnvironment=()=>{const shared=room.environmentState?.()??room.environment?.snapshot();return shared?.run?shared:{run:environmentClock.run,elapsed:environmentClock.run?environmentClock.elapsed+Math.max(0,performance.now()-environmentAt)/1000:0};};
 const environment=createEnvironment({engine:()=>wasm,renderer:()=>renderer,context:()=>({mode:environmentMode,clock:sharedEnvironment()})});
 const audio=createSpectatorAudio({button:$('spectatorSound'),getWasm:()=>wasm,getVolume,ready:()=>prepared,getGrid:()=>worldGridSignature(renderedWorld||latest),onDemand:(on,target)=>{if(stream?.open&&feedConfigured&&members.some(m=>m.id===target))stream.send({type:'spectator-audio-select',target,on});}});
 const loading=(on,value=0)=>{$('spectatorLoading').hidden=!on;$('spectatorLoadProgress').value=value;};
 for(const o of $('spectatorCamera').options)o.disabled=Number(o.value)<0;$('spectatorCamera').value='2';
 audio.refresh();
 const recovery=createSpectatorRecovery({request:()=>room.spectators?.reconnect(),onRetry:(attempt,total)=>status(`Reconnecting to the race feed… (${attempt}/${total})`,'connecting'),onExhausted:()=>status('Could not restore the race feed. Reopen the viewer to try again. Drivers are unaffected.','interrupted')});
 $('spectatorViewHint').hidden=false;$('spectatorViewHint').textContent='Original sound effects · Music off';
 async function ensureReady(){
  if(!ready)ready=(async()=>{
   const file=getROM();if(!file)throw Error('Choose a ROM before watching.');
   const next=await createDaytonaModule({locateFile:name=>new URL(name+'?v=53.8.59',import.meta.url).href});if(disposed)return;wasm=next;
   // A disposed WebGL/WebGPU renderer leaves context and compositor state on
   // its canvas. A later spectator session owns a fresh graphics surface,
   // rather than reinitializing a retired context on the previous canvas.
   const previous=$('spectatorCanvas'),canvas=previous.cloneNode(false);previous.replaceWith(canvas);
   const draw=await createRenderer(canvas,e=>stop(e),{});if(disposed){draw.dispose();return;}renderer=draw;
   try{wasm.FS.mkdir('/roms');}catch{}wasm.FS.writeFile('/roms/spectator.zip',new Uint8Array(await file.arrayBuffer()));
  })().catch(e=>{ready=null;throw e;});return ready;
 }
 function stop(message){audio.stop();failure=message;prepared=false;generation++;loading(false);status(message,'interrupted');}
 function transportFailure(message){const previous=stream;stream=null;previous?.close();stop(message);handshakeDeadline=0;recovery.fail(epoch);status('Race feed interrupted. Reconnecting automatically…','connecting');}
 function reset(message='Drivers are in the lobby.',keepRecovery=false){if(!keepRecovery)recovery.cancel();audio.stop();generation++;const previous=stream;stream=null;previous?.close();prepared=false;latest=null;renderedWorld=null;gridKey='';activeIds.clear();environmentClock={run:0,elapsed:0};environmentMode='day';environment.pause();failure='';lastWire=handshakeDeadline=0;feedConfigured=false;buffer=new SpectatorWorldBuffer();hud.reset();loading(false);status(message,'offline');}
 function configure(config){
  const settings=validateSettings(config.settings);environmentMode=settings.environment;environmentClock=environmentSnapshot(config.environmentClock)??{run:0,elapsed:0};environmentAt=performance.now();const grid=config.members;
  if(config.epoch!==epoch||!Array.isArray(grid)||grid.length<1||grid.length>8||grid.some(m=>typeof m.id!=='string'||m.id.length>100||typeof m.name!=='string'||m.name.length>24||!Number.isInteger(m.cabinet)||m.cabinet<1||m.cabinet>8||!Number.isInteger(m.skin)||m.skin<0||m.skin>39)||new Set(grid.map(m=>m.id)).size!==grid.length||new Set(grid.map(m=>m.cabinet)).size!==grid.length)throw Error('Invalid spectator grid.');
  const relay=grid.find(m=>m.id===config.donor);if(!relay||relay.id===config.host&&grid.length!==1)throw Error('Invalid spectator relay.');
  members=grid;donor=relay;selected=members.find(m=>m.id===selected?.id)||donor;hud.reset(members);hud.select(selected.id);audio.follow(selected.id);
  $('spectatorDriver').replaceChildren(...members.map(m=>{const o=document.createElement('option');o.value=m.id;o.textContent=m.name+' · Car '+m.cabinet;return o;}));$('spectatorDriver').value=selected.id;$('spectatorDriver').disabled=false;$('spectatorFollowing').textContent=selected.name;
  feedConfigured=true;handshakeDeadline=0;lastWire=performance.now();status('Waiting for drivers to enter a race.','waiting');
 }
 const race=s=>s&&s.count>0&&s.scene>=22&&s.scene<=29;
 function accept(s){
  const bytes=new Uint8Array(s.bytes);wasm.HEAPU8.set(bytes,wasm._daytona_spectator_world_input());
  if(!wasm._daytona_spectator_world_accept(bytes.length))throw Error('Could not apply the current race state.');
 }
 async function loadCourse(first){
  if(booting||disposed||!race(first))return;
  booting=true;prepared=false;initializedCourse=-1;loading(true,0);status('Preparing your race view…','loading');const ticket=generation,course=first.course;
  const valid=()=>!disposed&&ticket===generation&&race(latest)&&latest.course===course;
  const step=async(n,buttons=0,gas=0)=>{
   let slice=performance.now();for(let i=0;i<n;i++){
    if(!valid())return false;
    if(!wasm._daytona_step(0,gas,0,4,buttons))throw Error(wasm.ccall('daytona_error','string',[],[])||'The local spectator arcade could not initialize.');
    if(performance.now()-slice>=6){await new Promise(r=>setTimeout(r,0));slice=performance.now();}
   }return true;
  };
  try{
   status('Preparing the circuit and textures…','loading');await ensureReady();if(!valid())return;
   wasm._daytona_central_config(0,0);wasm._daytona_delivery_mode(0);
   if(!wasm.ccall('daytona_load','number',['string','number'],['/roms/spectator.zip',0]))throw Error('Could not load the spectator arcade.');
   wasm.HEAPU8.set(DEFAULT_EEPROM,wasm._daytona_eeprom_ptr());
   if(!wasm._daytona_spectator_world_boot(course))throw Error('Could not start the spectator circuit loader.');
   // Fixed local initialization, not a replay of past race inputs or packets.
   if(!await step(850))return;loading(true,25);
   for(const [n,b,g] of [[20,1,0],[20,0,0],[20,2,0],[140,0,0],[20,0,100],[90,0,0],[20,0,100]])if(!await step(n,b,g))return;
   loading(true,55);
   let attempts=0;while((wasm._daytona_spectator_world_phase()&255)!==22&&attempts++<80)if(!await step(20,0,100))return;
   if((wasm._daytona_spectator_world_phase()&255)!==22)throw Error('The circuit loader did not reach a race.');
   // Complete original texture upload and rolling-camera setup while hidden.
   if(!await step(700,64))return;loading(true,90);
   const capacity=wasm._daytona_spectator_world_phase()>>>8;
   if(capacity<latest.count||capacity>40)throw Error('The spectator actor grid was not initialized.');
   initializedCourse=course;renderer.reset();renderer.setDrawDistance(1);accept(buffer.sample()||latest);
   boots++;prepared=true;currentCamera=-1;debt=0;lastTick=performance.now();loading(false);status('',latest?.scene>=23?'finished':'live');
  }catch(e){if(ticket===generation)stop(e.message);}
  finally{booting=false;if(!disposed&&ticket===generation&&!prepared&&race(latest))setTimeout(()=>{void loadCourse(latest);},0);}
 }
 function receive(s,at){
  if(!buffer.accept(s,at))return;latest=s;lastWire=performance.now();recovery.healthy();
  if(!race(s)){gridKey='';if(prepared||audio.state().enabled)audio.stop();prepared=false;loading(false);status('Waiting for drivers to enter a race.','waiting');return;}
  const key=`${s.run}:${s.course}:${worldGridSignature(s)}`;
  if(key!==gridKey){
   gridKey=key;const links=new Set(s.words.slice(16,16+s.words[6]));activeIds=new Set(members.filter((m,i)=>links.has(linkIdForSeat(i+1,members.length))).map(m=>m.id));
   if(!activeIds.has(selected?.id))selected=activeIds.has(donor?.id)?donor:members.find(m=>activeIds.has(m.id));
   for(const option of $('spectatorDriver').options){const member=members.find(m=>m.id===option.value);option.disabled=!activeIds.has(option.value);option.textContent=member.name+' · Car '+member.cabinet+(option.disabled?' · Waiting to race':'');}
   $('spectatorDriver').value=selected.id;hud.reset(members);hud.select(selected.id);audio.follow(selected.id,true);
  }
  if(booting)return;
  if(initializedCourse!==s.course){void loadCourse(s);return;}
  if(!prepared){accept(s);prepared=true;lastTick=performance.now();debt=0;status('',s.scene>=23?'finished':'live');}
 }
 function connect(assignment){
  if(typeof assignment.relay!=='string'||assignment.relay.length>100||!/^[a-f0-9]{32}$/.test(assignment.ticket||'')||!/^[a-f0-9]{32}$/.test(assignment.epoch||''))throw Error('Invalid spectator assignment.');
  recovery.connecting(assignment.epoch);reset('Connecting to a live race relay…',true);failure='';status('Connecting to the race feed…','connecting');epoch=assignment.epoch;const ticket=generation;handshakeDeadline=performance.now()+30000;
  const c=stream=room.peer.connect(assignment.relay,{reliable:true,serialization:'binary',metadata:{role:'spectator-stream',build:BUILD_ID,version:SPECTATOR_VERSION,epoch,ticket:assignment.ticket}});
  c.on('open',()=>{if(c!==stream||ticket!==generation)return;if(!feedConfigured)handshakeDeadline=performance.now()+60000;status('Waiting for the player relay to finish preparing…','connecting');});
  let decoding=false,pending=null,configured=false;
  async function decode(){
   if(decoding)return;decoding=true;
   try{while(pending&&c===stream&&ticket===generation){const {d,at}=pending;pending=null;const bytes=await transformPacket(d.bytes,d.format,true);if(c!==stream||ticket!==generation)return;receive(worldState(bytes,members.length),at);if(d.audio)try{audio.offer(d.audio,at);}catch{audio.stop();}packets++;receivedBytes+=d.bytes.byteLength;}}
   catch(e){if(c===stream){stop(e.message);c.close();}}finally{decoding=false;}
  }
  c.on('data',d=>{
   if(c!==stream||ticket!==generation)return;
   if(d?.type==='spectator-begin'&&d.version===SPECTATOR_VERSION){try{configure(d.config);configured=true;}catch(e){stop(e.message);c.close();}return;}
   if(d?.type==='spectator-environment'&&d.epoch===epoch){const clock=environmentSnapshot(d.clock);if(clock&&clock.run>environmentClock.run){environmentClock=clock;environmentAt=performance.now();}return;}
   if(d?.type==='spectator-wait'){if(['preparing','playing'].includes(roomPhase))transportFailure('The race relay stopped sending.');else reset();return;}
   if(d?.type==='spectator-world'&&configured&&d.epoch===epoch){lastWire=performance.now();pending={d,at:lastWire};void decode();}
  });
  c.on('close',()=>{if(c===stream&&!failure)transportFailure('The spectator relay disconnected. Drivers are unaffected.');});c.on('error',()=>{if(c===stream&&!failure)transportFailure('Could not reach the spectator relay.');});
 }
 function frame(now){
  raf=requestAnimationFrame(frame);if(disposed)return;
  if(prepared&&race(latest))try{
   debt=Math.min(70,debt+Math.max(0,now-lastTick));lastTick=now;let n=0;
   while(debt>=ARCADE_STEP_MS&&n++<4){
    const index=members.findIndex(m=>m.id===selected?.id);wasm._daytona_spectator_target(linkIdForSeat(Math.max(0,index)+1,members.length));
    const camera=Number($('spectatorCamera').value);if(!wasm._daytona_spectator_world_view(camera,selected.cabinet))throw Error('Could not select the spectator camera.');currentCamera=camera;
    renderedWorld=buffer.sample(now)||latest;accept(renderedWorld);wasm._daytona_night_pose_enable?.(Number(environmentMode!=='day'));audio.apply(now);renderer.prepare(wasm);
    if(!wasm._daytona_step(0,0,0,4,0))throw Error(wasm.ccall('daytona_error','string',[],[])||'The spectator renderer stopped.');audio.push();debt-=ARCADE_STEP_MS;
   }
   environment.update(now,renderedWorld||latest);
   if(visible){renderer.setHUDVisible(false);hud.update(wasm,now);renderer.draw(wasm);}
   const following=selected.name;if($('spectatorFollowing').textContent!==following)$('spectatorFollowing').textContent=following;status('',latest.scene>=23?'finished':'live');

  }catch(e){stop(e.message);stream?.close();}
  else {lastTick=now;environment.pause();}audio.refresh();
  if(!failure&&stream&&handshakeDeadline&&now>handshakeDeadline)transportFailure(stream.open?'The player relay did not finish preparing.':'Could not connect to the player relay.');
  if(!failure&&!booting&&roomPhase==='playing'&&stream?.open&&feedConfigured&&lastWire&&now-lastWire>10000)transportFailure('The race feed stopped responding.');
  recovery.tick(visible&&['preparing','playing'].includes(roomPhase),now);
  if(now-metricsAt>=1000){$('spectatorMetrics').textContent=`${Math.round(packets*1000/(now-metricsAt))} states/s · ${Math.round(receivedBytes*1000/(now-metricsAt)/1024)} KiB/s · ${buffer.frames.length}/8 recent states · No history`;packets=receivedBytes=0;metricsAt=now;}
 }
 $('spectatorDriver').onchange=()=>{const next=members.find(m=>m.id===$('spectatorDriver').value);if(!next||!activeIds.has(next.id))return;selected=next;hud.select(selected.id);audio.follow(selected.id);};
 status('Drivers are in the lobby.','offline');raf=requestAnimationFrame(frame);
 return {message(d){if(disposed)return;if(d.type==='spectator-assignment'){try{connect(d);}catch(e){stop(e.message);}}else if(d.type==='spectator-status'&&!prepared&&!booting)status(String(d.message||'').slice(0,160),roomPhase==='lobby'?'offline':'connecting');},
  sync(state){
   const previous=roomPhase;roomPhase=state.isHost?state.phase:state.phase==='waiting'?state.remotePhase:state.phase;
   // A ticket for the next session may arrive while the last room snapshot
   // still says lobby. Repainting that snapshot must not cancel the ticket.
   if(roomPhase==='lobby'){if(previous==='preparing'||previous==='playing')reset();else if(!stream)status('Drivers are in the lobby.','offline');}
   else if(roomPhase==='reconnecting'||state.phase==='reconnecting')status('Reconnecting to your room…','interrupted');
   else if(roomPhase==='preparing'&&!prepared&&!booting)status('Starting the arcade cabinets…','connecting');
   else if(roomPhase==='playing'){if(previous!=='playing'&&feedConfigured&&!latest)lastWire=performance.now();if(mode==='offline')status('Connecting to the race feed…','connecting');}
  },
  reset,warm(){void ensureReady().catch(e=>status(e.message));},visible(on){const opening=!!on&&!visible;visible=!!on;audio.visible(visible);if(opening&&failure&&['preparing','playing'].includes(roomPhase)){recovery.cancel();room.spectators?.reconnect();}},
  state:()=>({environment:environment.state(),prepared,booting,boots,course:initializedCourse,frame:wasm?._daytona_total_frames(),scene:latest?.scene,sourceFrame:latest?.frame,queued:buffer.frames.length,received:buffer.received,epoch,relay:donor?.id,target:selected?.id,camera:currentCamera,focus:wasm?._daytona_spectator_focus(),hud:hud.snapshot(),history:false,viewState:mode,feedConfigured,audio:audio.state(),failure,recovery:recovery.state(),localPhase:wasm?._daytona_spectator_world_phase()}),
  dispose(){disposed=true;cancelAnimationFrame(raf);reset('');audio.dispose();renderer?.dispose();renderer=null;wasm=null;}
 };
}

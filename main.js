import {mountWheelFeedback} from './wheel-feedback-ui.js?v=53.8.24';
import {wheelMayDrive} from './wheel-force-feedback.js?v=53.8.24';
import {createEnvironment} from './environment.js?v=53.8.24';
import {SpectatorService,spectatorConfig} from './spectator-service.js?v=53.8.24';
import {mountSpectatorControls} from './spectator-controls.js?v=53.8.24';
import {createRoomArrivals} from './room-arrivals.js?v=53.8.24';
import {createSkinPreviews} from './skin-previews.js?v=53.8.24';
import {createRoomSystemAlerts} from './room-system-alerts.js?v=53.8.24';
import {createROMStore,createROMMemory} from './rom-memory.js?v=53.8.24';
import {mountGameChat} from './game-chat.js?v=53.8.24';
import {startAnalytics} from './firebase-client.js?v=53.8.24';
import {LocalRaceReporter,applyNativeOrder} from './race-authority.js?v=53.8.24';
import {mountRaceStandings} from './race-standings.js?v=53.8.24';
import {createGamepadHome} from './gamepad-home.js?v=53.8.24';
import {protectTouchSurface} from './touch-guard.js?v=53.8.24';
import {createKeyboardControls} from './keyboard-controls.js?v=53.8.24';
import {SimulationClock} from './simulation-clock.js?v=53.8.24';
import {SourceTimeline,NativeStateInbox} from './link-timing.js?v=53.8.24';
import {linkIdForSeat} from './central-link.js?v=53.8.24';
import {createLobbySound} from './lobby-sound.js?v=53.8.24';
import { mountDiagnostics } from './diagnostics.js?v=53.8.24';
import { mountRoomDiagnostics } from './room-diagnostics.js?v=53.8.24';
import {createControllerControls} from './controller-controls.js?v=53.8.24';
import { createRenderer } from './renderer.js?v=53.8.24';
import {mountGraphicsAPISettings} from './graphics-api-settings.js?v=53.8.24';
import {mountMenuGamepad} from './menu-gamepad.js?v=53.8.24';
import { restoreNVRAM, STORAGE_ID,usableCabinetEEPROM } from './nvram.js?v=53.8.24';
import { createTouchControls } from './touch.js?v=53.8.24';
import { createGamepadRumble } from './haptics.js?v=53.8.24';
import { loadSettings, saveSettings } from './preferences.js?v=53.8.24';
import { createWheelControls } from './wheel-controls.js?v=53.8.24';
import { Multiplayer } from './multiplayer.js?v=53.8.24';
import { createRoomUI } from './room-ui.js?v=53.8.24';
import { mountHostConsole } from './host-console.js?v=53.8.24';
import { raceOptionsMask,prepareCabinet,ensureDeluxeCabinet } from './room-settings.js?v=53.8.24';
import {prepareSingleCabinet,sameSingleSettings} from './single-player-settings.js?v=53.8.24';
import {createSinglePlayerUI} from './single-player-ui.js?v=53.8.24';
// Daytona USA browser host. The wasm module is the original recomp game's
// native game loop, not a JavaScript reconstruction of Daytona.
const $ = (id) => document.getElementById(id);
const ui = {
  input: $('romInput'), dropzone: $('dropzone'), metadata: $('romMeta'),
  start: $('startBtn'), sound: $('soundBtn'),
  fullscreen: $('fullscreenBtn'), canvas: $('screen'), overlay: $('overlay'),
  message: $('message'), status: $('status'), fps: $('fps'),
  menu: $('menuBtn'), close: $('closeBtn'), fileLabel: $('fileLabel'), startLabel: $('startLabel')
};
let wasm = null, renderer = null, started = false, running = false;
let engineReady = null, engineStartupError = '';
let simulationClock=null;
let ctxAudio = null, audioGain = null, uiAudioGain = null, audioNext = 0;
const audioSources=new Set();
let soundMuted = false;
let lastTime = 0, lagMs = 0, statTime = performance.now(), rendered = 0, simulated = 0;
const FIXED_MS = 1000 / (16000000 / (656 * 424));
const held = new Set();
let currentGear = 1;
let wheelInUse=false,wheelFeedback=null;

let audioLoaded = false;
const settingsStorage={getItem:key=>localStorage.getItem(key),setItem:(key,value)=>localStorage.setItem(key,value)};
const mobileDevice=!!navigator.userAgentData?.mobile || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform==='MacIntel' && navigator.maxTouchPoints>1);
const settings=loadSettings(settingsStorage,{mobile:mobileDevice});
let enhanced = settings.drawDistance>0;
let settingsOpen=false;
let multiplayerProfile=false,linkStartedAt=0;
let gameChat,roomUI,hostConsole,diagnostics,roomDiagnostics,singleUI,graphicsAPISettings,menuControls,raceStandings;
let singleApplied=null,preparingSingle=false;
let roomSystemAlerts,roomArrivals;
let currentROM=null;
const skinPreviews=createSkinPreviews({getROM:()=>currentROM});
const romMemory=createROMMemory({store:createROMStore(),load:loadROM,canRestore:()=>!currentROM,
 onBusy:busy=>{ui.input.disabled=busy;$('changeROM').disabled=busy;ui.dropzone.setAttribute('aria-disabled',String(busy));},
 onWarning:error=>{console.warn('Could not remember the local ROM',error);if(currentROM&&!$('playerModes').hidden)ui.message.textContent='ROM ready. This browser could not remember it; choose it again next visit.';}
});
const sourceTimeline=new SourceTimeline(),nativeInbox=new NativeStateInbox(),raceReporter=new LocalRaceReporter();
function syncAuthoritativeOrder(sample){
 if(!room.active||!sample)return;
 if(sample[17]>0&&sample[18]===sample[1])raceStandings?.pendingFinish();
 if(sample[5]!==1)return;
 const order=room.raceOrderFor(room.id,sample[1]);if(order){if(applyNativeOrder(wasm,sample,order)){let packed=0,mask=0,finalMask=0;for(const r of order.rows){packed|=(r.position-1)<<(r.car*4);mask|=1<<r.car;if(order.phase==='final'||r.status==='finished')finalMask|=1<<r.car;}room.spectators?.order([sample[1],order.revision,order.signature,packed>>>0,mask,finalMask]);}raceStandings?.authority(order);}
}
const room=new Multiplayer({
 movementMode:new URLSearchParams(location.search).get('movement')==='reliable'?'reliable':'adaptive',
 isVisible:()=>!document.hidden,
 readHealth:()=>({receiveBytes:wasm?._daytona_link_pending_bytes()||0,backlogMs:Math.max(0,lagMs)}),
 readPerformance:(epoch,after)=>diagnostics?.share(epoch,after),
 onChange:state=>{room.spectators?.sync(state);roomSystemAlerts?.sync(state);roomArrivals?.update(state);diagnostics?.setAutomatic(state.phase==='playing');roomDiagnostics?.sync();roomUI?.render(state);gameChat?.sync(state);hostConsole?.sync();graphicsAPISettings?.sync();raceStandings?.sync(room);},
 onPrepare:async(config,cancelled)=>{
  sourceTimeline.reset();nativeInbox.clear();raceReporter.reset();
  saveNVRAM();singleApplied=null;
  simulationClock?.stop();running=false;started=false;held.clear();keyboardControls.reset();touch.clear();stopFeedback();multiplayerProfile=true;
  ui.start.disabled=true;ui.close.hidden=true;
  setStatus('Preparing linked cabinet…',true);
  await prepareCabinet(wasm,reloadEngine,config,cancelled);
  if(!wasm._daytona_central_config(linkIdForSeat(room.members.findIndex(m=>m.id===room.id)+1,room.members.length),room.members.length))throw Error('Invalid centralized cabinet configuration.');
  for(let link=1;link<=8;link++){const member=room.members.find((m,i)=>linkIdForSeat(i+1,room.members.length)===link);if(!wasm._daytona_set_player_skin(link,member?.skin??0))throw Error('Could not prepare the shared player liveries.');}
  if(!wasm._daytona_set_race_options(raceOptionsMask(config)))throw Error('Could not apply shared race rules.');
  if(!wasm._daytona_set_cpu_cars(Number(config.cpuCars)))throw Error('Could not apply the room CPU car setting.');
  if(!wasm._daytona_set_reverse_course(config.reverse?4:0))throw Error('Could not apply the circuit direction.');
  renderer.reset();applyGraphics();room.spectators?.prepared(spectatorConfig(wasm,room,config));
 },
 onStart:()=>{room.spectators?.start();wasm._daytona_delivery_mode(1);ui.start.disabled=false;linkStartedAt=performance.now();roomUI.running();void resumeGame();},
 onStop:reason=>{
  room.spectators?.stopStreams(reason);
  sourceTimeline.reset();nativeInbox.clear();raceReporter.reset();
  wasm?._daytona_delivery_mode(0);wasm?._daytona_central_config(0,0);
  for(const source of audioSources){try{source.stop();}catch{}}audioSources.clear();audioNext=0;
  simulationClock?.stop();running=false;started=false;held.clear();keyboardControls.reset();touch.clear();stopFeedback();wasm?._daytona_link_enable(0);
  ui.start.disabled=true;ui.start.hidden=true;openMenu();setStatus('Room ready',true);ui.message.textContent=reason;
 },
 onRaceOrder:order=>{if(room.waiters.get(room.id)?.spectator)return;raceReporter.acknowledge(order,room.id);if(wasm)syncAuthoritativeOrder(new Float64Array(wasm.HEAPU8.buffer,wasm._daytona_race_sample_ptr(),48));},
 onBytes:(bytes,timing)=>{
  raceStandings?.receive(bytes);
  nativeInbox.receive(bytes,timing,performance.now());
 }
});
const spectatorControls=mountSpectatorControls(room,{getROM:()=>currentROM,getVolume:()=>settings.volume,onRead:()=>roomUI?.markChatRead()});
room.spectators=new SpectatorService(room,{getWasm:()=>wasm,onChange:state=>spectatorControls.render(state),onMessage:d=>spectatorControls.message(d)});
raceStandings=mountRaceStandings($('raceStandings'));
diagnostics=mountDiagnostics({element:$('diagnosticsHud'),toggle:$('diagnosticsEnabled'),extraToggles:[$('experimentalPerformanceEnabled')],download:$('downloadDiagnostics'),room,
 read:()=>({heapBytes:wasm?.HEAPU8.buffer.byteLength||0,callbackSlots:wasm?._daytona_callback_slots()||0,receiveBytes:wasm?._daytona_link_pending_bytes()||0,frames:wasm?._daytona_total_frames()||0,linked:room.active,hidden:document.hidden,drawDistance:settings.drawDistance,
 role:room.active?(room.isHost?'MASTER':'SLAVE'):null,sessionId:room.active?room.epoch:null,progressFrames:room.progressFrames,backlogMs:Math.max(0,lagMs),
 peers:(room.isHost?[...room.connections.values()]:[room.server]).filter(c=>c?.emulation?.epoch===room.epoch&&room.active).map(c=>({cabinet:room.members.find(m=>m.id===c.peer)?.cabinet??null,frames:c.emulation.frames,ageMs:performance.now()-c.emulation.at,observedFrameDelta:room.progressFrames-c.emulation.frames}))})});
roomDiagnostics=mountRoomDiagnostics({toggle:$('roomDiagnosticsEnabled'),status:$('roomDiagnosticsStatus'),overlayToggle:$('diagnosticsEnabled'),download:$('downloadDiagnostics'),diagnostics,room,storage:settingsStorage});
graphicsAPISettings=mountGraphicsAPISettings({select:$('graphicsAPI'),apply:$('applyGraphicsAPI'),status:$('graphicsAPIHelp'),storage:settingsStorage,search:location.search,
 occupied:()=>room.occupied,beforeReload:saveNVRAM,onChoice:choice=>{
  const url=new URL(location.href);if(choice==='auto')url.searchParams.delete('renderer');else url.searchParams.set('renderer',choice);
  history.replaceState(null,'',url.href);
 },reload:()=>location.reload()});
function reloadEngine(){
 wasm._daytona_central_config(0,0);
 wasm._daytona_delivery_mode(0);
 if(!wasm.ccall('daytona_load','number',['string','number'],['/roms/user_daytona.zip',Number(audioLoaded)]))throw Error(cString(wasm._daytona_error()));
 renderer.reset();
}
const rumble=createGamepadRumble(status=>{$('rumbleStatus').textContent=status;});
function connectedDevices(){try{return [...(navigator.getGamepads?.() ?? [])].filter(pad=>pad?.connected);}catch{return [];}}
const wheelControls=createWheelControls($('wheelControls'),{storage:settingsStorage,getPads:connectedDevices,onChange:()=>stopFeedback(),onReset:()=>wheelFeedback?.resetPairing()});
wheelFeedback=mountWheelFeedback($('wheelFeedback'),{settings,onSetting:changeSetting,storage:settingsStorage,getSelection:()=>wheelControls.selection(),getEngineAvailable:()=>!!wasm?._daytona_wheel_force&&!!wasm?._daytona_wheel_resistance,canTest:()=>settingsOpen&&!$('experimentalPanel').hidden&&!ui.overlay.hidden&&document.hasFocus()&&!document.hidden});
function stopFeedback(){rumble.stop();wheelFeedback?.stop({force:true});}
const controllerControls=createControllerControls($('controllerControls'),{storage:settingsStorage,reservedIds:()=>wheelControls.reservedIds(),wheelPad:()=>wheelControls.feedbackPad(),onChange:()=>stopFeedback()});
const keyboardControls=createKeyboardControls($('keyboardControls'),{held,storage:settingsStorage,settings,mobile:mobileDevice,onSetting:changeSetting});
if(mobileDevice){$('inputTabLabel').textContent='Touch controls';$('inputTab').querySelector('svg').innerHTML='<path d="M8 12V5a2 2 0 0 1 4 0v6-3a2 2 0 0 1 4 0v3-1a2 2 0 0 1 4 0v5c0 4-3 7-7 7h-1c-2 0-3-1-4-2l-4-5a2 2 0 0 1 3-3l1 1Z"/>'; }
function applyGraphics(){
  enhanced=settings.drawDistance>0;
  renderer?.setDrawDistance(settings.drawDistance);
  wasm?._daytona_set_draw_distance(settings.drawDistance);
  $('graphicsSummary').textContent=enhanced?`Enhanced · Draw distance ${settings.drawDistance}x`:'Classic · Original draw distance';
}
function syncSettings(){
  wheelFeedback?.sync();
  rumble.setIntensity(settings.vibrationEnabled?settings.rumble:0);
  rumble.setCentringIntensity(settings.centring);
  for(const id of ['vibrationEnabled','settingsVibrationEnabled'])$(id).checked=settings.vibrationEnabled;
  for(const [key,input,output] of [['rumble','rumbleIntensity','rumbleValue'],['centring','centringIntensity','centringValue'],['volume','volumeIntensity','volumeValue'],['uiVolume','uiVolumeIntensity','uiVolumeValue'],['joystickSensitivity','joystickSensitivity','joystickSensitivityValue'],['joystickDeadzone','joystickDeadzone','joystickDeadzoneValue']]){
    $(input).value=Math.round(settings[key]*100);
    $(output).textContent=settings[key]===0&&key!=='joystickDeadzone'?(['volume','uiVolume'].includes(key)?'Silent':'Off'):`${Math.round(settings[key]*100)}%`;
    $(input).disabled=(key==='rumble' || key==='centring') && !settings.vibrationEnabled;
  }
  for(const radio of document.querySelectorAll('[name="drawDistance"]'))radio.checked=Number(radio.value)===settings.drawDistance;
  $('distance1Default').hidden=!mobileDevice;$('distance2Default').hidden=mobileDevice;
  if(audioGain)audioGain.gain.setTargetAtTime(settings.volume,ctxAudio.currentTime,0.025);
  if(uiAudioGain)uiAudioGain.gain.setTargetAtTime(settings.uiVolume,ctxAudio.currentTime,.025);
  keyboardControls.sync();
  $('touchControls').style.setProperty('--touch-button-scale',settings.touchButtonScale);$('gameChat').style.setProperty('--touch-button-scale',settings.touchButtonScale);$('touchControls').style.setProperty('--touch-steering-width',settings.touchSteeringWidth);
  applyGraphics();
}
function changeSetting(key,value){settings[key]=value;syncSettings();saveSettings(settingsStorage,settings);}
for(const id of ['vibrationEnabled','settingsVibrationEnabled'])$(id).addEventListener('change',event=>changeSetting('vibrationEnabled',event.target.checked));
for(const [id,key] of [['rumbleIntensity','rumble'],['centringIntensity','centring'],['volumeIntensity','volume'],['uiVolumeIntensity','uiVolume'],['joystickSensitivity','joystickSensitivity'],['joystickDeadzone','joystickDeadzone']])
  $(id).addEventListener('input',event=>changeSetting(key,Number(event.target.value)/100));
for(const radio of document.querySelectorAll('[name="drawDistance"]'))radio.addEventListener('change',event=>{if(event.target.checked)changeSetting('drawDistance',Number(event.target.value));});
syncSettings();
const settingsTabs=[...document.querySelectorAll('#settingsModal > .settings-tabs [role="tab"]')];
function selectSettingsTab(tab,focus=false){
  stopFeedback();
  wheelControls.cancel();controllerControls.cancel();keyboardControls.cancel();
  for(const item of settingsTabs){
    const selected=item===tab;item.setAttribute('aria-selected',String(selected));item.tabIndex=selected?0:-1;
    $(item.getAttribute('aria-controls')).hidden=!selected;
  }
  if(focus)tab.focus();
}
for(const tab of settingsTabs){
  tab.addEventListener('click',()=>selectSettingsTab(tab));
  tab.addEventListener('keydown',event=>{
    const index=settingsTabs.indexOf(tab);
    const next=event.key==='ArrowRight'?(index+1)%settingsTabs.length:event.key==='ArrowLeft'?(index+settingsTabs.length-1)%settingsTabs.length:event.key==='Home'?0:event.key==='End'?settingsTabs.length-1:null;
    if(next!==null){event.preventDefault();selectSettingsTab(settingsTabs[next],true);}
  });
}
function showMainMenu(focus=true){
  stopFeedback();
  if(hostConsole?.isOpen())return;
  wheelControls.cancel();controllerControls.cancel();keyboardControls.cancel();
  settingsOpen=false;$('mainMenu').hidden=false;$('settingsModal').hidden=true;
  $('menuDialog').setAttribute('aria-labelledby','gameTitle');ui.overlay.scrollTop=0;
  if($('menuDialog').classList.contains('mp-view'))$('menuDialog').setAttribute('aria-labelledby',!$('singlePlayerPanel').hidden?'singleTitle':!$('roomPanel').hidden?'roomTitle':'entryTitle');
  if(focus)$('settingsBtn').focus();
}
$('settingsBtn').addEventListener('click',()=>{
  settingsOpen=true;$('mainMenu').hidden=true;$('settingsModal').hidden=false;
  $('menuDialog').setAttribute('aria-labelledby','settingsTitle');ui.overlay.scrollTop=0;
  settingsTabs.find(tab=>tab.getAttribute('aria-selected')==='true').focus();
});
$('settingsBack').addEventListener('click',()=>showMainMenu());
function connectedGamepad(){return controllerControls.getPad();}
// An enabled, calibrated wheel takes priority; controllers remain a fallback.
function feedbackGamepad(){return wheelControls.feedbackPad() || connectedGamepad();}
const touch=createTouchControls($('touchControls'),{
  isRunning:()=>running,
  shift:amount=>{currentGear=Math.max(1,Math.min(4,currentGear+amount));$('touchGear').textContent=currentGear;},
  menu:()=>openMenu(),
  sound:()=>toggleSound(),
  settings:()=>{const panel=$('touchControls').querySelector('.touch-service');panel.hidden=!panel.hidden;}
});
const joinChime=createLobbySound({context:()=>ctxAudio,output:()=>uiAudioGain,muted:()=>soundMuted||settings.uiVolume===0});
function lobbySound(kind='request'){
 if(soundMuted||settings.uiVolume===0||!ctxAudio||ctxAudio.state==='closed')return false;
 if(ctxAudio.state==='running')return joinChime(kind);
 // Resume only the context already unlocked by Create/Join/Ready. Browsers
 // may suspend it when a window loses focus; never create autoplay audio here.
 void ctxAudio.resume().then(()=>joinChime(kind)).catch(()=>{});return false;
}
roomSystemAlerts=createRoomSystemAlerts({onClick:()=>{openMenu();if(room.phase==='lobby'&&!$('pendingJump').hidden)$('pendingJump').click();}});
roomArrivals=createRoomArrivals({notify:event=>{if(event.sound)lobbySound(event.kind==='joined'?'arrival':'request');if(event.system)void roomSystemAlerts.show(event);}});
roomSystemAlerts.sync(room.snapshot());roomArrivals.update(room.snapshot());
roomUI=createRoomUI(room,{previews:skinPreviews,enableArrivalNotifications:()=>roomSystemAlerts.enable(),canResume:()=>started&&!multiplayerProfile&&!room.occupied,notifyRequest:lobbySound,notifyChat:()=>lobbySound('chat'),notifyReady:()=>lobbySound('ready'),notifyConfirmed:()=>lobbySound('confirmed'),single:()=>singleUI.open(),unlockAudio:activateAudio});
gameChat=mountGameChat($('gameChat'),{room,storage:settingsStorage,gameShown:()=>started&&running&&ui.overlay.hidden,notify:()=>lobbySound('chat'),onRead:()=>roomUI.markChatRead(),onTyping:()=>{held.clear();keyboardControls.reset();},returnFocus:()=>ui.canvas.focus({preventScroll:true})});
gameChat.sync(room.snapshot());
singleUI=createSinglePlayerUI({previews:skinPreviews,storage:settingsStorage,unlockAudio:activateAudio,getSession:()=>({canResume:started&&!multiplayerProfile&&!room.occupied,settings:singleApplied}),onOpen:()=>roomUI.single(),onBack:()=>roomUI.modes(),onStart:async config=>{
 if(started&&!multiplayerProfile&&sameSingleSettings(config,singleApplied)){ui.start.disabled=false;roomUI.running();void resumeGame();return;}
 saveNVRAM();preparingSingle=true;stopFeedback();simulationClock?.stop();running=false;started=false;held.clear();keyboardControls.reset();touch.clear();ui.start.disabled=true;ui.close.hidden=true;
 for(const source of audioSources){try{source.stop();}catch{}}audioSources.clear();audioNext=0;
 try{
  if(multiplayerProfile||!wasm._daytona_ready()){reloadEngine();restoreNVRAM(wasm);}
  multiplayerProfile=false;
  singleApplied=await prepareSingleCabinet(wasm,reloadEngine,config);
  applyGraphics();ui.start.disabled=false;roomUI.running();
 }catch(error){singleApplied=null;throw error;}finally{preparingSingle=false;}
 // Audio permission/resume may remain pending after a quick pause. Cabinet
 // preparation is already complete; it must not keep the setup form locked.
 saveNVRAM();void resumeGame();
}});
hostConsole=mountHostConsole(room);
function menuBackLabel(){
 if(spectatorControls.isOpen())return 'Back to room';
 if(singleUI.isChoosingLivery())return 'Close liveries';
 if(hostConsole.isOpen()||settingsOpen||singleUI.isOpen()||!$('multiplayerEntry').hidden)return 'Back';
 const swapLabel=roomUI.backLabel();if(swapLabel)return swapLabel;
 if(room.occupied)return room.active?'Return to game':'Leave room';
 return started?'Resume':null;
}
function gamepadBack(){
 if(spectatorControls.close())return;
 if(hostConsole.isOpen()){hostConsole.close();return;}
 if(settingsOpen){showMainMenu();return;}
 if(singleUI.escape()||roomUI.escape())return;
 if(room.active&&started){void resumeGame();return;}
 if(room.occupied){if(!$('leaveRoom').disabled)$('leaveRoom').click();return;}
 if(started)void resumeGame();
}
function navigationGamepad(){
 const selected=controllerControls.getPad();return selected?connectedDevices().find(p=>p.index===selected.index&&p.id===selected.id)||null:null;
 }
const gamepadHome=createGamepadHome({getPad:navigationGamepad,canOpen:()=>started&&ui.overlay.hidden,open:openMenu});
menuControls=mountMenuGamepad({root:$('menuDialog'),hints:$('menuGamepadHints'),getPad:navigationGamepad,isOpen:()=>!ui.overlay.hidden,
 isCapturing:()=>controllerControls.isListening()||wheelControls.isListening()||keyboardControls.isListening(),back:gamepadBack,backLabel:menuBackLabel});
$('previewUISound').onclick=async()=>{await activateAudio();joinChime('confirmed');};
document.documentElement.classList.toggle('touch-device',navigator.maxTouchPoints>0 || matchMedia('(any-pointer:coarse)').matches);
function saveNVRAM() {
  if(multiplayerProfile||preparingSingle)return;
  if(!wasm?._daytona_ready())return;
  try {
    const read=(fnPtr,fnLen)=>Array.from(wasm.HEAPU8.subarray(wasm[fnPtr](),wasm[fnPtr]()+wasm[fnLen]()));
    const eeprom=read('_daytona_eeprom_ptr','_daytona_eeprom_size');
    // Do not replace a good save while the native I/O settings are blank or
    // incomplete (for example, pagehide during startup).
    if(!usableCabinetEEPROM(eeprom))return;
    const backup=read('_daytona_backup_ptr','_daytona_backup_size');
    localStorage.setItem(STORAGE_ID,JSON.stringify({eeprom,backup}));
  }catch(e){console.warn('Could not save arcade settings',e);}
}
function setStatus(text, ok = false) {
  ui.status.textContent = text;
  document.documentElement.classList.toggle('ready', ok);
}
function cString(pointer) {
  const mem = wasm.HEAPU8;
  let end = pointer;
  while (end < mem.length && mem[end]) end++;
  return new TextDecoder().decode(mem.subarray(pointer, end));
}
function failure(message) {
  if(room.active||room.phase==='preparing')room.end(message,room.id,'local-runtime-error');
  running = false;simulationClock?.stop();
  setStatus('Error');
  openMenu();
  ui.start.disabled=true;
  ui.message.textContent = message;
  console.error(message);
}
function pollGamepad() {
  const value=controllerControls.read(settings.joystickSensitivity,settings.joystickDeadzone);
  currentGear=value.gear ?? Math.max(1,Math.min(4,currentGear+value.shift));
  return value;
}
function inputs() {
  wheelInUse=false;
  if(!ui.overlay.hidden)return {steer:0,accel:0,brake:0,gear:currentGear,buttons:0};
  const wheel=wheelControls.read();
  let pad;
  if(wheel.active)pad=wheel;
  else if(menuControls?.blocksGameplay()){
    controllerControls.resetEdges();pad={steer:0,accel:0,brake:0,buttons:0};
  }else pad=pollGamepad();
  if(wheel.active){
    currentGear=wheel.gear ?? Math.max(1,Math.min(4,currentGear+wheel.shift));
    controllerControls.resetEdges();
  }
  const phone=touch.read();
  // Text entry owns the keyboard; physical and touch devices keep polling.
  const keyboard=gameChat?.typing()?{active:false,steer:0,accel:0,brake:0,buttons:0}:keyboardControls.read(FIXED_MS/1000);
  wheelInUse=wheel.active&&!keyboard.active&&!phone.steer;
  const buttons=pad.buttons|phone.buttons|keyboard.buttons;
  $('touchGear').textContent=currentGear;
  return {steer:keyboard.active?keyboard.steer:(phone.steer || pad.steer),
    accel:Math.max(keyboard.accel,pad.accel,phone.accel),
    brake:Math.max(keyboard.brake,pad.brake,phone.brake),
    gear:currentGear,buttons:room.active?buttons&~12:buttons};
}
window.addEventListener('keydown',(event)=>{
  if(event.code==='Escape'){
    if(hostConsole?.isOpen()){event.preventDefault();hostConsole.close();return;}
    if(settingsOpen){event.preventDefault();if(controllerControls.cancel()||keyboardControls.cancel())return;showMainMenu();return;}
  if(singleUI?.escape()){event.preventDefault();return;}
    if(roomUI?.escape()){event.preventDefault();return;}
    if(started){event.preventDefault();ui.overlay.hidden?openMenu():resumeGame();return;}
  }
  if(!running || !ui.overlay.hidden || !keyboardControls.uses(event.code)||event.ctrlKey||event.metaKey||event.altKey||['INPUT','SELECT','BUTTON'].includes(event.target?.tagName))return;
  if(room.active&&(event.code==='F2'||event.code==='F3'))return;
  if(started)event.preventDefault();
  const action=keyboardControls.action(event.code);
  if(!held.has(event.code)){if(action==='shiftDown'||action==='shiftUp')currentGear=Math.max(1,Math.min(4,currentGear+(action==='shiftUp'?1:-1)));if(/^gear[1-4]$/.test(action||''))currentGear=Number(action.at(-1));}
  held.add(event.code);
});
window.addEventListener('keyup',(event)=>held.delete(event.code));
// Keep keyboard navigation inside the active dialog, including nested settings.
ui.overlay.addEventListener('keydown',event=>{
 if(event.key!=='Tab'||ui.overlay.hidden)return;
 const eligible=[...$('menuDialog').querySelectorAll('button,input,select,a[href],[tabindex]')].filter(el=>!el.disabled&&el.tabIndex>=0&&el.getClientRects().length&&!el.closest('[inert]'));
 const items=eligible.filter(el=>{
  if(el.type!=='radio'||!el.name)return true;
  const group=eligible.filter(other=>other.type==='radio'&&other.name===el.name&&other.form===el.form);
  return el===(group.find(other=>other.checked)||group[0]);
 });
 if(!items.length)return;
 const first=items[0],last=items.at(-1),active=document.activeElement;
 if(!items.includes(active)||(event.shiftKey&&active===first)||(!event.shiftKey&&active===last)){event.preventDefault();(event.shiftKey?last:first).focus();}
});
window.addEventListener('blur',()=>{held.clear();keyboardControls.reset();stopFeedback();controllerControls.cancel();controllerControls.resetEdges();});
window.addEventListener('gamepaddisconnected',()=>{rumble.disconnect();wheelFeedback.refresh();});

function pushAudio() {
  if(soundMuted || !ctxAudio || ctxAudio.state!=='running' || !audioLoaded)return;
  const frames=wasm._daytona_audio_frames();
  const ptr=wasm._daytona_audio_ptr();
  if(!ptr||frames<=0)return;
  const samples=wasm.HEAPF32.subarray(ptr/4,ptr/4+frames*2);
  const buffer=ctxAudio.createBuffer(2,frames,48000);
  const left=buffer.getChannelData(0),right=buffer.getChannelData(1);
  for(let i=0;i<frames;i++){left[i]=samples[i*2];right[i]=samples[i*2+1];}
  const source=ctxAudio.createBufferSource();source.buffer=buffer;source.connect(audioGain);
  const now=ctxAudio.currentTime;
  if(audioNext<now){diagnostics.audioReset();audioNext=now+0.05;}
  if(audioNext>now+0.25){diagnostics.audioReset();audioNext=now+0.05;}
  audioSources.add(source);source.onended=()=>audioSources.delete(source);
  source.start(audioNext);
  audioNext+=frames/48000;
}
function updateDevices(now){
  keyboardControls.update(now,settingsOpen&&!$('inputPanel').hidden);
  const devices=connectedDevices();
  wheelControls.update(devices,now,settingsOpen && !$('experimentalPanel').hidden);
  wheelFeedback.refresh();
  controllerControls.update(devices,now,settingsOpen && !$('controllerPanel').hidden,settings.joystickSensitivity,settings.joystickDeadzone);
}
function simulateStep(now){
  renderer.prepare(wasm);
  const i=inputs();
  if(diagnostics.collecting)wasm._daytona_probe_reset();
  const stepBegin=performance.now();
  let replayBytes=null;
  if(room.active){
    room.observeNativeDelivery(nativeInbox.pending,stepBegin);const bytes=nativeInbox.take(stepBegin);replayBytes=bytes;
    if(bytes){wasm.HEAPU8.set(bytes,wasm._daytona_link_receive_ptr());if(!wasm._daytona_link_receive(bytes.length))throw Error('The arcade receive queue overflowed.');}
    wasm._daytona_link_step_time(stepBegin);
  }
  room.spectators?.beginStep(i,replayBytes,stepBegin);
  if(!wasm._daytona_step(i.steer,i.accel,i.brake,i.gear,i.buttons)) {
    failure(cString(wasm._daytona_error()));return false;
  }
  if(room.active){const end=performance.now();sourceTimeline.record(wasm._daytona_source_clock()>>>0,stepBegin,end);wasm._daytona_link_record_step((stepBegin+end)/2);const raceSample=new Float64Array(wasm.HEAPU8.buffer,wasm._daytona_race_sample_ptr(),48);room.observeChatScene(room.id,raceSample[4]);room.reportRace(raceReporter.observe(raceSample,(stepBegin+end)/2,(end-stepBegin)/2));syncAuthoritativeOrder(raceSample);room.spectators?.endStep((stepBegin+end)/2);}
  room.advance();
  simulated++;
  if(diagnostics.collecting)diagnostics.step(performance.now()-stepBegin,new Float64Array(wasm.HEAPU8.buffer,wasm._daytona_probe_ptr(),24));
  if(room.active){
    for(let packet=0;packet<64;packet++){
      const size=wasm._daytona_link_tx_size();if(!size)break;
      const bytes=wasm.HEAPU8.slice(wasm._daytona_link_tx_ptr(),wasm._daytona_link_tx_ptr()+size);raceStandings.ingest(bytes);room.write(bytes,sourceTimeline.publication(bytes,performance.now()));wasm._daytona_link_tx_pop();
      if(!room.active)return false;
    }
    const state=wasm._daytona_link_state();
    roomUI.link(state,wasm._daytona_link_id(),wasm._daytona_link_count());
    if(state===3){room.end('The original arcade reported a lost link. Return to the room and restart.',room.id,'arcade-link-error');return false;}
    if(now-linkStartedAt>45000&&state!==2){room.end('The cabinets could not establish their original arcade link.',room.id,'arcade-start-timeout');return false;}
  }
  const direct=wheelFeedback.drive({force:wasm._daytona_wheel_force?.()||0,resistance:wasm._daytona_wheel_resistance?.()||0},now,wheelMayDrive({running,started,menuOpen:!ui.overlay.hidden,focused:document.hasFocus(),hidden:document.hidden,wheelActive:wheelInUse,spectating:!!room.waiters.get(room.id)?.spectator}));
  if(direct)rumble.stop();
  else if(document.hasFocus() && !document.hidden && ui.overlay.hidden)
    rumble.update(feedbackGamepad(),wasm._daytona_rumble_strong(),wasm._daytona_rumble_weak(),now,wasm._daytona_rumble_centring());
  else rumble.stop();
  pushAudio();
  if(wasm._daytona_eeprom_dirty() || (wasm._daytona_total_frames()%600===0))saveNVRAM();
  return running;
}
simulationClock=new SimulationClock({
 stepMs:FIXED_MS,
 before(now){
  if(!running||!wasm)return false;
  diagnostics.update(true);updateDevices(now);
  if(room.active){room.checkProgress(now);if(!room.active)return false;}
  return running;
 },
 step:simulateStep,
 onState(state){
  lagMs=state.lagMs;lastTime=state.lastTime;
  if(running&&lastTime-statTime>1000){ui.fps.textContent=String(Math.round(simulated*1000/(lastTime-statTime)));rendered=0;simulated=0;statTime=lastTime;}
 },
 onError:error=>failure(error.message||String(error))
});
const environment=createEnvironment({engine:()=>wasm,renderer:()=>renderer,context:()=>multiplayerProfile?{mode:room.active?room.settings.environment:'day',clock:room.environmentState()}:{mode:singleApplied?.environment??'day'}});
function frame(now) {
  requestAnimationFrame(frame);
  gamepadHome.update();menuControls?.update(now);raceStandings.update(now);gameChat?.update();
  if(!running||!wasm){environment.pause();updateDevices(now);diagnostics.update(false);wheelFeedback.stop({force:false});rumble.update(feedbackGamepad(),0,0,now);return;}
  // Consume due steps immediately before presenting. The same clock has a
  // timer fallback for missing refreshes, without a second simulation loop.
  simulationClock.present(now);
  if(!running)return;
  environment.update(now);
  if(wasm._daytona_total_frames()>0){
    try{if(renderer.draw(wasm)){rendered++;diagnostics.draw();}}
    catch(err){failure(err.message);}
  }
}

async function activateAudio() {
  if(soundMuted)return;
  try {
    // Safari's ambient audio session obeys the iPhone silent switch.
    try {if(navigator.audioSession)navigator.audioSession.type='playback';}catch(err){console.warn(err);}
    // Use the device's output rate; the original 48 kHz buffers are resampled.
    if(!ctxAudio || ctxAudio.state==='closed'){
      ctxAudio=new (window.AudioContext||window.webkitAudioContext)();
      audioGain=ctxAudio.createGain();audioGain.gain.value=settings.volume;audioGain.connect(ctxAudio.destination);
      uiAudioGain=ctxAudio.createGain();uiAudioGain.gain.value=settings.uiVolume;uiAudioGain.connect(ctxAudio.destination);
    }
    // Both calls must occur inside the trusted tap, before awaiting anything.
    const resumed=ctxAudio.resume();
    const unlock=ctxAudio.createBufferSource();
    unlock.buffer=ctxAudio.createBuffer(1,1,ctxAudio.sampleRate);
    unlock.connect(audioGain);unlock.onended=()=>unlock.disconnect();unlock.start();
    await resumed;audioNext=ctxAudio.currentTime+0.05;
    updateSoundControls();
  }catch(err){updateSoundControls('Tap to retry sound');console.warn(err);}
}
function updateSoundControls(label=soundMuted?'Unmute sound':'Mute sound') {
  for(const button of [ui.sound,document.querySelector('[data-sound]')]){
    button.setAttribute('aria-label',label);button.title=label;
    button.setAttribute('aria-pressed',String(soundMuted));
    button.textContent=soundMuted?'♪̸':'♫';
  }
}
async function toggleSound() {
  soundMuted=!soundMuted;updateSoundControls();
  if(soundMuted)await ctxAudio?.suspend();
  else await activateAudio();
}
const gameSurface=document.querySelector('.arcade');
protectTouchSurface(gameSurface,{mobile:mobileDevice});
gameSurface.addEventListener('pointerdown',()=>{
  if(running && audioLoaded && !soundMuted && ctxAudio?.state!=='running')void activateAudio();
},{capture:true});
async function installROM(file){
  const binary=new Uint8Array(await file.arrayBuffer());
  try{wasm.FS.mkdir('/roms');}catch{}
  const path='/roms/user_daytona.zip';
  try{wasm.FS.unlink(path);}catch{}
  wasm.FS.writeFile(path,binary);
  audioLoaded=true;
  if(!wasm.ccall('daytona_load','number',['string','number'],[path,Number(audioLoaded)])){
    const error=Error(cString(wasm._daytona_error()));error.invalidROM=true;throw error;
  }
  renderer.reset();
}
function showVerifiedROM(file,message){
  ui.metadata.textContent=`✓ ${file.name} · ROM verified · Ready to play`;
  ui.start.disabled=false;ui.sound.disabled=!audioLoaded;
  openMenu();roomUI.verified();ui.message.textContent=message;
  setStatus('ROM ready',true);ui.fileLabel.textContent=file.name;
}
async function loadROM(file,{automatic=false}={}) {
  // Selected and remembered files both wait for WASM AND graphics startup.
  if(!renderer){
    if(!engineStartupError)ui.metadata.textContent='Waiting for the graphics engine…';
    await engineReady;
  }
  if(engineStartupError||!wasm||!renderer){
    const message=engineStartupError||'The arcade engine could not finish starting. Reload the page to try again.';
    failure(message);ui.metadata.textContent=message;return {ok:false};
  }
  if(!/\.zip$/i.test(file.name)){
    ui.message.textContent='Choose a Daytona USA Revision A (1994) ROM ZIP.';return {ok:false,invalid:true};
  }
  skinPreviews.stop();const previousROM=currentROM;saveNVRAM();
  room.leave();roomUI.loading();multiplayerProfile=false;singleApplied=null;
  stopFeedback();
  simulationClock?.stop();running=false;started=false;held.clear();keyboardControls.reset();touch.clear();ui.close.hidden=true;ui.start.disabled=true;ui.startLabel.textContent='Enter arcade';
  wheelControls.resetEdges();controllerControls.resetEdges();controllerControls.cancel();
  await ctxAudio?.suspend();
  ui.metadata.textContent=`${automatic?'Restoring':'Reading'} ${file.name} (${(file.size/1048576).toFixed(1)} MB)…`;
  setStatus(automatic?'Restoring saved ROM…':'Checking ROM…');
  try {
    await installROM(file);
    let recoveryNotice='';
    restoreNVRAM(wasm,settingsStorage,recovery=>{
      recoveryNotice=recovery.backupPreserved?' Saved cabinet settings were repaired. Scores were preserved.':' Saved arcade memory was incomplete and has been recovered.';
    });
    await applyDeluxeDefault();saveNVRAM();currentROM=file;
    showVerifiedROM(file,'ROM verified. Choose Single Player or Multiplayer.'+recoveryNotice);
    return {ok:true};
  }catch(err){
    if(previousROM){
      try{
        await installROM(previousROM);restoreNVRAM(wasm,settingsStorage);await applyDeluxeDefault();currentROM=previousROM;
        showVerifiedROM(previousROM,'Could not load the new ROM. Your previous ROM is still ready to play.');
        return {ok:false,invalid:!!err.invalidROM};
      }catch(restoreError){console.warn('Could not restore the previous ROM',restoreError);}
    }
    currentROM=null;roomUI.loading();failure(err.message||String(err));ui.metadata.textContent=err.message||String(err);
    return {ok:false,invalid:!!err.invalidROM};
  }
}
async function applyDeluxeDefault(){
  let applied=false;try{applied=settingsStorage.getItem('daytona-deluxe-default-v1')==='1';}catch{}
  if(applied)return;
  await ensureDeluxeCabinet(wasm,reloadEngine);
  try{settingsStorage.setItem('daytona-deluxe-default-v1','1');}catch{}
}
$('changeROM').addEventListener('click',()=>ui.input.click());
ui.input.addEventListener('change',(event)=>{const f=event.target.files?.[0];event.target.value='';if(f)void romMemory.select(f);});
for(const name of ['dragenter','dragover'])ui.dropzone.addEventListener(name,e=>{e.preventDefault();ui.dropzone.classList.add('drag');});
for(const name of ['dragleave','drop'])ui.dropzone.addEventListener(name,e=>{e.preventDefault();ui.dropzone.classList.remove('drag');});
ui.dropzone.addEventListener('drop',(event)=>{const f=event.dataTransfer?.files?.[0];if(f)void romMemory.select(f);});
function openMenu() {
  stopFeedback();
  wheelControls.resetEdges();controllerControls.resetEdges();controllerControls.cancel();
  running=room.active&&started;if(!running)simulationClock?.stop();held.clear();keyboardControls.reset();touch.clear();ui.overlay.hidden=false;
  showMainMenu(false);gameSurface.inert=true;
  roomUI.opened();
  document.documentElement.classList.add('launcher-open');
  ui.startLabel.textContent=started?'Resume arcade':'Enter arcade';
  if(started && ui.status.textContent!=='Error')setStatus(room.active?'Linked arcade running':'Arcade paused',true);
  if(!room.active&&!room.occupied)ctxAudio?.suspend().catch(console.warn);
  (hostConsole?.isOpen()?$('hostConsoleBack'):!$('roomPanel').hidden?(room.active?$('returnRoomGame'):$('leaveRoom')):!$('multiplayerEntry').hidden?$('modeBack'):singleUI.isOpen()?$('singleBack'):!ui.start.hidden?ui.start:!$('playerModes').hidden?$('singlePlayer'):ui.dropzone).focus();
  menuControls?.opened();
}
async function resumeGame() {
  stopFeedback();
  if(!wasm?._daytona_ready() || ui.start.disabled)return;
  menuControls?.resuming();
  wheelControls.resetEdges();controllerControls.resetEdges();controllerControls.cancel();
  const keepLinkedClock=room.active&&running;
  started=true;running=true;held.clear();keyboardControls.reset();touch.clear();
  if(!keepLinkedClock){statTime=performance.now();rendered=0;simulated=0;diagnostics.reset();}
  simulationClock.start({reset:!keepLinkedClock});
  ui.overlay.hidden=true;document.documentElement.classList.remove('launcher-open');
  gameSurface.inert=false;
  document.documentElement.classList.add('playing');ui.canvas.focus();
  setStatus(room.active?'Linked arcade running':'Arcade running',true);
  if(audioLoaded&&(!keepLinkedClock||ctxAudio?.state!=='running'))await activateAudio();
}
ui.start.addEventListener('click',resumeGame);
ui.menu.addEventListener('click',openMenu);
ui.close.addEventListener('click',resumeGame);
ui.sound.addEventListener('click',toggleSound);
ui.fullscreen.addEventListener('click',async()=>{
  if(document.fullscreenElement)await document.exitFullscreen();
  else await document.documentElement.requestFullscreen?.();
});
ui.dropzone.addEventListener('keydown',e=>{
  if(e.key==='Enter'||e.key===' '){e.preventDefault();ui.input.click();}
});
ui.overlay.addEventListener('keydown',e=>{
  if(e.key!=='Tab')return;
  const targets=[...ui.overlay.querySelectorAll('button:not([disabled]),a[href],[tabindex="0"],input:not([disabled]):not([type="file"]),select:not([disabled]),textarea:not([disabled]),summary')].filter(el=>{
    if(!el.getClientRects().length || el.tabIndex<0)return false;
    if(el.type==='radio' && el.name){
      const group=[...ui.overlay.querySelectorAll('input[type="radio"]')].filter(input=>input.name===el.name && input.getClientRects().length);
      return el===(group.find(input=>input.checked)||group[0]);
    }
    return true;
  });
  const first=targets[0],last=targets.at(-1);
  if(e.shiftKey && document.activeElement===first){e.preventDefault();last.focus();}
  else if(!e.shiftKey && document.activeElement===last){e.preventDefault();first.focus();}
});
let hudTimer;
function showHUD(){
  document.documentElement.classList.add('hud-visible');clearTimeout(hudTimer);
  hudTimer=setTimeout(()=>document.documentElement.classList.remove('hud-visible'),2200);
}
window.addEventListener('pointermove',showHUD);
window.addEventListener('pointerdown',showHUD);
window.addEventListener('pagehide',()=>{room.leave({unloading:true});simulationClock?.stop();stopFeedback();saveNVRAM();});
document.addEventListener('visibilitychange',()=>{
  room.visibilityChanged();
  if(document.hidden){saveNVRAM();held.clear();keyboardControls.reset();stopFeedback();if(started&&!room.active)openMenu();}
});
export function getArcadeState(){return {environment:environment.state(),running,enhanced,multiplayer:room.snapshot(),linkState:wasm?._daytona_link_state(),linkId:wasm?._daytona_link_id(),linkCount:wasm?._daytona_link_count(),drawDistance:wasm?._daytona_draw_distance(),volume:settings.volume,uiVolume:settings.uiVolume,uiAudioGain:uiAudioGain?.gain.value,keyboard:{...keyboardControls.bindings},wheel:wheelControls.preview(),audioGain:audioGain?.gain.value,audioState:ctxAudio?.state||'uninitialized',soundMuted,touch:touch.read(),gear:currentGear,ready:!!wasm?._daytona_ready(),frames:wasm?._daytona_total_frames()||0,width:wasm?._daytona_width(),height:wasm?._daytona_height()};}
document.documentElement.classList.add('launcher-open');
gameSurface.inert=true;
ui.dropzone.focus();

requestAnimationFrame(frame);
async function main() {
  setStatus('Loading engine…');
  const factory = typeof createDaytonaModule === 'function' ? createDaytonaModule : window.createDaytonaModule;
  if(typeof factory!=='function'){
    engineStartupError='The arcade engine files could not be loaded. Reload the page and check that all files were uploaded.';
    setStatus('Engine files missing');
    ui.message.textContent=engineStartupError;
    return;
  }
  try{
    wasm=await factory({locateFile:(path)=>path+'?v=53.8.24'});
    for(const name of ['_daytona_set_single_skin','_daytona_set_player_skin','_daytona_prepare_visual','_daytona_visual_updates','_daytona_tiles_ptr','_daytona_tiles_versions_ptr','_daytona_tiles_metadata_ptr','_daytona_set_display','_daytona_vertices_ptr','_daytona_vertices_count','_daytona_batches_ptr','_daytona_batches_count','_daytona_background_ptr','_daytona_foreground_ptr','_daytona_tex0_ptr','_daytona_tex1_ptr','_daytona_texture_generation','_daytona_luma_ptr','_daytona_xlat_ptr','_daytona_rumble_strong','_daytona_rumble_weak','_daytona_rumble_centring','_daytona_set_draw_distance','_daytona_draw_distance','_daytona_set_reverse_expert','_daytona_set_reverse_course','_daytona_set_cpu_cars','_daytona_set_race_options','_daytona_link_enable','_daytona_link_receive_ptr','_daytona_link_receive','_daytona_link_tx_ptr','_daytona_link_tx_size','_daytona_link_tx_pop','_daytona_link_state','_daytona_link_id','_daytona_link_count','_daytona_callback_slots','_daytona_link_pending_bytes']) {
      if(typeof wasm[name]!=='function')throw Error('Incomplete engine build: missing '+name+'. Run scripts/build_web.ps1 again.');
    }
    renderer=await createRenderer(ui.canvas,failure,{onStatus:label=>{$('experimentalGraphicsBackend').textContent=label;}});
    applyGraphics();
    setStatus('Engine ready');
    ui.message.textContent='Choose your ROM to bring the arcade to life.';
  }catch(err){engineStartupError='Could not start the arcade engine: '+(err.message||String(err));failure(engineStartupError);}
}
engineReady=main();
void engineReady.then(()=>{if(!engineStartupError&&renderer)return romMemory.restore();}).catch(error=>console.warn('Could not restore the local ROM',error));

// Optional visit measurement runs after startup work, independently of the game.
if(globalThis.requestIdleCallback)requestIdleCallback(()=>void startAnalytics(),{timeout:5000});else setTimeout(()=>void startAnalytics(),2500);

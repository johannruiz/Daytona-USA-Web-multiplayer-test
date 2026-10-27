import {loadSingleSettings,sameSingleSettings,SINGLE_SETTINGS_ID} from './single-player-settings.js?v=53.8.30';
import {mountPlayerSkins} from './player-skins-ui.js?v=53.8.30';
import {PLAYER_SKINS} from './player-skins.js?v=53.8.30';

export function createSinglePlayerUI({storage,onOpen,onBack,onStart,getSession,unlockAudio,previews}){
 const $=id=>document.getElementById(id),panel=$('singlePlayerPanel'),form=$('singleRaceForm');
 let settings=loadSingleSettings(storage),busy=false;
 const snapshot=()=>({id:'single',phase:busy||panel.hidden?'idle':'lobby',members:[{id:'single',name:'You',cabinet:1,skin:settings.skin}],swaps:[]});
 const localChoice={snapshot,setSkin:skin=>{if(busy||panel.hidden||!PLAYER_SKINS[skin])return false;settings={...settings,skin};save();render();return true;}};
 const picker=mountPlayerSkins({root:$('menuDialog'),panel,room:localChoice,previews,context:'single'});
 function read(){return {mode:Number($('singleMode').value),difficulty:Number($('singleDifficulty').value),cpuCars:$('singleCpuCars').value==='true',reverse:$('singleDirection').value==='reverse',pitStops:$('singlePitStops').value==='true',environment:$('singleEnvironment').value,region:'Export',skin:settings.skin};}
 function render(){
  const session=getSession(),resume=session.canResume&&sameSingleSettings(settings,session.settings);
  $('singleCpuHelp').textContent=settings.cpuCars?'Race against the original arcade grid.':'Uses the original solo Time Attack mode.';
  $('singleStartLabel').textContent=busy?'PREPARING CABINET…':resume?'RESUME ARCADE':session.canResume?'APPLY & RESTART':'ENTER ARCADE';
  $('singleSessionHint').textContent=session.canResume&&!resume?'New settings restart this cabinet. Saved scores stay.':resume?'Your current session is paused and ready to resume.':'Choose your circuit and transmission in the arcade.';
  $('singleDirectionHelp').textContent=settings.reverse?'All three circuits, driven in the opposite direction.':'The original direction on all three circuits.';
  $('singleEnvironmentHelp').textContent=settings.environment==='cycle'?'Each race starts in daylight. Day and night last 1:00, with 0:30 transitions.':settings.environment==='night'?'Night racing with a light cone that follows your car.':'Original daylight on all three circuits.';$('singleLiveryName').textContent=PLAYER_SKINS[settings.skin].name;picker.sync(snapshot());
 }
 function save(){try{storage.setItem(SINGLE_SETTINGS_ID,JSON.stringify(settings));}catch{}}
 function change(){settings=read();save();$('singleStatus').textContent='';render();}
 function setBusy(value){busy=value;panel.setAttribute('aria-busy',String(value));for(const input of form.elements)input.disabled=value;$('singleBack').disabled=value;$('settingsBtn').disabled=value;render();}
 function back(){if(busy)return;picker.close(false);onBack();}
 for(const id of ['singleMode','singleDifficulty','singleCpuCars','singleDirection','singlePitStops','singleEnvironment'])$(id).addEventListener('change',change);
 $('singleBack').onclick=back;
 $('singleLivery').onclick=()=>{if(busy)return;picker.sync(snapshot());picker.open($('singleLivery'));};
 form.addEventListener('submit',async event=>{
  event.preventDefault();if(busy||picker.isOpen())return;void unlockAudio();change();setBusy(true);$('singleStatus').textContent='Applying your arcade settings…';
  try{await onStart({...settings});$('singleStatus').textContent='';}catch(error){$('singleStatus').textContent=error.message||'Could not prepare this cabinet. Please try again.';}finally{setBusy(false);if(!panel.hidden)$('singleStart').focus();}
 });
 return {
  open(){onOpen();$('singleMode').value=String(settings.mode);$('singleDifficulty').value=String(settings.difficulty);$('singleCpuCars').value=String(settings.cpuCars);$('singleDirection').value=settings.reverse?'reverse':'normal';$('singlePitStops').value=String(settings.pitStops);$('singleEnvironment').value=settings.environment;$('singleStatus').textContent='';render();$('singleMode').focus();},
  escape(){if(panel.hidden)return false;if(picker.close())return true;back();return true;},
  isChoosingLivery:()=>picker.isOpen(),
  isOpen:()=>!panel.hidden
 };
}

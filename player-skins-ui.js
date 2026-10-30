import {PLAYER_SKINS,skinOwner} from './player-skins.js?v=53.8.47';
const carIcon='<svg class="skin-car-icon" viewBox="0 0 80 40" aria-hidden="true"><path d="m8 24 5-9 13-3 7-8h21l8 9 9 3 3 13H8Z"/><path d="M30 13h29M36 6l-4 7m19-7 5 7M16 22h7m38 0h8"/><circle cx="23" cy="29" r="6"/><circle cx="60" cy="29" r="6"/></svg>';
export function mountPlayerSkins({root,room,previews,context='multiplayer',panel=document.getElementById('roomPanel')}){
 const box=document.createElement('dialog');box.className='skin-picker';box.hidden=true;box.dataset.menuPopover='';box.setAttribute('role','dialog');box.setAttribute('aria-modal','true');box.setAttribute('aria-labelledby','skinPickerTitle');
 box.innerHTML='<div class="skin-picker-card"><header><div><small>YOUR CAR</small><h2 id="skinPickerTitle">Choose your livery</h2></div><button type="button" class="ui-button ui-secondary ui-icon-button skin-close" aria-label="Close livery selection">×</button></header><p class="skin-picker-help">Original arcade appearances. Your car number and handling stay the same.</p><div class="skin-picker-grid" role="group" aria-label="Available liveries"></div><footer><p class="skin-picker-status" role="status" aria-live="polite"></p><div><button class="ui-button ui-secondary skin-cancel" type="button">Cancel</button><button class="ui-button ui-primary skin-apply" type="button">USE LIVERY <span aria-hidden="true">→</span></button></div></footer></div>';
 root.append(box);const grid=box.querySelector('.skin-picker-grid'),status=box.querySelector('.skin-picker-status'),apply=box.querySelector('.skin-apply');
 box.dataset.skinContext=context;if(context==='single'){box.querySelector('h2').id='singleSkinPickerTitle';box.setAttribute('aria-labelledby','singleSkinPickerTitle');box.querySelector('.skin-picker-help').textContent='Choose an original arcade appearance for your car. Handling stays the same.';}
 const gallery=document.createElement('div');gallery.className='skin-gallery-shell';grid.before(gallery);gallery.append(grid);
 const loadingLayer=document.createElement('div');loadingLayer.className='skin-loading-layer';loadingLayer.hidden=true;
 loadingLayer.innerHTML='<div class="skin-loading-card" tabindex="-1"><small>LOCAL ROM PREVIEWS</small><h3>Preparing your liveries</h3><p class="skin-loading-message" role="status" aria-live="polite"></p><progress class="skin-loading-progress" max="40" aria-label="Livery preparation"></progress><p class="skin-loading-detail">The first preparation may take a moment. Your ROM stays on this device.</p><button type="button" class="ui-button ui-secondary skin-loading-continue" hidden>Continue without previews</button></div>';
 gallery.append(loadingLayer);const loadingCard=loadingLayer.firstElementChild,progress=loadingLayer.querySelector('progress'),loadingMessage=loadingLayer.querySelector('.skin-loading-message'),continueButton=loadingLayer.querySelector('button');
 const buttons=PLAYER_SKINS.map(s=>{const b=document.createElement('button');b.type='button';b.className='skin-choice';b.dataset.skin=s.id;b.innerHTML='<span class="skin-preview-frame">'+carIcon+'<img class="skin-preview" width="174" height="188" alt="" hidden decoding="async"></span><strong></strong><small></small>';b.querySelector('strong').textContent=s.name;b.onclick=()=>{draft=s.id;message='';render();};grid.append(b);return b;});
 const previewStatus=document.createElement('p');previewStatus.className='skin-preview-status';previewStatus.setAttribute('role','status');box.querySelector('.skin-picker-help').after(previewStatus);
 let previewTicket=0,previewSeat=0,requested=new Set(),loading=0,failed=0,loaded=0,previewGate=false;
 function releasePreviews(){previewGate=false;loadingLayer.hidden=true;grid.inert=false;grid.setAttribute('aria-busy','false');render();if(document.activeElement===loadingCard||document.activeElement===continueButton)buttons[draft].focus({preventScroll:true});}
 continueButton.onclick=()=>{if(failed||!previews)releasePreviews();};
 function previewProgress(){
  previewStatus.textContent=!previews?'Previews unavailable. You can still choose a livery.':failed?'Some previews are unavailable. You can still choose a livery.':loading?'Preparing previews from your ROM · kept on this device.':loaded?'Previews stay on this device.':'Previews are generated locally from your ROM.';
  if(!previewGate)return;
  if(!loading&&(failed||!previews)){loadingMessage.textContent='Some previews could not be prepared. You can still choose and play.';progress.hidden=true;continueButton.hidden=false;loadingLayer.classList.add('has-error');return;}
  if(loaded===PLAYER_SKINS.length){releasePreviews();return;}
  if(loaded){progress.value=loaded;loadingMessage.textContent=`Preparing liveries · ${loaded} of ${PLAYER_SKINS.length}`;}
  else{progress.removeAttribute('value');loadingMessage.textContent='Reading your ROM and preparing car previews…';}
 }
 function requestPreview(skin){
  if(box.hidden||!previews||requested.has(skin))return;
  requested.add(skin);const ticket=previewTicket,seat=previewSeat;loading++;previewProgress();
  previews.get(skin,seat).then(async url=>{if(ticket!==previewTicket||box.hidden)return;const image=buttons[skin].querySelector('img');image.src=url;await image.decode();if(ticket!==previewTicket||box.hidden)return;image.hidden=false;buttons[skin].querySelector('.skin-preview-frame').classList.add('loaded');loaded++;}).catch(()=>{if(ticket===previewTicket&&!box.hidden)failed++;}).finally(()=>{if(ticket===previewTicket&&!box.hidden){loading--;previewProgress();}});
 }
 function startPreviews(seat){
  previewTicket++;previewSeat=seat;requested.clear();loading=failed=loaded=0;previews?.begin();previewGate=true;loadingLayer.hidden=false;loadingLayer.classList.remove('has-error');progress.hidden=false;progress.removeAttribute('value');continueButton.hidden=true;grid.inert=true;grid.setAttribute('aria-busy','true');render();
  for(const button of buttons){const image=button.querySelector('img');image.hidden=true;image.removeAttribute('src');button.querySelector('.skin-preview-frame').classList.remove('loaded');}
  requestPreview(0);requestPreview(draft);for(const skin of PLAYER_SKINS)requestPreview(skin.id);previewProgress();loadingCard.focus({preventScroll:true});
 }
 let state=null,draft=0,trigger=null,ownerID='',pending=false,message='',lastAck=0,recent=0;
 try{const saved=Number(localStorage.getItem('daytona-player-skin-v1'));if(PLAYER_SKINS[saved])recent=saved;}catch{}
 function available(){return !state?.hostTransfer&&state?.phase==='lobby'&&state.members.some(m=>m.id===state.id)&&!state.awaitingStop;}
 function close(restore=true){if(box.hidden)return false;previewTicket++;previewGate=false;loadingLayer.hidden=true;grid.inert=false;grid.setAttribute('aria-busy','false');previews?.stop();if(box.open)box.close();box.hidden=true;panel.inert=false;pending=false;message='';if(restore&&trigger?.isConnected&&!trigger.disabled&&!trigger.hidden)trigger.focus({preventScroll:true});return true;}
 function render(){
  const me=state?.members.find(m=>m.id===state.id);if(!me)return;
  for(const s of PLAYER_SKINS){const button=buttons[s.id],owner=skinOwner(state.members,s.id,state.id);button.disabled=!!owner||pending||previewGate;button.setAttribute('aria-pressed',String(draft===s.id));button.classList.toggle('skin-current',(me.skin??0)===s.id);button.querySelector('small').textContent=owner?`Reserved · ${owner.name}`:s.id===0?`Original car ${me.cabinet}`:(me.skin??0)===s.id?(context==='single'?'Your selected livery':'Your reserved livery'):s.id===recent?'Last used':'Available';}
  const owner=skinOwner(state.members,draft,state.id),blocked=!available()||(state.swaps||[]).some(s=>s.from===state.id||s.to===state.id);
  apply.disabled=pending||!!owner||blocked||previewGate;apply.firstChild.textContent=pending?'CONFIRMING… ':'USE LIVERY ';
  status.textContent=message|| (previewGate?'Preparing previews. You can cancel at any time.':context==='single'?'Your choice is saved for single player. Changing it restarts a paused session.':owner?`This livery was just reserved by ${owner.name}. Choose another.`:pending?'Confirming your reservation with the host…':blocked?'Finish your seat swap before changing liveries.':'Your choice is reserved in this room. Changes reset Ready.');
 }
 function open(button){if(!available())return;trigger=button;ownerID=state.id;draft=state.members.find(m=>m.id===state.id)?.skin??0;message='';pending=false;lastAck=state.lastAck?.command||0;box.hidden=false;if(typeof box.showModal==='function')box.showModal();panel.inert=true;render();buttons[draft].scrollIntoView({block:'nearest'});startPreviews(state.members.find(m=>m.id===state.id).cabinet);}
 box.addEventListener('focusin',e=>{const button=e.target.closest('.skin-choice');if(button)requestPreview(Number(button.dataset.skin));});
 document.addEventListener('visibilitychange',()=>{if(document.hidden)close(false);});
 window.addEventListener('pagehide',()=>close(false));
 box.querySelector('.skin-close').onclick=box.querySelector('.skin-cancel').onclick=()=>close();
 box.addEventListener('cancel',e=>{e.preventDefault();close();});
 box.addEventListener('pointerdown',e=>{if(e.target===box)close();});
 box.addEventListener('keydown',e=>{
  if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close();}
  if(e.key==='Tab'){const enabled=[...box.querySelectorAll('button')].filter(b=>!b.disabled);if(e.shiftKey&&document.activeElement===enabled[0]){e.preventDefault();enabled.at(-1).focus();}else if(!e.shiftKey&&document.activeElement===enabled.at(-1)){e.preventDefault();enabled[0].focus();}e.stopPropagation();}
 });
 apply.onclick=()=>{if(apply.disabled)return;const before=state.members.find(m=>m.id===state.id)?.skin??0;if(draft===before){close();return;}pending=true;render();if(!room.setSkin(draft)){pending=false;message=room.snapshot().error||'Your livery could not be reserved. Try again.';render();}else sync(room.snapshot());};
 function sync(next){state=next;if(box.hidden)return;if(!available()||ownerID!==state.id){close(false);return;}const me=state.members.find(m=>m.id===state.id);if(previewSeat!==me.cabinet)startPreviews(me.cabinet);if(pending&&(me.skin??0)===draft){recent=draft;try{localStorage.setItem('daytona-player-skin-v1',String(draft));}catch{}close();return;}if(pending&&state.lastAck?.action==='set-skin'&&state.lastAck.command>lastAck){lastAck=state.lastAck.command;if(!state.lastAck.accepted){pending=false;message=state.lastAck.reason;}}render();}
 return {open,close,sync,isOpen:()=>!box.hidden};
}

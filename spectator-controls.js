import {spectatorMarkup,mountSpectatorFullscreen} from './spectator-view.js?v=53.8.24';
import {mountSpectatorChat} from './spectator-chat.js?v=53.8.24';
import {parseInvitation} from './room-settings.js?v=53.8.24';
import {createSpectatorPlayback} from './spectator-playback.js?v=53.8.24';
const eye='<svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>';
const seat='<svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3h6a2 2 0 0 1 2 2v8H6V5a2 2 0 0 1 2-2ZM6 13h12v4H6zM8 17v4M16 17v4M4 10v7M20 10v7"/></svg>';
export function spectatorURL(code){parseInvitation(code);const url=new URL('./',location.href);url.hash=new URLSearchParams({room:code}).toString();return url.href;}
export function mountSpectatorControls(room,{getROM=()=>null,getVolume=()=>1,onRead=()=>{}}={}){
 const $=id=>document.getElementById(id),button=document.createElement('button');button.id='roomRole';button.type='button';button.className='ui-button ui-secondary';button.hidden=true;document.querySelector('.room-actions').insertBefore(button,document.querySelector('.action-spacer'));
 const section=document.createElement('section');section.className='room-spectators';section.hidden=true;section.innerHTML='<div class="section-label"><h3>'+eye+'SPECTATORS</h3><span data-count></span></div><ul aria-label="Spectators"></ul><p data-role-status role="status" aria-live="polite"></p><button id="watchRoom" class="ui-button ui-secondary" type="button">'+eye+'WATCH SESSION</button>';
 $('roomWorkspace').insertAdjacentElement('afterend',section);
 const dialog=document.createElement('dialog');dialog.id='integratedSpectator';dialog.className='integrated-spectator';dialog.setAttribute('data-menu-popover','');dialog.setAttribute('aria-labelledby','spectatorTitle');dialog.hidden=true;
 dialog.innerHTML=spectatorMarkup();
 $('menuDialog').append(dialog);
 const fullscreen=mountSpectatorFullscreen(dialog),chat=mountSpectatorChat(dialog,{room,onRead});
 const toolbarResize=new ResizeObserver(([entry])=>dialog.querySelector('.spectator-workspace').style.setProperty('--spectator-toolbar-height',`${entry.borderBoxSize?.[0]?.blockSize??entry.target.offsetHeight}px`));toolbarResize.observe(dialog.querySelector('.spectator-toolbar'));
 let playback=null,lastWaiting='';
 function ensurePlayback(){if(!playback){playback=createSpectatorPlayback({room,getROM,getVolume,root:dialog});playback.warm();playback.visible(dialog.open);}return playback;}
 function close(){if(!dialog.open)return false;fullscreen.exit();chat.visible(false);dialog.close();dialog.hidden=true;playback?.visible(false);$('watchRoom').focus({preventScroll:true});return true;}
 function open(){if(!room.waiters.get(room.id)?.spectator)return;ensurePlayback();dialog.hidden=false;if(!dialog.open)dialog.showModal();playback?.visible(true);chat.visible(true);$('closeSpectator').focus({preventScroll:true});}
 $('closeSpectator').onclick=close;$('watchRoom').onclick=open;dialog.addEventListener('close',()=>{fullscreen.exit();chat.visible(false);dialog.hidden=true;playback?.visible(false);});dialog.addEventListener('keydown',e=>{if(e.key==='Tab'){e.stopPropagation();const targets=[...dialog.querySelectorAll('button,input,select,a[href],[tabindex="0"]')].filter(n=>!n.disabled&&!n.closest('[hidden]')&&n.getClientRects().length&&getComputedStyle(n).visibility!=='hidden'),first=targets[0],last=targets.at(-1);if(first&&(e.shiftKey&&document.activeElement===first||!e.shiftKey&&document.activeElement===last)){e.preventDefault();(e.shiftKey?last:first).focus({preventScroll:true});}}if(e.key==='Escape'){e.preventDefault();e.stopPropagation();if(fullscreen.active)fullscreen.exit();else close();}});
 button.onclick=()=>{const spectating=room.waiters.get(room.id)?.spectator;room.setRole(spectating?'driver':'spectator');};
 return {
  close,isOpen:()=>dialog.open,state:()=>playback?.state()||{},
  message(d){if(!room.waiters.get(room.id)?.spectator)return;ensurePlayback().message(d);if(d.type==='spectator-assignment')open();},
  render(){
   const state=room.snapshot();chat.sync(state);dialog.querySelector('#spectatorRoomName').textContent=state.roomName||(state.visibility==='public'?'Public room':'Private room');dialog.querySelector('#spectatorMetrics').hidden=!$('diagnosticsEnabled').checked;
   const observers=state.waiting.filter(w=>w.spectator&&!w.needsApproval),me=state.waiting.find(w=>w.id===state.id),spectating=!!me?.spectator;
   const openSeat=Array.from({length:8},(_,i)=>i+1).find(seat=>!state.members.some(m=>m.cabinet===seat)&&!state.waiting.some(w=>!w.spectator&&w.cabinet===seat));
   const rolePhase=state.isHost?state.phase:state.phase==='waiting'?state.remotePhase:state.phase;
   button.hidden=!room.occupied||!state.members.some(m=>m.id===state.id)&&!me||!!me?.needsApproval;
   button.innerHTML=spectating?seat+(rolePhase==='lobby'?'TAKE A SEAT':'JOIN NEXT RACE'):eye+'SPECTATE';
   button.disabled=state.rolePending||state.awaitingStop||(spectating?!openSeat||state.isHost&&rolePhase!=='lobby':(!me&&rolePhase!=='lobby')||observers.length>=8);
   button.title=state.isHost&&spectating&&rolePhase!=='lobby'?'Return everyone to the lobby before taking a host seat.':state.rolePending?'Waiting for host confirmation':spectating?!openSeat?'All seats are occupied. Watch until a driver frees a seat.':rolePhase==='lobby'?'Take the first free seat and confirm Ready.':'Reserve a free seat for the next arcade session.':rolePhase!=='lobby'&&!me?'Return to the lobby before releasing your seat.':me?'Release your next-race reservation and watch now.':'Release your driver seat and watch the race.';
   section.hidden=!observers.length&&!spectating;$('watchRoom').hidden=!spectating;
   const stamp=JSON.stringify(observers.map(w=>[w.id,w.name,w.connection]));if(stamp!==lastWaiting){lastWaiting=stamp;section.querySelector('ul').replaceChildren(...observers.map(w=>{const li=document.createElement('li');li.textContent=w.name+(w.id===state.id?' · You':'')+(w.id===state.host?' · Host':'')+(w.connection==='reconnecting'?' · Reconnecting':'');if(state.isHost&&w.id!==state.id){const remove=document.createElement('button');remove.type='button';remove.className='remove-spectator';remove.textContent='×';remove.setAttribute('aria-label',`Remove spectator ${w.name}`);remove.onclick=()=>room.kick(w.id);li.append(remove);}return li;}));}
   section.querySelector('[data-count]').textContent=String(observers.length);
   const ack=state.lastAck?.action==='set-role'&&!state.lastAck.accepted?state.lastAck.reason:'';section.querySelector('[data-role-status]').textContent=ack;section.querySelector('[data-role-status]').hidden=!ack;
   if(spectating&&!me?.needsApproval)ensurePlayback();
   else if(playback){close();playback.dispose();playback=null;}
   if(!room.occupied){close();lastWaiting='';}
   playback?.sync(state);
  }
 };
}

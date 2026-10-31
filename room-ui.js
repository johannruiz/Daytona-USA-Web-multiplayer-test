import {mountRoomName} from './room-name-ui.js?v=53.8.57';
import {mountHostTransfer} from './host-transfer-ui.js?v=53.8.57';
import {mountRoomInvitation} from './room-invitation.js?v=53.8.57';
import {mountWaitingToast} from './waiting-room.js?v=53.8.57';
import {PublicRoomDirectory} from './public-rooms.js?v=53.8.57';
import {createFirebaseDirectoryBackend} from './firebase-client.js?v=53.8.57';
import {mountPublicRoomBrowser} from './public-rooms-ui.js?v=53.8.57';
import {carColor} from './car-colors.js?v=53.8.57';
import {parseInvitation,invitation} from './room-settings.js?v=53.8.57';
import {createLobbyNotifications} from './lobby-notifications.js?v=53.8.57';
import {mountPlayerSkins} from './player-skins-ui.js?v=53.8.57';
import {PLAYER_SKINS} from './player-skins.js?v=53.8.57';
import {createChatFollow} from './chat-follow.js?v=53.8.57';
const $=id=>document.getElementById(id);
export function invitationFromURL(href){return new URLSearchParams(new URL(href).hash.slice(1)).get('room')||'';}
export function createRoomUI(room,{single,unlockAudio,previews,canResume=()=>false,enableArrivalNotifications=()=>{},notifyRequest=()=>{},notifyChat=()=>{},notifyReady=()=>{},notifyConfirmed=()=>{}}){
 const panel=$('roomPanel'),choices=$('playerModes'),entry=$('multiplayerEntry'),singlePanel=$('singlePlayerPanel');
 const invitationMenu=mountRoomInvitation({container:$('roomInvite'),trigger:$('inviteRoom'),content:$('inviteBlock'),closeButton:$('closeInvite'),initialFocus:$('copyRoom')});let invitePhase='';
 const directory=new PublicRoomDirectory({backend:createFirebaseDirectoryBackend});
 let verified=false,view='loading',pendingStamp='',lastPhase='',lastURL='',roomKey='',unread=0,lastChatSeq=0,lastAckCommand=0,lastSeatAck=0,previousSeat=null,focusSeatReady=false,swapStamp='';
 const cards=new Map(),emptySeats=new Map(),messages=new Map();
 const skinPicker=mountPlayerSkins({root:$('menuDialog'),room,previews});
 const hostTransfer=mountHostTransfer({room,root:$('menuDialog')});
 const roomNameEditor=mountRoomName({room,root:$('menuDialog'),trigger:$('editRoomName')});
 $('roomLivery').onclick=()=>skinPicker.open($('roomLivery'));
 const toast=mountWaitingToast(document.getElementById('waitingToast'));
 const notifications=createLobbyNotifications({notifyChat,notifyReady,notifyConfirmed});
 let entryBusy=false;
 function entryAction(fn){return action(async()=>{if(entryBusy)return;entryBusy=true;$('createRoom').disabled=$('joinRoom').disabled=true;try{await fn();}finally{entryBusy=false;$('createRoom').disabled=$('joinRoom').disabled=false;}});}
 const utilities=document.querySelector('.menu-quick-controls'),utilitiesHome=utilities.parentElement;
 try{const name=localStorage.getItem('daytona-driver-name-v1');if(name)$('driverName').value=name.slice(0,24);}catch{}
 function layout(active,showGuide=false){$('menuDialog').classList.remove('single-view');singlePanel.hidden=true;$('menuDialog').classList.toggle('mp-view',active);$('menuDialog').classList.toggle('mp-entry',active&&showGuide);$('mpUtilities').hidden=!active;const target=active?$('mpUtilities'):utilitiesHome;if(utilities.parentElement!==target)target.append(utilities);}
 function navigation(next=view){
  if(next!=='room'){roomNameEditor.close(false);invitationMenu.close();skinPicker.close(false);}
  view=next;
  $('projectSupport').hidden=!['loading','modes','entry','single'].includes(view)||canResume();
  choices.hidden=view!=='modes'||!verified;
  const resume=view==='modes'&&verified&&canResume();
  $('startBtn').hidden=!resume;$('closeBtn').hidden=!resume;
  if(resume){$('startBtn').disabled=false;$('startLabel').textContent='Resume arcade';}
 }
 function hint(){const code=$('joinCode').value.trim();let valid=false;try{parseInvitation(code);valid=true;}catch{}
  $('joinCard').classList.toggle('has-invitation',valid);$('invitationHint').textContent=valid?(code===invitationFromURL(location.href)?'Invitation loaded. Enter your name and join.':'Invitation ready. Your host approves the request.'):code?'Paste a complete invitation link or room code.':'Your host will approve your request.';
 }
 function setURL(code){const url=new URL(location.href),hash=new URLSearchParams(url.hash.slice(1));if(code)hash.set('room',code);else hash.delete('room');url.hash=hash.toString();history.replaceState(history.state,'',url.href);lastURL=code;}
 function syncInvitation(navigate=false){
  const code=invitationFromURL(location.href),changed=code!==lastURL;lastURL=code;$('joinCode').value=code;hint();
  if(!navigate||!verified||!code)return;
  let valid=false;try{parseInvitation(code);valid=true;}catch{}
  if(changed&&valid&&room.occupied&&!room.active&&room.phase!=='preparing'&&room.snapshot().code!==code)room.leave();
  if(['idle','error'].includes(room.phase))showEntry(false);
 }
 function showEntry(sync=true){directory.setBrowsing(true);if(sync)syncInvitation();layout(true,true);navigation('entry');entry.hidden=false;panel.hidden=true;$('entryStatus').textContent='';$('message').textContent='Find a public room, or race privately with friends.';$('menuDialog').setAttribute('aria-labelledby','entryTitle');const name=$('driverName');name.focus();name.setSelectionRange(name.value.length,name.value.length);}
 function showModes(){directory.setBrowsing(false);layout(false);entry.hidden=true;panel.hidden=true;navigation('modes');$('menuDialog').setAttribute('aria-labelledby','gameTitle');if(verified)$('message').textContent='ROM verified. Choose Single Player or Multiplayer.';}
 function action(fn){return async()=>{try{$('entryStatus').textContent='';await fn();}catch(e){$('entryStatus').textContent=e.message;$('roomMessage').textContent=e.message;$('message').textContent=e.message;}};}
 function rememberName(){try{localStorage.setItem('daytona-driver-name-v1',$('driverName').value.trim().slice(0,24));}catch{}}
 $('driverName').addEventListener('input',rememberName);
 $('driverName').addEventListener('change',rememberName);
 $('joinCode').addEventListener('input',hint);
 window.addEventListener('hashchange',()=>syncInvitation(true));
 window.addEventListener('popstate',()=>syncInvitation(true));
 window.addEventListener('pageshow',()=>{syncInvitation(true);requestAnimationFrame(()=>syncInvitation(true));});
 syncInvitation();
 $('singlePlayer').onclick=action(async()=>{setURL('');room.leave();showModes();await single();});
 $('multiplayerPlayer').onclick=()=>showEntry();
 $('modeBack').onclick=()=>{setURL('');showModes();};
 $('createRoom').onclick=entryAction(async()=>{void unlockAudio();void enableArrivalNotifications();rememberName();const visibility=document.querySelector('input[name="roomVisibility"]:checked').value;if(visibility==='public'){await directory.prepare();if(view!=='entry'||entry.hidden)return;}setURL('');directory.setBrowsing(false);panel.hidden=false;entry.hidden=true;await room.create($('driverName').value,{visibility,roomName:$('publicRoomName').value});if(room.phase==='lobby')setURL(room.snapshot().code);});
 $('joinRoom').onclick=entryAction(async()=>{directory.setBrowsing(false);void unlockAudio();const parsed=parseInvitation($('joinCode').value);void enableArrivalNotifications();rememberName();setURL(invitation(parsed.host,parsed.token));panel.hidden=false;entry.hidden=true;await room.join($('joinCode').value,$('driverName').value);});
 mountPublicRoomBrowser(directory,{join:async (listed,role='driver')=>{try{void unlockAudio();void enableArrivalNotifications();rememberName();directory.setBrowsing(false);setURL(listed.invite);panel.hidden=false;entry.hidden=true;await room.join(listed.invite,$('driverName').value,{publicRoom:true,role});}catch(e){$('entryStatus').textContent=e.message;showEntry(false);}}});
 $('pendingJump').onclick=()=>{const first=$('pendingList').querySelector('button:not(:disabled)');if(first){first.focus({preventScroll:true});first.scrollIntoView({block:'nearest',inline:'nearest'});}};
 $('leaveRoom').onclick=()=>{room.leave();showEntry();};
 $('seatSwapAccept').onclick=()=>{const o=room.swapFor(room.id);if(o)room.answerSwap(o.id,true);};
 $('seatSwapDecline').onclick=()=>{const o=room.swapFor(room.id);if(o)room.answerSwap(o.id,false);};
 $('seatSwapCancel').onclick=()=>{const o=room.swapFor(room.id);if(o)room.cancelSwap(o.id);};
 $('readyRoom').onclick=()=>{void unlockAudio();const me=room.members.find(x=>x.id===room.id);room.ready(!me?.ready);};
 $('startRoom').onclick=action(async()=>{void unlockAudio();await room.start();});
 $('stopRoom').onclick=()=>room.end('The host returned everyone to the room.',room.id,'requested-stop','action');
 async function copyInvitation(value,message){
  try{await navigator.clipboard.writeText(value);$('inviteFeedback').dataset.state='success';$('inviteFeedback').textContent=message;$('roomMessage').textContent=message;}
  catch{$('inviteFeedback').dataset.state='error';$('inviteFeedback').textContent='Could not copy automatically. Select the link and copy it manually.';}
 }
 $('copyRoom').onclick=()=>copyInvitation($('inviteLink').value,'Link copied. Share it with your friends.');
 $('copyCode').onclick=()=>copyInvitation($('roomCode').textContent,'Room code copied.');
 $('inviteRoom').addEventListener('click',()=>{if(invitationMenu.isOpen()){$('inviteFeedback').textContent='';delete $('inviteFeedback').dataset.state;}});
 $('inviteLink').onclick=event=>event.target.select();
 $('returnRoomGame').onclick=()=>$('startBtn').click();
 // Page choice belongs to this browser; room updates must never steal it.
 const settingPages=[['raceSetupPage','Race setup'],['raceRulesPage','Race rules'],['raceEnvironmentPage','Environment']];let settingPage=0;
 function turnSettingsPage(direction){
  settingPage=(settingPage+direction+settingPages.length)%settingPages.length;
  settingPages.forEach(([id],i)=>{$(id).hidden=i!==settingPage;});
  const title=$('racePageTitle');title.replaceChildren(document.createTextNode(settingPages[settingPage][1]+' '));
  const count=document.createElement('small');count.textContent=`${settingPage+1} / ${settingPages.length}`;title.append(count);
 }
 $('racePagePrevious').onclick=()=>turnSettingsPage(-1);$('racePageNext').onclick=()=>turnSettingsPage(1);
 const change=()=>room.setSettings({mode:Number($('roomMode').value),difficulty:Number($('roomDifficulty').value),cpuCars:$('roomCpuCars').value==='true',reverse:$('roomDirection').value==='reverse',playerCollisions:$('roomPlayerCollisions').value==='true',pitStops:$('roomPitStops').value==='true',cpuLiveries:$('roomCpuLiveries').value,environment:$('roomEnvironment').value,region:'Export'});
 $('roomMode').onchange=change;$('roomDifficulty').onchange=change;$('roomCpuCars').onchange=change;$('roomDirection').onchange=change;$('roomPlayerCollisions').onchange=change;$('roomPitStops').onchange=change;$('roomCpuLiveries').onchange=change;$('roomEnvironment').onchange=change;
 function markRead(){unread=0;for(const id of ['chatUnread','mobileChatUnread'])$(id).hidden=true;$('newChatMessages').hidden=true;}
 const chatFollow=createChatFollow($('chatLog'),{onBottom:()=>{if(!document.hidden&&$('chatLog').getClientRects().length)markRead();}});
 function scrollChat(){chatFollow.latest();markRead();}
  function mobileTab(tab){panel.dataset.mobileTab=tab;for(const [id,name] of [['roomGridTab','grid'],['roomChatTab','chat']]){$(id).setAttribute('aria-selected',String(tab===name));$(id).tabIndex=tab===name?0:-1;}if(tab==='chat')chatFollow.refresh();}
 $('roomGridTab').onclick=()=>mobileTab('grid');$('roomChatTab').onclick=()=>mobileTab('chat');
 for(const id of ['roomGridTab','roomChatTab'])$(id).addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();const chat=e.key==='End'||(e.key!=='Home'&&id==='roomGridTab');mobileTab(chat?'chat':'grid');$(chat?'roomChatTab':'roomGridTab').focus();}});
 $('newChatMessages').onclick=scrollChat;
 $('newChatMessages').addEventListener('pointerdown',event=>{if(event.button===0)event.preventDefault();});
 $('chatLog').addEventListener('scroll',()=>{const log=$('chatLog');if(!document.hidden&&log.clientHeight>0&&log.getClientRects().length&&log.scrollTop+log.clientHeight>=log.scrollHeight-20)markRead();});
 $('chatInput').addEventListener('input',()=>{$('chatLength').textContent=`${$('chatInput').value.length}/240`;$('chatSend').disabled=!room.chatAllowed(room.id)||!$('chatInput').value.trim();});
 $('chatInput').addEventListener('pointerdown',()=>{void unlockAudio();});
 $('chatForm').addEventListener('submit',e=>{e.preventDefault();void unlockAudio();try{if(room.submitChat($('chatInput').value)){$('chatInput').value='';$('chatLength').textContent='0/240';$('chatSend').disabled=true;$('chatFeedback').textContent=room.isHost?'Message sent.':'Sending…';scrollChat();$('chatInput').focus();}}catch(err){$('chatFeedback').textContent=err.message;}});
 function renderChat(state){
  const log=$('chatLog'),visible=log.getClientRects().length>0,nearBottom=chatFollow.following,chat=state.chat||[];
  const anchor=visible&&!nearBottom?[...messages.values()].find(node=>node.getBoundingClientRect().bottom>log.getBoundingClientRect().top):null,anchorTop=anchor?.getBoundingClientRect().top;
  const wanted=new Set(chat.map(m=>m.seq));for(const [seq,node] of messages)if(!wanted.has(seq)){node.remove();messages.delete(seq);}
  let added=0,own=false;
  for(const m of chat){if(messages.has(m.seq))continue;const li=document.createElement('li'),header=document.createElement('div'),name=document.createElement('strong'),time=document.createElement('time'),text=document.createElement('p');
   li.className=`chat-message${m.sender===state.id?' own-message':''}`;name.textContent=m.sender===state.id?'You':m.name;time.dateTime=new Date(m.time).toISOString();time.textContent=new Date(m.time).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});header.append(name,time);text.textContent=m.text;li.append(header,text);log.append(li);messages.set(m.seq,li);if(m.seq>lastChatSeq){added++;own||=m.sender===state.id;}lastChatSeq=Math.max(lastChatSeq,m.seq);
  }
  $('chatEmpty').hidden=chat.length>0;
  if(added){if(own)scrollChat();else {unread+=added;if(nearBottom)chatFollow.refresh();for(const id of ['chatUnread','mobileChatUnread']){$(id).hidden=false;$(id).textContent=String(unread);}}}
  if(!own&&anchor&&log.contains(anchor))log.scrollTop+=anchor.getBoundingClientRect().top-anchorTop;
  $('newChatMessages').hidden=!unread||chatFollow.following;
  const admitted=state.members.some(m=>m.id===state.id)||state.waitingForRace,enabled=!!state.chatAvailable&&admitted;
  $('chatInput').disabled=!enabled;$('chatSend').disabled=!enabled||!$('chatInput').value.trim();
  if(!enabled)$('chatFeedback').textContent=state.phase==='reconnecting'?'Reconnecting. Your chat will be restored.':admitted?'Chat returns in attract mode.':'Chat opens after the host admits you.';
  else if(state.lastAck&&state.lastAck.command>lastAckCommand){lastAckCommand=state.lastAck.command;if(state.lastAck.action==='chat-submit')$('chatFeedback').textContent=state.lastAck.accepted?'Confirmed by host.':state.lastAck.reason;}
  else if(!['Message sent.','Sending…','Confirmed by host.','Wait a moment before sending another message.'].includes($('chatFeedback').textContent))$('chatFeedback').textContent=state.waitingForRace?'Chat is available while you wait for the next race.':'Only players in this room can read this chat.';
 }
 function renderRoster(state){
  const sessionPhase=state.phase==='waiting'?state.remotePhase:state.phase;
  const roster=[...state.members.map(m=>m.paused?{...m,waiting:true}:m),...(state.waiting||[]).filter(w=>!w.spectator).map(w=>({...w,waiting:true}))],list=$('playersList'),me=roster.find(m=>m.id===state.id),wanted=new Set(roster.map(m=>m.id));
  for(const [id,card] of cards)if(!wanted.has(id)){card.li.remove();cards.delete(id);}
  const showSeats=['lobby','waiting','reconnecting'].includes(state.phase)&&(!!me||state.spectating)||state.isHost&&state.spectating,occupied=new Set(roster.map(m=>m.cabinet));
  for(const [seat,node] of emptySeats)if(!showSeats||occupied.has(seat)){node.remove();emptySeats.delete(seat);}
  const nodes=new Map();
  for(const m of roster){let c=cards.get(m.id);if(!c){const li=document.createElement('li'),number=document.createElement('span'),info=document.createElement('div'),name=document.createElement('strong'),role=document.createElement('small'),status=document.createElement('span'),remove=document.createElement('button'),swap=document.createElement('button');
    li.className='driver-card';number.className='cabinet-number';info.className='driver-info';status.className='driver-status';remove.type='button';remove.className='remove-driver';remove.textContent='×';remove.onclick=()=>{if(room.kick(m.id))$('readyRoom').focus();};swap.type='button';swap.className='seat-swap';const action=document.createElement('span');action.className='seat-card-action';action.textContent='⇄ Request swap';swap.append(action);swap.onclick=()=>room.isHost?hostTransfer.openOptions(m.id,swap):room.requestSwap(m.id);info.append(name,role);li.append(number,info,status,swap,remove);c={li,number,name,role,status,remove,swap};cards.set(m.id,c);}
   c.remove.disabled=!!state.hostTransfer;


   const reconnecting=m.connection==='reconnecting',color=carColor(m.cabinet),reserved=(state.swaps||[]).some(o=>o.from===m.id||o.to===m.id);c.li.style.setProperty('--car-color',color.color);c.number.title=`Car ${m.cabinet} · ${color.name}`;c.swap.hidden=m.waiting||me?.waiting||m.id===state.id||state.phase!=='lobby';c.swap.disabled=!!state.hostTransfer||reconnecting||(!state.isHost&&(reserved||!!state.seatActionPending||(state.swaps||[]).some(o=>o.from===state.id||o.to===state.id)));c.swap.firstElementChild.textContent=state.isHost?'••• More options':'⇄ Request swap';c.swap.setAttribute('aria-label',state.isHost?`More options for ${m.name}`:`Request a swap with ${m.name}, car ${m.cabinet}`);c.swap.setAttribute('aria-haspopup',state.isHost?'dialog':'false');c.swap.title=state.isHost?'Driver options':c.swap.disabled?'Seat reserved until the current request or reconnection ends.':`Request car ${m.cabinet} in exchange for yours`;c.li.dataset.seat=m.cabinet;c.li.classList.toggle('own-seat',m.id===state.id);c.li.classList.toggle('driver-waiting',!!m.waiting);c.li.classList.toggle('driver-ready',m.ready&&!reconnecting&&sessionPhase==='lobby');c.li.classList.toggle('driver-in-game',!m.waiting&&sessionPhase==='playing'&&!reconnecting);c.li.classList.toggle('driver-preparing',!m.waiting&&sessionPhase==='preparing'&&!reconnecting);c.li.classList.toggle('driver-reconnecting',reconnecting);c.number.textContent=String(m.cabinet).padStart(2,'0');c.name.textContent=m.name;c.name.title=m.name;c.li.dataset.skin=String(m.skin??0);c.role.textContent=`${m.id===state.id?'You · ':''}${m.departed?'Left race':m.waiting?'Next race':m.id===state.host?'Host':'Driver'}${reconnecting?' · Seat reserved':m.rtt==null?'':' · '+m.rtt+' ms'}`;if(m.skin)c.role.textContent+=' · '+PLAYER_SKINS[m.skin].name;c.role.title=m.rtt==null?'':`Connection round-trip estimate: ${m.rtt} ms`;c.status.textContent=m.departed?'LEFT':reconnecting?'RETRY':(m.waiting||m.paused)?(m.needsApproval?'REQUESTED':'WAITING'):sessionPhase==='playing'?'IN GAME':sessionPhase==='preparing'?'PREPARING':m.ready?'READY':'WAIT';c.status.title=reconnecting?'Reconnecting. Seat reserved for up to 30 seconds.':'';c.remove.hidden=m.waiting||!state.isHost||state.phase!=='lobby'||m.id===state.id;c.remove.title=`Remove ${m.name}`;c.remove.setAttribute('aria-label',`Remove ${m.name} from the room`);
   nodes.set(m.cabinet,c.li);
  }
  if(showSeats)for(let seat=1;seat<=8;seat++)if(!occupied.has(seat)){
   let node=emptySeats.get(seat);if(!node){node=document.createElement('li');node.className='driver-card empty-slot';node.dataset.seat=seat;
    const button=document.createElement('button'),number=document.createElement('span'),label=document.createElement('span'),action=document.createElement('span');button.type='button';button.className='seat-move';button.dataset.seat=seat;button.setAttribute('aria-label',`Move to seat ${seat}, car ${seat}`);number.className='cabinet-number';number.textContent=String(seat).padStart(2,'0');label.className='seat-label';label.textContent='Open seat';action.className='seat-action';action.textContent='Move here';button.append(number,label,action);button.onclick=()=>{if(room.snapshot().spectating){room.setRole('driver',seat);return;}if(room.moveSeat(seat))$('seatStatus').textContent=state.isHost?`Your car is ${seat}. Confirm Ready again.`:`Moving to car ${seat}…`;};node.append(button);emptySeats.set(seat,node);}
   const button=node.firstElementChild;button.disabled=!!state.hostTransfer||state.rolePending||state.isHost&&state.spectating&&state.phase!=='lobby'||!!me?.waiting||!(state.phase==='lobby'||state.spectating&&state.phase==='waiting'&&['lobby','playing','preparing'].includes(state.remotePhase))||!!state.seatActionPending||!!state.awaitingStop||(state.swaps||[]).some(o=>o.from===state.id||o.to===state.id);button.querySelector('.seat-action').textContent=state.spectating?(state.remotePhase==='lobby'?'Take seat':'Next race'):state.seatPending===seat?'Moving…':'Move here';button.setAttribute('aria-label',`${state.spectating?'Take':'Move to'} seat ${seat}, car ${seat}`);nodes.set(seat,node);
  }
  [...nodes].sort((a,b)=>a[0]-b[0]).forEach(([,node],i)=>{if(list.children[i]!==node)list.insertBefore(node,list.children[i]||null);});
  $('openSeatCount').hidden=showSeats;
  $('openSeatCount').textContent=state.members.length?`${8-roster.length} ${roster.length===7?'seat':'seats'} open · up to 8 drivers`:state.phase==='pending'?'Your host is reviewing the request.':state.phase==='error'?'Return to room selection to try another invitation.':'Preparing your private room…';
  const status=$('seatStatus');status.hidden=state.spectating||!showSeats||!!me?.waiting||!!(state.swaps||[]).find(o=>o.from===state.id||o.to===state.id);
  if((state.lastAck?.action==='move-seat'||state.lastAck?.action.startsWith('swap-'))&&state.lastAck.command>lastSeatAck){lastSeatAck=state.lastAck.command;status.textContent=state.lastAck.accepted?(state.lastAck.action==='move-seat'?`Your car is ${me?.cabinet}. Confirm Ready again.`:state.swapNotice||'Seat request confirmed.'):state.lastAck.reason;}
  else if(state.seatPending)status.textContent=`Moving to car ${state.seatPending}…`;
  else if(me&&previousSeat!==me.cabinet)status.textContent=`Your car: ${me.cabinet}. Choose an open seat to move, or a driver to request a swap.`;
  if(me&&previousSeat!==null&&previousSeat!==me.cabinet&&state.phase==='lobby')focusSeatReady=true;
  if(state.swapNotice&&!state.seatActionPending)status.textContent=state.swapNotice;
  else if(me?.ready&&!state.seatPending)status.textContent=`Your car: ${me.cabinet}. Choose an open seat to move, or a driver to request a swap.`;
  previousSeat=me?.cabinet??null;
 }
 function renderSwap(state){
  const offer=(state.swaps||[]).find(o=>o.from===state.id||o.to===state.id),box=$('seatSwap'),incoming=offer?.to===state.id;
  const show=state.phase==='lobby'&&!!offer,stamp=show?offer.id:'';
  if(!show&&box.contains(document.activeElement))focusSeatReady=true;
  panel.classList.toggle('has-seat-swap',show);box.hidden=!show;if(!show){swapStamp='';return;}
  const other=state.members.find(m=>m.id===(incoming?offer.from:offer.to));
  $('seatSwapTitle').textContent=incoming?'Swap request':'Waiting for a reply · 30 s';
  $('seatSwapMessage').textContent=incoming?`${other?.name||'A driver'} offers car ${offer.fromCabinet} for your car ${offer.toCabinet}. `:`You offered car ${offer.fromCabinet} for ${other?.name||'the driver'}’s car ${offer.toCabinet}. `;
  $('seatSwapAccept').hidden=$('seatSwapDecline').hidden=!incoming;$('seatSwapCancel').hidden=incoming;
  for(const id of ['seatSwapAccept','seatSwapDecline','seatSwapCancel'])$(id).disabled=!!state.seatActionPending;
  if(stamp!==swapStamp){swapStamp=stamp;if(incoming)notifyRequest();if(!$('overlay').hidden&&$('settingsModal').hidden&&$('hostConsole')?.hidden!==false&&!['INPUT','SELECT','TEXTAREA'].includes(document.activeElement?.tagName)){const target=$(incoming?'seatSwapAccept':'seatSwapCancel');target.focus({preventScroll:true});target.scrollIntoView({block:'nearest',inline:'nearest'});}}
 }

 return {
  single(){directory.setBrowsing(false);layout(true,true);navigation('single');$('menuDialog').classList.add('single-view');singlePanel.hidden=false;entry.hidden=true;panel.hidden=true;$('menuDialog').setAttribute('aria-labelledby','singleTitle');},
  modes(){showModes();$('singlePlayer').focus();},
  opened(){navigation();},
  backLabel(){if(roomNameEditor.isOpen())return 'Cancel rename';if(hostTransfer.isOpen())return hostTransfer.backLabel();if(skinPicker.isOpen())return 'Close liveries';if(invitationMenu.isOpen())return 'Close invite';const o=room.swapFor(room.id);return o&&!$('seatSwap').hidden&&$('seatSwap').contains(document.activeElement)?o.to===room.id?'Decline swap':'Cancel request':null;},
  escape(){if(roomNameEditor.close())return true;if(hostTransfer.close())return true;if(skinPicker.close())return true;if(invitationMenu.close(true))return true;const o=room.swapFor(room.id);if(o&&!$('seatSwap').hidden&&$('seatSwap').contains(document.activeElement)){o.to===room.id?room.answerSwap(o.id,false):room.cancelSwap(o.id);return true;}if(entry.hidden)return false;showModes();$('multiplayerPlayer').focus();return true;},
  verified(){verified=true;$('startBtn').hidden=true;$('dropzone').hidden=true;syncInvitation();if(invitationFromURL(location.href))showEntry(false);else{showModes();$('singlePlayer').focus();}},
  loading(){directory.setBrowsing(false);layout(false);verified=false;navigation('loading');entry.hidden=true;panel.hidden=true;$('dropzone').hidden=false;},
  running(){roomNameEditor.close(false);invitationMenu.close();directory.setBrowsing(false);if(!room.occupied)layout(false);navigation(room.occupied?'room':'modes');singlePanel.hidden=true;entry.hidden=true;},
  link(state,_id,count){
   // Discovery numbers the guests backwards. The lobby seat is the driver's
   // public cabinet/car number; the native link ID is transport identity only.
   const cabinet=room.members.find(member=>member.id===room.id)?.cabinet;
   const text=state===2?(cabinet?`Cabinet ${cabinet}`:`${count} cabinets`):'Linking arcade cabinets…';
   for(const name of ['networkStatus','arcadeLinkStatus'])if($(name).textContent!==text)$(name).textContent=text;
  },
  markChatRead:markRead,
  announce:event=>toast.show(event),
  render(state){hostTransfer.sync(state);skinPicker.sync(state);
   toast.sync(state);directory.updateHost(state);if(state.phase!=='idle')directory.setBrowsing(false);
   notifications.update(state);
   $('networkStatus').hidden=state.phase!=='playing';$('arcadeLinkStatus').hidden=state.phase!=='playing';
   const key=state.host||state.id||'idle';if(key!==roomKey){invitationMenu.close();roomKey=key;pendingStamp='';lastChatSeq=0;lastAckCommand=0;lastSeatAck=0;previousSeat=null;focusSeatReady=false;swapStamp='';$('seatStatus').textContent='';messages.clear();$('chatLog').replaceChildren();chatFollow.reset();cards.clear();emptySeats.clear();$('playersList').replaceChildren();$('chatInput').value='';$('chatLength').textContent='0/240';markRead();mobileTab('grid');}
   if(state.phase==='idle'){invitationMenu.setAvailable(false);return;}
   if(invitePhase!==state.phase){invitationMenu.close();invitePhase=state.phase;}
   layout(true);panel.classList.toggle('guest-room',!state.isHost);panel.classList.toggle('has-requests',state.isHost&&state.pending.length>0);panel.dataset.phase=state.phase;
   if($('settingsModal').hidden&&$('hostConsole')?.hidden!==false)$('menuDialog').setAttribute('aria-labelledby','roomTitle');
   $('startBtn').disabled=state.phase!=='playing';navigation('room');panel.hidden=false;entry.hidden=true;
   $('roomVisibilityLabel').textContent=state.visibility==='public'?'PUBLIC MULTIPLAYER':'PRIVATE MULTIPLAYER';
   const pauseNotice=$('simulationPauseNotice'),noticeWasHidden=pauseNotice.hidden;pauseNotice.hidden=!(state.phase==='waiting'&&state.members.find(m=>m.id===state.id)?.paused&&!state.members.find(m=>m.id===state.id)?.departed);
   if(noticeWasHidden&&!pauseNotice.hidden)requestAnimationFrame(()=>{if(!pauseNotice.hidden&&!$('overlay').hidden&&$('settingsModal').hidden&&$('hostConsole')?.hidden!==false&&!['INPUT','TEXTAREA'].includes(document.activeElement?.tagName)){pauseNotice.focus({preventScroll:true});pauseNotice.scrollIntoView({block:'nearest'});}});
   roomNameEditor.sync(state);$('roomTitle').textContent=state.phase==='pending'?'Request sent':state.phase==='error'?'Room unavailable':state.roomName|| (state.isHost?'Your starting grid':'Your race room');
   $('roomPhase').textContent=state.spectating?'SPECTATING':{lobby:'LOBBY',preparing:'PREPARING',playing:'ON TRACK',waiting:'NEXT RACE',pending:'WAITING',error:'OFFLINE',connecting:'CONNECTING',reconnecting:'RECONNECTING'}[state.phase]||'LOBBY';
   $('roomCount').textContent=state.phase==='pending'?'Awaiting host':`${state.members.length+(state.waiting||[]).filter(w=>!w.spectator).length} / 8 drivers`;
   if(state.code&&state.code!==lastURL)setURL(state.code);
   const url=new URL(location.href);url.hash=new URLSearchParams({room:state.code}).toString();$('inviteLink').value=state.code?url.href:'';$('roomCode').textContent=state.code||'Connecting…';invitationMenu.setAvailable(state.isHost&&!!state.code&&['lobby','preparing','playing'].includes(state.phase));
   $('roomMode').value=state.settings.mode;$('roomDifficulty').value=state.settings.difficulty;$('roomCpuCars').value=String(state.settings.cpuCars??true);$('roomDirection').value=state.settings.reverse?'reverse':'normal';$('roomPlayerCollisions').value=String(state.settings.playerCollisions??true);$('roomPitStops').value=String(state.settings.pitStops??true);$('roomCpuLiveries').value=state.settings.cpuLiveries??'multiplayer';$('roomEnvironment').value=state.settings.environment??'day';for(const id of ['roomMode','roomDifficulty','roomCpuCars','roomDirection','roomPlayerCollisions','roomPitStops','roomCpuLiveries','roomEnvironment'])$(id).disabled=!!state.hostTransfer||!state.isHost||state.phase!=='lobby';$('roomCpuLiveries').disabled||=state.settings.cpuCars===false;
   $('roomEnvironmentHelp').textContent=state.settings.environment==='cycle'?'Shared race cycle · 1:00 day / night · 0:30 transitions. Starts with each race.':state.settings.environment==='night'?'Night on every circuit. Each car view uses its own light cone.':'Original daylight on all three circuits.';$('roomSettingsHint').textContent=state.settings.reverse?'Choose any circuit. CPU cars follow this setting on all tracks.':state.isHost?'Shared by the grid. Changes reset Ready.':'Your host chooses these for everyone.';
   $('readyCount').textContent=state.phase==='waiting'&&state.remotePhase!=='lobby'||state.phase==='playing'?`${state.members.length} on track${state.waiting?.filter(w=>!w.spectator).length?' · '+state.waiting.filter(w=>!w.spectator).length+' waiting':''}`:`${state.members.filter(x=>x.ready).length} ready`;
   const localDriver=state.members.find(m=>m.id===state.id);$('roomLiveryName').textContent=localDriver?(PLAYER_SKINS[localDriver.skin??0]?.name||'Original seat livery'):'Take a seat to choose';$('roomLivery').disabled=!localDriver||state.phase!=='lobby'||!!state.awaitingStop||!!state.hostTransfer||!!state.seatActionPending;
   renderRoster(state);renderSwap(state);renderChat(state);skinPicker.sync(state);

   const stamp=state.phase+JSON.stringify(state.pending);if(stamp!==pendingStamp){pendingStamp=stamp;$('pendingList').replaceChildren(...state.pending.map(m=>{const li=document.createElement('li'),name=document.createElement('span'),accept=document.createElement('button'),decline=document.createElement('button');name.textContent=m.name+(m.spectator?' · Spectator':'')+(m.connection==='reconnecting'?' · Reconnecting…':'');name.title=m.name;accept.textContent='Admit';accept.disabled=state.phase!=='lobby'||m.connection==='reconnecting';accept.type=decline.type='button';decline.textContent='×';decline.disabled=state.phase!=='lobby';accept.setAttribute('aria-label',`Admit ${m.name}`);decline.setAttribute('aria-label',`Decline ${m.name}`);accept.onclick=()=>room.approve(m.id);decline.onclick=()=>room.reject(m.id);li.append(name,accept,decline);return li;}));}
   $('pendingBlock').hidden=!state.isHost||!state.pending.length;$('pendingCount').textContent=String(state.pending.length);$('pendingJump').hidden=!state.isHost||!state.pending.length;$('pendingJump').textContent=`Requests · ${state.pending.length}`;
   const me=state.members.find(x=>x.id===state.id);$('readyRoom').disabled=!!state.hostTransfer||!!state.awaitingStop||!!state.readyPending||!!state.seatActionPending||!!(state.swaps||[]).find(o=>o.from===state.id||o.to===state.id);$('readyRoom').hidden=state.phase!=='lobby'||!me;$('readyRoom').textContent=state.readyPending?'CONFIRMING…':me?.ready?'READY ✓':'I’M READY';$('readyRoom').setAttribute('aria-pressed',String(!!me?.ready));
   if(focusSeatReady&&!$('readyRoom').disabled){focusSeatReady=false;if(state.phase==='lobby'&&!$('overlay').hidden&&$('settingsModal').hidden&&$('hostConsole')?.hidden!==false){$('readyRoom').focus({preventScroll:true});if(document.documentElement.classList.contains('gamepad-navigation'))$('readyRoom').scrollIntoView({block:'nearest'});}}
   const preparing=state.phase==='preparing',start=$('startRoom'),startLabel=$('startRoomLabel'),startText=preparing?'PREPARING CABINET…':'START GAME';
   start.hidden=!(state.isHost&&state.phase==='lobby'||preparing&&(!!me||state.isHost));start.disabled=!!state.hostTransfer||preparing||!state.isHost||state.phase!=='lobby'||state.members.length<1||(state.pending.length>0||(state.waiting||[]).some(w=>!w.spectator))||(state.swaps||[]).length>0||state.members.some(x=>!x.ready||x.connection==='reconnecting');start.setAttribute('aria-busy',String(preparing));if(startLabel.textContent!==startText)startLabel.textContent=startText;start.lastElementChild.hidden=preparing;$('stopRoom').hidden=!state.isHost||state.phase!=='playing';
   $('leaveRoomLabel').textContent=state.phase==='playing'?'Leave game':state.phase==='error'?'Back to rooms':'Leave room';
   const waiting=state.members.filter(x=>!x.ready).length,lobby=(state.swaps||[]).length?'A seat swap is awaiting a reply.':state.pending.length?'Review the requests to complete your grid.':state.waiting?.some(w=>!w.spectator)?'A waiting driver is reconnecting. Their seat is reserved for up to 30 seconds.':state.members.length===1?(waiting?'Mark Ready to start on your own. Others can join to watch.':state.isHost?'Ready to start. Others can join to watch.':'Your grid is ready. Waiting for the host.'):waiting?`${waiting} ${waiting===1?'driver is':'drivers are'} not ready yet.`:state.isHost?'Your grid is ready. Start when you are.':'Your grid is ready. Waiting for the host.';
   const waitingMe=(state.waiting||[]).find(w=>w.id===state.id);
   const labels={waiting:state.remotePhase==='lobby'?(waitingMe?.needsApproval?'Your host can now admit you. Your seat and chat stay available.':'Your seat is being confirmed for the next race.'):(waitingMe?.needsApproval?'Seat reserved. Chat while you wait; your host will review the request in the lobby.':'You are in. Your seat is reserved for the next race; chat is available while you wait.'),connecting:'Connecting to the room…',pending:state.visibility==='public'?'Confirming your seat with the host…':'Your host will admit you shortly.',lobby,preparing:'Setting up every cabinet. Please wait…',playing:'The race keeps running while this menu is open.',error:'Try another invitation.'};
   $('roomMessage').textContent=state.hostTransfer?`Connecting everyone to ${state.hostTransfer.name}… Keep this window open.`:(!state.error&&state.phase!=='playing'?state.hostTransferNotice:'')|| (state.spectating?(state.remotePhase==='lobby'||state.isHost&&state.phase==='lobby'?'You are a spectator. Choose an open seat when you want to race.':'Watch this session, chat in the room, or reserve an open seat for the next race.') : ((state.phase==='waiting'?'':state.error)||labels[state.phase]||'')+(state.awaitingStop?' Waiting for the host to return to the room.':''));$('roomConnection').textContent=state.phase==='connecting'?'Connecting…':state.phase==='reconnecting'?'Reconnecting automatically · seat reserved':state.phase==='error'?'Disconnected':state.signaling?'● Room connected':'Room connected · invitation service reconnecting';$('roomConnection').dataset.state=state.phase==='error'?'offline':state.phase==='reconnecting'||!state.signaling?'recovering':'connected';
   $('returnRoomGame').hidden=state.spectating||state.phase!=='playing';$('startBtn').hidden=true;
   if(state.phase!==lastPhase&&!$('overlay').hidden){lastPhase=state.phase;if($('hostConsole')?.hidden!==false){if(state.phase==='lobby'&&me)$('readyRoom').focus();else if(state.phase==='error')$('leaveRoom').focus();}}
  }
 };
}

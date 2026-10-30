export function mountRoomName({room,root,trigger}){
 const box=document.createElement('dialog');box.className='host-transfer-dialog room-name-dialog';box.hidden=true;box.dataset.menuPopover='';box.setAttribute('aria-labelledby','roomNameTitle');
 box.innerHTML='<form><span class="host-transfer-eyebrow">ROOM HOST</span><h2 id="roomNameTitle">Edit room name</h2><label for="roomNameInput">Room name</label><input id="roomNameInput" maxlength="48" required autocomplete="off"><p class="host-transfer-detail">Up to 48 characters. Everyone in the room will see this name.</p><p class="room-name-error" role="status"></p><div class="host-transfer-buttons"><button type="button" class="ui-button ui-secondary">Cancel</button><button type="submit" class="ui-button ui-primary">Save name</button></div></form>';
 root.append(box);const input=box.querySelector('input'),error=box.querySelector('[role=status]');
 const allowed=s=>s.isHost&&['lobby','playing'].includes(s.phase)&&!s.hostTransfer&&!s.awaitingStop;
 function close(restore=true){if(box.hidden)return false;box.close();box.hidden=true;if(restore&&!trigger.hidden)trigger.focus({preventScroll:true});return true;}
 trigger.onclick=()=>{if(!allowed(room.snapshot()))return;input.value=room.roomName;error.textContent='';box.hidden=false;box.showModal();input.focus();input.setSelectionRange(input.value.length,input.value.length);};
 box.querySelector('.ui-secondary').onclick=()=>close();box.addEventListener('cancel',e=>{e.preventDefault();close();});
 box.querySelector('form').onsubmit=e=>{e.preventDefault();if(room.renameRoom(input.value))close();else{error.textContent='Enter a room name of 1–48 characters.';input.focus();}};
 return {close,isOpen:()=>!box.hidden,sync(s){trigger.hidden=!allowed(s);if(trigger.hidden)close(false);}};
}

const $=id=>document.getElementById(id);
const labels={open:'Open',full:'Full',starting:'Starting',racing:'In race',reconnecting:'Reconnecting'};
export function mountPublicRoomBrowser(directory,{join}={}){
 const rows=new Map();let latest=directory.snapshot(),busy=false;
 function render(state=latest){
  latest=state;
  const query=$('publicRoomSearch').value.trim().toLocaleLowerCase(),rooms=state.rooms.filter(r=>r.name.toLocaleLowerCase().includes(query));
  $('publicRoomCount').textContent=String(state.rooms.length);$('publicListBody').setAttribute('aria-busy',String(state.status==='loading'));
  const paused=state.status==='paused',ready=state.status==='ready'&&state.connected,connection=$('directoryConnection');connection.textContent=paused?'Paused':ready?'● Live':state.status==='error'?'Unavailable':'Connecting…';connection.dataset.state=ready?'ready':state.status;
  const wanted=new Set(rooms.map(r=>r.id));for(const [id,row] of rows)if(!wanted.has(id)){if(row.button===document.activeElement&&!$('multiplayerEntry').hidden)$('publicRoomSearch').focus({preventScroll:true});row.li.remove();rows.delete(id);}
  for(let i=0;i<rooms.length;i++){
   const room=rooms[i];let row=rows.get(room.id);
   if(!row){
    const li=document.createElement('li'),text=document.createElement('div'),name=document.createElement('strong'),info=document.createElement('div'),count=document.createElement('span'),status=document.createElement('span'),button=document.createElement('button');
    li.className='public-room-row';name.className='public-room-name';info.className='public-room-info';status.className='public-room-state';button.type='button';button.className='ui-button ui-secondary';info.append(count,status);text.append(name,info);const actions=document.createElement('div'),watch=document.createElement('button');actions.className='public-room-actions';watch.className='public-room-watch ui-button ui-quiet';watch.textContent='Watch';watch.type='button';watch.onclick=async()=>{if(busy||!row.room.compatible||!latest.connected)return;busy=true;render();try{await join(row.room,'spectator');}finally{busy=false;render();}};actions.append(button,watch);li.append(text,actions);row={li,name,count,status,button,watch,room};
    button.onclick=async()=>{if(busy||!row.room.compatible||!latest.connected)return;busy=true;render();try{await join(row.room);}finally{busy=false;render();}};rows.set(room.id,row);
   }
   row.room=room;row.li.dataset.state=room.state;row.name.textContent=room.name;row.name.title=room.name;row.count.textContent=`${room.players} / 8 drivers`;row.status.textContent=room.compatible?labels[room.state]:'Different version';row.button.disabled=busy||!room.compatible||!ready;row.button.textContent=room.compatible&&room.players>=8?'WATCH':room.joinable?(['racing','starting'].includes(room.state)?'WAIT FOR NEXT RACE':'JOIN'):room.compatible?'WAIT':'UPDATE';row.button.setAttribute('aria-label',`Join ${room.name}, ${room.players} of 8 drivers`);row.button.title=!room.compatible?'This room uses a different game version.':['racing','starting'].includes(room.state)?'Join the waiting seats and chat. You will race when everyone returns to the lobby.':room.state==='full'?'All seats are occupied.':'';
   row.watch.hidden=!room.compatible||!ready||room.players>=8;row.watch.disabled=busy||!ready;row.watch.setAttribute('aria-label',`Watch ${room.name}`);
   const list=$('publicRoomsList');if(list.children[i]!==row.li)list.insertBefore(row.li,list.children[i]||null);
  }
  $('directoryEmpty').hidden=rooms.length>0;
  $('directoryEmptyTitle').textContent=paused?'Room list paused':state.status==='error'?'The room service is unavailable':!ready?'Looking for your grid…':query?'No matching rooms':'The grid is open.';
  $('directoryEmptyText').textContent=paused?'After 5 minutes without activity, the list disconnects to save resources. Reconnect when you are ready.':state.status==='error'?state.error:!ready?'Connecting to public rooms.':query?'Try a different name or create your own room.':'Create a public room and let other drivers find you.';
  $('retryPublicRooms').hidden=!paused&&state.status!=='error';$('retryPublicRooms').textContent=paused?'Reconnect':'Retry';
  $('directoryStatus').textContent=paused?'Paused for inactivity · private invitations still work.':ready?'Automatic entry · waiting seats available during races':state.status==='error'?'Private invitations still work.':'Room availability updates automatically.';
  const showHost=!!directory.desired&&state.hostStatus!=='published';$('roomDirectoryNotice').hidden=!showHost;$('roomDirectoryMessage').textContent=state.hostStatus==='error'?state.error:state.connected?'Publishing your public room…':'Reconnecting to the room list…';$('retryRoomPublish').hidden=state.hostStatus!=='error';
 }
 directory.changed=render;
 $('publicRoomSearch').oninput=()=>render();$('retryPublicRooms').onclick=$('retryRoomPublish').onclick=()=>directory.retry();
 function visibility(){const isPublic=document.querySelector('input[name="roomVisibility"]:checked').value==='public';$('createRoomLabel').textContent=isPublic?'CREATE PUBLIC ROOM':'CREATE PRIVATE ROOM';$('createVisibilityHint').textContent=isPublic?'Listed publicly and announced in Discord · drivers enter automatically.':'Invite only · you approve new drivers.';}
 for(const radio of document.querySelectorAll('input[name="roomVisibility"]'))radio.addEventListener('change',visibility);
 document.addEventListener('visibilitychange',()=>directory.setVisible(!document.hidden));
 // Pointer, keyboard, touch and gamepad focus/field changes all count as use.
 // Once paused, only the explicit reconnect action resumes the directory.
 let lastMotion=0;
 for(const type of ['pointerdown','keydown','input','change','wheel','focusin','pointermove'])document.addEventListener(type,event=>{
  if($('multiplayerEntry').hidden)return;
  if(type==='pointermove'){const now=performance.now();if(now-lastMotion<1000)return;lastMotion=now;}
  directory.interact();
 },{passive:true});
 visibility();render();return {render};
}

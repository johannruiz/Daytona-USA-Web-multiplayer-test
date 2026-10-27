import {arrivalRoomKey} from './room-arrivals.js?v=53.8.30';
// Bounded, non-interactive announcement. It never changes menu/focus/game state.
export function mountWaitingToast(root,{schedule=setTimeout,cancel=clearTimeout}={}){
 let key='',timer=null;const home=root.parentElement;
 function hide(){if(timer!==null)cancel(timer);timer=null;root.hidden=true;}
 function place(){const full=document.fullscreenElement||document.webkitFullscreenElement,parent=full&&full!==document.documentElement?full:document.querySelector('dialog[open]')||home;if(root.parentElement!==parent)parent.append(root);}
 document.addEventListener('fullscreenchange',place);document.addEventListener('webkitfullscreenchange',place);
 return {sync(state){
  const next=arrivalRoomKey(state);
  if(next!==key){key=next;hide();}
  if(!(['playing','preparing'].includes(state.phase)||state.phase==='waiting'&&['playing','preparing'].includes(state.remotePhase)))hide();
 },show(event){
  if(!event.inGame||!['joined','request','spectating','left'].includes(event.kind))return;
  if(key!==event.roomKey){key=event.roomKey;hide();}
  hide();const title=document.createElement('strong'),detail=document.createElement('span');
  title.textContent=event.name+({request:' requested to join',joined:' joined the room',spectating:' is now spectating',left:' left the room'}[event.kind]);
  detail.textContent=event.kind==='request'?'Review the request when you return to the lobby.':event.kind==='left'?(event.spectator?'Spectator disconnected':'Driver disconnected'):event.spectator?'Spectator · no driver seat occupied':event.waiting?'Waiting for the next race · seat reserved':'Driver · ready to join the grid';
  // Native spectator dialogs live in the top layer. Append without focusing.
  place();
  root.replaceChildren(title,detail);root.hidden=false;timer=schedule(()=>{root.hidden=true;timer=null;},5500);
 },dispose(){hide();key='';document.removeEventListener('fullscreenchange',place);document.removeEventListener('webkitfullscreenchange',place);if(root.parentElement!==home)home.append(root);}};
}

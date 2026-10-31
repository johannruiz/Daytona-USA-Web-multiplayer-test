import {createChatFollow} from './chat-follow.js?v=53.8.59';
// Shares the existing, bounded room chat. No separate spectator history,
// Firebase subscription or additional network connection is created.
export function mountSpectatorChat(root,{room,onRead=()=>{},storage}={}){
 const $=id=>root.querySelector('#'+id),log=$('spectatorChatLog'),input=$('spectatorChatInput'),send=$('spectatorChatSend'),feedback=$('spectatorChatFeedback'),toggle=$('spectatorChatToggle'),badge=$('spectatorChatUnread'),newer=$('spectatorChatNew'),panel=$('spectatorChat'),workspace=root.querySelector('.spectator-workspace');
 let collapsed=globalThis.matchMedia?.('(max-width: 900px)').matches||false,visible=false,roomKey='',lastSeq=0,lastRead=0,baseline=false,unread=0,stamp='',lastAck=0,enabled=false;
 try{storage??=globalThis.localStorage;const saved=storage?.getItem('daytona-spectator-chat-collapsed-v1');if(typeof saved==='string')collapsed=saved==='1';}catch{}
 const nodes=new Map(),bottom=()=>log.scrollTop+log.clientHeight>=log.scrollHeight-24;
 const follow=createChatFollow(log,{onBottom:()=>{if(visible&&!collapsed&&!document.hidden)read();}});
 function paint(){panel.hidden=collapsed;workspace.dataset.chatOpen=String(!collapsed);toggle.setAttribute('aria-expanded',String(!collapsed));badge.hidden=!unread;badge.textContent=unread>99?'99+':String(unread);toggle.setAttribute('aria-label',`${collapsed?'Show':'Hide'} room chat${unread?`, ${unread} unread messages`:''}`);newer.hidden=!unread||collapsed||follow.following;newer.textContent=`${unread} new message${unread===1?'':'s'} ↓`;}
 function read(){if(unread){unread=0;paint();}if(lastSeq>lastRead){lastRead=lastSeq;onRead();}}
 function latest(){follow.latest();read();}
 function collapse(value){collapsed=value;try{storage?.setItem('daytona-spectator-chat-collapsed-v1',value?'1':'0');}catch{}paint();if(!value)follow.refresh();if(value&&panel.contains(document.activeElement))toggle.focus({preventScroll:true});}
 toggle.onclick=()=>collapse(!collapsed);$('spectatorChatHide').onclick=()=>collapse(true);newer.onclick=latest;newer.addEventListener('pointerdown',e=>{if(e.button===0)e.preventDefault();});log.addEventListener('scroll',()=>{if(visible&&!collapsed&&bottom())read();});
 function compose(){send.disabled=!enabled||!input.value.trim();$('spectatorChatCount').textContent=`${input.value.length}/240`;}
 input.addEventListener('input',compose);
 $('spectatorChatForm').addEventListener('submit',e=>{e.preventDefault();try{if(room.submitChat(input.value)){input.value='';feedback.textContent=room.isHost?'Message sent.':'Sending…';compose();latest();input.focus({preventScroll:true});}}catch(error){feedback.textContent=error.message;}});
 panel.addEventListener('keydown',e=>{if(e.key!=='Escape'&&e.key!=='Tab')e.stopPropagation();});
 function sync(state){
  const nextKey=`${state.host}:${state.id}`;if(nextKey!==roomKey){roomKey=nextKey;nodes.clear();log.replaceChildren();follow.reset();lastSeq=lastRead=lastAck=unread=0;baseline=false;stamp='';input.value='';}
  const allowed=!!state.chatAvailable;input.disabled=!allowed;if(enabled!==allowed){enabled=allowed;feedback.textContent=allowed?'Only people in this room can read this chat.':'Chat reconnects with your room.';}compose();
  const chat=state.chat||[],nextStamp=`${chat.length}:${chat[0]?.seq}:${chat.at(-1)?.seq}`;
  if(nextStamp!==stamp){
   stamp=nextStamp;const atBottom=follow.following,anchor=visible&&!collapsed&&!atBottom?[...nodes.values()].find(n=>n.getBoundingClientRect().bottom>log.getBoundingClientRect().top):null,top=anchor?.getBoundingClientRect().top,wanted=new Set(chat.map(m=>m.seq));let own=false;
   for(const [seq,node] of nodes)if(!wanted.has(seq)){node.remove();nodes.delete(seq);}
   for(const m of chat){if(nodes.has(m.seq))continue;const li=document.createElement('li'),head=document.createElement('div'),name=document.createElement('strong'),time=document.createElement('time'),text=document.createElement('p');li.className='spectator-chat-message';li.classList.toggle('is-own',m.sender===state.id);name.textContent=m.sender===state.id?'You':m.name;time.dateTime=new Date(m.time).toISOString();time.textContent=new Date(m.time).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});head.append(name,time);text.textContent=m.text;li.append(head,text);log.append(li);nodes.set(m.seq,li);if(baseline&&m.seq>lastSeq){if(m.sender!==state.id)unread++;else own=true;}}
   lastSeq=Math.max(lastSeq,...chat.map(m=>m.seq),0);$('spectatorChatEmpty').hidden=chat.length>0;
   if(own)latest();else if(atBottom)follow.refresh();else if(anchor&&log.contains(anchor))log.scrollTop+=anchor.getBoundingClientRect().top-top;
  }
  baseline=!!state.waitingForRace||state.members.some(m=>m.id===state.id);
  if(state.lastAck?.action==='chat-submit'&&state.lastAck.command>lastAck){lastAck=state.lastAck.command;feedback.textContent=state.lastAck.accepted?'Sent.':state.lastAck.reason;}
  if(visible&&!collapsed&&bottom())read();paint();
 }
 paint();return {sync,visible(on){visible=!!on;if(visible&&!collapsed)follow.refresh();},get unread(){return unread;}};
}

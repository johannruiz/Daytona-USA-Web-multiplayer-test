import {linkIdForSeat} from './central-link.js?v=53.8.30';
import {carColor} from './car-colors.js?v=53.8.30';

// Reads the spectator's local clone. Nothing here requests or sends network data.
export function mountSpectatorHUD(root){
 const panel=root.querySelector('#spectatorHUD'),name=root.querySelector('#spectatorHUDName'),
 place=root.querySelector('#spectatorHUDPosition'),lap=root.querySelector('#spectatorHUDLap'),
 heading=root.querySelector('#spectatorOrderHeading'),list=root.querySelector('#spectatorOrder');
 let members=[],selected='',rows=[],total=0,last=-Infinity,key='',scene=0,confirmed=false;
 function reset(grid=[]){members=grid;rows=[];total=0;key='';scene=0;confirmed=false;last=-Infinity;panel.hidden=true;}
 function render(){
  const driver=members.find(m=>m.id===selected),row=rows.find(r=>r.id===selected);
  panel.hidden=!driver||!rows.length;if(panel.hidden)return;
  const next=JSON.stringify([selected,rows,total,scene,confirmed]);if(next===key)return;key=next;
  name.textContent=driver.name;place.textContent=row?.position?String(row.position)+' / '+rows.length:'—';
  lap.textContent=row&&total?Math.min(total,row.lap+1)+' / '+total:'—';
  heading.textContent=confirmed?'CONFIRMED RESULTS':scene>=23?'RACE ORDER · NOT FINAL':'RACE ORDER';
  list.replaceChildren(...rows.slice().sort((a,b)=>(a.position??99)-(b.position??99)||a.cabinet-b.cabinet).map(r=>{
   const item=document.createElement('li'),rank=document.createElement('span'),label=document.createElement('span');
   item.classList.toggle('is-followed',r.id===selected);item.style.setProperty('--spectator-car-color',carColor(r.cabinet).hudColor||carColor(r.cabinet).color);
   rank.textContent=r.position??'—';label.textContent=r.name;item.append(rank,label);return item;
  }));
 }
 return {reset,select(id){selected=id;render();},
  update(wasm,now){
   if(now-last<100)return;last=now;
   const ptr=wasm._daytona_spectator_status_ptr(),data=new Uint32Array(wasm.HEAPU8.buffer,ptr,56);
   scene=data[0];if(scene<=10){if(rows.length)reset(members);return;}
   if(scene<20){panel.hidden=true;return;}
   if(data[2]>=1&&data[2]<=8){
    total=data[1];const fresh=[];
    for(let i=0;i<data[2];i++){
     const p=8+i*6,index=members.findIndex((_,n)=>linkIdForSeat(n+1,members.length)===data[p]);
     if(index<0)continue;const rank=data[p+1];
     fresh.push({...members[index],position:rank>=1&&rank<=data[2]?rank:null,lap:data[p+2],finished:!!data[p+3]});
    }
    if(fresh.length===data[2]&&new Set(fresh.map(r=>r.id)).size===data[2]){
     // The arcade can expose duplicate initial ranks during the rolling start.
     // Keep the real names/laps, but never present that as a valid race order.
     const valid=fresh.every(r=>r.position!==null)&&new Set(fresh.map(r=>r.position)).size===fresh.length;
     rows=fresh.map(r=>valid?r:{...r,position:null});confirmed=valid&&rows.every(r=>r.finished);
    }
   }
   render();
  },snapshot:()=>({scene,total,rows,confirmed})
 };
}

export const SLOT_BYTES=0x1c0,SAMPLE_BYTES=SLOT_BYTES+5,STATE_BYTES=SLOT_BYTES*8+1+9*4;
export const STATE_TAG=0xfd;
export const COMPACT_STATE_TAG=0xfc;
function checkedCount(count){if(!Number.isInteger(count)||count<1||count>8)throw Error('Invalid compact grid.');}
// A full snapshot repeats slots modulo the number of actual cabinets. Send
// those distinct complete blocks once; reconstruct the exact native layout.
export function compactState(full,count){
 checkedCount(count);if(!(full instanceof ArrayBuffer)||full.byteLength!==STATE_BYTES||new Uint8Array(full)[0]!==STATE_TAG)throw Error('Invalid complete state.');
 const bytes=new Uint8Array(5+count*(SLOT_BYTES+4)),source=new Uint8Array(full),view=new DataView(bytes.buffer),old=new DataView(full);bytes[0]=COMPACT_STATE_TAG;
 view.setUint32(1,old.getUint32(1+SLOT_BYTES*8,true),true);bytes.set(source.subarray(1,1+count*SLOT_BYTES),5);
 for(let slot=0;slot<count;slot++)view.setUint32(5+count*SLOT_BYTES+slot*4,old.getUint32(5+SLOT_BYTES*8+slot*4,true),true);
 return bytes.buffer;
}
export function expandState(compact,count){
 checkedCount(count);if(!(compact instanceof ArrayBuffer)||compact.byteLength!==5+count*(SLOT_BYTES+4)||new Uint8Array(compact)[0]!==COMPACT_STATE_TAG)throw Error('Invalid compact state.');
 const bytes=new Uint8Array(STATE_BYTES),source=new Uint8Array(compact),view=new DataView(bytes.buffer),old=new DataView(compact);bytes[0]=STATE_TAG;
 view.setUint32(1+SLOT_BYTES*8,old.getUint32(1,true),true);
 for(let slot=0;slot<8;slot++){const index=slot%count;bytes.set(source.subarray(5+index*SLOT_BYTES,5+(index+1)*SLOT_BYTES),1+slot*SLOT_BYTES);view.setUint32(5+SLOT_BYTES*8+slot*4,old.getUint32(5+count*SLOT_BYTES+index*4,true),true);}
 return bytes.buffer;
}
// Transport position is admission order, independent of the selectable car number.
// Preserve the IDs assigned by RC1's original discovery (slaves count backwards).
export function linkIdForSeat(seat,count){return seat===1?1:count-seat+2;}
export class HostDistributor {
 constructor(members){
  if(!Array.isArray(members)||members.length<1||members.length>8||members.some(m=>!m)||new Set(members.map(m=>m.id)).size!==members.length||new Set(members.map(m=>m.cabinet)).size!==members.length||members.some(m=>typeof m.id!=='string'||!Number.isInteger(m.cabinet)||m.cabinet<1||m.cabinet>8))throw Error('Invalid centralized grid.');
  this.members=members.map(m=>({...m}));this.samples=new Map();this.sequence=0;this.discarded=0;
 }
 accept(id,frames,bytes,timing=null){
  const member=this.members.find(m=>m.id===id);
  if(!member||!Number.isSafeInteger(frames)||frames<0||!(bytes instanceof ArrayBuffer)||bytes.byteLength!==SAMPLE_BYTES)throw Error('Invalid cabinet sample.');
  const sample=new Uint8Array(bytes);
  if(sample[0]!==linkIdForSeat(this.members.indexOf(member)+1,this.members.length))throw Error('Cabinet sample identity mismatch.');
  const previous=this.samples.get(id);
  if(previous&&frames<=previous.frames){this.discarded++;return false;}
  this.samples.set(id,{frames,bytes:sample.slice(1,1+SLOT_BYTES),clock:new DataView(bytes).getUint32(1+SLOT_BYTES,true),at:performance.now(),timing});return true;
 }
 get ready(){return this.samples.size===this.members.length;}
 timing(id,now=performance.now()){
  const target=this.members.findIndex(m=>m.id===id);if(target<0||!this.ready)return null;
  return {version:1,at:now,slots:this.members.map((_,slot)=>{const index=(target-1-slot+this.members.length*8)%this.members.length,s=this.samples.get(this.members[index].id),t=s.timing;
   return t&&Number.isFinite(t.ageMs)&&Number.isFinite(t.uncertaintyMs)?{clock:s.clock,ageMs:t.ageMs+Math.max(0,now-s.at),uncertaintyMs:t.uncertaintyMs}:null;})};
 }
 snapshot(id){
  if(!this.ready)return null;
  const target=this.members.findIndex(m=>m.id===id);if(target<0)throw Error('Unknown state recipient.');
  const bytes=new Uint8Array(STATE_BYTES);bytes[0]=STATE_TAG;
  const clocks=new DataView(bytes.buffer),clockOffset=1+SLOT_BYTES*8;
  clocks.setUint32(clockOffset,this.samples.get(this.members[0].id).clock,true);
  // Incoming slot 0 belongs to the predecessor. Recreate the game's expected
  // circular RAM layout using independent samples, with no network circulation.
  for(let slot=0;slot<8;slot++){
   const index=(target-1-slot+this.members.length*8)%this.members.length;
   bytes.set(this.samples.get(this.members[index].id).bytes,1+slot*SLOT_BYTES);
   clocks.setUint32(clockOffset+4+slot*4,this.samples.get(this.members[index].id).clock,true);
  }
  return bytes.buffer;
 }
}

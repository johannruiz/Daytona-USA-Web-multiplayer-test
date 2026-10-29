// Self-contained snapshots only. Never encode room commands or final results here.
import {SAMPLE_BYTES,COMPACT_STATE_TAG} from './central-link.js?v=53.8.41';
import {normalizeSlotTiming} from './link-timing.js?v=53.8.41';
const MAGIC=0x314d5444,HEADER=96,MAX_BYTES=4096;
const integer=n=>Number.isSafeInteger(n)&&n>=0;
const finite=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0;
let cachedEpoch='',cachedBytes;
function epochBytes(epoch){if(!/^[a-f0-9]{32}$/.test(epoch))throw Error('Invalid motion epoch.');if(epoch!==cachedEpoch){cachedEpoch=epoch;cachedBytes=Uint8Array.from(epoch.match(/../g),b=>parseInt(b,16));}return cachedBytes;}
function readEpoch(bytes){if(cachedBytes&&cachedBytes.every((v,i)=>bytes[8+i]===v))return cachedEpoch;return Array.from(bytes.subarray(8,24),b=>b.toString(16).padStart(2,'0')).join('');}
export function encodeMotion(data,count){
 if(!Number.isInteger(count)||count<1||count>8||!integer(data.delivery)||!data.delivery||!integer(data.frames)||!finite(data.sentAt))throw Error('Invalid motion envelope.');
 const sample=data.type==='arcade-sample',state=data.type==='arcade-state',ack=data.type==='motion-ack';
 if(!sample&&!state&&!ack)throw Error('Unsupported motion type.');
 if(ack&&!['arcade-sample','arcade-state'].includes(data.kind))throw Error('Invalid motion receipt kind.');
 if(ack&&(!Number.isInteger(data.receiptMask)||data.receiptMask<0||data.receiptMask>0xffffffff||!(data.receiptMask&1)))throw Error('Invalid motion receipt mask.');
 const receipt=ack?null:data.receipt;
 if(receipt&&(!integer(receipt.delivery)||!receipt.delivery||!Number.isInteger(receipt.mask)||receipt.mask<0||receipt.mask>0xffffffff||!(receipt.mask&1)))throw Error('Invalid piggyback receipt.');
 const length=ack?0:data.bytes?.byteLength;
 if(!ack&&(!(data.bytes instanceof ArrayBuffer)||length!==(sample?SAMPLE_BYTES:5+count*452)))throw Error('Invalid motion payload.');
 if(state&&(!integer(data.sequence)||!data.sequence||new Uint8Array(data.bytes)[0]!==COMPACT_STATE_TAG))throw Error('Invalid compact motion state.');
 const timing=state?normalizeSlotTiming(data.timing,count):null;
 const publication=sample&&data.publication&&finite(data.publication.at)&&finite(data.publication.uncertaintyMs)&&data.publication.uncertaintyMs<=150?data.publication:null;
 const result=new Uint8Array(HEADER+length+(timing?count*20:0)),v=new DataView(result.buffer);
 v.setUint32(0,MAGIC,true);result[4]=sample?1:state?2:3;result[5]=count;result[6]=ack?(data.kind==='arcade-sample'?1:2):(publication||timing?1:0);
 result.set(epochBytes(data.epoch),8);v.setFloat64(24,data.delivery,true);v.setFloat64(32,data.frames,true);v.setFloat64(40,state?data.sequence:0,true);v.setFloat64(48,data.sentAt,true);
 v.setFloat64(56,publication?.at??timing?.at??0,true);v.setFloat64(64,publication?.uncertaintyMs??0,true);v.setUint32(72,length,true);
 if(receipt){v.setFloat64(80,receipt.delivery,true);v.setUint32(88,receipt.mask,true);}
 if(!ack)result.set(new Uint8Array(data.bytes),HEADER);
 else v.setUint32(76,data.receiptMask,true);
 if(timing)for(let i=0;i<count;i++){const t=timing.slots[i];if(!t)continue;result[76]|=1<<i;const offset=HEADER+length+i*20;v.setUint32(offset,t.clock,true);v.setFloat64(offset+4,t.ageMs,true);v.setFloat64(offset+12,t.uncertaintyMs,true);}
 return result.buffer;
}
export function decodeMotion(buffer){
 if(!(buffer instanceof ArrayBuffer)||buffer.byteLength<HEADER||buffer.byteLength>MAX_BYTES)throw Error('Invalid motion size.');
 const b=new Uint8Array(buffer),v=new DataView(buffer),type=b[4],count=b[5],flag=b[6],length=v.getUint32(72,true);
 if(v.getUint32(0,true)!==MAGIC||![1,2,3].includes(type)||!Number.isInteger(count)||count<1||count>8||b[7]||(type!==3&&(b[77]||b[78]||b[79]))||v.getUint32(92,true))throw Error('Invalid motion header.');
 const sample=type===1,state=type===2,ack=type===3;
 if((ack?![1,2].includes(flag):![0,1].includes(flag))||length!==(ack?0:sample?SAMPLE_BYTES:5+count*452)||buffer.byteLength!==HEADER+length+(state&&flag?count*20:0)||(!ack&&(((!state||!flag)&&b[76])||(b[76]>>count)))||(ack&&!(v.getUint32(76,true)&1)))throw Error('Invalid motion layout.');
 const delivery=v.getFloat64(24,true),frames=v.getFloat64(32,true),sequence=v.getFloat64(40,true),sentAt=v.getFloat64(48,true),at=v.getFloat64(56,true),uncertainty=v.getFloat64(64,true);
 if(!integer(delivery)||!delivery||!integer(frames)||!finite(sentAt)||!finite(at)||!finite(uncertainty)||(!state&&sequence!==0)||(state&&(!integer(sequence)||!sequence))||(sample&&flag&&uncertainty>150))throw Error('Invalid motion numbers.');
 if(state&&b[HEADER]!==COMPACT_STATE_TAG)throw Error('Invalid motion state tag.');
 const result={type:sample?'arcade-sample':state?'arcade-state':'motion-ack',epoch:readEpoch(b),delivery,frames,sentAt,count};
 const receiptDelivery=v.getFloat64(80,true),receiptMask=v.getUint32(88,true);
 if(!integer(receiptDelivery)||(receiptDelivery?!(receiptMask&1):receiptMask!==0)||(ack&&receiptDelivery))throw Error('Invalid piggyback receipt.');
 if(receiptDelivery)result.receipt={delivery:receiptDelivery,mask:receiptMask};
 if(ack){result.kind=flag===1?'arcade-sample':'arcade-state';result.receiptMask=v.getUint32(76,true);return result;}
 result.bytes=buffer.slice(HEADER,HEADER+length);
 if(sample)result.publication=flag?{at,uncertaintyMs:uncertainty}:null;
 else{
  result.sequence=sequence;result.encoding='cabinet-slots';result.timing=null;
  if(flag){const slots=[];for(let i=0;i<count;i++){if(!(b[76]&(1<<i))){slots.push(null);continue;}const off=HEADER+length+i*20,t={clock:v.getUint32(off,true),ageMs:v.getFloat64(off+4,true),uncertaintyMs:v.getFloat64(off+12,true)};if(!finite(t.ageMs)||t.ageMs>10000||!finite(t.uncertaintyMs)||t.uncertaintyMs>500)throw Error('Invalid motion slot time.');slots.push(t);}result.timing={version:1,at,slots};}
 }
 return result;
}

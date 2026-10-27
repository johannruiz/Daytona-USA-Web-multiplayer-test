export const SPECTATOR_VERSION=2,SPECTATOR_HZ=15,WORLD_HEAD=32,WORLD_ROW=40,WORLD_MAX_BYTES=(WORLD_HEAD+40*WORLD_ROW)*4;
export function worldState(buffer,count){
 if(!Number.isInteger(count)||count<1||count>8)throw Error('Invalid spectator room size.');
 if(!(buffer instanceof ArrayBuffer)||buffer.byteLength<128||buffer.byteLength>WORLD_MAX_BYTES||buffer.byteLength%4)throw Error('Invalid spectator world size.');
 const p=new Uint32Array(buffer);if(p[0]!==0x32575053||p[1]!==2||p[4]>31||p[5]>2)throw Error('Invalid spectator world.');
 if(p[7]===0){if(buffer.byteLength!==128)throw Error('Invalid empty spectator world.');return {bytes:buffer,words:p,frame:p[2],run:p[3],scene:p[4],course:p[5],count:0};}
 if(p[6]<1||p[6]>count||p[7]<p[6]||p[7]>40||buffer.byteLength!==(WORLD_HEAD+p[7]*WORLD_ROW)*4||p[8]<1||p[8]>255||p[11]>=p[6]||(p[10]>>>p[6]))throw Error('Invalid spectator grid.');
 const ids=new Set(),links=new Set();for(let i=0;i<p[6];i++){const n=p[16+i];if(n<1||n>count||links.has(n))throw Error('Invalid spectator identity.');links.add(n);}
 const f=new Float32Array(buffer);
 for(let i=0;i<p[7];i++){
  const r=WORLD_HEAD+i*WORLD_ROW;if(p[r]>=40||ids.has(p[r])||p[r+2]>52||(p[r+3]>2&&p[r+3]!==8)||p[r+4]>40||p[r+5]>255||p[r+33]>255||p[r+34]>255||p[r+36]>65535||p[r+37]>1)throw Error('Invalid spectator car.');ids.add(p[r]);
  for(let k=6;k<11;k++)if(!Number.isFinite(f[r+k])||Math.abs(f[r+k])>1e6)throw Error('Invalid spectator pose.');
  for(let k=11;k<33;k++)if(p[r+k]>65535)throw Error('Invalid spectator angle.');
 }
 for(let i=0;i<p[6];i++)if(!ids.has(i))throw Error('Missing spectator driver.');
 return {bytes:buffer,words:p,frame:p[2],run:p[3],scene:p[4],course:p[5],count:p[7]};
}
export function worldGridSignature(state){const p=state?.words;if(!p||!p[7])return 0;let grid=0;for(let i=0;i<p[6];i++)grid|=p[16+i]<<(i*4);return grid>>>0;}
// A bounded interpolation buffer, not an input/history replay. Older states
// can be dropped independently. Never extrapolate a car or run its physics.
export class SpectatorWorldBuffer{
 constructor(){this.frames=[];this.serial=-1;this.received=0;}
 accept(state,at=performance.now()){
  if(this.serial>=0&&((state.frame-this.serial)>>>0)>=0x80000000)return false;
  if(state.frame===this.serial)return false;this.serial=state.frame;this.received++;
  const last=this.frames.at(-1);if(last&&(last.state.run!==state.run||last.state.course!==state.course||last.state.count!==state.count||last.state.words[6]!==state.words[6]||Array.from(state.words.slice(16,16+state.words[6])).some((link,i)=>link!==last.state.words[16+i])))this.frames=[];
  this.frames.push({state,at});if(this.frames.length>8)this.frames.shift();return true;
 }
 sample(now=performance.now()){
  const last=this.frames.at(-1);if(!last)return null;
  const head=Math.min(last.state.frame,last.state.frame-6+(now-last.at)*57.5242/1000);
  let left=this.frames[0],right=left;for(const f of this.frames){if(f.state.frame<=head)left=f;if(f.state.frame>=head){right=f;break;}right=f;}
  if(left===right)return right.state;
  const mix=Math.max(0,Math.min(1,(head-left.state.frame)/(right.state.frame-left.state.frame))),out=right.state.bytes.slice(0),p=new Uint32Array(out),f=new Float32Array(out),a=left.state.words,af=new Float32Array(left.state.bytes),bf=new Float32Array(right.state.bytes);
  for(let i=0;i<right.state.count;i++){
   const r=WORLD_HEAD+i*WORLD_ROW;let old=-1;for(let j=0;j<left.state.count;j++)if(a[WORLD_HEAD+j*WORLD_ROW]===p[r]){old=WORLD_HEAD+j*WORLD_ROW;break;}if(old<0)continue;
   let distance=0;for(let k=6;k<9;k++)distance+=(bf[r+k]-af[old+k])**2;
   if(distance>10000)continue; // genuine respawn/recovery: do not blend through scenery
   for(let k=6;k<11;k++)f[r+k]=af[old+k]+(bf[r+k]-af[old+k])*mix;
   // Position in the word whitelist: Euler/body rotation and steering only.
   for(const k of [11,12,13,15,16,17,18,19,20,21,22,23,24,25,26,27,32]){const d=(p[r+k]-a[old+k]+32768&65535)-32768;p[r+k]=(a[old+k]+Math.round(d*mix))&65535;}
   if(p[r+37]&&a[old+37]){const d=(p[r+36]-a[old+36]+32768&65535)-32768;p[r+36]=(a[old+36]+Math.round(d*mix))&65535;}
  }
  return {...right.state,bytes:out,words:p};
 }
}

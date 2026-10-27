export const SOUND_MAX_BYTES=736;
const control=c=>c===7||c===10||c===16||c===20||c>=22&&c<=33&&c!==26||c>=52&&c<=55;
export function soundCommand(c){
 const status=c>>>16,a=c>>>8&255,b=c&255;
 return Number.isInteger(c)&&c>=0&&c<=0xefffff&&status>=0x80&&a<128&&b<128&&
  (status===0xbe&&(control(a)||a===0x50||a===0x7b)||status===0xae||(status&15)>=10&&(status&15)<=14&&[0x80,0x90,0xc0,0xe0].includes(status&0xf0));
}
export function soundState(bytes){
 if(!(bytes instanceof ArrayBuffer)||bytes.byteLength<32||bytes.byteLength>SOUND_MAX_BYTES||bytes.byteLength%4)throw Error('Invalid spectator sound size.');
 const p=new Uint32Array(bytes);
 if(p[0]!==0x31445541||p[1]!==1||p[4]>128||p[5]>16||p[6]>7||p[7]>31||p.length!==8+p[4]+p[5]*3)throw Error('Invalid spectator sound state.');
 const seen=new Set();for(let i=0;i<p[4];i++){const c=p[8+i],a=c>>>8&255;if(!soundCommand(c)||c>>>16!==0xbe||!control(a)||seen.has(a))throw Error('Invalid sound control.');seen.add(a);}
 let previous=0;for(let i=0;i<p[5];i++){const at=8+p[4]+i*3,serial=p[at],frame=p[at+1],c=p[at+2];if(!serial||serial>p[3]||i&&serial<=previous||frame>p[2]||p[2]-frame>60||!soundCommand(c)||c>>>16===0xbe&&control(c>>>8&255))throw Error('Invalid sound event.');previous=serial;}
 return {bytes,frame:p[2],serial:p[3],actor:p[6],scene:p[7],controls:p[4],events:p[5]};
}

// Original ROM sound driver locally; only small real command states arrive.
// This context is independent from the runner/UI context and its mute setting.
export function createSpectatorAudio({button,getWasm,getVolume=()=>1,onDemand=()=>{},ready=()=>false,getGrid=()=>null}){
 let context,gain,next=0,enabled=false,visible=true,queue=[],lastFrame=-1,lastAt=0;
 const sources=new Set();let target='',accepted=0,frames=0,energy=0,peak=0,failures=0;
 const clear=()=>{for(const s of sources)try{s.stop();}catch{}sources.clear();next=0;queue=[];lastFrame=-1;};
 const render=()=>{button.disabled=!ready();button.textContent=enabled?'Mute sound':'Enable sound';button.setAttribute('aria-pressed',String(enabled));button.title='Original engine and sound effects from the followed driver. Music is off.';};
 function nativeOff(){getWasm()?._daytona_spectator_sound_enable?.(0);}
 function stop(){enabled=false;onDemand(false,target);clear();nativeOff();render();}
 button.onclick=async()=>{
  if(enabled){stop();return;}if(!ready())return;
  try{
   if(!context||context.state==='closed'){context=new (globalThis.AudioContext||globalThis.webkitAudioContext)();gain=context.createGain();gain.connect(context.destination);}
   const resumed=context.resume();await resumed;
   if(!ready()||!getWasm()._daytona_spectator_sound_enable(1))throw Error('Original sound effects could not initialize.');
   enabled=true;clear();onDemand(true,target);render();
  }catch(e){failures++;stop();button.title=e.message;}
 };
 return {
  refresh:render,
  follow(id,force=false){if(id===target&&!force)return;target=id;clear();nativeOff();if(enabled&&visible)onDemand(true,target);},
  offer(value,at=performance.now()){
   if(!enabled||!visible||value?.source!==target)return;const s=soundState(value.bytes);
   if(s.frame<=lastFrame)return;lastFrame=s.frame;lastAt=at;queue.push({s,at,grid:value.grid});if(queue.length>8)queue.shift();
  },
  apply(now=performance.now()){
   render();if(!enabled||!visible||!ready())return;
   const m=getWasm();if(lastAt&&now-lastAt>2000){clear();nativeOff();return;}
   // Match the visual interpolation delay; obsolete intermediate controls
   // coalesce. Transient IDs in the native state prevent duplicate effects.
   let value;while(queue.length&&now-queue[0].at>=100)value=queue.shift();if(!value)return;
   if(value.grid!==undefined&&getGrid()!==null&&value.grid!==getGrid())return;
   if(!m._daytona_spectator_sound_enable(1))return;
   m.HEAPU8.set(new Uint8Array(value.s.bytes),m._daytona_spectator_sound_input());
   if(m._daytona_spectator_sound_accept(value.s.bytes.byteLength))accepted++;
  },
  push(){
   if(!enabled||!visible||context?.state!=='running')return;const m=getWasm(),n=m?._daytona_audio_frames(),ptr=m?._daytona_audio_ptr();if(!n||!ptr)return;
   const pcm=m.HEAPF32.subarray(ptr/4,ptr/4+n*2),buffer=context.createBuffer(2,n,48000),left=buffer.getChannelData(0),right=buffer.getChannelData(1);
   for(let i=0;i<n;i++){left[i]=pcm[i*2];right[i]=pcm[i*2+1];energy+=left[i]*left[i]+right[i]*right[i];peak=Math.max(peak,Math.abs(left[i]),Math.abs(right[i]));}frames+=n;
   const volume=Math.max(0,Math.min(1,Number(getVolume())||0));gain.gain.setTargetAtTime(volume,context.currentTime,.025);
   const source=context.createBufferSource();source.buffer=buffer;source.connect(gain);const now=context.currentTime;if(next<now||next>now+.2)next=now+.04;
   sources.add(source);source.onended=()=>sources.delete(source);source.start(next);next+=n/48000;
  },
  visible(on){visible=!!on;clear();nativeOff();if(enabled){onDemand(visible,target);if(visible)void context?.resume();}},
  stop,
  state:()=>({enabled,target,accepted,frames,rms:frames?Math.sqrt(energy/(frames*2)):0,peak,queued:queue.length,sources:sources.size,failures,context:context?.state||'uninitialized'}),
  dispose(){stop();void context?.close();context=null;}
 };
}

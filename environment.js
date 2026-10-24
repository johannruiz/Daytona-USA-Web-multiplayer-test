import {cycleAt,cycleDefaults} from './night-cycle.js?v=53.8.24';
import {nightDefaults,nightFadeStart} from './night-settings.js?v=53.8.24';

export const ENVIRONMENTS=Object.freeze(['day','night','cycle']);
export const validEnvironment=value=>ENVIRONMENTS.includes(value);
const racing=scene=>Number.isInteger(scene)&&scene>=20&&scene<=29;
export function environmentSnapshot(value){
 return value&&Number.isSafeInteger(value.run)&&value.run>=0&&value.run<=0xffffffff&&typeof value.elapsed==='number'&&Number.isFinite(value.elapsed)&&value.elapsed>=0&&value.elapsed<=86400?{run:value.run,elapsed:value.elapsed}:null;
}
export function environmentStart(value){
 return value&&Number.isSafeInteger(value.run)&&value.run>=1&&value.run<=0xffffffff&&typeof value.at==='number'&&Number.isFinite(value.at)&&value.at>=0?{run:value.run,at:value.at}:null;
}
// One reliable start reference per race, then local monotonic clocks.
// Reset on a new cabinet session; returning to attract never restarts a race
// which another driver is still finishing.
export class RoomEnvironmentClock{
 constructor({localTime=null}={}){this.localTime=localTime;this.reset();}
 reset(){this.run=0;this.origin=0;this.inRace=false;this.remoteAt=null;}
 observe(scene,now=performance.now()){
  const active=racing(scene);if(active&&!this.inRace){this.run++;this.origin=now;this.remoteAt=null;}
  this.inRace=active;
 }
 snapshot(now=performance.now()){
  if(this.remoteAt!==null){const at=this.localTime?.(this.remoteAt,now);if(typeof at==='number'&&Number.isFinite(at))this.origin=at;}
  return {run:this.run,elapsed:this.run?Math.min(86400,Math.max(0,(now-this.origin)/1000)):0};
 }
 anchor(){return this.run?{run:this.run,at:this.remoteAt??this.origin}:null;}
 receiveStart(value,now=performance.now()){
  const s=environmentStart(value);if(!s||s.run<=this.run)return false;
  this.run=s.run;this.remoteAt=s.at;this.origin=now;return true;
 }
}
// Reused by a playable cabinet and its independent spectator renderer.
// No local tuning storage or debug panel can override the room's choice.
export function createEnvironment({engine,renderer,context}){
 let module=null,lastRenderer=null,lastMode='',lastIntensity=-1,lastRun=-1,elapsed=0,lastTick=null,lastRead=-Infinity,soloScene=0,soloRun=0,state={mode:'day',intensity:0,phase:'Day',elapsed:0};
 function pause(){lastTick=null;lastRead=-Infinity;}
 function update(now=performance.now(),raceOverride=null){
  const m=engine(),r=renderer(),c=context()||{},mode=validEnvironment(c.mode)?c.mode:'day';
  if(!m||!r){pause();return;}
  if(module!==m){module=m;lastRun=-1;elapsed=0;lastTick=null;lastRead=-Infinity;lastMode='';lastIntensity=-1;}
  m._daytona_night_pose_enable?.(Number(mode!=='day'));
  let scene=raceOverride?.scene,run=raceOverride?.run;
  if(!raceOverride&&mode!=='day'){
   const ptr=m._daytona_race_sample_ptr?.();if(ptr){const v=new Float64Array(m.HEAPU8.buffer,ptr,48);scene=v[4];run=v[1];}
   // The authority sampler runs only in linked cabinets. Standalone uses the
   // existing read-only world header, at 5 Hz rather than exporting per draw.
   if(m._daytona_link_count?.()===0&&m._daytona_spectator_world_export){
    if(now-lastRead>=200){lastRead=now;const ptr=m._daytona_spectator_world_export();if(ptr){const v=new Uint32Array(m.HEAPU8.buffer,ptr,8);soloScene=v[0]===0x32575053?v[4]:0;soloRun=v[3];}}
    scene=soloScene;run=soloRun;
   }
  }
  const active=racing(scene);
  if(run!==lastRun||!active){elapsed=0;lastTick=null;lastRun=run;}
  if(active){if(lastTick!==null)elapsed+=Math.max(0,now-lastTick)/1000;lastTick=now;}else lastTick=null;
  const shared=environmentSnapshot(c.clock),seconds=shared?(shared.run?shared.elapsed:0):elapsed;
  const cycle=cycleAt(seconds,cycleDefaults),intensity=active?(mode==='night'?1:mode==='cycle'?cycle.mix:0):0;
  if(lastMode!==mode||lastIntensity!==intensity||lastRenderer!==r){
   const far=320*nightDefaults.distance/100;r.setNight(intensity,far*nightFadeStart(nightDefaults.softness),far,nightDefaults.sky/100,nightDefaults);
   lastMode=mode;lastIntensity=intensity;lastRenderer=r;
  }
  state={mode,intensity,phase:mode==='cycle'?cycle.phase:mode==='night'?'Night':'Day',elapsed:seconds,active};
 }
 return {update,pause,state:()=>({...state})};
}

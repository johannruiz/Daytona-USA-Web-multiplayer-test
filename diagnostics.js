import {BUILD_ID} from './room-settings.js?v=53.8.24';
import {performanceBatch} from './performance-history.js?v=53.8.24';
// Local, bounded measurements. Linked game samples can be shared with the room host.
export class Diagnostics {
  constructor({clock=()=>performance.now(),read=()=>({}),network=()=>({}),render=()=>{}}={}) {
    Object.assign(this,{clock,read,network,render});
    this.enabled=false;this.automatic=false;this.captureEnabled=true;this.sequence=0;this.history=[];this.latest=null;this.reset();
  }
  get collecting(){return this.captureEnabled&&(this.enabled||this.automatic);}
  reset() {this.since=this.clock();this.steps=0;this.draws=0;this.cpu=[];this.discardedMs=0;this.audioResets=0;this.maxGap=0;this.previousStep=null;this.nativeTotals=Array(24).fill(0);this.nativeSamples=0;this.windowNetwork=this.collecting?this.network():{};}
  step(ms,counters) {if(!this.collecting)return;const now=this.clock();if(this.previousStep!==null)this.maxGap=Math.max(this.maxGap,now-this.previousStep);this.previousStep=now;this.steps++;this.cpu.push(ms);if(counters){this.nativeSamples++;for(let i=0;i<24;i++)this.nativeTotals[i]+=counters[i]||0;}}
  draw() {if(this.collecting)this.draws++;}
  discard(ms) {if(this.collecting)this.discardedMs+=Math.max(0,ms);}
  audioReset() {if(this.collecting)this.audioResets++;}
  enable(on) {const before=this.collecting;this.enabled=this.captureEnabled&&!!on;if(before!==this.collecting)this.reset();this.render(this.latest,this.enabled);}
  setCaptureEnabled(on) {on=!!on;if(on===this.captureEnabled)return;this.captureEnabled=on;if(!on)this.enabled=false;this.reset();this.render(this.latest,this.enabled);}
  setAutomatic(on) {on=!!on;if(on===this.automatic)return;const before=this.collecting;this.automatic=on;if(on||before!==this.collecting)this.reset();if(on)this.latest=null;}
  share(epoch,after=0){return this.captureEnabled?performanceBatch(this.history,epoch,after):null;}
  update(running) {
    if(!this.collecting)return;
    const now=this.clock(),seconds=(now-this.since)/1000;if(seconds<1)return;
    const sorted=this.cpu.sort((a,b)=>a-b),network={...this.network()};delete network.connectionEvents;
    const rate=key=>Math.max(0,(network[key]||0)-(this.windowNetwork[key]||0))/seconds;
    network.sentBytesPerSecond=rate('payloadSentBytes');network.receivedBytesPerSecond=rate('payloadReceivedBytes');
    network.sentPacketsPerSecond=Math.max(0,(network.sent?.packets||0)-(this.windowNetwork.sent?.packets||0))/seconds;
    network.receivedPacketsPerSecond=Math.max(0,(network.received?.packets||0)-(this.windowNetwork.received?.packets||0))/seconds;
    const sample={sequence:++this.sequence,capturedAt:Date.now(),time:now,running,seconds,simulationHz:this.steps/seconds,drawHz:this.draws/seconds,
      cpuMeanMs:this.steps?sorted.reduce((a,b)=>a+b,0)/this.steps:0,
      cpuP95Ms:this.steps?sorted[Math.min(sorted.length-1,Math.floor(sorted.length*.95))]:0,
      maxStepGapMs:this.maxGap,discardedMs:this.discardedMs,audioResets:this.audioResets,
      nativeLink:this.nativeSamples?{listWritesHz:this.nativeTotals[7]/seconds,fgEdgesHz:this.nativeTotals[1]/seconds,dataBlocksHz:this.nativeTotals[2]/seconds,parseHz:this.nativeTotals[5]/seconds,fgReadsHz:this.nativeTotals[0]/seconds,frameCaps:this.nativeTotals[10],vblankCaps:this.nativeTotals[11],dataInFg:this.nativeTotals[18],groupedFgReads:this.nativeTotals[19],cancelledFgBatches:this.nativeTotals[20],video30Frames:this.nativeTotals[6]}:null,
      ...this.read(),network};
    if(sample.nativeLink){sample.nativeLink.poseApplicationsHz=this.nativeTotals[21]/seconds;sample.nativeLink.poseHeldPercent=this.nativeTotals[21]?100*this.nativeTotals[22]/this.nativeTotals[21]:null;sample.nativeLink.poseBufferTicks=this.nativeTotals[21]?this.nativeTotals[23]/1000/this.nativeTotals[21]:null;}
    this.latest=sample;this.history.push(sample);if(this.history.length>300)this.history.shift();
    if(this.enabled)this.render(sample,true);this.reset();
  }
  report() {return {schema:3,build:BUILD_ID,captureMode:this.captureEnabled?'full':'off',createdAt:new Date().toISOString(),connectionEvents:this.network().connectionEvents||[],
    userAgent:globalThis.navigator?.userAgent||'',note:'Local measurements. LIST counts CPU display-list publications, not GPU presentations or unique visible frames. DRAW can repeat a scene. TX/RX count arcade payloads, excluding protocol overhead, and TX does not prove delivery. Centralized DATA counts local shared-RAM applications with real control data and buffered/interpolated remote poses. poseBufferTicks is the additional playout distance in source game ticks, excluding network transit; poseHeldPercent counts applications that reached the newest available sample, not necessarily a visually stationary car. Packet intervals cover the last 256 gaps and include cabinet samples and host states. Central agesMs measures time since receipt by the host, excluding network transit. Peer frame deltas are observations with transit age, not synchronized clock measurements. WASM heap is capacity. GPU time is not measured.',samples:this.history};}
}

export function mountDiagnostics({element,toggle,extraToggles=[],download,read,room}) {
  let lastPoll=0,polling=false;
  const toggles=[toggle,...extraToggles];
  const diag=new Diagnostics({read,network:()=>room.diagnostics(),render:(s,on)=>{
    for(const control of toggles){control.checked=on;control.disabled=!diag.captureEnabled;}
    element.hidden=!on;
    if(!s){element.textContent='Diagnostics · collecting…';return;}
    const n=s.network,rtt=n.rttMs==null?'—':`${Math.round(n.rttMs)} ms`,flows=n.snapshotFlow||[];
    const lists=s.nativeLink?.listWritesHz,format=value=>Number.isFinite(value)?value.toFixed(1):'—';
    element.textContent=`${s.role||'SINGLE'} · SIM ${s.simulationHz.toFixed(1)} · DRAW ${s.drawHz.toFixed(0)} · LIST ${format(lists)} /s\nCPU ${s.cpuMeanMs.toFixed(1)} ms · p95 ${s.cpuP95Ms.toFixed(1)} · gap ${s.maxStepGapMs.toFixed(0)} ms\nTX ${(n.sentBytesPerSecond/1024).toFixed(0)} KiB/s · RX ${(n.receivedBytesPerSecond/1024).toFixed(0)} KiB/s · RTT ${rtt}\nQUEUE TX ${(n.bufferedBytes/1024).toFixed(1)} KiB · RX ${(s.receiveBytes/1024).toFixed(1)} KiB\nSNAPSHOTS flight ${flows.reduce((a,f)=>a+f.inFlight,0)} · pending ${flows.reduce((a,f)=>a+f.pending,0)} · superseded ${flows.reduce((a,f)=>a+f.coalesced,0)}\nDATA ${format(s.nativeLink?.dataBlocksHz)} · FG ${format(s.nativeLink?.fgEdgesHz)} /s · backlog ${format(s.backlogMs)} ms`;
  }});
  for(const control of toggles)control.addEventListener('change',()=>diag.enable(control.checked));
  download.addEventListener('click',()=>{
    const url=URL.createObjectURL(new Blob([JSON.stringify(diag.report(),null,2)],{type:'application/json'}));
    const a=document.createElement('a');a.href=url;a.download='daytona-diagnostics.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  });
  const update=diag.update.bind(diag);
  diag.update=running=>{
    update(running);
    const now=performance.now();if(!diag.collecting||polling||now-lastPoll<2000)return;
    lastPoll=now;polling=true;room.pollDiagnostics().catch(()=>{}).finally(()=>{polling=false;});
  };
  return diag;
}

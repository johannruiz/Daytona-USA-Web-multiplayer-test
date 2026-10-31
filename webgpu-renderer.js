import {packNight,updateNightPose} from './night-settings.js?v=53.8.59';
// WebGPU Model 2 polygons surrounded by GPU-composed System-24 layers.
import {createGpuLayers} from './gpu-layers.js?v=53.8.59';

export async function createWebGPURenderer(canvas, onFailure) {
  if (!globalThis.isSecureContext || !navigator.gpu)
    throw Error('WebGPU requires a compatible browser and HTTPS or localhost.');
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) throw Error('No WebGPU adapter was found.');
  const device = await adapter.requestDevice();
  let disposed=false;
  try{
  device.pushErrorScope('validation');
  device.lost.then(info => {if(!disposed)onFailure('The WebGPU device was lost: ' + info.message);});
  device.addEventListener('uncapturederror', e => {if(!disposed)onFailure('WebGPU: ' + e.error.message);});
  let context = canvas.getContext('webgpu');
  if (!context) throw Error('Could not create the WebGPU context.');
  const format = navigator.gpu.getPreferredCanvasFormat();
  context.configure({device, format, alphaMode:'opaque'});
  const response = await fetch(new URL('./model2.wgsl?v=53.8.59', import.meta.url));
  if (!response.ok) throw Error('Could not load model2.wgsl.');
  const modelShader = device.createShaderModule({label:'Model 2',code:await response.text()});
  for (const shader of [modelShader]) {
    const result = await shader.getCompilationInfo();
    const errors = result.messages.filter(m => m.type === 'error');
    if (errors.length) throw Error(errors.map(m => `${m.lineNum}: ${m.message}`).join('\n'));
  }
  const polyPipeline = await device.createRenderPipelineAsync({
    label:'Polígonos Model 2',layout:'auto',
    vertex:{module:modelShader,entryPoint:'vs_poly',buffers:[{arrayStride:64,attributes:[
      {shaderLocation:0,offset:0,format:'float32x2'},
      {shaderLocation:1,offset:8,format:'float32'},
      {shaderLocation:2,offset:12,format:'float32x3'},
      {shaderLocation:3,offset:24,format:'float32x4'},
      {shaderLocation:4,offset:40,format:'uint32x4'},
      {shaderLocation:5,offset:56,format:'uint32x2'}]}]},
    fragment:{module:modelShader,entryPoint:'ps_poly',targets:[{format}]},
    primitive:{topology:'triangle-list',cullMode:'none'},
    depthStencil:{format:'depth32float',depthWriteEnabled:true,depthCompare:'less'}
  });
  const buffer = (size,usage) => device.createBuffer({size,usage:usage|GPUBufferUsage.COPY_DST});
  const screen = buffer(32,GPUBufferUsage.UNIFORM);
  const night=buffer(144,GPUBufferUsage.UNIFORM);
  const nightValues=packNight(false);device.queue.writeBuffer(night,0,nightValues);
  const layers=await createGpuLayers(device,format,screen,night);
  const texram = buffer(0x400000,GPUBufferUsage.STORAGE);
  const luma = buffer(0x20000,GPUBufferUsage.STORAGE);
  const xlat = buffer(0x6000*4,GPUBufferUsage.STORAGE);
  const polyGroup = device.createBindGroup({layout:polyPipeline.getBindGroupLayout(0),entries:
    [screen,texram,luma,xlat,night].map((b,binding)=>({binding,resource:{buffer:b}}))});
  const validation=await device.popErrorScope();
  if(validation){disposed=true;device.destroy();throw Error('WebGPU initialization: '+validation.message);}
  let vertexBuffer=null, vertexCapacity=0, depth=null;
  let width=0,height=0,outputWidth=0,outputHeight=0,textureGeneration=-1;
  let uploadedModule=null,uploadedFrame=-1,uploadedHeap=null,layoutKey='',textureModule=null;
  let vertexSize=0,batchDraws=[];
  let inFlight=0;
  const screenValues=new Float32Array(8);
  let hudVisible=true,enhanced=false,drawDistance=1,displayKey='';
  function invalidate() {
    uploadedModule=null;uploadedFrame=-1;uploadedHeap=null;layoutKey='';
  }
  const extent=()=>{
    const dpr=globalThis.devicePixelRatio || 1, limit=device.limits.maxTextureDimension2D;
    const w=Math.max(1,Math.round(canvas.clientWidth*dpr)),h=Math.max(1,Math.round(canvas.clientHeight*dpr));
    const ratio=Math.min(1,limit/Math.max(w,h));
    return [Math.max(1,Math.round(w*ratio)),Math.max(1,Math.round(h*ratio))];
  };
  function resize(w,h,ow,oh) {
    if(ow!==outputWidth || oh!==outputHeight){
      depth?.destroy();outputWidth=ow;outputHeight=oh;canvas.width=ow;canvas.height=oh;
      depth=device.createTexture({size:[ow,oh],format:'depth32float',usage:GPUTextureUsage.RENDER_ATTACHMENT});
    }
    if(w===width && h===height)return;
    width=w;height=h;
    invalidate();
  }
  return {
    backend:'webgpu',
    setNight(on,near=16,far=128,sky=0.12,options={}){const v=packNight(on,near,far,sky,options);if(v.some((x,i)=>x!==nightValues[i])){nightValues.set(v);device.queue.writeBuffer(night,0,nightValues);invalidate();}},
    setHUDVisible(on){hudVisible=!!on;},
    attach(target){const next=target.getContext('webgpu');if(!next)throw Error('Could not attach the WebGPU canvas.');next.configure({device,format,alphaMode:'opaque'});context.unconfigure();context=next;canvas=target;},
    dispose(){disposed=true;context.unconfigure();device.destroy();},
    reset() {textureGeneration=-1;displayKey='';layers.reset();invalidate();},
    setEnhanced(on) {enhanced=on;displayKey='';canvas.classList.toggle('enhanced',on);},
    setDrawDistance(level) {drawDistance=level;enhanced=level>0;displayKey='';canvas.classList.toggle('enhanced',enhanced);},
    prepare(wasm) {
      const [w,h]=enhanced?extent():[496,384];
      const key=`${enhanced}:${w}:${h}`;
      if(key!==displayKey){
        wasm._daytona_set_draw_distance(enhanced?drawDistance:0);
        // Portrait phones keep the complete arcade image, leaving thumb room
        // below it. Wide windows still reveal additional scenery.
        const gameHeight=enhanced?Math.min(h,Math.ceil(w*384/496)):h;
        wasm._daytona_set_display(Number(enhanced),w,gameHeight);displayKey=key;invalidate();
      }
    },
    draw(wasm) {
      // A small bounded queue tolerates delayed completion callbacks without
      // blocking RAF. Pending repeats below never consume another slot.
      if(inFlight>=3)return false;
      const frame=wasm._daytona_total_frames();
      // A pending presentation already contains this state. Repeating it in
      // the queue can occupy the slot needed by the next actual game step.
      if(inFlight&&wasm===uploadedModule&&frame===uploadedFrame&&wasm.HEAPU8.buffer===uploadedHeap){
        const [ow,oh]=enhanced?extent():[width,height];
        if(ow===outputWidth&&oh===outputHeight)return false;
      }
      if(!wasm._daytona_prepare_visual())throw Error('Could not prepare graphics for the latest game state.');
      if(updateNightPose(wasm,nightValues))device.queue.writeBuffer(night,0,nightValues);
      const w=wasm._daytona_width(),h=wasm._daytona_height();
      const [ow,oh]=enhanced?extent():[w,h];resize(w,h,ow,oh);
      const scale=enhanced?Math.min(oh/h,ow/496):oh/h,viewWidth=ow/scale,offset=(w-viewWidth)/2;
      const top=(oh-h*scale)/2;
      const mem=wasm.HEAPU8; // reacquire after wasm memory growth
      const key=`${w}:${h}:${ow}:${oh}:${enhanced}`;
      const layoutChanged=key!==layoutKey;
      // Continue presenting on every browser refresh. Only the GPU input data
      // and batch clipping are reused when no simulation step changed them.
      // Reset, module replacement, heap growth and display changes invalidate
      // the cache even when the frame counter is unchanged or restarts.
      const dataChanged=wasm!==uploadedModule || frame!==uploadedFrame || mem.buffer!==uploadedHeap;
      if(layoutChanged){
        screenValues.set([viewWidth,h,offset,scale,0,top,0,0]);
        device.queue.writeBuffer(screen,0,screenValues);
      }
      if(dataChanged){
        const view=(ptr,size)=>mem.subarray(ptr,ptr+size);
        layers.update(wasm);
        const gen=wasm._daytona_texture_generation();
        const tp0=wasm._daytona_tex0_ptr(),tp1=wasm._daytona_tex1_ptr();
        if(tp0 && tp1 && (wasm!==textureModule || gen!==textureGeneration)){
          device.queue.writeBuffer(texram,0,view(tp0,0x200000));
          device.queue.writeBuffer(texram,0x200000,view(tp1,0x200000));textureGeneration=gen;textureModule=wasm;
        }
        const lp=wasm._daytona_luma_ptr(),xp=wasm._daytona_xlat_ptr();
        if(lp)device.queue.writeBuffer(luma,0,view(lp,0x20000));
        if(xp)device.queue.writeBuffer(xlat,0,view(xp,0x6000*4));
        vertexSize=wasm._daytona_vertices_count()*64;
        if(vertexSize>vertexCapacity){vertexBuffer?.destroy();vertexCapacity=Math.ceil(vertexSize/65536)*65536;
          vertexBuffer=buffer(vertexCapacity,GPUBufferUsage.VERTEX);}
        if(vertexSize)device.queue.writeBuffer(vertexBuffer,0,view(wasm._daytona_vertices_ptr(),vertexSize));
      }
      if(dataChanged || layoutChanged){
        batchDraws.length=0;
        if(vertexSize){
          const batches=new Uint32Array(mem.buffer,wasm._daytona_batches_ptr(),wasm._daytona_batches_count()*6);
          for(let n=0;n<batches.length;n+=6){
            const x=Math.max(0,Math.floor((batches[n+2]-offset)*scale));
            const y=Math.max(0,Math.floor(top+batches[n+3]*scale));
            const right=Math.min(ow,Math.ceil((batches[n+2]+batches[n+4]-offset)*scale));
            const bottom=Math.min(oh,Math.ceil(top+(batches[n+3]+batches[n+5])*scale));
            if(right>x && bottom>y)batchDraws.push(x,y,right-x,bottom-y,batches[n+1],batches[n]);
          }
        }
        uploadedModule=wasm;uploadedFrame=frame;uploadedHeap=mem.buffer;layoutKey=key;
      }
      const encoder=device.createCommandEncoder();
      layers.compose(encoder);
      const pass=encoder.beginRenderPass({colorAttachments:[{view:context.getCurrentTexture().createView(),
        loadOp:'clear',storeOp:'store',clearValue:{r:0,g:0,b:0,a:1}}],
        depthStencilAttachment:{view:depth.createView(),depthLoadOp:'clear',depthStoreOp:'discard',depthClearValue:1}});
      pass.setViewport(0,top,ow,h*scale,0,1);
      layers.back(pass);
      if(vertexSize){
        pass.setPipeline(polyPipeline);pass.setBindGroup(0,polyGroup);pass.setVertexBuffer(0,vertexBuffer);
        for(let n=0;n<batchDraws.length;n+=6){
          pass.setScissorRect(batchDraws[n],batchDraws[n+1],batchDraws[n+2],batchDraws[n+3]);
          pass.draw(batchDraws[n+4],1,batchDraws[n+5]);
        }
      }
      pass.setScissorRect(0,0,ow,oh);if(hudVisible)layers.front(pass);
      pass.end();device.queue.submit([encoder.finish()]);inFlight++;
      device.queue.onSubmittedWorkDone().then(()=>{inFlight--;},error=>{inFlight--;onFailure('The graphics queue failed: '+error.message);});
      return true;
    }
  };
  }catch(error){disposed=true;device.destroy();throw error;}
}

import {packNight,updateNightPose} from './night-settings.js?v=53.8.30';
// WebGL2 backend: integer RAM textures, GPU System-24 composition and bounded
// non-blocking presentation. The native game and simulation clock are shared.
const TILE_BYTES=0x94000+496*384,PAGE=4096,PAGES=Math.ceil(TILE_BYTES/PAGE);
const SHADERS=['model2.vert.glsl','model2.frag.glsl','fullscreen.vert.glsl','system24.frag.glsl','tiles-present.frag.glsl'];
export async function createWebGL2Renderer(canvas,onFailure,{onStatus=()=>{}}={}){
 const sources=await Promise.all(SHADERS.map(async name=>{
  const response=await fetch(new URL(name+'?v=53.8.30',import.meta.url));
  if(!response.ok)throw Error('Could not load '+name);return response.text();
 }));
 const gl=canvas.getContext('webgl2',{alpha:false,antialias:false,depth:false,stencil:false,preserveDrawingBuffer:false,powerPreference:'high-performance'});
 if(!gl)throw Error('No hardware-accelerated WebGL2 context was available.');
 let lost=false,disposed=false,lossTimer=null,resources=null;
 let hudVisible=true;
 const nightValues=packNight(false);
 const nightBeamParts=[16,20,24,28,32].map(i=>nightValues.subarray(i,i+4));
 const nightBase=nightValues.subarray(0,4),nightShape=nightValues.subarray(4,8),nightWorld=nightValues.subarray(8,12),nightSky=nightValues.subarray(12,16);
 let width=0,height=0,ow=0,oh=0,enhanced=false,drawDistance=1,displayKey='';
 let uploadedModule=null,uploadedFrame=-1,uploadedHeap=null,textureModule=null,textureGeneration=-1,layoutKey='';
 let tileOwner=null,tileHeap=null,pending=true,vertexSize=0,vertexCount=0,currentSlot=0;
 const versions=new Uint32Array(PAGES),metadata=new Uint32Array(4),view=new Float32Array(4),batchDraws=[];
 let flights=[];
 const allocated={programs:new Set(),textures:new Set(),buffers:new Set(),vaos:new Set(),framebuffers:new Set()};
 const limit=Math.min(gl.getParameter(gl.MAX_TEXTURE_SIZE),gl.getParameter(gl.MAX_RENDERBUFFER_SIZE),...gl.getParameter(gl.MAX_VIEWPORT_DIMS));
 function compile(type,source){
  const shader=gl.createShader(type);gl.shaderSource(shader,source);gl.compileShader(shader);
  if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS)){const error=gl.getShaderInfoLog(shader);gl.deleteShader(shader);throw Error('WebGL2 shader: '+error);}
  return shader;
 }
 function program(vertex,fragment){
  const v=compile(gl.VERTEX_SHADER,vertex);let f,p;
  try{
   f=compile(gl.FRAGMENT_SHADER,fragment);p=gl.createProgram();gl.attachShader(p,v);gl.attachShader(p,f);gl.linkProgram(p);
   if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw Error('WebGL2 program: '+gl.getProgramInfoLog(p));
   allocated.programs.add(p);return {program:p,uniforms:new Map()};
  }catch(error){if(p)gl.deleteProgram(p);throw error;}finally{gl.deleteShader(v);if(f)gl.deleteShader(f);}
 }
 function loc(p,name){if(!p.uniforms.has(name))p.uniforms.set(name,gl.getUniformLocation(p.program,name));return p.uniforms.get(name);}
 function bindTexture(texture,unit){gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,texture.id);}
 function texture(w,h,format=gl.RGBA8){
  const id=gl.createTexture();allocated.textures.add(id);gl.bindTexture(gl.TEXTURE_2D,id);gl.texStorage2D(gl.TEXTURE_2D,1,format,w,h);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  return {id,w,h};
 }
 function framebuffer(colors,depth=null){
  const f=gl.createFramebuffer();allocated.framebuffers.add(f);gl.bindFramebuffer(gl.FRAMEBUFFER,f);
  colors.forEach((t,i)=>gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0+i,gl.TEXTURE_2D,t.id,0));
  if(depth)gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.TEXTURE_2D,depth.id,0);
  gl.drawBuffers(colors.map((_,i)=>gl.COLOR_ATTACHMENT0+i));
  if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw Error('WebGL2 framebuffer is incomplete.');
  return f;
 }
 function initialize(){
  if(limit<1024)throw Error('WebGL2 texture limits are too small for this game.');
  const poly=program(sources[0],sources[1]),compose=program(sources[2],sources[3]),present=program(sources[2],sources[4]);
  const data=texture(1024,Math.ceil(TILE_BYTES/4/1024),gl.R32UI),texram=texture(1024,1024,gl.R32UI),luma=texture(256,128,gl.R32UI),xlat=texture(256,96,gl.R32UI);
  const back=texture(496,384),front=texture(496,384),layers=framebuffer([back,front]);
  const slots=Array.from({length:3},()=>{
   const buffer=gl.createBuffer(),vao=gl.createVertexArray();allocated.buffers.add(buffer);allocated.vaos.add(vao);gl.bindVertexArray(vao);gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
   for(const [index,size,offset,integer] of [[0,2,0],[1,1,8],[2,3,12],[3,4,24],[4,4,40,true],[5,2,56,true]]){
    gl.enableVertexAttribArray(index);if(integer)gl.vertexAttribIPointer(index,size,gl.UNSIGNED_INT,64,offset);else gl.vertexAttribPointer(index,size,gl.FLOAT,false,64,offset);
   }
   return {buffer,vao,capacity:0};
  });
  const emptyVao=gl.createVertexArray();allocated.vaos.add(emptyVao);
  for(const p of [compose,present]){gl.useProgram(p.program);gl.uniform1i(loc(p,'uData'),0);}
  gl.useProgram(present.program);gl.uniform1i(loc(present,'uLayer'),4);
  gl.useProgram(poly.program);for(const [name,unit] of [['uTexram',1],['uLuma',2],['uXlat',3]])gl.uniform1i(loc(poly,name),unit);
  gl.disable(gl.BLEND);gl.disable(gl.CULL_FACE);gl.disable(gl.DITHER);gl.pixelStorei(gl.UNPACK_ALIGNMENT,4);
  gl.bindVertexArray(null);gl.bindFramebuffer(gl.FRAMEBUFFER,null);
  if(gl.getError()!==gl.NO_ERROR)throw Error('WebGL2 resource initialization failed.');
  resources={poly,compose,present,data,texram,luma,xlat,back,front,layers,slots,emptyVao,target:null,color:null,depth:null};
 }
 function invalidate(){uploadedModule=null;uploadedFrame=-1;uploadedHeap=null;layoutKey='';}
 function reset(){textureGeneration=-1;textureModule=null;displayKey='';tileOwner=null;tileHeap=null;versions.fill(0);metadata.fill(0xffffffff);pending=true;invalidate();}
 function extent(){const dpr=globalThis.devicePixelRatio||1,w=Math.max(1,Math.round(canvas.clientWidth*dpr)),h=Math.max(1,Math.round(canvas.clientHeight*dpr)),ratio=Math.min(1,limit/Math.max(w,h));return [Math.max(1,Math.round(w*ratio)),Math.max(1,Math.round(h*ratio))];}
 function upload(target,unit,start,bytes){
  if(!bytes.byteLength)return;bindTexture(target,unit);
  const words=new Uint32Array(bytes.buffer,bytes.byteOffset,bytes.byteLength/4);let index=start/4,from=0;
  while(from<words.length){
   const x=index%target.w,y=Math.floor(index/target.w),count=x?Math.min(target.w-x,words.length-from):Math.min(words.length-from,target.w);
   if(!x&&words.length-from>=target.w){const rows=Math.floor((words.length-from)/target.w),n=rows*target.w;gl.texSubImage2D(gl.TEXTURE_2D,0,0,y,target.w,rows,gl.RED_INTEGER,gl.UNSIGNED_INT,words.subarray(from,from+n));from+=n;index+=n;}
   else{gl.texSubImage2D(gl.TEXTURE_2D,0,x,y,count,1,gl.RED_INTEGER,gl.UNSIGNED_INT,words.subarray(from,from+count));from+=count;index+=count;}
  }
 }
 function updateLayers(wasm){
  const mem=wasm.HEAPU8,force=tileOwner!==wasm||tileHeap!==mem.buffer;
  const next=new Uint32Array(mem.buffer,wasm._daytona_tiles_metadata_ptr(),4),current=new Uint32Array(mem.buffer,wasm._daytona_tiles_versions_ptr(),PAGES);
  if(next[3]!==1)throw Error('The graphics engine and WebGL2 layers are from different builds. Reload the page.');
  metadata.set(next);const ptr=wasm._daytona_tiles_ptr();
  for(let page=0;page<PAGES;){
   if(!force&&versions[page]===current[page]){page++;continue;}
   const first=page;do{versions[page]=current[page];page++;}while(page<PAGES&&(force||versions[page]!==current[page]));
   const start=first*PAGE,end=Math.min(page*PAGE,TILE_BYTES);upload(resources.data,0,start,mem.subarray(ptr+start,ptr+end));pending=true;
  }
  tileOwner=wasm;tileHeap=mem.buffer;
 }
 function poll(){
  flights=flights.filter(f=>{
   const state=gl.clientWaitSync(f.sync,0,0);
   if(state===gl.WAIT_FAILED)throw Error('The WebGL2 graphics queue failed.');
   if(state===gl.TIMEOUT_EXPIRED)return true;
   gl.deleteSync(f.sync);return false;
  });
 }
 function resize(w,h,outW,outH){
  if(ow!==outW||oh!==outH){
   const r=resources;if(r.target){gl.deleteFramebuffer(r.target);allocated.framebuffers.delete(r.target);}for(const t of [r.color,r.depth])if(t){gl.deleteTexture(t.id);allocated.textures.delete(t.id);}
   ow=outW;oh=outH;canvas.width=ow;canvas.height=oh;
   r.color=texture(ow,oh);r.depth=texture(ow,oh,gl.DEPTH_COMPONENT32F);r.target=framebuffer([r.color],r.depth);layoutKey='';
  }
  if(w!==width||h!==height){width=w;height=h;invalidate();}
 }
 function uniforms(p,top){for(const [i,name] of ['uNightLamp','uNightDirection','uNightRight','uNightUp','uNightBeam'].entries())gl.uniform4fv(loc(p,name),nightBeamParts[i]);gl.uniform4fv(loc(p,'uNight'),nightBase);gl.uniform4fv(loc(p,'uNightShape'),nightShape);gl.uniform4fv(loc(p,'uNightWorld'),nightWorld);gl.uniform4fv(loc(p,'uNightSky'),nightSky);gl.uniform4fv(loc(p,'uView'),view);gl.uniform1f(loc(p,'uTop'),top);gl.uniform1f(loc(p,'uOutputHeight'),oh);}
 function destroy(){
  for(const [kind,remove] of [['programs','deleteProgram'],['textures','deleteTexture'],['buffers','deleteBuffer'],['vaos','deleteVertexArray'],['framebuffers','deleteFramebuffer']]){for(const value of allocated[kind])gl[remove](value);allocated[kind].clear();}
  for(const f of flights)gl.deleteSync(f.sync);flights=[];resources=null;
 }
 function contextLost(event){event.preventDefault();lost=true;flights=[];resources=null;for(const values of Object.values(allocated))values.clear();reset();onStatus('WebGL2 · restoring graphics…');lossTimer=setTimeout(()=>{if(lost&&!disposed)onFailure('WebGL2 could not restore its graphics context. Reload the page.');},8000);}
 function contextRestored(){
  if(disposed)return;clearTimeout(lossTimer);
  try{ow=oh=width=height=0;initialize();reset();lost=false;onStatus('WebGL2');}catch(error){onFailure('WebGL2 recovery failed: '+error.message);}
 }
 try{initialize();reset();}catch(error){destroy();throw error;}
 canvas.addEventListener('webglcontextlost',contextLost);canvas.addEventListener('webglcontextrestored',contextRestored);
 return {
  backend:'webgl2',reset,
  setNight(on,near=16,far=128,sky=0.12,options={}){const v=packNight(on,near,far,sky,options);if(v.some((x,i)=>x!==nightValues[i])){nightValues.set(v);invalidate();}},
  setHUDVisible(on){hudVisible=!!on;},
  dispose(){disposed=true;clearTimeout(lossTimer);canvas.removeEventListener('webglcontextlost',contextLost);canvas.removeEventListener('webglcontextrestored',contextRestored);if(!lost)destroy();},
  setEnhanced(on){enhanced=on;displayKey='';canvas.classList.toggle('enhanced',on);},
  setDrawDistance(level){drawDistance=level;enhanced=level>0;displayKey='';canvas.classList.toggle('enhanced',enhanced);},
  prepare(wasm){
   if(lost||disposed)return;const [w,h]=enhanced?extent():[496,384],key=`${enhanced}:${w}:${h}`;
   if(key!==displayKey){wasm._daytona_set_draw_distance(enhanced?drawDistance:0);wasm._daytona_set_display(Number(enhanced),w,enhanced?Math.min(h,Math.ceil(w*384/496)):h);displayKey=key;invalidate();}
  },
  draw(wasm){
   if(lost||disposed)return false;poll();if(flights.length>=3)return false;
   const frame=wasm._daytona_total_frames(),mem=wasm.HEAPU8;
   const [outW,outH]=enhanced?extent():[wasm._daytona_width(),wasm._daytona_height()];
   if(flights.length&&wasm===uploadedModule&&frame===uploadedFrame&&mem.buffer===uploadedHeap&&outW===ow&&outH===oh)return false;
   if(!wasm._daytona_prepare_visual())throw Error('Could not prepare graphics for the latest game state.');
   updateNightPose(wasm,nightValues);
   resize(wasm._daytona_width(),wasm._daytona_height(),outW,outH);
   const heap=wasm.HEAPU8,r=resources,scale=enhanced?Math.min(oh/height,ow/496):oh/height,viewWidth=ow/scale,offset=(width-viewWidth)/2,top=(oh-height*scale)/2;
   const key=`${width}:${height}:${ow}:${oh}:${enhanced}`,changed=wasm!==uploadedModule||frame!==uploadedFrame||heap.buffer!==uploadedHeap;
   view.set([viewWidth,height,offset,scale]);
   if(changed){
    updateLayers(wasm);
    const gen=wasm._daytona_texture_generation(),tp0=wasm._daytona_tex0_ptr(),tp1=wasm._daytona_tex1_ptr();
    if(tp0&&tp1&&(textureModule!==wasm||gen!==textureGeneration)){
     upload(r.texram,1,0,heap.subarray(tp0,tp0+0x200000));upload(r.texram,1,0x200000,heap.subarray(tp1,tp1+0x200000));textureModule=wasm;textureGeneration=gen;
    }
    const lp=wasm._daytona_luma_ptr(),xp=wasm._daytona_xlat_ptr();
    if(lp)upload(r.luma,2,0,heap.subarray(lp,lp+0x20000));if(xp)upload(r.xlat,3,0,heap.subarray(xp,xp+0x6000*4));
    vertexCount=wasm._daytona_vertices_count();vertexSize=vertexCount*64;
    if(vertexSize){
     currentSlot=(currentSlot+1)%3;const slot=r.slots[currentSlot];gl.bindBuffer(gl.ARRAY_BUFFER,slot.buffer);
     if(vertexSize>slot.capacity){slot.capacity=Math.ceil(vertexSize/65536)*65536;gl.bufferData(gl.ARRAY_BUFFER,slot.capacity,gl.STREAM_DRAW);}
     gl.bufferSubData(gl.ARRAY_BUFFER,0,heap.subarray(wasm._daytona_vertices_ptr(),wasm._daytona_vertices_ptr()+vertexSize));
    }
   }
   if(changed||key!==layoutKey){
    batchDraws.length=0;
    if(vertexSize){const batches=new Uint32Array(heap.buffer,wasm._daytona_batches_ptr(),wasm._daytona_batches_count()*6);
     for(let n=0;n<batches.length;n+=6){const x=Math.max(0,Math.floor((batches[n+2]-offset)*scale)),y=Math.max(Math.floor(top),Math.floor(top+batches[n+3]*scale)),right=Math.min(ow,Math.ceil((batches[n+2]+batches[n+4]-offset)*scale)),bottom=Math.min(Math.floor(top+height*scale),Math.ceil(top+(batches[n+3]+batches[n+5])*scale));if(right>x&&bottom>y)batchDraws.push(x,oh-bottom,right-x,bottom-y,batches[n+1],batches[n]);}
    }
    uploadedModule=wasm;uploadedFrame=frame;uploadedHeap=heap.buffer;layoutKey=key;
   }
   gl.disable(gl.SCISSOR_TEST);gl.disable(gl.DEPTH_TEST);gl.depthMask(false);gl.bindVertexArray(r.emptyVao);
   if(pending){gl.bindFramebuffer(gl.FRAMEBUFFER,r.layers);gl.viewport(0,0,496,384);gl.useProgram(r.compose.program);bindTexture(r.data,0);gl.drawArrays(gl.TRIANGLES,0,3);pending=false;}
   gl.bindFramebuffer(gl.FRAMEBUFFER,r.target);gl.viewport(0,0,ow,oh);gl.depthMask(true);gl.clearColor(0,0,0,1);gl.clearDepth(1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.depthMask(false);
   gl.useProgram(r.present.program);uniforms(r.present,top);gl.uniform4uiv(loc(r.present,'uControl'),metadata);gl.uniform1i(loc(r.present,'uFront'),0);bindTexture(r.back,4);bindTexture(r.data,0);gl.drawArrays(gl.TRIANGLES,0,3);
   if(vertexSize){
    gl.enable(gl.DEPTH_TEST);gl.depthMask(true);gl.depthFunc(gl.LESS);gl.enable(gl.SCISSOR_TEST);gl.useProgram(r.poly.program);uniforms(r.poly,top);gl.uniform2f(loc(r.poly,'uOutput'),ow,oh);
    bindTexture(r.texram,1);bindTexture(r.luma,2);bindTexture(r.xlat,3);gl.bindVertexArray(r.slots[currentSlot].vao);
    for(let n=0;n<batchDraws.length;n+=6){gl.scissor(batchDraws[n],batchDraws[n+1],batchDraws[n+2],batchDraws[n+3]);gl.drawArrays(gl.TRIANGLES,batchDraws[n+5],batchDraws[n+4]);}
   }
   gl.disable(gl.SCISSOR_TEST);gl.disable(gl.DEPTH_TEST);gl.depthMask(false);gl.bindVertexArray(r.emptyVao);gl.useProgram(r.present.program);gl.uniform1i(loc(r.present,'uFront'),1);bindTexture(r.front,4);if(hudVisible)gl.drawArrays(gl.TRIANGLES,0,3);
   gl.bindFramebuffer(gl.READ_FRAMEBUFFER,r.target);gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER,null);gl.blitFramebuffer(0,0,ow,oh,0,0,ow,oh,gl.COLOR_BUFFER_BIT,gl.NEAREST);
   const sync=gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE,0);if(!sync)throw Error('Could not fence the WebGL2 presentation.');flights.push({sync});gl.flush();return true;
  }
 };
}

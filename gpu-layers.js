// Fixed-size GPU tile composition plus sparse, versioned native snapshots.
const BYTE_SIZE=0x94000+496*384,PAGE=4096,PAGES=Math.ceil(BYTE_SIZE/PAGE);
export async function createGpuLayers(device,format,screen,night){
 const load=async name=>{const response=await fetch(new URL(name+'?v=53.8.30',import.meta.url));if(!response.ok)throw Error('Could not load '+name);return device.createShaderModule({label:name,code:await response.text()});};
 const [computeShader,presentShader]=await Promise.all([load('system24.wgsl'),load('tiles-present.wgsl')]);
 for(const module of [computeShader,presentShader]){
  const info=await module.getCompilationInfo(),errors=info.messages.filter(m=>m.type==='error');
  if(errors.length)throw Error(errors.map(m=>`${m.lineNum}: ${m.message}`).join('\n'));
 }
 const compose=await device.createComputePipelineAsync({layout:'auto',compute:{module:computeShader,entryPoint:'compose'}});
 const presentation=entryPoint=>device.createRenderPipelineAsync({layout:'auto',vertex:{module:presentShader,entryPoint:'vs'},fragment:{module:presentShader,entryPoint,targets:[{format}]},primitive:{topology:'triangle-list'},depthStencil:{format:'depth32float',depthWriteEnabled:false,depthCompare:'always'}});
 const [backPipeline,frontPipeline]=await Promise.all([presentation('fs_back'),presentation('fs_front')]);
 const data=device.createBuffer({size:BYTE_SIZE,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST});
 const control=device.createBuffer({size:16,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});
 const texture=label=>device.createTexture({label,size:[496,384],format:'rgba8unorm',usage:GPUTextureUsage.STORAGE_BINDING|GPUTextureUsage.TEXTURE_BINDING});
 const back=texture('System 24 background'),front=texture('System 24 HUD');
 const backView=back.createView(),frontView=front.createView();
 const computeGroup=device.createBindGroup({layout:compose.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:data}},{binding:1,resource:backView},{binding:2,resource:frontView}]});
 const backGroup=device.createBindGroup({layout:backPipeline.getBindGroupLayout(0),entries:[{binding:0,resource:backView},{binding:3,resource:{buffer:screen}},{binding:4,resource:{buffer:control}},{binding:5,resource:{buffer:night}}]});
 const frontGroup=device.createBindGroup({layout:frontPipeline.getBindGroupLayout(0),entries:[{binding:1,resource:frontView},{binding:2,resource:{buffer:data}},{binding:3,resource:{buffer:screen}},{binding:4,resource:{buffer:control}}]});
 const versions=new Uint32Array(PAGES),metadata=new Uint32Array(4);
 let owner=null,heap=null,pending=true;
 return {
  reset(){owner=null;heap=null;versions.fill(0);pending=true;metadata.fill(0xffffffff);},
  update(wasm){
   const mem=wasm.HEAPU8,force=owner!==wasm||heap!==mem.buffer;
   const current=new Uint32Array(mem.buffer,wasm._daytona_tiles_versions_ptr(),PAGES);
   const next=new Uint32Array(mem.buffer,wasm._daytona_tiles_metadata_ptr(),4);
   if(next[3]!==1)throw Error('The graphics engine and GPU layers are from different builds. Reload the page.');
   if(force||next.some((v,i)=>metadata[i]!==v)){metadata.set(next);device.queue.writeBuffer(control,0,metadata);}
   const ptr=wasm._daytona_tiles_ptr();
   for(let page=0;page<PAGES;){
    if(!force&&versions[page]===current[page]){page++;continue;}
    const first=page;do{versions[page]=current[page];page++;}while(page<PAGES&&(force||versions[page]!==current[page]));
    const start=first*PAGE,end=Math.min(page*PAGE,BYTE_SIZE);
    device.queue.writeBuffer(data,start,mem.subarray(ptr+start,ptr+end));pending=true;
   }
   owner=wasm;heap=mem.buffer;
  },
  compose(encoder){if(!pending)return;const pass=encoder.beginComputePass();pass.setPipeline(compose);pass.setBindGroup(0,computeGroup);pass.dispatchWorkgroups(62,48);pass.end();pending=false;},
  back(pass){pass.setPipeline(backPipeline);pass.setBindGroup(0,backGroup);pass.draw(3);},
  front(pass){pass.setPipeline(frontPipeline);pass.setBindGroup(0,frontGroup);pass.draw(3);}
 };
}

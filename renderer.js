import {createWebGPURenderer} from './webgpu-renderer.js?v=53.8.57';
import {createWebGL2Renderer} from './webgl2-renderer.js?v=53.8.57';
import {requestedGraphicsAPI} from './graphics-api-settings.js?v=53.8.57';

export async function createRenderer(canvas,onFailure,options={}){
 const requested=options.backend??requestedGraphicsAPI({getItem:key=>globalThis.localStorage?.getItem(key)},globalThis.location?.search||'');
 if(!['auto','webgpu','webgl2'].includes(requested))throw Error('Unknown graphics backend: '+requested);
 let reason='';
 if(requested!=='webgl2'){
  let selected=false,renderer;
  try{
   // Probe separately: a failed initialization must not lock the real canvas.
   renderer=await createWebGPURenderer(document.createElement('canvas'),message=>{if(selected)onFailure(message);});
   renderer.attach(canvas);selected=true;options.onStatus?.('WebGPU');return renderer;
  }catch(error){renderer?.dispose();reason=error.message||String(error);if(requested==='webgpu')throw error;}
 }
 try{const renderer=await createWebGL2Renderer(canvas,onFailure,options);options.onStatus?.('WebGL2');return renderer;}
 catch(error){throw Error(reason?'WebGPU unavailable ('+reason+'). WebGL2: '+error.message:error.message);}
}

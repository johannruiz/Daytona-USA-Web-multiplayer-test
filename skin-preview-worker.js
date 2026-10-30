// This isolated engine reads only the ROM supplied by this browser. No uploads.
import factory from './skin-preview-engine.js?v=53.8.47';
import {DEFAULT_EEPROM} from './nvram.js?v=53.8.47';
let engine,initializing;
const yieldTask=()=>new Promise(resolve=>setTimeout(resolve,0));
async function initialize(file){
 if(!(file instanceof Blob))throw Error('Choose a valid ROM first.');
 engine=await factory({locateFile:path=>new URL(path+'?v=53.8.47',import.meta.url).href,print:()=>{},printErr:()=>{}});
 engine.FS.mkdir('/roms');engine.FS.writeFile('/roms/preview.zip',new Uint8Array(await file.arrayBuffer()));
 const reload=()=>{if(!engine.ccall('daytona_load','number',['string','number'],['/roms/preview.zip',0]))throw Error('The preview engine could not read this ROM.');};
 reload();
 // A fresh, isolated standalone DELUXE preset; never read or save the player's
 // settings. No service-menu simulation is needed for a static preview scene.
 engine.HEAPU8.set(DEFAULT_EEPROM,engine._daytona_eeprom_ptr());
 if(!engine._daytona_link_enable(0)||!engine._daytona_set_cpu_cars(0)||!engine._daytona_set_race_options(0)||!engine._daytona_set_reverse_course(0))throw Error('Preview settings could not be applied.');
 const tick=async(n,buttons=0,gas=0,brake=0)=>{for(let f=0;f<n;f++){if(!engine._daytona_step(50,gas,brake,4,buttons))throw Error('Preview preparation failed.');if(f%30===29)await yieldTask();}};
 const press=async(buttons,gas=0)=>{await tick(20,buttons,gas);await tick(20);};
 await tick(1500);await press(1);await press(2);await tick(120);await press(0,100);await tick(90);await press(0,100);
 for(let f=0;f<6000&&!engine._daytona_preview_ready();f+=30)await tick(30,0,100);
 if(!engine._daytona_preview_ready())throw Error('The preview scene did not become ready.');
 await tick(240,0,0,100);
}
self.onmessage=async({data})=>{
 try{
  if(data.type==='init'){
   if(initializing)throw Error('Preview already initialized.');
   initializing=initialize(data.file);await initializing;self.postMessage({type:'ready'});return;
  }
  if(data.type!=='render'||!initializing)return;
  await initializing;
  if(!Number.isInteger(data.skin)||data.skin<0||data.skin>39||!Number.isInteger(data.seat)||data.seat<1||data.seat>8)throw Error('Invalid livery.');
  if(!engine._daytona_preview_render(data.skin,data.seat))throw Error('This livery could not be previewed.');
  const width=engine._daytona_preview_width(),height=engine._daytona_preview_height(),pointer=engine._daytona_preview_pixels();
  const pixels=engine.HEAPU8.slice(pointer,pointer+width*height*4).buffer;
  self.postMessage({type:'pixels',id:data.id,width,height,pixels},[pixels]);
 }catch(error){self.postMessage({type:'error',id:data.id,message:error.message});}
};

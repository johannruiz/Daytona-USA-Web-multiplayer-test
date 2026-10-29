import {DEFAULT_EEPROM} from './nvram.js?v=53.8.41';
import {validEnvironment} from './environment.js?v=53.8.41';
export const BUILD_ID='daytona-rev-a-central-53.8.16';
export const MODES=['Normal','Grand Prix','Endurance'];
// Number of original MODE UP presses from the factory Normal setting.
export const DIFFICULTIES=['Normal','Hard','Hardest','Easy'];
export function validateSettings(value){
 if(!value||!Number.isInteger(value.mode)||value.mode<0||value.mode>2||!Number.isInteger(value.difficulty)||value.difficulty<0||value.difficulty>3||value.region!=='Export')throw Error('Unsupported room settings.');
 if(value.cpuCars!==undefined&&typeof value.cpuCars!=='boolean')throw Error('Unsupported CPU car setting.');
 if(value.reverse!==undefined&&typeof value.reverse!=='boolean')throw Error('Unsupported circuit direction.');
 for(const key of ['playerCollisions','pitStops'])if(value[key]!==undefined&&typeof value[key]!=='boolean')throw Error('Unsupported race rule.');
 if(value.cpuLiveries!==undefined&&!['multiplayer','single'].includes(value.cpuLiveries))throw Error('Unsupported CPU livery setting.');
 if(value.environment!==undefined&&!validEnvironment(value.environment))throw Error('Unsupported environment setting.');
 return {mode:value.mode,difficulty:value.difficulty,region:'Export',cpuCars:value.cpuCars??true,reverse:value.reverse??false,playerCollisions:value.playerCollisions??true,pitStops:value.pitStops??true,cpuLiveries:value.cpuLiveries??'multiplayer',environment:value.environment??'day'};
}
export function raceOptionsMask(value){const s=validateSettings(value);return (s.playerCollisions?0:1)|(s.pitStops?0:2)|(s.cpuLiveries==='single'?4:0);}
export function configurationInputs({master,cabinet,...settings}){
 validateSettings(settings);
 if(!Number.isInteger(cabinet)||cabinet<1||cabinet>8)throw Error('Invalid cabinet number.');
 const buttons=[4,8,8,2,...Array(8).fill(128),...Array(master?1:2).fill(64),8,...Array(cabinet-1).fill(64),8,8,8,...Array(settings.difficulty).fill(64),8,8,...Array(settings.mode).fill(64),8,8,2,128,128,2];
 return buttons;
}
// Upgrade an existing single-player save through the original menu, allowing
// the arcade to write its checksum. Keep scores and all other settings.
export async function ensureDeluxeCabinet(wasm,reload){
 const ptr=wasm._daytona_eeprom_ptr(),type=wasm.HEAPU8[ptr+26];
 if(type===0)return false;
 if(type!==1&&type!==2)throw Error('Unsupported cabinet settings.');
 const backup=wasm.HEAPU8.slice(wasm._daytona_backup_ptr(),wasm._daytona_backup_ptr()+wasm._daytona_backup_size());
 const step=async(n,buttons=0)=>{for(let i=0;i<n;i++){if(!wasm._daytona_step(0,0,0,1,buttons))throw Error('Could not apply DELUXE cabinet settings.');if(i%20===19)await new Promise(r=>setTimeout(r,0));}};
 await step(600);
 const inputs=[4,8,8,2,...Array(8).fill(128),8,8,...Array(3-type).fill(64),...Array(6).fill(8),2,128,128,2];
 for(const buttons of inputs){await step(20,buttons);await step(20);}
 await step(60);
 const eeprom=wasm.HEAPU8.slice(wasm._daytona_eeprom_ptr(),wasm._daytona_eeprom_ptr()+wasm._daytona_eeprom_size());
 if(eeprom[26]!==0)throw Error('The arcade did not confirm DELUXE cabinet settings.');
 reload();wasm.HEAPU8.set(eeprom,wasm._daytona_eeprom_ptr());wasm.HEAPU8.set(backup,wasm._daytona_backup_ptr());return true;
}
// Have the original game's menu write its own settings/checksum. Start from
// a known single/Export profile, then cold-boot with that resulting EEPROM.
export async function prepareCabinet(wasm,reload,config,cancelled=()=>false){
 const yieldBrowser=()=>new Promise(resolve=>setTimeout(resolve,0));
 const step=async(n,buttons=0)=>{
  for(let i=0;i<n;i++){
   if(cancelled())throw Error('Cabinet preparation cancelled.');
   if(!wasm._daytona_step(0,0,0,1,buttons))throw Error('The arcade failed while applying room settings.');
   if(i%20===19)await yieldBrowser();
  }
 };
 reload();wasm.HEAPU8.set(DEFAULT_EEPROM,wasm._daytona_eeprom_ptr());
 await step(600);
 for(const buttons of configurationInputs(config)){await step(20,buttons);await step(20);}
 await step(60);
 const eeprom=wasm.HEAPU8.slice(wasm._daytona_eeprom_ptr(),wasm._daytona_eeprom_ptr()+wasm._daytona_eeprom_size());
 reload();wasm.HEAPU8.set(eeprom,wasm._daytona_eeprom_ptr());
 if(!wasm._daytona_link_enable(1))throw Error('The engine does not support cabinet linking.');
 return eeprom;
}
export function invitation(host,token){return `${host}.${token}`;}
export function parseInvitation(text){
 let code=String(text||'').trim();
 if(/^https?:\/\//i.test(code)){const url=new URL(code);code=new URLSearchParams(url.hash.slice(1)).get('room')||'';}
 const match=/^(dt-[a-zA-Z0-9-]{8,80})\.([a-f0-9]{32})$/.exec(code);
 if(!match)throw Error('Paste a complete room code or invitation link.');
 return {host:match[1],token:match[2]};
}




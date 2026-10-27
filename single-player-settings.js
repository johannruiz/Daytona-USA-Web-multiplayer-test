import {DEFAULT_EEPROM} from './nvram.js?v=53.8.30';
import {raceOptionsMask,validateSettings} from './room-settings.js?v=53.8.30';
import {validPlayerSkin} from './player-skins.js?v=53.8.30';
import {validEnvironment} from './environment.js?v=53.8.30';

export const SINGLE_SETTINGS_ID='daytona-single-player-race-v1';
export const DEFAULT_SINGLE_SETTINGS=Object.freeze({mode:0,difficulty:0,cpuCars:true,reverse:false,pitStops:true,region:'Export',skin:0,environment:'day'});
export function loadSingleSettings(storage){
 let saved;try{saved=JSON.parse(storage.getItem(SINGLE_SETTINGS_ID));}catch{}
 const value={...DEFAULT_SINGLE_SETTINGS};
 if(Number.isInteger(saved?.mode)&&saved.mode>=0&&saved.mode<=2)value.mode=saved.mode;
 if(Number.isInteger(saved?.difficulty)&&saved.difficulty>=0&&saved.difficulty<=3)value.difficulty=saved.difficulty;
 for(const key of ['cpuCars','reverse','pitStops'])if(typeof saved?.[key]==='boolean')value[key]=saved[key];
 if(validPlayerSkin(saved?.skin))value.skin=saved.skin;
 if(validEnvironment(saved?.environment))value.environment=saved.environment;
 return value;
}
export function sameSingleSettings(a,b){return !!a&&!!b&&['mode','difficulty','cpuCars','reverse','pitStops','region'].every(key=>a[key]===b[key])&&(a.skin??0)===(b.skin??0)&&(a.environment??'day')===(b.environment??'day');}
export function singleConfigurationInputs(value){
 const {mode,difficulty}=validateSettings(value);
 // Keep LINK ID at SINGLE and CAR NUMBER at 1. The original service menu
 // writes its own checksum, using the same rows as multiplayer preparation.
 return [4,8,8,2,...Array(8).fill(128),8,8,8,8,...Array(difficulty).fill(64),8,8,...Array(mode).fill(64),8,8,2,128,128,2];
}
export async function prepareSingleCabinet(wasm,reload,value,cancelled=()=>false){
 if(value.skin!==undefined&&!validPlayerSkin(value.skin))throw Error('Choose a valid car livery.');
 const config={...validateSettings(value),skin:value.skin??0};
 const backup=wasm.HEAPU8.slice(wasm._daytona_backup_ptr(),wasm._daytona_backup_ptr()+wasm._daytona_backup_size());
 const step=async(n,buttons=0)=>{for(let i=0;i<n;i++){
  if(cancelled())throw Error('Cabinet preparation cancelled.');
  if(!wasm._daytona_step(0,0,0,1,buttons))throw Error('The arcade could not apply your race settings.');
  if(i%20===19)await new Promise(resolve=>setTimeout(resolve,0));
 }};
 reload();wasm.HEAPU8.set(DEFAULT_EEPROM,wasm._daytona_eeprom_ptr());
 await step(600);
 for(const buttons of singleConfigurationInputs(config)){await step(20,buttons);await step(20);}
 await step(60);
 const eeprom=wasm.HEAPU8.slice(wasm._daytona_eeprom_ptr(),wasm._daytona_eeprom_ptr()+wasm._daytona_eeprom_size());
 if(eeprom[11]!==0||eeprom[26]!==0)throw Error('The arcade did not confirm a standalone DELUXE cabinet.');
 reload();wasm.HEAPU8.set(eeprom,wasm._daytona_eeprom_ptr());wasm.HEAPU8.set(backup,wasm._daytona_backup_ptr());
 if(!wasm._daytona_link_enable(0)||!wasm._daytona_set_race_options(raceOptionsMask(config))||!wasm._daytona_set_cpu_cars(Number(config.cpuCars))||!wasm._daytona_set_reverse_course(config.reverse?4:0)||!wasm._daytona_set_single_skin(config.skin))throw Error('Could not apply the single-player race options.');
 return config;
}

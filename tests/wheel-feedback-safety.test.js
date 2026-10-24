import test from 'node:test';
import assert from 'node:assert/strict';
import {WheelForceFeedback,wheelMayDrive,pairedDevice,hidIdentity,gamepadHardware} from '../wheel-force-feedback.js';
import {loadSettings,SETTINGS_ID} from '../preferences.js';
const wheel=()=>({vendorId:0x1209,productId:0xb300,productName:'Bridge',opened:false,reports:[],async open(){this.opened=true;},async close(){this.opened=false;},async sendReport(id,data){this.reports.push(new Uint8Array(data));}});
test('forces require an active steering wheel, visible focused gameplay, never menus or spectators',()=>{
 const state={running:true,started:true,menuOpen:false,focused:true,hidden:false,wheelActive:true};assert.equal(wheelMayDrive(state),true);
 for(const override of [{running:false},{started:false},{menuOpen:true},{focused:false},{hidden:true},{wheelActive:false},{spectating:true}])assert.equal(wheelMayDrive({...state,...override}),false);
});
test('default FFB is opt-in and starts low; malformed stored settings do not enable it',()=>{
 const load=value=>loadSettings({getItem:key=>key===SETTINGS_ID?JSON.stringify(value):null});
 assert.equal(load(null).forceFeedbackEnabled,false);assert.equal(load(null).forceFeedbackStrength,.2);
 assert.equal(load({forceFeedbackEnabled:'true',forceFeedbackStrength:9}).forceFeedbackEnabled,false);assert.equal(load({forceFeedbackStrength:-1}).forceFeedbackStrength,0);
 assert.equal(load({forceFeedbackStrength:9}).forceFeedbackStrength,1);
});
test('restore never opens the first authorized device; duplicates require an explicit choice',async()=>{
 const a=wheel(),b=wheel();b.productName='Other bridge';const ffb=new WheelForceFeedback({hid:{getDevices:async()=>[a,b]}});
 assert.equal(await ffb.restore(),null);assert.equal(a.opened,false);
 assert.equal(pairedDevice([a,a],hidIdentity(a)),null);
 await ffb.restore(hidIdentity(b),'Bridge (Vendor: 1209 Product: b300)');assert.equal(a.opened,false);assert.equal(b.opened,true);await ffb.disconnect();
});
test('Chrome and Firefox-style input IDs constrain the HID picker and reject mismatched hardware',async()=>{
 assert.deepEqual(gamepadHardware('046d-c24f-G29'),{vendorId:0x046d,productId:0xc24f});
 let filters;const target=wheel(),ffb=new WheelForceFeedback({hid:{requestDevice:async options=>{filters=options.filters;return [target];}}});
 await assert.rejects(ffb.request('G29 (Vendor: 046d Product: c24f)'),/same physical wheel/);assert.equal(target.opened,false);
 assert.ok(filters.length>0);assert.ok(filters.every(filter=>filter.vendorId===0x046d&&filter.productId===0xc24f));
 assert.ok(filters.every(filter=>filter.usagePage===1&&[4,8].includes(filter.usage)));
});
test('disconnect while a permission picker is pending prevents a late device from opening',async()=>{
 let resolve;const target=wheel(),ffb=new WheelForceFeedback({hid:{requestDevice:()=>new Promise(r=>resolve=r)}});
 const request=ffb.request('Bridge');await ffb.disconnect();resolve([target]);assert.equal(await request,null);assert.equal(target.opened,false);
});
test('disabling or forced safety stop cancels a manual pull and ends with a stop packet',async()=>{
 for(const action of ['disable','stop']){
  let done,waiting;const entered=new Promise(r=>waiting=r),target=wheel(),ffb=new WheelForceFeedback({wait:()=>{waiting();return new Promise(r=>done=r);}});
  await ffb.useDevice(target);ffb.setEnabled(true);const test=ffb.testLeft({maxStrength:.2});await entered;
  action==='disable'?ffb.setEnabled(false):ffb.stop({force:true});await ffb.flush();assert.equal(ffb.testing,false);assert.equal(target.reports.at(-1)[5],0);
  done();await test;assert.equal(target.reports.at(-1)[5],0);await ffb.disconnect();
 }
});
test('an in-flight effect is followed by stop, and stale queued movement is discarded',async()=>{
 let release,enter;const started=new Promise(r=>enter=r),target=wheel();target.sendReport=async(id,data)=>{target.reports.push(new Uint8Array(data));if(data[5]===1){enter();await new Promise(r=>release=r);}};
 const ffb=new WheelForceFeedback();await ffb.useDevice(target);ffb.setEnabled(true);ffb.update({force:1},0);await started;
 ffb.update({force:-1},20);ffb.stop({force:true});release();await ffb.flush();assert.deepEqual(target.reports.map(r=>r[5]),[1,0]);await ffb.disconnect();
});

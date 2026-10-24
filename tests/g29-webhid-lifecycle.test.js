import test from 'node:test';
import assert from 'node:assert/strict';
import {LogitechG29HIDProvider,WheelForceFeedback} from '../wheel-force-feedback.js';

test('padded G29 reports also preserve damper, expiry, stop and close commands',async()=>{
 const sent=[],timers=[];
 const device={vendorId:0x046d,productId:0xc24f,productName:'G29 Driving Force Racing Wheel',opened:false,
  collections:[{usagePage:1,usage:4,outputReports:[{reportId:0,items:[{reportSize:8,reportCount:16}]}]}],
  async open(){this.opened=true;},async close(){this.opened=false;},async sendReport(id,data){assert.equal(id,0);assert.equal(data.length,16);assert.ok([...data.slice(7)].every(n=>n===0));sent.push([...data.slice(0,7)]);}};
 const provider=new LogitechG29HIDProvider(device,{schedule:(fn,ms)=>{timers.push({fn,ms});return timers.length;},cancel(){}});
 await provider.open();await provider.damper(.4,{duration:120});assert.deepEqual(sent.at(-1),[0x21,0x0c,0x0f,0,0x0f,0,102]);
 await provider.damper(.25,{duration:120});assert.deepEqual(sent.at(-1),[0x2c,0x0c,0x0f,0,0x0f,0,64]);
 await provider.constant(.3,{duration:120});assert.deepEqual(sent.at(-2),[0xf3,0,0,0,0,0,0]);assert.equal(timers.at(-1).ms,120);
 timers.at(-1).fn();await Promise.resolve();assert.deepEqual(sent.at(-1),[0xf3,0,0,0,0,0,0]);
 await provider.close();assert.equal(device.opened,false);assert.deepEqual(sent.at(-1),[0xf5,0,0,0,0,0,0]);
});

test('known native T300 and custom bridge retain their advertised HID collection filters',async()=>{
 for(const [input,vendorId,productId] of [['T300 (Vendor: 044f Product: b66e)',0x044f,0xb66e],['Bridge (Vendor: 1209 Product: b300)',0x1209,0xb300]]){
  let filters;const ffb=new WheelForceFeedback({hid:{requestDevice:async options=>{filters=options.filters;return [];}}});
  await ffb.request(input);assert.ok(filters.length>0);assert.ok(filters.every(f=>f.vendorId===vendorId&&f.productId===productId));
  if(vendorId===0x1209)assert.ok(filters.some(f=>f.usagePage===0xff00&&f.usage===1));
  else assert.ok(filters.some(f=>f.usagePage===undefined));
 }
});

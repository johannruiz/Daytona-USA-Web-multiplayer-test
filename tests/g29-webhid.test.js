import test from 'node:test';
import assert from 'node:assert/strict';
import {LogitechG29HIDProvider,WheelForceFeedback,providerForDevice} from '../wheel-force-feedback.js';
import {describeHIDDevice} from '../webhid-diagnostics.js';

const usage=(page,id)=>(page<<16)|id;
function g29Device({bytes=16,productId=0xc24f,productName='G29 Driving Force Racing Wheel',usagePage=1,collectionUsage=4,reportId=0}={}){
  const outputReports=[{reportId,items:[{reportSize:8,reportCount:bytes,usages:[usage(0xff00,1)]}]}];
  return {vendorId:0x046d,productId,productName,opened:false,outputs:[],
    collections:[{usagePage,usage:collectionUsage,outputReports,inputReports:[],featureReports:[],children:[]}],
    async open(){this.opened=true;},async close(){this.opened=false;},
    async sendReport(id,data){this.outputs.push({reportId:id,data:new Uint8Array(data)});}};
}

test('G29 supports native seven-byte and macOS padded wheel reports',()=>{
  assert.equal(providerForDevice(g29Device({bytes:7})),LogitechG29HIDProvider);
  assert.equal(providerForDevice(g29Device({bytes:16})),LogitechG29HIDProvider);
  assert.equal(providerForDevice(g29Device({bytes:16,productId:0xc260})),LogitechG29HIDProvider);
  assert.match(describeHIDDevice(g29Device()),/compatible with Daytona's Logitech G29 native FFB/);
});

test('G29 ignores its vendor interface and the T300 compatibility bridge',()=>{
  assert.equal(providerForDevice(g29Device({bytes:6,usagePage:0xff00,collectionUsage:1,reportId:0x10})),null);
  assert.equal(providerForDevice(g29Device({bytes:19,usagePage:0xff00,collectionUsage:2,reportId:0x11})),null);
  assert.equal(providerForDevice(g29Device({productName:'T300 Native FFB Compatibility Bridge'})),null);
  assert.equal(providerForDevice(g29Device({productName:'Unknown compatibility bridge'})),null);
});

test('G29 pads native commands to the advertised macOS report size',async()=>{
  const target=g29Device(),provider=new LogitechG29HIDProvider(target,{schedule:()=>1,cancel:()=>{}});
  await provider.open();
  await provider.constant(-.6,{duration:280});
  assert.equal(target.outputs.length,3);
  assert.ok(target.outputs.every(output=>output.reportId===0&&output.data.length===16));
  assert.deepEqual([...target.outputs[0].data.slice(0,7)],[0xf3,0,0,0,0,0,0]);
  assert.deepEqual([...target.outputs[1].data.slice(0,7)],[0xf5,0,0,0,0,0,0]);
  assert.deepEqual([...target.outputs[2].data.slice(0,7)],[0x11,0x08,51,0,0,0,0]);
  assert.deepEqual([...target.outputs[2].data.slice(7)],[0,0,0,0,0,0,0,0,0]);
});

test('known G29 input narrows the chooser to matching wheel collections',async()=>{
  let requested;
  const hid={async requestDevice(options){requested=options;return [];},addEventListener(){},removeEventListener(){}};
  const feedback=new WheelForceFeedback({hid});
  assert.equal(await feedback.request('G29 (Vendor: 046d Product: c24f)'),null);
  assert.ok(requested.filters.length>0);
  assert.ok(requested.filters.every(filter=>filter.vendorId===0x046d&&filter.productId===0xc24f));
  assert.ok(requested.filters.some(filter=>filter.usagePage===1&&filter.usage===4));
  assert.ok(requested.filters.every(filter=>Number.isInteger(filter.usagePage)&&Number.isInteger(filter.usage)));
  feedback.destroy();
});

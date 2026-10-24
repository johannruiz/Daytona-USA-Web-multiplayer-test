import test from 'node:test';
import assert from 'node:assert/strict';
import {LogitechG29HIDProvider,StandardHIDPIDProvider,T300NativeHIDProvider,T300WebHIDV2Provider,WheelForceFeedback,providerForDevice} from '../wheel-force-feedback.js';

function device(){
  return {vendorId:0x1209,productId:0xb300,productName:'Test WebHID bridge',opened:false,reports:[],
    async open(){this.opened=true;},async close(){this.opened=false;},async sendReport(reportId,data){this.reports.push({reportId,data:new Uint8Array(data)});}};
}

test('T300 v2 provider builds bounded, checksummed finite packets',async()=>{
  const target=device(),provider=new T300WebHIDV2Provider(target,{random:{getRandomValues(values){values[0]=0x1234;}}});
  await provider.open();await provider.constant(-.2,{duration:120});await provider.damper(.25,{duration:120});await provider.stop();
  assert.equal(target.reports.length,3);
  const constant=target.reports[0];assert.equal(constant.reportId,1);assert.equal(constant.data.length,48);
  assert.deepEqual([...constant.data.slice(0,6)],[0x54,0x33,0x57,0x46,2,1]);
  const view=new DataView(constant.data.buffer);assert.equal(view.getUint16(6,true),0x1234);assert.equal(view.getUint16(10,true),120);
  assert.equal(view.getInt16(16,true),Math.round(-.2*32767));
  for(const report of target.reports)assert.equal(report.data.reduce((value,byte)=>value^byte,0),0);
  const damper=new DataView(target.reports[1].data.buffer);assert.equal(target.reports[1].data[5],9);assert.equal(damper.getInt16(16,true),Math.round(-.25*32767));
  assert.equal(target.reports[2].data[5],0);
});

test('provider matching is isolated behind the generic provider interface',()=>{
  assert.equal(providerForDevice(device()),T300WebHIDV2Provider);
  assert.equal(providerForDevice({vendorId:1,productId:2}),null);
});

test('native T300 provider sends gain, constant-force and damper packets through report 0x60',async()=>{
  const target=nativeT300Device();assert.equal(providerForDevice(target),T300NativeHIDProvider);
  const provider=new T300NativeHIDProvider(target);await provider.open();await provider.constant(-.6,{duration:280});
  assert.equal(target.outputs[0].reportId,0x60);assert.deepEqual([...target.outputs[0].data.slice(0,2)],[1,5]);
  assert.deepEqual([...target.outputs[1].data.slice(0,2)],[2,255]);
  assert.deepEqual([...target.outputs[2].data.slice(0,4)],[8,4,1,0]);assert.deepEqual([...target.outputs[3].data.slice(0,4)],[8,3,0,0]);
  const upload=target.outputs[4];assert.deepEqual([...upload.data.slice(0,3)],[0,1,0x6a]);
  assert.equal(new DataView(upload.data.buffer).getInt16(3,true),Math.round(.6*16384));
  assert.equal(upload.data[14],0x4f);assert.equal(new DataView(upload.data.buffer).getUint16(15,true),280);
  assert.deepEqual([...target.outputs[5].data.slice(0,6)],[0,1,0x89,0x41,1,0]);
  await provider.constant(.25,{duration:120});assert.equal(target.outputs[6].data[14],0x45);
  await provider.damper(.4,{duration:120});
  assert.deepEqual([...target.outputs[8].data.slice(0,4)],[0,1,0x89,0]);
  assert.deepEqual([...target.outputs[9].data.slice(0,3)],[0,2,0x64]);
  assert.equal(new DataView(target.outputs[9].data.buffer).getInt16(3,true),Math.round(.4*32764));
  assert.equal(target.outputs[9].data[27],7);assert.equal(target.outputs[9].data[28],0x4f);
  assert.deepEqual([...target.outputs[10].data.slice(0,4)],[0,2,0x89,0x41]);
  await provider.stop();assert.deepEqual([...target.outputs.at(-1).data.slice(0,4)],[0,2,0x89,0]);
  await provider.close();assert.equal(target.opened,false);
});

test('native G29 provider is isolated from the T300 bridge and sends bounded seven-byte effects',async()=>{
  const target=logitechG29Device(),timers=[],cancelled=[];
  const provider=new LogitechG29HIDProvider(target,{
    schedule(fn,milliseconds){timers.push({fn,milliseconds});return timers.length;},
    cancel:id=>cancelled.push(id)
  });
  assert.equal(providerForDevice(target),LogitechG29HIDProvider);
  assert.equal(providerForDevice(logitechG29Device(0xc260,'Logitech G29 PS4')),LogitechG29HIDProvider);
  assert.equal(providerForDevice(logitechG29Device(0xc24f,'T300 Native FFB Compatibility Bridge')),null);
  assert.equal(providerForDevice(logitechG29Device(0xc24f,'Unknown compatibility bridge',16)),null);

  await provider.open();
  assert.deepEqual([...target.outputs[0].data],[0xf3,0,0,0,0,0,0]);
  assert.deepEqual([...target.outputs[1].data],[0xf5,0,0,0,0,0,0]);
  await provider.constant(-.6,{duration:280});
  assert.deepEqual([...target.outputs[2].data],[0x11,0x08,51,0,0,0,0]);
  assert.equal(timers[0].milliseconds,280);
  await provider.damper(.4,{duration:120});
  assert.deepEqual([...target.outputs[3].data],[0xf3,0,0,0,0,0,0]);
  assert.deepEqual([...target.outputs[4].data],[0x21,0x0c,0x0f,0,0x0f,0,102]);
  await provider.damper(.25,{duration:120});
  assert.deepEqual([...target.outputs[5].data],[0x2c,0x0c,0x0f,0,0x0f,0,64]);
  assert.deepEqual(cancelled,[1,2]);
  await provider.close();
  assert.deepEqual([...target.outputs.at(-2).data],[0xf3,0,0,0,0,0,0]);
  assert.deepEqual([...target.outputs.at(-1).data],[0xf5,0,0,0,0,0,0]);
  assert.equal(target.opened,false);assert.deepEqual(cancelled,[1,2,3]);
  assert.ok(target.outputs.every(output=>output.reportId===0&&output.data.length===7));
});

test('standard HID PID provider discovers report layouts and runs finite constant and damper effects',async()=>{
  const target=pidDevice();assert.equal(providerForDevice(target),StandardHIDPIDProvider);
  const provider=new StandardHIDPIDProvider(target,{wait:async()=>{}});await provider.open();
  const controls=target.outputs.filter(item=>item.reportId===0x52);assert.equal(controls.length,4);
  assert.deepEqual(controls.map(item=>item.data[0]),[4,4,3,1]);
  await provider.constant(-.2,{duration:120});
  assert.equal(target.features[0].reportId,0x15);assert.equal(target.features[0].data[0],1);
  const setConstant=target.outputs.find(item=>item.reportId===0x16);
  assert.equal(setConstant.data[0],7);assert.equal(new DataView(setConstant.data.buffer).getInt16(1,true),Math.round(-.2*32767));
  const setEffect=target.outputs.find(item=>item.reportId===0x14);
  assert.equal(setEffect.data[0],7);assert.equal(setEffect.data[1],1);
  assert.equal(setEffect.data[4]&2,2);
  assert.equal(target.outputs.find(item=>item.reportId===0x51).data[1],1);
  await provider.damper(.25,{duration:120});
  assert.equal(target.outputs.filter(item=>item.reportId===0x14).at(-1).data[1],9);
  const condition=target.outputs.filter(item=>item.reportId===0x18);assert.equal(condition.length,2);
  assert.equal(new DataView(condition[0].data.buffer).getInt16(2,true),Math.round(-.25*32767));
  await provider.stop();assert.equal(target.outputs.filter(item=>item.reportId===0x51).at(-1).data[1],3);
  await provider.close();assert.equal(target.opened,false);
  assert.ok(target.outputs.some(item=>item.reportId===0x58&&item.data[0]===7));
});

test('standard PID allocation ignores stale full responses while the wheel updates its status',async()=>{
  const target=pidDevice();let reads=0;
  target.receiveFeatureReport=async()=>new DataView(Uint8Array.of(++reads<3?2:1,7).buffer);
  const provider=new StandardHIDPIDProvider(target,{wait:async()=>{}});await provider.open();await provider.constant(-.2);
  assert.equal(reads,3);assert.ok(target.outputs.some(item=>item.reportId===0x16));
});

test('standard PID allocation retries a full pool with a standard reset and descriptor operation values',async()=>{
  const target=pidDevice();let reads=0;
  target.receiveFeatureReport=async()=>{
    reads++;const resetCount=target.outputs.filter(item=>item.reportId===0x52&&item.data[0]===4).length,recovered=resetCount>=3;
    return new DataView(Uint8Array.of(recovered?1:2,recovered?7:255).buffer);
  };
  const provider=new StandardHIDPIDProvider(target,{wait:async()=>{}});await provider.open();await provider.constant(-.2);
  assert.ok(reads>60);assert.deepEqual(target.outputs.filter(item=>item.reportId===0x52).slice(-4).map(item=>item.data[0]),[3,2,4,1]);
  assert.equal(provider.controlMode,'standard');assert.equal(target.features.filter(item=>item.reportId===0x15).at(-1).data[0],1);
  assert.equal(target.outputs.filter(item=>item.reportId===0x14).at(-1).data[1],1);
  assert.equal(target.outputs.filter(item=>item.reportId===0x51).at(-1).data[1],2);
  await provider.stop();assert.deepEqual(target.outputs.filter(item=>item.reportId===0x52).slice(-2).map(item=>item.data[0]),[3,2]);
});

test('generic controller renews finite effects, coalesces updates and always stops',async()=>{
  const target=device(),statuses=[];
  const feedback=new WheelForceFeedback({onStatus:value=>statuses.push(value)});
  await feedback.useDevice(target);feedback.setEnabled(true);feedback.setStrength(.2);
  assert.equal(feedback.update({force:1},0),true);await feedback.flush();
  assert.equal(new DataView(target.reports[0].data.buffer).getInt16(16,true),Math.round(.2*32767));
  feedback.update({force:1},20);await feedback.flush();assert.equal(target.reports.length,1);
  feedback.update({force:1},61);await feedback.flush();assert.equal(target.reports.length,2);
  feedback.stop();await feedback.flush();assert.equal(target.reports.at(-1).data[5],0);
  feedback.setReverse(true);feedback.update({force:.5},130);await feedback.flush();
  assert.equal(new DataView(target.reports.at(-1).data.buffer).getInt16(16,true),Math.round(-.1*32767));
  feedback.setEnabled(false);await feedback.flush();assert.equal(target.reports.at(-1).data[5],0);
  assert.match(statuses[0],/Connected/);
});

test('manual FFB test is a brief left pull capped at 60% and always stops',async()=>{
  const target=device(),feedback=new WheelForceFeedback({wait:async()=>{}});
  await feedback.useDevice(target);feedback.setStrength(.8);
  assert.equal(await feedback.testLeft(),true);
  assert.equal(target.reports.length,3);
  assert.equal(new DataView(target.reports[1].data.buffer).getInt16(16,true),Math.round(-.6*32767));
  assert.equal(target.reports.at(-1).data[5],0);

  const failing=device(),failure=new WheelForceFeedback({wait:async()=>{throw Error('test interrupted');}});
  await failure.useDevice(failing);failure.setStrength(.2);
  await assert.rejects(failure.testLeft(),/test interrupted/);
  assert.equal(failing.reports.at(-1).data[5],0);assert.equal(failure.connected,false);
});

test('disabled, disconnected and unavailable game sources never claim an effect',async()=>{
  const target=device(),statuses=[],feedback=new WheelForceFeedback({onStatus:value=>statuses.push(value)});feedback.setSourceAvailable(false);await feedback.useDevice(target);
  assert.equal(statuses.at(-1),'Connected');
  assert.equal(feedback.update({force:1},0),false);assert.equal(target.reports.length,0);
  feedback.setEnabled(true);feedback.setSourceAvailable(false);
  assert.equal(feedback.update({force:1},100),false);assert.equal(target.reports.length,0);
  await feedback.disconnect();assert.equal(target.opened,false);assert.equal(target.reports.at(-1).data[5],0);
});

test('a provider initialization failure closes the HID device and remains disconnected',async()=>{
  class FailingProvider extends T300WebHIDV2Provider{async open(){await super.open();throw Error('initialization failed');}}
  const target=device(),feedback=new WheelForceFeedback({providers:[FailingProvider]});
  await assert.rejects(feedback.useDevice(target),/initialization failed/);
  assert.equal(feedback.connected,false);assert.equal(target.opened,false);
});

function fakeControl(){
  const listeners=new Map(),classes=new Set();
  return {disabled:false,checked:false,value:'',textContent:'',
    classList:{toggle(name,on){if(on)classes.add(name);else classes.delete(name);},has:name=>classes.has(name)},
    addEventListener(name,listener){listeners.set(name,listener);},
    emit(name){return listeners.get(name)?.({target:this});}};
}

const hidUsage=(page,id)=>(page<<16)|id;
const pidField=(id,size=8,min=0,max=(1<<Math.min(size,30))-1)=>({reportSize:size,reportCount:1,usages:[hidUsage(0x0f,id)],logicalMinimum:min,logicalMaximum:max,isAbsolute:true});
const desktopField=(id,size=1,min=0,max=1)=>({reportSize:size,reportCount:1,usages:[hidUsage(0x01,id)],logicalMinimum:min,logicalMaximum:max,isAbsolute:true});
const selectorField=(ids,size=8)=>({reportSize:size,reportCount:1,usages:ids.map(id=>hidUsage(0x0f,id)),logicalMinimum:ids.length,logicalMaximum:0,isArray:true,isAbsolute:true});
const report=(reportId,items)=>({reportId,items});
function logitechG29Device(productId=0xc24f,productName='Logitech G29 Driving Force Racing Wheel',bytes=7){
  const outputReports=[report(0,[{reportSize:8,reportCount:bytes,usages:[hidUsage(0xff00,1)],logicalMinimum:0,logicalMaximum:255,isAbsolute:true}])];
  return {vendorId:0x046d,productId,productName,opened:false,outputs:[],collections:[{usagePage:1,usage:4,outputReports,featureReports:[],inputReports:[],children:[]}],
    async open(){this.opened=true;},async close(){this.opened=false;},async sendReport(reportId,data){this.outputs.push({reportId,data:new Uint8Array(data)});}};
}
function nativeT300Device(){
  const outputReports=[report(0x60,[{reportSize:8,reportCount:63,usages:[hidUsage(0xff00,0x60)],logicalMinimum:0,logicalMaximum:255,isAbsolute:true}])];
  return {vendorId:0x044f,productId:0xb66e,productName:'T300',opened:false,outputs:[],collections:[{usagePage:1,usage:4,outputReports,featureReports:[],inputReports:[],children:[]}],
    async open(){this.opened=true;},async close(){this.opened=false;},async sendReport(reportId,data){this.outputs.push({reportId,data:new Uint8Array(data)});}};
}
function pidDevice(){
  const outputReports=[
    report(0x14,[pidField(0x22),selectorField([0x41,0x26]),pidField(0x50,16,0,65534),pidField(0x56,1,0,1),desktopField(0x30),desktopField(0x31),pidField(0x57,16,0,65535),pidField(0x53,7,0,127),pidField(0x54,16,0,65534)]),
    report(0x16,[pidField(0x22),pidField(0x70,16,-32767,32767)]),
    report(0x18,[pidField(0x22),pidField(0x23),pidField(0x61,16,-32767,32767),pidField(0x62,16,-32767,32767),pidField(0x60,16,-32767,32767),pidField(0x65,16,0,65535),pidField(0x63,16,0,32767),pidField(0x64,16,0,32767)]),
    report(0x43,[pidField(0x7e)]),
    report(0x51,[pidField(0x22),selectorField([0x7a,0x79,0x7b]),pidField(0x7c)]),
    report(0x52,[selectorField([0x9c,0x9b,0x98,0x97,0x99,0x9a])]),
    report(0x58,[pidField(0x22)])
  ];
  const featureReports=[report(0x15,[selectorField([0x41,0x26])]),report(0x16,[selectorField([0x8e,0x8d,0x8c]),pidField(0x22)])];
  return {vendorId:0x044f,productId:0xb66e,productName:'Generic HID PID wheel',opened:false,outputs:[],features:[],collections:[{usagePage:1,usage:4,outputReports,featureReports,inputReports:[],children:[]}],
    async open(){this.opened=true;},async close(){this.opened=false;},
    async sendReport(reportId,data){this.outputs.push({reportId,data:new Uint8Array(data)});},
    async sendFeatureReport(reportId,data){this.features.push({reportId,data:new Uint8Array(data)});},
    async receiveFeatureReport(){return new DataView(Uint8Array.of(1,7).buffer);}};
}

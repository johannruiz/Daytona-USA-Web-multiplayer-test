// WebHID providers adapted from gareth10203, PR #2, commit 77149347ec286154867896137f5eee15371a259b.
// Integrated with explicit device pairing and gameplay suspension.
// G29 protocol parity: https://github.com/johannruiz/testg29 (index.html blob
// ef907195a3eb9ee35c1a031d77bb4ee9584d3032), based on nondebug/g29-wheel-demo.
// macOS G29 report support: gareth10203, PR #3, commit 48ca11d1e38fb2b40d92c210998dbd7224f1ab8d.
const clamp=(value,min,max)=>Math.max(min,Math.min(max,Number.isFinite(value)?value:0));

const T300_VENDOR_ID=0x1209;
const T300_PRODUCT_ID=0xb300;
const T300_REPORT_ID=1;
const T300_PROTOCOL_VERSION=2;
const PACKET_SIZE=48;
const COMMAND=Object.freeze({stop:0,constant:1,damper:9});
const T300_NATIVE_VENDOR_ID=0x044f,T300_NATIVE_PRODUCT_ID=0xb66e,T300_NATIVE_REPORT_ID=0x60,T300_NATIVE_PACKET_SIZE=63;
const LOGITECH_VENDOR_ID=0x046d,LOGITECH_G29_PRODUCT_IDS=new Set([0xc24f,0xc260]),LOGITECH_REPORT_ID=0,LOGITECH_COMMAND_SIZE=7;
const PID_PAGE=0x0f,GENERIC_DESKTOP_PAGE=0x01;
const PID=Object.freeze({
  EFFECT_BLOCK_INDEX:0x22,PARAMETER_BLOCK_OFFSET:0x23,CONSTANT:0x26,SPRING:0x40,DAMPER:0x41,
  DURATION:0x50,GAIN:0x52,TRIGGER_BUTTON:0x53,TRIGGER_REPEAT:0x54,AXES_ENABLE:0x55,
  DIRECTION_ENABLE:0x56,DIRECTION:0x57,CP_OFFSET:0x60,POSITIVE_COEFFICIENT:0x61,
  NEGATIVE_COEFFICIENT:0x62,POSITIVE_SATURATION:0x63,NEGATIVE_SATURATION:0x64,
  DEAD_BAND:0x65,OFFSET:0x6f,MAGNITUDE:0x70,PHASE:0x71,PERIOD:0x72,
  START:0x79,START_SOLO:0x7a,STOP:0x7b,LOOP_COUNT:0x7c,DEVICE_GAIN:0x7e,
  LOAD_SUCCESS:0x8c,LOAD_FULL:0x8d,LOAD_ERROR:0x8e,ENABLE_ACTUATORS:0x97,
  DISABLE_ACTUATORS:0x98,STOP_ALL:0x99,RESET:0x9a,PAUSE:0x9b,CONTINUE:0x9c,START_DELAY:0xa7
});
const PID_SELECTOR_VALUES=new Map([
  [0x26,1],[0x27,2],[0x30,3],[0x31,4],[0x32,5],[0x33,6],[0x34,7],[0x40,8],[0x41,9],[0x42,10],[0x43,11],
  [0x79,1],[0x7a,2],[0x7b,3],
  [0x8c,1],[0x8d,2],[0x8e,3],
  [0x97,1],[0x98,2],[0x99,3],[0x9a,4],[0x9b,5],[0x9c,6]
]);

function signedLevel(value){return Math.round(clamp(value,-1,1)*32767);}
function unsignedLevel(value){return Math.round(clamp(value,0,1)*32767);}

function usagePage(usage){return Number.isFinite(usage)&&usage>0xffff?(usage>>>16)&0xffff:null;}
function usageId(usage){return Number(usage)&0xffff;}
function itemUsages(item,page=PID_PAGE){return (item?.usages??[]).filter(usage=>usagePage(usage)===page).map(usageId);}
function flattenCollections(collections,result=[]){for(const collection of collections??[]){result.push(collection);flattenCollections(collection.children,result);}return result;}
function deviceReports(device,kind){return flattenCollections(device?.collections).flatMap(collection=>collection[kind]??[]);}
function reportSize(report){return Math.ceil((report?.items??[]).reduce((bits,item)=>bits+(Number(item.reportSize)||0)*(Number(item.reportCount)||0),0)/8);}
function logitechG29OutputReport(device){
  // Windows may expose the native report outside the joystick collection.
  return deviceReports(device,'outputReports').find(report=>report.reportId===LOGITECH_REPORT_ID&&reportSize(report)>=LOGITECH_COMMAND_SIZE)||null;
}
function fields(report){
  let offset=0;const result=[];
  for(const item of report?.items??[]){result.push({item,offset});offset+=(Number(item.reportSize)||0)*(Number(item.reportCount)||0);}
  return result;
}
function field(report,id,page=PID_PAGE){
  for(const entry of fields(report)){
    const usages=itemUsages(entry.item,page),index=usages.indexOf(id);
    if(index<0)continue;
    const count=Number(entry.item.reportCount)||0,size=Number(entry.item.reportSize)||0;
    return {...entry,offset:entry.offset+(count>1&&usages.length===count?index*size:0)};
  }
  return null;
}
function selector(report,id,page=PID_PAGE,mode='standard'){
  for(const entry of fields(report)){
    const usages=itemUsages(entry.item,page),index=usages.indexOf(id);if(index<0)continue;
    const minimum=Number(entry.item.logicalMinimum),maximum=Number(entry.item.logicalMaximum);
    const standard=mode==='standard'&&page===PID_PAGE?PID_SELECTOR_VALUES.get(id):undefined;
    const value=mode==='ascending'?index+1:standard ?? (Number.isFinite(minimum)&&Number.isFinite(maximum)&&minimum>maximum
      ? minimum-index
      : Math.max(1,Number.isFinite(minimum)?minimum:1)+index);
    return {...entry,value};
  }
  return null;
}
function has(report,id,page=PID_PAGE){return Boolean(field(report,id,page));}
function hasSelector(report,id,page=PID_PAGE){return Boolean(selector(report,id,page));}
function findReport(reports,predicate){return reports.find(predicate)||null;}
function variablePIDFields(report){return fields(report).filter(({item})=>!item.isConstant&&itemUsages(item).length);}

function pidLayout(device){
  const output=deviceReports(device,'outputReports'),feature=deviceReports(device,'featureReports');
  const setEffect=findReport(output,report=>has(report,PID.EFFECT_BLOCK_INDEX)&&has(report,PID.DURATION)&&has(report,PID.DIRECTION)&&hasSelector(report,PID.CONSTANT));
  const constant=findReport(output,report=>has(report,PID.EFFECT_BLOCK_INDEX)&&has(report,PID.MAGNITUDE)&&!has(report,PID.PERIOD));
  const condition=findReport(output,report=>has(report,PID.EFFECT_BLOCK_INDEX)&&has(report,PID.CP_OFFSET)&&has(report,PID.POSITIVE_COEFFICIENT));
  const operation=findReport(output,report=>has(report,PID.EFFECT_BLOCK_INDEX)&&has(report,PID.LOOP_COUNT)&&hasSelector(report,PID.START)&&hasSelector(report,PID.STOP));
  const control=findReport(output,report=>hasSelector(report,PID.ENABLE_ACTUATORS)&&hasSelector(report,PID.STOP_ALL)&&hasSelector(report,PID.RESET));
  const gain=findReport(output,report=>has(report,PID.DEVICE_GAIN));
  const blockFree=findReport(output,report=>has(report,PID.EFFECT_BLOCK_INDEX)&&variablePIDFields(report).length===1);
  const create=findReport(feature,report=>hasSelector(report,PID.CONSTANT));
  const blockLoad=findReport(feature,report=>has(report,PID.EFFECT_BLOCK_INDEX)&&hasSelector(report,PID.LOAD_SUCCESS)&&hasSelector(report,PID.LOAD_FULL)&&hasSelector(report,PID.LOAD_ERROR));
  if(!setEffect||!constant||!operation||!control||!create||!blockLoad)return null;
  return {setEffect,constant,condition,operation,control,gain,blockFree,create,blockLoad};
}

function writeBits(bytes,offset,size,value){
  if(!size)return;let bits=BigInt.asUintN(size,BigInt(Math.round(value)));
  for(let bit=0;bit<size;bit++){const at=offset+bit,mask=1<<(at&7);if(bits&(1n<<BigInt(bit)))bytes[at>>3]|=mask;else bytes[at>>3]&=~mask;}
}
function readBits(bytes,offset,size,signed=false){
  let value=0n;for(let bit=0;bit<size;bit++)if(bytes[(offset+bit)>>3]&(1<<((offset+bit)&7)))value|=1n<<BigInt(bit);
  return Number(signed?BigInt.asIntN(size,value):value);
}
function writeField(report,bytes,id,value,page=PID_PAGE){const target=field(report,id,page);if(target)writeBits(bytes,target.offset,Number(target.item.reportSize)||0,value);return target;}
function writeSelector(report,bytes,id,page=PID_PAGE,mode='standard'){const target=selector(report,id,page,mode);if(target)writeBits(bytes,target.offset,Number(target.item.reportSize)||0,target.value);return target;}
function readField(report,bytes,id,page=PID_PAGE){const target=field(report,id,page);return target?readBits(bytes,target.offset,Number(target.item.reportSize)||0,(target.item.logicalMinimum??0)<0):null;}
function readSelector(report,bytes,id,page=PID_PAGE){const target=selector(report,id,page);return target?readBits(bytes,target.offset,Number(target.item.reportSize)||0)===target.value:false;}
function reportData(report){return new Uint8Array(reportSize(report));}
function logicalMaximum(target,fallback=0){return Number.isFinite(target?.item?.logicalMaximum)?target.item.logicalMaximum:fallback;}
function logicalMinimum(target,fallback=0){return Number.isFinite(target?.item?.logicalMinimum)?target.item.logicalMinimum:fallback;}
function scaleUnsigned(value,target,max=1){return Math.round(logicalMinimum(target)+(logicalMaximum(target)-logicalMinimum(target))*clamp(value,0,max)/max);}
function scaleSigned(value,target){
  value=clamp(value,-1,1);const min=logicalMinimum(target,-32767),max=logicalMaximum(target,32767);
  return Math.round(value<0?-value*min:value*max);
}
function scaleTime(milliseconds,target){
  let value=milliseconds,exponent=Number.isFinite(target?.item?.unitExponent)?target.item.unitExponent:-3;
  for(;exponent< -3;exponent++)value*=10;for(;exponent> -3;exponent--)value/=10;
  return Math.round(clamp(value,logicalMinimum(target),logicalMaximum(target,65534)));
}
const delay=milliseconds=>new Promise(resolve=>setTimeout(resolve,milliseconds));

export class T300WebHIDV2Provider {
  static id='t300-webhid-v2';
  static label='T300 WebHID v2';
  static filters=[{vendorId:T300_VENDOR_ID,productId:T300_PRODUCT_ID,usagePage:0xff00,usage:1}];
  static supports(device){return device?.vendorId===T300_VENDOR_ID&&device?.productId===T300_PRODUCT_ID;}

  constructor(device,{random=globalThis.crypto}={}){
    this.device=device;
    const values=new Uint16Array(1);random?.getRandomValues?.(values);
    this.session=values[0]||1;this.sequence=0;
  }
  get label(){return this.device?.productName||this.constructor.label;}
  get opened(){return Boolean(this.device?.opened);}
  async open(){if(!this.device.opened)await this.device.open();}
  async close(){if(this.device.opened)await this.device.close?.();}
  packet(command,duration=0){
    const bytes=new Uint8Array(PACKET_SIZE),view=new DataView(bytes.buffer);
    bytes.set([0x54,0x33,0x57,0x46],0);bytes[4]=T300_PROTOCOL_VERSION;bytes[5]=command;
    view.setUint16(6,this.session,true);this.sequence=(this.sequence%65535)+1;view.setUint16(8,this.sequence,true);
    view.setUint16(10,Math.round(clamp(duration,0,1000)),true);
    return {bytes,view};
  }
  async transmit(bytes){
    for(let index=0;index<PACKET_SIZE-1;index++)bytes[47]^=bytes[index];
    await this.device.sendReport(T300_REPORT_ID,bytes);
  }
  async stop(){const {bytes}=this.packet(COMMAND.stop);await this.transmit(bytes);}
  async constant(force,{duration=120}={}){
    const {bytes,view}=this.packet(COMMAND.constant,duration);view.setInt16(16,signedLevel(force),true);await this.transmit(bytes);
  }
  async damper(strength,{duration=120}={}){
    const level=clamp(strength,0,1),{bytes,view}=this.packet(COMMAND.damper,duration);
    view.setInt16(16,signedLevel(-level),true);view.setInt16(18,signedLevel(-level),true);
    view.setUint16(24,unsignedLevel(level),true);view.setUint16(26,unsignedLevel(level),true);
    await this.transmit(bytes);
  }
}

// Native packet layout: https://github.com/Kimplul/hid-tmff2/blob/master/docs/FFBEFFECTS.md
export class T300NativeHIDProvider {
  static id='t300-native-hid';
  static label='Thrustmaster T300 native FFB';
  static filters=[{vendorId:T300_NATIVE_VENDOR_ID,productId:T300_NATIVE_PRODUCT_ID}];
  static supports(device){
    return device?.vendorId===T300_NATIVE_VENDOR_ID&&device?.productId===T300_NATIVE_PRODUCT_ID&&
      deviceReports(device,'outputReports').some(report=>report.reportId===T300_NATIVE_REPORT_ID&&reportSize(report)>=T300_NATIVE_PACKET_SIZE);
  }

  constructor(device){this.device=device;this.created=new Set();this.active=0;}
  get label(){return this.device?.productName||this.constructor.label;}
  get opened(){return Boolean(this.device?.opened);}
  packet(){return new Uint8Array(T300_NATIVE_PACKET_SIZE);}
  async send(bytes){await this.device.sendReport(T300_NATIVE_REPORT_ID,bytes);}
  async setup(...values){const packet=this.packet();packet.set(values);await this.send(packet);}
  async open(){
    if(!this.device.opened)await this.device.open();
    await this.setup(0x01,0x05);await this.setup(0x02,0xff);
    await this.setup(0x08,0x04,0x01,0);await this.setup(0x08,0x03,0,0);
  }
  async uploadConstant(level,duration){
    const packet=this.packet(),view=new DataView(packet.buffer);packet.set([0,1,0x6a]);
    view.setInt16(3,Math.round(-clamp(level,-1,1)*16384),true);packet[14]=0x4f;
    view.setUint16(15,Math.round(clamp(duration,1,65534)),true);view.setUint16(22,0xffff,true);await this.send(packet);this.created.add(1);
  }
  async updateConstant(level,duration){
    const packet=this.packet(),view=new DataView(packet.buffer);packet.set([0,1,0x6a]);
    view.setInt16(3,Math.round(-clamp(level,-1,1)*16384),true);packet[14]=0x45;
    view.setUint16(15,Math.round(clamp(duration,1,65534)),true);await this.send(packet);
  }
  async uploadDamper(level,duration){
    const packet=this.packet(),view=new DataView(packet.buffer),coefficient=Math.round(clamp(level,0,1)*32764);
    packet.set([0,2,0x64]);view.setInt16(3,coefficient,true);view.setInt16(5,coefficient,true);
    view.setUint16(11,32764,true);view.setUint16(13,32764,true);packet.set([0xfe,0xff,0xfe,0xff,0xfe,0xff,0xfe,0xff],15);
    view.setUint16(23,32764,true);view.setUint16(25,32764,true);packet[27]=0x07;packet[28]=0x4f;
    view.setUint16(29,Math.round(clamp(duration,1,65534)),true);view.setUint16(36,0xffff,true);await this.send(packet);this.created.add(2);
  }
  async updateDamper(level,duration){
    const packet=this.packet(),view=new DataView(packet.buffer),coefficient=Math.round(clamp(level,0,1)*32764);
    packet.set([0,2,0x4c]);view.setInt16(3,coefficient,true);view.setInt16(5,coefficient,true);
    view.setUint16(11,32764,true);view.setUint16(13,32764,true);packet[15]=0x07;packet[16]=0x45;
    view.setUint16(17,Math.round(clamp(duration,1,65534)),true);await this.send(packet);
  }
  async play(id){
    const packet=this.packet(),view=new DataView(packet.buffer);packet.set([0,id,0x89,0x41]);view.setUint16(4,1,true);await this.send(packet);this.active=id;
  }
  async stopEffect(id){
    if(!this.device.opened||!id)return;const packet=this.packet();packet.set([0,id,0x89]);await this.send(packet);if(this.active===id)this.active=0;
  }
  async switchTo(id){
    if(this.active&&this.active!==id)await this.stopEffect(this.active);
  }
  async constant(force,{duration=120}={}){
    await this.switchTo(1);if(this.created.has(1))await this.updateConstant(force,duration);else await this.uploadConstant(force,duration);
    await this.play(1);
  }
  async damper(strength,{duration=120}={}){
    const level=clamp(strength,0,1);if(level<.002){await this.stop();return;}
    await this.switchTo(2);if(this.created.has(2))await this.updateDamper(level,duration);else await this.uploadDamper(level,duration);
    await this.play(2);
  }
  async stop(){if(this.active)await this.stopEffect(this.active);}
  async close(){
    if(!this.device.opened)return;
    try{await this.stop();}finally{this.created.clear();this.active=0;await this.device.close?.();}
  }
}

// Logitech's native seven-byte wheel protocol is documented by the Linux
// hid-lg4ff driver and exercised directly through WebHID here:
// https://github.com/berarma/new-lg4ff/blob/master/hid-lg4ff.c
// https://github.com/nondebug/g29-wheel-demo
export class LogitechG29HIDProvider {
  static id='logitech-g29-native-hid';
  static label='Logitech G29 native FFB';
  static filters=[...LOGITECH_G29_PRODUCT_IDS].map(productId=>({vendorId:LOGITECH_VENDOR_ID,productId}));
  static supports(device){
    if(device?.vendorId!==LOGITECH_VENDOR_ID||!LOGITECH_G29_PRODUCT_IDS.has(device?.productId))return false;
    if(device?.productName==='T300 Native FFB Compatibility Bridge')return false;
    const report=logitechG29OutputReport(device),size=reportSize(report);
    // 046d:c24f is also used by a T300 compatibility bridge. Native Logitech
    // descriptors use seven bytes; accept a padded descriptor only when the
    // browser identifies it as a G29, as Chrome on macOS does (16 bytes).
    return report?(size===LOGITECH_COMMAND_SIZE||device.productId!==0xc24f||/\bG29\b/i.test(String(device.productName||''))):deviceReports(device,'outputReports').length===0&&/\bG29\b/i.test(String(device.productName||''));
  }

  constructor(device,{schedule=globalThis.setTimeout,cancel=globalThis.clearTimeout}={}){
    // Window timers must not receive this provider as their WebIDL receiver.
    this.device=device;this.schedule=(...args)=>schedule?.(...args);this.cancel=(...args)=>cancel?.(...args);this.expiry=null;this.active=null;this.oscillator=null;this.generation=0;this.queue=Promise.resolve();
    this.outputReport=logitechG29OutputReport(device);this.packetSize=reportSize(this.outputReport)||LOGITECH_COMMAND_SIZE;
  }
  get label(){return this.device?.productName||this.constructor.label;}
  get opened(){return Boolean(this.device?.opened);}
  packet(...values){const packet=new Uint8Array(this.packetSize);packet.set(values.slice(0,LOGITECH_COMMAND_SIZE));return packet;}
  async send(...values){
    const bytes=this.packet(...values),device=this.device;
    const next=this.queue.catch(()=>{}).then(()=>{if(!device.opened)throw new Error('G29 disconnected.');return device.sendReport(LOGITECH_REPORT_ID,bytes);});
    this.queue=next;await next;
  }
  cancelOscillator(){this.generation++;if(this.oscillator!==null)this.cancel?.(this.oscillator);this.oscillator=null;}
  async clearEffects(){
    // Same slot reset as johannruiz/testg29; also disables firmware centring.
    for(let slot=0;slot<4;slot++)await this.send((0x10<<slot)|3,0x10);
    await this.send(0xf5);
  }
  async setRange(degrees){const n=Math.round(clamp(degrees,90,900));await this.send(0xf8,0x81,n&255,n>>8);}
  async setLeds(mask){await this.send(0xf8,0x12,Math.round(clamp(mask,0,31)));}

  clearExpiry(){if(this.expiry!==null)this.cancel?.(this.expiry);this.expiry=null;}
  arm(duration){
    this.clearExpiry();
    this.expiry=this.schedule?.(()=>{this.expiry=null;if(this.device.opened)void this.stop().catch(()=>{});},Math.round(clamp(duration,40,1000)))??null;
  }
  async open(){
    if(!this.device.opened)await this.device.open();
    await this.stop();
  }
  async constant(force,{duration=120}={}){
    this.cancelOscillator();
    const level=clamp(force,-1,1);if(Math.abs(level)<.002){await this.stop();return;}
    if(this.active&&this.active!=='constant')await this.stop();
    // 0x08 is the G29 constant-force command; 0x00 is full left and 0xff full right.
    const token=this.generation;await this.send(0x11,0x08,Math.round((level+1)*127.5));if(token===this.generation){this.active='constant';this.arm(duration);}
  }
  async damper(strength,{duration=120}={}){
    this.cancelOscillator();
    const level=clamp(strength,0,1);if(level<.002){await this.stop();return;}
    if(this.active&&this.active!=='damper')await this.stop();
    const update=this.active==='damper',clip=Math.round(level*255);
    // Slot two keeps resistance separate from constant force. Positive symmetric
    // coefficients oppose motion in either direction; clip controls its strength.
    const token=this.generation;await this.send(update?0x2c:0x21,0x0c,0x0f,0,0x0f,0,clip);if(token===this.generation){this.active='damper';this.arm(duration);}
  }
  async center(strength,{duration=120}={}){
    const token=this.generation+1;await this.stop();const level=clamp(strength,0,1);if(level<.002||token!==this.generation)return;
    const value=level*0xffff;
    let a=value<=0xaaaa?0x0c*value:0x0c*0xaaaa+0x06*(value-0xaaaa);
    let b=value<=0xaaaa?0x80*value:0x80*0xaaaa+0xff*(value-0xaaaa);
    a=Math.round(clamp(a/0xaaaa,0,255));b=Math.round(clamp(b/0xaaaa,0,255));
    await this.send(0xfe,0x0d,a,a,b);if(token!==this.generation)return;await this.send(0x14);if(token===this.generation){this.active='center';this.arm(duration);}
  }
  async rumble(strength,{duration=120}={}){
    const token=this.generation+1;await this.stop();const level=clamp(strength,0,1);if(level<.002||token!==this.generation)return;
    this.active='rumble';let direction=-1;
    const tick=async()=>{
      if(token!==this.generation||!this.device.opened)return;
      await this.send(0x11,0x08,Math.round((direction*level+1)*127.5));direction=-direction;
      if(token===this.generation)this.oscillator=this.schedule?.(()=>{this.oscillator=null;void tick().catch(()=>this.stop().catch(()=>{}));},20)??null;
    };
    await tick();if(token===this.generation&&this.device.opened)this.arm(duration);
  }
  async stop(){
    this.cancelOscillator();this.clearExpiry();this.active=null;
    if(this.device.opened)await this.clearEffects();
  }
  async close(){
    this.cancelOscillator();this.clearExpiry();
    if(!this.device.opened)return;
    try{await this.stop();await this.setLeds(0);}finally{await this.device.close?.();}
  }

}

export class StandardHIDPIDProvider {
  static id='standard-hid-pid';
  static label='Standard HID PID';
  static filters=[{usagePage:0x01,usage:0x04},{usagePage:0x01,usage:0x08}];
  static supports(device){return Boolean(pidLayout(device));}

  constructor(device,{wait=delay}={}){
    this.device=device;this.layout=pidLayout(device);
    if(!this.layout)throw new Error('The HID PID descriptor is missing required constant-force reports.');
    this.effects=new Map();this.active=null;this.wait=wait;this.controlMode='standard';this.operationMode='standard';this.actuatorsEnabled=false;
  }
  get label(){return this.device?.productName||this.constructor.label;}
  get opened(){return Boolean(this.device?.opened);}
  async send(report,bytes){await this.device.sendReport(report.reportId,bytes);}
  async sendFeature(report,bytes){await this.device.sendFeatureReport(report.reportId,bytes);}
  async receiveFeature(report){
    const view=await this.device.receiveFeatureReport(report.reportId);
    const bytes=new Uint8Array(view.buffer,view.byteOffset,view.byteLength),size=reportSize(report);
    return bytes.length===size+1&&bytes[0]===report.reportId?bytes.subarray(1):bytes;
  }
  async command(usage,mode=this.controlMode){const bytes=reportData(this.layout.control);writeSelector(this.layout.control,bytes,usage,PID_PAGE,mode);await this.send(this.layout.control,bytes);}
  async initialiseControls(mode){
    await this.command(PID.RESET,mode);await this.wait(50);await this.command(PID.RESET,mode);await this.wait(100);
    await this.command(PID.STOP_ALL,mode);await this.wait(30);await this.command(PID.ENABLE_ACTUATORS,mode);await this.wait(50);this.actuatorsEnabled=true;
  }
  async open(){
    if(!this.device.opened)await this.device.open();
    await this.initialiseControls(this.controlMode);
    if(this.layout.gain){const bytes=reportData(this.layout.gain),target=field(this.layout.gain,PID.DEVICE_GAIN);writeField(this.layout.gain,bytes,PID.DEVICE_GAIN,logicalMaximum(target,255));await this.send(this.layout.gain,bytes);}
  }
  async allocationAttempt(type,mode='standard'){
    const create=reportData(this.layout.create);writeSelector(this.layout.create,create,type,PID_PAGE,mode);await this.sendFeature(this.layout.create,create);
    await this.wait(12);let terminal=null,lastBlock=0;
    for(let attempt=0;attempt<60;attempt++){
      const result=await this.receiveFeature(this.layout.blockLoad);
      if(readSelector(this.layout.blockLoad,result,PID.LOAD_SUCCESS)){
        const block=readField(this.layout.blockLoad,result,PID.EFFECT_BLOCK_INDEX);if(block>0)return {block,terminal:null};
      }
      lastBlock=readField(this.layout.blockLoad,result,PID.EFFECT_BLOCK_INDEX)??0;
      if(readSelector(this.layout.blockLoad,result,PID.LOAD_FULL))terminal='full';
      else if(readSelector(this.layout.blockLoad,result,PID.LOAD_ERROR))terminal='error';
      await this.wait(8);
    }
    return {block:0,terminal,lastBlock};
  }
  async allocate(type){
    let result=await this.allocationAttempt(type);
    if(result.terminal==='full'&&this.controlMode==='standard'){
      await this.command(PID.STOP_ALL);await this.wait(30);await this.command(PID.DISABLE_ACTUATORS);await this.wait(30);
      await this.command(PID.RESET);this.actuatorsEnabled=false;await this.wait(150);result=await this.allocationAttempt(type);
      if(result.block){
        this.operationMode='descriptor';await this.command(PID.ENABLE_ACTUATORS);await this.wait(50);this.actuatorsEnabled=true;
      }
    }
    if(result.block)return result.block;
    if(result.terminal==='full')throw new Error(`The wheel reported no free force-feedback effect slots after standard and descriptor-order resets (block ${result.lastBlock}).`);
    if(result.terminal==='error')throw new Error(`The wheel rejected the force-feedback effect after waiting for allocation (block ${result.lastBlock}).`);
    throw new Error('The wheel did not allocate a force-feedback effect.');
  }
  async effect(kind,type,duration){
    let block=this.effects.get(kind);
    if(!block){block=await this.allocate(type);this.effects.set(kind,block);}
    const report=this.layout.setEffect,bytes=reportData(report);
    writeField(report,bytes,PID.EFFECT_BLOCK_INDEX,block);writeSelector(report,bytes,type);
    const durationField=field(report,PID.DURATION);writeField(report,bytes,PID.DURATION,scaleTime(duration,durationField));
    writeField(report,bytes,PID.GAIN,logicalMaximum(field(report,PID.GAIN),0));
    writeField(report,bytes,PID.TRIGGER_BUTTON,0);writeField(report,bytes,PID.TRIGGER_REPEAT,0);
    writeField(report,bytes,PID.START_DELAY,0);writeField(report,bytes,PID.DIRECTION_ENABLE,1);
    writeField(report,bytes,PID.DIRECTION,scaleUnsigned(0x4000,field(report,PID.DIRECTION),0xffff));
    writeField(report,bytes,0x30,1,GENERIC_DESKTOP_PAGE);writeField(report,bytes,0x31,0,GENERIC_DESKTOP_PAGE);
    await this.send(report,bytes);return block;
  }
  async operate(block,usage){
    const report=this.layout.operation,bytes=reportData(report);writeField(report,bytes,PID.EFFECT_BLOCK_INDEX,block);writeSelector(report,bytes,usage,PID_PAGE,this.operationMode);
    writeField(report,bytes,PID.LOOP_COUNT,1);await this.send(report,bytes);
  }
  async switchTo(kind){
    if(this.active&&this.active!==kind){const block=this.effects.get(this.active);if(block)await this.operate(block,PID.STOP);}
    this.active=kind;
  }
  async ensureActuators(){
    if(this.actuatorsEnabled)return;
    await this.command(PID.ENABLE_ACTUATORS);await this.wait(30);this.actuatorsEnabled=true;
  }
  async constant(force,{duration=120}={}){
    await this.ensureActuators();await this.switchTo('constant');const block=await this.effect('constant',PID.CONSTANT,duration);
    const report=this.layout.constant,bytes=reportData(report),target=field(report,PID.MAGNITUDE);
    writeField(report,bytes,PID.EFFECT_BLOCK_INDEX,block);writeField(report,bytes,PID.MAGNITUDE,scaleSigned(force,target));
    await this.send(report,bytes);await this.operate(block,PID.START);
  }
  async damper(strength,{duration=120}={}){
    if(!this.layout.condition||!hasSelector(this.layout.setEffect,PID.DAMPER)){await this.stop();return;}
    await this.ensureActuators();await this.switchTo('damper');const block=await this.effect('damper',PID.DAMPER,duration),level=clamp(strength,0,1);
    const report=this.layout.condition;
    for(const offset of has(report,PID.PARAMETER_BLOCK_OFFSET)?[0,1]:[0]){
      const bytes=reportData(report);writeField(report,bytes,PID.EFFECT_BLOCK_INDEX,block);writeField(report,bytes,PID.PARAMETER_BLOCK_OFFSET,offset);
      writeField(report,bytes,PID.CP_OFFSET,0);
      writeField(report,bytes,PID.POSITIVE_COEFFICIENT,scaleSigned(-level,field(report,PID.POSITIVE_COEFFICIENT)));
      writeField(report,bytes,PID.NEGATIVE_COEFFICIENT,scaleSigned(-level,field(report,PID.NEGATIVE_COEFFICIENT)));
      writeField(report,bytes,PID.POSITIVE_SATURATION,scaleUnsigned(level,field(report,PID.POSITIVE_SATURATION)));
      writeField(report,bytes,PID.NEGATIVE_SATURATION,scaleUnsigned(level,field(report,PID.NEGATIVE_SATURATION)));
      writeField(report,bytes,PID.DEAD_BAND,0);await this.send(report,bytes);
    }
    await this.operate(block,PID.START);
  }
  async stop(){
    if(this.operationMode!=='standard'){await this.release();return;}
    const effects=[...this.effects.values()];this.active=null;
    for(const block of effects)await this.operate(block,PID.STOP);
  }
  async release(){
    this.active=null;
    await this.command(PID.STOP_ALL);await this.wait(20);await this.command(PID.DISABLE_ACTUATORS);this.actuatorsEnabled=false;
  }
  async close(){
    if(this.device.opened){
      try{await this.stop();if(this.operationMode==='standard'){
        if(this.layout.blockFree)for(const block of this.effects.values()){const bytes=reportData(this.layout.blockFree);writeField(this.layout.blockFree,bytes,PID.EFFECT_BLOCK_INDEX,block);await this.send(this.layout.blockFree,bytes);}
        await this.release();
      }}
      finally{this.effects.clear();this.active=null;this.actuatorsEnabled=false;await this.device.close?.();}
    }
  }
}

export const DEFAULT_WHEEL_FFB_PROVIDERS=Object.freeze([T300WebHIDV2Provider,T300NativeHIDProvider,LogitechG29HIDProvider,StandardHIDPIDProvider]);

export function providerForDevice(device,providers=DEFAULT_WHEEL_FFB_PROVIDERS){
  return providers.find(provider=>provider.supports(device))||null;
}

export function gamepadHardware(id){
  const value=String(id||'');
  const match=value.match(/Vendor:\s*([0-9a-f]{4}).*Product:\s*([0-9a-f]{4})/i)||value.match(/^([0-9a-f]{4})[-:]([0-9a-f]{4})[-:]/i);
  return match?{vendorId:parseInt(match[1],16),productId:parseInt(match[2],16)}:null;
}
export const hidIdentity=device=>({vendorId:device.vendorId,productId:device.productId,productName:String(device.productName||'').slice(0,256)});
export function pairedDevice(devices,identity,providers=DEFAULT_WHEEL_FFB_PROVIDERS){
  if(!identity||!Number.isInteger(identity.vendorId)||!Number.isInteger(identity.productId)||typeof identity.productName!=='string')return null;
  const matches=devices.filter(d=>d.vendorId===identity.vendorId&&d.productId===identity.productId&&String(d.productName||'')===identity.productName&&providerForDevice(d,providers));
  return matches.length===1?matches[0]:null; // Identical devices require an explicit picker each time.
}
export function acceptsWheel(inputId,device){const ids=gamepadHardware(inputId);return !ids||ids.vendorId===device.vendorId&&ids.productId===device.productId;}

// Pure policy used by the host loop and regression tests. Menus and spectator
// playback never own a physical wheel, even if a multiplayer race keeps running.
export function wheelMayDrive({running,started,menuOpen,focused,hidden,wheelActive,spectating=false}){
  return !!(running&&started&&!menuOpen&&focused&&!hidden&&wheelActive&&!spectating);
}

export class WheelForceFeedback {
  constructor({hid=globalThis.navigator?.hid,providers=DEFAULT_WHEEL_FFB_PROVIDERS,onStatus=()=>{},wait=delay}={}){
    this.hid=hid;this.providers=providers;this.onStatus=onStatus;this.provider=null;
    this.enabled=false;this.strength=.2;this.reverse=false;this.sourceAvailable=true;
    this.pending=null;this.inFlight=false;this.effectActive=false;this.testing=false;this.testGeneration=0;this.connectionGeneration=0;this.wait=wait;this.lastSent=-Infinity;this.lastKind='stop';this.lastLevel=0;
    this.handleDisconnect=event=>{if(event?.device===this.provider?.device){this.connectionGeneration++;this.testGeneration++;this.testing=false;this.provider=null;this.pending=null;this.effectActive=false;this.onStatus('Disconnected');}};
    this.hid?.addEventListener?.('disconnect',this.handleDisconnect);
  }
  get connected(){return Boolean(this.provider?.opened);}
  get label(){return this.provider?.label||'';}
  setEnabled(value){const changed=this.enabled!==Boolean(value);this.enabled=Boolean(value);if(changed&&!this.enabled)this.stop({force:true});}
  setStrength(value){const before=this.strength;this.strength=clamp(value,0,1);if(before!==this.strength&&this.strength===0)this.stop({force:true});}
  setReverse(value){this.reverse=Boolean(value);}
  setSourceAvailable(value){
    const available=Boolean(value),changed=available!==this.sourceAvailable;this.sourceAvailable=available;
    if(changed&&!available)this.stop({force:true});
  }

  async useDevice(device){
    const Provider=providerForDevice(device,this.providers);
    if(!Provider)throw new Error('This HID device does not have a compatible force-feedback provider.');
    await this.disconnect();const generation=this.connectionGeneration,provider=new Provider(device);this.provider=provider;
    try{await provider.open();if(generation!==this.connectionGeneration||this.provider!==provider){await provider.close();return null;}}
    catch(error){if(this.provider===provider)this.provider=null;try{await provider.close();}catch{}throw error;}
    this.lastSent=-Infinity;this.lastKind='stop';this.lastLevel=0;
    this.onStatus('Connected');
    return this.provider;
  }
  async restore(identity,inputId){
    if(!this.hid)return null;
    const generation=this.connectionGeneration,device=pairedDevice(await this.hid.getDevices(),identity,this.providers);
    if(generation!==this.connectionGeneration)return null;
    if(device&&!acceptsWheel(inputId,device))return null;
    return device?this.useDevice(device):null;
  }
  async request(inputId){
    if(!this.hid)throw new Error('WebHID is unavailable. Use current Chrome or Edge.');
    const generation=this.connectionGeneration,known=gamepadHardware(inputId),available=this.providers.flatMap(provider=>provider.filters||[]);
    const filters=known?available.flatMap(filter=>{
      if(Number.isInteger(filter.vendorId)&&filter.vendorId!==known.vendorId)return [];
      if(Number.isInteger(filter.productId)&&filter.productId!==known.productId)return [];
      return [{...filter,...known}];
    }):available;
    const devices=await this.hid.requestDevice({filters});
    if(generation!==this.connectionGeneration)return null;
    if(devices?.[0]&&!acceptsWheel(inputId,devices[0]))throw new Error('Choose the same physical wheel as the selected steering input.');
    const compatible=devices?.filter(d=>acceptsWheel(inputId,d)&&providerForDevice(d,this.providers))||[];
    const device=compatible.find(d=>logitechG29OutputReport(d))||compatible[0]||devices?.[0];
    return device?this.useDevice(device):null;
  }
  update({force=0,resistance=0}={},now=performance.now()){
    if(this.testing)return true;
    if(!this.enabled||!this.connected||!this.sourceAvailable||this.strength<=0){this.stop();return false;}
    const signed=clamp(force*(this.reverse?-1:1)*this.strength,-1,1);
    const damping=clamp(resistance*this.strength,0,1);
    const kind=Math.abs(signed)>=.002?'constant':damping>=.002?'damper':'stop';
    const level=kind==='constant'?signed:kind==='damper'?damping:0;
    const changed=kind!==this.lastKind||Math.abs(level-this.lastLevel)>=.01;
    if(!changed&&now-this.lastSent<60)return true;
    this.lastSent=now;this.lastKind=kind;this.lastLevel=level;
    if(kind==='stop')this.stop();else{this.effectActive=true;this.schedule({kind,level});}
    return true;
  }
  schedule(action){this.pending=action;if(!this.inFlight)void this.pump();}
  async pump(){
    this.inFlight=true;
    while(this.pending&&this.provider){
      const action=this.pending;this.pending=null;
      try{
        if(action.kind==='stop')await this.provider.stop();
        else if(action.kind==='constant')await this.provider.constant(action.level,{duration:action.duration??120});
        else if(action.kind==='damper')await this.provider.damper(action.level,{duration:action.duration??120});
        else if(['rumble','center'].includes(action.kind)&&typeof this.provider[action.kind]==='function')await this.provider[action.kind](action.level,{duration:action.duration??120});
        else throw new Error('This wheel does not support this test.');
      }catch(error){
        const failed=this.provider;this.provider=null;this.pending=null;this.effectActive=false;
        try{await failed?.close();}catch{}
        this.onStatus('Disconnected');console.warn('Wheel force feedback stopped.',error);break;
      }
    }
    this.inFlight=false;if(this.pending&&this.provider)void this.pump();
  }
  stop({force=false}={}){
    if(this.testing&&!force)return;
    if(force){this.testGeneration++;this.testing=false;}
    if(!this.provider)return;
    if(!force&&!this.effectActive&&this.lastKind==='stop'&&this.pending?.kind!=='constant'&&this.pending?.kind!=='damper')return;
    this.effectActive=false;this.lastKind='stop';this.lastLevel=0;this.pending={kind:'stop'};if(!this.inFlight)void this.pump();
  }
  async flush(){while(this.inFlight||this.pending)await new Promise(resolve=>setTimeout(resolve,0));}
  testLeft(options={}){return this.testEffect('left',options);}
  async testEffect(effect='left',{duration=280,maxStrength=.6}={}){
    if(!this.connected)throw new Error('Connect force feedback before testing it.');
    if(!['left','right','rumble','damper','center'].includes(effect))throw new Error('Unknown force test.');
    if(['rumble','center'].includes(effect)&&typeof this.provider[effect]!=='function')throw new Error('This wheel does not support this test.');
    duration=Math.round(clamp(duration,40,1000));
    const kind=['left','right'].includes(effect)?'constant':effect;
    const level=Math.min(this.strength,clamp(maxStrength,0,1))*(kind==='constant'?(effect==='left'?-1:1)*(this.reverse?-1:1):1);
    if(Math.abs(level)<.002)return false;
    const token=++this.testGeneration,provider=this.provider;this.testing=true;this.pending={kind:'stop'};if(!this.inFlight)void this.pump();await this.flush();
    let failed=null,completed=false;
    try{
      if(token!==this.testGeneration||provider!==this.provider)return false;
      this.effectActive=true;this.schedule({kind,level,duration});await this.flush();
      if(token!==this.testGeneration||provider!==this.provider)return false;
      await this.wait(duration);
      completed=token===this.testGeneration&&provider===this.provider;
    }catch(error){failed=error;}
    finally{
      if(provider===this.provider){this.stop({force:true});await this.flush();}
      this.lastSent=-Infinity;
    }
    if(failed){if(this.provider===provider)this.provider=null;try{await provider?.close();}catch{}this.onStatus('Disconnected');throw failed;}
    return completed;
  }
  async disconnect(){
    this.connectionGeneration++;
    const provider=this.provider;if(!provider)return;
    this.stop({force:true});await this.flush();if(this.provider===provider)this.provider=null;await provider.close();this.onStatus('Disconnected');
  }
  destroy(){void this.disconnect().catch(()=>{});this.hid?.removeEventListener?.('disconnect',this.handleDisconnect);}
}

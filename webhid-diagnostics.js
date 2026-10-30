// Device report adapted from gareth10203, PR #2.
import {providerForDevice} from './wheel-force-feedback.js?v=53.8.47';

const hex=value=>`0x${Number(value ?? 0).toString(16).padStart(4,'0')}`;

const USAGE_PAGES=new Map([
  [0x01,'Generic Desktop'],[0x02,'Simulation Controls'],[0x08,'LED'],
  [0x09,'Button'],[0x0f,'Physical Interface (force feedback)']
]);

function usagePageFromUsage(usage){
  return Number.isFinite(usage) && usage>0xffff ? (usage>>>16)&0xffff : null;
}

function reportBytes(report){
  const bits=(report?.items ?? []).reduce((total,item)=>total+(Number(item.reportSize)||0)*(Number(item.reportCount)||0),0);
  return Math.ceil(bits/8);
}

function flattenCollections(collections,depth=0,result=[]){
  for(const collection of collections ?? []){
    result.push({collection,depth});
    flattenCollections(collection.children,depth+1,result);
  }
  return result;
}

function pagesInItem(item){
  const pages=new Set();
  for(const usage of item?.usages ?? []){
    const page=usagePageFromUsage(usage);if(page!==null)pages.add(page);
  }
  for(const usage of [item?.usageMinimum,item?.usageMaximum]){
    const page=usagePageFromUsage(usage);if(page!==null)pages.add(page);
  }
  return pages;
}

function reportLine(kind,report){
  const pages=new Set();
  for(const item of report?.items ?? [])for(const page of pagesInItem(item))pages.add(page);
  const suffix=pages.size?` · usage pages ${[...pages].map(page=>`${hex(page)} ${USAGE_PAGES.get(page)??''}`.trim()).join(', ')}`:'';
  const bytes=reportBytes(report);
  return `${kind} report ${hex(report?.reportId)} · ${bytes} byte${bytes===1?'':'s'}${suffix}`;
}

function usageText(usage){
  if(!Number.isFinite(usage))return 'unknown';
  const page=usagePageFromUsage(usage),id=usage&0xffff;
  return page===null?hex(usage):`${hex(page)}:${hex(id)}${USAGE_PAGES.has(page)?` ${USAGE_PAGES.get(page)}`:''}`;
}

function itemLine(item){
  const usages=(item?.usages ?? []).map(usageText);
  if(Number.isFinite(item?.usageMinimum)||Number.isFinite(item?.usageMaximum))
    usages.push(`${usageText(item?.usageMinimum)}–${usageText(item?.usageMaximum)}`);
  const flags=[];
  if(item?.isConstant)flags.push('constant');
  if(item?.isArray)flags.push('array');
  if(item?.isAbsolute)flags.push('absolute');
  if(item?.isBufferedBytes)flags.push('buffered');
  if(item?.isRange)flags.push('range');
  if(item?.hasNull)flags.push('null');
  const logical=Number.isFinite(item?.logicalMinimum)&&Number.isFinite(item?.logicalMaximum)
    ?` · logical ${item.logicalMinimum}…${item.logicalMaximum}`:'';
  return `Field · ${Number(item?.reportSize)||0} bit × ${Number(item?.reportCount)||0}${usages.length?` · usage ${usages.join(', ')}`:''}${logical}${flags.length?` · ${flags.join(', ')}`:''}`;
}

export function inspectHIDDevice(device){
  const collections=flattenCollections(device?.collections),outputReports=[];
  let hasPID=false;
  for(const {collection} of collections){
    if(collection.usagePage===0x0f)hasPID=true;
    for(const kind of ['inputReports','outputReports','featureReports']){
      for(const report of collection[kind] ?? []){
        if(kind==='outputReports')outputReports.push(report);
        for(const item of report.items ?? [])if(pagesInItem(item).has(0x0f))hasPID=true;
      }
    }
  }
  return {collections,outputReports,hasPID};
}

export function describeHIDDevice(device){
  const {collections,outputReports,hasPID}=inspectHIDDevice(device);
  const forceProvider=providerForDevice(device);
  const t300CompatibilityBridge=device?.productName==='T300 Native FFB Compatibility Bridge' && device?.vendorId===0x046d && device?.productId===0xc24f;
  const lines=[
    `${device?.productName || 'Unnamed HID device'}`,
    `Vendor ${hex(device?.vendorId)} · Product ${hex(device?.productId)}`,
    `Collections ${collections.length} · Output reports ${outputReports.length} · HID PID ${hasPID?'advertised':'not advertised'}`
  ];
  for(const {collection,depth} of collections){
    const pageName=USAGE_PAGES.get(collection.usagePage);
    lines.push(`${'  '.repeat(depth)}Collection · page ${hex(collection.usagePage)}${pageName?` ${pageName}`:''} · usage ${hex(collection.usage)}`);
    for(const [kind,label] of [['inputReports','Input'],['outputReports','Output'],['featureReports','Feature']])
      for(const report of collection[kind] ?? []){
        lines.push(`${'  '.repeat(depth+1)}${reportLine(label,report)}`);
        if((report.items ?? []).some(item=>pagesInItem(item).has(0x0f)))
          for(const item of report.items ?? [])lines.push(`${'  '.repeat(depth+2)}${itemLine(item)}`);
      }
  }
  lines.push(forceProvider
    ? `Result: compatible with Daytona's ${forceProvider.label} force-feedback provider.`
    : t300CompatibilityBridge
    ? 'Result: T300 compatibility bridge found. Its current WebHID report is an inert compatibility sink; the bridge needs a safe browser-to-motor protocol before the site can send force.'
    : outputReports.length
      ? hasPID?'Result: promising — standard HID force-feedback data and output reports are visible.':'Result: output reports are visible, but they appear to use a device-specific protocol.'
      :'Result: no HID output reports are exposed to this browser.');
  return lines.join('\n');
}

export function createHIDReport(devices,{date=new Date(),userAgent=globalThis.navigator?.userAgent||'Unavailable',secure=globalThis.isSecureContext}={}){
  return [
    ['Daytona USA WebHID force-feedback report',`Generated: ${date.toISOString()}`,`Browser: ${userAgent}`,`Secure context: ${secure?'yes':'no'}`].join('\n'),
    ...(devices.length?devices.map(describeHIDDevice):['No HID devices inspected.'])
  ].join('\n\n');
}

function downloadText(filename,text){
  const href=URL.createObjectURL(new Blob([text],{type:'text/plain;charset=utf-8'}));
  const link=document.createElement('a');link.href=href;link.download=filename;link.click();
  setTimeout(()=>URL.revokeObjectURL(href),0);
}

export function mountWebHIDDiagnostics(root,{hid=globalThis.navigator?.hid,secure=globalThis.isSecureContext,save=downloadText,onDevices=()=>{}}={}){
  const button=root.querySelector('#webhidInspect')||document.getElementById('webhidInspect');
  const status=root.querySelector('#webhidStatus'),report=root.querySelector('#webhidReport');
  let inspected=[];
  const clear=()=>{inspected=[];onDevices([]);if(report)report.textContent='';status.textContent='HID report checks FFB support without moving the wheel.';};
  const show=(devices,lead='')=>{
    inspected=[...devices];onDevices(inspected);
    if(report)report.textContent=devices.length?devices.map(describeHIDDevice).join('\n\n'):'';
    status.textContent=lead || (devices.length?'HID wheel permission ready.':'HID report checks FFB support without moving the wheel.');
  };
  const downloadReport=()=>{
    if(!inspected.length)return false;
    const stamp=new Date().toISOString().replace(/[:.]/g,'-');
    save(`daytona-webhid-report-${stamp}.txt`,createHIDReport(inspected,{secure}));
    status.textContent='HID report downloaded.';return true;
  };
  if(!secure){button.disabled=true;status.textContent='WebHID requires HTTPS or localhost.';if(report)report.textContent='';onDevices([]);return {refresh:async()=>{},clear};}
  if(!hid){button.disabled=true;status.textContent='WebHID is unavailable in this browser. Try current Chrome or Edge.';if(report)report.textContent='';onDevices([]);return {refresh:async()=>{},clear};}
  async function refresh(){
    try{show(await hid.getDevices());}
    catch(error){status.textContent=`Could not inspect HID devices: ${error?.message || error}`;}
  }
  button.addEventListener('click',async()=>{
    button.disabled=true;inspected=[];onDevices([]);if(report)report.textContent='';status.textContent='Choose the physical steering wheel.';
    try{
      const selected=await hid.requestDevice({filters:[]});
      const devices=[...(selected ?? [])];
      show(devices,devices.length?'HID report ready.':'No device selected.');
      if(devices.length)downloadReport();
    }catch(error){
      status.textContent=error?.name==='NotFoundError'?'No device selected. Nothing changed.':`HID inspection failed: ${error?.message || error}`;
    }finally{button.disabled=false;}
  });
  hid.addEventListener?.('connect',refresh);hid.addEventListener?.('disconnect',refresh);
  void refresh();
  return {refresh,download:downloadReport,clear};
}


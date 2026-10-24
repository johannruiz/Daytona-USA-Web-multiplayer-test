import test from 'node:test';
import assert from 'node:assert/strict';
import {createHIDReport,describeHIDDevice,inspectHIDDevice,mountWebHIDDiagnostics} from '../webhid-diagnostics.js';

const report=(reportId,usagePage,count=4)=>({reportId,items:[{reportSize:8,reportCount:count,usages:[(usagePage<<16)|1]}]});

test('recognises a standard HID PID force-feedback output path',()=>{
  const device={productName:'Test racing wheel',vendorId:0x044f,productId:0xb66e,collections:[{
    usagePage:0x01,usage:0x04,inputReports:[report(1,0x01)],outputReports:[report(2,0x0f)],featureReports:[],children:[]
  }]};
  const result=inspectHIDDevice(device);
  assert.equal(result.hasPID,true);assert.equal(result.outputReports.length,1);
  const text=describeHIDDevice(device);
  assert.match(text,/Vendor 0x044f · Product 0xb66e/);
  assert.match(text,/Output report 0x0002 · 4 bytes/);
  assert.match(text,/Field · 8 bit × 4 · usage 0x000f:0x0001 Physical Interface \(force feedback\)/);
  assert.match(text,/Result: promising/);
});

test('distinguishes device-specific output from an input-only device',()=>{
  const vendorDevice={productName:'Vendor wheel',vendorId:1,productId:2,collections:[{
    usagePage:1,usage:4,inputReports:[],outputReports:[report(3,0xff00)],featureReports:[],children:[]
  }]};
  assert.match(describeHIDDevice(vendorDevice),/device-specific protocol/);
  const inputOnly={...vendorDevice,productName:'Input wheel',collections:[{...vendorDevice.collections[0],outputReports:[]}]};
  assert.match(describeHIDDevice(inputOnly),/no HID output reports/);
});

test('identifies the current T300 bridge output as a compatibility sink',()=>{
  const bridge={productName:'T300 Native FFB Compatibility Bridge',vendorId:0x046d,productId:0xc24f,collections:[{
    usagePage:1,usage:4,inputReports:[],outputReports:[report(0,0xff00)],featureReports:[],children:[]
  }]};
  assert.match(describeHIDDevice(bridge),/inert compatibility sink/);
});

test('identifies a native Logitech G29 without mistaking the T300 compatibility bridge for one',()=>{
  const g29={productName:'Logitech G29 Driving Force Racing Wheel',vendorId:0x046d,productId:0xc24f,collections:[{
    usagePage:1,usage:4,inputReports:[report(0,0x01,12)],outputReports:[report(0,0xff00,7)],featureReports:[],children:[]
  }]};
  assert.match(describeHIDDevice(g29),/compatible with Daytona's Logitech G29 native FFB force-feedback provider/);
  const bridge={...g29,productName:'T300 Native FFB Compatibility Bridge'};
  assert.match(describeHIDDevice(bridge),/inert compatibility sink/);
});

test('identifies the validated T300 WebHID v2 provider',()=>{
  const bridge={productName:'T300 WebHID Force Feedback Bridge',vendorId:0x1209,productId:0xb300,collections:[{
    usagePage:0xff00,usage:1,inputReports:[],outputReports:[report(1,0xff00)],featureReports:[],children:[]
  }]};
  assert.match(describeHIDDevice(bridge),/compatible with Daytona's T300 WebHID v2 force-feedback provider/);
});

test('starting a new HID inspection clears the previous report immediately',async()=>{
  const listeners={},button={disabled:false,addEventListener:(type,listener)=>listeners[type]=listener};
  const status={textContent:''},reportBox={textContent:'Previous inspection'};
  const root={querySelector:selector=>({'#webhidInspect':button,'#webhidStatus':status,'#webhidReport':reportBox}[selector])};
  let finishSelection;
  const selection=new Promise(resolve=>finishSelection=resolve);
  const oldDevice={productName:'Previously permitted wheel',collections:[]};
  const hid={getDevices:async()=>[oldDevice],requestDevice:()=>selection,addEventListener(){}};
  mountWebHIDDiagnostics(root,{hid,secure:true});
  await Promise.resolve();await Promise.resolve();
  reportBox.textContent='Previous inspection';
  const pending=listeners.click();
  assert.equal(reportBox.textContent,'');
  assert.equal(button.disabled,true);
  finishSelection([]);await pending;
  assert.equal(reportBox.textContent,'');
  assert.doesNotMatch(reportBox.textContent,/Previously permitted wheel/);
  assert.equal(button.disabled,false);
});

test('the single HID report button inspects, updates support data and downloads the report',async()=>{
  const listeners={},button={disabled:false,addEventListener:(type,listener)=>listeners[type]=listener};
  const status={textContent:''},reportBox={textContent:''},saved=[],updates=[];
  const root={querySelector:selector=>({'#webhidInspect':button,'#webhidStatus':status,'#webhidReport':reportBox}[selector])};
  const device={productName:'Generic PID wheel',vendorId:0x1234,productId:0x5678,collections:[]};
  const hid={getDevices:async()=>[],requestDevice:async()=>[device],addEventListener(){}};
  const mounted=mountWebHIDDiagnostics(root,{hid,secure:true,save:(name,text)=>saved.push({name,text}),onDevices:devices=>updates.push(devices)});
  await Promise.resolve();await Promise.resolve();await listeners.click();
  assert.equal(saved.length,1);assert.match(saved[0].name,/daytona-webhid-report-/);assert.match(saved[0].text,/Generic PID wheel/);
  assert.equal(updates.at(-1)[0],device);assert.equal(status.textContent,'HID report downloaded.');
  mounted.clear();assert.deepEqual(updates.at(-1),[]);assert.equal(reportBox.textContent,'');assert.match(status.textContent,/checks FFB support/);
});

test('downloadable HID reports include device fields and local environment context',()=>{
  const device={productName:'Generic PID wheel',vendorId:0x1234,productId:0x5678,collections:[]};
  const text=createHIDReport([device],{date:new Date('2026-10-23T12:00:00.000Z'),userAgent:'Test Browser',secure:true});
  assert.match(text,/Daytona USA WebHID force-feedback report/);
  assert.match(text,/Generated: 2026-10-23T12:00:00.000Z/);
  assert.match(text,/Browser: Test Browser/);
  assert.match(text,/Secure context: yes/);
  assert.match(text,/Generic PID wheel/);
  assert.match(text,/Vendor 0x1234 · Product 0x5678/);
});

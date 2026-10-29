import {WheelForceFeedback,hidIdentity,gamepadHardware} from './wheel-force-feedback.js?v=53.8.41';
import {mountWebHIDDiagnostics} from './webhid-diagnostics.js?v=53.8.41';

const PAIRS='daytona-wheel-ffb-bindings-v1';
function readPairs(storage){
  try{const rows=JSON.parse(storage?.getItem(PAIRS)||'[]');return Array.isArray(rows)?rows.filter(row=>typeof row?.input==='string'&&row.input.length<=512&&Number.isInteger(row.device?.vendorId)&&row.device.vendorId>=0&&row.device.vendorId<=65535&&Number.isInteger(row.device.productId)&&row.device.productId>=0&&row.device.productId<=65535&&typeof row.device.productName==='string'&&row.device.productName.length<=256).slice(-24):[];}catch{return [];}
}
export function mountWheelFeedback(root,{settings,onSetting,storage,getSelection,getEngineAvailable,canTest,hid=globalThis.navigator?.hid,secure=globalThis.isSecureContext,feedback=null}={}){
  const $=id=>root.querySelector('#'+id),pairs=readPairs(storage);
  let selected='',paired='',busy=false,testing=false,revision=0,message='',lastView='',nextViewAt=0;
  const selectionKey=(s=getSelection())=>s?`${s.id}@${s.index??'unresolved'}`:'';
  const ffb=feedback||new WheelForceFeedback({hid,onStatus:status=>{if(status==='Disconnected'){paired='';message='Force device disconnected. Reconnect to use forces.';}render();}});
  const writePairs=()=>{try{storage?.setItem(PAIRS,JSON.stringify(pairs.slice(-24)));}catch{}};
  const say=text=>{message=text;render();};
  function sync(){ffb.setEnabled(settings.forceFeedbackEnabled);ffb.setStrength(settings.forceFeedbackStrength);ffb.setReverse(settings.forceFeedbackReverse);ffb.setSourceAvailable(getEngineAvailable());render();}
  function stop({force=true}={}){ffb.stop({force});}
  function refresh(now=performance.now()){
    // With no paired wheel, UI polling is bounded to 10 Hz. A paired device
    // still gets its input/disconnection safety check every host callback.
    if(!paired&&now<nextViewAt)return;
    const selection=getSelection(),next=selectionKey(selection);
    if(selected!==next){selected=next;paired='';revision++;busy=false;ffb.stop({force:true});void ffb.disconnect().catch(()=>{});message='';}
    if(paired&&(!selection?.connected||!selection.enabled||!selection.calibrated))ffb.stop({force:ffb.testing});
    ffb.setSourceAvailable(getEngineAvailable());if(now>=nextViewAt){nextViewAt=now+100;render(selection);}
  }
  function render(selection=getSelection()){
    const supported=!!hid&&secure,engine=!!getEngineAvailable(),connected=ffb.connected&&paired===selectionKey(selection);
    const ready=connected&&engine&&selection?.connected&&selection.enabled&&selection.calibrated;
    const status=busy?(testing?'TESTING':'CONNECTING'):!supported?'UNAVAILABLE':connected?'CONNECTED':'NOT CONNECTED';
    const help=message||(!supported?'Force feedback needs Chrome or Edge on HTTPS or localhost. Wheel inputs remain available.':!engine?'Load your ROM to make arcade steering forces available.':!selection?'Choose your steering wheel in Input & calibration first.':!selection.connected?'Press a wheel button to reconnect its input.':!connected?'Connect the same physical wheel as your steering input. Forces start at 20%.':!selection.enabled||!selection.calibrated?'Finish steering calibration and enable wheel input to use forces in a race.':'Forces run only while driving with this wheel. Menus and loss of focus stop them.');
    const view=JSON.stringify([selection?.name,ffb.label,status,ready,busy,help,settings.forceFeedbackEnabled,settings.forceFeedbackStrength,settings.forceFeedbackReverse,!!canTest()]);
    if(view===lastView)return;lastView=view;
    $('wheelForceInput').textContent=selection?.name||'Choose a wheel';$('wheelForceDevice').textContent=connected?ffb.provider.device.productName||ffb.label:'Not paired';
    $('wheelForceStatus').textContent=status;$('wheelForceStatus').classList.toggle('connected',connected);
    $('wheelForceConnect').textContent=busy&&!testing?'CONNECTING…':connected?'CHANGE FORCE DEVICE':'CONNECT FORCE FEEDBACK';
    $('wheelForceConnect').disabled=busy||!supported||!selection?.connected;
    $('wheelForceEnabled').checked=settings.forceFeedbackEnabled;$('wheelForceEnabled').disabled=!connected||!engine;
    $('wheelForceStrength').value=Math.round(settings.forceFeedbackStrength*100);$('wheelForceStrengthValue').textContent=Math.round(settings.forceFeedbackStrength*100)+'%';
    $('wheelForceStrength').disabled=!connected;$('wheelForceReverse').checked=settings.forceFeedbackReverse;$('wheelForceReverse').disabled=!connected;
    $('wheelForceTest').disabled=busy||!ready||!settings.forceFeedbackEnabled||!settings.forceFeedbackStrength||!canTest();
    $('wheelForceStop').disabled=!connected;$('wheelForceHelp').textContent=help;
    $('wheelForceProvider').textContent=connected?ffb.label:'Supported protocols: standard HID PID, native T300, Logitech G29 and the T300 WebHID v2 bridge. Device access depends on browser and driver support.';
  }
  $('wheelForceConnect').addEventListener('click',async()=>{
    refresh();const input=getSelection()?.id,key=selectionKey();if(!input||busy)return;
    const token=++revision;busy=true;say('Choose the same physical wheel as your steering input.');
    try{
      // An explicit click may restore only an unambiguous saved pairing. Never
      // open the first authorized HID device, or silently switch another wheel.
      const previous=pairs.find(row=>row.input===input);
      let provider=previous&&!ffb.connected?await ffb.restore(previous.device,input):null;
      if(token!==revision)return;
      if(!provider)provider=await ffb.request(input);
      if(token!==revision)return;
      if(!provider){say('No wheel selected. Nothing changed.');return;}
      paired=key;const index=pairs.findIndex(row=>row.input===input);if(index>=0)pairs.splice(index,1);
      pairs.push({input,device:hidIdentity(provider.device)});writePairs();
      onSetting('forceFeedbackStrength',.2);onSetting('forceFeedbackEnabled',true);sync();
      say(gamepadHardware(input)?'Paired to your selected steering input. Start gently at 20%.':'Paired by your selection. This browser does not expose input hardware IDs; verify both entries name the same wheel.');
    }catch(error){if(token===revision)say(error?.name==='NotFoundError'?'No wheel selected. Nothing changed.':String(error?.message||error));}
    finally{if(token===revision){busy=false;render();}}
  });
  $('wheelForceEnabled').addEventListener('change',event=>{onSetting('forceFeedbackEnabled',event.target.checked);sync();});
  $('wheelForceStrength').addEventListener('input',event=>{onSetting('forceFeedbackStrength',Number(event.target.value)/100);sync();});
  $('wheelForceReverse').addEventListener('change',event=>{stop();onSetting('forceFeedbackReverse',event.target.checked);sync();});
  $('wheelForceStop').addEventListener('click',()=>{stop();onSetting('forceFeedbackEnabled',false);sync();say('Forces stopped. Turn on Use force feedback to resume.');});
  $('wheelForceTest').addEventListener('click',async()=>{
    if($('wheelForceTest').disabled||!canTest())return;
    busy=true;testing=true;say('Brief left pull…');
    try{const complete=await ffb.testLeft({duration:280,maxStrength:.2});say(complete?'Test finished. Adjust gain gently; reverse direction only if needed.':'Test stopped. No force is being applied.');}
    catch(error){say(String(error?.message||error));}finally{busy=false;testing=false;render();}
  });
  const diagnostics=mountWebHIDDiagnostics(root,{hid,secure});
  refresh();sync();
  return {sync,refresh,stop,
    resetPairing(){stop();pairs.splice(0,pairs.length);writePairs();paired='';revision++;void ffb.disconnect().catch(()=>{});onSetting('forceFeedbackEnabled',false);say('Wheel profile and force pairing cleared.');},
    drive(state,now,allowed){if(!allowed||!ffb.connected||!ffb.enabled){ffb.stop();return false;}const selection=getSelection();if(!selection?.active||paired!==selectionKey(selection)){ffb.stop();return false;}return ffb.update(state,now);},
    state:()=>({connected:ffb.connected,paired,enabled:ffb.enabled,testing:ffb.testing}),
    destroy(){revision++;ffb.destroy();diagnostics.clear();}
  };
}

// Racing wheel setup → Force feedback (v53.8.62): Arcade FFB Helper, the small SDL3 app shared
// with Daytona USA 2 and Scud Race, plays window.arcadeForceFeedback's drive-board forces on the
// player's wheel. It replaces the WebHID drivers (HID PID, T300, G29), so any wheel with a
// DirectInput / SDL3 force feedback driver works. ffb-helper.js is the shared client, unchanged;
// all force settings (strength, direction, gains, centring) live in the helper's own page.
import './ffb-helper.js?v=53.8.62';

const HELPER_PAGE='http://127.0.0.1:47823/';
const HELPER_DOWNLOAD='https://github.com/johannruiz/arcade-ffb-helper/releases/latest';

export function mountFfbHelper(root,{card=root,pill=null}={}){
  const helper=globalThis.arcadeFfbHelper;
  if(!root||!helper)return null;
  // Inside the Arcade Launcher its own SDL3 bridge already drives the wheel.
  if(globalThis.arcadeLauncher){card.hidden=true;return null;}
  root.innerHTML=`
    <label class="setting-toggle"><span>Force feedback with FFB Helper<small>Chrome or Edge ask once to allow access to apps on this device. Forces run only while you drive: menus, pause, spectating and a hidden or unfocused page stop them.</small></span><input id="ffbHelperEnabled" type="checkbox"></label>
    <div class="ffb-helper-state"><span class="ffb-helper-dot" aria-hidden="true"></span><p id="ffbHelperStatus" role="status"></p></div>
    <p class="ffb-helper-links"><a id="ffbHelperOpen" href="${HELPER_PAGE}" target="_blank" rel="noopener">Open FFB Helper settings</a><a id="ffbHelperGet" href="${HELPER_DOWNLOAD}" target="_blank" rel="noopener">Get Arcade FFB Helper</a></p>`;
  const $=id=>root.querySelector('#'+id);
  const toggle=$('ffbHelperEnabled'),text=$('ffbHelperStatus'),open=$('ffbHelperOpen'),get=$('ffbHelperGet');
  toggle.addEventListener('change',()=>toggle.checked?helper.enable():helper.disable());
  const unsubscribe=helper.onChange((status,info)=>{
    toggle.checked=helper.enabled;
    let state=status,msg='',label='OFF';
    if(status==='off')msg='Off. Steering, pedals and buttons work without it; the wheel gets no forces.';
    else if(status==='connecting'){msg='Connecting to FFB Helper…';label='CONNECTING';}
    else if(status==='waiting'){msg='FFB Helper is not running on this device. Start it and the game connects by itself. If the browser blocked access to apps on this device, allow it in the site settings next to the address bar.';label='NOT RUNNING';}
    else if(status==='connected'&&info?.wheel){msg=`Connected · ${info.device} · force feedback ready. Strength and the other wheel settings are in FFB Helper.`;label='CONNECTED';}
    else if(status==='connected'){state='nowheel';label='NO FFB WHEEL';msg=info?.device?`Connected · ${info.device} has no wheel force feedback.`:'Connected · no wheel with force feedback found. Connect it and FFB Helper picks it up.';}
    text.textContent=msg;
    card.dataset.state=state;
    if(pill){pill.textContent=label;pill.classList.toggle('connected',state==='connected');}
    open.hidden=status!=='connected';
    get.hidden=status!=='waiting'&&status!=='off';
  });
  return {helper,destroy:unsubscribe};
}

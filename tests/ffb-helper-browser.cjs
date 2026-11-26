// v53.8.62: Daytona USA hands the drive board's forces to Arcade FFB Helper.
// The helper's WebSocket (ws://127.0.0.1:47823/ws/game) is mocked by Playwright, so no real
// helper or wheel is touched. Plays a single-player race with the keyboard and checks:
//  - the page says `hello d1 1`, shows the helper's wheel, and sends `f` lines;
//  - every live line equals the board effect's channel (webhaptics::arcade_forces);
//  - which drive-board effects the game used, and that each reached the helper;
//  - menu / disabling stop every force.
// TEST_ROM=<daytona.zip> TEST_URL=http://127.0.0.1:8162 PLAYWRIGHT_PATH=... node tests/ffb-helper-browser.cjs
const assert=require('node:assert/strict');
const {readFileSync,writeFileSync,mkdirSync}=require('node:fs');
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const base=process.env.TEST_URL||'http://127.0.0.1:8162';
const VERSION=readFileSync('room-settings.js','utf8').match(/CLIENT_VERSION='([^']+)'/)[1];
const EFFECTS=['none','resistance','centre','centre-dead-zone','uncentre','force'];

(async()=>{
  const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-unsafe-webgpu','--use-angle=d3d11','--mute-audio']});
  const report={version:VERSION,lines:0,live:0,hello:null,effects:{},mismatches:[],menuStops:false,disableStops:false};
  try{
    const page=await browser.newPage({viewport:{width:1100,height:760}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.route(`**/main.js?v=${VERSION}`,route=>route.fulfill({contentType:'text/javascript',body:readFileSync('main.js','utf8')+'\nwindow.__engine=()=>wasm;\n'}));
    const lines=[];let socket=null;
    // TEST_REAL_HELPER=1: talk to a running Arcade FFB Helper instead (its /report shows what it played).
    if(!process.env.TEST_REAL_HELPER)await page.routeWebSocket('ws://127.0.0.1:47823/ws/game',ws=>{
      socket=ws;
      ws.onMessage(message=>{
        lines.push({t:Date.now(),m:String(message)});
        if(String(message).startsWith('hello ')){report.hello=String(message);ws.send('hi 0.test 1 Test Wheel FFB');}
      });
    });
    await page.goto(base+'/?ffb=helper');
    await page.waitForFunction(()=>document.querySelector('#status').textContent==='Engine ready',null,{timeout:120000});
    await page.waitForFunction(()=>window.arcadeFfbHelper?.status==='connected');
    if(!process.env.TEST_REAL_HELPER)assert.equal(report.hello,'hello d1 1');
    await page.locator('#settingsBtn').click();await page.locator('#experimentalTab').click();
    assert.equal(await page.locator('#ffbHelperEnabled').isChecked(),true);
    if(!process.env.TEST_REAL_HELPER){assert.match(await page.locator('#ffbHelperStatus').innerText(),/Test Wheel FFB/);
    assert.equal(await page.locator('#wheelForceStatus').innerText(),'CONNECTED');}
    else console.log('helper card:',await page.locator('#ffbHelperStatus').innerText());
    mkdirSync('build',{recursive:true});await page.locator('#wheelFeedback').screenshot({path:'build/ffb-helper-card.png'});
    await page.locator('#settingsBack').click();
    // Not running: only silent lines.
    assert.ok(lines.filter(l=>l.m.startsWith('f ')).every(l=>l.m==='f 0 0 0 0 0 0'),'forces before the race');

    await page.locator('#romInput').setInputFiles(process.env.TEST_ROM);
    await page.waitForFunction(()=>document.querySelector('#status').textContent==='ROM ready',null,{timeout:120000});
    await page.locator('#singlePlayer').click();await page.locator('#singleStart').click();
    await page.waitForFunction(()=>document.querySelector('#status').textContent==='Arcade running',null,{timeout:120000});
    await page.evaluate(()=>{
      // Each animation frame: the raw board channels and what read() hands the helper.
      window.__ffb=[];
      const tick=()=>{const w=window.__engine();if(w?._daytona_wheel_ffb){const f=[...new Float32Array(w.HEAPU8.buffer,w._daytona_wheel_ffb(),8)];window.__ffb.push({f,r:window.arcadeForceFeedback.read()});}requestAnimationFrame(tick);};
      requestAnimationFrame(tick);
    });
    const press=async(key,ms=120)=>{await page.keyboard.down(key);await page.waitForTimeout(ms);await page.keyboard.up(key);};
    await page.waitForTimeout(3000);
    for(let i=0;i<3;i++){await press('Digit5');await page.waitForTimeout(400);}
    for(let i=0;i<8;i++){await press('Enter');await page.waitForTimeout(1500);}
    // Drive: throttle held, weaving to hit walls and corners.
    await page.keyboard.down('ArrowUp');
    const until=Date.now()+Number(process.env.TEST_RACE_MS||70000);
    let side='ArrowLeft';
    while(Date.now()<until){await page.keyboard.down(side);await page.waitForTimeout(900+Math.random()*900);await page.keyboard.up(side);side=side==='ArrowLeft'?'ArrowRight':'ArrowLeft';await page.waitForTimeout(400);}
    await page.keyboard.up('ArrowUp');
    const samples=await page.evaluate(()=>window.__ffb.splice(0));
    for(const {f,r} of samples){
      const name=EFFECTS[f[6]]||String(f[6]);const e=report.effects[name]??={samples:0,motorOn:0,live:0,maxConstant:0,maxSpring:0,maxDamper:0};
      e.samples++;if(f[7]===1)e.motorOn++;if(r.live)e.live++;
      e.maxConstant=Math.max(e.maxConstant,Math.abs(f[1]));e.maxSpring=Math.max(e.maxSpring,f[2]);e.maxDamper=Math.max(e.maxDamper,f[3]);
      if(r.live&&(r.constant!==f[1]||r.spring!==f[2]||r.damper!==f[3]||r.friction!==0||r.rumble!==0))report.mismatches.push({f,r});
      // The spring's shape (helper 0.2): dead zone 2% or 6% (0x38-0x3F), slope 1/0.08; none without a spring.
      if(r.live&&(f[2]>0?r.springDeadZone!==(f[6]===3?.06:.02)||r.springSlope!==12.5:'springDeadZone' in r))report.mismatches.push({shape:true,f,r});
      // Channel per effect: only that effect's channel may carry force.
      if(f[7]===1){
        const ok=name==='force'||name==='uncentre'?f[2]===0&&f[3]===0:name==='centre'||name==='centre-dead-zone'?f[1]===0&&f[3]===0:name==='resistance'?f[1]===0&&f[2]===0:f[1]===0&&f[2]===0&&f[3]===0;
        if(!ok)report.mismatches.push({channel:name,f});
      }
    }
    // Menu: every force stops at once.
    await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.querySelector('#overlay').hidden);
    const mark=Date.now();await page.waitForTimeout(600);
    const afterMenu=lines.filter(l=>l.t>mark+50&&l.m.startsWith('f '));
    report.menuStops=afterMenu.length>0&&afterMenu.every(l=>l.m==='f 0 0 0 0 0 0');
    const fl=lines.filter(l=>l.m.startsWith('f '));report.lines=fl.length;report.live=fl.filter(l=>l.m.startsWith('f 1')).length;
    report.liveExamples=[...new Set(fl.filter(l=>l.m.startsWith('f 1')).map(l=>l.m))].slice(0,12);
    // Every live line with a spring carries its shape; no other line does.
    report.shapeLines=fl.filter(l=>l.m.split(' ').length===9).length;
    report.badShape=fl.filter(l=>{const v=l.m.split(' ');return v[1]==='1'&&(Number(v[3])>0)!==(v.length===9);}).map(l=>l.m).slice(0,5);
    // Disable: a last silent line, then the socket closes.
    const before=lines.length;await page.evaluate(()=>window.arcadeFfbHelper.disable());await page.waitForTimeout(200);
    report.disableStops=lines.slice(before).every(l=>l.m==='f 0 0 0 0 0 0')&&await page.evaluate(()=>window.arcadeFfbHelper.status==='off');
    report.errors=errors;
    writeFileSync('build/ffb-helper-browser.json',JSON.stringify(report,null,1));
    console.log(JSON.stringify({...report,liveExamples:report.liveExamples.slice(0,6)},null,1));
    assert.deepEqual(errors,[]);
    assert.equal(report.mismatches.length,0,'live lines differ from the board channels');
    if(!process.env.TEST_REAL_HELPER){
    assert.ok(report.live>0,'no live forces reached the helper in the race');
    assert.ok(report.menuStops,'menu did not stop the forces');
    assert.ok(report.shapeLines>0,'no spring shape reached the helper');
    assert.deepEqual(report.badShape,[],'spring shape on the wrong lines');
    }
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});

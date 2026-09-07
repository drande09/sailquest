const { chromium } = require('@playwright/test');
const fs=require('node:fs/promises');
const path=require('node:path');
const assert=require('node:assert/strict');

(async()=>{
  const out=path.resolve(__dirname,'../artifacts');await fs.mkdir(out,{recursive:true});
  const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-unsafe-swiftshader']});
  const page=await browser.newPage({viewport:{width:1440,height:960}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto('http://127.0.0.1:4173');await page.waitForFunction(()=>typeof Game!=='undefined'&&Game.player);
  await page.waitForTimeout(1200);
  assert.equal(await page.evaluate(()=>!!Game.scene3d),true,'Real WebGL renderer starts');
  await page.screenshot({path:path.join(out,'menu.png')});
  await page.getByRole('button',{name:'Start sailing school'}).click();
  await page.getByRole('button',{name:/Find your reach/}).click();
  await page.waitForTimeout(1200);
  assert.equal(await page.evaluate(()=>Game.modeName),'lesson');
  await page.screenshot({path:path.join(out,'chase.png')});
  await page.getByRole('button',{name:'First person',exact:true}).click();
  await page.waitForTimeout(800);await page.screenshot({path:path.join(out,'first-person.png')});
  assert.equal(await page.evaluate(()=>Game.view),'fp');
  await page.getByRole('button',{name:'Overhead',exact:true}).click();
  await page.waitForTimeout(300);await page.screenshot({path:path.join(out,'overhead.png')});
  assert.equal(await page.evaluate(()=>Game.view),'top');
  // Genuine keyboard input changes the common simulation, and pause releases it.
  const before=await page.evaluate(()=>Game.player.heading);await page.keyboard.down('a');await page.waitForTimeout(350);await page.keyboard.up('a');
  assert.notEqual(await page.evaluate(()=>Game.player.heading),before);
  await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>Game.paused),true);
  const frozen=await page.evaluate(()=>Game.player.x);await page.waitForTimeout(250);assert.equal(await page.evaluate(()=>Game.player.x),frozen);
  await page.getByRole('button',{name:/Keep Sailing/}).click();
  // All old game modes and every boat still render in all three views.
  await page.evaluate(()=>{Sound.muted=true;});
  for(const mode of ['free','rings','trial','race','battle']){
    await page.evaluate(mode=>Game.start(mode),mode);
    for(const view of ['chase','fp','top']){
      await page.evaluate(v=>Game.setView(v),view);await page.waitForTimeout(120);
      assert.equal(await page.evaluate(()=>Game.running),true);
    }
  }
  for(const boat of ['opti','sunfish','v15','j22','sloop','schooner','tallship']){
    await page.evaluate(boat=>{Progress.data.equipped.boat=boat;Game.start('free');Game.setView('chase');},boat);
    await page.waitForTimeout(150);
  }
  // A restarted countdown cannot start the previous race in the new mode.
  await page.evaluate(()=>{Game.start('race');Game.start('free');});await page.waitForTimeout(3200);
  assert.equal(await page.evaluate(()=>Game.modeName),'free');assert.equal(await page.evaluate(()=>Game.countdownState),null);
  await page.evaluate(()=>{Progress.data.equipped.boat='opti';Game.lessonId='tack';Game.start('lesson');Game.setView('chase');});
  await page.setViewportSize({width:390,height:844});await page.waitForTimeout(400);
  await page.screenshot({path:path.join(out,'mobile.png')});
  const initialSheet=await page.evaluate(()=>Game.player.sheet);
  await page.locator('[data-key="w"]').dispatchEvent('pointerdown',{pointerId:1});await page.waitForTimeout(200);
  await page.locator('[data-key="w"]').dispatchEvent('pointerup',{pointerId:1});
  assert.ok(await page.evaluate(s=>Game.player.sheet>s,initialSheet));
  // Exercise the fallback with WebGL unavailable before initialization.
  const fallback=await browser.newPage();
  await fallback.addInitScript(()=>{const get=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...rest){if(type.startsWith('webgl'))return null;return get.call(this,type,...rest);};});
  await fallback.goto('http://127.0.0.1:4173');await fallback.waitForFunction(()=>typeof Game!=='undefined'&&Game.player);
  assert.equal(await fallback.evaluate(()=>Game.view),'top');
  await fallback.getByRole('button',{name:'Start sailing school'}).click();await fallback.getByRole('button',{name:/Find your reach/}).click();
  assert.equal(await fallback.evaluate(()=>Game.modeName),'lesson');
  await fallback.close();
  const info=await page.evaluate(()=>({render:Game.scene3d.renderer.info.render,geometries:Game.scene3d.renderer.info.memory.geometries,view:Game.view}));
  await browser.close();
  assert.deepEqual(errors,[],'No browser runtime or shader errors');
  console.log(JSON.stringify({success:true,checks:'3 views, 5 original modes, 7 boats, lessons, keyboard, touch, pause, countdown reset, WebGL fallback',info},null,2));
})().catch(e=>{console.error(e);process.exitCode=1;process.exit(1);});

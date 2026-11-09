import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE || undefined, headless: true });
const base = 'http://localhost:4173', run = 'frontier-direct-ratings-200/kindness';
const source = `${base}/leaderboard/?id=GLM+5.3&constitution=kindness&run=${run}`;
const errors=[];
const settle = async p => {
  await p.locator('.model-profile').first().waitFor({timeout:30000});
  await p.waitForFunction(()=>!document.querySelector('.model-profile-list')?.textContent.includes('Loading remaining values…'));
};
try {
  for(const [width,height] of [[1440,1000],[390,844]]) {
    const p=await browser.newPage({viewport:{width,height},hasTouch:width<700,isMobile:width<700});p.on('pageerror',e=>errors.push(e.message));
    await p.goto(base);await p.locator('.arena-column').first().waitFor({timeout:30000});await p.locator('.hub-trend-chart').waitFor({timeout:30000});await p.waitForTimeout(200);
    await p.mouse.move(width-80,300);await p.mouse.wheel(0,120);await p.waitForTimeout(500);
    assert.ok(Math.abs(await p.evaluate(()=>scrollY)-120)<3,'Home scroll follows the wheel without snapping');
    await p.mouse.wheel(0,140);await p.waitForTimeout(400);assert.ok(Math.abs(await p.evaluate(()=>scrollY)-260)<3,'Home continues normally');
    if(width<700){
      await p.evaluate(()=>scrollTo({top:0,behavior:'instant'}));await p.waitForTimeout(150);
      const cdp=await p.context().newCDPSession(p);
      await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:180,y:600}]});
      for(let i=1;i<=6;i++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:180,y:600-i*20}]});await p.waitForTimeout(60);}
      const y=await p.evaluate(()=>scrollY);assert.ok(y>50&&y<160,`Home follows the finger without snapping: ${y}`);
      await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    }
    await p.goto(source);await settle(p);
    const names=await p.locator('.model-directory-list button').evaluateAll(bs=>bs.map(b=>b.children[2].textContent));
    assert.deepEqual(await p.locator('.profile-heading h2').allTextContents(),names,'All model profiles are in normal document flow');
    const secondTop=await p.locator('.model-profile').nth(1).evaluate(el=>el.getBoundingClientRect().top+scrollY);
    await p.evaluate(y=>scrollTo({top:y,behavior:'instant'}),secondTop-400);
    const before=await p.evaluate(()=>scrollY);await p.mouse.move(width-80,400);await p.mouse.wheel(0,400);await p.waitForTimeout(500);
    assert.ok(Math.abs(await p.evaluate(()=>scrollY)-before-400)<3,'Crossing models never intercepts scrolling or resets the viewport');
    assert.equal(new URL(p.url()).searchParams.get('id'),names[1]);assert.equal(new URL(p.url()).searchParams.get('run'),run);
    assert.equal(await p.locator('.model-profile').count(),names.length);
    await p.mouse.wheel(0,-200);await p.waitForTimeout(300);assert.ok(Math.abs(await p.evaluate(()=>scrollY)-before-200)<3,'Reverse scrolling stays native');
    assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await p.screenshot({path:`/private/tmp/native-model-scroll-${width}.png`});
    await p.evaluate(()=>scrollTo({top:0,behavior:'instant'}));
    if(width<700)await p.getByRole('button',{name:'Choose a model',exact:true}).click();
    await p.locator('.model-directory-list button').nth(3).click();await p.waitForTimeout(250);
    assert.equal(new URL(p.url()).searchParams.get('id'),names[3]);
    const heading=await p.locator('.model-profile[data-active=true] .profile-heading h2').boundingBox();assert.ok(heading.y>=56&&heading.y<300);
    await p.reload();await settle(p);await p.waitForTimeout(300);
    assert.equal(new URL(p.url()).searchParams.get('id'),names[3],'Reload preserves the linked model');
    const linked=await p.locator('.model-profile[data-active=true] .profile-heading h2').boundingBox();assert.ok(linked.y>=0&&linked.y<height,'Deep-linked profile remains in view as data loads');
    console.log('Passed native home/model scrolling, model order, sidebar selection, and linked profile:',width);
    await p.close();
  }
  assert.deepEqual(errors,[]);
}finally{await browser.close();}

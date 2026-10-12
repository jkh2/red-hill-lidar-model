import {test,expect} from '@playwright/test';
import path from 'node:path';
import {PNG} from 'pngjs';

async function routes(page) {
  // Serve the exact pinned Three.js package locally. These are real renderer and
  // OrbitControls modules, not WebGL mocks; CI does not depend on the CDN.
  await page.route('https://cdn.jsdelivr.net/npm/three@0.160.0/**',route=>{
    const suffix=new URL(route.request().url()).pathname.split('/three@0.160.0/')[1];
    return route.fulfill({path:path.resolve('node_modules/three',suffix),contentType:'text/javascript'});
  });
  await page.route('https://fonts.googleapis.com/**',route=>route.fulfill({body:'',contentType:'text/css'}));
}
async function open(page) {
  await routes(page);await page.goto('/');
  await expect(page.locator('#load')).toBeHidden();
  await expect(page.locator('#piles button')).toHaveCount(30);
}
async function screenshot(page,testInfo,name) {
  const file=testInfo.outputPath(name+'.png');await page.screenshot({path:file});
  await testInfo.attach(name,{path:file,contentType:'image/png'});
}

test('renders terrain, preserves selection, and stops rendering at idle',async({page},testInfo)=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(()=>{
    const original=window.requestAnimationFrame.bind(window);window.__testFrames=0;
    window.requestAnimationFrame=callback=>original(time=>{window.__testFrames++;callback(time);});
  });
  await open(page);
  const image=PNG.sync.read(await page.screenshot());let terrainPixels=0;
  // The middle region excludes all panels and toolbar. Non-background pixels
  // therefore verify that model geometry really reached the WebGL framebuffer.
  for(let y=250;y<750;y++)for(let x=420;x<1030;x++){
    const i=(y*image.width+x)*4;
    if(image.data[i]>30 || image.data[i+1]>30 || image.data[i+2]>30)terrainPixels++;
  }
  expect(terrainPixels).toBeGreaterThan(5000);
  await screenshot(page,testInfo,'desktop-overview');
  await page.getByRole('button',{name:/Stockpile 1, estimated/}).click();
  await expect(page.locator('#selection-title')).toHaveText('Stockpile 01');
  const before=await page.locator('#selection-facts').innerText();
  await page.mouse.move(700,450);await expect(page.locator('#selection-facts')).toHaveText(before);
  await screenshot(page,testInfo,'selected-stockpile');
  const canvas=await page.locator('canvas').boundingBox();
  await page.mouse.move(canvas.width*.45,canvas.height*.55);await page.mouse.down();
  await page.mouse.move(canvas.width*.55,canvas.height*.6,{steps:6});await page.mouse.up();
  await expect(page.locator('#selection-title')).toHaveText('Stockpile 01');
  await page.waitForTimeout(1000);
  const frames=await page.evaluate(()=>window.__testFrames);await page.waitForTimeout(300);
  expect(await page.evaluate(()=>window.__testFrames)).toBe(frames);
  expect(errors).toEqual([]);
});

test('orthographic scale and ground measurements agree and survive exaggerated height',async({page},testInfo)=>{
  await open(page);await page.getByRole('button',{name:'Plan',exact:true}).click();
  await expect(page.locator('#scale')).toBeVisible();
  const scaleLabel=await page.locator('#scale-label').innerText();
  const metres=parseFloat(scaleLabel)*(scaleLabel.includes('km')?1000:1);
  const width=await page.locator('#scale-line').evaluate(el=>el.getBoundingClientRect().width);
  const expected=Math.hypot(130,20)*metres/width;
  await page.getByRole('button',{name:'Measure',exact:true}).click();
  await page.mouse.click(650,500);await page.mouse.click(780,520);
  await expect(page.locator('#measurement')).toBeVisible();
  const horizontal=await page.locator('#measurement-facts dd').nth(0).innerText();
  expect(Math.abs(parseFloat(horizontal)-expected)).toBeLessThan(1);
  const physical=await page.locator('#measurement-facts').innerText();
  const slider=page.getByLabel('Vertical exaggeration',{exact:true});await slider.focus();
  for(let i=0;i<4;i++)await slider.press('ArrowRight');
  await expect(slider).toHaveValue('3');
  await expect(page.locator('#measurement-facts')).toHaveText(physical);
  await page.getByRole('button',{name:'Clear measurement',exact:true}).click();
  await page.mouse.click(650,500);await page.mouse.click(780,520);
  await expect(page.locator('#measurement-facts dd').nth(0)).toHaveText(horizontal);
  await screenshot(page,testInfo,'plan-measurement');
  await page.getByRole('button',{name:'Measure',exact:true}).click();
  await page.getByRole('button',{name:'3D overview',exact:true}).click();
  await expect(page.locator('#scale')).toBeHidden();
  await page.getByRole('button',{name:'Restore 1×',exact:true}).click();
  await expect(slider).toHaveValue('1');
});

test('pile keyboard selection and CSV download use the same historical dataset',async({page})=>{
  await open(page);
  const first=page.getByRole('button',{name:/Stockpile 1, estimated/});await first.focus();await first.press('Enter');
  await expect(first).toHaveAttribute('aria-pressed','true');
  await expect(page.locator('#selection')).toBeVisible();
  const downloadPromise=page.waitForEvent('download');
  await page.getByRole('button',{name:'Download pile CSV',exact:true}).click();
  const download=await downloadPromise;expect(download.suggestedFilename()).toBe('red-hill-stockpiles-2020.csv');
  const stream=await download.createReadStream();let csv='';for await(const chunk of stream)csv+=chunk;
  const rows=csv.trim().split(/\r?\n/);expect(rows).toHaveLength(31);
  expect(rows[0]).toContain('survey_year');expect(rows[1]).toContain('14403.6');
  expect(rows[1]).toContain('estimated_above_computed_pad');expect(rows[1]).toContain('2020');
  const canvas=page.locator('canvas');await canvas.focus();await canvas.press('t');
  await expect(page.locator('#scale')).toBeVisible();await canvas.press('Home');await expect(page.locator('#scale')).toBeHidden();
});

test('mobile starts with useful model space and reachable touch controls',async({browser},testInfo)=>{
  const context=await browser.newContext({baseURL:'http://127.0.0.1:8765',viewport:{width:390,height:844},deviceScaleFactor:1,hasTouch:true,isMobile:true});
  const page=await context.newPage();await open(page);
  await expect(page.locator('#inspector')).not.toHaveAttribute('open');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);
  for(const id of ['overview','top-view','zoom-in','zoom-out','measure-toggle','help-toggle']){
    const box=await page.locator('#'+id).boundingBox();expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x+box.width).toBeLessThanOrEqual(391);expect(box.height).toBeGreaterThanOrEqual(44);
  }
  await page.getByRole('button',{name:'Plan',exact:true}).tap();await expect(page.locator('#scale')).toBeVisible();
  await page.locator('#inspector>summary').tap();await expect(page.locator('#inspector')).toHaveAttribute('open','');
  await page.getByRole('button',{name:/Stockpile 1, estimated/}).tap();
  await expect(page.locator('#selection')).toBeVisible();await screenshot(page,testInfo,'mobile-stockpile');
  await context.close();
});

test('dependency failure provides recovery and readable survey data',async({page},testInfo)=>{
  await page.route('https://cdn.jsdelivr.net/**',route=>route.abort());
  await page.route('https://fonts.googleapis.com/**',route=>route.fulfill({body:'',contentType:'text/css'}));
  await page.goto('/');await expect(page.getByRole('heading',{name:'3D viewer unavailable'})).toBeVisible();
  await expect(page.getByRole('button',{name:'Reload viewer'})).toBeVisible();
  await page.getByText('Read the 2020 stockpile snapshot without 3D',{exact:true}).click();
  await expect(page.locator('#load tbody tr')).toHaveCount(30);await screenshot(page,testInfo,'startup-fallback');
});

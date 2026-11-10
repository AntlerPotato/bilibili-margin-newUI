import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { installMocks } from './mocks.mjs';
const out=resolve('delivery/dynamic-composer-extension');mkdirSync(out,{recursive:true});
const ext=resolve('dist'),checks=[],errors=[],posts=[];let loads=0;
const ctx=await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(),'margin-composer-')),{channel:'chromium',headless:true,viewport:{width:1440,height:1000},args:[`--disable-extensions-except=${ext}`,`--load-extension=${ext}`]});
try{
 await installMocks(ctx,url=>{
  if(url.includes('/feed/all'))loads++;
  if(url.includes('upload_bfs'))return {code:0,data:{image_url:'https://i0.hdslb.com/bfs/mock/a.png',image_width:100,image_height:100}};
  if(url.includes('create/dyn'))return {code:0,data:{dyn_id_str:'123456789'}};
 });
 await ctx.addCookies([{name:'bili_jct',value:'fixture-only',domain:'.bilibili.com',path:'/'}]);
 const worker=ctx.serviceWorkers()[0]||await ctx.waitForEvent('serviceworker');await worker.evaluate(()=>chrome.storage.local.set({'margin:settings':{intro:false,theme:'dark',glass:'liquid',bg:{mode:'off'}}}));
 const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.method()==='POST')posts.push({url:r.url(),body:r.postData()});});
 await page.goto('https://t.bilibili.com/');await page.locator('.fd-list .dy').first().waitFor();
 const before=loads;await page.getByRole('button',{name:'发动态',exact:true}).click();await page.getByRole('textbox',{name:'动态内容'}).fill('扩展内发布验证');
 assert.equal(page.url(),'https://t.bilibili.com/');checks.push('real built feed button opens in-app editor without margin=off navigation');
 await page.getByLabel('添加动态图片').setInputFiles({name:'test.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jC1sAAAAASUVORK5CYII=','base64')});
 await page.waitForTimeout(500);await page.screenshot({path:join(out,'dark.png')});
 assert.equal(posts.length,0);checks.push('real extension previews attachments without uploading');
 const bounds=await page.getByRole('dialog',{name:'发动态',exact:true}).boundingBox();assert(bounds.x>=0&&bounds.x+bounds.width<=1440);checks.push('settled editor fits viewport');
 await page.getByRole('button',{name:'发布',exact:true}).click();await page.getByText('动态已发布',{exact:true}).waitFor();
 assert.equal(posts.filter(p=>p.url.includes('upload_bfs')).length,1);assert.equal(posts.filter(p=>p.url.includes('create/dyn')).length,1);
 const payload=JSON.parse(posts.find(p=>p.url.includes('create/dyn')).body);assert.equal(payload.dyn_req.scene,2);assert.equal(payload.dyn_req.pics.length,1);assert.equal(payload.dyn_req.content.contents[0].raw_text,'扩展内发布验证');checks.push('one sequential upload followed by one image-post request with actual source payload');
 await page.waitForTimeout(300);assert(loads>before);assert.equal(page.url(),'https://t.bilibili.com/');checks.push('success refreshes feed in place');
 assert.deepEqual(errors,[]);checks.push('no extension page errors');console.log(JSON.stringify({passed:checks.length}));
}finally{writeFileSync(join(out,'report.json'),JSON.stringify({passed:checks.length,checks,errors,scope:'Installed dist in isolated Chromium; every HTTP request fulfilled locally. No real dynamic published.'},null,2));await ctx.close();}

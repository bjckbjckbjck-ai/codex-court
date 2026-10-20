import { chromium } from 'playwright';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=path.resolve(process.argv[2]||'.local/releases/codex-court-1.2.0-win-x64');
const temp=await mkdtemp(path.join(os.tmpdir(),'court-release-test-'));
const base='http://127.0.0.1:4517';
const results=path.resolve('test-results');await mkdir(results,{recursive:true});
assert.equal((await readdir(root)).includes('.local'),false,'Release contains user data');
const setup=execFileSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(root,'scripts/setup.ps1'),'-PrepareOnly'],{cwd:root,windowsHide:true,encoding:'utf8'});
assert.match(setup,/v24\.22\.0/);
const server=spawn(path.join(root,'runtime/node.exe'),[path.join(root,'server/index.mjs')],{cwd:root,env:{...process.env,PORT:'4517',COURT_TEST_MODE:'1',COURT_BUNDLED_MUSIC:'1',DATA_FILE:path.join(temp,'isolated.json')},windowsHide:true,stdio:['ignore','pipe','pipe']});
let log='',context;server.stdout.on('data',b=>log+=b);server.stderr.on('data',b=>log+=b);
const reports=[];
try{
  for(let n=0;n<80;n++){try{if((await fetch(base+'/api/health')).ok)break;}catch{}if(n===79)throw new Error('Release server unavailable: '+log);await new Promise(r=>setTimeout(r,100));}
  const boot=await(await fetch(base+'/api/bootstrap')).json();
  const library=await(await fetch(base+'/api/music',{headers:{'X-Court-Token':boot.token}})).json();
  assert.equal(library.tracks.length,8);assert.equal(library.settings.bindings.length,8);assert.equal(library.settings.version,'逆转裁判 4');assert.equal(library.settings.enabled,true);
  for(const [name,exe] of [['chrome','C:/Program Files/Google/Chrome/Application/chrome.exe'],['edge','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe']]){
    const errors=[];context=await chromium.launchPersistentContext(path.join(temp,name),{executablePath:exe,headless:true,viewport:{width:1512,height:1000},locale:'zh-CN',args:['--mute-audio','--no-first-run','--no-default-browser-check']});
    const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    await page.goto(base);await page.getByText('欢迎来到，你的辩证法庭。').waitFor();
    await page.getByRole('button',{name:/练习庭 · 第一次异议/}).click();
    await page.getByText('登录状态丢失是浏览器缓存导致的，清除缓存就能解决。',{exact:true}).waitFor();
    await page.screenshot({path:path.join(results,`${name}-release-court.png`),fullPage:true});
    await page.getByRole('button',{name:'客户端设置',exact:true}).click();
    await page.getByRole('tab',{name:'背景音乐',exact:true}).click();
    const tracks=[];
    for(const track of library.tracks){
      await page.getByRole('button',{name:`试听曲目：${track.title}`,exact:true}).click();
      await page.waitForFunction(id=>{const a=document.querySelector('audio');return a?.dataset.trackId===id&&!a.paused&&a.currentTime>.12&&Number.isFinite(a.duration)&&a.duration>1;},track.id,{timeout:15000});
      tracks.push({title:track.title,duration:await page.locator('audio').evaluate(a=>a.duration)});
    }
    await page.screenshot({path:path.join(results,`${name}-release-music.png`),fullPage:true});
    assert.deepEqual(errors,[]);reports.push({browser:name,tracks,consoleErrors:errors});
    await context.close();context=null;
  }
  await writeFile(path.join(results,'release-report.json'),JSON.stringify({passed:true,portableRuntime:'24.22.0',defaultVersion:library.settings.version,reports},null,2));
  console.log(JSON.stringify({passed:true,browsers:reports.length,decodedTracksPerBrowser:8}));
}finally{
  if(context)await context.close();server.kill();await new Promise(resolve=>server.exitCode!==null?resolve():server.once('exit',resolve));
  assert.ok(path.basename(temp).startsWith('court-release-test-'));await rm(temp,{recursive:true,force:true});
}

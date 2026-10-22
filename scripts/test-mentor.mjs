import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import {mkdtemp,mkdir,rm,writeFile} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
const root=process.cwd(),temp=await mkdtemp(path.join(os.tmpdir(),'court-mentor-browser-')),results=path.join(root,'test-results'),base='http://127.0.0.1:4617';
await mkdir(results,{recursive:true});
const server=spawn(process.execPath,['server/index.mjs'],{cwd:root,env:{...process.env,PORT:'4617',COURT_TEST_MODE:'1',COURT_BUNDLED_MUSIC:'1',DATA_FILE:path.join(temp,'court.json')},windowsHide:true,stdio:['ignore','pipe','pipe']});
let log='',context;server.stdout.on('data',b=>log+=b);server.stderr.on('data',b=>log+=b);
const reports=[];
function wave(){const rate=8000,b=Buffer.alloc(44+rate*2*4);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(rate,24);b.writeUInt32LE(rate*2,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(b.length-44,40);for(let i=0;i<rate*4;i++)b.writeInt16LE(Math.round(Math.sin(i/rate*330*Math.PI*2)*500),44+i*2);return b;}
try{
  for(let i=0;i<80;i++){try{if((await fetch(base+'/api/health')).ok)break;}catch{}if(i===79)throw new Error(log);await new Promise(r=>setTimeout(r,100));}
  const boot=await(await fetch(base+'/api/bootstrap')).json();
  const api=async(p,opts={})=>{const r=await fetch(base+'/api'+p,{...opts,headers:{'X-Court-Token':boot.token,'Content-Type':'application/json',...opts.headers}});assert.ok(r.ok,`${p}: ${r.status}`);return r.json();};
  assert.equal((await fetch(base+'/api/mentor/sessions',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,401);
  const fast=await api('/music/tracks?name='+encodeURIComponent('询问（快）测试.wav')+'&version='+encodeURIComponent('逆转裁判 4')+'&assign=true',{method:'POST',headers:{'Content-Type':'application/octet-stream'},body:wave()});
  const slowId=fast.settings.bindings.find(b=>b.phase==='questioning').trackId,fastId=fast.settings.bindings.find(b=>b.phase==='questioning_fast').trackId,logicId=fast.settings.bindings.find(b=>b.phase==='logic').trackId;
  assert.notEqual(slowId,fastId);
  for(const [name,executablePath] of [['chrome','C:/Program Files/Google/Chrome/Application/chrome.exe'],['edge','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe']]){
    const errors=[];context=await chromium.launchPersistentContext(path.join(temp,name),{executablePath,headless:true,viewport:{width:1512,height:1000},locale:'zh-CN',args:['--mute-audio','--no-first-run','--no-default-browser-check']});
    const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    await page.goto(base+'/?thread=training');await page.locator('.evidence-content').first().waitFor();
    await page.getByRole('button',{name:/选中证言：.*登录状态丢失/}).click();
    await page.waitForFunction(id=>document.querySelector('audio')?.dataset.trackId===id,slowId);
    await page.getByRole('button',{name:'关键追问',exact:true}).click();await page.waitForFunction(id=>{const a=document.querySelector('audio');return a.dataset.trackId===id&&!a.paused&&a.currentTime>.1;},fastId);
    await page.locator('.evidence-content').first().click();await page.getByTestId('evidence-center').waitFor();
    await page.waitForFunction(id=>document.querySelector('audio')?.dataset.trackId===id,logicId);
    await page.getByRole('textbox',{name:'查找证据内容'}).fill('401');assert.ok(await page.locator('.evidence-inspect-surface mark').count()>0);
    await page.getByRole('button',{name:'放大证据',exact:true}).click();assert.equal(await page.locator('.evidence-inspect-toolbar output').textContent(),'115%');
    await page.screenshot({path:path.join(results,`${name}-evidence-center.png`),fullPage:true});
    await page.getByRole('button',{name:'关闭对话框',exact:true}).click();await page.waitForFunction(id=>document.querySelector('audio')?.dataset.trackId===id,fastId);
    // Focus music must respect explicit pause and manual-music preferences.
    await page.getByRole('button',{name:'背景音乐设置',exact:true}).click();
    await page.getByRole('button',{name:'暂停背景音乐',exact:true}).click();
    await page.getByRole('button',{name:'关闭对话框',exact:true}).click();await page.locator('.evidence-content').first().click();
    assert.equal(await page.locator('audio').evaluate(a=>a.paused),true);
    await page.getByRole('button',{name:'关闭对话框',exact:true}).click();assert.equal(await page.locator('audio').evaluate(a=>a.paused),true);
    await page.getByRole('button',{name:'背景音乐设置',exact:true}).click();await page.getByRole('button',{name:'播放背景音乐',exact:true}).click();
    await page.getByLabel('随庭审自动切换',{exact:true}).click();await page.waitForFunction(()=>!document.querySelector('.auto-music input').checked);await page.getByRole('button',{name:'关闭对话框',exact:true}).click();
    await page.locator('.evidence-content').first().click();assert.equal(await page.locator('audio').getAttribute('data-phase'),'questioning_fast');
    await page.getByRole('button',{name:'关闭对话框',exact:true}).click();await page.getByRole('button',{name:'背景音乐设置',exact:true}).click();await page.getByLabel('随庭审自动切换',{exact:true}).click();await page.waitForFunction(()=>document.querySelector('.auto-music input').checked);await page.getByRole('button',{name:'关闭对话框',exact:true}).click();
    const before=(await api('/cases/training')).turns.length;
    await page.getByRole('button',{name:'请导师解释选句',exact:true}).click();
    const panel=page.getByRole('region',{name:'成步堂导师',exact:true});await panel.getByText('本地教学示范',{exact:false}).first().waitFor();
    await page.waitForFunction(id=>document.querySelector('audio')?.dataset.trackId===id,logicId);
    await panel.getByRole('textbox',{name:'向导师提问',exact:true}).fill('项目里的状态机是什么？我还没有基础。');
    await panel.getByRole('button',{name:'请导师讲解',exact:true}).click();
    await panel.getByRole('button',{name:'整理成知识卡',exact:true}).last().waitFor();
    await panel.getByText('你觉得“网络请求还没回来”应该属于哪个状态？',{exact:false}).last().waitFor();
    assert.equal((await api('/cases/training')).turns.length,before,'Teaching must not add messages to the source case');
    await page.screenshot({path:path.join(results,`${name}-mentor-teaching.png`),fullPage:true});
    await panel.getByRole('button',{name:'只给提示',exact:true}).click();await panel.getByRole('textbox',{name:'向导师提问',exact:true}).fill('再给我一点提示');
    await panel.getByRole('button',{name:'请导师讲解',exact:true}).click();await panel.getByText('先不揭晓答案。',{exact:false}).last().waitFor();await panel.getByRole('button',{name:'暂停讲解',exact:false}).waitFor({state:'hidden'});
    await panel.getByRole('button',{name:'整理成知识卡',exact:true}).first().click();
    await panel.getByRole('textbox',{name:'知识卡标题'}).fill(`${name} · 状态机`);await panel.getByRole('textbox',{name:'知识卡内容'}).fill('状态：现在在哪一步。事件：发生了什么。转移：接着去哪。');await panel.getByRole('button',{name:'保存知识卡',exact:true}).click();
    const card=panel.locator('.knowledge-card').filter({has:page.getByRole('heading',{name:`${name} · 状态机`,exact:true})});
    await card.getByRole('button',{name:/先试着回忆/}).click();await card.getByRole('button',{name:'我记住了',exact:true}).click();await card.getByText('已掌握',{exact:true}).waitFor();
    await page.screenshot({path:path.join(results,`${name}-mentor-cards.png`),fullPage:true});
    await page.reload();await page.getByRole('button',{name:'成步堂导师',exact:true}).click();await panel.getByRole('tab',{name:/知识卡/}).click();await panel.getByRole('heading',{name:`${name} · 状态机`,exact:true}).waitFor();
    await panel.getByRole('tab',{name:'一起理解',exact:true}).click();await panel.getByRole('button',{name:'学习偏好',exact:true}).click();await panel.getByRole('combobox',{name:'学习基础'}).selectOption('familiar');await panel.getByRole('textbox',{name:'学习目标'}).fill('理解登录状态转移');await panel.getByRole('button',{name:'保存学习偏好'}).click();
    await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(results,`${name}-mentor-mobile.png`),fullPage:true});
    assert.equal(await panel.evaluate(el=>el.getBoundingClientRect().right<=innerWidth&&el.scrollWidth<=el.clientWidth),true);
    await panel.getByRole('button',{name:'收起导师',exact:true}).click();await page.getByRole('button',{name:'展开案件档案',exact:true}).click();await page.getByRole('button',{name:'异议 首页',exact:true}).click();await page.getByRole('button',{name:'成步堂导师',exact:true}).click();await panel.getByRole('tab',{name:/知识卡/}).click();assert.equal(await panel.getByRole('heading',{name:`${name} · 状态机`,exact:true}).count(),0,'General learning uses a separate card archive');
    assert.deepEqual(errors,[]);reports.push({browser:name,teaching:true,hints:true,knowledgePersistence:true,sourceIsolation:true,fastSlowAudio:true,evidenceLogicRestore:true,mobile:true,errors});
    await context.close();context=null;
  }
  await writeFile(path.join(results,'mentor-report.json'),JSON.stringify({passed:true,reports},null,2));console.log(JSON.stringify({passed:true,reports},null,2));
}finally{
  if(context)await context.close();server.kill();await new Promise(r=>server.exitCode!==null?r():server.once('exit',r));assert.ok(path.basename(temp).startsWith('court-mentor-browser-'));await rm(temp,{recursive:true,force:true});
}

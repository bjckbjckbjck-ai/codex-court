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
    const saved=await api('/mentor/sessions',{method:'POST',body:JSON.stringify({sourceId:'training'})});
    const card=await api(`/mentor/sessions/${saved.session.id}/cards`,{method:'POST',body:JSON.stringify({title:`${name} existing card`,content:'Keep this learning record.',status:'learning'})});
    await page.getByRole('button',{name:'请导师解释选句',exact:true}).click();
    const panel=page.getByRole('region',{name:'成步堂导师',exact:true}),bubble=panel.locator('.mentor-bubble'),actor=panel.getByRole('button',{name:'成步堂助手，点击对话，拖动移动',exact:true});
    await panel.getByText('本地教学示范',{exact:true}).waitFor();
    assert.equal(await panel.getByRole('tab').count(),0,'The assistant has no complicated tabbed workspace');
    assert.equal(await api(`/mentor/sessions/${saved.session.id}`).then(r=>r.turns.length),saved.turns.length,'Opening the assistant must not send a model turn');
    assert.equal(await page.evaluate(()=>{const a=document.querySelector('.mentor-bubble').getBoundingClientRect(),b=document.querySelector('.record-panel').getBoundingClientRect();return a.right<=b.left||a.bottom<=b.top||a.top>=b.bottom;}),true,'Default speech bubble must leave the evidence sidebar clear');
    await page.waitForFunction(id=>document.querySelector('audio')?.dataset.trackId===id,logicId);
    await panel.getByRole('textbox',{name:'向导师提问',exact:true}).fill('项目里的状态机是什么？我还没有基础。');
    await panel.getByRole('button',{name:'请导师讲解',exact:true}).click();
    await panel.getByText('你觉得“网络请求还没回来”应该属于哪个状态？',{exact:false}).waitFor();await panel.getByRole('button',{name:'暂停',exact:true}).waitFor({state:'hidden'});
    assert.equal((await api('/cases/training')).turns.length,before,'Teaching must not add messages to the source case');
    await panel.locator('.mentor-speech').evaluate(el=>el.scrollTop=0);
    await page.screenshot({path:path.join(results,`${name}-mentor-teaching.png`),fullPage:true});
    // Evidence remains clickable while the assistant is open, and gets the full stage.
    await page.locator('.evidence-content').first().click();await page.getByTestId('evidence-center').waitFor();assert.equal(await panel.count(),0);
    await page.screenshot({path:path.join(results,`${name}-mentor-evidence-clear.png`),fullPage:true,animations:'disabled'});
    await page.getByRole('button',{name:'关闭对话框',exact:true}).click();await bubble.waitFor();
    await panel.getByRole('textbox',{name:'向导师提问',exact:true}).fill('保留这个未发送的问题');
    await panel.getByRole('button',{name:'继续提示',exact:true}).click();await panel.getByText('先不揭晓答案。',{exact:false}).waitFor();await panel.getByRole('button',{name:'暂停',exact:true}).waitFor({state:'hidden'});
    assert.equal(await panel.getByRole('textbox',{name:'向导师提问',exact:true}).inputValue(),'保留这个未发送的问题');
    await panel.getByRole('button',{name:'收起导师对话',exact:true}).click();await bubble.waitFor({state:'hidden'});
    await page.waitForFunction(id=>document.querySelector('audio')?.dataset.trackId===id,fastId);
    assert.equal(await actor.isVisible(),true);
    // Existing code approvals/history remain scoped, and a new response opens one bubble.
    await api(`/mentor/sessions/${saved.session.id}/turn`,{method:'POST',body:JSON.stringify({text:'给一点提示',mode:'hint'})});
    await bubble.waitFor();await panel.getByRole('button',{name:'暂停',exact:true}).waitFor({state:'hidden'});
    await page.keyboard.press('Escape');await bubble.waitFor({state:'hidden'});
    await page.getByRole('button',{name:'请导师解释选句',exact:true}).click();await bubble.waitFor();
    assert.equal(await panel.getByRole('textbox',{name:'向导师提问',exact:true}).inputValue(),'保留这个未发送的问题');
    // Dragging moves the actor, remembers the position, and must not toggle its bubble.
    let p=await actor.boundingBox();await page.mouse.move(p.x+p.width/2,p.y+55);await page.mouse.down();await page.mouse.move(p.x+p.width/2+230,p.y-80,{steps:12});await page.mouse.up();
    const moved=await actor.boundingBox();assert.ok(moved.x-p.x>200);assert.equal(await actor.getAttribute('aria-expanded'),'true');
    const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('court:mentor-position')));assert.equal(Math.round(stored.x),Math.round(moved.x));
    await actor.focus();await page.keyboard.press('ArrowRight');p=await actor.boundingBox();assert.equal(Math.round(p.x-moved.x),12);
    await page.reload();await page.getByRole('button',{name:'成步堂导师',exact:true}).click();await panel.getByText('先不揭晓答案。',{exact:false}).waitFor();
    assert.equal(Math.round((await actor.boundingBox()).x),Math.round(p.x));
    assert.ok((await api(`/mentor/sessions/${saved.session.id}`)).session.cards.some(c=>c.id===card.id),'Simplifying the UI must retain old cards');
    const assertInside=async()=>{await page.waitForFunction(()=>[...document.querySelectorAll('.mentor-actor-wrap,.mentor-bubble')].every(x=>{const r=x.getBoundingClientRect();return r.left>=0&&r.top>=0&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1;}),null,{timeout:3000});};
    // Edges, resizing and mobile placement must leave the controls usable.
    p=await actor.boundingBox();await page.mouse.move(p.x+50,p.y+55);await page.mouse.down();await page.mouse.move(1510,998,{steps:10});await page.mouse.up();await assertInside();
    await page.setViewportSize({width:390,height:844});await assertInside();await page.screenshot({path:path.join(results,`${name}-mentor-mobile.png`),fullPage:true});
    await page.setViewportSize({width:390,height:420});await assertInside();await panel.getByRole('button',{name:'收起导师对话',exact:true}).click();await actor.click();await assertInside();
    await page.setViewportSize({width:390,height:844});await panel.getByRole('button',{name:'关闭导师助手',exact:true}).click();
    await page.getByRole('button',{name:'展开案件档案',exact:true}).click();await page.getByRole('button',{name:'异议 首页',exact:true}).click();await page.getByRole('button',{name:'成步堂导师',exact:true}).click();
    await panel.getByText('把不懂的词或卡住的地方告诉我，',{exact:false}).waitFor();assert.equal(await panel.locator('.mentor-answer').count(),0,'General learning must not show source-case answers');
    assert.deepEqual(errors,[]);reports.push({browser:name,compactAssistant:true,dragAndRemember:true,keyboardMove:true,edgeAndMobileBounds:true,evidenceUnobstructed:true,teaching:true,hints:true,replyBubble:true,draftPreserved:true,oldCardsRetained:true,sourceIsolation:true,fastSlowAudio:true,focusMusicRestore:true,errors});
    await context.close();context=null;
  }
  await writeFile(path.join(results,'mentor-report.json'),JSON.stringify({passed:true,reports},null,2));console.log(JSON.stringify({passed:true,reports},null,2));
}finally{
  if(context)await context.close();server.kill();await new Promise(r=>server.exitCode!==null?r():server.once('exit',r));assert.ok(path.basename(temp).startsWith('court-mentor-browser-'));await rm(temp,{recursive:true,force:true});
}

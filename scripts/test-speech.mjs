import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import {mkdtemp,mkdir,rm,writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {pcmToWave,readPcmWave} from '../server/speech.mjs';

const root=path.resolve(process.argv[2]||process.cwd()),temp=await mkdtemp(path.join(os.tmpdir(),'court-speech-browser-')),results=path.join(process.cwd(),'test-results'),base='http://127.0.0.1:4717';
await mkdir(results,{recursive:true});
const pcm=Buffer.alloc(24000*4*2);for(let i=0;i<pcm.length/2;i++)pcm.writeInt16LE(Math.round(Math.sin(i/24000*Math.PI*660)*3000),i*2);const wav=pcmToWave(pcm,24000);
const requests=[];let delay=40;
const mock=http.createServer(async(req,res)=>{
  if(req.url==='/openapi.json'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({paths:{'/inference_zero_shot':{post:{}},'/inference_cross_lingual':{post:{}}}}));}
  const buffers=[];for await(const b of req)buffers.push(b);const form=await new Response(Buffer.concat(buffers),{headers:{'Content-Type':req.headers['content-type']}}).formData();
  const reference=Buffer.from(await form.get('prompt_wav').arrayBuffer());assert.ok(readPcmWave(reference).duration>=3);
  requests.push({text:form.get('tts_text'),transcript:form.get('prompt_text'),route:req.url});
  setTimeout(()=>{if(!res.destroyed){res.setHeader('Content-Type','application/octet-stream');res.end(pcm);}},delay);
});
await new Promise(r=>mock.listen(0,'127.0.0.1',r));const endpoint=`http://127.0.0.1:${mock.address().port}`;
const runtime=path.join(root,'runtime','node.exe');
const server=spawn(existsSync(runtime)?runtime:process.execPath,['server/index.mjs'],{cwd:root,env:{...process.env,PORT:'4717',COURT_TEST_MODE:'1',COURT_BUNDLED_MUSIC:'1',DATA_FILE:path.join(temp,'court.json')},windowsHide:true,stdio:['ignore','pipe','pipe']});
let log='',context;server.stdout.on('data',b=>log+=b);server.stderr.on('data',b=>log+=b);const reports=[];
try{
  for(let i=0;i<80;i++){try{if((await fetch(base+'/api/health')).ok)break;}catch{}if(i===79)throw new Error(log);await new Promise(r=>setTimeout(r,100));}
  const boot=await(await fetch(base+'/api/bootstrap')).json(),api=async(url,method='GET',body)=>{const r=await fetch(base+'/api'+url,{method,headers:{'X-Court-Token':boot.token,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});assert.ok(r.ok,`${url}: ${r.status}`);return r.json();};
  assert.equal((await fetch(base+'/api/speech')).status,401);
  assert.equal((await fetch(base+'/api/speech/voices',{method:'POST',headers:{Origin:'https://elsewhere.example','X-Court-Token':boot.token}})).status,403);
  for(const [name,executablePath] of [['chrome','C:/Program Files/Google/Chrome/Application/chrome.exe'],['edge','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe']]){
    for(const v of (await api('/speech')).voices)await api('/speech/voices/'+v.id,'DELETE');
    await api('/speech/settings','PATCH',{engine:'cosyvoice3',endpoint:'http://127.0.0.1:50000',rate:1,volume:1});
    context=await chromium.launchPersistentContext(path.join(temp,name),{executablePath,headless:true,viewport:{width:1512,height:1000},locale:'zh-CN',args:['--mute-audio','--no-first-run','--no-default-browser-check']});
    const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    await page.goto(base+'/?thread=training');await page.getByRole('button',{name:/选中证言：.*登录状态丢失/}).click();await page.waitForFunction(()=>{const a=document.querySelector('.court-audio');return a&&!a.paused&&a.currentTime>.1;});
    const originalTurns=(await api('/cases/training')).turns.length;
    await page.getByRole('button',{name:'客户端设置',exact:true}).click();await page.getByRole('tab',{name:'角色音色',exact:true}).click();await page.getByText('音色库暂时是空的',{exact:true}).waitFor();
    await page.screenshot({path:path.join(results,`${name}-voice-empty.png`),fullPage:true,animations:'disabled'});
    await page.getByRole('button',{name:'导入第一个角色',exact:true}).click();await page.getByRole('textbox',{name:'角色音色名称',exact:true}).fill(`${name} · 测试角色`);
    await page.getByLabel('角色参考音频',{exact:true}).setInputFiles({name:'protocol-test.wav',mimeType:'audio/wav',buffer:wav});await page.getByRole('textbox',{name:'角色参考台词',exact:true}).fill('别急，我们一起找出关键线索。');await page.getByRole('button',{name:'保存角色音色',exact:true}).click();await page.locator('.voice-card.chosen').waitFor();
    let library=await api('/speech');assert.equal(library.voices.length,1);const id=library.voices[0].id;
    assert.equal((await fetch(`${base}/api/speech/voices/${id}/audio`)).status,401);
    await page.getByRole('button',{name:`编辑音色：${name} · 测试角色`,exact:true}).click();await page.getByRole('textbox',{name:'角色音色名称',exact:true}).fill(`${name} · 中文导师`);await page.getByRole('button',{name:'保存角色音色',exact:true}).click();await page.getByText(`${name} · 中文导师`,{exact:true}).waitFor();
    await page.getByLabel('本地语音服务地址',{exact:true}).fill(endpoint);await page.getByLabel('朗读语速',{exact:true}).press('End');for(let i=0;i<3;i++)await page.getByLabel('朗读语速',{exact:true}).press('ArrowLeft');await page.getByLabel('朗读音量',{exact:true}).press('End');for(let i=0;i<6;i++)await page.getByLabel('朗读音量',{exact:true}).press('ArrowLeft');
    await page.getByRole('button',{name:'保存并检测语音设置',exact:true}).click();await page.getByText('本地 CosyVoice 兼容服务已连接',{exact:true}).waitFor();
    await page.getByRole('button',{name:'用当前音色试听',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.speech-audio').currentTime>.1);
    assert.equal(await page.locator('.speech-audio').evaluate(a=>a.playbackRate),1.2);assert.ok(Math.abs(await page.locator('.speech-audio').evaluate(a=>a.volume)-.7)<.01);
    await page.waitForFunction(()=>document.querySelector('.court-audio').volume<.1);
    await page.getByRole('button',{name:'暂停朗读',exact:true}).click();assert.equal(await page.locator('.speech-audio').evaluate(a=>a.paused),true);await page.waitForFunction(()=>document.querySelector('.court-audio').volume>.3);
    await page.getByRole('button',{name:'继续朗读',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('.speech-audio').paused);await page.getByRole('button',{name:'停止朗读',exact:true}).click();
    await page.getByRole('textbox',{name:'音色试听文本',exact:true}).fill('第一条线索。第二条线索。');const chunkStart=requests.length;await page.getByRole('button',{name:'用当前音色试听',exact:true}).click();await page.getByRole('button',{name:'关闭朗读提示',exact:true}).waitFor();assert.deepEqual(requests.slice(chunkStart).map(r=>r.text),['第一条线索。','第二条线索。']);await page.getByRole('button',{name:'关闭朗读提示',exact:true}).click();
    await page.locator('.voice-connection summary').click();await page.locator('.modal').evaluate(el=>el.scrollTop=0);
    await page.screenshot({path:path.join(results,`${name}-voice-library.png`),fullPage:true,animations:'disabled'});
    await page.getByRole('button',{name:'关闭对话框',exact:true}).click();
    await page.getByRole('button',{name:'朗读选句',exact:true}).click();await page.getByRole('button',{name:'暂停朗读',exact:true}).waitFor();assert.match(requests.at(-1).text,/登录状态丢失/);assert.equal(requests.at(-1).transcript,'You are a helpful assistant.<|endofprompt|>别急，我们一起找出关键线索。');
    await page.screenshot({path:path.join(results,`${name}-selection-speech.png`),fullPage:true,animations:'disabled'});await page.getByRole('button',{name:'停止朗读',exact:true}).click();
    async function selectText(selector){return page.locator(selector).first().evaluate(el=>{const range=document.createRange();range.selectNodeContents(el);const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);document.dispatchEvent(new Event('selectionchange'));return selection.toString().trim();});}
    const selected=await selectText('.statement p');await page.getByRole('button',{name:'朗读选中文本',exact:true}).click();await page.getByRole('button',{name:'暂停朗读',exact:true}).waitFor();assert.equal(requests.at(-1).text,selected);await page.getByRole('button',{name:'停止朗读',exact:true}).click();
    await page.getByRole('button',{name:'请导师解释选句',exact:true}).click();await page.getByRole('textbox',{name:'向导师提问',exact:true}).fill('解释状态机');await page.getByRole('button',{name:'请导师讲解',exact:true}).click();await page.locator('.mentor-answer').waitFor();await page.locator('.mentor-thinking').waitFor({state:'hidden'});const lessonText=await selectText('.mentor-answer p');await page.getByRole('button',{name:'朗读选中文本',exact:true}).click();await page.getByRole('button',{name:'暂停朗读',exact:true}).waitFor();assert.equal(requests.at(-1).text,lessonText);await page.getByRole('button',{name:'停止朗读',exact:true}).click();await page.getByRole('button',{name:'关闭导师助手',exact:true}).click();
    // The selection control and player must also work inside the native evidence dialog.
    await page.locator('.evidence-content').first().click();await page.getByTestId('evidence-center').waitFor();await selectText('.evidence-inspect-surface pre');await page.getByRole('button',{name:'朗读选中文本',exact:true}).click();await page.getByRole('button',{name:'暂停朗读',exact:true}).waitFor();await page.getByRole('button',{name:'停止朗读',exact:true}).click();await page.getByRole('button',{name:'关闭对话框',exact:true}).click();
    delay=900;await page.getByRole('button',{name:'朗读选句',exact:true}).click();await page.getByRole('button',{name:'停止朗读',exact:true}).click();await page.waitForTimeout(1100);assert.equal(await page.locator('.speech-audio').evaluate(a=>a.paused&&!a.getAttribute('src')),true,'Stopped generation must not start late playback');delay=40;
    await page.reload();await page.getByRole('button',{name:'客户端设置',exact:true}).click();await page.getByRole('tab',{name:'角色音色',exact:true}).click();await page.getByText(`${name} · 中文导师`,{exact:true}).waitFor();library=await api('/speech');assert.equal(library.settings.voiceId,id);assert.equal(library.settings.rate,1.2);
    await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(results,`${name}-voice-mobile.png`),fullPage:true,animations:'disabled'});assert.equal(await page.locator('.modal').evaluate(el=>el.scrollWidth<=el.clientWidth+1),true);
    await page.getByRole('button',{name:`删除音色：${name} · 中文导师`,exact:true}).click();await page.getByRole('button',{name:'确认删除',exact:true}).click();await page.getByText('音色库暂时是空的',{exact:true}).waitFor();assert.equal((await api('/speech')).settings.voiceId,null);
    assert.equal((await api('/cases/training')).turns.length,originalTurns);assert.deepEqual(errors,[]);reports.push({browser:name,voiceImportAndEdit:true,voicePersistence:true,referencePrivacy:true,selectedText:true,evidenceSelection:true,decodedAudio:true,pauseResumeStop:true,cancelLatePlayback:true,bgmDucking:true,mobile:true,model:'isolated protocol fixture; no similarity claim',errors});await context.close();context=null;
  }
  await writeFile(path.join(results,'speech-report.json'),JSON.stringify({passed:true,reports},null,2));console.log(JSON.stringify({passed:true,reports},null,2));
}finally{
  if(context)await context.close();server.kill();await new Promise(r=>server.exitCode!==null?r():server.once('exit',r));mock.closeAllConnections();await new Promise(r=>mock.close(r));assert.ok(path.basename(temp).startsWith('court-speech-browser-'));await rm(temp,{recursive:true,force:true});
}

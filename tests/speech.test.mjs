import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import {SpeechStore,localSpeechEndpoint,pcmToWave,readPcmWave} from '../server/speech.mjs';
import {speechChunks} from '../shared/speech.mjs';

function reference(seconds=4){const pcm=Buffer.alloc(24000*seconds*2);for(let i=0;i<pcm.length/2;i++)pcm.writeInt16LE(Math.round(Math.sin(i*2*Math.PI*330/24000)*5000),i*2);return pcmToWave(pcm,24000);}
async function fixture(t){const dir=await mkdtemp(path.join(os.tmpdir(),'court-speech-unit-'));t.after(()=>rm(dir,{recursive:true,force:true}));return new SpeechStore(dir).load();}
test('Chinese speech chunks preserve characters and split at sentence boundaries',()=>{
  const text='先找出关键。再检查状态！';assert.deepEqual(speechChunks(text),['先找出关键。','再检查状态！']);
  const parts=speechChunks('中文😀'.repeat(200));assert.equal(parts.join(''),'中文😀'.repeat(200));assert.ok(parts.every(p=>[...p].length<=180));assert.throws(()=>speechChunks('字'.repeat(5001)),/5000/);
});
test('speech endpoints are restricted to literal loopback hosts without redirects or secrets',()=>{
  assert.equal(localSpeechEndpoint('http://localhost:50000/'),'http://127.0.0.1:50000');
  for(const input of ['https://example.com','http://192.168.1.2:50000','http://127.0.0.1.example.com','http://localhost:50000/private','file:///tmp/test','http://localhost:50000/?x=1'])assert.throws(()=>localSpeechEndpoint(input));
  const credentials=new URL('http://127.0.0.1:50000');credentials.username='test-user';credentials.password='test-password';assert.throws(()=>localSpeechEndpoint(credentials));
});
test('voice references persist independently, can be edited, and deletion clears the chosen role',async t=>{
  const store=await fixture(t),wav=reference();let library=await store.add({name:'测试角色',transcript:'先找出关键线索。',audio:wav.toString('base64')});const voice=library.voices[0];assert.equal(voice.duration,4);assert.equal(library.settings.voiceId,voice.id);
  await store.edit(voice.id,{name:'沉稳导师',transcript:'慢慢来。'});await store.settings({rate:1.2,volume:0.65});const reopened=await new SpeechStore(store.directory).load();assert.equal(reopened.snapshot().voices[0].name,'沉稳导师');assert.equal(reopened.snapshot().settings.rate,1.2);assert.deepEqual(await reopened.audio(voice.id),wav);
  library=await reopened.remove(voice.id);assert.equal(library.settings.voiceId,null);assert.equal(library.voices.length,0);await assert.rejects(readFile(store.audioPath(voice.id)),{code:'ENOENT'});
});
test('invalid and silent references and corrupt voice archives do not replace existing data',async t=>{
  const store=await fixture(t);await assert.rejects(store.add({name:'empty',audio:reference().toString('base64')}),/台词/);await assert.rejects(store.add({name:'short',transcript:'太短',audio:reference(1).toString('base64')}),/3～30/);await assert.rejects(store.add({name:'silent',transcript:'无声',audio:pcmToWave(Buffer.alloc(24000*8),24000).toString('base64')}),/没有声音/);
  await store.add({name:'保存',mode:'cross_lingual',audio:reference().toString('base64')});const original=store.snapshot();await assert.rejects(store.settings({endpoint:'http://example.com'}));assert.deepEqual(store.snapshot(),original);await assert.rejects(store.edit('../escape',{name:'escape'}));
  await writeFile(store.file,'{corrupt');await assert.rejects(new SpeechStore(store.directory).load(),/原文件已保留/);assert.equal(await readFile(store.file,'utf8'),'{corrupt');
});
test('CosyVoice 3/2 protocol sends the chosen reference and returns browser-decodable WAV',async t=>{
  const store=await fixture(t),seen=[];let redirect=false,wavResponse=false;
  const server=http.createServer(async(req,res)=>{if(req.url==='/openapi.json'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({paths:{'/inference_zero_shot':{post:{}},'/inference_cross_lingual':{post:{}}}}));}const chunks=[];for await(const b of req)chunks.push(b);const form=await new Response(Buffer.concat(chunks),{headers:{'Content-Type':req.headers['content-type']}}).formData();seen.push({url:req.url,text:form.get('tts_text'),transcript:form.get('prompt_text'),audio:Buffer.from(await form.get('prompt_wav').arrayBuffer())});if(redirect){res.writeHead(302,{Location:'http://127.0.0.1:1/never-follow'});return res.end();}res.setHeader('Content-Type','application/octet-stream');res.end(wavResponse?reference(1):reference(1).subarray(44));});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>{server.closeAllConnections();server.close();});
  await store.add({name:'角色甲',transcript:'你好。',audio:reference().toString('base64')});await store.settings({endpoint:`http://127.0.0.1:${server.address().port}`});assert.equal((await store.status()).connected,true);
  const a=await store.synthesize({text:'中文朗读。'});assert.equal(readPcmWave(a).duration,1);assert.equal(seen[0].transcript,'You are a helpful assistant.<|endofprompt|>你好。');assert.deepEqual(seen[0].audio,reference());
  await store.edit(store.snapshot().settings.voiceId,{mode:'cross_lingual'});wavResponse=true;await store.synthesize({text:'跨语言中文。'});assert.equal(seen[1].url,'/inference_cross_lingual');assert.equal(seen[1].text,'You are a helpful assistant.<|endofprompt|>跨语言中文。');assert.equal(seen[1].transcript,null);
  await store.settings({engine:'cosyvoice2'});await store.edit(store.snapshot().settings.voiceId,{mode:'zero_shot'});await store.synthesize({text:'二代中文。'});assert.equal(seen[2].transcript,'你好。');
  await assert.rejects(store.synthesize({text:'取消。'},AbortSignal.abort()),/停止/);assert.equal(store.busy,false);
  redirect=true;await assert.rejects(store.synthesize({text:'不能重定向。'}),/无法生成/);assert.equal(store.busy,false);
});

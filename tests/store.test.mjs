import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { CaseStore, buildInput, validId } from '../server/store.mjs';

test('evidence and its fingerprint survive restart; old examination preserves the referenced evidence', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'codex-court-store-'));
  try {
    const file = path.join(dir,'records.json');
    const store = await new CaseStore(file).load();
    const evidence = await store.addEvidence('training', {title:'原始日志',content:'GET /me 401',source:'test.log'});
    assert.match(evidence.hash,/^[a-f0-9]{64}$/);
    await store.addExamination('training',{quote:{text:'缓存导致'},evidence:[{id:evidence.id,title:evidence.title,hash:evidence.hash}],turnId:'turn-1'});
    await store.finish('training','turn-1','completed');
    await store.removeEvidence('training',evidence.id);
    const reloaded = await new CaseStore(file).load();
    assert.equal(reloaded.get('training').evidence.length,0);
    assert.equal(reloaded.get('training').examinations[0].evidence[0].hash,evidence.hash);
    assert.equal(reloaded.get('training').examinations[0].status,'completed');
  } finally { await rm(dir,{recursive:true,force:true}); }
});

test('corrupt records are never silently replaced',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'codex-court-corrupt-'));
  try {const file=path.join(dir,'records.json');await writeFile(file,'incomplete json');await assert.rejects(()=>new CaseStore(file).load(),/停止写入/);assert.equal(await readFile(file,'utf8'),'incomplete json');}finally{await rm(dir,{recursive:true,force:true});}
});

test('objection includes exact quotation, stable source ids, evidence and explicit epistemic instructions',()=>{
  const input=buildInput({action:'object',text:'清除后仍复现',quote:{text:'清除缓存就能解决。',itemId:'msg1',turnId:'turn1'},evidence:[{title:'日志',kind:'text',source:'test.log',hash:'abc',content:'401 unauthorized'}]});
  assert.equal(input[0].type,'text');
  for(const part of ['清除缓存就能解决。','msg1','turn1','401 unauthorized','不要因用户提出异议而自动认错','待核实'])assert.ok(input[0].text.includes(part));
  assert.throws(()=>buildInput({action:'object'}),/选中/);
  assert.throws(()=>buildInput({text:''}),/输入/);
});

test('images are sent as image inputs, not silently converted to text',()=>{
  const evidence={title:'截图',kind:'image',source:'screen.png',hash:'abc',content:'data:image/png;base64,AAAA'};
  const input=buildInput({text:'检查这个截图',evidence:[evidence]});
  assert.equal(input[1].type,'image');assert.equal(input[1].url,evidence.content);assert.ok(!input[0].text.includes('base64'));
});

test('evidence store rejects unsafe ids, unsupported image formats and excessive payloads',async()=>{
  assert.equal(validId('../auth.json'),false);assert.equal(validId('__proto__'),false);
  assert.equal(validId('01a15743-f9b3-7202-bbec-ad6a4d6bd6c6'),true);
  const store=new CaseStore('not-written.json');
  await assert.rejects(()=>store.addEvidence('training',{title:'SVG',kind:'image',content:'data:image/svg+xml;base64,AAAA'}),/仅支持/);
  await assert.rejects(()=>store.addEvidence('training',{title:'long',content:'a'.repeat(200001)}),/过大/);
});

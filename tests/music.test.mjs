import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { MusicStore, audioType, byteRange } from '../server/music.mjs';
import { inferPhase, boundTrack } from '../shared/music.mjs';

function wave() { const bytes=Buffer.alloc(48);bytes.write('RIFF');bytes.writeUInt32LE(40,4);bytes.write('WAVEfmt ',8);bytes.writeUInt32LE(16,16);bytes.writeUInt16LE(1,20);bytes.writeUInt16LE(1,22);bytes.writeUInt32LE(8000,24);bytes.writeUInt32LE(16000,28);bytes.writeUInt16LE(2,32);bytes.writeUInt16LE(16,34);bytes.write('data',36);bytes.writeUInt32LE(4,40);return bytes; }
test('music profiles persist, never overwrite assigned slots, and clear deleted tracks across versions',async()=>{
  const temp=await mkdtemp(path.join(os.tmpdir(),'court-music-unit-'));
  try {
    const store=await new MusicStore(temp).load();
    assert.equal(store.snapshot().tracks.length,0);
    assert.equal(store.snapshot().settings.enabled,false);
    await Promise.all([
      store.import(wave(),{name:'尋問 ～ モデラート 2001.wav',version:'逆转裁判 1',assign:true}),
      store.import(wave(),{name:'Cross-Examination - Moderato.wav',version:'逆转裁判 1',assign:true}),
    ]);
    let state=store.snapshot();assert.equal(state.tracks.length,2);assert.equal(state.settings.bindings.length,1);
    const first=state.settings.bindings[0].trackId;
    await store.settings({version:'逆转裁判 2',enabled:true,volume:.24,binding:{version:'逆转裁判 2',phase:'pursuit',trackId:first}});
    const reopened=await new MusicStore(temp).load();state=reopened.snapshot();
    assert.equal(boundTrack(state,'pursuit').id,first);assert.equal(state.settings.volume,.24);
    await reopened.edit(first,{title:'新曲名',phase:'objection'});
    assert.equal(reopened.snapshot().tracks.find(t=>t.id===first).title,'新曲名');
    await reopened.remove(first);state=reopened.snapshot();
    assert.equal(state.settings.bindings.length,0);assert.equal(state.tracks.length,1);
    assert.equal((await readdir(temp)).filter(name=>name.endsWith('.wav')).length,1);
  } finally { await rm(temp,{recursive:true,force:true}); }
});
test('invalid music settings and non-audio files cannot corrupt the library',async()=>{
  const temp=await mkdtemp(path.join(os.tmpdir(),'court-music-unit-'));
  try {
    const store=await new MusicStore(temp).load();
    await assert.rejects(()=>store.import(Buffer.from('<script>alert(1)</script>'),{name:'fake.mp3'}),/音频/);
    await assert.rejects(()=>store.import(wave(),{name:'real.txt'}),/支持/);
    await assert.rejects(()=>store.settings({enabled:true,volume:2}),/音量/);
    assert.equal(store.snapshot().settings.enabled,false);
    await assert.rejects(()=>store.settings({binding:{version:'逆转裁判 1',phase:'objection',trackId:'missing'}}),/找不到/);
    await store.settings({volume:.5});assert.equal(store.snapshot().settings.volume,.5);
    await writeFile(store.file,'broken-json');
    await assert.rejects(()=>new MusicStore(temp).load(),/原文件已保留/);
    assert.equal(await readFile(store.file,'utf8'),'broken-json');
  } finally { await rm(temp,{recursive:true,force:true}); }
});
test('audio format detection and HTTP ranges support seeking without arbitrary reads',()=>{
  assert.deepEqual(audioType(wave(),'x.wav'),{ext:'wav',mime:'audio/wav'});
  assert.deepEqual(byteRange('bytes=2-7',10),{start:2,end:7});
  assert.deepEqual(byteRange('bytes=-4',10),{start:6,end:9});
  assert.deepEqual(byteRange('bytes=4-',10),{start:4,end:9});
  assert.deepEqual(byteRange('bytes=0-999',10),{start:0,end:9});
  assert.equal(byteRange(undefined,10),null);
  for(const input of ['bytes=11-','bytes=8-2','bytes=-0','bytes=0-1,3-4','bytes=-','../audio'])assert.throws(()=>byteRange(input,10),{status:416});
  const store=new MusicStore('unused');assert.throws(()=>store.pathFor({id:'../../private',ext:'wav'}),/无效/);
});
test('phase suggestions understand Chinese, Japanese, and English without inventing a category',()=>{
  for(const [name,expected] of [['追求 ～ 追いつめられて','pursuit'],['Phoenix Wright - Objection!','objection'],['尋問 ～ アレグロ 2004','questioning_fast'],['询问（快）','questioning_fast'],['Cross-Examination - Allegro','questioning_fast'],['询问（慢）','questioning'],['Court is Now in Session','opening'],['捜査 ～ 序盤','investigation'],['逻辑','logic'],['法廷休憩室','recess'],['Victory!','victory'],['Guilty Love','']])assert.equal(inferPhase(name),expected);
});
test('legacy logic assignment migrates once without changing preferences or refilling cleared slots',async()=>{
  const temp=await mkdtemp(path.join(os.tmpdir(),'court-music-unit-'));
  try{
    const store=await new MusicStore(temp).load();
    await store.import(wave(),{name:'old-thinking.wav',version:'My music',phase:'thinking',assign:true});
    const legacy=store.snapshot();delete legacy.phaseSchemaVersion;legacy.settings.volume=.18;legacy.settings.enabled=false;
    await writeFile(store.file,JSON.stringify(legacy));
    const reopened=await new MusicStore(temp).load();const migrated=reopened.snapshot();
    assert.equal(migrated.settings.bindings.find(b=>b.phase==='logic').trackId,migrated.tracks[0].id);
    assert.equal(migrated.settings.enabled,false);assert.equal(migrated.settings.volume,.18);
    await reopened.settings({binding:{version:'My music',phase:'logic',trackId:''}});
    const again=await new MusicStore(temp).load();assert.equal(again.snapshot().settings.bindings.some(b=>b.phase==='logic'),false);
  }finally{assert.ok(path.basename(temp).startsWith('court-music-unit-'));await rm(temp,{recursive:true,force:true});}
});

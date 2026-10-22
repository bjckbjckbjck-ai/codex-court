import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { MusicStore } from '../server/music.mjs';
import { seedBundledMusic } from '../server/bundled-music.mjs';
const bundle = path.resolve('assets/music');
async function fixture(fn) {
  const temp = await mkdtemp(path.join(os.tmpdir(),'court-seed-unit-'));
  try { await fn(temp, await new MusicStore(path.join(temp,'library')).load()); }
  finally { assert.ok(path.basename(temp).startsWith('court-seed-unit-')); await rm(temp,{recursive:true,force:true}); }
}
test('bundled recordings seed all eight phases once and respect later deletion',()=>fixture(async(temp,store)=>{
  await seedBundledMusic(store,bundle);
  const state=store.snapshot();
  assert.equal(state.tracks.length,8); assert.equal(state.settings.bindings.length,9);
  assert.equal(state.settings.bindings.some(b=>b.phase==='questioning_fast'),false,'Fast slot stays empty until the user supplies it');
  assert.equal(state.settings.bindings.find(b=>b.phase==='logic').trackId,state.settings.bindings.find(b=>b.phase==='thinking').trackId);
  assert.equal(state.settings.version,'逆转裁判 4'); assert.equal(state.settings.enabled,true);
  for(const track of state.tracks) assert.equal((await readFile(store.pathFor(track))).length,track.size);
  await seedBundledMusic(store,bundle); assert.deepEqual(store.snapshot(),state);
  for(const track of state.tracks) await store.remove(track.id);
  const reopened=await new MusicStore(store.directory).load();
  await seedBundledMusic(reopened,bundle); assert.equal(reopened.snapshot().tracks.length,0);
}));
test('existing user library and preferences take priority over bundled defaults',()=>fixture(async(temp,store)=>{
  await store.import(await readFile(path.join(bundle,'aa4/bgm01.mp3')),{name:'my-track.mp3',version:'My mix',phase:'opening',assign:true});
  await store.settings({version:'My mix',enabled:false,volume:.19});
  const before=store.snapshot(); await seedBundledMusic(store,bundle);
  assert.deepEqual(store.snapshot().tracks,before.tracks); assert.deepEqual(store.snapshot().settings,before.settings);
}));
test('corrupt or escaping bundle entries fail before changing user data',()=>fixture(async(temp,store)=>{
  const fixtureDir=path.join(temp,'bundle'); await mkdir(fixtureDir);
  const manifest=JSON.parse(await readFile(path.join(bundle,'manifest.json'),'utf8'));
  manifest.tracks=manifest.tracks.slice(0,1);
  manifest.tracks[0].file='track.mp3'; await writeFile(path.join(fixtureDir,'track.mp3'),Buffer.from('corrupt'));
  await writeFile(path.join(fixtureDir,'manifest.json'),JSON.stringify(manifest));
  await assert.rejects(()=>seedBundledMusic(store,fixtureDir),/校验失败/);
  assert.equal(store.snapshot().tracks.length,0); assert.equal(store.snapshot().bundledPackApplied,undefined);
  manifest.tracks[0].file='../outside.mp3'; await writeFile(path.join(fixtureDir,'manifest.json'),JSON.stringify(manifest));
  await assert.rejects(()=>seedBundledMusic(store,fixtureDir),/路径无效/);
}));

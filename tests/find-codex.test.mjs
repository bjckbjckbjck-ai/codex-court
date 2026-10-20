import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, utimesSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { findCodex } from '../server/find-codex.mjs';

function fixture(t) {
  const root=mkdtempSync(path.join(os.tmpdir(),'court-discovery-'));
  t.after(()=>{const target=path.resolve(root);if(!target.startsWith(path.resolve(os.tmpdir())+path.sep)||!path.basename(target).startsWith('court-discovery-'))throw new Error('Unexpected cleanup path');rmSync(target,{recursive:true,force:true});});
  const file=(relative,date)=>{const filename=path.join(root,relative);mkdirSync(path.dirname(filename),{recursive:true});writeFileSync(filename,'test fixture');if(date)utimesSync(filename,date,date);return filename;};
  const env={LOCALAPPDATA:root,PATH:''};
  return {root,file,env};
}
test('desktop shortcut discovers versioned Codex when PATH contains no Codex',t=>{
  const {file,env}=fixture(t);
  const executable=file('OpenAI/Codex/bin/build-one/codex.exe');
  assert.equal(findCodex({env,platform:'win32'}),executable);
});
test('discovery skips incomplete updates and resolves the newest executable on each launch',t=>{
  const {root,file,env}=fixture(t);
  const old=file('OpenAI/Codex/bin/old/codex.exe',new Date('2025-01-01'));
  mkdirSync(path.join(root,'OpenAI/Codex/bin/incomplete'),{recursive:true});
  assert.equal(findCodex({env,platform:'win32'}),old);
  const newest=file('OpenAI/Codex/bin/new/codex.exe',new Date('2026-01-01'));
  assert.equal(findCodex({env,platform:'win32'}),newest);
});
test('explicit overrides and quoted Windows Path entries retain precedence',t=>{
  const {root,file,env}=fixture(t);
  file('OpenAI/Codex/bin/bundled/codex.exe');
  const onPath=file('tools with spaces/codex.exe'), explicit=file('custom/codex.exe');
  const pathEnv={...env,PATH:undefined,Path:`.;"${path.join(root,'tools with spaces')}"`};
  delete pathEnv.PATH;
  assert.equal(findCodex({env:pathEnv,platform:'win32'}),onPath);
  assert.equal(findCodex({env:{...pathEnv,CODEX_BINARY:`"${explicit}"`},platform:'win32'}),explicit);
  assert.throws(()=>findCodex({env:{...env,CODEX_BINARY:path.join(root,'missing.exe')},platform:'win32'}),/CODEX_BINARY/);
});
test('a missing executable is diagnosed without asking to reinstall an existing app',t=>{
  const {env}=fixture(t);
  assert.throws(()=>findCodex({env,platform:'win32'}),/已检查系统 PATH 和本机 Codex 安装目录/);
});

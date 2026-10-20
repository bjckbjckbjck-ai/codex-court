import { CodexRpc } from '../server/rpc.mjs';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { once } from 'node:events';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';

const temp=await mkdtemp(path.join(os.tmpdir(),'codex-court-sharing-'));
const isolatedHome=path.join(temp,'codex-home'),workspace=path.join(temp,'workspace');
await mkdir(isolatedHome);await mkdir(workspace);
// Protocol-only test. No auth credentials, no model calls, no production state.
const env={...process.env,CODEX_HOME:isolatedHome};
delete env.OPENAI_API_KEY;
const first=new CodexRpc({env}),second=new CodexRpc({env});
const report={isolated:true,modelCalls:0};
try {
  await first.connect();await second.connect();
  const opened=await first.call('thread/start',{cwd:workspace,approvalPolicy:'never',sandbox:'read-only'});
  const id=opened.thread.id;
  await first.call('thread/name/set',{threadId:id,name:'Court session sharing validation'});
  const otherRead=await second.call('thread/read',{threadId:id});
  assert.equal(otherRead.thread.id,id);report.sharedRead=true;
  let locked=false;
  try { await second.call('thread/resume',{threadId:id,excludeTurns:true},15000); }
  catch(e){locked=true;report.lockMessage=e.message;}
  report.concurrentResumeRejected=locked;
  if(!locked)throw new Error('Runtime did not reject a concurrent writer. Do not claim a writer-lock guarantee.');
  const exiting=once(first.child,'exit');first.close();await exiting;
  const resumed=await second.call('thread/resume',{threadId:id,excludeTurns:true});
  assert.equal(resumed.thread.id,id);assert.equal(resumed.thread.name,'Court session sharing validation');
  report.resumeAfterRelease=true;report.sameThreadId=true;report.passed=true;
  await mkdir('test-results',{recursive:true});await writeFile('test-results/session-sharing-report.json',JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
}catch(e){console.error(e.message);process.exitCode=1;}
finally{
  first.close();const exiting=second.child?.exitCode===null?once(second.child,'exit'):Promise.resolve();second.close();await exiting;
  const target=path.resolve(temp);if(target.startsWith(path.resolve(os.tmpdir())+path.sep)&&path.basename(target).startsWith('codex-court-sharing-'))await rm(target,{recursive:true,force:true,maxRetries:5,retryDelay:500});
}

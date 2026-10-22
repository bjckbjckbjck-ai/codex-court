// Optional: one real model turn using the existing ChatGPT login. No user thread is resumed.
import {CodexRpc} from '../server/rpc.mjs';
import {MENTOR_INSTRUCTIONS,mentorInput} from '../server/mentor.mjs';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
const temp=await mkdtemp(path.join(os.tmpdir(),'court-mentor-live-'));
const source=`export async function signIn(request) {\n  let state = 'idle';\n  state = 'pending';\n  try { await request(); state = 'signedIn'; }\n  catch { state = 'failed'; }\n  return state;\n}\n`;
await writeFile(path.join(temp,'flow.js'),source);
const rpc=new CodexRpc();let threadId,timer;
try{
  await rpc.connect();const account=await rpc.call('account/read',{refreshToken:false});
  assert.equal(account.account?.type,'chatgpt','Use existing ChatGPT login; no API-key fallback');
  rpc.on('request',m=>rpc.send({id:m.id,error:{code:-32601,message:'Only native read-only tools are available in this teaching test'}}));
  const done=new Promise((resolve,reject)=>{timer=setTimeout(()=>reject(new Error('Mentor live test timed out')),120000);rpc.on('notification',m=>{if(m.params?.threadId===threadId&&m.method==='turn/completed')resolve(m.params.turn);});});
  const r=await rpc.call('thread/start',{ephemeral:true,cwd:temp,approvalPolicy:'never',sandbox:'read-only',developerInstructions:MENTOR_INSTRUCTIONS});threadId=r.thread.id;
  console.log('Mentor test started in an ephemeral read-only example project.');
  await rpc.call('turn/start',{threadId,input:mentorInput({text:'请先只读当前目录的 flow.js，用不超过250字给初学者解释 pending 是什么、为什么不能一点击就当作登录成功。给一个具体的小问题，不修改任何文件。',mode:'explain'},{level:'beginner',goal:'看懂登录状态'}),approvalPolicy:'never',sandboxPolicy:{type:'readOnly',networkAccess:false}});
  const turn=await done;assert.equal(turn.status,'completed',turn.error?.message);
  let items=turn.items||[];
  if(!items.some(i=>i.type==='agentMessage')){const h=await rpc.call('thread/read',{threadId,includeTurns:true});items=h.thread.turns.flatMap(t=>t.items||[]);}
  const reply=items.filter(i=>i.type==='agentMessage').map(i=>i.text).join('\n');assert.match(reply,/pending/);assert.match(reply,/等待|确认|正在|处理/);
  assert.equal(await readFile(path.join(temp,'flow.js'),'utf8'),source);
  const report={passed:true,ephemeral:true,readOnly:true,sourceUnchanged:true,reply};await mkdir('test-results',{recursive:true});await writeFile('test-results/mentor-live-report.json',JSON.stringify(report,null,2));
  console.log(JSON.stringify({passed:true,ephemeral:true,readOnly:true,sourceUnchanged:true,replyCharacters:reply.length}));
}catch(e){console.error(e.message);process.exitCode=1;}finally{clearTimeout(timer);rpc.close();await new Promise(r=>setTimeout(r,1800));assert.ok(path.basename(temp).startsWith('court-mentor-live-'));await rm(temp,{recursive:true,force:true});}

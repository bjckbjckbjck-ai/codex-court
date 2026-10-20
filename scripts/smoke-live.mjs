import { CodexRpc } from '../server/rpc.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// One ephemeral conversation; no existing user thread is resumed or written.
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const rpc=new CodexRpc();
let threadId, timer;
try {
  await rpc.connect();
  const account=await rpc.call('account/read',{refreshToken:false});
  if(account.account?.type!=='chatgpt')throw new Error('Live smoke test requires the existing ChatGPT login; API-key fallback is disabled.');
  rpc.on('request',msg=>rpc.send({id:msg.id,error:{code:-32601,message:'Smoke test does not execute host tools'}}));
  const done=new Promise((resolve,reject)=>{
    timer=setTimeout(()=>reject(new Error('Live response timed out')),150000);
    const texts=[];
    rpc.on('notification',msg=>{
      if(msg.params?.threadId!==threadId)return;
      if(msg.method==='item/completed'&&msg.params.item.type==='agentMessage')texts.push(msg.params.item.text);
      if(msg.method==='turn/completed')resolve({status:msg.params.turn.status,error:msg.params.turn.error?.message||null,text:texts.join('\n')});
    });
  });
  const started=await rpc.call('thread/start',{ephemeral:true,cwd:root,approvalPolicy:'never',sandbox:'read-only'},60000);
  threadId=started.thread.id;
  console.log(JSON.stringify({stage:'ephemeral-started',accountType:account.account.type,model:started.model,ephemeral:started.thread.ephemeral}));
  await rpc.call('turn/start',{threadId,input:[{type:'text',text:'这是 Codex Court 客户端连接验收。仅回复「法庭连接成功」。不要调用工具，不要读取或修改文件。',text_elements:[]}]},60000);
  const result=await done;
  if(result.status!=='completed'||!result.text.includes('法庭连接成功'))throw new Error(result.error||`Unexpected completion: ${result.status}: ${result.text.slice(0,150)}`);
  const report={passed:true,ephemeral:true,existingThreadsModified:false,accountType:account.account.type,model:started.model,reply:result.text,completedAt:new Date().toISOString()};
  await mkdir(path.join(root,'test-results'),{recursive:true});await writeFile(path.join(root,'test-results','live-smoke-report.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
}catch(e){console.error(e.message);process.exitCode=1;}finally{clearTimeout(timer);rpc.close();}

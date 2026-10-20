import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';
const git = (...args) => execFileSync('git',args,{maxBuffer:32*1024*1024,windowsHide:true});
const files=git('ls-files','--stage','-z').toString('utf8').split('\0').filter(Boolean).map(row=>{
  const [meta,file]=row.split('\t');return {mode:meta.split(' ')[0],file};
});
if(!files.length) throw new Error('Stage the explicit public files before running this check.');
const allowedRoots=new Set(['src','server','shared','scripts','tests','docs','public','assets']);
const allowedFiles=new Set(['.gitignore','LICENSE','README.md','THIRD_PARTY_NOTICES.md','package.json','package-lock.json','vite.config.js','index.html','Start-Court.cmd','启动法庭.vbs','停止法庭服务.vbs']);
const failures=[];
const rules=[
  ['private key',/-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/],
  ['API token',/\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{24,}/],
  ['GitHub token',/\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})/],
  ['AWS access key',/\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/],
  ['JWT',/\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/],
  ['credential assignment',/\b(?:api[_-]?key|password|access_token|refresh_token)\s*[:=]\s*["'][A-Za-z0-9_+\/-]{20,}["']/i],
  ['credential URL',/https?:\/\/[^\s/:]+:[^\s/@]+@/i],
];
let bytes=0;
for(const {file,mode} of files){
  if(mode!=='100644'&&mode!=='100755')failures.push({file,rule:'unsupported file mode'});
  if(!allowedFiles.has(file)&&!allowedRoots.has(file.split('/')[0]))failures.push({file,rule:'outside public allowlist'});
  if(/(^|\/)(?:\.local|\.codex|node_modules|test-results|sessions|archived_sessions|runtime|dist)(\/|$)|(?:^|\/)(?:key\.txt|auth\.json|config\.toml|\.env[^/]*|\.npmrc)$|\.(?:log|jsonl|db|sqlite|pem|key|zip)$/i.test(file))failures.push({file,rule:'private/generated file'});
  const data=git('show',`:${file}`);bytes+=data.length;
  if(file.endsWith('.mp3')){
    if(!/^assets\/music\/aa4\/bgm\d{2}\.mp3$/.test(file)||data[0]!==255||(data[1]&224)!==224||data.subarray(-128,-125).toString()==='TAG')failures.push({file,rule:'unexpected audio or metadata'});
    continue;
  }
  if(file.endsWith('.png')){if(!data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))failures.push({file,rule:'invalid image'});continue;}
  if(data.includes(0)){failures.push({file,rule:'unexpected binary'});continue;}
  const text=data.toString('utf8');
  for(const [rule,regex] of rules)if(regex.test(text))failures.push({file,rule});
  for(const privatePath of [process.cwd(),process.env.USERPROFILE].filter(Boolean)){
    if(text.toLowerCase().includes(privatePath.toLowerCase())||text.toLowerCase().includes(privatePath.replaceAll('\\','/').toLowerCase()))failures.push({file,rule:'personal absolute path'});
  }
  if(process.env.USERNAME&&text.toLowerCase().includes(process.env.USERNAME.toLowerCase()))failures.push({file,rule:'local username'});
}
const manifest=JSON.parse(git('show',':assets/music/manifest.json').toString());
for(const track of manifest.tracks){
  const file=path.posix.join('assets/music',track.file),data=git('show',`:${file}`);
  if(data.length!==track.bytes||createHash('sha256').update(data).digest('hex')!==track.sha256)failures.push({file,rule:'music integrity'});
}
// Only file names and rule names are printed, never matched secret values.
console.log(JSON.stringify({passed:failures.length===0,files:files.length,bytes,musicTracks:manifest.tracks.length,failures},null,2));
if(failures.length)process.exitCode=1;

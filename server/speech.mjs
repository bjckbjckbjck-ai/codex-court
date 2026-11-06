import {mkdir,readFile,writeFile,rename,unlink} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {DEFAULT_SPEECH_SETTINGS,MAX_REFERENCE_BYTES} from '../shared/speech.mjs';

const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const uuid=id=>{if(typeof id!=='string'||!/^[a-f0-9-]{36}$/.test(id))throw fail('音色编号无效');return id;};
export function localSpeechEndpoint(value){
  let u;try{u=new URL(value);}catch{throw fail('请输入本机语音服务地址，例如 http://127.0.0.1:50000');}
  if(u.protocol!=='http:'||!['127.0.0.1','localhost','[::1]'].includes(u.hostname)||u.username||u.password||u.search||u.hash||!['','/'].includes(u.pathname))throw fail('语音服务只允许本机回环 HTTP 地址，不接受远程地址或凭据');
  if(u.hostname==='localhost')u.hostname='127.0.0.1';return u.origin;
}
export function readPcmWave(b,{reference=false}={}){
  if(b.length<44||b.toString('ascii',0,4)!=='RIFF'||b.toString('ascii',8,12)!=='WAVE'||b.readUInt32LE(4)+8!==b.length)throw fail('音频不是完整的 WAV 文件');
  let fmt,data;for(let offset=12;offset+8<=b.length;){const n=b.readUInt32LE(offset+4),end=offset+8+n;if(end>b.length)throw fail('WAV 数据不完整');const tag=b.toString('ascii',offset,offset+4);if(tag==='fmt ')fmt=b.subarray(offset+8,end);if(tag==='data')data=b.subarray(offset+8,end);offset=end+(n%2);}
  if(!fmt||fmt.length<16||!data?.length||fmt.readUInt16LE(0)!==1||fmt.readUInt16LE(2)!==1||fmt.readUInt16LE(14)!==16||data.length%2)throw fail('请使用单声道 16 位 PCM WAV 音频');
  const sampleRate=fmt.readUInt32LE(4);if(![16000,22050,24000,44100,48000].includes(sampleRate)||fmt.readUInt32LE(8)!==sampleRate*2||fmt.readUInt16LE(12)!==2)throw fail('不支持的 WAV 采样格式');
  const duration=data.length/(sampleRate*2);
  if(reference){if(duration<3||duration>30.01)throw fail('参考音频需要 3～30 秒，请截取一句清晰、单人说话的片段');let peak=0;for(let i=0;i<data.length;i+=2)peak=Math.max(peak,Math.abs(data.readInt16LE(i)));if(peak<60)throw fail('参考音频几乎没有声音，请检查录音');}
  return {sampleRate,duration,data};
}
export function pcmToWave(pcm,sampleRate){
  if(!pcm.length||pcm.length%2)throw fail('本地语音服务返回了无效的 PCM 音频',502);
  const header=Buffer.alloc(44);header.write('RIFF');header.writeUInt32LE(pcm.length+36,4);header.write('WAVEfmt ',8);header.writeUInt32LE(16,16);header.writeUInt16LE(1,20);header.writeUInt16LE(1,22);header.writeUInt32LE(sampleRate,24);header.writeUInt32LE(sampleRate*2,28);header.writeUInt16LE(2,32);header.writeUInt16LE(16,34);header.write('data',36);header.writeUInt32LE(pcm.length,40);return Buffer.concat([header,pcm]);
}
async function boundedResponse(response,max){
  if(Number(response.headers.get('content-length'))>max){await response.body?.cancel();throw fail('语音服务响应过大',502);}
  const buffers=[];let size=0;for await(const chunk of response.body||[]){size+=chunk.length;if(size>max)throw fail('语音服务响应过大',502);buffers.push(Buffer.from(chunk));}return Buffer.concat(buffers);
}
export class SpeechStore{
  constructor(directory){this.directory=directory;this.file=path.join(directory,'voices.json');this.data={version:1,settings:{...DEFAULT_SPEECH_SETTINGS},voices:[]};this.queue=Promise.resolve();this.busy=false;}
  async load(){
    try{const d=JSON.parse(await readFile(this.file,'utf8'));if(d.version!==1||!Array.isArray(d.voices)||d.voices.length>40||!d.settings)throw new Error('schema');for(const v of d.voices){uuid(v.id);if(!v.name||!['zero_shot','cross_lingual'].includes(v.mode))throw new Error('schema');}this.validateSettings(d.settings,d.voices);this.data=d;}
    catch(e){if(e.code!=='ENOENT')throw new Error('角色音色库无法读取，原文件已保留');}return this;
  }
  snapshot(){return structuredClone(this.data);}
  async mutate(fn){const task=this.queue.catch(()=>{}).then(async()=>{const next=this.snapshot();await fn(next);await mkdir(this.directory,{recursive:true});await writeFile(this.file+'.tmp',JSON.stringify(next,null,2));await rename(this.file+'.tmp',this.file);this.data=next;return this.snapshot();});this.queue=task;return task;}
  validateSettings(p,voices=this.data.voices){
    if(!['cosyvoice3','cosyvoice2','system'].includes(p.engine))throw fail('请选择支持的语音引擎');
    p.endpoint=localSpeechEndpoint(p.endpoint);
    if(![16000,22050,24000,44100,48000].includes(p.sampleRate))throw fail('采样率无效');
    for(const [key,min,max]of[['rate',0.6,1.5],['volume',0,1]])if(!Number.isFinite(p[key])||p[key]<min||p[key]>max)throw fail('语速或音量超出范围');
    if(p.voiceId!==null&&!voices.some(v=>v.id===p.voiceId))throw fail('所选角色音色不存在');
    if(typeof p.systemVoice!=='string'||p.systemVoice.length>300)throw fail('系统音色无效');return p;
  }
  settings(patch){const allowed=Object.keys(DEFAULT_SPEECH_SETTINGS);if(Object.keys(patch).some(k=>!allowed.includes(k)))throw fail('不支持的语音设置');return this.mutate(d=>{d.settings=this.validateSettings({...d.settings,...patch},d.voices);});}
  async add(input){
    if(typeof input.audio!=='string'||input.audio.length>MAX_REFERENCE_BYTES*1.4||! /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(input.audio))throw fail('参考音频格式无效或超过 3 MB');
    const bytes=Buffer.from(input.audio,'base64');if(bytes.length>MAX_REFERENCE_BYTES)throw fail('参考音频超过 3 MB');const {duration,sampleRate}=readPcmWave(bytes,{reference:true}),id=randomUUID();
    const info=this.voiceMetadata(input),record={id,...info,duration,sampleRate,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),createdAt:Date.now()};
    await this.mutate(async d=>{if(d.voices.length>=40)throw fail('最多保存 40 个角色音色');await mkdir(this.directory,{recursive:true});await writeFile(this.audioPath(id),bytes,{flag:'wx'});d.voices.push(record);if(!d.settings.voiceId)d.settings.voiceId=id;});return this.snapshot();
  }
  voiceMetadata(input){
    const name=String(input.name||'').trim(),transcript=String(input.transcript||'').trim(),mode=input.mode||'zero_shot';
    if(!name||name.length>60)throw fail('角色名称需要 1～60 个字');if(transcript.length>2000||/<\|[^>]*\|>/.test(transcript))throw fail('参考台词过长或含有模型控制标记');
    if(!['zero_shot','cross_lingual'].includes(mode))throw fail('音色复制方式无效');if(mode==='zero_shot'&&!transcript)throw fail('请填写参考音频里实际说出的台词');return {name,transcript,mode};
  }
  voice(id){uuid(id);const v=this.data.voices.find(v=>v.id===id);if(!v)throw fail('角色音色不存在',404);return v;}
  audioPath(id){return path.join(this.directory,uuid(id)+'.wav');}
  async audio(id){this.voice(id);return readFile(this.audioPath(id));}
  edit(id,patch){return this.mutate(d=>{const voice=d.voices.find(v=>v.id===uuid(id));if(!voice)throw fail('角色音色不存在',404);Object.assign(voice,this.voiceMetadata({...voice,...patch}));});}
  async remove(id){await this.mutate(d=>{if(!d.voices.some(v=>v.id===uuid(id)))throw fail('角色音色不存在',404);d.voices=d.voices.filter(v=>v.id!==id);if(d.settings.voiceId===id)d.settings.voiceId=null;});await unlink(this.audioPath(id)).catch(e=>{if(e.code!=='ENOENT')throw e;});return this.snapshot();}
  async status(){
    try{const r=await fetch(localSpeechEndpoint(this.data.settings.endpoint)+'/openapi.json',{signal:AbortSignal.timeout(4000),redirect:'error'});if(!r.ok)throw new Error();const schema=JSON.parse((await boundedResponse(r,1_000_000)).toString());if(!schema.paths?.['/inference_zero_shot']?.post||!schema.paths?.['/inference_cross_lingual']?.post)throw new Error();return {connected:true,message:'本地 CosyVoice 兼容服务已连接'};}
    catch{return {connected:false,message:'未连接本地 CosyVoice。启动模型服务后再试；导入和保存音色不需要模型在线。'};}
  }
  async synthesize(input,signal){
    const settings={...this.data.settings};if(settings.engine==='system')throw fail('系统朗读由浏览器播放，不调用模型服务');
    const text=String(input.text||'').trim();if(!text||[...text].length>240||/<\|[^>]*\|>/.test(text))throw fail('朗读片段需要 1～240 字，不能包含模型控制标记');
    const voice={...this.voice(input.voiceId||settings.voiceId)};
    if(this.busy)throw fail('本地语音正在生成，请稍后重试',409);this.busy=true;
    try{
      signal?.throwIfAborted();
      const audio=await this.audio(voice.id),form=new FormData(),prefix=settings.engine==='cosyvoice3'?'You are a helpful assistant.<|endofprompt|>':'';
      form.set('tts_text',(voice.mode==='cross_lingual'?prefix:'')+text);if(voice.mode==='zero_shot')form.set('prompt_text',prefix+voice.transcript);form.set('prompt_wav',new Blob([audio],{type:'audio/wav'}),'reference.wav');
      // Finish the bounded multipart encoding before fetch, so cancellation cannot race a Blob upload stream.
      const encoded=new Response(form),payload=Buffer.from(await encoded.arrayBuffer());signal?.throwIfAborted();
      const response=await fetch(localSpeechEndpoint(settings.endpoint)+'/inference_'+voice.mode,{method:'POST',headers:{'Content-Type':encoded.headers.get('content-type')},body:payload,signal:AbortSignal.any([signal||new AbortController().signal,AbortSignal.timeout(180000)]),redirect:'error'});
      if(!response.ok){await response.body?.cancel();throw fail(`本地语音生成失败（HTTP ${response.status}），请检查模型服务`,502);}
      const bytes=await boundedResponse(response,24_000_000),type=response.headers.get('content-type')||'';
      if(bytes.subarray(0,4).toString()==='RIFF'){readPcmWave(bytes);return bytes;}
      if(/json|text\/|html/i.test(type))throw fail('模型服务返回了文字而非音频，请检查接口地址',502);
      return pcmToWave(bytes,settings.sampleRate);
    }catch(e){if(e.status)throw e;if(signal?.aborted)throw fail('已停止等待语音',499);if(e.name==='TimeoutError')throw fail('本地语音生成超时，可缩短选文后重试',504);throw fail('无法生成语音：请在角色音色设置中检查本机 CosyVoice 服务',503);}
    finally{this.busy=false;}
  }
}

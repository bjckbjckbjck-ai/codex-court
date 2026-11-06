import {useCallback,useEffect,useRef,useState} from 'react';
import {api,speechAudio} from './lib.js';
import {DEFAULT_SPEECH_SETTINGS,speechChunks} from '../shared/speech.mjs';

export function useSpeech(ready){
  const [library,setLibrary]=useState({voices:[],settings:{...DEFAULT_SPEECH_SETTINGS}}),[playback,setPlayback]=useState({state:'idle'}),[error,setError]=useState(''),[systemVoices,setSystemVoices]=useState([]);
  const audioRef=useRef(),config=useRef(library),serial=useRef(0),controller=useRef(),objectURL=useRef(),cancelWait=useRef(),utterance=useRef(),stateRef=useRef(playback),mutations=useRef(Promise.resolve());
  config.current=library;stateRef.current=playback;
  const releaseAudio=()=>{if(objectURL.current){URL.revokeObjectURL(objectURL.current);objectURL.current=null;}};
  const stop=useCallback(()=>{
    serial.current++;controller.current?.abort();cancelWait.current?.(new Error('cancelled'));cancelWait.current=null;
    const audio=audioRef.current;if(audio){audio.pause();audio.removeAttribute('src');audio.load();}if(utterance.current){window.speechSynthesis?.cancel();utterance.current=null;}releaseAudio();setPlayback({state:'idle'});
  },[]);
  useEffect(()=>{
    if(!ready)return;let disposed=false;api('/speech').then(r=>{if(!disposed){setLibrary(r);setError('');}}).catch(e=>{if(!disposed)setError(e.message);});return()=>{disposed=true;};
  },[ready]);
  useEffect(()=>{const synth=window.speechSynthesis;if(!synth)return;const refresh=()=>setSystemVoices(synth.getVoices().filter(v=>v.localService&&/^zh(?:-|_)/i.test(v.lang)).sort((a,b)=>Number(/^zh[-_]CN/i.test(b.lang))-Number(/^zh[-_]CN/i.test(a.lang))));refresh();synth.addEventListener('voiceschanged',refresh);return()=>synth.removeEventListener('voiceschanged',refresh);},[]);
  useEffect(()=>stop,[stop]);
  const change=useCallback((url,options)=>{
    const task=mutations.current.catch(()=>{}).then(async()=>{const r=await api(url,options);stop();setLibrary(r);setError('');return r;});mutations.current=task;return task;
  },[stop]);
  const updateSettings=patch=>change('/speech/settings',{method:'PATCH',body:patch});
  async function speak(text,voiceId){
    stop();setError('');const n=serial.current,settings={...config.current.settings},voices=config.current.voices;
    try{
      const chunks=speechChunks(text),role=voices.find(v=>v.id===(voiceId||settings.voiceId));
      const system=settings.engine==='system';
      if(!system&&!role)throw new Error('先在“角色音色”里导入参考录音，保存并选用一个角色');
      const localVoice=systemVoices.find(v=>v.voiceURI===settings.systemVoice)||systemVoices[0];
      if(system&&!localVoice)throw new Error('没有检测到本机中文语音。请在 Windows 语言设置中安装中文语音，或连接 CosyVoice');
      controller.current=new AbortController();
      const info={title:system?localVoice.name:role.name,total:chunks.length,text:String(text).slice(0,100),engine:system?'system':'local'};
      for(let index=0;index<chunks.length;index++){
        if(serial.current!==n)return;
        setPlayback({...info,index:index+1,state:'loading'});
        if(system){
          await new Promise((resolve,reject)=>{
            const utter=new SpeechSynthesisUtterance(chunks[index]);utterance.current=utter;cancelWait.current=reject;utter.voice=localVoice;utter.lang=localVoice.lang;utter.rate=settings.rate;utter.volume=settings.volume;
            utter.onstart=()=>{if(serial.current===n)setPlayback({...info,index:index+1,state:'playing'});};utter.onend=resolve;utter.onerror=e=>reject(new Error(`本机朗读失败：${e.error}`));window.speechSynthesis.speak(utter);
          });utterance.current=null;
        }else{
          const blob=await speechAudio(chunks[index],role.id,controller.current.signal);if(serial.current!==n)return;
          releaseAudio();objectURL.current=URL.createObjectURL(blob);const audio=audioRef.current;audio.src=objectURL.current;audio.playbackRate=settings.rate;audio.volume=settings.volume;audio.preservesPitch=true;
          await new Promise((resolve,reject)=>{
            cancelWait.current=reject;audio.onended=resolve;audio.onerror=()=>reject(new Error('音频无法解码，请检查本地服务的格式和采样率'));
            audio.onplaying=()=>{if(serial.current===n)setPlayback({...info,index:index+1,state:'playing'});};
            audio.play().catch(e=>{if(serial.current!==n)return;if(e.name==='NotAllowedError')setPlayback({...info,index:index+1,state:'blocked'});else reject(e);});
          });
        }
      }
      if(serial.current===n){cancelWait.current=null;releaseAudio();setPlayback({...info,index:chunks.length,state:'ended'});}
    }catch(e){if(serial.current===n){releaseAudio();setError(e.message);setPlayback(p=>({...p,state:'error'}));}}
  }
  async function toggle(){
    const p=stateRef.current;if(!['playing','paused','blocked'].includes(p.state))return;
    if(p.state==='playing'){if(utterance.current)window.speechSynthesis.pause();else audioRef.current?.pause();setPlayback({...p,state:'paused'});}
    else{try{if(utterance.current)window.speechSynthesis.resume();else await audioRef.current.play();setPlayback({...p,state:'playing'});}catch{setError('浏览器未允许播放，请再次点击继续');}}
  }
  return {library,playback,error,setError,audioRef,systemVoices,speak,stop,toggle,updateSettings,change};
}

export async function referenceWave(file){
  if(!file||file.size>20_000_000)throw new Error('请选择不超过 20 MB 的音频文件');
  const context=new AudioContext();let decoded;try{decoded=await context.decodeAudioData(await file.arrayBuffer());}catch{throw new Error('无法读取这段音频，请改用 WAV 或 MP3 文件');}finally{await context.close();}
  if(decoded.duration<3||decoded.duration>30)throw new Error('请导入 3～30 秒的单人台词片段，尽量去掉背景音乐');
  const frames=Math.round(decoded.duration*24000),offline=new OfflineAudioContext(1,frames,24000),source=offline.createBufferSource();source.buffer=decoded;source.connect(offline.destination);source.start();const rendered=await offline.startRendering(),pcm=rendered.getChannelData(0),bytes=new Uint8Array(44+pcm.length*2),view=new DataView(bytes.buffer);
  const ascii=(at,s)=>{for(let i=0;i<s.length;i++)bytes[at+i]=s.charCodeAt(i);};ascii(0,'RIFF');view.setUint32(4,bytes.length-8,true);ascii(8,'WAVEfmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,24000,true);view.setUint32(28,48000,true);view.setUint16(32,2,true);view.setUint16(34,16,true);ascii(36,'data');view.setUint32(40,pcm.length*2,true);
  for(let i=0;i<pcm.length;i++)view.setInt16(44+i*2,Math.round(Math.max(-1,Math.min(1,pcm[i]))*32767),true);
  let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));return {audio:btoa(binary),duration:decoded.duration};
}

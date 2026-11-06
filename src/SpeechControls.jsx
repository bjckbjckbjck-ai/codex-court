import React,{useEffect,useState} from 'react';
import {createPortal} from 'react-dom';
import {Volume2,Pause,Play,Square,Settings2,X,LoaderCircle} from 'lucide-react';

export function SpeechControls({speech,onSettings,contextKey}){
  const [selection,setSelection]=useState(null),[host,setHost]=useState(document.body);
  useEffect(()=>{speech.stop();setSelection(null);},[contextKey]);
  useEffect(()=>{
    let frame;
    const capture=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{
      const selected=window.getSelection();if(!selected||selected.isCollapsed||!selected.rangeCount)return setSelection(null);
      const range=selected.getRangeAt(0),node=range.commonAncestorContainer,element=node.nodeType===1?node:node.parentElement;
      const scope=element?.closest('.message-content,.mentor-answer,.evidence-inspect-surface');if(!scope||element.closest('input,textarea'))return setSelection(null);
      const text=selected.toString().trim(),rect=range.getBoundingClientRect();if(!text||rect.width===0)return setSelection(null);
      setSelection({text,left:Math.max(8,Math.min(innerWidth-156,rect.left)),top:Math.max(8,Math.min(innerHeight-42,rect.top-40)),host:scope.closest('dialog')||document.body});
    });};
    const hide=()=>setSelection(null),hostChange=()=>setHost(document.querySelector('dialog[open]')||document.body);
    const observer=new MutationObserver(hostChange);observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['open']});
    document.addEventListener('selectionchange',capture);document.addEventListener('pointerup',capture);document.addEventListener('keyup',capture);window.addEventListener('resize',hide);document.addEventListener('scroll',hide,true);
    return()=>{observer.disconnect();cancelAnimationFrame(frame);document.removeEventListener('selectionchange',capture);document.removeEventListener('pointerup',capture);document.removeEventListener('keyup',capture);window.removeEventListener('resize',hide);document.removeEventListener('scroll',hide,true);};
  },[]);
  const p=speech.playback,visible=p.state!=='idle';
  const labels={loading:'正在生成',playing:'正在朗读',paused:'已暂停',blocked:'点击继续播放',ended:'朗读完成',error:'朗读未开始'};
  return <>
    {selection?.host.isConnected&&createPortal(<button className="selection-speech" style={{left:selection.left,top:selection.top}} onMouseDown={e=>e.preventDefault()} onClick={()=>{speech.speak(selection.text);setSelection(null);}}><Volume2 size={15}/>朗读选中文本</button>,selection.host)}
    {visible&&createPortal(<div className="speech-player" role="region" aria-label="角色朗读播放器"><Volume2 size={18}/><div className="speech-player-label"><b>{p.title||'角色朗读'} <small>{labels[p.state]}</small></b><span title={p.text}>{speech.error||`${p.index||0} / ${p.total||0} 段 · ${p.text||''}`}</span></div>{p.state==='loading'&&<LoaderCircle size={16} className="spin"/>}{['playing','paused','blocked'].includes(p.state)&&<button aria-label={p.state==='playing'?'暂停朗读':'继续朗读'} onClick={speech.toggle}>{p.state==='playing'?<Pause size={16}/>:<Play size={16}/>}</button>}{!['ended','error'].includes(p.state)&&<button aria-label="停止朗读" onClick={speech.stop}><Square size={15}/></button>}<button aria-label="角色音色设置" onClick={onSettings}><Settings2 size={16}/></button>{['ended','error'].includes(p.state)&&<button aria-label="关闭朗读提示" onClick={speech.stop}><X size={16}/></button>}</div>,host)}
  </>;
}

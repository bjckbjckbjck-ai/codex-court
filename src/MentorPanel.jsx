import React,{useEffect,useLayoutEffect,useRef,useState} from 'react';
import { X,Send,Square,Lightbulb,Minus } from 'lucide-react';
import { api,markdown,mergeTurns,updateTurn } from './lib.js';
import { ApprovalCard } from './components.jsx';

const POSITION_KEY='court:mentor-position',ACTOR={width:104,height:148},GAP=12;
const viewport=()=>({width:window.visualViewport?.width||innerWidth,height:window.visualViewport?.height||innerHeight,left:window.visualViewport?.offsetLeft||0,top:window.visualViewport?.offsetTop||0});
function clampPosition(p,v){return {x:Math.max(GAP,Math.min(v.width-ACTOR.width-GAP,p.x)),y:Math.max(GAP,Math.min(v.height-ACTOR.height-GAP,p.y))};}
function initialPosition(){const v=viewport();try{const p=JSON.parse(localStorage.getItem(POSITION_KEY));if(Number.isFinite(p?.x)&&Number.isFinite(p?.y))return clampPosition(p,v);}catch{}return clampPosition({x:24,y:v.height-ACTOR.height-72},v);}
function rememberPosition(p){try{localStorage.setItem(POSITION_KEY,JSON.stringify(p));}catch{}}
const userText=item=>(item?.content||[]).filter(c=>c.type==='text').map(c=>c.text.split('\n\n<mentor_context>')[0].replace(/^【(?:讲懂它|再简单一点|只给提示|一步步带我|考考我|帮我记住)】/,'')).join('\n');

export function MentorPanel({open,onClose,sourceId,material,connection,requestKey,onDialogueChange,obscured=false}){
  const [session,setSession]=useState(null),[turns,setTurns]=useState([]),[active,setActive]=useState(null),[approvals,setApprovals]=useState([]);
  const [loading,setLoading]=useState(false),[sending,setSending]=useState(false),[error,setError]=useState(''),[draft,setDraft]=useState(''),[attach,setAttach]=useState(true);
  const [expanded,setExpanded]=useState(true),[position,setPosition]=useState(initialPosition),[view,setView]=useState(viewport),[dragging,setDragging]=useState(false),[bubbleHeight,setBubbleHeight]=useState(300);
  const idRef=useRef(null),threadRef=useRef(null),terminal=useRef(new Set()),scroll=useRef(),stick=useRef(true),serial=useRef(0),input=useRef(),actor=useRef(),bubble=useRef(),drag=useRef(null),positionRef=useRef(position),previousSource=useRef(sourceId),replyShown=useRef(new Set()),suppressClick=useRef(false),openRef=useRef(open);
  openRef.current=open;positionRef.current=position;
  const busy=!!active||sending,visible=open&&expanded&&!obscured;
  const latestTurn=turns.at(-1),items=latestTurn?.items||[];
  const answer=items.filter(i=>i.type==='agentMessage'&&i.text).map(i=>i.text).join('\n\n');
  const question=userText(items.find(i=>i.type==='userMessage'));
  const connected=session?.demo||connection.state==='connected';
  const canAsk=!!session&&!busy&&!loading&&connected;
  function applySnapshot(r){setSession(r.session);idRef.current=r.session.id;threadRef.current=r.session.threadId;setTurns(old=>mergeTurns(old,r.turns));setActive(r.activeTurn);setApprovals(r.approvals||[]);}
  useEffect(()=>{
    if(previousSource.current!==sourceId){previousSource.current=sourceId;setDraft('');setExpanded(false);}
    if(!open)return;
    const n=++serial.current;let disposed=false;
    idRef.current=null;threadRef.current=null;setLoading(true);setError('');setSession(null);setTurns([]);setActive(null);setSending(false);setApprovals([]);
    api('/mentor/sessions',{method:'POST',body:{sourceId:sourceId||'general'}}).then(r=>{
      if(disposed||serial.current!==n)return;
      for(const turn of r.turns)if(turn.items?.some(i=>i.type==='agentMessage'&&i.text))replyShown.current.add(turn.id);
      applySnapshot(r);
    }).catch(e=>{if(!disposed)setError(e.message);}).finally(()=>{if(!disposed)setLoading(false);});
    return()=>{disposed=true;};
  },[open,sourceId]);
  useEffect(()=>{if(open)setExpanded(true);},[open,requestKey]);
  useEffect(()=>{setAttach(true);},[material?.text,material?.image]);
  useEffect(()=>{onDialogueChange(visible);return()=>onDialogueChange(false);},[visible,onDialogueChange]);
  useEffect(()=>{
    const resize=()=>{const v=viewport();setView(v);setPosition(p=>clampPosition(p,v));};
    window.addEventListener('resize',resize);window.visualViewport?.addEventListener('resize',resize);window.visualViewport?.addEventListener('scroll',resize);
    return()=>{window.removeEventListener('resize',resize);window.visualViewport?.removeEventListener('resize',resize);window.visualViewport?.removeEventListener('scroll',resize);};
  },[]);
  useLayoutEffect(()=>{
    if(!visible||!bubble.current)return;
    const observer=new ResizeObserver(([entry])=>setBubbleHeight(entry.target.getBoundingClientRect().height));
    observer.observe(bubble.current);return()=>observer.disconnect();
  },[visible]);
  useEffect(()=>{
    const receive=e=>{
      const m=e.detail;
      if(m.type==='connection'&&m.connection.state==='error'){setActive(null);if(idRef.current)setError('导师连接中断，重新打开助手可恢复对话。');return;}
      if(m.type==='approval'&&m.request.params.threadId===threadRef.current){setApprovals(old=>[...old.filter(a=>a.id!==m.request.id),m.request]);return;}
      if(m.type==='approvalResolved'){setApprovals(old=>old.filter(a=>String(a.id)!==String(m.id)));return;}
      if(m.type!=='codex'||!idRef.current||(m.mentorSessionId!==idRef.current&&m.params?.threadId!==threadRef.current))return;
      const p=m.params;threadRef.current=p.threadId;
      setTurns(old=>updateTurn(old,m.method,p));
      if(m.method==='turn/started')setActive(p.turn.id);
      if(m.method==='turn/completed'){terminal.current.add(p.turn.id);setActive(null);setApprovals([]);if(p.turn.error)setError(p.turn.error.message||'导师回应未完成');}
      if(m.method==='error')setError(p.error?.message||p.message||'教学连接出错');
    };
    window.addEventListener('court-event',receive);return()=>window.removeEventListener('court-event',receive);
  },[]);
  useEffect(()=>{
    if(answer&&latestTurn&&!replyShown.current.has(latestTurn.id)){
      replyShown.current.add(latestTurn.id);if(openRef.current)setExpanded(true);
    }
    if(stick.current&&scroll.current)scroll.current.scrollTop=scroll.current.scrollHeight;
  },[turns,active,answer,latestTurn]);
  useEffect(()=>{
    if(!visible)return;
    const escape=e=>{if(e.key==='Escape'&&!document.querySelector('dialog[open]')){e.preventDefault();e.stopPropagation();setExpanded(false);actor.current?.focus({preventScroll:true});}};
    window.addEventListener('keydown',escape,true);return()=>window.removeEventListener('keydown',escape,true);
  },[visible]);
  async function ask(hint=false){
    if(!canAsk)return;const id=session.id,n=serial.current,text=hint?'再给我一条关键提示，先不要揭晓答案。':draft,context=attach?material:null;
    if(!text.trim()&&!context?.text)return;
    setSending(true);setError('');setExpanded(true);stick.current=true;
    try{
      const r=await api(`/mentor/sessions/${id}/turn`,{method:'POST',body:{text,mode:hint?'hint':'explain',context}});
      if(idRef.current!==id||serial.current!==n)return;
      threadRef.current=r.threadId;setSession(s=>({...s,threadId:r.threadId}));setTurns(old=>mergeTurns(old,[r.turn]));setActive(r.turn.status==='inProgress'&&!terminal.current.has(r.turn.id)?r.turn.id:null);if(!hint)setDraft('');
    }catch(e){if(idRef.current===id&&serial.current===n)setError(e.message);}finally{if(serial.current===n)setSending(false);}
  }
  async function stop(){try{await api(`/mentor/sessions/${session.id}/interrupt`,{method:'POST',body:{}});}catch(e){setError(e.message);}}
  function beginDrag(e){
    if(e.button!==0||!e.isPrimary)return;
    suppressClick.current=false;drag.current={pointerId:e.pointerId,startX:e.clientX,startY:e.clientY,origin:positionRef.current,moved:false};e.currentTarget.setPointerCapture(e.pointerId);
  }
  function moveDrag(e){
    const d=drag.current;if(!d||d.pointerId!==e.pointerId)return;
    const dx=e.clientX-d.startX,dy=e.clientY-d.startY;
    if(!d.moved&&Math.hypot(dx,dy)<5)return;
    d.moved=true;suppressClick.current=true;setDragging(true);
    const p=clampPosition({x:d.origin.x+dx,y:d.origin.y+dy},viewport());positionRef.current=p;setPosition(p);
  }
  function endDrag(e){
    const d=drag.current;if(!d||d.pointerId!==e.pointerId)return;
    if(d.moved)rememberPosition(positionRef.current);drag.current=null;setDragging(false);
    if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);
  }
  function moveWithKeys(e){
    const delta={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[e.key];if(!delta)return;
    e.preventDefault();e.stopPropagation();const step=e.shiftKey?40:12,p=clampPosition({x:position.x+delta[0]*step,y:position.y+delta[1]*step},view);setPosition(p);rememberPosition(p);
  }
  const width=Math.min(342,view.width-GAP*2),right=position.x+ACTOR.width+GAP,left=position.x-width-GAP;
  const side=right+width<=view.width-GAP?'right':left>=GAP?'left':'vertical';
  const above=position.y-GAP*2,below=view.height-position.y-ACTOR.height-GAP*2,placeAbove=above>=below;
  const maxHeight=Math.min(390,Math.max(Math.min(240,view.height-GAP*2),side==='vertical'?Math.max(above,below):view.height-GAP*2));
  const height=Math.min(bubbleHeight,maxHeight),bubbleX=side==='right'?right:side==='left'?left:Math.max(GAP,Math.min(view.width-width-GAP,position.x));
  const bubbleY=Math.max(GAP,Math.min(view.height-height-GAP,side==='vertical'?(placeAbove?position.y-GAP-height:position.y+ACTOR.height+GAP):position.y+ACTOR.height-height));
  if(!open||obscured)return null;
  return <section className={`mentor-assistant ${dragging?'is-dragging':''}`} aria-label="成步堂导师" role="region">
    {expanded&&<div className={`mentor-bubble bubble-${side==='vertical'?(placeAbove?'above':'below'):side}`} ref={bubble} id="mentor-dialogue" style={{left:bubbleX+view.left,top:bubbleY+view.top,width,maxHeight,'--mentor-tail':`${Math.max(22,Math.min(width-22,position.x+ACTOR.width/2-bubbleX))}px`}}>
      <header className="mentor-bubble-header"><div><b>成步堂龙一</b><span>{session?.demo?'本地教学示范':'AI 导师'}</span></div><button aria-label="收起导师对话" title="收起对话 · Esc" onClick={()=>{setExpanded(false);actor.current?.focus({preventScroll:true});}}><Minus size={17}/></button></header>
      <div className="mentor-speech" ref={scroll} onScroll={e=>{stick.current=e.currentTarget.scrollHeight-e.currentTarget.scrollTop-e.currentTarget.clientHeight<50;}}>
        {error&&<p className="mentor-error" role="alert">{error}</p>}
        {question&&<p className="mentor-question" title={question}>你：{question}</p>}
        {loading?<p className="mentor-greeting">稍等，我找找我们上次聊到哪里。</p>:answer?<div className="mentor-answer markdown" dangerouslySetInnerHTML={{__html:markdown(answer)}}/>:!busy?<p className="mentor-greeting">别急，我们一起想。<br/><span>把不懂的词或卡住的地方告诉我，<br/>先从一条线索开始。</span></p>:null}
        {approvals.map(request=><ApprovalCard key={request.id} request={request} onResolve={async(id,value)=>{await api(`/approvals/${id}`,{method:'POST',body:value});setApprovals(a=>a.filter(r=>r.id!==id));}}/>)}
        {busy&&<div className="mentor-thinking" role="status"><i/>我在整理线索…<button onClick={stop} disabled={!active}><Square size={11}/>暂停</button></div>}
        {latestTurn?.status==='interrupted'&&<small className="mentor-interrupted">讲解已暂停，可以接着问。</small>}
      </div>
      <form className="mentor-composer" onSubmit={e=>{e.preventDefault();ask();}}>
        {material?.text&&<label className="mentor-context" title={material.text.slice(0,300)}><input type="checkbox" checked={attach} onChange={e=>setAttach(e.target.checked)}/><span>带入：{material.title}</span></label>}
        <div className="mentor-input"><textarea ref={input} aria-label="向导师提问" rows={1} value={draft} onChange={e=>setDraft(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();ask();}}} placeholder="哪里不懂？问问我…"/><button type="submit" aria-label="请导师讲解" disabled={!canAsk||(!draft.trim()&&!(attach&&material?.text))}><Send size={16}/></button></div>
        <div className="mentor-bubble-footer"><button type="button" disabled={!canAsk||(!turns.length&&!(attach&&material?.text))} onClick={()=>ask(true)}><Lightbulb size={13}/>继续提示</button><small>{session?.demo?'预设回复 · 不调用模型':'本机 Codex · 只读学习'}</small></div>
      </form>
    </div>}
    <div className="mentor-actor-wrap" style={{left:position.x+view.left,top:position.y+view.top,width:ACTOR.width,height:ACTOR.height}}>
      <button className="mentor-dismiss" aria-label="关闭导师助手" title="关闭助手" onClick={onClose}><X size={13}/></button>
      <button className="mentor-actor" ref={actor} aria-label="成步堂助手，点击对话，拖动移动" aria-expanded={expanded} aria-controls="mentor-dialogue" title="点击对话 · 拖动换位置 · 方向键微调" onPointerDown={beginDrag} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag} onLostPointerCapture={endDrag} onKeyDown={moveWithKeys} onClick={e=>{if(e.detail!==0&&suppressClick.current){suppressClick.current=false;return;}setExpanded(v=>!v);}}>
        <img src="/assets/phoenix-mentor.png" alt="四代成步堂助手" draggable="false"/><span className="mentor-actor-label">{busy?'思考中…':expanded?'成步堂':'问问我'}</span>
        {busy&&<i className="mentor-actor-busy"/>}
      </button>
    </div>
  </section>;
}

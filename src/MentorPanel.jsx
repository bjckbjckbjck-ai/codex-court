import React,{useEffect,useRef,useState} from 'react';
import { X,BookOpen,BookmarkPlus,GraduationCap,Send,Square,Lightbulb,ChevronDown,ArrowRight,Check,Trash2,Pencil,RefreshCw,FolderOpen } from 'lucide-react';
import { api,markdown,mergeTurns,updateTurn } from './lib.js';
import { ApprovalCard,ToolActivity } from './components.jsx';

const MODES=[['explain','讲懂它'],['simplify','再简单一点'],['hint','只给提示'],['step','一步步带我'],['quiz','考考我'],['recall','帮我记住']];
const userText=item=>(item.content||[]).filter(c=>c.type==='text').map(c=>c.text.split('\n\n<mentor_context>')[0]).join('\n');
export function MentorPanel({open,onClose,sourceId,material,connection}){
  const [session,setSession]=useState(null),[turns,setTurns]=useState([]),[cursor,setCursor]=useState(null),[active,setActive]=useState(null),[approvals,setApprovals]=useState([]);
  const [loading,setLoading]=useState(false),[sending,setSending]=useState(false),[error,setError]=useState(''),[draft,setDraft]=useState(''),[mode,setMode]=useState('explain'),[tab,setTab]=useState('chat');
  const [attach,setAttach]=useState(true),[editing,setEditing]=useState(null),[saving,setSaving]=useState(false),[revealed,setRevealed]=useState({}),[settings,setSettings]=useState(false),[level,setLevel]=useState('beginner'),[goal,setGoal]=useState(''),[cwd,setCwd]=useState('');
  const idRef=useRef(null),threadRef=useRef(null),terminal=useRef(new Set()),scroll=useRef(),stick=useRef(true),serial=useRef(0),input=useRef();
  const busy=!!active||sending;
  function applySnapshot(r,older=false){setSession(r.session);idRef.current=r.session.id;threadRef.current=r.session.threadId;setTurns(old=>older?mergeTurns(r.turns,old):mergeTurns(old,r.turns));setCursor(r.nextCursor);setActive(r.activeTurn);setApprovals(r.approvals||[]);}
  useEffect(()=>{
    if(!open)return;
    const n=++serial.current;let disposed=false;
    idRef.current=null;threadRef.current=null;setLoading(true);setError('');setSession(null);setTurns([]);setActive(null);setDraft('');setEditing(null);setApprovals([]);setSettings(false);setTab('chat');
    api('/mentor/sessions',{method:'POST',body:{sourceId:sourceId||'general'}}).then(r=>{
      if(disposed||serial.current!==n)return;applySnapshot(r);setLevel(r.session.preferences.level);setGoal(r.session.preferences.goal);setCwd(r.session.cwd);
    }).catch(e=>{if(!disposed)setError(e.message);}).finally(()=>{if(!disposed)setLoading(false);});
    return()=>{disposed=true;};
  },[open,sourceId]);
  useEffect(()=>{setAttach(true);},[material?.text]);
  useEffect(()=>{
    const receive=e=>{
      const m=e.detail;
      if(m.type==='connection'&&m.connection.state==='error'){setActive(null);setError('导师连接中断，可重新打开导师恢复历史。');return;}
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
  useEffect(()=>{if(stick.current&&scroll.current)scroll.current.scrollTop=scroll.current.scrollHeight;},[turns,active]);
  useEffect(()=>{if(open&&!loading)input.current?.focus({preventScroll:true});},[open,loading]);
  async function ask(custom={}){
    if(!session||busy)return;const id=session.id;
    const text=custom.text??draft,teachingMode=custom.mode||mode,context=custom.context??(attach?material:null);
    if(!text.trim()&&!context?.text&&!turns.length)return;
    setSending(true);setError('');setTab('chat');stick.current=true;
    try{
      const r=await api(`/mentor/sessions/${id}/turn`,{method:'POST',body:{text,mode:teachingMode,context}});
      if(idRef.current!==id)return;
      threadRef.current=r.threadId;setSession(s=>({...s,threadId:r.threadId}));setTurns(old=>mergeTurns(old,[r.turn]));setActive(r.turn.status==='inProgress'&&!terminal.current.has(r.turn.id)?r.turn.id:null);setDraft('');
    }catch(e){if(idRef.current===id)setError(e.message);}finally{setSending(false);}
  }
  async function refresh(older=false){const id=idRef.current;if(!id)return;try{const r=await api(`/mentor/sessions/${id}${older&&cursor?'?cursor='+encodeURIComponent(cursor):''}`);if(idRef.current===id)applySnapshot(r,older);}catch(e){setError(e.message);}}
  async function stop(){try{await api(`/mentor/sessions/${session.id}/interrupt`,{method:'POST',body:{}});}catch(e){setError(e.message);}}
  async function savePreferences(e){e.preventDefault();const id=session.id;setSaving(true);try{const r=await api(`/mentor/sessions/${id}/preferences`,{method:'PATCH',body:{level,goal,...(session.sourceId==='general'&&!session.threadId?{cwd}:{})}});if(idRef.current!==id)return;applySnapshot(r);setSettings(false);}catch(e){if(idRef.current===id)setError(e.message);}finally{setSaving(false);}}
  async function saveCard(e){e.preventDefault();const id=session.id;setSaving(true);try{const card=await api(`/mentor/sessions/${id}/cards${editing.id?'/'+editing.id:''}`,{method:editing.id?'PATCH':'POST',body:editing});if(idRef.current!==id)return;setSession(s=>({...s,cards:[...s.cards.filter(c=>c.id!==card.id),card]}));setEditing(null);setTab('cards');}catch(e){if(idRef.current===id)setError(e.message);}finally{setSaving(false);}}
  async function patchCard(card,patch){const id=session.id;try{const updated=await api(`/mentor/sessions/${id}/cards/${card.id}`,{method:'PATCH',body:patch});if(idRef.current===id)setSession(s=>({...s,cards:s.cards.map(c=>c.id===card.id?updated:c)}));}catch(e){if(idRef.current===id)setError(e.message);}}
  function collect(text){setEditing({title:material?.title?.slice(0,120)||'今天弄懂的一件事',content:text,source:material?.source||session?.title||'',status:'learning'});setTab('cards');}
  if(!open)return null;
  return <section className="mentor-panel" aria-label="成步堂导师" role="region" onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();onClose();}}}>
    <header className="mentor-hero"><div className="mentor-intro"><span className="mentor-eyebrow">NARUHODO · MENTOR</span><h2>别急，我们一起想。</h2><p>一个词，一条线索。<br/>直到你能用自己的话讲出来。</p><span className="mentor-name">成步堂龙一 <small>四代 · AI 导师</small></span></div><img src="/assets/phoenix-mentor.png" alt="戴针织帽、穿蓝色连帽衫的四代成步堂，微笑着托腮思考"/><button className="mentor-close" aria-label="收起导师" onClick={onClose}><X size={18}/></button></header>
    <div className="mentor-session"><span><GraduationCap size={15}/>{session?.title||'正在打开学习档案…'}</span><button aria-label="学习偏好" onClick={()=>setSettings(!settings)} disabled={!session}><ChevronDown size={15}/></button></div>
    {session?.demo&&<div className="mentor-demo">本地教学示范 · 预设回复，不调用模型。实际项目中使用你的 Codex。</div>}
    {settings&&session&&<form className="mentor-preferences" onSubmit={savePreferences}><label>我的基础<select aria-label="学习基础" value={level} onChange={e=>setLevel(e.target.value)}><option value="beginner">刚开始接触，先讲白话</option><option value="familiar">有些基础，结合项目讲</option><option value="advanced">已有经验，深入机制和边界</option></select></label><label>这次想学会什么<input aria-label="学习目标" value={goal} maxLength={600} onChange={e=>setGoal(e.target.value)} placeholder="例如：能独立看懂这个项目的登录流程"/></label>{session.sourceId==='general'&&!session.threadId&&<label>要阅读的本地项目<input aria-label="导师项目目录" value={cwd} onChange={e=>setCwd(e.target.value)}/><small>没有代码问题时直接提问即可。对话开始后固定此目录。</small></label>}<button className="primary-button" disabled={saving}>保存学习偏好</button></form>}
    <div className="mentor-tabs" role="tablist" aria-label="导师内容"><button role="tab" aria-selected={tab==='chat'} onClick={()=>setTab('chat')}><Lightbulb size={15}/>一起理解</button><button role="tab" aria-selected={tab==='cards'} onClick={()=>setTab('cards')}><BookOpen size={15}/>知识卡 <span>{session?.cards.length||0}</span></button><button aria-label="刷新教学对话" onClick={()=>refresh()} disabled={loading||!session}><RefreshCw size={14}/></button></div>
    {error&&<div className="mentor-error" role="alert">{error}</div>}
    <div className="mentor-scroll" ref={scroll} onScroll={e=>{stick.current=e.currentTarget.scrollHeight-e.currentTarget.scrollTop-e.currentTarget.clientHeight<100;}}>
      {loading?<p className="mentor-empty">正在找回你的学习进度…</p>:tab==='chat'?<>
        {cursor&&<button className="load-more" onClick={()=>refresh(true)}>读取更早的教学对话</button>}
        {!turns.length&&<div className="mentor-welcome"><span>先从卡住的地方开始</span><h3>不必一下记住全部。</h3><p>把陌生的词、绕不过去的代码，或工作里复杂的一段话交给我。我们先找出关键，再一步步接起来。</p><div>{['这个专业词到底是什么意思？','带我读懂项目里的这段逻辑','我总记不住，帮我建立一个记忆方法'].map(t=><button key={t} onClick={()=>{setDraft(t);input.current?.focus();}}>{t}<ArrowRight size={13}/></button>)}</div></div>}
        {turns.map(turn=><div key={turn.id} className="mentor-turn">{(turn.items||[]).filter(i=>i.type==='agentMessage'||i.type==='userMessage').map(item=><article key={item.id} className={`mentor-message ${item.type==='userMessage'?'student':'teacher'}`}><div className="mentor-speaker">{item.type==='userMessage'?'你':'成步堂 · 导师'}</div><div className="markdown" dangerouslySetInnerHTML={{__html:markdown(item.type==='userMessage'?userText(item):item.text)}}/>{item.type==='agentMessage'&&item.text&&turn.status!=='inProgress'&&<button className="mentor-collect" onClick={()=>collect(item.text)}><BookmarkPlus size={14}/>整理成知识卡</button>}</article>)}<ToolActivity items={turn.items||[]}/>{turn.status==='interrupted'&&<small className="mentor-interrupted">本次讲解已暂停</small>}</div>)}
        {approvals.map(request=><ApprovalCard key={request.id} request={request} onResolve={async(id,value)=>{await api(`/approvals/${id}`,{method:'POST',body:value});setApprovals(a=>a.filter(r=>r.id!==id));}}/>)}
        {busy&&<div className="mentor-thinking" role="status"><i/><span>成步堂正在整理线索…</span><button onClick={stop} disabled={!active}><Square size={12}/>暂停讲解</button></div>}
      </>:<div className="mentor-cards"><div className="mentor-cards-heading"><p>先回想，再揭开答案。<br/><small>用自己的话写下来，比背原句更牢。</small></p><button aria-label="新增知识卡" onClick={()=>setEditing({title:'',content:'',source:'',status:'learning'})}><BookmarkPlus size={18}/></button></div>
        {editing&&<form className="knowledge-editor" onSubmit={saveCard}><label>知识点<input required maxLength={120} aria-label="知识卡标题" value={editing.title} onChange={e=>setEditing({...editing,title:e.target.value})}/></label><label>我的理解<textarea required maxLength={18000} rows={6} aria-label="知识卡内容" value={editing.content} onChange={e=>setEditing({...editing,content:e.target.value})}/></label><label>项目位置 / 来源<input maxLength={300} aria-label="知识卡来源" value={editing.source} onChange={e=>setEditing({...editing,source:e.target.value})}/></label><div><button type="button" onClick={()=>setEditing(null)}>取消</button><button className="primary-button" disabled={saving}>保存知识卡</button></div></form>}
        {!session?.cards.length&&!editing&&<p className="mentor-empty">还没有知识卡。讲解后点“整理成知识卡”，留下真正需要记住的部分。</p>}
        {session?.cards.slice().reverse().map(card=><article className={`knowledge-card ${card.status}`} key={card.id}><header><span>{card.status==='known'?'已掌握':'待复习'}</span><div><button aria-label={`编辑知识卡：${card.title}`} onClick={()=>setEditing({...card})}><Pencil size={13}/></button><button aria-label={`删除知识卡：${card.title}`} onClick={async()=>{try{await api(`/mentor/sessions/${session.id}/cards/${card.id}`,{method:'DELETE'});setSession(s=>({...s,cards:s.cards.filter(c=>c.id!==card.id)}));}catch(e){setError(e.message);}}}><Trash2 size={13}/></button></div></header><h3>{card.title}</h3>{card.source&&<small>{card.source}</small>}{revealed[card.id]?<div className="markdown" dangerouslySetInnerHTML={{__html:markdown(card.content)}}/>:<button className="reveal-card" onClick={()=>setRevealed(v=>({...v,[card.id]:true}))}>先试着回忆，再查看解释<ChevronDown size={14}/></button>}<footer><button disabled={busy} onClick={()=>ask({mode:'quiz',text:`围绕这张知识卡考考我：${card.title}`,context:{title:card.title,text:card.content,source:card.source}})}>让导师考我</button><button onClick={()=>patchCard(card,{status:card.status==='known'?'learning':'known'})}><Check size={13}/>{card.status==='known'?'还需复习':'我记住了'}</button></footer></article>)}
      </div>}
    </div>
    {tab==='chat'&&<form className="mentor-composer" onSubmit={e=>{e.preventDefault();ask();}}>{material?.text&&<label className="mentor-context"><input type="checkbox" checked={attach} onChange={e=>setAttach(e.target.checked)}/><span><b>带入：{material.title}</b><small>{material.text.slice(0,100)}</small></span></label>}<div className="mentor-modes" role="group" aria-label="教学方式">{MODES.map(([id,label])=><button type="button" key={id} aria-pressed={mode===id} className={mode===id?'active':''} onClick={()=>setMode(id)}>{label}</button>)}</div><div className="mentor-input"><textarea ref={input} aria-label="向导师提问" rows={2} value={draft} onChange={e=>setDraft(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();ask();}}} placeholder={mode==='hint'?'哪里卡住了？我先给一条提示…':'哪里不懂？用自己的话问就好…'}/><button type="submit" aria-label="请导师讲解" disabled={busy||!session||loading||(!session.demo&&connection.state!=='connected')}><Send size={17}/></button></div><small className="mentor-footnote">独立学习对话 · {session?.demo?'预设教学示范':'使用本机 Codex 额度 · 只读项目'} · Enter 发送</small></form>}
  </section>;
}

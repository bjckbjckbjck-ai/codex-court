import React, { useEffect, useRef, useState } from 'react';
import { Scale, Plus, Search, ArrowUpRight, ArrowRight, RefreshCw, FolderOpen, Files, BookOpen, Gavel, CircleHelp, Volume2, VolumeX, Settings2, ChevronRight, ChevronLeft, ChevronDown, FileText, Image, Quote, Check, X, MoreHorizontal, Send, Square, Paperclip, Download, Archive, Clock3, ShieldCheck, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, Sparkles, MessageSquareText, Target, Link2, Copy, Trash2, FlaskConical, CircleAlert, LogOut, CornerDownLeft, LoaderCircle, CheckCheck, ExternalLink, ListChecks, SearchCheck } from 'lucide-react';
import { api, setToken, updateTurn, mergeTurns, dateLabel, playAccent, actionLabels, markdown } from './lib.js';
import { IconButton, Modal, EvidenceForm, Message, ToolActivity, ApprovalCard, NewCase } from './components.jsx';
import { Music2, GraduationCap, Zap } from 'lucide-react';
import { CourtSettings } from './CourtSettings.jsx';
import { ObjectionEffect } from './ObjectionEffect.jsx';
import { useMusic } from './useMusic.js';
import { PHASES } from '../shared/music.mjs';
import { MentorPanel } from './MentorPanel.jsx';
import { EvidenceViewer } from './EvidenceViewer.jsx';

const EMPTY_RECORD = { evidence: [], examinations: [] };
const resolutionLabels = {pending:'待复核',upheld:'维持原句',revised:'已修正',uncertain:'仍待验证'};

export default function App() {
  const [boot,setBoot]=useState(null), [connection,setConnection]=useState({state:'connecting'}), [threads,setThreads]=useState([]), [listCursor,setListCursor]=useState(null), [search,setSearch]=useState(''), [archived,setArchived]=useState(false), [listBusy,setListBusy]=useState(false);
  const [current,setCurrent]=useState(null), [turns,setTurns]=useState([]), [historyCursor,setHistoryCursor]=useState(null), [record,setRecord]=useState(EMPTY_RECORD), [loading,setLoading]=useState(false), [locked,setLocked]=useState(false);
  const [selected,setSelected]=useState(null), [action,setAction]=useState('chat'), [draft,setDraft]=useState(''), [evidenceIds,setEvidenceIds]=useState([]), [sending,setSending]=useState(false), [activeTurn,setActiveTurn]=useState(null), [pendingApprovals,setPendingApprovals]=useState([]);
  const [tab,setTab]=useState('evidence'), [modal,setModal]=useState(null), [evidenceDetail,setEvidenceDetail]=useState(null), [toast,setToast]=useState(null), [error,setError]=useState(''), [sound,setSound]=useState(()=>localStorage.getItem('court:sound')==='true'), [effects,setEffects]=useState(()=>localStorage.getItem('court:effects')!=='false');
  const [burst,setBurst]=useState(''), [model,setModel]=useState(''), [effort,setEffort]=useState(''), [leftOpen,setLeftOpen]=useState(()=>innerWidth>=1050), [rightOpen,setRightOpen]=useState(()=>innerWidth>720), [compactStage,setCompactStage]=useState(false), [viewportWidth,setViewportWidth]=useState(innerWidth);
  const currentRef=useRef(null), openSerial=useRef(0), scrollRef=useRef(), stickBottom=useRef(true), composerRef=useRef(), toastTimer=useRef(), listSerial=useRef(0);
  const terminalTurns=useRef(new Set());
  const burstTimer=useRef(), sentAction=useRef('chat');
  const music=useMusic(!!boot);
  const [mentorOpen,setMentorOpen]=useState(false),[mentorMaterial,setMentorMaterial]=useState(null),[mentorRequest,setMentorRequest]=useState(0),[mentorDialogue,setMentorDialogue]=useState(false),[fastQuestioning,setFastQuestioning]=useState(false);
  const fastRef=useRef(false);fastRef.current=fastQuestioning;
  const questioningPhase=()=>fastRef.current?'questioning_fast':'questioning';
  const latestExplanation=turns.flatMap(t=>t.items||[]).filter(i=>i.type==='agentMessage'&&i.text).at(-1);
  const teachingMaterial=mentorMaterial||(selected?{title:'选中的证言',text:selected.text,source:`消息 ${selected.itemId}`} :latestExplanation?{title:'当前最近一段回复',text:latestExplanation.text.slice(0,12000),source:`消息 ${latestExplanation.id}`} :null);
  useEffect(()=>{music.setFocusPhase(evidenceDetail||(mentorOpen&&mentorDialogue)?'logic':null);},[!!evidenceDetail,mentorOpen,mentorDialogue]);
  function openMentor(material=null){setMentorMaterial(material);setMentorOpen(true);setMentorRequest(n=>n+1);}
  const running=!!activeTurn, training=current?.id==='training';
  const chosenModel=(boot?.models||[]).find(m=>m.model===(model||current?.model));
  function showEffect(kind, force=false) {
    if(sound)playAccent(kind);
    if(effects||force){clearTimeout(burstTimer.current);setBurst({kind,key:Date.now()});burstTimer.current=setTimeout(()=>setBurst(null),1800);}
  }
  useEffect(()=>()=>clearTimeout(burstTimer.current),[]);

  function notify(message) {clearTimeout(toastTimer.current);setToast(message);toastTimer.current=setTimeout(()=>setToast(null),4000);}
  async function refreshBootstrap() { const b=await api('/bootstrap');setToken(b.token);setBoot(b);setConnection(b.connection);return b; }
  async function loadThreads(cursor=null, term=search, archive=archived) {
    const serial=++listSerial.current;setListBusy(true);
    try {const p=new URLSearchParams({search:term,archived:String(archive)});if(cursor)p.set('cursor',cursor);const list=await api('/threads?'+p);if(serial!==listSerial.current)return;setThreads(old=>cursor?[...old,...list.data]:list.data);setListCursor(list.nextCursor);}catch(e){if(serial===listSerial.current && connection.state==='connected')notify(e.message);}finally{if(serial===listSerial.current)setListBusy(false);}
  }
  useEffect(()=>{
    let events, disposed=false;
    (async()=>{
      try {
        await refreshBootstrap();if(disposed)return;
        events=new EventSource('/api/events');
        events.onmessage=e=>{
          const msg=JSON.parse(e.data), id=currentRef.current;
          window.dispatchEvent(new CustomEvent('court-event',{detail:msg}));
          if(msg.type==='connection') {setConnection(msg.connection);if(msg.connection.state==='connected'){refreshBootstrap();loadThreads();}if(msg.connection.state==='error'){setActiveTurn(null);setPendingApprovals([]);setError(msg.connection.detail);}return;}
          if(msg.type==='approvalResolved'){setPendingApprovals(old=>old.filter(a=>String(a.id)!==String(msg.id)));return;}
          if(msg.type==='approval' && msg.request.params.threadId===id){setPendingApprovals(old=>[...old.filter(a=>a.id!==msg.request.id),msg.request]);return;}
          if(msg.type==='notice' && (!msg.threadId||msg.threadId===id))notify(msg.message);
          if(msg.type!=='codex'||msg.params?.threadId!==id)return;
          const p=msg.params;
          setTurns(old=>updateTurn(old,msg.method,p));
          if(msg.method==='turn/started'){setActiveTurn(p.turn.id);setError('');}
          if(msg.method==='turn/completed'){
            terminalTurns.current.add(p.turn.id);
            setActiveTurn(null);setPendingApprovals([]);
            if(p.turn.status==='interrupted')music.changePhase('recess',{automatic:true});
            else if(sentAction.current!=='object')music.changePhase(questioningPhase(),{automatic:true});
            if(p.turn.error)setError(p.turn.error.message||'回应未完成，请查看执行记录');
            api(`/cases/${id}/record`).then(r=>{if(currentRef.current===id)setRecord(r);}).catch(()=>{});
          }
          if(msg.method==='serverRequest/resolved')setPendingApprovals(old=>old.filter(a=>a.id!==p.requestId));
          if(msg.method==='error')setError(p.error?.message||p.message||'Codex 返回错误');
        };
        let reconnecting=false;
        events.onerror=()=>{reconnecting=true;notify('正在恢复事件连接…');};
        events.onopen=()=>{if(reconnecting&&currentRef.current){reloadCurrent();reconnecting=false;}};
        loadThreads(null,'',false);
        const wanted=new URLSearchParams(location.search).get('thread');
        if(wanted)openCase(wanted);
      }catch(e){setConnection({state:'error',detail:e.message});}
    })();
    return()=>{disposed=true;events?.close();clearTimeout(toastTimer.current);};
  },[]);
  useEffect(()=>{if(!boot)return;const timer=setTimeout(()=>loadThreads(null,search,archived),250);return()=>clearTimeout(timer);},[search,archived]);
  useEffect(()=>{ if(stickBottom.current && scrollRef.current) scrollRef.current.scrollTop=scrollRef.current.scrollHeight; },[turns,pendingApprovals]);
  useEffect(()=>{
    const key=e=>{if(document.querySelector('dialog[open]'))return;if(e.key==='Escape'){setSelected(null);setAction('chat');if(innerWidth<1050)setLeftOpen(false);if(innerWidth<=720)setRightOpen(false);}if((e.ctrlKey||e.metaKey)&&e.key==='k'){e.preventDefault();setLeftOpen(true);if(innerWidth<=720)setRightOpen(false);setTimeout(()=>document.querySelector('#case-search')?.focus(),0);}};
    const resize=()=>{setViewportWidth(innerWidth);if(innerWidth<1050)setLeftOpen(false);if(innerWidth<=720)setRightOpen(false);};
    window.addEventListener('keydown',key);window.addEventListener('resize',resize);return()=>{window.removeEventListener('keydown',key);window.removeEventListener('resize',resize);};
  },[]);

  async function openCase(id) {
    setMentorMaterial(null);setFastQuestioning(false);fastRef.current=false;
    const serial=++openSerial.current;currentRef.current=id;setLoading(true);setError('');setSelected(null);setAction('chat');setEvidenceIds([]);setDraft('');setTurns([]);setRecord(EMPTY_RECORD);setActiveTurn(null);setPendingApprovals([]);setModel('');setEffort('');stickBottom.current=true;
    try {
      const result=await api(`/cases/${id}`);if(serial!==openSerial.current)return;
      setCurrent(result.thread);setTurns(result.turns);setHistoryCursor(result.nextCursor);setRecord(result.record);setLocked(result.locked);setActiveTurn(result.activeTurn);setPendingApprovals(result.approvals||[]);
      music.changePhase('opening',{automatic:true,after:'questioning'});
      history.replaceState(null,'',`?thread=${id}`);
      if(window.innerWidth<1050)setLeftOpen(false);
    }catch(e){if(serial===openSerial.current){setCurrent(null);currentRef.current=null;setError(e.message);}}finally{if(serial===openSerial.current)setLoading(false);}
  }
  async function reloadCurrent(older=false) {
    const id=currentRef.current;if(!id)return;
    try { const result=await api(`/cases/${id}${older&&historyCursor?'?cursor='+encodeURIComponent(historyCursor):''}`);if(currentRef.current!==id)return;
      setTurns(old=>older?mergeTurns(result.turns,old):mergeTurns(old,result.turns));setRecord(result.record);setLocked(result.locked);setActiveTurn(result.activeTurn);setPendingApprovals(result.approvals||[]);if(older||!turns.length)setHistoryCursor(result.nextCursor);
    }catch(e){setError(e.message);}
  }
  function chooseStatement(quote) {setMentorMaterial(null);setSelected(quote);setAction('press');music.changePhase(questioningPhase(),{automatic:true});if(innerWidth>720)setRightOpen(true);composerRef.current?.focus({preventScroll:true});}
  function chooseAction(next) {
    if(!selected){notify('先点击一条 Codex 证言，或划选其中的文字。');return;}
    setAction(next);if(next==='present'){setTab('evidence');music.changePhase('investigation',{automatic:true});}composerRef.current?.focus({preventScroll:true});
  }
  async function send() {
    if(!current||sending||running)return;
    if(action==='chat'&&!draft.trim()&&!evidenceIds.length)return;
    const id=current.id, sendingAction=action;
    setSending(true);setError('');stickBottom.current=true;
    sentAction.current=sendingAction;
    if(sendingAction==='press'&&evidenceIds.length&&music.library.settings.bindings.some(b=>b.version===music.library.settings.version&&b.phase==='questioning_fast')){setFastQuestioning(true);fastRef.current=true;}
    if(sendingAction!=='chat')showEffect(sendingAction);
    music.changePhase(({chat:'thinking',press:questioningPhase(),present:'investigation',verify:'investigation',object:'objection'})[sendingAction],{automatic:true,...(sendingAction==='object'?{after:'pursuit'}:{})});
    try {
      const result=await api(`/cases/${id}/turn`,{method:'POST',body:{text:draft,action,quote:selected,evidenceIds,model,effort}});
      if(currentRef.current!==id)return;
      setTurns(old=>mergeTurns(old,[result.turn]));setRecord(result.record);setActiveTurn(result.turn.status==='inProgress'&&!terminalTurns.current.has(result.turn.id)?result.turn.id:null);setDraft('');setEvidenceIds([]);setSelected(null);setAction('chat');setLocked(false);
    }catch(e){setError(e.message);clearTimeout(burstTimer.current);setBurst(null);music.changePhase('questioning',{automatic:true});}finally{setSending(false);}
  }
  async function stop(){try{await api(`/cases/${current.id}/interrupt`,{method:'POST',body:{}});}catch(e){setError(e.message);}}
  async function copy(text){try{await navigator.clipboard.writeText(text);notify('已复制');}catch{notify('浏览器未允许复制，请手动选择文字。');}}
  function toggleEvidence(id){setEvidenceIds(old=>old.includes(id)?old.filter(x=>x!==id):old.length>=8?(notify('每次最多出示 8 份证据'),old):[...old,id]);}
  async function addEvidence(input){const id=currentRef.current;const item=await api(`/cases/${id}/evidence`,{method:'POST',body:input});if(currentRef.current===id){setRecord(old=>({...old,evidence:[...old.evidence,item]}));setEvidenceIds(old=>[...old,item.id].slice(0,8));notify('证据已收录，并加入本次出示');}}
  async function removeEvidence(item){try{const r=await api(`/cases/${current.id}/evidence/${item.id}`,{method:'DELETE'});setRecord(r);setEvidenceIds(old=>old.filter(id=>id!==item.id));setEvidenceDetail(null);notify('证据已移除；历史质询仍保留证据名称和指纹。');}catch(e){notify(e.message);}}
  async function changeResolution(id,resolution){try{setRecord(await api(`/cases/${current.id}/examinations/${id}`,{method:'PATCH',body:{resolution}}));}catch(e){notify(e.message);}}
  function home(){if(innerWidth<1050)setLeftOpen(false);if(innerWidth<=720)setRightOpen(false);setMentorMaterial(null);openSerial.current++;currentRef.current=null;setCurrent(null);setTurns([]);setRecord(EMPTY_RECORD);setSelected(null);setError('');setActiveTurn(null);setLoading(false);music.changePhase('recess',{automatic:true});history.replaceState(null,'',location.pathname);}
  async function reconnect(){setConnection({state:'connecting'});try{const b=await api('/connect',{method:'POST',body:{}});setConnection(b.connection);await refreshBootstrap();await loadThreads();}catch(e){setConnection({state:'error',detail:e.message});}}
  function goToTurn(id){document.getElementById('turn-'+id)?.scrollIntoView({behavior:'smooth',block:'start'});}

  return <div className={`app-shell ${!leftOpen?'left-collapsed':''} ${!rightOpen?'right-collapsed':''}`}>
    <audio ref={music.audioRef} className="court-audio" hidden preload="metadata" aria-label="法庭背景音乐"/>
    {((viewportWidth<1050&&leftOpen)||(viewportWidth<=720&&rightOpen))&&<button className="drawer-backdrop" aria-label="关闭侧栏" onClick={()=>{setLeftOpen(false);setRightOpen(false);}}/>}
    <aside className={`sidebar ${leftOpen?'open':''}`}>
      <button className="brand" onClick={home} aria-label="异议 首页"><img src="/assets/seal.svg" alt=""/><span><strong>异议<span className="brand-dot">.</span></strong><small>CODEX COURT</small></span><span className="brand-edition">01</span></button>
      <button className="new-case" onClick={()=>setModal('new')} disabled={connection.state!=='connected'}><Plus size={18}/><span>开启新庭审</span><span className="key-hint">＋</span></button>
      <label className="search-box"><Search size={16}/><input id="case-search" placeholder="查找你的会话" value={search} onChange={e=>setSearch(e.target.value)}/><kbd>⌃ K</kbd></label>
      <div className="sidebar-label"><span>案件档案 <small>{threads.length}{listCursor?'+':''}</small></span><div><IconButton icon={Archive} label={archived?'查看进行中的会话':'查看归档会话'} className={`icon-button ${archived?'is-active':''}`} onClick={()=>setArchived(!archived)}/><IconButton icon={RefreshCw} label="刷新会话列表" onClick={()=>loadThreads()}/></div></div>
      <div className="thread-list">{archived&&<div className="archive-label">已归档的会话 · 仅浏览</div>}{listBusy&&!threads.length?<div className="list-placeholder"><LoaderCircle className="spin" size={17}/>读取会话档案…</div>:threads.map((thread,i)=><button className={`thread-row ${current?.id===thread.id?'active':''}`} key={thread.id} onClick={()=>openCase(thread.id)}><span className="thread-symbol"><FolderOpen size={16}/></span><span className="thread-text"><b>{thread.name||thread.preview?.slice(0,60)||'未命名会话'}</b><small>{thread.cwd?.split(/[\\/]/).filter(Boolean).at(-1)||'Codex'}<i/> {dateLabel(thread.updatedAt)}</small></span>{current?.id===thread.id&&<span className="thread-current"/>}</button>)}
        {!listBusy&&!threads.length&&<div className="list-placeholder">{search?'没有找到匹配的会话':connection.state==='connected'?'暂无会话，开启新庭审吧':'连接后，你的会话会出现在这里'}</div>}
        {listCursor&&<button className="load-more" disabled={listBusy} onClick={()=>loadThreads(listCursor)}>{listBusy?'读取中…':'加载更多档案'}<ChevronDown size={13}/></button>}
      </div>
      <button className={`training-link ${training?'active':''}`} onClick={()=>openCase('training')}><FlaskConical size={18}/><span><b>练习庭 · 第一次异议</b><small>熟悉流程，不消耗额度</small></span><ArrowUpRight size={16}/></button>
      <div className="sidebar-bottom"><button className="connection-status" onClick={()=>setModal('settings')}><span className={`status-dot ${connection.state==='connected'?'online':connection.state==='connecting'?'loading':''}`}/><span><b>{connection.state==='connected'?'本机 Codex 已连接':connection.state==='connecting'?'连接本机 Codex…':connection.state==='demo'?'隔离测试模式':'Codex 未连接'}</b><small>{boot?.account?.type==='chatgpt'?`ChatGPT ${boot.account.plan||''} · 使用现有登录`:'本地优先 · 你的会话档案'}</small></span></button><IconButton icon={Settings2} label="客户端设置" onClick={()=>setModal('settings')}/></div>
    </aside>

    <main className="workspace">
      <header className="workspace-header"><div className="breadcrumb"><IconButton icon={leftOpen?PanelLeftClose:PanelLeftOpen} label={leftOpen?'收起案件档案':'展开案件档案'} onClick={()=>setLeftOpen(!leftOpen)}/><span className="breadcrumb-home" onClick={home}>法庭</span><ChevronRight size={13}/><strong>{current?.name||'让每一个结论，经得起追问'}</strong>{training&&<span className="demo-tag">本地演练</span>}</div><div className="header-actions"><button className={`mentor-header-button ${mentorOpen?"active":""}`} aria-label="成步堂导师" aria-pressed={mentorOpen} onClick={()=>openMentor()}><GraduationCap size={17}/><span>导师</span></button>{current&&<button className={`tempo-button ${fastQuestioning?"active":""}`} aria-label="关键追问" aria-pressed={fastQuestioning} title="切换慢速 / 快速询问配乐" onClick={()=>{const next=!fastQuestioning;setFastQuestioning(next);fastRef.current=next;music.changePhase(next?"questioning_fast":"questioning",{automatic:true});if(next&&!music.library.settings.bindings.some(b=>b.version===music.library.settings.version&&b.phase==="questioning_fast"))notify("快询问曲位尚未分配，请在配乐设置中导入并选择。");}}><Zap size={15}/><span>{fastQuestioning?"关键追问":"慢速询问"}</span></button>}<button className="music-header" aria-label="背景音乐设置" onClick={()=>setModal({type:'settings',tab:'music'})}><Music2 size={16}/><span>{music.playback.state==='playing'?PHASES.find(p=>p.id===music.phase)?.label:'配乐'}</span>{music.playback.state==='playing'&&<i/>}</button><IconButton icon={sound?Volume2:VolumeX} label={sound?'关闭音效':'开启音效'} onClick={()=>{setSound(!sound);localStorage.setItem('court:sound',String(!sound));if(!sound)playAccent('press');}}/><IconButton icon={CircleHelp} label="庭审指南" onClick={()=>setModal('help')}/><span className="header-divider"/><IconButton icon={rightOpen?PanelRightClose:PanelRightOpen} label={rightOpen?'收起法庭记录':'展开法庭记录'} onClick={()=>setRightOpen(!rightOpen)}/></div></header>
      <div className={`court-stage ${compactStage?'compact':''}`}>
        <img className="stage-art" src="/assets/courtroom.png" alt="暖金色法庭内，深蓝西装的辩护人手持卷宗，准备展开质询"/>
        <div className="stage-shade"/>
        <div className="stage-topline"><span><i/> {running?'正在听取证言':current?'法庭已就绪':'开庭之前'}</span><button onClick={()=>setCompactStage(!compactStage)} title={compactStage?'展开法庭':'收起法庭场景'} aria-label={compactStage?'展开法庭':'收起法庭场景'}>{compactStage?<ChevronDown size={16}/>:<ChevronLeft className="rotate" size={16}/>}</button></div>
        <div className="stage-copy"><span className="stage-kicker">THE TRUTH IS IN THE DETAILS</span><h1>{running?<>正在查证<span>，请稍候。</span></>:selected?<>此刻<span>，轮到你追问。</span></>:<>每一句<span>，都有据可循。</span></>}</h1><p>{selected?'把疑问说清楚，让证据自己发言。':'追问一个细节，发现另一种可能。'}</p></div>
        <div className="stage-caption"><span>CODEX</span><i/> 证言席</div>
      </div>

      {loading?<div className="loading-case"><LoaderCircle className="spin" size={24}/><h3>正在调阅卷宗</h3><p>读取原会话与证据记录…</p></div>:!current?<div className="welcome-scroll"><div className="welcome">
        <div className="section-eyebrow"><span className="short-rule"/> YOUR NEXT CROSS-EXAMINATION</div>
        <h2>欢迎来到，你的辩证法庭。</h2><p className="welcome-description">带着问题入席。对话、追问与证据，都留在同一份卷宗里。</p>
        <div className="welcome-options"><button className="welcome-feature" onClick={()=>openCase('training')}><span className="feature-number">01 / PRACTICE</span><div className="feature-icon"><Gavel size={27}/></div><h3>从一次异议开始</h3><p>一条过于笃定的结论，一份被忽略的日志。<br/>用三分钟，熟悉你的法庭。</p><span className="feature-link">进入练习庭<ArrowUpRight size={19}/></span><span className="feature-seal">初<br/>审</span></button><button className="welcome-feature secondary" onClick={()=>threads.length?openCase(threads[0].id):setModal('new')} disabled={!threads.length&&connection.state!=='connected'}><span className="feature-number">02 / CONTINUE</span><div className="feature-icon"><Files size={27}/></div><h3>继续你的真实会话</h3><p>沿用现有 Codex 登录和聊天历史。<br/>从左侧选择一份卷宗，即可入席。</p><span className="feature-link">{threads.length?'打开最近的会话':'开启新庭审'}<ArrowUpRight size={19}/></span></button></div>
        <div className="welcome-foot"><ShieldCheck size={17}/><span>证据本地保存</span><span className="dot-separator">·</span><span>无需迁移会话</span><span className="dot-separator">·</span><span>无需额外 API Key</span></div>
        {error&&<div className="error-banner"><CircleAlert size={17}/>{error}<button onClick={()=>setError('')}><X size={14}/></button></div>}
      </div></div>:<>
        <div className="transcript-heading"><span><span className="live-square"/> 庭审实录</span><span className="transcript-subtitle">{training?'预设演练 · 所有回复均为本地示例':'与原 Codex 共用这份会话'}</span><div className="transcript-controls"><IconButton icon={RefreshCw} label="刷新当前会话" onClick={()=>reloadCurrent()}/><span className="record-label">ON THE RECORD</span></div></div>
        <div className="transcript" ref={scrollRef} onScroll={e=>{const el=e.currentTarget;stickBottom.current=el.scrollHeight-el.scrollTop-el.clientHeight<90;}}>
          {historyCursor&&<button className="earlier-button" onClick={()=>{stickBottom.current=false;reloadCurrent(true);}}><Clock3 size={14}/>调阅更早的记录<ChevronDown size={13}/></button>}
          {locked&&<div className="lock-note"><Link2 size={15}/><span>原 Codex 窗口可能仍持有此会话。可以浏览；发送时会检查占用状态。</span></div>}
          {!turns.length&&<div className="empty-transcript"><Scale size={37}/><h3>法庭已就绪</h3><p>说说你的问题，Codex 将在这里回应。<br/>随后你可以点选任何一句证言，继续追问。</p></div>}
          {turns.map(turn=><section className="turn" id={'turn-'+turn.id} key={turn.id}>{turn.items.filter(i=>['userMessage','agentMessage'].includes(i.type)).map(item=><Message key={item.id} item={item} turnId={turn.id} selected={selected} onSelect={chooseStatement} examinations={record.examinations} onCopy={copy}/>)}<ToolActivity items={turn.items}/>{turn.status==='failed'&&<div className="turn-error">本轮未完成：{turn.error?.message||'请稍后重试'}</div>}{turn.status==='interrupted'&&<div className="interrupted-label">此轮已暂停</div>}</section>)}
          {pendingApprovals.map(request=><ApprovalCard request={request} key={request.id} onResolve={async(id,input)=>{await api(`/approvals/${id}`,{method:'POST',body:input});setPendingApprovals(old=>old.filter(a=>a.id!==id));}}/>)}
          {running&&<div className="running-label"><span className="thinking"><i/><i/><i/></span>Codex 正在调查与回应…</div>}
        </div>
        <div className={`composer-area action-${action}`}>
          {error&&<div className="error-banner" role="alert"><CircleAlert size={17}/><span>{error}</span><button onClick={()=>setError('')} aria-label="关闭错误提示"><X size={14}/></button></div>}
          <div className="court-action-caption"><span>{selected?'已选中证言 · 选择你的质询方式':'先点击或划选一句 Codex 证言，再发起质询'}</span>{selected&&<b>{actionLabels[action]}</b>}</div><div className="court-actions"><button className={action==='press'?'active':''} onClick={()=>chooseAction('press')}><MessageSquareText size={17}/><strong>追问</strong><small>HOLD IT!</small></button><button className={action==='present'?'active':''} onClick={()=>chooseAction('present')}><Files size={17}/><strong>出示证据</strong><small>TAKE THAT!</small></button><button className={`objection-button ${action==='object'?'active':''}`} onClick={()=>chooseAction('object')}><Gavel size={17}/><strong>异议！</strong><small>OBJECTION!</small></button><IconButton icon={SearchCheck} label="要求验证选中的语句" className={`icon-button verify-button ${action==='verify'?'active':''}`} onClick={()=>chooseAction('verify')}/></div>
          <div className={`composer ${selected?'has-selection':''}`}>
            {selected&&<div className="quote-strip"><Quote size={15}/><span>{selected.text}</span><button className="quote-mentor" aria-label="请导师解释选句" onClick={()=>openMentor()}><GraduationCap size={14}/>讲解</button><IconButton icon={X} label="取消选句" onClick={()=>{setSelected(null);setAction('chat');}}/></div>}
            {evidenceIds.length>0&&<div className="attached-evidence">{record.evidence.filter(e=>evidenceIds.includes(e.id)).map(e=><button key={e.id} onClick={()=>toggleEvidence(e.id)}><Paperclip size={12}/>{e.title}<X size={12}/></button>)}</div>}
            <textarea ref={composerRef} aria-label="庭审陈述" value={draft} onChange={e=>setDraft(e.target.value)} placeholder={selected?`针对这句话，补充你的${action==='object'?'异议理由':'问题'}…（可直接发送）`:'写下你的陈述，或先点击一条证言…'} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();send();}}} rows={2}/>
            <div className="composer-footer"><div className="composer-tools"><IconButton icon={Paperclip} label="添加证据" onClick={()=>{setModal('evidence');music.changePhase('investigation',{automatic:true});}}/><span className="composer-tool-separator"/>{training?<span className="model-label"><FlaskConical size={13}/>本地演练</span>:<><select aria-label="选择模型" title="沿用原会话模型，或选择其他可用模型" value={model} onChange={e=>{setModel(e.target.value);setEffort('');}}><option value="">{current.model||'沿用会话模型'}</option>{boot?.models?.map(m=><option value={m.model} key={m.model}>{m.displayName}</option>)}</select>{chosenModel&&<select className="effort-select" aria-label="思考强度" value={effort} onChange={e=>setEffort(e.target.value)}><option value="">原强度</option>{chosenModel.supportedReasoningEfforts?.map(e=><option key={e.reasoningEffort} value={e.reasoningEffort}>{e.reasoningEffort}</option>)}</select>}</>}</div><div className="send-controls"><span className="input-hint">Shift ↵ 换行</span>{running?<button className="stop-button" onClick={stop}><Square size={13} fill="currentColor"/>暂停</button>:<button className={`send-button ${action==='object'?'red':''}`} onClick={send} disabled={sending||(!training&&connection.state!=='connected')||(action==='chat'&&!draft.trim()&&!evidenceIds.length)} aria-label={action==='chat'?'发送陈述':`发送${actionLabels[action]}`}>{sending?<LoaderCircle size={15} className="spin"/>:<ArrowUpRight size={17}/>}<span>{sending?'提交中':action==='chat'?'发送':actionLabels[action]}</span></button>}</div></div>
          </div><div className="composer-bottom"><span><span className="tiny-dot"/> {selected?'已选中证言 · 原文将随质询一起发送':'点击证言即可追问，也可划选其中一部分'}</span><span>判断来自证据。</span></div>
        </div>
      </>}
    </main>

    <aside className={`record-panel ${rightOpen?'open':''}`}>
      <div className="record-panel-heading"><div><span className="eyebrow">THE COURT RECORD</span><h2>法庭记录</h2></div><span className="record-stamp"><Scale size={19}/></span></div>
      <div className="record-tabs" role="tablist" aria-label="法庭记录"><button role="tab" aria-selected={tab==='evidence'} className={tab==='evidence'?'active':''} onClick={()=>setTab('evidence')}>证据 <span>{record.evidence.length}</span></button><button role="tab" aria-selected={tab==='examinations'} className={tab==='examinations'?'active':''} onClick={()=>setTab('examinations')}>质询记录 <span>{record.examinations.length}</span></button></div>
      <div className="record-scroll">
        {tab==='evidence'?<><div className="record-intro">{current?'选择证据，随下一次陈述一起出示。':'每一次判断，都值得一份依据。'}</div>{record.evidence.map((e,i)=><div className={`evidence-card ${evidenceIds.includes(e.id)?'chosen':''}`} key={e.id}><div className="evidence-card-top"><span className="evidence-number">EXHIBIT {String(i+1).padStart(2,'0')}</span><button className="evidence-check" aria-label={`${evidenceIds.includes(e.id)?'取消选择':'选择证据'}：${e.title}`} aria-pressed={evidenceIds.includes(e.id)} onClick={()=>toggleEvidence(e.id)}>{evidenceIds.includes(e.id)&&<Check size={12}/>}</button></div><button className="evidence-content" onClick={()=>setEvidenceDetail(e)}><div className={`evidence-art ${e.kind==='image'?'image':''}`}>{e.kind==='image'?<img src={e.content} alt={e.title}/>:<><FileText size={30} strokeWidth={1.2}/><span className="fake-lines"><i/><i/><i/></span></>}</div><h3>{e.title}</h3><p>{e.source||'手动录入'}</p></button><div className="evidence-footer"><span>{e.kind==='image'?'图片证据':'文本证据'}</span><span>{new Date(e.createdAt).toLocaleDateString('zh-CN',{month:'2-digit',day:'2-digit'})}</span></div></div>)}
          {current&&<button className="add-evidence" onClick={()=>setModal('evidence')}><Plus size={19}/><span>收录新证据</span><small>截图 / 日志 / 代码 / 文字</small></button>}
          {!record.evidence.length&&<div className="empty-evidence"><div className="empty-file"><FileText size={31} strokeWidth={1}/><span/></div><h3>{current?'证据席，等待你的发现。':'先选择一份卷宗'}</h3><p>{current?'可以是一次报错、一段代码，\n也可以是一个被忽略的细节。':'进入一场庭审，\n把相关材料放在这里。'}</p></div>}
          {selected&&<div className="focus-card"><span className="eyebrow"><Target size={12}/>当前争议点</span><p>“{selected.text}”</p><button className="text-button" onClick={()=>{setModal({type:'quoteEvidence',initial:{title:'证言摘录',content:selected.text,source:`消息 ${selected.itemId}`}});}}><Plus size={12}/>将这句收录为证据</button></div>}
        </>:<>{record.examinations.length===0?<div className="empty-evidence"><ListChecks size={34} strokeWidth={1}/><h3>每一次追问，都有迹可循。</h3><p>选中证言后发起质询，<br/>这里会保留原句、证据与回复。</p></div>:record.examinations.slice().reverse().map((entry,i)=><div className="examination-card" key={entry.id}><div className="examination-top"><span className={`action-pill ${entry.action}`}>{actionLabels[entry.action]}</span><small>{new Date(entry.createdAt).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'})}</small></div><blockquote>{entry.quote?.text}</blockquote>{entry.evidence.length>0&&<div className="exam-evidence"><Paperclip size={12}/>{entry.evidence.map(e=>e.title).join('、')}</div>}<div className="examination-bottom"><select aria-label="标记复核结果" value={entry.resolution} onChange={e=>changeResolution(entry.id,e.target.value)}>{Object.entries(resolutionLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select><button title="定位复核回复" onClick={()=>goToTurn(entry.turnId)}><ArrowUpRight size={16}/></button></div><small className="record-manual-note">结果标记由你确认</small></div>)}</>}
      </div>
      <div className="record-panel-foot">{current?<button className="export-button" onClick={()=>{const a=document.createElement('a');a.href=`/api/cases/${current.id}/export`;a.download=`court-record-${current.id}.json`;a.click();}}><Download size={14}/>导出法庭记录<ArrowUpRight size={13}/></button>:<div className="record-motto">“ 真相，藏在细节之中。 ”</div>}<span><ShieldCheck size={12}/>仅保存在这台电脑</span></div>
    </aside>

    {toast&&<div className="toast" role="status"><Check size={16}/>{toast}</div>}
    <ObjectionEffect effect={burst}/>
    <MentorPanel open={mentorOpen} onClose={()=>setMentorOpen(false)} sourceId={current?.id||"general"} material={teachingMaterial} connection={connection} requestKey={mentorRequest} onDialogueChange={setMentorDialogue} obscured={!!evidenceDetail||!!modal}/>
    {(modal==='evidence'||modal?.type==='quoteEvidence')&&<EvidenceForm initial={modal.initial} onClose={()=>setModal(null)} onSubmit={addEvidence}/>}
    {modal==='new'&&<NewCase cwd={boot?.cwd||''} models={boot?.models||[]} onClose={()=>setModal(null)} onSubmit={async input=>{const r=await api('/threads',{method:'POST',body:input});await loadThreads();await openCase(r.thread.id);}}/>}
    {evidenceDetail&&<EvidenceViewer evidence={evidenceDetail} onClose={()=>setEvidenceDetail(null)} onRemove={()=>removeEvidence(evidenceDetail)} onPresent={()=>{if(!evidenceIds.includes(evidenceDetail.id))toggleEvidence(evidenceDetail.id);setEvidenceDetail(null);notify('已加入本次出示');}} onTeach={()=>{openMentor({title:evidenceDetail.title,text:evidenceDetail.kind==='image'?'请结合这张图片解释证据中的关键内容。':evidenceDetail.content,source:evidenceDetail.source,...(evidenceDetail.kind==='image'?{image:evidenceDetail.content}:{})});setEvidenceDetail(null);}}/>}
    {modal==='help'&&<Modal title="你的第一份庭审指南" kicker="HOW TO CROSS-EXAMINE" onClose={()=>setModal(null)}><div className="guide-steps"><div><span>01</span><section><h3>从一句话开始</h3><p>点选 Codex 的任意一句证言，也可以用鼠标划选其中一部分。原句会出现在输入框上方。</p></section></div><div><span>02</span><section><h3>追问，或者出示证据</h3><p>追问它的依据与前提；把截图、日志或代码收录到右侧，勾选后随质询发送。</p></section></div><div><span>03</span><section><h3>异议！让结论接受检验</h3><p>说明你发现的矛盾，点击发送异议。Codex 应根据证据维持、修正或保留判断。</p></section></div><div><span>04</span><section><h3>给这次复核留一份记录</h3><p>原证言不会被改写。右侧「质询记录」可定位新回复，并由你标记复核结果。</p></section></div></div><div className="guide-note"><Link2 size={17}/><p>真实会话沿用本机 Codex。两个客户端同时写入同一会话时，以 Codex 的占用保护为准。桌面专属插件工具不一定能在此客户端使用。</p></div><div className="modal-actions"><span className="muted">Enter 发送 · Shift + Enter 换行 · Esc 取消选句</span><button className="primary-button" onClick={()=>setModal(null)}>我准备好了<ArrowRight size={16}/></button></div></Modal>}
    {(modal==='settings'||modal?.type==='settings')&&<CourtSettings onClose={()=>setModal(null)} initialTab={modal.tab||'performance'} music={music} sound={sound} effects={effects} setSound={value=>{setSound(value);localStorage.setItem('court:sound',String(value));if(value)playAccent('press');}} setEffects={value=>{setEffects(value);localStorage.setItem('court:effects',String(value));}} previewEffect={showEffect} connection={connection} boot={boot} reconnect={reconnect} running={running} sending={sending} release={async()=>{try{await api('/disconnect',{method:'POST',body:{}});setConnection({state:'disconnected'});setModal(null);notify('本客户端已断开，可以回到官方 Codex 继续。');}catch(e){notify(e.message);}}}/>}
  </div>;
}

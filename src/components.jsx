import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X, Check, FileText, Image, Link, Upload, ArrowUpRight, CornerDownRight, Scale, CircleCheck, Terminal, ChevronDown, ExternalLink, AlertCircle, Copy, MessageSquare, LoaderCircle, SearchCheck, ShieldCheck, Quote } from 'lucide-react';
import { api, markdown, blocks, plain, actionLabels } from './lib.js';

export function IconButton({ icon: Icon, label, ...props }) { return <button className="icon-button" title={label} aria-label={label} {...props}><Icon size={17}/></button>; }
export function Modal({ title, kicker, children, onClose, wide = false }) {
  const ref = useRef();
  useEffect(() => { const previous = document.activeElement; ref.current.showModal(); return () => { if (previous instanceof HTMLElement) previous.focus(); }; }, []);
  return <dialog ref={ref} className={`modal ${wide ? 'wide' : ''}`} onCancel={onClose} onClick={e => { if (e.target === ref.current) onClose(); }}>
    <div className="modal-top"><div><span className="eyebrow">{kicker || 'COURT RECORD'}</span><h2>{title}</h2></div><IconButton icon={X} label="关闭对话框" onClick={onClose}/></div>
    {children}
  </dialog>;
}
export function EvidenceForm({ onClose, onSubmit, initial }) {
  const [title,setTitle] = useState(initial?.title || ''), [content,setContent] = useState(initial?.content || ''), [source,setSource] = useState(initial?.source || ''), [kind,setKind] = useState(initial?.kind || 'text');
  const [error,setError] = useState(''), [saving,setSaving] = useState(false);
  const fileRef = useRef();
  async function readFile(file) {
    if (!file) return;
    setError('');
    try {
      if (file.size > 6_000_000) throw new Error('文件最多 6 MB');
      const image = /^image\/(png|jpeg|webp|gif)$/.test(file.type);
      if (!image && !/\.(txt|md|log|json|csv|tsv|js|jsx|ts|tsx|py|css|html|xml|yaml|yml|toml|sql|sh|ps1|c|cpp|h|rs|go)$/i.test(file.name)) throw new Error('请选择图片、文本、日志或代码文件；PDF 请先摘录相关文字或截图。');
      if (image) { const reader = new FileReader(); const url = await new Promise((resolve,reject)=>{reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(file);}); setContent(url); setKind('image'); }
      else { const text = await file.text(); if (text.length > 200000) throw new Error('文本最多 20 万字符，请摘录相关部分'); setContent(text); setKind('text'); }
      setTitle(file.name); setSource(file.name);
    } catch(e) { setError(e.message); }
  }
  return <Modal title="收录一份证据" kicker="ADD TO THE COURT RECORD" onClose={onClose}>
    <form onSubmit={async e=>{ e.preventDefault();setSaving(true);setError('');try { await onSubmit({title,content,kind,source});onClose(); } catch(e){setError(e.message);} finally{setSaving(false);} }}>
      <div className="upload-zone" onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();readFile(e.dataTransfer.files[0]);}}>
        <Upload size={23}/><div><b>把证据拖到这里</b><span>图片、日志、代码或文本 · 最多 6 MB</span></div><button type="button" className="small-button" onClick={()=>fileRef.current.click()}>选择文件</button>
        <input ref={fileRef} type="file" hidden onChange={e=>readFile(e.target.files[0])}/>
      </div>
      <label className="field">证据标题<input value={title} onChange={e=>setTitle(e.target.value)} placeholder="例如：清除缓存后的复现日志" required maxLength={160}/></label>
      <label className="field">来源或位置<input value={source} onChange={e=>setSource(e.target.value)} placeholder="文件名、链接、代码行号或观察时间" maxLength={240}/></label>
      {kind === 'image' ? <div className="image-preview"><img src={content} alt="待收录的证据"/><button type="button" className="text-button" onClick={()=>{setKind('text');setContent('');}}>改为文字证据</button></div> : <label className="field">证据内容<textarea value={content} onChange={e=>setContent(e.target.value)} placeholder="粘贴相关文字、错误日志、代码片段，或直接描述观察到的事实…" required rows={7} maxLength={200000}/></label>}
      {error && <div className="inline-error" role="alert">{error}</div>}
      <div className="modal-actions"><span className="muted">先收录，选择后再出示。</span><button className="primary-button" disabled={saving || !title.trim() || !content.trim()}>{saving ? '正在收录…' : '收录证据'}<Check size={16}/></button></div>
    </form>
  </Modal>;
}

export function Message({ item, turnId, selected, onSelect, examinations, onCopy }) {
  const isUser = item.type === 'userMessage';
  const text = isUser ? item.content?.filter(c=>c.type === 'text').map(c=>c.text).join('\n') || '' : item.text || '';
  const spans = useMemo(()=>blocks(text),[text]);
  const scoped = examinations.filter(e=>e.quote?.itemId === item.id);
  const [expanded,setExpanded] = useState(false);
  const isCourt = isUser && text.startsWith('【Codex Court');
  const courtType = isCourt ? text.match(/【Codex Court · (.+?)】/)?.[1] : null;
  const displayText = isUser && !expanded && text.length > 600 ? text.slice(0, isCourt ? 330 : 600) + '…' : text;
  function choose(raw, element) {
    const selection = window.getSelection();
    const custom = selection?.toString().trim();
    const selectedText = custom && element.contains(selection.anchorNode) && element.contains(selection.focusNode) ? custom : plain(raw);
    onSelect({ text: selectedText, itemId: item.id, turnId });
  }
  return <article className={`message ${isUser?'user-message':'agent-message'} ${isCourt?'court-statement':''}`} data-item-id={item.id}>
    <div className="message-heading"><span className={`avatar ${isUser?'user-avatar':''}`}>{isUser ? '你' : <Scale size={15}/>}</span><b>{isUser ? '辩护方 · 你' : '证言席 · Codex'}</b><span className="message-role">{courtType || (isUser ? '你的陈述' : item.phase === 'commentary' ? '调查进展' : '可点选追问')}</span><span className="message-spacer"/><IconButton icon={Copy} label="复制这条消息" onClick={()=>onCopy(text)}/></div>
    <div className="message-content">
      {isUser ? <><div className="markdown" dangerouslySetInnerHTML={{__html:markdown(displayText)}}/>{text.length > 600 && <button className="text-button" onClick={()=>setExpanded(!expanded)}>{expanded?'收起原文':'展开完整陈述'}</button>}{item.content?.filter(i=>i.type==='image').map((image,i)=> image.url?.startsWith('data:image/') ? <img key={i} className="message-image" src={image.url} alt="出示的图片证据"/> : <span className="attachment-label" key={i}><Image size={14}/>图片附件</span>)}</> : <div className="statement-list">
        {spans.map((block,i)=>{const active = selected?.itemId === item.id && (selected.text === plain(block.raw) || plain(block.raw).includes(selected.text)); return <div key={i} role="button" tabIndex={0} data-statement="true" className={`statement markdown block-${block.type} ${active?'selected':''}`} aria-label={`选中证言：${plain(block.raw).slice(0,75)}`} onClick={e=>{if(e.target.closest('a'))return;choose(block.raw,e.currentTarget);}} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();choose(block.raw,e.currentTarget);}}}><span className="statement-marker">{String(i+1).padStart(2,'0')}</span><div dangerouslySetInnerHTML={{__html:markdown(block.raw)}}/>{active && <span className="selection-tick"><Check size={13}/></span>}</div>;})}
        {!text && <span className="thinking"><i/><i/><i/></span>}
      </div>}
      {scoped.length > 0 && <div className="message-examinations"><CornerDownRight size={14}/>{scoped.length} 条质询记录 · 原证言保留</div>}
    </div>
  </article>;
}

export function ToolActivity({ items }) {
  const tools = items.filter(i=>!['userMessage','agentMessage','reasoning','hookPrompt','functionCallOutput'].includes(i.type));
  if (!tools.length) return null;
  return <details className="tool-activity"><summary><Terminal size={14}/><span>执行记录</span><span className="count">{tools.length}</span><ChevronDown size={13}/></summary><div className="tool-list">{tools.map(item=><details key={item.id} className="tool-item"><summary><span className={`tool-dot ${['completed','success'].includes(item.status)?'done':''}`}/>{item.command?.slice(0,120) || item.tool || ({fileChange:'文件修改',webSearch:'网页搜索',plan:'计划',imageView:'查看图片',imageGeneration:'图像生成',contextCompaction:'上下文压缩'}[item.type] || item.type)}<span>{item.exitCode !== undefined && item.exitCode !== null ? `退出码 ${item.exitCode}` : item.status}</span></summary><pre>{item.command ? `$ ${item.command}\n${item.aggregatedOutput || '尚无输出'}` : JSON.stringify(item.changes || item.result || item.text || {type:item.type,status:item.status},null,2)}</pre></details>)}</div></details>;
}

export function ApprovalCard({ request, onResolve }) {
  const [answers,setAnswers] = useState({}), [busy,setBusy] = useState(false), [error,setError] = useState('');
  const question = request.method === 'item/tool/requestUserInput';
  async function submit(input) { setBusy(true);try {await onResolve(request.id,input);}catch(e){setError(e.message);}finally{setBusy(false);} }
  return <div className="approval-card"><div className="approval-heading"><ShieldCheck size={18}/><strong>{question?'Codex 需要你的补充':'执行前，请你确认'}</strong></div>
    {question ? request.params.questions.map(q=><label className="field" key={q.id}>{q.question}{q.options?.length>0&&<div className="question-options">{q.options.map(o=><button type="button" className={answers[q.id]===o.label?'chosen':''} key={o.label} title={o.description} onClick={()=>setAnswers({...answers,[q.id]:o.label})}>{o.label}</button>)}</div>}<input type={q.isSecret?'password':'text'} value={answers[q.id]||''} placeholder="输入你的回答…" onChange={e=>setAnswers({...answers,[q.id]:e.target.value})}/></label>) : <><p>{request.params.reason || 'Codex 请求执行以下操作。'}</p><pre>{request.params.command || request.params.grantRoot || request.params.itemId}</pre>{request.params.cwd&&<small>{request.params.cwd}</small>}</>}
    {error&&<div className="inline-error">{error}</div>}<div className="approval-actions">{question ? <button className="primary-button" disabled={busy} onClick={()=>submit({answers})}>提交回答</button> : <><button className="small-button" disabled={busy} onClick={()=>submit({decision:'decline'})}>拒绝</button><button className="primary-button" disabled={busy} onClick={()=>submit({decision:'accept'})}>允许这一次</button></>}</div>
  </div>;
}

export function NewCase({ cwd, models, onSubmit, onClose }) {
  const [name,setName]=useState(''), [directory,setDirectory]=useState(cwd), [model,setModel]=useState(''), [error,setError]=useState(''),[saving,setSaving]=useState(false);
  return <Modal title="开启一场新的庭审" kicker="NEW CASE" onClose={onClose}><form onSubmit={async e=>{e.preventDefault();setSaving(true);try{await onSubmit({name,cwd:directory,model});onClose();}catch(e){setError(e.message);}finally{setSaving(false);}}}>
    <p className="modal-intro">创建一个真实的 Codex 会话。之后也可以在官方客户端继续。</p>
    <label className="field">案件名称<input autoFocus value={name} onChange={e=>setName(e.target.value)} placeholder="今天，我们要查清什么？" required maxLength={100}/></label>
    <label className="field">项目目录<input value={directory} onChange={e=>setDirectory(e.target.value)} required/><small>Codex 会在这个目录中工作。</small></label>
    <label className="field">模型<select value={model} onChange={e=>setModel(e.target.value)}><option value="">沿用 Codex 默认设置</option>{models.map(m=><option key={m.model} value={m.model}>{m.displayName}</option>)}</select></label>
    <p className="muted">新会话默认可修改项目内文件，需要额外权限时会请求确认。</p>
    {error&&<div className="inline-error">{error}</div>}<div className="modal-actions"><span/><button className="primary-button" disabled={saving}>{saving?'正在开庭…':'创建会话'}<ArrowUpRight size={16}/></button></div>
  </form></Modal>;
}

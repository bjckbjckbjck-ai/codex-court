import React, { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Music2, Play, Pause, Upload, Volume2, Check, Trash2, Pencil, RefreshCw, ShieldCheck, Link2, LogOut, Sparkles, X, Disc3, FolderOpen } from 'lucide-react';
import { Modal } from './components.jsx';
import { api, uploadAudio } from './lib.js';
import { PHASES, VERSIONS, MAX_AUDIO_BYTES, AUDIO_EXTENSIONS, boundTrack } from '../shared/music.mjs';
import { EFFECTS } from './ObjectionEffect.jsx';
import { MUSIC_SOURCES } from './music-catalog.js';

function Switch({ label, checked, onChange, disabled }) {
  return <button className={`toggle ${checked?'on':''}`} role="switch" aria-label={label} aria-checked={checked} disabled={disabled} onClick={() => onChange(!checked)}><span/></button>;
}
export function CourtSettings({ onClose, initialTab = 'performance', music, sound, effects, setSound, setEffects, previewEffect, connection, boot, reconnect, running, sending, release }) {
  const [tab, setTab] = useState(initialTab);
  return <Modal title="布置你的法庭" kicker="COURT PREFERENCES" onClose={onClose} wide>
    <div className="settings-tabs" role="tablist" aria-label="法庭设置分类">
      {[['performance','演出与连接',Sparkles],['music','背景音乐',Music2],['sources','原声目录',Disc3]].map(([id,label,Icon]) => <button key={id} role="tab" aria-selected={tab===id} onClick={() => setTab(id)}><Icon size={16}/>{label}</button>)}
    </div>
    {tab === 'performance' && <div className="performance-settings">
      <div className="setting-row"><div><b>异议演出</b><p>发送质询时播放醒目的字卡与速度线；减少动画时保留静态字卡。</p></div><Switch label="异议演出" checked={effects} onChange={setEffects}/></div>
      <div className="effect-previews"><span>演出试映 · 不发送消息</span><div>{Object.entries(EFFECTS).map(([id, effect]) => <button key={id} className={`preview-effect preview-${id}`} onClick={() => previewEffect(id, true)} aria-label={`预览${effect.text}特效`}><Play size={13}/>{effect.text}</button>)}</div></div>
      <div className="setting-row"><div><b>法庭音效</b><p>演出时播放简短提示音，与背景音乐独立控制。</p></div><Switch label="法庭音效" checked={sound} onChange={setSound}/></div>
      <div className="settings-connection"><span className={`status-dot ${connection.state==='connected'?'online':''}`}/><div><b>{connection.state==='connected'?'已连接本机 Codex':'连接状态'}</b><p>{boot?.account?.type==='chatgpt'?`ChatGPT ${boot.account.plan||''} · 使用现有登录`:(connection.detail||'本机连接')}</p></div><button className="small-button" disabled={running||connection.state==='connecting'} onClick={reconnect}><RefreshCw size={14}/>重新连接</button></div>
      <div className="setting-info"><ShieldCheck size={18}/><p>真实对话使用本机 Codex 当前配置的模型与额度，无需额外 API Key。法庭记录和音乐均保存在本机。</p></div>
      <div className="setting-info"><Link2 size={18}/><p>回到原 Codex 续聊前，结束这里的回应，再交还会话。</p></div><button className="release-button" disabled={running||sending} onClick={release}><LogOut size={15}/>交还会话给原 Codex</button>
    </div>}
    {tab === 'music' && <MusicSettings music={music}/>}
    {tab === 'sources' && <div className="music-sources"><p className="settings-description">按版本整理的官方入口。原声专辑与游戏内音乐鉴赏已分别标明；这里不直接播放网页音乐。取得音频文件后，在「背景音乐」中导入。</p><div className="source-grid">{MUSIC_SOURCES.map(source => <a href={source.url} key={source.title} target="_blank" rel="noreferrer noopener"><span className="source-type">{source.type}</span><strong>{source.title}<ArrowUpRight size={18}/></strong><p>{source.detail}</p><small>{new URL(source.url).hostname}</small></a>)}</div><p className="settings-footnote">来源：Capcom 官方商店及支持页面 · 整理于 2026-10-20 · 默认配乐：逆转裁判 4 · 可自行导入更多版本</p></div>}
    <div className="settings-version">CODEX COURT · LOCAL EDITION 1.1</div>
  </Modal>;
}

function MusicSettings({ music }) {
  const { library, playback, previewId } = music;
  const [importVersion, setImportVersion] = useState(library.settings.version), [autoAssign, setAutoAssign] = useState(true), [busy, setBusy] = useState(false), [progress, setProgress] = useState(''), [notice, setNotice] = useState(''), [error, setError] = useState('');
  const [filter, setFilter] = useState(''), [editing, setEditing] = useState(null), [removing, setRemoving] = useState(null), [volume, setVolume] = useState(library.settings.volume);
  const input = useRef(), pendingVolume = useRef();
  const versions = [...new Set([...VERSIONS, ...library.tracks.map(t=>t.version), ...library.settings.bindings.map(b=>b.version), library.settings.version])];
  useEffect(() => () => { music.endPreview(); }, [music.endPreview]);
  useEffect(() => setVolume(library.settings.volume), [library.settings.volume]);
  async function save(patch) {
    try { await music.updateSettings(patch); setError(''); } catch(e) { setError(e.message); }
  }
  async function importFiles(files) {
    if (busy || !files.length) return;
    if (!importVersion.trim()) { setError('先填写这批音乐所属的版本'); return; }
    setBusy(true); setError(''); setNotice(''); const failures=[]; let imported=0;
    try {
      for (const [index,file] of Array.from(files).entries()) {
        setProgress(`正在导入 ${index+1} / ${files.length} · ${file.name}`);
        try {
          if (!AUDIO_EXTENSIONS.test(file.name)) throw new Error('不是支持的音频文件');
          if (!file.size || file.size>MAX_AUDIO_BYTES) throw new Error('文件为空或超过 64 MB');
          const value = await uploadAudio(file, { version: importVersion.trim(), assign: String(autoAssign) });
          music.setLibrary(value); imported++;
        } catch(e) { failures.push(`${file.name}：${e.message}`); }
      }
      if (imported) {
        await music.updateSettings({version:importVersion.trim()});
        setNotice(`已收录 ${imported} 首音乐${autoAssign?'，识别出的环节已填入空位':''}。可以在下方调整分配。`);
      }
      if (failures.length) setError(failures.join('\n'));
    } catch(e) { setError(e.message); }
    finally { setBusy(false); setProgress(''); if (input.current) input.current.value=''; }
  }
  const currentPhase = PHASES.find(p=>p.id===music.phase);
  const states = { off:'背景音乐已关闭', paused:'已暂停', empty:'当前环节尚未分配音乐', blocked:'浏览器等待你点击播放', loading:'正在载入音乐…', error:'这首音频无法播放，请换用 MP3、WAV 或 OGG 文件', playing:previewId?'正在试听':'正在播放' };
  const tracks = library.tracks.filter(t => `${t.title} ${t.version}`.toLowerCase().includes(filter.toLowerCase()));
  return <div className="music-settings">
    <div className="music-master"><div className="music-master-icon"><Music2 size={26}/></div><div><h3>为每一个转折，配上音乐。</h3><p>空白的环节保持安静。导入后即可试听、分配与自动切换。</p></div><Switch label="背景音乐" checked={library.settings.enabled} onChange={value=>{music.setPaused(false);save({enabled:value});}}/></div>
    <div className="music-controls"><label className="volume-control"><Volume2 size={17}/><span>音乐音量</span><input type="range" min="0" max="100" step="1" aria-label="音乐音量" value={Math.round(volume*100)} onChange={e=>{const value=Number(e.target.value)/100;setVolume(value);if(music.audioRef.current)music.audioRef.current.volume=value;clearTimeout(pendingVolume.current);pendingVolume.current=setTimeout(()=>save({volume:value}),180);}}/><output>{Math.round(volume*100)}%</output></label><label className="auto-music"><input type="checkbox" checked={library.settings.auto} onChange={e=>{music.clearScheduled();save({auto:e.target.checked});}}/>随庭审自动切换</label></div>
    <div className={`now-playing ${playback.state==='playing'?'playing':''}`} data-testid="now-playing"><span className="equalizer"><i/><i/><i/><i/></span><div><b>{playback.title||(library.tracks.length?'当前环节未分配音乐':'等待你的第一首配乐')}</b><span>{previewId?'试听':currentPhase?.label} · {states[playback.state]}</span></div>{previewId?<button className="small-button" onClick={music.endPreview}><X size={14}/>结束试听</button>:<button className="small-button" aria-label={playback.state==='playing'?'暂停背景音乐':'播放背景音乐'} disabled={!boundTrack(library,music.phase)} onClick={()=>playback.state==='blocked'?music.retry():music.toggle().catch(e=>setError(e.message))}>{playback.state==='playing'?<Pause size={15}/>:<Play size={15}/>}</button>}</div>
    {(error||music.error)&&<div className="inline-error" role="alert">{error||music.error}</div>}
    {notice&&<div className="music-notice" role="status"><Check size={16}/>{notice}</div>}
    <div className="music-section-heading"><div><span className="eyebrow">01 / IMPORT</span><h3>收录音乐</h3></div><span>{library.tracks.length} 首 · 本机音乐库</span></div>
    <div className="music-import" onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();importFiles(e.dataTransfer.files);}}>
      <div className="import-options"><label className="field">导入到版本<input list="music-versions" aria-label="导入到版本" maxLength={100} value={importVersion} disabled={busy} onChange={e=>setImportVersion(e.target.value)} placeholder="选择版本，也可填写自定义名称"/><datalist id="music-versions">{versions.map(v=><option key={v} value={v}/>)}</datalist></label><label className="auto-assign"><input type="checkbox" checked={autoAssign} disabled={busy} onChange={e=>setAutoAssign(e.target.checked)}/>从曲名识别环节，填入空位</label></div>
      <div className="music-drop"><Upload size={23}/><div><b>{busy?progress:'拖入音乐文件，或批量选择'}</b><span>MP3 / OGG / WAV / FLAC / M4A / AAC / OPUS · 单曲最多 64 MB</span></div><button className="primary-button" disabled={busy} onClick={()=>input.current.click()}><FolderOpen size={16}/>{busy?'正在收录…':'选择音乐'}</button><input ref={input} type="file" multiple accept=".mp3,.ogg,.wav,.flac,.m4a,.aac,.opus" aria-label="导入音乐文件" hidden onChange={e=>importFiles(e.target.files)}/></div>
    </div>
    <div className="music-section-heading"><div><span className="eyebrow">02 / SCORE THE SCENE</span><h3>环节配乐</h3></div><label>配乐版本<select aria-label="配乐版本" value={library.settings.version} disabled={busy} onChange={e=>save({version:e.target.value})}>{versions.map(v=><option key={v}>{v}</option>)}</select></label></div>
    <div className="phase-bindings">{PHASES.map(p=>{
      const binding=library.settings.bindings.find(b=>b.version===library.settings.version&&b.phase===p.id);
      return <div key={p.id} className={`phase-row ${music.phase===p.id?'current':''}`}><button className="phase-label" aria-label={`切换到${p.label}`} title={p.hint} onClick={()=>music.changePhase(p.id)}><b>{p.label}{music.phase===p.id&&<i/>}</b><small>{p.en}</small></button><label className="sr-only" htmlFor={`phase-${p.id}`}>{p.label}配乐</label><select id={`phase-${p.id}`} value={binding?.trackId||''} disabled={busy} onChange={e=>save({binding:{version:library.settings.version,phase:p.id,trackId:e.target.value}})}><option value="">留空 · 不播放</option>{versions.filter(v=>library.tracks.some(t=>t.version===v)).map(v=><optgroup key={v} label={v}>{library.tracks.filter(t=>t.version===v).map(t=><option key={t.id} value={t.id}>{t.title}</option>)}</optgroup>)}</select><button className="phase-play" aria-label={`试听${p.label}配乐`} disabled={!binding?.trackId} onClick={()=>music.preview(binding.trackId)}><Play size={15}/></button></div>;
    })}</div><details className="music-rules"><summary>自动切换如何工作？</summary><ul>{PHASES.map(p=><li key={p.id}><b>{p.label}：</b>{p.hint}</li>)}</ul><p>点击环节名称可手动切换。每个版本单独保存分配，也可以混用其他版本曲目。</p></details>
    <div className="music-section-heading"><div><span className="eyebrow">03 / YOUR COLLECTION</span><h3>曲目库</h3></div>{library.tracks.length>0&&<input className="music-search" aria-label="搜索音乐" placeholder="搜索曲名或版本" value={filter} onChange={e=>setFilter(e.target.value)}/>}</div>
    {!library.tracks.length?<div className="music-empty"><Disc3 size={32} strokeWidth={1.3}/><b>唱片架，等待你的收藏。</b><p>音乐库先留空。导入各版本原声后，<br/>在上方为每个环节挑选一首。</p></div>:<div className="track-list">{!tracks.length&&<p className="settings-description">没有匹配的曲目。</p>}{tracks.map(t=><div className="track-card" key={t.id}><div className="track-row"><button className={`track-play ${previewId===t.id?'active':''}`} aria-label={`试听曲目：${t.title}`} onClick={()=>previewId===t.id?music.endPreview():music.preview(t.id)}>{previewId===t.id?<Pause size={15}/>:<Play size={15}/>}</button><div className="track-title"><b>{t.title}</b><span>{t.version} · {PHASES.find(p=>p.id===t.phase)?.label||'未分类'} · {(t.size/1024/1024).toFixed(1)} MB</span></div><button className="icon-button" aria-label={`编辑曲目：${t.title}`} onClick={()=>{setEditing({...t});setRemoving(null);}}><Pencil size={14}/></button><button className="icon-button" aria-label={`移除曲目：${t.title}`} onClick={()=>{setRemoving(t.id);setEditing(null);}}><Trash2 size={14}/></button></div>
      {removing===t.id&&<div className="track-remove"><span>移除本机副本，并清空它的配乐分配？</span><button onClick={()=>setRemoving(null)}>取消</button><button className="danger-link" onClick={async()=>{try{if(previewId===t.id)music.endPreview();music.setLibrary(await api(`/music/tracks/${t.id}`,{method:'DELETE'}));setRemoving(null);}catch(e){setError(e.message);}}}>确认移除</button></div>}
      {editing?.id===t.id&&<form className="track-edit" onSubmit={async e=>{e.preventDefault();try{music.setLibrary(await api(`/music/tracks/${t.id}`,{method:'PATCH',body:{title:editing.title,version:editing.version,phase:editing.phase}}));setEditing(null);}catch(e){setError(e.message);}}}><label>曲名<input aria-label="编辑曲名" required maxLength={160} value={editing.title} onChange={e=>setEditing({...editing,title:e.target.value})}/></label><label>版本<input list="music-versions" aria-label="编辑曲目版本" required maxLength={100} value={editing.version} onChange={e=>setEditing({...editing,version:e.target.value})}/></label><label>分类<select aria-label="曲目环节分类" value={editing.phase} onChange={e=>setEditing({...editing,phase:e.target.value})}><option value="">未分类</option>{PHASES.map(p=><option key={p.id} value={p.id}>{p.label}</option>)}</select></label><div><button type="button" className="small-button" onClick={()=>setEditing(null)}>取消</button><button className="primary-button">保存曲目</button></div></form>}
    </div>)}</div>}
  </div>;
}

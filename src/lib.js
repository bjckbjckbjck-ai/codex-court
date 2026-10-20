import { marked } from 'marked';
import DOMPurify from 'dompurify';

let token = '';
export function setToken(value) { token = value; }
export async function uploadAudio(file, metadata) {
  const result = await fetch('/api/music/tracks?' + new URLSearchParams({ name: file.name, ...metadata }), { method: 'POST', headers: { 'Content-Type': 'application/octet-stream', 'X-Court-Token': token }, body: file });
  const data = await result.json();
  if (!result.ok) throw new Error(data.error || '音乐导入失败');
  return data;
}
export async function api(url, options = {}) {
  const result = await fetch('/api' + url, { ...options, headers: { 'Content-Type': 'application/json', 'X-Court-Token': token, ...options.headers }, ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}) });
  const data = await result.json();
  if (!result.ok) throw new Error(data.error || '连接出了点问题，请重试');
  return data;
}
marked.setOptions({ breaks: true, gfm: true });
export function markdown(text) {
  const safe = DOMPurify.sanitize(marked.parse(String(text || '')), { FORBID_TAGS: ['img', 'style', 'input', 'button', 'form', 'iframe'], FORBID_ATTR: ['style'] });
  const template = document.createElement('template');template.innerHTML = safe;
  for (const link of template.content.querySelectorAll('a')) { link.target = '_blank'; link.rel = 'noopener noreferrer'; }
  return template.innerHTML;
}
export function plain(text) { const template=document.createElement('template');template.innerHTML=markdown(text);return template.content.textContent.trim(); }
export function blocks(text) {
  const result = [];
  for (const token of marked.lexer(text || '')) {
    if (token.type === 'space') continue;
    if (token.type === 'paragraph' && !/[`|]/.test(token.raw)) {
      const segments = [...new Intl.Segmenter('zh-CN', { granularity: 'sentence' }).segment(token.raw)];
      for (const part of segments) if (part.segment.trim()) result.push({ raw: part.segment, type: 'sentence' });
    } else result.push({ raw: token.raw, type: token.type });
  }
  return result;
}
export function updateTurn(turns, method, p) {
  if (!p.turnId && !p.turn?.id) return turns;
  const id = p.turnId || p.turn.id;
  const current = turns.find(t => t.id === id) || { id, status: 'inProgress', items: [] };
  let next = { ...current, items: [...current.items] };
  if (method === 'turn/started' || method === 'turn/completed') next = { ...next, ...p.turn, items: p.turn.items?.length ? p.turn.items.filter(i=>!['reasoning','functionCallOutput','hookPrompt'].includes(i.type)) : next.items };
  if (method === 'item/started' || method === 'item/completed') {
    if (['reasoning','functionCallOutput','hookPrompt'].includes(p.item.type)) return turns;
    const idx = next.items.findIndex(i => i.id === p.item.id);
    if (idx >= 0) next.items[idx] = p.item; else next.items.push(p.item);
  }
  if (method === 'item/agentMessage/delta') {
    const idx = next.items.findIndex(i => i.id === p.itemId);
    if (idx >= 0) next.items[idx] = { ...next.items[idx], text: (next.items[idx].text || '') + p.delta };
    else next.items.push({ type: 'agentMessage', id: p.itemId, text: p.delta });
  }
  if (method === 'item/commandExecution/outputDelta') {
    const idx = next.items.findIndex(i => i.id === p.itemId);
    if (idx >= 0) next.items[idx] = { ...next.items[idx], aggregatedOutput: ((next.items[idx].aggregatedOutput || '') + p.delta).slice(-60000) };
  }
  return turns.some(t => t.id === id) ? turns.map(t => t.id === id ? next : t) : [...turns, next];
}
export function mergeTurns(existing, incoming) {
  const map = new Map(existing.map(t=>[t.id,t]));
  for (const turn of incoming) {
    const previous=map.get(turn.id);
    if(!previous){map.set(turn.id,turn);continue;}
    const items=new Map(previous.items.map(i=>[i.id,i]));
    for(const item of turn.items){const old=items.get(item.id);items.set(item.id,old?.type==='agentMessage'&&item.type==='agentMessage'&&(old.text?.length||0)>(item.text?.length||0)?old:item);}
    const terminal=['completed','failed','interrupted'];
    map.set(turn.id,{...previous,...turn,status:terminal.includes(previous.status)&&turn.status==='inProgress'?previous.status:turn.status,items:[...items.values()]});
  }
  return [...map.values()];
}
export function dateLabel(seconds) { return new Date(seconds * 1000).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' }).replace('/', '.'); }
export function playAccent(kind) {
  try {
    const audio = new (window.AudioContext || window.webkitAudioContext)();
    const notes = kind === 'object' ? [220, 330, 440, 660] : [392, 523];
    notes.forEach((freq, i) => { const oscillator = audio.createOscillator(), gain = audio.createGain(); oscillator.type = 'triangle'; oscillator.frequency.value = freq; oscillator.connect(gain); gain.connect(audio.destination); const t = audio.currentTime + i * 0.055; gain.gain.setValueAtTime(0, t); gain.gain.linearRampToValueAtTime(0.09, t + 0.012); gain.gain.exponentialRampToValueAtTime(0.001, t + 0.26); oscillator.start(t); oscillator.stop(t + 0.27); });
    setTimeout(() => audio.close(), 700);
  } catch { /* Sound is optional. */ }
}
export const actionLabels = { chat: '自由陈述', press: '追问', present: '出示证据', object: '提出异议', verify: '要求验证' };

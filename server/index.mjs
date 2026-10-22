import http from 'node:http';
import { readFile, stat, access, mkdir } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { randomBytes, randomUUID } from 'node:crypto';
import { CodexRpc } from './rpc.mjs';
import { CaseStore, requireId, buildInput, ACTIONS } from './store.mjs';
import { trainingThread, trainingTurns, trainingEvidence, trainingReply } from './training.mjs';
import { MusicStore } from './music.mjs';
import { seedBundledMusic } from './bundled-music.mjs';
import { MAX_AUDIO_BYTES } from '../shared/music.mjs';
import { MentorStore, MentorService } from './mentor.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT || 4317);
const isTest = process.env.COURT_TEST_MODE === '1';
if (isTest && !process.env.DATA_FILE) throw new Error('测试模式必须设置独立的 DATA_FILE');
const dataFile = path.resolve(process.env.DATA_FILE || path.join(root, '.local', 'court.json'));
const store = await new CaseStore(dataFile).load();
const mentorStore = await new MentorStore(dataFile + '.mentor.json').load();
const music = await new MusicStore(dataFile + '.music').load();
if (!isTest || process.env.COURT_BUNDLED_MUSIC === '1') await seedBundledMusic(music, path.join(root, 'assets', 'music'));
const token = randomBytes(32).toString('hex');
const clients = new Set(), loaded = new Set(), active = new Map(), approvals = new Map(), starting = new Set();
const finishedTurns = new Map();
let rpc, connectPromise, connection = { state: 'connecting' }, modelList = [], account = null;
let demoTurns = structuredClone(trainingTurns);
const broadcast = (event) => {
  const session = event.type === 'codex' && mentorStore.data.sessions.find(s => s.threadId === event.params?.threadId);
  if (session) event.mentorSessionId = session.id;
  for (const client of clients) client.write(`data: ${JSON.stringify(event)}\n\n`);
};
function safeError(error) { return String(error?.message || error).replace(/sk-[A-Za-z0-9_-]+/g, '[redacted]').replace(/Bearer\s+\S+/gi, 'Bearer [redacted]'); }
function connect() {
  if (connectPromise) return connectPromise;
  if (isTest) { connection = { state: 'demo', detail: '隔离测试服务' }; return Promise.resolve(); }
  connectPromise = (async () => {
    connection = { state: 'connecting' }; broadcast({ type: 'connection', connection });
    if (rpc) { rpc.removeAllListeners(); rpc.close(); }
    loaded.clear();
    rpc = new CodexRpc();
    rpc.on('disconnected', error => { connection = { state: 'error', detail: safeError(error) }; active.clear(); loaded.clear(); approvals.clear(); broadcast({ type: 'connection', connection }); });
    rpc.on('notification', msg => {
      const { method, params: p } = msg;
      if (method === 'turn/started' && loaded.has(p.threadId)) active.set(p.threadId, p.turn.id);
      if (method === 'turn/completed') {
        if (active.get(p.threadId) === p.turn.id) active.delete(p.threadId);
        finishedTurns.set(p.turn.id, p.turn);
        if (finishedTurns.size > 100) finishedTurns.delete(finishedTurns.keys().next().value);
        store.finish(p.threadId, p.turn.id, p.turn.status).catch(() => {});
      }
      if (method === 'serverRequest/resolved') approvals.delete(String(p.requestId));
      // Deliberately exclude hidden reasoning and raw function outputs from the UI bridge.
      if (method.startsWith('item/reasoning')) return;
      if (p?.item?.type === 'reasoning' || p?.item?.type === 'functionCallOutput') return;
      if (/^(turn\/|item\/agentMessage\/|item\/started$|item\/completed$|item\/commandExecution\/outputDelta$|thread\/status\/changed$|error$|serverRequest\/resolved$)/.test(method)) broadcast({ type: 'codex', method, params: p });
    });
    rpc.on('request', msg => {
      if (mentorStore.data.sessions.some(s=>s.threadId===msg.params?.threadId) && ['item/commandExecution/requestApproval','item/fileChange/requestApproval','execCommandApproval','applyPatchApproval'].includes(msg.method)) {
        rpc.respond(msg.id,{decision:['execCommandApproval','applyPatchApproval'].includes(msg.method)?'denied':'decline'});
        broadcast({type:'notice',threadId:msg.params.threadId,message:'导师保持只读讲解，需要额外权限的操作已取消。'});return;
      }
      if (['item/commandExecution/requestApproval', 'item/fileChange/requestApproval', 'item/tool/requestUserInput', 'execCommandApproval', 'applyPatchApproval'].includes(msg.method)) {
        approvals.set(String(msg.id), msg); broadcast({ type: 'approval', request: msg }); return;
      }
      if (msg.method === 'item/tool/call') {
        rpc.respond(msg.id, { success: false, contentItems: [{ type: 'inputText', text: 'This desktop-host tool is unavailable in Codex Court. Do not claim it ran. Use available Codex built-in tools or explain this limitation to the user.' }] });
        broadcast({ type: 'notice', threadId: msg.params.threadId, message: `此会话请求了桌面专属工具 ${msg.params.tool || ''}，法庭客户端暂不支持该工具。` }); return;
      }
      if (msg.method === 'mcpServer/elicitation/request') rpc.respond(msg.id, { action: 'cancel', content: null });
      else if (msg.method === 'item/permissions/requestApproval') rpc.respond(msg.id, { permissions: {}, scope: 'turn' });
      else rpc.send({ id: msg.id, error: { code: -32601, message: 'This client does not support this host request.' } });
      broadcast({ type: 'notice', threadId: msg.params?.threadId, message: 'Codex 请求了本客户端尚未支持的交互，已明确返回未执行。可回到官方客户端继续。' });
    });
    try {
      await rpc.connect();
      const results = await Promise.allSettled([rpc.call('account/read', { refreshToken: false }), rpc.call('model/list', {})]);
      account = results[0].status === 'fulfilled' ? { type: results[0].value.account?.type || null, plan: results[0].value.account?.planType || null } : null;
      modelList = results[1].status === 'fulfilled' ? results[1].value.data.filter(m => !m.hidden) : [];
      connection = { state: 'connected' }; broadcast({ type: 'connection', connection });
    } catch (e) { connection = { state: 'error', detail: safeError(e) }; broadcast({ type: 'connection', connection }); }
  })().finally(() => { connectPromise = null; });
  return connectPromise;
}
const mentor = new MentorService({store:mentorStore,native,root,isTest,loaded,active,starting,finishedTurns,broadcast,history,cleanTurn,approvals});
void connect();

async function native() { if (connectPromise) await connectPromise; if (connection.state !== 'connected') throw Object.assign(new Error(connection.detail || 'Codex 尚未连接'), { status: 503 }); return rpc; }
async function locked(id) {
  if (id === 'training' || loaded.has(id)) return false;
  try { await access(path.join(process.env.CODEX_HOME || path.join(os.homedir(), '.codex'), 'thread-writer-locks', id + '.lock')); return true; } catch { return false; }
}
async function seedTraining() { if (!store.data.cases.training) { await store.addEvidence('training', trainingEvidence); } }
function cleanTurn(turn) { return { ...turn, items: (turn.items || []).filter(i => !['reasoning','functionCallOutput','hookPrompt'].includes(i.type)) }; }
async function history(id, cursor) {
  const bridge = await native();
  try { const r = await bridge.call('thread/turns/list', { threadId: id, limit: 12, sortDirection: 'desc', itemsView: 'full', ...(cursor ? { cursor } : {}) }); return { turns: r.data.map(cleanTurn).reverse(), nextCursor: r.nextCursor }; }
  catch (e) {
    if (cursor || !/unsupported|unknown|not support|legacy|not found.*method/i.test(e.message)) throw e;
    const r = await bridge.call('thread/read', { threadId: id, includeTurns: true }); return { turns: r.thread.turns.map(cleanTurn), nextCursor: null };
  }
}
function sendJson(res, status, data) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); }
async function body(req) {
  let size = 0; const buffers = [];
  for await (const chunk of req) { size += chunk.length; if (size > 12_000_000) throw Object.assign(new Error('请求内容过大'), { status: 413 }); buffers.push(chunk); }
  try { return JSON.parse(Buffer.concat(buffers).toString('utf8') || '{}'); } catch { throw Object.assign(new Error('请求格式无效'), { status: 400 }); }
}
async function runTurn(id, input) {
  if (starting.has(id) || active.has(id)) throw Object.assign(new Error('这场庭审正在回应，请等待结束或先暂停。'), { status: 409 });
  starting.add(id);
  try {
    const evidenceIds = Array.isArray(input.evidenceIds) ? input.evidenceIds : [];
    const evidence = store.get(id).evidence.filter(e => evidenceIds.includes(e.id));
    if (evidence.length !== new Set(evidenceIds).size) throw new Error('部分证据已移除，请重新选择');
    if (evidence.length > 8) throw new Error('每次最多出示 8 份证据');
    const action = input.action || 'chat';
    const text = String(input.text || '').slice(0, 100_000);
    const quote = input.quote ? { text: String(input.quote.text || '').slice(0, 30_000), itemId: String(input.quote.itemId || ''), turnId: String(input.quote.turnId || '') } : null;
    const messages = buildInput({ text, action, quote, evidence });
    const clientId = randomUUID();
    let turn;
    if (id === 'training') {
      turn = { id: randomUUID(), status: 'inProgress', items: [{ type: 'userMessage', id: clientId, content: messages }] };
      demoTurns.push(turn); active.set(id, turn.id);
      broadcast({ type: 'codex', method: 'turn/started', params: { threadId: id, turn } });
      setTimeout(async () => {
        const reply = trainingReply(action, text, evidence.length > 0);
        const item = { type: 'agentMessage', id: randomUUID(), phase: 'final', text: '' };
        turn.items.push(item);
        broadcast({ type: 'codex', method: 'item/started', params: { threadId: id, turnId: turn.id, item } });
        for (let i = 0; i < reply.length; i += 10) {
          if (!active.has(id)) return;
          const delta = reply.slice(i, i + 10); item.text += delta;
          broadcast({ type: 'codex', method: 'item/agentMessage/delta', params: { threadId: id, turnId: turn.id, itemId: item.id, delta } });
          await new Promise(r => setTimeout(r, 22));
        }
        turn.status = 'completed'; active.delete(id);
        broadcast({ type: 'codex', method: 'item/completed', params: { threadId: id, turnId: turn.id, item } });
        await store.finish(id, turn.id, 'completed');
        broadcast({ type: 'codex', method: 'turn/completed', params: { threadId: id, turn } });
      }, 200);
    } else {
      const bridge = await native();
      if (!loaded.has(id)) {
        // Runtime enforces the actual cross-process writer lock; never bypass or delete it.
        try { await bridge.call('thread/resume', { threadId: id, excludeTurns: true }); }
        catch (e) {
          if (/lock|writer|already.*use|another.*process|owned|busy/i.test(e.message)) throw Object.assign(new Error('此会话仍由另一个 Codex 窗口占用。请结束该窗口中的任务并释放会话，再重试；原历史已保留。'), { status: 409 });
          throw e;
        }
        loaded.add(id);
      }
      const params = { threadId: id, input: messages, clientUserMessageId: clientId };
      if (input.model) { if (!modelList.some(m => m.model === input.model)) throw new Error('请选择可用的模型'); params.model = input.model; }
      if (input.effort) params.effort = input.effort;
      turn = (await bridge.call('turn/start', params)).turn;
      if (finishedTurns.has(turn.id)) turn = { ...turn, ...finishedTurns.get(turn.id) };
      if (turn.status === 'inProgress') active.set(id, turn.id);
    }
    if (action !== 'chat') await store.addExamination(id, { action, quote, note: text, evidence: evidence.map(e => ({ id: e.id, title: e.title, hash: e.hash })), turnId: turn.id, status: turn.status });
    return { turn: cleanTurn(turn), record: store.get(id) };
  } finally { starting.delete(id); }
}

const server = http.createServer(async (req, res) => {
  const expected = `127.0.0.1:${port}`;
  if (req.headers.host !== expected && req.headers.host !== `localhost:${port}`) return sendJson(res, 403, { error: '无效的本机地址' });
  const origin = req.headers.origin;
  const allowedOrigins = [`http://${expected}`, `http://localhost:${port}`];
  if (process.env.COURT_DEV === '1') allowedOrigins.push('http://127.0.0.1:5173', 'http://localhost:5173');
  if ((origin && !allowedOrigins.includes(origin)) || req.headers['sec-fetch-site'] === 'cross-site') return sendJson(res, 403, { error: '仅允许本机客户端访问' });
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; media-src 'self' blob:; frame-ancestors 'none'; base-uri 'none'; object-src 'none'");
  const url = new URL(req.url, `http://${expected}`), pathname = url.pathname;
  try {
    if (pathname === '/api/health') return sendJson(res, 200, { app: 'codex-court', version: '1.3.1' });
    if (pathname === '/api/bootstrap' && req.method === 'GET') {
      res.setHeader('Set-Cookie', `court_session=${token}; HttpOnly; SameSite=Strict; Path=/`);
      return sendJson(res, 200, { token, connection, account, models: modelList, cwd: root, testMode: isTest, active: Object.fromEntries(active), approvals: [...approvals.values()] });
    }
    if (pathname.startsWith('/api/')) {
      const authorized = req.headers['x-court-token'] === token || req.headers.cookie?.split(';').some(c => c.trim() === `court_session=${token}`);
      if (!authorized) return sendJson(res, 401, { error: '请刷新页面重新连接' });
      if (req.method !== 'GET' && req.headers['x-court-token'] !== token) return sendJson(res, 403, { error: '缺少请求凭据，请刷新页面' });
    }
    if (pathname === '/api/music' && req.method === 'GET') return sendJson(res, 200, music.snapshot());
    if (pathname === '/api/music/settings' && req.method === 'PATCH') return sendJson(res, 200, await music.settings(await body(req)));
    if (pathname === '/api/music/tracks' && req.method === 'POST') {
      let size = 0; const chunks = [];
      for await (const chunk of req) { size += chunk.length; if (size > MAX_AUDIO_BYTES) throw Object.assign(new Error('单曲最多 64 MB'), { status: 413 }); chunks.push(chunk); }
      const input = { name: url.searchParams.get('name'), version: url.searchParams.get('version'), assign: url.searchParams.get('assign') === 'true' };
      if (url.searchParams.has('phase')) input.phase = url.searchParams.get('phase');
      return sendJson(res, 200, await music.import(Buffer.concat(chunks), input));
    }
    const musicMatch = pathname.match(/^\/api\/music\/tracks\/([a-f0-9-]{36})(\/audio)?$/);
    if (musicMatch) {
      if (musicMatch[2] && req.method === 'GET') return await music.stream(musicMatch[1], req, res);
      if (!musicMatch[2] && req.method === 'PATCH') return sendJson(res, 200, await music.edit(musicMatch[1], await body(req)));
      if (!musicMatch[2] && req.method === 'DELETE') return sendJson(res, 200, await music.remove(musicMatch[1]));
    }
    if (pathname === '/api/events' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
      res.write(': connected\n\n'); clients.add(res);
      const pulse = setInterval(() => res.write(': heartbeat\n\n'), 15000);
      req.on('close', () => { clearInterval(pulse); clients.delete(res); }); return;
    }
    if (isTest && pathname === '/api/test/reset' && req.method === 'POST') {
      if (active.size) throw new Error('等待测试回应完成后再重置');
      demoTurns = structuredClone(trainingTurns);
      delete store.data.cases.training; await store.save();
      return sendJson(res, 200, { ok: true });
    }
    if (pathname === '/api/connect' && req.method === 'POST') {
      if (active.size) throw new Error('请先等待当前回应结束，再重新连接');
      await connect(); return sendJson(res, 200, { connection, account, models: modelList });
    }
    if (pathname === '/api/disconnect' && req.method === 'POST') {
      if (active.size || starting.size) throw new Error('请先等待回应结束或暂停，再交还会话');
      if (rpc) { rpc.removeAllListeners(); rpc.close(); rpc = null; }
      loaded.clear(); approvals.clear(); connection = { state: 'disconnected' };
      broadcast({ type: 'connection', connection });
      return sendJson(res, 200, { ok: true });
    }
    if (pathname === '/api/shutdown' && req.method === 'POST') {
      if (active.size || starting.size) throw new Error('请先等待当前回应结束或暂停，再停止法庭服务');
      sendJson(res, 200, { ok: true }); setTimeout(shutdown, 100); return;
    }
    if (pathname === '/api/threads' && req.method === 'GET') {
      if (isTest) return sendJson(res, 200, { data: [], nextCursor: null });
      const params = { limit: 40, sortKey: 'updated_at', modelProviders: [], sourceKinds: ['cli', 'vscode', 'appServer', 'exec'], useStateDbOnly: true, archived: url.searchParams.get('archived') === 'true' };
      if (url.searchParams.get('cursor')) params.cursor = url.searchParams.get('cursor');
      if (url.searchParams.get('search')) params.searchTerm = url.searchParams.get('search');
      const result = await (await native()).call('thread/list', params);
      return sendJson(res, 200, result);
    }
    if (pathname === '/api/threads' && req.method === 'POST') {
      const input = await body(req), bridge = await native();
      const cwd = path.resolve(input.cwd || root);
      if (!(await stat(cwd)).isDirectory()) throw new Error('请选择存在的项目目录');
      const params = { cwd, approvalPolicy: 'on-request', sandbox: 'workspace-write' };
      if (input.model) params.model = input.model;
      const result = await bridge.call('thread/start', params); loaded.add(result.thread.id);
      if (input.name?.trim()) { await bridge.call('thread/name/set', { threadId: result.thread.id, name: input.name.trim().slice(0, 100) }); result.thread.name = input.name.trim(); }
      return sendJson(res, 200, { thread: result.thread });
    }
    if (pathname === '/api/mentor/sessions' && req.method === 'POST') return sendJson(res, 200, await mentor.open(await body(req)));
    const lesson = pathname.match(/^\/api\/mentor\/sessions\/([^/]+)(?:\/(.+))?$/);
    if (lesson) {
      const id = requireId(lesson[1]), op = lesson[2];
      if (!op && req.method === 'GET') return sendJson(res,200,await mentor.snapshot(id,url.searchParams.get('cursor')));
      if (op === 'turn' && req.method === 'POST') return sendJson(res,200,await mentor.ask(id,await body(req)));
      if (op === 'interrupt' && req.method === 'POST') return sendJson(res,200,await mentor.interrupt(id));
      if (op === 'preferences' && req.method === 'PATCH') return sendJson(res,200,await mentor.preferences(id,await body(req)));
      if (op === 'cards' && req.method === 'POST') return sendJson(res,200,await mentorStore.card(id,await body(req)));
      if (op?.startsWith('cards/')) {
        const cardId=requireId(op.slice(6));
        if (req.method === 'PATCH') return sendJson(res,200,await mentorStore.card(id,await body(req),cardId));
        if (req.method === 'DELETE') { const session=mentorStore.get(id);session.cards=session.cards.filter(c=>c.id!==cardId);await mentorStore.save();return sendJson(res,200,{ok:true}); }
      }
    }
    const match = pathname.match(/^\/api\/cases\/([^/]+)(?:\/(.+))?$/);
    if (match) {
      const id = requireId(match[1]), op = match[2];
      if (id === 'training') await seedTraining();
      if (!op && req.method === 'GET') {
        const thread = id === 'training' ? trainingThread : (await (await native()).call('thread/read', { threadId: id })).thread;
        const h = id === 'training' ? { turns: demoTurns, nextCursor: null } : await history(id, url.searchParams.get('cursor'));
        return sendJson(res, 200, { thread: { ...thread, turns: undefined }, ...h, record: store.get(id), locked: await locked(id), activeTurn: active.get(id) || null, approvals: [...approvals.values()].filter(a => a.params.threadId === id) });
      }
      if (op === 'record' && req.method === 'GET') return sendJson(res, 200, store.get(id));
      if (op === 'evidence' && req.method === 'POST') return sendJson(res, 200, await store.addEvidence(id, await body(req)));
      if (op?.startsWith('evidence/') && req.method === 'DELETE') { await store.removeEvidence(id, op.slice(9)); return sendJson(res, 200, store.get(id)); }
      if (op === 'turn' && req.method === 'POST') return sendJson(res, 200, await runTurn(id, await body(req)));
      if (op === 'interrupt' && req.method === 'POST') {
        const turnId = active.get(id); if (!turnId) throw new Error('没有本客户端正在运行的回应');
        if (id === 'training') { active.delete(id); const turn = demoTurns.find(t => t.id === turnId); turn.status = 'interrupted'; await store.finish(id, turnId, 'interrupted'); broadcast({ type: 'codex', method: 'turn/completed', params: { threadId: id, turn } }); }
        else await (await native()).call('turn/interrupt', { threadId: id, turnId });
        return sendJson(res, 200, { ok: true });
      }
      if (op === 'release' && req.method === 'POST') {
        if (active.has(id)) throw new Error('请先暂停当前回应');
        if (loaded.has(id)) { await (await native()).call('thread/unsubscribe', { threadId: id }); loaded.delete(id); }
        return sendJson(res, 200, { ok: true });
      }
      if (op?.startsWith('examinations/') && req.method === 'PATCH') {
        const input = await body(req); if (!['pending','upheld','revised','uncertain'].includes(input.resolution)) throw new Error('无效的复核标记');
        const entry = store.get(id).examinations.find(e => e.id === op.slice(13)); if (!entry) throw new Error('未找到质询记录');
        entry.resolution = input.resolution; await store.save(); return sendJson(res, 200, store.get(id));
      }
      if (op === 'export' && req.method === 'GET') {
        res.setHeader('Content-Disposition', `attachment; filename="court-record-${id}.json"`);
        return sendJson(res, 200, { app: 'Codex Court', exportedAt: new Date().toISOString(), threadId: id, record: store.get(id) });
      }
    }
    if (pathname.startsWith('/api/approvals/') && req.method === 'POST') {
      const id = decodeURIComponent(pathname.slice(15)), request = approvals.get(id); if (!request) throw new Error('该请求已处理或已失效');
      const input = await body(req); let result;
      if (request.method === 'item/tool/requestUserInput') {
        const answers = {};
        for (const q of request.params.questions) answers[q.id] = { answers: [String(input.answers?.[q.id] || '').slice(0,10000)] };
        result = { answers };
      } else {
        if (!['accept','decline','cancel'].includes(input.decision)) throw new Error('无效的审批决定');
        result = { decision: input.decision };
        if (['execCommandApproval','applyPatchApproval'].includes(request.method)) result = { decision: input.decision === 'accept' ? 'approved' : 'denied' };
      }
      (await native()).respond(request.id, result); approvals.delete(id);
      broadcast({ type: 'approvalResolved', id }); return sendJson(res, 200, { ok: true });
    }
    if (pathname.startsWith('/api/')) return sendJson(res, 404, { error: '未找到接口' });
    if (req.method !== 'GET') return sendJson(res, 405, { error: '不支持此操作' });
    const dist = path.join(root, 'dist');
    const filename = pathname === '/' ? 'index.html' : decodeURIComponent(pathname).replace(/^\/+/, '');
    const target = path.resolve(dist, filename);
    if (!target.startsWith(dist + path.sep)) return sendJson(res, 403, { error: '无效的路径' });
    const contents = await readFile(target);
    const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json':'application/json' };
    res.writeHead(200, { 'Content-Type': types[path.extname(target)] || 'application/octet-stream', 'Cache-Control': target.endsWith('index.html') ? 'no-store' : 'public, max-age=3600' }); res.end(contents);
  } catch (e) { if (!res.headersSent) sendJson(res, e.status || (e.code === 'ENOENT' ? 404 : 400), { error: safeError(e) }); else res.end(); }
});
server.listen(port, '127.0.0.1', () => console.log(`Codex Court ready at http://127.0.0.1:${port} (${isTest ? 'isolated test' : 'local Codex'})`));
server.on('error', e => { console.error(e.code === 'EADDRINUSE' ? '端口已占用，请使用现有窗口或更换 PORT。' : safeError(e)); rpc?.close(); process.exitCode = 1; });
function shutdown() { for (const client of clients) client.end(); rpc?.close(); server.close(); setTimeout(() => process.exit(), 1700).unref(); }
process.on('SIGTERM', shutdown); process.on('SIGINT', shutdown);

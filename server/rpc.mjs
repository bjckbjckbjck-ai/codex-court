import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { createInterface } from 'node:readline';
import { findCodex } from './find-codex.mjs';
export { findCodex } from './find-codex.mjs';

export class CodexRpc extends EventEmitter {
  constructor(options = {}) { super(); this.pending = new Map(); this.nextId = 1; this.closed = false; this.env = options.env || process.env; }
  async connect() {
    const args = this.env.CODEX_COURT_PROXY === '1' ? ['app-server', 'proxy'] : ['app-server', '--listen', 'stdio://'];
    this.child = spawn(findCodex({env:this.env}), args, { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true, env: this.env });
    this.child.stdin.on('error', () => {});
    this.child.on('error', error => this.fail(error));
    this.child.on('exit', (code) => { if (!this.closed) this.fail(new Error(`Codex 连接已结束（${code ?? '断开'}），请重新连接。`)); });
    // Never forward raw runtime logs: they can contain private configuration.
    this.child.stderr.on('data', () => {});
    createInterface({ input: this.child.stdout }).on('line', line => {
      let msg; try { msg = JSON.parse(line); } catch { return; }
      if (msg.method) { this.emit(msg.id !== undefined ? 'request' : 'notification', msg); return; }
      const entry = this.pending.get(msg.id);
      if (!entry) return;
      clearTimeout(entry.timer); this.pending.delete(msg.id);
      if (msg.error) { const error = new Error(msg.error.message); error.code = msg.error.code; entry.reject(error); }
      else entry.resolve(msg.result);
    });
    this.info = await this.call('initialize', { clientInfo: { name: 'codex_court', title: 'Codex Court', version: '1.3.1' }, capabilities: { experimentalApi: true } });
    this.send({ method: 'initialized', params: {} });
    return this.info;
  }
  send(msg) { if (!this.child?.stdin.writable || this.closed) throw new Error('Codex 连接不可用'); this.child.stdin.write(JSON.stringify(msg) + '\n'); }
  call(method, params = {}, timeout = 45000) {
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`${method} 等待超时，请稍后重试。`)); }, timeout);
      this.pending.set(id, { resolve, reject, timer });
      try { this.send({ id, method, params }); } catch (e) { clearTimeout(timer); this.pending.delete(id); reject(e); }
    });
  }
  respond(id, result) { this.send({ id, result }); }
  fail(error) {
    for (const entry of this.pending.values()) { clearTimeout(entry.timer); entry.reject(error); }
    this.pending.clear(); this.emit('disconnected', error);
  }
  close() {
    this.closed = true;
    this.fail(new Error('连接已关闭'));
    // Only the process spawned by this instance is closed. Never stop the desktop app or daemon.
    this.child?.stdin.end();
    const child = this.child;
    const timer = setTimeout(() => { if (child && child.exitCode === null) child.kill(); }, 1500);
    timer.unref();
  }
}

import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const envValue = (env, key) => env[Object.keys(env).find(name => name.toUpperCase() === key.toUpperCase())] || '';
const unquote = value => String(value).trim().replace(/^"(.*)"$/, '$1');
function fileInfo(filename) { try { const info = statSync(filename); return info.isFile() ? info : null; } catch { return null; } }
function entries(directory) { try { return readdirSync(directory, { withFileTypes: true }); } catch { return []; } }

export function findCodex({ env = process.env, platform = process.platform } = {}) {
  const explicit = unquote(envValue(env, 'CODEX_BINARY'));
  if (explicit) {
    if (!fileInfo(explicit)) throw new Error('CODEX_BINARY 指定的程序不存在，请更新该路径或取消此设置后重试。');
    return path.resolve(explicit);
  }
  if (platform !== 'win32') return 'codex';

  // Explorer-launched shortcuts do not inherit Codex's temporary PATH additions.
  // Inspect PATH ourselves, without where.exe's noisy errors or implicit cwd search.
  for (const entry of envValue(env, 'PATH').split(';')) {
    const directory = unquote(entry);
    if (!path.isAbsolute(directory)) continue;
    const executable = path.join(directory, 'codex.exe');
    if (fileInfo(executable)) return executable;
  }

  const profile = envValue(env, 'USERPROFILE');
  const local = envValue(env, 'LOCALAPPDATA') || (profile ? path.join(profile, 'AppData', 'Local') : '');
  if (local) {
    const bin = path.join(local, 'OpenAI', 'Codex', 'bin');
    const candidates = [path.join(bin, 'codex.exe')];
    for (const entry of entries(bin)) if (entry.isDirectory()) candidates.push(path.join(bin, entry.name, 'codex.exe'));
    const installed = candidates.map(filename => ({ filename, info: fileInfo(filename) })).filter(item => item.info).sort((a,b) => b.info.mtimeMs - a.info.mtimeMs);
    if (installed.length) return installed[0].filename;
  }
  throw new Error('未找到可用的 Codex 程序。已检查系统 PATH 和本机 Codex 安装目录；自定义安装可通过 CODEX_BINARY 指定 codex.exe。');
}

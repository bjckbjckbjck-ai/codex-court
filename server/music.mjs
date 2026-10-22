import { mkdir, readFile, writeFile, rename, unlink, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { DEFAULT_MUSIC_SETTINGS, PHASES, MAX_AUDIO_BYTES, AUDIO_EXTENSIONS, inferPhase, upgradePhaseBindings } from '../shared/music.mjs';

const failure = (message, status = 400) => Object.assign(new Error(message), { status });
const clean = (value, max = 100) => String(value || '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, max);
const validPhase = value => value === '' || PHASES.some(p => p.id === value);
export function audioType(bytes, filename) {
  if (!AUDIO_EXTENSIONS.test(filename)) throw failure('支持 MP3、OGG、WAV、FLAC、M4A、AAC 和 OPUS 文件');
  const sig = bytes.subarray(0, 12).toString('latin1');
  if (sig.startsWith('RIFF') && sig.slice(8) === 'WAVE') return { ext: 'wav', mime: 'audio/wav' };
  if (sig.startsWith('OggS')) return { ext: 'ogg', mime: 'audio/ogg' };
  if (sig.startsWith('fLaC')) return { ext: 'flac', mime: 'audio/flac' };
  if (sig.slice(4, 8) === 'ftyp') return { ext: 'm4a', mime: 'audio/mp4' };
  if (sig.startsWith('ID3') || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0 && (bytes[1] & 6) !== 0)) return { ext: 'mp3', mime: 'audio/mpeg' };
  if (bytes[0] === 0xff && (bytes[1] & 0xf6) === 0xf0) return { ext: 'aac', mime: 'audio/aac' };
  throw failure('文件不是可识别的音频，请检查文件内容');
}
export function byteRange(header, size) {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!m || (!m[1] && !m[2])) throw failure('无效的音频范围', 416);
  let start = m[1] ? Number(m[1]) : Math.max(0, size - Number(m[2]));
  let end = m[1] && m[2] ? Math.min(size - 1, Number(m[2])) : size - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= size || end < start) throw failure('音频范围超出文件', 416);
  return { start, end };
}
export class MusicStore {
  constructor(directory) { this.directory = directory; this.file = path.join(directory, 'library.json'); this.queue = Promise.resolve(); }
  async load() {
    await mkdir(this.directory, { recursive: true });
    try {
      this.data = JSON.parse(await readFile(this.file, 'utf8'));
      if (!Array.isArray(this.data.tracks) || !Array.isArray(this.data.settings?.bindings)) throw new Error('Invalid music library');
    } catch (e) {
      if (e.code !== 'ENOENT') throw new Error('音乐库无法读取；原文件已保留，请先检查 library.json');
      this.data = { tracks: [], settings: structuredClone(DEFAULT_MUSIC_SETTINGS) };
    }
    if (upgradePhaseBindings(this.data)) await this.mutate(() => {});
    return this;
  }
  snapshot() { return structuredClone(this.data); }
  mutate(operation) {
    const job = this.queue.catch(() => {}).then(async () => {
      const next = this.snapshot();
      await operation(next);
      const temp = this.file + '.tmp';
      await writeFile(temp, JSON.stringify(next, null, 2));
      await rename(temp, this.file);
      this.data = next;
      return this.snapshot();
    });
    this.queue = job;
    return job;
  }
  async import(bytes, input) {
    if (!bytes.length || bytes.length > MAX_AUDIO_BYTES) throw failure('音频文件不能为空，单曲最多 64 MB', 413);
    const filename = clean(input.name, 240), type = audioType(bytes, filename);
    const version = clean(input.version) || DEFAULT_MUSIC_SETTINGS.version;
    const phase = input.phase ?? inferPhase(filename);
    if (!validPhase(phase)) throw failure('请选择有效的配乐环节');
    const track = { id: randomUUID(), title: clean(filename.replace(/\.[^.]+$/, ''), 160), version, phase, ...type, size: bytes.length, createdAt: new Date().toISOString() };
    const target = path.join(this.directory, `${track.id}.${track.ext}`);
    await writeFile(target, bytes, { flag: 'wx' });
    try {
      return await this.mutate(next => {
        if (next.tracks.length >= 1000) throw failure('音乐库最多收录 1000 首曲目');
        next.tracks.push(track);
        if (input.assign && phase && !next.settings.bindings.some(b => b.version === version && b.phase === phase)) next.settings.bindings.push({ version, phase, trackId: track.id });
      });
    } catch (e) { await unlink(target).catch(() => {}); throw e; }
  }
  settings(input) {
    return this.mutate(next => {
      for (const key of ['enabled', 'auto']) if (input[key] !== undefined) {
        if (typeof input[key] !== 'boolean') throw failure('无效的音乐开关');
        next.settings[key] = input[key];
      }
      if (input.volume !== undefined) {
        if (!Number.isFinite(input.volume) || input.volume < 0 || input.volume > 1) throw failure('音量应在 0 到 100% 之间');
        next.settings.volume = input.volume;
      }
      if (input.version !== undefined) {
        const version = clean(input.version); if (!version) throw failure('版本名称不能为空'); next.settings.version = version;
      }
      if (input.binding) {
        const { phase, trackId } = input.binding, version = clean(input.binding.version);
        if (!version || !phase || !validPhase(phase)) throw failure('无效的配乐分配');
        if (trackId && !next.tracks.some(t => t.id === trackId)) throw failure('找不到这首曲目');
        next.settings.bindings = next.settings.bindings.filter(b => b.version !== version || b.phase !== phase);
        if (trackId) next.settings.bindings.push({ version, phase, trackId });
      }
    });
  }
  edit(id, input) {
    return this.mutate(next => {
      const track = next.tracks.find(t => t.id === id); if (!track) throw failure('曲目不存在', 404);
      if (input.title !== undefined) { const title = clean(input.title, 160); if (!title) throw failure('曲名不能为空'); track.title = title; }
      if (input.version !== undefined) { const version = clean(input.version); if (!version) throw failure('版本名称不能为空'); track.version = version; }
      if (input.phase !== undefined) { if (!validPhase(input.phase)) throw failure('无效的配乐环节'); track.phase = input.phase; }
    });
  }
  async remove(id) {
    const track = this.data.tracks.find(t => t.id === id); if (!track) throw failure('曲目不存在', 404);
    const result = await this.mutate(next => { next.tracks = next.tracks.filter(t => t.id !== id); next.settings.bindings = next.settings.bindings.filter(b => b.trackId !== id); });
    await unlink(this.pathFor(track)).catch(e => { if (e.code !== 'ENOENT') console.error('Could not remove unused audio file:', e.code); });
    return result;
  }
  pathFor(track) {
    if (!/^[a-f0-9-]{36}$/.test(track.id) || !/^(wav|ogg|flac|m4a|mp3|aac)$/.test(track.ext)) throw failure('无效的音频标识');
    return path.join(this.directory, `${track.id}.${track.ext}`);
  }
  async stream(id, req, res) {
    const track = this.data.tracks.find(t => t.id === id); if (!track) throw failure('曲目不存在', 404);
    const target = this.pathFor(track), { size } = await stat(target);
    let range;
    try { range = byteRange(req.headers.range, size); }
    catch (e) { res.setHeader('Content-Range', `bytes */${size}`); throw e; }
    const headers = { 'Content-Type': track.mime, 'Accept-Ranges': 'bytes', 'Cache-Control': 'private, no-store', 'Content-Length': range ? range.end - range.start + 1 : size };
    if (range) headers['Content-Range'] = `bytes ${range.start}-${range.end}/${size}`;
    res.writeHead(range ? 206 : 200, headers);
    const stream = createReadStream(target, range || {});
    stream.on('error', () => res.destroy());
    res.on('close', () => stream.destroy());
    stream.pipe(res);
  }
}

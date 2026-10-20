import { readFile, writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { audioType } from './music.mjs';
import { PHASES, MAX_AUDIO_BYTES } from '../shared/music.mjs';

export async function seedBundledMusic(store, directory) {
  if (store.data.bundledPackApplied) return;
  let manifest;
  try { manifest = JSON.parse(await readFile(path.join(directory, 'manifest.json'), 'utf8')); }
  catch (e) { if (e.code === 'ENOENT') return; throw new Error('默认音乐包清单无效'); }
  if (!manifest.id || typeof manifest.version !== 'string' || !Array.isArray(manifest.tracks) || manifest.tracks.length > 32) throw new Error('默认音乐包格式无效');
  // Existing users keep their library and preferences; even an intentionally emptied
  // seeded library stays empty on later restarts.
  if (store.data.tracks.length) { await store.mutate(next => { next.bundledPackApplied = manifest.id; }); return; }
  const root = path.resolve(directory), prepared = [], phases = new Set();
  for (const entry of manifest.tracks) {
    if (!PHASES.some(p => p.id === entry.phase) || phases.has(entry.phase)) throw new Error('默认音乐包环节无效或重复');
    phases.add(entry.phase);
    const source = path.resolve(root, entry.file);
    if (!source.startsWith(root + path.sep)) throw new Error('默认音乐包文件路径无效');
    const bytes = await readFile(source);
    if (!bytes.length || bytes.length > MAX_AUDIO_BYTES || bytes.length !== entry.bytes || createHash('sha256').update(bytes).digest('hex') !== entry.sha256) throw new Error('默认音乐校验失败，请重新下载发布包');
    const type = audioType(bytes, entry.file);
    prepared.push({ bytes, track: { id: randomUUID(), title: String(entry.title).slice(0,160), version: manifest.version, phase: entry.phase, ...type, size: bytes.length, createdAt: new Date().toISOString() } });
  }
  const written = [];
  try {
    await store.mutate(async next => {
      if (next.bundledPackApplied) return;
      for (const { bytes, track } of prepared) {
        const target = store.pathFor(track);
        await writeFile(target, bytes, { flag: 'wx' }); written.push(target);
        next.tracks.push(track);
        next.settings.bindings.push({ version: manifest.version, phase: track.phase, trackId: track.id });
      }
      next.settings.version = manifest.version;
      next.settings.enabled = true;
      next.bundledPackApplied = manifest.id;
    });
  } catch (e) { await Promise.all(written.map(file => unlink(file).catch(() => {}))); throw e; }
}

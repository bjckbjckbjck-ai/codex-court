import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './lib.js';
import { boundTrack, DEFAULT_MUSIC_SETTINGS } from '../shared/music.mjs';

// One audio element owns all playback, including previews; old tracks cannot overlap.
export function useMusic(ready) {
  const [library, setLibrary] = useState({ tracks: [], settings: structuredClone(DEFAULT_MUSIC_SETTINGS) });
  const [phase, setPhase] = useState('recess'), [previewId, setPreviewId] = useState(null), [paused, setPaused] = useState(false);
  const [playback, setPlayback] = useState({ state: 'off', title: '' }), [error, setError] = useState('');
  const audioRef = useRef(null), config = useRef(library.settings), phaseTimer = useRef(), fadeTimer = useRef(), revision = useRef(0), mutations = useRef(Promise.resolve());
  const pausedRef = useRef(paused), previewResume = useRef(null);
  pausedRef.current = paused;
  config.current = library.settings;
  useEffect(() => {
    if (!ready) return;
    let disposed = false;
    api('/music').then(value => { if (!disposed) { setLibrary(value); setError(''); } }).catch(e => { if (!disposed) setError(e.message); });
    return () => { disposed = true; };
  }, [ready]);
  useEffect(() => () => { clearTimeout(phaseTimer.current); clearInterval(fadeTimer.current); audioRef.current?.pause(); }, []);

  const changePhase = useCallback((next, { automatic = false, after = null, delay = 8000 } = {}) => {
    if (automatic && !config.current.auto) return;
    clearTimeout(phaseTimer.current); setPhase(next);
    if (after) phaseTimer.current = setTimeout(() => setPhase(after), delay);
  }, []);
  const clearScheduled = useCallback(() => clearTimeout(phaseTimer.current), []);
  const updateSettings = useCallback(patch => {
    const operation = mutations.current.catch(() => {}).then(async () => {
      const value = await api('/music/settings', { method: 'PATCH', body: patch });
      setLibrary(value); setError(''); return value;
    });
    mutations.current = operation;
    return operation;
  }, []);
  const preview = useCallback(id => { if (!previewResume.current) previewResume.current = { paused: pausedRef.current }; setPreviewId(id); setPaused(false); }, []);
  const endPreview = useCallback(() => { setPreviewId(null); if (previewResume.current) { setPaused(previewResume.current.paused); previewResume.current = null; } }, []);
  const toggle = useCallback(async () => {
    setPreviewId(null);
    previewResume.current = null;
    if (!config.current.enabled) { setPaused(false); await updateSettings({ enabled: true }); }
    else setPaused(value => !value);
  }, [updateSettings]);
  const retry = useCallback(() => {
    const audio = audioRef.current;
    if (!audio?.getAttribute('src')) return;
    audio.volume = config.current.volume;
    audio.play().then(() => setPlayback(value => ({ ...value, state: 'playing' }))).catch(() => setPlayback(value => ({ ...value, state: 'blocked' })));
  }, []);

  useEffect(() => {
    const audio = audioRef.current; if (!audio) return;
    const serial = ++revision.current; clearInterval(fadeTimer.current);
    const track = previewId ? library.tracks.find(t => t.id === previewId) : boundTrack(library, phase);
    audio.dataset.phase = phase;
    audio.dataset.preview = String(!!previewId);
    if ((!library.settings.enabled && !previewId) || paused || !track) {
      audio.pause();
      if (!track) { audio.removeAttribute('src'); audio.removeAttribute('data-track-id'); audio.load(); }
      setPlayback({ state: paused ? 'paused' : !library.settings.enabled && !previewId ? 'off' : 'empty', title: track?.title || '', id: track?.id });
      return;
    }
    let fading = false;
    const update = state => { if (revision.current === serial) setPlayback({ state, title: track.title, id: track.id }); };
    const ramp = (from, to, duration, done) => {
      clearInterval(fadeTimer.current); fading = true;
      const started = performance.now();
      fadeTimer.current = setInterval(() => {
        if (revision.current !== serial) { clearInterval(fadeTimer.current); return; }
        const portion = Math.min(1, (performance.now() - started) / duration);
        audio.volume = Math.max(0, Math.min(1, from + (to - from) * portion));
        if (portion === 1) { clearInterval(fadeTimer.current); fading = false; done?.(); }
      }, 25);
    };
    const start = () => {
      if (revision.current !== serial) return;
      if (audio.dataset.trackId !== track.id) { audio.src = `/api/music/tracks/${track.id}/audio`; audio.dataset.trackId = track.id; }
      audio.loop = true; audio.volume = 0;
      update('loading');
      audio.play().then(() => {
        if (revision.current !== serial) return;
        update('playing'); ramp(0, library.settings.volume, 240);
      }).catch(e => { if (revision.current === serial && e.name !== 'AbortError') update(e.name === 'NotAllowedError' ? 'blocked' : 'error'); });
    };
    const failed = () => update('error');
    audio.addEventListener('error', failed);
    if (audio.dataset.trackId === track.id && !audio.paused) { audio.volume = library.settings.volume; update('playing'); }
    else if (!audio.paused) ramp(audio.volume, 0, 180, () => { audio.pause(); start(); });
    else start();
    return () => { if (fading) clearInterval(fadeTimer.current); audio.removeEventListener('error', failed); };
  }, [library, phase, previewId, paused]);

  return { library, setLibrary, phase, changePhase, clearScheduled, previewId, preview, endPreview, paused, setPaused, playback, error, setError, updateSettings, toggle, retry, audioRef };
}

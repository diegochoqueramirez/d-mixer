import './styles.css';
import type { TimelineEntry, Track } from './types';
import { derive, getState, openEditor, pairKey, pairsWithDraft, setState, subscribe, updateTrack } from './state';
import { buildSequentialTimeline, buildTimeline, clipTimeline, previewRange } from './lib/timeline';
import { computePeaks, decodeFile, trackNameFromFile } from './audio/loader';
import { detectTempo } from './audio/bpm';
import * as engine from './audio/engine';
import { mountPlaylist } from './ui/playlist';
import { mountEditor } from './ui/editor';
import { mountTransport, mixBlocker } from './ui/transport';

async function loadTrack(id: string, file: File) {
  try {
    const buffer = await decodeFile(file);
    updateTrack(id, { buffer, duration: buffer.duration, peaks: computePeaks(buffer), status: 'analyzing' });
    const tempo = await detectTempo(buffer);
    updateTrack(id, tempo ? { ...tempo, status: 'ready' } : { status: 'bpm-required' });
  } catch {
    updateTrack(id, { status: 'error', error: 'El navegador no puede decodificar este archivo. Prueba con MP3 o WAV.' });
  }
}

function addFiles(files: File[]) {
  engine.getAudioContext();
  const added: Track[] = files.map((file) => ({
    id: crypto.randomUUID(),
    name: trackNameFromFile(file),
    buffer: null,
    duration: 0,
    bpm: null,
    firstBeatOffset: 0,
    peaks: null,
    status: 'decoding',
  }));
  setState((s) => ({ tracks: [...s.tracks, ...added] }));
  added.forEach((track, i) => void loadTrack(track.id, files[i]));
}

function buffersOf(tracks: Track[]): Map<string, AudioBuffer> {
  return new Map(tracks.filter((t) => t.buffer).map((t) => [t.id, t.buffer!]));
}

let framesRunning = false;

function startFrames() {
  if (framesRunning) return;
  framesRunning = true;
  requestAnimationFrame(frame);
}

function frame() {
  if (getState().playback === 'stopped') {
    framesRunning = false;
    return;
  }
  editor.tick(engine.mixTimeOf);
  requestAnimationFrame(frame);
}

function playMix() {
  const state = getState();
  if (mixBlocker(state)) return;
  const { tracks } = derive(state);
  const entries: TimelineEntry[] = state.mixEnabled ? buildTimeline(tracks, state.transitions, 0, 0) : buildSequentialTimeline(tracks);
  setState({ playback: 'playing' });
  void engine.play(entries, buffersOf(tracks), () => setState({ playback: 'stopped' }));
  startFrames();
}

/** Loops the editor's draft from 2 bars before to 2 bars after its window. */
function previewDraft() {
  const state = getState();
  if (!state.editor) return;
  const { tracks, pairs, validations } = pairsWithDraft(state);
  const i = state.editor.pairIndex;
  const pair = pairs[i];
  if (!pair || !validations[i].ok) return;

  const { draft } = state.editor;
  const range = previewRange(draft, pair.from.bpm!);
  const transitions = { ...state.transitions, [pairKey(draft.fromId, draft.toId)]: draft };
  const length = range.tauEnd - range.tauStart;
  const entries = clipTimeline(buildTimeline(tracks, transitions, i, range.startOffset, i + 1), length);

  if (state.playback !== 'previewing') setState({ playback: 'previewing' });
  void engine.playLoop(entries, length, buffersOf(tracks));
  startFrames();
}

function stopPlayback() {
  engine.stop();
  if (getState().playback !== 'stopped') setState({ playback: 'stopped' });
  editor.tick(() => null);
}

const playlist = mountPlaylist(
  document.querySelector<HTMLElement>('#header-actions')!,
  document.querySelector<HTMLElement>('#playlist')!,
  addFiles,
  (pairIndex) => {
    engine.getAudioContext();
    openEditor(pairIndex);
  },
);
const editor = mountEditor(document.querySelector<HTMLDialogElement>('#editor')!, {
  onPreview: previewDraft,
  onStop: stopPlayback,
  onClosed: (pairIndex) => {
    if (getState().playback === 'previewing') stopPlayback();
    playlist.focusChip(pairIndex);
  },
});
const transport = mountTransport(document.querySelector<HTMLElement>('#transport')!, { onPlayMix: playMix, onStop: stopPlayback });

function render() {
  const state = getState();
  playlist.update(state);
  editor.update(state);
  transport.update(state);
}

subscribe(render);
render();

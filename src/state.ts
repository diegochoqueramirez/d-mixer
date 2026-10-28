import type { AppState, Track, Transition, TransitionPreset, VolumeStyle } from './types';
import { PRESETS } from './lib/curves';
import { barsToSeconds, snapToBeat } from './lib/timing';
import { validateQueue, type Pair, type PairValidation } from './lib/validation';

type Listener = (state: AppState) => void;

let state: AppState = {
  tracks: [],
  transitions: {},
  mixEnabled: true,
  editor: null,
  playback: 'stopped',
};

const listeners = new Set<Listener>();

export function getState(): AppState {
  return state;
}

export function setState(update: Partial<AppState> | ((s: AppState) => Partial<AppState>)): void {
  const patch = typeof update === 'function' ? update(state) : update;
  state = normalize({ ...state, ...patch });
  listeners.forEach((l) => l(state));
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function updateTrack(id: string, patch: Partial<Track>): void {
  setState((s) => ({ tracks: s.tracks.map((t) => (t.id === id ? { ...t, ...patch } : t)) }));
}

export function pairKey(fromId: string, toId: string): string {
  return `${fromId}->${toId}`;
}

/** Tracks that take part in the playlist: files that failed to decode never form pairs. */
export function queueTracks(s: AppState): Track[] {
  return s.tracks.filter((t) => t.status !== 'error');
}

export interface Derived {
  tracks: Track[];
  pairs: (Pair | null)[];
  validations: PairValidation[];
}

/** Playlist tracks, their consecutive pairs (null while a pair has no transition) and each pair's validation. */
export function derive(s: AppState): Derived {
  const tracks = queueTracks(s);
  const pairs: (Pair | null)[] = [];
  const names: [string, string][] = [];
  for (let i = 0; i < tracks.length - 1; i++) {
    const from = tracks[i];
    const to = tracks[i + 1];
    const transition = s.transitions[pairKey(from.id, to.id)];
    pairs.push(transition ? { from, to, transition } : null);
    names.push([from.name, to.name]);
  }
  return { tracks, pairs, validations: validateQueue(pairs, names) };
}

/** The "Auto" transition: Fade over 8 bars, starting 16 bars of A before its end. */
export function defaultTransition(from: Track, to: Track): Transition {
  const bpm = from.bpm ?? 120;
  const outStart = snapToBeat(Math.max(0, from.duration - barsToSeconds(16, bpm)), bpm, from.firstBeatOffset);
  return {
    fromId: from.id,
    toId: to.id,
    outStart,
    inStart: to.firstBeatOffset,
    bars: 8,
    volume: PRESETS.fade.volume,
    preset: 'fade',
    auto: true,
  };
}

function isDecoded(t: Track): boolean {
  return t.status === 'ready' || t.status === 'bpm-required';
}

function sameTransition(a: Transition, b: Transition): boolean {
  return (
    a.outStart === b.outStart &&
    a.inStart === b.inStart &&
    a.bars === b.bars &&
    a.volume === b.volume &&
    a.preset === b.preset &&
    a.auto === b.auto
  );
}

/**
 * Creates a transition for every decoded pair and keeps Auto transitions in sync with the tracks'
 * BPM and first beat. Closes the editor if its pair no longer exists.
 */
function normalize(s: AppState): AppState {
  const tracks = queueTracks(s);
  let transitions = s.transitions;
  for (let i = 0; i < tracks.length - 1; i++) {
    const from = tracks[i];
    const to = tracks[i + 1];
    if (!isDecoded(from) || !isDecoded(to)) continue;
    const key = pairKey(from.id, to.id);
    const current = transitions[key];
    if (current && !current.auto) continue;
    const auto = defaultTransition(from, to);
    if (current && sameTransition(current, auto)) continue;
    if (transitions === s.transitions) transitions = { ...transitions };
    transitions[key] = auto;
  }

  let editor = s.editor;
  if (editor) {
    const from = tracks[editor.pairIndex];
    const to = tracks[editor.pairIndex + 1];
    const saved = from && to ? transitions[pairKey(from.id, to.id)] : undefined;
    if (!saved || editor.draft.fromId !== from.id || editor.draft.toId !== to.id) {
      editor = null;
    } else {
      const draft = editor.draft.auto ? defaultTransition(from, to) : editor.draft;
      editor = { ...editor, draft, dirty: !sameTransition(draft, saved) };
    }
  }

  return { ...s, transitions, editor };
}

// ---------- editor actions ----------

function editorPair(s: AppState) {
  if (!s.editor) return null;
  const tracks = queueTracks(s);
  return { from: tracks[s.editor.pairIndex], to: tracks[s.editor.pairIndex + 1] };
}

export function openEditor(pairIndex: number): void {
  setState((s) => {
    const tracks = queueTracks(s);
    const from = tracks[pairIndex];
    const to = tracks[pairIndex + 1];
    const saved = from && to ? s.transitions[pairKey(from.id, to.id)] : undefined;
    if (!saved) return {};
    return { editor: { pairIndex, draft: { ...saved }, dirty: false } };
  });
}

function editDraft(change: (draft: Transition) => Partial<Transition>): void {
  setState((s) => {
    if (!s.editor) return {};
    const draft = { ...s.editor.draft, ...change(s.editor.draft) };
    return { editor: { ...s.editor, draft } };
  });
}

/** Moving points or bars leaves Auto but keeps the preset name if the volume still matches. */
export function updateDraft(patch: Partial<Pick<Transition, 'outStart' | 'inStart' | 'bars'>>): void {
  editDraft(() => ({ ...patch, auto: false }));
}

export function applyPreset(preset: TransitionPreset): void {
  editDraft(() => ({ preset, volume: PRESETS[preset].volume, auto: false }));
}

export function setVolumeStyle(volume: VolumeStyle): void {
  editDraft(() => ({ volume, auto: false }));
}

export function resetToAuto(): void {
  setState((s) => {
    const pair = editorPair(s);
    if (!s.editor || !pair?.from || !pair.to) return {};
    return { editor: { ...s.editor, draft: defaultTransition(pair.from, pair.to) } };
  });
}

export function saveDraft(): void {
  setState((s) => {
    if (!s.editor) return {};
    const { draft } = s.editor;
    return { transitions: { ...s.transitions, [pairKey(draft.fromId, draft.toId)]: draft }, editor: null };
  });
}

export function closeEditor(): void {
  setState({ editor: null });
}

export function setMixEnabled(mixEnabled: boolean): void {
  setState({ mixEnabled });
}

/** Pairs with the editor's draft in place of the saved transition, for validating and previewing. */
export function pairsWithDraft(s: AppState): Derived {
  if (!s.editor) return derive(s);
  const { draft } = s.editor;
  return derive({ ...s, transitions: { ...s.transitions, [pairKey(draft.fromId, draft.toId)]: draft } });
}

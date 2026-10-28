import type { AppState, EditLane, EditorState, EffectStyle, EqStyle, FilterStyle, GainCurve, LoopStyle, SideCurves, Track, Transition, TransitionPreset, VolumeStyle } from './types';
import { PRESETS } from './lib/curves';
import { effectCurve } from './lib/effects';
import { curveFromStyle } from './lib/gainCurve';
import { bassCurves, filterCurves } from './lib/lanes';
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

export interface RemovedTrack {
  /** Same object: keeps its decoded buffer, BPM and status. */
  track: Track;
  /** Position in state.tracks before removal. */
  index: number;
}

/** Removes a track and returns what is needed to put it back. */
export function removeTrack(id: string): RemovedTrack | null {
  const index = state.tracks.findIndex((t) => t.id === id);
  if (index < 0) return null;
  const track = state.tracks[index];
  setState((s) => ({ tracks: s.tracks.filter((t) => t.id !== id) }));
  return { track, index };
}

/**
 * Re-inserts the track at its old index (clamped to the list length). Transitions are never
 * deleted when a track leaves, so its pairs find their saved transitions again.
 */
export function restoreTrack(removed: RemovedTrack): void {
  setState((s) => {
    if (s.tracks.some((t) => t.id === removed.track.id)) return {};
    const tracks = [...s.tracks];
    tracks.splice(Math.min(removed.index, tracks.length), 0, removed.track);
    return { tracks };
  });
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

/** The "Auto" transition: the full Fade recipe over 8 bars, starting 16 bars of A before its end. */
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
    customVolume: null,
    eq: PRESETS.fade.eq,
    filter: PRESETS.fade.filter,
    customEq: null,
    customFilter: null,
    effect: PRESETS.fade.effect,
    looping: PRESETS.fade.looping,
    customEffect: null,
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
    a.auto === b.auto &&
    a.eq === b.eq &&
    a.filter === b.filter &&
    a.effect === b.effect &&
    a.looping === b.looping &&
    JSON.stringify(a.customVolume) === JSON.stringify(b.customVolume) &&
    JSON.stringify(a.customEq) === JSON.stringify(b.customEq) &&
    JSON.stringify(a.customFilter) === JSON.stringify(b.customFilter) &&
    JSON.stringify(a.customEffect) === JSON.stringify(b.customEffect)
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

const HISTORY_LIMIT = 100;

type GestureStart = Pick<EditorState, 'draft' | 'past' | 'future'>;

/**
 * While a pointer gesture is open, only its first change is recorded in the undo history. `start` is the
 * editor as the gesture found it, so cancelGesture can put it back.
 */
let gesture: { open: boolean; recorded: boolean; start: GestureStart | null } = { open: false, recorded: false, start: null };

export function beginGesture(): void {
  const e = state.editor;
  gesture = { open: true, recorded: false, start: e ? { draft: e.draft, past: e.past, future: e.future } : null };
}

export function endGesture(): void {
  gesture = { open: false, recorded: false, start: null };
}

/** Ends the open gesture undoing it: draft, past and future go back to how they were at beginGesture. */
export function cancelGesture(): void {
  const start = gesture.start;
  endGesture();
  if (start) setState((s) => (s.editor ? { editor: { ...s.editor, ...start } } : {}));
}

function freshEditor(pairIndex: number, saved: Transition, customizing: EditLane | null): EditorState {
  return { pairIndex, draft: { ...saved }, dirty: false, customizing, past: [], future: [] };
}

function savedFor(s: AppState, pairIndex: number): Transition | undefined {
  const tracks = queueTracks(s);
  const from = tracks[pairIndex];
  const to = tracks[pairIndex + 1];
  return from && to ? s.transitions[pairKey(from.id, to.id)] : undefined;
}

export function openEditor(pairIndex: number): void {
  setState((s) => {
    const saved = savedFor(s, pairIndex);
    return saved ? { editor: freshEditor(pairIndex, saved, null) } : {};
  });
}

/** Replaces the draft and records the previous one in the undo history. */
function commitDraft(s: AppState, next: Transition): Partial<AppState> {
  if (!s.editor) return {};
  const e = s.editor;
  if (sameTransition(e.draft, next)) return {};
  let past = e.past;
  if (!gesture.open || !gesture.recorded) {
    past = [...e.past, e.draft].slice(-HISTORY_LIMIT);
    if (gesture.open) gesture.recorded = true;
  }
  return { editor: { ...e, draft: next, past, future: [] } };
}

function editDraft(change: (draft: Transition) => Partial<Transition>): void {
  setState((s) => (s.editor ? commitDraft(s, { ...s.editor.draft, ...change(s.editor.draft) }) : {}));
}

/** Moving points or bars leaves Auto but keeps the preset name if the five fields still match. */
export function updateDraft(patch: Partial<Pick<Transition, 'outStart' | 'inStart' | 'bars'>>): void {
  editDraft(() => ({ ...patch, auto: false }));
}

export function applyPreset(preset: TransitionPreset): void {
  const { volume, eq, filter, effect, looping } = PRESETS[preset];
  editDraft(() => ({
    preset,
    volume,
    eq,
    filter,
    effect,
    looping,
    customVolume: null,
    customEq: null,
    customFilter: null,
    customEffect: null,
    auto: false,
  }));
}

export function setVolumeStyle(volume: VolumeStyle): void {
  editDraft(() => ({ volume, customVolume: null, auto: false }));
}

export function setEqStyle(eq: EqStyle): void {
  editDraft(() => ({ eq, customEq: null, auto: false }));
}

export function setFilterStyle(filter: FilterStyle): void {
  editDraft(() => ({ filter, customFilter: null, auto: false }));
}

export function setEffectStyle(effect: EffectStyle): void {
  editDraft(() => ({ effect, customEffect: null, auto: false }));
}

/** The loop has no curve of its own, so changing it keeps every hand-drawn curve. */
export function setLoopStyle(looping: LoopStyle): void {
  editDraft(() => ({ looping, auto: false }));
}

export function resetToAuto(): void {
  setState((s) => {
    const tracks = queueTracks(s);
    if (!s.editor) return {};
    const from = tracks[s.editor.pairIndex];
    const to = tracks[s.editor.pairIndex + 1];
    return from && to ? commitDraft(s, defaultTransition(from, to)) : {};
  });
}

function curvesOfVolume(t: Transition) {
  return t.customVolume ?? curveFromStyle(t.volume);
}

/** Curves of a lane being edited: the hand-drawn ones, or the ones that reproduce its style. */
export function editableCurves(t: Transition, lane: EditLane): SideCurves {
  if (lane === 'eq') return bassCurves(t);
  if (lane === 'filter') return filterCurves(t);
  // The effect only ever goes on the outgoing song.
  if (lane === 'effect') return { out: effectCurve(t), in: null };
  return curvesOfVolume(t);
}

export function updateCustomCurve(lane: EditLane, side: 'out' | 'in', curve: GainCurve): void {
  editDraft((d) => {
    if (lane === 'eq') return { customEq: { ...bassCurves(d), [side]: curve }, auto: false };
    if (lane === 'filter') return { customFilter: { ...filterCurves(d), [side]: curve }, auto: false };
    if (lane === 'effect') return side === 'out' ? { customEffect: curve, auto: false } : {};
    return { customVolume: { ...curvesOfVolume(d), [side]: curve }, auto: false };
  });
}

const CUSTOM_FIELD = { volume: 'customVolume', eq: 'customEq', filter: 'customFilter', effect: 'customEffect' } as const;

/** Back to the curve of the lane's current style. */
export function resetCurve(lane: EditLane): void {
  editDraft(() => ({ [CUSTOM_FIELD[lane]]: null }));
}

/** Starts editing a lane, switches to it from another lane, or leaves Personalizar when it is the current one. */
export function toggleCustomize(lane: EditLane): void {
  setState((s) => (s.editor ? { editor: { ...s.editor, customizing: s.editor.customizing === lane ? null : lane } } : {}));
}

export function undo(): void {
  setState((s) => {
    const e = s.editor;
    if (!e || e.past.length === 0) return {};
    return { editor: { ...e, draft: e.past[e.past.length - 1], past: e.past.slice(0, -1), future: [e.draft, ...e.future] } };
  });
}

export function redo(): void {
  setState((s) => {
    const e = s.editor;
    if (!e || e.future.length === 0) return {};
    return { editor: { ...e, draft: e.future[0], past: [...e.past, e.draft].slice(-HISTORY_LIMIT), future: e.future.slice(1) } };
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

/** Switches the open editor to another pair, optionally saving the current draft first. Keeps Personalizar on. */
export function goToPair(pairIndex: number, save: boolean): void {
  setState((s) => {
    if (!s.editor) return {};
    const { draft, customizing } = s.editor;
    const transitions = save ? { ...s.transitions, [pairKey(draft.fromId, draft.toId)]: draft } : s.transitions;
    const saved = savedFor({ ...s, transitions }, pairIndex);
    return saved ? { transitions, editor: freshEditor(pairIndex, saved, customizing) } : {};
  });
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

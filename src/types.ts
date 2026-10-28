export type VolumeStyle =
  | 'smooth-crossfade'
  | 'crossfade'
  | 'overlap'
  | 'fade-in-fade-out'
  | 'cut-in-fade-out'
  | 'fade-in-cut-out'
  | 'center-cut'
  | 'fade-in-fast-out';

export type EqStyle =
  | 'center-bass-swap'
  | 'end-bass-swap'
  | 'start-bass-swap'
  | 'three-band-fade'
  | 'quick-bass-cut'
  | 'long-bass-cut'
  | 'start-fade-out'
  | 'bass-fade-out'
  | 'none';

export type FilterStyle =
  | 'lpf-out'
  | 'lpf-in'
  | 'lpf-in-lpf-out'
  | 'lpf-in-hpf-out'
  | 'hpf-out'
  | 'hpf-in'
  | 'hpf-in-hpf-out'
  | 'hpf-in-lpf-out'
  | 'hpf-half-out'
  | 'noise-out-end'
  | 'none';

/** What a song's filter curve drives: closing a low-pass or a high-pass, or the level of filtered noise. */
export type FilterKind = 'lowpass' | 'highpass' | 'noise';

export type EffectStyle =
  | 'reverb-out-center'
  | 'reverb-cut-end'
  | 'reverb-out-end'
  | 'delay-half-cut-end'
  | 'delay-three-quarter-cut-end'
  | 'echo-half-cut-end'
  | 'echo-half-out-end'
  | 'echo-three-quarter-cut-end'
  | 'echo-three-quarter-out-end'
  | 'echo-one-cut-end'
  | 'echo-one-out-end'
  | 'none';

/** What the effect send feeds: a reverb, an echo that keeps repeating, or a delay that repeats once. */
export type EffectKind = 'reverb' | 'echo' | 'delay';

export type LoopStyle = 'loop-1' | 'loop-2' | 'loop-4' | 'loop-8' | 'loop-16' | 'loop-halving' | 'none';

/** Lane being edited in "Personalizar". */
export type EditLane = 'volume' | 'eq' | 'filter' | 'effect';

export type TransitionPreset = 'fade' | 'blend' | 'rise' | 'wave' | 'melt' | 'slam' | 'dissolve' | 'surge' | 'afterglow';
export type BarsOption = 1 | 2 | 4 | 8 | 16;

export type TrackStatus = 'decoding' | 'analyzing' | 'ready' | 'bpm-required' | 'error';

export interface Track {
  id: string;
  name: string;
  buffer: AudioBuffer | null;
  duration: number;
  bpm: number | null;
  firstBeatOffset: number;
  peaks: Float32Array | null;
  status: TrackStatus;
  error?: string;
}

export interface GainPoint {
  /** 0..1, position inside the transition window. */
  x: number;
  /** 0..1, gain. */
  y: number;
}

export interface SegmentShape {
  /** false = straight, true = smooth (smoothstep). */
  ease: boolean;
  /** -1..1; 0 = no bend. */
  bend: number;
}

export interface GainCurve {
  /** Sorted by x; first x = 0, last x = 1; 2..32 points. */
  points: GainPoint[];
  /** One shape per segment: segments.length === points.length - 1. */
  segments: SegmentShape[];
}

export interface VolumeCurves {
  out: GainCurve;
  in: GainCurve;
}

/** One curve per song; null = the style leaves that song alone (filter only). */
export interface SideCurves {
  out: GainCurve | null;
  in: GainCurve | null;
}

export interface Transition {
  fromId: string;
  toId: string;
  outStart: number;
  inStart: number;
  bars: BarsOption;
  volume: VolumeStyle;
  /** Last preset picked; null if none was ever picked. */
  preset: TransitionPreset | null;
  /** True until someone edits it, or after picking "Auto". */
  auto: boolean;
  /** Hand-drawn volume curves; null = use the `volume` style. */
  customVolume: VolumeCurves | null;
  eq: EqStyle;
  filter: FilterStyle;
  /** Hand-drawn bass curves; null = use the `eq` style. */
  customEq: VolumeCurves | null;
  /** Hand-drawn filter closure per song; null = use the `filter` style. */
  customFilter: SideCurves | null;
  /** Effect on the outgoing song. */
  effect: EffectStyle;
  /** Loop of the outgoing song. */
  looping: LoopStyle;
  /** Hand-drawn effect send of the outgoing song; null = use the `effect` style. */
  customEffect: GainCurve | null;
}

export interface EditorState {
  pairIndex: number;
  draft: Transition;
  dirty: boolean;
  /** Lane being edited in "Personalizar" (dragging edits its points instead of sliding the waves); null = off. */
  customizing: EditLane | null;
  /** Undo history of the draft (max 100). */
  past: Transition[];
  /** Redo history of the draft. */
  future: Transition[];
}

export interface AppState {
  tracks: Track[];
  transitions: Record<string, Transition>;
  mixEnabled: boolean;
  editor: EditorState | null;
  playback: 'stopped' | 'playing' | 'previewing';
}

export interface RateEvent {
  time: number;
  rate: number;
  ramp: boolean;
}

export interface GainCurveEvent {
  time: number;
  duration: number;
  curve: Float32Array;
}

/** Gain (0..1) of each EQ band over a transition window. */
export interface EqEvent {
  time: number;
  duration: number;
  low: Float32Array;
  mid: Float32Array;
  high: Float32Array;
}

/** Cutoff in Hz and dry/filtered mix (0..1) over a transition window. */
export interface FilterEvent {
  time: number;
  duration: number;
  kind: 'lowpass' | 'highpass';
  frequency: Float32Array;
  wet: Float32Array;
}

/** Level and low-pass cutoff (Hz) of the noise over a transition window. */
export interface NoiseEvent {
  time: number;
  duration: number;
  level: Float32Array;
  frequency: Float32Array;
}

/** Effect send (0..1) of the outgoing song over a transition window, and how the effect sounds. */
export interface EffectEvent {
  time: number;
  duration: number;
  kind: EffectKind;
  /** Seconds between repeats; 0 for reverb. */
  delay: number;
  /** 0.55 for echo; 0 for delay and reverb. */
  feedback: number;
  send: Float32Array;
  /** true = rings on after the window ("out"); false = cut at its end ("cut"). */
  ringsOut: boolean;
}

/** From each jump's `time`, the outgoing song plays again from `audioStart` for `duration` seconds. */
export interface LoopEvent {
  audioStart: number;
  jumps: { time: number; duration: number }[];
}

export interface TimelineEntry {
  trackId: string;
  contextStart: number;
  offset: number;
  rateEvents: RateEvent[];
  gainCurveIn?: GainCurveEvent;
  gainCurveOut?: GainCurveEvent;
  eqIn?: EqEvent;
  eqOut?: EqEvent;
  filterIn?: FilterEvent;
  filterOut?: FilterEvent;
  noiseOut?: NoiseEvent;
  effectOut?: EffectEvent;
  loopOut?: LoopEvent;
  stopAt: number;
}

export const BARS_OPTIONS: BarsOption[] = [1, 2, 4, 8, 16];
export const VOLUME_STYLES: VolumeStyle[] = [
  'smooth-crossfade',
  'crossfade',
  'overlap',
  'fade-in-fade-out',
  'cut-in-fade-out',
  'fade-in-cut-out',
  'center-cut',
  'fade-in-fast-out',
];
export const PRESET_ORDER: TransitionPreset[] = ['fade', 'blend', 'rise', 'wave', 'melt', 'slam', 'dissolve', 'surge', 'afterglow'];

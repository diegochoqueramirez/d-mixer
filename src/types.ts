export type VolumeStyle =
  | 'smooth-crossfade'
  | 'crossfade'
  | 'overlap'
  | 'fade-in-fade-out'
  | 'cut-in-fade-out'
  | 'fade-in-cut-out'
  | 'center-cut'
  | 'fade-in-fast-out';

export type TransitionPreset = 'fade' | 'blend' | 'rise' | 'slam';
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
}

export interface EditorState {
  pairIndex: number;
  draft: Transition;
  dirty: boolean;
  /** "Personalizar" mode: dragging edits curve points instead of sliding the waves. */
  customizing: boolean;
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

export interface TimelineEntry {
  trackId: string;
  contextStart: number;
  offset: number;
  rateEvents: RateEvent[];
  gainCurveIn?: GainCurveEvent;
  gainCurveOut?: GainCurveEvent;
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
export const PRESET_ORDER: TransitionPreset[] = ['fade', 'blend', 'rise', 'slam'];

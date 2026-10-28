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
}

export interface EditorState {
  pairIndex: number;
  draft: Transition;
  dirty: boolean;
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

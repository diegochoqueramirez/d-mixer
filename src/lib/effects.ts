import type { EffectKind, EffectStyle, GainCurve, LoopEvent, LoopStyle, Transition } from '../types';
import { DEFAULT_SAMPLES, sampleGainCurve } from './gainCurve';
import { beatSeconds, BEATS_PER_BAR } from './timing';

// Styles, send curves and loop blocks follow vimj (a third-party reconstruction of Spotify Mix), see SPEC 05.
// Effects and loops only ever go on the outgoing song.

export const EFFECT_STYLES: EffectStyle[] = [
  'reverb-out-center',
  'reverb-cut-end',
  'reverb-out-end',
  'delay-half-cut-end',
  'delay-three-quarter-cut-end',
  'echo-half-cut-end',
  'echo-half-out-end',
  'echo-three-quarter-cut-end',
  'echo-three-quarter-out-end',
  'echo-one-cut-end',
  'echo-one-out-end',
  'none',
];

export const EFFECT_LABELS: Record<EffectStyle, string> = {
  'reverb-out-center': 'Reverb out center',
  'reverb-cut-end': 'Reverb cut end',
  'reverb-out-end': 'Reverb out end',
  'delay-half-cut-end': 'Delay ½ cut end',
  'delay-three-quarter-cut-end': 'Delay ¾ cut end',
  'echo-half-cut-end': 'Echo ½ cut end',
  'echo-half-out-end': 'Echo ½ out end',
  'echo-three-quarter-cut-end': 'Echo ¾ cut end',
  'echo-three-quarter-out-end': 'Echo ¾ out end',
  'echo-one-cut-end': 'Echo 1 cut end',
  'echo-one-out-end': 'Echo 1 out end',
  none: 'None',
};

export const LOOP_STYLES: LoopStyle[] = ['loop-1', 'loop-2', 'loop-4', 'loop-8', 'loop-16', 'loop-halving', 'none'];

export const LOOP_LABELS: Record<LoopStyle, string> = {
  'loop-1': '1 beat loop',
  'loop-2': '2 beat loop',
  'loop-4': '4 beat loop',
  'loop-8': '8 beat loop',
  'loop-16': '16 beat loop',
  'loop-halving': 'Loop halving',
  none: 'None',
};

/** Feedback of the echo: each repeat at 0.55 of the previous one. A delay has none, so it repeats once. */
export const ECHO_FEEDBACK = 0.55;

/** Smooth curve through the given points (every segment eased, no bend). */
function eased(points: [number, number][]): GainCurve {
  return {
    points: points.map(([x, y]) => ({ x, y })),
    segments: points.slice(1).map(() => ({ ease: true, bend: 0 })),
  };
}

/** The send rises to the middle and stops there; the reverb rings on alone. */
const CENTER: [number, number][] = [[0, 0], [0.485, 1], [0.515, 0], [1, 0]];
const UP: [number, number][] = [[0, 0], [1, 1]];
const LATE: [number, number][] = [[0, 0], [0.5, 0], [0.9, 1], [1, 1]];

export interface EffectShape {
  kind: EffectKind;
  /** Beats between repeats; 0 for reverb. */
  beats: number;
  /** Send of the outgoing song over the window, 0..1. */
  send: GainCurve;
  /** true = rings on after the window ("out"); false = cut at its end ("cut"). */
  ringsOut: boolean;
}

/** What an effect style does to the outgoing song, or null for None. */
export function effectShape(style: EffectStyle): EffectShape | null {
  const reverb = (send: [number, number][], ringsOut: boolean): EffectShape => ({ kind: 'reverb', beats: 0, send: eased(send), ringsOut });
  const repeat = (kind: 'echo' | 'delay', beats: number, ringsOut: boolean): EffectShape => ({ kind, beats, send: eased(LATE), ringsOut });
  switch (style) {
    case 'reverb-out-center':
      return reverb(CENTER, true);
    case 'reverb-cut-end':
      return reverb(UP, false);
    case 'reverb-out-end':
      return reverb(UP, true);
    case 'delay-half-cut-end':
      return repeat('delay', 0.5, false);
    case 'delay-three-quarter-cut-end':
      return repeat('delay', 0.75, false);
    case 'echo-half-cut-end':
      return repeat('echo', 0.5, false);
    case 'echo-half-out-end':
      return repeat('echo', 0.5, true);
    case 'echo-three-quarter-cut-end':
      return repeat('echo', 0.75, false);
    case 'echo-three-quarter-out-end':
      return repeat('echo', 0.75, true);
    case 'echo-one-cut-end':
      return repeat('echo', 1, false);
    case 'echo-one-out-end':
      return repeat('echo', 1, true);
    case 'none':
      return null;
  }
}

type EffectFields = Pick<Transition, 'effect' | 'customEffect'>;

/** Send curve being played or edited: the hand-drawn one, or the one of the style; null with no effect. */
export function effectCurve(t: EffectFields): GainCurve | null {
  const shape = effectShape(t.effect);
  if (!shape) return null;
  return t.customEffect ?? shape.send;
}

/** Send samples of the outgoing song, or null when there is no effect. */
export function effectSamples(t: EffectFields, n = DEFAULT_SAMPLES): Float32Array | null {
  const curve = effectCurve(t);
  return curve ? sampleGainCurve(curve, n) : null;
}

/** Part of the window (fractions) that replays `beats` beats from the window's start. */
export interface LoopBlock {
  start: number;
  end: number;
  beats: number;
}

/** How a loop runs through a window of `windowBeats` beats. */
export function loopBlocks(style: LoopStyle, windowBeats: number): LoopBlock[] {
  const whole = (beats: number): LoopBlock[] => [{ start: 0, end: 1, beats }];
  switch (style) {
    case 'loop-1':
      return whole(1);
    case 'loop-2':
      return whole(2);
    case 'loop-4':
      return whole(4);
    case 'loop-8':
      return whole(8);
    case 'loop-16':
      return whole(16);
    case 'loop-halving':
      // An eighth of the window four times; then half that four times; and so on, ending in a roll.
      return [
        { start: 0, end: 0.5, beats: windowBeats / 8 },
        { start: 0.5, end: 0.75, beats: windowBeats / 16 },
        { start: 0.75, end: 0.875, beats: windowBeats / 32 },
        { start: 0.875, end: 1, beats: windowBeats / 64 },
      ];
    case 'none':
      return [];
  }
}

const EPSILON = 1e-9;

/**
 * Jumps back to the window's start, in seconds from `windowStart`. The first pass of the window plays
 * the song straight on, so it is not a jump. A runs at rate 1 during its window, so beats are its own.
 */
export function loopJumps(t: Pick<Transition, 'looping' | 'bars'>, bpmA: number, windowStart = 0): LoopEvent['jumps'] {
  const windowBeats = t.bars * BEATS_PER_BAR;
  const beat = beatSeconds(bpmA);
  const span = windowBeats * beat;
  const jumps: LoopEvent['jumps'] = [];
  for (const block of loopBlocks(t.looping, windowBeats)) {
    const from = block.start * span;
    const to = block.end * span;
    const period = block.beats * beat;
    for (let k = 0; from + k * period < to - EPSILON; k++) {
      const start = from + k * period;
      if (start < EPSILON) continue;
      jumps.push({ time: windowStart + start, duration: Math.min(period, to - start) });
    }
  }
  return jumps;
}

/**
 * What the outgoing song plays at `time` (same clock as the jumps): the replayed position and true
 * inside a repeat, or the position it would play without the loop and false.
 */
export function loopedAudioAt(loop: LoopEvent, windowStart: number, time: number): { audio: number; repeat: boolean } {
  for (const j of loop.jumps) {
    if (time >= j.time && time < j.time + j.duration) return { audio: loop.audioStart + (time - j.time), repeat: true };
  }
  return { audio: loop.audioStart + (time - windowStart), repeat: false };
}

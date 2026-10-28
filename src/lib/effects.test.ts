import { describe, expect, it } from 'vitest';
import type { GainCurve } from '../types';
import { EFFECT_STYLES, effectCurve, effectSamples, effectShape, LOOP_STYLES, loopBlocks, loopedAudioAt, loopJumps } from './effects';
import { laneLines } from './lanes';
import { transition } from './fixtures';

const xy = (c: GainCurve) => c.points.map((p) => [p.x, p.y]);

const CENTER = [[0, 0], [0.485, 1], [0.515, 0], [1, 0]];
const UP = [[0, 0], [1, 1]];
const LATE = [[0, 0], [0.5, 0], [0.9, 1], [1, 1]];

describe('effectShape', () => {
  it('has the 12 styles of Spotify Mix, None last', () => {
    expect(EFFECT_STYLES).toHaveLength(12);
    expect(EFFECT_STYLES.at(-1)).toBe('none');
  });

  it('follows the table of SPEC 05', () => {
    const table = {
      'reverb-out-center': ['reverb', 0, CENTER, true],
      'reverb-cut-end': ['reverb', 0, UP, false],
      'reverb-out-end': ['reverb', 0, UP, true],
      'delay-half-cut-end': ['delay', 0.5, LATE, false],
      'delay-three-quarter-cut-end': ['delay', 0.75, LATE, false],
      'echo-half-cut-end': ['echo', 0.5, LATE, false],
      'echo-half-out-end': ['echo', 0.5, LATE, true],
      'echo-three-quarter-cut-end': ['echo', 0.75, LATE, false],
      'echo-three-quarter-out-end': ['echo', 0.75, LATE, true],
      'echo-one-cut-end': ['echo', 1, LATE, false],
      'echo-one-out-end': ['echo', 1, LATE, true],
    } as const;
    for (const [style, [kind, beats, send, ringsOut]] of Object.entries(table)) {
      const shape = effectShape(style as keyof typeof table)!;
      expect(shape.kind, style).toBe(kind);
      expect(shape.beats, style).toBe(beats);
      expect(xy(shape.send), style).toEqual(send);
      expect(shape.send.segments.every((s) => s.ease && s.bend === 0), style).toBe(true);
      expect(shape.ringsOut, style).toBe(ringsOut);
    }
  });

  it('None has no effect', () => {
    expect(effectShape('none')).toBeNull();
    expect(effectCurve(transition('a', 'b'))).toBeNull();
    expect(effectSamples(transition('a', 'b'))).toBeNull();
  });
});

describe('effectSamples', () => {
  it('uses the style send when there is no custom curve', () => {
    const send = effectSamples(transition('a', 'b', { effect: 'reverb-out-end' }))!;
    expect(send[0]).toBe(0);
    expect(send.at(-1)).toBeCloseTo(1);
  });

  it('uses the hand-drawn send when present', () => {
    const custom: GainCurve = { points: [{ x: 0, y: 0.5 }, { x: 1, y: 0.5 }], segments: [{ ease: false, bend: 0 }] };
    const t = transition('a', 'b', { effect: 'reverb-out-end', customEffect: custom });
    expect(effectCurve(t)).toBe(custom);
    expect(effectSamples(t)!.every((v) => Math.abs(v - 0.5) < 1e-6)).toBe(true);
  });
});

describe('loopBlocks', () => {
  it('has 7 options, None last', () => {
    expect(LOOP_STYLES).toEqual(['loop-1', 'loop-2', 'loop-4', 'loop-8', 'loop-16', 'loop-halving', 'none']);
  });

  it('a beat loop covers the whole window', () => {
    expect(loopBlocks('loop-4', 32)).toEqual([{ start: 0, end: 1, beats: 4 }]);
    expect(loopBlocks('none', 32)).toEqual([]);
  });

  it('Loop halving halves the period in each block', () => {
    expect(loopBlocks('loop-halving', 32)).toEqual([
      { start: 0, end: 0.5, beats: 4 },
      { start: 0.5, end: 0.75, beats: 2 },
      { start: 0.75, end: 0.875, beats: 1 },
      { start: 0.875, end: 1, beats: 0.5 },
    ]);
  });
});

describe('loopJumps', () => {
  // 120 bpm: a beat is 0.5 s; 8 bars = 32 beats = 16 s.
  it('4 beat loop over 8 bars jumps every 2 s, 7 times', () => {
    const jumps = loopJumps({ looping: 'loop-4', bars: 8 }, 120);
    expect(jumps).toHaveLength(7);
    jumps.forEach((j, i) => {
      expect(j.time).toBeCloseTo(2 * (i + 1));
      expect(j.duration).toBeCloseTo(2);
    });
  });

  it('Loop halving over 8 bars: 4, 4, 4 and 8 passes, 19 jumps, each block twice as fast', () => {
    const jumps = loopJumps({ looping: 'loop-halving', bars: 8 }, 120);
    expect(jumps).toHaveLength(19);
    const periods = [...new Set(jumps.map((j) => j.duration))];
    expect(periods).toEqual([2, 1, 0.5, 0.25]);
    expect(jumps.filter((j) => j.duration === 0.25)).toHaveLength(8);
    expect(jumps.at(-1)!.time + jumps.at(-1)!.duration).toBeCloseTo(16);
  });

  it('a loop as long as the window or longer never jumps', () => {
    expect(loopJumps({ looping: 'loop-16', bars: 1 }, 120)).toEqual([]);
    expect(loopJumps({ looping: 'loop-4', bars: 1 }, 120)).toEqual([]);
  });

  it('offsets jumps by the window start', () => {
    expect(loopJumps({ looping: 'loop-2', bars: 1 }, 120, 100)).toEqual([{ time: 101, duration: 1 }]);
  });

  it('None never jumps', () => {
    expect(loopJumps({ looping: 'none', bars: 8 }, 120)).toEqual([]);
  });
});

describe('loopedAudioAt', () => {
  const loop = { audioStart: 50, jumps: loopJumps({ looping: 'loop-1', bars: 1 }, 120) };

  it('plays the first pass straight on', () => {
    expect(loopedAudioAt(loop, 0, 0.25)).toEqual({ audio: 50.25, repeat: false });
  });

  it('replays the window start inside each repeat', () => {
    const at = loopedAudioAt(loop, 0, 1.2);
    expect(at.repeat).toBe(true);
    expect(at.audio).toBeCloseTo(50.2);
  });
});

describe('laneLines with an effect', () => {
  it('draws the send over the outgoing song only, just under the volume', () => {
    const lines = laneLines(transition('a', 'b', { effect: 'reverb-out-end' }));
    expect(lines.out.map((l) => l.lane).slice(-2)).toEqual(['effect', 'volume']);
    expect(lines.out.find((l) => l.lane === 'effect')!.scale).toEqual({ zero: 0, one: 1 });
    expect(lines.in.some((l) => l.lane === 'effect')).toBe(false);
  });

  it('draws no effect line with None', () => {
    expect(laneLines(transition('a', 'b')).out.some((l) => l.lane === 'effect')).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import { track, transition } from './fixtures';
import { curveFromStyle } from './gainCurve';
import { audioPositionAt, buildSequentialTimeline, buildTimeline, clipTimeline, incomingAudioAt, previewRange } from './timeline';

describe('buildTimeline', () => {
  it('schedules two tracks with the transition at the outgoing point', () => {
    const tracks = [track('a', { bpm: 120 }), track('b', { bpm: 100 })];
    const transitions = { 'a->b': transition('a', 'b', { outStart: 200, inStart: 4 }) };
    const [a, b] = buildTimeline(tracks, transitions, 0, 0);

    expect(a.contextStart).toBe(0);
    expect(a.gainCurveOut).toMatchObject({ time: 200, duration: 8 });
    expect(a.stopAt).toBe(208);

    expect(b.contextStart).toBe(200);
    expect(b.offset).toBe(4);
    expect(b.gainCurveIn).toMatchObject({ time: 200, duration: 8 });
    expect(b.rateEvents).toEqual([
      { time: 200, rate: 1.2, ramp: false },
      { time: 208, rate: 1.2, ramp: false },
      { time: 216, rate: 1, ramp: true },
    ]);
  });

  it('chains three tracks, starting each transition when the track reaches its out point', () => {
    const tracks = [track('a', { bpm: 120 }), track('b', { bpm: 100 }), track('c', { bpm: 100 })];
    const transitions = {
      'a->b': transition('a', 'b', { outStart: 200, inStart: 4 }),
      'b->c': transition('b', 'c', { outStart: 150, inStart: 0 }),
    };
    const [, b, c] = buildTimeline(tracks, transitions, 0, 0);

    // b: 8 s at 1.2 (9.6 audio) + 8 s ramp 1.2 -> 1 (8.8 audio) => audio 22.4 at context 216
    const expectedOut = 216 + (150 - 22.4);
    expect(c.contextStart).toBeCloseTo(expectedOut);
    expect(audioPositionAt(b, expectedOut)).toBeCloseTo(150);
    expect(b.gainCurveIn).toBeDefined();
    expect(b.gainCurveOut?.time).toBeCloseTo(expectedOut);
    // b->c is 4 bars at b's 100 bpm = 9.6 s
    expect(b.stopAt).toBeCloseTo(expectedOut + 9.6);
  });

  it('starts from an offset for a transition preview and stops at the end index', () => {
    const tracks = [track('a'), track('b'), track('c')];
    const transitions = {
      'a->b': transition('a', 'b', { outStart: 200 }),
      'b->c': transition('b', 'c', { outStart: 200 }),
    };
    const entries = buildTimeline(tracks, transitions, 0, 196, 1);
    expect(entries).toHaveLength(2);
    expect(entries[1].contextStart).toBe(4);
  });

  it('throws when a pair has no transition', () => {
    const tracks = [track('a'), track('b', { bpm: null })];
    expect(() => buildTimeline(tracks, {}, 0, 0)).toThrow();
  });
});

describe('audioPositionAt', () => {
  it('integrates hold and ramp segments', () => {
    const [, b] = buildTimeline(
      [track('a', { bpm: 120 }), track('b', { bpm: 100 })],
      { 'a->b': transition('a', 'b', { outStart: 200, inStart: 4 }) },
      0,
      0,
    );
    expect(audioPositionAt(b, 199)).toBe(4);
    expect(audioPositionAt(b, 204)).toBeCloseTo(4 + 4 * 1.2);
    expect(audioPositionAt(b, 208)).toBeCloseTo(4 + 9.6);
    expect(audioPositionAt(b, 216)).toBeCloseTo(4 + 9.6 + 8.8);
    expect(audioPositionAt(b, 220)).toBeCloseTo(4 + 9.6 + 8.8 + 4);
  });
});

describe('incomingAudioAt', () => {
  const d = 8;
  const r = 1.2;

  it('plays at rate r before and during the window', () => {
    expect(incomingAudioAt(-2, 4, d, r)).toBeCloseTo(4 - 2.4);
    expect(incomingAudioAt(0, 4, d, r)).toBe(4);
    expect(incomingAudioAt(8, 4, d, r)).toBeCloseTo(4 + 9.6);
  });

  it('matches the engine timeline through the ramp and after it', () => {
    const [, b] = buildTimeline(
      [track('a', { bpm: 120 }), track('b', { bpm: 100 })],
      { 'a->b': transition('a', 'b', { outStart: 200, inStart: 4 }) },
      0,
      0,
    );
    for (const tau of [0, 3, 8, 10, 12, 16, 20]) {
      expect(incomingAudioAt(tau, 4, d, r)).toBeCloseTo(audioPositionAt(b, 200 + tau));
    }
  });
});

describe('buildTimeline with a custom curve', () => {
  it('applies the hand-drawn gains instead of the style', () => {
    const customVolume = curveFromStyle('center-cut');
    const tracks = [track('a', { bpm: 120 }), track('b', { bpm: 120 })];
    const [a, b] = buildTimeline(tracks, { 'a->b': transition('a', 'b', { volume: 'crossfade', customVolume }) }, 0, 0);
    const n = a.gainCurveOut!.curve.length;
    expect(a.gainCurveOut!.curve[Math.floor(n * 0.25)]).toBe(1);
    expect(b.gainCurveIn!.curve[Math.floor(n * 0.25)]).toBe(0);
  });
});

describe('buildSequentialTimeline', () => {
  it('plays tracks back to back at rate 1 with no gain curves', () => {
    const entries = buildSequentialTimeline([track('a', { duration: 100 }), track('b', { duration: 50 }), track('c')]);
    expect(entries.map((e) => e.contextStart)).toEqual([0, 100, 150]);
    expect(entries.map((e) => e.stopAt)).toEqual([100, 150, 390]);
    for (const e of entries) {
      expect(e.offset).toBe(0);
      expect(e.rateEvents).toEqual([{ time: e.contextStart, rate: 1, ramp: false }]);
      expect(e.gainCurveIn).toBeUndefined();
      expect(e.gainCurveOut).toBeUndefined();
    }
  });
});

describe('previewRange', () => {
  it('spans from 2 bars before the window to 2 bars after it', () => {
    // 120 bpm: 1 bar = 2 s; 8 bars = 16 s
    const r = previewRange(transition('a', 'b', { outStart: 100, bars: 8 }), 120);
    expect(r).toEqual({ startOffset: 96, tauStart: -4, tauEnd: 20 });
  });

  it('does not start before the beginning of the outgoing track', () => {
    const r = previewRange(transition('a', 'b', { outStart: 1, bars: 4 }), 120);
    expect(r.startOffset).toBe(0);
    expect(r.tauStart).toBe(-1);
  });
});

describe('clipTimeline', () => {
  it('stops every entry at the loop end and drops entries starting after it', () => {
    const entries = buildSequentialTimeline([track('a', { duration: 10 }), track('b', { duration: 10 })]);
    expect(clipTimeline(entries, 5)).toEqual([{ ...entries[0], stopAt: 5 }]);
  });
});

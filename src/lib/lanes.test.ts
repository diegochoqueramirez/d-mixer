import { describe, expect, it } from 'vitest';
import type { GainCurve } from '../types';
import { evaluateGainCurve } from './gainCurve';
import {
  bassCurves,
  EQ_STYLES,
  eqCurves,
  eqSamples,
  FILTER_STYLES,
  filterCurves,
  filterSamples,
  filterShape,
  filterWet,
  highpassHz,
  laneLines,
  laneScale,
  lowpassHz,
  noiseHz,
} from './lanes';
import { transition } from './fixtures';

const xy = (c: GainCurve) => c.points.map((p) => [p.x, p.y]);

function expectPoints(c: GainCurve, expected: [number, number][]) {
  expect(c.points).toHaveLength(expected.length);
  c.points.forEach((p, i) => {
    expect(p.x).toBeCloseTo(expected[i][0], 6);
    expect(p.y).toBeCloseTo(expected[i][1], 6);
  });
}

describe('eqCurves', () => {
  const bass: [string, [number, number][], [number, number][]][] = [
    ['center-bass-swap', [[0, 1], [0.485, 1], [0.515, 0], [1, 0]], [[0, 0], [0.485, 0], [0.515, 1], [1, 1]]],
    ['end-bass-swap', [[0, 1], [0.885, 1], [0.915, 0], [1, 0]], [[0, 0], [0.885, 0], [0.915, 1], [1, 1]]],
    ['start-bass-swap', [[0, 1], [0.085, 1], [0.115, 0], [1, 0]], [[0, 0], [0.085, 0], [0.115, 1], [1, 1]]],
    ['quick-bass-cut', [[0, 1], [0.385, 1], [0.415, 0], [1, 0]], [[0, 0], [0.585, 0], [0.615, 1], [1, 1]]],
    ['long-bass-cut', [[0, 1], [0.035, 1], [0.065, 0], [1, 0]], [[0, 0], [0.935, 0], [0.965, 1], [1, 1]]],
    ['start-fade-out', [[0, 1], [0.5, 0], [1, 0]], [[0, 0], [0.485, 0], [0.515, 1], [1, 1]]],
    ['bass-fade-out', [[0, 1], [1, 0]], [[0, 0], [0.935, 0], [0.965, 1], [1, 1]]],
    ['none', [[0, 1], [1, 1]], [[0, 1], [1, 1]]],
  ];

  for (const [style, out, inn] of bass) {
    it(`${style} only moves the bass`, () => {
      const c = eqCurves(style as never);
      expectPoints(c.out.low, out);
      expectPoints(c.in.low, inn);
      for (const band of [c.out.mid, c.out.high, c.in.mid, c.in.high]) expect(xy(band)).toEqual([[0, 1], [1, 1]]);
    });
  }

  it('3-band fade hands over highs first, then mids, then lows', () => {
    const c = eqCurves('three-band-fade');
    expectPoints(c.out.high, [[0, 1], [0.4, 0], [1, 0]]);
    expectPoints(c.out.mid, [[0, 1], [0.3, 1], [0.7, 0], [1, 0]]);
    expectPoints(c.out.low, [[0, 1], [0.6, 1], [1, 0]]);
    expectPoints(c.in.high, [[0, 0], [0.4, 1], [1, 1]]);
    expectPoints(c.in.mid, [[0, 0], [0.3, 0], [0.7, 1], [1, 1]]);
    expectPoints(c.in.low, [[0, 0], [0.6, 0], [1, 1]]);
  });

  it('eases every segment of every style', () => {
    for (const style of EQ_STYLES) {
      const c = eqCurves(style);
      for (const band of [c.out.low, c.out.mid, c.out.high, c.in.low, c.in.mid, c.in.high]) {
        expect(band.segments.every((s) => s.ease && s.bend === 0)).toBe(true);
        expect(band.segments).toHaveLength(band.points.length - 1);
      }
    }
  });
});

describe('filterShape', () => {
  const close: [number, number][] = [[0, 0], [1, 0.8]];
  const open: [number, number][] = [[0, 0.8], [1, 0]];
  const table: [string, [string, [number, number][]] | null, [string, [number, number][]] | null][] = [
    ['lpf-out', ['lowpass', close], null],
    ['lpf-in', null, ['lowpass', open]],
    ['lpf-in-lpf-out', ['lowpass', close], ['lowpass', open]],
    ['lpf-in-hpf-out', ['highpass', close], ['lowpass', open]],
    ['hpf-out', ['highpass', close], null],
    ['hpf-in', null, ['highpass', open]],
    ['hpf-in-hpf-out', ['highpass', close], ['highpass', open]],
    ['hpf-in-lpf-out', ['lowpass', close], ['highpass', open]],
    ['hpf-half-out', ['highpass', [[0, 0], [1, 0.4]]], null],
    ['noise-out-end', ['noise', [[0, 0], [0.5, 0], [1, 1]]], null],
    ['none', null, null],
  ];

  it('covers the 11 styles', () => {
    expect(FILTER_STYLES).toHaveLength(11);
    expect(table.map(([s]) => s).sort()).toEqual([...FILTER_STYLES].sort());
  });

  for (const [style, out, inn] of table) {
    it(`${style} filters the right songs`, () => {
      const s = filterShape(style as never);
      for (const [got, want] of [[s.out, out], [s.in, inn]] as const) {
        if (want === null) {
          expect(got).toBeNull();
        } else {
          expect(got?.kind).toBe(want[0]);
          expectPoints(got!.curve, want[1]);
        }
      }
    });
  }
});

describe('frequency mappings', () => {
  it('sweeps the low-pass from 20 kHz to 150 Hz', () => {
    expect(lowpassHz(0)).toBeCloseTo(20000);
    expect(lowpassHz(1)).toBeCloseTo(150);
  });

  it('sweeps the high-pass from 20 Hz to 4 kHz', () => {
    expect(highpassHz(0)).toBeCloseTo(20);
    expect(highpassHz(1)).toBeCloseTo(4000);
  });

  it('opens the noise from 300 Hz to 14 kHz', () => {
    expect(noiseHz(0)).toBeCloseTo(300);
    expect(noiseHz(1)).toBeCloseTo(14000);
  });

  it('is exponential: halfway is the geometric mean', () => {
    expect(lowpassHz(0.5)).toBeCloseTo(Math.sqrt(20000 * 150));
  });

  it('blends the dry signal back in near the open position', () => {
    expect(filterWet(0)).toBe(0);
    expect(filterWet(0.025)).toBeCloseTo(0.5);
    expect(filterWet(0.05)).toBe(1);
    expect(filterWet(0.8)).toBe(1);
  });
});

describe('samples', () => {
  const custom: GainCurve = {
    points: [
      { x: 0, y: 0.5 },
      { x: 1, y: 0.5 },
    ],
    segments: [{ ease: false, bend: 0 }],
  };

  it('leaves every song alone with EQ and filter on None', () => {
    const t = transition('a', 'b');
    expect(eqSamples(t)).toEqual({ out: null, in: null });
    expect(filterSamples(t)).toEqual({ out: null, in: null });
  });

  it('samples the bass of the style', () => {
    const s = eqSamples(transition('a', 'b', { eq: 'center-bass-swap' }), 101);
    expect(s.out!.low[0]).toBeCloseTo(1);
    expect(s.out!.low[100]).toBeCloseTo(0);
    expect(s.in!.low[100]).toBeCloseTo(1);
    expect(s.out!.mid.every((v) => v === 1)).toBe(true);
  });

  it('uses the hand-drawn bass curve instead of the style', () => {
    const t = transition('a', 'b', { eq: 'none', customEq: { out: custom, in: bassCurves({ eq: 'none', customEq: null }).in } });
    const s = eqSamples(t, 11);
    expect(s.out!.low[5]).toBeCloseTo(0.5);
    expect(s.in).toBeNull();
  });

  it('samples the filter closure with the kind set by the style', () => {
    const s = filterSamples(transition('a', 'b', { filter: 'lpf-out' }), 11);
    expect(s.out!.kind).toBe('lowpass');
    expect(s.out!.closure[10]).toBeCloseTo(0.8);
    expect(s.in).toBeNull();
  });

  it('uses the hand-drawn filter curve but keeps the kind of the style', () => {
    const t = transition('a', 'b', { filter: 'hpf-in', customFilter: { out: null, in: custom } });
    const s = filterSamples(t, 11);
    expect(s.in!.kind).toBe('highpass');
    expect(s.in!.closure[3]).toBeCloseTo(0.5);
    expect(filterCurves(t).in).toBe(custom);
  });

  it('eased curves reach the middle value at the middle of a switch', () => {
    expect(evaluateGainCurve(eqCurves('center-bass-swap').out.low, 0.5)).toBeCloseTo(0.5);
  });
});

describe('laneScale', () => {
  it('places volume from the bottom, EQ from the bottom to the middle, the filter from the middle', () => {
    expect(laneScale('volume')).toEqual({ zero: 0, one: 1 });
    expect(laneScale('eq')).toEqual({ zero: 0, one: 0.5 });
    expect(laneScale('filter', 'lowpass')).toEqual({ zero: 0.5, one: 0 });
    expect(laneScale('filter', 'highpass')).toEqual({ zero: 0.5, one: 1 });
    expect(laneScale('filter', 'noise')).toEqual({ zero: 0.5, one: 1 });
  });
});

describe('laneLines', () => {
  const lanesOf = (lines: { lane: string; faint: boolean }[]) => lines.map((l) => (l.faint ? `${l.lane}-faint` : l.lane));

  it('draws only volume when EQ and filter are None', () => {
    const lines = laneLines(transition('a', 'b'));
    expect(lanesOf(lines.out)).toEqual(['volume']);
    expect(lanesOf(lines.in)).toEqual(['volume']);
  });

  it('draws filter, bass and volume back to front, and no filter on a song it leaves alone', () => {
    const lines = laneLines(transition('a', 'b', { eq: 'center-bass-swap', filter: 'lpf-out' }));
    expect(lanesOf(lines.out)).toEqual(['filter', 'eq', 'volume']);
    expect(lanesOf(lines.in)).toEqual(['eq', 'volume']);
    expect(lines.out[0].scale).toEqual({ zero: 0.5, one: 0 });
  });

  it('draws the mid and high bands faint, under the rest, only with 3-band fade', () => {
    expect(lanesOf(laneLines(transition('a', 'b', { eq: 'three-band-fade' })).out)).toEqual(['eq-faint', 'eq-faint', 'eq', 'volume']);
  });
});

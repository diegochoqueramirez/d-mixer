import { describe, expect, it } from 'vitest';
import { VOLUME_STYLES, type GainCurve } from '../types';
import { sampleCurve } from './curves';
import {
  addPoint,
  bendForMidValue,
  curveFromStyle,
  deletePoint,
  evaluateGainCurve,
  MAX_POINTS,
  movePoint,
  sampleGainCurve,
  segmentMid,
  setBend,
  snapX,
  toggleEase,
} from './gainCurve';

const line = (y0: number, y1: number): GainCurve => ({
  points: [
    { x: 0, y: y0 },
    { x: 1, y: y1 },
  ],
  segments: [{ ease: false, bend: 0 }],
});

describe('evaluateGainCurve', () => {
  it('interpolates straight segments linearly', () => {
    expect(evaluateGainCurve(line(1, 0), 0.25)).toBeCloseTo(0.75);
  });

  it('bends a segment: positive bend bulges up, negative bends down', () => {
    const up = setBend(line(0, 1), 0, 1);
    const down = setBend(line(0, 1), 0, -1);
    expect(evaluateGainCurve(up, 0.5)).toBeGreaterThan(0.5);
    expect(evaluateGainCurve(down, 0.5)).toBeLessThan(0.5);
  });

  it('eases a segment with smoothstep', () => {
    const eased = toggleEase(line(0, 1), 0);
    expect(evaluateGainCurve(eased, 0.25)).toBeCloseTo(0.15625);
    expect(evaluateGainCurve(eased, 0.5)).toBeCloseTo(0.5);
  });

  it('clamps x outside [0, 1]', () => {
    expect(evaluateGainCurve(line(1, 0), -1)).toBe(1);
    expect(evaluateGainCurve(line(1, 0), 2)).toBe(0);
  });
});

describe('curveFromStyle', () => {
  /** Samples next to the hard steps of overlap / fade-in-cut-out / center-cut legitimately differ. */
  const steps: Record<string, number[]> = {
    overlap: [0.995],
    'fade-in-cut-out': [0.995],
    'center-cut': [0.495],
  };

  for (const style of VOLUME_STYLES) {
    it(`reproduces ${style}`, () => {
      const n = 256;
      const expected = sampleCurve(style, n);
      const curves = curveFromStyle(style);
      const got = { out: sampleGainCurve(curves.out, n), in: sampleGainCurve(curves.in, n) };
      // smooth-crossfade is fitted with three bent points; the incoming curve is within 1.03%
      const tolerance = style === 'smooth-crossfade' ? 0.015 : 0.01;
      for (let i = 0; i < n; i++) {
        const x = i / (n - 1);
        if ((steps[style] ?? []).some((s) => Math.abs(x - s) < 0.02)) continue;
        expect(Math.abs(got.out[i] - expected.out[i])).toBeLessThan(tolerance);
        expect(Math.abs(got.in[i] - expected.in[i])).toBeLessThan(tolerance);
      }
    });
  }

  it('starts every curve at x = 0 and ends at x = 1', () => {
    for (const style of VOLUME_STYLES) {
      for (const c of Object.values(curveFromStyle(style))) {
        expect(c.points[0].x).toBe(0);
        expect(c.points.at(-1)!.x).toBe(1);
        expect(c.segments).toHaveLength(c.points.length - 1);
      }
    }
  });
});

describe('snapX', () => {
  it('snaps to beats and half beats of the window', () => {
    // 1 bar = 4 beats = 8 half beats
    expect(snapX(0.13, 1)).toBeCloseTo(0.125);
    expect(snapX(0.3, 1)).toBeCloseTo(0.25);
  });

  it('snaps to the centre of the window', () => {
    expect(snapX(0.49, 4)).toBe(0.5);
  });
});

describe('movePoint', () => {
  const three: GainCurve = {
    points: [
      { x: 0, y: 1 },
      { x: 0.5, y: 0.5 },
      { x: 1, y: 0 },
    ],
    segments: [
      { ease: false, bend: 0 },
      { ease: false, bend: 0 },
    ],
  };

  it('moves an inner point', () => {
    expect(movePoint(three, 1, 0.3, 0.8).points[1]).toEqual({ x: 0.3, y: 0.8 });
  });

  it('keeps a point between its neighbours', () => {
    expect(movePoint(three, 1, 1.5, 0.5).points[1].x).toBeLessThan(1);
    expect(movePoint(three, 1, -1, 0.5).points[1].x).toBeGreaterThan(0);
  });

  it('never moves an endpoint in x but changes its gain', () => {
    const moved = movePoint(three, 0, 0.4, 0.2);
    expect(moved.points[0]).toEqual({ x: 0, y: 0.2 });
  });

  it('clamps the gain to [0, 1]', () => {
    expect(movePoint(three, 1, 0.5, 2).points[1].y).toBe(1);
    expect(movePoint(three, 1, 0.5, -1).points[1].y).toBe(0);
  });
});

describe('addPoint / deletePoint', () => {
  it('adds a point on the curve and splits the segment', () => {
    const added = addPoint(line(1, 0), 0.25)!;
    expect(added.index).toBe(1);
    expect(added.curve.points[1]).toEqual({ x: 0.25, y: 0.75 });
    expect(added.curve.segments).toHaveLength(2);
  });

  it('refuses to add past the maximum', () => {
    let c = line(1, 0);
    for (let i = 1; i < MAX_POINTS - 1; i++) c = addPoint(c, i / MAX_POINTS)!.curve;
    expect(c.points).toHaveLength(MAX_POINTS);
    expect(addPoint(c, 0.999 - 1 / (MAX_POINTS * 2))).toBeNull();
  });

  it('deletes inner points but never endpoints', () => {
    const c = addPoint(line(1, 0), 0.5)!.curve;
    expect(deletePoint(c, 1).points).toHaveLength(2);
    expect(deletePoint(c, 0)).toBe(c);
    expect(deletePoint(c, 2)).toBe(c);
  });
});

describe('segment handles', () => {
  it('finds the middle of a segment', () => {
    expect(segmentMid(line(1, 0), 0)).toEqual({ x: 0.5, y: 0.5 });
  });

  it('computes the bend that makes the segment pass through a value at its middle', () => {
    for (const ease of [false, true]) {
      const base = ease ? toggleEase(line(0, 1), 0) : line(0, 1);
      const bend = bendForMidValue(base, 0, 0.7);
      expect(evaluateGainCurve(setBend(base, 0, bend), 0.5)).toBeCloseTo(0.7, 2);
    }
  });

  it('limits bend to [-1, 1]', () => {
    expect(setBend(line(0, 1), 0, 5).segments[0].bend).toBe(1);
    expect(setBend(line(0, 1), 0, -5).segments[0].bend).toBe(-1);
  });
});

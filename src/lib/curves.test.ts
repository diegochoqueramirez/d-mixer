import { describe, expect, it } from 'vitest';
import { VOLUME_STYLES } from '../types';
import { CURVE_SAMPLES, chipLabel, curveGain, PRESETS, sampleCurve } from './curves';

describe('curveGain', () => {
  it('smooth-crossfade keeps constant power', () => {
    for (const x of [0, 0.3, 0.5, 0.8, 1]) {
      const g = curveGain('smooth-crossfade', x);
      expect(g.out ** 2 + g.in ** 2).toBeCloseTo(1);
    }
  });

  it('crossfade is linear', () => {
    expect(curveGain('crossfade', 0.25)).toEqual({ out: 0.75, in: 0.25 });
  });

  it('overlap keeps both at full until the end of the window', () => {
    expect(curveGain('overlap', 0.5)).toEqual({ out: 1, in: 1 });
    expect(curveGain('overlap', 1)).toEqual({ out: 0, in: 1 });
  });

  it('fade-in-fade-out brings B in first, then takes A out', () => {
    expect(curveGain('fade-in-fade-out', 0.25)).toEqual({ out: 1, in: 0.5 });
    expect(curveGain('fade-in-fade-out', 0.75)).toEqual({ out: 0.5, in: 1 });
  });

  it('cut-in-fade-out starts B at full and fades A', () => {
    expect(curveGain('cut-in-fade-out', 0)).toEqual({ out: 1, in: 1 });
    expect(curveGain('cut-in-fade-out', 0.5)).toEqual({ out: 0.5, in: 1 });
  });

  it('fade-in-cut-out fades B in and cuts A at the end', () => {
    expect(curveGain('fade-in-cut-out', 0.5)).toEqual({ out: 1, in: 0.5 });
    expect(curveGain('fade-in-cut-out', 1)).toEqual({ out: 0, in: 1 });
  });

  it('center-cut switches at the middle', () => {
    expect(curveGain('center-cut', 0.49)).toEqual({ out: 1, in: 0 });
    expect(curveGain('center-cut', 0.5)).toEqual({ out: 0, in: 1 });
  });

  it('fade-in-fast-out drops A in the first quarter', () => {
    expect(curveGain('fade-in-fast-out', 0.125)).toEqual({ out: 0.5, in: 0.125 });
    expect(curveGain('fade-in-fast-out', 0.5)).toEqual({ out: 0, in: 0.5 });
  });

  it('every style starts with A at full and ends with B at full', () => {
    for (const style of VOLUME_STYLES) {
      expect(curveGain(style, 0).out).toBeCloseTo(1);
      expect(curveGain(style, 1).in).toBeCloseTo(1);
      expect(curveGain(style, 1).out).toBeCloseTo(0);
    }
  });

  it('clamps x outside [0, 1]', () => {
    expect(curveGain('crossfade', -1)).toEqual(curveGain('crossfade', 0));
    expect(curveGain('crossfade', 2)).toEqual(curveGain('crossfade', 1));
  });
});

describe('sampleCurve', () => {
  it('returns 256 samples from start to end of the fade', () => {
    const c = sampleCurve('crossfade');
    expect(c.out).toHaveLength(CURVE_SAMPLES);
    expect(c.out[0]).toBe(1);
    expect(c.out[CURVE_SAMPLES - 1]).toBe(0);
    expect(c.in[0]).toBe(0);
    expect(c.in[CURVE_SAMPLES - 1]).toBe(1);
  });

  it('produces a different shape for each style', () => {
    const shapes = VOLUME_STYLES.map((s) => {
      const c = sampleCurve(s, 9);
      return [...c.out, ...c.in].join(',');
    });
    expect(new Set(shapes).size).toBe(VOLUME_STYLES.length);
  });
});

describe('chipLabel', () => {
  it('says Auto while the transition is automatic', () => {
    expect(chipLabel({ auto: true, preset: 'fade', volume: 'smooth-crossfade' })).toBe('Auto');
  });

  it('names the preset when the volume matches it', () => {
    expect(chipLabel({ auto: false, preset: 'slam', volume: PRESETS.slam.volume })).toBe('Slam');
  });

  it('says Custom when the volume was changed by hand or no preset was picked', () => {
    expect(chipLabel({ auto: false, preset: 'fade', volume: 'overlap' })).toBe('Custom');
    expect(chipLabel({ auto: false, preset: null, volume: 'crossfade' })).toBe('Custom');
  });
});

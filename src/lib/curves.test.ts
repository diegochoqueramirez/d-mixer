import { describe, expect, it } from 'vitest';
import { PRESET_ORDER, VOLUME_STYLES } from '../types';
import { CURVE_SAMPLES, chipLabel, curveGain, PRESETS, sampleCurve, volumeSamples } from './curves';
import { curveFromStyle } from './gainCurve';

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
  const recipe = (p: keyof typeof PRESETS) => ({ volume: PRESETS[p].volume, eq: PRESETS[p].eq, filter: PRESETS[p].filter });
  const base = { auto: false, preset: null, customVolume: null, customEq: null, customFilter: null, ...recipe('fade') };

  it('says Auto while the transition is automatic', () => {
    expect(chipLabel({ ...base, auto: true, preset: 'fade' })).toBe('Auto');
  });

  it('names the preset when the three lanes follow its recipe', () => {
    for (const p of PRESET_ORDER) expect(chipLabel({ ...base, preset: p, ...recipe(p) })).toBe(PRESETS[p].label);
  });

  it('says Custom when one lane was changed by hand or no preset was picked', () => {
    expect(chipLabel({ ...base, preset: 'fade', volume: 'overlap' })).toBe('Custom');
    expect(chipLabel({ ...base, preset: 'fade', eq: 'none' })).toBe('Custom');
    expect(chipLabel({ ...base, preset: 'wave', ...recipe('wave'), filter: 'hpf-in' })).toBe('Custom');
    expect(chipLabel({ ...base, preset: null })).toBe('Custom');
  });

  it('says Custom when a curve was drawn by hand, even if the styles match a preset', () => {
    const curves = curveFromStyle('smooth-crossfade');
    expect(chipLabel({ ...base, preset: 'fade', customVolume: curves })).toBe('Custom');
    expect(chipLabel({ ...base, preset: 'fade', customEq: curves })).toBe('Custom');
    expect(chipLabel({ ...base, preset: 'fade', customFilter: curves })).toBe('Custom');
  });
});

describe('PRESETS', () => {
  it('follow the recipes of SPEC 04', () => {
    expect(PRESETS).toMatchObject({
      fade: { volume: 'smooth-crossfade', eq: 'center-bass-swap', filter: 'none' },
      blend: { volume: 'overlap', eq: 'three-band-fade', filter: 'none' },
      rise: { volume: 'overlap', eq: 'end-bass-swap', filter: 'lpf-in-hpf-out' },
      wave: { volume: 'overlap', eq: 'center-bass-swap', filter: 'lpf-in' },
      melt: { volume: 'crossfade', eq: 'center-bass-swap', filter: 'hpf-in' },
      slam: { volume: 'center-cut', eq: 'none', filter: 'none' },
    });
    expect(PRESET_ORDER).toEqual(['fade', 'blend', 'rise', 'wave', 'melt', 'slam']);
  });
});

describe('volumeSamples', () => {
  it('uses the style when there is no custom curve', () => {
    expect(volumeSamples({ volume: 'crossfade', customVolume: null }, 5).out).toEqual(sampleCurve('crossfade', 5).out);
  });

  it('uses the hand-drawn curves when present', () => {
    const customVolume = curveFromStyle('center-cut');
    const s = volumeSamples({ volume: 'crossfade', customVolume }, 3);
    expect([...s.out]).toEqual([1, 0, 0]);
  });
});

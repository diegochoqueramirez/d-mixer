import { describe, expect, it } from 'vitest';
import { barsToSeconds } from './timing';
import { clampView, fitSpan, fitView, maxZoom, panBy, peakBetween, rescaleView, visibleRange, zoomAround, WINDOW_FRACTION } from './zoom';

const BPM = 120;
const d8 = barsToSeconds(8, BPM); // 16 s

describe('fitView', () => {
  it('centres the window and shows the whole fit range', () => {
    const view = fitView(d8);
    expect(view).toEqual({ zoom: 1, center: 8 });
    const range = visibleRange(view, d8);
    expect(range.start).toBeCloseTo(0);
    expect(range.end).toBeCloseTo(1);
  });

  it('leaves 14% of context on each side of the window', () => {
    const lead = (fitSpan(d8) - d8) / 2;
    expect(lead / fitSpan(d8)).toBeCloseTo((1 - WINDOW_FRACTION) / 2);
    expect(lead).toBeCloseTo((7 * d8) / 36);
  });
});

describe('maxZoom', () => {
  it('fits 2 beats of A across the view: about bars × 2.8', () => {
    expect(maxZoom(barsToSeconds(1, BPM), BPM)).toBeCloseTo(25 / 9);
    expect(maxZoom(d8, BPM)).toBeCloseTo((8 * 25) / 9);
    expect(maxZoom(barsToSeconds(16, BPM), BPM)).toBeCloseTo((16 * 25) / 9);
  });

  it('does not depend on the tempo once d follows it', () => {
    expect(maxZoom(barsToSeconds(8, 93), 93)).toBeCloseTo(maxZoom(d8, BPM));
  });

  it('never goes below 1', () => {
    expect(maxZoom(0.1, BPM)).toBe(1);
  });
});

describe('clampView', () => {
  it('keeps the zoom inside [1, maxZoom]', () => {
    expect(clampView({ zoom: 0.2, center: 8 }, d8, BPM).zoom).toBe(1);
    expect(clampView({ zoom: 1000, center: 8 }, d8, BPM).zoom).toBeCloseTo(maxZoom(d8, BPM));
  });

  it('pins the centre at zoom 1', () => {
    expect(clampView({ zoom: 1, center: 30 }, d8, BPM).center).toBeCloseTo(8);
  });

  it('never lets the view leave the fit range', () => {
    for (const center of [-100, 0, 8, 16, 100]) {
      const range = visibleRange(clampView({ zoom: 4, center }, d8, BPM), d8);
      expect(range.start).toBeGreaterThanOrEqual(-1e-9);
      expect(range.end).toBeLessThanOrEqual(1 + 1e-9);
    }
  });
});

describe('zoomAround', () => {
  const at = (view: { zoom: number; center: number }, anchor: number) => view.center + (anchor - 0.5) * (fitSpan(d8) / view.zoom);

  it('keeps the mix time under the anchor in place', () => {
    const before = { zoom: 2, center: 8 };
    const after = zoomAround(before, 2, 0.3, d8, BPM);
    expect(after.zoom).toBe(4);
    expect(at(after, 0.3)).toBeCloseTo(at(before, 0.3));
  });

  it('keeps the centre when zooming around the middle', () => {
    expect(zoomAround(fitView(d8), 2, 0.5, d8, BPM)).toEqual({ zoom: 2, center: 8 });
  });

  it('stops at the limits', () => {
    expect(zoomAround(fitView(d8), 0.5, 0.5, d8, BPM).zoom).toBe(1);
    expect(zoomAround({ zoom: 20, center: 8 }, 4, 0.5, d8, BPM).zoom).toBeCloseTo(maxZoom(d8, BPM));
  });
});

describe('panBy', () => {
  it('does not move the whole view at zoom 1', () => {
    expect(panBy(fitView(d8), 200, 390, d8, BPM)).toEqual(fitView(d8));
  });

  it('moves the centre against the finger by the span it covers', () => {
    const view = { zoom: 4, center: 8 };
    const span = fitSpan(d8) / 4;
    expect(panBy(view, -39, 390, d8, BPM).center).toBeCloseTo(8 + span / 10);
  });

  it('stops at the edges of the fit range', () => {
    const right = visibleRange(panBy({ zoom: 4, center: 8 }, -100000, 390, d8, BPM), d8);
    expect(right.end).toBeCloseTo(1);
    const left = visibleRange(panBy({ zoom: 4, center: 8 }, 100000, 390, d8, BPM), d8);
    expect(left.start).toBeCloseTo(0);
  });
});

describe('rescaleView', () => {
  const pxPerBeat = (view: { zoom: number }, d: number, bpm: number) => 390 / (fitSpan(d) / view.zoom / (60 / bpm));

  it('keeps the pixels per beat and the centre in beats from 8 to 16 bars', () => {
    const d16 = barsToSeconds(16, BPM);
    const before = { zoom: 8, center: 6 };
    const after = rescaleView(before, { d: d8, bpm: BPM }, { d: d16, bpm: BPM });
    expect(pxPerBeat(after, d16, BPM)).toBeCloseTo(pxPerBeat(before, d8, BPM));
    expect(after.center).toBeCloseTo(6);
  });

  it('keeps the centre in beats when the tempo of A changes', () => {
    const d = barsToSeconds(8, 100);
    const after = rescaleView({ zoom: 4, center: 4 }, { d: d8, bpm: BPM }, { d, bpm: 100 });
    // 4 s at 120 bpm is beat 8; beat 8 at 100 bpm is 4.8 s
    expect(after.center).toBeCloseTo(4.8);
    expect(after.zoom).toBeCloseTo(4);
  });

  it('clamps to the new limits', () => {
    // 8 bars at zoom 1 show more beats than 1 bar can: back to the whole view
    const d1 = barsToSeconds(1, BPM);
    const after = rescaleView(fitView(d8), { d: d8, bpm: BPM }, { d: d1, bpm: BPM });
    expect(after).toEqual(fitView(d1));
  });
});

describe('peakBetween', () => {
  // 10 s, one bin per second
  const peaks = new Float32Array([0.1, 0.2, 0.9, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.05]);

  it('returns the highest peak of the range', () => {
    expect(peakBetween(peaks, 10, 1, 5)).toBeCloseTo(0.9);
    expect(peakBetween(peaks, 10, 3, 6)).toBeCloseTo(0.5);
  });

  it('returns the bin under `from` when the range sits inside one bin', () => {
    expect(peakBetween(peaks, 10, 2.1, 2.4)).toBeCloseTo(0.9);
  });

  it('returns the bin under `from` when the range is reversed (a loop jump)', () => {
    expect(peakBetween(peaks, 10, 7.5, 1.5)).toBeCloseTo(0.7);
  });

  it('clamps times outside the song', () => {
    expect(peakBetween(peaks, 10, -1, 0.5)).toBeCloseTo(0.1);
    expect(peakBetween(peaks, 10, 9.5, 12)).toBeCloseTo(0.05);
  });
});

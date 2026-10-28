import { describe, expect, it } from 'vitest';
import { computePeaks, FINE_PEAKS_PER_SECOND } from './loader';

const RATE = 44100;

/** Stand-in for an AudioBuffer: silence with a few clicks. */
function fakeBuffer(seconds: number, clicks: { at: number; length: number; level: number }[], channels = 2) {
  const length = Math.round(seconds * RATE);
  const data = Array.from({ length: channels }, () => new Float32Array(length));
  for (const c of clicks) {
    const start = Math.round(c.at * RATE);
    for (let i = start; i < start + Math.round(c.length * RATE); i++) data[0][i] = c.level;
  }
  return { length, sampleRate: RATE, numberOfChannels: channels, getChannelData: (ch: number) => data[ch] };
}

describe('computePeaks', () => {
  it('keeps one fine bin every 5 ms', () => {
    const { finePeaks } = computePeaks(fakeBuffer(240, []));
    expect(FINE_PEAKS_PER_SECOND).toBe(200);
    expect(finePeaks.length).toBe(48000);
  });

  it('puts a 1 ms click in its own 5 ms bin', () => {
    const { finePeaks } = computePeaks(fakeBuffer(2, [{ at: 1.0012, length: 0.001, level: 0.5 }]));
    const bin = Math.floor(1.0012 * FINE_PEAKS_PER_SECOND);
    expect(finePeaks[bin]).toBe(1);
    expect(finePeaks[bin - 1]).toBe(0);
    expect(finePeaks[bin + 1]).toBe(0);
  });

  it('normalizes both arrays with the same maximum', () => {
    const { peaks, finePeaks } = computePeaks(fakeBuffer(4, [{ at: 1, length: 0.002, level: 0.25 }, { at: 3, length: 0.002, level: 0.5 }]));
    expect(Math.max(...finePeaks)).toBe(1);
    expect(Math.max(...peaks)).toBe(1);
    expect(finePeaks[Math.floor(1 * FINE_PEAKS_PER_SECOND)]).toBeCloseTo(0.5);
  });

  it('makes each overview bin the highest fine bin it covers', () => {
    const clicks = Array.from({ length: 30 }, (_, i) => ({ at: 0.37 + i * 0.5, length: 0.001, level: 0.2 + (i % 5) * 0.15 }));
    const { peaks, finePeaks } = computePeaks(fakeBuffer(16, clicks));
    expect(peaks.length).toBe(2000);
    for (let b = 0; b < peaks.length; b++) {
      const start = Math.floor((b * finePeaks.length) / 2000);
      const end = Math.max(start + 1, Math.floor(((b + 1) * finePeaks.length) / 2000));
      expect(peaks[b]).toBe(Math.max(...finePeaks.subarray(start, end)));
    }
  });
});

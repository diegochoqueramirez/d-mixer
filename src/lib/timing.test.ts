import { describe, expect, it } from 'vitest';
import { barsToSeconds, isPitchShiftAudible, playbackRateFor, rampAudioSeconds, snapToBeat } from './timing';

describe('barsToSeconds', () => {
  it('converts 4 bars at 120 bpm to 8 seconds', () => {
    expect(barsToSeconds(4, 120)).toBe(8);
  });

  it('scales with bars and tempo', () => {
    expect(barsToSeconds(1, 60)).toBe(4);
    expect(barsToSeconds(16, 86)).toBeCloseTo((16 * 4 * 60) / 86);
  });
});

describe('playbackRateFor', () => {
  it('speeds the incoming track up when the outgoing one is faster', () => {
    expect(playbackRateFor(92, 86)).toBeCloseTo(1.0698, 4);
  });

  it('is 1 for equal tempos', () => {
    expect(playbackRateFor(100, 100)).toBe(1);
  });
});

describe('snapToBeat', () => {
  it('snaps to the nearest beat after the first-beat offset', () => {
    // beats at 0.25, 0.75, 1.25, ...
    expect(snapToBeat(1.1, 120, 0.25)).toBeCloseTo(1.25);
    expect(snapToBeat(0.9, 120, 0.25)).toBeCloseTo(0.75);
  });

  it('never snaps before the first beat', () => {
    expect(snapToBeat(0, 120, 0.25)).toBeCloseTo(0.25);
  });

  it('keeps a value that already sits on a beat', () => {
    expect(snapToBeat(2.25, 120, 0.25)).toBeCloseTo(2.25);
  });
});

describe('rampAudioSeconds', () => {
  it('averages the start and end rates', () => {
    expect(rampAudioSeconds(10, 0.9)).toBeCloseTo(9.5);
    expect(rampAudioSeconds(10, 1)).toBe(10);
  });
});

describe('isPitchShiftAudible', () => {
  it('flags rates outside [0.92, 1.08]', () => {
    expect(isPitchShiftAudible(0.91)).toBe(true);
    expect(isPitchShiftAudible(1.09)).toBe(true);
    expect(isPitchShiftAudible(0.92)).toBe(false);
    expect(isPitchShiftAudible(1.08)).toBe(false);
  });
});

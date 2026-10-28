import { describe, expect, it } from 'vitest';
import { track, transition } from './fixtures';
import { validatePair, validateQueue } from './validation';

describe('validatePair', () => {
  it('accepts a transition that fits both tracks', () => {
    const v = validatePair({ from: track('a'), to: track('b'), transition: transition('a', 'b') });
    expect(v.ok).toBe(true);
    expect(v.errors).toEqual([]);
  });

  it('blocks a pair with a missing BPM', () => {
    const v = validatePair({
      from: track('a'),
      to: track('b', { bpm: null, status: 'bpm-required' }),
      transition: transition('a', 'b'),
    });
    expect(v.ok).toBe(false);
    expect(v.errors[0].code).toBe('not-ready');
  });

  it('rejects a transition that runs past the end of the outgoing track', () => {
    // 4 bars at 120 bpm = 8 s; 235 + 8 > 240
    const v = validatePair({ from: track('a'), to: track('b'), transition: transition('a', 'b', { outStart: 235 }) });
    expect(v.errors.map((e) => e.code)).toContain('out-overflow');
  });

  it('rejects a transition that runs past the end of the incoming track', () => {
    const v = validatePair({
      from: track('a'),
      to: track('b', { duration: 10 }),
      transition: transition('a', 'b', { inStart: 5 }),
    });
    expect(v.errors.map((e) => e.code)).toContain('in-overflow');
  });

  it('warns about audible pitch changes without blocking', () => {
    const v = validatePair({ from: track('a', { bpm: 100 }), to: track('b', { bpm: 86 }), transition: transition('a', 'b') });
    expect(v.ok).toBe(true);
    expect(v.warnings[0].code).toBe('pitch');
  });
});

describe('validateQueue', () => {
  it('marks the next pair as overlapping when B is still ramping back', () => {
    const a = track('a', { bpm: 120 });
    const b = track('b', { bpm: 120 });
    const c = track('c');
    // a->b: 8 s at rate 1, then 8 s ramp => b is free from inStart + 16 = 26
    const ab = { from: a, to: b, transition: transition('a', 'b', { inStart: 10 }) };
    const bcBad = { from: b, to: c, transition: transition('b', 'c', { outStart: 20 }) };
    const bcGood = { from: b, to: c, transition: transition('b', 'c', { outStart: 26 }) };

    expect(validateQueue([ab, bcBad])[1].errors.map((e) => e.code)).toContain('overlap');
    expect(validateQueue([ab, bcGood])[1].ok).toBe(true);
  });

  it('reports a pair without transition as not ready', () => {
    const [v] = validateQueue([null], [['a', 'b']]);
    expect(v.ok).toBe(false);
    expect(v.errors[0].code).toBe('not-ready');
  });
});

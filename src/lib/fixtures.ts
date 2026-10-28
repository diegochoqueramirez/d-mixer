import type { Track, Transition } from '../types';

export function track(id: string, overrides: Partial<Track> = {}): Track {
  return {
    id,
    name: id,
    buffer: null,
    duration: 240,
    bpm: 120,
    firstBeatOffset: 0,
    peaks: null,
    status: 'ready',
    ...overrides,
  };
}

export function transition(fromId: string, toId: string, overrides: Partial<Transition> = {}): Transition {
  return { fromId, toId, outStart: 200, inStart: 0, bars: 4, volume: 'crossfade', preset: null, auto: false, customVolume: null, eq: 'none', filter: 'none', customEq: null, customFilter: null, effect: 'none', looping: 'none', customEffect: null, ...overrides };
}

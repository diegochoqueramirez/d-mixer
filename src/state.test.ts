import { beforeEach, describe, expect, it } from 'vitest';
import { getState, pairKey, removeTrack, restoreTrack, setState } from './state';
import { track, transition } from './lib/fixtures';

describe('removeTrack / restoreTrack', () => {
  beforeEach(() => {
    const custom = transition('b', 'c', { preset: null, volume: 'overlap', auto: false });
    setState({ tracks: [track('a'), track('b', { bpm: 128 }), track('c')], transitions: { [pairKey('b', 'c')]: custom }, editor: null });
  });

  it('removes the track and returns its old index', () => {
    const removed = removeTrack('b');
    expect(removed?.index).toBe(1);
    expect(getState().tracks.map((t) => t.id)).toEqual(['a', 'c']);
  });

  it('puts the track back at its index with its BPM and custom transition', () => {
    const removed = removeTrack('b')!;
    restoreTrack(removed);
    const s = getState();
    expect(s.tracks.map((t) => t.id)).toEqual(['a', 'b', 'c']);
    expect(s.tracks[1].bpm).toBe(128);
    expect(s.transitions[pairKey('b', 'c')].volume).toBe('overlap');
    expect(s.transitions[pairKey('b', 'c')].auto).toBe(false);
  });

  it('clamps the index when the list got shorter', () => {
    const removed = removeTrack('c')!;
    removeTrack('b');
    restoreTrack(removed);
    expect(getState().tracks.map((t) => t.id)).toEqual(['a', 'c']);
  });

  it('returns null for an unknown id and never duplicates a track', () => {
    expect(removeTrack('zzz')).toBeNull();
    const removed = removeTrack('a')!;
    restoreTrack(removed);
    restoreTrack(removed);
    expect(getState().tracks.map((t) => t.id)).toEqual(['a', 'b', 'c']);
  });
});

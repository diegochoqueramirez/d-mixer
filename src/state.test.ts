import { beforeEach, describe, expect, it } from 'vitest';
import { beginGesture, cancelGesture, endGesture, getState, openEditor, pairKey, removeTrack, restoreTrack, setState, undo, updateDraft } from './state';
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

describe('gestures', () => {
  beforeEach(() => {
    const saved = transition('a', 'b', { outStart: 200, inStart: 0 });
    setState({ tracks: [track('a'), track('b')], transitions: { [pairKey('a', 'b')]: saved }, editor: null });
    openEditor(0);
  });

  it('records a whole drag as one undo step', () => {
    beginGesture();
    updateDraft({ outStart: 202 });
    updateDraft({ outStart: 204 });
    updateDraft({ outStart: 206 });
    endGesture();
    expect(getState().editor?.past).toHaveLength(1);
    undo();
    expect(getState().editor?.draft.outStart).toBe(200);
  });

  it('cancelGesture puts the draft and both histories back', () => {
    updateDraft({ inStart: 2 });
    undo();
    const before = getState().editor!;
    expect(before.future).toHaveLength(1);
    beginGesture();
    updateDraft({ outStart: 202 });
    updateDraft({ outStart: 204 });
    cancelGesture();
    const after = getState().editor!;
    expect(after.draft).toEqual(before.draft);
    expect(after.past).toEqual(before.past);
    expect(after.future).toEqual(before.future);
    expect(after.dirty).toBe(false);
  });

  it('cancelGesture without changes leaves the editor as it was', () => {
    const before = getState().editor!;
    beginGesture();
    cancelGesture();
    expect(getState().editor!.draft).toEqual(before.draft);
    expect(getState().editor!.past).toEqual([]);
  });
});

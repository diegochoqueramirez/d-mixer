import { describe, expect, it } from 'vitest';
import { RUBBER_BAND, SWIPE_REVEAL_WIDTH, reorderTargetIndex, rubberBand, sheetReleaseAction, swipeReleaseAction } from './gestures';

describe('sheetReleaseAction', () => {
  const height = 800;

  it('closes past 25% of the height', () => {
    expect(sheetReleaseAction(240, 0, height, false)).toBe('close');
  });

  it('closes on a short fling', () => {
    expect(sheetReleaseAction(80, 0.8, height, false)).toBe('close');
  });

  it('asks for confirmation instead of closing when there are unsaved changes', () => {
    expect(sheetReleaseAction(240, 0, height, true)).toBe('confirm');
    expect(sheetReleaseAction(80, 0.8, height, true)).toBe('confirm');
  });

  it('restores on a short, slow drag', () => {
    expect(sheetReleaseAction(80, 0.1, height, false)).toBe('restore');
    expect(sheetReleaseAction(80, 0.1, height, true)).toBe('restore');
  });

  it('restores when flung back up', () => {
    expect(sheetReleaseAction(80, -1, height, false)).toBe('restore');
  });
});

describe('swipeReleaseAction', () => {
  const width = 360;

  it('reveals "Eliminar" after 70 px', () => {
    expect(swipeReleaseAction(70, 0, width)).toBe('reveal');
  });

  it('deletes past 60% of the width', () => {
    expect(swipeReleaseAction(width * 0.65, 0, width)).toBe('delete');
  });

  it('restores after 20 px', () => {
    expect(swipeReleaseAction(20, 0, width)).toBe('restore');
  });

  it('reveals on a short fling left and restores on a fling right', () => {
    expect(swipeReleaseAction(20, 0.8, width)).toBe('reveal');
    expect(swipeReleaseAction(SWIPE_REVEAL_WIDTH, -0.8, width)).toBe('restore');
  });
});

describe('reorderTargetIndex', () => {
  // rows of 60 px: midpoints 30, 90, 150, 210
  const midpoints = [30, 90, 150, 210];

  it('stays put while no midpoint is crossed', () => {
    expect(reorderTargetIndex(100, midpoints, 1)).toBe(1);
    expect(reorderTargetIndex(80, midpoints, 1)).toBe(1);
  });

  it('moves down past the next rows midpoints', () => {
    expect(reorderTargetIndex(151, midpoints, 1)).toBe(2);
    expect(reorderTargetIndex(260, midpoints, 1)).toBe(3);
  });

  it('moves up above the previous rows midpoints', () => {
    expect(reorderTargetIndex(29, midpoints, 1)).toBe(0);
    expect(reorderTargetIndex(140, midpoints, 3)).toBe(2);
  });
});

describe('rubberBand', () => {
  it('is 0 for 0', () => {
    expect(rubberBand(0, 800)).toBe(0);
  });

  it('always moves less than the finger', () => {
    for (const offset of [1, 50, 200, 800, 5000]) expect(rubberBand(offset, 800)).toBeLessThan(offset);
  });

  it('never exceeds the dimension', () => {
    expect(rubberBand(1e9, 800)).toBeLessThanOrEqual(800);
  });

  it('follows the finger at RUBBER_BAND speed at first', () => {
    expect(rubberBand(1, 800)).toBeCloseTo(RUBBER_BAND, 2);
  });
});

/** Fraction of the sheet's height that closes it on release. */
export const SHEET_CLOSE_RATIO = 0.25;
/** Release speed (px/ms) that closes the sheet or completes a swipe, whatever the distance. */
export const FLING_VELOCITY = 0.5;
/** Width of the revealed "Eliminar" button. */
export const SWIPE_REVEAL_WIDTH = 88;
/** Fraction of the row's width that deletes it without tapping "Eliminar". */
export const SWIPE_DELETE_RATIO = 0.6;
/** Hold time that lifts a row. */
export const LONG_PRESS_MS = 350;
/** Movement that cancels the long press and decides the gesture's axis. */
export const GESTURE_SLOP = 8;
/** Resistance of a sheet that cannot close (UIScrollView's coefficient). */
export const RUBBER_BAND = 0.55;
/** How long the "Deshacer" toast stays visible. */
export const UNDO_TOAST_MS = 5000;

/** Release decision for the editor sheet drag. */
export function sheetReleaseAction(
  offsetY: number,
  velocityY: number,
  sheetHeight: number,
  dirty: boolean,
): 'close' | 'confirm' | 'restore' {
  const wantsClose = offsetY > sheetHeight * SHEET_CLOSE_RATIO || (offsetY > 0 && velocityY > FLING_VELOCITY);
  if (!wantsClose) return 'restore';
  return dirty ? 'confirm' : 'close';
}

/** Release decision for a row swiped left. */
export function swipeReleaseAction(offsetX: number, velocityX: number, rowWidth: number): 'delete' | 'reveal' | 'restore' {
  if (offsetX > rowWidth * SWIPE_DELETE_RATIO) return 'delete';
  if (velocityX < -FLING_VELOCITY) return 'restore';
  if (offsetX > SWIPE_REVEAL_WIDTH / 2 || velocityX > FLING_VELOCITY) return 'reveal';
  return 'restore';
}

/** Target index while dragging a lifted row, from its centre and every row's resting midpoint. */
export function reorderTargetIndex(draggedCenterY: number, midpoints: number[], fromIndex: number): number {
  let target = fromIndex;
  // moving down: past the midpoint of each following row
  for (let i = fromIndex + 1; i < midpoints.length && draggedCenterY > midpoints[i]; i++) target = i;
  if (target !== fromIndex) return target;
  // moving up: above the midpoint of each previous row
  for (let i = fromIndex - 1; i >= 0 && draggedCenterY < midpoints[i]; i--) target = i;
  return target;
}

/** iOS-style resistance: maps the finger offset to the sheet offset when closing is blocked. */
export function rubberBand(offset: number, dimension: number): number {
  if (offset <= 0) return 0;
  return (offset * dimension * RUBBER_BAND) / (dimension + RUBBER_BAND * offset);
}

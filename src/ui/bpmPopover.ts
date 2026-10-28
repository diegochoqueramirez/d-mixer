import type { Track } from '../types';
import { getState, updateTrack } from '../state';
import { formatBpm, h } from './dom';

const MIN_BPM = 30;
const MAX_BPM = 300;

export interface BpmPopover {
  el: HTMLElement;
  open(trackId: string, anchor: HTMLElement): void;
  close(): void;
  isOpen(): boolean;
}

function setBpm(track: Track, bpm: number | null) {
  if (bpm === null) updateTrack(track.id, { bpm: null, status: 'bpm-required' });
  else if (bpm >= MIN_BPM && bpm <= MAX_BPM) updateTrack(track.id, { bpm: Math.round(bpm * 10) / 10, status: 'ready' });
}

/** BPM and first-beat editor anchored under the BPM of an editor card. Edits the track directly. */
export function createBpmPopover(): BpmPopover {
  const title = h('p', { class: 'popover-title' });
  const bpm = h('input', { type: 'number', class: 'field', min: MIN_BPM, max: MAX_BPM, step: 0.1, inputmode: 'decimal', id: 'popover-bpm' });
  const double = h('button', { class: 'chip-btn', type: 'button', 'aria-label': 'Duplicar BPM' }, '×2');
  const half = h('button', { class: 'chip-btn', type: 'button', 'aria-label': 'Dividir el BPM a la mitad' }, '÷2');
  const offset = h('input', { type: 'number', class: 'field field--offset', min: 0, step: 0.01, inputmode: 'decimal', id: 'popover-offset' });
  const el = h(
    'div',
    { class: 'popover', role: 'dialog', 'aria-modal': 'false', hidden: true },
    title,
    h('div', { class: 'popover-row' }, h('label', { class: 'field-unit', for: 'popover-bpm' }, 'BPM'), bpm, double, half),
    h('div', { class: 'popover-row' }, h('label', { class: 'field-unit', for: 'popover-offset' }, 'Primer beat (s)'), offset),
  );
  el.setAttribute('aria-label', 'Editar BPM');

  let trackId: string | null = null;
  let anchorEl: HTMLElement | null = null;
  const track = () => getState().tracks.find((t) => t.id === trackId) ?? null;

  function sync() {
    const t = track();
    if (!t) return;
    title.textContent = t.name;
    if (document.activeElement !== bpm) bpm.value = t.bpm !== null ? formatBpm(t.bpm) : '';
    if (document.activeElement !== offset) offset.value = t.firstBeatOffset.toFixed(3);
    double.disabled = half.disabled = t.bpm === null;
  }

  bpm.addEventListener('change', () => {
    const t = track();
    if (!t) return;
    setBpm(t, bpm.value.trim() === '' ? null : Number(bpm.value));
    sync();
  });
  double.addEventListener('click', () => {
    const t = track();
    if (t?.bpm) setBpm(t, t.bpm * 2);
    sync();
  });
  half.addEventListener('click', () => {
    const t = track();
    if (t?.bpm) setBpm(t, t.bpm / 2);
    sync();
  });
  offset.addEventListener('change', () => {
    const t = track();
    const value = Number(offset.value);
    if (t && offset.value.trim() !== '' && value >= 0 && value < t.duration) updateTrack(t.id, { firstBeatOffset: value });
    sync();
  });

  function close() {
    if (el.hidden) return;
    el.hidden = true;
    trackId = null;
    anchorEl?.focus();
    anchorEl = null;
  }

  el.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
    }
  });
  document.addEventListener('pointerdown', (e) => {
    if (!el.hidden && !el.contains(e.target as Node) && e.target !== anchorEl) close();
  });

  return {
    el,
    open(id, anchor) {
      trackId = id;
      anchorEl = anchor;
      sync();
      el.hidden = false;
      const host = el.offsetParent as HTMLElement | null;
      const a = anchor.getBoundingClientRect();
      const hostRect = host?.getBoundingClientRect() ?? new DOMRect();
      el.style.top = `${a.bottom - hostRect.top + (host?.scrollTop ?? 0) + 6}px`;
      el.style.left = `${Math.max(8, Math.min(a.right - hostRect.left - el.offsetWidth, hostRect.width - el.offsetWidth - 8))}px`;
      bpm.focus();
      bpm.select();
    },
    close,
    isOpen: () => !el.hidden,
  };
}

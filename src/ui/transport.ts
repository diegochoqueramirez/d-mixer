import type { AppState } from '../types';
import { derive } from '../state';
import { h, icon, setIcon } from './dom';
import { pressFeedback } from './motion';

export interface TransportHandlers {
  onPlayMix(): void;
  onStop(): void;
  /** Opens the transition that keeps the mix from playing. */
  onFix(pairIndex: number): void;
}

export interface TransportView {
  update(state: AppState): void;
}

/** Why the mix cannot play yet, or null when it can. */
export function mixBlocker(state: AppState): string | null {
  const { tracks, validations } = derive(state);
  if (tracks.length === 0) return 'Añade canciones para reproducir la mezcla.';
  const busy = tracks.find((t) => t.status === 'decoding' || t.status === 'analyzing');
  if (busy) return `Esperando a que termine el análisis de ${busy.name}.`;
  if (!state.mixEnabled) return null;
  const noBpm = tracks.find((t) => t.status === 'bpm-required');
  if (noBpm) return `Escribe el BPM de ${noBpm.name} desde su transición para reproducir la mezcla.`;
  const bad = validations.findIndex((v) => !v.ok);
  if (bad >= 0) return `Revisa la transición ${bad + 1} para reproducir la mezcla.`;
  return null;
}

/** The transition to open to fix what `mixBlocker` reports, when there is one. */
export function mixBlockerPair(state: AppState): number | null {
  const { tracks, pairs, validations } = derive(state);
  if (!state.mixEnabled || tracks.length < 2) return null;
  if (tracks.some((t) => t.status === 'decoding' || t.status === 'analyzing')) return null;
  const noBpm = tracks.findIndex((t) => t.status === 'bpm-required');
  const target = noBpm >= 0 ? Math.min(noBpm, tracks.length - 2) : validations.findIndex((v) => !v.ok);
  return target >= 0 && pairs[target] ? target : null;
}

/** Mini-player: the status in up to two lines and one round play/stop button. */
export function mountTransport(root: HTMLElement, handlers: TransportHandlers): TransportView {
  const toggle = h('button', { class: 'player-btn', type: 'button' }, icon('play'));
  // when something blocks the mix, the status is a button that opens the transition to fix
  const text = h('span', { class: 'transport-text', 'aria-live': 'polite' });
  const status = h('button', { class: 'transport-status', type: 'button' }, text, icon('chevron'));
  root.append(h('div', { class: 'transport-inner' }, status, toggle));
  pressFeedback(toggle);

  toggle.addEventListener('click', () => (toggle.dataset.mode === 'stop' ? handlers.onStop() : handlers.onPlayMix()));
  status.addEventListener('click', () => {
    const pair = Number(status.dataset.pair);
    if (!Number.isNaN(pair)) handlers.onFix(pair);
  });

  return {
    update(state) {
      const playing = state.playback === 'playing';
      const stopMode = state.playback !== 'stopped';
      const blocker = mixBlocker(state);
      toggle.dataset.mode = stopMode ? 'stop' : 'play';
      toggle.disabled = !stopMode && blocker !== null;
      setIcon(toggle, stopMode ? 'stop' : 'play');
      toggle.setAttribute('aria-label', stopMode ? 'Detener' : 'Reproducir mezcla');
      if (playing) text.textContent = state.mixEnabled ? 'Reproduciendo la mezcla.' : 'Reproduciendo sin transiciones.';
      else if (blocker) text.textContent = blocker;
      else {
        const n = derive(state).tracks.length;
        const songs = n === 1 ? '1 canción' : `${n} canciones`;
        text.textContent = state.mixEnabled ? `Lista para reproducir ${songs}.` : `Mix apagado: ${songs} seguidas, sin transiciones.`;
      }
      const fix = !stopMode && blocker ? mixBlockerPair(state) : null;
      status.disabled = fix === null;
      if (fix === null) delete status.dataset.pair;
      else status.dataset.pair = String(fix);
      status.classList.toggle('is-actionable', fix !== null);
    },
  };
}

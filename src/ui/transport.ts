import type { AppState } from '../types';
import { derive } from '../state';
import { h, icon } from './dom';

export interface TransportHandlers {
  onPlayMix(): void;
  onStop(): void;
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

export function mountTransport(root: HTMLElement, handlers: TransportHandlers): TransportView {
  const play = h('button', { class: 'primary-btn', type: 'button' }, icon('play'), 'Reproducir mezcla');
  const stop = h('button', { class: 'pill-btn', type: 'button' }, icon('stop'), 'Detener');
  const status = h('p', { class: 'transport-status', 'aria-live': 'polite' });
  root.append(play, stop, status);

  play.addEventListener('click', handlers.onPlayMix);
  stop.addEventListener('click', handlers.onStop);

  return {
    update(state) {
      const playing = state.playback === 'playing';
      const blocker = mixBlocker(state);
      play.disabled = playing || blocker !== null;
      stop.disabled = state.playback === 'stopped';
      if (playing) status.textContent = state.mixEnabled ? 'Reproduciendo la mezcla.' : 'Reproduciendo sin transiciones.';
      else if (blocker) status.textContent = blocker;
      else {
        const n = derive(state).tracks.length;
        const songs = n === 1 ? '1 canción' : `${n} canciones`;
        status.textContent = state.mixEnabled ? `Lista para reproducir ${songs}.` : `Mix apagado: ${songs} seguidas, sin transiciones.`;
      }
    },
  };
}

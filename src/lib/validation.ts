import type { Track, Transition } from '../types';
import { barsToSeconds, isPitchShiftAudible, playbackRateFor, rampAudioSeconds } from './timing';

export interface Pair {
  from: Track;
  to: Track;
  transition: Transition;
}

export type PairErrorCode = 'not-ready' | 'out-overflow' | 'in-overflow' | 'overlap';

export interface PairValidation {
  ok: boolean;
  errors: { code: PairErrorCode; message: string }[];
  warnings: { code: 'pitch'; message: string }[];
}

const EPSILON = 1e-6;

/** Audio seconds of the incoming track consumed until it is back at rate 1. */
export function incomingConsumed(pair: Pair): number {
  const { from, to, transition } = pair;
  const d = barsToSeconds(transition.bars, from.bpm!);
  const r = playbackRateFor(from.bpm!, to.bpm!);
  return d * r + rampAudioSeconds(d, r);
}

function isReady(t: Track): boolean {
  return t.status === 'ready' && t.bpm !== null;
}

/**
 * Validates one pair. `previous` is the pair whose incoming track is this pair's outgoing track:
 * this pair may only start once that track is back at its natural speed.
 */
export function validatePair(pair: Pair, previous?: Pair): PairValidation {
  const { from, to, transition } = pair;
  const errors: PairValidation['errors'] = [];
  const warnings: PairValidation['warnings'] = [];

  if (!isReady(from) || !isReady(to)) {
    const missing = [from, to].filter((t) => !isReady(t)).map((t) => t.name);
    errors.push({ code: 'not-ready', message: `Falta el BPM o el análisis de: ${missing.join(', ')}.` });
    return { ok: false, errors, warnings };
  }

  const d = barsToSeconds(transition.bars, from.bpm!);
  const r = playbackRateFor(from.bpm!, to.bpm!);

  if (transition.outStart + d > from.duration + EPSILON) {
    errors.push({ code: 'out-overflow', message: `La transición termina después del final de ${from.name}. Mueve el punto de salida hacia atrás o usa menos compases.` });
  }
  if (transition.inStart + d * r > to.duration + EPSILON) {
    errors.push({ code: 'in-overflow', message: `${to.name} se acaba antes de terminar la transición. Mueve el punto de entrada hacia atrás o usa menos compases.` });
  }
  if (previous && isReady(previous.from) && isReady(previous.to)) {
    const freeFrom = previous.transition.inStart + incomingConsumed(previous);
    if (transition.outStart + EPSILON < freeFrom) {
      errors.push({ code: 'overlap', message: `Solapada: ${from.name} todavía está volviendo a su tempo. El punto de salida debe estar después de ${freeFrom.toFixed(2)} s.` });
    }
  }
  if (isPitchShiftAudible(r)) {
    warnings.push({ code: 'pitch', message: `Cambio de tono audible: ${to.name} suena a ${r.toFixed(3)}× durante la transición.` });
  }

  return { ok: errors.length === 0, errors, warnings };
}

/**
 * Validates every consecutive pair of the queue, in order.
 * A `null` pair has no transition yet because its outgoing track has no BPM.
 */
export function validateQueue(pairs: (Pair | null)[], names: [string, string][] = []): PairValidation[] {
  return pairs.map((pair, i) => {
    if (!pair) {
      const [from = '', to = ''] = names[i] ?? [];
      return {
        ok: false,
        errors: [{ code: 'not-ready', message: `Falta el BPM o el análisis de: ${[from, to].filter(Boolean).join(', ')}.` }],
        warnings: [],
      };
    }
    return validatePair(pair, pairs[i - 1] ?? undefined);
  });
}

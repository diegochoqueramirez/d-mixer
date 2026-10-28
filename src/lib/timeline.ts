import type { TimelineEntry, Track, Transition } from '../types';
import { volumeSamples } from './curves';
import { barsToSeconds, playbackRateFor, rampAudioSeconds } from './timing';

/** Bars of context played before and after the window in the editor preview. */
export const PREVIEW_LEAD_BARS = 2;

/** A known (context time, audio position) from which the track plays at rate 1. */
interface RateOneAnchor {
  time: number;
  audio: number;
}

/**
 * Schedules tracks[startIndex..endIndex] so that playback starts at `startOffset` seconds of tracks[startIndex].
 * Context times are relative to the start of playback. Every pair in range must have passed validation.
 */
export function buildTimeline(
  tracks: Track[],
  transitions: Record<string, Transition>,
  startIndex: number,
  startOffset: number,
  endIndex = tracks.length - 1,
): TimelineEntry[] {
  const first = tracks[startIndex];
  const entries: TimelineEntry[] = [];
  let current: TimelineEntry = {
    trackId: first.id,
    contextStart: 0,
    offset: startOffset,
    rateEvents: [{ time: 0, rate: 1, ramp: false }],
    stopAt: first.duration - startOffset,
  };
  let anchor: RateOneAnchor = { time: 0, audio: startOffset };
  entries.push(current);

  for (let i = startIndex; i < endIndex; i++) {
    const from = tracks[i];
    const to = tracks[i + 1];
    const transition = transitions[`${from.id}->${to.id}`];
    if (!transition || from.bpm === null || to.bpm === null) {
      throw new Error(`Missing transition data for pair ${i}`);
    }

    const tOut = anchor.time + (transition.outStart - anchor.audio);
    if (tOut < anchor.time) throw new Error(`Pair ${i} starts before ${from.name} is back at rate 1`);

    const d = barsToSeconds(transition.bars, from.bpm);
    const r = playbackRateFor(from.bpm, to.bpm);
    const curve = volumeSamples(transition);

    current.gainCurveOut = { time: tOut, duration: d, curve: curve.out };
    current.stopAt = tOut + d;

    anchor = { time: tOut + 2 * d, audio: transition.inStart + d * r + rampAudioSeconds(d, r) };
    current = {
      trackId: to.id,
      contextStart: tOut,
      offset: transition.inStart,
      rateEvents: [
        { time: tOut, rate: r, ramp: false },
        { time: tOut + d, rate: r, ramp: false },
        { time: tOut + 2 * d, rate: 1, ramp: true },
      ],
      gainCurveIn: { time: tOut, duration: d, curve: curve.in },
      stopAt: Math.max(tOut + d, anchor.time + (to.duration - anchor.audio)),
    };
    entries.push(current);
  }

  return entries;
}

/**
 * Audio position of the incoming track at mix time `tau` (0 = transition start): rate `r` until `d`,
 * a linear ramp back to 1 until `2d`, then 1. Negative `tau` extrapolates at rate `r`.
 */
export function incomingAudioAt(tau: number, inStart: number, d: number, r: number): number {
  if (tau <= d) return inStart + tau * r;
  if (tau <= 2 * d) {
    const u = tau - d;
    return inStart + d * r + u * r + ((1 - r) * u * u) / (2 * d);
  }
  return inStart + d * r + rampAudioSeconds(d, r) + (tau - 2 * d);
}

/** Audio position of an entry at context time `t`, integrating its playback-rate automation. */
export function audioPositionAt(entry: TimelineEntry, t: number): number {
  if (t <= entry.contextStart) return entry.offset;
  let audio = entry.offset;
  let prevTime = entry.contextStart;
  let rate = entry.rateEvents[0]?.rate ?? 1;

  for (const e of entry.rateEvents) {
    if (e.time <= prevTime) {
      rate = e.rate;
      continue;
    }
    const end = Math.min(t, e.time);
    if (e.ramp) {
      const span = e.time - prevTime;
      const rateAtEnd = rate + ((e.rate - rate) * (end - prevTime)) / span;
      audio += ((end - prevTime) * (rate + rateAtEnd)) / 2;
      if (t < e.time) return audio;
    } else {
      audio += (end - prevTime) * rate;
      if (t < e.time) return audio;
    }
    prevTime = e.time;
    rate = e.rate;
  }

  return audio + (t - prevTime) * rate;
}

/** Mix with Mix turned off: tracks back to back, no overlap, rate 1, full gain. */
export function buildSequentialTimeline(tracks: Track[]): TimelineEntry[] {
  let t = 0;
  return tracks.map((track) => {
    const entry: TimelineEntry = {
      trackId: track.id,
      contextStart: t,
      offset: 0,
      rateEvents: [{ time: t, rate: 1, ramp: false }],
      stopAt: t + track.duration,
    };
    t += track.duration;
    return entry;
  });
}

export interface PreviewRange {
  /** Where the outgoing track starts playing, in its audio seconds. */
  startOffset: number;
  /** Mix time of the loop start, relative to the transition start (<= 0). */
  tauStart: number;
  /** Mix time of the loop end, relative to the transition start. */
  tauEnd: number;
}

/** Editor preview loop: from 2 bars of A before the window to 2 bars of A after it. */
export function previewRange(transition: Transition, bpmA: number): PreviewRange {
  const lead = barsToSeconds(PREVIEW_LEAD_BARS, bpmA);
  const startOffset = Math.max(0, transition.outStart - lead);
  return {
    startOffset,
    tauStart: startOffset - transition.outStart,
    tauEnd: barsToSeconds(transition.bars, bpmA) + lead,
  };
}

/** Cuts every entry at context time `end`, dropping entries that would start after it. */
export function clipTimeline(entries: TimelineEntry[], end: number): TimelineEntry[] {
  return entries.filter((e) => e.contextStart < end).map((e) => ({ ...e, stopAt: Math.min(e.stopAt, end) }));
}

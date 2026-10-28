export const BEATS_PER_BAR = 4;
export const PITCH_SAFE_MIN = 0.92;
export const PITCH_SAFE_MAX = 1.08;

export function beatSeconds(bpm: number): number {
  return 60 / bpm;
}

export function barsToSeconds(bars: number, bpm: number): number {
  return bars * BEATS_PER_BAR * beatSeconds(bpm);
}

/** Rate the incoming track needs to play at the outgoing track's tempo. */
export function playbackRateFor(bpmOut: number, bpmIn: number): number {
  return bpmOut / bpmIn;
}

/** Nearest beat at or after the first beat: firstBeatOffset + k * 60 / bpm, k >= 0. */
export function snapToBeat(time: number, bpm: number, firstBeatOffset: number): number {
  const beat = beatSeconds(bpm);
  const k = Math.max(0, Math.round((time - firstBeatOffset) / beat));
  return firstBeatOffset + k * beat;
}

/** Audio seconds consumed by a linear rate ramp from `rate` to 1 over `duration` context seconds. */
export function rampAudioSeconds(duration: number, rate: number): number {
  return (duration * (rate + 1)) / 2;
}

export function isPitchShiftAudible(rate: number): boolean {
  return rate < PITCH_SAFE_MIN || rate > PITCH_SAFE_MAX;
}

import { guess } from 'web-audio-beat-detector';

export interface TempoGuess {
  bpm: number;
  firstBeatOffset: number;
}

/** Detected tempo and first beat, or null when the detector finds no beats. */
export async function detectTempo(buffer: AudioBuffer): Promise<TempoGuess | null> {
  try {
    const { bpm, offset } = await guess(buffer);
    return { bpm, firstBeatOffset: offset };
  } catch {
    return null;
  }
}

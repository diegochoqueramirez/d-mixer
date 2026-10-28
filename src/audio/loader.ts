import { getAudioContext } from './engine';

const PEAK_BINS = 2000;
/** Bins per second of the fine peaks drawn by the aligned view (one every 5 ms). */
export const FINE_PEAKS_PER_SECOND = 200;

export async function decodeFile(file: File): Promise<AudioBuffer> {
  const data = await file.arrayBuffer();
  return getAudioContext().decodeAudioData(data);
}

type PeakSource = Pick<AudioBuffer, 'length' | 'sampleRate' | 'numberOfChannels' | 'getChannelData'>;

/**
 * Max absolute amplitude across all channels, normalized to [0, 1]: one bin every 5 ms for the aligned
 * view, and the 2000-bin overview of the minimaps derived from it, so the samples are read once.
 */
export function computePeaks(buffer: PeakSource): { peaks: Float32Array; finePeaks: Float32Array } {
  const samplesPerBin = buffer.sampleRate / FINE_PEAKS_PER_SECOND;
  const fineBins = Math.max(1, Math.ceil(buffer.length / samplesPerBin));
  const finePeaks = new Float32Array(fineBins);
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let b = 0; b < fineBins; b++) {
      const start = Math.round(b * samplesPerBin);
      const end = Math.min(data.length, Math.round((b + 1) * samplesPerBin));
      let max = finePeaks[b];
      for (let i = start; i < end; i++) {
        const v = Math.abs(data[i]);
        if (v > max) max = v;
      }
      finePeaks[b] = max;
    }
  }
  let globalMax = 0;
  for (const p of finePeaks) if (p > globalMax) globalMax = p;
  if (globalMax > 0) for (let b = 0; b < fineBins; b++) finePeaks[b] /= globalMax;

  // each overview bin is the highest fine bin it covers
  const peaks = new Float32Array(PEAK_BINS);
  for (let b = 0; b < PEAK_BINS; b++) {
    const start = Math.floor((b * fineBins) / PEAK_BINS);
    const end = Math.max(start + 1, Math.floor(((b + 1) * fineBins) / PEAK_BINS));
    let max = 0;
    for (let i = start; i < Math.min(end, fineBins); i++) if (finePeaks[i] > max) max = finePeaks[i];
    peaks[b] = max;
  }
  return { peaks, finePeaks };
}

export function trackNameFromFile(file: File): string {
  return file.name.replace(/\.[^.]+$/, '');
}

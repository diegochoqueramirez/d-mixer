import { getAudioContext } from './engine';

const PEAK_BINS = 2000;

export async function decodeFile(file: File): Promise<AudioBuffer> {
  const data = await file.arrayBuffer();
  return getAudioContext().decodeAudioData(data);
}

/** Max absolute amplitude per bin across all channels, normalized to [0, 1]. */
export function computePeaks(buffer: AudioBuffer, bins = PEAK_BINS): Float32Array {
  const peaks = new Float32Array(bins);
  const samplesPerBin = Math.max(1, Math.floor(buffer.length / bins));
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let b = 0; b < bins; b++) {
      const start = b * samplesPerBin;
      const end = Math.min(data.length, start + samplesPerBin);
      let max = peaks[b];
      for (let i = start; i < end; i++) {
        const v = Math.abs(data[i]);
        if (v > max) max = v;
      }
      peaks[b] = max;
    }
  }
  let globalMax = 0;
  for (const p of peaks) if (p > globalMax) globalMax = p;
  if (globalMax > 0) for (let b = 0; b < bins; b++) peaks[b] /= globalMax;
  return peaks;
}

export function trackNameFromFile(file: File): string {
  return file.name.replace(/\.[^.]+$/, '');
}

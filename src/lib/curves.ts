import type { EqStyle, FilterStyle, Transition, TransitionPreset, VolumeStyle } from '../types';
import { sampleGainCurve } from './gainCurve';

export const CURVE_SAMPLES = 256;

export interface CurvePoint {
  out: number;
  in: number;
}

export const VOLUME_LABELS: Record<VolumeStyle, string> = {
  'smooth-crossfade': 'Smooth crossfade',
  crossfade: 'Crossfade',
  overlap: 'Overlap',
  'fade-in-fade-out': 'Fade in fade out',
  'cut-in-fade-out': 'Cut in fade out',
  'fade-in-cut-out': 'Fade in cut out',
  'center-cut': 'Center cut',
  'fade-in-fast-out': 'Fade in fast out',
};

export interface PresetRecipe {
  label: string;
  volume: VolumeStyle;
  eq: EqStyle;
  filter: FilterStyle;
}

/** Full recipe of each preset (from vimj, see SPEC 04). */
export const PRESETS: Record<TransitionPreset, PresetRecipe> = {
  fade: { label: 'Fade', volume: 'smooth-crossfade', eq: 'center-bass-swap', filter: 'none' },
  blend: { label: 'Blend', volume: 'overlap', eq: 'three-band-fade', filter: 'none' },
  rise: { label: 'Rise', volume: 'overlap', eq: 'end-bass-swap', filter: 'lpf-in-hpf-out' },
  wave: { label: 'Wave', volume: 'overlap', eq: 'center-bass-swap', filter: 'lpf-in' },
  melt: { label: 'Melt', volume: 'crossfade', eq: 'center-bass-swap', filter: 'hpf-in' },
  slam: { label: 'Slam', volume: 'center-cut', eq: 'none', filter: 'none' },
};

/** Holds 1 until the end of the window, then drops to 0. */
const holdThenCut = (x: number) => (x < 1 ? 1 : 0);

/** Gains of the outgoing and incoming track at position x ∈ [0, 1] of the transition. */
export function curveGain(style: VolumeStyle, x: number): CurvePoint {
  const t = Math.min(1, Math.max(0, x));
  switch (style) {
    case 'smooth-crossfade':
      return { out: Math.cos((t * Math.PI) / 2), in: Math.sin((t * Math.PI) / 2) };
    case 'crossfade':
      return { out: 1 - t, in: t };
    case 'overlap':
      return { out: holdThenCut(t), in: 1 };
    case 'fade-in-fade-out':
      return { out: t < 0.5 ? 1 : 2 - 2 * t, in: t < 0.5 ? 2 * t : 1 };
    case 'cut-in-fade-out':
      return { out: 1 - t, in: 1 };
    case 'fade-in-cut-out':
      return { out: holdThenCut(t), in: t };
    case 'center-cut':
      return t < 0.5 ? { out: 1, in: 0 } : { out: 0, in: 1 };
    case 'fade-in-fast-out':
      return { out: t < 0.25 ? 1 - 4 * t : 0, in: t };
  }
}

export interface SampledCurve {
  out: Float32Array;
  in: Float32Array;
}

export function sampleCurve(style: VolumeStyle, n = CURVE_SAMPLES): SampledCurve {
  const out = new Float32Array(n);
  const inn = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const g = curveGain(style, i / (n - 1));
    out[i] = g.out;
    inn[i] = g.in;
  }
  return { out, in: inn };
}

/** Gain samples of a transition: its hand-drawn curves when present, otherwise its volume style. */
export function volumeSamples(t: Pick<Transition, 'volume' | 'customVolume'>, n = CURVE_SAMPLES): SampledCurve {
  if (t.customVolume) return { out: sampleGainCurve(t.customVolume.out, n), in: sampleGainCurve(t.customVolume.in, n) };
  return sampleCurve(t.volume, n);
}

type ChipFields = Pick<Transition, 'auto' | 'preset' | 'volume' | 'eq' | 'filter' | 'customVolume' | 'customEq' | 'customFilter'>;

/** Text of the transition chip: "Auto", the preset name when all three lanes follow its recipe, or "Custom". */
export function chipLabel(t: ChipFields): string {
  if (t.auto) return 'Auto';
  if (t.customVolume || t.customEq || t.customFilter || t.preset === null) return 'Custom';
  const p = PRESETS[t.preset];
  return p.volume === t.volume && p.eq === t.eq && p.filter === t.filter ? p.label : 'Custom';
}

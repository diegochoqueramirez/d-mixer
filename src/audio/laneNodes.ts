import type { EqEvent, FilterEvent, NoiseEvent, TimelineEntry } from '../types';
import { FILTER_Q_DB } from '../lib/lanes';

const LOW_CROSSOVER_HZ = 250;
const HIGH_CROSSOVER_HZ = 3000;
/** Butterworth Q (1/√2): linear for the all-pass, in dB for lowpass/highpass as Web Audio expects. */
const BUTTERWORTH_Q = Math.SQRT1_2;
const BUTTERWORTH_Q_DB = 20 * Math.log10(BUTTERWORTH_Q);
const NOISE_SECONDS = 2;

/** Nodes inserted between a track's source and its volume gain. */
export interface LaneChain {
  input: AudioNode;
  output: AudioNode;
  nodes: AudioNode[];
}

function biquad(c: BaseAudioContext, type: BiquadFilterType, frequency: number, q: number): BiquadFilterNode {
  const f = c.createBiquadFilter();
  f.type = type;
  f.frequency.value = frequency;
  f.Q.value = q;
  return f;
}

/** Connects nodes in series and returns the last one. */
function chain(first: AudioNode, ...rest: AudioNode[]): AudioNode {
  return rest.reduce((prev, next) => prev.connect(next), first);
}

/** Holds `initial` until each event, then follows its curve (the last value holds afterwards). */
function automate(param: AudioParam, initial: number, base: number, events: { time: number; duration: number; curve: Float32Array }[]) {
  param.value = initial;
  for (const e of events) param.setValueCurveAtTime(e.curve, base + e.time, e.duration);
}

/**
 * Three-band isolator from Linkwitz–Riley crossovers (two cascaded Butterworth biquads) at 250 Hz and
 * 3 kHz. The low band also goes through the 3 kHz all-pass so the bands sum flat at unity gains.
 */
function eqStage(c: BaseAudioContext, base: number, eqIn?: EqEvent, eqOut?: EqEvent): LaneChain {
  const input = c.createGain();
  const output = c.createGain();
  const lp = (f: number) => biquad(c, 'lowpass', f, BUTTERWORTH_Q_DB);
  const hp = (f: number) => biquad(c, 'highpass', f, BUTTERWORTH_Q_DB);

  const low = [lp(LOW_CROSSOVER_HZ), lp(LOW_CROSSOVER_HZ), biquad(c, 'allpass', HIGH_CROSSOVER_HZ, BUTTERWORTH_Q)];
  const rest = [hp(LOW_CROSSOVER_HZ), hp(LOW_CROSSOVER_HZ)];
  const mid = [lp(HIGH_CROSSOVER_HZ), lp(HIGH_CROSSOVER_HZ)];
  const high = [hp(HIGH_CROSSOVER_HZ), hp(HIGH_CROSSOVER_HZ)];
  const gains = { low: c.createGain(), mid: c.createGain(), high: c.createGain() };

  chain(input, ...low, gains.low).connect(output);
  const restOut = chain(input, ...rest);
  chain(restOut, ...mid, gains.mid).connect(output);
  chain(restOut, ...high, gains.high).connect(output);

  for (const band of ['low', 'mid', 'high'] as const) {
    const events = [eqIn, eqOut].filter((e) => e !== undefined).map((e) => ({ time: e.time, duration: e.duration, curve: e[band] }));
    automate(gains[band].gain, eqIn ? eqIn[band][0] : 1, base, events);
  }

  return { input, output, nodes: [input, output, ...low, ...rest, ...mid, ...high, ...Object.values(gains)] };
}

/** One filter over one window, blended with the dry signal so it is transparent when open. */
function filterStage(c: BaseAudioContext, base: number, e: FilterEvent, startsClosed: boolean): LaneChain {
  const input = c.createGain();
  const output = c.createGain();
  const filter = biquad(c, e.kind, e.frequency[0], FILTER_Q_DB);
  const wet = c.createGain();
  const dry = c.createGain();
  input.connect(dry).connect(output);
  chain(input, filter, wet).connect(output);

  const window = { time: e.time, duration: e.duration };
  const initialWet = startsClosed ? e.wet[0] : 0;
  automate(filter.frequency, e.frequency[0], base, [{ ...window, curve: e.frequency }]);
  automate(wet.gain, initialWet, base, [{ ...window, curve: e.wet }]);
  automate(dry.gain, 1 - initialWet, base, [{ ...window, curve: e.wet.map((w) => 1 - w) }]);

  return { input, output, nodes: [input, output, filter, wet, dry] };
}

/** EQ and filter stages an entry needs, or null when it plays untouched. */
export function laneChain(c: BaseAudioContext, entry: TimelineEntry, base: number): LaneChain | null {
  const stages: LaneChain[] = [];
  if (entry.eqIn || entry.eqOut) stages.push(eqStage(c, base, entry.eqIn, entry.eqOut));
  // The incoming window opens a filter that starts closed; the outgoing one closes a filter that starts open.
  if (entry.filterIn) stages.push(filterStage(c, base, entry.filterIn, true));
  if (entry.filterOut) stages.push(filterStage(c, base, entry.filterOut, false));
  if (stages.length === 0) return null;
  for (let i = 1; i < stages.length; i++) stages[i - 1].output.connect(stages[i].input);
  return { input: stages[0].input, output: stages[stages.length - 1].output, nodes: stages.flatMap((s) => s.nodes) };
}

const noiseBuffers = new WeakMap<BaseAudioContext, AudioBuffer>();

function noiseBuffer(c: BaseAudioContext): AudioBuffer {
  let buffer = noiseBuffers.get(c);
  if (!buffer) {
    buffer = c.createBuffer(2, Math.round(c.sampleRate * NOISE_SECONDS), c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buffer.getChannelData(ch);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    noiseBuffers.set(c, buffer);
  }
  return buffer;
}

/** White noise through an opening low-pass, rising over the outgoing window ("Noise out end"). */
export function scheduleNoise(c: BaseAudioContext, e: NoiseEvent, base: number, out: AudioNode): { source: AudioBufferSourceNode; nodes: AudioNode[] } {
  const source = c.createBufferSource();
  source.buffer = noiseBuffer(c);
  source.loop = true;
  const filter = biquad(c, 'lowpass', e.frequency[0], FILTER_Q_DB);
  const gain = c.createGain();
  chain(source, filter, gain).connect(out);

  const window = { time: e.time, duration: e.duration };
  automate(filter.frequency, e.frequency[0], base, [{ ...window, curve: e.frequency }]);
  automate(gain.gain, e.level[0], base, [{ ...window, curve: e.level }]);
  source.start(base + e.time);
  source.stop(base + e.time + e.duration);
  return { source, nodes: [filter, gain] };
}

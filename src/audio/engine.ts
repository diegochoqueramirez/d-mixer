import type { TimelineEntry } from '../types';
import { laneChain, scheduleNoise } from './laneNodes';

const START_LATENCY = 0.08;
/** Fade at each loop edge so restarting the preview does not click. */
const LOOP_FADE = 0.01;
/** How long before a loop iteration ends the next one gets scheduled. */
const LOOP_LOOKAHEAD = 0.5;

interface Voice {
  source: AudioBufferSourceNode;
  gain: GainNode;
  /** EQ, filter and noise nodes, plus the noise source; empty when the track plays untouched. */
  extra: AudioNode[];
  extraSources: AudioBufferSourceNode[];
}

interface Iteration {
  base: number;
  entries: TimelineEntry[];
  voices: Voice[];
  out: AudioNode;
}

let ctx: AudioContext | null = null;
let iterations: Iteration[] = [];
let timer: ReturnType<typeof setTimeout> | undefined;
let session = 0;

/** Created lazily so it starts inside a user gesture (file pick, drop or click). */
export function getAudioContext(): AudioContext {
  if (!ctx) ctx = new AudioContext();
  return ctx;
}

function schedule(c: AudioContext, entries: TimelineEntry[], buffers: Map<string, AudioBuffer>, base: number, out: AudioNode): Voice[] {
  return entries.map((entry) => {
    const source = c.createBufferSource();
    source.buffer = buffers.get(entry.trackId) ?? null;
    const gain = c.createGain();
    const lanes = laneChain(c, entry, base);
    if (lanes) {
      source.connect(lanes.input);
      lanes.output.connect(gain);
    } else {
      source.connect(gain);
    }
    gain.connect(out);
    const extra = lanes?.nodes ?? [];
    const extraSources: AudioBufferSourceNode[] = [];
    if (entry.noiseOut) {
      // Noise goes after the volume gain, so it does not fade with the outgoing song.
      const noise = scheduleNoise(c, entry.noiseOut, base, out);
      extra.push(...noise.nodes);
      extraSources.push(noise.source);
    }

    for (const e of entry.rateEvents) {
      const at = base + e.time;
      if (e.ramp) source.playbackRate.linearRampToValueAtTime(e.rate, at);
      else source.playbackRate.setValueAtTime(e.rate, at);
    }

    // The curves start with their own first sample, so no setValueAtTime may share their start time.
    gain.gain.value = entry.gainCurveIn ? entry.gainCurveIn.curve[0] : 1;
    for (const g of [entry.gainCurveIn, entry.gainCurveOut]) {
      if (g) gain.gain.setValueCurveAtTime(g.curve, base + g.time, g.duration);
    }

    source.start(base + entry.contextStart, entry.offset);
    source.stop(base + entry.stopAt);
    return { source, gain, extra, extraSources };
  });
}

/** Plays a timeline once, then calls `onEnded`. */
export async function play(timeline: TimelineEntry[], buffers: Map<string, AudioBuffer>, onEnded: () => void): Promise<void> {
  stop();
  const c = getAudioContext();
  const current = session;
  await c.resume();
  if (current !== session) return;
  const base = c.currentTime + START_LATENCY;
  const voices = schedule(c, timeline, buffers, base, c.destination);
  iterations = [{ base, entries: timeline, voices, out: c.destination }];

  let pending = voices.length;
  for (const v of voices) {
    v.source.onended = () => {
      if (current !== session) return;
      if (--pending === 0) {
        reset();
        onEnded();
      }
    };
  }
}

/** Repeats a timeline of `length` seconds until `stop()`, with a short fade at each edge. */
export async function playLoop(timeline: TimelineEntry[], length: number, buffers: Map<string, AudioBuffer>): Promise<void> {
  stop();
  const c = getAudioContext();
  const current = session;
  await c.resume();
  if (current !== session) return;

  const run = (base: number) => {
    const out = c.createGain();
    out.connect(c.destination);
    out.gain.setValueAtTime(0, base);
    out.gain.linearRampToValueAtTime(1, base + LOOP_FADE);
    out.gain.setValueAtTime(1, base + length - LOOP_FADE);
    out.gain.linearRampToValueAtTime(0, base + length);

    const voices = schedule(c, timeline, buffers, base, out);
    iterations = iterations.filter((it) => it.base + length > c.currentTime - 1);
    iterations.push({ base, entries: timeline, voices, out });

    const next = base + length;
    timer = setTimeout(() => {
      if (current === session) run(next);
    }, Math.max(0, (next - c.currentTime - LOOP_LOOKAHEAD) * 1000));
  };

  run(c.currentTime + START_LATENCY);
}

export function stop(): void {
  session++;
  clearTimeout(timer);
  for (const it of iterations) {
    for (const v of it.voices) {
      for (const source of [v.source, ...v.extraSources]) {
        try {
          source.stop();
        } catch {
          // already stopped
        }
        source.disconnect();
      }
      v.gain.disconnect();
      for (const node of v.extra) node.disconnect();
    }
    if (ctx && it.out !== ctx.destination) it.out.disconnect();
  }
  reset();
}

function reset(): void {
  iterations = [];
}

/**
 * Mix time relative to the transition into `incomingId` (0 = transition start), or null when that
 * transition is not part of what is playing.
 */
export function mixTimeOf(incomingId: string): number | null {
  if (!ctx) return null;
  const now = ctx.currentTime;
  const it = [...iterations].reverse().find((i) => i.base <= now);
  const entry = it?.entries.find((e) => e.trackId === incomingId && e.gainCurveIn);
  if (!it || !entry) return null;
  return now - it.base - entry.contextStart;
}

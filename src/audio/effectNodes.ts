import type { EffectEvent } from '../types';

/** Length of the generated reverb impulse: it decays to −60 dB over this time. */
const REVERB_SECONDS = 2.5;
/** ln(1000): an exponential that falls by 60 dB over the impulse. */
const DECAY_60_DB = Math.log(1000);
/** Repeats until an echo with feedback 0.55 has died away (0.55¹² ≈ −62 dB). */
const ECHO_TAIL_REPEATS = 12;
/** A "cut" effect fades out this fast at the end of the window instead of stopping dead. */
const CUT_SECONDS = 0.005;
const MAX_DELAY_SECONDS = 2;

const impulses = new WeakMap<BaseAudioContext, AudioBuffer>();

/** Stereo white noise (independent channels) under an exponential decay, generated once per context. */
function reverbImpulse(c: BaseAudioContext): AudioBuffer {
  let buffer = impulses.get(c);
  if (!buffer) {
    const length = Math.round(c.sampleRate * REVERB_SECONDS);
    buffer = c.createBuffer(2, length, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buffer.getChannelData(ch);
      for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * Math.exp((-DECAY_60_DB * i) / length);
    }
    impulses.set(c, buffer);
  }
  return buffer;
}

function tailSeconds(e: EffectEvent): number {
  if (!e.ringsOut) return CUT_SECONDS;
  if (e.kind === 'reverb') return REVERB_SECONDS;
  return e.kind === 'echo' ? ECHO_TAIL_REPEATS * e.delay : e.delay;
}

/**
 * Effect of the outgoing song: `send` takes the song after its EQ and filter, before its volume, so the
 * effect can ring on while the song fades; the return goes to `out` after the volume, like the noise.
 * Returns its nodes and the context time when its tail has died away.
 */
export function scheduleEffect(c: BaseAudioContext, e: EffectEvent, base: number, send: AudioNode, out: AudioNode): { nodes: AudioNode[]; until: number } {
  const sendGain = c.createGain();
  const ret = c.createGain();
  const nodes: AudioNode[] = [sendGain, ret];
  send.connect(sendGain);

  if (e.kind === 'reverb') {
    const convolver = c.createConvolver();
    convolver.buffer = reverbImpulse(c);
    sendGain.connect(convolver).connect(ret);
    nodes.push(convolver);
  } else {
    const delay = c.createDelay(MAX_DELAY_SECONDS);
    delay.delayTime.value = Math.min(e.delay, MAX_DELAY_SECONDS);
    const feedback = c.createGain();
    feedback.gain.value = e.feedback;
    sendGain.connect(delay).connect(ret);
    delay.connect(feedback).connect(delay);
    nodes.push(delay, feedback);
  }
  ret.connect(out);

  sendGain.gain.value = e.send[0];
  sendGain.gain.setValueCurveAtTime(e.send, base + e.time, e.duration);
  const end = base + e.time + e.duration;
  if (!e.ringsOut) {
    ret.gain.setValueAtTime(1, end);
    ret.gain.linearRampToValueAtTime(0, end + CUT_SECONDS);
  }
  return { nodes, until: end + tailSeconds(e) };
}

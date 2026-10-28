import type { AppState, BarsOption, Track, TransitionPreset, VolumeStyle } from '../types';
import { BARS_OPTIONS, PRESET_ORDER, VOLUME_STYLES } from '../types';
import {
  applyPreset,
  closeEditor,
  pairsWithDraft,
  resetToAuto,
  saveDraft,
  setVolumeStyle,
  updateDraft,
} from '../state';
import { chipLabel, PRESETS, sampleCurve, VOLUME_LABELS } from '../lib/curves';
import { barsToSeconds, playbackRateFor } from '../lib/timing';
import { formatBpm, formatDuration, formatTime, h, icon, setIcon } from './dom';
import { createBpmPopover } from './bpmPopover';
import { createMinimap, createStage } from './waveform';

export interface EditorHandlers {
  /** Starts (or restarts) the looped preview of the draft. */
  onPreview(): void;
  onStop(): void;
  /** Called after the dialog closed, with the pair it was editing. */
  onClosed(pairIndex: number): void;
}

export interface EditorView {
  update(state: AppState): void;
  /** Redraws only the playhead; called every animation frame while audio plays. */
  tick(mixTimeOf: (incomingId: string) => number | null): void;
}

interface Deck {
  root: HTMLElement;
  name: HTMLElement;
  point: HTMLElement;
  bpm: HTMLButtonElement;
  duration: HTMLElement;
}

function createDeck(role: 'out' | 'in'): Deck {
  const name = h('h3', { class: 'deck-name' });
  const point = h('p', { class: 'deck-point' });
  const bpm = h('button', { class: 'deck-bpm', type: 'button' });
  const duration = h('p', { class: 'deck-meta' });
  const root = h(
    'section',
    { class: `deck deck--${role}`, 'aria-label': role === 'out' ? 'Canción que sale' : 'Canción que entra' },
    h('div', { class: 'deck-main' }, name, point),
    h('div', { class: 'deck-side' }, bpm, duration),
  );
  return { root, name, point, bpm, duration };
}

export function mountEditor(dialog: HTMLDialogElement, handlers: EditorHandlers): EditorView {
  let state: AppState | null = null;
  let incomingId: string | null = null;
  let openPair: number | null = null;
  let lastSignature = '';

  // top bar
  const closeBtn = h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Cerrar editor' }, icon('remove'));
  const title = h('h2', { class: 'editor-title', id: 'editor-title' });
  const saveBtn = h('button', { class: 'save-btn', type: 'button' }, 'Guardar');
  const bar = h('header', { class: 'editor-bar' }, closeBtn, title, saveBtn);

  // overview, decks, stage
  const deckOut = createDeck('out');
  const deckIn = createDeck('in');
  const restartAfterDrag = () => {
    if (state?.playback === 'previewing') handlers.onPreview();
  };
  const setOut = (outStart: number) => updateDraft({ outStart });
  const setIn = (inStart: number) => updateDraft({ inStart });
  const miniOut = createMinimap(setOut, restartAfterDrag);
  const miniIn = createMinimap(setIn, restartAfterDrag);
  const overview = h('div', { class: 'overview', 'aria-hidden': 'true' }, miniOut.el, miniIn.el);

  const playBtn = h('button', { class: 'round-btn', type: 'button' }, icon('play'));
  const stage = createStage(playBtn, setOut, setIn, restartAfterDrag);
  const stageEmpty = h('p', { class: 'stage-empty' });

  // controls
  const bars = h('select', { class: 'pill-select', 'aria-label': 'Duración de la transición' });
  for (const b of BARS_OPTIONS) bars.append(h('option', { value: b }, `${b} ${b === 1 ? 'compás' : 'compases'}`));

  const presetButtons = new Map<TransitionPreset | 'auto', HTMLButtonElement>();
  const presets = h('div', { class: 'presets', role: 'group', 'aria-label': 'Presets' });
  for (const p of ['auto', ...PRESET_ORDER] as const) {
    const label = p === 'auto' ? 'Auto' : PRESETS[p].label;
    const b = h('button', { class: 'preset', type: 'button', 'aria-pressed': 'false' }, label);
    b.addEventListener('click', () => (p === 'auto' ? resetToAuto() : applyPreset(p)));
    presetButtons.set(p, b);
    presets.append(b);
  }

  const volume = h('select', { class: 'pill-select', id: 'editor-volume' });
  for (const v of VOLUME_STYLES) volume.append(h('option', { value: v }, VOLUME_LABELS[v]));
  const volumeLane = h('div', { class: 'lane-row' }, h('label', { class: 'lane-label', for: 'editor-volume' }, 'Volumen'), volume);

  const issues = h('ul', { class: 'issues', 'aria-live': 'polite' });

  // discard confirmation
  const keepBtn = h('button', { class: 'pill-btn', type: 'button' }, 'Seguir editando');
  const discardBtn = h('button', { class: 'danger-btn', type: 'button' }, 'Descartar');
  const confirm = h(
    'div',
    { class: 'confirm', role: 'alertdialog', 'aria-labelledby': 'confirm-title', hidden: true },
    h('div', { class: 'confirm-box' }, h('p', { class: 'confirm-title', id: 'confirm-title' }, '¿Descartar cambios?'), h('div', { class: 'confirm-actions' }, keepBtn, discardBtn)),
  );

  const popover = createBpmPopover();

  const body = h(
    'div',
    { class: 'editor-body' },
    overview,
    deckOut.root,
    stage.el,
    stageEmpty,
    deckIn.root,
    h('div', { class: 'editor-controls' }, bars),
    presets,
    volumeLane,
    issues,
  );
  dialog.setAttribute('aria-labelledby', 'editor-title');
  dialog.append(bar, body, popover.el, confirm);

  // ---------- behaviour ----------

  function requestClose() {
    if (state?.editor?.dirty) {
      confirm.hidden = false;
      keepBtn.focus();
    } else {
      closeEditor();
    }
  }

  closeBtn.addEventListener('click', requestClose);
  saveBtn.addEventListener('click', saveDraft);
  keepBtn.addEventListener('click', () => {
    confirm.hidden = true;
    closeBtn.focus();
  });
  discardBtn.addEventListener('click', () => {
    confirm.hidden = true;
    closeEditor();
  });
  dialog.addEventListener('cancel', (e) => {
    e.preventDefault();
    if (popover.isOpen()) popover.close();
    else if (!confirm.hidden) confirm.hidden = true;
    else requestClose();
  });

  bars.addEventListener('change', () => updateDraft({ bars: Number(bars.value) as BarsOption }));
  volume.addEventListener('change', () => setVolumeStyle(volume.value as VolumeStyle));
  playBtn.addEventListener('click', () => (state?.playback === 'previewing' ? handlers.onStop() : handlers.onPreview()));
  for (const deck of [deckOut, deckIn]) {
    deck.bpm.addEventListener('click', () => {
      const id = deck.bpm.dataset.track;
      if (id) popover.open(id, deck.bpm);
    });
  }

  function fillDeck(deck: Deck, track: Track, point: string) {
    deck.name.textContent = track.name;
    deck.point.textContent = point;
    deck.point.hidden = !point;
    deck.bpm.dataset.track = track.id;
    deck.bpm.textContent = track.bpm !== null ? `${formatBpm(track.bpm)} bpm` : 'BPM requerido';
    deck.bpm.classList.toggle('is-missing', track.bpm === null);
    deck.bpm.setAttribute('aria-label', `Editar BPM de ${track.name}: ${deck.bpm.textContent}`);
    deck.duration.textContent = formatDuration(track.duration);
  }

  return {
    update(next) {
      state = next;
      const editor = next.editor;

      if (!editor) {
        incomingId = null;
        lastSignature = '';
        popover.close();
        confirm.hidden = true;
        if (dialog.open) {
          dialog.close();
          const pair = openPair;
          // Audio and focus changes update state; run them after this render finishes.
          if (pair !== null) queueMicrotask(() => handlers.onClosed(pair));
        }
        openPair = null;
        return;
      }

      const justOpened = !dialog.open;
      if (justOpened) dialog.showModal();
      openPair = editor.pairIndex;

      const { tracks, pairs, validations } = pairsWithDraft(next);
      const from = tracks[editor.pairIndex];
      const to = tracks[editor.pairIndex + 1];
      const validation = validations[editor.pairIndex];
      const t = editor.draft;
      incomingId = to.id;

      title.textContent = `Transición ${editor.pairIndex + 1} de ${pairs.length}`;
      saveBtn.disabled = false;

      // presets: Auto, the matching preset, or none when Custom
      const label = chipLabel(t);
      for (const [p, b] of presetButtons) {
        const active = p === 'auto' ? label === 'Auto' : label === PRESETS[p].label;
        b.setAttribute('aria-pressed', String(active));
      }
      bars.value = String(t.bars);
      volume.value = t.volume;

      issues.replaceChildren(
        ...validation.errors.map((e) => h('li', { class: 'issue issue--error' }, e.message)),
        ...validation.warnings.map((w) => h('li', { class: 'issue issue--warning' }, w.message)),
      );

      const previewing = next.playback === 'previewing';
      if (!previewing) stage.setPlayhead(null);
      playBtn.disabled = !previewing && !validation.ok;
      setIcon(playBtn, previewing ? 'stop' : 'play');
      playBtn.setAttribute('aria-label', previewing ? 'Detener' : 'Reproducir transición');
      playBtn.title = playBtn.getAttribute('aria-label')!;

      const drawable = from.bpm !== null && to.bpm !== null && from.peaks && to.peaks;
      if (!drawable) {
        fillDeck(deckOut, from, '');
        fillDeck(deckIn, to, '');
        const missing = [from, to].filter((x) => x.bpm === null).map((x) => x.name);
        stageEmpty.textContent = `Toca el BPM de ${missing.join(' y ')} para escribirlo y ver la transición.`;
        stageEmpty.hidden = false;
        stage.el.hidden = true;
        overview.hidden = true;
        stage.draw(null);
      } else {
        const d = barsToSeconds(t.bars, from.bpm!);
        const r = playbackRateFor(from.bpm!, to.bpm!);
        const gains = sampleCurve(t.volume);
        fillDeck(deckOut, from, `Sale en ${formatTime(t.outStart)}`);
        fillDeck(deckIn, to, `Entra en ${formatTime(t.inStart)}, a ${r.toFixed(3)}× durante la transición`);
        stageEmpty.hidden = true;
        stage.el.hidden = false;
        overview.hidden = false;
        const stageFrom = { name: from.name, peaks: from.peaks!, duration: from.duration, bpm: from.bpm!, firstBeatOffset: from.firstBeatOffset };
        const stageTo = { name: to.name, peaks: to.peaks!, duration: to.duration, bpm: to.bpm!, firstBeatOffset: to.firstBeatOffset };
        stage.draw({ from: stageFrom, to: stageTo, outStart: t.outStart, inStart: t.inStart, d, r, gainOut: gains.out, gainIn: gains.in });
        miniOut.draw({ ...stageFrom, windowStart: t.outStart, windowLength: d });
        miniIn.draw({ ...stageTo, windowStart: t.inStart, windowLength: d * r });
      }

      // autoplay on open; restart the loop when the draft (or the tracks' tempo) changes
      const signature = JSON.stringify([t, from.bpm, from.firstBeatOffset, to.bpm, to.firstBeatOffset]);
      const changed = signature !== lastSignature;
      lastSignature = signature;
      if (justOpened) {
        if (validation.ok) queueMicrotask(handlers.onPreview);
      } else if (changed && previewing && !stage.isDragging() && !miniOut.isDragging() && !miniIn.isDragging()) {
        queueMicrotask(validation.ok ? handlers.onPreview : handlers.onStop);
      }
    },

    tick(mixTimeOf) {
      stage.setPlayhead(incomingId ? mixTimeOf(incomingId) : null);
    },
  };
}

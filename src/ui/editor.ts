import type { AppState, BarsOption, Track, TransitionPreset, VolumeStyle } from '../types';
import { BARS_OPTIONS, PRESET_ORDER, VOLUME_STYLES } from '../types';
import {
  applyPreset,
  beginGesture,
  closeEditor,
  editableCurves,
  endGesture,
  goToPair,
  pairsWithDraft,
  redo,
  resetCurve,
  resetToAuto,
  saveDraft,
  setVolumeStyle,
  toggleCustomize,
  undo,
  updateCustomCurve,
  updateDraft,
} from '../state';
import { chipLabel, PRESETS, VOLUME_LABELS, volumeSamples } from '../lib/curves';
import type { PairValidation } from '../lib/validation';
import { barsToSeconds, playbackRateFor } from '../lib/timing';
import { formatBpm, formatDuration, formatTime, h, icon, setIcon } from './dom';
import { createBpmPopover } from './bpmPopover';
import { createCurveEditor } from './curveEditor';
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
  let pairCount = 0;
  let limitShown = false;
  let validation: PairValidation | null = null;
  /** What the confirmation box is asking about: closing the editor or moving to another pair. */
  let confirmTarget: { kind: 'close' } | { kind: 'navigate'; pairIndex: number } = { kind: 'close' };

  // top bar
  const closeBtn = h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Cerrar editor' }, icon('remove'));
  const undoBtn = h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Deshacer', title: 'Deshacer' }, icon('undo'));
  const redoBtn = h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Rehacer', title: 'Rehacer' }, icon('redo'));
  const prevBtn = h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Transición anterior', title: 'Transición anterior' }, icon('prev'));
  const nextBtn = h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Transición siguiente', title: 'Transición siguiente' }, icon('next'));
  const title = h('h2', { class: 'editor-title', id: 'editor-title' });
  const saveBtn = h('button', { class: 'save-btn', type: 'button' }, 'Guardar');
  const bar = h(
    'header',
    { class: 'editor-bar' },
    h('div', { class: 'editor-bar-start' }, closeBtn, undoBtn, redoBtn),
    h('div', { class: 'editor-nav' }, prevBtn, title, nextBtn),
    saveBtn,
  );

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
  const customOption = h('option', { value: 'custom', disabled: true }, 'Personalizada');
  volume.append(customOption);
  const customizeBtn = h('button', { class: 'pill-btn customize-btn', type: 'button', 'aria-pressed': 'false' }, 'Personalizar');
  const resetCurveBtn = h('button', { class: 'pill-btn', type: 'button' }, 'Restablecer curva');
  const volumeLane = h(
    'div',
    { class: 'lane-row' },
    h('label', { class: 'lane-label', for: 'editor-volume' }, 'Volumen'),
    h('div', { class: 'lane-actions' }, volume, customizeBtn, resetCurveBtn),
  );

  const issues = h('ul', { class: 'issues', 'aria-live': 'polite' });

  // confirmation (close with changes, or move to another pair with changes)
  const confirmTitle = h('p', { class: 'confirm-title', id: 'confirm-title' });
  const keepBtn = h('button', { class: 'pill-btn', type: 'button' }, 'Seguir editando');
  const discardBtn = h('button', { class: 'danger-btn', type: 'button' }, 'Descartar');
  const confirmSaveBtn = h('button', { class: 'save-btn', type: 'button' }, 'Guardar');
  const confirm = h(
    'div',
    { class: 'confirm', role: 'alertdialog', 'aria-labelledby': 'confirm-title', hidden: true },
    h('div', { class: 'confirm-box' }, confirmTitle, h('div', { class: 'confirm-actions' }, keepBtn, discardBtn, confirmSaveBtn)),
  );

  const popover = createBpmPopover();

  const curveEditor = createCurveEditor(stage, {
    onChange: updateCustomCurve,
    onGestureStart: beginGesture,
    onGestureEnd: () => {
      endGesture();
      restartAfterDrag();
    },
    onLimit: () => {
      limitShown = true;
      renderIssues();
    },
  });

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

  function askConfirm(target: typeof confirmTarget) {
    confirmTarget = target;
    const navigating = target.kind === 'navigate';
    confirmTitle.textContent = navigating ? '¿Guardar cambios antes de cambiar de transición?' : '¿Descartar cambios?';
    confirmSaveBtn.hidden = !navigating;
    confirm.hidden = false;
    (navigating ? confirmSaveBtn : keepBtn).focus();
  }

  function requestClose() {
    if (state?.editor?.dirty) askConfirm({ kind: 'close' });
    else closeEditor();
  }

  function requestPair(pairIndex: number) {
    const editor = state?.editor;
    if (!editor || pairIndex < 0 || pairIndex >= pairCount || pairIndex === editor.pairIndex) return;
    if (editor.dirty) askConfirm({ kind: 'navigate', pairIndex });
    else goToPair(pairIndex, false);
  }

  closeBtn.addEventListener('click', requestClose);
  saveBtn.addEventListener('click', saveDraft);
  undoBtn.addEventListener('click', undo);
  redoBtn.addEventListener('click', redo);
  prevBtn.addEventListener('click', () => state?.editor && requestPair(state.editor.pairIndex - 1));
  nextBtn.addEventListener('click', () => state?.editor && requestPair(state.editor.pairIndex + 1));
  customizeBtn.addEventListener('click', toggleCustomize);
  resetCurveBtn.addEventListener('click', resetCurve);
  keepBtn.addEventListener('click', () => {
    confirm.hidden = true;
    closeBtn.focus();
  });
  discardBtn.addEventListener('click', () => {
    confirm.hidden = true;
    if (confirmTarget.kind === 'navigate') goToPair(confirmTarget.pairIndex, false);
    else closeEditor();
  });
  confirmSaveBtn.addEventListener('click', () => {
    confirm.hidden = true;
    if (confirmTarget.kind === 'navigate') goToPair(confirmTarget.pairIndex, true);
  });

  // Shortcuts: undo/redo and [ ] between pairs. Never while typing in a field.
  dialog.addEventListener('keydown', (e) => {
    const target = e.target as HTMLElement;
    if (target.closest('input, select, textarea') || !confirm.hidden || !state?.editor) return;
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === 'z') {
      if (e.shiftKey) redo();
      else undo();
    } else if (!mod && e.key === '[') {
      requestPair(state.editor.pairIndex - 1);
    } else if (!mod && e.key === ']') {
      requestPair(state.editor.pairIndex + 1);
    } else {
      return;
    }
    e.preventDefault();
  });

  function renderIssues() {
    if (!validation) return;
    issues.replaceChildren(
      ...validation.errors.map((e) => h('li', { class: 'issue issue--error' }, e.message)),
      ...validation.warnings.map((w) => h('li', { class: 'issue issue--warning' }, w.message)),
      ...(limitShown ? [h('li', { class: 'issue issue--warning' }, 'Máximo 32 puntos por curva')] : []),
    );
  }
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
        limitShown = false;
        curveEditor.update(null, false);
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
      // Opening the editor or moving to another pair both start the preview of the new pair.
      const pairChanged = justOpened || openPair !== editor.pairIndex;
      openPair = editor.pairIndex;

      const { tracks, pairs, validations } = pairsWithDraft(next);
      const from = tracks[editor.pairIndex];
      const to = tracks[editor.pairIndex + 1];
      validation = validations[editor.pairIndex];
      const t = editor.draft;
      incomingId = to.id;
      pairCount = pairs.length;

      title.textContent = `Transición ${editor.pairIndex + 1} de ${pairs.length}`;
      saveBtn.disabled = false;
      prevBtn.disabled = editor.pairIndex === 0;
      nextBtn.disabled = editor.pairIndex >= pairs.length - 1;
      undoBtn.disabled = editor.past.length === 0;
      redoBtn.disabled = editor.future.length === 0;

      // presets: Auto, the matching preset, or none when Custom
      const label = chipLabel(t);
      for (const [p, b] of presetButtons) {
        const active = p === 'auto' ? label === 'Auto' : label === PRESETS[p].label;
        b.setAttribute('aria-pressed', String(active));
      }
      bars.value = String(t.bars);
      volume.value = t.customVolume ? 'custom' : t.volume;
      customOption.hidden = !t.customVolume;
      customizeBtn.textContent = editor.customizing ? 'Listo' : 'Personalizar';
      customizeBtn.setAttribute('aria-pressed', String(editor.customizing));
      resetCurveBtn.hidden = !editor.customizing;
      resetCurveBtn.disabled = !t.customVolume;

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
        curveEditor.update(null, false);
      } else {
        const d = barsToSeconds(t.bars, from.bpm!);
        const r = playbackRateFor(from.bpm!, to.bpm!);
        const gains = volumeSamples(t);
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
        stage.setCustomizing(editor.customizing);
        overview.classList.toggle('is-locked', editor.customizing);
        curveEditor.update({ curves: editableCurves(t), bars: t.bars, d }, editor.customizing);
      }

      // autoplay on open / pair change; restart the loop when the draft (or the tracks' tempo) changes
      const signature = JSON.stringify([editor.pairIndex, t, from.bpm, from.firstBeatOffset, to.bpm, to.firstBeatOffset]);
      const changed = signature !== lastSignature;
      lastSignature = signature;
      if (changed) limitShown = false;
      renderIssues();
      const dragging = stage.isDragging() || miniOut.isDragging() || miniIn.isDragging() || curveEditor.isDragging();
      if (pairChanged) {
        // An invalid pair never autoplays; when moving between pairs, the previous preview stops.
        if (validation.ok) queueMicrotask(handlers.onPreview);
        else if (!justOpened) queueMicrotask(handlers.onStop);
      } else if (changed && previewing && !dragging) {
        queueMicrotask(validation.ok ? handlers.onPreview : handlers.onStop);
      }
    },

    tick(mixTimeOf) {
      stage.setPlayhead(incomingId ? mixTimeOf(incomingId) : null);
    },
  };
}

import type { AppState, BarsOption, EditLane, EffectStyle, EqStyle, FilterStyle, LoopStyle, Track, TransitionPreset, VolumeStyle } from '../types';
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
  setEffectStyle,
  setEqStyle,
  setFilterStyle,
  setLoopStyle,
  setVolumeStyle,
  toggleCustomize,
  undo,
  updateCustomCurve,
  updateDraft,
} from '../state';
import { chipLabel, PRESETS, VOLUME_LABELS } from '../lib/curves';
import { EFFECT_LABELS, EFFECT_STYLES, LOOP_LABELS, LOOP_STYLES, loopJumps } from '../lib/effects';
import { EQ_LABELS, EQ_STYLES, FILTER_LABELS, FILTER_STYLES, filterShape, laneLines, laneScale } from '../lib/lanes';
import type { PairValidation } from '../lib/validation';
import { barsToSeconds, playbackRateFor } from '../lib/timing';
import { formatBpm, formatDuration, formatTime, h, icon, setIcon } from './dom';
import { createBpmPopover } from './bpmPopover';
import { createCurveEditor } from './curveEditor';
import { createMinimap, createStage } from './waveform';
import { FADE, SPRING, animate, prefersReducedMotion, pressFeedback, slideIn, slideOut } from './motion';
import { createSheet } from './sheet';

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

const EDIT_LANES: EditLane[] = ['volume', 'eq', 'filter', 'effect'];

const LANE_NAMES: Record<EditLane, string> = { volume: 'Volumen', eq: 'EQ', filter: 'Filtro', effect: 'Efectos' };

interface LaneRow {
  el: HTMLElement;
  select: HTMLSelectElement;
  customOption: HTMLOptionElement;
  customizeBtn: HTMLButtonElement;
}

/** A row of the settings card: the label on top (with an optional action) and the control below. */
function settingRow(id: string, label: string, control: HTMLElement, action?: HTMLElement, lane?: string): HTMLElement {
  return h(
    'div',
    { class: 'setting', 'data-lane': lane },
    h('label', { class: 'setting-label', for: id }, label),
    ...(action ? [action] : []),
    control,
  );
}

/** One lane of the editor: its style select and "Personalizar" / "Listo". */
function createLaneRow(lane: EditLane, options: [string, string][], onStyle: (value: string) => void): LaneRow {
  const id = `editor-${lane}`;
  const select = h('select', { class: 'pill-select', id });
  for (const [value, text] of options) select.append(h('option', { value }, text));
  const customOption = h('option', { value: 'custom', disabled: true }, 'Personalizada');
  select.append(customOption);
  const customizeBtn = h(
    'button',
    { class: 'text-btn customize-btn', type: 'button', 'aria-pressed': 'false', 'aria-label': `Personalizar ${LANE_NAMES[lane]}` },
    'Personalizar',
  );
  select.addEventListener('change', () => onStyle(select.value));
  customizeBtn.addEventListener('click', () => toggleCustomize(lane));
  return { el: settingRow(id, LANE_NAMES[lane], select, customizeBtn, lane), select, customOption, customizeBtn };
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
  // showModal() focuses [autofocus]: the title, so no button opens with a focus ring
  const title = h('h2', { class: 'editor-title', id: 'editor-title', tabindex: -1, autofocus: true });
  const saveBtn = h('button', { class: 'save-btn', type: 'button' }, 'Guardar');
  const bar = h(
    'header',
    { class: 'editor-bar' },
    h('div', { class: 'editor-bar-row' }, closeBtn, title, saveBtn),
    h(
      'div',
      { class: 'editor-toolbar' },
      h('div', { class: 'toolbar-group' }, undoBtn, redoBtn),
      h('div', { class: 'toolbar-group' }, prevBtn, nextBtn),
    ),
  );
  const grabber = h('div', { class: 'sheet-grabber', 'aria-hidden': 'true' });

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
  const stageEmptyText = h('p', { class: 'stage-empty-text' });
  const stageEmptyBtn = h('button', { class: 'primary-btn', type: 'button' }, 'Escribir BPM');
  const stageEmpty = h('div', { class: 'stage-empty' }, stageEmptyText, stageEmptyBtn);

  // controls
  const bars = h('select', { class: 'pill-select', id: 'editor-bars' });
  for (const b of BARS_OPTIONS) bars.append(h('option', { value: b }, `${b} ${b === 1 ? 'compás' : 'compases'}`));

  const presetButtons = new Map<TransitionPreset | 'auto', HTMLButtonElement>();
  const presets = h('div', { class: 'presets', role: 'group', 'aria-labelledby': 'presets-title' });
  for (const p of ['auto', ...PRESET_ORDER] as const) {
    const label = p === 'auto' ? 'Auto' : PRESETS[p].label;
    const b = h('button', { class: 'preset', type: 'button', 'aria-pressed': 'false' }, label);
    b.addEventListener('click', () => (p === 'auto' ? resetToAuto() : applyPreset(p)));
    presetButtons.set(p, b);
    presets.append(b);
  }

  const rows: Record<EditLane, LaneRow> = {
    volume: createLaneRow('volume', VOLUME_STYLES.map((v) => [v, VOLUME_LABELS[v]]), (v) => setVolumeStyle(v as VolumeStyle)),
    eq: createLaneRow('eq', EQ_STYLES.map((v) => [v, EQ_LABELS[v]]), (v) => setEqStyle(v as EqStyle)),
    filter: createLaneRow('filter', FILTER_STYLES.map((v) => [v, FILTER_LABELS[v]]), (v) => setFilterStyle(v as FilterStyle)),
    effect: createLaneRow('effect', EFFECT_STYLES.map((v) => [v, EFFECT_LABELS[v]]), (v) => setEffectStyle(v as EffectStyle)),
  };

  // Looping has no curve, so its row is just the select.
  const loopSelect = h('select', { class: 'pill-select', id: 'editor-looping' });
  for (const v of LOOP_STYLES) loopSelect.append(h('option', { value: v }, LOOP_LABELS[v]));
  loopSelect.addEventListener('change', () => setLoopStyle(loopSelect.value as LoopStyle));

  const settings = h(
    'div',
    { class: 'settings-card' },
    settingRow('editor-bars', 'Duración', bars),
    rows.volume.el,
    rows.eq.el,
    rows.filter.el,
    rows.effect.el,
    settingRow('editor-looping', 'Looping', loopSelect, undefined, 'looping'),
  );

  // "Personalizar" mode: what is being edited, how, and the way out, right under the waveforms
  const editTitle = h('p', { class: 'edit-title' });
  const resetBtn = h('button', { class: 'pill-btn', type: 'button' }, 'Restablecer curva');
  const doneBtn = h('button', { class: 'save-btn', type: 'button' }, 'Listo');
  const editBar = h(
    'div',
    { class: 'edit-bar', hidden: true },
    h('span', { class: 'edit-dot', 'aria-hidden': 'true' }),
    h(
      'div',
      { class: 'edit-info' },
      editTitle,
      h('p', { class: 'edit-hint' }, 'Arrastra los puntos. Doble toque para añadir o quitar uno.'),
    ),
    h('div', { class: 'edit-actions' }, resetBtn, doneBtn),
  );

  const issues = h('ul', { class: 'issues', 'aria-live': 'polite' });

  // confirmation (close with changes, or move to another pair with changes): an iOS action sheet
  const confirmTitle = h('p', { class: 'action-title', id: 'confirm-title' });
  const keepBtn = h('button', { class: 'action action--cancel', type: 'button' }, 'Seguir editando');
  const discardBtn = h('button', { class: 'action action--danger', type: 'button' }, 'Descartar');
  const confirmSaveBtn = h('button', { class: 'action', type: 'button' }, 'Guardar');
  const actionSheet = h(
    'div',
    { class: 'action-sheet' },
    h('div', { class: 'action-group' }, confirmTitle, confirmSaveBtn, discardBtn),
    h('div', { class: 'action-group' }, keepBtn),
  );
  const confirm = h('div', { class: 'confirm', role: 'alertdialog', 'aria-labelledby': 'confirm-title', hidden: true }, actionSheet);

  const popover = createBpmPopover();

  const curveEditor = createCurveEditor(stage, {
    onChange: (side, curve) => {
      const lane = state?.editor?.customizing;
      if (lane) updateCustomCurve(lane, side, curve);
    },
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
    editBar,
    issues,
    h('section', { class: 'editor-section', 'aria-labelledby': 'presets-title' }, h('h3', { class: 'section-title', id: 'presets-title' }, 'Preset'), presets),
    h('section', { class: 'editor-section', 'aria-labelledby': 'settings-title' }, h('h3', { class: 'section-title', id: 'settings-title' }, 'Ajustes'), settings),
  );
  dialog.setAttribute('aria-labelledby', 'editor-title');
  const backdrop = h('div', { class: 'sheet-backdrop' });
  const panel = h('div', { class: 'sheet-panel' }, grabber, bar, body, popover.el, confirm);
  dialog.append(backdrop, panel);
  pressFeedback([...panel.querySelectorAll('button:not(.nudge)')]);

  const sheet = createSheet(dialog, {
    panel,
    backdrop,
    body,
    handles: [grabber, bar],
    isDirty: () => !!state?.editor?.dirty,
    onDragClose: () => closeEditor(),
    onDragConfirm: () => askConfirm({ kind: 'close' }),
  });

  let sliding = false;
  /** Pair the slide in flight will land on; taps during the slide move it further. */
  let slideTarget = 0;
  let slideSave = false;

  /** The pair on screen, or the one a running slide is heading to. */
  const currentPair = () => (sliding ? slideTarget : state?.editor?.pairIndex ?? 0);

  /** Moves to another pair: the content leaves towards one side and the new pair enters from the other. */
  function navigate(pairIndex: number, save: boolean) {
    slideTarget = pairIndex;
    if (sliding) return;
    slideSave = save;
    const dir = Math.sign(pairIndex - (state?.editor?.pairIndex ?? pairIndex)) || 1;
    sliding = true;
    void slideOut(body, dir).then(() => {
      sliding = false;
      goToPair(slideTarget, slideSave);
      slideIn(body, dir);
    });
  }

  // ---------- behaviour ----------

  function askConfirm(target: typeof confirmTarget) {
    confirmTarget = target;
    const navigating = target.kind === 'navigate';
    confirmTitle.textContent = navigating ? '¿Guardar cambios antes de cambiar de transición?' : '¿Descartar cambios?';
    confirmSaveBtn.hidden = !navigating;
    const wasHidden = confirm.hidden;
    confirm.hidden = false;
    if (wasHidden) {
      animate(confirm, { opacity: [0, 1] }, { duration: 200, ease: 'easeOut' });
      if (prefersReducedMotion()) animate(actionSheet, { opacity: [0, 1] }, FADE);
      else animate(actionSheet, { y: [actionSheet.offsetHeight + 24, 0] }, SPRING.sheetOpen);
    }
    (navigating ? confirmSaveBtn : keepBtn).focus();
  }

  /** Hides the action sheet; `then` runs once it is out of the way. */
  function hideConfirm(then?: () => void) {
    if (confirm.hidden) return then?.();
    const out = prefersReducedMotion()
      ? animate(actionSheet, { opacity: 0 }, FADE)
      : animate(actionSheet, { y: actionSheet.offsetHeight + 24 }, SPRING.sheetClose);
    animate(confirm, { opacity: 0 }, { duration: 200, ease: 'easeOut' });
    void out.then(() => {
      confirm.hidden = true;
      confirm.style.opacity = '';
      actionSheet.style.opacity = '';
      then?.();
    });
  }

  function requestClose() {
    if (state?.editor?.dirty) askConfirm({ kind: 'close' });
    else closeEditor();
  }

  function requestPair(pairIndex: number) {
    const editor = state?.editor;
    if (!editor || pairIndex < 0 || pairIndex >= pairCount || pairIndex === currentPair()) return;
    // the unsaved-changes question was already answered for the slide in flight
    if (sliding) navigate(pairIndex, slideSave);
    else if (editor.dirty) askConfirm({ kind: 'navigate', pairIndex });
    else navigate(pairIndex, false);
  }

  closeBtn.addEventListener('click', requestClose);
  saveBtn.addEventListener('click', saveDraft);
  undoBtn.addEventListener('click', undo);
  redoBtn.addEventListener('click', redo);
  prevBtn.addEventListener('click', () => requestPair(currentPair() - 1));
  nextBtn.addEventListener('click', () => requestPair(currentPair() + 1));
  keepBtn.addEventListener('click', () => hideConfirm(() => title.focus()));
  // a tap on the dimmed area is "Seguir editando", like an iOS action sheet
  confirm.addEventListener('click', (e) => {
    if (e.target === confirm) hideConfirm(() => title.focus());
  });
  discardBtn.addEventListener('click', () => {
    const target = confirmTarget;
    hideConfirm();
    if (target.kind === 'navigate') navigate(target.pairIndex, false);
    else closeEditor();
  });
  confirmSaveBtn.addEventListener('click', () => {
    const target = confirmTarget;
    hideConfirm();
    if (target.kind === 'navigate') navigate(target.pairIndex, true);
  });
  resetBtn.addEventListener('click', () => {
    const lane = state?.editor?.customizing;
    if (lane) resetCurve(lane);
  });
  doneBtn.addEventListener('click', () => {
    const lane = state?.editor?.customizing;
    if (lane) toggleCustomize(lane);
  });
  stageEmptyBtn.addEventListener('click', () => {
    const missing = [deckOut, deckIn].find((d) => d.bpm.classList.contains('is-missing'));
    const id = missing?.bpm.dataset.track;
    if (missing && id) popover.open(id, missing.bpm);
  });
  // the popover is anchored to a BPM that scrolls with the body
  body.addEventListener('scroll', () => popover.close(), { passive: true });

  // Shortcuts: undo/redo and [ ] between pairs. Never while typing in a field.
  dialog.addEventListener('keydown', (e) => {
    const target = e.target as HTMLElement;
    if (target.closest('input, select, textarea') || !confirm.hidden || !state?.editor) return;
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === 'z') {
      if (e.shiftKey) redo();
      else undo();
    } else if (!mod && e.key === '[') {
      requestPair(currentPair() - 1);
    } else if (!mod && e.key === ']') {
      requestPair(currentPair() + 1);
    } else {
      return;
    }
    e.preventDefault();
  });

  function renderIssues() {
    if (!validation) return;
    const item = (kind: 'error' | 'warning', text: string) => h('li', { class: `issue issue--${kind}` }, icon('warning'), h('span', {}, text));
    issues.replaceChildren(
      ...validation.errors.map((e) => item('error', e.message)),
      ...validation.warnings.map((w) => item('warning', w.message)),
      ...(limitShown ? [item('warning', 'Máximo 32 puntos por curva')] : []),
    );
  }
  dialog.addEventListener('cancel', (e) => {
    e.preventDefault();
    if (popover.isOpen()) popover.close();
    else if (!confirm.hidden) hideConfirm(() => title.focus());
    else requestClose();
  });

  bars.addEventListener('change', () => updateDraft({ bars: Number(bars.value) as BarsOption }));
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
        if (dialog.open && !sheet.isClosing()) {
          const pair = openPair;
          // Audio and focus changes update state; run them after this render finishes.
          if (next.playback === 'previewing') queueMicrotask(handlers.onStop);
          void sheet.close().then((closed) => {
            if (closed && pair !== null) handlers.onClosed(pair);
          });
        }
        openPair = null;
        return;
      }

      const justOpened = !dialog.open || sheet.isClosing();
      if (justOpened) {
        sheet.open();
        body.scrollTop = 0;
      }
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
      const styles: Record<EditLane, string> = { volume: t.volume, eq: t.eq, filter: t.filter, effect: t.effect };
      const customs: Record<EditLane, unknown> = { volume: t.customVolume, eq: t.customEq, filter: t.customFilter, effect: t.customEffect };
      for (const lane of EDIT_LANES) {
        const row = rows[lane];
        const custom = customs[lane] !== null;
        const editing = editor.customizing === lane;
        row.select.value = custom ? 'custom' : styles[lane];
        row.customOption.hidden = !custom;
        row.customizeBtn.textContent = editing ? 'Listo' : 'Personalizar';
        row.customizeBtn.setAttribute('aria-pressed', String(editing));
        row.el.classList.toggle('is-editing', editing);
      }
      const editing = editor.customizing;
      if (editing) {
        editTitle.textContent = `Editando ${LANE_NAMES[editing]}`;
        editBar.dataset.lane = editing;
        resetBtn.disabled = customs[editing] === null;
      }
      loopSelect.value = t.looping;

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
        stageEmptyText.textContent = `Toca el BPM de ${missing.join(' y ')} para escribirlo y ver la transición.`;
        stageEmptyBtn.hidden = missing.length === 0;
        stageEmpty.hidden = false;
        editBar.hidden = true;
        stage.el.hidden = true;
        overview.hidden = true;
        stage.draw(null);
        curveEditor.update(null, false);
      } else {
        const d = barsToSeconds(t.bars, from.bpm!);
        const r = playbackRateFor(from.bpm!, to.bpm!);
        const lines = laneLines(t);
        fillDeck(deckOut, from, `Sale en ${formatTime(t.outStart)}`);
        fillDeck(deckIn, to, `Entra en ${formatTime(t.inStart)}, a ${r.toFixed(3)}× durante la transición`);
        stageEmpty.hidden = true;
        stage.el.hidden = false;
        overview.hidden = false;
        const stageFrom = { name: from.name, peaks: from.peaks!, duration: from.duration, bpm: from.bpm!, firstBeatOffset: from.firstBeatOffset };
        const stageTo = { name: to.name, peaks: to.peaks!, duration: to.duration, bpm: to.bpm!, firstBeatOffset: to.firstBeatOffset };
        const jumps = loopJumps(t, from.bpm!);
        const loop = jumps.length > 0 ? { audioStart: t.outStart, jumps } : null;
        stage.draw({ from: stageFrom, to: stageTo, outStart: t.outStart, inStart: t.inStart, d, r, linesOut: lines.out, linesIn: lines.in, loop });
        miniOut.draw({ ...stageFrom, windowStart: t.outStart, windowLength: d });
        miniIn.draw({ ...stageTo, windowStart: t.inStart, windowLength: d * r });
        stage.setCustomizing(editor.customizing);
        overview.classList.toggle('is-locked', editor.customizing !== null);
        const showEdit = editor.customizing !== null;
        if (showEdit && editBar.hidden) {
          editBar.hidden = false;
          if (prefersReducedMotion()) animate(editBar, { opacity: [0, 1] }, FADE);
          else animate(editBar, { opacity: [0, 1], y: [-8, 0] }, SPRING.rowEnter);
        } else if (!showEdit) {
          editBar.hidden = true;
        }
        const lane = editor.customizing ?? 'volume';
        const shape = filterShape(t.filter);
        const scales = {
          out: laneScale(lane, shape.out?.kind ?? null),
          in: laneScale(lane, shape.in?.kind ?? null),
        };
        curveEditor.update({ lane, curves: editableCurves(t, lane), scales, bars: t.bars, d }, editor.customizing !== null);
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

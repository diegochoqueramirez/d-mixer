# SPEC 01 — Mezclador de playlist con editor de transiciones estilo Spotify Mix

> **Estado:** Implementado
> **Depende de:** —
> **Fecha:** 2026-10-28
> **Objetivo:** Una web que reproduce el formato y el flujo del editor de transiciones de Spotify Mix sobre una playlist de canciones locales, con BPM, puntos, compases y estilo de volumen editables por transición.

---

## Por qué existe esta spec

Spotify Mix (beta de Premium) convierte una playlist en una mezcla continua. Entre cada par de canciones hay una transición. Por defecto es "Auto", y se puede personalizar en un editor con dos ondas alineadas, presets y carriles de Volumen/EQ/Filtro/Efectos.

Queremos esa misma experiencia sobre archivos locales. Spotify no expone el audio crudo por API.

Regla de marca: **copiamos el formato y el flujo, no la identidad.** Nada de logo, nombre, iconos ni tipografía de Spotify. La app se llama "mixer".

Referencias usadas para describir Spotify Mix:

- [Spotify Support — Mixed Playlists](https://support.spotify.com/us/article/mixed-playlists/)
- [Spotify Newsroom — Mix your favorite playlists](https://newsroom.spotify.com/2025-08-19/mix-your-favorite-playlists-seamlessly-by-adding-your-own-transitions/)
- [Spotify Newsroom — Smart Reorder](https://newsroom.spotify.com/2026-02-25/smart-reorder-playlist-mixing/)
- [Engadget — How to use Spotify Mix](https://www.engadget.com/2216279/how-to-use-spotify-mix-tool/)
- [Make Tech Easier — Spotify Mix](https://maketecheasier.com/spotify-mix-dj-for-playlists/)
- [Johannes Giani — Custom song transitions with Spotify Mix](https://www.johannesgiani.de/en/blog/custom-song-transitions-with-spotify-mix/)
- [AbsoluteGeeks — review](https://www.absolutegeeks.com/reviews/i-turned-my-spotify-playlists-into-seamless-dj-sets-with-one-feature/)
- [vimj — reconstrucción de terceros de estilos y presets](https://github.com/lorenzolfm/vimj)

### Cómo funciona Spotify Mix (resumen)

- **Playlist en modo Mix:** cada fila muestra BPM y tonalidad Camelot. Entre canciones hay un chip de transición ("Auto", nombre del preset o "Custom"). La última canción no tiene transición. El toggle **Mix** apaga las transiciones sin borrarlas. **Smart Reorder** ordena por BPM y tonalidad.
- **Editor** (sube como hoja al tocar el chip):
  - **Barra superior:** X (descartar, con confirmación) y Save.
  - **Overview:** las dos canciones completas.
  - **Ondas:** la saliente arriba y la entrante abajo, con zoom en la mezcla, marcas de beat y líneas de color con las curvas.
  - **Botón central ▶/■:** reproduce la transición en bucle. Al abrir el editor ya suena.
  - **Posición:** las ondas se arrastran con snap al beat. Las flechas de nudge mueven ±10 ms.
  - **Duración:** píldora "N bars ⌄", 8 por defecto.
  - **Tempo:** la entrante se ajusta al tempo de la saliente y luego vuelve al suyo, conservando la tonalidad (key lock).
- **Presets:** Auto, Fade, Rise, Blend, Wave, Melt, Slam, Dissolve, Surge, Afterglow.
  - Un preset fija todos los carriles a la vez.
  - Cambiar de preset conserva la posición y la duración.
  - Una edición manual convierte la transición en "Custom".
- **Carriles:** Volumen (8 estilos), EQ (9), Filtro (11), Efectos (12) y Looping. Con **Customize** se dibujan las curvas por puntos.

### Spotify Mix → dónde se implementa

| Funcionalidad de Spotify Mix | Spec |
| --- | --- |
| Playlist con chips, toggle Mix, editor (diálogo/hoja), overview, ondas alineadas, snap, nudge ±10 ms, compases, presets, carril Volumen, Auto/Custom, Guardar/Descartar, preview en bucle, sync de tempo | **01 (esta)** |
| Customize (curvas por puntos) | 02 |
| Exportar la mezcla a WAV/MP3 | 03 |
| Carriles EQ y Filtro + presets Wave, Melt y receta completa de Rise | 04 |
| Carril Efectos (reverb/delay/echo) y Looping + presets Dissolve, Surge, Afterglow | 05 |
| Tonalidad Camelot, Smart Reorder, carátulas | 06 |
| Key lock (time-stretch que conserva el tono) | 07 |
| Proyectos guardables (retomar donde lo dejaste) | 08 |

Las SPEC 02–08 son futuras. Todavía no existen como archivos.

---

## Alcance

**Entra:**

**Base técnica:**

- App web con Vite + TypeScript (sin framework de UI) y Web Audio API.
- Cargar canciones desde archivos locales (selector múltiple y drag & drop). Formatos: los que decodifique el navegador (`decodeAudioData`), como mínimo MP3 y WAV.
- Detección automática de BPM y offset del primer beat con `web-audio-beat-detector`. Edición manual del BPM (campo, `×2`, `÷2`) y del primer beat.
- Sincronización de tempo: durante la transición B suena al BPM de A vía `playbackRate`. Al terminar, rampa lineal de vuelta a su velocidad natural durante la misma duración.
- Tests unitarios con Vitest para la lógica pura.
- Tema oscuro único (ver "Estilo visual").

**Pantalla playlist:**

- **Cabecera:** "mixer", toggle **Mix** (encendido por defecto) y botón "Añadir canciones".
- **Filas en orden de reproducción:** número, nombre, duración, BPM (o estado: "Leyendo archivo…", "Detectando BPM…", "BPM requerido", "No se pudo leer") y botones subir/bajar/quitar. La fila no edita el BPM.
- **Chip de transición** centrado entre cada par de filas consecutivas (sin chip después de la última). Texto:
  - "Auto" si la transición está en Auto.
  - El nombre del preset si coincide con él.
  - "Custom" en cualquier otro caso.
  - Si la transición tiene errores de validación, el texto es "Revisar" en `--danger`.
- **Toggle Mix apagado:** la playlist suena seguida, sin fundidos ni sync. Las transiciones guardadas se conservan y vuelven al encenderlo. Con Mix apagado los chips se ocultan.
- **Barra inferior fija:** "Reproducir mezcla", "Detener" y un texto de estado que explica por qué no se puede reproducir, si es el caso.

**Editor de transición** (se abre al tocar un chip):

- `<dialog>` modal: diálogo centrado de 480px en escritorio, hoja inferior por debajo de 600px de ancho.
- **Contenido de arriba abajo:**
  1. **Barra superior:** botón X, título "Transición N de M" y botón "Guardar".
  2. **Overview:** dos tiras de 28px con las canciones completas (A arriba, B abajo) y la ventana marcada. Clic o arrastre salta a ese punto.
  3. **Tarjeta de A:** nombre, duración y BPM tocable.
  4. **Vista alineada:** el final de A arriba y el inicio de B abajo, eje de tiempo común, ventana fija en el 60% central y un playhead único.
     - Las ondas se deslizan bajo la ventana con snap al beat (Shift = libre).
     - Botones de nudge ‹ › en los extremos de cada onda mueven ±0,010 s sin snap.
     - Botón ▶/■ en el centro.
  5. **Tarjeta de B:** nombre, duración, BPM tocable y "Entra en m:ss.cc, a r× durante la transición".
  6. **Píldora de compases:** 1, 2, 4, 8, 16.
  7. **Fila de presets** con scroll horizontal: **Auto**, **Fade**, **Blend**, **Rise**, **Slam**.
  8. **Carril Volumen:** select con los 8 estilos. Su curva se dibuja en amarillo sobre las ondas.
  9. **Mensajes** de validación y advertencia de tono.
- **Popover de BPM:** al tocar el BPM de una tarjeta se abre un popover con campo BPM, `×2`, `÷2` y campo "Primer beat (s)". Edita la canción directamente, no el borrador de la transición, y afecta a todas sus transiciones.
- **Borrador:**
  - El editor trabaja sobre una copia de la transición.
  - "Guardar" la aplica a la playlist y cierra.
  - X o Esc cierran directamente si no hubo cambios. Si los hubo, preguntan "¿Descartar cambios?" con "Descartar" y "Seguir editando".
  - Al cerrar, el foco vuelve al chip.
- **Preview en bucle:**
  - Al abrir el editor empieza a sonar el borrador, de τ = −2 compases a τ = D + 2 compases (compases de A), en bucle hasta pulsar ■.
  - Cualquier cambio del borrador reinicia el bucle con los nuevos valores. En el arrastre, al soltar.
  - Cerrar el editor detiene el audio.
- **Presets y Auto:**
  - Elegir un preset fija el estilo de volumen y conserva puntos y compases.
  - Cambiar el estilo de volumen a mano deja la transición en "Custom".
  - Elegir **Auto** restablece todo a la transición por defecto: puntos por defecto, 8 compases, preset Fade.
  - Mover puntos o compases quita el estado Auto, pero mantiene el nombre del preset si el volumen coincide.

**Fuera de alcance (para specs futuras):**

- Todo lo asignado a las SPEC 02–08 en la tabla de arriba: Customize, exportar, EQ, Filtro, Efectos, Looping, presets Wave/Melt/Dissolve/Surge/Afterglow, tonalidad, Smart Reorder, carátulas, key lock y proyectos guardables.
- Auto "inteligente" que elija el preset según la compatibilidad de las canciones.
- Shuffle, colaboración, compartir, Spotify Connect.
- Transición de la última canción a la primera.
- Coloreado de la onda por frecuencia.
- Zoom manual de la vista alineada, seek y pausa dentro de la reproducción.
- Tema claro o selector de tema.
- URLs remotas o integración con Spotify u otros servicios.
- Compases que no sean 4/4.
- Cualquier elemento de marca de Spotify.

---

## Modelo de datos

```ts
// src/types.ts
export type BarsOption = 1 | 2 | 4 | 8 | 16;

export type VolumeStyle =
  | 'smooth-crossfade'
  | 'crossfade'
  | 'overlap'
  | 'fade-in-fade-out'
  | 'cut-in-fade-out'
  | 'fade-in-cut-out'
  | 'center-cut'
  | 'fade-in-fast-out';

export type TransitionPreset = 'fade' | 'blend' | 'rise' | 'slam';

export type TrackStatus = 'decoding' | 'analyzing' | 'ready' | 'bpm-required' | 'error';

export interface Track {
  id: string;              // crypto.randomUUID()
  name: string;            // nombre del archivo sin extensión
  buffer: AudioBuffer | null;
  duration: number;        // segundos
  bpm: number | null;      // null => 'bpm-required'
  firstBeatOffset: number; // segundos desde el inicio hasta el primer beat
  peaks: Float32Array | null;
  status: TrackStatus;
  error?: string;
}

export interface Transition {
  fromId: string;
  toId: string;
  outStart: number;          // segundos en el audio de A donde empieza la transición
  inStart: number;           // segundos en el audio de B donde entra B
  bars: BarsOption;
  volume: VolumeStyle;
  preset: TransitionPreset | null; // último preset elegido; null si nunca se eligió uno
  auto: boolean;             // true mientras nadie la haya editado o tras elegir "Auto"
}

export interface EditorState {
  pairIndex: number;       // índice del par (tracks[i], tracks[i+1]) dentro de la playlist
  draft: Transition;       // copia editable
  dirty: boolean;          // hay cambios sin guardar
}

export interface AppState {
  tracks: Track[];                         // orden = orden de reproducción
  transitions: Record<string, Transition>; // clave: `${fromId}->${toId}`
  mixEnabled: boolean;                     // toggle Mix
  editor: EditorState | null;              // null = editor cerrado
  playback: 'stopped' | 'playing' | 'previewing';
}

// src/lib/curves.ts
export const PRESETS: Record<TransitionPreset, { label: string; volume: VolumeStyle }> = {
  fade: { label: 'Fade', volume: 'smooth-crossfade' },
  blend: { label: 'Blend', volume: 'crossfade' },
  rise: { label: 'Rise', volume: 'overlap' },
  slam: { label: 'Slam', volume: 'center-cut' },
};

// src/lib/timeline.ts — resultado de buildTimeline(), consumido por el motor
export interface TimelineEntry {
  trackId: string;
  contextStart: number;
  offset: number;
  rateEvents: { time: number; rate: number; ramp: boolean }[];
  gainCurveIn?: { time: number; duration: number; curve: Float32Array };
  gainCurveOut?: { time: number; duration: number; curve: Float32Array };
  stopAt: number;
}
```

### Estilos de volumen

Nombres visibles iguales a los de Spotify. Las fórmulas son nuestras, porque Spotify no las publica. Para `x ∈ [0,1]` dentro de la ventana, cada estilo da `{ out, in }` (ganancia de A y de B):

| Estilo (`VolumeStyle`) | Etiqueta en UI | out (A) | in (B) |
| --- | --- | --- | --- |
| `smooth-crossfade` | Smooth crossfade | `cos(x·π/2)` | `sin(x·π/2)` |
| `crossfade` | Crossfade | `1 − x` | `x` |
| `overlap` | Overlap | `1` hasta `x = 1`, luego `0` | `1` |
| `fade-in-fade-out` | Fade in fade out | `1` hasta `0.5`, luego baja lineal a `0` | sube lineal de `0` a `1` hasta `0.5`, luego `1` |
| `cut-in-fade-out` | Cut in fade out | `1 − x` | `1` |
| `fade-in-cut-out` | Fade in cut out | `1` hasta `x = 1`, luego `0` | `x` |
| `center-cut` | Center cut | `1` si `x < 0.5`, si no `0` | `0` si `x < 0.5`, si no `1` |
| `fade-in-fast-out` | Fade in fast out | baja lineal de `1` a `0` en `x ∈ [0, 0.25]`, luego `0` | `x` |

### Estado "Custom"

`chipLabel(t)` deriva el texto del chip:

- `t.auto` → "Auto".
- `t.preset !== null` y `PRESETS[t.preset].volume === t.volume` → la etiqueta del preset.
- En cualquier otro caso → "Custom".

### Convenciones

- Compás = 4 beats (4/4). Duración de la transición en tiempo de mezcla: `D = bars * 4 * 60 / bpmA`.
- Rate de B durante la transición: `r = bpmA / bpmB`. Tras la transición, rampa lineal de `r` a `1` durante `D`.
- Audio de B consumido durante la transición y la rampa: `D*r + D*(r+1)/2` segundos.
- Snap: el beat más cercano es `firstBeatOffset + k * 60 / bpm`, con `k` entero ≥ 0. El nudge de ±0,010 s no hace snap.
- Las curvas se muestrean a un `Float32Array` (256 muestras) y se aplican con `GainNode.gain.setValueCurveAtTime`.
- **Transición Auto** (al crear un par o al elegir "Auto"):
  - `bars = 8`, `volume = 'smooth-crossfade'`, `preset = 'fade'`, `auto = true`.
  - `outStart = snap(durationA - 16 compases de A)`.
  - `inStart = firstBeatOffset de B`.
- **Preview:** rango de τ = `−2 compases de A` a `D + 2 compases de A`, relativo al inicio de la transición, repetido en bucle. Al reiniciar se aplica un fade de 10 ms para evitar clics.
- **Mix apagado:** `buildSequentialTimeline` encadena las canciones de principio a fin, sin solapamiento, rate 1 y ganancia 1.

### Validaciones

No bloquean "Guardar": se puede guardar una transición inválida. Sí bloquean la preview del editor y "Reproducir mezcla" con Mix encendido; el chip muestra "Revisar".

- Ambas canciones en estado `ready`.
- `outStart + D ≤ durationA`.
- `inStart + D*r ≤ durationB`.
- Si B tiene transición saliente, su `outStart` debe ser ≥ `inStart + D*r + D*(r+1)/2`. Si no, ese par siguiente se marca "solapado".
- Advertencia (no bloquea): si `r` sale de `[0.92, 1.08]`, mostrar "Cambio de tono audible".

---

## Estilo visual

Tema oscuro único. Los colores viven como variables CSS en `:root` dentro de `src/styles.css`. El canvas los lee con `getComputedStyle`.

```css
:root {
  color-scheme: dark;
  --bg: #121212;
  --surface: #1e1e1e;
  --surface-raised: #2a2a2a;
  --text: #ffffff;
  --text-muted: #a7a7a7;
  --wave: #d98a3d;
  --wave-dim: #6b4a2b;
  --window-frame: #4a90e2;
  --gain-curve: #f2c94c;
  --playhead: #1ed760;
  --beat-line: rgba(255, 255, 255, 0.08);
  --danger: #f15e6c;
  --warning: #f2c94c;
  --radius-pill: 999px;
  --radius-card: 12px;
  font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
}
```

### Playlist

```
mixer                                   Mix [●]   [+ Añadir canciones]
───────────────────────────────────────────────────────────────────────
 1  More                                  86 bpm   04:00     ↑ ↓ ✕
                          ( Auto )
 2  La Pregunta                           86 bpm   04:29     ↑ ↓ ✕
                          ( Custom )
 3  Otra canción                          92 bpm   03:51     ↑ ↓ ✕
───────────────────────────────────────────────────────────────────────
[▶ Reproducir mezcla]  [■ Detener]   Lista para reproducir 3 canciones.
```

- Filas separadas por `1px` de `--border`, sin tarjetas.
- Ancho máximo del contenido: 720px, centrado.
- Chip: píldora `--surface-raised` con texto `--text-muted`. En hover, texto `--text`. Con errores dice "Revisar" en `--danger`.
- Toggle Mix: switch accesible (`role="switch"`, `aria-checked`). Encendido usa `--playhead` como color de fondo.

### Editor

```
┌───────────────────────────────────────────┐
│  ✕        Transición 1 de 2       Guardar │
│  ▁▂▃▅▃▂▁▂▃[▅▃]   ← overview A            │
│  [▂▃]▅▃▂▁▂▃▅▃▂   ← overview B            │
│  More                         86 bpm      │
│                               04:00       │
│ ‹ ~~~~~~╔══════════════╗·······  ›        │
│         ║ \··········· ║                  │
│         ║      ■       ║                  │
│         ║ ···········/ ║                  │
│ ‹ ······╚══════════════╝~~~~~~~  ›        │
│  La Pregunta                  86 bpm      │
│  Entra en 0:00.12, a 1.000×   04:29       │
│              [ 8 compases ⌄ ]             │
│  (Auto) (Fade) (Blend) (Rise) (Slam)      │
│  Volumen   [ Smooth crossfade ⌄ ]         │
│  mensajes de validación                   │
└───────────────────────────────────────────┘
```

- `<dialog>` con fondo `--surface`, `--radius-card` y `::backdrop` oscuro semitransparente. Por debajo de 600px se ancla abajo, ocupa el 92% de la altura y tiene las esquinas superiores redondeadas.
- **Vista alineada** (se mantiene de los pasos 10–11):
  - La ventana ocupa el 60% central (`τ ∈ [0, D]`): panel `--surface-raised`, marco `--window-frame` en cada onda y beats `--beat-line` del grid de A.
  - La onda de A muestra `outStart + τ`. La de B muestra su audio con el rate aplicado.
  - Dentro de la ventana la onda es `--wave`; fuera, `--wave-dim`.
  - La curva de volumen se dibuja en `--gain-curve`.
  - El playhead es una única línea de 2px en `--playhead`.
- **Nudge:** botones redondos de 28px con `‹` y `›`, a la izquierda y a la derecha de cada onda, fondo `--surface-raised`.
- **Presets:** píldoras de 36px de alto. La activa lleva fondo `--text` y texto `--bg`. Si la transición es "Custom", ninguna está activa.
- **Píldora de compases y select de volumen:** `--surface-raised` con `--radius-pill`.
- **Popover de BPM:** `--surface-raised`, `--radius-card`, anclado bajo el BPM tocado. Se cierra con Esc o clic fuera.
- Contraste mínimo de texto WCAG AA (4.5:1) contra `--bg` y `--surface`. Foco visible en todos los controles.

---

## Estructura de archivos

```
index.html
package.json            # vite, typescript, vitest, web-audio-beat-detector
tsconfig.json
src/
  main.ts               # arranque, AudioContext, wiring de UI
  types.ts
  state.ts              # store + acciones del editor (abrir, borrador, guardar, descartar, auto)
  vite-env.d.ts
  styles.css
  lib/
    timing.ts           # barsToSeconds, playbackRateFor, snapToBeat
    curves.ts           # VolumeStyle → curveGain/sampleCurve, PRESETS, chipLabel
    validation.ts       # validatePair, validateQueue
    timeline.ts         # buildTimeline, buildSequentialTimeline, previewRange, incomingAudioAt
    fixtures.ts         # datos de prueba para los tests
    *.test.ts
  audio/
    loader.ts           # File -> AudioBuffer + peaks
    bpm.ts              # wrapper de web-audio-beat-detector
    engine.ts           # play, playLoop, stop, mixTimeOf
  ui/
    dom.ts              # helper h(), iconos SVG, formatos de tiempo/BPM
    playlist.ts         # filas, chips, toggle Mix, carga de archivos
    editor.ts           # <dialog> del editor, presets, compases, volumen, guardar/descartar
    bpmPopover.ts       # popover de BPM y primer beat
    waveform.ts         # vista alineada, overview y nudge
    transport.ts        # barra inferior: reproducir mezcla, detener, estado
```

`ui/queue.ts` y `ui/pairView.ts` se eliminan en los pasos 15 y 16.

---

## Plan de implementación

Pasos 1–11: ya implementados (base técnica, vista alineada y minimapa).

1. Crear proyecto Vite vanilla-ts, agregar Vitest y `web-audio-beat-detector`, `src/types.ts`, `src/state.ts` y `src/styles.css` con las variables del tema oscuro.
2. `src/lib/timing.ts` y `src/lib/curves.ts` con sus tests.
3. `src/lib/validation.ts` y `src/lib/timeline.ts` con tests.
4. `src/audio/loader.ts` + `src/ui/queue.ts`: cargar archivos, decodificar, calcular picos, listar, quitar y reordenar.
5. `src/audio/bpm.ts`: análisis tras decodificar; si falla, `bpm-required`. Edición de BPM y primer beat.
6. `src/ui/waveform.ts` + `src/ui/pairView.ts`: vista de par con ondas, ventana, curva, compases y curva de volumen.
7. Arrastre de `outStart` e `inStart` con snap; errores y advertencia de tono.
8. `src/audio/engine.ts` + `src/ui/transport.ts`: previsualizar y detener.
9. Reproducción completa y playhead animado.
10. `src/lib/timeline.ts`: `incomingAudioAt(τ, inStart, D, r)` con tests.
11. `src/ui/waveform.ts`: vista alineada y minimapa por canción.

Pasos nuevos (formato Spotify Mix):

12. `src/lib/curves.ts` + `src/types.ts`: reemplazar `CurveType` por los 8 `VolumeStyle`, añadir `PRESETS` y `chipLabel`. Tests de las 8 fórmulas y de `chipLabel`. `defaultTransition` pasa a Auto (8 compases, Fade, 16 compases antes del final).
13. `src/lib/timeline.ts`: `buildSequentialTimeline` (Mix apagado) y `previewRange(transition, bpmA)` (de −2 a D+2 compases), con tests.
14. `src/state.ts`: quitar `selectedPairIndex`; añadir `mixEnabled`, `editor` y las acciones `openEditor`, `updateDraft`, `saveDraft`, `discardDraft`, `applyPreset`, `resetToAuto`. Ajustar `src/main.ts`.
15. `src/ui/playlist.ts`: filas, chips y toggle Mix. Elimina `src/ui/queue.ts`. Adaptar `src/ui/transport.ts` ("Reproducir mezcla" usa `buildSequentialTimeline` si Mix está apagado).
16. `src/ui/editor.ts`: `<dialog>` modal (diálogo/hoja), barra con X/Guardar y confirmación de descarte. Mueve el overview, las tarjetas y la vista alineada. Esc y foco de vuelta al chip. Elimina `src/ui/pairView.ts`.
17. `src/ui/bpmPopover.ts`: popover desde el BPM de cada tarjeta, con campo, `×2`, `÷2` y primer beat.
18. Editor: píldora de compases, fila de presets con Auto y select de Volumen, conectados al borrador.
19. `src/ui/waveform.ts`: botones de nudge ±0,010 s por onda y overview de 2 tiras.
20. `src/audio/engine.ts`: `playLoop` para la preview en bucle con fade de 10 ms, autoplay al abrir el editor, reinicio al cambiar el borrador y parada al cerrar.

---

## Criterios de aceptación

**Base técnica**

- [x] `npm run dev` abre la app sin errores en la consola.
- [x] `npm test` pasa todos los tests de `src/lib/`.
- [x] Se pueden cargar 3 o más archivos MP3/WAV por selector y por drag & drop; aparecen en la playlist en orden de carga.
- [x] Un archivo no decodificable aparece con "No se pudo leer" y no genera chip de transición.
- [x] Tras cargar, cada canción muestra un BPM detectado o "BPM requerido".

**Playlist**

- [x] Hay un chip entre cada par de canciones consecutivas y ninguno después de la última.
- [x] Al crear una transición, su chip dice "Auto".
- [x] Reordenar o quitar canciones recalcula los chips.
- [x] Una transición con errores muestra "Revisar" en rojo en su chip.
- [x] Con Mix apagado, los chips se ocultan y "Reproducir mezcla" toca las canciones seguidas, sin fundido.
- [x] Al volver a encender Mix, las transiciones guardadas siguen igual.
- [x] Con Mix encendido, "Reproducir mezcla" con 3 canciones encadena A→B→C aplicando cada transición guardada.
- [x] "Detener" silencia todo inmediatamente.

**Editor**

- [x] Tocar un chip abre el editor de ese par con el título "Transición N de M".
- [x] La transición empieza a sonar sola, en bucle, y no se detiene hasta pulsar ■ o cerrar el editor.
- [x] El bucle va de 2 compases antes a 2 compases después de la ventana.
- [x] Deslizar una onda y soltarla reinicia el bucle con el punto nuevo.
- [x] Sin Shift, el punto queda sobre un beat; con Shift, queda donde se suelta.
- [x] Cada botón ‹ › cambia el punto de su onda exactamente 0,010 s.
- [x] Clic en una tira del overview mueve la ventana de esa canción a ese punto.
- [x] Cambiar compases a 1, 2, 4, 8 o 16 cambia la cantidad de beats dentro de la ventana y el ancho de la ventana en el overview.
- [x] Con BPM distintos, dentro de la ventana los picos de B se ven alineados con las líneas de beat de A, y de oído los beats coinciden.
- [x] Tras la transición, B vuelve a su velocidad original de forma gradual (sin salto audible).
- [x] Elegir Fade, Blend, Rise o Slam cambia el estilo de Volumen al de su preset y conserva puntos y compases.
- [x] Cambiar el estilo de Volumen a mano y guardar hace que el chip diga "Custom".
- [x] Elegir Auto restablece los puntos por defecto, 8 compases y Fade; tras guardar, el chip dice "Auto".
- [x] Los 8 estilos de Volumen suenan distinto y dibujan una curva amarilla distinta (tests de `curveGain` para las 8 fórmulas).
- [x] X o Esc sin cambios cierran el editor sin preguntar.
- [x] X o Esc con cambios preguntan "¿Descartar cambios?". "Descartar" cierra y la transición y el chip quedan como estaban.
- [x] "Guardar" aplica el borrador, cierra el editor y actualiza el chip.
- [x] Al cerrar el editor, el foco vuelve al chip que lo abrió.
- [x] Tocar el BPM de una tarjeta abre el popover. El campo, `×2`, `÷2` y "Primer beat" cambian la canción y la vista se redibuja.
- [x] Un rate fuera de `[0.92, 1.08]` muestra la advertencia de cambio de tono.
- [x] Una transición que no cabe en la canción, o que se solapa con la siguiente, muestra el error y deshabilita ▶.
- [x] Por debajo de 600px de ancho el editor es una hoja inferior; por encima, un diálogo centrado de 480px.

**Tema y marca**

- [x] La app se ve en tema oscuro (fondo `#121212`) aunque el sistema operativo esté en modo claro.
- [x] La ventana tiene marco azul, la curva es amarilla, la onda es naranja dentro de la ventana y atenuada fuera, y el playhead es verde.
- [x] Ningún color está hardcodeado fuera de `src/styles.css`.
- [x] En la UI no aparece el nombre, el logo ni iconos de Spotify.

---

## Decisiones

- **Sí:** Vite + TypeScript sin framework. La UI sigue siendo pequeña; React no aporta lo suficiente.
- **No:** Electron/Tauri o CLI en Python. Más setup o sin vista de ondas.
- **Sí:** archivos locales. Spotify no permite acceder al audio crudo.
- **No:** URLs remotas. CORS y fuera del caso principal.
- **Sí:** detección automática con `web-audio-beat-detector` + ajuste manual. Evita escribir DSP propio.
- **Sí:** `playbackRate` sin preservar tono. Nativo y simple; el key lock de Spotify queda para SPEC 07.
- **No:** key lock en esta spec. Más CPU, latencia y riesgo de sincronía del playhead.
- **Sí:** B vuelve gradualmente a su BPM tras la transición, en la misma duración. Igual que Spotify y sin saltos audibles.
- **Sí:** copiar el formato y el flujo de Spotify Mix. Es la experiencia que el usuario busca.
- **No:** imitar la marca (nombre, logo, iconos). Problemas de marca registrada.
- **Sí:** playlist + editor en diálogo/hoja. Es el flujo de Spotify: la playlist es la pantalla principal y el editor aparece por transición.
- **No:** panel lateral fijo o cola + vista de par. Se aleja del formato de Spotify.
- **Sí:** editar sobre un borrador con Guardar / X + confirmación. Igual que Spotify y evita perder trabajo por accidente.
- **No:** cambios inmediatos sin borrador.
- **Sí:** autoplay al abrir el editor y preview en bucle hasta Stop. Igual que Spotify; se escucha mientras se ajusta.
- **Sí:** BPM editable en un popover del editor; la playlist solo lo muestra. Igual que Spotify, con la corrección manual que Spotify no permite.
- **Sí:** carril Volumen con los 8 estilos y nombres de Spotify. Las fórmulas son nuestras porque Spotify no las publica.
- **Sí:** presets Fade, Blend, Rise y Slam, que solo fijan el volumen. Los que dependen de EQ/Filtro/Efectos (Wave, Melt, Dissolve, Surge, Afterglow) y la receta completa de Rise llegan con SPEC 04–05.
- **Sí:** Auto = Fade, 8 compases, 16 compases antes del final de A. Es determinista y testeable.
- **No:** Auto "inteligente" según compatibilidad. Requiere tonalidad (SPEC 06).
- **Sí:** compases 1, 2, 4, 8, 16 con 8 por defecto. Igual que el valor por defecto de Spotify.
- **Sí:** nudge de ±10 ms sin snap. Igual que Spotify, para ajustar cuando el beat detectado no es exacto.
- **Sí:** overview que permite llegar al inicio y al final de cada canción. Spotify lo limita; para nosotros es más útil poder elegir cualquier punto.
- **Sí:** se puede guardar una transición inválida (chip "Revisar"). Así no se pierde trabajo; la reproducción la bloquea.
- **Sí:** toggle Mix que conserva las transiciones. Igual que Spotify.
- **Sí:** vista alineada con ventana fija al 60% central y ondas deslizables. Se ve qué suena junto a qué, como en Spotify.
- **Sí:** curvas muestreadas a `Float32Array` con `setValueCurveAtTime`. Deja la puerta abierta a Customize (SPEC 02).
- **Sí:** `buildTimeline` y `buildSequentialTimeline` puros y testeables, separados del motor. Reutilizables para la exportación (SPEC 03).
- **Sí:** tema oscuro único con la paleta de la captura; colores como variables CSS leídas también por el canvas.
- **Sí:** sin persistencia por ahora. Los proyectos guardables quedan para SPEC 08.
- **Sí:** Vitest para la lógica pura + checklist manual para audio/UI.

---

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Los estilos y presets de Spotify no tienen documentación oficial | Nombres tomados de las fuentes citadas; fórmulas propias documentadas en "Estilos de volumen". |
| Marca registrada de Spotify | Se imita solo la forma. Hay un criterio de aceptación que lo verifica. |
| Clics al reiniciar el bucle de la preview | Fade de 10 ms al cortar. Reinicio al soltar el arrastre, no en cada movimiento. |
| Foco y accesibilidad del diálogo | `<dialog>` nativo con `showModal()`. Foco devuelto al chip al cerrar. |
| Sin key lock, cambio de tono audible con BPM muy distintos | Advertencia en el editor. Key lock en SPEC 07. |
| `web-audio-beat-detector` detecta el doble del BPM en temas lentos (reggaetón ~86 → 172) | Popover con `×2` / `÷2` y campo editable. |
| El detector falla o tarda en canciones largas | Estado "Detectando BPM…" visible; si falla, "BPM requerido". |
| Offset del primer beat impreciso → beats desalineados | "Primer beat" editable en el popover y nudge de ±10 ms. |
| Memoria con muchas canciones decodificadas (≈10 MB/min en estéreo float32) | Aceptado para esta spec. Error visible si `decodeAudioData` falla. |
| `AudioContext` bloqueado por autoplay | Se crea y se reanuda dentro de gestos del usuario (añadir archivos, tocar el chip). |
| Deriva de tiempo al encadenar rampas de rate | El timeline integra el rate (`D*(r+1)/2`) y está cubierto por tests. |

---

## Lo que **no** entra en esta spec

- Customize: curvas por puntos (SPEC 02).
- Exportar a WAV/MP3 (SPEC 03).
- Carriles EQ y Filtro, presets Wave y Melt, receta completa de Rise (SPEC 04).
- Carril Efectos, Looping, presets Dissolve, Surge y Afterglow (SPEC 05).
- Tonalidad Camelot, Smart Reorder y carátulas (SPEC 06).
- Key lock (SPEC 07).
- Proyectos guardables (SPEC 08).
- Auto "inteligente", shuffle, colaboración, compartir, Spotify Connect.
- Transición de la última canción a la primera.
- Coloreado por frecuencia, zoom manual, seek y pausa.
- Tema claro, URLs remotas, integración con Spotify, compases que no sean 4/4.
- Cualquier elemento de marca de Spotify.

Cada uno, si llega, va en su propia spec.

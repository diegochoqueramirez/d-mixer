# SPEC 04 — Carriles EQ y Filtro

> **Estado:** Implementado
> **Depende de:** SPEC 01, SPEC 02
> **Fecha:** 2026-10-28
> **Objetivo:** Añadir al editor los carriles EQ y Filtro de Spotify Mix, con sus estilos, sus líneas de color, su curva editable en Personalizar y las recetas completas de los presets Fade, Blend, Rise, Wave, Melt y Slam.

---

## Por qué existe esta spec

Spotify Mix tiene cuatro carriles por transición: Volumen, EQ, Filtro y Efectos. Hoy solo existe Volumen.

**Spotify no publica cómo funcionan EQ y Filtro por dentro.** No da frecuencias, ni formas de curva, ni recetas de presets. La única fuente completa es vimj, una reconstrucción de terceros. vimj también dedujo sus curvas de los nombres de los estilos: lo dice en su README. Esta spec adopta los valores de vimj, confirmados por el usuario.

Origen de cada funcionalidad:

| Funcionalidad | Origen |
| --- | --- |
| Carriles EQ (graves, medios, agudos) y Filtro (low-pass y high-pass) | Spotify Mix (soporte oficial) |
| Líneas de color sobre las ondas; volumen en azul | Spotify Mix (Giani) |
| Customize también para EQ y Filtro | Spotify Mix (Engadget) |
| Rise = Overlap + graves por EQ + filtros que entran y salen | Spotify Mix (Giani) |
| Nombres de los 9 estilos de EQ y los 11 de Filtro | vimj (leídos del cliente de Spotify) |
| Forma de cada estilo, frecuencias, Q, barrido al 80%, ruido de "Noise out end" | vimj (deducido de los nombres) |
| Recetas de los 6 presets | vimj (deducido) |
| Paleta azul / amarillo / rosa, escala de cada línea, carril activo encima y el resto atenuado | vimj |
| Solo los graves del EQ son editables | vimj |
| Un botón Personalizar por fila, marco de la ventana neutro | Propio (confirmado por el usuario) |

Referencias:

- [Spotify Support — Mixed playlists](https://support.spotify.com/us/article/mixed-playlists/)
- [Johannes Giani — Custom song transitions with Spotify Mix](https://www.johannesgiani.de/en/blog/custom-song-transitions-with-spotify-mix/)
- [Engadget — How to use Spotify Mix](https://www.engadget.com/2216279/how-to-use-spotify-mix-tool/)
- [vimj — reconstrucción de terceros](https://github.com/lorenzolfm/vimj): `crates/core/src/transition.rs`, `crates/audio/src/dsp.rs`, `crates/tui/src/editor.rs`

---

## Alcance

**Entra:**

- **Fila "EQ"** en el editor, debajo de Volumen, con:
  - un select con los 9 estilos más la opción deshabilitada "Personalizada";
  - un botón "Personalizar" / "Listo";
  - un botón "Restablecer curva", visible solo cuando se personaliza ese carril.
- **Fila "Filtro"**, debajo de EQ, con los mismos controles y los 11 estilos.
- **Estilos de EQ** (nombres en inglés, como los de Volumen): Center bass swap, End bass swap, Start bass swap, 3-band fade, Quick bass cut, Long bass cut, Start fade out, Bass fade out y None.
- **Estilos de Filtro:** Low pass filter out, Low pass filter in, Low pass filter in low pass filter out, Low pass filter in high pass filter out, High pass filter out, High pass filter in, High pass filter in high pass filter out, High pass filter in low pass filter out, High-pass filter half out, Noise out end y None.
- **Sonido:**
  - EQ isolator de 3 bandas: cortes en 250 Hz y 3 kHz, cada banda de 0 (corte total) a 1 (plano).
  - Filtro con barrido logarítmico y resonancia fija. No hay control de resonancia.
  - "Noise out end" añade ruido blanco filtrado sobre A.
  - Se aplica en la preview, en "Reproducir mezcla" y en todo lo que use `buildTimeline`.
- **Presets con receta completa:**

  | Preset | Volumen | EQ | Filtro |
  | --- | --- | --- | --- |
  | Fade | Smooth crossfade | Center bass swap | None |
  | Blend | Overlap | 3-band fade | None |
  | Rise | Overlap | End bass swap | Low pass filter in high pass filter out |
  | Wave | Overlap | Center bass swap | Low pass filter in |
  | Melt | Crossfade | Center bass swap | High pass filter in |
  | Slam | Center cut | None | None |

  - Orden de los botones: Auto, Fade, Blend, Rise, Wave, Melt, Slam.
  - **Auto** aplica la receta completa de Fade.
  - Fade y Blend **cambian de sonido** respecto a la SPEC 01: Fade añade el intercambio de graves y Blend pasa de Crossfade a Overlap + 3-band fade.
- **Líneas de color** sobre las ondas, siempre visibles, una por carril:
  - Volumen en azul, EQ en amarillo y Filtro en rosa.
  - Un carril que no afecta a una canción no dibuja línea en esa onda. Por ejemplo, EQ None, o Low pass filter out en la onda de B.
  - Los medios y agudos de 3-band fade se dibujan en amarillo más tenue, debajo de las demás líneas.
- **Personalizar** de EQ y Filtro (extiende la SPEC 02):
  - Pulsar "Personalizar" en una fila edita ese carril. Pulsar el de otra fila cambia al otro carril; "Listo" sale del modo.
  - El carril que se edita se dibuja encima y los demás se atenúan.
  - Se reutilizan los puntos, tramos, snap, teclado, límite de 32 puntos, deshacer/rehacer y navegación entre transiciones de la SPEC 02.
  - **EQ:** solo se edita la banda de graves, una curva por canción. Con 3-band fade, medios y agudos siguen el estilo.
  - **Filtro:** se edita el grado de cierre de cada canción. El tipo (low-pass, high-pass o ruido) lo fija el estilo y no cambia al dibujar.
  - Una canción a la que el estilo de Filtro no afecta no tiene curva ni puntos. Para filtrarla hay que elegir antes un estilo que la incluya.
  - Con EQ None, la curva de graves existe (plana al 100%) y se puede editar.
  - Las asas de puntos y tramos usan el color del carril que se edita.
- **Reglas de reemplazo:**
  - Elegir un estilo de EQ descarta solo la curva personalizada de EQ. Lo mismo con Filtro y con Volumen.
  - Elegir un preset o "Auto" descarta las tres curvas personalizadas.
  - "Restablecer curva" de una fila vuelve a la curva del estilo de esa fila.
  - El chip dice el nombre del preset solo si los tres estilos coinciden con su receta y no hay curvas personalizadas. Si no, dice "Custom".
- **Paleta:**
  - `--gain-curve` (amarillo) pasa a llamarse `--lane-volume` y se vuelve azul.
  - Se añaden `--lane-eq` y `--lane-filter`.
  - `--window-frame` pasa a blanco al 40%, para no confundirse con el volumen.
- **Tests unitarios** con Vitest de estilos, recetas, mapeos de frecuencia y timeline.

**Fuera de alcance:**

- Carril Efectos, looping y los presets Dissolve, Surge y Afterglow (SPEC 05).
- Control de resonancia del filtro.
- Editar los medios y agudos del EQ.
- Cambiar el tipo de filtro dibujando, o añadir filtro a una canción cuyo estilo no la incluye.
- Realce (boost) del EQ por encima del nivel plano.
- Exportar la mezcla (SPEC 03).
- Persistencia entre sesiones (SPEC 08).

---

## Modelo de datos

```ts
// src/types.ts
export type EqStyle =
  | 'center-bass-swap' | 'end-bass-swap' | 'start-bass-swap' | 'three-band-fade'
  | 'quick-bass-cut' | 'long-bass-cut' | 'start-fade-out' | 'bass-fade-out' | 'none';

export type FilterStyle =
  | 'lpf-out' | 'lpf-in' | 'lpf-in-lpf-out' | 'lpf-in-hpf-out'
  | 'hpf-out' | 'hpf-in' | 'hpf-in-hpf-out' | 'hpf-in-lpf-out'
  | 'hpf-half-out' | 'noise-out-end' | 'none';

export type FilterKind = 'lowpass' | 'highpass' | 'noise';

/** Lane being edited in "Personalizar". */
export type EditLane = 'volume' | 'eq' | 'filter';

export type TransitionPreset = 'fade' | 'blend' | 'rise' | 'wave' | 'melt' | 'slam';

/** One curve per song; null = the style leaves that song alone (filter only). */
export interface SideCurves {
  out: GainCurve | null;
  in: GainCurve | null;
}

export interface Transition {
  // ...campos de SPEC 01 y 02
  eq: EqStyle;
  filter: FilterStyle;
  customEq: VolumeCurves | null;     // curva de graves por canción; null = usa el estilo `eq`
  customFilter: SideCurves | null;   // cierre por canción; null = usa el estilo `filter`
}

export interface EditorState {
  // ...campos de SPEC 02
  customizing: EditLane | null;      // antes boolean
}
```

`TimelineEntry` gana eventos opcionales, con la misma forma temporal que `GainCurveEvent`:

```ts
export interface EqEvent { time: number; duration: number; low: Float32Array; mid: Float32Array; high: Float32Array }
export interface FilterEvent { time: number; duration: number; kind: 'lowpass' | 'highpass'; frequency: Float32Array; wet: Float32Array }
export interface NoiseEvent { time: number; duration: number; level: Float32Array; frequency: Float32Array }

export interface TimelineEntry {
  // ...campos actuales
  eqIn?: EqEvent; eqOut?: EqEvent;
  filterIn?: FilterEvent; filterOut?: FilterEvent;
  noiseOut?: NoiseEvent;
}
```

### Curvas de los estilos de EQ

Todas usan `GainCurve` (SPEC 02) con todos los tramos `ease: true` y `bend` 0. El tramo suave de nuestro modelo (smoothstep) es idéntico a la Bézier por defecto de vimj.

Cada "cambio" dura un 3% de la ventana, centrado donde ocurre:

| Estilo | Graves de A (`out`) | Graves de B (`in`) |
| --- | --- | --- |
| Center bass swap | (0,1) (0.485,1) (0.515,0) (1,0) | (0,0) (0.485,0) (0.515,1) (1,1) |
| End bass swap | (0,1) (0.885,1) (0.915,0) (1,0) | (0,0) (0.885,0) (0.915,1) (1,1) |
| Start bass swap | (0,1) (0.085,1) (0.115,0) (1,0) | (0,0) (0.085,0) (0.115,1) (1,1) |
| Quick bass cut | (0,1) (0.385,1) (0.415,0) (1,0) | (0,0) (0.585,0) (0.615,1) (1,1) |
| Long bass cut | (0,1) (0.035,1) (0.065,0) (1,0) | (0,0) (0.935,0) (0.965,1) (1,1) |
| Start fade out | (0,1) (0.5,0) (1,0) | (0,0) (0.485,0) (0.515,1) (1,1) |
| Bass fade out | (0,1) (1,0) | (0,0) (0.935,0) (0.965,1) (1,1) |
| None | (0,1) (1,1) | (0,1) (1,1) |

En todos estos estilos, medios y agudos quedan planos en 1.

**3-band fade** (los agudos cambian primero, luego los medios y al final los graves):

| Banda | A (`out`) | B (`in`) |
| --- | --- | --- |
| Graves | (0,1) (0.6,1) (1,0) | (0,0) (0.6,0) (1,1) |
| Medios | (0,1) (0.3,1) (0.7,0) (1,0) | (0,0) (0.3,0) (0.7,1) (1,1) |
| Agudos | (0,1) (0.4,0) (1,0) | (0,0) (0.4,1) (1,1) |

### Curvas de los estilos de Filtro

La curva es el **cierre**: 0 = abierto, 1 = cerrado del todo. Los barridos llegan al 80%. Tramos `ease: true`.

- `CLOSE` = (0,0) (1,0.8), en la canción saliente (A).
- `OPEN` = (0,0.8) (1,0), en la canción entrante (B).
- `HALF` = (0,0) (1,0.4).
- `RISE` = (0,0) (0.5,0) (1,1).

"Out" se refiere a A y cierra; "in" se refiere a B y abre. En los nombres dobles, el primer filtro va en B y el segundo en A.

| Estilo | A (`out`) | B (`in`) |
| --- | --- | --- |
| Low pass filter out | low-pass `CLOSE` | — |
| Low pass filter in | — | low-pass `OPEN` |
| Low pass filter in low pass filter out | low-pass `CLOSE` | low-pass `OPEN` |
| Low pass filter in high pass filter out | high-pass `CLOSE` | low-pass `OPEN` |
| High pass filter out | high-pass `CLOSE` | — |
| High pass filter in | — | high-pass `OPEN` |
| High pass filter in high pass filter out | high-pass `CLOSE` | high-pass `OPEN` |
| High pass filter in low pass filter out | low-pass `CLOSE` | high-pass `OPEN` |
| High-pass filter half out | high-pass `HALF` | — |
| Noise out end | ruido `RISE` | — |
| None | — | — |

### De curva a sonido

- **EQ:** cada banda multiplica su señal por el valor de la curva (0..1).
  - Los cortes son Linkwitz–Riley de 4.º orden: dos `BiquadFilterNode` en cascada con Q de Butterworth (1/√2).
  - Graves = low-pass 250 Hz ×2, más un all-pass de 3 kHz para alinear la fase.
  - Resto = high-pass 250 Hz ×2. Medios = resto → low-pass 3 kHz ×2. Agudos = resto → high-pass 3 kHz ×2.
  - Con las tres bandas en 1, la suma es plana.
- **Filtro** (cierre `c` ∈ [0,1]):
  - Low-pass: `f = 20000 · (150 / 20000)^c` Hz (de 20 kHz a 150 Hz).
  - High-pass: `f = 20 · (4000 / 20)^c` Hz (de 20 Hz a 4 kHz).
  - Q fija de 0,9. En Web Audio, el `Q` de `lowpass`/`highpass` va en dB: `20·log10(0,9) ≈ −0,915`.
  - Mezcla seco/filtrado: `wet = min(1, c / 0,05)`, para que el filtro abierto sea transparente.
- **Ruido** (Noise out end, valor `a` ∈ [0,1]):
  - Ruido blanco estéreo en bucle → low-pass de `300 · (14000 / 300)^a` Hz con Q 0,9 → ganancia `0,3 · a`.
  - Se suma a la salida después de la ganancia de volumen de A. No lo atenúa la curva de volumen.
- **Cadena por canción:** fuente → EQ → filtro → ganancia de volumen → salida. Solo se crean los nodos de EQ y filtro si la entrada tiene eventos de ese carril.
- Las curvas se muestrean con `CURVE_SAMPLES` (256) y se aplican con `setValueCurveAtTime`, igual que el volumen. Fuera de su ventana, cada parámetro se queda en el último valor de su curva, como el volumen en la SPEC 02.

### Escala vertical de cada línea

Fracción de la altura de la onda, medida desde abajo (de vimj):

| Carril | Valor 0 | Valor 1 |
| --- | --- | --- |
| Volumen | abajo (0) | arriba (1) |
| EQ | abajo (0) | mitad (0,5) |
| Filtro low-pass | mitad (0,5) | abajo (0) |
| Filtro high-pass y ruido | mitad (0,5) | arriba (1) |

Así, el EQ en reposo está a media altura y los cortes lo bajan. El filtro abierto está a media altura: un high-pass que cierra sube y un low-pass que cierra baja. En Personalizar, arrastrar un punto usa la misma escala.

### Chip y presets

- `PRESETS` pasa a ser `Record<TransitionPreset, { label: string; volume: VolumeStyle; eq: EqStyle; filter: FilterStyle }>`.
- `chipLabel`: "Auto" si `auto`. Si no, el nombre del preset cuando `volume`, `eq` y `filter` coinciden con su receta y `customVolume`, `customEq` y `customFilter` son `null`. En otro caso, "Custom".
- `defaultTransition` usa la receta de Fade.

---

## Estilo visual

- **Tokens nuevos en `src/styles.css`:**
  - `--lane-volume: #46aaff` (sustituye a `--gain-curve`);
  - `--lane-eq: #ffd232`;
  - `--lane-filter: #f57de1`;
  - `--window-frame: rgba(255, 255, 255, 0.4)`.
  - Los colores salen de vimj: RGB (70,170,255), (255,210,50) y (245,125,225).
- **Líneas:** 2px, como la curva actual. Medios y agudos de 3-band fade: `--lane-eq` al 40% de opacidad, 1px.
- **Orden de dibujo:** medios/agudos del EQ, luego filtro, EQ (graves) y volumen. En Personalizar, el carril activo va encima y los demás al 35% de opacidad.
- **Asas:** las de la SPEC 02, con relleno y borde del color del carril activo, mediante una variable CSS `--lane-color` en `.curve-editor`.
- **Filas EQ y Filtro:** misma estructura que `volumeLane` (`lane-row`, `lane-label`, `lane-actions`). El botón "Personalizar" de la fila activa tiene el estilo activo de la SPEC 02.
- Sin colores fuera de `src/styles.css`.

---

## Estructura de archivos

```
src/
  types.ts              # + EqStyle, FilterStyle, FilterKind, EditLane, SideCurves; Transition.eq/filter/customEq/customFilter;
                        #   TransitionPreset + wave/melt; EditorState.customizing: EditLane | null; Eq/Filter/NoiseEvent
  state.ts              # setEqStyle, setFilterStyle; toggleCustomize(lane); updateCustomCurve(lane, side, curve); resetCurve(lane)
  lib/
    lanes.ts            # NUEVO: EQ_STYLES, FILTER_STYLES, etiquetas, eqCurves(style), filterShape(style),
                        #   lowpassHz, highpassHz, noiseHz, filterWet, eqSamples(t), filterSamples(t)
    lanes.test.ts       # NUEVO
    curves.ts           # PRESETS con receta completa; chipLabel con los tres carriles
    timeline.ts         # emite eqIn/eqOut, filterIn/filterOut y noiseOut
    fixtures.ts         # campos nuevos con eq/filter 'none'
  audio/
    laneNodes.ts        # NUEVO: nodos de EQ isolator, filtro con seco/filtrado y fuente de ruido
    engine.ts           # inserta EQ y filtro entre la fuente y la ganancia; programa el ruido
  ui/
    editor.ts           # filas EQ y Filtro; presets Wave y Melt; Personalizar por fila
    waveform.ts         # dibuja las tres líneas con su escala y su color; atenuación en Personalizar
    curveEditor.ts      # edita el carril activo con su escala; sin asas en canciones sin curva
  styles.css            # tokens --lane-*, --window-frame neutro, --lane-color en las asas
```

---

## Plan de implementación

1. `src/types.ts`, `src/state.ts` y `src/lib/fixtures.ts`: tipos nuevos; `eq: 'none'`, `filter: 'none'`, `customEq: null` y `customFilter: null` en `defaultTransition` y fixtures. `customizing` pasa a `EditLane | null`, con `'volume'` donde hoy es `true`. `sameTransition` compara los campos nuevos. La app suena igual.
2. `src/lib/lanes.ts` con estilos, etiquetas, `eqCurves`, `filterShape` y los mapeos de frecuencia y `wet`, con tests:
   - cada estilo tiene las curvas de las tablas;
   - `lowpassHz(0) = 20000`, `lowpassHz(1) = 150`, `highpassHz(0) = 20`, `highpassHz(1) = 4000`, `noiseHz(1) = 14000`;
   - `filterWet(0) = 0` y `filterWet(0,05) = 1`.
3. `src/lib/lanes.ts`: `eqSamples(t)` y `filterSamples(t)`, que usan la curva personalizada si existe, como `volumeSamples`. Tests con curvas personalizadas.
4. `src/lib/timeline.ts`: emitir los eventos nuevos. Tests: Center bass swap produce `eqOut` y `eqIn`; Low pass filter out solo produce `filterOut` con frecuencias en Hz; Noise out end produce `noiseOut` en A; None no produce eventos.
5. `src/audio/laneNodes.ts` + `src/audio/engine.ts`: EQ isolator y filtro en la cadena de cada voz y fuente de ruido. Prueba manual: con un estilo elegido a mano, la preview suena con el corte o el barrido. Los selects aún no existen, así que se prueba cambiando la transición por defecto en local.
6. `src/state.ts`: `setEqStyle` y `setFilterStyle` (descartan su curva personalizada), `resetCurve(lane)`, `updateCustomCurve(lane, side, curve)` y `toggleCustomize(lane)`. Todas pasan por el historial.
7. `src/lib/curves.ts`: `PRESETS` con receta completa, `PRESET_ORDER` con Wave y Melt, y `chipLabel` con los tres carriles. `applyPreset` y `resetToAuto` aplican los tres estilos y descartan las tres curvas. Tests del chip.
8. `src/ui/editor.ts`: filas EQ y Filtro con select, "Personalizar" y "Restablecer curva"; botones Wave y Melt.
9. `src/styles.css` + `src/ui/waveform.ts`: tokens nuevos, marco neutro y las tres líneas con su escala, su color y el orden de dibujo.
10. `src/ui/curveEditor.ts`: editar el carril activo con su escala vertical y su color; sin asas en la canción sin curva; atenuar los otros carriles.

---

## Criterios de aceptación

- [x] `npm test` pasa, incluidos los tests nuevos de `src/lib/lanes.test.ts`.
- [x] El editor muestra las filas "EQ" (9 estilos) y "Filtro" (11 estilos) debajo de Volumen.
- [x] Los presets aparecen en el orden Auto, Fade, Blend, Rise, Wave, Melt, Slam.
- [x] Cada preset pone en los tres selects los estilos de su receta.
- [x] "Auto" pone Smooth crossfade, Center bass swap y None.
- [x] Con Center bass swap, la preview deja de tener los graves de A y gana los de B a mitad de la ventana.
- [x] Con 3-band fade, primero cambian los agudos, luego los medios y al final los graves.
- [x] Con Low pass filter out, A suena cada vez más apagada hasta el final de la ventana; B no cambia.
- [x] Con High pass filter in, B entra sin graves y los recupera al final de la ventana.
- [x] Con Noise out end, se oye un ruido que crece y se aclara en la segunda mitad de la ventana.
- [x] Con EQ y Filtro en None, la preview suena igual que antes de esta spec.
- [x] Sobre las ondas se ven a la vez la línea azul de volumen, la amarilla de EQ y la rosa de filtro. Un carril que no afecta a una canción no dibuja línea en su onda.
- [x] El EQ en reposo está a media altura y baja al cortar; el low-pass baja desde la mitad y el high-pass sube.
- [x] Con 3-band fade se ven, más tenues, las líneas de medios y agudos.
- [x] El marco de la ventana ya no es azul.
- [x] "Personalizar" en EQ muestra los puntos de la curva de graves en ambas ondas, en amarillo, y atenúa las demás líneas.
- [x] Con "Personalizar" activo en Volumen, pulsar el de Filtro cambia al carril Filtro sin salir del modo.
- [x] Con Low pass filter out, "Personalizar" en Filtro muestra puntos solo en la onda de A.
- [x] Mover un punto de la curva de EQ o Filtro cambia lo que suena tras soltarlo.
- [x] Con una curva de EQ personalizada, el select de EQ muestra "Personalizada" y el chip dice "Custom".
- [x] Elegir otro estilo de EQ descarta la curva de EQ personalizada y mantiene las de Volumen y Filtro.
- [x] Elegir un preset o "Auto" descarta las tres curvas personalizadas.
- [x] "Restablecer curva" de la fila Filtro vuelve a la curva del estilo de Filtro y no toca las otras.
- [x] Cmd/Ctrl+Z deshace un cambio de estilo de EQ o de Filtro y un arrastre de sus puntos.
- [x] "Reproducir mezcla" aplica EQ, Filtro y ruido de cada transición.
- [x] Ningún color está hardcodeado fuera de `src/styles.css`.

---

## Decisiones

- **Sí:** formas, frecuencias y recetas de vimj. Spotify no publica las suyas y vimj es la única reconstrucción completa (confirmado por el usuario).
- **No:** inventar recetas propias. Sin referencia, cualquier valor sería arbitrario.
- **Sí:** recetas de vimj para los 6 presets, aunque Fade y Blend cambien de sonido respecto a la SPEC 01 (confirmado por el usuario).
- **No:** dejar Fade, Blend y Slam solo con volumen. Mezclaría dos criterios en la misma barra de presets.
- **Sí:** Auto = receta completa de Fade, como hasta ahora (confirmado por el usuario).
- **Sí:** "Noise out end" entra aquí, como en vimj. Completa los 11 estilos y lo usará Surge (SPEC 05) (confirmado por el usuario).
- **Sí:** resonancia fija (Q 0,9). Ni Spotify ni vimj documentan un control (confirmado por el usuario).
- **No:** deslizador de resonancia. Sería propio y puede producir picos de volumen.
- **Sí:** EQ isolator con corte total (Linkwitz–Riley en 250 Hz y 3 kHz). Las frecuencias son típicas de mesas de DJ y la suma de bandas es plana (confirmado por el usuario).
- **No:** EQ hasta −26 dB como un Pioneer DJM. Los nombres "cut" y "swap" piden quitar los graves del todo.
- **Sí:** barrido de filtro logarítmico al 80% del recorrido. Así suena como el mando de filtro de una mesa (vimj).
- **Sí:** un botón Personalizar por fila. Amplía lo que ya existe en Volumen sin añadir pestañas (confirmado por el usuario).
- **No:** un solo botón con pestañas de carril. Añade controles nuevos para lo mismo.
- **Sí:** solo la banda de graves es editable. Casi todos los estilos tocan solo los graves, igual que vimj (confirmado por el usuario).
- **No:** las tres bandas editables. Triplica las asas y necesita un selector de banda.
- **Sí:** el estilo fija el tipo de filtro de cada canción. Dibujar no cambia low-pass por high-pass, como en vimj.
- **Sí:** paleta de vimj (volumen azul, EQ amarillo, filtro rosa). El azul del volumen coincide con Spotify (confirmado por el usuario).
- **Sí:** marco de la ventana en blanco al 40%, para que el azul solo signifique volumen (confirmado por el usuario).
- **Sí:** todas las líneas visibles fuera de Personalizar, como Spotify y vimj (confirmado por el usuario).
- **Sí:** medios y agudos tenues solo cuando no están planos (3-band fade). Coherente con "un carril que no afecta no dibuja línea".
- **Sí:** elegir el estilo de un carril descarta solo la curva personalizada de ese carril. Extiende la regla de la SPEC 02 por carril.
- **Sí:** `customizing` pasa de `boolean` a `EditLane | null`. Un solo estado dice si se edita y qué carril.
- **Sí:** nodos de EQ y filtro solo en las voces que los necesitan. Ahorra CPU en la mayoría de la mezcla.
- **Sí:** el ruido se suma después de la ganancia de volumen de A, como en vimj. Así no desaparece cuando A baja de volumen.

---

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| CPU: hasta unos 12 biquads por voz con EQ y filtro | Solo se crean en voces con eventos de ese carril; como mucho suenan 2 voces a la vez. |
| `setValueCurveAtTime` en `frequency` con saltos grandes produce artefactos | Las curvas de Hz salen de cierres suaves (`ease`), muestreados a 256 puntos. |
| La suma de las bandas no es plana si se olvida el all-pass | Se copia la topología exacta de vimj, all-pass de 3 kHz en graves incluido. Se verifica a oído con EQ None frente a la versión sin EQ. |
| Una curva de B que termina cerrada deja el filtro cerrado hasta la siguiente transición | Mismo comportamiento que el volumen en la SPEC 02. Los estilos siempre terminan abiertos o planos en B. |
| Clics al cambiar de transición o en el bucle de preview con el ruido sonando | El ruido pasa por la salida de cada iteración, que ya tiene el fundido de 10 ms de la SPEC 01. |
| El amarillo de `--lane-eq` se parece a `--warning` | Los avisos se muestran en la lista de avisos, no sobre las ondas, así que no comparten espacio. |

---

## Lo que **no** entra en esta spec

- Carril Efectos, looping y los presets Dissolve, Surge y Afterglow (SPEC 05).
- Control de resonancia del filtro.
- Editar medios y agudos del EQ, o realzar bandas.
- Cambiar el tipo de filtro dibujando.
- Exportar la mezcla (SPEC 03).
- Persistencia entre sesiones (SPEC 08).

Cada uno, si llega, va en su propia spec.

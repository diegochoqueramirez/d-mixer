# SPEC 05 — Carril Efectos y Looping

> **Estado:** Implementado
> **Depende de:** SPEC 01, SPEC 02, SPEC 04
> **Fecha:** 2026-10-28
> **Objetivo:** Añadir al editor el carril Efectos (reverb, delay y echo sobre la canción saliente, con curva de envío editable) y el Looping de beats, con las recetas completas de los presets Dissolve, Surge y Afterglow.

---

## Por qué existe esta spec

Spotify Mix tiene cuatro carriles por transición: Volumen, EQ, Filtro y Efectos. Además ofrece un control de Looping. Las SPEC 01–04 cubren los tres primeros carriles. Faltan Efectos, Looping y los tres presets que dependen de ellos.

**Spotify no publica cómo funcionan los efectos ni el looping, ni qué combinan Dissolve, Surge y Afterglow.** La prensa solo menciona "efectos" de forma genérica. La única fuente completa es vimj, que dedujo formas y recetas de los nombres (lo dice en su README). Esta spec adopta los valores de vimj, confirmados por el usuario, salvo el motor de reverb y el del loop, que se adaptan a Web Audio.

Origen de cada funcionalidad:

| Funcionalidad | Origen |
| --- | --- |
| Carril Efectos (cuarto carril) y control de Looping | Spotify Mix |
| Nombres de los 12 estilos de Efectos y las 7 opciones de Looping | vimj (leídos del cliente de Spotify) |
| Efectos y loop solo sobre la canción saliente (A) | vimj |
| Curvas de envío, echo con realimentación 0,55, delay de una repetición, corte de 5 ms | vimj (deducido de los nombres) |
| Bloques de Loop halving y fundido de 4 ms en cada salto | vimj |
| Recetas de Dissolve, Surge y Afterglow | vimj (deducido) |
| Línea blanca del carril Efectos, escala 0 abajo / 1 arriba, marcas ↺ en naranja | vimj |
| Reverb con `ConvolverNode` e impulso generado | Propio (confirmado por el usuario) |
| Una fuente de audio por pasada del loop | Propio (confirmado por el usuario) |

Referencias:

- [Spotify Support — Mixed playlists](https://support.spotify.com/us/article/mixed-playlists/)
- [Johannes Giani — Custom song transitions with Spotify Mix](https://www.johannesgiani.de/en/blog/custom-song-transitions-with-spotify-mix/)
- [vimj — reconstrucción de terceros](https://github.com/lorenzolfm/vimj): `crates/core/src/transition.rs`, `crates/audio/src/dsp.rs`, `crates/audio/src/deck.rs`, `crates/tui/src/editor.rs`

---

## Alcance

**Entra:**

- **Fila "Efectos"** en el editor, debajo de Filtro, con:
  - un select con los 12 estilos más la opción deshabilitada "Personalizada";
  - un botón "Personalizar" / "Listo";
  - un botón "Restablecer curva", visible solo cuando se personaliza ese carril.
- **Fila "Looping"**, debajo de Efectos, con un select de 7 opciones. No tiene "Personalizar" ni curva.
- **Estilos de Efectos** (nombres en inglés, como los demás carriles): Reverb out center, Reverb cut end, Reverb out end, Delay ½ cut end, Delay ¾ cut end, Echo ½ cut end, Echo ½ out end, Echo ¾ cut end, Echo ¾ out end, Echo 1 cut end, Echo 1 out end y None.
- **Opciones de Looping:** 1 beat loop, 2 beat loop, 4 beat loop, 8 beat loop, 16 beat loop, Loop halving y None.
- **Sonido:**
  - Los efectos y el loop actúan solo sobre A. B nunca lleva efecto ni loop.
  - Reverb con `ConvolverNode` y un impulso estéreo generado que decae en unos 2,5 s.
  - Echo: repeticiones cada ½, ¾ o 1 beat de A que se apagan poco a poco. Delay: una sola repetición.
  - Los efectos "out" siguen sonando después de la ventana. Los "cut" se cortan al final de la ventana con un fundido de 5 ms.
  - El loop repite A desde el inicio de la ventana hasta su final, con un fundido de 4 ms en cada salto.
  - Se aplica en la preview, en "Reproducir mezcla" y en todo lo que use `buildTimeline`.
- **Presets con receta completa** (los seis de la SPEC 04 llevan Efectos None y Looping None):

  | Preset | Volumen | EQ | Filtro | Efectos | Looping |
  | --- | --- | --- | --- | --- | --- |
  | Dissolve | Crossfade | Center bass swap | Low pass filter out | Reverb out end | None |
  | Surge | Fade in cut out | End bass swap | Noise out end | None | 4 beat loop |
  | Afterglow | Smooth crossfade | Center bass swap | High pass filter out | Echo ¾ out end | None |

  - Orden de los botones: Auto, Fade, Blend, Rise, Wave, Melt, Slam, Dissolve, Surge, Afterglow.
  - Slam sigue siendo solo Center cut, como en vimj.
  - Auto sigue siendo la receta completa de Fade.
- **Línea del carril Efectos** sobre la onda de A, siempre visible si el estilo no es None. Es blanca y representa el envío (send).
- **Loop visible en la onda de A:**
  - Dentro de la ventana, la onda de A muestra lo que realmente suena: cada pasada vuelve a dibujar A desde el inicio de la ventana.
  - Las repeticiones se dibujan con el color atenuado de la onda.
  - Cada salto lleva una marca ↺ en naranja.
- **Personalizar** del carril Efectos (extiende la SPEC 02 y la SPEC 04):
  - Se edita una sola curva de envío, solo en la onda de A.
  - El tipo de efecto (reverb, echo o delay) y su "out" o "cut" los fija el estilo y no cambian al dibujar.
  - Con Efectos None no hay curva ni puntos. Para dibujar un envío hay que elegir antes un estilo.
  - Se reutilizan los puntos, tramos, snap, teclado, límite de 32 puntos, deshacer/rehacer y navegación entre transiciones.
- **Reglas de reemplazo:**
  - Elegir un estilo de Efectos descarta solo la curva personalizada de Efectos.
  - Cambiar el Looping no descarta ninguna curva.
  - Elegir un preset o "Auto" descarta las cuatro curvas personalizadas y pone los cinco campos de su receta.
  - "Restablecer curva" de la fila Efectos vuelve a la curva del estilo.
  - El chip dice el nombre del preset solo si los cinco campos coinciden con su receta y no hay curvas personalizadas. Si no, dice "Custom".
- **Paleta:** se añaden `--lane-effect` y `--lane-loop`.
- **Tests unitarios** con Vitest de estilos, bloques de loop, pasadas, timeline y chip.

**Fuera de alcance:**

- Efectos o loop sobre la canción entrante (B).
- Parámetros ajustables de los efectos: tamaño de sala, realimentación del echo o nivel de la reverb.
- Archivos de impulso de salas reales.
- Alargar la preview para oír la cola completa de los efectos "out".
- Aviso cuando se combinan EQ y efectos.
- Loop sobre un tramo elegido a mano, o loops que no empiezan en el inicio de la ventana.
- Marcas del loop en la vista general (minimapas).
- Exportar la mezcla (SPEC 03).
- Persistencia entre sesiones (SPEC 08).

---

## Modelo de datos

```ts
// src/types.ts
export type EffectStyle =
  | 'reverb-out-center' | 'reverb-cut-end' | 'reverb-out-end'
  | 'delay-half-cut-end' | 'delay-three-quarter-cut-end'
  | 'echo-half-cut-end' | 'echo-half-out-end'
  | 'echo-three-quarter-cut-end' | 'echo-three-quarter-out-end'
  | 'echo-one-cut-end' | 'echo-one-out-end'
  | 'none';

export type EffectKind = 'reverb' | 'echo' | 'delay';

export type LoopStyle = 'loop-1' | 'loop-2' | 'loop-4' | 'loop-8' | 'loop-16' | 'loop-halving' | 'none';

export type EditLane = 'volume' | 'eq' | 'filter' | 'effect';

export type TransitionPreset =
  | 'fade' | 'blend' | 'rise' | 'wave' | 'melt' | 'slam'
  | 'dissolve' | 'surge' | 'afterglow';

export interface Transition {
  // ...campos de SPEC 01, 02 y 04
  effect: EffectStyle;
  looping: LoopStyle;
  customEffect: GainCurve | null;   // curva de envío de A; null = usa el estilo `effect`
}
```

`TimelineEntry` gana dos eventos opcionales, solo en la entrada de A:

```ts
export interface EffectEvent {
  time: number;          // inicio de la ventana (contexto)
  duration: number;      // duración de la ventana
  kind: EffectKind;
  delay: number;         // segundos entre repeticiones; 0 para reverb
  feedback: number;      // 0,55 echo; 0 delay y reverb
  send: Float32Array;    // CURVE_SAMPLES valores de envío, 0..1
  ringsOut: boolean;     // true = "out"; false = "cut"
}

/** Cada salto del loop: desde `time`, A vuelve a sonar desde `audioStart` durante `duration` s. */
export interface LoopEvent {
  audioStart: number;    // posición de A al inicio de la ventana (= transition.outStart)
  jumps: { time: number; duration: number }[];
}

export interface TimelineEntry {
  // ...campos actuales
  effectOut?: EffectEvent;
  loopOut?: LoopEvent;
}
```

### Curvas de envío de los efectos

Todas usan `GainCurve` (SPEC 02) con tramos `ease: true` y `bend` 0, como las de la SPEC 04. 0 = nada de envío y 1 = envío completo.

- `CENTER` = (0,0) (0.485,1) (0.515,0) (1,0). El envío sube hasta la mitad y se corta; la reverb suena sola desde ahí.
- `UP` = (0,0) (1,1).
- `LATE` = (0,0) (0.5,0) (0.9,1) (1,1).

| Estilo | Tipo | Repetición | Envío en A | Al terminar la ventana |
| --- | --- | --- | --- | --- |
| Reverb out center | reverb | — | `CENTER` | sigue sonando |
| Reverb cut end | reverb | — | `UP` | se corta |
| Reverb out end | reverb | — | `UP` | sigue sonando |
| Delay ½ cut end | delay | ½ beat | `LATE` | se corta |
| Delay ¾ cut end | delay | ¾ beat | `LATE` | se corta |
| Echo ½ cut end | echo | ½ beat | `LATE` | se corta |
| Echo ½ out end | echo | ½ beat | `LATE` | sigue sonando |
| Echo ¾ cut end | echo | ¾ beat | `LATE` | se corta |
| Echo ¾ out end | echo | ¾ beat | `LATE` | sigue sonando |
| Echo 1 cut end | echo | 1 beat | `LATE` | se corta |
| Echo 1 out end | echo | 1 beat | `LATE` | sigue sonando |
| None | — | — | — | — |

El beat es el de A: `delay = beats · 60 / bpmA` segundos. Durante la ventana, A suena a velocidad 1 (lo garantiza la validación de la SPEC 01).

### Bloques del loop

La ventana dura `W = bars · 4` beats de A. Cada bloque cubre una fracción de la ventana y repite A desde el inicio de la ventana cada `período` beats:

| Opción | Bloques (inicio–fin de la ventana → período) |
| --- | --- |
| 1, 2, 4, 8 o 16 beat loop | 0–1 → 1, 2, 4, 8 o 16 beats |
| Loop halving | 0–0,5 → W/8; 0,5–0,75 → W/16; 0,75–0,875 → W/32; 0,875–1 → W/64 |
| None | sin bloques |

- Hay un salto al inicio de cada pasada, salvo la primera de la ventana: ahí A sigue sonando sin saltar.
- Si el período es mayor o igual que la ventana, no hay saltos y suena igual que None.
- Loop halving produce 4 pasadas en cada uno de los tres primeros bloques y 8 en el último: 20 en total, 19 saltos.
- Como mucho hay 64 pasadas: 1 beat loop con 16 compases.

### De curva a sonido

- **Envío:** toma la señal de A después del EQ y el filtro y antes de la ganancia de volumen. Así el efecto puede seguir sonando cuando A baja de volumen, como en vimj.
- **Retorno:** el efecto se suma a la salida después de la ganancia de volumen de A, igual que el ruido de la SPEC 04.
- **Cadena de A:** fuente(s) → EQ → filtro → ganancia de volumen → salida. Además, filtro → envío → efecto → nivel de retorno → salida.
- **Reverb:**
  - Un `ConvolverNode` con `normalize: true`.
  - El impulso es ruido blanco estéreo, con canales independientes, multiplicado por un decaimiento exponencial que llega a −60 dB a los 2,5 s.
  - Se genera una vez por `AudioContext` y se reutiliza.
- **Echo y delay:**
  - Un `DelayNode` (`maxDelayTime` 2 s) con `delayTime = delay`.
  - Un `GainNode` de realimentación con `feedback`: 0,55 en echo y 0 en delay.
- **Final de la ventana:**
  - "cut": el nivel de retorno baja a 0 en 5 ms.
  - "out": el retorno sigue. Los nodos se desconectan cuando muere la cola: 2,5 s en reverb y `12 · delay` en echo (0,55¹² ≈ −62 dB).
  - `stop()` del motor corta las colas con el fundido de 10 ms de la SPEC 01.
- **Loop:**
  - La fuente principal de A suena hasta el primer salto.
  - En cada salto empieza un `AudioBufferSourceNode` nuevo desde `audioStart`, con fundido de entrada de 4 ms. La fuente anterior sigue 4 ms más mientras se apaga.
  - Todas las fuentes de A entran en el mismo nodo de entrada, así que EQ, filtro, volumen y envío no cambian.
  - Al final de la ventana, A se detiene como hoy (`stopAt`).
- El envío se muestrea con `CURVE_SAMPLES` (256) y se aplica con `setValueCurveAtTime`. Solo se crean los nodos de efecto si la entrada tiene `effectOut`.

### Escala vertical de la línea de Efectos

Igual que Volumen: valor 0 abajo y valor 1 arriba de la onda (vimj). En Personalizar, arrastrar un punto usa la misma escala.

### Chip y presets

- `PRESETS` pasa a `Record<TransitionPreset, { label: string; volume: VolumeStyle; eq: EqStyle; filter: FilterStyle; effect: EffectStyle; looping: LoopStyle }>`.
- `chipLabel`: el nombre del preset cuando los cinco campos coinciden con su receta y `customVolume`, `customEq`, `customFilter` y `customEffect` son `null`. Si no, "Custom". "Auto" si `auto`.

---

## Estilo visual

- **Tokens nuevos en `src/styles.css`** (colores de vimj):
  - `--lane-effect: #f0f0f0`, RGB (240,240,240);
  - `--lane-loop: #ff913c`, RGB (255,145,60).
- **Línea de Efectos:** 2px, solo en la onda de A.
- **Orden de dibujo:** medios/agudos del EQ, filtro, EQ (graves), efectos y volumen. Volumen sigue encima, como en la SPEC 04. En Personalizar, el carril activo va encima y los demás al 35% de opacidad.
- **Loop:**
  - Las repeticiones de A se dibujan con `--wave-dim`.
  - Cada salto lleva una línea vertical de 1px y un "↺" arriba, ambos en `--lane-loop`.
- **Filas Efectos y Looping:** misma estructura que las filas de la SPEC 04 (`lane-row`, `lane-label`, `lane-actions`). La fila Looping solo tiene el select.
- **Presets:** los 10 botones caben en la fila que ya existe porque `.presets` hace salto de línea. Se verifica a 375 px.
- Sin colores fuera de `src/styles.css`.

---

## Estructura de archivos

```
src/
  types.ts              # + EffectStyle, EffectKind, LoopStyle; EditLane + 'effect'; TransitionPreset + 3;
                        #   Transition.effect/looping/customEffect; EffectEvent, LoopEvent
  state.ts              # setEffectStyle, setLoopStyle; toggleCustomize('effect'); updateCustomCurve('effect', 'out', curve);
                        #   resetCurve('effect')
  lib/
    effects.ts          # NUEVO: EFFECT_STYLES, LOOP_STYLES, etiquetas, effectShape(style), effectSamples(t),
                        #   loopBlocks(style, windowBeats), loopJumps(t, bpmA, tOut)
    effects.test.ts     # NUEVO
    curves.ts           # PRESETS con 5 campos; PRESET_ORDER + Dissolve, Surge, Afterglow; chipLabel
    timeline.ts         # emite effectOut y loopOut en la entrada de A
    fixtures.ts         # campos nuevos con effect/looping 'none'
  audio/
    effectNodes.ts      # NUEVO: impulso de reverb, convolver, echo/delay con realimentación, retorno con corte
    engine.ts           # envío y retorno en la voz de A; fuentes por pasada del loop con fundidos de 4 ms
  ui/
    editor.ts           # filas Efectos y Looping; botones Dissolve, Surge y Afterglow
    waveform.ts         # línea de Efectos; onda de A con el loop, repeticiones atenuadas y marcas ↺
    curveEditor.ts      # edita el carril Efectos solo en la onda de A
  styles.css            # --lane-effect, --lane-loop
```

---

## Plan de implementación

1. `src/types.ts`, `src/state.ts` y `src/lib/fixtures.ts`: tipos nuevos; `effect: 'none'`, `looping: 'none'` y `customEffect: null` en `defaultTransition` y fixtures. `sameTransition` compara los campos nuevos. La app suena igual.
2. `src/lib/effects.ts` con estilos, etiquetas, `effectShape` y `effectSamples` (usa `customEffect` si existe). Tests:
   - cada estilo tiene tipo, repetición, envío y "out"/"cut" de la tabla;
   - None devuelve `null`;
   - una curva personalizada reemplaza la del estilo.
3. `src/lib/effects.ts`: `loopBlocks` y `loopJumps`. Tests:
   - 4 beat loop con 8 compases a 120 BPM salta cada 2 s, 7 veces;
   - Loop halving con 8 compases produce 19 saltos y sus períodos se reducen a la mitad en cada bloque;
   - 16 beat loop con 1 compás no produce saltos.
4. `src/lib/timeline.ts`: emitir `effectOut` y `loopOut` en la entrada de A. Tests:
   - Echo ¾ out end produce `delay` = ¾ de beat de A y `feedback` 0,55;
   - Delay ½ cut end produce `feedback` 0;
   - B nunca tiene eventos de efecto ni de loop;
   - con None no hay eventos.
5. `src/audio/effectNodes.ts` + `src/audio/engine.ts`: impulso de reverb, echo y delay, envío antes del volumen, retorno después, corte de 5 ms o cola. Prueba manual cambiando en local la transición por defecto: Reverb out end deja sonar la cola tras la ventana y Echo ½ cut end se corta al final.
6. `src/audio/engine.ts`: fuentes por pasada del loop con fundidos de 4 ms. Prueba manual: 1 beat loop repite el primer beat de la ventana sin clics.
7. `src/state.ts`: `setEffectStyle` (descarta `customEffect`), `setLoopStyle`, `resetCurve('effect')`, `updateCustomCurve('effect', 'out', curve)` y `toggleCustomize('effect')`. Todas pasan por el historial.
8. `src/lib/curves.ts`: `PRESETS` con cinco campos, `PRESET_ORDER` con Dissolve, Surge y Afterglow, `chipLabel` con los cinco campos y las cuatro curvas. `applyPreset` y `resetToAuto` aplican los cinco y descartan las cuatro curvas. Tests del chip.
9. `src/ui/editor.ts`: filas Efectos (select, "Personalizar", "Restablecer curva") y Looping (select); botones Dissolve, Surge y Afterglow.
10. `src/styles.css` + `src/ui/waveform.ts`: tokens nuevos y línea de Efectos en la onda de A, con su orden de dibujo.
11. `src/ui/waveform.ts`: onda de A con el loop: cada pasada desde el inicio de la ventana, repeticiones atenuadas y marcas ↺.
12. `src/ui/curveEditor.ts`: editar el envío solo en la onda de A, con escala 0–1 y color `--lane-effect`; sin asas con Efectos None.

---

## Criterios de aceptación

- [x] `npm test` pasa, incluidos los tests nuevos de `src/lib/effects.test.ts`.
- [x] El editor muestra las filas "Efectos" (12 estilos) y "Looping" (7 opciones) debajo de Filtro.
- [x] La fila Looping no tiene botón "Personalizar".
- [x] Los presets aparecen en el orden Auto, Fade, Blend, Rise, Wave, Melt, Slam, Dissolve, Surge, Afterglow.
- [x] Cada preset pone en los cinco selects los valores de su receta.
- [x] Fade, Blend, Rise, Wave, Melt, Slam y Auto ponen Efectos None y Looping None.
- [x] Con Reverb out end, la reverb crece durante la ventana y sigue sonando después de que A se calla.
- [x] Con Reverb cut end, la reverb se calla al final de la ventana, sin clic.
- [x] Con Reverb out center, el envío se corta a mitad de la ventana y desde ahí solo suena la cola.
- [x] Con Echo 1 out end, en la segunda mitad de la ventana se oyen repeticiones cada beat de A, y siguen apagándose tras la ventana.
- [x] Con Delay ½ cut end, cada sonido se repite una sola vez, medio beat después.
- [x] B nunca suena con efecto ni con loop.
- [x] Con 4 beat loop, A repite los 4 primeros beats de la ventana hasta su final, sin clics en los saltos.
- [x] Con Loop halving, el loop se acorta a la mitad al pasar por el 50%, el 75% y el 87,5% de la ventana.
- [x] Con Efectos None y Looping None, la preview suena igual que antes de esta spec.
- [x] Sobre la onda de A se ve la línea blanca de Efectos. Con Efectos None no se ve.
- [x] Con un loop, la onda de A muestra las repeticiones atenuadas y una marca ↺ naranja en cada salto.
- [x] "Personalizar" en Efectos muestra puntos solo en la onda de A y atenúa las demás líneas.
- [x] Con Efectos None, "Personalizar" en Efectos no muestra puntos.
- [x] Mover un punto del envío cambia lo que suena tras soltarlo.
- [x] Con una curva de envío personalizada, el select de Efectos muestra "Personalizada" y el chip dice "Custom".
- [x] Elegir otro estilo de Efectos descarta solo la curva de Efectos.
- [x] Cambiar el Looping no descarta ninguna curva personalizada.
- [x] Elegir un preset o "Auto" descarta las cuatro curvas personalizadas.
- [x] Cmd/Ctrl+Z deshace un cambio de Efectos, de Looping y un arrastre del envío.
- [x] "Reproducir mezcla" aplica los efectos y el loop de cada transición.
- [x] Los 10 botones de presets se ven completos a 375 px.
- [x] Ningún color está hardcodeado fuera de `src/styles.css`.

---

## Decisiones

- **Sí:** nombres, formas de envío, tipos de efecto y bloques de loop de vimj. Spotify no publica los suyos y vimj es la única reconstrucción completa.
- **Sí:** recetas de vimj para Dissolve, Surge y Afterglow (confirmado por el usuario).
- **No:** dejar los carriles sin presets nuevos. Dejaría incompleta la barra de presets de Spotify.
- **Sí:** Slam sigue siendo solo Center cut, como en vimj.
- **Sí:** efectos y loop solo sobre A, como en vimj. Los nombres "out" y "cut end" hablan de la canción que se va.
- **Sí:** reverb con `ConvolverNode` e impulso generado de unos 2,5 s (confirmado por el usuario). Es nativo y barato, no necesita archivos y funciona en `OfflineAudioContext` para la SPEC 03.
- **No:** Freeverb con nodos nativos. Son unos 50 nodos por voz para un resultado parecido.
- **No:** impulso de una sala real en un archivo. Añade peso y una licencia que revisar.
- **Sí:** curva de envío editable en Personalizar, una sola y en A (confirmado por el usuario). Reutiliza la SPEC 02 y la SPEC 04 sin controles nuevos.
- **Sí:** el estilo fija el tipo de efecto y si es "out" o "cut". Dibujar solo cambia el envío, como en el Filtro de la SPEC 04.
- **Sí:** Looping como fila con select y sin curva (confirmado por el usuario). Un loop no tiene un valor que varíe en el tiempo.
- **Sí:** marcas ↺ y repeticiones atenuadas en la onda de A (confirmado por el usuario). Sin ellas, la onda mostraría audio que no suena.
- **Sí:** una `AudioBufferSourceNode` por pasada con fundidos de 4 ms (confirmado por el usuario). Es exacto, no hace clic y sirve para `OfflineAudioContext`.
- **No:** `loop` nativo de `AudioBufferSourceNode`. No tiene fundido y Loop halving necesitaría cambiar `loopEnd` sobre la marcha.
- **Sí:** el envío sale antes de la ganancia de volumen y el retorno entra después, como en vimj. Así el efecto puede seguir sonando cuando A baja.
- **Sí:** echo con realimentación 0,55 y delay con una sola repetición (vimj).
- **Sí:** línea de Efectos blanca (`#f0f0f0`) y marcas de loop naranjas (`#ff913c`), de vimj (confirmado por el usuario).
- **Sí:** el volumen sigue dibujándose encima de todo, como en la SPEC 04. La línea de Efectos va justo debajo.
- **Sí:** la preview mantiene 2 compases tras la ventana (confirmado por el usuario). A 120 BPM son 4 s, suficiente para casi toda la cola.
- **No:** alargar la preview hasta que muera la cola. Haría el bucle más largo para cada cambio.
- **No:** aviso al combinar EQ y efectos (confirmado por el usuario). Dissolve y Afterglow ya los combinan.
- **Sí:** cambiar el Looping no descarta curvas. El loop no tiene curva propia y no afecta a las de los carriles.

---

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| La reverb suena demasiado fuerte o débil con `normalize: true` | Se compara a oído con Dissolve. Si hace falta, se añade una constante `REVERB_LEVEL` en `src/audio/effectNodes.ts` y se anota en la bitácora. |
| Una cola "out" se solapa con la siguiente transición si las canciones son cortas | Es lo esperado: el efecto suena sobre B. Los nodos se desconectan cuando muere la cola. |
| Hasta 64 fuentes por ventana con 1 beat loop y 16 compases | Se crean al programar la ventana y solo hay una sonando, más 4 ms de solape. |
| Clics en los saltos del loop si los fundidos no se solapan bien | Fundidos de 4 ms con rampas lineales que se cruzan. Test manual con 1 beat loop. |
| El echo con realimentación se acumula con el loop y sube de nivel | La realimentación de 0,55 es menor que 1, así que el nivel está acotado. Se escucha Surge con Echo para comprobarlo. |
| La cola sigue sonando al reiniciar la preview | Se corta con el fundido de 10 ms de la SPEC 01 (confirmado por el usuario). |
| Dibujar la onda de A con el loop complica `waveform.ts` | Se usa una función pura que convierte tiempo en posición de audio a partir de `loopJumps`, con tests en `effects.test.ts`. |
| 10 botones de preset no caben en móvil | `.presets` hace salto de línea; está en los criterios a 375 px. |

---

## Lo que **no** entra en esta spec

- Efectos o loop sobre la canción entrante.
- Parámetros ajustables de los efectos (sala, realimentación, nivel).
- Archivos de impulso de salas reales.
- Alargar la preview para la cola de los efectos.
- Aviso al combinar EQ y efectos.
- Loops sobre un tramo elegido a mano.
- Marcas del loop en los minimapas.
- Exportar la mezcla (SPEC 03).
- Persistencia entre sesiones (SPEC 08).

Cada uno, si llega, va en su propia spec.

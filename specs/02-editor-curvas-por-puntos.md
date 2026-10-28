# SPEC 02 — Editor de curvas de volumen por puntos ("Personalizar")

> **Estado:** Implementado
> **Depende de:** SPEC 01
> **Fecha:** 2026-10-28
> **Objetivo:** Un modo "Personalizar" en el editor de transiciones para dibujar la curva de volumen de cada canción con puntos, tramos suavizados y curvados, deshacer/rehacer y navegación entre transiciones, como el Customize de Spotify Mix y su reconstrucción vimj.

---

## Por qué existe esta spec

En Spotify Mix, cada carril (Volumen, EQ, Filtro, Efectos) parte de un estilo predefinido. Con **Customize** se edita su curva a mano: se mueven, añaden y borran puntos, se suavizan o curvan los tramos y se ajusta todo al beat.

La SPEC 01 dejó la base preparada:

- Las curvas se muestrean a `Float32Array` y se aplican con `setValueCurveAtTime`.
- La curva amarilla ya se dibuja sobre cada onda.

Esta spec añade la edición manual solo para el carril **Volumen**, que es el único que existe hoy. EQ y Filtro (SPEC 04) reutilizarán el mismo modelo de curva.

Origen de cada funcionalidad:

| Funcionalidad | Origen |
| --- | --- |
| Modo Customize, arrastrar puntos sobre la curva | Spotify Mix (confirmado por prensa) |
| Añadir/borrar puntos, extremos fijos, tramos suaves y curvados, snap a beats, medios beats y centro, deshacer/rehacer, atajos (inicio/fin, 25%, compás, `<` `>`, ease), nudge fino, navegar entre transiciones | vimj (reconstrucción de terceros) |
| Asa central de tramo, control por Tab y flechas, límite de 32 puntos | Propio |

Referencias:

- [Engadget — How to use Spotify Mix](https://www.engadget.com/2216279/how-to-use-spotify-mix-tool/)
- [Softonic — fine-tune transitions](https://en.softonic.com/articles/spotify-updates-mixed-playlists-you-can-now-fine-tune-transitions)
- [vimj — reconstrucción de terceros del editor de curvas](https://github.com/lorenzolfm/vimj)

---

## Alcance

**Entra:**

- **Botón "Personalizar"** en la fila del carril Volumen del editor. Activa el modo personalizar.
  - El botón pasa a decir "Listo" y vuelve al modo normal.
  - Junto a él aparece "Restablecer curva".
- **En modo personalizar:**
  - Las ondas **no se deslizan**. Los `lane-hit` se desactivan, igual que las flechas de nudge y el overview.
  - Sobre cada onda, los puntos de su curva aparecen como asas circulares. La curva de A (salida) se edita en la onda de arriba y la de B (entrada) en la de abajo.
  - En el centro de cada tramo hay un asa pequeña cuadrada.
- **Operaciones sobre puntos:**
  - **Mover:** arrastrar el punto.
    - **X:** snap al beat, al medio beat del grid de A y al centro de la ventana (x = 0,5). Shift lo mueve libre.
    - **Y:** volumen libre de 0% a 100%.
    - Un punto no puede cruzar a sus vecinos.
  - **Añadir:** doble clic sobre la curva o en la zona de la onda. El punto nuevo cae en esa X (con snap) y en la Y que tenga la curva ahí.
  - **Borrar:** Supr/Retroceso con el punto enfocado, o doble clic sobre el punto.
  - **Extremos:** el primer punto (x = 0) y el último (x = 1) no se borran ni se mueven en X. Su volumen sí se puede editar.
  - **Límite:** 32 puntos por curva. Al llegar al límite, añadir no hace nada y se muestra "Máximo 32 puntos por curva".
- **Operaciones sobre tramos** (asa central):
  - Arrastrar el asa arriba o abajo cambia la **curvatura** (`bend`, de −1 a 1). El asa sigue el valor real de la curva en el centro del tramo.
  - Doble clic en el asa alterna el tramo entre **recto** y **suave** (`ease`).
- **Teclado** (con un punto enfocado):
  - Tab / Shift+Tab recorre los puntos: primero los de A, luego los de B.
  - Inicio / Fin saltan al primer / último punto de la misma curva.
  - ← / → mueven un beat; Shift+← / → medio beat; Alt+← / → un compás.
  - , / . mueven 10 ms (nudge fino, sin snap).
  - ↑ / ↓ cambian el volumen un 5%; Shift+↑ / ↓ un 25%.
  - `<` / `>` curvan en −0,1 / +0,1 el tramo que sigue al punto (en el último punto, el tramo anterior).
  - E alterna recto / suave en ese mismo tramo.
  - Supr / Retroceso lo borran, salvo en los extremos.
  - Enter añade un punto a mitad del tramo siguiente.
  - Las asas de tramo también son enfocables: ↑ / ↓ cambian `bend` en 0,1 y Enter alterna `ease`.
- **Navegar entre transiciones** sin cerrar el editor:
  - Botones ‹ › junto al título "Transición N de M", y teclas `[` / `]`.
  - En la primera transición ‹ está deshabilitado; en la última, ›.
  - Si hay cambios sin guardar, pregunta "¿Guardar cambios antes de cambiar de transición?" con tres opciones: "Guardar", "Descartar" y "Seguir editando". El foco inicial queda en "Guardar".
  - Al cambiar de transición se vacía el historial, el modo Personalizar se mantiene y la preview arranca en bucle con la nueva transición.
- **Deshacer / rehacer** de **todo el borrador del editor**: puntos, curvas, compases, presets y estilo.
  - Botones ↶ ↷ en la barra superior del editor.
  - Atajos: Cmd/Ctrl+Z y Shift+Cmd/Ctrl+Z.
  - Máximo 100 pasos. El historial se vacía al guardar, al descartar o al cerrar.
  - Un arrastre completo cuenta como un solo paso.
- **Integración con SPEC 01:**
  - **Al entrar por primera vez en Personalizar,** la curva parte del estilo de Volumen actual (ver "Curva inicial desde el estilo").
  - **Una curva personalizada deja la transición en "Custom":** el chip lo dice, ningún preset aparece activo y el select de Volumen muestra "Personalizada".
  - **Elegir un preset, un estilo de Volumen o "Auto"** reemplaza la curva personalizada sin preguntar. Se puede deshacer.
  - **"Restablecer curva"** vuelve a la curva inicial del estilo actual.
  - **Cambiar los compases** conserva la curva: los puntos están en posición relativa a la ventana y se estiran o encogen con ella.
  - **La preview en bucle** se reinicia al soltar un arrastre de punto o asa y tras cada cambio por teclado.
  - **"Reproducir mezcla"** y la preview usan la curva personalizada en lugar de la del estilo.
- **Tests unitarios** con Vitest de toda la lógica de curvas.

**Fuera de alcance:**

- Curvas de EQ, Filtro y Efectos (SPEC 04 y 05 reutilizarán este modelo).
- Copiar y pegar curvas entre transiciones, o guardar curvas propias como presets.
- Vincular las curvas de A y B (editar una y reflejar la otra).
- Zoom de la vista para editar con más precisión.
- Selección múltiple de puntos.
- Persistencia entre sesiones (SPEC 08).

---

## Modelo de datos

```ts
// src/types.ts
export interface GainPoint {
  x: number; // 0..1, posición relativa dentro de la ventana de transición
  y: number; // 0..1, ganancia
}

export interface SegmentShape {
  ease: boolean; // false = recto, true = suave (smoothstep)
  bend: number;  // -1..1; 0 = sin curvatura
}

export interface GainCurve {
  points: GainPoint[];       // ordenados por x; points[0].x = 0 y points.at(-1).x = 1; 2..32 puntos
  segments: SegmentShape[];  // segments.length === points.length - 1
}

export interface Transition {
  // ...campos de SPEC 01
  customVolume: { out: GainCurve; in: GainCurve } | null; // null = usa el estilo `volume`
}

export interface EditorState {
  pairIndex: number;
  draft: Transition;
  dirty: boolean;
  customizing: boolean;      // modo Personalizar activo
  past: Transition[];        // historial para deshacer (máx. 100)
  future: Transition[];      // historial para rehacer
}
```

`chipLabel` (SPEC 01) cambia así: si `customVolume !== null` → "Custom" (salvo que `auto` sea true, que nunca coincide con una curva personalizada).

### Evaluación de una curva

Para `x` dentro del tramo `i`, entre `p0` y `p1`:

- `t = (x − p0.x) / (p1.x − p0.x)`.
- **Curvatura:** `k = 2^(−2·bend)`, así `bend = 1` da `k = 0.25` (cóncava) y `bend = −1` da `k = 4` (convexa). Luego `t₁ = t^k`.
- **Suavizado:** si `ease`, `t₂ = t₁²·(3 − 2·t₁)`; si no, `t₂ = t₁`.
- `y = p0.y + (p1.y − p0.y) · t₂`.

`sampleGainCurve(curve, n = 256)` devuelve el `Float32Array` que consumen el motor y el dibujo. Sustituye a `sampleCurve(style)` cuando hay `customVolume`.

### Curva inicial desde el estilo

`curveFromStyle(style)` crea las dos curvas (`out` e `in`) con puntos de quiebre exactos:

| Estilo | Puntos de `out` | Puntos de `in` |
| --- | --- | --- |
| `crossfade` | (0,1) (1,0) | (0,0) (1,1) |
| `smooth-crossfade` | (0,1) (0.5, √2/2) (1,0); bends −0,477 y −0,077 | (0,0) (0.5, √2/2) (1,1); bends 0,074 y 0,4 (segundo tramo suave) |
| `overlap` | (0,1) (0.99,1) (1,0) | (0,1) (1,1) |
| `fade-in-fade-out` | (0,1) (0.5,1) (1,0) | (0,0) (0.5,1) (1,1) |
| `cut-in-fade-out` | (0,1) (1,0) | (0,1) (1,1) |
| `fade-in-cut-out` | (0,1) (0.99,1) (1,0) | (0,0) (1,1) |
| `center-cut` | (0,1) (0.49,1) (0.5,0) (1,0) | (0,0) (0.49,0) (0.5,1) (1,1) |
| `fade-in-fast-out` | (0,1) (0.25,0) (1,0) | (0,0) (1,1) |

Todos los tramos empiezan con `ease: false` y `bend` 0, salvo en `smooth-crossfade`. Ahí los bends se ajustaron offline a cos/sin: error máximo de 0,3% en `out` y 1,03% en `in`.

### Snap

- La ventana dura `bars · 4` beats de A.
- Grid de X: `k / (bars · 8)` para k entero, es decir, beats y medios beats en coordenadas relativas. El centro, x = 0,5, ya cae en este grid porque `bars · 4` siempre es par; se lista explícitamente por si el grid cambia.
- Nudge fino: `Δx = 0,010 / D` (10 ms en relación con la duración de la ventana).
- Snap = el múltiplo más cercano, limitado al hueco entre los dos puntos vecinos. Separación mínima: 1/1000 de la ventana.

### Historial

- `updateDraft`, `applyPreset`, `setVolumeStyle`, `resetToAuto` y las acciones de curva guardan el borrador anterior en `past` y vacían `future`.
- Durante un arrastre, solo el primer cambio guarda en `past`, gracias a la bandera `beginGesture`/`endGesture`. Así un arrastre cuenta como un paso.
- `undo` saca de `past` y empuja a `future`; `redo`, al revés.

---

## Estilo visual

- **Puntos:** círculos de 12px (área táctil de 28px) con relleno `--gain-curve` y borde 2px `--surface`. Al enfocarlos o pasar el ratón llevan un anillo 2px `--focus`.
- **Asas de tramo:** cuadrados de 8px con borde `--gain-curve` y relleno `--surface`. En tramos suaves (`ease`), rellenos de `--gain-curve`.
- **Ondas en modo personalizar:** dentro de la ventana se dibujan con 60% de opacidad para que destaque la curva.
- **Cursores:** en modo personalizar la zona de las ondas usa `crosshair`, y los puntos `grab` / `grabbing`.
- **Botones de la fila de Volumen:** "Personalizar" / "Listo" es un `pill-btn`; con el modo activo, fondo `--text` y texto `--bg`. "Restablecer curva" es un `pill-btn` normal y solo se ve en modo personalizar.
- **Deshacer / rehacer:** `icon-btn` ↶ ↷ en la barra superior del editor, entre X y el título. Se deshabilitan cuando no hay historial.
- **Navegación:** `icon-btn` ‹ › a ambos lados del título "Transición N de M".
- **Confirmación de cambio de transición:** usa la misma caja que "¿Descartar cambios?" de SPEC 01, con tres botones: "Seguir editando" (`pill-btn`), "Descartar" (`danger-btn`) y "Guardar" (`save-btn`).
- **Límite de puntos:** el mensaje "Máximo 32 puntos por curva" usa el estilo `issue--warning`.
- Sin colores nuevos: todo sale de las variables de `src/styles.css`.

---

## Estructura de archivos

```
src/
  types.ts              # + GainPoint, SegmentShape, GainCurve; Transition.customVolume; EditorState.customizing/past/future
  state.ts              # + toggleCustomize, updateCustomCurve, resetCurve, undo, redo, beginGesture/endGesture, goToPair
  lib/
    gainCurve.ts        # NUEVO: evaluateGainCurve, sampleGainCurve, curveFromStyle, snapX, addPoint, movePoint, deletePoint, setBend, toggleEase
    gainCurve.test.ts   # NUEVO
    curves.ts           # chipLabel con customVolume; helper volumeSamples(transition)
    timeline.ts         # usa volumeSamples(transition) en lugar de sampleCurve(transition.volume)
  ui/
    curveEditor.ts      # NUEVO: capa de asas (puntos y tramos) sobre la vista alineada, arrastre y teclado
    waveform.ts         # expone geometría (xAt/yAt por carril) y desactiva arrastre de ondas en modo personalizar
    editor.ts           # botón Personalizar/Listo, Restablecer curva, ↶ ↷, ‹ › entre transiciones y atajos
  styles.css            # estilos de asas y modo personalizar
```

---

## Plan de implementación

1. `src/types.ts`: añadir `GainPoint`, `SegmentShape` y `GainCurve`, más `customVolume` (por defecto `null`) en `Transition` y `customizing/past/future` en `EditorState`. Actualizar `defaultTransition` y `fixtures.ts`. La app sigue igual.
2. `src/lib/gainCurve.ts` con `evaluateGainCurve`, `sampleGainCurve` y `curveFromStyle`, con tests. Entre ellos: que `curveFromStyle(style)` muestreado coincida con `sampleCurve(style)`.
   - Tolerancia 0,01; 0,015 para `smooth-crossfade`.
   - En `overlap`, `fade-in-cut-out` y `center-cut` se excluye la zona del escalón.
3. `src/lib/gainCurve.ts`: `snapX`, `addPoint`, `movePoint`, `deletePoint`, `setBend` y `toggleEase` como funciones puras con tests: límites, vecinos, extremos y máximo de 32.
4. `src/lib/curves.ts` + `src/lib/timeline.ts`: `volumeSamples(transition)` y `chipLabel` con `customVolume`. Test: una transición con curva personalizada produce las ganancias de esa curva en `buildTimeline`.
5. `src/state.ts`: historial (`past/future`, `undo`, `redo`, `beginGesture/endGesture`) en todas las acciones del borrador, más `toggleCustomize`, `updateCustomCurve`, `resetCurve`. `applyPreset`, `setVolumeStyle` y `resetToAuto` ponen `customVolume = null`.
6. `src/ui/editor.ts`: botones ↶ ↷ con sus atajos, botón Personalizar/Listo, Restablecer curva y el select de Volumen con la opción "Personalizada".
7. `src/ui/waveform.ts`: exponer la geometría de cada carril y un modo `customizing` que desactiva el arrastre de ondas, el nudge y el overview, y atenúa las ondas.
8. `src/ui/curveEditor.ts`: asas de puntos y de tramos como `<button>` posicionados sobre la vista. Arrastre con snap y Shift, doble clic para añadir o borrar, asa de tramo para `bend` y `ease`, y teclado.
9. Reinicio de la preview al soltar un arrastre de punto o asa, y tras cada cambio por teclado.
10. Atajos extra en `src/ui/curveEditor.ts`: Inicio/Fin, Alt+←/→, `,` `.`, Shift+↑/↓, `<` `>`, E.
11. `src/state.ts` + `src/ui/editor.ts`: `goToPair(index)` con ‹ › y `[` `]`, más la confirmación Guardar / Descartar / Seguir editando cuando hay cambios.

---

## Criterios de aceptación

- [x] `npm test` pasa, incluidos los tests nuevos de `src/lib/gainCurve.test.ts`.
- [x] Pulsar "Personalizar" muestra los puntos de la curva en ambas ondas y el botón pasa a "Listo".
- [x] En modo personalizar, arrastrar sobre una onda no desliza la canción, y el nudge y el overview no responden.
- [x] Al entrar en Personalizar desde cualquiera de los 8 estilos, la curva amarilla se ve igual que antes de entrar.
- [x] Arrastrar un punto sin Shift lo deja en un beat, un medio beat de A o el centro de la ventana; con Shift queda donde se suelta.
- [x] Un punto no puede pasar a la izquierda de su vecino anterior ni a la derecha del siguiente.
- [x] Los puntos de los extremos no se mueven en X ni se borran, pero su volumen sí cambia.
- [x] Doble clic sobre la curva añade un punto en esa posición; doble clic sobre un punto que no sea extremo lo borra.
- [x] Con 32 puntos en una curva, añadir otro no hace nada y aparece "Máximo 32 puntos por curva".
- [x] Arrastrar el asa de un tramo arriba o abajo lo curva; doble clic en el asa alterna recto/suave y el asa cambia de relleno.
- [x] Con teclado: Tab recorre los puntos de A y luego los de B; ←/→ mueven un beat (Shift: medio); ↑/↓ cambian 5%; Supr borra; Enter añade.
- [x] Inicio / Fin enfocan el primer / último punto de la curva.
- [x] Alt+←/→ mueve un compás.
- [x] `,` / `.` mueven el punto exactamente 10 ms, sin snap.
- [x] Shift+↑/↓ cambia el volumen un 25%.
- [x] `<` / `>` curvan el tramo siguiente; E alterna recto/suave en ese tramo.
- [x] ‹ › y `[` `]` cambian a la transición anterior/siguiente sin cerrar el editor; están deshabilitados en los extremos.
- [x] Con cambios sin guardar, cambiar de transición pregunta. "Guardar" guarda y cambia; "Descartar" cambia sin guardar; "Seguir editando" se queda.
- [x] Al cambiar de transición, la preview suena en bucle con la nueva y el historial queda vacío.
- [x] Tras soltar un arrastre, la preview en bucle se reinicia y se oye la curva nueva.
- [x] Con una curva personalizada guardada, el chip dice "Custom" y "Reproducir mezcla" aplica esa curva.
- [x] Elegir un preset, un estilo o "Auto" reemplaza la curva personalizada.
- [x] "Restablecer curva" vuelve a la curva del estilo actual.
- [x] Cambiar los compases conserva la forma de la curva personalizada, estirada a la nueva ventana.
- [x] Cmd/Ctrl+Z deshace el último cambio del borrador y Shift+Cmd/Ctrl+Z lo rehace; los botones ↶ ↷ hacen lo mismo y se deshabilitan sin historial.
- [x] Un arrastre completo de un punto se deshace con un solo Cmd/Ctrl+Z.
- [x] Guardar, descartar o cerrar el editor vacía el historial.
- [x] Ningún color está hardcodeado fuera de `src/styles.css`.

---

## Decisiones

- **Sí:** modo "Personalizar" explícito, con botón. Evita que un arrastre mueva la canción cuando se quería mover un punto. Es el mismo flujo que el Customize de Spotify.
- **No:** puntos siempre editables. Ambigüedad entre deslizar la onda y mover un punto.
- **No:** panel de curva aparte. Separa la curva del audio que modifica.
- **Sí:** mover, añadir y borrar puntos, más tramos suaves y curvados. Iguala lo que permite Spotify.
- **Sí:** asa en el centro de cada tramo para `bend` (arrastre) y `ease` (doble clic). Directo y sin barra de herramientas extra.
- **No:** barra de herramientas con deslizador. Más pasos para la misma acción.
- **Sí:** snap de X al beat y al medio beat del grid de A; Y libre; Shift libre. Igual que la reconstrucción de Spotify y coherente con el snap de SPEC 01.
- **Sí:** extremos fijos en X y con volumen editable. Garantiza que la curva cubra toda la ventana sin perder control.
- **Sí:** deshacer y rehacer cubren todo el borrador, con 100 pasos. Un solo historial es más predecible que uno por modo.
- **Sí:** un arrastre cuenta como un paso. Evita cientos de pasos por gesto.
- **Sí:** elegir un preset, un estilo o Auto reemplaza la curva sin preguntar. Hay borrador, deshacer y X, así que no se pierde nada guardado.
- **Sí:** puntos en coordenadas relativas a la ventana (x ∈ [0,1]). Cambiar los compases estira la curva en vez de romperla.
- **Sí:** máximo 32 puntos por curva. Suficiente para cualquier forma y mantiene legibles las asas.
- **Sí:** curva inicial con puntos de quiebre exactos por estilo. Al entrar en Personalizar no cambia lo que se oye.
- **Sí:** `smooth-crossfade` con 3 puntos y bends ajustados (error ≤ 1,03%, test al 1,5%). Con 2 puntos el error llegaba al 5,6% (confirmado por el usuario durante la implementación).
- **No:** 4 o 5 puntos para `smooth-crossfade`. Más precisos, pero con más puntos que mover sin diferencia audible.
- **Sí:** asas como `<button>` posicionados sobre el canvas. Foco, Tab y lectores de pantalla funcionan de forma nativa.
- **Sí:** el modelo `GainCurve` es genérico. SPEC 04 lo reutiliza para EQ y Filtro.
- **Sí (de vimj):** atajos extra (Inicio/Fin, Alt para compás, Shift para 25%, `<` `>`, E). Edición rápida sin ratón; elegido por el usuario.
- **Sí (de vimj):** nudge fino de 10 ms en los puntos. Coherente con el nudge de las ondas de SPEC 01.
- **Sí (de vimj):** snap también al centro de la ventana. Facilita curvas simétricas.
- **Sí (de vimj):** navegar entre transiciones dentro del editor con confirmación de tres opciones. Permite revisar la mezcla seguida sin cerrar y reabrir.
- **Sí:** el modo Personalizar se mantiene al cambiar de transición. Permite retocar varias curvas seguidas (confirmado por el usuario).
- **Sí:** en el último punto, `<` `>` y E actúan sobre el tramo anterior. Así las teclas siempre hacen algo (confirmado por el usuario).
- **Sí:** el foco inicial de la confirmación de cambio de transición queda en "Guardar". Lo habitual es conservar lo editado (confirmado por el usuario).
- **No:** vincular las curvas de A y B, copiar y pegar, o presets de curva propios. Cada uno, si llega, va en su propia spec.

---

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Asas muy juntas con 1 compás o ventanas estrechas | Área táctil de 28px; el foco por teclado permite llegar a cualquier punto; separación mínima de 1/1000. |
| Escalones (`center-cut`, `overlap`) con dos puntos casi en la misma X | Separación mínima y snap opcional con Shift; tests de los escalones. |
| `setValueCurveAtTime` con curvas muy abruptas produce clics | Se mantiene el muestreo de 256 puntos; un escalón queda repartido en 1/255 de la ventana. |
| Historial enorme en arrastres largos | Agrupación por gesto y tope de 100 pasos. |
| Conflicto entre atajos del editor y campos de texto (popover de BPM) | Los atajos (deshacer, `[` `]`, `,` `.`, `<` `>`, E) se ignoran cuando el foco está en un `<input>` o `<select>`. |
| Alt+← / → navega hacia atrás en algunos navegadores | `preventDefault` solo cuando el foco está en un punto de la curva. |

---

## Lo que **no** entra en esta spec

- Curvas de EQ, Filtro y Efectos (SPEC 04 y 05).
- Copiar y pegar curvas, o guardar curvas propias como presets.
- Vincular las curvas de A y B.
- Zoom de la vista y selección múltiple de puntos.
- Persistencia entre sesiones (SPEC 08).

Cada uno, si llega, va en su propia spec.

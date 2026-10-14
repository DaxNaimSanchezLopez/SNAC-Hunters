# Decisiones de Diseño — SNAC Hunters

> Este archivo es la **copia consolidada** de todas las decisiones de diseño tomadas en los specs del proyecto.
> Cada decisión nace en el `design.md` del spec correspondiente y se replica aquí para consulta centralizada.
> Ante cualquier discrepancia, el `design.md` del spec es la fuente canónica.

---

## D-01 — Algoritmo RNG: Mulberry32

**Spec de origen:** `snac-hunters-monorepo`
**Requisito:** RNF-02

**Contexto:** RNF-02 requiere un RNG determinista con semilla, sin dependencias externas y sin I/O.

**Decisión:** Se usa el algoritmo Mulberry32. Es un generador de 32 bits con buena distribución estadística, implementable en ~10 líneas de TypeScript puro, sin dependencias npm.

**Alternativas consideradas:** `seedrandom` (dependencia externa), `LCG` (mala distribución), `xoshiro128+` (más bits pero mayor complejidad).

**Consecuencias:** El estado del RNG es un único `number` de 32 bits, fácil de serializar en `CombatState` si se requiere más adelante.

---

## D-02 — `z.tuple` vs `z.array().length(4)` para slots

**Spec de origen:** `snac-hunters-monorepo`
**Requisito:** RF-08.4

**Contexto:** RF-08.4 requiere validar que `slots` sea exactamente 4 elementos de tipo `Slot`.

**Decisión:** Se usa `z.tuple([SlotSchema, SlotSchema, SlotSchema, SlotSchema])`. Garantiza longitud exacta de 4 y tipo de cada elemento en una sola expresión. El tipo TypeScript inferido es `[Slot, Slot, Slot, Slot]` (tupla), no `Slot[]` (array).

**Consecuencias:** El tipo inferido es más preciso que un array genérico. Permite desestructuración posicional en el engine.

---

## D-03 — `face: Symbol | 'damage' | 'wild' | 'blank'` en Die

**Spec de origen:** `snac-hunters-monorepo`
**Requisito:** RF-07.3, RNF-04

**Contexto:** RF-07.3 define `face` como `Symbol | 'damage' | 'heart' | 'blank'`. Los requisitos originales mencionan `'heart'`, pero RNF-04 documenta la distribución `damage/wild/blank`.

**Decisión:** Se usa `'wild'` en lugar de `'heart'` para la cara comodín del dado de daño, alineándose con RNF-04. Si el reglamento oficial usa `'heart'`, el cambio es un rename de un literal de string en `types.ts`.

**Suposiciones no confirmadas (RNF-04):**
- El dado de daño tiene 6 caras: 3 × `'damage'`, 1 × `'wild'`, 2 × `'blank'`.
- La cara `'wild'` del dado de daño **no puede** cubrir un slot de daño.
- ~~Pendiente validación~~ **Confirmado** con `Dice-guide-V03.png` del cliente (2026-10-13): `heart` (dado rojo), `wild` (especiales y blanco) y `damage` (blanco) son caras distintas. Ver D-06.

---

## D-04 — `loadMonsters` como función pura que acepta `unknown`

**Spec de origen:** `snac-hunters-monorepo`
**Requisito:** RF-09, RNF-01

**Contexto:** RF-09 requiere que el loader acepte contenido JSON crudo como `unknown`. El loader podría recibir el resultado de `JSON.parse()` (que devuelve `any`/`unknown`).

**Decisión:** La firma es `loadMonsters(raw: unknown): Monster[]`. No hace I/O (no llama a `fs.readFileSync`). El caller (API Lambda o test) es responsable de parsear el JSON. Esto mantiene el engine sin I/O (RNF-01).

**Consecuencias:** El engine es completamente portable. El test puede pasar objetos literales directamente sin tocar el filesystem.

---

## D-05 — HP máximo del jugador = 6

**Spec de origen:** `snac-hunters-monorepo`
**Requisito:** RF-07.6

**Contexto:** Las reglas del juego especifican HP máximo de 6 para el jugador.

**Decisión:** Se documenta como constante en los tipos (`playerHp: number`). La restricción `0–6` se implementará en la lógica de transición (spec posterior). En `CombatState` es solo un número sin restricción de Zod por ahora.

---

*Última actualización: spec `snac-hunters-monorepo` — Área 1.*
## D-06 — Modelo de datos alineado con los materiales del cliente

**Requisito:** RF-07, RF-08 · **Fecha:** 2026-10-13

**Contexto:** `config/monsters.json` tenía monstruos de ejemplo inventados y un campo `hp` que los materiales no definen.

**Decisión:** Se reemplazan por los 9 monstruos de `Sherbert Forest monster list.xlsx`. `Monster` ahora tiene `type`, `slots` (incluye `damage`), `trophies` y `pun`; se elimina `hp`. Los colores de trofeo del Excel se traducen con el Dice-guide (naranja=Horn, azul=Wing, verde=Claw, morado=Tail). El jefe Pieous (6 símbolos, "Random") queda fuera de esta iteración.

---

## D-07 — Cómo se cubre un slot de daño (corazón roto)

**Contexto:** El manual dice "Si lanzas un (corazón roto), puedes elegir entre gastar un HPie o el dado". El brief dice "algunos monstruos requieren que el jugador reciba daño".

**Decisión:** Una cara `damage` del dado blanco cubre automáticamente el primer slot `damage` libre. El daño **se sigue pagando**, con un corazón (escudo) o con 1 HPie. Un `wild` nunca cubre un slot de daño. El slot de daño no se puede desasignar.

**Pendiente de validar con el cliente.**

---

## D-08 — Los corazones bloquean el daño automáticamente

**Contexto:** "Puedes gastar un dado corazón para anular daño". Los corazones no sirven para nada más (el comodín no imita corazones).

**Decisión:** Al resolver cada cara de daño, si hay un `heart` en la reserva se gasta como escudo; si no, se pierde 1 HPie. Los corazones lanzados en la **misma tirada** también cuentan (daño y escudo simultáneos). Se procesan en orden de id de dado, lo que es determinista.

**Alternativa descartada:** pedir al jugador que elija. Agrega un paso de UI sin decisión real y complica el tutorial.

---

## D-09 — Umbrales de resolución

**Decisión:** 4 slots = derrotar, 2–3 = estudiar ("dos símbolos cualesquiera", manual p. 9), 1 = huir. No se puede resolver con 0 slots: el jugador debe relanzar o arriesgarse al KO.

---

## D-10 — KO y derrota en la misma tirada

**Contexto:** El manual dice "Si un monstruo puede ser derrotado al mismo tiempo que quedas KO, aún ganas todos los beneficios".

**Decisión:** Si el HPie llega a 0 con los 4 slots cubiertos, el resultado es `defeat` con `ko: true`. Se otorga el primer trofeo de la lista (no hay oportunidad de elegir) y se aplican tanto el punto de derrota como la penalización de KO.

---

## D-11 — Validación en servidor por re-simulación

**Requisito:** Regla de oro 2, requisito de plataforma 6

**Decisión:** El cliente envía solo `{ monsterId, seed, actions }`. La Lambda ejecuta `replayCombat` con el **mismo engine** y con el setup de `config/game.json` (los dados y el HPie los decide el servidor, no el cliente). El resultado, los puntos y el trofeo los calcula el servidor; cualquier acción ilegal devuelve 422.

**Riesgo conocido:** en esta demo la seed la genera el cliente, así que un tramposo podría buscar seeds favorables. **Siguiente paso:** `POST /runs/start` emite una seed firmada por el servidor.

---

## D-12 — Runtime de Lambda: Node.js 22

**Contexto:** `cdk synth` advierte que `nodejs20.x` quedó deprecado el 2026-04-30 (no se podrán crear funciones a partir del 2027-02-01).

**Decisión:** La Lambda usa `NODEJS_22_X`. El desarrollo local y el CI siguen en Node 20 por `.nvmrc`; se recomienda subir `.nvmrc` a 22.

---

## D-13 — El dado blanco puede relanzarse

**Contexto:** El manual dice "Las caras en blanco permanecen en la reserva" y la FAQ, "técnicamente podrías usar el mismo dado".

**Decisión:** Un dado blanco que muestra `blank` o `wild` y sigue en la reserva puede relanzarse (y el relanzamiento añade otro dado blanco). Uno que ya hizo daño se retira.

---

*Última actualización: 2026-10-13 — demo de viabilidad técnica (D3).*

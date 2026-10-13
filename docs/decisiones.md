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
- Pendiente validación con Pieland Games o documentación oficial.

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

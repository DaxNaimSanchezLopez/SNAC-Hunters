# Documento de Diseño — SNAC Hunters Monorepo

## Introducción

Este documento describe la arquitectura y el diseño técnico del monorepo **SNAC Hunters** y del modelo de dominio del engine para el vertical slice single-player de "Attack of the SNACs" (Pieland Games), Equipo 13, Full Stack Workshop. La zona cubierta en este slice es Sherbet Forest.

El diseño cubre dos áreas:

1. **Área 1 — Monorepo skeleton:** Estructura, tooling compartido, CI y steering files.
2. **Área 2 — engine-domain-model:** Tipos del dominio, schema Zod de `Monster`, loader y estrategia de tests.

---

## Arquitectura General

### Estructura del Monorepo

```
snac-hunters/
├── .github/
│   └── workflows/
│       └── ci.yml
├── .kiro/
│   └── steering/
│       ├── product.md
│       ├── tech.md
│       └── structure.md
├── apps/
│   ├── api/               # AWS Lambdas + API Gateway
│   └── web/               # React + Vite SPA
├── config/                # JSON de configuración del juego + schemas Zod
│   └── monsters.json      # Monstruos de Sherbet Forest
├── docs/
│   └── decisiones.md      # Decisiones de diseño consolidadas
├── infra/                 # AWS CDK TypeScript
├── packages/
│   └── engine/            # Reglas del juego — puro TypeScript, sin I/O
├── .gitignore
├── .nvmrc
├── .prettierrc
├── eslint.config.js
├── package.json
├── pnpm-workspace.yaml
├── README.md
└── tsconfig.base.json
```

### Principio de Capas

```
┌──────────────────────────────────────────────────┐
│  apps/web  (React + Vite + Tailwind + Zustand)   │
│  apps/api  (Lambda + API Gateway + Cognito)      │
└──────────────┬───────────────────────────────────┘
               │ importa tipos y funciones puras
┌──────────────▼───────────────────────────────────┐
│  packages/engine  (TypeScript puro, sin I/O)     │
│  Reglas del juego + RNG determinista             │
└──────────────┬───────────────────────────────────┘
               │ valida con Zod
┌──────────────▼───────────────────────────────────┐
│  config/  (monsters.json, …)                     │
│  Valores de juego validados con Zod              │
└──────────────────────────────────────────────────┘
               │ infraestructura
┌──────────────▼───────────────────────────────────┐
│  infra/  (AWS CDK, us-east-1, stages dev/prod)   │
└──────────────────────────────────────────────────┘
```

La regla de oro es: **la UI nunca calcula reglas**; siempre delega al engine. El servidor re-simula seed + acciones con el mismo engine para no confiar en el cliente (RNF-02).

---

## Área 1 — Monorepo Skeleton

### pnpm-workspace.yaml

```yaml
packages:
  - 'packages/*'
  - 'apps/*'
  - 'infra'
  - 'config'
```

### package.json raíz

Scripts delegados a pnpm recursive para consistencia (RF-01.2):

```json
{
  "name": "snac-hunters",
  "private": true,
  "scripts": {
    "lint":      "pnpm -r lint",
    "typecheck": "pnpm -r typecheck",
    "test":      "pnpm -r test",
    "build":     "pnpm -r build",
    "format":    "prettier --write ."
  },
  "devDependencies": {
    "prettier": "^3.3.3",
    "eslint":   "^9.9.0",
    "typescript": "^5.5.4"
  }
}
```

### tsconfig.base.json

Base con strict mode activado (RF-01.3). Todos los `tsconfig.json` de los paquetes extienden de aquí:

```json
{
  "compilerOptions": {
    "strict": true,
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  }
}
```

### eslint.config.js — Flat Config (ESLint 9)

La regla clave para RF-03 impide que `packages/engine` importe módulos de UI, AWS o I/O de Node.js:

```javascript
// eslint.config.js  — RF-03
import js from '@eslint/js';
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';

const ENGINE_BANNED_IMPORTS = [
  'react', 'react-dom', 'react/**',
  '@aws-sdk/**', 'aws-amplify', 'aws-amplify/**',
  'node:fs', 'node:path', 'node:os', 'fs', 'path',
];

export default [
  js.configs.recommended,
  {
    files: ['packages/engine/src/**/*.ts'],
    languageOptions: { parser: tsParser },
    plugins: { '@typescript-eslint': tsPlugin },
    rules: {
      'no-restricted-imports': ['error', { patterns: ENGINE_BANNED_IMPORTS }],
    },
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: { parser: tsParser },
    plugins: { '@typescript-eslint': tsPlugin },
    rules: {
      ...tsPlugin.configs.recommended.rules,
    },
  },
];
```

### .prettierrc

```json
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2
}
```

### .github/workflows/ci.yml

Pipeline disparado en `push` y `pull_request` (RF-04):

```yaml
name: CI

on:
  push:
  pull_request:

jobs:
  ci:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - uses: pnpm/action-setup@v4
        with:
          version: 10

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Lint
        run: pnpm lint

      - name: Typecheck
        run: pnpm typecheck

      - name: Test
        run: pnpm test -- --run
```

---

## Área 2 — Engine Domain Model

### Componentes del Engine

```
packages/engine/
├── src/
│   ├── types.ts          # RF-07: Symbol, Slot, Die, Trophy, Monster, CombatState
│   ├── schemas.ts        # RF-08: MonsterSchema (Zod)
│   ├── loader.ts         # RF-09: loadMonsters
│   ├── rng.ts            # RNF-02: RNG determinista con semilla
│   └── index.ts          # Barrel de exportaciones públicas
├── src/__tests__/
│   ├── trivial.test.ts   # RF-05.3: test trivial
│   ├── schemas.test.ts   # RF-10.1-3: tests de MonsterSchema
│   ├── loader.test.ts    # RF-10.4-6: tests de loadMonsters
│   └── rng.test.ts       # RNF-02.3: test determinismo RNG
├── package.json
├── tsconfig.json
└── vitest.config.ts      # RF-05.1-2: cobertura >= 90%
```

### Tipos del Dominio (`src/types.ts`)

#### Symbol — RF-07.1

```typescript
// RF-07: Cuatro símbolos del juego Attack of the SNACs
export type Symbol = 'Horn' | 'Wing' | 'Claw' | 'Tail';
```

#### Slot — RF-07.2

```typescript
// RF-07: Un Slot admite cualquier Symbol o el comodín 'all'
export type Slot = Symbol | 'all';
```

#### Die — RF-07.3

```typescript
// RF-07: Dado con cara activa. 'damage' aplica HP daño al jugador.
// RNF-04: SUPOSICIÓN NO CONFIRMADA — distribución de caras del dado de daño:
//   3 caras 'damage', 1 cara 'wild', 2 caras 'blank'.
//   La cara 'wild' NO puede cubrir un slot de daño (pendiente validación con Pieland Games).
export interface Die {
  readonly id: string;
  readonly face: Symbol | 'damage' | 'wild' | 'blank';
}
```

#### Trophy — RF-07.4

```typescript
// RF-07: Trofeo obtenido al derrotar o estudiar un monstruo.
// Reemplaza dados del pool y se elimina del tablero.
export interface Trophy {
  readonly monsterId: string;
  readonly symbol?: Symbol;
}
```

#### Monster — RF-07.5

```typescript
// RF-07: Monstruo con exactamente 4 slots. HP >= 1.
export interface Monster {
  readonly id: string;
  readonly name: string;
  readonly hp: number;            // entero positivo
  readonly slots: readonly [Slot, Slot, Slot, Slot]; // tuple de exactamente 4
}
```

#### CombatState — RF-07.6

```typescript
// RF-07: Estado estático de un combate. Sin lógica de transición.
// La interfaz es solo lectura; las transiciones se implementan en funciones puras separadas.
export interface CombatState {
  readonly monster: Monster;
  readonly playerHp: number;       // 0–6 (HP máximo 6)
  readonly dicePool: readonly Die[];
  readonly damageDiceCount: number; // dados de daño acumulados en el pool
  readonly trophies: readonly Trophy[];
}
```

### Schema Zod (`src/schemas.ts`) — RF-08

```typescript
import { z } from 'zod';

// RF-08: Símbolos válidos y valor especial 'all'
const SlotSchema = z.enum(['Horn', 'Wing', 'Claw', 'Tail', 'all']);

export const MonsterSchema = z.object({
  // RF-08.1: id no vacío
  id: z.string().min(1, 'El id del monstruo no puede estar vacío'),
  // RF-08.2: name no vacío
  name: z.string().min(1, 'El nombre del monstruo no puede estar vacío'),
  // RF-08.3: hp entero >= 1
  hp: z.number().int().min(1, 'El HP del monstruo debe ser >= 1'),
  // RF-08.4: slots — exactamente 4 elementos válidos
  slots: z.tuple([SlotSchema, SlotSchema, SlotSchema, SlotSchema]),
});

// RF-08.8: El tipo inferido es compatible con la interfaz Monster de RF-07
export type MonsterFromSchema = z.infer<typeof MonsterSchema>;
```

**Nota de compatibilidad de tipos:** `z.tuple([...])` infiere `[Slot, Slot, Slot, Slot]` que es compatible con `readonly [Slot, Slot, Slot, Slot]` de la interfaz `Monster`. Si el compilador requiere la cast explícita, se usa `satisfies Monster` al momento de asignar.

### Loader (`src/loader.ts`) — RF-09

```typescript
import { MonsterSchema } from './schemas';
import type { Monster } from './types';

/**
 * Carga y valida un array de monstruos desde contenido JSON crudo.
 * RF-09: acepta `unknown`, devuelve `Monster[]`.
 */
export function loadMonsters(raw: unknown): Monster[] {
  if (!Array.isArray(raw)) {
    throw new Error(
      `loadMonsters: se esperaba un array, se recibió ${typeof raw}`
    );
  }

  return raw.map((item, index) => {
    const result = MonsterSchema.safeParse(item);
    if (!result.success) {
      const issues = result.error.issues
        .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
        .join('\n');
      throw new Error(
        `loadMonsters: monstruo en índice ${index} es inválido:\n${issues}`
      );
    }
    return result.data as Monster;
  });
}
```

### RNG Determinista (`src/rng.ts`) — RNF-02

Se usa el algoritmo **Mulberry32** — un generador pseudo-aleatorio de 32 bits con semilla, sin dependencias externas, sin I/O:

```typescript
// RNF-02: RNG determinista con semilla. Algoritmo: Mulberry32.
// Dos instancias con el mismo seed producen la misma secuencia.
export class SeededRng {
  private state: number;

  constructor(seed: number | string) {
    // Convertir string seed a número por hash FNV-1a simple
    this.state = typeof seed === 'string' ? SeededRng.hashString(seed) : seed;
  }

  /** Devuelve un float en [0, 1). */
  next(): number {
    // Mulberry32
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Devuelve un entero en [min, max]. */
  nextInt(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  private static hashString(s: string): number {
    let hash = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) {
      hash ^= s.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
    return hash >>> 0;
  }
}
```

### Configuración de Vitest (`vitest.config.ts`) — RF-05

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/*.spec.ts'],
      thresholds: {
        lines:      90,
        branches:   90,
        functions:  90,
        statements: 90,
      },
      reporter: ['text', 'lcov'],
    },
  },
});
```

### config/monsters.json de ejemplo — RF-09.6

```json
[
  {
    "id": "snac-001",
    "name": "Frostbite Bunny",
    "hp": 3,
    "slots": ["Horn", "Wing", "Claw", "Tail"]
  },
  {
    "id": "snac-002",
    "name": "Candy Creeper",
    "hp": 2,
    "slots": ["Horn", "Horn", "all", "Tail"]
  }
]
```

---

## Steering Files

### `.kiro/steering/product.md`

Descripción del producto, contexto del juego y zona Sherbet Forest. Cita las reglas de oro del equipo.

### `.kiro/steering/tech.md`

Stack obligatorio:
- **Runtime:** Node 20, pnpm 10
- **Lenguaje:** TypeScript strict
- **Testing:** Vitest, cobertura >= 90% en engine
- **Lint/Format:** ESLint 9 flat config, Prettier
- **CI:** GitHub Actions
- **Frontend:** React + Vite + Tailwind + Zustand + Framer Motion + idb-keyval + aws-amplify
- **Backend:** AWS Lambdas + esbuild + Zod, API Gateway REST, Cognito authorizer
- **Infra:** AWS CDK TypeScript, us-east-1, stages dev/prod

### `.kiro/steering/structure.md`

Estructura de carpetas del monorepo y responsabilidades de cada paquete. Documenta la regla de capas (UI → engine → config → infra).

---

## Interfaces Públicas del Engine

`packages/engine/src/index.ts` exporta:

```typescript
// Tipos — RF-07
export type { Symbol, Slot, Die, Trophy, Monster, CombatState } from './types';

// Schema — RF-08
export { MonsterSchema } from './schemas';
export type { MonsterFromSchema } from './schemas';

// Loader — RF-09
export { loadMonsters } from './loader';

// RNG — RNF-02
export { SeededRng } from './rng';
```

---

## Modelos de Datos

### Modelo conceptual de combate (Sherbet Forest)

```
CombatState
├── monster: Monster
│     ├── id: string
│     ├── name: string
│     ├── hp: number (1–N)
│     └── slots: [Slot, Slot, Slot, Slot]
│           └── Slot = 'Horn' | 'Wing' | 'Claw' | 'Tail' | 'all'
├── playerHp: number (0–6)
├── dicePool: Die[]
│     └── Die = { id: string, face: Symbol | 'damage' | 'wild' | 'blank' }
├── damageDiceCount: number
└── trophies: Trophy[]
      └── Trophy = { monsterId: string, symbol?: Symbol }
```

### Resultados de combate (solo tipos, sin transición en este spec)

| Resultado | Condición                                    | Consecuencia           |
|-----------|----------------------------------------------|------------------------|
| Derrota   | 4/4 slots coinciden                          | Monstruo KO, trofeo    |
| Estudio   | Cualquier par de slots coincide              | Monstruo escapa, trofeo|
| Huida     | 1 símbolo coincide (sin par)                | Sin trofeo             |
| KO jugador| `playerHp` llega a 0                        | Fin de partida         |

> **Nota:** La lógica de evaluación de resultados (qué cuenta como "coincidencia") se implementará en un spec posterior. `CombatState` es solo el snapshot estático.

---

## Manejo de Errores

### En `loadMonsters`

| Situación                          | Comportamiento                                                    |
|------------------------------------|-------------------------------------------------------------------|
| Entrada no es array                | `throw Error` con tipo recibido                                   |
| Elemento con slot inválido         | `throw Error` con índice y path del error de Zod                  |
| Elemento con slots.length ≠ 4      | `throw Error` con índice y mensaje descriptivo                    |
| Elemento con hp ≤ 0               | `throw Error` con índice y mensaje descriptivo                    |
| Array vacío                        | Devuelve `[]` sin error (válido según RF-09.4)                    |
| Todos los elementos son válidos    | Devuelve `Monster[]` completo                                     |

### En el compilador TypeScript

Todos los tipos del dominio se validan en tiempo de compilación. Ningún tipo admite `null` o `undefined` implícito (strict mode, RF-01.3 / RNF-01.4).

---

## Decisiones

> Esta sección documenta las decisiones de diseño tomadas ante ambigüedades del reglamento o restricciones del spec. Se consolida una copia en `docs/decisiones.md` (RNF-03.2).

### D-01: Algoritmo RNG — Mulberry32

**Contexto:** RNF-02 requiere un RNG determinista con semilla, sin dependencias externas y sin I/O.

**Decisión:** Se usa el algoritmo Mulberry32. Es un generador de 32 bits con excelente distribución estadística, implementable en ~10 líneas de TypeScript puro, sin npm dependencies.

**Alternativas consideradas:** `seedrandom` (npm dep externa), `LCG` (mala distribución), `xoshiro128+` (más bits pero más complejidad).

**Consecuencias:** El estado del RNG es un único `number` de 32 bits, fácil de serializar en `CombatState` si se requiere más adelante.

---

### D-02: `z.tuple` vs `z.array().length(4)` para slots

**Contexto:** RF-08.4 requiere validar que `slots` sea exactamente 4 elementos de tipo `Slot`.

**Decisión:** Se usa `z.tuple([SlotSchema, SlotSchema, SlotSchema, SlotSchema])`. Esto garantiza longitud exacta de 4 Y tipo de cada elemento en una sola expresión, y el tipo TypeScript inferido es `[Slot, Slot, Slot, Slot]` (tuple), no `Slot[]` (array).

**Consecuencias:** El tipo inferido es más preciso que un array genérico. Permite desestructuración posicional en el engine.

---

### D-03: `face: Symbol | 'damage' | 'wild' | 'blank'` en Die

**Contexto:** RF-07.3 define `face` como `Symbol | 'damage' | 'heart' | 'blank'`. Los requisitos originales mencionan `'heart'`, pero RNF-04 documenta la distribución `damage/wild/blank`.

**Decisión:** Se usa `'wild'` en lugar de `'heart'` para la cara comodín del dado de daño, alineándose con RNF-04. Si el reglamento oficial usa `'heart'`, el cambio es un rename de un literal de string en `types.ts`.

**Suposiciones no confirmadas (RNF-04):**
- El dado de daño tiene 6 caras: 3 × `'damage'`, 1 × `'wild'`, 2 × `'blank'`.
- La cara `'wild'` del dado de daño **no puede** cubrir un slot de daño.
- Pendiente validación con Pieland Games o documentación oficial.

---

### D-04: `loadMonsters` como función pura que acepta `unknown`

**Contexto:** RF-09 requiere que el loader acepte contenido JSON crudo como `unknown`. El loader podría recibir el resultado de `JSON.parse()` (que devuelve `any`/`unknown`).

**Decisión:** La firma es `loadMonsters(raw: unknown): Monster[]`. No hace I/O (no llama a `fs.readFileSync`). El caller (API Lambda o test) es responsable de parsear el JSON. Esto mantiene el engine sin I/O (RNF-01).

**Consecuencias:** El engine es completamente portable. El test puede pasar objetos literales directamente sin tocar el filesystem.

---

### D-05: HP máximo del jugador = 6

**Contexto:** Las reglas del juego especifican HP máximo de 6 para el jugador.

**Decisión:** Se documenta como constante en los tipos (`playerHp: number`). La restricción `0–6` se implementará en la lógica de transición (spec posterior). En `CombatState` es solo un número.

---

## Correctness Properties

*Una propiedad es una característica o comportamiento que debe ser cierto en todas las ejecuciones válidas del sistema — esencialmente, un enunciado formal sobre qué debe hacer el software. Las propiedades sirven de puente entre las especificaciones legibles por humanos y las garantías de corrección verificables automáticamente.*

### Property 1: MonsterSchema rechaza id vacío y acepta cualquier id no vacío

*Para cualquier* objeto Monster donde el campo `id` sea un string no vacío (longitud >= 1), `MonsterSchema.safeParse` SHALL devolver `success: true`; *para cualquier* string vacío como `id`, SHALL devolver `success: false`.

**Validates: Requirements RF-08.1**

---

### Property 2: MonsterSchema rechaza name vacío y acepta cualquier name no vacío

*Para cualquier* objeto Monster donde el campo `name` sea un string no vacío, `MonsterSchema.safeParse` SHALL devolver `success: true`; para string vacío, SHALL devolver `success: false`.

**Validates: Requirements RF-08.2**

---

### Property 3: MonsterSchema valida hp como entero positivo

*Para cualquier* entero `n`, `MonsterSchema.safeParse({ ..., hp: n })` SHALL devolver `success: true` si y solo si `n >= 1`. Para `n <= 0` o para valores no enteros, SHALL devolver `success: false`.

**Validates: Requirements RF-08.3, RF-08.7**

---

### Property 4: MonsterSchema valida slots como exactamente 4 elementos Slot válidos

*Para cualquier* array de exactamente 4 elementos donde cada elemento es uno de `['Horn', 'Wing', 'Claw', 'Tail', 'all']`, `MonsterSchema.safeParse` SHALL devolver `success: true`. *Para cualquier* array de longitud distinta a 4, o que contenga al menos un elemento fuera de ese conjunto, SHALL devolver `success: false`.

**Validates: Requirements RF-08.4, RF-08.5, RF-08.6**

---

### Property 5: loadMonsters preserva datos en round-trip para entrada válida

*Para cualquier* array de objetos Monster válidos (que pasen `MonsterSchema`), `loadMonsters(array)` SHALL devolver un array donde cada elemento tenga los mismos valores de `id`, `name`, `hp` y `slots` que el elemento de entrada correspondiente — sin modificar, reordenar ni omitir datos.

**Validates: Requirements RF-09.1, RF-09.4**

---

### Property 6: loadMonsters rechaza cualquier monstruo con slot desconocido

*Para cualquier* array de objetos Monster donde al menos uno contiene en `slots` un valor que no esté en `['Horn', 'Wing', 'Claw', 'Tail', 'all']`, `loadMonsters` SHALL lanzar un error. El mensaje de error SHALL identificar el índice del elemento inválido.

**Validates: Requirements RF-09.2**

---

### Property 7: loadMonsters rechaza cualquier entrada que no sea un array

*Para cualquier* valor `v` que no sea un `Array` (incluyendo `null`, `undefined`, strings, números, objetos planos), `loadMonsters(v)` SHALL lanzar un error descriptivo.

**Validates: Requirements RF-09.5**

---

### Property 8: RNG es determinista — dos instancias con el mismo seed producen secuencias idénticas

*Para cualquier* seed `s` (número o string) y cualquier longitud de secuencia `n >= 1`, dos instancias `rng1 = new SeededRng(s)` y `rng2 = new SeededRng(s)` SHALL producir exactamente los mismos valores en las primeras `n` llamadas a `next()`.

**Validates: Requirements RNF-02.1, RNF-02.2**

---

### Property 9: ESLint reporta error para cualquier import prohibido dentro de packages/engine

*Para cualquier* archivo TypeScript ubicado en `packages/engine/src/` que contenga un import de `react`, `@aws-sdk/*`, `aws-amplify`, `node:fs`, `node:path`, `fs` o `path`, ejecutar ESLint SHALL reportar al menos un error `no-restricted-imports`.

**Validates: Requirements RF-03.2, RF-03.3, RF-03.4, RNF-01.3**

---

## Estrategia de Testing

### Pruebas unitarias / de ejemplo

Los tests de ejemplo cubren:
- Test trivial (RF-05.3): `1 + 1 === 2` o importación de tipo exportado.
- Monster válido aceptado por `MonsterSchema` con valores concretos.
- RNG con semilla fija produce valor específico conocido (RNF-02.3).
- `loadMonsters` con array vacío devuelve `[]`.

### Pruebas de propiedades (property-based)

Usar **fast-check** como generador de valores arbitrarios en Vitest:

| Property | Generadores sugeridos                                         |
|----------|---------------------------------------------------------------|
| 1–2      | `fc.string({ minLength: 1 })` para id/name válidos; `fc.constant('')` para inválidos |
| 3        | `fc.integer()` para hp; filtrar `>= 1` vs `<= 0`             |
| 4        | `fc.array(fc.constantFrom(...VALID_SLOTS), { minLength: 4, maxLength: 4 })` |
| 5        | `fc.array(validMonsterArb)` para entrada válida               |
| 6        | `fc.array(monsterWithInvalidSlotArb, { minLength: 1 })`       |
| 7        | `fc.oneof(fc.string(), fc.integer(), fc.object(), fc.constant(null))` |
| 8        | `fc.oneof(fc.integer(), fc.string({ minLength: 1 }))` para seed; `fc.integer({ min: 1, max: 50 })` para n |
| 9        | No aplica (requiere ejecución de ESLint en proceso)           |

### Cobertura

`vitest.config.ts` en `packages/engine` configura umbral >= 90% en líneas, ramas, funciones y sentencias. El CI falla si no se cumple (RF-05.2, RF-10.7).

---

## Dependencias por Paquete

| Paquete          | Prod dependencies                                              | Dev dependencies                          |
|------------------|----------------------------------------------------------------|-------------------------------------------|
| `packages/engine`| `zod@^3.23.8`                                                 | `vitest`, `@vitest/coverage-v8`, `fast-check`, `typescript` |
| `apps/web`       | `react`, `react-dom`, `vite`, `tailwindcss`, `zustand`, `framer-motion`, `idb-keyval`, `aws-amplify` | `@vitejs/plugin-react`, `typescript` |
| `apps/api`       | `zod`, `esbuild`                                              | `typescript`                              |
| `infra`          | `aws-cdk-lib`, `constructs`                                   | `typescript`                              |
| `config`         | `zod`                                                         | `typescript`                              |

> Todas las versiones se fijarán con semver exacto o patch range `^patch` en el momento de la implementación.

---

*Documento generado para SNAC Hunters — Equipo 13, Full Stack Workshop.*
*Decisiones consolidadas también en `docs/decisiones.md` (RNF-03.2).*

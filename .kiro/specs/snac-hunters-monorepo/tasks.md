# Plan de Implementación: SNAC Hunters Monorepo

## Visión General

Implementación en dos áreas secuenciales:

1. **Área 1 — Monorepo Skeleton:** Estructura raíz, tooling compartido, CI y steering files.
2. **Área 2 — Engine Domain Model:** Tipos del dominio, schema Zod, loader, RNG y tests con cobertura >= 90 %.

Las tareas del Área 2 **NO se implementan en esta sesión** — quedan definidas para que el usuario las revise y luego un agente las ejecute.

---

## Tareas

### Área 1 — Monorepo Skeleton

- [x] 1. Crear archivos raíz del monorepo
  - [x] 1.1 Crear `pnpm-workspace.yaml` y `package.json` raíz
    - Declarar workspaces: `packages/*`, `apps/*`, `infra`, `config`
    - Scripts raíz: `lint`, `typecheck`, `test`, `build`, `format` (delegados con `pnpm -r`)
    - devDependencies: `prettier@^3.3.3`, `eslint@^9.9.0`, `typescript@^5.5.4`
    - _Requisitos: RF-01.1, RF-01.2_

  - [x] 1.2 Crear `tsconfig.base.json`, `.nvmrc`, `.gitignore` y `.prettierrc`
    - `tsconfig.base.json` con `"strict": true`, `"target": "ES2022"`, `"module": "NodeNext"`, `"moduleResolution": "NodeNext"`, `declarationMap`, `sourceMap`
    - `.nvmrc` con contenido `20`
    - `.gitignore` que excluya `node_modules`, `dist`, `.turbo`, `.env*`, `cdk.out` y artefactos de cobertura
    - `.prettierrc` con `singleQuote: true`, `semi: true`, `trailingComma: "all"`, `printWidth: 100`, `tabWidth: 2`
    - _Requisitos: RF-01.3, RF-01.4, RF-01.5, RF-03.5_

  - [x] 1.3 Crear `README.md` y `docs/decisiones.md`
    - `README.md` raíz con nombre del proyecto, descripción breve, instrucciones de instalación (`pnpm install`) y comandos de desarrollo (`pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm format`)
    - `docs/decisiones.md` como placeholder con encabezado y referencia a las decisiones de diseño (D-01 a D-05)
    - _Requisitos: RF-01.6, RNF-03.2_

- [x] 2. Crear los cinco paquetes del monorepo
  - [x] 2.1 Crear `packages/engine` con `package.json` y `tsconfig.json`
    - `package.json` con `name: "@snac-hunters/engine"`, prod dep `zod@^3.23.8`, dev deps `vitest`, `@vitest/coverage-v8`, `fast-check`, `typescript`
    - Sin deps de React, `@aws-sdk/*` ni módulos de I/O Node.js (RF-02.2)
    - `tsconfig.json` extendiendo `../../tsconfig.base.json`
    - _Requisitos: RF-02.1, RF-02.2_

  - [x] 2.2 Crear `apps/web`, `apps/api`, `infra` y `config` con sus `package.json` y `tsconfig.json`
    - `apps/web`: deps `react`, `react-dom`, `vite`, `tailwindcss`, `zustand`, `framer-motion`, `idb-keyval`, `aws-amplify`, `@vitejs/plugin-react`
    - `apps/api`: deps `zod`, `esbuild`
    - `infra`: deps `aws-cdk-lib`, `constructs`
    - `config`: deps `zod`
    - Cada uno con `tsconfig.json` extendiendo `tsconfig.base.json` (ruta relativa correcta)
    - _Requisitos: RF-02.1, RF-02.3, RF-02.4, RF-02.5, RF-02.6_

- [x] 3. Configurar ESLint flat config
  - [x] 3.1 Crear `eslint.config.js` con reglas de imports prohibidos en engine
    - ESLint 9 flat config usando `@eslint/js`, `@typescript-eslint/parser`, `@typescript-eslint/eslint-plugin`
    - Regla `no-restricted-imports` para `packages/engine/src/**/*.ts`: prohibir `react`, `react/**`, `react-dom`, `@aws-sdk/**`, `aws-amplify`, `aws-amplify/**`, `node:fs`, `node:path`, `node:os`, `fs`, `path`
    - Reglas `@typescript-eslint` recommended para todos los `.ts` / `.tsx`
    - _Requisitos: RF-03.1, RF-03.2, RF-03.3, RF-03.4, RNF-01.3_

  - [x]* 3.2 Verificar que ESLint reporta error en archivo de prueba dentro de engine
    - Crear un archivo temporal en `packages/engine/src/` que importe `react`
    - Ejecutar `pnpm lint` y confirmar que reporta error `no-restricted-imports`
    - Eliminar el archivo temporal
    - _Requisitos: RF-03.2, RF-03.3, RF-03.4_
    - **Property 9: ESLint reporta error para cualquier import prohibido en packages/engine**
    - **Validates: Requirements RF-03.2, RF-03.3, RF-03.4, RNF-01.3**

- [x] 4. Crear el workflow de CI con GitHub Actions
  - [x] 4.1 Crear `.github/workflows/ci.yml`
    - Disparado en `push` y `pull_request`
    - Job `ci` en `ubuntu-latest` con Node 20 y pnpm 10
    - Pasos: `checkout`, `setup-node@v4`, `pnpm/action-setup@v4`, `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm typecheck`, `pnpm test -- --run`
    - _Requisitos: RF-04.1, RF-04.2, RF-04.3, RF-04.4, RF-04.5, RF-04.6, RF-04.7_

- [x] 5. Crear steering files
  - [x] 5.1 Crear `.kiro/steering/product.md`
    - Descripción del producto, propósito del proyecto "Attack of the SNACs" (Pieland Games)
    - Contexto del vertical slice: single-player, Equipo 13, Full Stack Workshop, zona Sherbet Forest
    - Reglas de oro del equipo (1–8)
    - _Requisitos: RF-06.1, RF-06.4_

  - [x] 5.2 Crear `.kiro/steering/tech.md`
    - Stack obligatorio: Node 20, pnpm 10, TypeScript strict
    - Testing: Vitest, cobertura >= 90 % en engine
    - Lint/Format: ESLint 9 flat config, Prettier
    - CI: GitHub Actions
    - Frontend: React + Vite + Tailwind + Zustand + Framer Motion + idb-keyval + aws-amplify
    - Backend: AWS Lambdas + esbuild + Zod, API Gateway REST, Cognito authorizer
    - Infra: AWS CDK TypeScript, us-east-1, stages dev/prod
    - _Requisitos: RF-06.2_

  - [x] 5.3 Crear `.kiro/steering/structure.md`
    - Estructura de carpetas del monorepo y responsabilidades de cada paquete
    - Regla de capas: UI → engine → config → infra
    - La UI nunca calcula reglas; el servidor re-simula seed + acciones con el engine
    - _Requisitos: RF-06.3_

- [x] 6. Configurar Vitest y test trivial en packages/engine
  - [x] 6.1 Crear `vitest.config.ts` y el test trivial en `packages/engine`
    - `vitest.config.ts` con `coverage.provider: 'v8'`, `include: ['src/**/*.ts']`, umbrales >= 90 % en líneas, ramas, funciones y sentencias
    - Crear `src/__tests__/trivial.test.ts` con al menos un test que pase (p. ej., `expect(1 + 1).toBe(2)`)
    - Script `test` en `package.json` de engine: `vitest run --coverage`
    - Script `typecheck`: `tsc --noEmit`
    - Script `lint`: `eslint src`
    - _Requisitos: RF-05.1, RF-05.2, RF-05.3, RF-05.4_

- [x] 7. Checkpoint — Área 1 completa
  - Ejecutar `pnpm install`, `pnpm lint`, `pnpm typecheck` y `pnpm test -- --run` desde la raíz
  - Todos los pasos deben pasar sin errores
  - El test trivial de engine debe reportarse como `passed`
  - Preguntar al usuario si hay correcciones antes de continuar con el Área 2

---

### Área 2 — Engine Domain Model

> **NOTA:** Las tareas de esta área se definen aquí pero NO se implementan en esta sesión. El usuario revisará y aprobará este plan antes de que un agente las ejecute.

- [x] 8. Implementar tipos del dominio en `packages/engine`
  - [x] 8.1 Crear `src/types.ts` con todos los tipos del dominio
    - Tipo `Symbol`: unión de literales `'Horn' | 'Wing' | 'Claw' | 'Tail'`
    - Tipo `Slot`: `Symbol | 'all'`
    - Interfaz `Die`: `{ readonly id: string; readonly face: Symbol | 'damage' | 'wild' | 'blank' }` — comentar suposición RNF-04
    - Interfaz `Trophy`: `{ readonly monsterId: string; readonly symbol?: Symbol }`
    - Interfaz `Monster`: `{ readonly id: string; readonly name: string; readonly hp: number; readonly slots: readonly [Slot, Slot, Slot, Slot] }`
    - Interfaz `CombatState`: `{ readonly monster: Monster; readonly playerHp: number; readonly dicePool: readonly Die[]; readonly damageDiceCount: number; readonly trophies: readonly Trophy[] }`
    - Citar SRS IDs en comentarios según RNF-03.3
    - _Requisitos: RF-07.1, RF-07.2, RF-07.3, RF-07.4, RF-07.5, RF-07.6, RF-07.7, RNF-04.3_

- [x] 9. Implementar schema Zod de Monster
  - [x] 9.1 Crear `src/schemas.ts` con `MonsterSchema`
    - `SlotSchema`: `z.enum(['Horn', 'Wing', 'Claw', 'Tail', 'all'])`
    - `MonsterSchema`: `z.object({ id: z.string().min(1), name: z.string().min(1), hp: z.number().int().min(1), slots: z.tuple([SlotSchema, SlotSchema, SlotSchema, SlotSchema]) })`
    - Exportar `MonsterFromSchema` como `z.infer<typeof MonsterSchema>`
    - _Requisitos: RF-08.1, RF-08.2, RF-08.3, RF-08.4, RF-08.5, RF-08.6, RF-08.7, RF-08.8_

  - [x]* 9.2 Escribir property tests para `MonsterSchema`
    - Instalar `fast-check` si no está disponible
    - **Property 1: MonsterSchema rechaza id vacío y acepta cualquier id no vacío** — `fc.string({ minLength: 1 })` para válidos; `fc.constant('')` para inválidos
    - **Validates: Requirements RF-08.1**
    - **Property 2: MonsterSchema rechaza name vacío y acepta cualquier name no vacío** — mismo patrón que Property 1
    - **Validates: Requirements RF-08.2**
    - **Property 3: MonsterSchema valida hp como entero positivo** — `fc.integer()` para hp; `>= 1` debe pasar, `<= 0` debe fallar; floats deben fallar
    - **Validates: Requirements RF-08.3, RF-08.7**
    - **Property 4: MonsterSchema valida slots como exactamente 4 elementos Slot válidos** — `fc.array(fc.constantFrom('Horn','Wing','Claw','Tail','all'), { minLength: 4, maxLength: 4 })` para válidos; arrays de otra longitud o con valores inválidos para rechazos
    - **Validates: Requirements RF-08.4, RF-08.5, RF-08.6**
    - Archivo: `src/__tests__/schemas.test.ts`
    - _Requisitos: RF-10.1, RF-10.2, RF-10.3_

- [x] 10. Implementar loader de monstruos y archivo de datos de ejemplo
  - [x] 10.1 Crear `src/loader.ts` con la función `loadMonsters`
    - Firma: `loadMonsters(raw: unknown): Monster[]`
    - Verificar que `raw` es un array; si no, lanzar error descriptivo
    - Iterar elementos con `MonsterSchema.safeParse`; si falla, lanzar error con índice y path del error de Zod
    - Si todo es válido, devolver `Monster[]` sin modificar los datos
    - Sin I/O (no llama a `fs.readFileSync`)
    - _Requisitos: RF-09.1, RF-09.2, RF-09.3, RF-09.4, RF-09.5, RNF-01_

  - [x] 10.2 Crear `config/monsters.json` con al menos 2 monstruos válidos de Sherbet Forest
    - Al menos 2 entradas: `Frostbite Bunny` (hp: 3, slots: Horn/Wing/Claw/Tail) y `Candy Creeper` (hp: 2, slots: Horn/Horn/all/Tail)
    - Estructura: `[{ "id": "snac-001", "name": "...", "hp": N, "slots": [...] }, ...]`
    - _Requisitos: RF-09.6_

  - [x]* 10.3 Escribir property tests para `loadMonsters`
    - **Property 5: loadMonsters preserva datos en round-trip para entrada válida** — generar arrays de monstruos válidos con `fc.array(validMonsterArb)` y verificar que los valores de salida coinciden con la entrada
    - **Validates: Requirements RF-09.1, RF-09.4**
    - **Property 6: loadMonsters rechaza cualquier monstruo con slot desconocido** — generar arrays con al menos un monstruo con slot inválido; verificar que lanza error y que el mensaje incluye el índice
    - **Validates: Requirements RF-09.2**
    - **Property 7: loadMonsters rechaza cualquier entrada que no sea un array** — `fc.oneof(fc.string(), fc.integer(), fc.object(), fc.constant(null), fc.constant(undefined))`; verificar que siempre lanza error
    - **Validates: Requirements RF-09.5**
    - Archivo: `src/__tests__/loader.test.ts`
    - _Requisitos: RF-10.4, RF-10.5, RF-10.6_

- [x] 11. Implementar RNG determinista (Mulberry32)
  - [x] 11.1 Crear `src/rng.ts` con la clase `SeededRng`
    - Constructor que acepta `seed: number | string`; si es string, convertir con hash FNV-1a simple
    - Método `next(): number` — Mulberry32: `state += 0x6d2b79f5`, operaciones con `Math.imul`, devolver `result >>> 0 / 4294967296`
    - Método `nextInt(min: number, max: number): number`
    - Sin I/O ni dependencias externas
    - _Requisitos: RNF-02.1, RNF-02.2, RNF-01_

  - [x]* 11.2 Escribir property test de determinismo para `SeededRng`
    - **Property 8: RNG es determinista — dos instancias con el mismo seed producen secuencias idénticas** — `fc.oneof(fc.integer(), fc.string({ minLength: 1 }))` para seed; `fc.integer({ min: 1, max: 50 })` para n; comparar primeras n llamadas a `next()` de dos instancias con el mismo seed
    - **Validates: Requirements RNF-02.1, RNF-02.2**
    - Archivo: `src/__tests__/rng.test.ts`
    - _Requisitos: RNF-02.3_

- [x] 12. Crear barrel de exportaciones y verificar compilación
  - [x] 12.1 Crear `src/index.ts` con todas las exportaciones públicas del engine
    - Exportar tipos: `Symbol`, `Slot`, `Die`, `Trophy`, `Monster`, `CombatState`
    - Exportar schema: `MonsterSchema`, `MonsterFromSchema`
    - Exportar loader: `loadMonsters`
    - Exportar RNG: `SeededRng`
    - Verificar que `pnpm typecheck` pasa sin errores en strict mode
    - _Requisitos: RF-07.7, RNF-01.4_

- [x] 13. Checkpoint final — cobertura >= 90 % y todos los tests pasando
  - Ejecutar `pnpm test -- --run` desde la raíz del monorepo
  - Verificar que Vitest reporta cobertura de líneas, ramas, funciones y sentencias >= 90 % en `packages/engine/src`
  - Verificar que `pnpm lint` y `pnpm typecheck` pasan sin errores
  - Si la cobertura está por debajo del umbral, añadir tests unitarios adicionales en los archivos de test existentes hasta cumplir el requisito
  - _Requisitos: RF-05.2, RF-10.7_

---

## Notas

- Las tareas marcadas con `*` son opcionales y pueden omitirse para una versión MVP más rápida
- Cada tarea referencia los requisitos específicos para trazabilidad
- Los property tests usan `fast-check` como generador de valores arbitrarios dentro de Vitest
- El Área 2 (tareas 8–13) está definida aquí pero **no debe implementarse hasta que el usuario apruebe este plan**
- Todas las versiones de dependencias se fijarán con semver exacto o patch range `^patch` en el momento de implementación
- Los comentarios en el código deben citar el SRS ID correspondiente (RNF-03.3)

---

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3"] },
    { "id": 1, "tasks": ["2.1", "2.2"] },
    { "id": 2, "tasks": ["3.1", "4.1", "5.1", "5.2", "5.3"] },
    { "id": 3, "tasks": ["3.2", "6.1"] },
    { "id": 4, "tasks": ["8.1"] },
    { "id": 5, "tasks": ["9.1", "10.1", "10.2", "11.1"] },
    { "id": 6, "tasks": ["9.2", "10.3", "11.2"] },
    { "id": 7, "tasks": ["12.1"] }
  ]
}
```

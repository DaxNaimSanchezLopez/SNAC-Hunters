---
inclusion: always
---

# Estructura del Monorepo — SNAC Hunters

## Árbol de Directorios

```
snac-hunters/
├── .github/
│   └── workflows/
│       └── ci.yml              # Pipeline de CI: lint, typecheck, test
├── .kiro/
│   └── steering/
│       ├── product.md          # Contexto del producto y reglas de oro
│       ├── tech.md             # Stack tecnológico obligatorio
│       └── structure.md        # Este archivo
├── apps/
│   ├── api/                    # AWS Lambdas + API Gateway REST + Cognito
│   │   ├── src/
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── web/                    # React + Vite SPA
│       ├── src/
│       ├── package.json
│       └── tsconfig.json
├── config/                     # JSON de valores del juego + schemas Zod
│   └── monsters.json           # Monstruos de Sherbet Forest
├── docs/
│   └── decisiones.md           # Decisiones de diseño consolidadas (D-01 a D-05)
├── infra/                      # Infraestructura con AWS CDK TypeScript
│   ├── src/
│   ├── package.json
│   └── tsconfig.json
├── packages/
│   └── engine/                 # Reglas del juego — TypeScript puro, sin I/O
│       ├── src/
│       │   ├── types.ts        # RF-07: Symbol, Slot, Die, Trophy, Monster, CombatState
│       │   ├── schemas.ts      # RF-08: MonsterSchema (Zod)
│       │   ├── loader.ts       # RF-09: loadMonsters
│       │   ├── rng.ts          # RNF-02: RNG determinista (Mulberry32)
│       │   ├── index.ts        # Barrel de exportaciones públicas
│       │   └── __tests__/
│       │       ├── trivial.test.ts
│       │       ├── schemas.test.ts
│       │       ├── loader.test.ts
│       │       └── rng.test.ts
│       ├── package.json
│       ├── tsconfig.json
│       └── vitest.config.ts    # RF-05: cobertura >= 90%
├── .gitignore
├── .nvmrc                      # Node 20
├── .prettierrc
├── eslint.config.js            # RF-03: flat config ESLint 9
├── package.json                # Scripts raíz delegados con pnpm -r
├── pnpm-workspace.yaml         # Workspaces: packages/*, apps/*, infra, config
├── README.md
└── tsconfig.base.json          # Base con strict: true, extendido por todos los paquetes
```

---

## Responsabilidades por Paquete

### `packages/engine`

**Reglas del juego. TypeScript puro. Sin React, sin AWS, sin I/O.**

- Contiene toda la lógica de reglas del juego (símbolos, slots, combate, RNG).
- No depende de `react`, `react-dom`, `@aws-sdk/*`, `aws-amplify`, ni módulos de I/O de Node.js (`fs`, `path`, `node:fs`, `node:path`). ESLint lo hace cumplir automáticamente.
- La única librería de borde permitida es **Zod**, para validar datos de configuración al entrar al engine.
- Incluye un RNG determinista con semilla (Mulberry32) para que el servidor pueda re-simular cualquier partida dado el mismo seed y la misma secuencia de acciones.
- Cobertura de tests >= 90 % en líneas, ramas, funciones y sentencias (Vitest + `@vitest/coverage-v8`).
- **Regla de oro 1:** La UI nunca calcula reglas; siempre delega al engine.
- **Regla de oro 4:** El engine es puro — sin efectos secundarios, sin I/O, sin estado global mutable.
- **Regla de oro 6:** Cobertura >= 90 % obligatoria en `packages/engine/src`.

### `apps/web`

**UI React. Delega toda la lógica al engine. Nunca calcula reglas directamente.**

- Aplicación React + Vite + Tailwind CSS + Zustand + Framer Motion + `idb-keyval` + `aws-amplify`.
- Presenta el estado del juego recibido del engine; no ejecuta reglas por su cuenta.
- Usa `aws-amplify` para autenticación con Cognito y comunicación con la API.
- Persiste estado local offline con `idb-keyval` (IndexedDB).
- **Regla de oro 1:** La UI nunca calcula reglas; siempre delega al engine.

### `apps/api`

**Lambdas que re-simulan seed + acciones con el engine. No confía en el cliente.**

- AWS Lambdas + API Gateway REST + Cognito authorizer.
- Bundleado con `esbuild` para Node 20.
- Re-simula seed + secuencia de acciones del jugador usando el mismo engine para validar el estado que envía el cliente.
- Usa Zod para validar el input de cada endpoint.
- **Regla de oro 3:** El servidor re-simula seed + acciones; nunca acepta el estado final del cliente como fuente de verdad.

### `infra`

**Infraestructura AWS definida con CDK TypeScript.**

- AWS CDK en TypeScript, región `us-east-1`.
- Dos stages: `dev` y `prod`.
- Provisiona API Gateway, Lambdas, Cognito User Pool, AppConfig y cualquier otro recurso de AWS necesario.
- **Regla de oro 7:** Infra como código — nada se configura a mano en la consola de AWS.

### `config`

**JSON de valores del juego. Validados con Zod. Sin valores hardcoded en el código.**

- Contiene archivos JSON con los valores de economía, stats y texto de juego (p. ej. `monsters.json`).
- Cada archivo JSON tiene su schema Zod correspondiente para garantizar el contrato del dominio.
- Diseñado para ser servido luego por AWS AppConfig (cambios en caliente sin redeploy).
- **Regla de oro 2:** Los valores de economía, stats y texto de tutoriales viven en `config/`, no hardcodeados en el código.

---

## Regla de Capas

La dirección de las dependencias es siempre descendente. Ninguna capa puede importar de una capa superior.

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

**Regla de oro 1:** La UI (`apps/web`) nunca calcula reglas del juego. Siempre delega al engine.  
**Regla de oro 3:** El servidor (`apps/api`) re-simula seed + acciones con el mismo engine y no confía en el estado enviado por el cliente.

---

## Convenciones

### Idioma y documentación

- Todos los documentos de spec (`requirements.md`, `design.md`, `tasks.md`) y comentarios de diseño se escriben en **español**.
- Las palabras clave EARS (`WHEN`, `THEN`, `SHALL`, `WHILE`, `IF`, `WHERE`) se mantienen en **inglés**.
- Cada requisito tiene un SRS ID único en formato `RF-xx` (funcional) o `RNF-xx` (no funcional).
- Todo comentario en el código que implemente un requisito debe citar su SRS ID (p. ej. `// RF-07: Cuatro símbolos del juego`).

### Flujo de trabajo Git

- Una feature = una rama = un PR.
- Los nombres de rama siguen el patrón: `feat/<descripción-breve>`, `fix/<descripción-breve>`, `chore/<descripción-breve>`.
- **Regla de oro 8:** Cada spec es revisado por alguien distinto al implementador antes de hacer merge. El CI debe pasar (`lint`, `typecheck`, `test`) para poder hacer merge.

### Decisiones de diseño

- Cuando se toma una decisión ante una ambigüedad del reglamento, se registra en `docs/decisiones.md` con su identificador `D-xx`, contexto, decisión tomada, alternativas consideradas y consecuencias.
- **Regla de oro 5:** Las ambigüedades del reglamento se registran explícitamente como decisiones o suposiciones no confirmadas — nunca se inventan silenciosamente.

### Pureza del engine

- ESLint valida automáticamente que `packages/engine/src/**/*.ts` no importe módulos prohibidos.
- Ningún archivo del engine hace I/O ni llama a APIs de red directamente.
- **Regla de oro 4:** El engine es puro — sin efectos secundarios observables desde fuera.

### Cobertura de tests

- El umbral de cobertura >= 90 % en `packages/engine/src` es obligatorio y el CI falla si no se cumple.
- Se usan tanto tests unitarios (ejemplos concretos) como property-based tests con `fast-check` (propiedades universales).
- **Regla de oro 6:** Cobertura >= 90 % en el engine es innegociable.

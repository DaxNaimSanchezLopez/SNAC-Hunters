---
inclusion: always
---

# Stack Tecnológico — SNAC Hunters

## Runtime y gestor de paquetes

- **Node.js 20** (LTS) — versión declarada en `.nvmrc`
- **pnpm 10** — gestor de paquetes y monorepo manager vía `pnpm-workspace.yaml`
- Nunca usar `npm` ni `yarn`; todos los scripts se lanzan con `pnpm`

## Lenguaje

- **TypeScript** en modo estricto (`"strict": true`) en **todos** los paquetes
- Todos los `tsconfig.json` extienden `../../tsconfig.base.json` (o la ruta relativa correcta a la raíz)
- Opciones base: `"target": "ES2022"`, `"module": "NodeNext"`, `"moduleResolution": "NodeNext"`, `declarationMap`, `sourceMap`
- Cero errores de compilación antes de cada commit

## Testing

- **Vitest** como framework de tests en todos los paquetes TypeScript
- **@testing-library/react** para tests de componentes en `apps/web`
- **Playwright** para tests E2E (flujos completos usuario-interfaz)
- **fast-check** para property-based testing (PBT) en `packages/engine`
- **Cobertura >= 90 %** en líneas, ramas, funciones y sentencias sobre `packages/engine/src` — el CI falla si no se cumple
- Los tests del engine se ejecutan sin I/O ni dependencias de UI (puro TypeScript)

## Lint y formato

- **ESLint 9** con flat config (`eslint.config.js` en la raíz)
- **Prettier** con la configuración de `.prettierrc`: `singleQuote: true`, `semi: true`, `trailingComma: "all"`, `printWidth: 100`, `tabWidth: 2`
- Regla crítica de lint — `no-restricted-imports` en `packages/engine/src/**/*.ts`:
  - ❌ Prohibido importar: `react`, `react-dom`, `react/**`
  - ❌ Prohibido importar: `@aws-sdk/**`, `aws-amplify`, `aws-amplify/**`
  - ❌ Prohibido importar: `node:fs`, `node:path`, `node:os`, `fs`, `path`
  - Esta regla implementa la **Regla de oro 1** — el engine es puro TypeScript sin I/O ni UI

## CI

- **GitHub Actions** — workflow en `.github/workflows/ci.yml`
- Disparado en eventos `push` y `pull_request`
- Job `ci` en `ubuntu-latest`, Node 20, pnpm 10
- Pasos en orden: `pnpm install --frozen-lockfile` → `pnpm lint` → `pnpm typecheck` → `pnpm test -- --run`
- Cualquier paso fallido marca la ejecución como fallida e impide el merge automático

## Frontend (apps/web)

| Librería | Propósito |
|---|---|
| **React 18** | Framework de UI |
| **Vite 5** | Dev server y bundler |
| **Tailwind CSS** | Estilos utilitarios |
| **Zustand** | Estado global de la aplicación |
| **Framer Motion** | Animaciones declarativas |
| **idb-keyval** | Persistencia local en IndexedDB |
| **aws-amplify** | Autenticación (Cognito) y comunicación con la API |

> **Regla de oro 1:** La UI **nunca** calcula reglas del juego. Toda lógica de juego se delega a `packages/engine`. La UI solo renderiza estado y envía acciones.

## Backend (apps/api)

- **AWS Lambda** — runtime Node 20, empaquetado con **esbuild** (bundling para Lambda)
- **Zod** — validación de payloads en los handlers
- **API Gateway REST** — punto de entrada HTTP con autorización Cognito
- **Cognito authorizer** — autenticación y autorización de peticiones
- El servidor re-simula `seed + acciones` usando el mismo `packages/engine` para no confiar en el cliente

## Infraestructura (infra)

- **AWS CDK TypeScript** — definición de infraestructura como código
- Región: **us-east-1**
- Stages: **dev** y **prod**
- Todos los recursos se definen en el paquete `infra/` y se despliegan con `cdk deploy`

## Configuración (config)

- Los valores de economía, stats de monstruos y texto de tutoriales viven en `config/` como archivos JSON
- Todos los JSON de configuración se validan con **Zod** antes de ser consumidos
- En producción, los archivos se sirven vía **AWS AppConfig** (sin hardcodear en el código)

> **Regla de oro 2:** Los valores de configuración del juego **nunca** se hardcodean en el código fuente. Siempre residen en `config/`, validados con Zod.

## Analytics (roadmap futuro)

- **Amazon Data Firehose** → **S3** (formato Parquet)
- **AWS Glue** + **Amazon Athena** para consultas sobre eventos de partida
- No se implementa en el vertical slice actual; se documenta para guiar decisiones de arquitectura

---

*Documento de referencia para SNAC Hunters — Equipo 13, Full Stack Workshop.*
*Este archivo está marcado con `inclusion: always` para que el agente lo lea en cada sesión.*

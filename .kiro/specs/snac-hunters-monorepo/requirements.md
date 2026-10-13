# Documento de Requisitos

## Introducción

Este documento especifica los requisitos para la configuración inicial del monorepo **SNAC Hunters** y el modelo de dominio del engine para el vertical slice single-player del juego de mesa "Attack of the SNACs" (Pieland Games), Equipo 13, Full Stack Workshop. La zona cubierta en este slice es Sherbet Forest.

El spec abarca dos áreas:

1. **Área 1 — Monorepo skeleton:** Estructura, configuración de herramientas, CI y steering files.
2. **Área 2 — Spec `engine-domain-model`:** Tipos del dominio del engine, schema Zod de `Monster`, loader de `config/monsters.json` y tareas de test.

Todo el código de reglas del juego reside exclusivamente en `packages/engine`. La UI (`apps/web`) nunca calcula reglas; siempre delega al engine. Los valores de economía, stats y texto de tutoriales no se codifican en duro; viven en `config/` validados con Zod. El servidor re-simula seed + acciones con el mismo engine para no confiar en el cliente.

---

## Glosario

- **Monorepo**: Repositorio único que contiene múltiples paquetes gestionados con pnpm workspaces.
- **Engine** (`packages/engine`): Paquete TypeScript puro que contiene las reglas del juego. Sin UI, sin I/O, sin dependencias de AWS.
- **Web** (`apps/web`): Aplicación React + Vite que sirve la interfaz de usuario.
- **API** (`apps/api`): AWS Lambdas + API Gateway REST con Cognito authorizer.
- **Infra** (`infra`): Infraestructura definida con AWS CDK (TypeScript), región `us-east-1`, stages `dev` y `prod`.
- **Config** (`config`): Valores de configuración del juego (JSON) servidos luego por AWS AppConfig, validados con Zod.
- **Symbol**: Uno de los cuatro símbolos del juego — `Horn` (hacha), `Wing` (flecha), `Claw` (lupa), `Tail` (gancho).
- **Slot**: Posición en un monstruo que admite un `Symbol` o el valor especial `all` (cualquier símbolo).
- **Die**: Representación de un dado de juego con una cara activa.
- **DamageDie**: Dado de daño que se añade al pool en cada relanzamiento y que, al causar daño, sale del pool.
- **Trophy**: Trofeo obtenido al derrotar o estudiar un monstruo; reemplaza dados y se elimina del tablero.
- **Monster**: Entidad del juego con 4 slots y puntos de vida (HP).
- **CombatState**: Interfaz estática que describe el estado de un combate en un momento dado; sin lógica de transición.
- **Loader**: Función que carga y valida `config/monsters.json` usando el schema Zod de `Monster`.
- **RNG determinista**: Generador de números aleatorios con semilla fija que produce la misma secuencia dado el mismo seed.
- **SRS ID**: Identificador de requisito del sistema. Formato: `RF-xx` (funcional) o `RNF-xx` (no funcional).
- **Steering file**: Archivo en `.kiro/steering/` que guía al agente de IA con contexto del proyecto.
- **EARS**: Easy Approach to Requirements Syntax — patrón de redacción de requisitos.
- **CI**: Integración continua implementada con GitHub Actions.
- **Strict mode**: Configuración TypeScript con `"strict": true` habilitado.
- **Flat config**: Formato de configuración de ESLint v9 basado en `eslint.config.js`.
- **pnpm workspaces**: Mecanismo de pnpm para gestionar múltiples paquetes en un monorepo.
- **Cobertura**: Porcentaje de líneas/ramas de código cubiertas por tests automáticos.
- **Derrota**: Resultado de combate cuando los 4 slots del monstruo coinciden con los dados del jugador.
- **Estudio**: Resultado de combate cuando cualquier par de slots coincide (el monstruo escapa, se obtiene el trofeo).
- **Huida**: Resultado de combate cuando solo 1 símbolo coincide (sin trofeo, sin KO).
- **KO**: El HP del jugador llega a 0.

---

## Requisitos

---

### RF-01 — Estructura del monorepo

**User Story:** Como desarrollador del equipo, quiero que el repositorio tenga una estructura de monorepo con pnpm workspaces, para que todos los paquetes compartan tooling, versiones y configuración coherente.

#### Criterios de Aceptación

1. THE Monorepo SHALL contener un archivo `pnpm-workspace.yaml` en la raíz que declare los workspaces `packages/*`, `apps/*`, `infra` y `config`.
2. THE Monorepo SHALL contener un `package.json` raíz con scripts `lint`, `typecheck`, `test`, `build` y `format` que deleguen en los paquetes correspondientes vía pnpm.
3. THE Monorepo SHALL contener un `tsconfig.base.json` en la raíz con `"strict": true` y las opciones de compilación comunes; todos los `tsconfig.json` de los paquetes extenderán de este archivo.
4. THE Monorepo SHALL contener un `.nvmrc` en la raíz declarando la versión `20`.
5. THE Monorepo SHALL contener un `.gitignore` en la raíz que excluya `node_modules`, `dist`, `.turbo`, `.env*`, `cdk.out` y artefactos de cobertura.
6. THE Monorepo SHALL contener un `README.md` en la raíz con el nombre del proyecto, descripción breve, instrucciones de instalación y comandos de desarrollo.

---

### RF-02 — Paquetes del monorepo

**User Story:** Como desarrollador del equipo, quiero que existan las cinco carpetas de paquetes con su configuración inicial, para que cada área de responsabilidad tenga un punto de entrada bien definido.

#### Criterios de Aceptación

1. THE Monorepo SHALL contener los directorios `packages/engine`, `apps/web`, `apps/api`, `infra` y `config`, cada uno con su propio `package.json` y `tsconfig.json`.
2. WHEN el paquete es `packages/engine`, THE Engine SHALL declarar en su `package.json` únicamente dependencias de producción en Zod y ninguna dependencia de React, `aws-sdk`, o módulos de Node.js con I/O (`node:fs`, `node:path`, etc.).
3. WHEN el paquete es `apps/web`, THE Web SHALL declarar dependencias en React, Vite, Tailwind CSS, Zustand, Framer Motion, `idb-keyval` y `aws-amplify`.
4. WHEN el paquete es `apps/api`, THE API SHALL declarar dependencias en Zod y en el bundler esbuild para Node 20 Lambdas.
5. WHEN el paquete es `infra`, THE Infra SHALL declarar dependencias en `aws-cdk-lib` y `constructs`.
6. WHEN el paquete es `config`, THE Config SHALL declarar dependencias en Zod para validar los archivos JSON de configuración del juego.

---

### RF-03 — Configuración de ESLint

**User Story:** Como desarrollador del equipo, quiero reglas de lint que impidan importar módulos de UI o AWS dentro del engine, para garantizar que `packages/engine` permanezca puro.

#### Criterios de Aceptación

1. THE Monorepo SHALL contener un `eslint.config.js` en la raíz usando el formato flat config de ESLint 9.
2. WHEN un archivo dentro de `packages/engine` importa un módulo de React (por ejemplo `react`, `react-dom`), THE ESLint SHALL reportar un error de lint.
3. WHEN un archivo dentro de `packages/engine` importa un módulo de AWS SDK (por ejemplo `@aws-sdk/*`, `aws-amplify`), THE ESLint SHALL reportar un error de lint.
4. WHEN un archivo dentro de `packages/engine` importa un módulo de I/O de Node.js (por ejemplo `node:fs`, `node:path`, `fs`, `path`), THE ESLint SHALL reportar un error de lint.
5. THE Monorepo SHALL contener un `.prettierrc` en la raíz con la configuración de formato compartida para todos los paquetes.

---

### RF-04 — CI con GitHub Actions

**User Story:** Como desarrollador del equipo, quiero que se ejecute un pipeline de CI en cada push y PR, para detectar errores de lint, tipos y tests antes de mezclar código.

#### Criterios de Aceptación

1. THE Monorepo SHALL contener `.github/workflows/ci.yml` que defina un workflow disparado en eventos `push` y `pull_request`.
2. WHEN el workflow de CI se ejecuta, THE CI SHALL instalar dependencias con `pnpm install --frozen-lockfile`.
3. WHEN el workflow de CI se ejecuta, THE CI SHALL ejecutar el script `lint` del workspace raíz.
4. WHEN el workflow de CI se ejecuta, THE CI SHALL ejecutar el script `typecheck` del workspace raíz.
5. WHEN el workflow de CI se ejecuta, THE CI SHALL ejecutar el script `test` del workspace raíz con Vitest en modo `run` (sin watcher).
6. WHEN cualquiera de los pasos del workflow falla, THE CI SHALL marcar la ejecución como fallida e impedir el merge automático de la PR.
7. THE CI SHALL usar Node 20 como versión de runtime en todos los jobs.

---

### RF-05 — Engine: configuración de Vitest y cobertura

**User Story:** Como desarrollador del equipo, quiero que `packages/engine` tenga Vitest configurado con umbral de cobertura >= 90 %, para asegurar que las reglas del juego estén bien probadas.

#### Criterios de Aceptación

1. THE Engine SHALL contener un `vitest.config.ts` que configure la cobertura con `provider: 'v8'` o `provider: 'istanbul'`.
2. WHEN se ejecuta el script `test` en `packages/engine`, THE Engine SHALL fallar si la cobertura de líneas, ramas, funciones o sentencias cae por debajo del 90 %.
3. THE Engine SHALL contener al menos un test trivial pasando en el momento de la creación del skeleton (por ejemplo, un test que verifica que `1 + 1 === 2` o que importa y usa un tipo exportado).
4. WHEN se ejecuta el test trivial, THE Vitest SHALL reportar el test como `passed`.

---

### RF-06 — Steering files

**User Story:** Como agente de IA del equipo, quiero contar con steering files actualizados en `.kiro/steering/`, para obtener contexto coherente del proyecto en cada sesión.

#### Criterios de Aceptación

1. THE Monorepo SHALL contener `.kiro/steering/product.md` describiendo el propósito del producto, la zona Sherbet Forest y el contexto del juego "Attack of the SNACs".
2. THE Monorepo SHALL contener `.kiro/steering/tech.md` describiendo el stack tecnológico obligatorio (Node 20, TypeScript strict, pnpm 10, Vitest, ESLint 9 flat config, Prettier, GitHub Actions, React + Vite + Tailwind + Zustand + Framer Motion + idb-keyval + aws-amplify, AWS Lambdas + esbuild + Zod, AWS CDK us-east-1, stages dev/prod).
3. THE Monorepo SHALL contener `.kiro/steering/structure.md` describiendo la estructura de carpetas del monorepo y las responsabilidades de cada paquete.
4. WHEN el contenido de un steering file hace referencia a una regla de oro, THE Steering File SHALL citar la regla con su número (1–8) tal como se definen en la especificación del proyecto.

---

### RF-07 — Engine: tipos del dominio

**User Story:** Como desarrollador del engine, quiero que los tipos `Symbol`, `Slot`, `Die`, `Trophy`, `Monster` y `CombatState` estén definidos en `packages/engine`, para tener un modelo de dominio compartido y type-safe.

#### Criterios de Aceptación

1. THE Engine SHALL exportar un tipo `Symbol` que sea una unión de los literales `'Horn'`, `'Wing'`, `'Claw'` y `'Tail'`.
2. THE Engine SHALL exportar un tipo `Slot` que sea una unión de `Symbol` y el literal `'all'`.
3. THE Engine SHALL exportar un tipo `Die` que represente un dado con una propiedad `face` de tipo `Symbol | 'damage' | 'heart' | 'blank'`, más metadatos opcionales de identificación.
4. THE Engine SHALL exportar un tipo `Trophy` que incluya al menos la propiedad `monsterId` de tipo `string` y opcionalmente `symbol` de tipo `Symbol`, representando el trofeo obtenido al derrotar o estudiar un monstruo.
5. THE Engine SHALL exportar una interfaz `Monster` con propiedades: `id` (string), `name` (string), `hp` (número entero positivo), y `slots` (array de exactamente 4 elementos de tipo `Slot`).
6. THE Engine SHALL exportar una interfaz `CombatState` con propiedades de solo lectura que describan el estado estático de un combate: `monster` (Monster), `playerHp` (número), `dicePool` (array de Die), `damageDiceCount` (número) y `trophies` (array de Trophy). THE Engine SHALL NOT incluir lógica de transición de estado en `CombatState`.
7. WHEN TypeScript compila `packages/engine` en strict mode, THE TypeScript Compiler SHALL reportar cero errores sobre los tipos del dominio.

---

### RF-08 — Engine: schema Zod de Monster

**User Story:** Como desarrollador del engine, quiero un schema Zod que valide objetos `Monster`, para garantizar que los datos cargados desde JSON cumplan el contrato del dominio.

#### Criterios de Aceptación

1. THE Engine SHALL exportar un `MonsterSchema` de Zod que valide que el campo `id` sea un string no vacío.
2. THE Engine SHALL exportar un `MonsterSchema` de Zod que valide que el campo `name` sea un string no vacío.
3. THE Engine SHALL exportar un `MonsterSchema` de Zod que valide que el campo `hp` sea un número entero mayor o igual a 1.
4. THE Engine SHALL exportar un `MonsterSchema` de Zod que valide que el campo `slots` sea un array de exactamente 4 elementos, donde cada elemento sea uno de los valores `'Horn'`, `'Wing'`, `'Claw'`, `'Tail'` o `'all'`.
5. WHEN se pasa un objeto con un slot cuyo valor no está en `['Horn', 'Wing', 'Claw', 'Tail', 'all']`, THE MonsterSchema SHALL rechazar el objeto y devolver un error de validación de Zod.
6. WHEN se pasa un objeto con un array `slots` de longitud distinta a 4, THE MonsterSchema SHALL rechazar el objeto y devolver un error de validación de Zod.
7. WHEN se pasa un objeto con `hp` igual a 0 o negativo, THE MonsterSchema SHALL rechazar el objeto y devolver un error de validación de Zod.
8. THE MonsterSchema SHALL derivar el tipo TypeScript `Monster` usando `z.infer<typeof MonsterSchema>`, de modo que el tipo inferido sea compatible con la interfaz `Monster` definida en RF-07.

---

### RF-09 — Engine: loader de config/monsters.json

**User Story:** Como desarrollador del engine, quiero un loader que cargue y valide `config/monsters.json`, para que los datos de monstruos estén disponibles en el engine con garantías de tipo.

#### Criterios de Aceptación

1. THE Engine SHALL exportar una función `loadMonsters` que acepte el contenido JSON crudo (como `unknown`) y devuelva un array de `Monster` tipado.
2. WHEN `loadMonsters` recibe un array en el que algún elemento contiene un slot con un símbolo desconocido (no presente en `['Horn', 'Wing', 'Claw', 'Tail', 'all']`), THE Loader SHALL lanzar un error descriptivo que identifique el elemento inválido.
3. WHEN `loadMonsters` recibe un array en el que algún monstruo tiene un campo `slots` con longitud distinta a 4, THE Loader SHALL lanzar un error descriptivo.
4. WHEN `loadMonsters` recibe un array en el que todos los monstruos son válidos, THE Loader SHALL devolver el array completo de objetos `Monster` sin modificar los datos.
5. WHEN `loadMonsters` recibe un valor que no es un array, THE Loader SHALL lanzar un error descriptivo.
6. THE Engine SHALL contener un archivo `config/monsters.json` de ejemplo en la raíz del paquete (o referenciado desde `config/`) con al menos un monstruo válido que el loader pueda procesar.

---

### RF-10 — Engine: tests del dominio

**User Story:** Como desarrollador del engine, quiero tests automatizados para los tipos, el schema Zod y el loader, para garantizar la corrección del modelo de dominio desde el primer commit.

#### Criterios de Aceptación

1. THE Engine SHALL contener tests unitarios con Vitest que verifiquen que `MonsterSchema` acepta un objeto `Monster` válido.
2. THE Engine SHALL contener tests unitarios con Vitest que verifiquen que `MonsterSchema` rechaza un objeto con slots inválidos (símbolo desconocido o longitud != 4).
3. THE Engine SHALL contener tests unitarios con Vitest que verifiquen que `MonsterSchema` rechaza un objeto con `hp <= 0`.
4. THE Engine SHALL contener tests unitarios con Vitest que verifiquen que `loadMonsters` devuelve el array correcto dado un JSON válido.
5. THE Engine SHALL contener tests unitarios con Vitest que verifiquen que `loadMonsters` lanza un error dado un JSON con símbolos desconocidos.
6. THE Engine SHALL contener tests unitarios con Vitest que verifiquen que `loadMonsters` lanza un error dado un JSON con `slots` de longitud incorrecta.
7. WHEN se ejecutan todos los tests del engine, THE Vitest SHALL reportar cobertura de líneas, ramas, funciones y sentencias >= 90 % sobre `packages/engine/src`.

---

### RNF-01 — Pureza del engine

**User Story:** Como arquitecto del proyecto, quiero que `packages/engine` no dependa de módulos de UI, AWS o I/O de Node.js, para que las reglas del juego sean portables, testeables en aislamiento y re-simulables en el servidor.

#### Criterios de Aceptación

1. THE Engine SHALL NOT declarar dependencias en `react`, `react-dom`, ni en ningún paquete del ecosistema React en su `package.json`.
2. THE Engine SHALL NOT declarar dependencias en `@aws-sdk/*`, `aws-amplify`, ni en ningún paquete del ecosistema AWS en su `package.json`.
3. WHEN el linter procesa cualquier archivo `.ts` dentro de `packages/engine/src`, THE ESLint SHALL reportar un error si detecta un import de `react`, `@aws-sdk/*` o `node:fs`.
4. THE Engine SHALL pasar el script `typecheck` del workspace raíz sin errores de compilación de TypeScript en strict mode.

---

### RNF-02 — Determinismo del engine

**User Story:** Como desarrollador del servidor, quiero que el RNG del engine sea determinista con semilla, para poder re-simular cualquier partida dado el mismo seed y la misma secuencia de acciones.

#### Criterios de Aceptación

1. THE Engine SHALL exponer una función o clase de RNG que acepte un seed numérico o string y produzca la misma secuencia de valores en cada invocación con el mismo seed.
2. WHEN se ejecutan dos instancias del RNG con el mismo seed y la misma secuencia de llamadas, THE RNG SHALL producir valores idénticos en ambas instancias.
3. THE Engine SHALL incluir al menos un test con semilla fija que verifique la propiedad determinista del RNG.

---

### RNF-03 — Convenciones de nomenclatura y documentación

**User Story:** Como desarrollador del equipo, quiero que los specs y documentos estén escritos en español y que las palabras clave EARS permanezcan en inglés, para cumplir con las convenciones del equipo.

#### Criterios de Aceptación

1. THE Monorepo SHALL mantener todos los documentos de spec (`requirements.md`, `design.md`, `tasks.md`) en español, con las palabras clave EARS (`WHEN`, `THEN`, `SHALL`, `WHILE`, `IF`, `WHERE`) en inglés.
2. WHEN una decisión de diseño se toma ante una ambigüedad del reglamento, THE Design Document SHALL registrar la decisión bajo la sección "Decisiones" y consolidar una copia en `docs/decisiones.md`.
3. THE Monorepo SHALL asignar un SRS ID único en formato `RF-xx` o `RNF-xx` a cada requisito, y todo comentario de código que implemente un requisito SHALL citar su SRS ID correspondiente.

---

### RNF-04 — Supuestos no confirmados del dado de daño

> **NOTA:** Los siguientes puntos son supuestos no confirmados por el reglamento oficial. Se marcan como suposiciones para ser validadas con Pieland Games o con la documentación oficial cuando esté disponible.

**User Story:** Como diseñador del juego, quiero que los supuestos sobre el dado de daño queden registrados explícitamente, para que puedan validarse o corregirse sin romper el engine.

#### Criterios de Aceptación

1. THE Design Document SHALL registrar como suposición no confirmada que el dado de daño tiene 6 caras con la distribución: 3 caras de daño, 1 cara de comodín y 2 caras en blanco.
2. THE Design Document SHALL registrar como suposición no confirmada que la cara de comodín del dado de daño no puede cubrir el slot de daño.
3. WHEN se implementen los tipos del dado de daño en el engine, THE Engine SHALL incluir un comentario en el código que cite estas suposiciones y su SRS ID (`RNF-04`).

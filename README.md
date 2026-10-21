# SNAC Hunters

Vertical slice single-player del juego de mesa **"Attack of the SNACs"** (Pieland Games).
Equipo 13 — Full Stack Workshop. Zona cubierta: **Sherbet Forest**.

---

## Descripción

SNAC Hunters es el prototipo digital del mecánico de combate del juego de mesa original. El jugador lanza dados y los asigna a los slots de los monstruos de Sherbet Forest para derrotarlos, estudiarlos o huir de ellos. Toda la lógica del juego reside en `packages/engine` — un paquete TypeScript puro, sin I/O, reutilizable tanto en el cliente como en el servidor.

---

## Estructura del repositorio

```
snac-hunters/
├── apps/
│   ├── api/        # AWS Lambdas + API Gateway REST + Cognito authorizer
│   └── web/        # React + Vite SPA (Tailwind, Zustand, Framer Motion)
├── config/         # JSON de configuración del juego + schemas Zod
├── docs/           # Decisiones de diseño consolidadas
├── infra/          # Infraestructura AWS CDK (TypeScript, us-east-1)
└── packages/
    └── engine/     # Reglas del juego — TypeScript puro, sin UI ni I/O
```

La regla de capas es: **la UI nunca calcula reglas**; siempre delega al engine. El servidor re-simula seed + acciones con el mismo engine para no confiar en el cliente.

---

## Requisitos previos

- **Node.js** `>=20` (ver `.nvmrc`)
- **pnpm** `>=10`

```bash
# Instalar la versión correcta de Node con nvm
nvm use

# Instalar pnpm si no está disponible
npm install -g pnpm@10
```

---

## Instalación

```bash
pnpm install
```

---

## Comandos de desarrollo

| Comando           | Descripción                                         |
|-------------------|-----------------------------------------------------|
| `pnpm lint`       | Ejecuta ESLint en todos los paquetes                |
| `pnpm typecheck`  | Comprueba tipos TypeScript en todos los paquetes    |
| `pnpm test`       | Ejecuta los tests de todos los paquetes con Vitest  |
| `pnpm build`      | Compila todos los paquetes                          |
| `pnpm format`     | Formatea el código con Prettier                     |

---

## Correr la demo en local

Se necesitan dos terminales:

```bash
# 1) API local: mismo router que la Lambda, con almacenamiento en memoria → http://localhost:3001
pnpm --filter @snac-hunters/api dev

# 2) Frontend → http://localhost:5173 (también se puede abrir desde el celular en la misma red)
pnpm --filter @snac-hunters/web dev
```

Sin variables de entorno, el juego usa modo invitado contra la API local. Para apuntar a AWS, copia
`apps/web/.env.example` a `apps/web/.env.local` y llena los valores que imprime `cdk deploy`.

## Infraestructura AWS

```bash
pnpm --filter @snac-hunters/infra synth                 # genera CloudFormation (no requiere cuenta)
pnpm --filter @snac-hunters/web build                   # el deploy sube apps/web/dist a S3
pnpm --filter @snac-hunters/infra run deploy -c stage=dev  # requiere credenciales AWS (ojo: "run", deploy es comando de pnpm)
```

| Recurso | Servicio AWS |
|---------|--------------|
| SPA React | S3 privado + CloudFront (OAC) |
| API REST | API Gateway + Cognito User Pool authorizer |
| Lógica / validación | Lambda Node.js 22 (ejecuta el mismo `packages/engine`) |
| Partidas y analítica | DynamoDB (single-table, on-demand) |

## Versión de prueba para el cliente (Firebase Hosting)

La V0 está publicada en **https://snac-hunters-v0.web.app** (proyecto `snac-hunters-v0`, plan gratuito Spark).

```bash
pnpm deploy:firebase   # build con --mode firebase + firebase deploy --only hosting
```

- El plan Spark solo sirve archivos estáticos, así que este build no usa la API: `apps/web/.env.firebase` apaga `serverValidation` con `VITE_FEATURES_OFF`, sin tocar `config/game.json`, que comparte con la Lambda.
- El juego corre completo en el navegador y guarda la partida en el dispositivo (IndexedDB, con respaldo en `localStorage`).
- La página se sirve con `Cache-Control: no-cache`, así que cada deploy llega al cliente al recargar.
- Requiere el CLI de Firebase con sesión iniciada (`firebase login`).

---

## Paquetes

| Paquete              | Descripción                                                                 |
|----------------------|-----------------------------------------------------------------------------|
| `packages/engine`    | Reglas del juego en TypeScript puro. Sin React, sin AWS, sin I/O de Node.  |
| `apps/web`           | Interfaz de usuario: React + Vite + Tailwind + Zustand + Framer Motion.    |
| `apps/api`           | Backend serverless: AWS Lambdas + API Gateway + Cognito.                   |
| `infra`              | Infraestructura como código: AWS CDK TypeScript, región `us-east-1`.       |
| `config`             | Valores de configuración del juego (JSON) validados con Zod.               |

---

## Testing

Los tests del engine se ejecutan con **Vitest** y requieren una cobertura mínima del **90 %** en líneas, ramas, funciones y sentencias. Las pruebas de propiedades usan **fast-check**.

```bash
# Correr solo los tests del engine con cobertura
cd packages/engine && pnpm test
```

---

## Licencia

Proyecto académico — Full Stack Workshop, Equipo 13.

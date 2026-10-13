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

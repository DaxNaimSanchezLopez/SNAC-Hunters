# Demo de Viabilidad Técnica (D3) — Equipo 13

**Revisión:** jueves 15 de octubre, 12:00 h, salón MTI1 · **Bloque D3:** ~10 min

Objetivo: demostrar que el stack propuesto funciona de punta a punta, con un *vertical slice* del
tutorial interactivo que pidió el cliente (Pieland Games).

---

## Antes de entrar (checklist)

- [ ] `pnpm install` en la laptop que se va a proyectar
- [ ] Terminal 1: `pnpm --filter @snac-hunters/api dev` (API en :3001)
- [ ] Terminal 2: `pnpm --filter @snac-hunters/web dev` (web en :5173, imprime también la URL de red)
- [ ] Abrir la web en el **celular** (misma red Wi-Fi, URL "Network" de Vite) para mostrar mobile-first
- [ ] Pulsar **"Reiniciar progreso"** para empezar en limpio
- [ ] Tener abiertos en el editor: `packages/engine/src/combat.ts`, `config/game.json`, `infra/lib/snac-hunters-stack.ts`
- [ ] Terminal 3 lista para `pnpm test` y `pnpm --filter @snac-hunters/infra synth`

---

## Guion (10 min)

### 1. Arquitectura en 1 minuto

> "El cliente pidió un tutorial interactivo para un jugador y un backend 100% AWS. Separamos el
> proyecto en capas que no se conocen entre sí."

```
config/ (JSON + Zod) ──> packages/engine (TS puro, sin I/O) ──┬──> apps/web (React)
                                                              └──> apps/api (Lambda)
infra/ (AWS CDK): CloudFront+S3 · API Gateway+Cognito · Lambda · DynamoDB
```

Punto clave: **el mismo engine corre en el navegador y en la Lambda**. Así el servidor re-simula la
partida y no confía en el cliente.

### 2. Tutorial en vivo (4 min), de preferencia en el celular

1. "Aprender a jugar". El Huntmaster guía 8 pasos, cuyos textos viven en `config/tutorial.json`.
2. Mostrar a Garden Salaad, sus 4 espacios y el comodín.
3. Tocar el dado verde: **se iluminan solo los espacios válidos**. La UI no calcula esto; se lo
   pregunta al engine (`validSlotsFor`).
4. Colocar dados. El botón cambia entre Huir, Estudiar y Derrotar según los espacios cubiertos.
5. Seleccionar dados y **Relanzar**: aparece el dado blanco. Si sale daño, el aviso explica si un
   corazón lo bloqueó o si se perdió HPie.
6. **Recargar la página a mitad del combate.** Vuelve exactamente al mismo punto (IndexedDB +
   re-simulación).
7. Resolver y elegir un trofeo. La tarjeta muestra **"✓ Validado por el servidor"**.

### 3. Caza libre + analítica (2 min)

1. "Cazar otro SNAC": dos encuentros de **tipos distintos** (estructura de run del brief).
2. Cazar a Porcupineapple o Picmimic para mostrar el **espacio de corazón roto** (hay que recibir daño).
3. Botón **DEV** (solo aparece en modo desarrollo): sesiones, resultados, relanzamientos promedio,
   % de cada cara, tiempo del tutorial (meta < 5 min) y las estadísticas que guardó el servidor.

### 4. Configuración y feature toggles (1 min)

Abrir `config/game.json`:
- Cambiar `"freeHunt": false` y guardar: el botón de caza desaparece **sin tocar código**.
- `scoring`, `startingDice` y `maxHp` son valores de economía que el cliente puede ajustar.
- Regresar el valor a `true`.

### 5. Calidad y AWS (2 min)

```bash
pnpm test        # 69 engine (100% líneas) + 9 API + 4 web
pnpm --filter @snac-hunters/infra synth
```

- Tests deterministas con casos límite que pide el brief: comodines, dado blanco, **daño y escudo
  simultáneos**, KO y derrota en la misma tirada, cliente tramposo rechazado.
- `synth` genera CloudFormation con DynamoDB, Cognito, API Gateway (authorizer), Lambda Node 22,
  S3 y CloudFront. Mostrar `infra/lib/snac-hunters-stack.ts`.
- CI en GitHub Actions: lint → typecheck → test en cada push.

---

## Preguntas probables (cualquiera del equipo debe poder responder)

| Pregunta | Respuesta corta |
|----------|-----------------|
| ¿Por qué el engine es un paquete aparte? | Para que web y Lambda ejecuten las mismas reglas. Es TS puro y ESLint prohíbe importar React, AWS o `fs` ahí. |
| ¿Cómo evitan trampas? | El cliente solo manda seed + acciones; la Lambda re-simula con `replayCombat` y calcula el resultado. Una acción ilegal devuelve 422 (ver D-11). |
| ¿Por qué un RNG con seed? | Mulberry32 (D-01) hace las partidas reproducibles: la misma seed y las mismas acciones dan siempre el mismo resultado. |
| ¿Qué pasa si se cierra el navegador? | Zustand persiste en IndexedDB solo la seed y las acciones; al volver se re-simula. Si los datos están corruptos se descartan sin perder el progreso. |
| ¿Dónde se guardan los datos en AWS? | DynamoDB single-table: `RUN#<usuario>` para partidas validadas y `EVENT#<sesión>` para analítica. |
| ¿Cómo se autentica? | Cognito User Pool + authorizer de API Gateway; el front usa Amplify. En local se juega como invitado. |
| ¿Qué decidieron donde el manual era ambiguo? | `docs/decisiones.md` D-06 a D-13 (slot de daño, escudo automático, KO y derrota simultáneos, etc.). |
| ¿Qué falta? | Fase de pueblo, jefe Pieous, login en la UI, seed emitida por el servidor, deploy en una cuenta AWS y AppConfig para toggles en caliente. |

---

## Estado honesto de la demo

- ✅ Funciona en local de punta a punta (web ↔ API con el mismo handler que la Lambda).
- ✅ La infraestructura sintetiza sin errores (`cdk synth`).
- ⏳ **No está desplegada en AWS**: falta una cuenta con credenciales (`aws configure`) para
  `cdk deploy`. Con cuenta lista, el deploy toma unos 10 minutos.
- ⏳ El login con Cognito está cableado (`apps/web/src/game/auth.ts`) pero la UI no tiene pantalla
  de inicio de sesión todavía.

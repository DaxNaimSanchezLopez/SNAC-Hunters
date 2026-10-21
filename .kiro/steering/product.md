---
inclusion: always
---

# Producto: SNAC Hunters

## Propósito

SNAC Hunters es la implementación digital del juego de mesa **"Attack of the SNACs"** desarrollado por **Pieland Games**. El objetivo es trasladar las mecánicas del juego físico a una experiencia web single-player con arquitectura serverless, garantizando que la lógica del juego sea reproducible y verificable tanto en el cliente como en el servidor.

Este proyecto es desarrollado por el **Equipo 13** dentro del **Full Stack Workshop**, y sirve como referencia de arquitectura de monorepo con TypeScript, AWS y pnpm workspaces.

## Contexto del juego

En "Attack of the SNACs", los jugadores se enfrentan a criaturas llamadas SNACs (Scary Nocturnal Animal Creatures) lanzando dados para intentar cubrir los slots de cada monstruo con los símbolos correctos. El juego combina estrategia de gestión de dados con azar controlado por semilla, lo que permite re-simular partidas completas de forma determinista.

Los jugadores coleccionan trofeos al derrotar o estudiar SNACs, y los usan para mejorar su pool de dados. El HP del jugador baja cuando los dados de daño se acumulan sin ser cancelados.

## Zona: Sherbet Forest

El vertical slice de este proyecto cubre exclusivamente la zona **Sherbet Forest**. Esta zona contiene los primeros monstruos que el jugador encontrará, incluyendo criaturas como _Frostbite Bunny_ y _Candy Creeper_.

Todos los datos de monstruos de Sherbet Forest se almacenan en `config/monsters.json` y son validados con el schema Zod de `MonsterSchema` antes de ser usados por el engine.

## Reglas de oro del equipo

Estas reglas son invariantes de arquitectura. Toda decisión de diseño o implementación debe respetarlas:

1. **La UI NUNCA calcula reglas del juego.** Toda lógica de juego reside exclusivamente en `packages/engine`. Los componentes React solo renderizan estado y despachan acciones.

2. **El servidor re-simula seed + acciones con el mismo engine.** Para no confiar en el cliente, el servidor valida cada partida reproduciendo la secuencia de acciones con el RNG determinista y el mismo seed inicial.

3. **Los valores de configuración del juego no se codifican en duro.** Stats de monstruos, economía y textos de tutorial viven en `config/` validados con Zod, no en el código TypeScript del engine ni de la UI.

4. **El engine no tiene I/O ni dependencias de UI o AWS.** `packages/engine` es TypeScript puro. No importa `fs`, `path`, `react`, `@aws-sdk/*` ni ningún módulo con efectos secundarios.

5. **Strict mode en todo TypeScript.** Todos los paquetes extienden `tsconfig.base.json` con `"strict": true`. No se permiten `any` implícitos ni `null`/`undefined` sin control explícito.

6. **Cobertura de tests >= 90 % en el engine.** Las reglas del juego deben estar completamente cubiertas. El CI falla si la cobertura cae por debajo del umbral.

7. **Todo requisito tiene un SRS ID.** Los comentarios de código que implementan un requisito deben citar el SRS ID correspondiente (formato `RF-xx` o `RNF-xx`).

8. **Las decisiones de diseño ante ambigüedades del reglamento se documentan.** Cualquier supuesto no confirmado por las reglas oficiales se registra en la sección "Decisiones" del design doc y en `docs/decisiones.md`.

## Reglas del juego (decididas)

Fuentes: manual `SNACs Rulebook-Esp-V03`, `Dice-guide-V03.png` y `Sherbert Forest monster list.xlsx`. Implementadas en `packages/engine/src/combat.ts`; los datos viven en `config/`.

### Símbolos
| Código | Ícono | Color de dado especial / trofeo |
|--------|-------|---------------------------------|
| `Horn` | Axe (hacha) | naranja |
| `Wing` | Arrow (flecha) | azul |
| `Claw` | Finder (lupa) | verde |
| `Tail` | Hook (gancho) | morado |

Un slot `all` acepta cualquier símbolo. Un slot `damage` (corazón roto) solo se cubre recibiendo daño (D-07).

### Dados (`config/dice.json`)
- **Rojo (estándar):** Claw, Horn, Wing, Tail + 2 `heart`.
- **Especial (naranja/azul/morado/verde):** 4 × su símbolo + 2 `wild`.
- **Blanco (daño):** 3 `damage`, 2 `blank`, 1 `wild`.
- El `wild` imita cualquier símbolo, **nunca** el corazón ni un slot de daño.

### Monstruos (`config/monsters.json`)
9 SNACs de Sherbert Forest + jefe Pieous (pendiente). Cada uno: tipo, 4 slots y 2 opciones de trofeo. Los monstruos normales **no tienen HP**.

### Outcomes de combate
| Resultado | Condición | Consecuencia |
|-----------|-----------|--------------|
| **Derrotar** | Los 4 slots cubiertos | +1 punto y un trofeo a elegir |
| **Estudiar** | 2 o 3 slots cubiertos (cualesquiera) | Trofeo a elegir; el monstruo escapa |
| **Huir** | 1 slot cubierto | Sin premio |
| **KO** | HPie llega a 0 | -1 punto; si en esa tirada se completaron los 4 slots se conserva la derrota |

### Mecánica de dados
- Cada relanzamiento añade un **dado blanco** (de daño) a la reserva.
- Cada cara `damage` cuesta 1 HPie, salvo que un `heart` disponible lo bloquee (escudo, D-08).
- El HPie máximo es **6** (`config/game.json`).

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
- ~~Pendiente validación~~ **Confirmado** con `Dice-guide-V03.png` del cliente (2026-10-13): `heart` (dado rojo), `wild` (especiales y blanco) y `damage` (blanco) son caras distintas. Ver D-06.

---

## D-04 — `loadMonsters` como función pura que acepta `unknown`

**Spec de origen:** `snac-hunters-monorepo`
**Requisito:** RF-09, RNF-01

**Contexto:** RF-09 requiere que el loader acepte contenido JSON crudo como `unknown`. El loader podría recibir el resultado de `JSON.parse()` (que devuelve `any`/`unknown`).

**Decisión:** La firma es `loadMonsters(raw: unknown): Monster[]`. No hace I/O (no llama a `fs.readFileSync`). El caller (API Lambda o test) es responsable de parsear el JSON. Esto mantiene el engine sin I/O (RNF-01).

**Consecuencias:** El engine es completamente portable. El test puede pasar objetos literales directamente sin tocar el filesystem.

---

## D-05 — HP máximo del jugador = 6 *(reemplazada: ahora 4, ver D-17)*

**Spec de origen:** `snac-hunters-monorepo`
**Requisito:** RF-07.6

**Contexto:** Las reglas del juego especifican HP máximo de 6 para el jugador.

**Decisión:** Se documenta como constante en los tipos (`playerHp: number`). La restricción `0–6` se implementará en la lógica de transición (spec posterior). En `CombatState` es solo un número sin restricción de Zod por ahora.

---

*Última actualización: spec `snac-hunters-monorepo` — Área 1.*
## D-06 — Modelo de datos alineado con los materiales del cliente

**Requisito:** RF-07, RF-08 · **Fecha:** 2026-10-13

**Contexto:** `config/monsters.json` tenía monstruos de ejemplo inventados y un campo `hp` que los materiales no definen.

**Decisión:** Se reemplazan por los 9 monstruos de `Sherbert Forest monster list.xlsx`. `Monster` ahora tiene `type`, `slots` (incluye `damage`), `trophies` y `pun`; se elimina `hp`. Los colores de trofeo del Excel se traducen con el Dice-guide (naranja=Horn, azul=Wing, verde=Claw, morado=Tail). El jefe Pieous (6 símbolos, "Random") queda fuera de esta iteración.

---

## D-07 — Cómo se cubre un slot de daño (corazón roto)

**Contexto:** El manual dice "Si lanzas un (corazón roto), puedes elegir entre gastar un HPie o el dado". El brief dice "algunos monstruos requieren que el jugador reciba daño".

**Decisión:** Una cara `damage` del dado blanco cubre automáticamente el primer slot `damage` libre. El daño **se sigue pagando**, con un corazón (escudo) o con 1 HPie. Un `wild` nunca cubre un slot de daño. El slot de daño no se puede desasignar.

**Pendiente de validar con el cliente.**

---

## D-08 — Los corazones bloquean el daño automáticamente

**Contexto:** "Puedes gastar un dado corazón para anular daño". Los corazones no sirven para nada más (el comodín no imita corazones).

**Decisión:** Al resolver cada cara de daño, si hay un `heart` en la reserva se gasta como escudo; si no, se pierde 1 HPie. Los corazones lanzados en la **misma tirada** también cuentan (daño y escudo simultáneos). Se procesan en orden de id de dado, lo que es determinista.

**Alternativa descartada:** pedir al jugador que elija. Agrega un paso de UI sin decisión real y complica el tutorial.

---

## D-09 — Umbrales de resolución

**Decisión:** 4 slots = derrotar, 2–3 = estudiar ("dos símbolos cualesquiera", manual p. 9), 1 = huir. No se puede resolver con 0 slots: el jugador debe relanzar o arriesgarse al KO.

---

## D-10 — KO y derrota en la misma tirada

**Contexto:** El manual dice "Si un monstruo puede ser derrotado al mismo tiempo que quedas KO, aún ganas todos los beneficios".

**Decisión:** Si el HPie llega a 0 con los 4 slots cubiertos, el resultado es `defeat` con `ko: true`. Se otorga el primer trofeo de la lista (no hay oportunidad de elegir) y se aplican tanto el punto de derrota como la penalización de KO.

---

## D-11 — Validación en servidor por re-simulación *(ampliada en D-24: ahora se re-simula la partida completa)*

**Requisito:** Regla de oro 2, requisito de plataforma 6

**Decisión:** El cliente envía solo `{ monsterId, seed, actions }`. La Lambda ejecuta `replayCombat` con el **mismo engine** y con el setup de `config/game.json` (los dados y el HPie los decide el servidor, no el cliente). El resultado, los puntos y el trofeo los calcula el servidor; cualquier acción ilegal devuelve 422.

**Riesgo conocido:** en esta demo la seed la genera el cliente, así que un tramposo podría buscar seeds favorables. **Siguiente paso:** `POST /runs/start` emite una seed firmada por el servidor.

---

## D-12 — Runtime de Lambda: Node.js 22

**Contexto:** `cdk synth` advierte que `nodejs20.x` quedó deprecado el 2026-04-30 (no se podrán crear funciones a partir del 2027-02-01).

**Decisión:** La Lambda usa `NODEJS_22_X`. El desarrollo local y el CI siguen en Node 20 por `.nvmrc`; se recomienda subir `.nvmrc` a 22.

---

## D-13 — El dado blanco puede relanzarse

**Contexto:** El manual dice "Las caras en blanco permanecen en la reserva" y la FAQ, "técnicamente podrías usar el mismo dado".

**Decisión:** Un dado blanco que muestra `blank` o `wild` y sigue en la reserva puede relanzarse (y el relanzamiento añade otro dado blanco). Uno que ya hizo daño se retira.

---

## D-14 — Expedición (run) y dados gastados toda la expedición

**Requisito:** RF-12 · **Fecha:** 2026-10-20 · **Fuente:** feedback del cliente "Comentarios y alcance" (oct 2026), sección 1 y 2

**Contexto:** Antes, cada combate empezaba con todos los dados y el HPie inicial. El cliente define una *expedición*: salir del pueblo → combates encadenados → volver al pueblo. "Los dados usados para derrotar o estudiar a un monstruo quedan gastados el resto de la expedición, no solo el turno."

**Decisión:** `run.ts` guarda entre combates el HPie y la reserva (`pool`). Cada combate usa `runCombatSetup(run)` y `endCombat` calcula lo que queda con `remainingPool`: se gastan los dados asignados al monstruo, los corazones que bloquearon daño y los blancos que hirieron. Volver al pueblo = `startRun(setup)` de nuevo (HPie completo, todos los dados, sin blancos). Si la reserva queda vacía, la expedición sigue activa pero `canHunt` es `false`: hay que volver al pueblo.

**Validación en servidor:** `replayRun` re-simula la expedición entera combate por combate, así que un cliente no puede reutilizar un dado gastado en un combate anterior. La API y la web siguen enviando combates sueltos hasta que se integre (pendiente).

---

## D-15 — Dados blancos durante la expedición

**Fuente:** feedback del cliente, sección 2; manual p. 10 y FAQ

**Decisión:** Un blanco que sale en blanco se queda en la reserva y se lanza en los combates siguientes, así que el riesgo se acumula. Uno que no sale en blanco "se activa": si es daño, hiere y se gasta en ese momento (como antes); si es comodín, puede usarse en el monstruo y, se use o no, sale de la reserva al terminar el combate. D-13 sigue vigente dentro de un combate: los blancos en blanco o comodín pueden relanzarse.

---

## D-16 — Huir y quedar KO terminan la expedición

**Fuente:** manual p. 11 ("Huye… Regresa al pueblo"; "¡KO!… Regresa al pueblo"); feedback del cliente, sección 2

**Decisión:** `endCombat` termina la expedición con `endedBy: 'flee'` o `'ko'`. Derrotar o estudiar permite seguir cazando o volver por decisión propia (`returnToTown`, `endedBy: 'town'`). KO y derrota en la misma tirada (D-10) da el monstruo, pero la expedición termina igual. La penalización de KO (-1 punto) ya estaba en `config/game.json` (`scoring.ko`).

**Pendiente de validar con el cliente:** el feedback solo menciona "por decisión propia o por KO"; que huir termine la expedición viene del manual.

---

## D-17 — HPie del personaje = 4

**Fuente:** feedback del cliente, sección 3 ("Los personajes tienen 4 PV")

**Decisión:** `config/game.json` pasa `maxHp` y `startingHp` de 6 a 4. No hay cambios de código: la UI dibuja los corazones a partir de `maxHp`.

---

## D-18 — Trofeos como dados y como dinero

**Requisito:** RF-13 · **Fuente:** feedback V0, sección 2; manual p. 10

**Decisión:** Un trofeo se coloca directamente en un espacio del monstruo con el símbolo que lleva (`{ type: 'trophy', index, slot }`). Si se retira, vuelve al inventario; solo se gasta si sigue colocado al resolver. En el pueblo, los trofeos son la moneda para comprar habilidades (D-21). La capacidad base es de 2 espacios (manual p. 7).

---

## D-19 — Relanzar sin dados: solo el dado blanco

**Decisión:** Si no queda ningún dado físico en la reserva (todos asignados o gastados) y aún no hay espacios cubiertos, el jugador puede relanzar "nada", lo que agrega un dado blanco. Así el combate nunca queda trabado: el blanco puede salir comodín, en blanco (y relanzarse) o hacer daño hasta el KO.

---

## D-20 — Las 20 habilidades de V0

**Requisito:** RF-14 · **Fuente:** feedback V0, sección 5; cartas en `Image files/abilities`; manual p. 13, 21–22

**Decisión:** Los efectos se leen de los íconos de las cartas y viven en `config/abilities.json`:

| Grupo | Cartas | Efecto |
|---|---|---|
| Objetos ×3 = derrotar | Boom Blade, X-Ray Laser, Guillotine Trap, Meaty Crossbow | 3 símbolos iguales derrotan al monstruo ignorando sus espacios (incluido el de daño); el trofeo puede ser cualquiera |
| Objetos 1 → 2 | Extra Ammo, Double-head Axe, Smell-o-Snorkle, Hunter's Net | 1 símbolo se convierte en 2 |
| Objetos 1 → comodín | Auto-Aimer, Lasso Trap, Sentient Sword, Telemonocle | 1 símbolo se convierte en comodín |
| Destrezas de dado especial | Trap Hatching, Axe Sharpening, Detective Work, Pierfect Shot | Pasiva: +1 dado especial de ese color |
| Destrezas 2 → 3 | Scent and Sound, Ambidexterity, Bait and Snare, Double Damage | 2 símbolos iguales se convierten en 3 comodines |

- Los objetos tienen un uso y se recargan al descansar; las destrezas se usan una vez por monstruo.
- El comodín cuenta como cualquier símbolo para activar habilidades.
- Los símbolos consumidos quedan gastados toda la expedición; los creados no se relanzan y desaparecen al terminar el combate.
- El frasco con "+" de las cartas 1 → 2 y 1 → comodín se interpreta como +1 espacio para trofeos (manual p. 22).

**Pendiente de validar con el cliente:** el significado del frasco. Las bonificaciones por tener una 3.ª destreza u objeto (manual p. 16) no están en V0.

---

## D-21 — Pueblo de V0

**Requisito:** RF-15 · **Fuente:** feedback V0, secciones 1 y 4; manual p. 14–15

**Decisión:**
- **Al volver al pueblo** se recuperan automáticamente el HPie y los dados, y se retiran los blancos (feedback, sección 1).
- Cada visita da **2 acciones** (manual p. 14):
  - **Descansar**: recarga todos los objetos y da un trofeo al azar.
  - **Misión de aldeano**: paga 1 trofeo y elige 1 de 3 objetos.
  - **Misión del Huntmaster**: paga 2 trofeos y elige 1 de 3 destrezas.
- Se pueden tener máximo 3 objetos y 3 destrezas; con 3, la carta nueva reemplaza a una. Se puede rechazar la oferta, pero el pago no se devuelve.
- Todos los números están en `config/game.json` (`town`).

**Pendiente de validar con el cliente:** el feedback dice "descansar (recuperar PV y dados)", mientras que la sección 1 dice que eso ocurre al volver al pueblo. Se implementó la sección 1, y descansar quedó como en el manual.

---

## D-22 — Inicio de partida

**Fuente:** manual p. 7

**Decisión:** La partida empieza en el pueblo con 4 HPie, 4 dados rojos y 1 verde, 1 trofeo al azar, 1 objeto al azar y 2 espacios para trofeos. Un trofeo al azar equivale a tirar el dado de trofeo: cada símbolo con probabilidad 1/4.

---

## D-23 — Puntaje de V0 y fin de partida

**Fuente:** feedback V0, sección 6

**Decisión:** `puntaje final = puntos − KOs × 3 − expediciones`, con los pesos en `config/game.json` (`scoring.koWeight`, `scoring.runWeight`).
- Los puntos incluyen +1 por monstruo derrotado y −1 por KO (sección 2), así que un KO cuesta 4 en total. Se aplicó la fórmula tal cual; el cliente invita a proponer otra.
- Una expedición cuenta al salir del pueblo.
- V0 no tiene condición de derrota (llega en V01): el jugador termina la partida desde el pueblo y ve la pantalla de puntaje.

---

## D-24 — Validación en servidor de la partida completa

**Decisión:** `POST /runs` (un combate) se reemplaza por `POST /games` con `{ seed, actions }`. El servidor ejecuta `replayGame` con el mismo engine y la configuración del servidor.
- Toda la aleatoriedad (trofeos, ofertas del pueblo, rastros y combates) sale de la seed, así que no se puede reutilizar un dado gastado, usar un trofeo o una carta que no se tiene, ni inventar el puntaje.
- La partida se guarda con clave `GAME#<usuario>` / `<seed>` y cada envío la reemplaza.
- El cliente envía la partida al volver al pueblo y al terminar.

El riesgo de D-11 (seeds elegidas por el cliente) sigue igual.

---

## D-25 — Idioma y nombres

**Fuente:** feedback V0, sección 3; manual p. 5

**Decisión:** Hay un selector español / inglés al inicio y todos los textos de la interfaz están en `apps/web/src/game/i18n.ts`; el tutorial trae ambos idiomas en `config/tutorial.json`. Se distinguen los **tipos de monstruo** (Cuerno, Ala, Garra, Cola / Horn, Wing, Claw, Tail), que también nombran los trofeos, de los **símbolos de dado** (Hacha, Flecha, Lupa, Anzuelo / Axe, Arrow, Finder, Hook), igual que el manual. Los mensajes de error del engine están en español; en inglés se muestra uno genérico.

---

## D-26 — Interfaz del feedback V0

**Decisión:**
- **Relanzar:** se seleccionan los dados que se conservan y se relanza el resto.
- **Contador:** muestra solo los dados disponibles.
- **Dado blanco:** entra y se gasta con una animación más lenta.
- **Espacio "all":** usa `any 4.png`.
- **Monstruos ocultos:** en el sendero solo se ve el tipo; el monstruo se revela al seguir el rastro.

---

## D-27 — La primera partida es una partida guiada

**Fuente:** feedback V0 ("una copia del juego de mesa; sirve como prueba de concepto y como tutorial")

**Contexto:** El tutorial de la demo era un solo combate con guion fijo. V0 tiene que enseñar el juego de mesa completo, pero la partida es aleatoria, así que un guion fijo no sirve.

**Decisión:** El Huntmaster da 23 lecciones contextuales (`config/guide.json`, ES/EN). Cada una se muestra una sola vez, cuando la partida está en su fase y se cumplen sus condiciones; por ejemplo, el dado blanco se explica cuando aparece el primero.
- **Lecciones "Entendido":** oscurecen la pantalla e iluminan la parte que explican.
- **Lecciones "hazlo tú":** salir del pueblo, seguir un rastro, colocar un dado, relanzar. Dejan jugar y se cumplen al hacer la acción.
- **Recorrido:** pueblo y fases del juego → dados y PV → trofeos → cartas → acciones del pueblo → sendero y tipos → monstruo y espacios → tirada → colocar → trofeo como dado → cartas → relanzar → dado blanco → resolver → dados gastados → regreso al pueblo → puntaje.
- **Cuándo se activa:** la primera partida siempre es guiada, y "Aprender a jugar" empieza otra guiada. La guía se puede saltar.
- **Tutorial anterior:** sigue disponible como "Práctica de combate".
- **Analítica:** `tutorial_start` y `tutorial_complete` (con `mode: 'guided'`) siguen midiendo el onboarding.

---

## D-28 — Mapa estilo FTL de Sherbet Forest (V1)

**Requisito:** RF-15 · **Fuente:** feedback, sección 7

**Decisión:** Al salir del pueblo se genera un mapa nuevo (`GameState.map`): **3 columnas de 2–3 nodos** más el nodo del jefe, todo en `config/game.json` (`map`).
- Cada nodo tiene un tipo de monstruo al azar y un monstruo oculto de ese tipo.
- Cada nodo se conecta con los más cercanos de la siguiente columna, sin cruces, y todos los de la última llevan al jefe.
- Desde el pueblo se puede ir a cualquier nodo de la primera columna; después, solo por los caminos del nodo actual (`reachableNodes`).
- Se puede volver al pueblo entre combates, y cada expedición empieza de nuevo desde el pueblo con un mapa distinto.
- La acción `follow` ahora lleva el id del nodo (`{ type: 'follow', node }`) en lugar del índice del rastro.

**Balance (simulación de 2,000 partidas por caso):** como los dados gastados no vuelven durante la expedición, el largo del mapa decide si el jefe es alcanzable. Con una estrategia razonable (estudiar para ahorrar dados, usar trofeos y relanzar):

| Columnas | Inicial (5 dados, 1 trofeo) | Media (7 dados, 3 trofeos) | Fuerte (8 dados, 5 trofeos) |
|---|---|---|---|
| 4 | llega 17 % · gana 0.1 % | 39 % · 1 % | 54 % · 8 % |
| **3** | **46 % · 0.3 %** | **100 % · 6 %** | **100 % · 48 %** |
| 2 | 98 % · 3 % | 100 % · 30 % | 100 % · 79 % |

Se eligieron **3 columnas**: al principio casi nunca se gana, y al fortalecer al cazador (dados especiales, espacios de trofeo) vencer al jefe se vuelve realista. Con 4, ni un cazador fuerte gana más del 8 %.

**Pendiente de validar con el cliente:** el tamaño del mapa.

---

## D-29 — Jefe: Pieous Assassin

**Requisito:** RF-16 · **Fuente:** lista de monstruos ("Any type, Random symbols") y brief original ("6 símbolos de vida")

**Decisión:** El jefe se sortea al empezar la partida: 6 espacios con símbolos al azar (`config/game.json`, `boss`).
- Solo se puede **derrotar** (cubrir los 6) o **huir** (1 o más): no se puede estudiar y no da trofeo.
- Derrotarlo gana la partida (`result: 'victory'`), suma `scoring.victoryBonus` (5) y esa expedición no cuenta para la cuenta regresiva de Pieland.

**Pendiente de validar con el cliente:** los símbolos del jefe, si debería poder estudiarse y el bonus.

---

## D-30 — "Tres iguales" no sirve contra el jefe

**Decisión:** Las cartas ×3 (Boom Blade, X-Ray Laser, Guillotine Trap, Meaty Crossbow) derrotan a cualquier monstruo, salvo al jefe; si no, bastarían 3 dados para ganar la partida.

**Pendiente de validar con el cliente.**

---

## D-31 — Vidas, Pieland amenazada y game over

**Fuente:** feedback, secciones 8 y 9

**Decisión:**
- **Vidas:** 3. Cada KO cuesta una vida (y el punto de siempre).
- **Pieland:** 5 PV con la cuenta regresiva 6 → 5 → 4 → 3 → 2. Cada expedición que termina sin derrotar al jefe descuenta una al volver al pueblo. Al agotarse, Pieland pierde 1 PV y empieza la siguiente. Si se agotan todas, se repite la última (2).
- **Fin de partida:** sin vidas o con Pieland en 0 se va a la pantalla de puntaje (`result: 'lives' | 'pieland'`). Si nunca se derrota al jefe, la partida termina en la expedición 20, como dice el feedback.
- **Abandonar:** "Terminar partida" sigue disponible desde el pueblo (`result: 'abandon'`).

---

## D-32 — Misión secreta

**Requisito:** RF-17 · **Fuente:** feedback, sección 4; cartas en `Image files/secret quest cards`

**Decisión:** Al empezar se reparte una de las 8 cartas (`config/quests.json`). Cada una tiene un tipo de monstruo y dos símbolos. Al final da +1 punto por:
- cada monstruo derrotado de ese tipo;
- cada trofeo con esos símbolos **pagado en las misiones del pueblo** (en el juego de mesa, las misiones tienen símbolos; aquí son las compras con trofeos);
- cada trofeo con esos símbolos que se conserve al final.

**Pendiente de validar con el cliente:** que los trofeos pagados cuenten como "misiones".

---

## D-33 — Las 10 habilidades restantes

**Fuente:** cartas en `Image files/abilities`; manual p. 21–22

| Carta | Efecto implementado |
|---|---|
| Lucky Catch / Find / Hit / Shot (destrezas) | Un comodín lanzado en el dado especial de su color (morado, verde, naranja, azul) se convierte en 2 comodines |
| Cursed Gauntlet (objeto) | Gastar 1 HPie da 1 comodín; con 1 HPie deja KO |
| Cloning Tool (objeto, +1 espacio de trofeo) | Fuera de combate, recarga otro objeto gastado sin gastar acción |
| Double Healing (destreza) | Cada corazón bloquea 2 daños antes de gastarse |
| Piebix Cube (objeto) | +1 punto al final por cada dado especial distinto (máx. 4) |
| Varied Samples (destreza) | +1 punto al final por cada tipo de trofeo distinto (máx. 4) |
| Well Traveled (destreza) | +1 punto al final por cada tipo de monstruo derrotado distinto (máx. 4; en el juego de mesa cuenta ubicaciones, y V1 tiene solo una) |

**Pendiente de validar con el cliente:** Double Healing (el ícono también puede leerse como "curar el doble"), Cursed Gauntlet (el ∞ podría significar usos ilimitados) y Well Traveled.

---

## D-34 — Puntaje final de V1

**Decisión:** `puntos − KOs × 3 − expediciones + misión secreta + cartas de puntos + bonus del jefe`. La pantalla final muestra el desglose (`scoreBreakdown`). El servidor guarda también el resultado de la partida (`result`).

---

*Última actualización: 2026-10-21 — V1 (roguelite sencillo): mapa FTL, jefe, vidas, Pieland, misión secreta, 30 habilidades.*

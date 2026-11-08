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

**Decisión (revisada el 2026-10-25 con la revisión del equipo de V0):** El espacio de corazón roto del monstruo y el daño del dado blanco son cosas distintas.
- El daño del dado blanco es **directo**: quita 1 HPie (o lo bloquea un corazón de la reserva, D-08) y nunca cubre el espacio del monstruo.
- El espacio de corazón roto **cuenta como cubierto al resolver**, pero cuesta 1 HPie, en cualquier resultado (derrotar, estudiar o huir). Por eso un monstruo con 3 símbolos y un corazón roto se puede **derrotar** con esos 3 símbolos, pagando el daño (manual p. 11: "el ♥ se incluye en la cantidad de símbolos coincidentes").
- Un **corazón de dado rojo** se puede colocar en ese espacio y anula el daño. El comodín no lo cubre. El corazón se puede retirar antes de resolver.
- Hace falta al menos un dado o trofeo colocado para resolver: el espacio de daño solo no basta para huir.
- Si el daño del SNAC deja KO al resolver, derrotar conserva los beneficios (D-10); estudiar o huir terminan en KO sin trofeo.

**Antes:** el daño del dado blanco cubría el espacio automáticamente y no se podía derrotar sin él.

---

## D-08 — El daño del dado blanco queda pendiente y el jugador elige si lo cubre

**Contexto:** "Puedes gastar un dado corazón para anular daño". Los corazones no sirven para nada más (el comodín no imita corazones).

**Decisión (revisión del equipo, 2026-10-25):** El daño del dado blanco **no se recibe al lanzar**: queda pendiente hasta que el jugador decide **relanzar** o **resolver** (derrotar, estudiar o huir). Hasta entonces puede:
- Cubrirlo con un corazón de un dado rojo (`{ type: 'block', dieId, damageId }`; se quita con `unblock`). Al relanzar o resolver, ese corazón se gasta y no se pierde HPie.
- O dejarlo sin cubrir y usar el corazón de otra forma: relanzarlo para buscar otro símbolo o ponerlo en el corazón roto del SNAC (D-07). Entonces el daño cuesta 1 HPie.

El dado de daño se gasta al recibirse y nunca se relanza. Si el daño recibido al relanzar deja KO, el combate termina antes de lanzar (si el monstruo ya quedaba derrotado se conservan los beneficios, D-10).

**Antes:** el primer corazón disponible bloqueaba el daño automáticamente al lanzar, sin dejar elegir.

---

## D-09 — Umbrales de resolución

**Decisión:** 4 slots = derrotar, 2–3 = estudiar ("dos símbolos cualesquiera", manual p. 9), 1 = huir. Los espacios de corazón roto libres cuentan como cubiertos (D-07). No se puede resolver sin ningún dado o trofeo colocado: el jugador debe relanzar o arriesgarse al KO.

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

## D-15 — Dados blancos durante la expedición *(reemplazada por D-35)*

**Fuente:** feedback del cliente, sección 2; manual p. 10 y FAQ

**Decisión (revisada el 2026-10-25 con la revisión del equipo):** Los dados blancos **no pasan al siguiente monstruo**: al terminar cada combate se retiran todos, también los que salieron en blanco. Dentro de un combate sí se acumulan: un blanco en blanco se queda en la reserva y puede relanzarse (D-13), y cada relanzamiento agrega otro. El daño se paga como dice D-08 y un comodín blanco puede usarse en el monstruo.

**Antes:** los blancos en blanco se quedaban en la reserva para los combates siguientes de la expedición.

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

**Decisión:** Un trofeo se coloca directamente en un espacio del monstruo con el símbolo que lleva (`{ type: 'trophy', index, slot }`). Si se retira, vuelve al inventario; solo se gasta si sigue colocado al resolver. También sirve como símbolo para **activar una habilidad** (`{ type: 'ability', dieIds, trophies }`), sola o combinada con dados; ahí se gasta, salvo que se deshaga la habilidad (D-20). En el pueblo, los trofeos son la moneda para comprar habilidades (D-21). La capacidad base es de 2 espacios (manual p. 7).

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
- Los trofeos del inventario también activan habilidades (D-18).
- Hasta resolver nada es definitivo (manual p. 11): una habilidad usada se puede **deshacer** (`{ type: 'undo', abilityId }`). Sus símbolos creados desaparecen (y se retiran del monstruo si estaban colocados) y vuelven los dados y trofeos que consumió. No se deshace si sus símbolos activaron otra habilidad (primero hay que deshacer esa), ni "tres iguales", que derrota al instante.
- Los símbolos consumidos quedan gastados toda la expedición; los creados no se relanzan y desaparecen al terminar el combate.
- El frasco con "+" de las cartas 1 → 2 y 1 → comodín se interpreta como +1 espacio para trofeos (manual p. 22).

**Pendiente de validar con el cliente:** el significado del frasco. Las bonificaciones por tener una 3.ª destreza u objeto (manual p. 16) no están en V0.

---

## D-21 — Pueblo de V0

**Requisito:** RF-15 · **Fuente:** feedback V0, secciones 1 y 4; manual p. 14–15

**Decisión:**
- **Al volver al pueblo** se recuperan los dados y se retiran los blancos (feedback, sección 1). El HPie **no** se recupera solo: hay que descansar, y como solo hay 2 acciones por visita, curarse compite con comprar cartas (revisión del equipo, 2026-10-25). La excepción es el KO, que recupera todo el HPie (manual p. 11).
- Cada visita da **2 acciones** (manual p. 14):
  - **Descansar**: sana todo el HPie, recarga todos los objetos y da un trofeo al azar (manual p. 14).
  - **Misión de aldeano**: paga 1 trofeo y elige 1 de 3 objetos.
  - **Misión del Huntmaster**: paga 2 trofeos y elige 1 de 3 destrezas.
- Se pueden tener máximo 3 objetos y 3 destrezas; con 3, la carta nueva reemplaza a una. Se puede rechazar la oferta, pero el pago no se devuelve.
- Todos los números están en `config/game.json` (`town`).

**Resuelto (2026-10-25):** el feedback decía "descansar (recuperar PV y dados)" y la sección 1 hablaba de recuperarlos al volver. Quedó así: los dados se recuperan al volver y el HPie solo al descansar, como en el manual.

---

## D-22 — Inicio de partida

**Fuente:** manual p. 7

**Decisión:** El personaje empieza con 4 HPie, 4 dados rojos, 1 trofeo al azar, 1 objeto al azar y 2 espacios para trofeos. Lo primero es **elegir el color del cazador** (fase `setup`, acción `{ type: 'start', die }`): como en el juego de mesa, cada color trae su dado especial, naranja (hachas), azul (flechas), morado (anzuelos) o verde (lupas), y no siempre es el verde (revisión del equipo, 2026-10-25). Después la partida **arranca con la expedición** (la caza de monstruos), como la ronda del juego de mesa, que empieza por la fase de exploración (manual p. 8): `newGame` ya deja al cazador en el sendero, con la primera expedición en curso. El pueblo llega al volver (revisión del equipo, 2026-10-25). Un trofeo al azar equivale a tirar el dado de trofeo: cada símbolo con probabilidad 1/4.

---

## D-23 — Puntaje de V0 y fin de partida *(valores reemplazados por D-37)*

**Fuente:** feedback V0, sección 6

**Decisión:** `puntaje final = puntos − KOs × 3 − expediciones`, con los pesos en `config/game.json` (`scoring.koWeight`, `scoring.runWeight`).
- Los puntos incluyen +1 por monstruo derrotado y −1 por KO (sección 2), así que un KO cuesta 4 en total. Se aplicó la fórmula tal cual; el cliente invita a proponer otra.
- Solo restan las expediciones **terminadas**: la que está en curso no cuenta, así que la partida empieza con puntaje 0 y no −1 (revisión del equipo, 2026-10-25). El contador "Exped." de la barra sí incluye la expedición en curso.
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
- **Lecciones "hazlo tú":** elegir color, seguir un rastro, colocar un dado, relanzar. Dejan jugar y se cumplen al hacer la acción.
- **Recorrido:** la partida empieza eligiendo color y cazando, igual que el juego de mesa: fases del juego → elegir color (hazlo tú) → dados y PV → sendero y tipos → monstruo y espacios → tirada → colocar → trofeos → cartas → relanzar → dado blanco → resolver → dados gastados → llegada al pueblo → acciones del pueblo → puntaje → salir de nuevo.
- **Cuándo se activa:** la primera partida siempre es guiada, y "Aprender a jugar" empieza otra guiada. La guía se puede saltar.
- **Tutorial anterior:** sigue disponible como "Práctica de combate".
- **Analítica:** `tutorial_start` y `tutorial_complete` (con `mode: 'guided'`) siguen midiendo el onboarding.

---

## D-35 — Feedback del cliente del 2026-10-27: reglas de combate

**Fuente:** retroalimentación de Alex (Pieland), 27.10.2026, sección Combate

**Decisión:**
- **Dados blancos (reemplaza D-15):** se quedan en la reserva hasta volver al pueblo y pasan de un monstruo a otro. Un blanco se resuelve de dos formas: usándolo como comodín en el monstruo (queda asignado y gastado) o recibiendo su daño al relanzar o resolver (1 de daño por símbolo, salvo que un corazón lo bloquee). Los que salen en blanco o comodín sin usar siguen en la reserva y se vuelven a lanzar al empezar el siguiente combate.
- **Curarse con corazones:** un corazón de la reserva puede gastarse para recuperar 1 HPie (acción `heal`), sin pasar del máximo.
- **Deshacer habilidades:** solo hasta el siguiente relanzamiento (`canUndo`); después sería una trampa.
- **Comodines temporales:** los símbolos que crea una habilidad pueden activar otra habilidad. El engine ya lo permitía (se agregó un test con el caso del cliente); la UI los pinta dorados con un texto que avisa que desaparecen al terminar la pelea.
- **Cazar sin dados:** se puede seguir cazando aunque no queden dados; el combate empieza sin dados y cada relanzamiento solo agrega un dado blanco. La UI lo advierte.
- **Daño = 1 HPie:** ya era así en `dev` desde "Correcciones V0" (el sitio de prueba de Firebase todavía tenía la versión anterior).

---

## D-36 — Feedback del cliente del 2026-10-27: pueblo

**Decisión:**
- Al comprar cartas **hay que quedarse con una** (se quitó "No quiero ninguna"; `pick` ya no acepta `null`).
- Cada opción del pueblo se usa **una vez por visita** y luego se muestra en gris (`townUsed`).
- **No se puede salir** sin gastar las 2 acciones, salvo que ya no quede ninguna opción posible (por ejemplo, sin trofeos para pagar y ya descansó) — `canLeaveTown`.
- **Partida guiada:** el pueblo empieza con 2 opciones (Descansar y Misión de aldeano) y suma una por regreso (`town.guidedStartOptions` en `config/game.json`); la Misión del Huntmaster llega en la segunda visita. La acción `start` lleva `guided` para que el servidor re-simule igual.
- "Terminar partida" pasa a **"Menú principal"**: la partida queda abierta para continuarla. Si desde el menú se empieza otra partida estando en el pueblo, la anterior se termina y su puntuación se guarda; a mitad de una expedición se descarta (se avisa).

---

## D-37 — Feedback del cliente del 2026-10-27: puntaje e interfaz

**Puntaje (reemplaza los valores de D-23):** se multiplicó la escala para ajustar las penalizaciones con más precisión. Derrotar = 10, estudiar = 3, huir = 0, cada expedición terminada −5 y cada KO −3 (ya no hay además −1 en los puntos). Así un KO cuesta menos que una expedición extra, como pidió el cliente. Valores en `config/game.json` → **pendiente de validar con Alex**.

**Interfaz:**
- Menú principal: "Mejores puntuaciones" con los 3 primeros lugares (`topScores`, se guarda aparte del historial).
- Rastros y tarjeta del monstruo: ícono del tipo de monstruo (PNG del cliente) en lugar del trofeo. **Falta el ícono de Garra**: mientras tanto se usa su trofeo.
- Botón **Auto** y selección múltiple: con varios dados elegidos, tocar un espacio los acomoda todos (`autoFillPlan` cubre el máximo de espacios gastando los menos comodines).
- El espacio de daño libre del monstruo se resalta en rojo.
- Si relanzar o resolver dejaría KO, el botón se pone rojo con "¡Quedarás KO!" y hay que tocarlo dos veces.
- Trofeos en combate muestran los espacios vacíos (se empieza con 2).

**Tutorial:** textos del cliente aplicados (1, 3, 6, 8, 11, 14, 15, 17) y lecciones repartidas: trofeos desde el segundo combate, cartas cuando hay símbolos para activar una, curar cuando estás herido y tienes un corazón, símbolos temporales cuando aparecen, Huntmaster y puntaje en la segunda visita al pueblo.

**Fuera de alcance por ahora:** Huntmaster's Journal, arte de personajes para elegir color y fichas de misión (el cliente las enviará).

---


## D-38 — Feedback del cliente del 2026-11-03: comodín blanco

**Decisión:** el comodín de un dado blanco **no se relanza** (`isWhiteWild`, `canReroll`): al relanzar se queda en la bandeja con un candado. Se usa en el monstruo actual o **se pierde** al terminar la pelea (`remainingPool` ya no lo pasa al siguiente combate), igual que los dorados. Los blancos que salen en blanco siguen pasando de un monstruo a otro hasta el pueblo (D-35). Si en la bandeja solo quedan comodines blancos, relanzar tira únicamente el dado blanco nuevo.

---

## D-39 — Misión secreta (sección 2.1)

**Decisión:** 8 cartas en `config/secret-quests.json` (el cliente habla de 12, pero en _Image files/secret quest cards_ solo hay 8; las que falten se agregan como datos). Cada carta = tipo de monstruo + dos símbolos de trofeo. Se entrega al elegir el color: la acción `start` lleva `quest`; el engine ofrece 2 (`secretOffer`, con una semilla derivada para no mover el resto del azar). En la **primera partida** la UI solo muestra la primera; desde la segunda se elige entre las dos.

**Interpretación:** la fila "Quests" de la carta (símbolos entregados en misiones) no aparece en la sección 3 del puntaje, así que no suma.

---

## D-40 — Misiones del pueblo (sección 2.2)

**Decisión:** 32 misiones recreadas de los escaneos en `config/quests.json` (16 de aldeano y 16 del Huntmaster, con nombre ES/EN). Reemplazan a "comprar" (`buy` → `quest`):

- **Aldeano:** se entrega UNO de los trofeos/corazones que muestra → 3 objetos, elegir 1.
- **Huntmaster:** se entrega TODO → 3 destrezas, elegir 1.
- Siempre hay **3** a la vista (`town.questSlots`); la partida empieza con al menos una de cada tipo. Al cumplir una, otra toma su lugar de inmediato. **Cada regreso al pueblo retira la más antigua** (`oldestQuest`), que lleva el aviso del cliente. Si el mazo se acaba, se rearma con las que no están en el tablero.
- Las cumplidas se pueden consultar (`completedQuests`). El tablero, las cumplidas y la misión secreta también se ven desde el botón de misiones del HUD.
- Siguen siendo opciones del pueblo: cada tipo una vez por visita, dentro de las 2 acciones (D-36).

**Interpretación pendiente de Alex:** cada corazón roto se paga con **1 HPie**, y nunca puede dejar KO en el pueblo (hay que tener más HPie que corazones).

---

## D-41 — Cartas nuevas (sección 2.3)

**Decisión:** arte nuevo de las 30 cartas (Itm- = 15 objetos de aldeano, Sk- = 15 destrezas del Huntmaster). Efectos nuevos en el engine:

- **Lucky Catch/Find/Hit/Shot:** un comodín de su color (el de su dado especial o uno creado por una carta de ese color) → 2 comodines.
- **Auto-Aimer, Lasso Trap, Sentient Sword, Telemonocle:** el arte nuevo pinta el comodín de color, así que dan el comodín **de ese color** (`Die.color`), que una Lucky del mismo color puede duplicar.
- **Double Healing:** 1 corazón → 2 corazones (como los objetos 1 → 2).
- **Cursed Gauntlet:** pierde 1 HPie → 1 comodín (no se puede con 1 HPie; deshacerla devuelve el HPie).
- **Cloning Tool:** fuera de combate recarga otro objeto gastado, sin gastar acción.
- **Piebix Cube, Varied Samples, Well Traveled:** +10 por cada color de dado especial / tipo de trofeo / tipo de SNAC derrotado (máx. 4), sumado a los extras del puntaje.

**Interpretaciones pendientes de Alex:** el frasco con "+" de las destrezas de dado especial = +1 espacio para trofeos (como en los objetos); la escarapela de las Lucky no tiene efecto propio; el valor de las cartas de puntos.

---

## D-42 — Arte del pueblo (sección 2.4)

**Decisión:** se usa la versión con **personaje, ilustración y letrero** para las tres opciones que existen en la app (descansar, aldeano y Huntmaster). Forja, alquimista, saqueo y entrenamiento todavía no son opciones del juego.

---

## D-43 — Puntaje (sección 3) y jefe

**Decisión:** se implementó tal cual la especificación (valores en `config/game.json` → `scoring`):

- Por run: `chain` (+1 por SNAC derrotado, incluido el jefe), `runHuntPoints` (+chain × 10) y `runQuestKills`. Estudiar no cambia nada; el KO no resta.
- **Partida sin terminar:** al cerrar cada run (volver al pueblo o dejar de jugar) se guarda `bestRun` = cadena + misión × 10 + trofeos de misión × 10. Un run a medias cuenta como terminado al dejar la partida.
- **Jefe derrotado:** floor((cadena + misión × 10 + trofeos × 10 + HPie × 10) × multiplicador), con 2 / 1.75 / 1.5 / 1.25 según las expediciones. Los tres casos de prueba del cliente están como test.
- **Ranking:** primero quien derrotó al jefe, luego por puntaje.
- Se quitaron las penalizaciones por KO y por expedición de D-37.

**Jefe (necesario para el puntaje final):** Pieous Assassin, 6 espacios con símbolos al azar, solo derrotar o huir, sin trofeo; "tres iguales" no sirve contra él. Su guarida aparece en el sendero **desde la expedición 2** (`boss.fromRun`, toggle `features.boss`). Derrotarlo termina la partida. Basado en la versión de `feat/V1`, sin el mapa.

**Menú principal:** empezar otra partida ahora termina y guarda la actual también a mitad de una expedición (fuera de combate), porque su puntaje es el del mejor run.

---


## D-44 — V1 completa: mapa FTL de Sherbert Forest

**Fuente:** feedback del 2026-10-20, sección 7; retoma D-28 de la rama `feat/V1`.

**Decisión:** el sendero de 2 rastros se reemplaza por un **mapa nuevo en cada expedición** (`GameState.map`): 3 columnas de 2–3 nodos (`config/game.json` → `map`) y la guarida de Pieous Assassin al final.

- Cada nodo tiene un tipo de monstruo al azar y esconde un monstruo de ese tipo; solo se ve el tipo hasta pelear.
- Desde el pueblo se va a cualquier nodo de la primera columna; después, solo por los caminos del nodo actual (`reachableNodes`). La acción `follow` lleva el id del nodo (`{ type: 'follow', node }`) y desaparece la acción `boss`.
- Al final del mapa (sin el toggle del jefe) ya no se puede seguir: hay que volver al pueblo.
- **Reemplaza a D-43:** la guarida del jefe ya no aparece "desde la expedición 2" (`boss.fromRun` se quitó). El largo del mapa es lo que la hace difícil de alcanzar (balance de D-28). Sus espacios siguen siendo aleatorios en cada combate.

---

## D-45 — V1 completa: vidas, Pieland y fin de partida

**Fuente:** feedback del 2026-10-20, secciones 8 y 9; retoma D-31.

**Decisión:**

- **Vidas:** 3 (`lives`). Cada KO cuesta una; no resta puntos (D-43). Sin vidas, la expedición termina y al volver se va a la pantalla de puntaje.
- **Pieland:** 5 PV con la cuenta regresiva 6 → 5 → 4 → 3 → 2 (`pieland`). Cada expedición que termina sin derrotar al jefe descuenta una al volver al pueblo; al agotarse, Pieland pierde 1 PV y empieza la siguiente. Con Pieland en 0 la partida termina: son 20 expediciones como máximo, igual que el límite del feedback.
- **Resultado** (`result`): `victory`, `lives`, `pieland` o `abandon` (dejar la partida desde el menú). El servidor lo guarda y la pantalla final dice por qué terminó.
- El puntaje no cambia: sin derrotar al jefe cuenta el mejor run (D-43).
- HUD: una fila con las vidas, los PV de Pieland y cuántas expediciones faltan para que pierda uno. La guía explica las vidas y Pieland en la primera expedición, el mapa al verlo, y avisa al perder una vida.

**Pendiente de validar con Alex:** el tamaño del mapa (D-28) y si la cuenta regresiva de Pieland debe seguir con el puntaje nuevo.

---

_Última actualización: 2026-11-07 — V1 completa: mapa FTL, vidas y Pieland sobre el feedback del 2026-11-03._

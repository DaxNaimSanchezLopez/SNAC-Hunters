// Selector español / inglés (feedback V0). Todos los textos de la interfaz viven aquí;
// los del tutorial vienen de config/tutorial.json con ambos idiomas.
import { SYMBOL_COLOR } from '@snac-hunters/engine';
import type {
  AbilityEffect,
  DieSource,
  Face,
  GameSymbol,
  Outcome,
  QuestCost,
  Slot,
} from '@snac-hunters/engine';
import { gameConfig } from './config';

export type Lang = 'es' | 'en';

const es = {
  loading: 'Cargando…',
  'lang.title': 'Elige tu idioma',
  'lang.es': 'Español',
  'lang.en': 'English',

  'home.subtitle': 'Sherbert Forest',
  'home.huntmaster': 'El Huntmaster',
  'home.continue': 'Continuar partida',
  'home.new': 'Nueva partida',
  'home.newWarning': 'Empezar otra partida termina la actual y guarda su puntuación.',
  'home.newWarningRun': 'Estás a mitad de un combate: empezar otra partida lo descarta.',
  'home.current': 'Partida actual: {n} pts',
  'home.boss': 'Jefe derrotado',
  'home.tutorial': 'Aprender a jugar',
  'home.tutorialText': 'Partida guiada por el Huntmaster',
  'home.practice': 'Práctica de combate',
  'home.tutorialAgain': 'Repetir partida guiada',
  'home.topScores': 'Mejores puntuaciones',
  'home.emptyScore': 'Sin puntuación',
  'home.snacs': '{n} SNACs',
  'home.reset': 'Borrar todo el progreso',

  'hud.run': 'Exped.',
  'hud.best': 'Mejor',
  'hud.runs': 'Nº exp.',
  'hud.quests': 'Ver misiones',
  'hud.score': 'Puntaje',
  'hud.home': 'Inicio',
  'hud.homeLabel': 'Volver al inicio',

  'setup.title': 'Elige tu cazador',
  'setup.subtitle': 'Tu color decide tu dado especial.',
  'setup.die': 'Dado {color}',
  'setup.faces': '4 caras de {symbol} + 2 comodines',
  'setup.hint': 'Además llevas 4 dados rojos. Después sales directo a cazar.',
  'setup.secretTitle': 'Tu misión secreta',
  'setup.secretChoose': 'Elige tu misión secreta',
  'setup.secretText':
    'Te da un objetivo: ganas puntos extra por derrotar monstruos de su tipo y por guardar trofeos de sus símbolos.',
  'setup.secretStart': '¡A cazar!',
  'setup.back': 'Cambiar color',

  'secret.monsters': 'SNACs de tipo {type}: +{n} c/u en la expedición',
  'secret.trophies': 'Trofeos de {a} y {b} que guardes: +{n} c/u',

  'quests.title': 'Misiones',
  'quests.secret': 'Misión secreta',
  'quests.board': 'Tablero del pueblo',
  'quests.close': 'Cerrar',
  'quest.villager': 'Aldeano',
  'quest.huntmaster': 'Huntmaster',
  'quest.one': 'Entrega UNO:',
  'quest.all': 'Entrega TODO:',
  'quest.heart': '1 HPie',
  'quest.reward.villager': 'Recompensa: elige 1 de 3 objetos',
  'quest.reward.huntmaster': 'Recompensa: elige 1 de 3 destrezas',
  'quest.oldest': 'Cuando regreses al pueblo, esta misión se retirará y aparecerá una nueva aquí.',

  'town.title': 'Pueblo',
  'town.actions': 'Acciones: {n}/{max}',
  'town.trophies': 'Trofeos ({n}/{max})',
  'town.trophiesHint': 'Los trofeos sirven como dados en combate o para cumplir misiones aquí.',
  'town.dice': 'Tus dados',
  'town.items': 'Objetos ({n}/{max})',
  'town.skills': 'Destrezas ({n}/{max})',
  'town.emptyItems': 'Sin objetos',
  'town.emptySkills': 'Sin destrezas',
  'town.rest': 'Descansar',
  'town.restText': 'Sana tu HPie, recarga tus objetos y gana un trofeo al azar.',
  'town.villager': 'Misión de aldeano',
  'town.villagerText': 'Entrega UNO de los trofeos o corazones que pide y elige un objeto.',
  'town.huntmaster': 'Misión del Huntmaster',
  'town.huntmasterText': 'Entrega TODO lo que pide y elige una destreza.',
  'town.quests': 'Tablero de misiones',
  'town.questsHint':
    'Las misiones se quedan hasta que las cumples. Los corazones rotos se pagan con HPie (nunca hasta quedar KO).',
  'town.questPay': 'Entregar {what}',
  'town.questPayAll': 'Entregar todo',
  'town.questLocked': 'Esta opción del pueblo aún no está abierta.',
  'town.questUsed': 'Ya cumpliste una misión de este tipo en esta visita.',
  'town.questNoAction': 'No te quedan acciones en esta visita.',
  'town.questMissing': 'Te falta algo de lo que pide.',
  'town.completed': 'Misiones cumplidas ({n})',
  'town.noCompleted': 'Aún no cumples ninguna.',
  'town.recharge': 'Recargar',
  'town.rechargeHint': 'Toca RECARGAR en un objeto gastado para recargarlo con tu Cloning Tool.',
  'town.leave': 'Salir de expedición',
  'town.leaveText': 'Todos tus dados · HPie {hp}/{max}',
  'town.mainMenu': 'Menú principal',
  'town.used': 'Usada',
  'town.leaveLocked': 'Usa tus acciones antes de salir (te quedan {n})',
  'town.offerTitle': 'Elige una carta',
  'town.offerItem': 'Objeto: un uso, se recarga al descansar.',
  'town.offerSkill': 'Destreza: una vez por monstruo, siempre.',
  'town.replaceTitle': 'Ya tienes {max}: ¿cuál reemplazas?',
  'town.back': 'Atrás',
  'town.spent': 'Gastado',
  'town.welcomeBack':
    'De vuelta en el pueblo: recuperaste tus dados. Descansa para recuperar tu HPie.',

  'trail.title': 'Sendero de Sherbert Forest',
  'trail.subtitle': 'Expedición {run} · Combate {fight}',
  'trail.pick': 'Dos rastros. Solo sabes de qué tipo es cada SNAC.',
  'trail.track': 'Rastro {type}',
  'trail.follow': 'Seguir',
  'trail.noDice': 'Sin dados: solo tirarás dados blancos. Es muy arriesgado.',
  'trail.white': '{n} blancos',
  'trail.return': 'Volver al pueblo',
  'trail.pool': 'Dados disponibles: {n}',
  'trail.boss': 'Guarida de {name}',
  'trail.bossText':
    'Cubre sus {n} espacios para derrotarlo y terminar la partida. No se le estudia: con menos, huyes.',
  'trail.bossGo': 'Enfrentarlo',

  'guide.next': 'Entendido',
  'guide.doIt': 'Hazlo para continuar',
  'guide.skipStep': 'Saltar',
  'guide.skip': 'Saltar la guía',
  'guide.step': '{n}/{total}',

  'combat.tutorial': 'Tutorial',
  'combat.pool': 'Tu reserva',
  'combat.available': 'Dados disponibles: {n}',
  'combat.noDice': 'No te quedan dados: al relanzar solo tiras un dado blanco.',
  'combat.heal': 'Curar +{n}',
  'combat.auto': 'Auto',
  'combat.autoLabel': 'Acomodar automáticamente los dados elegidos',
  'combat.noFit': 'Ninguno de esos dados cabe en los espacios libres',
  'combat.tempWild': 'Temporal: lo creó una habilidad y desaparece al terminar esta pelea.',
  'combat.koWarning': '¡Quedarás KO!',
  'combat.koConfirm': 'Esa decisión te deja KO. Tócalo otra vez para confirmar.',
  'combat.spent': 'Gastados:',
  'combat.trophies': 'Trofeos',
  'combat.trophiesHint':
    'Toca un trofeo y luego un espacio para usarlo como dado, o úsalo para activar una habilidad.',
  'combat.abilities': 'Habilidades',
  'combat.abilityHint':
    'Selecciona los símbolos (dados o trofeos) y toca la carta. Puedes deshacerla hasta relanzar.',
  'combat.used': 'Usada',
  'combat.undo': 'Deshacer',
  'combat.reroll': 'Relanzar el resto',
  'combat.rerollWhite': 'Solo dado blanco',
  'combat.rerollHint': '+1 dado blanco',
  'combat.keepHint': 'Selecciona los dados que quieres conservar y relanza el resto.',
  'combat.resolve': 'Resolver',
  'combat.resolveHint': 'cubre 1+ espacios',
  'combat.spaces': '{n}/{max} espacios',
  'combat.chooseTrophy': 'Elige tu trofeo',
  'combat.defeatText': '¡Derrotaste al SNAC!',
  'combat.bossDown': '¡Derrotaste a {name}!',
  'combat.studyText': 'Estudiaste al SNAC; escapará.',
  'combat.anyTrophy': 'Puedes elegir cualquier trofeo.',
  'combat.trophyUse': 'Los trofeos sirven como dados o como dinero en el pueblo.',
  'combat.tapDieFirst': 'Primero toca UN dado (o un trofeo) y luego el espacio',
  'combat.deselect': 'Deja sin seleccionar los dados que quieras relanzar',
  'combat.needDice': '{name}: selecciona {n} {symbol} (o comodín)',
  'combat.needLucky': '{name}: selecciona un comodín {color}',
  'combat.needHeart': '{name}: selecciona un corazón',
  'combat.whiteWild': 'Comodín blanco: no se relanza. Úsalo en este SNAC o se pierde.',
  'combat.colorWild': 'Comodín {color}: lo creó una carta y cuenta como el de ese dado especial.',
  'combat.invalid': 'Ese movimiento no está permitido',
  'combat.whiteDie': '¡Dado blanco!',
  'combat.blocked': '{n} daño bloqueado por corazón',
  'combat.hit': '-{n} HPie',
  'combat.snacHit': '¡Daño del SNAC! -{n} HPie',
  'combat.pending': 'Daño pendiente',
  'combat.pendingHint':
    'Lo recibes al relanzar o al resolver. Para cubrirlo, toca un corazón de tu reserva y luego el daño.',
  'combat.covered': 'Daño cubierto por un corazón (toca para quitarlo)',
  'combat.uncovered': 'Daño sin cubrir',
  'combat.pickHeart': 'Primero toca UN corazón de tu reserva y luego el daño',
  'combat.understood': 'Entendido',

  'outcome.defeat': 'Derrotar',
  'outcome.study': 'Estudiar',
  'outcome.flee': 'Huir',
  'result.defeat': '¡SNAC derrotado!',
  'result.study': 'SNAC estudiado',
  'result.flee': 'Huiste a salvo',
  'result.ko': '¡KO!',
  'result.koDefeat': 'Quedaste KO en la misma tirada, pero conservas el premio.',
  'result.trophy': 'Trofeo de {symbol}',
  'result.runOver.ko': 'Quedaste KO y la expedición termina, pero conservas tus puntos.',
  'result.chain': '+{pts} puntos · cadena ×{n}',
  'result.chainHint': 'El siguiente SNAC derrotado en esta expedición vale {next}.',
  'result.questKill': '¡Era de tu misión secreta! +{n} al puntaje',
  'result.runScore': 'Puntaje de esta expedición: {n}',
  'result.runOver.flee': 'Huiste: la expedición termina.',
  'result.status': 'HPie: {hp}/{max} · Dados disponibles: {dice}',
  'result.continue': 'Seguir cazando',
  'result.noDice': 'Sin dados: si sigues cazando solo tirarás dados blancos.',
  'result.town': 'Volver al pueblo',
  'result.home': 'Volver al inicio',
  'result.startGame': 'Empezar una partida',
  'result.tutorialDone': '¡Tutorial completado! Ya sabes cazar.',

  'keep.title': '¡No te caben más trofeos!',
  'keep.text': 'Ganaste un trofeo de {symbol}. Toca el que quieres tirar.',
  'keep.discardNew': 'Tirar el nuevo',

  'over.title': 'Fin de la partida',
  'over.victory': '¡Derrotaste a {name}!',
  'over.finalText': 'Puntaje de la expedición en la que cayó el jefe, con HPie y multiplicador.',
  'over.unfinished':
    'Sin derrotar al jefe: cuenta tu mejor expedición (la n.º {run}), sin HPie ni multiplicador.',
  'over.noRun': 'Aún no terminaste ninguna expedición.',
  'over.hunt': 'Puntos de cadena',
  'over.questKills': 'SNACs de misión × {n}',
  'over.questTrophies': 'Trofeos de misión × {n}',
  'over.hp': 'HPie restante × {n}',
  'over.cards': 'Cartas de puntos',
  'over.multiplier': 'Multiplicador ({runs} expediciones)',
  'over.total': 'Puntaje final',
  'over.defeated': 'SNACs derrotados',
  'over.new': 'Nueva partida',

  'server.pending': 'Validando en el servidor (re-simulación)…',
  'server.ok': 'Validado por el servidor',
  'server.rejected': 'El servidor rechazó la partida',
  'server.offline': 'Guardado local: API no disponible',
  'server.disabled': 'Validación en servidor desactivada (feature toggle)',
  'server.score': 'Servidor: {score} pts',

  'face.Horn': 'Hacha',
  'face.Wing': 'Flecha',
  'face.Claw': 'Lupa',
  'face.Tail': 'Anzuelo',
  'face.heart': 'Corazón',
  'face.wild': 'Comodín',
  'face.damage': 'Daño',
  'face.blank': 'En blanco',
  'slot.all': 'Cualquiera de los 4 símbolos',
  'slot.damage': 'Daño: cuenta como cubierto pero cuesta 1 HPie (un corazón lo anula)',
  'slot.label': 'Espacio {n}: {slot}',
  'slot.covered': ' (cubierto)',
  'die.label': 'Dado {kind}: {face}',
  'kind.red': 'rojo',
  'kind.orange': 'naranja',
  'kind.blue': 'azul',
  'kind.purple': 'morado',
  'kind.green': 'verde',
  'kind.white': 'blanco',
  'kind.trophy': 'trofeo',
  'kind.token': 'símbolo temporal',
  'monster.type': 'Tipo {type}',
  'type.Horn': 'Cuerno',
  'type.Wing': 'Ala',
  'type.Claw': 'Garra',
  'type.Tail': 'Cola',

  'ability.triple': '3 {symbol} = derrotar al monstruo (trofeo a elección)',
  'ability.double': '1 {symbol} → 2 {symbol}',
  'ability.wild': '1 {symbol} → 1 comodín {color}',
  'ability.lucky': '1 comodín {color} → 2 comodines',
  'ability.gauntlet': 'Pierde 1 HPie → 1 comodín',
  'ability.recharge': 'Fuera de combate: recarga otro objeto',
  'ability.points.specialDice': '+{n} por cada color de dado especial que tengas (máx. {max})',
  'ability.points.trophyTypes': '+{n} por cada tipo de trofeo que guardes (máx. {max})',
  'ability.points.monsterTypes': '+{n} por cada tipo de SNAC que derrotes (máx. {max})',
  'ability.convert': '2 {symbol} → 3 comodines',
  'ability.special': '+1 dado especial {die}',
  'ability.bonus': '+1 espacio para trofeos',
  'ability.item': 'Objeto',
  'ability.skill': 'Destreza',
};

export type MessageKey = keyof typeof es;

const en: Record<MessageKey, string> = {
  loading: 'Loading…',
  'lang.title': 'Choose your language',
  'lang.es': 'Español',
  'lang.en': 'English',

  'home.subtitle': 'Sherbert Forest',
  'home.huntmaster': 'The Huntmaster',
  'home.continue': 'Continue game',
  'home.new': 'New game',
  'home.newWarning': 'Starting a new game ends the current one and saves its score.',
  'home.newWarningRun': "You're in the middle of a fight: starting a new game discards it.",
  'home.current': 'Current game: {n} pts',
  'home.boss': 'Boss defeated',
  'home.tutorial': 'Learn to play',
  'home.tutorialText': 'A game guided by the Huntmaster',
  'home.practice': 'Combat practice',
  'home.tutorialAgain': 'Replay guided game',
  'home.topScores': 'Top scores',
  'home.emptyScore': 'No score yet',
  'home.snacs': '{n} SNACs',
  'home.reset': 'Erase all progress',

  'hud.run': 'Run',
  'hud.best': 'Best',
  'hud.runs': 'Runs',
  'hud.quests': 'View quests',
  'hud.score': 'Score',
  'hud.home': 'Home',
  'hud.homeLabel': 'Back to home',

  'setup.title': 'Choose your hunter',
  'setup.subtitle': 'Your color decides your special die.',
  'setup.die': '{color} die',
  'setup.faces': '4 {symbol} faces + 2 wilds',
  'setup.hint': 'You also carry 4 red dice. Then you head straight out to hunt.',
  'setup.secretTitle': 'Your secret quest',
  'setup.secretChoose': 'Choose your secret quest',
  'setup.secretText':
    'It gives you a goal: earn bonus points for defeating monsters of its type and for keeping trophies of its symbols.',
  'setup.secretStart': "Let's hunt!",
  'setup.back': 'Change color',

  'secret.monsters': '{type} SNACs: +{n} each per run',
  'secret.trophies': '{a} and {b} trophies you keep: +{n} each',

  'quests.title': 'Quests',
  'quests.secret': 'Secret quest',
  'quests.board': 'Town board',
  'quests.close': 'Close',
  'quest.villager': 'Villager',
  'quest.huntmaster': 'Huntmaster',
  'quest.one': 'Hand in ONE:',
  'quest.all': 'Hand in ALL:',
  'quest.heart': '1 HP',
  'quest.reward.villager': 'Reward: pick 1 of 3 items',
  'quest.reward.huntmaster': 'Reward: pick 1 of 3 skills',
  'quest.oldest':
    'When you return to town, this quest will be retired and a new one will appear here.',

  'town.title': 'Town',
  'town.actions': 'Actions: {n}/{max}',
  'town.trophies': 'Trophies ({n}/{max})',
  'town.trophiesHint': 'Trophies work as dice in combat or to complete quests here.',
  'town.dice': 'Your dice',
  'town.items': 'Items ({n}/{max})',
  'town.skills': 'Skills ({n}/{max})',
  'town.emptyItems': 'No items',
  'town.emptySkills': 'No skills',
  'town.rest': 'Rest',
  'town.restText': 'Heal your HP, recharge your items and gain a random trophy.',
  'town.villager': 'Villager quest',
  'town.villagerText': 'Hand in ONE of the trophies or hearts it shows and pick an item.',
  'town.huntmaster': 'Huntmaster quest',
  'town.huntmasterText': 'Hand in EVERYTHING it shows and pick a skill.',
  'town.quests': 'Quest board',
  'town.questsHint':
    'Quests stay until you complete them. Broken hearts are paid with HP (never down to a KO).',
  'town.questPay': 'Hand in {what}',
  'town.questPayAll': 'Hand it all in',
  'town.questLocked': "This town option isn't open yet.",
  'town.questUsed': 'You already completed a quest of this kind on this visit.',
  'town.questNoAction': 'No actions left on this visit.',
  'town.questMissing': "You're missing something it asks for.",
  'town.completed': 'Completed quests ({n})',
  'town.noCompleted': 'None completed yet.',
  'town.recharge': 'Recharge',
  'town.rechargeHint': 'Tap RECHARGE on a spent item to recharge it with your Cloning Tool.',
  'town.leave': 'Leave town',
  'town.leaveText': 'All your dice · HP {hp}/{max}',
  'town.mainMenu': 'Main menu',
  'town.used': 'Used',
  'town.leaveLocked': 'Use your actions before leaving ({n} left)',
  'town.offerTitle': 'Pick a card',
  'town.offerItem': 'Item: single use, recharges when you rest.',
  'town.offerSkill': 'Skill: once per monster, every time.',
  'town.replaceTitle': 'You already have {max}: which one goes?',
  'town.back': 'Back',
  'town.spent': 'Spent',
  'town.welcomeBack': 'Back in town: your dice are restored. Rest to recover your HP.',

  'trail.title': 'Sherbert Forest trail',
  'trail.subtitle': 'Run {run} · Fight {fight}',
  'trail.pick': 'Two tracks. You only know what type each SNAC is.',
  'trail.track': '{type} track',
  'trail.follow': 'Follow',
  'trail.noDice': "No dice: you'll only roll white dice. It's very risky.",
  'trail.white': '{n} white',
  'trail.return': 'Back to town',
  'trail.pool': 'Available dice: {n}',
  'trail.boss': "{name}'s lair",
  'trail.bossText':
    "Fill its {n} spaces to defeat it and end the game. It can't be studied: with fewer, you flee.",
  'trail.bossGo': 'Face it',

  'guide.next': 'Got it',
  'guide.doIt': 'Do it to continue',
  'guide.skipStep': 'Skip',
  'guide.skip': 'Skip the guide',
  'guide.step': '{n}/{total}',

  'combat.tutorial': 'Tutorial',
  'combat.pool': 'Your pool',
  'combat.available': 'Available dice: {n}',
  'combat.noDice': 'No dice left: re-rolling only rolls a white die.',
  'combat.heal': 'Heal +{n}',
  'combat.auto': 'Auto',
  'combat.autoLabel': 'Automatically place the selected dice',
  'combat.noFit': 'None of those dice fit the free spaces',
  'combat.tempWild': 'Temporary: created by an ability, it disappears when this fight ends.',
  'combat.koWarning': "You'll be KO'd!",
  'combat.koConfirm': 'That decision knocks you out. Tap again to confirm.',
  'combat.spent': 'Spent:',
  'combat.trophies': 'Trophies',
  'combat.trophiesHint':
    'Tap a trophy, then a space, to use it as a die, or use it to activate an ability.',
  'combat.abilities': 'Abilities',
  'combat.abilityHint':
    'Select the symbols (dice or trophies), then tap the card. You can undo it until you re-roll.',
  'combat.used': 'Used',
  'combat.undo': 'Undo',
  'combat.reroll': 'Re-roll the rest',
  'combat.rerollWhite': 'White die only',
  'combat.rerollHint': '+1 white die',
  'combat.keepHint': 'Select the dice to keep, and re-roll the remaining.',
  'combat.resolve': 'Resolve',
  'combat.resolveHint': 'fill 1+ spaces',
  'combat.spaces': '{n}/{max} spaces',
  'combat.chooseTrophy': 'Pick your trophy',
  'combat.defeatText': 'You defeated the SNAC!',
  'combat.bossDown': 'You defeated {name}!',
  'combat.studyText': 'You studied the SNAC; it will escape.',
  'combat.anyTrophy': 'You can pick any trophy.',
  'combat.trophyUse': 'Trophies work as dice or as money in town.',
  'combat.tapDieFirst': 'First tap ONE die (or a trophy), then the space',
  'combat.deselect': 'Leave unselected the dice you want to re-roll',
  'combat.needDice': '{name}: select {n} {symbol} (or wild)',
  'combat.needLucky': '{name}: select a {color} wild',
  'combat.needHeart': '{name}: select a heart',
  'combat.whiteWild': "White wild: it can't be re-rolled. Use it on this SNAC or it's lost.",
  'combat.colorWild': '{color} wild: a card created it and it counts as that special die’s wild.',
  'combat.invalid': "That move isn't allowed",
  'combat.whiteDie': 'White die!',
  'combat.blocked': '{n} damage blocked by a heart',
  'combat.hit': '-{n} HP',
  'combat.snacHit': 'SNAC damage! -{n} HP',
  'combat.pending': 'Pending damage',
  'combat.pendingHint':
    'You take it when you re-roll or resolve. To cover it, tap a heart in your pool, then the damage.',
  'combat.covered': 'Damage covered by a heart (tap to remove it)',
  'combat.uncovered': 'Uncovered damage',
  'combat.pickHeart': 'First tap ONE heart in your pool, then the damage',
  'combat.understood': 'Got it',

  'outcome.defeat': 'Defeat',
  'outcome.study': 'Study',
  'outcome.flee': 'Flee',
  'result.defeat': 'SNAC defeated!',
  'result.study': 'SNAC studied',
  'result.flee': 'You fled safely',
  'result.ko': 'KO!',
  'result.koDefeat': 'You were KO’d on the same roll, but you keep the reward.',
  'result.trophy': '{symbol} trophy',
  'result.runOver.ko': 'You were KO’d and the run ends, but you keep your points.',
  'result.chain': '+{pts} points · chain ×{n}',
  'result.chainHint': 'The next SNAC you defeat on this run is worth {next}.',
  'result.questKill': 'It was from your secret quest! +{n} to your score',
  'result.runScore': 'This run’s score: {n}',
  'result.runOver.flee': 'You fled: the run ends.',
  'result.status': 'HP: {hp}/{max} · Available dice: {dice}',
  'result.continue': 'Keep hunting',
  'result.noDice': "No dice left: if you keep hunting you'll only roll white dice.",
  'result.town': 'Back to town',
  'result.home': 'Back to home',
  'result.startGame': 'Start a game',
  'result.tutorialDone': 'Tutorial complete! You know how to hunt.',

  'keep.title': 'No room for more trophies!',
  'keep.text': 'You won a {symbol} trophy. Tap the one you want to throw away.',
  'keep.discardNew': 'Throw away the new one',

  'over.title': 'Game over',
  'over.victory': 'You defeated {name}!',
  'over.finalText': 'Score of the run where the boss fell, with HP and multiplier.',
  'over.unfinished':
    'Boss not defeated: your best run counts (run {run}), without HP or multiplier.',
  'over.noRun': "You haven't finished a run yet.",
  'over.hunt': 'Chain points',
  'over.questKills': 'Quest SNACs × {n}',
  'over.questTrophies': 'Quest trophies × {n}',
  'over.hp': 'HP left × {n}',
  'over.cards': 'Points cards',
  'over.multiplier': 'Multiplier ({runs} runs)',
  'over.total': 'Final score',
  'over.defeated': 'SNACs defeated',
  'over.new': 'New game',

  'server.pending': 'Validating on the server (re-simulation)…',
  'server.ok': 'Validated by the server',
  'server.rejected': 'The server rejected the game',
  'server.offline': 'Saved locally: API unavailable',
  'server.disabled': 'Server validation turned off (feature toggle)',
  'server.score': 'Server: {score} pts',

  'face.Horn': 'Axe',
  'face.Wing': 'Arrow',
  'face.Claw': 'Finder',
  'face.Tail': 'Hook',
  'face.heart': 'Heart',
  'face.wild': 'Wild',
  'face.damage': 'Damage',
  'face.blank': 'Blank',
  'slot.all': 'Any of the 4 symbols',
  'slot.damage': 'Damage: counts as filled but costs 1 HP (a heart cancels it)',
  'slot.label': 'Space {n}: {slot}',
  'slot.covered': ' (filled)',
  'die.label': '{kind} die: {face}',
  'kind.red': 'Red',
  'kind.orange': 'Orange',
  'kind.blue': 'Blue',
  'kind.purple': 'Purple',
  'kind.green': 'Green',
  'kind.white': 'White',
  'kind.trophy': 'Trophy',
  'kind.token': 'Temporary symbol',
  'monster.type': '{type} type',
  'type.Horn': 'Horn',
  'type.Wing': 'Wing',
  'type.Claw': 'Claw',
  'type.Tail': 'Tail',

  'ability.triple': '3 {symbol} = defeat the monster (any trophy)',
  'ability.double': '1 {symbol} → 2 {symbol}',
  'ability.wild': '1 {symbol} → 1 {color} wild',
  'ability.lucky': '1 {color} wild → 2 wilds',
  'ability.gauntlet': 'Lose 1 HP → 1 wild',
  'ability.recharge': 'Outside combat: recharge another item',
  'ability.points.specialDice': '+{n} for each special die color you have (max {max})',
  'ability.points.trophyTypes': '+{n} for each trophy type you keep (max {max})',
  'ability.points.monsterTypes': '+{n} for each SNAC type you defeat (max {max})',
  'ability.convert': '2 {symbol} → 3 wilds',
  'ability.special': '+1 {die} special die',
  'ability.bonus': '+1 trophy space',
  'ability.item': 'Item',
  'ability.skill': 'Skill',
};

const DICTIONARIES: Record<Lang, Record<MessageKey, string>> = { es, en };

export type Vars = Record<string, string | number>;

export function translate(lang: Lang, key: MessageKey, vars: Vars = {}): string {
  return DICTIONARIES[lang][key].replace(/\{(\w+)\}/g, (m, name: string) =>
    name in vars ? String(vars[name]) : m,
  );
}

export type Translate = (key: MessageKey, vars?: Vars) => string;

/** Nombre del símbolo de dado (Horn → Hacha / Axe). */
export function faceName(t: Translate, face: Face): string {
  return t(`face.${face}` as MessageKey);
}

/** Tipo de monstruo (Horn/Wing/Claw/Tail), distinto del símbolo de dado que lo caza. */
export function typeName(t: Translate, type: GameSymbol): string {
  return t(`type.${type}` as MessageKey);
}

export function slotName(t: Translate, slot: Slot): string {
  if (slot === 'all') return t('slot.all');
  if (slot === 'damage') return t('slot.damage');
  return faceName(t, slot);
}

export function kindName(t: Translate, kind: DieSource): string {
  return t(`kind.${kind}` as MessageKey);
}

export function outcomeName(t: Translate, outcome: Exclude<Outcome, 'ko'>): string {
  return t(`outcome.${outcome}` as MessageKey);
}

/** Descripción del efecto de una carta, generada a partir de config/abilities.json. */
export function describeEffect(t: Translate, effect: AbilityEffect): string {
  const { pointsCard, pointsCardMax } = gameConfig.scoring;
  switch (effect.type) {
    case 'special':
      return t('ability.special', { die: kindName(t, effect.die) });
    case 'lucky':
      return t('ability.lucky', { color: kindName(t, effect.die) });
    case 'gauntlet':
    case 'recharge':
      return t(`ability.${effect.type}`);
    case 'points':
      return t(`ability.points.${effect.by}`, { n: pointsCard, max: pointsCardMax });
    case 'wild':
      return t('ability.wild', {
        symbol: faceName(t, effect.symbol),
        color: kindName(t, SYMBOL_COLOR[effect.symbol]),
      });
    default:
      return t(`ability.${effect.type}`, { symbol: faceName(t, effect.symbol) });
  }
}

/** Lo que pide una misión del pueblo: un símbolo de trofeo o un corazón (HPie). */
export function costName(t: Translate, cost: QuestCost): string {
  return cost === 'heart' ? t('quest.heart') : typeName(t, cost);
}

export const SYMBOLS: readonly GameSymbol[] = ['Horn', 'Wing', 'Claw', 'Tail'];

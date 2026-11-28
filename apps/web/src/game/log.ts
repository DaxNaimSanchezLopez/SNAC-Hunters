// Registro de acciones (feedback del cliente, 2026-11-11): todo lo que hizo el jugador y lo que
// hizo el juego, para reportar errores. No guarda nada nuevo: re-simula seed + acciones con el
// engine (igual que el servidor) y describe cada paso a partir de las diferencias de estado.
import { applyGameAction, CombatError, newGame } from '@snac-hunters/engine';
import type { CombatAction, CombatState, GameAction, GameState } from '@snac-hunters/engine';
import { gameData, getAbility, getQuest } from './config';
import { faceName, kindName, outcomeName, translate, typeName } from './i18n';
import type { Lang, MessageKey, Vars } from './i18n';

export interface LogLine {
  /** Número de acción del jugador (1, 2…) a la que pertenece la línea. */
  readonly step: number;
  readonly who: 'player' | 'game' | 'error';
  readonly text: string;
}

/** Acción rechazada por el engine en esta sesión (no se guarda en la partida). */
export interface Rejected {
  /** Cuántas acciones válidas había cuando se intentó. */
  readonly after: number;
  readonly action: GameAction;
  readonly message: string;
}

function abilityName(id: string): string {
  return getAbility(id)?.name ?? id;
}

function describeCombat(tr: (k: MessageKey, v?: Vars) => string, a: CombatAction): string {
  const t = tr as Parameters<typeof faceName>[0];
  switch (a.type) {
    case 'reroll':
      return tr('log.reroll', { n: a.dieIds.length });
    case 'assign':
      return tr('log.assign', { face: a.dieId, slot: a.slot + 1 });
    case 'unassign':
      return tr('log.unassign', { slot: a.slot + 1 });
    case 'trophy':
      return tr('log.trophy', { symbol: `#${a.index + 1}`, slot: a.slot + 1 });
    case 'ability':
      return tr('log.ability', { name: abilityName(a.abilityId) });
    case 'undo':
      return tr('log.undo', { name: abilityName(a.abilityId) });
    case 'heal':
      return tr('log.heal');
    case 'block':
      return tr('log.block');
    case 'unblock':
      return tr('log.unblock');
    case 'resolve':
      return (
        tr('log.resolve', {
          trophy: a.trophy ? tr('log.resolveTrophy', { symbol: typeName(t, a.trophy) }) : '',
        }) + (a.damage !== undefined ? ` (${tr('combat.damage', { n: a.damage })})` : '')
      );
  }
}

function describeAction(
  tr: (k: MessageKey, v?: Vars) => string,
  lang: Lang,
  a: GameAction,
  before: GameState,
  after: GameState,
): string {
  const t = tr as Parameters<typeof faceName>[0];
  switch (a.type) {
    case 'start':
      return tr('log.start', { color: kindName(t, a.die) });
    case 'rest':
    case 'scavenge':
    case 'training':
    case 'continue':
    case 'return':
    case 'finish':
      return tr(`log.${a.type}`);
    case 'alchemist':
      return tr('log.alchemist', {
        picks: a.picks.map((p) => tr(`town.alchemist.${p}`)).join(' + '),
      });
    case 'forge':
      return tr('log.forge', { color: kindName(t, a.die) });
    case 'quest':
      return tr('log.quest', { name: getQuest(a.id)?.name[lang] ?? a.id });
    case 'pick':
      return a.replace
        ? tr('log.replace', { name: abilityName(a.abilityId), old: abilityName(a.replace) })
        : tr('log.pick', { name: abilityName(a.abilityId) });
    case 'recharge':
      return tr('log.recharge', { name: abilityName(a.target) });
    case 'leave':
      return tr('log.leave', { n: after.runs });
    case 'follow': {
      const monster = after.combat?.monster;
      if (monster?.boss) return tr('log.followBoss', { monster: monster.name });
      return tr('log.follow', {
        type: monster ? typeName(t, monster.type) : '?',
        monster: monster?.name ?? '?',
      });
    }
    case 'keep':
      return a.discard === null
        ? tr('log.keepNew')
        : tr('log.keepOld', {
            symbol: typeName(t, before.trophies[a.discard] ?? 'Horn'),
          });
    case 'combat': {
      const text = describeCombat(tr, a.action);
      // El dado colocado se describe por su cara
      if (a.action.type === 'assign') {
        const { dieId, slot } = a.action;
        const die = before.combat?.dice.find((d) => d.id === dieId);
        return tr('log.assign', { face: die ? faceName(t, die.face) : dieId, slot: slot + 1 });
      }
      if (a.action.type === 'trophy') {
        const symbol = before.combat?.trophies[a.action.index];
        return tr('log.trophy', {
          symbol: symbol ? typeName(t, symbol) : '?',
          slot: a.action.slot + 1,
        });
      }
      return text;
    }
    default:
      return JSON.stringify(a);
  }
}

/** Lo que hizo el juego en este paso: tiradas, daño, resultados, trofeos, vidas, Pieland… */
function gameEvents(
  tr: (k: MessageKey, v?: Vars) => string,
  before: GameState,
  after: GameState,
): string[] {
  const t = tr as Parameters<typeof faceName>[0];
  const lines: string[] = [];
  const combat: CombatState | null = after.combat;
  if (combat && (combat !== before.combat || after.phase !== before.phase)) {
    const sameFight = before.combat !== null && before.combat.monster === combat.monster;
    const fresh = combat.log.slice(sameFight ? (before.combat?.log.length ?? 0) : 0);
    const faceOf = (id: string) => {
      const die = combat.dice.find((d) => d.id === id);
      return die ? `${kindName(t, die.kind)} ${faceName(t, die.face)}` : id;
    };
    for (const e of fresh) {
      if (e.type === 'roll')
        lines.push(tr('log.ev.roll', { faces: e.dieIds.map(faceOf).join(', ') }));
      if (e.type === 'damage') {
        lines.push(
          tr('log.ev.damage', {
            result: e.blockedBy ? tr('log.ev.blocked') : tr('combat.hit', { n: 1 }),
          }),
        );
      }
      if (e.type === 'resolve') {
        lines.push(
          tr('log.ev.outcome', {
            monster: combat.monster.name,
            outcome: e.outcome === 'ko' ? 'KO' : outcomeName(t, e.outcome),
          }) + (e.damage ? ` (${tr('combat.hit', { n: e.damage })})` : ''),
        );
      }
    }
  }
  const hpOf = (g: GameState) => (g.phase === 'combat' && g.combat ? g.combat.hp : g.hp);
  if (hpOf(before) !== hpOf(after) && before.phase !== 'setup') {
    lines.push(tr('log.ev.hp', { from: hpOf(before), to: hpOf(after) }));
  }
  // Trofeos nuevos (el pendiente también es un trofeo ganado)
  const gained = [...after.trophies];
  for (const s of before.trophies) {
    const i = gained.indexOf(s);
    if (i >= 0) gained.splice(i, 1);
  }
  if (after.pendingTrophy && after.pendingTrophy !== before.pendingTrophy) {
    gained.push(after.pendingTrophy);
  }
  for (const s of gained) lines.push(tr('log.ev.trophy', { symbol: typeName(t, s) }));
  if (after.dice.join() !== before.dice.join()) {
    lines.push(tr('log.ev.dice', { dice: after.dice.map((d) => kindName(t, d)).join(', ') }));
  }
  if (after.score > before.score) {
    lines.push(tr('log.ev.score', { n: after.score - before.score, total: after.score }));
  }
  if (after.pieland.hp < before.pieland.hp) {
    lines.push(tr('log.ev.pieland', { n: after.pieland.hp }));
  }
  if (after.offer && after.offer !== before.offer) {
    lines.push(tr('log.ev.offer', { names: after.offer.ids.map(abilityName).join(', ') }));
  }
  if (after.phase === 'over' && before.phase !== 'over' && after.result) {
    lines.push(tr('log.ev.over', { result: tr(`log.result.${after.result}`) }));
  }
  return lines;
}

/** Registro completo de la partida: re-simula cada acción y describe lo que pasó. */
export function buildLog(
  lang: Lang,
  seed: string,
  actions: readonly GameAction[],
  rejected: readonly Rejected[] = [],
): LogLine[] {
  const tr = (k: MessageKey, v?: Vars) => translate(lang, k, v);
  const lines: LogLine[] = [];
  let state = newGame(gameData, seed);
  const errorsAt = (n: number) =>
    rejected
      .filter((r) => r.after === n)
      .forEach((r) =>
        lines.push({
          step: n,
          who: 'error',
          text: `${describeAction(tr, lang, r.action, state, state)} — ${tr('log.ev.error', { message: r.message })}`,
        }),
      );
  errorsAt(0);
  actions.forEach((action, i) => {
    let next: GameState;
    try {
      next = applyGameAction(state, action, gameData);
    } catch (e) {
      const message = e instanceof CombatError ? e.message : String(e);
      lines.push({ step: i + 1, who: 'error', text: tr('log.ev.error', { message }) });
      return;
    }
    lines.push({ step: i + 1, who: 'player', text: describeAction(tr, lang, action, state, next) });
    for (const text of gameEvents(tr, state, next)) lines.push({ step: i + 1, who: 'game', text });
    state = next;
    errorsAt(i + 1);
  });
  return lines;
}

/** Texto plano para copiar y pegar en un reporte de error. */
export function logToText(seed: string, lines: readonly LogLine[]): string {
  const who = { player: '>', game: ' ', error: '!' } as const;
  return [
    `seed: ${seed}`,
    ...lines.map((l) => `${who[l.who]} ${String(l.step).padStart(3)} ${l.text}`),
  ].join('\n');
}

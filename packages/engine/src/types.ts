// RF-07: Tipos del dominio del engine SNAC Hunters

// RF-07.1: Cuatro símbolos del juego
// Horn=Axe (naranja), Wing=Arrow (azul), Claw=Finder (verde), Tail=Hook (morado)
export type GameSymbol = 'Horn' | 'Wing' | 'Claw' | 'Tail';

// RF-07.2: Slot de monstruo. 'all' acepta cualquier símbolo; 'damage' (corazón roto)
// cuenta como cubierto al resolver: cuesta 1 HPie salvo que lo cubra un corazón (D-07).
export type Slot = GameSymbol | 'all' | 'damage';

// RF-07.3: Tipos de dado (Dice-guide-V03)
// red = estándar, orange/blue/purple/green = especiales, white = daño
export type DieKind = 'red' | 'orange' | 'blue' | 'purple' | 'green' | 'white';

// RF-07.3: Caras posibles de un dado
// heart = escudo (dado rojo), wild = comodín, damage = corazón roto (dado blanco)
export type Face = GameSymbol | 'heart' | 'wild' | 'damage' | 'blank';

// RF-07.3: Tabla de caras por tipo de dado — vive en config/dice.json
export type DiceTable = Readonly<Record<DieKind, readonly Face[]>>;

// RF-13: Origen de un "dado" en combate. Además de los dados físicos, un trofeo colocado
// en el monstruo o un símbolo creado por una habilidad se comportan como dados que
// no se pueden relanzar y no pasan al siguiente combate.
export type DieSource = DieKind | 'trophy' | 'token';

export interface Die {
  readonly id: string;
  readonly kind: DieSource;
  readonly face: Face;
  /**
   * Color de un comodín creado por una carta (Auto-Aimer, Lasso Trap…): cuenta como el comodín
   * de ese dado especial, así que una carta Lucky de ese color lo puede duplicar.
   */
  readonly color?: SpecialDieKind;
}

// RF-14: Efecto de una habilidad (cartas de Objeto y Destreza)
// - triple: tres símbolos iguales derrotan a cualquier monstruo; el trofeo puede ser cualquiera
// - double: un símbolo (o un corazón, Double Healing) se convierte en dos
// - wild: un símbolo se convierte en el comodín de su color
// - convert: dos símbolos iguales se convierten en tres comodines
// - special: pasiva, el personaje gana un dado especial de ese color
// Resto de las cartas (V02, Image files/abilities):
// - lucky: un comodín de ese color (dado especial o carta) se convierte en dos comodines
// - gauntlet: perder 1 HPie para ganar un comodín (Cursed Gauntlet)
// - recharge: fuera de combate, recarga otro objeto (Cloning Tool)
// - points: puntos extra al final (Piebix Cube, Varied Samples, Well Traveled)
export type SpecialDieKind = Exclude<DieKind, 'red' | 'white'>;

/** Qué cuentan las cartas de puntos (uno por color o tipo distinto, máximo 4). */
export type PointsBy = 'specialDice' | 'trophyTypes' | 'monsterTypes';

export type AbilityEffect =
  | { readonly type: 'triple'; readonly symbol: GameSymbol }
  | { readonly type: 'double'; readonly symbol: GameSymbol | 'heart' }
  | { readonly type: 'wild'; readonly symbol: GameSymbol }
  | { readonly type: 'convert'; readonly symbol: GameSymbol }
  | { readonly type: 'special'; readonly die: SpecialDieKind }
  | { readonly type: 'lucky'; readonly die: SpecialDieKind }
  | { readonly type: 'gauntlet' }
  | { readonly type: 'recharge' }
  | { readonly type: 'points'; readonly by: PointsBy };

export interface Ability {
  readonly id: string;
  readonly name: string;
  /** item = Objeto (un uso, se recarga en el pueblo); skill = Destreza (una vez por monstruo). */
  readonly kind: 'item' | 'skill';
  readonly effect: AbilityEffect;
  /** Bonificación pasiva mientras se tenga la carta (aunque esté gastada). */
  readonly bonus?: 'trophySlot';
}

// RF-07.4: Trofeo obtenido al derrotar o estudiar un monstruo.
export interface Trophy {
  readonly monsterId: string;
  readonly symbol: GameSymbol;
}

// RF-07.5: Monstruo con sus espacios (4; el jefe tiene más) y sus opciones de trofeo
export interface Monster {
  readonly id: string;
  readonly name: string;
  readonly type: GameSymbol;
  readonly slots: readonly Slot[];
  readonly trophies: readonly GameSymbol[];
  readonly pun: string;
  /** RF-16: el jefe solo se derrota cubriendo todos sus espacios (o se huye) y no da trofeo. */
  readonly boss?: boolean;
}

// RF-17: Carta de misión secreta (Image files/secret quest cards). Da puntos extra por derrotar
// monstruos de su tipo y por guardar trofeos de sus dos símbolos.
export interface SecretQuest {
  readonly id: string;
  readonly name: string;
  readonly monsterType: GameSymbol;
  readonly symbols: readonly [GameSymbol, GameSymbol];
}

/** Lo que pide una misión del pueblo: trofeos de un símbolo o corazones (HPie). */
export type QuestCost = GameSymbol | 'heart';

// RF-18: Misión del tablero del pueblo (Image files/Quests). La de aldeano se paga con UNO de
// los trofeos/corazones que muestra y da un objeto; la del Huntmaster pide TODOS y da una destreza.
export interface TownQuest {
  readonly id: string;
  readonly kind: 'villager' | 'huntmaster';
  readonly name: { readonly es: string; readonly en: string };
  readonly cost: readonly QuestCost[];
}

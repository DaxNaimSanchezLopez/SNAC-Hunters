// RF-07: Tipos del dominio del engine SNAC Hunters

// RF-07.1: Cuatro símbolos del juego
// Horn=Axe (naranja), Wing=Arrow (azul), Claw=Finder (verde), Tail=Hook (morado)
export type GameSymbol = 'Horn' | 'Wing' | 'Claw' | 'Tail';

// RF-07.2: Slot de monstruo. 'all' acepta cualquier símbolo; 'damage' (corazón roto)
// solo se cubre recibiendo daño (D-07).
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
}

// RF-14: Efecto de una habilidad (cartas de Objeto y Destreza)
// - triple: tres símbolos iguales derrotan a cualquier monstruo; el trofeo puede ser cualquiera
// - double: un símbolo se convierte en dos
// - wild: un símbolo se convierte en comodín
// - convert: dos símbolos iguales se convierten en tres comodines
// - special: pasiva, el personaje gana un dado especial de ese color
// V1 (resto de las cartas):
// - lucky: un comodín lanzado en el dado especial de ese color se convierte en dos comodines
// - gauntlet: gastar 1 HPie como un comodín (Cursed Gauntlet)
// - recharge: recarga otro objeto, fuera de combate (Cloning Tool)
// - shield: cada corazón bloquea dos daños en lugar de uno (Double Healing)
// - points: puntos al final de la partida (Piebix Cube, Varied Samples, Well Traveled)
export type SpecialDieKind = Exclude<DieKind, 'red' | 'white'>;

/** Qué cuentan las cartas de puntos al final (una por tipo distinto, máximo 4). */
export type PointsBy = 'specialDice' | 'trophyTypes' | 'monsterTypes';

export type AbilityEffect =
  | { readonly type: 'triple'; readonly symbol: GameSymbol }
  | { readonly type: 'double'; readonly symbol: GameSymbol }
  | { readonly type: 'wild'; readonly symbol: GameSymbol }
  | { readonly type: 'convert'; readonly symbol: GameSymbol }
  | { readonly type: 'special'; readonly die: SpecialDieKind }
  | { readonly type: 'lucky'; readonly die: SpecialDieKind }
  | { readonly type: 'gauntlet' }
  | { readonly type: 'recharge' }
  | { readonly type: 'shield' }
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

// RF-07.5: Monstruo con sus espacios (4; el jefe tiene 6) y sus opciones de trofeo
export interface Monster {
  readonly id: string;
  readonly name: string;
  readonly type: GameSymbol;
  readonly slots: readonly Slot[];
  /** RF-16: El jefe de la región: solo se puede derrotar (todos los espacios) o huir. */
  readonly boss?: boolean;
  readonly trophies: readonly GameSymbol[];
  readonly pun: string;
}

// RF-17: Carta de misión secreta (Image files/secret quest cards). Da puntos al final por
// coleccionar el tipo de monstruo indicado y los dos símbolos en misiones y trofeos.
export interface SecretQuest {
  readonly id: string;
  readonly name: string;
  readonly monsterType: GameSymbol;
  readonly symbols: readonly [GameSymbol, GameSymbol];
}

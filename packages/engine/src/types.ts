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
export type SpecialDieKind = Exclude<DieKind, 'red' | 'white'>;

export type AbilityEffect =
  | { readonly type: 'triple'; readonly symbol: GameSymbol }
  | { readonly type: 'double'; readonly symbol: GameSymbol }
  | { readonly type: 'wild'; readonly symbol: GameSymbol }
  | { readonly type: 'convert'; readonly symbol: GameSymbol }
  | { readonly type: 'special'; readonly die: SpecialDieKind };

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

// RF-07.5: Monstruo con exactamente 4 slots y sus opciones de trofeo
export interface Monster {
  readonly id: string;
  readonly name: string;
  readonly type: GameSymbol;
  readonly slots: readonly [Slot, Slot, Slot, Slot];
  readonly trophies: readonly GameSymbol[];
  readonly pun: string;
}

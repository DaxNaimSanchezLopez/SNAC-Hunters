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

export interface Die {
  readonly id: string;
  readonly kind: DieKind;
  readonly face: Face;
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

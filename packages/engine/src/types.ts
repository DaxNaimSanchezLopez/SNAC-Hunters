// RF-07: Tipos del dominio del engine SNAC Hunters

// RF-07.1: Cuatro símbolos del juego
// Horn=hacha, Wing=flecha, Claw=lupa, Tail=gancho
export type GameSymbol = 'Horn' | 'Wing' | 'Claw' | 'Tail';
export type Symbol = GameSymbol;

// RF-07.2: Slot admite cualquier GameSymbol o el comodín 'all'
export type Slot = GameSymbol | 'all';

// RF-07.3: Dado con cara activa
// RNF-04: SUPOSICIÓN NO CONFIRMADA — distribución del dado de daño:
//   3 caras 'damage', 1 cara 'wild', 2 caras 'blank'.
//   La cara 'wild' NO puede cubrir un slot de daño (pendiente validación con Pieland Games).
export interface Die {
  readonly id: string;
  readonly face: GameSymbol | 'damage' | 'wild' | 'blank';
}

// RF-07.4: Trofeo obtenido al derrotar o estudiar un monstruo.
// Reemplaza dados del pool y se elimina del tablero.
export interface Trophy {
  readonly monsterId: string;
  readonly symbol?: GameSymbol;
}

// RF-07.5: Monstruo con exactamente 4 slots y HP >= 1
export interface Monster {
  readonly id: string;
  readonly name: string;
  readonly hp: number; // entero positivo
  readonly slots: readonly [Slot, Slot, Slot, Slot]; // tupla exacta de 4
}

// RF-07.6: Estado estático de un combate. Sin lógica de transición.
// D-05: playerHp máximo = 6; la restricción 0-6 se implementará en spec posterior.
export interface CombatState {
  readonly monster: Monster;
  readonly playerHp: number; // 0–6 (HP máximo 6 según reglas)
  readonly dicePool: readonly Die[];
  readonly damageDiceCount: number; // dados de daño acumulados en el pool
  readonly trophies: readonly Trophy[];
}

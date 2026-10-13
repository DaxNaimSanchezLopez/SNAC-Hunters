// RNF-02: RNG determinista con semilla para el engine SNAC Hunters
// D-01: Algoritmo Mulberry32 — 32 bits, buena distribución estadística,
//        implementable en ~10 líneas, sin dependencias npm.
//        Alternativas descartadas: seedrandom (dep externa), LCG (mala distribución),
//        xoshiro128+ (más bits, mayor complejidad).

/**
 * Generador de números pseudo-aleatorios determinista con semilla.
 * RNF-02: Dos instancias con el mismo seed producen la misma secuencia.
 * D-01: Implementa el algoritmo Mulberry32.
 */
export class SeededRng {
  private state: number;

  constructor(seed: number | string) {
    // Convertir seed string a número con hash FNV-1a simple
    this.state = typeof seed === 'string' ? SeededRng.hashString(seed) : seed;
  }

  /**
   * Devuelve un float uniformemente distribuido en [0, 1).
   * RNF-02.1: Determinista — mismo estado produce mismo valor.
   */
  next(): number {
    // Mulberry32
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /**
   * Devuelve un entero uniformemente distribuido en [min, max] (ambos inclusive).
   * RNF-02.1
   */
  nextInt(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  /**
   * Hash FNV-1a simple para convertir un seed string a un número de 32 bits.
   * Garantiza distribución razonable de seeds string.
   */
  private static hashString(s: string): number {
    let hash = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) {
      hash ^= s.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
    return hash >>> 0;
  }
}
